# Skills-Marker

agents-skills-consumed: 33cbd00
geprüft am: 2026-10-22

Bezugsrahmen — die gemeinsame Regel, **zitiert statt kopiert**: `skills-marker/SKILL.md` →
„Bezugsrahmen-Regel" (Skill-ID + Datei + Anker, **ohne Zeilennummer** — die driftet, der
Anker bleibt); Wortlaut, Belege und Fälle: `skills-marker/references/notes.md`
§ „Der Bezugsrahmen". Diese Liste nennt die **Fälle**, nicht die Fassung — steht eine
Form nicht an der Zitierstelle, ist sie hier falsch:
- (a) was der Commit selbst festschreibt (Marker, Board, geänderte Dateien);
- (b) eine Fremddatei, die der Commit nicht anfasst und die seit dem genannten Stand
  **unverändert** ist;
- (c) eine Datei, die sich seit dem genannten Stand **geändert** hat.
Der genannte SHA ist der **Messstand** — ein **Vorfahr**, nicht zwingend der direkte
Vorgänger; (b) und (c) unterscheiden sich an der **Zeitform** (unverändert seit dem
genannten Stand / geändert seit ihm), das **Nomen** („Vorgänger" / „Stand") entscheidet den
Fall **nicht**.

**Lokale Ergänzung:** `<stand>` = der committete Stand dieses Commits (die SHA, die erst
mit dem Commit existiert). Der Cursor oben ist **kein** Rahmen — er zeigt den Stand
des Skills-Repos.
## Skill-Stand

| Skill | angewendet? | wo im Projekt | offene Position |
|---|---|---|---|
| `agent-config` | nein | | trifft nicht zu, weil die Skill die Maschinen-Konfiguration beschreibt (globale `opencode.jsonc`, MCP, Skill-Registrierung, Command-Templates) — das Projekt definiert kein Agent-Setup; seit `817c01e` ist sie zusätzlich **versteckt** (nur per exakter ID ladbar), das ändert die Anwendbarkeit nicht |
| `build-verify` | ja | `AGENTS.md` (Regeln „DoD", „Quality gates before commit", „Build-agent rule", „Subagent questions surface to the user") | |
| `codegraph-project-setup` | ja | `.codegraph/` (Index), `.githooks/pre-commit` (Hook; `core.hooksPath=.githooks`) | |
| `docker-test-image` | nein | | trifft nicht zu, weil das Repo kein CI-Image baut (kein Dockerfile; die Workflows bauen direkt auf `ubuntu-latest`) |
| `generated-docs` | offen | `README.md` (Endpunkt-Tabelle), `AGENTS.todo.md` (Zahlen im Fließtext), `features/05-parity.md` (Messwerte im Fließtext) — ohne Drift-Gate | `AGENTS.todo.md` → Abschnitt „Skills-Stand (2026-10-21)", Position 3 |
| `ghcr-visibility` | nein | | trifft nicht zu, weil das Repo keine Container-Images publiziert (kein GHCR-Paket; Deploy läuft über GitHub Pages) |
| `github-ci-filters` | ja | `.github/workflows/ci.yml` (`push` **und** `pull_request`, je `paths-ignore: ['**/*.md']`), `.github/workflows/pages.yml` (`push`, `paths-ignore: ['**/*.md']`) | |
| `laravel` | nein | | trifft nicht zu, weil das Projekt kein PHP-Backend hat (statische PWA ohne Server-Routen) |
| `node-deps` | offen | `package.json` (`packageManager: pnpm@10.0.0`), `pnpm-workspace.yaml` (`minimumReleaseAgeExclude`) | `AGENTS.todo.md` → Abschnitt „Skills-Stand (2026-10-21)", Position 2 |
| `permissions` | nein | | trifft nicht zu, weil die Skill die `opencode.jsonc`-Permissions der Maschine beschreibt; das Projekt hat keine eigene Permissions-Datei |
| `playwright-parallel` | ja | `playwright.config.ts` (`fullyParallel: true`; Projekte `e2e-guard`/`chromium`/`mobile` mit Pixel 7; `E2E_PORT`-Override), `pnpm-lock.yaml` (`@playwright/test` 1.63.0 → `lockfileVersion` 9.0) | |
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

