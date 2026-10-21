# Skills-Marker

agents-skills-consumed: 4205142
geprüft am: 2026-10-21

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
genannten Stand / geändert seit ihm), das **Nomen** („Vorgänger" / „Stand") entscheidet
den Fall **nicht**.

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

## Offen aus dem Bereich `0449b05..4205142`

Geprüft 2026-10-21 gegen `4205142` — der Stand des Skills-Repos, **gemessen am
2026-10-21, 21:31 UTC**; er kann sich während des Laufs bewegen (der **ungeprüfte
Rest** steht am Ende dieses Abschnitts). **14 Commits** in der Range
(`git -C <skills-repo> rev-list --count 0449b05..4205142` — alle Pfade, kein
Pfadfilter). Davon **13** mit Bezug zu `.agents/skills/`
(`git -C <skills-repo> log --oneline --format=%h 0449b05..4205142 -- .agents/skills | wc -l`)
und **1** ohne jeden `.agents/`-Bezug (`7910ec6`, siehe unten). Betroffen sind
**3 Skills** (Verzeichnisse unter `.agents/skills/`, dedupliziert über
`git log --name-only --format= 0449b05..4205142 -- .agents/skills`): **0 neu**
(`git log --diff-filter=A --name-only --format= 0449b05..4205142 -- .agents/skills`
→ leer), **0 zusätzlich versteckt** — die Skills mit `metadata.opencode/autoinvoke: false`
sind an beiden Ständen **17** und die Namensmenge identisch (`git grep -l "autoinvoke:
false" 0449b05 -- .agents/skills` → **17**; dieselbe Zahl und dieselbe Namensliste an
`4205142`) —, **3 inhaltlich geändert** (`github-ci-filters`, `ratchet-gates`,
`skills-marker`). Die Skill-Menge selbst ist an beiden Ständen dieselbe (**19**
Verzeichnisse, `git ls-tree --name-only <stand> .agents/skills/`), **entfernt** wurde
keiner (`git log --diff-filter=D --name-only 0449b05..4205142 -- .agents/skills` → leer).

**Die Commits der Range, je mit SHA und Änderung**

