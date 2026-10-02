# Gerüstmengen-Kalkulator

Web-Tool zur überschlägigen Mengenermittlung für Fassadengerüste – inklusive automatischer Gerüstplanung aus 3D-Modellen (IFC/OBJ/STL/GLB), Konsolen, Geschossebenen, automatischem 2D-Lageplan, schematischer 3D-Ansicht und Grundriss-Erfassung per Zeichnen, Bild/PDF, DXF oder IFC (BIM-Modell). Läuft komplett im Browser, keine Build-Tools, keine Server-Abhängigkeit (alle Bibliotheken liegen unter `vendor/` bei, siehe unten).

## Nutzung

`index.html` direkt im Browser öffnen, oder z. B. via GitHub Pages hosten.

> **Wichtig für IFC- und PDF-Import:** Diese beiden laden intern eine Zusatzbibliothek nach (IFC: WASM-Datei,
> PDF: pdf.js-Worker). Browser blockieren das aus Sicherheitsgründen, wenn `index.html` per Doppelklick als
> lokale Datei geöffnet wird (Adresse beginnt mit `file://`) – das Tool zeigt dann oben automatisch einen
> Warnhinweis. Alle anderen Funktionen (Berechnung, Freihand-Zeichnen, DXF-Import, 2D/3D) funktionieren auch
> per Doppelklick einwandfrei. Abhilfe, eine der beiden:
> - **Lokaler Server** (einmalig pro Sitzung nötig): im Ordner `geruest-mengenkalkulator` ein Terminal öffnen
>   und `python3 -m http.server 8000` ausführen (Python meist vorinstalliert; unter Windows ggf. `py -m http.server 8000`),
>   dann `http://localhost:8000` im Browser öffnen.
> - **Gehostete Version**: die Seite über GitHub Pages oder einen anderen Webserver aufrufen (`https://…`) –
>   dann ist kein lokaler Server nötig, siehe [Herkunft/Website im Haupt-README](../README.md).

1. Einstellungen anpassen: Lagenhöhe, Gerüstbreite, Belagbreite, Ankerraster, Diagonalraster, Wandabstand, Feldlängen-Raster. Diese gelten für **alle** Geschosse gemeinsam.
2. Geschoss auswählen/anlegen (siehe unten), falls das Gebäude aus mehreren Abschnitten mit unterschiedlichem Grundriss besteht.
3. Fassadenabschnitte des aktiven Geschosses eintragen (z. B. Nord-, Ost-, Süd-, Westfassade) – Reihenfolge = Rundgang um das Gebäude:
   - Länge, Höhe, optionale Aussparungsfläche
   - Start/Ende: Gerüstfuß und Oberkante in m über Gelände. Der Start ist standardmäßig die Sockelhöhe des Geschosses und kann je Abschnitt abweichen (z. B. Gerüst steht auf einem Vordach). Start oder Ende ändern → Höhe wird angepasst; Höhe ändern → Ende wird verschoben
   - Winkel zur nächsten Seite (° – 90° = rechtwinklige Ecke), für Lageplan/3D
   - Konsole ja/nein + Konsolenbreite: verbreitert den Belag an dieser Seite und rückt die Außenkante des Gerüsts dort entsprechend nach außen
4. Bei mehreren Abschnitten „Abschnitte bilden zusammenhängenden Rundgang“ aktivieren, damit gemeinsame Eckständer/-spindeln an den Gebäudeecken nicht doppelt gezählt werden (plus „Geschlossener Umlauf“, falls der letzte Abschnitt wieder an den ersten anschließt). Das aktiviert außerdem den automatischen Lageplan und die 3D-Ansicht für dieses Geschoss.
5. Optional: Grundriss zeichnen/einlesen (siehe unten), statt die Abschnittstabelle von Hand zu füllen.
6. **Berechnen** klicken.

## 3D-Modell → Gerüst automatisch planen

Ganz oben im Tool: ein 3D-Gebäudemodell laden, das Gerüst wird automatisch geplant – ohne Abklicken oder Abmessen.

**Formate:** IFC (BIM, z. B. aus Revit, ArchiCAD, Allplan, Vectorworks), OBJ, STL, GLB/glTF (z. B. aus SketchUp, Rhino, Blender). Die Datei wird nur lokal im Browser ausgewertet. IFC braucht wie beim Grundriss-Import einen Server bzw. die gehostete Version (siehe Hinweis oben); OBJ/STL/GLB funktionieren auch per Doppelklick.

