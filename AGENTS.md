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
