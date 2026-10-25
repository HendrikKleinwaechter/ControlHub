/**
 * Routen: Module der Armlehne: Tastenlage/Hotspots, Übersicht, Ebenentaster, Widgets
 * Ausgelagert aus server/index.js (setupExpress) am 21.10.2026 -- Inhalt unverändert, nur `this` -> `server`.
 * @param {import('express').Express} app
 * @param {object} server  ControllerServer-Instanz (Manager, io, Hilfsmethoden)
 */
import express from 'express';
import path from 'path';
import { promises as fs, existsSync } from 'fs';
import { ASSETS_DIR } from '../paths.js';
import { MODULES } from '../config/modules.js';
import { buildModuleView } from '../deviceProfiles.js';

// Farbe der Armlehne (Hendrik 25.10.2026): Gibt es ein Bild als „<name>-<farbe>.png“ (z. B. craftslot1-schwarz.png),
// zeigt die Ansicht das, sonst das Standardbild (Fingertip-Modul: gleich in beiden Farben). Die Tastenfelder gelten für
// beide, die Bilder sind deckungsgleich.
export function bildInFarbe(bild, farbe, gibtEs = name => existsSync(path.join(ASSETS_DIR, 'module-layouts', name))) {
  if (typeof bild !== 'string' || !farbe || !/^[a-z]+$/.test(farbe)) return bild;
  const datei = path.posix.basename(bild);
  const farbig = datei.replace(/(\.[a-z0-9]+)$/i, `-${farbe}$1`);
  return farbig !== datei && gibtEs(farbig) ? bild.slice(0, bild.length - datei.length) + farbig : bild;
}

// Nur bekannte Module und Bildtypen werden zu Dateinamen (23.10.2026: vorher kamen ID und Endung ungeprüft aus der
// Anfrage, ein Import mit ../ hätte Dateien außerhalb des Bilder-Ordners überschreiben können). Bekannt = Modul der
// CraftConsole oder eines eigenen Controllers (<controller>--<modul>, nur Kleinbuchstaben/Ziffern/Bindestriche).
const builtinModule = id => MODULES.some(m => m.id === id);
const IMAGE_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

