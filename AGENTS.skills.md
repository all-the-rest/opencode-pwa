# Skills-Marker

agents-skills-consumed: b0eafee
geprüft am: 2026-10-05

## Skill-Stand

| Skill | angewendet? | wo im Projekt | offene Position |
|---|---|---|---|
| codegraph-project-setup | ja | `.codegraph/.gitignore`, `.githooks/pre-commit` | |
| build-verify | ja | `AGENTS.md:6` (lint:fix + build gates) | |
| playwright-parallel | nein | | Projekt hat 2 Specs, keine Parallel-Probleme; siehe `AGENTS.todo.md` ui-review |
| ui-review | nein | | offen: `AGENTS.todo.md` ui-review loop über alle Routen |
| skills-marker | ja | `AGENTS.skills.md` | |

## Offen aus dem Bereich `<alter-sha>..<neuer-sha>`

_Kein Vor-Stand: bei einem neu angelegten Projekt gibt es keine Range, weil noch nichts geprüft werden musste. Dieser Abschnitt wird beim ersten Pull im Skills-Repo angelegt._

## Fortschreiben

1. `agents-skills-consumed` ablesen → `<alt>`.
2. Im Skills-Repo die Range bilden:
   `git -C /projects/agents-skills log --oneline <alt>..HEAD`
   `git -C /projects/agents-skills log --name-only --format= <alt>..HEAD -- .agents/skills | sort -u`
3. Jeden betroffenen Skill gegen **dieses** Projekt prüfen.
