# Skills-Marker

agents-skills-consumed: 787670a
geprüft am: 2026-10-19

## Skill-Stand

| Skill | angewendet? | wo im Projekt | offene Position |
|---|---|---|---|
| `agent-config` | nein | | trifft nicht zu, weil die Skill die Maschinen-Konfiguration beschreibt (globale `opencode.jsonc`, MCP, Skill-Registrierung, Command-Templates) — das Projekt definiert kein Agent-Setup |
| `build-verify` | ja | `AGENTS.md` (Regeln „DoD", „Quality gates before commit", „Build-agent rule", „Subagent questions surface to the user") | |
| `codegraph-project-setup` | ja | `.codegraph/` (Index), `.githooks/pre-commit` (Hook; `core.hooksPath=.githooks`) | |
| `docker-test-image` | nein | | trifft nicht zu, weil das Repo kein CI-Image baut (kein Dockerfile; die Workflows bauen direkt auf `ubuntu-latest`) |
| `ghcr-visibility` | nein | | trifft nicht zu, weil das Repo keine Container-Images publiziert (kein GHCR-Paket; Deploy läuft über GitHub Pages) |
| `github-ci-filters` | offen | `.github/workflows/ci.yml`, `.github/workflows/pages.yml` (Trigger ohne `paths-ignore`) | `AGENTS.todo.md` → Abschnitt „Skills-Stand (2026-10-19)", Position 1 |
| `laravel` | nein | | trifft nicht zu, weil das Projekt kein PHP-Backend hat (statische PWA ohne Server-Routen) |
| `node-deps` | offen | `package.json` (`packageManager: pnpm@10.0.0`), `pnpm-workspace.yaml` (`minimumReleaseAgeExclude`) | `AGENTS.todo.md` → Abschnitt „Skills-Stand (2026-10-19)", Position 2 |
| `permissions` | nein | | trifft nicht zu, weil die Skill die `opencode.jsonc`-Permissions der Maschine beschreibt; das Projekt hat keine eigene Permissions-Datei |
| `playwright-parallel` | ja | `playwright.config.ts` (`fullyParallel: true`; Projekte `e2e-guard`/`chromium`/`mobile` mit Pixel 7; `E2E_PORT`-Override), `pnpm-lock.yaml` (`@playwright/test` 1.63.0 → `lock:` verfügbar) | |
| `react-i18n` | ja | `lingui.config.ts` (nur `de`, `lineNumbers: false`), `src/logic/I18nProvider.tsx` (Import vor dem Shell-Import in `src/main.tsx`), `scripts/check-i18n.mjs` (Gate in `prebuild`), `eslint.config.js` (lingui-Plugin) | |
| `security-review` | nein | | trifft nicht zu, weil die Skill eine beauftragte Prüfung mit Framework-Route-Table voraussetzt; dieses Repo ist eine statische PWA ohne Server-Routen (die client-seitige Credential-Oberfläche liegt außerhalb des Skill-Ablaufs) |
| `skills-marker` | ja | `AGENTS.skills.md` (diese Datei) | |
| `tailscale-serve` | nein | | trifft nicht zu, weil das Projekt keinen Dev-Server per Tailscale exponiert (Deploy läuft über GitHub Pages; `features/06-remote-access.md` beschreibt den Caddy-Gate auf dem VPS) |
| `ui-review` | ja | `tests/screenshots/ui-review.config.ts` (Manifest), `tests/screenshots/ui-screenshots.spec.ts`, `playwright.screenshots.config.ts` (Desktop/Mobile) | |
| `update-models` | nein | | trifft nicht zu, weil Modell-Auswahl und -Registry eine Maschinen-/Account-Sache sind (kein Projektstand) |
| `web-audit` | nein | | trifft nicht zu, weil das Projekt keine Content-/SEO-Website mit Sitemap betreibt (SPA-Shell; die visuelle Prüfung läuft über `ui-review`) |

`ja` = am Code geprüft und im Projekt umgesetzt · `offen` = trifft zu, ist aber nicht
umgesetzt (offene Position in `AGENTS.todo.md`) · `nein` = trifft nicht zu, Begründung
in der Zeile.

