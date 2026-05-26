# Security Hardening — Design Spec

**Date:** 2026-05-26
**Topic:** Triple hardening — Diceware multi-langue (B1) + Anti-screenshot smart (B3) + Vault chiffré OS-keystore + master password optionnel (B4)
**Author:** Brainstorming session 2026-05-26
**Status:** Approved, ready for implementation planning

---

## 1. Context

L'audit de sécurité 2026-05-26 a identifié 13 vulnérabilités, dont 2 critiques et 1 élevée font l'objet de ce spec :

| ID | Sévérité | Faille |
|----|----------|--------|
| B1 | 🔴 Critique | Passphrase wordlist = stub 256 mots FR → entropie 40 bits (devrait être ≥65 bits) |
| B3 | 🟠 Élevée | Aucune protection OS contre captures d'écran et screen-share quand un secret est révélé |
| B4 | 🔴 Critique | Historique stocké en clair dans `localStorage["unbreakable.history"]` (jusqu'à 200 mots de passe) |

Ce spec adresse les trois failles avec une architecture intégrée et OS-aware. Aucun feature additionnel n'est inclus pour rester focalisé.

## 2. Goals & Non-Goals

### Goals

- Élever l'entropie passphrase à ≥65 bits @ 5 mots (Diceware EFF standard).
- Supporter 5 langues de wordlist (FR/EN/DE/ES/IT) embarquées dans le binaire.
- Empêcher la capture d'écran OS (Snipping Tool, Print Screen) et le partage d'écran (Teams, Zoom, Meet, OBS) de capturer un secret révélé.
- Chiffrer l'historique des secrets sur disque avec AES-256-GCM.
- KEK stockée dans le keystore natif de l'OS (DPAPI/Keychain/libsecret) sans friction utilisateur.
- Master password optionnel comme couche additionnelle pour utilisateurs paranoïaques.
- Migration transparente depuis l'historique localStorage v0.1 → vault chiffré v0.2.

### Non-Goals

- Pas de support YubiKey/FIDO2 (axe futur).
- Pas de détection auto des process screen-share (Option C écartée — faux positifs).
- Pas de modification du moteur de génération de mots de passe (`engine.rs` reste intact).
- Pas de chiffrement des Settings (peu sensibles, restent localStorage).
- Pas de support reproducible builds / SBOM (axe futur).

## 3. Architecture overview

```
Frontend (React)                       Backend (Rust)
───────────────────────────            ──────────────────────────────────────
PasswordPanel / PassphrasePanel        crypto/
  reveal toggle 👁                       ├─ engine.rs           (inchangé)
    └──IPC: set_window_protected──►     ├─ wordlist.rs         (étendu multi-langue)
                                          └─ storage.rs          (NOUVEAU - vault)
QuickPop
  on mount                             display/
    └──IPC: set_window_protected──►     └─ window_protection.rs (NOUVEAU)

Settings/SecuritySection               commands/
  master pw setup                       ├─ clipboard.rs        (inchangé)
    └──IPC: vault_set_master_pw──►     ├─ history.rs          (NOUVEAU)
  language switch                       └─ window.rs           (NOUVEAU)
    └─ persists in settingsStore (localStorage)
       → passé en param à generate_passphrase
                                       lib.rs
HistoryView                              ├─ KEK bootstrap au startup
  load on boot                           └─ vault_load au démarrage
    └──IPC: vault_load────────────►
  on entry add/remove
    └──IPC: vault_save (debounce)─►
```

## 4. Component design

### 4.1 B1 — Diceware multi-langue (`wordlist.rs`)

**Wordlists embarquées** sous `src-tauri/wordlists/` :

| Fichier | Langue | Source | Mots |
|---|---|---|---|
| `eff_large_fr.txt` | Français | EFF / Tarsnap | 7776 |
| `eff_large_en.txt` | Anglais | EFF official | 7776 |
| `eff_large_de.txt` | Allemand | EFF community | 7776 |
| `eff_large_es.txt` | Espagnol | EFF community | 7776 |
| `eff_large_it.txt` | Italien | EFF community | 7776 |

Chargement statique :
```rust
const FR_WORDS: &str = include_str!("../wordlists/eff_large_fr.txt");
// idem EN/DE/ES/IT
```

Parsing à la première utilisation, mis en cache via `OnceLock<Vec<&'static str>>` par langue.

**Validation au build** (test unitaire) :
- Chaque wordlist doit contenir exactement 7776 mots, un par ligne, sans doublons.
- SHA-256 de chaque fichier figé dans un test (`tests/wordlists_integrity.rs`).
- Tout caractère non-ASCII étendu validé contre le set Unicode de la langue.

**API publique** :
```rust
pub enum WordlistLang { Fr, En, De, Es, It }

pub fn words_for(lang: WordlistLang) -> &'static [&'static str];

pub fn generate_passphrase(
    lang: WordlistLang,
    word_count: u8,        // 4-12, default 5
    separator: char,       // default '-'
    include_digit: bool,
    include_symbol: bool,
) -> Result<Zeroizing<String>, CryptoError>;
```

**Sélection mot** : `os_rand_below(7776)` par mot (rejection sampling déjà en place). Entropie : `word_count * 12.92 + (include_digit ? log2(10) : 0) + (include_symbol ? log2(10) : 0)`. Minimum enforced : 65 bits.

**Migration ancien code** : la stub `STUB_WORDS` de 256 mots est supprimée. Aucune migration des anciennes passphrases nécessaires (elles restent dans l'historique chiffré, simplement non régénérables à l'identique — ce qui est attendu).

### 4.2 B3 — Anti-screenshot OS (`display/window_protection.rs`)

**API unique** :
```rust
pub fn set_protected(window: &tauri::WebviewWindow, protected: bool) -> Result<(), ProtectionError>;
```

**Implémentations par OS** :

| OS | API native | Crate |
|----|----|----|
| Windows | `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)` (Windows 10 2004+) | `windows-sys` v0.59 |
| macOS | `NSWindow.setSharingType: NSWindowSharingNone` | `objc2-app-kit` |
| Linux | No-op + log warning + retourne `ProtectionError::Unsupported` | — |

**Détection capacité** : `is_supported() -> bool` exposé au front pour afficher un badge "Anti-capture indisponible" sur Linux/Win<10.

**Commande Tauri** : `set_window_protected(label: String, protected: bool) -> Result<bool, String>`.

**Triggers UI** :
- **QuickPop** : `set_window_protected("quick", true)` au mount du composant React. Jamais désactivé pendant la vie de la fenêtre.
- **MainWindow** : `set_window_protected("main", true)` quand l'utilisateur appuie sur le toggle 👁 d'un `PasswordPanel`/`PassphrasePanel`. Désactivé (`false`) quand re-masqué ou quand l'utilisateur navigue vers History/Settings.

**Mode debug** : variable d'env `UNBREAKABLE_DISABLE_PROTECTION=1` désactive entièrement (pour tests E2E où l'on a besoin de screenshots).

