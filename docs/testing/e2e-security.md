# E2E Security Tests (manual)

## Setup
- Build the release binary: `npm run tauri build`
- Install the resulting MSI (Windows).

## Test 1: QuickPop anti-capture (Windows)
1. Launch the app.
2. Trigger QuickPop via tray or global shortcut.
3. Use Snipping Tool (Win+Shift+S) to capture the QuickPop window.
4. Expected: captured image shows a black/blank rectangle where QuickPop is.

## Test 2: MainWindow anti-capture on reveal
1. Open the main window, generate a password.
2. Click the reveal button.
3. Use Print Screen, paste into Paint.
4. Expected: the area where the secret is shown is black.
5. Hide the password, repeat Print Screen.
6. Expected: window still captured as black, because the passphrase panel is always rendered in plaintext beside the password panel. Protection stays on for the full main-window lifetime to prevent leaking the adjacent passphrase.

## Test 3: Teams screen-share
1. Start a Teams meeting.
2. Share entire screen.
3. Reveal a password in the app.
4. Expected: viewer sees secret area as black/empty.

## Test 4: Master password activation + rotation
1. Open Settings, Sécurité section.
2. Click "Activer", set a master pw.
3. Quit the app, relaunch.
4. Expected: UnlockModal appears.
5. Enter master pw, app opens.
6. Disable master pw via Settings.
7. Quit + relaunch, no prompt.

## Test 5: Migration v0.1 to v0.2
1. Install v0.1 build (or seed localStorage manually in DevTools).
2. Upgrade to v0.2.
3. Expected: MigrationModal on first launch.
4. Click "Migrer & chiffrer".
5. Verify %APPDATA%/com.unbreakable.app/history.bin exists.
6. Verify localStorage["unbreakable.history"] removed.

## Test 6: Corrupted vault recovery
1. Quit the app.
2. Truncate history.bin to 10 bytes.
3. Launch the app.
4. Expected: error indicating corrupted vault.

## Test 7: Disable protection via env var
1. Set UNBREAKABLE_DISABLE_PROTECTION=1 before launching.
2. Reveal a secret, screenshot.
3. Expected: capture works (protection disabled for E2E tests).
