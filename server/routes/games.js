/**
 * Routen: Spiele (Phase 2), Telemetrie-Einstellungen, Sichern & Teilen
 * Ausgelagert aus server/index.js (setupExpress) am 21.10.2026 -- Inhalt unverändert, nur `this` -> `server`.
 * @param {import('express').Express} app
 * @param {object} server  ControllerServer-Instanz (Manager, io, Hilfsmethoden)
 */
import { TELEMETRY_RATES } from '../telemetryReader.js';
import { bilderEinbetten, bilderUebernehmen } from '../kachelBilder.js';
import { ASSETS_DIR } from '../paths.js';

export function registerGamesRoutes(app, server) {
  // Sammel-Export/-Import (Phase D, 21.08.2026): eine Bundle-Datei über mehrere Bereiche
  // (Funktionen/Profile/Bedienpanel-Seiten) hinweg, mit granularer Auswahl + Konfliktprüfung vor
  // dem eigentlichen Import. s. server/backupManager.js -- reine Orchestrierung der bestehenden
  // Einzel-Export/-Import-Methoden, keine neue Merge-Logik.
  // Kacheln mit ihren Bildern (24.10.2026, server/kachelBilder.js)
  app.post('/api/backup/export', async (req, res) => {
    try {
      const { functionIds, profileNames, pageIds } = req.body || {};
      const bundle = server.backupManager.buildBundle({ functionIds, profileNames, pageIds });
      for (const p of bundle.steuerungsmenuePages?.data || []) p.bilder = await bilderEinbetten(p, { assetsDir: ASSETS_DIR });
      res.json({ success: true, data: bundle });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/backup/check', (req, res) => {
    try {
      const report = server.backupManager.checkImport(req.body?.data || {});
      res.json({ success: true, ...report });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/backup/import', async (req, res) => {
    try {
      const { data, modes } = req.body || {};
      const sm = server.steuerungsmenuesManager;
      const result = await server.backupManager.importBundle(data || {}, modes || {}, {
        nachKachel: async (page, ausDatei) => { if (await bilderUebernehmen(page, ausDatei.bilder, { assetsDir: ASSETS_DIR, gameId: server.gameManager.activeId })) await sm.save(); }
      });
      res.json({ success: true, result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ---- Spiele (Phase 2) ----
  app.get('/api/games', (req, res) => res.json(server.gamesPayload()));

  app.post('/api/games/switch', async (req, res) => {
    try {
      await server.switchGame(String(req.body?.id || ''));
      res.json(server.gamesPayload());
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // Eigenes Spiel anlegen (ohne Telemetrie); switch=true wechselt gleich dorthin
  app.post('/api/games', async (req, res) => {
    try {
      const game = await server.gameManager.addCustom(req.body?.name);
      if (req.body?.switch) await server.switchGame(game.id);   // switchGame() läuft exklusiv (index.js)
      res.json({ ...server.gamesPayload(), created: game });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.put('/api/games/:id', async (req, res) => {
    try {
      await server.gameManager.renameCustom(req.params.id, req.body?.name);
      server.io.emit('games-updated', server.gamesPayload());
      res.json(server.gamesPayload());
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // Entfernt nur eigene, nicht aktive Spiele; der Ordner wandert nach config/_geloescht/
  app.delete('/api/games/:id', async (req, res) => {
    try {
      await server.gameManager.removeCustom(req.params.id);
      server.io.emit('games-updated', server.gamesPayload());
      res.json(server.gamesPayload());
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get('/api/games/:id/export', async (req, res) => {
    try {
      const bundle = await server.gameManager.exportGame(req.params.id);
      const safe = bundle.game.name.replace(/[^\w-]+/g, '_');
      res.setHeader('Content-Disposition', `attachment; filename="ControlHub-Spiel_${safe}_${new Date().toISOString().slice(0, 10)}.json"`);
      res.json(bundle);
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // body: { bundle, mode: 'new'|'replace', targetId?, name? }. Ersetzt es das aktive Spiel, wird neu geladen.
  app.post('/api/games/import', async (req, res) => {
    try {
      const { bundle, mode, targetId, name } = req.body || {};
      // nicht gleichzeitig mit einem Spielwechsel (index.js exclusive)
      const target = await server.exclusive(async () => {
        const t = await server.gameManager.importGame(bundle, { mode, targetId, name });
        if (t.id === server.gameManager.activeId) {
          await server.loadGameData(t.id);
          server.io.emit('game-changed', { active: t.id });
        } else {
          server.io.emit('games-updated', server.gamesPayload());
        }
        return t;
      });
      res.json({ ...server.gamesPayload(), target });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // Telemetrie-Einstellungen (Phase 1): Aktualisierungsrate der FS25-Mod
  app.get('/api/telemetry/settings', (req, res) => {
    res.json({ success: true, rate: server.appSettings.telemetry.rate, rates: TELEMETRY_RATES, clients: server.connectedDevices() });
  });

  app.post('/api/telemetry/settings', async (req, res) => {
    const rate = Number(req.body?.rate);
    if (!TELEMETRY_RATES.includes(rate)) {
      return res.status(400).json({ success: false, error: `Erlaubt sind ${TELEMETRY_RATES.join(', ')} pro Sekunde` });
    }
    try {
      server.appSettings.telemetry.rate = rate;
      await server.saveAppSettings();
      server.telemetryReader.setRate(rate);
      await server.updateModSettings();
      server.io.emit('telemetry-settings', { rate });
      res.json({ success: true, rate });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
}
