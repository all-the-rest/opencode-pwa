# AGENTS.todo.md

Stand: 2026-10-06. W6 umgesetzt (Tresor + Parität-Rest). Nur offene TODOs.

## Abgeschlossen (W6)

- [x] Passwort-Tresor: kein Klartext-Passwort mehr in `localStorage`. Pro Install ein
      zufälliger DEK in IndexedDB als nicht-extrahierbarer `CryptoKey` (AES-GCM 256),
      Passwörter je Eintrag mit frischem 96-Bit-IV versiegelt (`src/lib/credentialVault.ts`).
      `makeClient` ist asynchron und löst das Passwort pro Request über
      `getDecryptedConfig` auf. Migration der alten Klartext-Einträge beim ersten Laden,
      danach wird die passwortfreie Liste persistiert (Wischt den Klartext). Fallback
      ohne WebCrypto/IDB: nur Session im Arbeitsspeicher + deutscher Hinweis in den
      Einstellungen. Unit + E2E (`@feature:vault-migration`, `@feature:vault-fallback`).
- [x] Parität-Rest als **Server-Werkzeuge** (`/servers/:id/tools`): Dateibrowser
      (nur lesend, `GET /api/fs/list|read`), Git-Status (`GET /api/vcs/status`),
      Worktrees (`GET /api/worktree`), MCP-Server (`GET /api/mcp`), offene
      Berechtigungen mit Antwort (`GET /api/permission/request` +
      `POST …/reply`, `once`/`reject`). Offline-Policy greift auch dort.
      Details in `features/05-parity.md`. E2E `@feature:server-tools`.

## Abgeschlossen (W5)

- [x] Offline-Server: nicht entfernen, Sessions disablen — Policy in `src/lib/offline.ts`, Server bleibt in der Liste (Badge `Offline`), Sessions sichtbar aber deaktiviert, keine Lösch-Aktion und kein Auto-Remove bei Erreichbarkeitsverlust. E2E `@feature:offline-server`.
- [x] Kommandos: Shell-Befehle direkt ausführen (`POST /api/shell`) + Ergebnis anzeigen.
- [x] Shell-Output: Tail-Poll alle 2s statt Fetch-pro-Öffnen (`src/hooks/useShellOutputStream.ts`), Live-Badge, Stop bei Close/Unmount. Truncation über `truncated` erkannt.
- [x] Notifications pro Server: Toggle in Settings, `localStorage`, `useEventNotifications` respektiert ihn.
- [x] Model/Agent-Picker pro Session (`session.switchAgent`/`switchModel`), Optionen aus `GET /api/agent` + `GET /api/model` (Hidden-Agents raus, Varianten aufgefächert). E2E `@feature:agent-picker`.

## Offen (nach MVP)

- [ ] Echter Geräte-Test: PWA-Install + Offline/SW auf realem Handy (nur Config + `dist` verifiziert).
- [ ] PTY: nur Liste + Token-Anzeige; Terminal-Rendering bei Bedarf (Entscheidung in `features/05-parity.md`).
- [ ] Parität weiter aus `features/05-parity.md` (❌-Markierungen): Commands/Skills
      (`command.*`, `skill.*`), Integrationen, Config-Editor, Provider-Liste,
      Agent-Detail, Websearch, Forms, Diff-Ansicht, Session-Stats.
- [ ] Fork/compact/revert/share, Datei-Anhänge in Prompts.
- [ ] E2E-Paging vs. 5-s-Poll: Reload setzt auf Seite 1 zurück – bei langsamen Runnern beobachten.
      Zusatz aus W6: `@feature:stream-cache` (Klick auf „Ältere Nachrichten laden“)
      flakiert, wenn der IntersectionObserver die Liste während des Klicks nachlädt –
      unter Last (geteilter Host, parallele Playwright-Suite) sporadisch ein
      `locator.click`-Timeout. Nur mit `--repeat-each` reproduzierbar, die vollen
      Läufe waren grün.
- [ ] Feed-Richtung: neueste zuerst, ältere laden am Listenende (Standard-Feed); „nach oben nachladen" wörtlich ist nicht umgesetzt – Owner-Entscheidung ausstehend.
- [ ] Manuell prüfen: CI-Runs auf `main` nach jedem Push (frühe Phase: nicht auf CI warten).

## Später (MVP+1)

- [ ] Userscripts: server-stored Katalog (siehe `features/03-userscripts-postmvp.md`).
- [ ] Plugin-Überlegung (zurückgestellt, statische Natur hat Vorrang).
