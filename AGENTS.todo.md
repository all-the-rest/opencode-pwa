# AGENTS.todo.md

Stand: 2026-10-05. MVP-Wellen W0–W4 umgesetzt und verifiziert (lint 0, vitest 55/55, build ok, e2e 24/24). Nur offene TODOs.

## Offen (nach MVP)

- [ ] Echter Geräte-Test: PWA-Install + Offline/SW auf realem Handy (nur Config + `dist` verifiziert).
- [ ] Shell-Output: Fetch-pro-Öffnen → Streaming/Tail-Poll prüfen.
- [ ] PTY: nur Liste + Token-Anzeige; Terminal-Rendering bei Bedarf (Entscheidung in `features/05-parity.md`).
- [ ] Parität-Rest aus `features/05-parity.md` (❌-Markierungen): Notifications pro Server (Toggle/persistiert), Model/Agent-Picker, Files/VCS/Worktrees/MCP/Permissions.
- [ ] E2E-Paging vs. 5-s-Poll: Reload setzt auf Seite 1 zurück – bei langsamen Runnern beobachten.
- [ ] Feed-Richtung: neueste zuerst, ältere laden am Listenende (Standard-Feed); „nach oben nachladen" wörtlich ist nicht umgesetzt – Owner-Entscheidung ausstehend.
- [ ] Manuell prüfen: CI-Runs auf `main` nach jedem Push (frühe Phase: nicht auf CI warten).

## Später (MVP+1)

- [ ] Userscripts: server-stored Katalog (siehe `features/03-userscripts-postmvp.md`).
- [ ] Plugin-Überlegung (zurückgestellt, statische Natur hat Vorrang).
