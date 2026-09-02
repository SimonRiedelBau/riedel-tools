# Gerüstmengen-Kalkulator

Web-Tool zur überschlägigen Mengenermittlung für Fassadengerüste – inklusive Konsolen, automatischem 2D-Lageplan, schematischer 3D-Ansicht und Plan-Digitalisierung. Läuft komplett im Browser, keine Build-Tools, keine Server-Abhängigkeit (alle Bibliotheken liegen unter `vendor/` bei, siehe unten).

## Nutzung

`index.html` direkt im Browser öffnen, oder z. B. via GitHub Pages hosten.

1. Einstellungen anpassen: Lagenhöhe, Gerüstbreite, Belagbreite, Ankerraster, Diagonalraster, Wandabstand, Feldlängen-Raster.
2. Fassadenabschnitte (z. B. Nord-, Ost-, Süd-, Westfassade) eintragen – Reihenfolge = Rundgang um das Gebäude:
   - Länge, Höhe, optionale Aussparungsfläche
   - Winkel zur nächsten Seite (° – 90° = rechtwinklige Ecke), für Lageplan/3D
   - Konsole ja/nein + Konsolenbreite: verbreitert den Belag an dieser Seite und rückt die Außenkante des Gerüsts dort entsprechend nach außen
3. Bei mehreren Abschnitten „Abschnitte bilden zusammenhängenden Rundgang“ aktivieren, damit gemeinsame Eckständer/-spindeln an den Gebäudeecken nicht doppelt gezählt werden (plus „Geschlossener Umlauf“, falls der letzte Abschnitt wieder an den ersten anschließt). Das aktiviert außerdem den automatischen Lageplan und die 3D-Ansicht.
4. Optional: Plan digitalisieren (siehe unten), statt die Abschnittstabelle von Hand zu füllen.
5. **Berechnen** klicken.

## Ergebnis

- Gerüstfläche, -länge, Lagen, Anker, Konsole und Ausladung je Abschnitt und in Summe
- Geschätzte Materialliste: Beläge, Ständer, Fußspindeln, Geländerholme, Bordbretter, Diagonalen, Wandanker, Konsolen
- Feldlängen-Aufteilung je Abschnitt (Greedy-Verteilung auf das gewählte Feldlängen-Raster)
- **2D-Lageplan** (SVG, automatisch aus Längen/Winkeln): Gebäudelinie, Ständerachse (Wandabstand), Gerüst-Außenkante, Außenkante inkl. Konsole, Bemaßung
- **3D-Ansicht** (schematisch, Three.js): Ständer, Beläge je Lage, Geländer, Konsolen und Gebäudekörper als Kontext-Volumen; Maus ziehen = drehen, Mausrad = zoomen
- CSV-Export und Druckansicht

Eingaben werden automatisch im Browser (localStorage) zwischengespeichert.

## Plan digitalisieren

Statt Längen/Winkel von Hand einzutragen, kann ein vorhandener Grundriss- oder Lageplan eingelesen werden – als Bild/PDF (Nachklicken) oder als **DXF** (exakte Koordinaten, kein Nachklicken nötig).

**Warum DXF und nicht DWG?** DWG ist ein proprietäres Binärformat von Autodesk ohne offenen Standard – im Browser nicht zuverlässig lesbar. DXF ist das offene, textbasierte Austauschformat, das praktisch jedes CAD-Programm (AutoCAD, Revit, ArchiCAD, …) über „Speichern unter“ exportieren kann, und liefert die Koordinaten exakt.

### Bild/PDF (Nachzeichnen)

1. Plan-Datei hochladen (PDF wird über die mitgelieferte pdf.js-Bibliothek als Seite 1 gerendert).
2. Maßstab kalibrieren: zwei Punkte einer bekannten Strecke im Plan anklicken (z. B. eine bemaßte Wandlänge) und die reale Länge in Metern eingeben.
3. Gerüstlinie abklicken: Eckpunkte der Reihe nach anklicken; Länge und Winkel jedes Abschnitts werden live berechnet.

### DXF (exakter Import)

1. DXF-Datei hochladen – das Tool listet alle Ebenen mit Linien-/Polylinien-Geometrie auf.
2. Ebene mit dem Gebäudeumriss wählen und die Zeichnungseinheit angeben (mm/cm/m/benutzerdefiniert).
3. „Ebene übernehmen“ – die Eckpunkte werden direkt aus der Zeichnung übernommen (eine einzelne Polylinie wird direkt verwendet; mehrere Linienzüge werden anhand gemeinsamer Endpunkte automatisch zu einer durchgehenden Linie verkettet, mit Hinweis, falls das nicht eindeutig möglich war).

### Interaktive Zeichenfläche (beide Wege)

- **Zoomen**: Mausrad (zoomt zum Mauszeiger).
- **Verschieben**: Button „Verschieben (Pan)“ aktivieren und ziehen; „Einpassen“ setzt die Ansicht zurück.
- **Punkt korrigieren**: vorhandenen Punkt anklicken und ziehen.
- **Punkt löschen**: Rechtsklick auf den Punkt.
- Länge/Winkel jedes Abschnitts werden live in einer Vorschau-Tabelle angezeigt – die Zellen sind **direkt editierbar**, falls einzelne Maße von Hand nachkorrigiert werden sollen.
- „In Abschnittstabelle übernehmen“ schreibt die Werte in die Fassadenabschnitte (inkl. Standardhöhe, danach pro Abschnitt anpassbar) und aktiviert automatisch den zusammenhängenden Rundgang. **Die Abschnittstabelle bleibt danach ganz normal editierbar** – Werte dort korrigieren und erneut auf „Berechnen“ klicken, um neu zu rechnen.

## Bibliotheken (vendor/)

Für Offline-Nutzung und Zuverlässigkeit hinter Firmen-Proxys sind folgende Bibliotheken lokal beigelegt (kein CDN-Zugriff nötig):

- `vendor/three.min.js` – [three.js](https://threejs.org/) r128, MIT-Lizenz (3D-Ansicht)
- `vendor/pdf.min.js` + `vendor/pdf.worker.min.js` – [pdf.js](https://mozilla.github.io/pdf.js/) 3.11.174, Apache-2.0-Lizenz (PDF-Digitalisierung)
- `vendor/dxf-parser.js` – [dxf-parser](https://github.com/bjnortier/dxf-parser) 1.1.2, MIT-Lizenz (DXF-Import)

Fehlen diese Dateien oder können sie nicht geladen werden, funktionieren Mengenberechnung, 2D-Lageplan und Bild-Digitalisierung trotzdem uneingeschränkt weiter – nur die 3D-Ansicht bzw. der PDF-/DXF-Import stehen dann nicht zur Verfügung (entsprechender Hinweis erscheint im Tool).

## Hinweis

Das Tool liefert überschlägige Mengen für Angebot, Kalkulation und Materialdisposition. Es ersetzt keine geprüfte Gerüstbau-Aufstellplanung nach DIN EN 12811 / DIN 4420. Ankerzahl, Ankerraster, Diagonalenanordnung und Bauteilmengen sind vor Ausführung anhand der tatsächlichen Systemvorgaben zu prüfen. Lageplan und 3D-Ansicht sind schematische Visualisierungen auf Basis der eingegebenen Längen/Winkel bzw. des digitalisierten Plans und ersetzen keine vermessungsgenaue Ausführungsplanung.
