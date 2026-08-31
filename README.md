# riedel-tools

Sammlung praktischer Tools rund um Bauleitung und Kalkulation.

**Website:** [`index.html`](index.html) – Übersichtsseite, über die alle Tools erreichbar sind. Läuft via GitHub Pages unter `https://simonriedelbau.github.io/riedel-tools/`, sobald Pages im Repo aktiviert ist (Settings → Pages → Source: GitHub Actions – der Workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml) deployt automatisch bei jedem Push auf `main`).

## Tools

- [`geruest-mengenkalkulator/`](geruest-mengenkalkulator/) – Gerüstmengen-Kalkulator: ermittelt Fläche, Feldaufteilung, Lagenanzahl, Ankerzahl, Konsolen und eine geschätzte Bauteil-Stückliste für Fassadengerüste, inklusive automatischem 2D-Lageplan, schematischer 3D-Ansicht und Plan-Digitalisierung (Bild/PDF einlesen und abklicken).
- [`erdarbeiten/`](erdarbeiten/) – Normenassistent für Erdarbeiten & Bodenmaterial, orientiert an BodenSchG und DIN 18300.
- [`abdichtungsassistent/`](abdichtungsassistent/) – Entscheidungshilfe für Abdichtungsarbeiten nach DIN 18531–18535.
- [`entwaesserung/`](entwaesserung/) – Entwässerungsassistent für die Planung und Prüfung von Entwässerungsarbeiten.
- [`lv-manager/`](lv-manager/) – LV-Manager v2: Leistungsverzeichnisse erstellen, prüfen und exportieren (VOB/A & VOB/C), installierbar als PWA.
- [`bautagebuch/`](bautagebuch/) – Digitales Bautagebuch mit Telegram-Bot (`bautagebuch_bot.py`, Deployment z.B. auf Railway/Heroku) zur Erfassung per Chat inkl. Tagesabschluss-Erinnerung.
- [`statik-ferrari-muenchen/`](statik-ferrari-muenchen/) – Projektspezifischer Statik-Assistent für den Neubau Autohaus Ferrari München. Die vollständigen Statik-PDFs (~900 MB) verbleiben aus Platzgründen im [Ursprungsrepo](https://github.com/SimonRiedelBau/StatikFerrari).

Jedes Tool ist eigenständig lauffähig (eigene `index.html`) und über die [Übersichtsseite](index.html) verlinkt.

## Herkunft

Die Tools wurden ursprünglich in separaten Repos entwickelt und hier in eine gemeinsame Ordnerstruktur überführt:

| Ordner | Ursprungsrepo |
|---|---|
| `geruest-mengenkalkulator/` | dieses Repo |
| `erdarbeiten/` | [SimonRiedelBau/Erdarbeiten](https://github.com/SimonRiedelBau/Erdarbeiten) |
| `abdichtungsassistent/` | [SimonRiedelBau/Abdichtung](https://github.com/SimonRiedelBau/Abdichtung) |
| `entwaesserung/` | [SimonRiedelBau/Entwaesserung](https://github.com/SimonRiedelBau/Entwaesserung) |
| `lv-manager/` | [SimonRiedelBau/LV](https://github.com/SimonRiedelBau/LV) |
| `bautagebuch/` | [SimonRiedelBau/bautagebuch](https://github.com/SimonRiedelBau/bautagebuch) |
| `statik-ferrari-muenchen/` | [SimonRiedelBau/StatikFerrari](https://github.com/SimonRiedelBau/StatikFerrari) |
