# Skills-Marker

agents-skills-consumed: 0449b05
geprüft am: 2026-10-21

## Skill-Stand

| Skill | angewendet? | wo im Projekt | offene Position |
|---|---|---|---|
| `agent-config` | nein | | trifft nicht zu, weil die Skill die Maschinen-Konfiguration beschreibt (globale `opencode.jsonc`, MCP, Skill-Registrierung, Command-Templates) — das Projekt definiert kein Agent-Setup; seit `817c01e` ist sie zusätzlich **versteckt** (nur per exakter ID ladbar), das ändert die Anwendbarkeit nicht |
| `build-verify` | ja | `AGENTS.md` (Regeln „DoD", „Quality gates before commit", „Build-agent rule", „Subagent questions surface to the user") | |
| `codegraph-project-setup` | ja | `.codegraph/` (Index), `.githooks/pre-commit` (Hook; `core.hooksPath=.githooks`) | |
| `docker-test-image` | nein | | trifft nicht zu, weil das Repo kein CI-Image baut (kein Dockerfile; die Workflows bauen direkt auf `ubuntu-latest`) |
| `generated-docs` | offen | `README.md` (Endpunkt-Tabelle), `AGENTS.todo.md` (Zahlen im Fließtext), `features/05-parity.md` (Messwerte im Fließtext) — ohne Drift-Gate | `AGENTS.todo.md` → Abschnitt „Skills-Stand (2026-10-21)", Position 3 |
| `ghcr-visibility` | nein | | trifft nicht zu, weil das Repo keine Container-Images publiziert (kein GHCR-Paket; Deploy läuft über GitHub Pages) |
| `github-ci-filters` | offen | `.github/workflows/ci.yml`, `.github/workflows/pages.yml` (Trigger ohne `paths-ignore`) | `AGENTS.todo.md` → Abschnitt „Skills-Stand (2026-10-21)", Position 1 |
| `laravel` | nein | | trifft nicht zu, weil das Projekt kein PHP-Backend hat (statische PWA ohne Server-Routen) |
| `node-deps` | offen | `package.json` (`packageManager: pnpm@10.0.0`), `pnpm-workspace.yaml` (`minimumReleaseAgeExclude`) | `AGENTS.todo.md` → Abschnitt „Skills-Stand (2026-10-21)", Position 2 |
| `permissions` | nein | | trifft nicht zu, weil die Skill die `opencode.jsonc`-Permissions der Maschine beschreibt; das Projekt hat keine eigene Permissions-Datei |
| `playwright-parallel` | ja | `playwright.config.ts` (`fullyParallel: true`; Projekte `e2e-guard`/`chromium`/`mobile` mit Pixel 7; `E2E_PORT`-Override), `pnpm-lock.yaml` (`@playwright/test` 1.63.0 → `lock:` verfügbar) | |
| `ratchet-gates` | offen | `package.json` (Gates als Boolean), `scripts/check-i18n.mjs` (Boolean-Gate über die Message-Population), `AGENTS.md` (Prüfstufen `@smoke`/`@regression`/`@feature`) | `AGENTS.todo.md` → Abschnitt „Skills-Stand (2026-10-21)", Position 4 |
| `react-i18n` | ja | `lingui.config.ts` (nur `de`, `lineNumbers: false`), `src/logic/I18nProvider.tsx` (Import vor dem Shell-Import in `src/main.tsx`), `scripts/check-i18n.mjs` (Gate in `prebuild`), `eslint.config.js` (lingui-Plugin) | |
| `security-review` | nein | | trifft nicht zu, weil die Skill eine beauftragte Prüfung mit Framework-Route-Table voraussetzt; dieses Repo ist eine statische PWA ohne Server-Routen (die client-seitige Credential-Oberfläche liegt außerhalb des Skill-Ablaufs) |
| `skills-marker` | ja | `AGENTS.skills.md` (diese Datei) | |
| `tailscale-serve` | nein | | trifft nicht zu, weil das Projekt keinen Dev-Server per Tailscale exponiert (Deploy läuft über GitHub Pages; `features/06-remote-access.md` beschreibt den Caddy-Gate auf dem VPS) |
| `ui-review` | offen | `tests/screenshots/ui-review.config.ts` (Manifest), `tests/screenshots/ui-screenshots.spec.ts`, `playwright.screenshots.config.ts` (Desktop/Mobile) | `AGENTS.todo.md` → Abschnitt „Skills-Stand (2026-10-21)", Position 5 |
| `update-models` | nein | | trifft nicht zu, weil Modell-Auswahl und -Registry eine Maschinen-/Account-Sache sind (kein Projektstand; das Projekt schreibt keine Modell-ID in eine Config) |
| `web-audit` | nein | | trifft nicht zu, weil das Projekt keine Content-/SEO-Website mit Sitemap betreibt (SPA-Shell; die visuelle Prüfung läuft über `ui-review`) |

