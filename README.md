# Drum Pattern Helper

Pattern-Baukasten und Übungstool für Schlagzeuger, als Progressive Web App.
Pattern bestehen aus einer globalen Taktart (n/4) und zehn Layern (Metronom High,
Metronom Low, Hi-Hat, Open Hi-Hat, Snare, High/Mid/Low Tom, Kick, Cowbell). Für jeden Layer
lässt sich pro Zählzeit festlegen, wie viele Schläge es gibt (1–12, also auch Triolen,
Quintolen und Sextolen). Arrangements reihen Pattern zu einem längeren Ablauf aneinander.

Repository: <https://github.com/the-monte-christo/Drum-Pattern-Helper>

Hinweise für Entwickler und Coding-Agenten: [CLAUDE.md](CLAUDE.md)

## Funktionen

- Zwei Ebenen per Tab: **Pattern** und **Arrangement**
- Pattern-Liste mit zuletzt gespeichertem Tempo; Neu, Duplizieren, Löschen; Liste einklappbar
- Tags für Pattern und Arrangements; alle vorhandenen Tags stehen als Filter über der Liste
  (mehrere aktive Tags müssen alle zutreffen)
- Taktart 1/4 bis 16/4, Tempo 20–300 BPM (Slider, ±1, ±5, Tap-Tempo)
- Layer-Raster: Platzhalter antippen setzt den Schlag, nochmal antippen macht eine Ghost Note
  (halbe Lautstärke, Zelle halb gefüllt), ein drittes Mal leert ihn (jeweils mit Vorhören);
  Playhead und aktuelle Zählzeit laufen mit, breite Pattern scrollen beim Abspielen mit
- Open Hi-Hat klingt höchstens bis zum nächsten Hi-Hat-Schlag
- Editor (einklappbar): Schläge pro Zählzeit je Layer, „Alle“-Schnellwahl, Layer leeren,
  Layer im Layer-Bereich ein-/ausblenden; Lautstärke-Spalte ebenfalls ausblendbar
- Arrangements: Strang aus beliebigen Pattern (je ein Takt, eigenes Tempo und eigene Taktart),
  Pattern per Klick hinten anhängen, ⇄ tauscht Nachbarn, × entfernt; Wiedergabe in Schleife
- Wiedergabe mit sample-genauem Web-Audio-Scheduling; Lautstärke, Mute und Solo je Layer, Gesamtlautstärke
- Jede Änderung wird sofort gespeichert (entprellt, mit automatischem Wiederholen bei Netzwerkfehlern)
- Leertaste = Abspielen/Stopp; Bildschirm bleibt beim Üben an (Wake Lock)
- Hell/Dunkel nach Systemeinstellung, Tablet-first, auf dem Telefon mit Schubladen-Navigation
- PWA: installierbar, App-Shell und zuletzt geladene Pattern offline verfügbar

## Technik

| Bereich  | Umsetzung |
|----------|-----------|
| Frontend | Preact + Vite, ohne UI-Bibliothek (~14 KB JS gzip) |
| Audio    | Web Audio API, synthetisierte Klänge (keine Samples), Lookahead-Scheduler im Web Worker |
| Backend  | Node.js 24 + Fastify, liefert API und gebautes Frontend aus |
| Daten    | SQLite über das eingebaute `node:sqlite` (keine nativen Abhängigkeiten) |
| Betrieb  | Docker (Multi-Stage), nginx als Reverse Proxy |

```
shared/pattern.js     Pattern-Modell und -Logik (Client + Server)
server/               Fastify-App, SQLite-Store
src/                  Preact-UI, Audio-Engine (src/audio)
public/               Manifest, Service Worker, Icons
deploy/server/        Produktion: Compose, deploy.sh, nginx-Vhost, Root-Einrichtung
.github/workflows/    CI (Tests, Build, E2E) und Release (Docker-Bild → ghcr.io)
tests/                Unit- und API-Tests (node:test)
scripts/              Icon-Generator, Browser-E2E-Test
```

## Entwicklung

Voraussetzung: Node.js ≥ 22.13 (empfohlen: 24 LTS).

```bash
npm install
npm run dev      # API auf :3000, Vite-Dev-Server auf :5173 (mit Proxy auf /api)
npm test         # Unit- und API-Tests
npm run test:e2e # Browser-E2E (nach build; nutzt lokales Chrome/Edge, CHROME_PATH zum Überschreiben)
npm run build    # Frontend nach dist/ bauen
npm start        # Produktionsserver auf :3000 (liefert dist/ aus)
npm run icons    # PWA-Icons neu erzeugen
```

Beim ersten Start mit leerer Datenbank werden drei Demo-Pattern (Paradiddle, 6 Stroke-Roll, Beat 1)
und ein Demo-Arrangement (Warm-up) angelegt. Bestehende Datenbanken werden beim Start automatisch
nachgerüstet (Tags-Spalte, Arrangement-Tabelle, neue Layer).

### Umgebungsvariablen

| Variable    | Standard          | Bedeutung |
|-------------|-------------------|-----------|
| `PORT`      | `3000`            | HTTP-Port |
| `HOST`      | `0.0.0.0`         | Bind-Adresse |
| `DB_FILE`   | `./data/drums.db` | Pfad der SQLite-Datei (Docker: `/data/drums.db`) |
| `LOG_LEVEL` | `info`            | Fastify-/Pino-Loglevel |

