# AGENTS.todo.md

Stand: 2026-10-05. Nur offene TODOs. Wellen: W0 ✅, W1–W4 offen. P0 zuerst.

## W1 (P0) – Streams im Hintergrund cachen + Infinite Scroll

- [ ] P0: Event-Worker (Web Worker + `event.subscribe`, SSE): pro Server genau ein Stream, Reconnect mit Backoff, AbortSignal-Cleanup bei Serverwechsel. Vorstufe drin: `src/hooks/useEventNotifications.ts` (Stream pro gewähltem Server, Backoff + AbortController).
- [ ] P0: Lokaler Message-Cache (IndexedDB, Key `serverID:sessionID:messageID`): neueste ~200/Session halten, ältere verwerfen; App-Shell offline nutzbar.
- [ ] P0: Session-Seite auf Cache umstellen: initial IndexedDB, dann Netzwerk; Infinite Scroll (neueste zuerst, nach oben nachladen). Ist: `src/pages/SessionDetail.tsx` nur ein Fetch, kein Cache.
- [ ] P0: Tests: Vitest Cache-Eviction + Merge, E2E `@feature:stream-cache` (Offline + Reconnect, gemockter Stream).

## W1 (P0) – CI-Gate

- [ ] P0: `.github/workflows/ci.yml` nach erstem Push verifizieren (grüner Run auf main). Datei drin, noch nie gelaufen.

## W2 (P1) – MVP Parität mit Opencode Web

- [ ] P1: Laufende Shells + Agenten immer sichtbar inkl. Anzahl (Dashboard-Badge + Server-Detail-Zähler; Poll/Stream-Refresh). Basis drin: Zähler ohne Live-Refresh.
- [ ] P1: Kill vom Web aus: Shell abbrechen/entfernen (`DELETE /api/shell/{id}`), Session unterbrechen/löschen (`POST .../interrupt`, `DELETE /api/session/{id}`) mit Confirm + Regressionstest.
- [ ] P1: Paritäts-Checkliste definieren: Opencode-Web-Funktionen auflisten, abhaken was fehlt (`features/` ergänzen).
- [ ] P1: Sessions-Paging (Cursor) + Filter nach Agent/Projekt.
- [ ] P1: Shell-Output live (`shell.output`), Create/Remove-Actions.
- [ ] P1: PTY-Ansicht (Terminal-Rendering + Connect-Token-Flow).
- [ ] P1: Prompt senden (`session.prompt`, optimistisches Einfügen).
- [ ] P1: Projekt-Gruppierung ausbauen (Filter + Suche). Basis drin: gruppierte Liste + Zähler.
- [ ] P1: Notifications ausbauen (pro Server toggle, persistiert). Basis drin: globaler Button + Hook.
- [ ] P1: E2E `@feature` für neue UI (Projekt-Gruppierung, Notification-Button, Kill-Buttons gemockt).

## W3 (P1) – i18n nach Skill `react-i18n`

- [ ] P1: Lingui-Setup (Config, Provider als Erst-Import, Vite-Preset-Reihenfolge, `check-i18n`-Gate im Prebuild).
- [ ] P1: Alle UI-Strings wrappen (`Trans`/`t`, inkl. „im Hintergrund ausführen"), Katalog kompilieren.
- [ ] P1: Verifikation `pnpm build` + `preview` ohne Locale-Fehler.

## W4 (P2) – Icons, PWA, Tests, Review

- [ ] P2: Iconify für Icons (Paket + Icon-Komponente, alle Inline-SVGs ersetzen).
- [ ] P2: GitHub-Link in UI (Header/Footer → `all-the-rest/opencode-pwa`).
- [ ] P2: Echte PWA-Icons (192/512 + maskable), Offline-Seite + API-Cache-Strategie.
- [ ] P2: Unit: row-Extraction Edgecases, servers-Context Roundtrip.
- [ ] P2: E2E `@feature`: Server anlegen (persistiert), Offline-Banner (gemockt); `@regression`: Drawer-Nav mobil.
- [ ] P2: UI-Review-Loop (Screenshots alle Routen, empty + filled).

## Später (MVP+1)

- [ ] Userscripts: server-stored Katalog (siehe `features/03-userscripts-postmvp.md`).
- [ ] Plugin-Überlegung (zurückgestellt, statische Natur hat Vorrang).
