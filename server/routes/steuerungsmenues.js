/**
 * Routen: Bedienpanel-Seiten (intern "steuerungsmenues"): Seiten, Tasten, Grafiken, Texte, Bilder
 * Ausgelagert aus server/index.js (setupExpress) am 21.10.2026 -- Inhalt unverändert, nur `this` -> `server`.
 * @param {import('express').Express} app
 * @param {object} server  ControllerServer-Instanz (Manager, io, Hilfsmethoden)
 */
import express from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import { ASSETS_DIR } from '../paths.js';
import { bilderEinbetten, bilderUebernehmen } from '../kachelBilder.js';

export function registerSteuerungsmenuesRoutes(app, server) {
  // Jede erfolgreiche Änderung an Kacheln allen Geräten melden (23.10.2026) -- vorher kannte ein Tablet eine am PC
  // angelegte Kachel erst nach dem Neuladen („Kachel fehlt“)
  app.use(['/api/steuerungsmenue', '/api/steuerungsmenues'], (req, res, next) => {
    if (req.method !== 'GET') res.on('finish', () => { if (res.statusCode < 400) server.io.emit('steuerungsmenues-changed'); });
    next();
  });

  // Steuerungsmenüs (frei anlegbare Tasten-Seiten -- Struktur jetzt, Funktions-Zuordnung je Taste
  // kommt bewusst erst in einem späteren Schritt, s. Plan)
  app.get('/api/steuerungsmenues', (req, res) => {
    res.json({ success: true, pages: server.steuerungsmenuesManager.getAllPages() });
  });

  app.post('/api/steuerungsmenue/create', async (req, res) => {
    try {
      const page = await server.steuerungsmenuesManager.createPage(req.body.name);
      res.json({ success: true, page });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Seite aus Vorlage (21.10.2026) -- body: { template: 'licht', name? }
  // Vorlagen für „+ Neue Kachel“ (nur die, die es im Spiel gibt: ohne Spieldaten nur die Steuerungsübersicht)
  app.get('/api/steuerungsmenue/templates', (req, res) => {
    const features = server.gameManager.get(server.gameManager.activeId)?.features || [];
    res.json({ success: true, templates: server.steuerungsmenuesManager.templateList(features) });
  });

  app.post('/api/steuerungsmenue/:id/reset', async (req, res) => {
    try {
      const page = await server.steuerungsmenuesManager.resetToTemplate(req.params.id);
      res.json({ success: true, page });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/steuerungsmenue/create-from-template', async (req, res) => {
    try {
      const page = await server.steuerungsmenuesManager.createPageFromTemplate(req.body?.template, req.body?.name);
      res.json({ success: true, page });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.delete('/api/steuerungsmenue/:id', async (req, res) => {
    try {
      await server.steuerungsmenuesManager.deletePage(req.params.id);
      if (await server.kachelnManager?.removeTile(`panel:${req.params.id}`)) server.io.emit('kacheln-changed', server.kachelnManager.get());
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/steuerungsmenues/reorder', async (req, res) => {
    try {
      await server.steuerungsmenuesManager.reorderPages(req.body.order || []);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/steuerungsmenue/:id/button', async (req, res) => {
    try {
      const { page, button } = await server.steuerungsmenuesManager.addButtonSlot(req.params.id);
      res.json({ success: true, page, button });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.put('/api/steuerungsmenue/:id/button/:buttonId', async (req, res) => {
    try {
      const { page, button } = await server.steuerungsmenuesManager.updateButton(req.params.id, req.params.buttonId, req.body || {});
      res.json({ success: true, page, button });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.delete('/api/steuerungsmenue/:id/button/:buttonId', async (req, res) => {
    try {
      const page = await server.steuerungsmenuesManager.removeButton(req.params.id, req.params.buttonId);
      res.json({ success: true, page });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Bedienpanel-Hintergrundbild hochladen/entfernen (Muster wie /api/module-layout/:id/image)
  app.post('/api/steuerungsmenue/:id/background', express.raw({ type: 'image/*', limit: '10mb' }), async (req, res) => {
    try {
      const contentType = req.headers['content-type'];
      const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
      if (!allowedTypes.includes(contentType)) {
        return res.status(400).json({ success: false, error: 'Ungültiger Dateityp. Nur Bilder erlaubt.' });
      }

      // erst prüfen, dann schreiben: die ID wird zum Dateinamen (23.10.2026)
      if (!server.steuerungsmenuesManager.getPage(req.params.id)) return res.status(404).json({ success: false, error: 'Kachel nicht gefunden' });
      const ext = contentType.split('/')[1];
      // Je Spiel ein Unterordner (Phase 2): Seiten-IDs wiederholen sich zwischen Spielen
      const savedFilename = `${path.basename(req.params.id)}.${ext}`;
      const gameId = server.gameManager.activeId;
      const imagePath = path.join(ASSETS_DIR, 'steuerungsmenue-bg', gameId, savedFilename);
      await fs.mkdir(path.dirname(imagePath), { recursive: true });
      await fs.writeFile(imagePath, req.body);

      const webPath = `/steuerungsmenue-bg/${gameId}/${savedFilename}`;
      const page = await server.steuerungsmenuesManager.setBackground(req.params.id, webPath);
      res.json({ success: true, background: webPath, page });   // page: der Editor übernimmt den neuen Stand
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.delete('/api/steuerungsmenue/:id/background', async (req, res) => {
    try {
      const page = await server.steuerungsmenuesManager.clearBackground(req.params.id);
      res.json({ success: true, page });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.put('/api/steuerungsmenue/:id/settings', async (req, res) => {
    try {
      const page = await server.steuerungsmenuesManager.updatePageSettings(req.params.id, req.body || {});
      res.json({ success: true, page });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.put('/api/steuerungsmenue/:id/name', async (req, res) => {
    try {
      const page = await server.steuerungsmenuesManager.renamePage(req.params.id, req.body?.name);
      res.json({ success: true, page });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Grafik-Elemente (rein visuell) -- Muster 1:1 wie die Tasten-Routen oben.
  app.post('/api/steuerungsmenue/:id/graphic', async (req, res) => {
    try {
      const { page, graphic } = await server.steuerungsmenuesManager.addGraphic(req.params.id);
      res.json({ success: true, page, graphic });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/steuerungsmenue/:id/graphic/:graphicId/image', express.raw({ type: 'image/*', limit: '10mb' }), async (req, res) => {
    try {
      const contentType = req.headers['content-type'];
      const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
      if (!allowedTypes.includes(contentType)) {
        return res.status(400).json({ success: false, error: 'Ungültiger Dateityp. Nur Bilder erlaubt.' });
      }
      // erst prüfen, dann schreiben: die ID wird zum Dateinamen (23.10.2026)
      const owner = server.steuerungsmenuesManager.getPage(req.params.id);
      if (!owner || !(owner.graphics || []).some(g => g.id === req.params.graphicId)) return res.status(404).json({ success: false, error: 'Grafik nicht gefunden' });
      const ext = contentType.split('/')[1];
      const savedFilename = `${path.basename(req.params.graphicId)}.${ext}`;
      const gameId = server.gameManager.activeId;
      const imagePath = path.join(ASSETS_DIR, 'steuerungsmenue-graphics', gameId, savedFilename);
      await fs.mkdir(path.dirname(imagePath), { recursive: true });
      await fs.writeFile(imagePath, req.body);

      const webPath = `/steuerungsmenue-graphics/${gameId}/${savedFilename}`;
      const { page, graphic } = await server.steuerungsmenuesManager.setGraphicImage(req.params.id, req.params.graphicId, webPath);
      res.json({ success: true, page, graphic });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.put('/api/steuerungsmenue/:id/graphic/:graphicId', async (req, res) => {
    try {
      const { page, graphic } = await server.steuerungsmenuesManager.updateGraphic(req.params.id, req.params.graphicId, req.body || {});
      res.json({ success: true, page, graphic });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.delete('/api/steuerungsmenue/:id/graphic/:graphicId', async (req, res) => {
    try {
      const page = await server.steuerungsmenuesManager.removeGraphic(req.params.id, req.params.graphicId);
      res.json({ success: true, page });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Text-Elemente (frei stehender Textzug).
  app.post('/api/steuerungsmenue/:id/text', async (req, res) => {
    try {
      const { page, text } = await server.steuerungsmenuesManager.addText(req.params.id);
      res.json({ success: true, page, text });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.put('/api/steuerungsmenue/:id/text/:textId', async (req, res) => {
    try {
      const { page, text } = await server.steuerungsmenuesManager.updateText(req.params.id, req.params.textId, req.body || {});
      res.json({ success: true, page, text });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.delete('/api/steuerungsmenue/:id/text/:textId', async (req, res) => {
    try {
      const page = await server.steuerungsmenuesManager.removeText(req.params.id, req.params.textId);
      res.json({ success: true, page });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Einzelnes Bedienpanel exportieren/importieren (Muster wie Profil-Export/Import)
  // Anzeigen mit Spielwerten (Paket J)
  app.post('/api/steuerungsmenue/:id/display', async (req, res) => {
    try {
      const { page, display } = await server.steuerungsmenuesManager.addDisplay(req.params.id, req.body || {});
      res.json({ success: true, page, display });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.put('/api/steuerungsmenue/:id/display/:displayId', async (req, res) => {
    try {
      const { page, display } = await server.steuerungsmenuesManager.updateDisplay(req.params.id, req.params.displayId, req.body || {});
      res.json({ success: true, page, display });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.delete('/api/steuerungsmenue/:id/display/:displayId', async (req, res) => {
    try {
      const page = await server.steuerungsmenuesManager.removeDisplay(req.params.id, req.params.displayId);
      res.json({ success: true, page });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Baustein-Elemente: eingebaute Bausteine in eigenen Bausteinen (22.10.2026)
  app.post('/api/steuerungsmenue/:id/embed', async (req, res) => {
    try {
      const { page, embed } = await server.steuerungsmenuesManager.addEmbed(req.params.id, req.body || {});
      res.json({ success: true, page, embed });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.put('/api/steuerungsmenue/:id/embed/:embedId', async (req, res) => {
    try {
      const { page, embed } = await server.steuerungsmenuesManager.updateEmbed(req.params.id, req.params.embedId, req.body || {});
      res.json({ success: true, page, embed });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.delete('/api/steuerungsmenue/:id/embed/:embedId', async (req, res) => {
    try {
      const page = await server.steuerungsmenuesManager.removeEmbed(req.params.id, req.params.embedId);
      res.json({ success: true, page });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Anordnung je Kachelform (22.10.2026): ganze Form setzen/anlegen, ein Element ändern, Form wieder automatisch
  // Kachel-Editor: ganzen Inhalt speichern -- body: { buttons, graphics, texts, displays, embeds, varianten, layers, groups, gridSize, fineGridSize }
  app.put('/api/steuerungsmenue/:id/inhalt', async (req, res) => {
    try {
      const page = await server.steuerungsmenuesManager.replaceContent(req.params.id, req.body || {});
      res.json({ success: true, page });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.put('/api/steuerungsmenue/:id/variante/:v', async (req, res) => {
    try {
      const page = await server.steuerungsmenuesManager.setVariant(req.params.id, req.params.v, req.body?.elements);
      res.json({ success: true, page });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.put('/api/steuerungsmenue/:id/variante/:v/:elementId', async (req, res) => {
    try {
      const { page, geom } = await server.steuerungsmenuesManager.updateVariantElement(req.params.id, req.params.v, req.params.elementId, req.body || {});
      res.json({ success: true, page, geom });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.delete('/api/steuerungsmenue/:id/variante/:v', async (req, res) => {
    try {
      const page = await server.steuerungsmenuesManager.removeVariant(req.params.id, req.params.v);
      res.json({ success: true, page });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Bilder (Hintergrund, Grafiken) kommen mit in die Datei (24.10.2026, server/kachelBilder.js)
  app.get('/api/steuerungsmenue/:id/export', async (req, res) => {
    try {
      const data = server.steuerungsmenuesManager.exportPage(req.params.id);
      data.bilder = await bilderEinbetten(data, { assetsDir: ASSETS_DIR });
      res.json({ success: true, page: data });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/steuerungsmenue/import', async (req, res) => {
    try {
      const page = await server.steuerungsmenuesManager.importPage(req.body);
      if (await bilderUebernehmen(page, req.body?.bilder, { assetsDir: ASSETS_DIR, gameId: server.gameManager.activeId })) await server.steuerungsmenuesManager.save();
      res.json({ success: true, page });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
}
