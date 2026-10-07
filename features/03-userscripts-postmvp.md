# 03 - Userscripts (Post-MVP Idea, Deferred)

## Idea

- Userscripts: small user-defined scripts/snippets stored **per server** (server-side),
  executable from the PWA against that server's Opencode API.
- Example: "restart stack", "summarize session", "run checks".

## Why Deferred

- MVP is read-only (list servers/sessions/shells/ptys/messages). No mutation endpoints
  are wired yet, no script storage exists on the server side.
- Requires design decisions: storage location, execution sandbox, auth scope, audit log.

## Rough Shape (MVP+1 and later)

1. MVP+1: send prompt from session page (`session.prompt`), still no scripts.
2. Later: server-stored script catalog (CRUD against a future server endpoint or a
   well-known project path), run action wired to `session.prompt` or `shell.create`.
3. Even later: share/export scripts, per-script confirmation policy.

Not implemented. Keep this file as the idea backlog.

## Verdict 2026-10-07 (static-only → not feasible)

Verified against `@opencode/client@2.0.23`: no server endpoint for user-script
CRUD (`command.list`/`skill.list` are read-only, no `script`/`snippet`/
`template` methods). Server-stored scripts would need server-side support
(plugin/backend) – incompatible with the static-only goal. Stays backlog
unless the Opencode API gains a script store.
