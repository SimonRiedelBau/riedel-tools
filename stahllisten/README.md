# Stahllisten

Bewehrungsbedarf für laufende Projekte: Pläne und Stahllisten hochladen, Bestellungen beim Biegebetrieb erfassen und im Dashboard sehen, wie viel Stahl benötigt wird, wie viel bestellt ist und was noch bestellt werden muss.

## Ablauf
1. **Projekt anlegen** – Name, Projekt-Nr., Kostenstelle, optional kalkulierter Gesamtbedarf in t (Vergleich, solange noch nicht alle Pläne da sind).
2. **Pläne hochladen** (Reiter *Pläne*) – mehrere PDFs auf einmal; Plan-Nr. und Index werden aus dem Dateinamen vorgeschlagen (z. B. `BP-101_Index_b.pdf`).
3. **Stahllisten hinzufügen** (Reiter *Stahllisten*) – einem Plan zuordnen und die Datei auslesen lassen:
   - **Excel/CSV** (am zuverlässigsten): Spalten Ø, Anzahl, Länge, Gewicht, Mattentyp werden automatisch erkannt und lassen sich umstellen. Fehlt das Gewicht, wird es aus Anzahl × Länge × Nenngewicht (DIN 488) berechnet; Länge in mm, cm oder m wird erkannt.
   - **PDF-Stücklisten mit Abschnitten** (z. B. ahw Ingenieure: Rundstahl-Stückliste, Unterstützungskörbe, Mattengewichte) werden
     vollständig ausgelesen: Stabstahl je Ø aus der Gesamtmenge, Unterstützungskörbe, Matten je Typ (brutto). Jede Masse wird
     gegengeprüft (Summe je Ø gegen die Einzelpositionen, jeder Abschnitt gegen sein Gesamtgewicht bzw. Matten-Brutto);
     Abweichungen erscheinen als „Bitte prüfen“. Die „Plannr.“ aus der Liste wird für die Zuordnung zum Plan genutzt.
     Biegeliste und Schneideskizze werden übersprungen (doppelte Angaben).
   - **PDF**: Gewichtsübersicht je Durchmesser, Summenzeilen „Ø 12 … kg“ oder Einzelpositionen; Matten (Q/R…) mit kg. Das erkannte Ergebnis wird mit dem Gesamtgewicht der Datei abgeglichen.
   - Ist die Stahlliste auf dem Plan selbst, „Aus Plan-PDF auslesen“ nutzen.
   - **Stahllisten auf dem Bewehrungsplan** (z. B. Ing.-Büro Albus, Projekt Ostermeier): siehe unten – beim Plan-Upload
     wird die Stahlliste automatisch angelegt.
   - Gescannte PDFs haben keinen Text – dann die Gewichte von Hand eintragen.
   - Neuer Plan-Index: alte Liste als *ersetzt* markieren, sie zählt dann nicht mehr zum Bedarf.
4. **Bestellungen erfassen** (Reiter *Bestellungen*) – Stahllisten ankreuzen, Mengen werden übernommen; zusätzliche Mengen (Lagerstahl, Matten) als eigene Zeile. Status *bestellt* / *geliefert*, Liefertermin (überfällige werden gemeldet).

## Plancodierung (BFS) – Index und Zuordnung automatisch
Dateinamen nach der Plancodierung werden zerlegt:
`Projekt_Gebäude_Bauteil_Gewerk_Leistungsphase_Zeichnungsart_Ebene_Nummer_Index`,
z. B. Bewehrungsplan `BFS_88160_B_T_5_BP_U1_2233_01`, Stahlliste `BFS_88160_B_T_5_SL_U1_2233_01`.
- **Index** = die letzten zwei Ziffern. Ein Plan mit höherem Index ersetzt den vorhandenen (Datei wird überschrieben,
  zugeordnete Stahllisten bleiben verknüpft). Gleicher oder älterer Index wird übersprungen.
- Stahlliste mit höherem Index: die alte Liste wird überschrieben; war sie schon bestellt, bleibt sie als *ersetzt*
  erhalten (zählt nicht mehr zum Bedarf), damit die Bestellung nachvollziehbar bleibt.
