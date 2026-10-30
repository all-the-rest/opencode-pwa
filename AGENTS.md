# AGENTS.md

- Language: code and docs in English, UI strings in German.
- DoD: every change ships tests - vitest unit tests and/or playwright E2E.
- Quality gates before commit: `pnpm lint:fix` (zero warnings) and `pnpm build` pass.
- Docs: `features/` is the SOLL (target state), `AGENTS.todo.md` holds the open tasks.
- E2E tagging: `@smoke` (app boot + nav), `@regression`, `@feature`. Smoke runs via
  `pnpm test:e2e:smoke`.
- Build-agent rule: the orchestrator owns commits and `codegraph init`. Build agents
  implement only and never commit.
- Subagent questions surface to the user: implementers must return open
  decisions as explicit questions; the orchestrator asks them via the
  question tool instead of deciding silently or burying them in reports.
- Rules only, no decisions: this file holds rules only - instructions that apply to
  any work in this repo. Durable decisions, rationale, measurements and history do not
  belong here; they go into `docs/`/`features/` (the project docs), open items into
  `AGENTS.todo.md`, and completed work into the git history.

## Gates

Regeln dieser Ebene. Was nur ein Verzeichnis betrifft, gehört in die
`AGENTS.md` **dieses** Verzeichnisses — sie wird geladen, wenn eine Datei
daraus gelesen wird.

Ein Plan in `docs/plans/` beginnt mit `**Status:** Plan | In Arbeit | Done |
Empfehlung, nicht implementiert`.

Die kanonischen Agent-Regeln laufen über `ratchet` (Preset `agent-rules`):
`ratchet check` vor jedem Commit und in der CI.