export function registerModulesRoutes(app, server) {
  const knownModule = id => builtinModule(id) || server.controllerManager.isLayoutId(id);
  // CraftSlot-Ebenentaster (global, Hardware/Ergonomie -- nicht pro Profil, s. Plan "Ebenenbelegung")
  app.get('/api/craftslot-layers', (req, res) => {
    res.json({ success: true, config: server.craftSlotLayerManager.getConfig() });
  });

  app.post('/api/craftslot-layers/:slotId/layer-button/:slot', async (req, res) => {
    try {
      const { slotId, slot } = req.params;
      const { buttonId } = req.body;
      await server.craftSlotLayerManager.setLayerButton(slotId, parseInt(slot, 10), buttonId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.delete('/api/craftslot-layers/:slotId/layer-button/:slot', async (req, res) => {
    try {
      const { slotId, slot } = req.params;
      await server.craftSlotLayerManager.clearLayerButton(slotId, parseInt(slot, 10));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Module-API (Bearbeiten-Flow: Übersicht -> Modul -> Taste -> Funktion). Seit den Geräteprofilen (23.10.2026) die
  // Module des AKTIVEN Controllers in Anzeige-Reihenfolge, mit sichtbaren Tasten (buttons) und Modulbild (layoutId);
  // ?alle=1 liefert alle Module mit eigenem Bild für die Modul-Kalibrierung (Für Entwickler).
  app.get('/api/modules', (req, res) => {
    const layouts = server.moduleLayoutManager.getAllLayouts();
    const list = req.query.alle ? server.controllerManager.allModulesForCalibration() : server.controllerManager.modules();
    const modules = list.map(m => ({
      ...m,
      hasImage: !!(layouts[m.layoutId || m.id] && layouts[m.layoutId || m.id].image)
    }));
    res.json({ success: true, modules, controller: server.controllerManager.activeId });
  });

  // Was die Tastenbelegung/Steuerungsübersicht für ein Modul des aktiven Controllers zeigt (23.10.2026): bei CraftSlots
  // Griff- und Unterbau-Bild zusammen (deviceProfiles.js buildModuleView), sonst das eine Modulbild
  app.get('/api/module-view/:id', (req, res) => {
    const mod = server.controllerManager.modules().find(m => m.id === req.params.id);
    if (!mod) return res.status(404).json({ success: false, error: 'Unbekanntes Modul' });
    const view = buildModuleView(mod, server.moduleLayoutManager.getAllLayouts());
    const cm = server.controllerManager, farbe = cm.farbe();
    if (farbe && farbe !== cm.activeProfile?.farben?.[0]?.id) {
      for (const t of view?.teile || []) if (t?.image) t.image = bildInFarbe(t.image, farbe);
    }
    res.json({ success: true, view });
  });

  app.get('/api/module-layout/:id', (req, res) => {
    const layout = server.moduleLayoutManager.getLayout(req.params.id);
    res.json({ success: true, layout });
  });

  app.post('/api/module-layout/:id/hotspot', async (req, res) => {
    try {
      const { button, axisKey, modeToggleKey, x, y, shape, width, height, rotation } = req.body;
      // button (number) / axisKey (string) / modeToggleKey (string, wird zu "toggle:<key>"), s. moduleLayoutManager.setHotspot()
      const target = modeToggleKey != null ? `toggle:${modeToggleKey}` : (axisKey != null ? axisKey : button);
      await server.moduleLayoutManager.setHotspot(req.params.id, target, x, y, shape, width, height, rotation);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Taste als in diesem Setup (nicht) verbaut markieren -- blendet sie in Kalibrierung + Modulübersicht
  // aus (Hendriks Vorgabe 21.08.2026: CraftSlots gelten immer als voll bestückt, aber nicht jeder
  // Griff nutzt alle 25 möglichen Tasten-/Achsen-Positionen -- die übrigen sollen nicht als Haufen
  // übereinanderliegender Hotspots angezeigt werden müssen).
  app.post('/api/module-layout/:id/button-visibility', async (req, res) => {
    try {
      const { button, visible } = req.body;
      await server.moduleLayoutManager.setButtonVisibility(req.params.id, button, visible);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Kappenfarbe eines Fingertips: { key: 'finger1'…'finger4', color: Farb-ID oder null }
  app.post('/api/module-layout/:id/cap-color', async (req, res) => {
    try {
      const { key, color } = req.body;
      await server.moduleLayoutManager.setCapColor(req.params.id, key, color || null);
      res.json({ success: true, capColors: server.moduleLayoutManager.getLayout(req.params.id).capColors || {} });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // Kalibrierung eines Moduls löschen (Hotspots zurücksetzen, Bild bleibt erhalten)
  app.delete('/api/module-layout/:id/hotspots', async (req, res) => {
    try {
      await server.moduleLayoutManager.clearHotspots(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Modul-Kalibrierung exportieren/importieren (25.08.2026, Hendriks Wunsch: dieselbe Griff-
  // Kalibrierung später auf einen anderen CraftSlot/Modul übertragen können, z.B. wenn ein Griff an
  // anderer Position eingebaut wird). Bündelt Bild (Base64, damit eine einzige Datei entsteht -- kein
  // ZIP-Mechanismus im Projekt) + Hotspots + disabledButtons in einem JSON. Das eigentliche Umrechnen
  // der Tastennummern auf das Zielmodul (Remapping) passiert bewusst NUR clientseitig
  // (buttonTest.js-artige UI) -- der Server kennt beim Import nur schon fertig umgerechnete Daten.
  app.get('/api/module-layout/:id/export', async (req, res) => {
    try {
      const moduleId = req.params.id;
      const layout = server.moduleLayoutManager.getLayout(moduleId);
      // auch Griff-/Unterbau-Bilder und Module eigener Controller (Liste der Modul-Kalibrierung)
      const mod = MODULES.find(m => m.id === moduleId) || server.controllerManager.allModulesForCalibration().find(m => m.id === moduleId);
      let image = null;
      if (layout.image) {
        try {
          const imagePath = path.join(ASSETS_DIR, 'module-layouts', path.basename(layout.image));
          const buf = await fs.readFile(imagePath);
          const ext = path.extname(imagePath).slice(1).toLowerCase();
          image = { mimeType: ext === 'jpg' ? 'image/jpeg' : `image/${ext}`, base64: buf.toString('base64') };
        } catch (err) {
          image = null; // Bilddatei fehlt auf der Platte -- Export laeuft trotzdem weiter, nur ohne Bild
        }
      }
      res.json({
        success: true,
        data: {
          version: '1.0',
          exportDate: new Date().toISOString(),
          sourceModuleId: moduleId,
          sourceModuleName: mod?.name || moduleId,
          sourceButtonRange: mod?.buttonRange || null,
          sourceAxisKeys: mod?.axisKeys || [],
          image,
          hotspots: layout.hotspots || [],
          disabledButtons: layout.disabledButtons || []
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/module-layout/:id/import', async (req, res) => {
    try {
      const moduleId = req.params.id;
      if (!knownModule(moduleId)) return res.status(400).json({ success: false, error: 'Unbekanntes Modul' });
      const { image, hotspots, disabledButtons } = req.body || {};
      if (image && typeof image.base64 === 'string' && image.base64) {
        const ext = IMAGE_EXT[image.mimeType || 'image/png'];
        if (!ext) return res.status(400).json({ success: false, error: 'Ungültiger Bildtyp' });
        const savedFilename = `${moduleId}.${ext}`;
        const imagePath = path.join(ASSETS_DIR, 'module-layouts', savedFilename);
        await fs.mkdir(path.dirname(imagePath), { recursive: true });
        await fs.writeFile(imagePath, Buffer.from(image.base64, 'base64'));
        // setImage() loescht hotspots als Nebenwirkung (neues Bild -> alte Prozent-Positionen ungueltig,
        // s. moduleLayoutManager.js) -- importLayout() gleich danach setzt die (bereits umgerechneten)
        // Hotspots wieder korrekt, Reihenfolge ist hier also bewusst wichtig.
        await server.moduleLayoutManager.setImage(moduleId, `/module-layouts/${savedFilename}`);
      }
      await server.moduleLayoutManager.importLayout(moduleId, { hotspots, disabledButtons });
      res.json({ success: true, layout: server.moduleLayoutManager.getLayout(moduleId) });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Modul-Bild hochladen (Kalibrierungs-Werkzeug)
  app.post('/api/module-layout/:id/image', express.raw({ type: 'image/*', limit: '10mb' }), async (req, res) => {
    try {
      if (!knownModule(req.params.id)) return res.status(400).json({ success: false, error: 'Unbekanntes Modul' });
      const contentType = req.headers['content-type'];
      const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
      if (!allowedTypes.includes(contentType)) {
        return res.status(400).json({ success: false, error: 'Ungültiger Dateityp. Nur Bilder erlaubt.' });
      }

      const ext = contentType.split('/')[1];
      const savedFilename = `${req.params.id}.${ext}`;
      const imagePath = path.join(ASSETS_DIR, 'module-layouts', savedFilename);
      await fs.mkdir(path.dirname(imagePath), { recursive: true });
      await fs.writeFile(imagePath, req.body);

      await server.moduleLayoutManager.setImage(req.params.id, `/module-layouts/${savedFilename}`);
      res.json({ success: true, image: `/module-layouts/${savedFilename}` });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Komplettübersichtsbild (Gesamtübersicht: Klickbild mit einem Hotspot pro Modul)
  app.get('/api/overview-layout', (req, res) => {
    const layout = server.moduleLayoutManager.getOverviewLayout();
    const cm = server.controllerManager, farbe = cm.farbe();
    const anzeige = farbe && farbe !== cm.activeProfile?.farben?.[0]?.id && layout?.image
      ? { ...layout, image: bildInFarbe(layout.image, farbe) } : layout;
    res.json({ success: true, layout: anzeige });
  });

  app.post('/api/overview-layout/hotspot', async (req, res) => {
    try {
      const { moduleId, x, y, shape, width, height, rotation } = req.body;
      await server.moduleLayoutManager.setOverviewHotspot(moduleId, x, y, shape, width, height, rotation);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.delete('/api/overview-layout/hotspots', async (req, res) => {
    try {
      await server.moduleLayoutManager.clearOverviewHotspots();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/overview-layout/image', express.raw({ type: 'image/*', limit: '10mb' }), async (req, res) => {
    try {
      const contentType = req.headers['content-type'];
      const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
      if (!allowedTypes.includes(contentType)) {
        return res.status(400).json({ success: false, error: 'Ungültiger Dateityp. Nur Bilder erlaubt.' });
      }

      const ext = contentType.split('/')[1];
      const savedFilename = `overview.${ext}`;
      const imagePath = path.join(ASSETS_DIR, 'module-layouts', savedFilename);
      await fs.mkdir(path.dirname(imagePath), { recursive: true });
      await fs.writeFile(imagePath, req.body);

      await server.moduleLayoutManager.setOverviewImage(`/module-layouts/${savedFilename}`);
      res.json({ success: true, image: `/module-layouts/${savedFilename}` });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

}
