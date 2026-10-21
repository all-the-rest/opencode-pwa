# Skills-Marker

agents-skills-consumed: 5243791
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

## Offen aus dem Bereich `4205142..5243791`

Geprüft 2026-10-21 gegen `5243791` — der Stand des Skills-Repos, **gemessen am
2026-10-21, 22:05 UTC**; er kann sich während des Laufs bewegen (der **ungeprüfte
Rest** steht am Ende dieses Abschnitts). **4 Commits** in der Range
(`git -C <skills-repo> rev-list --count 4205142..5243791` → **4**). Betroffen sind
**4 Skills** (Verzeichnisse unter `.agents/skills/`, dedupliziert über
`git log --name-only --format= 4205142..5243791 -- .agents/skills`): **0 neu**
(`git log --diff-filter=A --name-only --format= 4205142..5243791 -- .agents/skills`
→ leer), **0 zusätzlich versteckt** — die Skills mit `metadata.opencode/autoinvoke: false`
sind an beiden Ständen **17** und die Namensmenge identisch (`git grep -l "autoinvoke:
false" 4205142 -- .agents/skills` → **17**; dieselbe Zahl und dieselbe Namensliste an
`5243791`) —, **4 inhaltlich geändert** (`skills-marker`, `ui-review`, `build-verify`,
`agent-config`). Die Skill-Menge selbst ist an beiden Ständen dieselbe (**19**
Verzeichnisse, `git ls-tree --name-only <stand> .agents/skills/`), **entfernt** wurde
keiner (`git log --diff-filter=D --name-only 4205142..5243791 -- .agents/skills` → leer).

**⚠️ Abweichung von der Vorabmessung dieser Runde: drei Skill-Verzeichnisse wurden
vorausgesagt, gemessen sind vier.** `80664ab` fasst neben `build-verify` auch
`.agents/skills/agent-config/SKILL.md` an (die Kurzform der Amend-Ausnahme in §6).
`git log --name-only --format= 4205142..5243791 -- .agents/skills | sort -u` nennt **6**
Pfade in **4** Verzeichnissen — gezählt wird das Verzeichnis, nicht die Datei.
`agent-config` ist deshalb unten mitentschieden; die Zeile der Skill-Stand-Tabelle
ändert sich nicht (sie steht auf `nein`).

**Die Commits der Range, je mit SHA und Änderung**

| SHA | betrifft | was sich geändert hat |
|---|---|---|
| `5243791` | `skills-marker` (nur `references/notes.md`) | die acht Befunde der Verifikation von `842e055` geschlossen: die Zitate der Notizen tragen jetzt den Stand, zu dem sie gemessen wurden, die wörtlichen Belege nennen ihre Quelle am jeweiligen Stand, und die Verweise auf Quell-Kommits nennen den Pfad, den sie meinen |
| `80664ab` | `build-verify` (`SKILL.md`, `references/amend.md`, `references/notes.md`), `.agents/rules/build-verify.md`, `agent-config` (`SKILL.md`) | **Regel 6** der Datei `.agents/rules/build-verify.md` bekommt eine **Ausnahme**: der eigene, frische, bereits gepushte Commit darf per `--force-with-lease` ersetzt werden, wenn der Remote-Head genau dieser Commit ist, keine fremde Arbeit im Baum liegt und der ersetzte SHA offengelegt wird; die sechs Bedingungen, die CI-Regel und die Grenze „eine Ersetzung je Commit" stehen in `references/amend.md`; `agent-config` §6 nennt die Ausnahme und hält fest, dass **das Skills-Repo selbst** sie nicht nimmt |
| `2e09608` | `ui-review` (nur `SKILL.md`) | die Befundvorlage wird mit den **neun** Spalten zitiert statt mit fünf, und die eigene Schweregrad-Liste (vier Stufen) weicht einem **Verweis** auf das kanonische Vokabular (`ratchet-gates`, `references/vocabulary.md`, **fünf** Stufen mit `info`); die Renderkriterien bleiben in der Vorlage |
| `842e055` | `skills-marker` (nur `references/notes.md`) | ein Zitat, das in der Mitte seiner Quelle endete, trägt jetzt die Auslassung; `SKILL.md` und `templates/AGENTS.skills.md` bleiben bytegleich zu `4205142` |

