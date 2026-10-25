/**
 * Routen: Mod für die Spieldaten anzeigen und installieren (25.10.2026, server/modInstallieren.js).
 * Installieren nur per POST, also nur auf Knopfdruck.
 */
import { modStatus, installiereMod } from '../modInstallieren.js';

export function registerModRoutes(app) {
  app.get('/api/mod/status', async (req, res) => {
    try {
      res.json({ success: true, ...(await modStatus()) });
    } catch (error) {
      res.json({ success: false, error: error.message });
    }
  });

  app.post('/api/mod/installieren', async (req, res) => {
    try {
      res.json({ success: true, ...(await installiereMod()) });
    } catch (error) {
      res.json({ success: false, error: error.message });
    }
  });
}
