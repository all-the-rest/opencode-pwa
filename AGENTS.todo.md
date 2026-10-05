# AGENTS.todo.md

Stand: 2026-10-05. Nur offene TODOs. Priorität: P0 = Stream-Cache (Worker + lokal + Infinite Scroll), P1 = Rest MVP, P2 = Tests/UI-Review.

## P0 – Streams im Hintergrund cachen + Infinite Scroll (eingeplant, priorisiert)

- [ ] P0: Event-Worker (Web Worker + `event.subscribe`, SSE): pro Server genau ein Stream, Reconnect mit Backoff, AbortSignal-Cleanup bei Serverwechsel. Quelle: `src/lib/opencode.ts:74 subscribeEvents`.
- [ ] P0: Lokaler Message-Cache (IndexedDB, Key `serverID:sessionID:messageID`): nur neueste N (z.B. 200/Session) halten, ältere verwerfen; App-Shell bleibt offline nutzbar.
- [ ] P0: Session-Seite auf Cache umstellen: initial aus IndexedDB rendern, dann Netzwerk nachladen; Infinite Scroll (neueste zuerst, nach oben nachladen), kein Full-Reload. Ist: `src/pages/SessionDetail.tsx:49` macht nur einen Fetch, kein Worker, kein Cache.
- [ ] P0: Tests dazu: Vitest für Cache-Eviction + Merge (Event über Fetch), E2E `@feature:stream-cache` mit gemocktem Event-Stream (Offline + Reconnect).

## App (P1)

- [ ] Sessions list: pagination via cursor, filter by agent/project.
- [ ] Shells view: show live output (`shell.output`), create/remove actions.
- [ ] PTY view: terminal rendering + connect token flow (custom transport, outside generic client).
- [ ] Prompt send: wire `session.prompt` from session page, optimistic message insert.
- [ ] Events: live updates via `subscribeEvents` with reconnect + AbortSignal cleanup.

## PWA

- [ ] Real PWA icons: replace 1px placeholder PNGs with 192x192 and 512x512 artwork + maskable variant.
- [ ] Offline page and API cache strategy review.

## Tests

- [ ] Unit: session/shell/pty row extraction edge cases (missing id/title shapes).
- [ ] Unit: servers context add/update/remove/select persistence roundtrip.
- [ ] E2E `@feature`: add server in settings, persists after reload (localStorage).
- [ ] E2E `@feature`: server detail shows offline banner when API unreachable (route mock).
- [ ] E2E `@regression`: drawer nav on mobile viewport (Pixel 7 project).
- [ ] ui-review loop: screenshot pass over all routes (empty + filled states) per session.

## Later (MVP+1)

- [ ] Userscripts MVP+1: design server-stored script catalog (see features/03-userscripts-postmvp.md).