- **Zuordnung** Stahlliste → Plan über die 4-stellige **Nummer**. Gibt es mehrere Pläne mit derselben Nummer, entscheiden
  Bauteil, Ebene und Gebäude. Kommt der Plan erst nach der Liste, wird die Liste beim Plan-Upload nachträglich zugeordnet.
- In den Tabellen *Pläne* und *Stahllisten* stehen **Index** und **Bereich** (Haus/Bauteil und Ebene im Klartext, z. B.
  „Bauteil B (West) · 1. UG“) automatisch aus dem Dateinamen.
- Nach jedem Upload zeigt ein Kasten, was angelegt, ersetzt, übersprungen oder nicht zugeordnet wurde.
- **Zu prüfen nach dem Upload:** Pläne und Stahllisten mit offenen Punkten werden dauerhaft farbig (orange) markiert,
  mit Kennzeichen „prüfen“ und dem Grund darunter – auch nach dem Neuladen und für alle Kollegen:
  Abweichungen beim Auslesen (Summen/Gesamtgewicht), keine Gewichte erkannt, kein Plan zugeordnet, Plan-Dateiname nicht
  nach Plancodierung. Ein Plan ist auch markiert, wenn eine seiner Stahllisten zu prüfen ist. Nach der Kontrolle
  „Geprüft“ in der Zeile klicken (oder im Bearbeiten-Dialog ankreuzen); das wird im Verlauf festgehalten.
  Wird ein fehlender Plan später zugeordnet oder werden Gewichte ergänzt, verschwindet der jeweilige Grund von selbst.
  Filter „Zu prüfen“ bzw. „Nur diese zeigen“ in den Reitern, Hinweis in der Übersicht, Spalte „Zu prüfen“ in der Excel-Liste.
- **Bestand prüfen** (Reiter *Stahllisten*): liest alle gespeicherten Stahllisten des Projekts erneut aus und markiert sie
  wie beim Upload – zusätzlich, wenn das gespeicherte Gewicht von der Datei abweicht. Pläne ohne Plancodierung werden
  ebenfalls markiert. Einträge, die schon als „Geprüft“ bestätigt wurden, und ersetzte Listen bleiben unberührt.
- Stahllisten lassen sich im Reiter *Stahllisten* auch mehrere auf einmal hochladen.
- Dateinamen, die nicht der Codierung folgen, funktionieren wie bisher (Plan-Nr. aus dem Dateinamen, Zuordnung von Hand).

## Stahllisten auf dem Bewehrungsplan (Ing.-Büro Albus, Projekt Ostermeier)
Bei manchen Projekten stehen „Rundstahlliste“ und „Mattenliste“ direkt auf dem Bewehrungsplan. Dafür im Projekt
(*Projekt bearbeiten*) **„Stahllisten stehen auf den Bewehrungsplänen“** ankreuzen. Dann gilt beim Plan-Upload:
- Die Tabellen werden ausgelesen und als Stahlliste des Plans angelegt (gleiche Nummer und Index wie der Plan,
  Spalte *Datei* → „Plan“). Stabstahl je Ø, Matten je Typ, andere Typen der Mattenliste (z. B. DT17) als Unterstützungskörbe.
- Jede Zeile wird gegengeprüft (Gesamtlänge × Nenngewicht = Gewicht, Stück × Einzellänge = Gesamtlänge,
  Matten Stück × Länge × Breite × kg/m² = Gewicht), jede Tabelle gegen ihr „Gesamtgewicht“. Abweichungen oder
  unsicher erkannte Zeichen → „prüfen“.
- Plannummer aus dem Dateinamen: `BP041-0-V_Bew._Gründung_Teil_1_Verwaltung.pdf` → Plan **BP041-V**, Index **0**,
  Inhalt „Bew. Gründung Teil 1 Verwaltung“. Index 0 → a → b …: ein höherer Index ersetzt den Plan und seine Stahlliste
  (bestellte Listen bleiben als *ersetzt* erhalten).
