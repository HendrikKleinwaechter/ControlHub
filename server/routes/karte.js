/**
 * Einstellungen → Karte (Test 23.10.2026, Anmerkung 11): alles zur Karte, was nicht zur Kachel oder zum Gerät gehört.
 *   glaetten  Glättung von Position und Richtung (aus/wenig/mittel/stark), für alle Geräte gleich (app.json karte)
 *   strassen  Straßennetz auf der Karte zeigen (app.json karte; Daten ab Mod 0.6)
 *   beep      worüber der Vorgewende-Ton kommt (gps.json des Spiels, s. gpsManager.js)
 * Der Spieldaten-Takt hat seine eigene Route (/api/telemetry/settings), steht aber auf derselben Seite.
 * Nach jeder Änderung bekommen alle Geräte 'karte-einstellungen'.
 * @param {import('express').Express} app
 * @param {object} server  ControllerServer-Instanz
 */
import { BEEP_MODES } from '../gpsManager.js';

export const GLAETTEN = ['aus', 'wenig', 'mittel', 'stark'];

export function cleanKarte(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  // Standard „wenig“ (Hendrik 25.10.2026: „die Glättung hätte ich gerne auf der niedrigsten Stufe im Standard“, vorher „mittel“)
  return { glaetten: GLAETTEN.includes(r.glaetten) ? r.glaetten : 'wenig', strassen: r.strassen !== false };
}

export function registerKarteRoutes(app, server) {
  const stand = () => {
    const k = cleanKarte(server.appSettings.karte);
    const g = server.gpsManager?.config;
    return { ...k, beep: g?.beep || 'tablet' };
  };
  server.karteStand = stand;

  app.get('/api/karte', (req, res) => res.json({ success: true, karte: stand() }));

  // Bearbeitete Fläche löschen: nur die des Fahrzeugs, in dem man sitzt, oder alle dieses Spielstands
  app.delete('/api/flaeche', async (req, res) => {
    try {
      await server.flaeche.loesche(req.query.alle === '1');
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/karte', async (req, res) => {
    try {
      const p = req.body || {};
      const k = cleanKarte(server.appSettings.karte);
      if ('glaetten' in p) {
        if (!GLAETTEN.includes(p.glaetten)) throw new Error('Glättung: aus, wenig, mittel oder stark');
        k.glaetten = p.glaetten;
      }
      if ('strassen' in p) k.strassen = p.strassen === true;
      server.appSettings.karte = k;
      await server.saveAppSettings();
      const gps = {};
      if ('beep' in p) {
        if (!BEEP_MODES.includes(p.beep)) throw new Error('Ton: aus, tablet, armlehne oder beide');
        gps.beep = p.beep;
      }
      if (Object.keys(gps).length && server.gpsManager) {
        await server.gpsManager.setConfig(gps);
        server.io.emit('gps-changed', server.gpsManager.summary());
      }
      const s = stand();
      server.io.emit('karte-einstellungen', s);
      res.json({ success: true, karte: s });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
}