`ja` = am Code geprüft und im Projekt umgesetzt · `offen` = trifft zu, ist aber nicht
umgesetzt (offene Position in `AGENTS.todo.md`) · `nein` = trifft nicht zu, Begründung
in der Zeile.

## Offen aus dem Bereich `787670a..0449b05`

Geprüft 2026-10-21 gegen `0449b05`. **12 Commits** in der Range
(`git -C <skills-repo> rev-list --count 787670a..0449b05` — alle Pfade, kein
Pfadfilter). Davon **11** mit Bezug zu `.agents/skills/`
(`git -C <skills-repo> log --oneline --format=%h 787670a..0449b05 -- .agents/skills | wc -l`)
und **1** ohne jeden `.agents/`-Bezug (`5a0c1b0`, siehe unten). Betroffen sind
**9 Skills** (Verzeichnisse unter `.agents/skills/`, dedupliziert über
`git log --name-only --format= 787670a..0449b05 -- .agents/skills`): 2 neu
(`generated-docs`, `ratchet-gates`), 3 zusätzlich hinter exakten IDs versteckt
(`agent-config`, `update-models`, `github-ci-filters` — die ersten beiden tragen
zusätzlich inhaltliche Änderungen), 4 weitere inhaltlich geändert
(`build-verify`, `security-review`, `skills-marker`, `ui-review`).

**Die Commits der Range, je mit SHA und Änderung**

| SHA | betrifft | was sich geändert hat |
|---|---|---|
| `0449b05` | `build-verify` (+ `.agents/rules/build-verify.md`) | die geteilte Regel: jede Zahl, die etwas über den Commit oder seine Gates behauptet, nennt **Zustand** (Working Tree / committeter Stand) und **Umfang** (gefilterte Teilmenge, Range, Stufe); der committete Stand wird gemessen, nicht ausgecheckt (`git archive <sha> \| tar -x -C <tmpdir>`) — `references/notes.md` (+60/−1) |
| `d7888cd` | `ratchet-gates` | die Karte von den Gates zu den Kommandos (`references/cli.md`, +134) |
| `b9f140b` | `security-review`, `ui-review` | Befunde der Vokabular-Verifikation geschlossen: Stufe `info` in der Reihenfolge, `medium` = „mit Workaround" |
| `b0d1b51` | `build-verify` (ausschließlich `references/verifier-prompt.md`, +8/−6), `ratchet-gates`, `security-review`, `ui-review` | ein gemeinsames Vokabular für Findings- und Gap-Listen (neu `ratchet-gates/references/vocabulary.md`, +87/−0): Status `fixed`/`open` statt `fixed`/`open`/`new`, Status als eigenes Feld, `AKZEPTIERT` = kanonisch `accepted`; in `build-verify` ändert der Commit nur das Verifier-Protokoll |
| `5a0c1b0` | **kein Skill** | berührt nur `AGENTS.todo.md` im Skills-Repo (Entscheidung: der ratchet CLI bekommt ein eigenes Repo `~/dev/ratchet-cli`; die Karte bleibt in der Skill) |
| `0024d7e` | `agent-config`, `build-verify`, `skills-marker` (+ `.agents/rules/build-verify.md`) | Drift um den ungenutzten `instructions`-Key geschlossen: kein Config-Key trägt Always-on-Text, er ist in eine `AGENTS.md` eingebettet |
| `817c01e` | `agent-config`, `build-verify`, `github-ci-filters`, `update-models` | drei Skills werden hinter exakten IDs versteckt (`metadata.opencode/autoinvoke: false`) |
| `00dbd22` | `generated-docs` (neu), `ratchet-gates`, `agent-config` | neue versteckte Skill „documentation checked, not believed" (Skill + 2 Referenzen: `drift-and-generation.md`, `source-of-truth.md`) |
| `70d49e0` | `ratchet-gates` (neu), `agent-config` | neue versteckte Skill „baselines that only move one way" (Skill + 3 Referenzen: `check-tiers.md`, `generated-docs.md`, `ratchet-baselines.md`; die vierte Referenz `vocabulary.md` kam mit `b0d1b51`) |
| `8c6b9af` | `update-models` | die `$0`-Aussage auf das konfigurierte Modell eingeschränkt |
| `fa2268f` | `ui-review` | „vision-agent"-Wortlaut aus der Findings-Vorlage entfernt |
| `219171c` | `update-models` | Namespace-Regel und Snapshot an die neue Config angeglichen (Snapshot 2026-10-19: `opencode-go/minimax-m3.1-flash-free`) |

