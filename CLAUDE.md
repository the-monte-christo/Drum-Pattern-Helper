# CLAUDE.md – Arbeitsanleitung für Agenten

Drum Pattern Helper: PWA, mit der Schlagzeuger Pattern zusammenbauen und üben.
Ursprüngliche Anforderungen: [Projektübersicht.md](Projektübersicht.md) und [mockup.jpeg](mockup.jpeg).
Nutzer-Doku, API und Deployment: [README.md](README.md).

Sprache: **UI-Texte, Code-Kommentare, Testnamen und Doku auf Deutsch**; Bezeichner im Code auf Englisch.
Der Projektinhaber schreibt Deutsch.

## Befehle

```bash
npm install
npm run dev        # API :3000 (node --watch) + Vite :5173 mit Proxy /api → :3000
npm test           # Unit- + API-Tests (node:test), schnell, immer vor dem Commit
npm run build      # Frontend → dist/
npm run test:e2e   # Browser-E2E (braucht dist/ und lokales Chrome/Edge; CHROME_PATH überschreibt)
E2E_SCREENSHOTS=./shots npm run test:e2e   # zusätzlich Screenshots zur Sichtprüfung (shots/ nicht committen)
npm start          # Produktionsserver, liefert dist/ aus
npm run icons      # public/icons/* neu erzeugen (Skript ohne Abhängigkeiten)
```

Node ≥ 22.13 (lokal und im Docker-Image: Node 24) – nötig für das eingebaute `node:sqlite`.
`--disable-warning=ExperimentalWarning` in den Scripts unterdrückt nur dessen Warnung.

## Architektur

```
shared/pattern.js   Datenmodell + reine Funktionen (Client UND Server importieren das)
server/app.js       Fastify: REST-API, statische Auslieferung von dist/, SPA-Fallback
server/db.js        SQLite-Store (eine Tabelle, Layer als JSON-Spalte), Seed mit Demo-Pattern
server/index.js     Einstieg, liest PORT/HOST/DB_FILE/LOG_LEVEL
src/store.js        usePatternStore: alle Pattern im Speicher, entprelltes Auto-Save (350 ms) + Retry
src/audio/engine.js AudioEngine: Lookahead-Scheduler, Gains je Layer, Mute/Solo, Playhead-Position
src/audio/voices.js Synthetisierte Klänge (keine Samples)
src/audio/ticker.worker.js  25-ms-Takt im Worker (nicht gedrosselt im Hintergrund-Tab)
src/components/     Sidebar, PatternHeader, LayerGrid, Editor, Transport, ui (Icon, Stepper, useAnimationFrame)
public/sw.js        Service Worker (handgeschrieben, kein Workbox)
scripts/            make-icons.mjs, e2e.mjs
deploy/server/      Produktion: docker-compose.prod.yml, deploy.sh, nginx-Vhost + Header-Snippet, einrichten-root.sh
.github/workflows/  ci.yml (Tests, Build, E2E bei Push/PR), release.yml (Tag v* → Docker-Bild nach ghcr.io)
```

## Deployment (Details in README.md)

- Release = Git-Tag `v*` → Action baut `ghcr.io/the-monte-christo/drum-pattern-helper:<tag>` + `:latest`.
- Server: `ssh admin@pvtsrv.blanke.nrw` (Windows: `C:/Windows/System32/OpenSSH/ssh.exe`, siehe unten).
  admin hat **kein sudo für Agenten** – root-Schritte (nginx, certbot) nur als Skript für den Inhaber vorbereiten.
  admin ist in der docker-Gruppe und an ghcr.io angemeldet.
- Live: `/opt/drum-pattern-helper` (Port 127.0.0.1:3030), Domain `drumpatternhelper.blanke.nrw`.
  Einspielen: `/opt/drum-pattern-helper/deploy.sh [vX.Y.Z]` (als admin).
- Auf dem Server laufen weitere Projekte (republic-of-rome :3010, schwindelex :3020, n8n :5001 u. a.) –
  deren Dateien, Container und nginx-Configs nicht anfassen. Neuer Dienst = neuer freier Port.
- CSP in `deploy/server/nginx-headers.conf` ist streng (kein Inline-Skript/-Style). Styles nur per CSSOM
  (`el.style`, Preact-`style`-Objekte) setzen, keine `style="..."`-Strings im HTML, keine externen Ressourcen.
- Änderungen an deploy/server/* müssen auf dem Server nachgezogen werden (deploy.sh/Compose nach
  /opt/drum-pattern-helper kopieren; nginx-Dateien braucht root → einrichten-root.sh erneut ausführen lassen).

### Datenmodell (`shared/pattern.js`)

```js
{ id, name, beats /* n von n/4 */, bpm,
  layers: [{ key, volume /* 0..1 */, muted, subdivisions: number[beats], hits: (0|1)[beats][subdivisions[b]] }] }
