#!/bin/bash
# Spielt eine Version des Drum Pattern Helpers auf dem vServer ein (als admin, kein root nötig).
#
#   ./deploy.sh            # neuestes Bild (Tag latest)
#   ./deploy.sh v1.0.1     # bestimmte Version
#
# Ablauf: Sicherung → Bild holen → neu starten → Health-Check.
# Schlägt der Health-Check fehl, bricht das Skript ab und nennt den Rückweg.
set -euo pipefail

VERZEICHNIS="${DPH_VERZEICHNIS:-/opt/drum-pattern-helper}"
VERSION="${1:-latest}"
BILD="ghcr.io/the-monte-christo/drum-pattern-helper:$VERSION"
cd "$VERZEICHNIS"

# Optional: APP_PORT u. ä. überschreiben
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi
HAFEN="${APP_PORT:-3030}"
COMPOSE=(docker compose -f docker-compose.prod.yml)

# Vorher anlegen: Fehlt der Ordner, legt Docker ihn als root an und die App kann nicht schreiben.
mkdir -p daten sicherungen

echo "== 1. Sicherung der Datenbank =="
STEMPEL="$(date +%Y%m%d-%H%M%S)"
# `ps -q` meldet auch ohne laufenden Dienst Erfolg – es zählt die Ausgabe.
LAEUFT="$("${COMPOSE[@]}" ps --status running -q app 2>/dev/null || true)"
if [ -n "$LAEUFT" ] && [ -f daten/drums.db ]; then
  # VACUUM INTO schreibt einen konsistenten Schnappschuss, auch während der Server läuft (WAL).
  "${COMPOSE[@]}" exec -T -e ZIEL="/data/sicherung-$STEMPEL.db" app \
    node --disable-warning=ExperimentalWarning -e \
    'const { DatabaseSync } = require("node:sqlite");
     new DatabaseSync("/data/drums.db").prepare("VACUUM INTO ?").run(process.env.ZIEL);'
  mv "daten/sicherung-$STEMPEL.db" "sicherungen/drums-$STEMPEL.db"
elif [ -f daten/drums.db ]; then
  cp daten/drums.db "sicherungen/drums-$STEMPEL.db"
fi
if [ -f "sicherungen/drums-$STEMPEL.db" ]; then
  gzip "sicherungen/drums-$STEMPEL.db"
  echo "   sicherungen/drums-$STEMPEL.db.gz ($(du -h "sicherungen/drums-$STEMPEL.db.gz" | cut -f1))"
  # Aufbewahrung: die letzten 14 Sicherungen
  ls -1t sicherungen/drums-*.db.gz 2>/dev/null | tail -n +15 | xargs -r rm --
else
  echo "   Noch keine Datenbank – erster Start, keine Sicherung."
fi

echo "== 2. Bild holen: $BILD =="
export APP_IMAGE="$BILD"
"${COMPOSE[@]}" pull app

echo "== 3. Starten =="
"${COMPOSE[@]}" up -d

echo "== 4. Health-Check =="
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$HAFEN/api/health" 2>/dev/null | grep -q '"ok":true'; then
    echo "   Version $VERSION läuft auf 127.0.0.1:$HAFEN."
    docker image prune -f > /dev/null 2>&1 || true
    exit 0
  fi
  sleep 2
done

echo "FEHLER: Der Server meldet sich nicht als gesund." >&2
"${COMPOSE[@]}" logs --tail 40 app >&2
echo >&2
echo "Rückweg: ./deploy.sh <vorherige Version>, Sicherungen liegen in $VERZEICHNIS/sicherungen." >&2
exit 1
