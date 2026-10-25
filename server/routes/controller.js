/**
 * Routen: Controller und Geräteprofile (23.10.2026, s. server/controllerManager.js). Nach einer Änderung der Modul-Auswahl bekommen alle Tablets
 * 'controller-setup-changed' (neue Module/Achsen); wechselt der Controller selbst, kommt 'controller-changed'
 * (Tablets laden neu, wie beim Spielwechsel).
 * @param {import('express').Express} app
 * @param {object} server  ControllerServer-Instanz
 */
export function registerControllerRoutes(app, server) {
  const mgr = () => server.controllerManager;
  const setupChanged = () => { const p = mgr().payload(); server.io.emit('controller-setup-changed', p); return p; };
  const handle = (fn) => async (req, res) => {
    try {
      const extra = await fn(req);
      res.json({ success: true, ...(extra || {}) });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  };

  // Dazu: für welche Controller es im aktiven Spiel schon eine Belegung gibt („Profile von … übernehmen“, G2)
  app.get('/api/controller', async (req, res) => {
    const belegungen = await server.gameManager.controllersWithData(server.gameManager.activeId);
    res.json({ ...mgr().payload(), belegungen: belegungen.filter(id => id !== mgr().activeId && mgr().profile(id)) });
  });

  // Geräteprofil von Hand wählen (z. B. für einen Selbstbau mit fremder Firmware)
  app.post('/api/controller/select', handle(async (req) => {
    await server.switchController(String(req.body?.id || ''));
    return { active: mgr().activeId };
  }));

  // Noch einmal erkennen (GETALL + USB-Kennung), z. B. nach einem Firmware-Update
  app.post('/api/controller/detect', handle(async () => {
    if (!server.serial.getStatus().connected) throw new Error('Kein Controller verbunden');
    await server.detectController();
    return { active: mgr().activeId };
  }));

  // Modul-Baukasten: Auswahl speichern bzw. eine Vorlage (Pro, Comfort, Plus, Mini) übernehmen
  app.put('/api/controller/setup', handle(async (req) => {
    await mgr().saveSetup(mgr().activeId, req.body?.setup);
    server.unterbauZurArmlehne().catch(() => {});   // Schubhebel: die Firmware muss es wissen
    return { controller: setupChanged() };
  }));
  // Farbe der Armlehne: nur die Modulbilder (Tastenbelegung, Steuerungsübersicht) ändern sich
  app.put('/api/controller/farbe', handle(async (req) => {
    await mgr().saveFarbe(mgr().activeId, String(req.body?.farbe || ''));
    return { controller: setupChanged() };
  }));
  app.post('/api/controller/preset', handle(async (req) => {
    const vorlage = mgr().vorlage(String(req.body?.id || ''));
    if (!vorlage) throw new Error('Unbekannte Vorlage');
    await mgr().saveSetup(mgr().activeId, vorlage.setup);
    server.unterbauZurArmlehne().catch(() => {});
    return { controller: setupChanged() };
  }));

  // „Profile von … übernehmen“ (G2): Belegung eines anderen Controllers im aktiven Spiel kopieren; danach laden alle Tablets neu
  app.post('/api/controller/copy-profiles', handle(async (req) => {
    await server.copyControllerProfiles(String(req.body?.from || ''));
  }));

  // ---- Eigene Controller (Editor im Entwickler-Bereich, Paket G3) ----
  const customChanged = (id) => { if (id === mgr().activeId) setupChanged(); server.io.emit('controller-custom-changed', { id }); };
  app.get('/api/controller/custom', (req, res) => res.json({ success: true, controllers: mgr().customList(), active: mgr().activeId }));
  app.post('/api/controller/custom', handle(async (req) => {
    const created = await mgr().createCustom(req.body || {});
    customChanged(created.id);
    return { controller: created };
  }));
  app.put('/api/controller/custom/:id', handle(async (req) => {
    const updated = await mgr().updateCustom(req.params.id, req.body?.controller);
    customChanged(updated.id);
    return { controller: updated };
  }));
  app.delete('/api/controller/custom/:id', handle(async (req) => {
    await mgr().deleteCustom(req.params.id);
    customChanged(req.params.id);
  }));
  app.get('/api/controller/custom/:id/export', (req, res) => {
    try { res.json({ success: true, data: mgr().exportCustom(req.params.id) }); } catch (error) { res.status(404).json({ success: false, error: error.message }); }
  });
  app.post('/api/controller/custom/import', handle(async (req) => {
    const created = await mgr().importCustom(req.body?.data);
    customChanged(created.id);
    return { controller: created };
  }));

  // Vorschlag aus der Modul-Erkennung der CraftConsole (STATUS) -- wird nicht gespeichert, die Oberfläche zeigt ihn an
  app.post('/api/controller/detect-modules', handle(async () => {
    if (mgr().activeId !== 'craftconsole') throw new Error('Die Modul-Erkennung gibt es nur bei der CraftConsole');
    const det = await server.deviceConfigClient.getStatus();
    return { setup: mgr().setupFromDetection(det), det };
  }));
}
