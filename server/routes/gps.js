/**
 * Routen: GPS-Menü mit Gerätespeicher (Umsetzungsplan Paket I2) -- s. server/gpsManager.js.
 * Nach jeder Änderung bekommen alle Tablets 'gps-changed' (Kurzfassung); die laufenden Werte (Zustand,
 * Abstände, Werte aus dem Spiel) kommen mit jedem 'telemetry-update' als data.gps.
 * @param {import('express').Express} app
 * @param {object} server  ControllerServer-Instanz
 */
export function registerGpsRoutes(app, server) {
  const mgr = () => server.gpsManager;
  const changed = () => { const s = mgr().summary(); server.io.emit('gps-changed', s); return s; };
  const handle = (fn) => async (req, res) => {
    try {
      const extra = await fn(req);
      res.json({ success: true, ...(extra || {}), gps: changed() });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  };

  app.get('/api/gps', (req, res) => res.json({ success: true, gps: mgr().summary() }));

  // Einstellungen des geladenen Geräts ändern (noch nicht gespeichert)
  app.put('/api/gps/live', handle(async (req) => { await mgr().patchLive(req.body || {}); server.gpsEngine?.reset(); }));
  // Gerätespeicher
  app.post('/api/gps/save', handle(async () => ({ name: await mgr().save() })));
  app.post('/api/gps/save-as', handle(async (req) => ({ name: await mgr().saveAs(req.body?.name) })));
  app.post('/api/gps/load', handle(async (req) => { await mgr().load(req.body?.name); server.gpsEngine?.reset(); }));
  // Angehängtes Gerät wartet (geladenes hat ungespeicherte Änderungen): speichern oder verwerfen, dann wechseln
  app.post('/api/gps/wechseln', handle(async (req) => { const r = await mgr().wechsle(req.body?.speichern === true); server.gpsEngine?.reset(); return r; }));
  app.delete('/api/gps/device/:name', handle(async (req) => { await mgr().remove(req.params.name); }));
  app.post('/api/gps/import', handle(async (req) => ({ name: await mgr().importDevice(req.body?.data) })));
  app.get('/api/gps/device/:name/export', (req, res) => {
    try {
      res.json({ success: true, data: mgr().exportDevice(req.params.name) });
    } catch (error) {
      res.status(404).json({ success: false, error: error.message });
    }
  });
  // Für alle Geräte: automatisch laden, Signalton
  app.put('/api/gps/config', handle(async (req) => { await mgr().setConfig(req.body || {}); }));

  // Seite „GPS-Geräte“ (Test 23.10.2026, Anmerkung 21): Geräte von Hand anlegen und bearbeiten, Optionen je angehängtem
  // Gerät (auf der Karte zeigen, zählt als bearbeitet) und „Als GPS-Gerät verwenden“
  app.post('/api/gps/device', handle(async (req) => ({ name: await mgr().createDevice(req.body?.data || req.body || {}) })));
  app.put('/api/gps/device/:name', handle(async (req) => {
    const name = await mgr().updateDevice(req.params.name, req.body || {});
    if (name === mgr().config.current) server.gpsEngine?.reset();
    return { name };
  }));
  app.put('/api/gps/einheit', handle(async (req) => ({ einheit: await mgr().setEinheit(req.body?.name, req.body || {}) })));
  app.put('/api/gps/gps-einheit', handle(async (req) => { await mgr().setGpsEinheit(req.body?.name ?? null); server.gpsEngine?.reset(); }));
}
