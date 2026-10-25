/**
 * Routen: Makros (Vorgewende)
 * Ausgelagert aus server/index.js (setupExpress) am 21.10.2026 -- Inhalt unverändert, nur `this` -> `server`.
 * @param {import('express').Express} app
 * @param {object} server  ControllerServer-Instanz (Manager, io, Hilfsmethoden)
 */

export function registerMacrosRoutes(app, server) {
  // Makros-API (Vorgewendemanagement)
  app.get('/api/macros', (req, res) => {
    res.json({ success: true, macros: server.macrosManager.getAllMacros() });
  });

  app.post('/api/macro/save', async (req, res) => {
    try {
      const { id, macro } = req.body;
      await server.macrosManager.setMacro(id, macro);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Wo sind alle Makros belegt? (Liste der Makros, Durchsicht B10) -- { [Makro-ID]: [Fundstelle …] }
  app.get('/api/macros/verwendung', async (req, res) => {
    try {
      const verwendung = {};
      for (const m of server.macrosManager.getAllMacros()) verwendung[m.id] = await server.verwendungen(`macro:${m.id}`);
      res.json({ success: true, verwendung });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Wo wird das Makro benutzt? (Durchsicht B2) -- Tasten, Kacheln, Tastenleisten, GPS-Auslöser
  app.get('/api/macro/:id/verwendung', async (req, res) => {
    try {
      res.json({ success: true, funde: await server.verwendungen(`macro:${req.params.id}`) });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.delete('/api/macro/:id', async (req, res) => {
    try {
      if (!server.macrosManager.getMacro?.(req.params.id) && !server.macrosManager.macros?.[req.params.id]) {
        return res.status(404).json({ success: false, error: 'Makro nicht gefunden' });
      }
      // ?belegungen=entfernen: vorher aus allen Belegungen nehmen
      if (req.query.belegungen === 'entfernen') await server.verwendungen(`macro:${req.params.id}`, { entfernen: true });
      await server.macrosManager.deleteMacro(req.params.id);
      // Falls gerade dieses Makro aktiv/wartend ist, sauber abbrechen statt eine gelöschte
      // Makro-ID weiterlaufen zu lassen.
      if (server.macroEngine.activeMacroId === req.params.id) {
        server.macroEngine.abort();
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Abbrechen aus dem Makro-Menü der Statusleiste (Paket H) -- wie die Aktion „Makro abbrechen“,
  // bereits ausgelöste Schritte bleiben.
  app.post('/api/macro/abort', (req, res) => {
    server.macroEngine.abort();
    res.json({ success: true });
  });

  app.get('/api/macros/export', (req, res) => {
    const data = server.macrosManager.exportMacros();
    res.json({ success: true, data });
  });

  app.post('/api/macros/import', async (req, res) => {
    try {
      const { data, mode } = req.body;
      await server.macrosManager.importMacros(data, mode || 'merge');
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
}
