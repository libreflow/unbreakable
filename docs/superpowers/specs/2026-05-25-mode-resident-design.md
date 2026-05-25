# Mode Résident — Unbreakable

**Date:** 2026-05-25
**Status:** Approved for planning
**Scope:** Intégration système Tauri (tray, raccourci global, autostart, notifications, mini-pop)

---

## 1. Contexte

Unbreakable est aujourd'hui une app desktop Tauri 2 + React + TypeScript pour générer mots de passe et passphrases. Elle se lance, on génère, on copie, on ferme. L'objectif du Mode Résident est de **rendre Unbreakable accessible sans avoir à ouvrir la fenêtre principale** — via tray, raccourci global, et une mini-pop instantanée — tout en respectant strictement l'utilisateur (rien d'actif par défaut).

Toutes les fonctionnalités résidentes sont **opt-in via Réglages**. Le premier lancement laisse l'app strictement identique à aujourd'hui.

## 2. Surface utilisateur

Nouvelle section dans le flyout Réglages :

```
┌─ Mode résident ───────────────────────────────────────┐
│ ☐ Garder dans la barre système (tray)                 │
│ ☐ Lancer au démarrage de la session                   │
│ ☐ Raccourci global         [ Ctrl+Alt+P    ▸ Modifier]│
│ ☐ Notifications système (copie, expiration TTL)       │
└───────────────────────────────────────────────────────┘
```

**Règle d'indépendance** : chaque toggle est autonome. Activer le raccourci n'active pas le tray. Activer le tray n'active pas l'autostart. L'utilisateur compose librement.

## 3. Architecture Tauri

| Plugin / API | Rôle | Permission |
|---|---|---|
| `tauri-plugin-global-shortcut` v2 | Enregistre la combinaison configurée | `globalShortcut:default` |
| `tauri-plugin-autostart` v2 | Active/désactive le lancement OS | `autostart:default` |
| `tauri-plugin-notification` v2 | Toast système (copie / TTL expiré) | `notification:default` |
| Tauri 2 Tray API (built-in) | Icône + menu contextuel | — |

**Deux fenêtres** déclarées dans `tauri.conf.json` :
- `main` — fenêtre existante (panels, settings, history). Comportement inchangé.
- `quick` — fenêtre 360×180, frameless, always-on-top, skip-taskbar, transparente. **Non déclarée dans `tauri.conf.json`** ; créée programmatiquement par `WebviewWindowBuilder` au moment du déclenchement, détruite à la fermeture (voir §4 lifecycle).

## 4. Mini-pop (fenêtre `quick`)

**Déclencheurs** : raccourci global enregistré, ou clic gauche sur l'icône tray.

**Layout** :
```
┌──────────────────────────────────┐
│ UNBREAKABLE          →  [···]   │   ← header minimal
├──────────────────────────────────┤
│ Xq7$mK#vL2pN@8wH                 │   ← secret affiché
│ ████████ Très fort · 78 bits     │   ← strength bar
├──────────────────────────────────┤
│ [    COPIER    ] [↻] [⏏]        │   ← actions
└──────────────────────────────────┘
```

**Comportement** :
1. À l'ouverture, génère immédiatement un secret du type défini par `settings.default_copy` avec les options actuelles (`pwdOpts` ou `phraseOpts`).
2. Affiche le secret + le strength meter (réutilise `StrengthMeter`).
3. **Auto-focus sur le bouton COPIER** → Entrée = copier + fermer.
4. `↻` régénère sur place (sans fermer).
5. `⏏`, clic en dehors, ou Échap = ferme la fenêtre (sans copier).
6. `···` ouvre `main` et ferme `quick`.

**Positionnement** : centré sur l'écran actif (`window.current_monitor()`). Pas de mémorisation — toujours recentré.

**Lifecycle** : la fenêtre `quick` est **détruite à la fermeture**, recréée au déclenchement suivant. Cela garantit un état propre et libère ~30 Mo de RAM résidente entre usages.

## 5. Tray

**Clic gauche** : ouvre la mini-pop.

**Clic droit** : menu contextuel :
```
┌──────────────────────────────┐
│ Générer & copier mot de passe│
│ Générer & copier passphrase  │
├──────────────────────────────┤
│ Ouvrir Unbreakable           │
│ Recopier le dernier secret   │ ← grisé si historique vide
├──────────────────────────────┤
│ Quitter                       │
└──────────────────────────────┘
```

**Icône** : SVG monochrome, deux variantes selon le thème système (lime sur dark, ink sur light). Une troisième variante "active" (point lime visible) est appliquée pendant un TTL clipboard actif : la fenêtre `main` émet `tray-icon-state` (`"idle" | "active"`) quand `clipboardStore` change d'état, le code Rust swap simplement l'icône à réception (aucun timer Rust).

## 6. Synchronisation state cross-window

**Problème** : deux fenêtres React isolées. `localStorage` ne notifie pas en temps réel entre fenêtres Tauri (l'event `storage` ne fire qu'entre onglets du même `BrowserContext`, pas entre fenêtres Tauri).

**Solution** : événements Tauri en bus.

