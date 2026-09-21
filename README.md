# Doka-Mietrechnungen – Baustelle BfS Oberschleißheim

Dashboard für die monatlichen Doka-Mietrechnungen (Projekt 242022371, Kostenstelle 7421341):
Monatsentwicklung, alle Rechnungspositionen und Bestand der Sichtbetonelemente (Art.-Nr. 999300105).

## Neue Rechnung einlesen
1. Seite öffnen, PDF in das Upload-Feld ziehen.
2. Summenprüfung ansehen (Positionssumme = Bruttomiete Seite 1), dann „Rechnung übernehmen“.
3. Gespeichert wird
   - mit GitHub-Token (unter „Speicherort einstellen“): direkt als Commit in `doka-miete-bfs/data/rechnungen.json` (Repo riedel-tools), sichtbar auf allen Geräten,
   - ohne Token: nur im aktuellen Browser. Über „rechnungen.json herunterladen“ lässt sich die Datei manuell ins Repo laden.

Gescannte Rechnungen ohne Textebene: Werte von Seite 1 von Hand eintragen (werden rechnerisch geprüft).

## Token
Fine-grained Personal Access Token, nur dieses Repository, Berechtigung *Contents: Read and write*, mit Ablaufdatum.
Der Token wird ausschließlich im localStorage des Browsers gespeichert.

## Logos
Offizielle Logodateien in den Ordner `assets/` legen (SVG bevorzugt, PNG geht auch):
- `assets/logo-riedel.svg` bzw. `.png` – erscheint links im Kopf
- `assets/logo-doka.svg`, `.png` oder `.jpg` – erscheint rechts als Lieferant

Fehlt eine Datei, zeigt die Seite einen neutralen Platzhalter.

## Dateien
- `index.html` – Dashboard und Upload
- `doka-parser.js` – liest Doka-Mietrechnungen (pdf.js) aus
- `data/rechnungen.json` – alle eingelesenen Rechnungen