### 4.3 B4 — Vault chiffré (`crypto/storage.rs`)

**Format fichier** `app_data_dir/history.bin` :
```
Offset  Len  Content
0       4    Magic "UNBR"
4       1    Version (0x01)
5       1    Flags: bit0 = master_pw_enabled
6       16   Argon2id salt (si master_pw_enabled)
22      12   AES-GCM nonce
34      ..   Ciphertext (JSON serialized Vec<HistoryEntry>)
end-16  16   AES-GCM tag
```

**Schéma `HistoryEntry`** (JSON sérialisé avant chiffrement) :
```json
{
  "id": "01HGZ...",
  "kind": "password",
  "value": "<plaintext>",
  "label": "optional client name",
  "score": 4,
  "created_at": "2026-05-26T14:32:11Z"
}
```
- `id` : ULID string
- `kind` : `"password"` | `"passphrase"`
- `value` : string (chiffrement assure la confidentialité)
- `label` : optional string
- `score` : u8 (zxcvbn-ts 0-4)
- `created_at` : ISO-8601 UTC

**Clés** :
- **KEK (Key Encryption Key)** : 32 bytes, généré par `OsRng` au premier lancement, stocké dans OS keyring via crate `keyring` v3 sous service `com.unbreakable.app` / username `vault-kek`. Encodé base64 pour transit keyring.
- **MPK (Master Password Key)** : si master pw activé, MPK = `Argon2id(mpw_utf8, salt)` avec paramètres OWASP 2024 (m=64 MiB, t=3, p=4, out=32B).
- **DEK (Data Encryption Key)** :
  - Si MPK : `DEK = HKDF-SHA256(IKM=KEK || MPK, info="unbreakable-vault-v1", L=32)`
  - Sinon : `DEK = HKDF-SHA256(IKM=KEK, info="unbreakable-vault-v1", L=32)`

