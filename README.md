# Unbreakable

Générateur de mots de passe ultra-sécurisés — desktop, offline, zéro friction.

À chaque ouverture, **Unbreakable** génère un mot de passe + une passphrase, copie automatiquement le secret par défaut dans le presse-papiers, et l'efface au bout du TTL (60 s par défaut) ou à la fermeture si le contenu n'a pas été modifié.

## Stack

| Couche | Techno |
|---|---|
| Shell | Tauri 2 (Rust) |
| Bundler | Vite 8 |
| UI | React 19 + TypeScript 6 |
| State | Zustand (persist) |
| CSPRNG | `getrandom` 0.4 (OS) |
| Crypto historique | Web Crypto AES-GCM 256 |
| Force | `@zxcvbn-ts/core` |

## Démarrage

```bash
npm install
npm run tauri dev
```

Prérequis : Node ≥ 22.12, Rust ≥ 1.87, WebView2 (Win) / WebKitGTK 4.1 (Linux) / Xcode CLI (macOS).

## Scripts

<!-- AUTO-GENERATED from package.json + Cargo.toml -->
| Commande | Effet |
|---|---|
| `npm run dev` | Frontend Vite seul (port 1420) |
| `npm run build` | `tsc` + Vite build → `dist/` |
| `npm run preview` | Prévisualisation du build Vite |
| `npm run tauri dev` | App desktop complète (hot-reload) |
| `npm run tauri build` | Bundles signés multi-OS (`.msi`, `.dmg`, `.deb`) |
| `cargo test --lib` | Tests unitaires Rust (depuis `src-tauri/`) |
<!-- END AUTO-GENERATED -->

## Raccourcis

| Touche | Action |
|---|---|
| `Ctrl/Cmd + R` | Régénérer |
| `Espace` | Régénérer |
| `Ctrl/Cmd + C` | Copier MDP |
| `Ctrl/Cmd + Shift + C` | Copier Passphrase |
| `Ctrl/Cmd + H` | Historique |
| `Ctrl/Cmd + ,` | Paramètres |
| `Échap` | Fermer flyout |

## Sécurité

- OsRng via `getrandom::fill()` + rejection sampling unbiased
- Zeroize buffers contenant des secrets
- CSP stricte (`default-src 'self'`)
- Effacement clipboard à TTL et à la fermeture (conditionnel)
- Historique chiffré AES-GCM 256 côté navigateur
- Zéro fetch externe, zéro télémétrie

## Commandes IPC (Tauri)

<!-- AUTO-GENERATED from src-tauri/src/commands/ + src/utils/tauriCommands.ts -->
### Génération

| Commande | Paramètres | Retour | Description |
|---|---|---|---|
| `cmd_generate_password` | `opts?: PasswordOptions` | `string` | Génère un mot de passe (longueur 8–128, ≥80 bits entropie) |
| `cmd_generate_passphrase` | `opts?: PassphraseOptions` | `string` | Génère une passphrase (3–12 mots, wordlist FR 256+) |
| `cmd_generate_pair` | `pwdOpts?, phraseOpts?` | `[string, string]` | Génère les deux en un seul appel IPC |

**`PasswordOptions` (défauts):**

| Champ | Type | Défaut | Description |
|---|---|---|---|
| `length` | `number` | `24` | Longueur (8–128) |
| `uppercase` | `boolean` | `true` | Inclure majuscules |
| `lowercase` | `boolean` | `true` | Inclure minuscules |
| `digits` | `boolean` | `true` | Inclure chiffres |
| `symbols` | `boolean` | `true` | Inclure symboles (`!@#$%^&*-_=+`) |
| `exclude_ambiguous` | `boolean` | `true` | Exclure `0Ol1I|` |
| `min_per_group` | `number` | `2` | Minimum de caractères par groupe actif |
| `exclude_chars` | `string` | `""` | Caractères à exclure manuellement |

**`PassphraseOptions` (défauts):**

| Champ | Type | Défaut | Description |
|---|---|---|---|
| `words` | `number` | `5` | Nombre de mots (3–12) |
| `separator` | `string` | `"-"` | Séparateur (max 8 chars) |
| `capitalization` | `"off"\|"first"\|"all"` | `"first"` | Casse des mots |
| `append_digits` | `boolean` | `true` | Ajouter 2 chiffres en fin |
| `append_symbol` | `boolean` | `false` | Ajouter un symbole en fin |

### Presse-papiers

| Commande | Paramètres | Retour | Description |
|---|---|---|---|
| `cmd_copy_to_clipboard` | `text: string` | `void` | Copie le texte + mémorise comme "le nôtre" |
| `cmd_clear_clipboard` | — | `void` | Efface le presse-papiers |
| `cmd_read_clipboard` | — | `string` | Lit le contenu actuel |
| `cmd_clear_if_ours` | — | `boolean` | Efface seulement si le contenu n'a pas changé ; retourne `true` si effacé |

### Erreurs IPC

| Variant | Cause |
|---|---|
| `Rng(msg)` | OS RNG indisponible |
| `InvalidOptions(msg)` | Paramètre hors plage ou contradictoire |
| `EntropyTooLow(bits)` | Entropie calculée < 80 bits |
| `GenerationExhausted(n)` | 10 tentatives de génération épuisées |
| `Clipboard(msg)` | Erreur plugin clipboard |
<!-- END AUTO-GENERATED -->

## Statut Sprints (CDC §9)

| Sprint | Statut |
|---|---|
| S1 — Setup + crypto OsRng | ✅ 17/17 tests |
| S2 — UI + TTL + close-clear | ✅ |
| S3 — zxcvbn + paramètres | ✅ |
| S4 — Historique + thèmes + raccourcis | ✅ |
| S5 — Tests + a11y | 🟡 ARIA OK, e2e à compléter |
| S6 — CI + signatures | 🟡 Actions présent, signing à provisionner |

## TODO

- Wordlist EFF Large (7776 mots) via `include_bytes!`
- Wordlist FR Diceware
- Tests proptest
- Plugin updater + endpoint signé
- E2E Playwright cross-OS
- Notarisation Apple + signtool Windows