**Neu im Bereich** — 2 Skills, beide versteckt (nur per exakter ID ladbar)

- `generated-docs` (neu, `00dbd22`) — **trifft zu, ist nicht drin**. Die Skill verlangt
  einen Besitzer je Behauptung: Code, eine maschinenlesbare Datei, eine kuratierte
  Liste oder eine Person; Zahlen im Fließtext sind Artefakte. Das Projekt hat drei
  solche Stellen und kein Gate, das sie prüft: (a) `README.md` — die Endpunkt-Tabelle
  nennt 8 Endpunkte, der Code ruft deutlich mehr auf (`src/lib/opencode.ts`, u. a.
  `/api/session/active`, `/api/session/{id}/diff`, `/api/permission/request`,
  `/api/skill`, `/api/worktree`) — die Tabelle ist eine zweite Wahrheit und altert
  still; eine Liste von Behauptungen braucht nach der Skill ihr **eigenes** Gate
  (alles Genannte existiert und ist erreichbar) oder wird aus dem Code abgeleitet;
  (b) Zahlen im Fließtext: `AGENTS.todo.md` (u. a. „44 Captures", „vitest 233/233",
  „e2e 117/117", „**sieben** offene Checkbox-Punkte") und `features/05-parity.md`
  §„Live delta folding" (u. a. „92 frames in 12 s", „174 frames in 20 s");
  (c) kein Drift-Gate — nichts vergleicht Doku gegen Quelle. → offene Position 3.
