/**
 * Routen: Einrichtungs-Assistent und Tour (23.10.2026, s. server/einrichtung.js, public/js/einrichtung.js).
 * Der Assistent selbst läuft im Browser; der Server merkt sich nur, ob die Ersteinrichtung erledigt ist (app.json),
 * welche Controller eingerichtet sind (controller.json) und ob gerade eine Frage offen ist („Neuer Controller“,
 * „Achsen nicht kalibriert“). Andere Tablets bekommen 'einrichtung-geaendert' und schließen ihre Frage bzw. den
 * Assistenten.
 * @param {import('express').Express} app
 * @param {object} server  ControllerServer-Instanz
 */
export function registerEinrichtungRoutes(app, server) {
  const cm = () => server.controllerManager;
  const handle = (fn) => async (req, res) => {
    try {
      res.json({ success: true, ...((await fn(req)) || {}) });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  };
  const geaendert = () => server.io.emit('einrichtung-geaendert', { fertig: !!server.appSettings.einrichtung?.fertig });

  app.get('/api/einrichtung', (req, res) => {
    const p = cm().activeProfile;
    res.json({
      success: true,
      fertig: !!server.appSettings.einrichtung?.fertig,
      spielGewaehlt: server.gameManager.chosen,
      adressen: server.lanAdressen(),
      verbunden: !!server.serial.getStatus().connected,
      controller: { id: p.id, name: p.name, kann: p.kann || {}, eingerichtet: cm().isEingerichtet(p.id), firmware: cm().state.info[p.id]?.firmware ?? null },
      vorschlag: server.einrichtungsVorschlag || null,
      kalibrierung: server.kalibrierStand()
    });
  });

  // Kalibrier-Stand frisch aus dem Gerät (GETALL caldone=), z. B. nach jedem „Speichern“ in der Achsen-Kalibrierung
  app.get('/api/einrichtung/kalibrierung', async (req, res) => {
    try {
      if (server.serial.getStatus().connected && cm().activeProfile.kann?.kalibrierung) {
        const g = await server.deviceConfigClient.getAll();
        if (g && 'caldone' in g) await cm().setCaldone(cm().activeId, g.caldone);
      }
    } catch { /* Gerät antwortet nicht: letzter bekannter Stand */ }
    res.json({ success: true, kalibrierung: server.kalibrierStand() });
  });

  // Assistent abgeschlossen oder beendet: Ersteinrichtung erledigt, der aktive Controller gilt als eingerichtet
  app.post('/api/einrichtung/fertig', handle(async () => {
    server.appSettings.einrichtung = { ...(server.appSettings.einrichtung || {}), fertig: true, am: new Date().toISOString() };
    await server.saveAppSettings();
    await cm().markEingerichtet(cm().activeId);
    server.einrichtungsVorschlag = null;
    geaendert();
  }));

  // Frage „Neuer Controller / nicht kalibriert“ beantwortet. ja: der Assistent übernimmt (die Frage verschwindet auf
  // allen Tablets). nein: merken -- neuer Controller gilt als eingerichtet, bei der Kalibrierung fragt ControlHub erst
  // wieder, wenn sich die offenen Achsen ändern.
  app.post('/api/einrichtung/vorschlag/:antwort', handle(async (req) => {
    const v = server.einrichtungsVorschlag;
    server.einrichtungsVorschlag = null;
    if (v && req.params.antwort === 'nein') {
      if (v.grund === 'neu') await cm().markEingerichtet(v.controller);
      else if (v.grund === 'kalibrierung') await cm().setHinweisAus(v.controller, v.signatur);
    }
    geaendert();
  }));
}