**Was erkannt wird:**
- **Gebäudeumriss** aus den Außenwänden (senkrechte Flächen, die bis in Bodennähe reichen). Dachüberstände und Balkone liegen damit außerhalb des Umrisses und werden je Seite als „Dachüberstand“ ausgewiesen. Lassen sich keine geschlossenen Außenwände finden, folgt der Umriss der Dachkante (mit Hinweis).
- **Fassadenhöhe je Seite** aus dem höchsten Punkt direkt hinter der Wand (Traufe/Attika), zuzüglich „Gerüst über Traufe/Attika hinaus“ (Standard 1,00 m Seitenschutz).
- **Giebel und Seiten mit wechselnder Höhe** werden in Teilabschnitte (1a, 1b, …) abgetreppt (Höhenstufe einstellbar, abschaltbar).
- **Staffelgeschosse / höhere Gebäudeteile** neben niedrigeren Dächern werden als eigene Geschossebene mit passender Sockelhöhe angelegt (Gerüst steht auf der darunterliegenden Dachfläche); **Innenhöfe** ebenso.
- Nischen/Rücksprünge schmaler als 1,0 m (einstellbar) werden überbrückt, kleine Aufbauten wie Schornsteine, Attiken und schmale Gauben ignoriert.
- Hochachse (Y/Z), Einheit (m/cm/mm) und Geländehöhe werden automatisch bestimmt und lassen sich unter „Einstellungen der automatischen Planung“ überschreiben (Modelle mit Keller: Gelände wird bei ±0,00 angenommen). Bei IFC werden Räume, Öffnungen, Gelände (IfcSite) und Möbel ignoriert.

**Ablauf:** Datei wählen → Vorschau (Draufsicht, Norden oben) und Liste der erkannten Geschossebenen prüfen, ggf. einzelne abwählen → „Übernehmen und berechnen“. Danach stehen alle Geschossebenen und Abschnitte ganz normal in den Tabellen und können weiter bearbeitet werden. Die Geschossebenen behalten ihre Lage zueinander, so dass Lageplan und 3D-Ansicht das Gebäude richtig zusammengesetzt zeigen. In der 3D-Ansicht wird das eingelesene Modell selbst mit dem schematischen Gerüst drumherum angezeigt (per Häkchen ausblendbar). Das Modell wird im Browser gespeichert (IndexedDB) und erscheint auch nach dem Neuladen der Seite wieder, sobald „Berechnen“ geklickt wird.

**Vorschau bearbeiten (vor dem Übernehmen):** Die erkannten Gerüstlinien lassen sich direkt in der Draufsicht korrigieren:
- Ecke ziehen → Lage/Länge der angrenzenden Seiten ändern (rastet an den Nachbarecken rechtwinklig ein, mit gedrückter Alt-Taste frei, 1-cm-Raster).
- Linie anklicken → Abschnitt bearbeiten: Länge, Start, Ende, Gerüsthöhe, „In der Mitte teilen“, „Abschnitt entfernen“ (ein Umlauf wird dann zum offenen Zug, eine Lücke mitten im Zug teilt die Geschossebene in zwei).
- Doppelklick auf eine Linie → Ecke einfügen; Rechtsklick auf eine Ecke (oder Ecke anklicken → „Ecke entfernen“) → zwei Seiten zusammenfassen.
- Sockelhöhe der Geschossebene ändern; Mausrad = zoomen, leere Fläche ziehen = verschieben, „Einpassen“, „Rückgängig“.

**Grenzen:** Der Vorschlag ist eine Auswertung der Modellgeometrie auf einem Raster (Standard 10 cm) – Längen sind auf wenige Zentimeter genau, aber kein Aufmaß. Sehr unsaubere Modelle (z. B. Gelände als Teil des Gebäudes, offene Wandflächen) können zu falschen Umrissen führen; die Vorschau zeigt das sofort.

## Bearbeiten direkt in der 3D-Ansicht

Statt zwischen Tabelle und 3D-Ansicht hin- und herzuspringen, lässt sich das Gerüst direkt im 3D-Bild anpassen:

- **Gerüstseite anklicken** → der Abschnitt wird blau markiert, darunter erscheint ein Bearbeitungsfeld (◀ ▶ = vorheriger/nächster Abschnitt, ✕ = Auswahl aufheben).
- **Höhe ziehen:** grüne Kugel = Start (Gerüstfuß), blaue Kugel = Ende (Oberkante) hoch/runter ziehen, in 5-cm-Schritten mit Live-Anzeige.
- **Abschnitt:** Länge, Start, Ende, Höhe, Winkel zur nächsten Seite, Konsole/Konsolenbreite.
- **Geschossebene:** Sockelhöhe, Verschieben nach N/S/W/O (Schritt 5 cm bis 1 m), Drehen um den Mittelpunkt (0,5° bis 90°), Lage X/Y und Richtung als Zahl.