**Entscheidung je Skill der Range** (je genau eine der drei Entscheidungen aus §3 des
`skills-marker`)

- **`skills-marker` (`842e055`, `5243791`) — `ja`, bleibt `ja`.** Beide Commits
  betreffen **nur** `references/notes.md`; die Regeldateien bleiben bytegleich zu
  `4205142` (sha256 über `git show <sha>:<pfad>`: `SKILL.md` →
  `eed3f1ec7c8988b6733a42d8a5e5093d1ca7b157e0bab163f450e3588e9b2fc6` und
  `templates/AGENTS.skills.md` →
  `08d8c9770cd62688cc9c28584bd9635a82b2e058555d80ce0df4e6bc62faa314`, jeweils an
  `4205142`, `842e055` und `5243791` — identisch).
  **Messung:** der Anker `Bezugsrahmen-Regel` steht am Stand `5243791` mit **1** Treffer
  in `skills-marker/SKILL.md` (`git show 5243791:.agents/skills/skills-marker/SKILL.md |
  grep -c "Bezugsrahmen-Regel"` → **1**; dieselbe Zahl an `4205142` und `842e055`), die
  Abschnittsüberschrift `## Der Bezugsrahmen` in `skills-marker/references/notes.md` mit
  **1** Treffer (`grep -c "^## Der Bezugsrahmen"` → **1**; der Name selbst kommt in der
  Datei **2**-mal vor — als Überschrift und als Verweis in der Werkzeugtabelle).
  **Was die Änderung an der Anwendung im Projekt ändert: nichts.** Die beiden Commits
  korrigieren **Zitate** in den Notizen (eine Passage, die in der Mitte ihrer Quelle
  endete, trägt jetzt die Auslassung; die Belege tragen den Stand, zu dem sie gemessen
  wurden). Die Regel, die dieses Projekt anwendet — Zitierform ohne Zeilennummer,
  Rahmenformen (a)/(b)/(c), Cursor-Klausel, Aufzählungs-Klausel,
  `**Lokale Ergänzung:**`-Kennzeichnung — steht unverändert in `skills-marker/SKILL.md`.
  Der Cursor deckt die Zitierstelle: sie steht am Stand `5243791`, der Cursor nennt
  `5243791`.
