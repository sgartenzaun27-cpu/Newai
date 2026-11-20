// Texte und Empfehlungen der Startseite – hier kannst du alles ändern, ohne Code anzufassen.
// Nach dem Speichern auf GitHub ist die Änderung nach ca. 1 Minute live.
window.KI_CONFIG = {
  // Name oben links. Eine Zahl am Ende (404) wird als Leuchtschrift gesetzt.
  name: 'Room 404',

  // Die große Leuchtzahl auf der Startseite
  signal: '404',

  // Überschrift und der leise Satz darunter
  ueberschrift: 'Diese Seite gibt es nicht.',
  fluestern: 'Zumindest nicht für alle.',

  // Text unter der Überschrift
  untertitel:
    'Room 404 ist die kostenlose KI mit dem Wissen, das sonst keiner teilt: Supplier, Snipen, Shopify, Google-Badges – und Pläne, die du abhaken kannst.',

  // Beispielfragen zum Antippen. icon: plan, supplier, snipe, schild, badge oder shop
  startfragen: [
    { titel: 'Plan für den Vintage-Start', frage: 'Wie fange ich mit Vintage Reselling an? Gib mir einen Plan zum Abhaken.', icon: 'plan' },
    { titel: 'Gute Supplier finden', frage: 'Woher bekomme ich gute Supplier für Vintage-Kleidung?', icon: 'supplier' },
    { titel: 'Snipen lernen', frage: 'Was ist ein Snipebot und wie fange ich mit dem Snipen an?', icon: 'snipe' },
    { titel: 'Auf Vinted gesperrt', frage: 'Ich wurde auf Vinted gesperrt. Was kann ich jetzt tun?', icon: 'schild' },
    { titel: 'Geld mit Google-Badges', frage: 'Wie verdiene ich Geld mit Google-Bewertungs-Badges?', icon: 'badge' },
    { titel: 'Eigener Shopify-Shop', frage: 'Wie baue ich meinen eigenen Shopify-Shop für Vintage auf? Gib mir einen Plan.', icon: 'shop' },
  ],

  // Text im leeren Eingabefeld
  platzhalter: 'Frag Room 404 …',

  // Empfehlungs-Karten: Verlinkt die KI eine dieser Seiten, erscheint unter der Antwort eine Karte.
  partner: [
    { domain: 'vintagedepots.de', name: 'Vintage Depots', text: 'Geprüfte Supplier-Listen als PDF, ab 14,95 €', knopf: 'Zu Vintage Depots' },
    { domain: 'host-of-vintage.de', name: 'Host of Vintage', text: '170 geprüfte Händler in 19 Ländern', knopf: 'Zu Host of Vintage' },
    { domain: 'vintagehost.de', name: 'VintageHost', text: 'Deals unter Marktwert, KI-Listings und Shopify in einem Tool', knopf: 'Zu VintageHost' },
    { domain: 'badgeo.de', name: 'Badgeo', text: 'Google-Bewertungs-Badges mit NFC im Bundle', knopf: 'Zu Badgeo' },
  ],

  // Kennung in Links zu deinen Seiten – so siehst du in deinen Shop-Statistiken, was Room 404 bringt
  utmQuelle: 'room404',
};