## Offen aus dem Bereich `be24163..787670a`

Geprüft 2026-10-19 gegen `787670a` (35 Commits im Skills-Repo). Der Working Tree des
Skills-Repos war beim Prüfen **nicht** sauber (`update-models/SKILL.md` und
`update-models/references/registry.md` uncommitted) — diese Änderungen sind nicht Teil
des Ranges und stecken nicht im Marker-Stand.

**Neu im Bereich**

- `security-review` (neu, `82a9abb`; versteckt, `autoinvoke: false`) — trifft nicht zu:
  die Skill setzt eine beauftragte Prüfung mit Framework-Route-Table voraus; dieses Repo
  ist eine statische PWA ohne Server-Routen (die API ist der externe Opencode-Server).
  Die client-seitige Credential-Oberfläche (Basic-Auth-Passwort im `localStorage`)
  liegt außerhalb des Skill-Ablaufs — bei Bedarf ein eigener Auftrag, kein Marker-Rest.
- `web-audit` (neu, `59f9533`; versteckt) — trifft nicht zu: kein Sitemap-/Content-Scope
  (eine SPA-Shell ohne öffentliche Content-Seiten); die visuelle Prüfung läuft über
  `ui-review`.
- `update-models` — `models` (neu in `1a096ba` aus `model-updater` +
  `update-opencode-models`) in `fc28ea3` umbenannt; der Skill-ID ist jetzt
  `update-models`. Trifft nicht zu: Modell-Registry und Preise sind eine
  Maschinen-/Account-Sache, kein Projektstand.

**Entfernt im Bereich** (die Zeile fällt mit diesem Fortschreiben weg; nach der
Fallstrick-Regel hier notiert, damit die Frage nicht offen bleibt)

- `vision-agents` — entfernt in `dccdd40` (der Vision-Subagent ist weg; `ui-review`
  liest zweifelhafte Bilder jetzt selbst erneut). Das Projekt referenzierte keinen
  Vision-Subagenten — keine Nacharbeit. Die Zeile stand nie in der Tabelle.
- `model-updater` — entfernt in `1a096ba`, mit `update-opencode-models` zu `models`
  zusammengeführt (weiter zu `update-models`).
- `update-opencode-models` — entfernt in `1a096ba`, mit `model-updater` zusammengeführt.

**Geändert im Bereich** (Ergebnis je Skill)

- `agent-config` — 15 Commits, ausschließlich Maschinen-Konfiguration (globale
  `opencode.jsonc`, MCP-Snippet, Wegfall des `instructions`-Arrays, Skill-Registrierung,
  Command-Templates) — kein Projektstand, Zeile bleibt `nein`.
- `build-verify` — Substantz-Prüfung statt Wiederholung der Gates, frische Session je
  Runde, separate Commits als Default, optionaler Milestone-Review, Wegfall der
  `instructions`-Behauptung. Das Projekt definiert seine Gates und Rollen selbst in
  `AGENTS.md`; die Fluss-Änderungen sind maschinenweit, Zeile bleibt `ja`.
- `codegraph-project-setup` — Scope-Hinweis „nur Code-Repos" (agents-skills selbst ist
  der Gegenfall) und versteckt. Dieses Repo ist ein Code-Repo mit Index und Hook,
  Zeile bleibt `ja`.
- `docker-test-image`, `ghcr-visibility`, `laravel`, `node-deps`, `permissions`,
  `playwright-parallel`, `react-i18n`, `tailscale-serve` — nur Beschreibung
  gekürzt bzw. Skill versteckt, keine Verhaltensänderung; Zeilen bleiben wie belegt.
  Für `node-deps` ist die Policy selbst älter als der Bereich, das Projekt weicht aber
  an zwei Stellen ab → offene Position 2.