- **`ui-review` (`2e09608`) — `offen`, bleibt `offen`; die Position 5 im Board bleibt
  stehen und wird nicht geschlossen.** Board-Positionen sind Sache des Owners.
  **Messung:** `ui-review/SKILL.md` zitiert die Befundvorlage am Stand `5243791` mit den
  **neun** Spalten (`Id | Severity | Status | Owner | Ticket | File:Line | Screenshot |
  Finding | Suggested fix`; `git show 5243791:.agents/skills/ui-review/SKILL.md |
  grep -c "Id | Severity | Status | Owner |"` → **1**; am Stand `4205142` → **0**) statt mit
  den alten fünf (`grep -c "Severity | File:Line | Screenshot |"` → **1** an `4205142`,
  **0** an `5243791`); die Datei trägt **149** Zeilen an `4205142` und **145** an
  `5243791`. Für die Schweregrade steht dort jetzt ein Verweis auf das kanonische
  Vokabular: `ratchet-gates/references/vocabulary.md` trägt **fünf** Stufen
  (`grep -cE "^\| \`(critical|high|medium|low|info)\` \|"` → **5**; die Stufe `info`
  steht mit **1** Treffer in der Datei), die eigene vierstufige Liste ist weg (`grep -c "nitpicks"` → **1** an
  `4205142`, **0** an `5243791`).
  **Was die Änderung an der Anwendung im Projekt ändert:** der offenen Position 5 gibt
  sie erstmals ein **konkretes, zitierfähiges Ziel im Upstream** — Spaltenform und Vokabular stehen
  jetzt **an einer Stelle** im Skill statt an zwei. Das Board beschrieb dieses Ziel
  schon; der Upstream-Stand hat es jetzt eingeholt. Am **Projekt** ändert sie
  **nichts**: die Befundliste in `AGENTS.todo.md` §„UI-Review-Befunde" trägt weiterhin
  `hoch`/`mittel`/`niedrig` und den Status in der Behebungs-Spalte statt in einer
  eigenen Spalte (am committeten Stand dieses Commits **10** Zeilen, davon **6** mit
  „erledigt"). Genau das ist der offene Punkt der Position 5 — er bleibt offen, und
  die Änderung macht ihn **überprüfbar**, nicht erledigt.
- **`build-verify` (`80664ab`) — `ja`, bleibt `ja`.** Die Änderung betrifft die
  **Regel**, die die Commits dieses Projekts formt.
  **Messung:** Regel 6 der Datei `.agents/rules/build-verify.md` trägt am Stand `5243791`
  die Ausnahme (`git show 5243791:.agents/rules/build-verify.md | grep -c
  "force-with-lease"` → **1**; am Stand `4205142` → **0**; die Datei bleibt **42**
  Zeilen). Die Bedingungen stehen in `build-verify/references/amend.md` (am Stand
  `4205142` **25** Zeilen, am Stand `5243791` **63** Zeilen;
  `git diff --numstat 4205142..5243791 --
  .agents/skills/build-verify/references/amend.md` → **+43**/−**5**).
  **Was die Änderung an der Anwendung im Projekt ändert:** sie ändert **das Verfahren,
  nicht eine Projektdatei**. Dieses Projekt trägt **keine eigene, strengere
  Amend-Policy** (gemessen am Vorgänger `2d772c7`, seitdem unverändert:
  `git grep -n -iE "amend|unpushed|force-with-lease" 2d772c7 -- AGENTS.md` → **0**
  Treffer; Beleg: `git diff --stat 2d772c7..<stand> -- AGENTS.md` → ohne Ausgabe; dieser
  Commit schreibt die Datei nicht) — damit gilt die **allgemeine** Ausnahme hier, und
  die Repo-Policy-Klausel greift nicht. Konkret: der eigene, frische, bereits gepushte
  Commit dieser Aufgabe darf **einmal** per `--force-with-lease` ersetzt werden, wenn
  der Remote-Head genau dieser Commit ist, keine fremde Arbeit im Baum liegt und der
  ersetzte SHA im Commit-Body offengelegt wird; ein **zweiter** Ersetzungsvorgang auf
  denselben Commit ist untersagt (ein neuer Commit stattdessen), und ein grüner Lauf
  des ersetzten Commits gilt als **nichtig** — der neue SHA braucht seinen eigenen.
  Das trifft die Marker-Serie **dieses** Repos unmittelbar: der Commit `2d772c7` ist
  selbst aus **zwei** Ersetzungen entstanden (`1d473a2` → `a906c2a` → `2d772c7`, gemessen
  über `git reflog` am Stand `2d772c7`: **21:31:16**, **21:33:02**, **21:33:52**) —
  unter der neuen Regel wäre die zweite Ersetzung nicht zulässig gewesen.
- **`agent-config` (`80664ab`) — `nein`, bleibt `nein`.** Die Änderung betrifft §6 der
  Skill (`agent-config/SKILL.md`, der Klartext der globalen Verdrahtung).
  **Messung:** am Stand `5243791` nennt §6 die allgemeine Ausnahme und hält fest, dass
  **das Skills-Repo selbst** sie nicht nimmt (`git show
  5243791:.agents/skills/agent-config/SKILL.md | grep -c "This repo does not take it"` →
  **1**; am Stand `4205142` → **0**; die Datei wächst um **6** Zeilen).
  **Was die Änderung an der Anwendung im Projekt ändert:** für die **Anwendbarkeit**
  der Skill **nichts** — sie beschreibt die Maschinen-Konfiguration (globale
  `opencode.jsonc`, MCP, Skill-Registrierung, Command-Templates), und dieses Projekt
  definiert kein Agent-Setup; die Zeile der Skill-Stand-Tabelle bleibt deshalb auf
  `nein` mit demselben Grund. Für **fremde** Repos — anders als für das Skills-Repo —
  gilt die Ausnahme; das ist eine Aussage der Ausnahme selbst und keine Pflicht
  dieses Projekts (die Entscheidung `build-verify` oben trägt sie).

**Anker-Audit** — **alle** Anker neu belegt, gegen den **committeten** Stand (mit
`git show <rev>:<datei>` und `git grep <rev> -- <pfad>`), **nicht** gegen den Arbeitsbaum.

**Zähleinheit:** ein **Anker** = ein **Vorkommen** einer Referenz auf einen **Ort** —
eine **Datei** (Pfad), eine **Zeile** (`Datei:Zeile`), ein **Bereich**
(`Datei:Zeile–Zeile`), ein **benannter Abschnitt** einer Repo-Datei oder ein
**Suchstring** in einer benannten Repo-Datei. Nicht-Anker: Shell-Kommandos,
Commit-SHAs und -bereiche, Skill-IDs ohne Ort, API-Endpunkte und -Ereignisse,
Paket-Spezifikationen, Dateiendungslisten, Werte ohne Repo-Ort und Pfade außerhalb des
Repos. Gezählt werden **Vorkommen** (jedes Vorkommen einer Ankerform), **Zeilen**
(Zeilen mit mindestens einem Anker) und **verschiedene Ziele** (die Ziele **als
geschrieben**, je Anker einmal). Die Zählung gilt für den Stand, den dieser Commit
festschreibt (Form (a) für die beiden Dateien, die er schreibt); die **Projektdateien**
sind **Fremddateien** und stehen unter Form (b) — gemessen am Vorgänger `2d772c7`,
seitdem unverändert (Beleg: `git diff --stat 2d772c7..<stand> -- <pfade>` → ohne
Ausgabe; dieser Commit schreibt nur `AGENTS.skills.md` und `AGENTS.todo.md`).

| Umfang | Vorkommen | Zeilen | verschiedene Ziele |
|---|---|---|---|
| **Projektanker** im Marker (`AGENTS.skills.md`) | **88** | **46** | **43** |
| **Upstream-Zitate** im Marker | **46** | **31** | **24** (als geschrieben) → **13** aufgelöst |
| **Projektanker** im Board (`AGENTS.todo.md`) | **148** | **118** | **80** |
| **Upstream-Zitate** im Board | **2** | **2** | **2** |
| **Projekt + Upstream**, beide Dateien | **284** | — | — |
| Verweise auf die globale Config (`opencode.jsonc`, `~/.config/opencode/AGENTS.md`) — zählen **nicht** als Projektanker | **7** | **6** | **2** |

Ergebnis: **0** Anker zeigen auf fremden Inhalt, **0** sind gedriftet. **Tote**
Anker sind die, die der Text selbst als tot ausweist: im Marker **4** Vorkommen auf
**3** Zielen (im Korrekturprotokoll, Nummer 2 bis 4; jede **2**-mal zitiert), im Board
**1** Vorkommen auf
**1** Ziel (`generated/types.d.ts`, ausgewiesen mit dem Zusatz „liegt nicht in diesem
Repo“). Von den **41** Zeilenankern der beiden Dateien (Datei:Zeile, Datei:Zeile–Zeile,
Datei:Zeile/Zeile und die Prosaform „Z. n“) lösen **35** direkt auf und **2** über eine
Kurzform (`ci.yml:23` → `.github/workflows/ci.yml:23`); **4** sind die im
Korrekturprotokoll als tot ausgewiesenen (`client.d.ts:147-149` und `types.d.ts:3767+`,
je **2**-mal zitiert — Dateien in `node_modules`, nicht versioniert). Darunter sind die Anker auf den
wachsenden Projektdateien (`.github/workflows/ci.yml`, `.github/workflows/pages.yml`),
die Abschnittsanker auf `AGENTS.md` und die Anker auf die beiden Dateien, die der
Marker selbst schreibt (`AGENTS.skills.md`, `AGENTS.todo.md` — für diese gilt „am
committeten Stand dieses Commits“). Die **Upstream-Zitate** tragen **keine**
Zeilennummer (`git grep -nE '(skills-marker|
ui-review|build-verify|ratchet-gates|agent-config|github-ci-filters)/[^ ]*:[0-9]+|
references/[^ ]*:[0-9]+|SKILL\.md:[0-9]+' -- AGENTS.skills.md AGENTS.todo.md` → **0**
Treffer; die Upstream-Regel verbietet die Zeilennummer im Zitat) und stehen am Stand
`5243791` mit je **1** Treffer auf; die relativen Namen `SKILL.md` und `references/notes.md` stehen in
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
   `4205142..5243791` trägt **keine neue Position** — ihre vier Skills sind bereits
   erfasst (`ui-review` in Position 5, `skills-marker` und `build-verify` ohne
   Position, `agent-config` trifft nicht zu). Grund: die Range ist begangen, ihr
   Ergebnis gehört ins Board; eine Position entsteht nur, wenn etwas zu entscheiden
   ist — hier ändert sich an den Positionen 1 bis 5 nichts.

**Regel-Drift** (Schritt 3 des Ablaufs): in dieser Range ist **eine** Datei unter
`.agents/rules/` geändert — `.agents/rules/build-verify.md` (`git log --oneline
4205142..5243791 -- .agents/rules/` → **1** Commit, `80664ab`; `git diff --numstat
4205142..5243791 -- .agents/rules/build-verify.md` → **+2**/−**2**). Die globale
`~/.config/opencode/AGENTS.md` bettet **keinen** build-verify-Text ein
(`grep -n -iE "build-verify|amend|force-with-lease|unpushed"` → **0** Treffer), und
keine Projekt-`AGENTS.md` wiederholt die Regel (siehe die Messung unter
`build-verify` oben). **Nichts nachzuziehen**, kein Reload nötig — es änderte sich
keine eingebettete Pflicht.

**Lokale Ergänzung:** geprüft — das Projekt trägt **eine** eigene Zusatzregel: die
`<stand>`-Definition (Marker, Kopf; Board, Kopf). Sie ist in **beiden** Dateien als
`**Lokale Ergänzung:**` gekennzeichnet und ersetzt die gemeinsame Regel nicht. Weitere
eigene Zusatzregeln trägt das Projekt **nicht**: die Abweichungen des Abschnitts
„Fortschreiben" von der Vorlage (`skills-marker/templates/AGENTS.skills.md`) folgen der
**Regel** in `skills-marker/SKILL.md` — „Belege als stabile Referenz, Zeile nur
Lesehilfe" (§5, Schritt 5) und die Tabelle in §3 — nicht einer eigenen Zusage; die
Vorlage ist das Gerüst, die Regel ist die Fassung.

**Cursor**: `agents-skills-consumed: 5243791` — der Stand des Skills-Repos,
**gemessen am 2026-10-21, 22:05 UTC**. Der Cursor ist kein Rahmen; die Zitierstelle,
die dieser Marker nennt, steht am Stand `5243791` mit je **1** Treffer auf, der Cursor
deckt sie.

**Ungeprüfter Rest**: **keiner** — der Stand des Skills-Repos stand am Ende der
Messung (2026-10-21, 22:30 UTC) erneut auf `5243791`, und `git -C <skills-repo> log
--oneline 5243791..HEAD` war zu diesem Zeitpunkt **leer** (Scope: alle Pfade, kein
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
