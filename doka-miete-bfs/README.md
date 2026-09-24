# Doka-Mietrechnungen – Baustelle BfS Oberschleißheim

Dashboard für die monatlichen Doka-Mietrechnungen: Monatsentwicklung, alle Rechnungspositionen und Bestand der
Sichtbetonelemente (Art.-Nr. 999300105).

## Neue Rechnung einlesen
1. Anmelden, PDF in das Upload-Feld ziehen.
2. Summenprüfung ansehen (Positionssumme = Bruttomiete Seite 1), dann „Rechnung übernehmen“.
3. Die Rechnung wird in der Datenbank gespeichert und ist sofort für alle Freigeschalteten sichtbar.
   Gibt es für den Monat schon eine andere Rechnung, wird sie ersetzt.

Gescannte Rechnungen ohne Textebene: Werte von Seite 1 von Hand eintragen (werden rechnerisch geprüft).

## Datenbank und Zugriffsschutz
Die Daten liegen **nicht** im Repo (das Repo ist öffentlich), sondern im Supabase-Projekt **riedel-stahllisten**
(`sazhfayopozqcluvmqqu`) – mit eigenen Tabellen und eigener Freigabeliste, getrennt von den Stahllisten:
- Tabelle `doka_daten` – Stammdaten der Baustelle und eine Zeile je Rechnung
- Tabelle `doka_zugang` – Freigabeliste

Zugriff hat nur, wer **angemeldet**, **E-Mail bestätigt** und in `doka_zugang` **freigeschaltet** ist. Das prüft die
Datenbank per Row Level Security. Die Konten teilen sich Doka und Stahllisten (ein Konto für beide),
die Freigabe gilt aber je Tool: Wer nur für die Stahllisten freigeschaltet ist, sieht keine Doka-Rechnungen.

### Einmalige Einrichtung
1. Tool öffnen und anmelden (ein bestehendes Stahllisten-Konto geht auch; sonst **Konto anlegen** und E-Mail bestätigen).
2. Das Tool zeigt „Datenbank einrichten“ mit dem fertigen SQL (inkl. dir als erstem Admin). **SQL kopieren**,
   im Supabase SQL Editor ausführen, **Erneut prüfen**. Das Skript liegt auch als `supabase-setup.sql` im Ordner
   und kann gefahrlos erneut ausgeführt werden.
3. Bisherige Daten über **Sicherung laden** einspielen (Datei `rechnungen.json` aus der früheren Version).
4. Kollegen legen sich ein Konto an; du schaltest sie unter **Zugänge** frei (Rolle *Mitglied* oder *Admin*).

Damit der Link in der Bestätigungs-Mail zurück zu diesem Tool führt, die Adresse des Tools in Supabase unter
*Authentication → URL Configuration → Redirect URLs* eintragen (sonst landet man auf der dort eingetragenen Site URL,
was aber auch funktioniert: E-Mail ist dann trotzdem bestätigt).

„Sicherung speichern“ lädt alle Rechnungen als JSON-Datei herunter. Rechnungen, die in der früheren Version nur im
Browser gespeichert waren, bietet das Tool nach der Anmeldung zur Übernahme an. Ein früher hinterlegter GitHub-Token
wird aus dem Browser gelöscht.

## Logos
Offizielle Logodateien in den Ordner `assets/` legen (SVG bevorzugt, PNG geht auch):
- `assets/logo-riedel.svg` bzw. `.png` – erscheint links im Kopf
- `assets/logo-doka.svg`, `.png` oder `.jpg` – erscheint rechts als Lieferant

## Dateien
- `index.html` – Dashboard, Upload, Anmeldung
- `doka-parser.js` – liest Doka-Mietrechnungen (pdf.js) aus
- `supabase-setup.sql` – Tabellen und Zugriffsregeln
- `vendor/supabase.js` – supabase-js 2.117.1 (lokal eingebunden)
