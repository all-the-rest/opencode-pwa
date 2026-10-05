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
- PWA service worker caches the app shell; session messages are cached
  cache-first in IndexedDB (`src/lib/messageCache.ts`, key
  `serverID:sessionID:messageID`, newest ~200 per session with eviction).
  `SessionDetail` renders from the cache first, merges the network result,
  and pages newest-first with infinite scroll (`useSessionMessages` +
  IntersectionObserver).

## Routing

- `/` dashboard: server list + active server status (version, session/agent/project counts).
- `/servers/:id`: projects + sessions (grouped by project) + shells + ptys of that server.
- `/sessions/:id`: message list, read-only prompt box (MVP).
- `/settings`: add/edit/remove servers, notification permission.

## Static-Only Invariant (STRICT)

- No backend, no server code, no proxy, no BFF. The only runtime environment
  input is build-time `VITE_*` variables (e.g. `VITE_DEFAULT_SERVER_URL`);
  there is no runtime config, no secret injection, no server-side rendering.
- Once built, `dist/` is deployed to any static host (GitHub Pages, Netlify,
  nginx, plain file hosting). The browser talks directly to each Opencode
  server's V2 HTTP API.
- CORS note: each Opencode server must allow the PWA origin (the static host
  origin), otherwise the browser blocks API calls. There is deliberately no
  same-origin proxy to work around this.
- `vite.config.ts` intentionally keeps the default `base` (no `base: "./"`):
  a sub-path deployment (e.g. GitHub Pages `/repo/`) is a deploy-time concern
  and is configured per deployment, not baked into the repo default.

## Local Notifications (No Push Server)

- Session/compaction/permission events from `GET /api/event` (SSE, exactly
  one shared stream per server via `src/lib/eventHub.ts`: backoff reconnect,
  AbortController cleanup when the last listener leaves or the server config
  changes) are mapped to local notifications
  through the `Notification` API only (`src/lib/notify.ts`, hook
  `src/hooks/useEventNotifications.ts`, mounted in `Layout`). Incoming
  session-message events are also written to the IndexedDB message cache in
  the background, so open sessions update live while offline history stays
  available.
- Permission is requested explicitly in Settings ("Benachrichtigungen
  aktivieren"); the status badge shows granted/denied/default.
- Non-important events notify only when the document is hidden; important
  events (permission requests, execution/compaction failures) always notify.
- No service-worker push, no push subscription, no server-side code.