## Offen aus dem Bereich `5243791..33cbd00`

Geprüft 2026-10-22 gegen `33cbd00` — der Stand des Skills-Repos, **gemessen am
2026-10-22, 06:00 UTC**; er kann sich während des Laufs bewegen (der **ungeprüfte
Rest** steht am Ende dieses Abschnitts). **2 Commits** in der Range
(`git -C <skills-repo> rev-list --count 5243791..33cbd00` → **2**). Betroffen sind
**2 Skills** (Verzeichnisse unter `.agents/skills/`, dedupliziert über
`git log --name-only --format= 5243791..33cbd00 -- .agents/skills`): **0 neu**
(`git log --diff-filter=A --name-only --format= 5243791..33cbd00 -- .agents/skills`
→ leer), **0 zusätzlich versteckt** — die Skills mit `metadata.opencode/autoinvoke: false`
sind an beiden Ständen **17** und die Namensmenge identisch (`git grep -l "autoinvoke:
false" 5243791 -- .agents/skills` → **17**; dieselbe Zahl und dieselbe Namensliste an
`33cbd00`) —, **2 inhaltlich geändert** (`build-verify`, `agent-config`). Die Skill-Menge
selbst ist an beiden Ständen dieselbe (**19** Verzeichnisse, `git ls-tree --name-only
<stand> .agents/skills/`), **entfernt** wurde keiner (`git log --diff-filter=D --name-only
5243791..33cbd00 -- .agents/skills` → leer).

**⚠️ Abweichung von der Vorabmessung dieser Runde: die Range hat zwei Commits, nicht
einen.** Die Vorabmessung nannte `e559a39` und **gegebenenfalls** einen weiteren Commit,
der während des Laufs landet — genau das ist eingetreten: `33cbd00` („docs(build-verify):
the path-commit clause in the README, and rule 4's carve-out", committet am **2026-10-22,
05:58 UTC**) kam **während** dieses Laufs in das Skills-Repo. Die Range wurde deshalb
**erneut gemessen** und umfasst **beide** Commits; der Cursor steht am Ende auf dem
zuletzt gemessenen Stand. `git log --name-only --format= 5243791..33cbd00 | sort -u`
nennt **6** Pfade: **4** unter `.agents/skills/` in **2** Verzeichnissen (bei `build-verify`:
`SKILL.md` und `references/notes.md`; bei `agent-config`: `SKILL.md` und
`references/snippets.md`), dazu die Regel-Datei `.agents/rules/build-verify.md` und
`README.md` des Skills-Repos. Gezählt wird das Verzeichnis, nicht die Datei — die beiden
Dateien außerhalb von `.agents/skills/` sind **keine** Skills und tragen für dieses Projekt
keine Pflicht.

**Die Commits der Range, je mit SHA und Änderung**

