# AGENTS.todo.md

Stand: 2026-10-21 (Welle 6 + Welle 7 eingetragen; Skills-Stand aus dem Bereich
`787670a..0449b05`, aus dem Bereich `0449b05..4205142` und aus dem Bereich
`4205142..5243791` eingetragen). Nur offene
TODOs (veraltete Einträge bereinigt: Parität-Batches, Deep-Link-Paste, Prozess-Regel und
Userscripts-Verdikt sind umgesetzt/dokumentiert).
UI-Review-Befunde 1, 2, 6, 7 und 9 sind mit Welle 6 erledigt (Details in
`features/05-parity.md`, Abschnitt „Messenger Chat + Running Strip +
Basic/Experte"); Befund 8 (Projektseite: Pfad + Farbe) mit Welle 7.
Welle 7 ist umgesetzt und verifiziert (lint 0, vitest, build, e2e inkl. Mobile,
Screenshots) — die letzte Code-Welle; danach stehen nur noch die **sieben** offenen
Checkbox-Punkte unten (`git show <stand>:AGENTS.todo.md | grep -c '^- \[ \]'` → 7;
**Lokale Ergänzung:** `<stand>` = der committete Stand dieses Commits — Datei-Stand,
den dieser Commit festschreibt; der Board wird von diesem Commit geschrieben, `git diff
--stat c86138b..<stand> -- AGENTS.todo.md` → mit Ausgabe, ein Vorgänger-Vergleich des
Boards trägt deshalb nicht (Regel: `skills-marker/SKILL.md` → „Bezugsrahmen-Regel");
bei Welle 4, Welle 5 und der Baum-Verfeinerung steht der Vermerk schon im Text,
ihre Box ist aber nicht abgehakt — Welle 4 und Welle 5 tragen „erledigt", die
Baum-Verfeinerung trägt „Implementiert" (Beleg je Block am committeten Stand,
inhaltsverankert statt über Zeilennummern — die Bereichsgrenzen stehen am Text des
jeweiligen Blocks, nicht an einer Zeilenzahl):
`git show <stand>:AGENTS.todo.md | sed -n '/^- \[ \] \*\*Welle 4 /,/a4d43c7/p' | grep -o "erledigt" | wc -l` → **1**;
`git show <stand>:AGENTS.todo.md | sed -n '/^- \[ \] \*\*Welle 5 /,/; Details in/p' | grep -o "erledigt" | wc -l` → **1**;
`git show <stand>:AGENTS.todo.md | sed -n '/^- \[ \] \*\*Baum-Verfeinerung /,/2b — Ordnerketten komprimieren/p' | grep -o "erledigt" | wc -l` → **0**,
dasselbe Kommando mit `Implementiert` → **1**) plus die
vier offenen
Skills-Positionen aus dem Abschnitt unten (Position 1 ist am 2026-10-21 geschlossen
und abgehakt; die Nummern 2 bis 5 bleiben stehen).

## Navigation (Owner-Entscheidung 2026-10-07, umgesetzt)

Umgesetzt und verifiziert (lint 0, vitest 233/233, build ok, e2e 117/117);
Details in `features/04-projects.md` (Navigation). Streaming-Inspector für
Agenten-Aktivität: **umgesetzt und verifiziert** (Welle 8) — die Live-Messung am
Server des Owners zeigte `session.reasoning.delta` mit 92 Frames in 12 Sekunden
(ein früheres Fenster: 174 Frames in 20 Sekunden), während
`session.message.content.updated` in denselben Fenstern 0 Frames lieferte
(Owner 2026-10-09: „ich möchte das denken sehen"). Die Delta-Frames
(`session.text.delta`, `session.reasoning.delta`, `session.tool.input.delta`)
werden jetzt in den Chat gefaltet und der aufklappbare Denk-Block ist offen,
solange der Stream schreibt; die exakten Feldformen (Text/Reasoning über
`ordinal`, `tool.input.delta` über `id`) stehen in `features/05-parity.md`
(Abschnitt „Live delta folding") und sind live belegt. Delta-Frames landen nie
im Cache — ein Reload mitten im Lauf zeigt keinen halb gestreamten Stand.

## Offen

- [ ] Remote-Zugriff live nachtesten: `remote-code` in der PWA anlegen (User `AUTH_USER` + Login-Passwort — Credential-Regel 2026-10-08, Details in `features/06-remote-access.md` §5-Addendum), Verbindungstest + Schritte 3–12 aus `docs/manual-device-test.md`. VPS-seitig erledigt (Caddy Basic-Gate auf die Login-Kennung + CORS, verifiziert 2026-10-08; davor Server-Passwort, verifiziert 2026-10-07).
- [x] Auth-Fehler-Banner mit Direkt-Link zum Bearbeiten der Zugangsdaten — **erledigt und
      verifiziert**: der Banner verlinkt bei Auth-Fehlern auf `/settings?edit=<serverId>`
      (`src/components/ServerErrorBanner.tsx`), und die Server-Seite hat die Aktion
      „Server bearbeiten" (`src/pages/ServerDetail.tsx`, `server-edit-button`).
- [ ] Echter Geräte-Test: PWA-Install + Offline/SW auf realem Handy (nur Config + `dist` verifiziert).

### Welle-5-Entscheidungen (Owner abwesend, vom Orchestrator dokumentiert)

1. **Todo-Dock: Slot bleibt** (leer, mit `EXTENSION_POINT_TODOS` markiert) — es gibt nachweislich kein
   Todo-Symbol im installierten Client. Entfernt wird er erst, wenn ein Endpunkt existiert.
2. **„Bearbeiten" einer Eingangsbox-Zeile** lädt den Text in den Composer — es gibt keinen
   Text-Update-Endpunkt (`SessionInboxUpdateInput` trägt nur `delivery`). Bleibt so.
3. **Cmd/Ctrl+1…9**: nur Cmd (macOS) bzw. Meta (Linux) erreichen die App zuverlässig, Ctrl+1…9 frißt
   der Browser als Tab-Wechsler. E2E prüft `Meta+2`. Bleibt so, dokumentiert.
4. **Revert-Dock** erscheint erst nach dem Bereitstellen; das Staging mit Nachrichten-Wahl bleibt im
   „Mehr…"-Panel. Bei Bedarf folgt ein Picker im Dock.
5. **Ungelesen-Punkt** leert sich beim Öffnen; ein „als gelesen markieren"-Endpunkt existiert nicht.

### Welle-6-Entscheidungen (Owner abwesend, vom Orchestrator dokumentiert)

1. **Laufzeit-Anker**: `session.active` trägt keinen Zeitstempel, der Streifen nimmt die `time.created`
   der Session-Zeile. Für frisch gestartete Subagenten ist das der Laufbeginn, für eine langlebige
   Session ihr Alter. Die Alternative (letzte Prompt-Zeit aus den Nachrichten) kostet pro Zeile einen
   Request — bleibt draußen, bis es jemand braucht.
2. **Die offene Session fehlt bewusst** in der Subagent-Liste des Streifens: ihr Zustand ist der
   Chat-eigene Laufzustand, eine Zeile „zu dieser Session" trüge nichts bei.
3. **Gruppierungs-Lücke**: 30 Minuten Stille trennt Gruppen (`chatGrouping.ts`). WhatsApp trennt nie;
   wir trennen, damit ein Gespräch am nächsten Tag nicht wie ein Block wirkt. Konstante ist ein
   Kandidat für eine Einstellung.
4. **Anhänge im Modus Einfach**: Drag & Drop funktioniert in beiden Modi, der Datei-Picker steht im
   Experte-Modus. Wenn Anhänge zur Grundausstattung zählen sollen, wird nur der Picker sichtbar
   geschaltet.

### Welle-7-Entscheidungen (Owner abwesend, vom Orchestrator dokumentiert)

1. **Baum nur, wenn er etwas zeigt** (`buildProjectTree`, `src/lib/projectTree.ts`):
   mehrere Wurzeln oder ein Projekt, das Eltern eines anderen Projekts ist → Baum.
   Geschwister unter einer gemeinsamen Wurzel (der reale Setup-Fall:
   `/projects/*`) bleiben flach — die Wurzel doppelt sich nur. Projekte ohne
   kanonischen Pfad bleiben flache Zeilen unter dem Baum (`unpathed`).
2. **Neues Projekt = Session im Ordner.** Die Client-Library hat keinen
   Projekt-Create-Endpoint — der Client `@opencode/client@2.0.23` (Version im
   Lockfile, `pnpm-lock.yaml`) kennt unter `project` genau `list` und `update` —,
   also
   legt der Server-Ordner-Picker eine Session mit
   `location: { directory }` an (`SessionCreateInput` — Typ des Servers, nicht in
   diesem Repo) —
   so entsteht ein Projekt auch im Original. Nicht offline verifizierbar: ob ein
   Server für ein fabrikneues Verzeichnis einen Projekt-Eintrag anlegt; das ist
   Server-Verhalten, das E2E mockt es.
3. **Farbe, nicht Emoji/URL.** `ProjectUpdateInput.icon` kann `url`/`override`/
   `color`; die UI setzt bewusst nur die Farbe (Palette in
   `ProjectRenameForm`). Ein Emoji/URL-Override ist im selben Payload möglich,
   braucht aber eine eigene Laden/Anzeigen-Entscheidung — offen, bis es jemand
   braucht.
4. **Anlegen nur auf der Server-Seite.** Der Picker hängt an der Projekte-Karte
   von `/servers/:id` (`new-project-button`); auf der Projektseite selbst macht
   ein neues Projekt keinen Sinn, im Sidebar wäre er redundant.
5. **Live-Sync**: `project.updated` trägt das vollständige Projekt im Payload
   (`useProjectSync` patcht die Liste); der 5s-Refresh von `useLiveRefresh`
   bleibt das Netz für verlorene Events.

## UI-Review-Befunde (Screenshot-Review, 2026-10-08 — aus allen 44 Captures)
Reihenfolge = Behebungsreihenfolge, „W5/W6/W7" = in welcher Welle sie mitkommen.

| # | Schwere | Fund (Capture) | Behebung | Welle |
|---|---|---|---|---|
| 1 | hoch | Picker-Fehler klebt als roter Banner, Agent/Modell-Auswahlen bleiben auf „Keiner/Keines" (`session-diff.png`, `chat-running-sec0.png`) — erster Ladefehler wird nie aufgeräumt | **erledigt (W6)**: Retry + Toast statt Banner, Auswahlen zeigen „Lädt…"; Ursache war der `.data`-Unwrap im Client-SDK-Pfad | W6 |
| 2 | hoch | Offline doppelt alarmiert (roter Picker-Banner + gelber Offline-Banner), Composer bleibt bedienbar (`session-offline.png`) | **erledigt (W6)**: eine Statuszeile, Senden offline gesperrt | W6 |
| 3 | hoch | Serverdetail leer: 4 gleich hohe Karten mit ~700 px Leerraum (`empty/desktop/server-detail.png`) | nur Karten mit Inhalt rendern | W5 |
| 4 | mittel | Doppelter Willkommens-CTA auf dem leeren Dashboard (`empty/mobile/dashboard.png`) | eine Willkommenskarte | W5 |
| 5 | mittel | Diff-Tab öffnet eingeklappt, gerenderte Hunks nicht sichtbar (`session-diff.png`) | erste Datei aufgeklappt, Diff inline | W5 |
| 6 | mittel | Agenten-Übersicht: Modellspalte „Unbekannt", **keine Laufzeit** (`agents.png`) | **erledigt (W6)**: Modell-Lookup (gleiche SDK-Ursache wie #1), Laufzeit je Zeile („läuft 4:12"), Desktop mit Startzeit/Projekt | W6 |
| 7 | mittel | Chat wirkt nicht wie Messenger: Assistant ist eine durchgehende dunkle Karte (`chat-steps-sec0.png`) | **erledigt (W6)**: Text als eigene Bubble, Tools als Karten, Tages-Trenner, Gruppierung, Bubble-Enden, Kurzaktionen | W6 |
| 8 | mittel | Projektseite zeigt weder kanonischen Pfad noch Farbe/Icon (`project-detail.png`) | **erledigt (W7)**: Kopfzeile mit Pfad + Farb-Punkt, Umbenennen inkl. Farbe, Projekte-Karte auf dem Server wahlweise als Baum | W7 |
| 9 | niedrig | Mobile: Assistant-Metazeile bricht in 3 Zeilen, Dateipfad-Feld auf „Datei" gestutzt, Composer-Zeile gedrängt (`filled/mobile-chat-steps-sec0.png`) | **erledigt (W6)**: eine Meta-Zeile pro Gruppe (nicht pro Nachricht), Composer-Zeile im Einfach-Modus auf Textfeld + Senden reduziert | W6 |
| 10 | niedrig | Server-Werkzeuge: 5 Karten mit „Keine …", „Verfügbare Shells: Keine Shells" obwohl Mock welche liefert (`server-tools.png`) | Mock/Shape prüfen (niedrig) | — |

Owner-Vorgaben dafür: Mobile und Desktop ohne Feature-Degradierung im Chat, Desktop zeigt **mehr**
(besonders bei Subagenten); Laufzeit je Shell und Subagent auf Desktop **und** Mobile; Chat wie ein
Messenger; Basic/Experte-Modus startet auf **Einfach** (Chat + Composer + Läuft-Streifen), persistiert.

## Geplante Wellen (UX-Angleichung an das Opencode-Original)

Reihenfolge steht, jede Welle wird vor dem commit verifiziert (lint/test/build/e2e):
`95b5990` Tool-Cards · `8b25413` Live-Turn-Progress · `3a6cf61` Composer — danach:

- [ ] **Welle 4 — Diff gerendert** (statt Roh-Patch im `<pre>`): Zeilen mit Nummern und +/--Spalte,
      Zähler je Datei, Unified/Split-Toggle, Kontext-Ausklappen, Karten-Leerzustände. — **erledigt** (`a4d43c7`)
- [ ] **Welle 5 — Docks + Listen + Tabs**: Permission-/Frage-/Eingangsbox-/Revert-Dock direkt über dem
      Composer (statt Umweg über Server-Werkzeuge), Skeleton-Zeilen + Suchoverlay in den Listen,
      Tab-Rename per Doppelklick + Mittelklick schließen. — **erledigt** (`w19-docks-lists-tabs.spec.ts`,
      Docks: `src/lib/dockStack.ts` + `src/components/SessionDocks.tsx`; Suchoverlay:
      `src/lib/sessionSearchOverlay.ts` + `src/components/SessionSearchOverlay.tsx`; Tab-Gesten:
      `src/lib/tabShortcuts.ts`; Details in `features/05-parity.md`).
- [ ] **Markdown-Vollständigkeit**: GFM-Tabellen (mit Ausrichtung), nummerierte/verschachtelte/Task-Listen,
      Durchstreichung — Fund aus dem Screenshot-Review, Tabellen renderten als Rohtext.
- [ ] **UI-Review-Harness**: Manifest auf alle Zustände erweitert (Multi-Step-Chat, laufender Turn, Diff,
      Eingangsbox, Formulare, Agenten, Projekt, Server-Werkzeuge, Agent-Detail, Offline) mit echten
      V2-Fixtures in `tests/screenshots/mockFixtures.ts`.
- [x] **Welle 6 — Chat wie ein Messenger + Basic/Experte** — **erledigt**
      (`tests/e2e/w20-messenger-chat.spec.ts`): Tages-Trenner („Heute"/„Gestern"),
      Gruppierung aufeinanderfolgender Nachrichten, Bubble-Enden, Kurzaktionen (Kopieren,
      Revert-ab-hier) bei Hover/Long-Press — ohne Feature-Degradierung auf Mobile (Desktop zeigt
      *mehr*: Startzeit, Agent/Modell, Projekt); „Läuft"-Streifen mit **Laufzeit** je Shell, PTY und
      Subagent (`shell.list`, `pty.list`, `GET /api/session/active`), rendert nichts wenn nichts
      läuft; Modus-Umschalter Einfach/Experte (persistiert in `opencode-pwa:session-mode`),
      Einfach = Chat + Composer + Läuft-Streifen; Picker-Reload-Zustand „Lädt…" + Toast statt
      Klebe-Banner; Offline = eine Statuszeile + Senden gesperrt. Details in
      `features/05-parity.md` (Abschnitt „Messenger Chat + Running Strip + Basic/Experte").
- [x] **Welle 7 — Projekt-Displayname + Ordner-Baum + Projekt anlegen** — **erledigt**
      (`tests/e2e/w21-project-tree-picker.spec.ts`, `@feature:project-rename`,
      `@feature:project-tree`, `@feature:folder-picker`): (a) Umbenennen mit
      optionaler Farbe (`PATCH /api/project/{id}`, `ProjectUpdateInput`), optimistisch
      mit Rollback + Toast (Session-Rename-Muster), Live-Sync über `project.updated`;
      Anzeigename = custom name, sonne Basename des kanonischen Pfads; (b)
      Baum-Evaluierung: `buildProjectTree` (`src/lib/projectTree.ts`) gruppiert nach
      Pfad-Präfix und rendert einen Baum nur bei mehreren Wurzeln oder wenn ein
      Projekt Eltern eines anderen Projekts ist — Geschwister unter einer gemeinsamen
      Wurzel (der reale Setup-Fall) bleiben flach; (c) „Neues Projekt" über den
      Server-Ordner-Picker (`file.list` + Breadcrumb) → `session.create({ location:
      { directory } })`, weil die Client-Library keinen Projekt-Create-Endpoint hat.
      Details in `features/05-parity.md` („Projekt-Displayname + Ordner-Baum +
      Projekt anlegen (Welle 7)").
- [ ] **Baum-Verfeinerung — Kettenkompression + Duplikate** (Owner-Payload,
      23 Projekte vom eigenen Server): projektlose Ordnerketten mit genau einem
      Kind werden zu EINER Zeile (`.cache/octest/live`), automatisch
      aufgeklappt, Chevron nur bei echter Verzweigung; Blatt-Projekte flach;
      doppelte `canonical`-Pfade (`/projects/LuminaRust` zweimal) auf die
      frischere `time.active`/`time.updated` reduziert. Implementiert in
      `src/lib/projectTree.ts` (`compressChain`, `dedupeProjectPaths`,
      `projectRecency`), `src/components/ProjectTree.tsx` (`data-chain`),
      `ProjectInfo.time` in `src/lib/opencode.ts`. Tests:
      `src/lib/projectTree.test.ts`, `src/components/ProjectTree.test.tsx`,
      `tests/e2e/w21-project-tree-picker.spec.ts` (`@feature:project-tree`),
      Screenshot-Route `server-project-tree` mit dem echten Payload. Details in
      `features/05-parity.md` („2b — Ordnerketten komprimieren").


## Skills-Stand (2026-10-21) — Positionen aus den Bereichen `be24163..787670a`, `787670a..0449b05`, `0449b05..4205142` und `4205142..5243791`

Einträge aus dem Fortschreiben von `AGENTS.skills.md` (Stand `4205142`). Wie
`AGENTS.todo.md` insgesamt: **Log, kein Auftrag** — die Umsetzung braucht eine
ausdrückliche Beauftragung. Die Positionen 1 und 2 stammen aus dem Bereich
`be24163..787670a`: Position 1 ist am 2026-10-21 **umgesetzt und verifiziert**
(Beauftragung des Nutzers; Nachweis in der Position selbst), Position 2 ist am
2026-10-21 nachgeprüft — gemessen am Vorgänger `473de80`, seitdem unverändert
(Beleg: `git diff --stat 473de80..<stand> -- package.json pnpm-workspace.yaml`
→ ohne Ausgabe; nicht neu bewertet); die Positionen 3 bis 5 sind neu aus
`787670a..0449b05`. Der Bereich `0449b05..4205142` bringt **keine neue Position**:
seine drei Skills sind bereits erfasst — `github-ci-filters` in Position 1,
`ratchet-gates` in Position 4, `skills-marker` (die Regel selbst) ohne Position.
Der Bereich `4205142..5243791` bringt **keine neue Position** ebenfalls: seine vier
Skills sind bereits erfasst — `ui-review` in Position 5, `skills-marker` (die Regel
selbst) und `build-verify` ohne Position, `agent-config` trifft nicht zu (das Projekt
definiert kein Agent-Setup). Die Belege der Positionen 1, 4 und 5 sind am 2026-10-21
neu gemessen; **Stand, Rahmen und Anker trägt dieses Board selbst** — jede Position
nennt ihren Beleg mit Rahmen und Anker (Position 1: gemessen am Vorgänger `2f32095`,
seitdem unverändert; Position 4: gemessen am Vorgänger `c86138b`, seitdem
unverändert; Position 5: gemessen am Stand `c86138b`, am committeten Stand des
schreibenden Commits dieselben Werte). Der Abschnitt des Markers, der diese Belege bis
2026-10-21 trug, ist durch die neue Range ersetzt.

1. [x] **Pfad-Filter für die CI-Workflows** (`github-ci-filters`) — **erledigt und
   verifiziert**: die Skill will `paths-ignore`, damit ein reiner Doku-Commit nicht
   die ganze Pipeline startet. Umgesetzt am 2026-10-21 (Beauftragung des Nutzers):
   `.github/workflows/ci.yml` trägt `paths-ignore: ['**/*.md']` unter **beiden**
   Triggern (`push` **und** `pull_request`), `.github/workflows/pages.yml` unter
   `push` — der manuelle `workflow_dispatch` bleibt ungefiltert, und einen
   `pull_request`-Trigger hat der Pages-Workflow **nicht** (es wurde keiner
   erfunden; das wäre eine Verhaltensänderung und gehört nach Step 4 der Skill in
   einen zweiten, getrennten Commit). Die `branches:`-Filter (`[main]`) stehen
   unverändert, `paths` und `paths-ignore` stehen nie am selben Event (das Repo hat
   **keinen** `paths:`-Block — `git grep -n "paths:" 2f32095 -- .github/workflows/` →
   **0** Treffer; gemessen am Vorgänger `2f32095`, seitdem unverändert),
   `.github/workflows/**` ist **nicht** mitignoriert. Innerhalb der Workflows ändert
   sich **nichts** — der Workflow-Diff besteht ausschließlich aus dem
   `paths-ignore`--Block (Zustand: der Vorgänger `473de80` und der die Workflows
   schreibende Commit `2f32095`; `git diff --numstat 473de80..2f32095 --
   .github/workflows/ci.yml .github/workflows/pages.yml` → **6** hinzugefügte Zeilen,
   **0** entfernte — **4**/`0` in `ci.yml` und **2**/`0` in `pages.yml`, inhaltlich
   **3**× `paths-ignore:` + **3**× `- '**/*.md'`; `git diff --stat 473de80..2f32095 --
   .github/workflows/ci.yml .github/workflows/pages.yml` → „2 files changed, 6
   insertions(+)"; kein Job, kein Schritt, kein Matrix-Eintrag, kein Timeout, kein
   `continue-on-error`, keine gelockerte Lint-Regel). Die Trigger sind
   **verschieden**: `ci.yml` läuft auf
   `push` (Branches `[main]`) **und** `pull_request` (Branches `[main]`),
   `pages.yml` auf `push` (Branches `[main]`) plus `workflow_dispatch`
   (`git grep -nE '^\s*(on|push|pull_request|branches|workflow_dispatch)'
   2f32095 -- .github/workflows/*.yml` → `push`/`pull_request` in `ci.yml`,
   `push`/`workflow_dispatch` in `pages.yml`; gemessen am Vorgänger `2f32095`,
   seitdem unverändert (Beleg: `git diff --stat 2f32095..<stand> --
   .github/workflows/ci.yml .github/workflows/pages.yml` → ohne Ausgabe; dieser
   Commit schreibt die Dateien nicht)); dieses Repo ist docs-lastig (`features/`,
   `docs/`, `AGENTS*.md`).
   Precondition der Skill (Step 1) ist am 2026-10-21 erneut geprüft, diesmal mit
   der **klassifizierten** Sweep-Ausgabe; **beide** Sweeps stehen unter **einem**
   benannten Stand: dem committeten Stand dieses Commits, gemessen ohne Checkout
   (`git archive <stand> | tar -x -C <tmpdir>`, dann dieselben Kommandos im
   ausgepackten Baum). Der repo-weite Sweep mit **quotierten** `--include`-Globs —
   `grep -rn --include='*.ts' --include='*.tsx' '\.md"' .`, also repo-weit ab der
   Repo-Wurzel mit den Globs `*.ts` und `*.tsx` — liefert **21** Treffer in **10**
   versionierten Dateien. Der zweite Sweep über die Prüfverzeichnisse ist nach der
   **neuen** Regel der Skill in **jedem** Prüfverzeichnis zu fahren, und dieses Repo
   hat **zwei**: `tests scripts .github` und `src/` (vitest:
   `include: ["src/**/*.test.{ts,tsx}]`, `vite.config.ts`) — der Sweep
   `grep -rn "AGENTS\|\.md\|docs/" tests scripts .github src` liefert **38** Treffer in
   **20** Dateien; der repo-weite Sweep ist eine **Teilmenge** davon (alle **10**
   Dateien des ersten Sweeps sind darin enthalten), die Vereinigung ist also
   **38** Fundstellen in **20** Dateien. Zum Vergleich: der Sweep **ohne** `src/`
   (`grep -rn "AGENTS\|\.md\|docs/" tests scripts .github`) liefert **18** Treffer in
   **9** Dateien. Dazu eine
   **nicht rekonstruierbare** Arbeitsbaum-Messung vom 2026-10-21: dasselbe
   Sweep-1-Kommando im Arbeitsbaum → **21**/**10**; sie ist später nicht
   nachprüfbar, weil der Arbeitsbaum `node_modules/` und ein unversioniertes
   `dist/` enthielt (beides gitignoriert und bauabhängig) — `ls dist/assets/` → nur
   `.css`/`.js`-Artefakte, `find dist/assets -name '*.ts*'` → keine Ausgabe,
   `grep -rn --include='*.ts' --include='*.tsx' '\.md"' node_modules dist` → keine
   Ausgabe. Der committete Stand oben trägt die Aussage.
   **Kein** Treffer öffnet eine Repo-`.md` als Eingabe: `src/lib/promptAttachments.ts:66`
   ist eine **Dateiendungs**-Liste (`.md` neben `.txt`, `.pdf` … für den Datei-Picker),
   `src/lib/diffView.test.ts:212` prüft `splitDiffPath("README.md")` (reine
   String-Logik), `src/lib/sessionMessages.test.ts:54/57` nennen `"notizen.md"` in
   einer Mock-Nachricht, `src/lib/opencode.test.ts:484/490/496/498` und
   `src/components/ServerFolderPicker.test.tsx:27/71` sind Mock-Datei-Einträge,
   `src/lib/promptAttachments.test.ts:156` ist ein Mock-Pfad,
   `tests/screenshots/mockFixtures.ts:261/533` sind Mock-Fixtures (`docs/diff-notes.md`,
   `README.md`), `tests/e2e/w6-vault-tools.spec.ts:147`,
   `tests/e2e/w21-project-tree-picker.spec.ts:104/355` (Mock-Datei plus daraus
   gebildeter Test-Id) und `tests/e2e/w18-diff-render.spec.ts:71/73/74/102/255`
   (Patch-Fixture mit dem **Namen** „README.md") nennen nur Namen; der zweite Sweep
   zusätzlich `scripts/check-i18n.mjs:6` (Kommentar „AGENTS.todo W3" — das Skript liest
   `locale/de/messages.po` und `messages.js`), `tests/e2e/w19-docks-lists-tabs.spec.ts:18`
   (Kommentar `features/05-parity.md`) sowie `tests/screenshots/mockFixtures.ts:307`
   und `tests/screenshots/ui-screenshots.spec.ts:24/182` (Bezeichner
   `AGENTS_SESSION_ROWS`) sowie `.github/workflows/ci.yml:7/11` und
   `.github/workflows/pages.yml:7` (die `paths-ignore`-Muster `'**/*.md'`) — alles
   **Nennungen**, keine Eingabe. Die Treffer in `src/` sind Kommentare
   (`src/components/ConfigCard.tsx:22`, `src/components/IntegrationsCard.tsx:54`,
   `src/components/SessionDocks.tsx:25/210`, `src/lib/opencode.ts:1582/2711`,
   `src/pages/SessionDetail.tsx:785/1196` — sie nennen `features/05-parity.md` bzw.
   `features/02-api-contract.md`), die **Dateiendungs**-Liste
   `src/lib/promptAttachments.ts:66/67` (`.md`, `.mdx` neben `.txt`, `.pdf` … für den
   Datei-Picker) und Mock-Datei-Einträge (`src/lib/opencode.test.ts:484/490/496/498`,
   `src/components/ServerFolderPicker.test.tsx:27/71`,
   `src/lib/promptAttachments.test.ts:156`, `src/lib/sessionMessages.test.ts:54/57`,
   `src/lib/diffView.test.ts:212`) — **Nennungen**, keine Eingabe. Der Build liest keine
   Repo-`.md` (`public/` ohne `.md`; `vite.config.ts` ohne `copy`/`staticCopy`;
   Workbox-`globPatterns` ohne `.md`; `import.meta.glob` → **0** Treffer in `src/`;
   `pnpm build` = `tsc -b && vite build` mit `prebuild` = `scripts/check-i18n.mjs`).
   **Die Liste der Dateien, die nicht ignoriert werden darf, ist damit leer** — das
   Muster ist genau `'**/*.md'`, es deckt alle **11** versionierten `.md` ab (4 in der
   Repo-Wurzel: `AGENTS.md`, `AGENTS.skills.md`, `AGENTS.todo.md`, `README.md`; 7 in der
   Tiefe: `docs/manual-device-test.md` und `features/01…06-*.md`). `main`
   ist **nicht** branch-protected (`gh api
   repos/all-the-rest/opencode-pwa/branches/main/protection` → HTTP **404** „Branch not
   protected", am 2026-10-21 erneut geprüft) → keine Ausnahme zu dokumentieren, keine
   Pending-Check-Falle. Verifikation ohne Push (Skill Step 5): Doku-Commit `59e9925`
   (`git diff --name-only 59e9925^ 59e9925` → `AGENTS.todo.md`,
   `docs/manual-device-test.md`) → **beide** Pfade werden ignoriert; Code-Commit
   `10c93c1` (`git diff --name-only 10c93c1^ 10c93c1` → **15** Pfade) → **13** davon
   passen auf **kein** Muster (`src/**`, `tests/**`), die Pipeline läuft also weiter;
   die Drei-Punkt-Form (PR-Semantik) liefert dieselben Pfadlisten, die
   Umbenennungs-Formen (`-M` und `--no-renames`) ebenfalls. Upstream-Anmerkung:
   Pfadfilter werden bei **Tag**-Pushes nicht ausgewertet — ein Doku-Tag-Push startet
   die Pipeline weiter; das ist Upstream-Verhalten, kein Fehler des Filters, und es
   wird nicht umgangen. Beleg des Laufs: der Commit `2f32095` ändert Workflow-Dateien,
   wird also **nicht** ignoriert und löste **beide** Pipelines aus (CI und Pages) —
   2 Läufe, beide `success` (`gh run list --commit
   2f32095d71f270034c6bab7cf76ac4dafd1f2ddf` → CI `39649341123`, Pages `39649341143`,
   beide `2026-10-21T18:03:53Z`; `--commit` verlangt die **vollständige** SHA, die
   kurze `2f32095` liefert leer) — ohne Lauf wäre der Filter syntaktisch fehlerhaft
   oder würde die Workflow-Dateien selbst ignorieren. Die Skill ist seit `817c01e`
   **versteckt** (nur per exakter ID ladbar) — das ändert die Pflicht nicht.

2. **`node-deps`-Policy: `packageManager`-Pin und `minimumReleaseAgeExclude`**
   (`node-deps`) — die Skill verbietet beides: keine exakten Pins im Manifest
   („Versionsausschluss über `pnpm` ins Lockfile") und kein
   `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`. `package.json` führt
   `"packageManager": "pnpm@10.0.0"` (Pin), `pnpm-workspace.yaml` führt drei
   `minimumReleaseAgeExclude`-Einträge für `@opencode/{client,protocol,schema}@2.0.23`.
   Die CI-Kommentare begründen das: `ci.yml` (Z. 22–23) nennt
   `ERR_PNPM_BAD_PM_VERSION`, `pages.yml` (Z. 17) verweist für denselben Grund auf
   `ci.yml` (ohne `version:`-Key im `pnpm/action-setup`-Schritt gewinnt
   `packageManager`) — die Skill will es umgekehrt (Major-Linie
   `version: 11` im Workflow, kein Pin im Manifest). Die Abhängigkeiten selbst
   sind bereits ranges-only (`^`/`~` in `package.json`) — offen sind nur die
   beiden Pin-Formen. Am 2026-10-21 nachgeprüft — gemessen am Vorgänger `473de80`,
   seitdem unverändert (Beleg: `git diff --stat 473de80..<stand> -- package.json
   pnpm-workspace.yaml` → ohne Ausgabe; die Skill selbst ist in `787670a..0449b05`
   nicht geändert).
   Zu entscheiden: auf die Skill-Form umstellen (mit
   `pnpm install --frozen-lockfile` + Build-Gate geprüft) oder die
   Abweichung als bewusste Projektentscheidung hier festhalten.

3. **Doku-Fakten prüfen statt glauben** (`generated-docs`, neu aus
   `787670a..0449b05`) — die neue (versteckte) Skill verlangt einen **Besitzer je
   Behauptung**: der Code, eine maschinenlesbare Datei, eine kuratierte Liste oder
   eine Person. Zahlen im Fließtext sind Artefakte — sie werden im generierten Block
   erzeugt oder durch einen Verweis auf die generierte Tabelle ersetzt. Drei Stellen
   in diesem Repo tragen solche Behauptungen, und kein Gate prüft sie:
   - `README.md`, Abschnitt „V2 API Endpoints Used" — die Tabelle nennt 8 Endpunkte,
     der Code ruft deutlich mehr auf (`src/lib/opencode.ts`, u. a.
     `/api/session/active`, `/api/session/{id}/diff`, `/api/permission/request`,
     `/api/skill`, `/api/worktree`). Die Tabelle ist eine zweite Wahrheit und altert
     still; nach der Skill braucht eine Liste von Behauptungen ihr **eigenes** Gate
     (alles Genannte existiert und ist erreichbar) oder wird aus dem Code abgeleitet.
   - `AGENTS.todo.md` — Zahlen im Fließtext: „44 Captures" (§„UI-Review-Befunde"),
     „vitest 233/233" und „e2e 117/117" (§„Navigation"), „**sieben** offene
     Checkbox-Punkte" (Kopfzeile).
   - `features/05-parity.md` §„Live delta folding" — Messwerte im Fließtext
     („92 frames in 12 s", „174 frames in 20 s").
   Zu entscheiden: je Behauptung eine Quelle der Wahrheit benennen und die driftenden
   Stellen generieren (Generator + Drift-Gate als Diff) oder die Zahl durch einen
   Verweis auf eine generierte Tabelle ersetzen.

4. **Gates als Ratchets, Lücken mit Owner und Ticket** (`ratchet-gates`, neu aus
   `787670a..0449b05`) — die neue (versteckte) Skill dreht das Boolean-Gate um:
   „aktuell N Verstöße gegen Regel R", grün solange `count ≤ N` (Obergrenze) oder
   `count ≥ N` (Untergrenze), und die Baseline darf sich nur in der erklärten Richtung
   bewegen. Sie verlangt außerdem, dass die **nicht abgedeckte Fläche** dort benannt
   wird, wo sie lebt, und dass jede offene Lücke Owner und Ticket trägt. In diesem
   Repo ist davon offen:
   - `scripts/check-i18n.mjs` — das Gate prüft die Message-Population als Boolean
     („missing from the compiled catalog") und benennt seine eigene Blindstelle im
     Kopfkommentar („no AST scan for unwrapped strings"). Der Verweis dahinter
     (wörtlich „AGENTS.todo W3“) zeigt auf einen Eintrag, den es nicht mehr gibt —
     im Todo vor dem Fortschreiben, das den Cursor auf `0449b05` gesetzt hat, kommt
     die Zeichenfolge nicht vor — gemessen am Stand `c737d17`
     (`git show c737d17:AGENTS.todo.md | grep -c "W3"` → 0; derselbe Wert 0 an den
     weiteren Vor-Ständen `1f73917`, `4507c4a`, `73c032f`) —. **Kein Eintrag W3**:
     im Bereich `c737d17..ddd15a4` trägt `AGENTS.todo.md` höchstens **zwei Zeilen**
     mit **zwei Vorkommen** — das Zitat desselben Zeigers und das Messkommando
     selbst (gemessen am Stand `ddd15a4`: `git show ddd15a4:AGENTS.todo.md | grep -n "W3"`
     → Zeilen 257 und 260; als Vorkommenszählung `git show ddd15a4:AGENTS.todo.md |
     grep -o "W3" | wc -l` → **2**) — und `AGENTS.skills.md` höchstens **drei Zeilen**
     mit **vier Vorkommen**: **zwei Zitate** des Zeigers (Zeilen 87 und 173), eine
     **Nennung** des Labels (Zeile 173: „Eintrag W3") und **das Messkommando** (Zeile
     176) (gemessen am Stand `ddd15a4`: `git show ddd15a4:AGENTS.skills.md | grep -n "W3"`
     → Zeilen 87, 173 und 176; als Vorkommenszählung
     `git show ddd15a4:AGENTS.skills.md | grep -o "W3" | wc -l` → **4**); ein Eintrag
     mit W3 existiert nicht
     (`git show ddd15a4:AGENTS.todo.md | grep -cE '^- \[.\].*W3'` → 0; derselbe Wert 0
     an `c86138b` und `45cb323`). Repo-weit trägt der Stand `ddd15a4` **19 Zeilen**
     mit **21 Vorkommen** in **4** Dateien — der Umfang ist **alle versionierten
     Dateien** des Stands (`git grep -n "W3" ddd15a4` → 19 Zeilen; `git grep -o "W3"
     ddd15a4 | wc -l` → 21 Vorkommen; `git grep -l "W3" ddd15a4` → 4 Dateien; die
     Verteilung je Datei über `git grep -o "W3" ddd15a4 -- <pfad> | wc -l`
     (Vorkommen) und `git grep -n "W3" ddd15a4 -- <pfad> | wc -l` (Zeilen): davon
     **4** in `AGENTS.skills.md` (3 Zeilen), **2** in `AGENTS.todo.md` (2 Zeilen),
     **1** in `scripts/check-i18n.mjs:6` und **14** in `pnpm-lock.yaml` (13 Zeilen);
     3+2+1+13 = **19** Zeilen, 4+2+1+14 = **21** Vorkommen).
     Die Fundstellen zitieren den Zeiger, sie lösen ihn nicht auf. Entweder wird die
     Blindstelle dort
     benannt (mit Owner und Ticket) oder der Verweis auf einen existierenden
     Eintrag gezogen.
   - `AGENTS.todo.md` §„Bewusst offen/dokumentiert (kein Handlungsbedarf)" — 6
     Einträge (am committeten Stand dieses Commits): 1 ist als entschieden und
     umgesetzt markiert (`fixed`), 5 tragen weder Owner noch Ticket; 4 dieser 5 sind
     als dokumentierte Entscheidung markiert (Quellen: `features/05-parity.md` für
     zwei Einträge, `features/03-userscripts-postmvp.md`, „zurückgestellt") und damit
     im kanonischen Vokabular `accepted`/`wontfix` — offener Punkt bleibt nur der
     Todo-Dock-Eintrag. Die kanonische Regel: ein Eintrag, der nicht `fixed` ist,
     braucht Id, Owner und Ticket.
   - Die Prüfstufen existieren (`AGENTS.md`: `@smoke`/`@regression`/`@feature`;
     **1** `@smoke`-getaggte Spec — statisch gemessen, der Test wurde **nicht**
     ausgeführt: gemessen am Vorgänger `c86138b`, seitdem unverändert (`git grep -n
     "@smoke" c86138b -- tests/` → **1** Treffer, `tests/e2e/smoke.spec.ts`, Zeile 16;
     Beleg: `git diff --stat c86138b..<stand> -- tests/e2e AGENTS.md package.json
     playwright.config.ts` → ohne Ausgabe). Das **benannte** Kommando
     `pnpm test:e2e:smoke` ist `playwright test --grep @smoke` (`package.json:16`) und
     läuft **ohne** `--project`: die Spec läuft in `chromium` und `mobile`
     (`playwright.config.ts` — `e2e-guard` trägt `testMatch /e2e-guard\.spec\.ts/`,
     `chromium` und `mobile` nur `testIgnore`) → **2 Läufe** derselben Spec, lokal
     **nicht** ausgeführt; das CI-Kommando `pnpm exec playwright test --grep @smoke
     --project=chromium` (`.github/workflows/ci.yml`, Schritt „E2E smoke (chromium
     only)") fährt genau diese **eine** — gemessen am Vorgänger `2f32095`, seitdem
     unverändert (Beleg: `git diff --stat 2f32095..<stand> --
     .github/workflows/ci.yml` → ohne Ausgabe),
     aber welche Fehlerklassen nur die langsame Stufe abdeckt und welche gar keine, ist
     nirgends als Liste dokumentiert.
   Zu entscheiden: die Gates auf Zähler umstellen (Baseline erzeugen, Richtung
   festlegen, Paydown-Befehl) oder den Boolean-Stand als bewusste Entscheidung
   festhalten — mit Lückenliste, Owner und Ticket je Eintrag.

5. **UI-Findings auf das kanonische Vokabular bringen** (`ui-review`, neu aus
   `787670a..0449b05`) — die Findings-Vorlage der `ui-review`-Skill ist umgestellt:
   Spalten `Id | Severity | Status | Owner | Ticket | File:Line | Screenshot | Finding |
   Suggested fix`, die kanonischen Stufen (`critical`/`high`/`medium`/`low`/`info`,
   mit `medium` = „mit Workaround") aus `ratchet-gates`
   (`references/vocabulary.md`) und der Status als **eigenes** Feld — nie in der
   Schwere-Spalte. Das Harness ist hier angewendet; die Findings-Liste ist es nicht:
   `AGENTS.todo.md` §„UI-Review-Befunde" (10 Zeilen — gemessen am Stand
   `c86138b`: `git show c86138b:AGENTS.todo.md | grep -cE
   '^\| [0-9]+ \|'` → **10**, `git show c86138b:AGENTS.todo.md | grep -cE
   '^\| [0-9]+ \|.*erledigt'` → **6**; am committeten Stand dieses Commits dieselben
   Werte, die Tabelle hat dieser Commit nicht geändert — der Board wird von diesem
   Commit geschrieben, „seitdem unverändert" trägt für die Datei deshalb nicht) verwendet
   `hoch`/`mittel`/`niedrig`, führt den Status mit im Behebungs-Text statt in einer
   eigenen Spalte (6 der 10 Zeilen tragen „erledigt"
   in der Behebungs-Spalte; die Zeilen 3–5 sind über die Welle 5 geschlossen, ohne
   Statuswort), und die einzige
   noch offene Zeile (#10, „Server-Werkzeuge: 5 Karten mit „Keine …"") hat weder
   Owner noch Ticket. Eine verwandte Lücke — derselbe Lückentyp in einem anderen
   Repo — ist für die UI-Log der Website im Skills-Repo protokolliert (`b9f140b`):
   dort die zurückgezogene Bedeutung der Stufen, hier die deutschen Stufen und die
   fehlenden Spalten. Die Präzedenz bleibt: einmal die Stufen, dann die offenen
   Zeilen einzeln gegen die kanonischen Bedeutungen. Zu entscheiden: die Tabelle auf
   die kanonischen Stufen und Spalten umstellen (die geschlossenen Zeilen auf
   `fixed`, #10 offen mit Id, Owner und Ticket) oder die Abweichung bewusst
   festhalten.


## Bewusst offen/dokumentiert (kein Handlungsbedarf)

- PTY: Text-Ansicht via `terminal/read` (Entscheidung in `features/05-parity.md`).
- **Todo-Dock**: Der installierte Client kennt keine Todo-API (kein `todo`-Symbol in
  den generierten Typen des Clients — `generated/types.d.ts` liegt nicht in diesem
  Repo) — das Dock rendert deshalb nichts. Erweiterungspunkt in
  `src/components/SessionDocks.tsx` (`TodoDock`) + `{ type: "todos" }` in
  `src/lib/dockStack.ts`; es genügt ein List-Endpoint auf dem Server.
- **Permission `decision: "always"`**: dokumentierte Produktentscheidung
  (`features/05-parity.md`), nicht implementiert. Erweiterungspunkt markiert in
  `src/components/SessionDocks.tsx` (`DockPermissionDecision`).
- Userscripts server-stored: nicht statisch machbar (Verdikt in `features/03-userscripts-postmvp.md`).
- OAuth-complete/Credential-Mgmt/Config-Writes, Plugin: zurückgestellt.
- Feed-Richtung Chat-Stil, Routen-Regel Pfad-vor-Query: entschieden und umgesetzt.

