# AGENTS.todo.md

Stand: 2026-10-08. Nur offene TODOs (veraltete Einträge bereinigt: Parität-Batches,
Deep-Link-Paste, Prozess-Regel und Userscripts-Verdikt sind umgesetzt/dokumentiert).

## Navigation (Owner-Entscheidung 2026-10-07, umgesetzt)

Umgesetzt und verifiziert (lint 0, vitest 233/233, build ok, e2e 117/117);
Details in `features/04-projects.md` (Navigation). Offen nur: Streaming-Inspector
für Agenten-Aktivität (dokumentierte Lücke).

## Offen

- [ ] Remote-Zugriff live nachtesten: `remote-code` in der PWA anlegen (User `AUTH_USER` + Login-Passwort — Credential-Regel 2026-10-08, Details in `features/06-remote-access.md` §5-Addendum), Verbindungstest + Schritte 3–12 aus `docs/manual-device-test.md`. VPS-seitig erledigt (Caddy Basic-Gate auf die Login-Kennung + CORS, verifiziert 2026-10-08; davor Server-Passwort, verifiziert 2026-10-07).
- [ ] Auth-Fehler-Banner mit Direkt-Link zum Bearbeiten der Zugangsdaten (Server-Seite + „Server bearbeiten"-Aktion; Umbenennen/Löschen existiert bereits).
- [ ] Echter Geräte-Test: PWA-Install + Offline/SW auf realem Handy (nur Config + `dist` verifiziert).

## Geplante Wellen (UX-Angleichung an das Opencode-Original)

Reihenfolge steht, jede Welle wird vor dem commit verifiziert (lint/test/build/e2e):
`95b5990` Tool-Cards · `8b25413` Live-Turn-Progress · `3a6cf61` Composer — danach:

- [ ] **Welle 4 — Diff gerendert** (statt Roh-Patch im `<pre>`): Zeilen mit Nummern und +/--Spalte,
      Zähler je Datei, Unified/Split-Toggle, Kontext-Ausklappen, Karten-Leerzustände.
- [ ] **Welle 5 — Docks + Listen + Tabs**: Permission-/Frage-/Eingangsbox-/Revert-Dock direkt über dem
      Composer (statt Umweg über Server-Werkzeuge), Skeleton-Zeilen + Suchoverlay in den Listen,
      Tab-Rename per Doppelklick + Mittelklick schließen.
- [ ] **Welle 6 — Chat wie ein Messenger + Basic/Experte**: Tages-Trenner („Heute"/„Gestern"),
      Gruppierung aufeinanderfolgender Nachrichten, Bubble-Enden, Kurzaktionen (Kopieren) bei
      Hover/Long-Press — ohne Feature-Degradierung auf Mobile (Desktop zeigt *mehr*, nie weniger);
      „Läuft"-Streifen mit **Laufzeit** je Shell und Subagent (`shell.list`, `pty.list`,
      `GET /api/session/active`), Desktop mit mehr Details; Modus-Umschalter Einfach/Experte
      ( persistent), Einfach = Chat + Composer + Läuft-Streifen.
- [ ] **Welle 7 — Projekt-Displayname + Ordner-Baum + Projekt anlegen** (research erledigt): `project.update` existiert
      (`ProjectUpdateInput.canonical?: { name, icon?: { url, override, color }, commands? }`, Client
      `client.d.ts:147-149`), das Event `project.updated` (`types.d.ts:2254`) erlaubt Live-Sync —
      also Projekt-Umbenennung mit Farbe/Icon. Ein Create-Endpoint gibt es **nicht** (nur `list`/`update`):
      „Neues Projekt" läuft über den Folder-Picker des Servers — `file.list({path})` liefert
      `FileSystemEntry { path, type: "file" | "directory" }` (`types.d.ts:528`), `file.find({ query, type: "directory" })`
      sucht Verzeichnisse; unser `listFiles` (`src/lib/opencode.ts:1031`) nutzt das schon in den Server-Werkzeugen.
      Geplant: (a) Evaluierung Baum-Darstellung, wenn Projektnamen Pfade sind (Verschachtelung nach kanonischem Pfad),
      (b) Rename + Farbe/Icon mit Live-Sync, (c) Projekt-Anlage über Server-Ordner-Picker → Session im Verzeichnis.


## Bewusst offen/dokumentiert (kein Handlungsbedarf)

- PTY: Text-Ansicht via `terminal/read` (Entscheidung in `features/05-parity.md`).
- Userscripts server-stored: nicht statisch machbar (Verdikt in `features/03-userscripts-postmvp.md`).
- OAuth-complete/Credential-Mgmt/Config-Writes, Plugin: zurückgestellt.
- Feed-Richtung Chat-Stil, Routen-Regel Pfad-vor-Query: entschieden und umgesetzt.