- `ratchet-gates` (neu, `70d49e0`) — **trifft zu, ist nicht drin**. Die Skill dreht
  das Boolean-Gate um („aktuell N Verstöße gegen Regel R", grün solange `count ≤ N`
  oder `count ≥ N`, Baseline nur in der erklärten Richtung) und verlangt, dass die
  **nicht abgedeckte Fläche** dort benannt wird, wo sie lebt, und dass jede offene
  Lücke Owner und Ticket trägt. In diesem Repo ist davon offen: (a)
  `scripts/check-i18n.mjs` prüft die Message-Population als Boolean („missing from the
  compiled catalog") und benennt seine eigene Blindstelle im Kopfkommentar („no AST
  scan for unwrapped strings") — der Verweis dahinter (`AGENTS.todo W3`) zeigt auf
  einen Eintrag, den es nicht mehr gibt; (b) `AGENTS.todo.md` §„Bewusst
  offen/dokumentiert (kein Handlungsbedarf)" — 6 Einträge (am committeten Stand
  dieses Commits): 1 ist als entschieden und umgesetzt markiert, 5 tragen weder Owner
  noch Ticket; 4 dieser 5 sind als dokumentierte Entscheidung markiert (Quellen:
  `features/05-parity.md` für zwei Einträge, `features/03-userscripts-postmvp.md`,
  „zurückgestellt") und damit `accepted`/`wontfix` — offener Punkt bleibt nur der
  Todo-Dock-Eintrag;
  (c) die Prüfstufen existieren (`AGENTS.md`: `@smoke`/`@regression`/`@feature`;
  `pnpm test:e2e:smoke` = **1** Test am committeten Stand dieses Commits), aber
  welche Fehlerklassen nur die langsame Stufe abdeckt und welche gar keine, ist
  nirgends als Liste dokumentiert. → offene Position 4.

**Versteckt im Bereich** — 3 Skills (vorher normale Zeilen „ja"/„nein"; versteckt
heißt „nicht normal ladbar", nicht „unwirksam" — per exakter ID ladbar)

- `agent-config` (versteckt in `817c01e`; zusätzlich geändert in `0024d7e`,
  `00dbd22`, `70d49e0`) — **trifft nicht zu**: die Skill beschreibt die
  Maschinen-Konfiguration (globale `opencode.jsonc`, MCP, Skill-Registrierung,
  Command-Templates); das Projekt definiert kein Agent-Setup. Die inhaltliche
  Änderung (`0024d7e`) betrifft den Wegfall des `instructions`-Keys der globalen
  Config — ebenfalls Maschinen-Sache. Zeile bleibt `nein`, Grund neu begründet.
- `update-models` (versteckt in `817c01e`; zusätzlich geändert in `219171c`,
  `8c6b9af`) — **trifft nicht zu**: Modell-Registry, Preise und die konfigurierte
  Modellwahl sind Maschinen-/Account-Stand. Der neue Snapshot (`219171c`,
  `opencode-go/minimax-m3.1-flash-free`) ist ein Stand der globalen Config; im
  Projekt steht keine Modell-ID (kein Treffer für `opencode-go/` in `src/`). Zeile
  bleibt `nein`, Grund neu begründet.
- `github-ci-filters` (versteckt in `817c01e`) — **trifft zu, ist nicht drin**: das
  Verstecken ändert die Pflicht nicht — die Skill ist per exakter ID ladbar, und die
  Pflicht trifft dieses Repo weiter zu. Die beiden Workflows laufen ohne
  `paths-ignore` (Trigger am committeten Stand dieses Commits: `ci.yml` = `push` **und**
  `pull_request`, `pages.yml` = `push` **und** `workflow_dispatch`; `pages.yml` hat
  **keinen** `pull_request`-Trigger), das Repo ist docs-lastig (`features/`, `docs/`,
  `AGENTS*.md`). Die Precondition hält am 2026-10-21 erneut: kein Check liest eine
  Repo-`.md` als Input (`eslint.config.js` lints js/ts/mjs, `vite.config.ts`
  vitest-`include` = `src/**/*.test.{ts,tsx}`, `playwright.config.ts` `testDir` =
  `tests/e2e`); `main` ist nicht branch-protected (`gh api
  repos/:owner/:repo/branches/main/protection` → „Branch not protected"). Zeile bleibt
  `offen` → offene Position 1.

**Geändert im Bereich** (Ergebnis je Skill)

- `build-verify` (`0449b05`, `b0d1b51`, `0024d7e`, `817c01e`) — die neue geteilte
  Regel: jede Zahl, die etwas über den Commit oder seine Gates behauptet, nennt
  Zustand und Umfang; der committete Stand wird gemessen (`git archive`), nicht
  ausgecheckt. Dazu die Wegfall der `instructions`-Behauptung (`0024d7e`), die
  Umstellung des Verifier-Protokolls auf das gemeinsame Vokabular (`b0d1b51`) und die
  Verschiebung von `github-ci-filters` in die Liste der versteckten Skills
  (`817c01e`). Das Projekt definiert seine Gates und Rollen selbst in `AGENTS.md`
  (DoD, „Quality gates before commit", „Build-agent rule"); die Änderungen sind
  maschinenweit, die Regel-Datei ist in keine `AGENTS.md` eingebettet — **Zeile bleibt
  `ja`**.
- `security-review` (`b0d1b51`, `b9f140b`) — die Schweregrade kommen jetzt aus dem
  kanonischen Vokabular (`ratchet-gates`, `references/vocabulary.md`), der Status
  kennt nur noch `fixed`/`open` (ein neuer Fund ist `open`), `AKZEPTIERT` ist
  kanonisch `accepted`, `info` kommt in die Reihenfolge. Das Repo ist eine statische
  PWA ohne Server-Routen und führt keine beauftragte Sicherheitsprüfung — **Zeile
  bleibt `nein`**, der tragfähige Grund unverändert.
- `ui-review` (`b0d1b51`, `b9f140b`, `fa2268f`) — die Findings-Vorlage hat jetzt die
  Spalten `Id | Severity | Status | Owner | Ticket | File:Line | Screenshot | Finding |
  Suggested fix`, die kanonischen Stufen (`critical`/`high`/`medium`/`low`/`info`, mit
  `medium` = „mit Workaround") und den Status als eigenes Feld; `fa2268f` entfernt
  den „vision-agent"-Wortlaut. Das **Harness** ist angewendet
  (`tests/screenshots/ui-review.config.ts`, `ui-screenshots.spec.ts`,
  `playwright.screenshots.config.ts`), die **Findings-Liste** nicht:
  `AGENTS.todo.md` §„UI-Review-Befunde" (10 Zeilen am committeten Stand dieses
  Commits) nutzt `hoch`/`mittel`/`niedrig`, führt den Status mit im Behebungs-Text
  statt in einer eigenen Spalte (6 der 10 Zeilen tragen „erledigt" in der
  Behebungs-Spalte; die Zeilen 3–5 sind über die Welle 5 geschlossen, ohne
  Statuswort), und die einzige
  offene Zeile (#10, „Server-Werkzeuge: 5 Karten mit „Keine …"") hat weder Owner noch
  Ticket. Eine verwandte Lücke — derselbe Lückentyp in einem anderen Repo — ist für
  die UI-Log der Website im Skills-Repo protokolliert (`b9f140b`): dort die
  zurückgezogene Bedeutung der Stufen, hier die deutschen Stufen und die fehlenden
  Spalten. → **Zeile wird `offen`** → offene Position 5.
- `skills-marker` (`0024d7e`) — nur der Wortlaut zum Wegfall des `instructions`-Keys
  (kein Config-Key trägt Regeltext; er ist in eine `AGENTS.md` eingebettet). Der
  Ablauf des Markers selbst ändert sich nicht — **Zeile bleibt `ja`**.

**Entfernt im Bereich**: keiner (kein Skill wurde gelöscht; `git log
--diff-filter=D --name-only 787670a..0449b05 -- .agents/skills` ist leer).

**Anker-Audit** — alle Zeilen der Tabelle am committeten Stand **dieses Commits**
neu belegt (Datei-Stand, den dieser Commit festschreibt; die geprüften Artefakte
sind zwischen `45cb323` und diesem Commit unverändert). Ergebnis: **1 Verweis ohne
Ziel** — `scripts/check-i18n.mjs:6` verweist auf „AGENTS.todo W3"; einen Eintrag W3
gibt es nicht: im Todo vor dem Fortschreiben, das den Cursor auf `0449b05` gesetzt
hat, kommt die Zeichenfolge nicht vor — gemessen an `c737d17`
(`git show c737d17:AGENTS.todo.md | grep -c "W3"` → 0; derselbe Wert 0 an den
weiteren Vor-Ständen `1f73917`, `4507c4a`, `73c032f`) —, und die einzigen
Fundstellen seither sind das Zitat desselben Zeigers in offene Position 4 —
zitiert, nicht aufgelöst.
Die übrigen Anker tragen: `AGENTS.md` (DoD,
„Quality gates before commit", „Build-agent rule", „Subagent questions surface to the
user"), `.codegraph/`, `.githooks/pre-commit` mit `core.hooksPath=.githooks`,
`playwright.config.ts` (`fullyParallel: true`, Projekte `e2e-guard`/`chromium`/`mobile`,
Pixel 7, `E2E_PORT`), `pnpm-lock.yaml` (`@playwright/test@1.63.0`), `lingui.config.ts`
(`locales: ["de"]`, `lineNumbers: false`), `src/logic/I18nProvider.tsx` mit
`src/main.tsx` (Import vor dem Shell-Import), `scripts/check-i18n.mjs` (Gate in
`prebuild`), `eslint.config.js` (lingui-Plugin), `tests/screenshots/ui-review.config.ts`,
`tests/screenshots/ui-screenshots.spec.ts`, `playwright.screenshots.config.ts`
(Desktop Chrome / Mobile Chrome), `features/06-remote-access.md` (Caddy-Gate auf dem
VPS), `package.json` (`packageManager`), `pnpm-workspace.yaml`
(`minimumReleaseAgeExclude`). `playwright-parallel` ist in dieser Range **nicht**
geändert; die Zeile bleibt wie belegt.

**Regel-Drift** (Schritt 3 des Ablaufs): unter `.agents/rules/` ist in dieser Range
nur `build-verify.md` geändert (`0449b05`, `0024d7e`); `ask.md` ist unverändert, und
die globale `~/.config/opencode/AGENTS.md` bettet nur die Frage-Regel ein — die
neue Regel zur Zahl im Footer ist maschinenweit, nicht projektspezifisch, und wird
nicht eingebettet. Nichts nachzuziehen.

**Sprache** (Stand dieses Commits): `AGENTS.md:3` verlangt Englisch für Code und Doku
(„Language: code and docs in English, UI strings in German"), `README.md:4` ebenso
(„German UI, English code and docs"). Die Commit-Bodies sind **nicht einheitlich
englisch**: in der Marker-Serie (`docs(skills):`/`docs(agents):` — die Commits
`1f73917`, `4507c4a`, `73c032f`, `c737d17`, `45cb323`, `c86138b` und dieser) haben
**zwei** einen deutschen Body (`c737d17`, `45cb323`) — gemessen mit
`git cat-file commit <sha>` an jedem der genannten SHAs (committeter Stand,
Rohformat). Die übrigen sind englisch: `1f73917` zitiert die Regel ausdrücklich
(„in the file's language (English, per rule 1)"), `4507c4a` und `73c032f` schreiben
englisch, obwohl sie deutsche Dateien ändern, ebenso dieser Commit. Die
**Marker-Datei selbst bleibt deutsch** — vorbestehender Zustand (`c737d17` war
ebenfalls deutsch), keine Übersetzung.

## Fortschreiben

1. `agents-skills-consumed` ablesen → `<alt>`.
2. Im Skills-Repo die Range bilden:
   `git -C <skills-repo> log --oneline <alt>..HEAD`
   `git -C <skills-repo> log --name-only --format= <alt>..HEAD -- .agents/skills | sort -u`
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
   `agents-skills-consumed: $(git -C <skills-repo> rev-parse --short HEAD)`,
   `geprüft am:` auf heute, Tabellen- und Bereichs-Abschnitt ersetzen.
6. Falls Regeln oder Skills betroffen waren: die eingebetteten Regeln in der
   globalen `~/.config/opencode/AGENTS.md` gegen ihre Quelle in `.agents/rules/*`
   prüfen und bei geänderter **Pflicht** sinngemäß nachziehen. Drift ist eine geänderte
   Pflicht, kein abweichender Wortlaut. Dann `touch ~/.config/opencode/opencode.jsonc`
   (Reload der globalen Config; Always-on-Text liefert nur die Einbettung in eine
   `AGENTS.md`).
