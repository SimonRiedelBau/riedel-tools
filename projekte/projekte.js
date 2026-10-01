// Projekte der Riedel-Tools – eine Rubrik je Projekt.
// Wird von der Startseite (Projektkarten) und von projekte/index.html (Ablage) geladen.
//
// Neues Projekt: Eintrag in PROJEKTE ergänzen (id = Ordnername unter projekte/).
// Dokumente im Repo (z. B. HTML-Tools aus Claude-Artifacts): Datei nach projekte/<id>/ legen
// und unter docs eintragen. href ist relativ zu projekte/.
// Hochgeladene Dateien und Links aus der App liegen in Supabase (projekte/supabase-setup.sql).
window.RB_PROJEKTE = {
  RUBRIKEN: ['Pläne', '3D-Modelle & Tools', 'Mengen & Abrechnung', 'Protokolle & Schriftverkehr', 'Fotos', 'Sonstiges'],
  PROJEKTE: [
    {
      id: 'bfs-neuherberg',
      name: 'BfS Neuherberg',
      sub: 'Bundesamt für Strahlenschutz, Projekt 7421341',
      docs: []
    },
    {
      id: 'ostermeier-taufkirchen',
      name: 'Ostermeier Taufkirchen',
      sub: 'Neubau Firmensitz Ostermeier GmbH, Projekt 5573-26, Planung 26-24_OST',
      docs: [
        {
          titel: 'Aushub 3D – Baugrube mit Böschungen 45°',
          rubrik: '3D-Modelle & Tools',
          href: 'ostermeier-taufkirchen/aushub-3d.html',
          art: 'TOOL',
          datum: '2026-10-01',
          notiz: 'Grundlage Plan 26-24_OST_AH_V00, Höhen je Bereich änderbar, Export PDF und DXF'
        }
      ]
    }
  ]
};
