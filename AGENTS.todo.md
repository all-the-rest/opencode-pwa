# AGENTS.todo.md

Stand: 2026-10-05. MVP-Wellen W0–W5 umgesetzt und verifiziert (lint 0, vitest 86/86, build ok, e2e 34/34). Nur offene TODOs.

## Abgeschlossen (W5)

- [x] Offline-Server: nicht entfernen, Sessions disablen — Policy in `src/lib/offline.ts`, Server bleibt in der Liste (Badge `Offline`), Sessions sichtbar aber deaktiviert, keine Lösch-Aktion und kein Auto-Remove bei Erreichbarkeitsverlust. E2E `@feature:offline-server`.
- [x] Kommandos: Shell-Befehle direkt ausführen (`POST /api/shell`) + Ergebnis anzeigen.
- [x] Shell-Output: Tail-Poll alle 2s statt Fetch-pro-Öffnen (`src/hooks/useShellOutputStream.ts`), Live-Badge, Stop bei Close/Unmount. Truncation über `truncated` erkannt.
- [x] Notifications pro Server: Toggle in Settings, `localStorage`, `useEventNotifications` respektiert ihn.
- [x] Model/Agent-Picker pro Session (`session.switchAgent`/`switchModel`), Optionen aus `GET /api/agent` + `GET /api/model` (Hidden-Agents raus, Varianten aufgefächert). E2E `@feature:agent-picker`.

## Offen (nach MVP)

- [ ] Echter Geräte-Test: PWA-Install + Offline/SW auf realem Handy (nur Config + `dist` verifiziert).
- [ ] PTY: nur Liste + Token-Anzeige; Terminal-Rendering bei Bedarf (Entscheidung in `features/05-parity.md`).
- [ ] Parität-Rest aus `features/05-parity.md` (❌-Markierungen): Files/VCS/Worktrees/Commands/Skills/MCP/Permissions/Config, Provider-Liste, Agent-Detail.
- [ ] Fork/compact/revert/share, Session-Stats, Diff-Ansicht, Datei-Anhänge in Prompts.
- [ ] E2E-Paging vs. 5-s-Poll: Reload setzt auf Seite 1 zurück – bei langsamen Runnern beobachten.
- [ ] Feed-Richtung: neueste zuerst, ältere laden am Listenende (Standard-Feed); „nach oben nachladen" wörtlich ist nicht umgesetzt – Owner-Entscheidung ausstehend.
- [ ] Manuell prüfen: CI-Runs auf `main` nach jedem Push (frühe Phase: nicht auf CI warten).

## Später (MVP+1)

- [ ] Userscripts: server-stored Katalog (siehe `features/03-userscripts-postmvp.md`).
- [ ] Plugin-Überlegung (zurückgestellt, statische Natur hat Vorrang).