| SHA | betrifft | was sich geändert hat |
|---|---|---|
| `4205142` | `skills-marker` (nur `references/notes.md`) | die **wörtlichen** Zitate der Notizen: sieben Passagen sind jetzt verbatim und tragen die Auslassung, wo die Quelle weiterläuft; die Abschnittsüberschrift „Ein Verweis trägt nur, wenn der Cursor den Stand deckt, in dem die Zitierstelle existiert" steht jetzt vollständig. **Keine Regel** ändert sich — `SKILL.md` und `templates/AGENTS.skills.md` sind bytegleich zu `857070a` (`git diff --stat 857070a..4205142 -- .agents/skills/skills-marker/SKILL.md .agents/skills/skills-marker/templates/AGENTS.skills.md` → ohne Ausgabe) |
| `857070a` | `skills-marker` | die Zitierform und die Namen der Runden: ein Zitat wird nicht in der Mitte abgeschnitten, und die Notizen tragen keine Behauptung, die sie gerade entfernt haben |
| `c056e75` | `skills-marker` (nur `references/notes.md`) | die Notizen tragen nicht mehr die Behauptung, die sie gerade entfernt haben |
| `7328fc3` | `github-ci-filters` (`SKILL.md` + `references/notes.md`) | **Schritt 2** unterscheidet jetzt **Auswahl** (die Gefahr) von **Subtraktion** (zulässig): ein `paths`-Block, dessen positiver Teil nur bestimmte Pfade benennt, **selektiert** — kein Job läuft je für eine Datei außerhalb der Auswahl, und das ohne Fehler (verboten); ein `paths`-Block, dessen positiver Teil den Catch-all `'**'` enthält, **subtrahiert** nur und ist zulässig, wenn der Owner das entschieden hat. **Schritt 4** verlangt **benannte Diff-Endpunkte** (`git diff --stat <sha-before>..<sha-after> -- .github/workflows/`): der Arbeitsbaum-Diff (`git diff -- .github/workflows/`) misst den uncommitteten Zustand und liefert nach dem Commit nichts. **Schritt 1** verlangt den Lücken-Sweep in **jedem** Prüfverzeichnis |
| `37cefe2` | `skills-marker` | das Nomen entscheidet den Fall nicht (die Formen (b) und (c) unterscheiden sich an der **Zeitform**), und eine **Aufzählung** trägt zwei Behauptungen: jedes genannte Element trägt die Eigenschaft **und** die Liste ist die ganze Menge — beide sind zu belegen; eine handgepflegte Aufzählung wird durch ein Kommando ersetzt, das die Menge ableitet |
| `820c140` | `skills-marker` | die sieben Befunde der Runde-5-Verifikation geschlossen |
| `f7b8f9c` | `skills-marker` | die Rahmen (a)/(b)/(c) präzisiert und der Cursor auf die Zitierstelle gepinnt |
| `65fbecc` | `skills-marker` | drei fehlende Klauseln und die Zitierform — **der Anker `Bezugsrahmen-Regel` kam mit diesem Commit** (`git grep -c "Bezugsrahmen-Regel" 0449b05 -- .agents/skills/skills-marker/SKILL.md` → **0**; an `65fbecc` → **1**) |
| `992a9eb` | `skills-marker` | der dritte Rahmenfall bekommt seinen eigenen Beleg |
| `7341bb0` | `skills-marker` | der dritte Rahmenfall in die Regelkopien getragen |
| `21b29e4` | `skills-marker` | die Befunde der Marker-Regel-Verifikation geschlossen |
| `e523df9` | `skills-marker` | der Stand, in dem eine Behauptung gemessen wurde, wird benannt (der Rahmen kam in die Regel) |
| `7910ec6` | **kein Skill** | berührt nur `AGENTS.todo.md` im Skills-Repo (Entscheidung: die Befunde der Website sind umgezogen — die Neubewertung lebt dort) |
| `d5dc52f` | `ratchet-gates` (nur `references/cli.md`) | die CLI-Karte bekommt das Release-Kommando (`ratchet release`), und die Release-Aussage hat sich **umgedreht**: „**No tag was pushed yet** … build from source" → „The releases are published: every version tag carries the assets of five platforms and a `checksums.txt`" |

**Entscheidung je Skill der Range** (je genau eine der drei Entscheidungen aus §3 des
`skills-marker`)