## Deployment

Live: <https://drumpatternhelper.blanke.nrw>, auf demselben vServer und nach demselben Muster wie
republic-of-rome.blanke.nrw.

```
git tag vX.Y.Z → GitHub Action „Release“ → ghcr.io/the-monte-christo/drum-pattern-helper:vX.Y.Z + :latest
                                              ↓ docker compose pull
vServer: /opt/drum-pattern-helper/deploy.sh → Container auf 127.0.0.1:3030 ← nginx (TLS, Let's Encrypt)
```

### Neue Version veröffentlichen

```bash
# lokal: Version in package.json anheben, committen, dann
git tag v1.0.1 && git push origin main v1.0.1     # Action baut und veröffentlicht das Bild

# auf dem Server (als admin, kein root nötig)
/opt/drum-pattern-helper/deploy.sh            # latest
/opt/drum-pattern-helper/deploy.sh v1.0.1     # bestimmte Version, auch zum Zurückrollen
```

`deploy.sh` sichert vorher die SQLite-Datenbank (konsistenter Schnappschuss per `VACUUM INTO`,
die letzten 14 als `.db.gz` in `sicherungen/`), holt das Bild, startet neu und prüft `/api/health`.

### Server-Layout

```
/opt/drum-pattern-helper/
  deploy.sh                 aus deploy/server/
  docker-compose.prod.yml   aus deploy/server/
  daten/drums.db            SQLite (Bind-Mount nach /data, UID 1000 = admin)
  sicherungen/              drums-<Zeitstempel>.db.gz
  .env                      optional, z. B. APP_PORT=3030
/etc/nginx/sites-available/drumpatternhelper.blanke.nrw
/etc/nginx/snippets/drumpatternhelper-headers.conf   CSP, HSTS u. a.
```

### Ersteinrichtung (einmalig, root)

DNS-A-Record für `drumpatternhelper.blanke.nrw` auf den Server, dann die Dateien aus `deploy/server/`
nach `~/dph-setup/` kopieren und ausführen:

```bash
sudo bash ~/dph-setup/einrichten-root.sh
```

Das Skript prüft das DNS, legt `/opt/drum-pattern-helper` an, installiert Vhost und Header-Snippet,
holt das Zertifikat über den Webroot `/var/www/acme`, schaltet die Seite frei und startet die App als admin.
Mehrfach ausführbar. Voraussetzung: admin ist an `ghcr.io` angemeldet (`docker login ghcr.io`), falls
das Paket privat ist.

### Lokal mit Docker

```bash
docker compose up -d --build     # baut aus dem Quellcode, Port 127.0.0.1:3000, Volume drums-data
```

> Für Service Worker und Installation als App ist HTTPS nötig (localhost ausgenommen).

## API

| Methode | Pfad                | Beschreibung |
|---------|---------------------|--------------|
| GET     | `/api/health`       | Healthcheck |
| GET     | `/api/patterns`     | Alle Pattern (vollständig) |
| GET     | `/api/patterns/:id` | Ein Pattern |
| POST    | `/api/patterns`     | Pattern anlegen |
| PUT     | `/api/patterns/:id` | Pattern ersetzen |
| DELETE  | `/api/patterns/:id` | Pattern löschen (entfernt es auch aus allen Arrangements) |
| GET     | `/api/arrangements`     | Alle Arrangements |
| GET     | `/api/arrangements/:id` | Ein Arrangement |
| POST    | `/api/arrangements`     | Arrangement anlegen |
| PUT     | `/api/arrangements/:id` | Arrangement ersetzen |
| DELETE  | `/api/arrangements/:id` | Arrangement löschen |

Eingaben werden serverseitig normalisiert (Grenzen, fehlende Layer, Array-Längen, Tags,
nur vorhandene Pattern in Arrangements).

Pattern-Format:

```json
{
  "name": "Beat 1",
  "beats": 4,
  "bpm": 130,
  "tags": ["Groove"],
  "layers": [
    { "key": "hihat", "volume": 0.6, "muted": false, "hidden": false,
      "subdivisions": [2, 2, 2, 2],
      "hits": [[1, 1], [1, 2], [1, 1], [1, 0]] }
  ]
}
```

`subdivisions[b]` ist die Anzahl der Platzhalter auf Zählzeit `b`, `hits[b][i]` der Schlag dort:
`0` = keiner, `1` = Schlag, `2` = Ghost Note. `hidden` blendet den Layer nur in der Ansicht aus.
Layer-Schlüssel: `metro_high`, `metro_low`, `hihat`, `hihat_open`, `snare`, `tom_high`, `tom_mid`,
`tom_low`, `kick`, `cowbell`.

Arrangement-Format (`items` = Pattern-IDs in Abspielreihenfolge, Wiederholungen erlaubt):

```json
{ "name": "Warm-up", "tags": ["Übung"], "items": [1, 2, 3, 3] }
```

## Mögliche nächste Schritte

- Weitere Layer (Ride, Crash) und Akzente
- Wiederholungen je Arrangement-Eintrag (z. B. „4× Beat 1“), Pattern per Ziehen umsortieren
- Vorzähler, Tempo-Trainer (automatisch schneller werden)
- Mehrtaktige Pattern
- Login bzw. mehrere Nutzer (aktuell ein gemeinsamer Datenbestand ohne Authentifizierung)

## Lizenz

[Unlicense](LICENSE) – gemeinfrei.
