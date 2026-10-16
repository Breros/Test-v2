# Wiegemoment

Eine kleine, mobilfreundliche Web-App für tägliche Gewichtseinträge und eine Trend-Prognose für die nächsten sieben Tage.

## Starten

Die Dateien können auf einem statischen Webhost veröffentlicht werden. Zum lokalen Testen reicht ein einfacher HTTP-Server, zum Beispiel:

```sh
python3 -m http.server 8000
```

Danach `http://localhost:8000` im Browser öffnen. Für die Installation auf dem iPhone und den Offline-Modus muss die veröffentlichte Seite über HTTPS erreichbar sein. In Safari **Teilen → Zum Home-Bildschirm** wählen.

## Speicherung und Prognose

Einträge werden lokal im Browser (`localStorage`) gespeichert und verlassen das Gerät nicht. Sie werden nicht zwischen Geräten synchronisiert; beim Löschen der Browserdaten können sie verloren gehen. Über **CSV exportieren** kann eine Sicherung erstellt werden.

Die Wochenprognose berechnet eine lineare Trendlinie aus den letzten bis zu 14 Einträgen und projiziert sie sieben Tage ab dem neuesten Eintrag. Sie ist eine grobe Orientierung, keine medizinische Vorhersage.
