# Bautagebuch

Tagesberichte (Blatt „Bautagebuch – Rohbau“ + Anhang) für die Baustelle. Für Handy, Tablet und PC.

## Bedienung
1. **Projekt** oben antippen und wählen. Projekte sind **Kostenstellen** – man sieht nur die, für die man freigeschaltet ist (Admins: alle). Unter „Projekte“ → „Ort für Wetter“ den Ort setzen, dann lädt das Wetter automatisch.
2. **Tagesbericht** ausfüllen – nummerierte Abschnitte mit Status:
   - *Schnell erfassen*: Text tippen oder diktieren, z. B. „3 Maurer, 1 Kran, Bodenplatte betoniert“. Personal und Geräte mit Zahl werden erkannt, der Text kommt zu „Ausgeführte Arbeiten“.
   - *Wie letzter Bericht*: übernimmt Arbeitszeit, Personal, Geräte, Nachunternehmer und Namen vom letzten Blatt.
   - Personal und Geräte per **− / +**, Niederschlag und Wind per Auswahlknopf.
   - Fotos kommen auf die Anhang-Seite im PDF (nur im PDF, nicht in der Datenbank).
3. Unten zeigt die Leiste, wie viele **Pflichtangaben** (Arbeiten, Temperatur 7 Uhr, Wind, Polier, Bauleiter) fehlen – antippen springt hin.
4. **Speichern** = Entwurf in der Datenbank. **Bestätigen** = Status „bestätigt“, PDF wird heruntergeladen, danach beginnt das nächste Blatt.
5. **Berichte**: suchen, filtern (Projekt, Jahr, Status), nach Woche oder Monat gruppiert; PDF, ZIP pro Gruppe, Bearbeiten, Löschen.

Alles, was eingegeben wird, sichert das Gerät sofort (IndexedDB). Geht die Verbindung oder der Akku weg, ist der Stand beim nächsten Öffnen wieder da.

## Anmeldung und Freigabe
- Eine Anmeldung für alle Riedel-Tools (Startseite). Das Bautagebuch hat keine eigene Anmeldung mehr.
- Ein Admin legt auf der Startseite unter **„Zugänge“ → „Kostenstellen“** die Kostenstellen an und ordnet die Personen zu.
- Die Datenbank prüft die Freigabe selbst (Row Level Security): Berichte einer Kostenstelle sieht und ändert nur, wer dafür freigeschaltet ist.

## Einrichtung (einmalig, Admin)
1. Im Supabase-Projekt `riedel-stahllisten` im SQL Editor nacheinander ausführen: `zugang-setup.sql`, `stahllisten/supabase-setup.sql`, `bautagebuch/supabase-setup.sql` (das Tool zeigt das SQL auch zum Kopieren an).
2. Kostenstellen anlegen und Personen freischalten (Startseite → Zugänge).
3. Alte Berichte übernehmen: Bautagebuch → Projekte → „Alte Daten übernehmen …“ (mit dem alten Bautagebuch-Konto anmelden, alte Projekte den Kostenstellen zuordnen). Bereits übernommene Blätter werden übersprungen.
4. Telegram-Bot (Railway): `SUPABASE_URL` auf `https://sazhfayopozqcluvmqqu.supabase.co` und `SUPABASE_KEY` auf den **service_role**-Schlüssel dieses Projekts umstellen; optional `BOT_ADMINS` (Telegram-User-IDs). In jeder Gruppe einmal `/kostenstelle <Nr>` senden.

## Technik
- `index.html` + `bautagebuch.css` + `app.js` – Oberfläche ohne Framework
- `pdf.js` – Formular-Vorlage, PDF-Layout (jsPDF) und Erkennung der Kurznotizen
- `vendor/` – jsPDF 2.5.1 und JSZip 3.10.1 lokal (keine CDN nötig)
- Daten: gemeinsames Supabase-Projekt der Riedel-Tools (Tabellen `kostenstellen`, `bt_berichte`, `bt_telegram_nachrichten`), Einrichtung in `supabase-setup.sql`
- Das frühere eigene Projekt `dlypbcdoxlfyyavmrhlr` wird nur noch für die einmalige Übernahme gelesen
- `bautagebuch_bot.py` – Telegram-Bot (läuft separat auf Railway), schreibt in `bt_telegram_nachrichten` und `bt_berichte`
- `mobile.html` – leitet auf die neue Oberfläche weiter (frühere Handy-Version)
