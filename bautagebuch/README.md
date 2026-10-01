# Bautagebuch

Tagesberichte (Blatt „Bautagebuch – Rohbau“ + Anhang) für die Baustelle. Für Handy, Tablet und PC.

## Bedienung
1. **Projekt** oben antippen und wählen (oder unter „Projekte“ anlegen; mit Ort wird das Wetter automatisch geladen).
2. **Tagesbericht** ausfüllen – nummerierte Abschnitte mit Status:
   - *Schnell erfassen*: Text tippen oder diktieren, z. B. „3 Maurer, 1 Kran, Bodenplatte betoniert“. Personal und Geräte mit Zahl werden erkannt, der Text kommt zu „Ausgeführte Arbeiten“.
   - *Wie letzter Bericht*: übernimmt Arbeitszeit, Personal, Geräte, Nachunternehmer und Namen vom letzten Blatt.
   - Personal und Geräte per **− / +**, Niederschlag und Wind per Auswahlknopf.
   - Fotos kommen auf die Anhang-Seite im PDF (nur im PDF, nicht in der Datenbank).
3. Unten zeigt die Leiste, wie viele **Pflichtangaben** (Arbeiten, Temperatur 7 Uhr, Wind, Polier, Bauleiter) fehlen – antippen springt hin.
4. **Speichern** = Entwurf in der Datenbank. **Bestätigen** = Status „bestätigt“, PDF wird heruntergeladen, danach beginnt das nächste Blatt.
5. **Berichte**: suchen, filtern (Projekt, Jahr, Status), nach Woche oder Monat gruppiert; PDF, ZIP pro Gruppe, Bearbeiten, Löschen.

Alles, was eingegeben wird, sichert das Gerät sofort (IndexedDB). Geht die Verbindung oder der Akku weg, ist der Stand beim nächsten Öffnen wieder da.

## Technik
- `index.html` + `bautagebuch.css` + `app.js` – Oberfläche ohne Framework
- `pdf.js` – Formular-Vorlage, PDF-Layout (jsPDF) und Erkennung der Kurznotizen
- `vendor/` – jsPDF 2.5.1 und JSZip 3.10.1 lokal (keine CDN nötig)
- Daten: eigenes Supabase-Projekt `dlypbcdoxlfyyavmrhlr` (Tabellen `projekte`, `berichte`, `profiles`), eigene Anmeldung
- `bautagebuch_bot.py` – Telegram-Bot (läuft separat auf Railway), schreibt in dieselben Tabellen
- `mobile.html` – leitet auf die neue Oberfläche weiter (frühere Handy-Version)
