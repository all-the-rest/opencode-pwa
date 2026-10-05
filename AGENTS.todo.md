# AGENTS.todo.md

Stand: 2026-10-05. Nur offene TODOs.

## App

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
