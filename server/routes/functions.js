/**
 * Routen: Funktionsbibliothek, Kategorien/Gruppen, Icons, inputBinding.xml-Import
 * Ausgelagert aus server/index.js (setupExpress) am 21.10.2026 -- Inhalt unverändert, nur `this` -> `server`.
 * @param {import('express').Express} app
 * @param {object} server  ControllerServer-Instanz (Manager, io, Hilfsmethoden)
 */
import express from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import crypto from 'crypto';
import { ASSETS_DIR } from '../paths.js';
import { parseInputBindingXml } from '../inputBindingImporter.js';
import { leseSpielAktionen, leseModAktionen, modsOrdner } from '../modAktionen.js';
import { MAIN_BUTTON_COUNT } from '../config/modules.js';
import { ALL_RESERVED_GAMEPAD_BUTTONS } from '../craftSlotLayerManager.js';
import { neuEinlesen } from '../funktionenEinlesen.js';

export function registerFunctionsRoutes(app, server) {
  // Functions-API
  app.get('/api/functions', (req, res) => {
    const functions = server.functionsManager.getAllFunctions();
    res.json({
      success: true,
      functions,
      categories: server.functionsManager.getCategories(),
      protectedCategories: server.functionsManager.getProtectedCategories(),
      // für den Funktions-Editor (Gamepad-Tasten 1–128 ohne die Ebenentaster-Tasten, Durchsicht B1)
      gamepadButtonCount: MAIN_BUTTON_COUNT,
      reservedGamepadButtons: ALL_RESERVED_GAMEPAD_BUTTONS
    });
  });

  app.get('/api/functions/category/:category', (req, res) => {
    const functions = server.functionsManager.getFunctionsByCategory(req.params.category);
    res.json({ success: true, functions });
  });

  app.post('/api/function/save', async (req, res) => {
    try {
      const { id, function: functionData } = req.body;
      await server.functionsManager.setFunction(id, functionData);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Wo wird die Funktion benutzt? (Durchsicht B2) -- die Oberfläche zeigt das vor dem Löschen
  app.get('/api/function/:id/verwendung', async (req, res) => {
    try {
      res.json({ success: true, funde: await server.verwendungen(req.params.id) });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Löschen; ?belegungen=entfernen nimmt die Funktion vorher aus allen Belegungen (Tasten, Makros, Kacheln, GPS …)
  app.delete('/api/function/:id', async (req, res) => {
    try {
      const id = req.params.id;
      if (id === 'func-macro-abort' || id.startsWith('func-basicgamepad-')) {
        return res.status(400).json({ success: false, error: 'Systemfunktionen lassen sich nicht löschen – ControlHub legt sie beim nächsten Start ohnehin wieder an.' });
      }
      if (!server.functionsManager.getFunction(id)) return res.status(404).json({ success: false, error: 'Funktion nicht gefunden' });
      const entfernt = req.query.belegungen === 'entfernen' ? await server.verwendungen(id, { entfernen: true }) : [];
      await server.functionsManager.deleteFunction(id);
      res.json({ success: true, entfernt: entfernt.length });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Entwickler-Werkzeug: alle Funktionen (+ Kategorien) auf einen sauberen Stand zurücksetzen,
  // um Importe leichter überprüfen zu können.
  app.delete('/api/functions', async (req, res) => {
    try {
      await server.functionsManager.deleteAllFunctions();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/functions/export', (req, res) => {
    const data = server.functionsManager.exportFunctions();
    res.json({ success: true, data });
  });

  app.post('/api/functions/import', async (req, res) => {
    try {
      const { data, mode } = req.body;
      await server.functionsManager.importFunctions(data, mode || 'merge');
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // FS25 inputBinding.xml direkt importieren (Rohtext-Body, kein JSON) -- ersetzt den bisherigen
  // Umweg über ein externes Skript + manuellen JSON-Import.
  app.post('/api/functions/import-xml', express.text({ type: ['text/xml', 'application/xml', '*/*'], limit: '2mb' }), async (req, res) => {
    try {
      const mode = req.query.mode || 'merge';
      // Gruppen wie im Spiel und je Mod (24.10.2026): beides liest der Server selbst vom PC. Fehlt etwas
      // (Spiel nicht auf diesem PC, Mod-Liste noch nicht geschrieben), gelten die eigenen Gruppen.
      const spiel = await leseSpielAktionen().catch(() => null);
      const mods = await leseModAktionen(await modsOrdner()).catch(() => null);
      const { functions, count, ausSpiel, ausMods } = parseInputBindingXml(req.body, { spiel, mods });
      await server.functionsManager.importFunctions({ functions }, mode);
      res.json({ success: true, count, ausSpiel, ausMods, spielListe: !!spiel, modsGelesen: mods?.mods || 0 });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Aus dem Spiel neu einlesen (24.10.2026): inputBinding.xml und Mods-Ordner direkt vom PC, eigene Änderungen bleiben
  app.post('/api/functions/neu-einlesen', async (req, res) => {
    try {
      res.json({ success: true, ...(await neuEinlesen(server.functionsManager)) });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Kategorien-Verwaltung (unabhängig von Funktionen bearbeitbar -- anlegen/umbenennen/löschen)
  app.post('/api/categories/create', async (req, res) => {
    try {
      const { name } = req.body;
      await server.functionsManager.createCategory(name);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/categories/rename', async (req, res) => {
    try {
      const { oldName, newName } = req.body;
      await server.functionsManager.renameCategory(oldName, newName);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.delete('/api/categories/:name', async (req, res) => {
    try {
      await server.functionsManager.deleteCategory(req.params.name, { funktionen: req.query.funktionen === 'behalten' ? 'behalten' : 'loeschen' });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Vorschau vor dem Löschen einer Gruppe (für die doppelte Nachfrage im Client): welche Funktionen
  // würden komplett gelöscht (waren nur in dieser Gruppe) vs. nur diese Zugehörigkeit verlieren.
  app.get('/api/categories/:name/deletion-impact', (req, res) => {
    const { toDelete, toDetach } = server.functionsManager.getDeletionImpact(req.params.name);
    res.json({ success: true, toDelete: toDelete.map(f => f.name), toDetach: toDetach.map(f => f.name) });
  });

  // Gruppenreihenfolge neu sortieren (rein die Anzeige-Reihenfolge)
  app.post('/api/categories/reorder', async (req, res) => {
    try {
      const { order } = req.body;
      await server.functionsManager.reorderCategories(order);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Icon Upload
  app.post('/api/function/upload-icon', express.raw({ type: 'image/*', limit: '2mb' }), async (req, res) => {
    try {
      const contentType = req.headers['content-type'];
      const filename = req.headers['x-filename'] || 'icon';

      // Validiere Bild-Typ
      const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(contentType)) {
        return res.status(400).json({ success: false, error: 'Ungültiger Dateityp. Nur Bilder erlaubt.' });
      }

      // Generiere eindeutigen Dateinamen
      const ext = contentType.split('/')[1];
      const hash = crypto.randomBytes(8).toString('hex');
      const savedFilename = `${filename.replace(/[^a-z0-9-]/gi, '_')}_${hash}.${ext}`;

      // Speichere Datei
      const iconPath = path.join(ASSETS_DIR, 'function-icons', savedFilename);
      await fs.mkdir(path.dirname(iconPath), { recursive: true });
      await fs.writeFile(iconPath, req.body);

      res.json({ success: true, filename: savedFilename });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Icon löschen
  app.delete('/api/function/icon/:filename', async (req, res) => {
    try {
      // nur ein Dateiname aus dem Symbol-Ordner (23.10.2026: vorher ließ sich mit ../ jede Datei löschen)
      const name = path.basename(String(req.params.filename || ''));
      if (!/^[\w-]+\.(png|jpe?g|gif|webp)$/i.test(name)) return res.status(400).json({ success: false, error: 'Ungültiger Dateiname' });
      const iconPath = path.join(ASSETS_DIR, 'function-icons', name);
      await fs.unlink(iconPath);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
}
