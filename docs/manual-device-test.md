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
3. **Zugangsdaten:** Basic-Auth User + Passwort bereitlegen.

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

## Protokoll

Defekt? Notieren: Schritt-Nr., Handy + Browser, Server-URL (ohne Secrets),
Screenshot, Console-Log (falls Desktop-Sync möglich). Eintrag danach in
`AGENTS.todo.md` als `[ ] manuell prüfen` bzw. Bug mit Regressionstest.
