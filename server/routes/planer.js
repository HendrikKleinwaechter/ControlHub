/**
 * Routen: Arbeitsplaner-Vorgaben (Feldkomplexe, Fruchtfolge, Bodenbearbeitung; Paket E2) -- s. server/plannerStore.js.
 * Nach jeder Änderung bekommen alle Tablets 'planer-changed'.
 * @param {import('express').Express} app
 * @param {object} server  ControllerServer-Instanz
 */
export function registerPlanerRoutes(app, server) {
  const store = () => server.plannerStore;
  const changed = () => { const s = store().summary(); server.io.emit('planer-changed', s); return s; };
  const handle = (fn) => async (req, res) => {
    try {
      const extra = await fn(req);
      res.json({ success: true, ...(extra || {}), planer: changed() });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  };

  app.get('/api/planer', (req, res) => res.json({ success: true, planer: store().summary() }));
  // Der aktive Satz als Ganzes (Planer schickt immer alles, wie die Kachelseiten)
  app.put('/api/planer/set', handle(async (req) => { await store().update(req.body?.set); }));
  app.post('/api/planer/load', handle(async (req) => { await store().load(req.body?.id); }));
  app.post('/api/planer/save-as', handle(async (req) => ({ id: await store().saveAs(req.body?.name, req.body?.empty === true) })));
  app.delete('/api/planer/set/:id', handle(async (req) => { await store().remove(req.params.id); }));
  app.post('/api/planer/import', handle(async (req) => ({ id: await store().importSet(req.body?.data) })));
  app.get('/api/planer/set/:id/export', (req, res) => {
    try {
      res.json({ success: true, data: store().exportSet(req.params.id) });
    } catch (error) {
      res.status(404).json({ success: false, error: error.message });
    }
  });
}
