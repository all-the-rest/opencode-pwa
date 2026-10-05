# 02 - API Contract (Opencode V2)

Base: `{baseUrl}/api`. Auth: `Authorization: Basic base64(user:pass)` per server.

Client: `@opencode/client` promise entrypoint, `OpenCode.make({ baseUrl, headers })`.

## Endpoints Used

| Purpose       | HTTP              | Client call            | Notes                          |
| ------------- | ----------------- | ---------------------- | ------------------------------ |
| Server info   | `GET /api/info`   | `server.info()`        | version, pid, urls             |
| List sessions | `GET /api/session`| `session.list()`       | returns `{ data, cursor }`     |
| List messages | `GET /api/session/:sessionID/message` | `message.list({ sessionID })` | read-only MVP |
| List shells   | `GET /api/shell`  | `shell.list()`         | returns `{ location, data }`   |
| List ptys     | `GET /api/pty`    | `pty.list()`           | returns `{ location, data }`   |
| List agents   | `GET /api/agent`  | `agent.list()`         | dashboard count                |
| List projects | `GET /api/project` | `project.list()`      | project grouping + dashboard count (direct-fetch fallback with Basic header) |
| Events        | `GET /api/event`  | `event.subscribe()`    | SSE AsyncIterable stream       |

## Error Handling

- Wrappers in `src/lib/opencode.ts` catch all failures and return `{ data: null, error }`.
- UI treats `error != null` as "server offline or unreachable" and stays usable.
- `subscribeEvents(server, signal)` is an async generator; callers abort via AbortSignal.