| SHA | betrifft | was sich geändert hat |
|---|---|---|
| `33cbd00` | `build-verify` (`SKILL.md`, `references/notes.md`), `.agents/rules/build-verify.md`, `agent-config` (`SKILL.md`), `README.md` des Skills-Repos | die **Ausnahme-Klausel** in der Regel-Datei: die Repo-Policy-Ausnahme für die Regeln 4–7 gilt **nicht** für die Pfad-Commit-Klausel von Regel 4 („except the path-commit clause of rule 4"); der kanonische Satz — die Klausel bindet **jede** Session in einem gemeinsamen Baum, die Verantwortung liegt beim **Kommittenden**, und **keine** Repo-Policy überschreibt sie — steht jetzt wörtlich gleich an **6** Stellen; der „Adding skills"-Block im README des Skills-Repos committet nicht mehr mit `git add -A && git commit && git push`, sondern pfadexplizit |
| `e559a39` | `build-verify` (`SKILL.md`, `references/notes.md`), `.agents/rules/build-verify.md`, `agent-config` (`SKILL.md`, `references/snippets.md`) | **Regel 4** der Datei `.agents/rules/build-verify.md` bekommt die **Pfad-Commit-Klausel**: in einem Baum, in dem andere Sessions arbeiten, committet man mit `git commit -- <path>`, ein nackter `git commit` nimmt den **gesamten Index** (und damit die gestagede Arbeit anderer Sessions) mit, und es bleibt **nichts** gestaged liegen; `build-verify/SKILL.md` zeigt das Kommando mit den Pfaden, `references/notes.md` trägt die Begründung und eine neue Trap-Zeile; `agent-config` §6 (die Kurzform) und `references/snippets.md` (das Kommando-Template) tragen dieselbe Klausel |

**Entscheidung je Skill der Range** (je genau eine der drei Entscheidungen aus §3 des
`skills-marker`)

- **`build-verify` (`e559a39`, `33cbd00`) — `ja`, bleibt `ja`.** Die Änderung betrifft die
  **Regel**, die die Commits dieses Projekts formt.
  **Messung:** Regel 4 der Datei `.agents/rules/build-verify.md` trägt am Stand `33cbd00`
  die Pfad-Commit-Klausel (`git show 33cbd00:.agents/rules/build-verify.md | grep -c
  "git commit -- <path>"` → **1**; am Stand `5243791` → **0**; die Datei bleibt **42**
  Zeilen an allen drei Ständen), die Ausnahme aus Regel 6 steht unverändert daneben
  (`grep -c "force-with-lease"` → **1** an `5243791`, `e559a39` und `33cbd00`), und die
  Ausnahme-Klausel aus `33cbd00` nimmt die Pfad-Klausel **aus** der Repo-Policy-Ausnahme
  heraus (`grep -c "except the path-commit clause of rule 4"` → **1** an `33cbd00`, **0**
  an `e559a39` und `5243791`). Der kanonische Satz steht am Stand `33cbd00` wörtlich
  gleich an **6** Stellen (`git grep -c "The path-commit clause of rule 4 binds" 33cbd00 --
  .agents README.md` → **1** in `.agents/rules/build-verify.md`, **1** in
  `agent-config/SKILL.md`, **1** in `build-verify/SKILL.md`, **3** in
  `build-verify/references/notes.md` — Summe **6**; Scope: `.agents/` und `README.md` des
  Skills-Repos). `build-verify/SKILL.md` trägt **131** Zeilen an `5243791` und **137** an
  `e559a39` und `33cbd00` (`git diff --numstat 5243791..33cbd00 --
  .agents/skills/build-verify/SKILL.md` → **+7**/−**1**), `references/notes.md` **264**
  Zeilen an `5243791`, **286** an `e559a39` und **285** an `33cbd00` (`git diff --numstat
  5243791..33cbd00 -- .agents/skills/build-verify/references/notes.md` → **+22**/−**1**).
  Dieses Projekt trägt **keine eigene, strengere Commit-Policy** (gemessen am Vorgänger
  `e5824e9`, seitdem unverändert: `git grep -n -iE "amend|unpushed|force-with-lease|git
  add -A" e5824e9 -- AGENTS.md` → **0** Treffer; Beleg: `git diff --stat e5824e9..<stand>
  -- AGENTS.md` → ohne Ausgabe; dieser Commit schreibt die Datei nicht).
  **Was die Änderung an der Anwendung im Projekt ändert:** sie ändert **das Verfahren, nicht
  eine Projektdatei**. Die Klausel **gilt hier**, weil das Projekt in einem Baum mit
  parallelen Sessions arbeitet: dieser Commit committet mit
  `git commit -- AGENTS.skills.md AGENTS.todo.md` statt mit einem nackten `git commit`,
  nutzt kein `git add -A` und lässt danach **nichts** gestaged liegen (Index leer). Die Ausnahme-Klausel aus `33cbd00`
  bestätigt, dass die Klausel **nicht** per Repo-Policy abgeschaltet werden kann — für
  dieses Projekt ändert das **nichts**, weil es keine eigene Policy trägt; es ist die
  Absicherung eines Falls, der hier gar nicht eintreten kann. Die Klausel erzeugt **keine**
  Amend-Pflicht: die Ausnahme aus Regel 6 (`80664ab`) steht **neben** der Klausel, nicht in
  ihr, und bleibt unberührt (`grep -c "force-with-lease"` → **1** an allen drei Ständen).
- **`agent-config` (`e559a39`, `33cbd00`) — `nein`, bleibt `nein`.** Die Änderung betrifft
  §6 der Skill (`agent-config/SKILL.md`, die Kurzform der Commit-Konvention) und das
  Kommando-Template (`agent-config/references/snippets.md`).
  **Messung:** §6 der Datei `agent-config/SKILL.md` trägt am Stand `33cbd00` die Klausel in
  **einer** Zeile (`git show 33cbd00:.agents/skills/agent-config/SKILL.md | grep -c "in a
  tree with parallel sessions, commit with the paths"` → **1**; am Stand `5243791` → **0**)
  und den kanonischen Satz als Fortsetzung desselben Aufzählungspunkts
  (`grep -c "The path-commit clause of rule 4 binds"` → **1**; die Datei trägt **252** Zeilen
  an `5243791` und `e559a39`, **253** an `33cbd00`). Das Kommando-Template
  `references/snippets.md` committet mit den Pfaden (`grep -c "git commit -F - --
  <explicit path>"` → **1** an `33cbd00`, **0** an `5243791`). §6 der Datei trägt die
  Überschrift „Commit convention (agents-skills repo)" (`git show
  33cbd00:.agents/skills/agent-config/SKILL.md | grep -n "^## 6\."` → Zeile **166**) — die
  geänderte Passage ist
  die **Commit-Konvention des Skills-Repos**, keine Pflicht, die in fremden Projekten gilt.
  **Was die Änderung an der Anwendung im Projekt ändert:** **nichts** — die Skill beschreibt
  die Maschinen-Konfiguration (globale `opencode.jsonc`, MCP, Skill-Registrierung,
  Command-Templates), und dieses Projekt definiert kein Agent-Setup; die Zeile der
  Skill-Stand-Tabelle bleibt deshalb auf `nein` mit demselben Grund. Die Pflicht, die
  dieses Projekt erreicht, steht in der **Regel-Datei** und ist unter `build-verify` oben
  entschieden — nicht in §6 der Skill.
- **`README.md` des Skills-Repos (`33cbd00`) — keine Pflicht für dieses Projekt.** Die
  Datei ist **keine** Skill (kein Verzeichnis unter `.agents/skills/`), sondern die
  Anleitung des Skills-Repos für das Anlegen einer Skill („Adding skills"); der Block
  committet jetzt pfadexplizit (`git show 33cbd00:README.md | grep -c "git add"` → **1**
  an beiden Ständen `5243791` und `33cbd00` — vorher `git add -A && git commit && git
  push`, jetzt `git add .agents/skills/<id>/` … `git commit -m "feat(skill): <id>" --
  .agents/skills/<id>/`; die Datei trägt **131** Zeilen an `5243791` und **134** an
  `33cbd00`; `git diff --numstat 5243791..33cbd00 -- README.md` → **+4**/−**1**).
  **Für dieses Projekt ändert das nichts:** dessen eigene `README.md` (**111** Zeilen)
  enthält **keine** Anleitung zum Anlegen oder Veröffentlichen von Skills
  (`grep -n -iE "skill|adding skills" README.md` → **0** Treffer) — das Repo konsumiert die
  Skills des Skills-Repos, es veröffentlicht keine; die Pflicht, die hier greift, steht in
  der Regel-Datei und ist unter `build-verify` oben entschieden.

**Anker-Audit** — **alle** Anker neu belegt, gegen den **committeten** Stand (mit
`git show <rev>:<datei>` und `git grep <rev> -- <pfad>`), **nicht** gegen den Arbeitsbaum.
Diese Runde **zählt nicht neu** — sie **beweist**, dass die Anker der Zählung vom
Vorgänger-Stand `e5824e9` weiter gelten.

**Zähleinheit:** ein **Anker** = ein **Vorkommen** einer Referenz auf einen **Ort** —
eine **Datei** (Pfad), eine **Zeile** (`Datei:Zeile`), ein **Bereich**
(`Datei:Zeile–Zeile`), ein **benannter Abschnitt** einer Repo-Datei oder ein
**Suchstring** in einer benannten Repo-Datei. Nicht-Anker: Shell-Kommandos,
Commit-SHAs und -bereiche, Skill-IDs ohne Ort, API-Endpunkte und -Ereignisse,
Paket-Spezifikationen, Dateiendungslisten, Werte ohne Repo-Ort und Pfade außerhalb des
Repos. Gezählt werden **Vorkommen** (jedes Vorkommen einer Ankerform), **Zeilen**
(Zeilen mit mindestens einem Anker) und **verschiedene Ziele** (die Ziele **als
geschrieben**, je Anker einmal). **Zählung und Zähleinheit** stammen aus der Zählung am
**Vorgänger-Stand `e5824e9`** (Zustand: der committete Stand dieses Vorgängers; Umfang:
die beiden Marker-Dateien) und sind **unverändert übernommen** — diese Runde zählt nicht
neu. Die **Projektdateien**, die die Anker tragen, sind **Fremddateien** und stehen unter
Form (b) — gemessen am Vorgänger `2d772c7`, seitdem unverändert (Beleg: `git diff --stat
2d772c7..<stand> -- <pfade>` → ohne Ausgabe; dieser Commit schreibt nur `AGENTS.skills.md`
und `AGENTS.todo.md`) — und für die beiden Dateien, die dieser Commit selbst schreibt, gilt
Form (a) am committeten Stand dieses Commits.

| Umfang | Vorkommen | Zeilen | verschiedene Ziele |
|---|---|---|---|
| **Projektanker** im Marker (`AGENTS.skills.md`) | **88** | **46** | **43** |
| **Upstream-Zitate** im Marker | **46** | **31** | **24** (als geschrieben) → **13** aufgelöst |
| **Projektanker** im Board (`AGENTS.todo.md`) | **148** | **118** | **80** |
| **Upstream-Zitate** im Board | **2** | **2** | **2** |
| **Projekt + Upstream**, beide Dateien | **284** | — | — |
| Verweise auf die globale Config (`opencode.jsonc`, `~/.config/opencode/AGENTS.md`) — zählen **nicht** als Projektanker | **7** | **6** | **2** |

Die Zahlen dieser Tabelle sind die Zählung des **Vorgänger-Standes `e5824e9`**; sie gelten
unverändert, weil die **Ziele** der Anker unverändert sind — der Diff über die
**Fremddateien** des Projekts zwischen `2d772c7` und dem committeten Stand dieses Commits
ist **leer** (`git diff --stat 2d772c7..<stand> -- . ':(exclude)AGENTS.skills.md'
':(exclude)AGENTS.todo.md'` → ohne Ausgabe; Scope: alle versionierten Pfade außer den
beiden Dateien, die dieser Commit schreibt) — und die **Zitierstellen** im Upstream stehen
am neuen Cursor-Stand `33cbd00` weiter mit je **1** Treffer auf (alle am Stand `33cbd00`
gemessen): `skills-marker/SKILL.md` trägt den Anker `Bezugsrahmen-Regel` mit **1**
Treffer, `skills-marker/references/notes.md` die Abschnittsüberschrift `## Der Bezugsrahmen`
mit **1** Treffer (der Name selbst kommt in der Datei **2**-mal vor — als Überschrift und
als Verweis in der Werkzeugtabelle), `ui-review/SKILL.md` die neun Spalten der
Befundvorlage mit **1** Treffer (die alten fünf mit **0**),
`ratchet-gates/references/vocabulary.md` **fünf** Stufen, `build-verify/references/amend.md`
**63** Zeilen,
`agent-config/SKILL.md` „This repo does not take it" mit **1** Treffer. Die Commits der
Range berühren **nur** Dateien des Skills-Repos (`git log --name-only --format=
5243791..33cbd00 | sort -u` → **6** Pfade, alle unter `.agents/` oder `README.md` des
Skills-Repos), **keine** Projektdatei. Ergebnis: **0** Anker zeigen auf fremden Inhalt,
**0** sind gedriftet. **Tote** Anker sind die, die der Text selbst als tot ausweist: im
Marker **4** Vorkommen auf **3** Zielen (im Korrekturprotokoll, Nummer 2 bis 4; jede
**2**-mal zitiert), im Board **1** Vorkommen auf
**1** Ziel (`generated/types.d.ts`, ausgewiesen mit dem Zusatz „liegt nicht in diesem
Repo"). Von den **41** Zeilenankern der beiden Dateien (Datei:Zeile, Datei:Zeile–Zeile,
Datei:Zeile/Zeile und die Prosaform „Z. n") lösen **35** direkt auf und **2** über eine
Kurzform (`ci.yml:23` → `.github/workflows/ci.yml:23`); **4** sind die im
Korrekturprotokoll als tot ausgewiesenen (`client.d.ts:147-149` und `types.d.ts:3767+`,
je **2**-mal zitiert — Dateien in `node_modules`, nicht versioniert). Darunter sind die Anker auf den
wachsenden Projektdateien (`.github/workflows/ci.yml`, `.github/workflows/pages.yml`),
die Abschnittsanker auf `AGENTS.md` und die Anker auf die beiden Dateien, die der
Marker selbst schreibt (`AGENTS.skills.md`, `AGENTS.todo.md` — für diese gilt „am
committeten Stand dieses Commits"). Die **Upstream-Zitate** tragen **keine**
Zeilennummer (`git grep -nE '(skills-marker|
ui-review|build-verify|ratchet-gates|agent-config|github-ci-filters)/[^ ]*:[0-9]+|
references/[^ ]*:[0-9]+|SKILL\.md:[0-9]+' -- AGENTS.skills.md AGENTS.todo.md` → **0**
Treffer; die Upstream-Regel verbietet die Zeilennummer im Zitat) und stehen am Stand
`33cbd00` mit je **1** Treffer auf; die relativen Namen `SKILL.md` und `references/notes.md` stehen in
**vier** bzw. **zwei** Skills und werden deshalb nach dem Skill benannt aufgelöst.

**Die Korrekturen, jede mit ihrem Grund**

1. **Toter Anker** — **Marker, Skill-Stand-Tabelle, Zeile `playwright-parallel`**:
   `lock:` → `lockfileVersion` 9.0. Grund: der Token `lock:` kommt in `pnpm-lock.yaml`
   **0**-mal vor (`git show 2d772c7:pnpm-lock.yaml | grep -cF "lock:"` → **0**); belegt
   ist der Schlüssel `lockfileVersion` (**1** Treffer, `pnpm-lock.yaml:1`, Wert `'9.0'`).
   Die Behauptung der Zeile bleibt wahr — die Version des Test-Runners ist im
   Lockfile gepinnt.
2. **Toter Anker** — **Marker, Korrekturprotokoll, Nummer 2**: `client.d.ts:147-149`.
   Grund: die Datei liegt in `node_modules` und ist nicht versioniert; eine
   Zeilennummer in einer Abhängigkeit driftet mit jedem Versionswechsel. Der Anker ist
   nicht auflösbar, die **Behauptung** bleibt wahr — das Protokoll nennt das so.
3. **Toter Anker** — **Marker, Korrekturprotokoll, Nummer 3**: `types.d.ts:3767+`.
   Grund: dieselbe.
4. **Toter Anker** — **Marker, Korrekturprotokoll, Nummer 4** und **Board, Abschnitt
   „Bewusst offen/dokumentiert"**: `generated/types.d.ts`. Grund: dieselbe — die
   generierten Typen des Clients sind nicht Teil dieses Repos.
5. **Toter Anker** — **Board, Abschnitt „Skills-Stand (2026-10-21)", Schlusssatz**:
   der Verweis auf `AGENTS.skills.md`, Abschnitt „Offen aus dem Bereich
   `0449b05..4205142`" → Verweis auf **das Board selbst** („jede Position nennt ihren
   Beleg mit Rahmen; der Abschnitt des Markers wurde durch die neue Range ersetzt").
   Grund: dieser Commit **ersetzt** den genannten Abschnitt im Marker — der Verweis
   wäre ab dem committeten Stand dieses Commits tot. Er zeigte zudem auf eine Datei,
   die der Commit selbst schreibt; für sie gilt Form (a).
6. **Gedrifteter Anker** — **Board, Position 2**: „Die CI-Kommentare in `ci.yml`/
   `pages.yml` begründen das mit `ERR_PNPM_BAD_PM_VERSION`" → „… in `ci.yml` (Z. 22–23)
   und `pages.yml` (Z. 17); den Token `ERR_PNPM_BAD_PM_VERSION` trägt **nur** `ci.yml`,
   `pages.yml` verweist für denselben Grund auf `ci.yml`". Grund: gemessen am
   Vorgänger `2d772c7`, seitdem unverändert (`git grep -nF "ERR_PNPM_BAD_PM_VERSION"
   2d772c7 -- .github/workflows/` → **1** Treffer, `ci.yml:23`; `pages.yml` → **0**;
   Beleg: `git diff --stat 2d772c7..<stand> -- .github/workflows/ci.yml
   .github/workflows/pages.yml` → ohne Ausgabe) — der Token trägt nur in `ci.yml`, der
   alte Satz legte beide Dateien auf ihn.
7. **Neu belegt** — **Board, Abschnitt „Skills-Stand (2026-10-21)"**: die Range
   `5243791..33cbd00` trägt **keine neue Position** — ihre zwei Skills sind bereits
   erfasst (`build-verify` ohne Position, `agent-config` trifft nicht zu), und ihre
   beiden übrigen Dateien (`README.md` des Skills-Repos, `.agents/rules/build-verify.md`)
   sind keine Skills. Grund: die Range ist begangen, ihr Ergebnis gehört ins Board; eine
   Position entsteht nur, wenn etwas zu entscheiden ist — hier ändert sich an den
   Positionen 1 bis 5 nichts.

**Regel-Drift** (Schritt 3 des Ablaufs): in dieser Range ist **eine** Datei unter
`.agents/rules/` geändert — `.agents/rules/build-verify.md` (`git log --oneline
5243791..33cbd00 -- .agents/rules/` → **1** Commit, `33cbd00`; `git diff --numstat
5243791..33cbd00 -- .agents/rules/build-verify.md` → **+2**/−**2**; die Datei bleibt **42**
Zeilen). Die globale `~/.config/opencode/AGENTS.md` bettet **keinen** build-verify-Text
ein (`grep -n -iE "build-verify|amend|force-with-lease|unpushed"` → **0** Treffer), und
keine Projekt-`AGENTS.md` wiederholt die Regel (siehe die Messung unter `build-verify`
oben). **Nichts nachzuziehen**, kein Reload nötig — es änderte sich keine eingebettete
Pflicht.

**Lokale Ergänzung:** geprüft — das Projekt trägt **eine** eigene Zusatzregel: die
`<stand>`-Definition (Marker, Kopf; Board, Kopf). Sie ist in **beiden** Dateien als
`**Lokale Ergänzung:**` gekennzeichnet und ersetzt die gemeinsame Regel nicht. Weitere
eigene Zusatzregeln trägt das Projekt **nicht**: die Abweichungen des Abschnitts
„Fortschreiben" von der Vorlage (`skills-marker/templates/AGENTS.skills.md`) folgen der
**Regel** in `skills-marker/SKILL.md` — „Belege als stabile Referenz, Zeile nur
Lesehilfe" (§5, Schritt 5) und die Tabelle in §3 — nicht einer eigenen Zusage; die
Vorlage ist das Gerüst, die Regel ist die Fassung.

**Cursor**: `agents-skills-consumed: 33cbd00` — der Stand des Skills-Repos,
**gemessen am 2026-10-22, 06:00 UTC**. Der Cursor ist kein Rahmen; die Zitierstellen,
die dieser Marker nennt, stehen am Stand `33cbd00` mit je **1** Treffer auf, der Cursor
deckt sie.

**Ungeprüfter Rest**: **keiner** — der Stand des Skills-Repos stand am Ende der
Messung (2026-10-22, 06:07 UTC) erneut auf `33cbd00`, und `git -C <skills-repo> log
--oneline 33cbd00..HEAD` war zu diesem Zeitpunkt **leer** (Scope: alle Pfade, kein
Pfadfilter). Was danach noch landet, gehört zur nächsten Runde.

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