- Die Listen sind auf diesen Plänen keine Text-Objekte, sondern als CAD-Strichschrift gezeichnet. Das Tool erkennt die
  Zeichen über ihre Form (Vorlagen `VGLYPH` in `index.html`, angelernt am Plan BP041-0-V). Kommt ein Zeichen vor, das
  noch nicht angelernt ist (z. B. „Q“ bei Q-Matten), wird der Mattentyp aus dem Gewicht je m² abgeleitet; sonst
  erscheint die Liste als „prüfen“.

## Dashboard
- Bedarf lt. gültigen Stahllisten, bestellt, geliefert, **noch zu bestellen** (je Sorte: Bedarf − bestellt)
- Balken je Durchmesser, Tabelle „Noch zu bestellen“ (CSV-Export, Drucken), Liste der noch nicht bestellten Stahllisten mit Knopf „Offene Listen bestellen“
- Hinweise: Abgleich mit Kalkulation, überfällige Lieferungen, Pläne ohne Stahlliste, bestellte ersetzte Listen

## Stahlübersicht wie die Excel der Bauleitung
Die Excel-Liste enthält vorne die Blätter im Aufbau der bisherigen Excel-Stahlübersicht (z. B. BfS Neuherberg):
- **Gesamtübersicht**: je Ebene BST S, BSTM netto/brutto, ABSTA (t), Körbe in lfm, Summe, davon geliefert, Sub verrechnet,
  noch nicht bestellt – als Formeln auf die Ebenen-Blätter.
- **Ein Blatt je Ebene** (Gründung, 2.UG, 1.UG, EG, 1.OG …): Nr., Bauteil, Bemerkung, Stahl abgerufen, geliefert BST S,
  geliefert LAMA, Zubehör (Dübelleisten, Lenton, HBT, Iso./Tron.), Tonnen je Sorte, lfm, Status, Bestellung/Lieferschein, Summenzeile.
- Farben wie gewohnt: **gelb** = Material bestellt, **grün** = geliefert, **blau** = Sub verrechnet.
- Ebene: aus der Plancodierung (BP → Gründung, U1 → 1.UG, 0 → EG …), sonst aus dem Titel; im Listen-Dialog überschreibbar.
- Abgerufen/geliefert kommen aus den Bestellungen (Bestelldatum bzw. Liefertermin), Stabstahl und Matten getrennt.
- Ersetzte Listen erscheinen nur, wenn sie schon bestellt waren („alter Index – bereits bestellt, wird abgerechnet“).
- Mehrmengen/Nachbestellungen: als eigene Stahlliste zum Plan anlegen – sie erscheinen dann auf der Ebene des Plans.

Zusätzliche Felder je Stahlliste: Ebene, Bemerkung, Sub verrechnet am, Zubehör (benötigt/bestellt/geliefert),
Matten netto kg (ahw-Stücklisten: wird ausgelesen), Unterstützungskörbe in lfm je Typ.

## Excel-Liste und Verlauf
- **Excel-Liste herunterladen** (im Projekt oben): erzeugt jederzeit den aktuellen Stand als `.xlsx` im Aufbau des Tools –
  Blätter *Übersicht* (Bedarf, bestellt, geliefert, noch zu bestellen je Sorte, Kennzahlen, Hinweise), *Stahllisten*
  (alle Listen inkl. ersetzter, Index, Bereich, Plan, Status, Gewicht je Sorte, Bestellung), *Pläne*, *Bestellungen* und *Verlauf*.
- **Verlauf** (eigener Reiter): jede Änderung wird beim Speichern mit Zeitpunkt und Person mitgeführt – Plan/Liste angelegt,
  neuer Index (auch überschriebene Listen mit ihrem alten Gewicht), Gewicht geändert, Plan zugeordnet, bestellt, geliefert, gelöscht.
  Der Verlauf liegt im Projekt in der Datenbank und ist in jeder Excel-Liste enthalten.
- `vendor/exceljs.min.js` (ExcelJS 4.4) wird erst beim Export geladen.

## Datenbank und Zugriffsschutz
Die Daten liegen im eigenen Supabase-Projekt **riedel-stahllisten** (`sazhfayopozqcluvmqqu`):
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
