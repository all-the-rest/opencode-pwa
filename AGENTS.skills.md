# Skills-Marker

agents-skills-consumed: be24163
geprüft am: 2026-10-06

## Skill-Stand

| Skill | angewendet? | wo im Projekt | offene Position |
|---|---|---|---|
| codegraph-project-setup | ja | `.codegraph/.gitignore`, `.githooks/pre-commit` | |
| build-verify | ja | `AGENTS.md:6` (lint:fix + build gates) | |
| playwright-parallel | ja | `playwright.config.ts` (chromium + Pixel-7-Projekte, E2E_PORT-Override) | |
| ui-review | ja | `tests/screenshots/` (Harness + 16 Captures, W4) | |
| skills-marker | ja | `AGENTS.skills.md` | |
| react-i18n | ja | `src/logic/I18nProvider.tsx`, `lingui.config.ts` (W3, 207 Strings) | |
| laravel | nein | | kein Backend im Projekt (rein statische PWA) |

## Offen aus dem Bereich `b0eafee..be24163`

Geprüft 2026-10-06: neu `react-i18n` (angewendet, W3) und `laravel` (trifft nicht zu, kein Backend). Geändert: `react-i18n/references/lingui-setup.md` (v6-Makro-Importe, in W3 verifiziert).

## Fortschreiben

1. `agents-skills-consumed` ablesen → `<alt>`.
2. Im Skills-Repo die Range bilden:
   `git -C /projects/agents-skills log --oneline <alt>..HEAD`
   `git -C /projects/agents-skills log --name-only --format= <alt>..HEAD -- .agents/skills | sort -u`
3. Jeden betroffenen Skill gegen **dieses** Projekt prüfen.
