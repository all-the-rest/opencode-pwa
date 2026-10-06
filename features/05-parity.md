# 05 - Parity with Opencode Web

Scope: MVP parity with the Opencode Web UI (the browser UI served by an
Opencode server), as far as the static PWA architecture allows. Source of
truth for "what exists" is the installed `@opencode/client` surface
(`node_modules/@opencode/client`, version pinned in `package.json`):
top-level namespaces are `agent, command, config, credential, debug, event,
experimental, file, form, generate, integration, location, mcp, message,
migration, model, permission, plugin, project, provider, pty, reference,
rpc, server, session, shell, skill, vcs, websearch, worktree`.

Legend: ✅ in this app · 🚧 partial · ❌ missing (post-MVP unless noted).

## Sessions

- ✅ List with cursor paging (`GET /api/session`, `limit/cursor/project/search`), filter by agent/project, search.
- ✅ Grouped by project on the server page.
- ✅ Message history cache-first (IndexedDB) + infinite scroll + live events.
- ✅ Send prompt (`POST /api/session/{id}/prompt`) with optimistic insert.
- ✅ Interrupt (`POST /api/session/{id}/interrupt`) + delete (`DELETE /api/session/{id}`) with German confirm.
- ✅ Model/agent picker per session (`session.switchAgent/switchModel`,
  options from `GET /api/agent` + `GET /api/model`; hidden agents dropped,
  model variants expanded into one option each).
- ✅ Fork (`POST /api/session/{id}/fork`, German confirm, opens the new
  session) + compact (`POST /api/session/{id}/compact`, German confirm, start
  notice) on SessionDetail.
- ✅ Session stats card on SessionDetail: per-session tokens/cache/cost from
  `session.get` (`SessionInfo.tokens`, `SessionInfo.cost`), tool totals from
  the global `GET /api/experimental/session/stats` (labelled "alle Sessions").
  Note: `session.stats` is a *global* aggregate (from/to/project/timezone
  filter, no session id) — there is no per-session stats endpoint, so the card
  combines both sources instead of pretending the aggregate is per-session.
- ✅ Session diff view (`GET /api/session/{id}/diff`): collapsible section on
  SessionDetail, per-file `<details>` with +/- counts and the patch in
  `<pre>`, read-only.
- ✅ File attachments in prompts: workspace paths attached in the prompt box
  (mention input + chips), sent as `SessionPromptInput.files` (`file://` URIs
  — verified in the installed client package, so no UI-only limitation).
- ❌ Revert/share: not surfaced yet.

## Shells & Tasks

- ✅ List always visible with counts (dashboard badge + server card), live refresh (5s poll + event-hub).
- ✅ Live output (`GET /api/shell/{id}/output`), create (`POST /api/shell`), remove (`DELETE /api/shell/{id}`) with confirm.
- ✅ Tail-polled output (`src/hooks/useShellOutputStream.ts`): initial fetch,
  then cursor-paged poll every 2s while the panel is open, stops on
  collapse/unmount, `Live` badge while tailing.

## PTY / Terminal (decision)

- 🚧 List + per-PTY connect-token request (`GET /api/pty/{id}/connect-token`, ticket shown for external terminal clients).
- ❌ In-app terminal rendering: deliberately deferred. Rendering a
  terminal needs an xterm-compatible emulator plus a WebSocket/ticket
  attach flow, which is too big for the W2 MVP and duplicates external
  terminals. The token flow is kept so nothing blocks it later
  (see `features/02-api-contract.md`). Decision recorded here per W2 scope.

## Projects, Agents, Models

- ✅ Projects listed + counted, sessions grouped/filtered by project.
- ✅ Agents: counted on dashboard, usable as session filter, and selectable per
  session (`GET /api/agent`).
- ✅ Agent detail (`GET /api/agent/{id}`, route `/servers/:id/agents/:agentId`,
  linked from the agent list on Server-Werkzeuge): description, mode, model
  ref plus the model's capabilities (tool use, I/O formats, resolved over
  `GET /api/model`).
- ✅ Models: selectable per session (`GET /api/model`), variants included.
- ✅ Providers (`GET /api/provider`) + model overview on Server-Werkzeuge:
  read-only provider list (activation badge) with their models grouped by
  `providerID`; models without a known provider under "Ohne Anbieter".

## Files, VCS, Worktrees, MCP, Permissions

Read-only parity under the route **`/servers/:id/tools`** ("Server-Werkzeuge",
reachable from the drawer nav and from a link on `/servers/:id`). One page, five
cards, rows extracted with the `{ data: [...] }`-tolerant patterns in
`src/lib/opencode.ts`.

