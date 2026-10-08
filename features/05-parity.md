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
- ✅ Revert/share on SessionDetail: staged revert (`POST
  /api/session/{id}/revert/stage {messageID}` → commit with a German confirm
  dialog / discard via `DELETE /api/session/{id}/revert`; commit is a bare POST,
  the endpoint declares `empty: true`), plus export/import share (`GET
  /api/experimental/session/{id}/export` shown as JSON with file download,
  import from file or pasted JSON via `POST /api/experimental/session/import`;
  an optional export `location` passes through so re-imports keep working).
- ✅ Commands in the session (`GET /api/command` listed read-only on
  Server-Werkzeuge, run in the session via `POST /api/session/{id}/command
  {name, text}`) + skills list (`GET /api/skill`, read-only overview).
- ✅ Websearch on Server-Werkzeuge: providers from `GET /api/websearch/provider`
  (select, "Automatisch" = server default), search via `POST /api/websearch
  {query, providerID?}`, hits as links with snippet, answering provider shown.
- ✅ Session inbox on SessionDetail (queued entries from `GET
  /api/session/{id}/inbox` with kind badge + delivery badge): delivery change
  via `PATCH /api/session/{id}/inbox/{inboxID} {delivery: "steer"|"queue"}`
  ("Sofort"/"Warten"), cancel via `DELETE .../inbox/{inboxID}`. Answering
  happens through forms/permissions — the inbox itself is never a reply box.
- ✅ Pending forms overview on SessionDetail (`GET /api/session/{id}/form`):
  select a form, paste the answer as a JSON object (validated client-side:
  Text/Zahl/Ja-Nein/Textliste pro Feld), reply via `POST .../form/{formID}/reply
  {answer}`, reject via `DELETE .../form/{formID}`.
- ✅ Feedback policy: every session write answers with a toast
  (`src/state/toast.tsx`, rendered by `src/components/Toasts.tsx`) instead of an
  inline alert box — fork, interrupt, delete, compact, revert stage/commit/
  discard, export/import, command run, form reply/reject and the permission
  reply on Server-Werkzeuge all raise a success or error toast. The blocking
  `ConfirmDialog` only *asks*; once the action is confirmed the dialog closes
  and the outcome becomes a toast, so the same rule applies everywhere. This
  matters for stacking too: daisyUI's `.modal` sits at `z-index: 999` and the
  toast stack at `z-50`, so a toast raised while the dialog is still open would
  be invisible — closing first is what makes the toast readable.
- ✅ Offline policy covers the new writes: `session-revert`, `session-export`,
  `session-import`, `session-command`, `session-inbox`, `session-inbox-cancel`,
  `session-inbox-update`, `session-form-list`, `session-form-reply`,
  `session-form-cancel`, `command-list`, `skill-list`, `websearch-providers`,
  `websearch-query` are all blocked while offline (`src/lib/offline.ts`).
- Covered by `src/lib/parity3.test.ts` (extractors + fallback-fetch paths with
  a throwing client, so every URL/method/body is pinned) and E2E
  `tests/e2e/w8-parity3.spec.ts` (`@feature` for revert flow, command run,
  websearch, command/skill lists, inbox cancel + delivery, form reply),
  plus `tests/e2e/w14-toast-empty-title.spec.ts` (`@feature` for the fork
  success toast, the empty-list starter CTA on both pages and the blocked
  title reset).
- ✅ Empty session lists on ServerDetail and ProjectDetail carry a starter CTA
  into the session starter (`/`) instead of a bare "Keine Sessions." note. The
  note stays for the filtered-empty case (a search or filter that matches
  nothing) — no CTA there, because the fix is to widen the filter, not to open
  the starter.
- ❌ Title reset (back to the generated server default) is **blocked**: there
  is no API path. Verified against a live Opencode server —
  `PATCH /api/session/{id}` accepts `title: ""`, `title: null` and a body
  without `title` (always `204`, `title: 123` is the only rejected shape, `400
  "Expected string | null"`), but in all three accepted cases the **stored
  title stays untouched**; a fresh session stays untitled. So a title once set
  on the server cannot be cleared, and `sessionTitle()` (the client-side
  fallback to the session id for generated placeholders) is the only way a
  "default" shows. The rename UI therefore ships "Titel zurücksetzen" as a
  deliberately disabled button with the reason in its tooltip; the mechanics
  are recorded in `features/02-api-contract.md`.

## Shells & Tasks

- ✅ List always visible with counts (dashboard badge + server card), live refresh (5s poll + event-hub).
- ✅ Live output (`GET /api/shell/{id}/output`), create (`POST /api/shell`), remove (`DELETE /api/shell/{id}`) with confirm.
- ✅ Tail-polled output (`src/hooks/useShellOutputStream.ts`): initial fetch,
  then cursor-paged poll every 2s while the panel is open, stops on
  collapse/unmount, `Live` badge while tailing.

## PTY / Terminal (read-only)

- ✅ List (`GET /api/pty`) + per-PTY connect-token request
  (`POST /api/pty/{id}/connect-token`, ticket shown for external terminal
  clients).