Jede Änderung wird sofort in die Abschnittstabelle übernommen, gespeichert und neu berechnet (Mengen, Lageplan, 3D); die Kamera bleibt dabei stehen. Verschieben/Drehen bewegt nur das Gerüst – das eingelesene 3D-Modell bleibt fest, so lässt sich das Gerüst passgenau ins Modell setzen.

## Geschossebenen

Für Gebäude, bei denen nicht jeder Bauabschnitt denselben Grundriss hat (Staffelgeschoss, Rücksprung, angebauter niedrigerer Trakt, …): jedes Geschoss hat seinen eigenen, unabhängigen Grundriss (eigene Fassadenabschnitte-Tabelle, eigene Rundgang-Einstellungen). Alle Geschosse teilen sich dieselben globalen Einstellungen (Lagenhöhe, Gerüstbreite, Raster, …).

- **Geschoss-Reiter** oben wechseln zwischen den Geschossen; die Tabelle „Fassadenabschnitte“ und „Grundriss zeichnen/einlesen“ zeigen immer das gerade ausgewählte Geschoss (Badge neben der Überschrift).
- **+ Geschoss hinzufügen** legt ein neues, leeres Geschoss an.
- **Geschoss duplizieren** kopiert den aktuellen Grundriss als Ausgangspunkt für ein ähnliches Obergeschoss.
- **Sockelhöhe**: Starthöhe des Geschosses über Gelände, für die Stapelung in der 3D-Ansicht. „Auto“ setzt sie auf die Höhe des größten Abschnitts im darunterliegenden Geschoss (üblicher Fall); bei Rücksprüngen/Sonderfällen von Hand überschreibbar.
- Für ein normales, durchgehendes Gebäude reicht ein einziges Geschoss – dann verhält sich das Tool wie zuvor.

## Ergebnis

- Pro Geschoss: Gerüstfläche, -länge, Lagen, Anker, Konsole und Ausladung je Abschnitt sowie Feldlängen-Aufteilung
- **Gesamtsumme über alle Geschosse**: Fläche, Länge, Gesamthöhe, Anker und komplette Materialliste (Beläge, Ständer, Fußspindeln, Geländerholme, Bordbretter, Diagonalen, Wandanker, Konsolen)
- **2D-Lageplan** (SVG, automatisch aus Längen/Winkeln, mit Geschoss-Auswahl): Gebäudelinie, Ständerachse (Wandabstand), Gerüst-Außenkante, Außenkante inkl. Konsole, Bemaßung
- **3D-Ansicht** (schematisch, Three.js): alle Geschosse an ihrer Sockelhöhe gestapelt – Ständer, Beläge je Lage, Geländer, Konsolen und Gebäudekörper als Kontext-Volumen; Maus ziehen = drehen, Mausrad = zoomen
- CSV-Export (je Geschoss + Gesamtsumme) und Druckansicht

Eingaben werden automatisch im Browser (localStorage) zwischengespeichert, inklusive aller Geschosse.

## Grundriss zeichnen / einlesen

Drei Wege, den Grundriss des **aktiven Geschosses** zu erfassen – alle münden in dieselbe interaktive Zeichenfläche:

### Neu zeichnen (grafisch, ohne Datei)

„✏️ Neu zeichnen (ohne Datei)“ öffnet ein leeres Raster (1 Karo = 1 Meter, kein Kalibrieren nötig) – Grundriss direkt mit Klicks abstecken, wie auf einem Blatt Karopapier. Praktisch für den Normalfall ohne vorhandenen Plan.

### Bild/PDF (Nachzeichnen)

Statt Längen/Winkel von Hand einzutragen, kann ein vorhandener Grundriss- oder Lageplan eingelesen werden – als Bild/PDF (Nachklicken) oder als **DXF** (exakte Koordinaten, kein Nachklicken nötig).

**Warum DXF und nicht DWG?** DWG ist ein proprietäres Binärformat von Autodesk ohne offenen Standard – im Browser nicht zuverlässig lesbar. DXF ist das offene, textbasierte Austauschformat, das praktisch jedes CAD-Programm (AutoCAD, Revit, ArchiCAD, …) über „Speichern unter“ exportieren kann, und liefert die Koordinaten exakt.

