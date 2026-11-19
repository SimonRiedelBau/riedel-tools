# EBV-Lieferscheine

Lieferscheine nach Ersatzbaustoffverordnung (EBV) je Projekt erfassen, prüfen und ablegen.
Zwei Richtungen: **Anlieferung** (wir als Verwender, z. B. RC-Material unter der Bodenplatte) und
**Abfuhr** (wir als Inverkehrbringer, z. B. Aushub BM-0).

## Erfassen
- **Lieferschein fotografieren** – öffnet am Handy direkt die Kamera. Mehrseitige Lieferscheine über
  „+ Weitere Seite“. Fotos werden im Browser auf ca. 2400 px verkleinert (Schrift bleibt lesbar), lassen
  sich drehen und vergrößert ansehen.
- **PDF / Bild hochladen** – Lieferschein aus der Mail oder vom Scanner (max. 20 MB je Datei).
- **Ohne Beleg** – nur Daten eingeben, Foto später ergänzen.
- **Wie letzte Fuhre** übernimmt Lieferant, Material, Klasse, Einbauort usw. der letzten Fuhre in derselben
  Richtung – es bleiben meist nur Nr., Menge und Kennzeichen.
- **Ohne Netz** (Keller, Funkloch): Der Lieferschein samt Fotos bleibt auf dem Gerät (IndexedDB) und wird
  automatisch gesendet, sobald Verbindung besteht. Oben steht, wie viele noch warten.

## Prüfung
Pflichtangaben je Lieferschein (Nr., Datum, Lieferant, Abnehmer, Material, Materialklasse, Menge,
Einbauort bzw. Annahmestelle, Unterschrift, Beleg). Fehlt etwas, wird der Lieferschein als unvollständig
markiert, gespeichert wird trotzdem. Dazu: Deckblatt je Lieferant/Annahmestelle, Summen je Materialklasse,
Hinweis „§ 22“ bei Klassen der Stufe 3 (Anzeigepflicht prüfen; rot ab 250 m³, nur m³ werden gezählt).

## Ablage
- **Excel-Register** – alle (gefilterten) Lieferscheine, Blatt „Summen“ je Richtung und Klasse.
- **Ablage als ZIP** – Ordnerstruktur `Anlieferung|Abfuhr/JJJJ-MM/Datum_LS-Nr_Lieferant.jpg` plus Register.

Daten in Supabase: Tabelle `ebv_lieferscheine`, privater Bucket `ebv-lieferscheine`. Zugriff hat, wer für
die Riedel-Tools freigeschaltet ist. Projekte kommen aus `projekte/projekte.js`.

## Einmalige Einrichtung
`supabase-setup.sql` im Supabase SQL Editor ausführen (Projekt riedel-stahllisten). Admins sehen das SQL
auch direkt im Tool, solange die Tabelle fehlt.
