# 04 - Projects and Session Grouping

## Source

- `GET /api/project` via `@opencode/client` (`project.list()`, verified against
  the installed package: `project: { list, update }`). Fallback is a direct
  `fetch("{baseUrl}/api/project")` with the Basic Auth header.
- Wrapper: `listProjects(server)` in `src/lib/opencode.ts`, returning
  `ApiResult<ProjectInfo[]>` with `{ id, name }` per project.

## Session Grouping

- Sessions carry their project key in `projectID` (V2 `SessionInfo.projectID`);
  older/alternate shapes may use `projectId` or `directory`.
- `sessionProjectKey(entry)` reads those fields tolerantly (first non-empty
  wins, otherwise null). `extractSessionRows` keeps `{ id, label, projectKey }`
  per session without `any` casts.
- `groupSessionsByProject(sessions, projects)` groups by key, falls back to
  "Ohne Projekt" for sessions without a key, labels known groups with the
  project name and unknown keys with the raw key. Order: project list order
  first, then alphabetical.

## UI

- Server detail (`/servers/:id`) loads projects alongside sessions/shells/ptys
  and renders sessions grouped under per-project headings
  (`{label} ({count})`); a separate Projekte card lists all projects.
- Dashboard stats include the project count ("Projekte").
- All extraction is tolerant: missing fields degrade to generated ids/labels,
  never to crashes.