- **`github-ci-filters` (`7328fc3`) — `ja`, bleibt `ja`.** Die Änderung betrifft die
  **Regel**, die dieses Projekt selbst festlegt: seine beiden Workflows tragen einen
  Pfadfilter. Was die Änderung an der Anwendung im Projekt ändert:
  (a) **Die Filterform trägt die neue Regel.** Das Projekt benutzt `paths-ignore` mit
  dem Muster `'**/*.md'` — die Form hat **keinen** positiven Teil und **subtrahiert**;
  das ist die Form, die die neue Regel erlaubt. Die Gefahr der neuen Regel ist die
  **Auswahl** (ein `paths`-Block, dessen positiver Teil nur bestimmte Pfade nennt);
  diese Form kommt im Projekt **nicht** vor — das Repo hat **keinen** `paths:`-Block
  (gemessen am Vorgänger `2f32095`, seitdem unverändert: `git grep -n "paths:" 2f32095
  -- .github/workflows/` → **0** Treffer; Beleg: `git diff --stat 2f32095..<stand> --
  .github/workflows/ci.yml .github/workflows/pages.yml` → ohne Ausgabe). Die
  `paths-ignore`-Blöcke stehen in `ci.yml` unter `push` **und** `pull_request` (Z. 6–7
  und 10–11) und in `pages.yml` unter `push` (Z. 6–7), `workflow_dispatch` bleibt
  ungefiltert. Damit greift die neue Regel an keiner Stelle dieses Projekts.
  (b) **Der Diff-Beleg trägt den neuen Schritt-4-Befehl.** Jedes `git diff`-Kommando,
  das in Marker und Board einen **Beleg** trägt, nennt **zwei Endpunkte**
  (`git diff --stat <sha>..<stand> -- <pfad>` bzw. `git diff --name-only <base> <head>`);
  **kein** Beleg misst den Arbeitsbaum — die Arbeitsbaum-Form `git diff --
  .github/workflows/` steht nur als **Zitat** der verbotenen Form im Text (in der
  Range-Tabelle und in diesem Absatz) und trägt keinen Beleg.
  (c) **Schritt 1 verlangt den Lücken-Sweep in jedem Prüfverzeichnis** — das Projekt hat
  ein zweites Prüfverzeichnis, das der bisherige Sweep des Boards nicht abdeckt: `src/`
  (vitest: `include: ["src/**/*.test.{ts,tsx}]`, `vite.config.ts`). Der erweiterte Sweep
  ist neu gemessen (am committeten Stand dieses Commits, gemessen ohne Checkout:
  `git archive <stand> | tar -x -C <tmpdir>`, dann dieselben Kommandos im ausgepackten
  Baum): `grep -rn "AGENTS\|\.md\|docs/" tests scripts .github src` → **38** Treffer in **20** Dateien (der bisherige Sweep `tests scripts .github` → **18** in **9**; der
  repo-weite Sweep mit quotierten `--include`-Globs → **21** in **10**; der repo-weite
  Sweep ist eine Teilmenge des erweiterten, die Vereinigung ist **38** Fundstellen in
  **20** Dateien). **0** davon öffnen eine Repo-`.md` als Eingabe: die Treffer in `src/`
  sind Kommentare (`features/05-parity.md`), Mock-Dateieinträge (`README.md`,
  `notizen.md`), die **Dateiendungs**-Liste in `src/lib/promptAttachments.ts:66–67`
  (`.md`, `.mdx` neben `.txt`, `.pdf` für den Datei-Picker) und der Kommentar in
  `scripts/check-i18n.mjs:6`. Die Zeile des Markers ändert sich nicht; die offene
  Position 1 des Boards bleibt, wie sie ist.
- **`ratchet-gates` (`d5dc52f`) — `offen`, bleibt `offen`; die Board-Position 4 bleibt
  sachlich richtig.** Die Änderung betrifft **nur** `references/cli.md` (die CLI-Karte
  und der Installationsabschnitt) — die **Gate-Substanz** (`SKILL.md`,
  `references/vocabulary.md`, `references/check-tiers.md`,
  `references/generated-docs.md`, `references/ratchet-baselines.md`) ist unverändert
  (`git diff --stat 0449b05..4205142 -- .agents/skills/ratchet-gates/` → genau
  `references/cli.md`, **+7**/−**3**). Was die Änderung an der Anwendung im Projekt
  ändert: **nichts** — die umgedrehte Release-Aussage ist eine Aussage über das
  **Werkzeug**, nicht über eine Pflicht dieses Projekts; das Projekt benutzt die
  `ratchet`-CLI **nicht** (gemessen am Vorgänger `2f32095`, seitdem unverändert:
  `git grep -n "ratchet" 2f32095 -- package.json scripts/ AGENTS.md tests/ src/
  .github/` → **0** Treffer; Beleg: `git diff --stat 2f32095..<stand> -- package.json
  scripts/ AGENTS.md tests/ src/ .github/` → ohne Ausgabe). **Selbstbezug geprüft:** der Marker
  und das Board wiederholen die **alte** Release-Aussage **nicht** — die Fundstellen von
  „release"/„Tag"/„published" in den beiden Dateien sind `minimumReleaseAgeExclude`
  (`node-deps`, je Datei **2** Vorkommen) und die Entscheidung, dass die Karte in der
  Skill bleibt, während die CLI ein eigenes Repo bekommt (`~/dev/ratchet-cli`); das
  steht im Einklang mit der neuen Karte, deren Handbuch das README von
  `all-the-rest/ratchet-cli` ist. Die offenen Punkte der Position 4 sind die Gates
  selbst (Boolean statt Zähler, Lückenliste, Owner und Ticket) — vom Werkzeug-Download
  unabhängig.
