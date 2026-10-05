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
- ❌ Model/agent picker per session (`session.switchAgent/switchModel`, `model.list`, `agent.list` read-only count only).
- ❌ Fork/compact/revert/share, session stats, diff view, file attachments in prompts.

## Shells & Tasks

- ✅ List always visible with counts (dashboard badge + server card), live refresh (5s poll + event-hub).
- ✅ Live output (`GET /api/shell/{id}/output`), create (`POST /api/shell`), remove (`DELETE /api/shell/{id}`) with confirm.
- ❌ Streaming output (one fetch per open; no tail-poll yet).

## PTY / Terminal (decision)

- 🚧 List + per-PTY connect-token request (`GET /api/pty/{id}/connect-token`, ticket shown for external terminal clients).
- ❌ In-app terminal rendering: deliberately deferred. Rendering a
  terminal needs an xterm-compatible emulator plus a WebSocket/ticket
  attach flow, which is too big for the W2 MVP and duplicates external
  terminals. The token flow is kept so nothing blocks it later
  (see `features/02-api-contract.md`). Decision recorded here per W2 scope.

## Projects, Agents, Models

- ✅ Projects listed + counted, sessions grouped/filtered by project.
- 🚧 Agents: counted on dashboard, usable as session filter; no picker/detail.
- ❌ Models/providers: not surfaced yet.

## Files, VCS, Worktrees

- ❌ File browser/read/write (`file.*`), VCS status/diff (`vcs.*`),
  worktrees (`worktree.*`), commands/skills (`command.*`, `skill.*`),
  MCP/integrations, permissions UI, config editing, websearch, forms.
  All are post-MVP: the V2 API supports them, the PWA shows their
  effects (sessions/messages) but does not manage them yet.

## App-Level

- ✅ Multi-server with Basic Auth, offline-tolerant UI, local notifications.
- ✅ Iconify icons (`src/components/Icon.tsx`, no inline SVGs), GitHub link
  (header + footer → `https://github.com/all-the-rest/opencode-pwa`).
- ❌ Real terminal, push notifications, server-side rendering: out of scope
  (static-only invariant, see `features/01-architecture.md`).
