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
| List messages | `GET /api/session/:sessionID/message` | `message.list({ sessionID })` | read-only MVP |
| List shells   | `GET /api/shell`  | `shell.list()`         | returns `{ location, data }`   |
| Shell output  | `GET /api/shell/:id/output` | `shell.output({ id, cursor? })` | returns `{ location, data: { output, cursor, size, truncated } }` |
| Create shell  | `POST /api/shell` | `shell.create({ command })` | minimal create form on server page |
| Remove shell  | `DELETE /api/shell/:id` | `shell.remove({ id })` | verified (`method: "DELETE"`, 204); aborts + removes |
| List ptys     | `GET /api/pty`    | `pty.list()`           | returns `{ location, data }`   |
| PTY connect token | `POST /api/pty/:ptyID/connect-token` | `pty.connect.token({ ptyID })` | returns `{ location, data: { ticket, expires_in } }`; raw body (no unwrap); no in-app terminal yet (see `features/05-parity.md`) |
| List agents   | `GET /api/agent`  | `agent.list()`         | dashboard count + session filter |
| List projects | `GET /api/project` | `project.list()`      | project grouping + dashboard count (direct-fetch fallback with Basic header) |
| Events        | `GET /api/event`  | `event.subscribe()`    | SSE AsyncIterable stream       |

## Error Handling

- Wrappers in `src/lib/opencode.ts` catch all failures and return `{ data: null, error }`.
- UI treats `error != null` as "server offline or unreachable" and stays usable.
- `subscribeEvents(server, signal)` is an async generator; callers abort via AbortSignal.
