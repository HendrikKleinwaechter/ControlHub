/**
 * Routen: Kachelseiten (Paket C, 21.10.2026) -- s. server/kachelnManager.js.
 * @param {import('express').Express} app
 * @param {object} server  ControllerServer-Instanz
 */
import { exportiereSeiten, importiereSeiten } from '../seitenAustausch.js';
import { bilderEinbetten, bilderUebernehmen } from '../kachelBilder.js';
import { ASSETS_DIR } from '../paths.js';

export function registerKachelnRoutes(app, server) {
  // Seiten exportieren (alle oder ?ids=a,b) und importieren, mit ihren eigenen Tastenfeldern (24.10.2026)
  // Bilder der Kacheln kommen mit in die Datei (server/kachelBilder.js)
  app.get('/api/kacheln/export', async (req, res) => {
    const ids = typeof req.query.ids === 'string' && req.query.ids ? req.query.ids.split(',') : null;
    const data = exportiereSeiten(server.kachelnManager.get(), server.steuerungsmenuesManager, ids);
    for (const k of Object.values(data.kacheln)) k.bilder = await bilderEinbetten(k, { assetsDir: ASSETS_DIR });
    res.json({ success: true, data });
  });
  app.post('/api/kacheln/import', async (req, res) => {
    try {
      const sm = server.steuerungsmenuesManager;
      const r = await importiereSeiten(req.body?.data, server.kachelnManager, sm, Object.keys(server.profileManager?.profiles || {}), {
        nachKachel: async (page, k) => { if (await bilderUebernehmen(page, k.bilder, { assetsDir: ASSETS_DIR, gameId: server.gameManager.activeId })) await sm.save(); }
      });
      server.io.emit('kacheln-changed', server.kachelnManager.get());
      if (r.kacheln) server.io.emit('steuerungsmenues-changed');
      res.json({ success: true, ...r });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get('/api/kacheln', (req, res) => {
    res.json({ success: true, config: server.kachelnManager.get() });
  });

  // Ganze Konfiguration speichern (Editor schickt immer alles) -- andere Geräte bekommen 'kacheln-changed'
  app.put('/api/kacheln', async (req, res) => {
    try {
      const vorher = new Set(server.kachelnManager.get().pages.map(p => p.id));
      const config = await server.kachelnManager.set(req.body?.config);
      // Gelöschte Seiten: „Kachelseite … zeigen“ von Tasten, Kacheln, aus Makros und GPS-Auslösern nehmen (24.10.2026)
      for (const id of vorher) {
        if (!config.pages.some(p => p.id === id)) await server.verwendungen(`hub:tiles:show:${id}`, { entfernen: true }).catch(() => {});
      }
      server.io.emit('kacheln-changed', config);
      res.json({ success: true, config });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
}