- **`skills-marker` (11 Commits) — `ja`, bleibt `ja`.** Die Regel selbst hat sich
  mehrfach geändert: die Zitierform, die `**Lokale Ergänzung:**`-Kennzeichnung, die
  Rahmenformen (a)/(b)/(c), die Cursor-Klausel und die Aufzählungs-Klausel. Was die
  Änderung an der Anwendung im Projekt ändert:
  (a) **Die Zitierstelle existiert erst ab `65fbecc`** — am alten Cursor `0449b05`
  löst der Anker **nicht** auf (`git grep -c "Bezugsrahmen-Regel" 0449b05 --
  .agents/skills/skills-marker/SKILL.md` → **0** Treffer; an `65fbecc` → **1**; an
  `4205142` → **1**). Die Vorrückung macht die Zitierstelle **im Frame** auflösbar: sie
  steht im Kopf des Markers, und der Cursor deckt den Stand, an dem sie existiert.
  (b) **Die Kopf-Kurzform** des Markers wird an die Zitierstelle angeglichen: die drei
  Formen tragen jetzt die **Zeitform** (unverändert seit / geändert seit), und der
  genannte SHA ist der **Messstand** (ein Vorfahr, nicht zwingend der direkte
  Vorgänger). Das Nomen entscheidet den Fall nicht.
  (c) **Die `**Lokale Ergänzung:**`-Kennzeichnung** — die einzige eigene Zusatzregel
  des Projekts ist die `<stand>`-Definition; sie ist als lokale Ergänzung gekennzeichnet
  (Marker, Kopf; Board, Kopf) und ersetzt die gemeinsame Regel nicht. Die übrigen
  eigenen Angaben (die Legende der drei Verdiktwerte, das „Fortschreiben"-Gerüst) sind
  keine Zusatzregel, sondern die Form der Datei.
  (d) **Die Cursor-Klausel** — der Cursor bleibt, was er ist: er nennt den
  **konsumierten** Stand und wird nicht zum Rahmen einer Aussage. Er rückt aber vor,
  bis er den Stand deckt, an dem die Zitierstelle existiert; die Range dazwischen
  (`0449b05..4205142`) ist begangen — das ist der Abschnitt, den diese Datei führt.
  (e) **Die Aufzählungs-Klausel** — die Skill-Stand-Tabelle trägt zwei Behauptungen;
  die zweite („die Liste ist die ganze Menge") ist jetzt durch ein Kommando belegt:
  `git -C <skills-repo> ls-tree --name-only 4205142 .agents/skills/` → **19**
  Verzeichnisse, und die Tabelle trägt **19** Zeilen — die Namensmengen sind identisch
  (am Stand, den der Cursor nennt). Damit trägt die Tabelle beide Behauptungen, nicht
  nur die erste.

**Anker-Audit** — **alle** Anker neu belegt, gegen den **committeten** Stand (mit
`git show <rev>:<datei>` und `git grep <rev> -- <pfad>`), **nicht** gegen den Arbeitsbaum.

**Zähleinheit:** ein **Anker** = eine Referenz des Markers auf ein Artefakt, die einen
**Ort** benennt — eine **Datei** (Pfad), eine **Zeile** (`Datei:Zeile`) oder ein **Bereich**
(`Datei:Zeile–Zeile`, ein benannter Abschnitt, ein Suchstring). Gezählt werden
**Vorkommen** (jedes Vorkommen einer Ankerform), **Zeilen** (Zeilen mit mindestens einem
Anker) und **verschiedene Ziele** (die Ziele **als geschrieben**, je Anker einmal).
Upstream-Zitate stehen in **Ankerform** (Pfad im Skill + Ankertext, **ohne Zeilennummer** —
sie driftet); **keines** der Upstream-Ziele trägt eine Zeilennummer. Gemessen am Stand
`56c9a67` (dem Vorgänger dieses Commits) — die beiden Dateien schreibt der Commit selbst,
darum trägt die Zählung keinen Vorgänger-Rahmen (Form (a)/(c), nicht (b)).

| Umfang | Vorkommen | Zeilen | verschiedene Ziele |
|---|---|---|---|
| **Projektanker** im Marker (`AGENTS.skills.md`) | **133** | **87** | **33** |
| **Upstream-Zitate** im Marker | **17** | **10** | **16** |
| **Projektanker** im Board (`AGENTS.todo.md`) | **135** | **110** | **61** |
| **Upstream-Zitate** im Board | **2** | **2** | **2** |
| **Projekt + Upstream**, beide Dateien | **287** | **183** | **89** |
| Verweise auf die globale Config (`opencode.jsonc`, `~/.config/opencode/AGENTS.md`) — zählen **nicht** als Projektanker | **6** | **6** | **3** |

Ergebnis: von den **89** verschiedenen Zielen lösen **86** auf. Von den **73**
Projektzielen (als geschrieben) treffen **61** eine Datei **dieses** Repos **am
committeten Stand** `56c9a67` direkt, **9** lösen über eine Kurzform, einen Glob oder
einen Mock-Dateinamen auf eine Datei dieses Repos auf (`.github/workflows/*.yml`,
`chatGrouping.ts`, `ci.yml`, `docs/diff-notes.md`, `messages.js`, `notizen.md`,
`pages.yml`, `ui-screenshots.spec.ts`, `w19-docks-lists-tabs.spec.ts`), und **3** waren
**tot** (siehe unten). Die **16** Upstream-Ziele lösen am Stand `4205142` auf (alle
genannten Pfade existieren dort); die **zitierten** Anker — Pfad im Skill + Ankertext,
**ohne** Zeilennummer — stehen dort mit **je 1** Treffer (`Bezugsrahmen-Regel` in
`skills-marker/SKILL.md`, `## Der Bezugsrahmen` in `skills-marker/references/notes.md`).
**0** Anker sind **gedriftet** (kein Anker zeigt auf fremden Inhalt). **2** Ziele nennen **Maschinen-Zustand** und sind am committeten
Stand nicht prüfbar: `core.hooksPath=.githooks` (lokale `.git/config`) und der CodeGraph-Index
unter `.codegraph/` (versioniert ist dort nur `.codegraph/.gitignore`) — beide sind auf
dieser Maschine vorhanden (`git config --local core.hooksPath` → `.githooks`;
`ls .codegraph/` → `codegraph.db`, `daemon.log`).

**Die Korrekturen, jede mit ihrem Grund**

1. **Rahmen (Selbstbezug)** — **Board, Position 5**: „gemessen am Vorgänger `c86138b`,
   seitdem unverändert" → „gemessen am Stand `c86138b`". Grund: die Messung misst
   `AGENTS.todo.md`, und **diese Datei schreibt der Commit selbst** — „seitdem
   unverändert" gilt für die Datei nicht mehr, und eine Messung, deren Umfang der Commit
   selbst schreibt, trägt keinen Vorgänger-Rahmen. Ersetzt durch „alle Werte, jeder mit
   seinem Stand": am Stand `c86138b` **10** Zeilen / **6** mit „erledigt", am committeten
   Stand dieses Commits dieselben Werte (die Tabelle hat dieser Commit nicht geändert;
   `git diff --stat c86138b..<stand> -- AGENTS.todo.md` → **mit** Ausgabe, weil der Commit
   das Board schreibt).
2. **Form (c) statt Mischform** — **Board, Position 4**: „gemessen an `c737d17`" → „gemessen
   am Stand `c737d17`" (**1**×) und „am Endstand `ddd15a4`" → „gemessen am Stand
   `ddd15a4`" (**2**×). Grund: die drei kanonischen Formen sind (a), (b) und (c) —
   „gemessen am Stand `<sha>`"; das **Nomen** entscheidet den Fall nicht, die **Zeitform**
   schon.
3. **Toter Anker** — **Board, Welle-7-Entscheidung 2**: `client.d.ts:147-149` → „der Client
   `@opencode/client@2.0.23` (Version im Lockfile, `pnpm-lock.yaml`) kennt unter `project`
   genau `list` und `update`". Grund: die Datei liegt in `node_modules` und ist nicht
   versioniert; eine Zeilennummer in einer Abhängigkeit driftet mit jedem Versionswechsel
   — der Anker ist damit nicht auflösbar, die **Behauptung** bleibt wahr (am installierten
   Client `2.0.23` trägt `project` genau `list` und `update`).
4. **Toter Anker** — **Board, Welle-7-Entscheidung 2**: `types.d.ts:3767+` → „`SessionCreateInput`
   — Typ des Servers, nicht in diesem Repo". Grund: dieselbe.
5. **Toter Anker** — **Board, „Bewusst offen/dokumentiert"**: `generated/types.d.ts` → „den
   generierten Typen des Clients (`generated/types.d.ts` liegt nicht in diesem Repo)".
   Grund: dieselbe — die Behauptung bleibt wahr (der installierte Client `2.0.23` trägt
   **kein** `todo`-Symbol).
6. **Neu belegt** — **Board, Position 1**: der Step-1-Sweep des Boards deckte `src/` nicht ab;
   nach der neuen Regel der Skill ist der Lücken-Sweep in **jedem** Prüfverzeichnis zu
   fahren. Erweitert und neu gemessen (s. o.): **38** Treffer in **20** Dateien, **0** davon
   öffnen eine Repo-`.md` als Eingabe.
7. **Neu belegt** — **Board, Position 1**: „`paths` und `paths-ignore` stehen nie am selben
   Event" — neu belegt: das Repo hat **keinen** `paths:`-Block (gemessen am Vorgänger
   `2f32095`, seitdem unverändert: `git grep -n "paths:" 2f32095 -- .github/workflows/` →
   **0** Treffer).
8. **Neu belegt** — **Marker, Kopf**: die Kurzform der drei Formen an die Zitierstelle
   angeglichen (die **Zeitform** unterscheidet (b) und (c), der genannte SHA ist der
   **Messstand**).
9. **Neu belegt** — **Marker, Skill-Stand-Tabelle**: die zweite Behauptung der Aufzählung
   („die Liste ist die ganze Menge") ist jetzt durch ein Kommando belegt (s. o.).
10. **Vor dem Ersetzen geprüft** — die Anker des ersetzten Bereichs-Abschnitts (`787670a..0449b05`)
    wurden geprüft, **bevor** der Abschnitt durch die neue Range ersetzt wurde: **keiner**
    zeigte auf fremden Inhalt. Die beiden Formfehler dieses Abschnitts (der Vorgänger-Rahmen
    der UI-Review-Tabelle und die Mischformen „gemessen an" / „am Endstand") sind dort
    behoben, wo die Aussage weiterlebt — im Board (Positionen 4 und 5); die W3-Evidenz
    trägt jetzt allein das Board, der Marker-Abschnitt ist durch die neue Range ersetzt.

**Regel-Drift** (Schritt 3 des Ablaufs): in dieser Range ist **keine** Datei unter
`.agents/rules/` geändert (`git log --oneline 0449b05..4205142 -- .agents/rules/` → ohne
Ausgabe). Die globale `~/.config/opencode/AGENTS.md` bettet nur die Frage-Regel ein
(„every question to the user — even an open one — goes through the `question` tool with
suggested answers", Verweis auf `.agents/rules/ask.md`) — die Quelle ist unverändert, die
Pflicht ist abgedeckt. **Nichts nachzuziehen.**

**Sprache**: Die **Commit-Bodies** der Marker-Serie sind **nicht einheitlich englisch**. Die
Serie wird **abgeleitet**, nicht handgepflegt:
`git log --oneline --grep='^docs(skills):' --grep='^docs(agents):'` — am Stand `56c9a67`
**12** Commits, am committeten Stand dieses Commits **13** (die Serie wächst um genau
diesen Commit, dessen Subject mit `docs(skills):` beginnt). **Zwei** davon tragen einen
deutschen Body: `c737d17` (**19** Treffer) und `45cb323` (**53**); die übrigen **10**
tragen **0** bis **4** (der größte englische Wert ist **4**, `a3e4a9f`); der Body dieses
Commits ist englisch — am committeten Stand dieses Commits sind es **11** englische und
**2** deutsche Bodies. Der Schwellwert **11** ist aus der Lücke abgeleitet, nicht gesetzt:
die Lücke zwischen dem größten englischen (**4**) und dem kleinsten deutschen (**19**) Wert
ist **[5, 18]**, jeder Wert darin klassifiziert alle Commits der Serie am Stand `56c9a67`
identisch (die Klassifikation ist robust, offen war nur die Provenienz des Cutoffs); **11**
ist die untere der beiden mittleren Ganzzahlen der Lücke (Mitte **11.5**) und hält den
kleinsten Abstand zu beiden Clustern bei **7** Treffern (**7** zum englischen, **8** zum
deutschen). Jeder Commit wird über das Rohformat bestimmt (`git cat-file commit <sha>`;
Body = alles nach der Leerzeile, die dem Subject folgt) und über einen Schwellwert
deutscher Funktionswörter
(`git cat-file commit <sha> | sed '1,/^$/d' | sed 's/`[^`]*`//g' | grep -oiE '\b(und|nicht|oder|aber|auch|noch|nur|schon|werden|wird|kein|keine|sich|beim|durch|einer|einem|einen|ohne|wenn|weil|dann|sowie|haben|sind|bleibt|trägt|gilt)\b' | wc -l` ≥ **11** → deutscher
Body; der zweite `sed` streicht die Code-Spuren, damit sich die Wortliste im Body des
Mess-Commits nicht selbst zählt). **Belege aus der Menge** (nicht die ganze Menge):
`1f73917` zitiert die Regel ausdrücklich („in the file's language (English, per rule 1)"),
`4507c4a` und `73c032f` schreiben englisch, obwohl sie deutsche Dateien ändern. Der Body
des Commits, der diese Datei schreibt, ist englisch — **am Body des jeweils schreibenden
Commits mit demselben Kommando gemessen**, nicht aus einer Liste abgeleitet: das ist eine
Eigenschaft, die am schreibenden Commit neu gemessen wird, und kein Element einer Liste.
Die **Marker-Datei selbst bleibt deutsch** — vorbestehender Zustand, keine Übersetzung.

**Ungeprüfter Rest**: **`842e055`** — nach der Messung gelandet
(`git -C <skills-repo> log --oneline 4205142..HEAD` → **1** Commit: „docs(skills-marker):
the body quotes as it stands, and the findings carry the commit they come from"). Er ist
**nicht** in die Range dieses Abschnitts eingegangen: der Cursor nennt den Stand, **bis zu
dem** geprüft wurde; die Prüfung von `842e055` gehört zur nächsten Runde.

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
