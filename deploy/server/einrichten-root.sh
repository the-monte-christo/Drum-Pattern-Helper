#!/bin/bash
# Einmalige Einrichtung des Drum Pattern Helpers auf dem vServer – braucht root.
#
#   sudo bash ~/dph-setup/einrichten-root.sh
#
# Legt das Arbeitsverzeichnis an, hinterlegt nginx-Vhost und Header-Snippet,
# holt das Let's-Encrypt-Zertifikat, schaltet die Seite frei und startet die
# App einmal als admin. Mehrfach ausführbar.
set -euo pipefail

DOMAIN="drumpatternhelper.blanke.nrw"
VERZEICHNIS="/opt/drum-pattern-helper"
BENUTZER="admin"
HIER="$(cd "$(dirname "$0")" && pwd)"

if [ "$(id -u)" -ne 0 ]; then
  echo "FEHLER: Bitte mit sudo ausführen: sudo bash $0" >&2
  exit 1
fi

echo "== 0. DNS prüfen =="
IP_DOMAIN="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1 {print $1}')"
if [ -z "$IP_DOMAIN" ]; then
  echo "FEHLER: $DOMAIN löst nicht auf. Erst den DNS-Eintrag (A-Record) anlegen, dann erneut starten." >&2
  exit 1
fi
if hostname -I | tr ' ' '\n' | grep -qx "$IP_DOMAIN"; then
  echo "   $DOMAIN → $IP_DOMAIN (dieser Server)"
else
  echo "   WARNUNG: $DOMAIN → $IP_DOMAIN, aber diese Adresse ist auf dem Server nicht konfiguriert."
  echo "   Hinter NAT ist das normal; zeigt der Eintrag woanders hin, scheitert gleich certbot."
fi

echo "== 1. Arbeitsverzeichnis $VERZEICHNIS =="
mkdir -p "$VERZEICHNIS"/{daten,sicherungen}
install -m 755 "$HIER/deploy.sh" "$VERZEICHNIS/deploy.sh"
install -m 644 "$HIER/docker-compose.prod.yml" "$VERZEICHNIS/docker-compose.prod.yml"
chown -R "$BENUTZER":"$BENUTZER" "$VERZEICHNIS"

echo "== 2. nginx-Dateien =="
install -m 644 "$HIER/nginx-headers.conf" "/etc/nginx/snippets/drumpatternhelper-headers.conf"
install -m 644 "$HIER/nginx-drumpatternhelper.conf" "/etc/nginx/sites-available/$DOMAIN"

echo "== 3. Zertifikat =="
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  echo "   Zertifikat vorhanden, nichts zu tun."
else
  # Vor dem ersten Zertifikat kann der HTTPS-Block nicht laden: nur HTTP freischalten.
  TEMP="/etc/nginx/sites-available/$DOMAIN.http"
  cat > "$TEMP" <<NGINX
server {
    listen 80;
    server_name $DOMAIN;
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/acme;
        default_type text/plain;
    }
    location / { return 404; }
}
NGINX
  ln -sf "$TEMP" "/etc/nginx/sites-enabled/$DOMAIN"
  mkdir -p /var/www/acme
  nginx -t && systemctl reload nginx
  certbot certonly --webroot -w /var/www/acme -d "$DOMAIN" --non-interactive --agree-tos \
    --register-unsafely-without-email --keep-until-expiring
  rm -f "$TEMP"
fi

echo "== 4. Seite freischalten =="
ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
nginx -t
systemctl reload nginx

echo "== 5. App starten (als $BENUTZER) =="
# Login-Shell, damit Docker die ghcr.io-Anmeldung aus ~$BENUTZER/.docker nutzt.
if runuser -l "$BENUTZER" -c "$VERZEICHNIS/deploy.sh"; then
  echo
  echo "Fertig: https://$DOMAIN"
else
  echo
  echo "nginx und Zertifikat sind eingerichtet, aber die App läuft noch nicht (siehe oben)." >&2
  echo "Nach der Ursache als $BENUTZER erneut: $VERZEICHNIS/deploy.sh" >&2
  exit 1
fi

echo
echo "Neue Versionen später als $BENUTZER einspielen:"
echo "  $VERZEICHNIS/deploy.sh            # latest"
echo "  $VERZEICHNIS/deploy.sh v1.0.1     # bestimmte Version"