- ✅ File browser (read-only): `GET /api/fs/list` per path, directories
  navigate, `GET /api/fs/read/{path}` shows the content in a `<pre>` (capped at
  `MAX_FILE_PREVIEW_CHARS` = 200 000 characters, a cut is flagged in the UI).
  No write, no delete, no rename — deliberately.
- ✅ VCS status: `GET /api/vcs/status` lists changed files with
  added/modified/deleted and +/- line counts.
- ✅ Worktrees: `GET /api/worktree?projectID=` per project (project `<select>`,
  first project preselected). Read-only — no create/remove.
- ✅ MCP servers: `GET /api/mcp` lists the configured servers with their
  connection state (verbunden/wartet/deaktiviert/fehlgeschlagen/Anmeldung
  nötig) and the server-side error text. Read-only — no add/connect/remove.
- ✅ Permissions: `GET /api/permission/request` lists the requests waiting for a
  decision, answered with
  `POST /api/session/{sessionID}/permission/{requestID}/reply`
  (`decision: "once"` = "Einmal erlauben", `decision: "reject"` = "Ablehnen").
  Deliberately **not** implemented: `always` (would persist a grant) and
  `permission.saved` (stored grants).
- 🚧 The page follows the offline policy of `src/lib/offline.ts`: the banner
  appears on reachability loss and the new actions `file-read` /
  `permission-reply` are disabled, so nothing is written to an unreachable
  server. VCS/MCP/permissions reload on the 5 s live refresh.

Still missing in this section: commands/skills (`command.*`, `skill.*`),
integration management, config editing, websearch, forms, revert/share.

## Credential Vault (AES-GCM + Web Crypto)

Server passwords are **never** in `localStorage` any more.

- `localStorage` key `opencode-pwa:servers` holds `id`, `name`, `baseUrl`,
  `username` only — `ServerConfig` (`src/lib/opencode.ts`) no longer has a
  `password` field.
- One random data encryption key per install lives in IndexedDB
  (`opencode-pwa-credential-vault`, object store `entries`, row `dek`) as a
  **non-extractable** `CryptoKey` (AES-GCM 256). Script cannot read it back
  out of the vault. It is created lazily on the first seal, so an install
  without any password never touches WebCrypto or IndexedDB.
- Every password is sealed with its own random 96-bit IV; IV and ciphertext are
  stored next to each other as row `secret:<serverID>`.
- `makeClient(server)` is async now: it resolves the password per request via
  `getDecryptedConfig(server)` (`src/lib/credentialVault.ts` +
  `src/lib/opencode.ts`), so no component ever holds a password.
- Startup migration: reading the server list hands any plaintext `password` of
  an older version to the vault (`adoptPlaintextCredentials`, registered
  synchronously during the first render), and the password-free list is
  persisted right after — which wipes the plaintext. Reads wait for the
  migration (`whenVaultReady`), so the first paint still authenticates.
- Fallback: without WebCrypto or IndexedDB the credentials live in a
  module-local map for the current session only — never persisted — and
  Settings shows a German notice (`vault-fallback-notice`). After a reload the
  password has to be entered again.
- Covered by `src/lib/credentialVault.test.ts` (roundtrip, fresh IV, tampered
  ciphertext, restart, migration, fallback) plus E2E `@feature:vault-migration`
  and `@feature:vault-fallback` in `tests/e2e/w6-vault-tools.spec.ts`.
- Edit semantics: the Settings password field stays blank while editing — the
  secret never enters the DOM. Saving it blank keeps the stored credential
  (`updateServer` only seals a non-blank password); a non-blank password
  overwrites it. Dropping a stored credential is only possible by removing
  the server.

## App-Level

- ✅ Multi-server with Basic Auth, offline-tolerant UI, local notifications.
- ✅ Credential vault: passwords sealed with AES-GCM in IndexedDB (see the
  section above), plain `localStorage` list, German notice when no persistent
  vault is available.
- ✅ Offline-server policy (`src/lib/offline.ts`): an unreachable server is
  never removed and never triggers a delete prompt — it stays in the list
  badged `Offline`, its sessions stay visible but disabled, and every
  round-trip action is disabled until the server answers again.
- ✅ Notifications per server: opt-out toggle in Settings, persisted in
  `localStorage`, honoured by `useEventNotifications` (Settings stays the
  master switch).
- ✅ Iconify icons (`src/components/Icon.tsx`, no inline SVGs), GitHub link
  (header + footer → `https://github.com/all-the-rest/opencode-pwa`).
- ❌ Real terminal, push notifications, server-side rendering: out of scope
  (static-only invariant, see `features/01-architecture.md`).
