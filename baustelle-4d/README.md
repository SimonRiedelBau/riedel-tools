# Baustelle 4D

Baufortschritt am IFC-Modell: 4D-Ablauf, Status je Bauteil, Soll/Ist, Last Planner (Wochenplan, Vorschau, PPC),
Vergaben, Mängel, Bautagebuch und Aufmaß.

## Gemeinsamer Stand
- In den Riedel-Tools (mit Anmeldung) gibt es oben den Button **Projekte**. Dort wird ein geladenes IFC-Modell als
  gemeinsames Projekt angelegt. Das IFC liegt danach im privaten Bucket `baustelle-4d`, alle Daten in `b4d_daten`.
- Jeder Datensatz (Ablauf, Bauteilstatus, Zusage, Hindernis, Mangel, Tagebucheintrag) ist eine eigene Zeile.
  Geänderte Datensätze werden einzeln gespeichert, andere geöffnete Geräte bekommen sie live.
- Ohne Netz bleibt der Stand im Browser und wird beim nächsten Öffnen bzw. sobald wieder Netz da ist nachgetragen.
- Beim Ablauf (Vorgänge, Termine, Vergaben) gilt: Hat jemand anderes zwischenzeitlich gespeichert, wird dessen Stand
  übernommen und ein Hinweis angezeigt.
- Demo und lokal geladene IFC-Dateien bleiben nur im jeweiligen Browser, bis sie unter **Projekte** freigegeben werden.

## Einmalige Einrichtung
`supabase-setup.sql` im Supabase SQL Editor ausführen (Projekt riedel-stahllisten). Voraussetzung ist `zugang-setup.sql`.
Die Seite zeigt das SQL unter **Projekte** auch direkt an, solange die Tabellen fehlen.

## Dateien
- `index.html` – die App (identisch mit der claude.ai-Version; der gemeinsame Speicher schaltet sich nur hier ein)
- `web-ifc.wasm` – IFC-Leser
- `supabase-setup.sql` – Tabellen `b4d_projekte`, `b4d_daten`, Zugriffsregeln, Live-Abgleich, Bucket `baustelle-4d`
