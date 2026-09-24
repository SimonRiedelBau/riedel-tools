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

## Speicherung
Alle Daten und Dateien liegen nur im Browser (IndexedDB), nichts wird übertragen.
„Sicherung speichern“ erzeugt eine JSON-Datei mit allen Projekten und Dateien; über „Sicherung laden“ auf einem anderen Gerät/Browser einlesen.

## Dateien
- `index.html` – Tool
- `vendor/` – pdf.js 3.11.174 und SheetJS 0.18.5 (lokal, funktioniert auch offline)