**Cipher** : AES-256-GCM via crate `aes-gcm` v0.10. Nonce 12 bytes random par sauvegarde.

**Écriture atomique** : `tempfile::NamedTempFile` dans le même dir, write+flush+sync, puis `persist()` (rename atomique). Évite la corruption si crash mid-write.

**API publique Rust** :
```rust
pub struct VaultStore { /* private */ }

impl VaultStore {
    pub fn open(app: &tauri::AppHandle, master_pw: Option<&str>) -> Result<Self, VaultError>;
    pub fn load(&mut self) -> Result<Vec<HistoryEntry>, VaultError>;
    pub fn save(&mut self, entries: &[HistoryEntry]) -> Result<(), VaultError>;
    pub fn rotate_master_password(&mut self, old: Option<&str>, new: Option<&str>) -> Result<(), VaultError>;
    pub fn wipe(&mut self) -> Result<(), VaultError>;
    pub fn is_master_password_enabled(&self) -> bool;
}
```

**Commandes Tauri** (dans `commands/history.rs`) :
- `vault_status() -> { master_pw_enabled: bool, keyring_ok: bool, entry_count: u32 }` — lit le header non chiffré de `history.bin` (magic + version + flags) pour déterminer `master_pw_enabled` sans avoir besoin du déchiffrement. Si le fichier n'existe pas encore, retourne `master_pw_enabled=false`.
- `vault_unlock(master_pw: Option<String>) -> Result<()>` — appelée au boot si master pw activé
- `vault_load() -> Result<Vec<HistoryEntry>>`
- `vault_save(entries: Vec<HistoryEntry>) -> Result<()>` — debouncé côté front (500 ms)
- `vault_set_master_password(old: Option<String>, new: Option<String>) -> Result<()>`
- `vault_clear() -> Result<()>`

**Zeroization** : `HistoryEntry::value: Zeroizing<String>` dans toute la chaîne Rust. Les `String` Tauri reçues du front via IPC sont copiées dans `Zeroizing` immédiatement à l'entrée des commandes.

### 4.4 Frontend changes

**`historyStore.ts`** (refactor) :
- Suppression du middleware `persist` de Zustand.
- Nouvelle méthode `init()` appelée par `App.tsx` au boot après `vault_unlock`.
- Mutations (`add`, `remove`, `clear`) déclenchent `vault_save` via debounce `500ms` (lodash ou impl maison).

**Nouveau `src/components/Settings/SecuritySection.tsx`** :
- Toggle "Activer mot de passe maître"
  - Si activation : modal saisie + confirmation + force meter (zxcvbn-ts) + avertissement "perte définitive si oubli"
  - Si désactivation : modal saisie pw actuel pour confirmer
- Bouton "Changer le mot de passe maître" (visible si activé)
- Bouton "Effacer le coffre" (rouge, double confirmation)
- Select "Langue passphrase" : FR / EN / DE / ES / IT (default = langue OS)
- Badge informatif "Anti-capture : actif / indisponible sur ce système"

**`App.tsx`** :
- Au mount, appelle `vault_status`.
- Si `master_pw_enabled` : affiche modal unlock obligatoire avant tout le reste.
- Sinon : appelle `vault_unlock(null)` puis `vault_load` et hydrate `historyStore`.

**Migration UI** :
- Au premier lancement post-update, si `localStorage["unbreakable.history"]` contient des entrées :
  - Modal : "X mots de passe en clair ont été détectés depuis une version précédente. Les déplacer dans le coffre chiffré ?"
  - Boutons : `[Migrer]` (parse, append au vault, `vault_save`, supprime localStorage) / `[Effacer]` (supprime localStorage sans migrer)
  - Pas de "skip" : exigence sécurité.

## 5. Data flow

### 5.1 Démarrage app (boot)

