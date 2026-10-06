# 01 - Architecture

## Multi-Server

- The app manages N Opencode servers. Each server: `{ id, name, baseUrl, username }`
  (`ServerConfig`) — **no password**. The password lives encrypted in the
  credential vault (see below).
- Server list lives in React context (`src/state/servers.tsx`), persisted to
  `localStorage` key `opencode-pwa:servers` (identity + endpoint + username).
- A header dropdown selects the active server. Detail pages resolve the server from the
  route (`/servers/:id`, `/servers/:id/tools`) or the `?server=` query param
  (`/sessions/:id`).

## Single User per Server

- Exactly one Basic Auth credential pair per server. The password is opened from the
  vault per request and sent as `Authorization: Basic base64(user:pass)`; `makeClient`
  is therefore async.
- No roles, no teams, no sharing in MVP.

## Credential Vault

- `src/lib/credentialVault.ts`: one random AES-GCM-256 data encryption key (DEK) per
  install, stored in IndexedDB (`opencode-pwa-credential-vault` / store `entries` /
  row `dek`) as a **non-extractable** `CryptoKey`. Passwords are sealed per entry with
  a fresh random 96-bit IV (row `secret:<serverID>`, IV + ciphertext side by side).
- Invariant: a password is never written to `localStorage` or any other plaintext
  store. Legacy entries with a `password` field are migrated transparently on the
  first load (registered synchronously during the first render) and the persisted
  server list — password-free — replaces them.
- Readers go through `whenVaultReady()` (`readCredential`), which also awaits a
  running startup migration; so a first paint after an app update still
  authenticates. `credentialRevision(serverID)` lets consumers (the event hub)
  notice a changed password without ever seeing it.
- Fallback without WebCrypto or IndexedDB: session-only in-memory credentials
  (never persisted) + a German notice in Settings. `ServerProvider` exposes this as
  `credentialStorage: "persistent" | "memory" | null`.
- Storage is behind the `VaultStorage` interface, so tests inject an in-memory backend
  (`setVaultStorageForTests`) instead of needing IndexedDB.

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

## PWA, Icons & Offline-Strategie

- Icons: `public/pwa-icon.svg` ist die Quelle (dunkles Terminal-Motiv `>_`).
  `scripts/generate-pwa-icons.mjs` (nur Node-Builtins, kein neuer Dep)
  rastert daraus `pwa-192x192.png` + `pwa-512x512.png` (`purpose: any`) und
  `pwa-maskable-512x512.png` (`purpose: maskable`, Safe-Zone-Padding, damit
  OS-Masken die Glyphe nie beschneiden).
- App-Shell offline: Workbox `navigateFallback: "index.html"` in
  `vite.config.ts`; `globPatterns` cacht JS/CSS/HTML/PNG/SVG, also bootet die
  Shell ohne Netz. API bleibt network-only (`runtimeCaching` Handler
  `NetworkOnly` auf `/api/*`): keine HTTP-Caches für Live-Daten.
- Nachrichten-Cache statt API-Cache: `useSessionMessages` liest zuerst
  IndexedDB (`src/lib/messageCache.ts`, Key `serverID:sessionID:messageID`,
  neueste ~200/Session mit Eviction), merged dann das Netz-Ergebnis und zeigt
  bei Netzfehlern den `offline-cache`-Banner. Dashboard/ServerDetail zeigen
  Warnbanner (`Server offline oder nicht erreichbar`) statt zu crashen.

## Routing

- `/` dashboard: server list + active server status (version, session/agent/project counts).
- `/servers/:id`: projects + sessions (grouped by project) + shells + ptys of that server.
- `/servers/:id/tools`: "Server-Werkzeuge" — file browser (read-only), VCS status,
  worktrees, MCP servers, pending permissions (allow once / deny).
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
