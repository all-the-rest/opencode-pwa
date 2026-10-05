# 01 - Architecture

## Multi-Server

- The app manages N Opencode servers. Each server: `{ id, name, baseUrl, username, password }`.
- Server list lives in React context (`src/state/servers.tsx`), persisted to
  `localStorage` key `opencode-pwa:servers`.
- A header dropdown selects the active server. Detail pages resolve the server from the
  route (`/servers/:id`) or the `?server=` query param (`/sessions/:id`).

## Single User per Server

- Exactly one Basic Auth credential pair per server. Sent as
  `Authorization: Basic base64(user:pass)` on every request via `makeClient(server)`.
- No roles, no teams, no sharing in MVP.

## Client-Side Only, No Backend

- Static Vite build. No server code, no proxy, no BFF.
- The browser talks directly to each Opencode server's V2 HTTP API (CORS must allow it).
- Offline/errors are first-class: every API helper returns `{ data, error }`, pages show
  warning banners instead of crashing.
- PWA service worker caches the app shell; API data is not cached (network-only).

## Routing

- `/` dashboard: server list + active server status (version, session/agent counts).
- `/servers/:id`: sessions + shells + ptys of that server.
- `/sessions/:id`: message list, read-only prompt box (MVP).
- `/settings`: add/edit/remove servers.
