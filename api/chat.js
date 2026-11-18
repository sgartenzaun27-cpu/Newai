// Vercel-Serverfunktion: erreichbar unter /api/chat
// Die eigentliche Logik steckt in lib/ki.js.
import { bearbeiteAnfrage } from '../lib/ki.js';

export default {
  fetch(request) {
    return bearbeiteAnfrage(request);
  },
};
