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

## Navigation (Owner-Entscheidung 2026-10-07)

- Projekte haben Priorität: die Sidebar listet zuerst Projekte, dann neueste
  Sessions (`src/components/SidebarProjects.tsx`); auf der Serverdetailseite
  steht die Projekte-Karte in der DOM-Reihenfolge an erster Stelle.
- Jede Projekt-Klick führt auf eine eigene Seite mit eigener SPA-Route:
  `/servers/:serverId/projects/:projectId`. Suche (`?search=`) und
  Agent-Filter (`?agent=`) leben in den Query-Params, damit URLs teilbar und
  deeplink-fähig bleiben. Die Serverdetail-Filter (`?search=`, `?agent=`,
  `?project=`) folgen derselben Regel; Paging-Cursor bleiben lokaler State.
- Die Session-Ansicht läuft immer über Tabs (`SessionTabBar`, immer
  gerendert) mit Plus-Button (`+ Neu` → `/`). Die Startseite (`/`) zeigt den
  Session-Starter (`src/components/SessionStarter.tsx`, neueste Sessions +
  offene Tabs) als Fallback bei nichts Offenem.
- Sessions öffnen überall per `?server=`-Muster (`/sessions/:id?server=…`);
  Projektseiten nutzen die Server-ID im Pfad (eindeutig je Server).
- Zuschau-Bereich für Subagenten-Aktivität: Dashboard-Karte
  „Subagenten-Aktivität“ (Sessions je Agent, Links filtern die Server-Seite
  per `?agent=`). Live-Fortschritt einzelner Agenten (Token-Streams,
  Tool-Calls in Echtzeit) bleibt eine dokumentierte Lücke: sichtbar sind nur
  aggregierte Zähler aus `session.list`, kein Streaming-Inspector.
- Routen-Regel (Owner 2026-10-07): so viel wie sinnvoll in den Pfad, Rest in
  Query-Params. `+ Neu` führt zum Starter (kein Deep-Link auf Server-Seite).

## Display Name, Path Tree, Creation (Owner-Entscheidung Welle 7)

- **Rename**: `PATCH /api/project/{projectID}` with `{ name }` and optional
  `icon: { color }` (wrapper `updateProject`, `src/lib/opencode.ts`; optimistic
  path `useProjectRename` + `ProjectRenameForm`). `projectTreeLabel` decides
  what a list shows: a custom name wins, a still-path-like name collapses to
  its basename. `project.updated` (event payload carries the full project)
  syncs a rename from elsewhere live (`useProjectSync`).
- **Tree**: `buildProjectTree` (`src/lib/projectTree.ts`) groups projects by
  the prefixes of `Project.canonical`. Rendered as a tree when there are
  several roots or a project is the parent of another project; otherwise the
  flat list stays (a single common root adds nothing). Projects without a
  path-like canonical are always flat rows. Documentation + evaluation in
  `features/05-parity.md` („Projekt-Displayname + Ordner-Baum + Projekt
  anlegen (Welle 7)").
- **Chain compression + duplicates** (owner ask, wave 8): a folder that holds
  no project of its own and has exactly one child folds into that child, so
  `/home/dev/.cache/octest/live` is ONE row (`.cache/octest/live`) instead of
  three. A compressed chain is auto-expanded (nothing starts collapsed) and
  carries its chevron only where it branches again; a folder with a project of
  its own, or with 2+ children, stays a collapsible tree node. Duplicate
  canonical paths collapse to the entry with the newest
  `time.active`/`time.updated` (`dedupeProjectPaths`, `projectRecency`).
  Unit tests: `src/lib/projectTree.test.ts` (the owner's live payload), E2E
  `@feature:project-tree`, screenshot route `server-project-tree`.
- **New project**: there is no create endpoint for projects in the installed
  client (`project: { list, update }`). The server folder picker
  (`ServerFolderPicker`) browses `file.list` (wrapper `listDirectory`, which
  also resolves `location.directory` for the breadcrumb) and confirms with
  `session.create({ location: { directory } })` — the server derives the
  project from the session's directory, exactly like in the original GUI.

## Hide Projects Without Sessions (Owner-Entscheidung Welle 9)

- A server lists every directory it ever saw as a project (measured on the
  owner's live server: 23 projects, 10 without a single session). Projects with
  zero sessions are therefore hidden by default in EVERY project list.
- **One persisted flag** (`src/hooks/useShowEmptyProjects.ts`):
  `localStorage["opencode-pwa:projects-hide-empty"]`. Only an explicit `"0"`
  (the user turned the filter off) shows them again; a missing or unreadable
  value means "hide". The server page's projects card owns the toggle
  (`ProjectEmptyFilter`, `data-testid="projects-empty-filter"`); every other
  view only READS the flag and renders no control of its own.
- **Rule**: `sessionProjectKeys(rows)` collects the project keys of the loaded
  session rows; `filterProjectsBySessions` / `filterProjectTree`
  (`src/lib/projectTree.ts`) drop everything else. No list issues a second
  session request — each view uses the rows it already holds.
- **Sidebar** (`src/components/SidebarProjects.tsx`) follows the same rule with
  the rows of its own "Neueste Sessions" list (one page, 15 newest). While
  those rows have not resolved the filter is NOT applied (zero sessions is then
  what is known, not what is true), so no project row flashes away on load. A
  failed fetch keeps the rows that are already on screen, exactly like the
  server page.
- Caveat (both views): "has sessions" is read from one cursor page of sessions,
  so a project whose only sessions sit on a later page looks empty until more
  rows are loaded.
- Unit tests: `src/hooks/useShowEmptyProjects.test.tsx`,
  `src/components/SidebarProjects.test.tsx`; the server page's cases (tree,
  flat list, persistence, counter) live in `src/pages/ServerDetail.test.tsx`.