| Event | Émetteur | Récepteur | Payload |
|---|---|---|---|
| `settings-changed` | `main` quand un setting est mis à jour | `quick` (si ouverte) | `{ key: string, value: unknown }` |
| `secret-copied` | `quick` après copie | `main` | `{ kind: "password" \| "passphrase", ttl: number }` |
| `clipboard-cleared` | code TTL (le premier qui détecte l'expiration) | toutes fenêtres + notif si activée | `{}` |

**Source de vérité** : `localStorage` reste la source unique pour la persistance (Zustand persist déjà en place). Les fenêtres relisent à l'ouverture. Le bus événements gère uniquement la **propagation live** des mutations.

## 7. Notifications

Deux notifications, opt-in unique (toggle 4) :
- **Après copie** : `"Mot de passe copié · 60 s avant effacement"` (texte adapté au type et au TTL configuré). Déclenchée par l'event `secret-copied`.
- **TTL expiré** : `"Presse-papiers effacé"`. Déclenchée par l'event `clipboard-cleared`.

**Règle sécurité** : aucune notification ne contient le secret en clair, jamais (pas même tronqué). Le titre, le corps, et le tag sont neutres.

## 8. Réglages — schéma store

Cinq nouveaux champs dans `settingsStore.ts` :

```ts
interface ResidentModeSettings {
  tray_enabled: boolean;          // défaut: false
  autostart_enabled: boolean;     // défaut: false
  shortcut_enabled: boolean;      // défaut: false
  shortcut_combo: string;         // défaut: "CommandOrControl+Alt+P"
  notifications_enabled: boolean; // défaut: false
}
```

Quand un toggle change, le store appelle la commande Tauri correspondante (`enable_tray`, `register_shortcut`, etc.) qui matérialise le changement OS-side immédiatement.

## 9. Composants à créer / modifier

**Nouveaux fichiers** :

| Fichier | Rôle |
|---|---|
| `src-tauri/src/tray.rs` | Setup tray (icône, menu, handlers) |
| `src-tauri/src/quick_window.rs` | Création / destruction fenêtre `quick`, positionnement |
| `src-tauri/src/shortcuts.rs` | Register / unregister global shortcut |
| `src-tauri/src/resident_commands.rs` | Commandes IPC : `enable_tray`, `enable_autostart`, `register_shortcut`, `unregister_shortcut`, `show_quick`, `hide_quick` |
| `src/quick.tsx` | Entry point Vite de la mini-pop |
| `src/components/QuickPop/QuickPop.tsx` | Composant React de la mini-pop |
| `src/components/QuickPop/QuickPop.css` | Styles dédiés (cohérents avec App.css) |
| `src/components/Settings/ResidentModeSection.tsx` | Section Réglages |
| `quick.html` | HTML entry point pour la fenêtre `quick` |

**Fichiers modifiés** :

| Fichier | Changement |
|---|---|
| `src-tauri/Cargo.toml` | Ajout 3 plugins Tauri v2 |
| `src-tauri/tauri.conf.json` | Déclaration plugins, permissions, fenêtre `quick` |
| `src-tauri/src/main.rs` | Wiring tray + plugins au boot |
| `src-tauri/capabilities/default.json` | Permissions accordées au frontend |
| `src/stores/settingsStore.ts` | Ajout des 5 champs (§8) + appels IPC sur mutation |
| `src/components/Settings/Settings.tsx` | Insertion de `<ResidentModeSection />` |
| `vite.config.ts` | `build.rollupOptions.input` multi-entry (`index`, `quick`) |
| `package.json` | Dépendances `@tauri-apps/plugin-global-shortcut`, `@tauri-apps/plugin-autostart`, `@tauri-apps/plugin-notification` |

## 10. Contraintes et invariants

- **Offline strict** (CLAUDE.md) : aucun des plugins ajoutés ne fait de réseau. Vérifier au moment de l'audit dépendances.
- **Secrets jamais journalisés** : aucun `console.log` ni `tracing::info!` ne doit contenir un secret en clair, même temporairement.
- **Pas de double clipboard timer** : le timer TTL reste piloté par `clipboardStore` côté JS. Le tray observe via event `clipboard-cleared`, ne pilote pas le timer.
- **Permissions minimales** : chaque plugin demande la permission minimale (`globalShortcut:allow-register`, pas `:default` complet, par exemple) à valider à l'implémentation.

## 11. Risques identifiés

| Risque | Mitigation |
|---|---|
| Conflit du raccourci global avec un autre soft (Ctrl+Alt+P) | UI de saisie du combo avec test live + message d'erreur si occupé |
| L'utilisateur active le tray puis ferme la fenêtre principale → l'app reste résidente sans qu'il le sache | Comportement explicite : fermer la fenêtre principale ≠ quitter. Toast "Unbreakable continue en tray" la première fois. |
| Autostart sur Linux nécessite `.desktop` file ; plugin gère mais à tester sur les 3 OS | Plan d'impl prévoit test croisé Win + macOS + Linux |
| L'utilisateur configure un raccourci puis désinstalle l'app → raccourci OS-side reste enregistré ? | Le plugin nettoie au quit, mais à vérifier |

## 12. Hors scope (volontaire)

- Pas de chiffrement de l'historique (direction "intelligence", autre spec)
- Pas de pwned check / API externe (offline-first strict)
- Pas de pin-to-screen / transparence ajustable (autre direction "polish")
- Pas de drag-and-drop pour auditer un mot de passe collé (direction "intelligence")
- Pas de multi-écran complexe (la mini-pop sort sur l'écran actif, point)

## 13. Définition du succès

- L'utilisateur peut activer chaque feature résidente indépendamment depuis Réglages.
- Avec le raccourci global activé, presser la combinaison ouvre la mini-pop en < 200 ms.
- Cliquer "COPIER" dans la mini-pop copie + ferme + (si notifs activées) émet une notification.
- La fenêtre principale reste totalement fonctionnelle comme avant ; ne pas ouvrir la mini-pop ne change rien.
- Désactiver tous les toggles dans Réglages restaure l'app à son comportement de v0.1.0 sans redémarrage.
