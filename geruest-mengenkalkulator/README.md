# Gerüstmengen-Kalkulator

Kleines, abhängigkeitsfreies Web-Tool zur überschlägigen Mengenermittlung für Fassadengerüste.

## Nutzung

`index.html` direkt im Browser öffnen (kein Build, kein Server nötig), oder z. B. via GitHub Pages hosten.

1. Einstellungen anpassen: Lagenhöhe, Gerüstbreite, Belagbreite, Ankerraster, Diagonalraster, Feldlängen-Raster.
2. Fassadenabschnitte (z. B. Nord-, Ost-, Süd-, Westfassade) mit Länge, Höhe und optionaler Aussparungsfläche eintragen.
3. **Berechnen** klicken.

## Ergebnis

- Gerüstfläche, -länge, Anzahl Lagen und Anker je Abschnitt und in Summe
- Geschätzte Materialliste: Beläge, Ständer, Fußspindeln, Geländerholme, Bordbretter, Diagonalen, Wandanker
- Feldlängen-Aufteilung je Abschnitt (Greedy-Verteilung auf das gewählte Feldlängen-Raster)
- CSV-Export und Druckansicht

Eingaben werden automatisch im Browser (localStorage) zwischengespeichert.

## Hinweis

Das Tool liefert überschlägige Mengen für Angebot, Kalkulation und Materialdisposition. Es ersetzt keine geprüfte Gerüstbau-Aufstellplanung nach DIN EN 12811 / DIN 4420. Ankerzahl, Ankerraster, Diagonalenanordnung und Bauteilmengen sind vor Ausführung anhand der tatsächlichen Systemvorgaben zu prüfen.