```

- Layer-Reihenfolge und -Schlüssel kommen ausschließlich aus `LAYERS`; `normalizePattern` erzwingt genau diese.
- Grenzen stehen in `LIMITS` (beats 1–16, bpm 20–300, Unterteilung 1–12, Name ≤ 60).
- Alle Änderungen laufen über reine Funktionen (`toggleHit`, `setSubdivision`, `setBeats`, …),
  die ein neues Objekt zurückgeben. Komponenten rufen `onEdit(p => fn(p, …))` auf.
- Der Server normalisiert **jede** Eingabe mit `normalizePattern` – Client-Daten nie ungeprüft speichern.
- Neuer Layer = Eintrag in `LAYERS` + Stimme in `VOICES` + Farbe `--c-<key>` (Hell und Dunkel) + `.l-<key>` in styles.css.
  Bestehende Datensätze bekommen den Layer über `normalizePattern` automatisch.

### Audio-Timing

- Geplant wird **pro Zählzeit**: Sobald der Start einer Zählzeit in das 120-ms-Fenster fällt, werden alle
  ihre Schläge (über alle Layer, Position = `frac * Zählzeitdauer`) auf der AudioContext-Uhr eingeplant.
  Tempo- und Pattern-Änderungen greifen dadurch ab der nächsten Zählzeit.
- `stop()` bricht bereits geplante Quell-Nodes ab (`this.sources`).
- Die Playhead-Anzeige liest `engine.position()` im `requestAnimationFrame` und schreibt **direkt ins DOM**
  (transform, classList, textContent). Während der Wiedergabe gibt es bewusst keine Preact-Re-Renders.
- Der AudioContext entsteht erst bei einer Nutzergeste (Play oder Platzhalter antippen).

### Speichern

- Jede Änderung wird optimistisch in den State übernommen und nach 350 ms per `PUT` (komplettes Pattern) gespeichert.
- Schlägt das fehl, gibt es nach 4 s einen neuen Versuch; beim Verstecken der Seite wird mit `keepalive` geflusht.
- Solo ist nur Sitzungszustand. Mute, Lautstärken, Tempo und Hits werden gespeichert.

## Stolperfallen (bereits einmal reingetreten)

- **CSS-Grid der Lanes**: `.lane` ist `display: contents`, Zellen werden per Auto-Platzierung verteilt.
  Ein zusätzliches Grid-Item mit expliziter Position verschiebt alles. Deshalb ist `.playhead-lane`
  `position: absolute` (zählt nicht zur Platzierung) – und Zellen nie per `display: none` ausblenden,
  sondern mit `visibility: hidden`.
- **Playhead-Mathe** setzt gleich breite Zählzeiten voraus (`repeat(var(--beats), minmax(0, 1fr))`) –
  keine Gaps zwischen den Zählzeit-Spalten einführen.
- **@fastify/static v10**: `setHeaders(reply, path)` bekommt die Fastify-`reply` (`reply.header()`), nicht `res`.
  Nicht `wildcard: false` setzen – sonst werden nach einem Rebuild neue Asset-Hashes nicht ausgeliefert.
- **SPA-Fallback** nur für Pfade ohne Dateiendung, sonst bekommt ein fehlendes `/assets/x.js` HTML zurück.
- **Platzhalter reagieren auf `click`**, nicht `pointerdown` – sonst setzt eine Wischgeste zum Scrollen Noten.
- **Windows**: `npm start` im Hintergrund zu beenden, beendet nicht immer den Node-Kindprozess (Port bleibt belegt).
  Für Testserver direkt `node server/index.js` starten. Das E2E-Skript startet seinen eigenen Server auf freiem Port.
- **Git + SSH unter Windows**: Das ssh von Git Bash findet den GitHub-Schlüssel ggf. nicht;
  `GIT_SSH_COMMAND="C:/Windows/System32/OpenSSH/ssh.exe" git push` funktioniert.

## Konventionen

- Kein UI-Framework, kein CSS-Framework. Styles in `src/styles.css` mit Tokens auf `:root`,
  Hell-Modus über `@media (prefers-color-scheme: light)` (das System entscheidet, kein Umschalter).
- Tablet first: Touch-Ziele ≥ 44 px (Slots 46 px). Breakpoints: ≤ 900 px Liste als Schublade, ≤ 640 px Telefon.
- Abhängigkeiten sparsam halten (Laufzeit: fastify, @fastify/static, preact).
- Neue Logik in `shared/pattern.js` bekommt Tests in `tests/pattern.test.js`, neue Endpunkte in `tests/api.test.js`.
- UI-Änderungen mit `npm run build && E2E_SCREENSHOTS=./shots npm run test:e2e` prüfen und die Screenshots ansehen.

## Stand und offene Punkte

Fertig: alle Punkte aus der Projektübersicht (Liste, Taktart, Tempo mit Sofort-Speichern, 5 Layer,
Platzhalter-Editor, Metronom, Wiedergabe, Lautstärke je Layer, Hell/Dunkel, PWA, Docker).

Nicht verifiziert: Klang auf echten Geräten (Timing ist per E2E geprüft, gehört wurde nichts).
Der Docker-Build läuft in der Release-Action (lokal ist kein Docker installiert).

Ideen / mögliche nächste Schritte (nicht beauftragt):
- Authentifizierung – die API ist offen; bei öffentlicher Domain mindestens Basic Auth in nginx
- Akzente/Ghost Notes, weitere Layer (Toms, Ride, Crash), Vorzähler, Tempo-Trainer, mehrtaktige Pattern
- Sortierung der Pattern-Liste (aktuell nach Anlage-ID)
- Offline-Bearbeitung mit Sync (aktuell: offline nur lesen, Speichern wird wiederholt)