```
App.tsx mount
    ↓
IPC: vault_status() → { master_pw_enabled, keyring_ok, entry_count }
    ↓
master_pw_enabled?
    ├─ yes → UnlockModal (saisie) → IPC: vault_unlock(mpw)
    └─ no  → IPC: vault_unlock(null)
    ↓
IPC: vault_load() → Vec<HistoryEntry>
    ↓
historyStore.init(entries)
    ↓
Check localStorage["unbreakable.history"] non vide → MigrationModal
    ↓
App ready
```

### 5.2 Génération + sauvegarde

```
User clicks "Générer & copier"
    ↓
IPC: generate_password / generate_passphrase  (inchangé)
    ↓
IPC: copy_to_clipboard  (inchangé)
    ↓
historyStore.add({ value, kind, score, created_at })
    ↓
debounced vault_save → Rust: VaultStore.save(entries) → atomic write history.bin
```

### 5.3 Reveal d'un secret avec anti-capture

```
User clicks 👁 sur PasswordPanel
    ↓
React: setRevealed(true)
    ↓
IPC: set_window_protected("main", true) → SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)
    ↓
Affiche le secret en clair (durant tout l'état revealed)
    ↓
User clicks 👁 à nouveau
    ↓
IPC: set_window_protected("main", false)
```

### 5.4 QuickPop

```
QuickPop window created
    ↓
React mount QuickPop.tsx → useEffect()
    ↓
IPC: set_window_protected("quick", true)  [immédiat, avant affichage du secret]
    ↓
IPC: generate_* + copy_to_clipboard
    ↓
User clicks Copy / Esc → window.close()
```

## 6. Error handling

| Scenario | Behavior |
|---|---|
| OS keyring indisponible (`keyring::Error::NoEntry` ou platform error) | `vault_status.keyring_ok = false`. Modal au boot : "Le keystore OS n'est pas accessible. Activez un mot de passe maître pour persister l'historique." Si refus, history reste RAM-only avec banner permanent. |
| Master password oublié | Modal "Effacer le coffre" : double confirmation typing "EFFACER" requis. Wipe `history.bin` + retire l'entrée keyring + reset Settings. |
| `SetWindowDisplayAffinity` échec (Windows < 10 build 1903) | Log warn, `set_window_protected` retourne `Ok(false)` (non protégé). UI affiche tooltip "Anti-capture indisponible (Windows < 10 2004)". |
| Linux (toutes distros) | `set_window_protected` retourne `ProtectionError::Unsupported`. UI badge Settings : "Anti-capture non supporté sur Linux". |
| `history.bin` corrompu (tag GCM invalide ou magic mismatch) | Modal au boot : "Le coffre est corrompu et ne peut pas être ouvert. [Réinitialiser le coffre] (perte des entrées) / [Quitter]". |
| Master password incorrect | Modal d'unlock affiche compteur d'erreurs. Après 5 tentatives consécutives en moins de 1 min : délai exponentiel (1s, 2s, 4s, 8s, 16s). |
| Wordlist file checksum mismatch au build | Test unitaire fail → build CI bloqué. |
| `vault_save` échec (disque plein, permissions) | Toast erreur côté UI + entry reste en RAM. Retry au prochain mutate. |

## 7. Testing strategy

### 7.1 Unit tests (Rust)

| Fichier | Couvre |
|---|---|
| `tests/wordlists_integrity.rs` | Checksum SHA-256 + count=7776 + uniqueness + no empty lines pour chaque langue |
| `tests/wordlist_generation.rs` | Entropie ≥65 bits @ 5 mots, séparateur, digit/symbol injection, langue selection |
| `tests/storage_roundtrip.rs` | encrypt → decrypt avec/sans master pw, rotation pw, corruption detection, atomic write |
| `tests/storage_argon2.rs` | Argon2id params OWASP 2024, salt random, dérivation déterministique |
| `tests/window_protection.rs` | Mocked OS calls, `is_supported()` correct par plateforme via `#[cfg]` |

### 7.2 Integration tests

- `tauri::test` harness : commandes IPC end-to-end (`vault_*`, `set_window_protected`).
- Migration : seed `localStorage` simulé → boot → verifier `history.bin` créé + localStorage vidé.

### 7.3 E2E manuel (documenté dans `docs/testing/e2e-security.md`)

