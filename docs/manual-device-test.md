# Manueller Geräte-Test (Handy) – ocweb.all-the.rest

Ziel: Beim nächsten manuellen Test klappt alles. Maschinell verifiziert
(2026-10-07, alles 200): Manifest, Icons (192/512/maskable), `sw.js`,
SPA-Fallback (`404.html` = App-Shell), HTTPS erzwungen.

## Vorbereitung (kritisch – sonst scheitert der Test nicht an der App)

1. **Server-Erreichbarkeit:** Das Handy muss den Opencode-Server per URL
   erreichen (gleiches WLAN/VPN oder öffentliche URL). Vorab am Handy im
   Browser `https://<server>/api/info` öffnen – kommt kein JSON, liegt es
   am Netz, nicht an der App.
2. **CORS:** Der Opencode-Server muss `https://ocweb.all-the.rest` als
   Origin erlauben. Symptom sonst: „Server offline" trotz erreichbarem
   Server (Browser blockt die Antwort).
3. **Zugangsdaten:** Für `remote-code.all-the.rest` gilt (seit 2026-10-08,
   bestätigt im Gate-Repo `AGENTS.md` §4): Username ist der Benutzer der
   Login-Seite (`AUTH_USER`), Passwort ist das **Login-Passwort**. Genau
   diese Kennung prüft Caddy am `/api/*`-Gate (`@api_ok`, exakter
   base64-Vergleich) und tauscht sie intern gegen
   `opencode`/`OPENCODE_PASSWORD` — die PWA sieht das Server-Passwort nie.
   **Nicht** `opencode` + Server-Passwort eintragen: das war der Stand vom
   2026-10-07 und gibt heute 401 auf jeden Request.

## Ablauf (ca. 15 Minuten)

| # | Schritt | Erwartet |
|---|---|---|
| 1 | `https://ocweb.all-the.rest` öffnen | Übersicht lädt, dunkles Theme, deutsche UI |
| 2 | Teilen → „Zum Home-Bildschirm" (iOS) bzw. Installieren (Android) | Eigenes Icon, startet ohne Browserleiste (`standalone`) |
| 3 | Einstellungen → Server anlegen (Name, URL, User, Passwort) | Server erscheint in Übersicht, Status-Version sichtbar |
| 4 | Benachrichtigungen aktivieren | Systemdialog erscheint, Badge „aktiviert" |
| 5 | Server antippen | Projekte + Sessions gruppiert, Zähler für Sessions/Shells/PTYs |
| 6 | Session öffnen | Chat-Stil (älteste oben), Nachrichten laden, „Zu neuesten springen" nur bei Hochscrollen |
| 7 | Nachricht senden | Eigene Nachricht sofort sichtbar (optimistisch), Antwort läuft ein |
| 8 | Shell-Befehl ausführen | Output tailt mit Live-Badge |
| 9 | Laufende Shell abbrechen | Confirm-Dialog, danach weg aus der Liste |
| 10 | Flugmodus an → App neu öffnen | App-Shell lädt (offline), Server als Offline gebadged, Sessions disabled statt gelöscht |
| 11 | Flugmodus aus | Live-Daten kommen zurück, Cache zuerst |
| 12 | Server-Werkzeuge öffnen | Dateien, VCS-Status, Worktrees, MCP, Berechtigungen laden oder melden sauber „offline" |
| 13 | Server-Seite → „Projekte ausblenden"-Filter umschalten (bzw. links der gleiche Filter) | Beide Bildschirme blenden dieselben Projekte aus/ein, Zähler passt (ein gemeinsames Signal, nicht zwei) |
| 14 | Server-Projekt umbenennen, dann „Zurücksetzen" | Neuer Name sofort in Baum und Karte, nach „Zurücksetzen" wieder der Ordnername |

## Chat-Parität (Welle 6–8)

| # | Schritt | Erwartet |
|---|---|---|
| 15 | Lange Session öffnen | Messenger-Stil: Nachrichten gebündelt, Lücken als Zeitmarke („10:24"), älteste oben, „Zu neuesten springen" |
| 16 | Modus-Umschalter oben | Start ist **„Einfach"**; nur dann zeigt die Composer-Aktion „Anhang" — im Experten-Modus bleibt die Datei-Aktion |
| 17 | Agent läuft (Nachricht senden) | Laufband oben auf dem **Handy** mit: Agentenname, Tool-Name und **abgelaufene Laufzeit** — identisch wie am Desktop |
| 18 | Während der Agent denkt | „Denkt…" wächst live mit dem Grübel-Text (Delta-Streaming) statt erst die fertige Nachricht zu zeigen |
| 19 | Session mit offenen Antworten öffnen | Ungelesen-Punkt verschwindet beim Öffnen; zwischen Sessions wechseln und zurück — Zähler stimmt |
| 20 | Deep-Link `/server/<base64>/session/<id>` öffnen | App-Shell startet, Server-Session lädt (Deep-Link-Form funktioniert) |

## Protokoll

Defekt? Notieren: Schritt-Nr., Handy + Browser, Server-URL (ohne Secrets),
Screenshot, Console-Log (falls Desktop-Sync möglich). Eintrag danach in
`AGENTS.todo.md` als `[ ] manuell prüfen` bzw. Bug mit Regressionstest.
