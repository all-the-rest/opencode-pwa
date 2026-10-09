# AGENTS.todo.md

Stand: 2026-10-09 (Welle 6 + Welle 7 eingetragen). Nur offene TODOs (veraltete
Einträge bereinigt: Parität-Batches, Deep-Link-Paste, Prozess-Regel und
Userscripts-Verdikt sind umgesetzt/dokumentiert).
UI-Review-Befunde 1, 2, 6, 7 und 9 sind mit Welle 6 erledigt (Details in
`features/05-parity.md`, Abschnitt „Messenger Chat + Running Strip +
Basic/Experte"); Befund 8 (Projektseite: Pfad + Farbe) mit Welle 7.
Welle 7 ist umgesetzt und verifiziert (lint 0, vitest, build, e2e inkl. Mobile,
Screenshots) — die letzte Code-Welle; danach stehen nur noch die drei offenen
Punkte unten.

## Navigation (Owner-Entscheidung 2026-10-07, umgesetzt)

Umgesetzt und verifiziert (lint 0, vitest 233/233, build ok, e2e 117/117);
Details in `features/04-projects.md` (Navigation). Streaming-Inspector für
Agenten-Aktivität: **im Bau** — die Live-Messung am Server des Owners zeigt
`session.reasoning.delta` mit 174 Frames in 20 Sekunden, während
`session.message.content.updated` in denselben Fenstern 0 Frames lieferte
(Owner 2026-10-09: „ich möchte das denken sehen"). Die Delta-Frames werden
jetzt in den Chat gefaltet; die exakten Feldformen (verschlüsselt über `ordinal`,
`tool.input.delta` über `id`) stehen in `features/05-parity.md` und sind live
belegt.

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
   Projekt-Create-Endpoint (nur `list`/`update`, `client.d.ts:147-149`), also
   legt der Server-Ordner-Picker eine Session mit
   `location: { directory }` an (`SessionCreateInput`, `types.d.ts:3767+`) —
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


## Bewusst offen/dokumentiert (kein Handlungsbedarf)

- PTY: Text-Ansicht via `terminal/read` (Entscheidung in `features/05-parity.md`).
- **Todo-Dock**: Der installierte Client kennt keine Todo-API (kein `todo`-Symbol in
  `generated/types.d.ts`) — das Dock rendert deshalb nichts. Erweiterungspunkt in
  `src/components/SessionDocks.tsx` (`TodoDock`) + `{ type: "todos" }` in
  `src/lib/dockStack.ts`; es genügt ein List-Endpoint auf dem Server.
- **Permission `decision: "always"`**: dokumentierte Produktentscheidung
  (`features/05-parity.md`), nicht implementiert. Erweiterungspunkt markiert in
  `src/components/SessionDocks.tsx` (`DockPermissionDecision`).
- Userscripts server-stored: nicht statisch machbar (Verdikt in `features/03-userscripts-postmvp.md`).
- OAuth-complete/Credential-Mgmt/Config-Writes, Plugin: zurückgestellt.
- Feed-Richtung Chat-Stil, Routen-Regel Pfad-vor-Query: entschieden und umgesetzt.

