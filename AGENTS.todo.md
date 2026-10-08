# AGENTS.todo.md

Stand: 2026-10-08. Nur offene TODOs (veraltete Einträge bereinigt: Parität-Batches,
Deep-Link-Paste, Prozess-Regel und Userscripts-Verdikt sind umgesetzt/dokumentiert).

## Navigation (Owner-Entscheidung 2026-10-07, umgesetzt)

Umgesetzt und verifiziert (lint 0, vitest 233/233, build ok, e2e 117/117);
Details in `features/04-projects.md` (Navigation). Offen nur: Streaming-Inspector
für Agenten-Aktivität (dokumentierte Lücke).

## Offen

- [ ] Remote-Zugriff live nachtesten: `remote-code` in der PWA anlegen (User `opencode` + Server-Passwort), Verbindungstest + Schritte 3–12 aus `docs/manual-device-test.md`. VPS-seitig erledigt (Caddy Basic-Gate + CORS, verifiziert 2026-10-07).
- [ ] Auth-Fehler-Banner mit Direkt-Link zum Bearbeiten der Zugangsdaten (Server-Seite + „Server bearbeiten"-Aktion; Umbenennen/Löschen existiert bereits).
- [ ] Echter Geräte-Test: PWA-Install + Offline/SW auf realem Handy (nur Config + `dist` verifiziert).

## Bewusst offen/dokumentiert (kein Handlungsbedarf)

- PTY: Text-Ansicht via `terminal/read` (Entscheidung in `features/05-parity.md`).
- Userscripts server-stored: nicht statisch machbar (Verdikt in `features/03-userscripts-postmvp.md`).
- OAuth-complete/Credential-Mgmt/Config-Writes, Plugin: zurückgestellt.
- Feed-Richtung Chat-Stil, Routen-Regel Pfad-vor-Query: entschieden und umgesetzt.

