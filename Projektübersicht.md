# Übersicht
Ein Programm namens Drums Pattern Helper, welches auf einem Webserver (public v-Server, npm oder docker, nginx, private Domain) gehostet werden soll. Hosting/Publishing ist nicht deine Aufgabe. Webserver wird durch GitHub versorgt. (https://github.com/the-monte-christo/Drum-Pattern-Helper)

## Funktion
Die Aufgabe des Programmes ist eine Hilfefunktion für Schlagzeuger Pattern zu üben. Hierfür soll man sich diese Pattern zusammenbauen können.

im ersten Schritt wird die Taktart bestimmt also wie viele Zählzeiten in einem Takt sein sollen. Wir beschränken uns erstmal immer auf n / 4tel (also 4/4tel , 3/4tel...)
Dann soll man innerhalb der Zählzeiten bestimmen können wie viele Platzhalter für Noten / Schläge man einsetzen kann.
Ein Beispiel: ich habe eine Taktart von 4/4tel in der Zählzeit 1 möchte ich 4 Schläge. auf der Zählzeit 2 möchte ich 3 Schläge. auf der Zählzeit 3 möchte ich 4 Schläge und auf der Zählzeit 4 möchte ich 2 Schläge.
Somit kann man sich Pattern mit verschiedenen Rhythmen zusammenbauen.

Das Ganze soll als Layer-System wie in einem Digital Audio Workstation aufgebaut sein. (erstmal aber nur je einen Layer für Metronom_low, Metronom_high, High_hat, Snare und Kick)
Die Taktart ist jedoch global für das ausgewählte Pattern gültig. Die Definition wie viele Schläge pro Zählzeit kann individuell eingestellt werden.

Die App soll ein Metronom haben und die Geschwindigkeit für einzelne Pattern speichern können. Ebenfalls soll man die Pattern abspielen können. Hierbei soll man die Lautstärke je Layer und Metronom einzeln einstellen können 

die App soll aus zwei Bereichen bestehen (siehe Mockup):
der linke Bereich soll eine Liste der Pattern beinhalten und die zuletzt gespeicherte Geschwindigkeit anzeigen. in dem Linken Bereich wählt man einen Pattern aus der Liste aus und der Inhalt wird auf der rechten Seite angezeigt.
oben Pattern Name, Taktart, zuletzt gespeichertes Tempo mit Regler zum ändern (nach Änderung speichert sofort),

Layerbereich:
Hier werden erstmal nur die Platzhalter angezeigt. Wenn man einen Platzhalter anklickt, soll hierdurch die entsprechende Note / Schlag platziert werden.

Editorbereich:
für jeden Layer soll hier einstellbar bei welcher Zählzeit wie viele Platzhalter für Schläge es gibt.


## Techstack
Der Techstack ist nur als Serviervorschlag geplant, du darfst davon abweichen.
Node/JS LTS mit React oder Preact. Schmale Datenbank wie beispielsweise SQLite. Es bietet sich ein Docker Container an, du darfst auch für npm entscheiden, wenn performanter. Die App soll als Progressive Webapp funktionieren

## UI/Design
Technisch, optisch orientiert an modernen Digital Audio Workstations. Light/Dark mode von System Default übernehmen. UI hochperformant, Tablet first.