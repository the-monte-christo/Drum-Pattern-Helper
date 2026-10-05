# Drum Pattern Helper

Pattern-Baukasten und Übungstool für Schlagzeuger, als Progressive Web App.
Pattern bestehen aus einer globalen Taktart (n/4) und fünf Layern (Metronom High,
Metronom Low, Hi-Hat, Snare, Kick). Für jeden Layer lässt sich pro Zählzeit
festlegen, wie viele Schläge es gibt (1–12, also auch Triolen, Quintolen und Sextolen).

Repository: <https://github.com/the-monte-christo/Drum-Pattern-Helper>

Hinweise für Entwickler und Coding-Agenten: [CLAUDE.md](CLAUDE.md)

## Funktionen

- Pattern-Liste mit zuletzt gespeichertem Tempo; Neu, Duplizieren, Löschen
- Taktart 1/4 bis 16/4, Tempo 20–300 BPM (Slider, ±, Tap-Tempo)
- Layer-Raster: Platzhalter antippen setzt den Schlag (mit Vorhören); Playhead und aktuelle Zählzeit laufen mit
- Editor: Schläge pro Zählzeit je Layer, „Alle“-Schnellwahl, Layer leeren
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
deploy/nginx.conf     Beispiel-Konfiguration Reverse Proxy
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

Beim ersten Start mit leerer Datenbank werden drei Demo-Pattern angelegt
(Paradiddle, 6 Stroke-Roll, Beat 1).

### Umgebungsvariablen

| Variable    | Standard          | Bedeutung |
|-------------|-------------------|-----------|
| `PORT`      | `3000`            | HTTP-Port |
| `HOST`      | `0.0.0.0`         | Bind-Adresse |
| `DB_FILE`   | `./data/drums.db` | Pfad der SQLite-Datei (Docker: `/data/drums.db`) |
| `LOG_LEVEL` | `info`            | Fastify-/Pino-Loglevel |

## Deployment (Docker + nginx)

```bash
git clone https://github.com/the-monte-christo/Drum-Pattern-Helper.git drum-pattern-helper
cd drum-pattern-helper
docker compose up -d --build
```

Der Container lauscht nur auf `127.0.0.1:3000`, die Daten liegen im Volume `drums-data`.
`deploy/nginx.conf` ist eine Vorlage für den Reverse Proxy mit TLS: Domain eintragen,
nach `/etc/nginx/sites-available/` kopieren, aktivieren und das Zertifikat z. B. mit certbot holen.

Update: `git pull && docker compose up -d --build`.

Ohne Docker: `npm ci && npm run build && npm start`, z. B. als systemd-Dienst.

> Hinweis: Für Service Worker und Installation als App ist HTTPS nötig (localhost ausgenommen).

## API

| Methode | Pfad                | Beschreibung |
|---------|---------------------|--------------|
| GET     | `/api/health`       | Healthcheck |
| GET     | `/api/patterns`     | Alle Pattern (vollständig) |
| GET     | `/api/patterns/:id` | Ein Pattern |
| POST    | `/api/patterns`     | Pattern anlegen |
| PUT     | `/api/patterns/:id` | Pattern ersetzen |
| DELETE  | `/api/patterns/:id` | Pattern löschen |

Eingaben werden serverseitig normalisiert (Grenzen, fehlende Layer, Array-Längen).

Pattern-Format:

```json
{
  "name": "Beat 1",
  "beats": 4,
  "bpm": 130,
  "layers": [
    { "key": "hihat", "volume": 0.6, "muted": false,
      "subdivisions": [2, 2, 2, 2],
      "hits": [[1, 1], [1, 1], [1, 1], [1, 1]] }
  ]
}
```

`subdivisions[b]` ist die Anzahl der Platzhalter auf Zählzeit `b`, `hits[b][i]` ob dort ein Schlag sitzt.
Layer-Schlüssel: `metro_high`, `metro_low`, `hihat`, `snare`, `kick`.

## Mögliche nächste Schritte

- Weitere Layer (Toms, Ride, Crash) und Akzente/Ghost Notes pro Schlag
- Vorzähler, Tempo-Trainer (automatisch schneller werden)
- Mehrtaktige Pattern
- Login bzw. mehrere Nutzer (aktuell ein gemeinsamer Datenbestand ohne Authentifizierung)

## Lizenz

[Unlicense](LICENSE) – gemeinfrei.
