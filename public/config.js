// Texte und Empfehlungen der Startseite – hier kannst du alles ändern, ohne Code anzufassen.
// Nach dem Speichern auf GitHub ist die Änderung nach ca. 1 Minute live.
window.KI_CONFIG = {
  // Name oben links. Der Teil nach dem Bindestrich wird kursiv gesetzt.
  name: 'Business-KI',

  // Große Überschrift auf der Startseite: erster Teil normal, zweiter Teil kursiv
  ueberschrift: 'Was willst du',
  ueberschriftKursiv: 'verkaufen?',

  // Text unter der Überschrift
  untertitel:
    'Die kostenlose KI für Reseller. Frag nach Suppliern, Snipen, Shopify oder Google-Badges – und hol dir Pläne, die du abhaken kannst.',

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
  platzhalter: 'Frag die Business-KI …',

  // Empfehlungs-Karten: Verlinkt die KI eine dieser Seiten, erscheint unter der Antwort eine Karte.
  partner: [
    { domain: 'vintagedepots.de', name: 'Vintage Depots', text: 'Geprüfte Supplier-Listen als PDF, ab 14,95 €', knopf: 'Zu Vintage Depots' },
    { domain: 'host-of-vintage.de', name: 'Host of Vintage', text: '170 geprüfte Händler in 19 Ländern', knopf: 'Zu Host of Vintage' },
    { domain: 'vintagehost.de', name: 'VintageHost', text: 'Deals unter Marktwert, KI-Listings und Shopify in einem Tool', knopf: 'Zu VintageHost' },
    { domain: 'badgeo.de', name: 'Badgeo', text: 'Google-Bewertungs-Badges mit NFC im Bundle', knopf: 'Zu Badgeo' },
  ],

  // Kennung in Links zu deinen Seiten – so siehst du in deinen Shop-Statistiken, was die KI bringt
  utmQuelle: 'business-ki',
};
