# Projekte

Eine Rubrik je Projekt in den Riedel-Tools mit Ablage für Pläne, 3D-Modelle & Tools, Mengen & Abrechnung,
Protokolle & Schriftverkehr, Fotos und Sonstiges. Auf der Startseite stehen die Projekte über den Tools.

- **In der App ablegen:** Projekt öffnen → *Datei hochladen* (PDF, Bilder, Excel, DWG/DXF, ZIP … bis 50 MB,
  auch per Ziehen) oder *Link ablegen* (Claude-Artifact, SharePoint, OneDrive). Liegt in Supabase:
  Tabelle `projekt_dokumente`, privater Bucket `projektablage`. Zugriff hat, wer für die Riedel-Tools
  freigeschaltet ist.
- **Im Repo ablegen** (z. B. HTML-Tools aus Claude-Artifacts): Datei nach `projekte/<projekt-id>/` legen
  und in `projekte.js` unter `docs` eintragen. Seiten bekommen oben `<script src="../../assets/auth-gate.js"></script>`.
- **Neues Projekt:** Eintrag in `projekte.js` ergänzen.

## Einmalige Einrichtung
`supabase-setup.sql` im Supabase SQL Editor ausführen (Projekt riedel-stahllisten). Die Seite zeigt das SQL
für Admins auch direkt an, solange die Tabelle fehlt.

## Dateien
- `index.html` – Übersicht (`projekte/`) und Ablage je Projekt (`projekte/?p=<id>`)
- `projekte.js` – Projekte, Rubriken und Dokumente im Repo
- `supabase-setup.sql` – Tabelle, Zugriffsregeln, Storage-Bucket
- `ostermeier-taufkirchen/aushub-3d.html` – Aushub 3D, Baugrube mit Böschungen 45° (Plan 26-24_OST_AH_V00)
