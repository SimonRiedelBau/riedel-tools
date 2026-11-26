# Planliste

Alle Pläne eines Projekts an einem Ort – mit Dashboard, welche Pläne **freigegeben** sind und welche noch auf **Vorabzug** stehen.

## Ablegen
- Pläne auf die Seite ziehen (überall auf der Seite), oder **Dateien wählen** / **Ordner wählen**. Ganze Ordner werden
  samt Unterordnern übernommen. PDF, DWG, DXF, IFC usw., max. 50 MB je Datei.
- Aus dem Dateinamen werden **Plan-Nr.**, **Index**, **Planstand**, **Planart** und **Bereich** (Bauteil · Ebene) erkannt:

| Dateiname | Plan-Nr. | Index | Stand |
|---|---|---|---|
| `BFS_88160_B_T_5_BP_U1_2233_01.pdf` (Plancodierung BFS) | `BFS_88160_B_T_5_BP_U1_2233` | 01 | – |
| `BP041-0-V_Bew._Gründung_Teil_1_Verwaltung.pdf` (Albus) | `BP041` | 0 | Vorabzug |
| `BP041-0-F_…` | `BP041` | 0 | Freigabe |
| `26-24_OST_AH_V00.pdf` | `26-24_OST_AH` | 00 | Vorabzug |
| `Schalplan_Decke_EG_Index_b.pdf`, `…_Idx03`, `…_02` | Rest des Namens | b / 03 / 02 | – |

- „Vorabzug“, „Freigabe“, „freigegeben“, „zur Ausführung“ (bzw. „nicht zur Ausführung“ = Vorabzug) im Dateinamen setzen den
  Planstand.
- Bei PDFs wird der **Plankopf auf Seite 1** gelesen (abschaltbar) – er hat Vorrang vor dem Dateinamen. Geprüft wird in
  dieser Reihenfolge: PDF-Stempel bzw. großer Stempeltext („VORABZUG“), Ankreuzfeld (☒ Vorabzug / ☒ Freigabe als Text),
  Feld „Planstatus“ / „Planstand“ / „Ausgabe“ (Wert rechts daneben oder darunter), letzte Zeile der Indextabelle
  (höchster Index; liefert auch den Index), sonst „Vorabzug“ / „Freigabe“ / „zur Ausführung“ im Plankopf-Bereich.
  Allgemeine Hinweise außerhalb des Plankopfs und leere Felder wie „Freigabe Bauherr: ____“ zählen nicht.
  Widersprechen sich Dateiname und Plankopf (Planstand oder Index), steht ein Hinweis im Ergebnis.
- Nicht lesbar: eingescannte Pläne ohne Text und Ankreuzfelder, deren Kreuz nur gezeichnet ist – dann gilt die Vorgabe
  „Planstand, wenn nicht erkennbar“ (offen / Vorabzug / Freigabe).
- **„Abgelegte Pläne prüfen“** liest die Planköpfe aller schon abgelegten PDFs: fehlender Planstand wird ergänzt,
  Abweichungen werden aufgelistet und lassen sich einzeln mit „Plankopf übernehmen“ korrigieren.
- Nach jeder Ablage zeigt ein Kasten: neu angelegt, neuer Index (alter überschrieben), übersprungen (mit Grund und
  „Trotzdem ersetzen“), Fehler.

## Alte Indizes werden überschrieben
Je Projekt und Plan-Nr. gibt es genau einen aktuellen Plan.
- **Höherer Index** (00 → 01, 0 → a → b; Buchstaben gelten als neuer als Zahlen) ersetzt den Plan: die neue Datei wird
  abgelegt, die **alte Datei gelöscht**. Der alte Index steht nur noch im Verlauf (Dialog „…“, Excel-Blatt *Indexverlauf*).
- **Gleicher Index:** eine Freigabe ersetzt den Vorabzug; ein Vorabzug ersetzt nie eine Freigabe.
- Älterer oder gleicher Stand wird übersprungen. Liegen mehrere Indizes desselben Plans in einer Auswahl, wird nur der neueste abgelegt.
- Planart und Bereich bleiben beim neuen Index wie bisher (auch wenn sie von Hand geändert wurden).

## Dashboard und Struktur
- Kacheln: Pläne aktuell, **Freigegeben**, **Vorabzug**, Stand offen, neu/geändert in den letzten 7 Tagen – Klick filtert.
- Balken „Planstand je Planart“ (grün freigegeben, lila Vorabzug, grau offen).
- Liste gegliedert nach **Planart** (Bewehrungsplan, Schalplan, …) → **Bereich** (Bauteil · Ebene, von Gründung nach oben) →
  Plan-Nr. Vorabzüge sind lila hinterlegt. Je Plan: Öffnen, „Freigeben“ (ein Klick), „…“ zum Bearbeiten (Index, Planstand,
  Planart, Bereich, Titel, frühere Indizes, Löschen).
- **Planliste Excel**: aktuelle Pläne plus Blatt *Indexverlauf*. **Ablage als ZIP**: Ordner `Planart/Bereich/Datei` plus Planliste.
  Beide richten sich nach dem aktuellen Filter.

## Daten und Einrichtung
Supabase-Projekt riedel-stahllisten: Tabelle `plan_plaene`, privater Bucket `planliste`. Zugriff hat, wer für die
Riedel-Tools freigeschaltet ist (`tools_berechtigt()`, Row Level Security). Projekte kommen aus `projekte/projekte.js`.
Einmalig `supabase-setup.sql` im Supabase SQL Editor ausführen – Admins sehen das SQL auch direkt im Tool, solange die Tabelle fehlt.