- `github-ci-filters` — nur Beschreibung gekürzt (Trigger-Kern: `push` **und**
  `pull_request`, Branch-Protection-Falle). Das Repo hat zwei Workflows ohne
  `paths-ignore`; Precondition (kein Check liest eine Repo-`.md` als Input) und
  Branch-Protection (`main` nicht geschützt) am 2026-10-19 geprüft → offene Position 1.
- `skills-marker` — Drift-Wortlaut (Drift = geänderte Pflicht, kein Text-Diff),
  separate Commits als Default, Template-Kürzung; die Fallstricke „ein Skill verschwindet"
  und „Anker verrotten" sind jetzt Teil des Bereichs → Zeile bleibt `ja`.
- `ui-review` — Vision-Subagent entfernt (zweifelhafte Bilder selbst erneut lesen),
  `models` → `update-models` im Text. Das Harness des Projekts nutzt keinen
  Vision-Subagenten — Zeile bleibt `ja`.

**Anker-Audit** (alle Zeilen der Tabelle neu belegt): `AGENTS.md:6` (`build-verify`)
zeigte auf die Docs-Zeile, nicht auf die Gates (Zeile 5) — durch Suchbegriffe ersetzt.
`tests/screenshots/` mit „16 Captures" (`ui-review`) und `lingui.config.ts` mit
„207 Strings" (`react-i18n`) waren veraltete Zahlen (heute 16 Routen / 24
Zustandskombinationen / 48 Aufnahmen, 682 msgids) — durch stabile Referenzen ersetzt.
`playwright.config.ts`, `.codegraph/.gitignore`, `.githooks/pre-commit`,
`src/logic/I18nProvider.tsx`, `lingui.config.ts` geprüft und unverändert gültig.

**Regel-Drift** (Schritt 3 des Ablaufs): `ask.md` ist in diesem Bereich unverändert, und
die globale `~/.config/opencode/AGENTS.md` bettet nur die Frage-Regel ein —
`build-verify.md` ist bewusst nicht eingebettet (`1a8a9a5`), dort ist also nichts
nachzuziehen. Der Skills-Ordner ist als Verzeichnis registriert, neue Skills brauchen
keine Config-Änderung.

## Fortschreiben

1. `agents-skills-consumed` ablesen → `<alt>`.
2. Im Skills-Repo die Range bilden:
   `git -C /projects/agents-skills log --oneline <alt>..HEAD`
   `git -C /projects/agents-skills log --name-only --format= <alt>..HEAD -- .agents/skills | sort -u`
3. Jeden betroffenen Skill gegen **dieses** Projekt prüfen. Trifft eine Änderung zu, wenn
   sie eine Pflicht, Schwelle, Ausnahme, Konvention oder ein Kommando betrifft, das
   **hier** gilt:
   - trifft zu und ist drin → `angewendet: ja` + stabile Referenz (Abschnitt, Suchstring
     oder Pfad; eine Zeilennummer nur als Lesehilfe)
   - trifft zu, ist nicht drin → offene Position: Eintrag in `AGENTS.todo.md` anlegen,
     die Zeile verweist darauf
   - trifft nicht zu (das Projekt hat das nicht) → `angewendet: nein` + kurzer Grund
4. Offene Positionen nach `AGENTS.todo.md`; bestehende Anker neu belegen (Zeilennummern
   veralten — Abschnitte, Suchstrings und Pfade bevorzugen).
5. Erst wenn für **jeden** Skill aus der Range eine Zeile steht:
   `agents-skills-consumed: $(git -C /projects/agents-skills rev-parse --short HEAD)`,
   `geprüft am:` auf heute, Tabellen- und Bereichs-Abschnitt ersetzen.
6. Falls Regeln oder Skills betroffen waren: die eingebetteten Regeln in der
   globalen `~/.config/opencode/AGENTS.md` gegen ihre Quelle in `.agents/rules/*`
   prüfen und bei geänderter **Pflicht** sinngemäß nachziehen. Drift ist eine geänderte
   Pflicht, kein abweichender Wortlaut. Dann `touch ~/.config/opencode/opencode.jsonc`
   (Reload der globalen Config; das `instructions`-Array ist leer und liefert nichts).
