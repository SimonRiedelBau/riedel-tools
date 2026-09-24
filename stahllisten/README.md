# Stahllisten

Bewehrungsbedarf für laufende Projekte: Pläne und Stahllisten hochladen, Bestellungen beim Biegebetrieb erfassen und im Dashboard sehen, wie viel Stahl benötigt wird, wie viel bestellt ist und was noch bestellt werden muss.

## Ablauf
1. **Projekt anlegen** – Name, Projekt-Nr., Kostenstelle, optional kalkulierter Gesamtbedarf in t (Vergleich, solange noch nicht alle Pläne da sind).
2. **Pläne hochladen** (Reiter *Pläne*) – mehrere PDFs auf einmal; Plan-Nr. und Index werden aus dem Dateinamen vorgeschlagen (z. B. `BP-101_Index_b.pdf`).
3. **Stahllisten hinzufügen** (Reiter *Stahllisten*) – einem Plan zuordnen und die Datei auslesen lassen:
   - **Excel/CSV** (am zuverlässigsten): Spalten Ø, Anzahl, Länge, Gewicht, Mattentyp werden automatisch erkannt und lassen sich umstellen. Fehlt das Gewicht, wird es aus Anzahl × Länge × Nenngewicht (DIN 488) berechnet; Länge in mm, cm oder m wird erkannt.
   - **PDF**: Gewichtsübersicht je Durchmesser, Summenzeilen „Ø 12 … kg“ oder Einzelpositionen; Matten (Q/R…) mit kg. Das erkannte Ergebnis wird mit dem Gesamtgewicht der Datei abgeglichen.
   - Ist die Stahlliste auf dem Plan selbst, „Aus Plan-PDF auslesen“ nutzen.
   - Gescannte PDFs haben keinen Text – dann die Gewichte von Hand eintragen.
   - Neuer Plan-Index: alte Liste als *ersetzt* markieren, sie zählt dann nicht mehr zum Bedarf.
4. **Bestellungen erfassen** (Reiter *Bestellungen*) – Stahllisten ankreuzen, Mengen werden übernommen; zusätzliche Mengen (Lagerstahl, Matten) als eigene Zeile. Status *bestellt* / *geliefert*, Liefertermin (überfällige werden gemeldet).

## Dashboard
- Bedarf lt. gültigen Stahllisten, bestellt, geliefert, **noch zu bestellen** (je Sorte: Bedarf − bestellt)
- Balken je Durchmesser, Tabelle „Noch zu bestellen“ (CSV-Export, Drucken), Liste der noch nicht bestellten Stahllisten mit Knopf „Offene Listen bestellen“
- Hinweise: Abgleich mit Kalkulation, überfällige Lieferungen, Pläne ohne Stahlliste, bestellte ersetzte Listen

## Datenbank und Zugriffsschutz
Die Daten liegen im Supabase-Projekt der Riedel-Tools (dasselbe wie Bautagebuch):
- Tabelle `stahl_objekte` – Projekte, Pläne, Stahllisten, Bestellungen
- privater Storage-Bucket `stahllisten` – Plan- und Listendateien (max. 50 MB je Datei), geöffnet nur über 5 Minuten gültige Links
- Tabelle `stahl_zugang` – Freigabeliste

Zugriff hat nur, wer **angemeldet**, **E-Mail bestätigt** und in `stahl_zugang` **freigeschaltet** ist. Das prüft die Datenbank per Row Level Security – ein eigenes Konto allein reicht nicht. Freigeschaltet wird das bestehende Konto (nicht nur die E-Mail-Adresse), damit sich niemand nachträglich mit einer fremden Adresse registrieren kann.

### Einmalige Einrichtung
1. Tool öffnen, **Konto anlegen**, E-Mail bestätigen, anmelden.
2. Das Tool zeigt „Datenbank einrichten“ mit dem fertigen SQL (inkl. dir als erstem Admin). **SQL kopieren**, im Supabase SQL Editor ausführen, **Erneut prüfen**.
   Das Skript liegt auch als `supabase-setup.sql` im Ordner und kann gefahrlos erneut ausgeführt werden.
3. Kollegen legen sich ein Konto an; du schaltest sie unter **Zugänge** frei (Rolle *Mitglied* oder *Admin*).

Alle Freigeschalteten sehen alle Projekte. Änderungen anderer werden beim Wechsel ins Fenster und jede Minute nachgeladen.
Der Punkt neben der E-Mail oben zeigt den Speicherstatus (grün gespeichert, orange speichert, rot Fehler – wird beim nächsten Speichern erneut gesendet).

Daten aus der früheren rein lokalen Version bietet das Tool nach der Anmeldung zur Übernahme an.
„Sicherung speichern“ lädt zusätzlich eine JSON-Datei mit allen Projekten und Dateien herunter; „Sicherung laden“ spielt sie wieder ein.

## Dateien
- `index.html` – Tool
- `supabase-setup.sql` – Tabellen, Zugriffsregeln, Storage-Bucket
- `vendor/` – pdf.js 3.11.174, SheetJS 0.18.5, supabase-js 2.117.1 (lokal eingebunden)