| Test | Méthode | Attendu |
|---|---|---|
| QuickPop anti-capture | Snipping Tool Win11 sur QuickPop | Image entièrement noire |
| MainWindow anti-capture reveal | Print Screen quand pw révélé | Zone du pw noire |
| MainWindow capture autorisée masqué | Print Screen quand pw masqué | Capture normale du UI |
| Teams screen-share reveal | Partager écran dans Teams, révéler pw | Pw masqué dans le flux |
| Master pw activation + rotation | UI Settings | Round-trip OK, ancien pw rejeté |
| Migration v0.1 → v0.2 | Seed `localStorage`, lancer | Modal apparaît, migration OK |
| Coffre corrompu | Tronquer `history.bin` | Modal recovery |
| Keystore désactivé Linux (libsecret manquant) | Lancer sans gnome-keyring | Modal master pw obligatoire |

## 8. Dependencies (Cargo)

Nouvelles dépendances :
```toml
keyring = "3.6"           # OS keystore abstraction
aes-gcm = "0.10"          # AEAD cipher
argon2 = "0.5"            # KDF
hkdf = "0.12"             # Sub-key derivation
sha2 = "0.10"             # HKDF / checksums
tempfile = "3.13"         # Atomic file writes
```

Plateforme-spécifiques :
```toml
[target.'cfg(target_os = "windows")'.dependencies]
windows-sys = { version = "0.59", features = ["Win32_Foundation", "Win32_UI_WindowsAndMessaging"] }

[target.'cfg(target_os = "macos")'.dependencies]
objc2 = "0.5"
objc2-app-kit = "0.2"
```

## 9. Tauri capabilities

Aucune nouvelle capability nécessaire :
- Le keystore est appelé directement depuis Rust (pas via plugin Tauri).
- Le file I/O pour `history.bin` se fait via `app.path().app_data_dir()` (déjà autorisé par Tauri en interne pour le backend).
- `SetWindowDisplayAffinity` est natif Win32, hors permissions Tauri.

`tauri-plugin-store` reste registered mais inutilisé (le retirer dans un futur cleanup).

## 10. Migration plan

**Pour les utilisateurs v0.1.x → v0.2.0** :

1. Premier lancement v0.2.0 détecte `localStorage["unbreakable.history"]` non vide.
2. Modal bloquante (pas de skip) :
   > "X mots de passe en clair ont été trouvés depuis une version précédente. Le nouveau coffre les chiffrera avec votre keystore OS."
   > `[Migrer & chiffrer]` `[Effacer définitivement]`
3. Si migration : parse entrées, push dans vault, `vault_save`, `localStorage.removeItem`.
4. Si effacement : `localStorage.removeItem` direct.
5. Bump `historyStore.version` à 2.

**Settings restent localStorage** (non sensibles) — pas de migration nécessaire.

## 11. Acceptance criteria

- [ ] Toutes les 5 wordlists EFF (FR/EN/DE/ES/IT) embarquées et validées au build.
- [ ] Entropie passphrase ≥65 bits @ 5 mots, vérifié par test unitaire.
- [ ] `SetWindowDisplayAffinity` actif sur QuickPop et sur MainWindow quand un secret est révélé (Windows 10 2004+).
- [ ] macOS equivalent fonctionnel (`NSWindowSharingNone`).
- [ ] Linux affiche badge "non supporté" sans crash.
- [ ] `history.bin` chiffré AES-256-GCM, KEK dans OS keyring.
- [ ] Master password activable/désactivable/rotable via Settings UI.
- [ ] Argon2id paramètres OWASP 2024 vérifiés par test unitaire.
- [ ] Migration localStorage → vault testée end-to-end.
- [ ] Zéro mot de passe en clair sur disque après migration (vérification grep sur app_data_dir).
- [ ] E2E manuel screenshot Win11 confirme la protection (zone noire).
- [ ] Aucune régression sur la génération (mêmes tests `engine.rs` passent).

## 12. Out of scope (pour spec ultérieurs)

- YubiKey / FIDO2 unlock (axe B7)
- Memory locking (`VirtualLock` / `mlock`) — axe B2
- Pwned Passwords offline check — axe B5
- Updater signé — axe B10
- Reproducible builds + SBOM — axe B9
- Persona "Tech Support" features (axe A) — sprint produit suivant
