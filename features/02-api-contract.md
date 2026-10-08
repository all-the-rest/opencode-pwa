# 02 - API Contract (Opencode V2)

Base: `{baseUrl}/api`. Auth: `Authorization: Basic base64(user:pass)` per server.

Client: `@opencode/client` promise entrypoint, `OpenCode.make({ baseUrl, headers })`.

## Endpoints Used

| Purpose       | HTTP              | Client call            | Notes                          |
| ------------- | ----------------- | ---------------------- | ------------------------------ |
| Server info   | `GET /api/info`   | `server.info()`        | version, pid, urls             |
| List sessions | `GET /api/session`| `session.list()` / `session.list({ limit, cursor, project, search })` | returns `{ data, cursor }`; paged wrapper is `listSessionsPaged` |
| Send prompt   | `POST /api/session/:sessionID/prompt` | `session.prompt({ sessionID, text })` | optimistic insert, echo replaces temp entry |
| Interrupt session | `POST /api/session/:sessionID/interrupt` | `session.interrupt({ sessionID })` | verified in installed client (`method: "POST"`) |
| Remove session | `DELETE /api/session/:sessionID` | `session.remove({ sessionID })` | verified (`method: "DELETE"`, 204) |
| Rename session | `PATCH /api/session/:sessionID` | `session.update({ sessionID, title })` | `title` is optional in the client types; see "Session title semantics" below |
| List messages | `GET /api/session/:sessionID/message` | `message.list({ sessionID })` | read-only MVP |
| List shells   | `GET /api/shell`  | `shell.list()`         | returns `{ location, data }`   |
| Shell output  | `GET /api/shell/:id/output` | `shell.output({ id, cursor? })` | returns `{ location, data: { output, cursor, size, truncated } }` |
| Create shell  | `POST /api/shell` | `shell.create({ command })` | minimal create form on server page |
| Remove shell  | `DELETE /api/shell/:id` | `shell.remove({ id })` | verified (`method: "DELETE"`, 204); aborts + removes |
| List ptys     | `GET /api/pty`    | `pty.list()`           | returns `{ location, data }`   |
| PTY connect token | `POST /api/pty/:ptyID/connect-token` | `pty.connect.token({ ptyID })` | returns `{ location, data: { ticket, expires_in } }`; raw body (no unwrap); no in-app terminal yet (see `features/05-parity.md`) |
| List agents   | `GET /api/agent`  | `agent.list()`         | dashboard count + session filter |
| List projects | `GET /api/project` | `project.list()`      | project grouping + dashboard count (direct-fetch fallback with Basic header); `vcs`/`canonical` feed the diff empty states |
| Session diff  | `GET /api/session/:sessionID/diff` | `session.diff({ sessionID })` | one `FileDiffInfo` row per changed file (`file`, `patch`, `additions`, `deletions`, `status`); rendered by `src/lib/diffView.ts` |
| Init git repo | `POST /api/vcs/init` | `vcs.init({ location })` | 204/empty; the "Kein Git-Repository" empty state of the diff surface offers it (German confirm + `vcs-init` offline guard) |
| List files    | `GET /api/fs/list?path=` | `file.list({ path? })` | server tools, read-only browser; rows via `extractFileEntries` |
| Read file     | `GET /api/fs/read/:path` | `file.read({ path })` | binary `Uint8Array`, decoded + capped by `decodeFileContent` |
| VCS status    | `GET /api/vcs/status` | `vcs.status()`     | changed files, rows via `extractVcsStatus` |
| List worktrees| `GET /api/worktree?projectID=` | `worktree.list({ projectID })` | per project, rows via `extractWorktrees` |
| List MCP      | `GET /api/mcp`    | `mcp.list()`         | rows via `extractMcpServers` (`status` is a nested object) |
| Pending permissions | `GET /api/permission/request` | `permission.request.list()` | rows via `extractPermissionRequests` |
| Answer permission | `POST /api/session/:sessionID/permission/:requestID/reply` | `permission.reply({ sessionID, requestID, decision })` | `decision: "once"` (allow once) or `"reject"` (deny); `"always"` deliberately unused |
| Events        | `GET /api/event`  | `event.subscribe()`    | SSE AsyncIterable stream       |

## Session title semantics (`session.update`)

Measured against a live Opencode `serve` instance (PATCH → GET, one session):

| Request body            | Status | Stored title afterwards |
| ----------------------- | ------ | ----------------------- |
| `{ "title": "Neu" }`    | 204    | `"Neu"`                 |
| `{ "title": "" }`       | 204    | unchanged               |
| `{ "title": null }`     | 204    | unchanged               |
| `{}` (no `title`)       | 204    | unchanged               |
| `{ "title": "   " }`    | 204    | `"   "` (verbatim)      |
| `{ "title": 123 }`      | 400    | `Expected string \| null at ["title"]` |

So the endpoint **never errors on an empty title — it silently drops it**. There
is no request that clears a title once set, and no endpoint that returns a
session to its generated default (`New session - <ISO>`), which the server only
mints at creation time. Consequences for this app:

- `renameSession(server, id, title)` only ever sends a non-empty trimmed title
  (see `handleRename` in `src/pages/SessionDetail.tsx`).
- "Titel zurücksetzen" exists in the rename UI but stays disabled, with the
  reason in its tooltip — a no-op request would only look like it worked.
- `sessionTitle()` in `src/lib/opencode.ts` is the client-side half of the
  "default": generated placeholders never surface, they fall back to the id.
- `title` and `metadata.title` are separate stores; writing one leaves the
  other alone, and only `title` drives the displayed label.

## Auth & Credentials

- `Authorization: Basic base64(user:pass)` per server. The password is not part of
  `ServerConfig` any more: `makeClient(server)` is async and resolves it through
  `getDecryptedConfig(server)` / the credential vault (see `features/01-architecture.md`).
  The direct-fetch fallbacks use the same `fetchAuthHeaders(server)`. They run
  only when the client method throws; the `listAgents` fallback path is unit
  covered in `src/lib/opencode.test.ts` (client throw → fetch path, fetch
  failure surfaces the status, client success never fetches) as the
  representative for the shared try/catch-fetch pattern.

## Error Handling

- Wrappers in `src/lib/opencode.ts` catch all failures and return `{ data: null, error }`.
- UI treats `error != null` as "server offline or unreachable" and stays usable.
- `subscribeEvents(server, signal)` is an async generator; callers abort via AbortSignal.
- Every API helper takes a `ServerConfig` (no password) and resolves the credential
  itself, so a missing vault entry surfaces as a normal API error, not a crash.