1. Plan-Datei hochladen (PDF wird über die mitgelieferte pdf.js-Bibliothek als Seite 1 gerendert).
2. Maßstab kalibrieren: zwei Punkte einer bekannten Strecke im Plan anklicken (z. B. eine bemaßte Wandlänge) und die reale Länge in Metern eingeben.
3. Gerüstlinie abklicken: Eckpunkte der Reihe nach anklicken; Länge und Winkel jedes Abschnitts werden live berechnet.

### DXF (exakter Import)

1. DXF-Datei hochladen – das Tool listet alle Ebenen mit Linien-/Polylinien-Geometrie auf.
2. Ebene mit dem Gebäudeumriss wählen und die Zeichnungseinheit angeben (mm/cm/m/benutzerdefiniert).
3. „Ebene übernehmen“ – die Eckpunkte werden direkt aus der Zeichnung übernommen (eine einzelne Polylinie wird direkt verwendet; mehrere Linienzüge werden anhand gemeinsamer Endpunkte automatisch zu einer durchgehenden Linie verkettet, mit Hinweis, falls das nicht eindeutig möglich war).

### IFC (BIM-Modell)

Wird komplett lokal im Browser gelesen (via [web-ifc](https://github.com/ThatOpen/engine_web-ifc), WASM) – nichts wird hochgeladen, funktioniert also auch mit sehr großen Dateien, die sich nicht zum Hochladen eignen.

1. IFC-Datei hochladen – das Tool listet alle `IfcBuildingStorey` (Geschosse) mit ihrer Höhe auf.
2. Falls Dachgeometrie (`IfcRoof` oder `IfcSlab` mit `PredefinedType=ROOF`) gefunden wird: ein grober Dachüberstand wird vorgeschlagen (aus dem Größenunterschied zwischen Dach- und Wand-Bounding-Box, nicht pro Seite) – optional per Klick zum Wandabstand hinzufügen.
3. Geschoss wählen, „Wandlinien vorschlagen“ – die Wand-Mittellinien werden aus der Bauteilgeometrie geschätzt (Achsrepräsentation, sonst minimale umschließende Rechteckfläche je Wand):
   - Ergibt sich daraus automatisch ein sauberer, geschlossener Umriss, wird er direkt übernommen.
   - **Der häufigere Fall bei echten Gebäuden:** Innenwände lassen sich nicht eindeutig von Außenwänden unterscheiden, daher bildet sich kein sauberer Umriss. Die Wandlinien werden dann als graue Hilfslinien angezeigt – den Gebäudeumriss einfach selbst mit „Punkte anklicken“ daran entlangklicken. Das ist immer noch deutlich schneller als freihändig zu messen, da die Wandpositionen als Vorlage sichtbar sind.

**Warum kein DWG- oder verlässlicher automatischer IFC-Import?** Ein Gebäudeumriss lässt sich aus rohen Bauteil-Geometrien nicht immer zuverlässig automatisch rekonstruieren (Innenwände, komplexe Wandobjekte, unterschiedliche Exportqualität je CAD-Programm) – das Tool verspricht deshalb bewusst keine 100%ige Automatik, sondern liefert einen bestmöglichen Vorschlag plus eine schnelle, verlässliche manuelle Nachbearbeitung in derselben Zeichenfläche.

### Interaktive Zeichenfläche (alle Wege)

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
- `vendor/web-ifc-api-iife.js` + `vendor/web-ifc.wasm` – [web-ifc](https://github.com/ThatOpen/engine_web-ifc) 0.0.77, MPL-2.0-Lizenz (IFC-Import)

Fehlen diese Dateien oder können sie nicht geladen werden, funktionieren Mengenberechnung, 2D-Lageplan und Bild-Digitalisierung trotzdem uneingeschränkt weiter – nur die 3D-Ansicht bzw. der PDF-/DXF-/IFC-Import stehen dann nicht zur Verfügung (entsprechender Hinweis erscheint im Tool).

## Hinweis

Das Tool liefert überschlägige Mengen für Angebot, Kalkulation und Materialdisposition. Es ersetzt keine geprüfte Gerüstbau-Aufstellplanung nach DIN EN 12811 / DIN 4420. Ankerzahl, Ankerraster, Diagonalenanordnung und Bauteilmengen sind vor Ausführung anhand der tatsächlichen Systemvorgaben zu prüfen. Lageplan und 3D-Ansicht sind schematische Visualisierungen auf Basis der eingegebenen Längen/Winkel bzw. des digitalisierten Plans und ersetzen keine vermessungsgenaue Ausführungsplanung.