- ✅ Read-only session terminal on SessionDetail
  (`GET /api/experimental/session/{sessionID}/terminal/read`, verified in the
  installed client package as `experimental.persistentPty.read`): screen text
  in a `<pre>` with manual refresh, `null` (no terminal attached) shown as
  "Kein Terminal". No emulator, no input, no xterm dependency — the bundle
  stays lean on purpose.
- ❌ Deliberately out: interactive terminal (needs an xterm-compatible
  emulator plus a WebSocket/ticket attach flow, duplicates external
  terminals) and `pty.snapshot`
  (`GET /api/experimental/persistent-pty/{ptyID}/snapshot`) — it needs a
  persistent-PTY id, which no list endpoint hands out in a static-friendly
  way; the per-session `terminal/read` above is the static-friendly read
  path. Decision recorded here per W2 scope.
- ✅ Offline policy covers the read: `terminal-read` is blocked while offline
  (`src/lib/offline.ts`).
- Covered by `src/lib/parity4.test.ts` (extractor + fallback-fetch path with
  a throwing client, so URL/method are pinned).

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

## Integrations (Server-Werkzeuge)

- ✅ List (`GET /api/integration`) with connection count and "Anmeldung
  nötig" badge, detail per integration (`GET /api/integration/{id}`) with
  methods and connections (`src/components/IntegrationsCard.tsx`).
- ✅ Key-based connect (`POST /api/integration/{id}/connect/key
  {key, label?, answer?}`): key in a password field, optional label, optional
  method answers as a validated JSON object (same Text/Zahl/Ja-Nein/Textliste
  rule as session forms).
- ✅ OAuth begin + status, read-only
  (`POST /api/integration/{id}/connect/oauth {methodID, label?}` →
  attempt URL + instructions as an external link,
  `GET .../connect/oauth/{attemptID}` → wartet/abgeschlossen/fehlgeschlagen/
  abgelaufen with a "Status prüfen" button). Limitation, shown in the UI: the
  provider redirect leaves the static app, so there is no redirect handling —
  the user finishes the login on the provider page and the app only polls the
  attempt state. No `complete`/`cancel`, no `command` connect flow.
- ✅ Offline policy covers the flows: `integration-list`,
  `integration-detail`, `integration-connect-key`, `integration-oauth` are all
  blocked while offline (`src/lib/offline.ts`).
- Covered by `src/lib/parity4.test.ts` (extractors + fallback-fetch paths with
  a throwing client, so every URL/method/body is pinned) and E2E
  `tests/e2e/w9-parity4.spec.ts` (`@feature:integration` for list + detail +
  key connect, `@feature:integration-oauth` for begin + status poll).

## Config (Server-Werkzeuge, read-only)

- ✅ Config viewer (`GET /api/config` → path, shell, model, default agent,
  update/share per document) plus available shells
  (`GET /api/config/shell` → path, name, geeignet/ungeeignet badge)
  (`src/components/ConfigCard.tsx`).
- ❌ No global-config writes: `config.update`
  (`PATCH /api/experimental/config`) is deliberately absent — the global
  configuration stays with the server. Stated in the UI card.
- ✅ Offline policy covers the reads: `config-view`, `config-shells` are
  blocked while offline (`src/lib/offline.ts`).
- Covered by `src/lib/parity4.test.ts` and E2E `tests/e2e/w9-parity4.spec.ts`
  (`@feature:config` for entries + shells with route mocks).

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

## Server Rename (local label, optional project write-through)

- Server entries are client-side only: `name` is a local label in
  `localStorage`, there is no server-side "server" resource to rename. The
  inline rename on `/servers/:id` therefore always updates just the stored
  entry (`updateServer`), never the server itself.
- The V2 API does have a project rename: `PATCH /api/project/{projectID}`
  with `{ name }` (verified in the installed `@opencode/client`:
  `project.update({ projectID, name })`, `dist/promise/generated/client.js`).
  Wired up as `updateProjectName` in `src/lib/opencode.ts` (client call +
  direct-fetch fallback pinning the same method/path/body).
- Write-through rule: when the server has **exactly one** project, the rename
  flow offers to rename that project on the server as well — behind a German
  confirm dialog and the offline guard (`project-rename` is blocked while
  offline, `src/lib/offline.ts`). The local rename happens first and always;
  the confirm only controls the remote side effect.
- Why not otherwise: with **zero** projects there is nothing to rename; with
  **more than one** project there is no unambiguous mapping — the app never
  guesses which project a server label refers to, so the rename stays
  local-only. No endpoint is invented for this; the only project-write
  endpoint used is the verified `PATCH /api/project/{projectID}`.
- Covered by E2E `tests/e2e/server-tabs.spec.ts` (`@feature:server-tabs`:
  one-project confirm + PATCH, multi-project local-only).

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
- ❌ Full interactive terminal, push notifications, server-side rendering: out
  of scope (static-only invariant, see `features/01-architecture.md`). The
  session terminal is read-only (screen text, no input).
