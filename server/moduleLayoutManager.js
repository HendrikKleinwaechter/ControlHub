/**
 * Verwaltet die Draufsicht-Bilder + Tasten-Hotspots pro Modul (für die Detailansicht
 * im Bearbeiten-Flow: Übersicht -> Modul -> Taste -> Funktion).
 * Ein Hotspot ist die x/y-Position (in Prozent der Bildgröße, 0-100) einer physischen
 * Taste auf dem Modulbild -- responsiv, unabhängig von der tatsächlichen Bildauflösung.
 */
import path from 'path';
import { readJsonFile, writeJsonAtomic } from './jsonStore.js';
import { fileURLToPath } from 'url';
import { MODULES } from './config/modules.js';

// Farb-IDs wie die Tastenfarben im Editor (public/js/steuerungsmenues.js SM_BUTTON_COLORS)
const CAP_COLOR_IDS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'white', 'gray', 'black'];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ModuleLayoutManager {
  constructor(layoutsPath = path.join(__dirname, 'config', 'moduleLayouts.json'), vorgabenPath = null) {
    this.layoutsPath = layoutsPath;
    this.vorgabenPath = vorgabenPath;   // vorgaben/config/moduleLayouts.json: fehlende bzw. leere Layouts daraus ergänzen
    this.layouts = {};
    for (const mod of MODULES) {
      this.layouts[mod.id] = { image: null, hotspots: [], disabledButtons: [] };
    }
  }

  async initialize() {
    // Lesen über jsonStore (23.10.2026): kaputte Datei als .defekt gesichert (notfalls .bak) -- erst dann neu anlegen
    const { data: loaded, status } = await readJsonFile(this.layoutsPath, { fallback: null });
    if (status === 'ok' || status === 'restored') {
      // Merge statt Ersetzen: falls MODULES künftig erweitert wird, behalten neue Module einen Default-Eintrag
      this.layouts = { ...this.layouts, ...loaded };
    } else {
      console.log(status === 'broken'
        ? 'Modul-Layout-Daten beschädigt, erstelle neue Datei'
        : 'Keine Modul-Layout-Daten gefunden, erstelle neue Datei');
      await this.save();
    }
    // Aeltere moduleLayouts.json-Stände kennen `disabledButtons` noch nicht (Feld kam erst 21.08.2026
    // dazu, s. "Modulkalibrierung"-Sichtbarkeitsliste) -- fehlendes Feld hier einmalig nachruesten,
    // damit getLayout() nie mit undefined statt einem leeren Array antwortet.
    for (const id of Object.keys(this.layouts)) {
      if (!Array.isArray(this.layouts[id].disabledButtons)) this.layouts[id].disabledButtons = [];
    }
    if (this.fixThumbHotspots() | await this.vorgabenErgaenzen()) await this.save();
  }

  // Neue Layouts ab Werk auch in vorhandene Installationen (25.10.2026: Griff-Bilder griff-<id> und die Unterbau-Gruppe
  // statt der Bilder je CraftSlot). Nur, wo es das Layout noch nicht gibt oder es leer ist (kein Bild, keine Felder) --
  // eine eigene Kalibrierung wird nie überschrieben. Ergebnis: true, wenn etwas dazukam.
  async vorgabenErgaenzen() {
    if (!this.vorgabenPath) return false;
    const { data: vorgaben, status } = await readJsonFile(this.vorgabenPath, { fallback: null });
    if (status !== 'ok' || !vorgaben || typeof vorgaben !== 'object') return false;
    let neu = false;
    for (const [id, lay] of Object.entries(vorgaben)) {
      const cur = this.layouts[id];
      if (lay && typeof lay === 'object' && (!cur || (!cur.image && !(cur.hotspots || []).length))) {
        this.layouts[id] = { disabledButtons: [], ...structuredClone(lay) };
        neu = true;
      }
    }
    return neu;
  }

  // Stick-als-Taste (24.10.2026): Laut Firmware ist 21 = links, 22 = rechts, 23 = hoch, 24 = runter (CraftSlot 2: 106–109),
  // im mitgelieferten Bild standen die Punkte als hoch/runter/links/rechts. Umgestellt wird nur, wenn ein Punkt noch genau
  // an der alten Stelle steht -- selbst verschobene Punkte bleiben, wie sie sind. Ergebnis: true, wenn etwas geändert wurde.
  fixThumbHotspots() {
    const ALT = {
      craftslot1: [[21, 60.7, 17.6, 23], [22, 60.7, 28.8, 24], [23, 56.1, 23, 21], [24, 65, 23.3, 22]],
      craftslot2: [[106, 57, 11, 108], [107, 56.9, 21.4, 109], [108, 53, 16, 106], [109, 60.4, 16.2, 107]]
    };
    let geaendert = false;
    for (const [id, regeln] of Object.entries(ALT)) {
      const hs = this.layouts[id]?.hotspots || [];
      const treffer = regeln.map(([b, x, y, neu]) => ({ h: hs.find(h => h.button === b && h.x === x && h.y === y), neu }));
      if (treffer.some(t => !t.h)) continue;   // nur alle vier zusammen, sonst passt die Lage nicht mehr zur alten Vorgabe
      for (const t of treffer) t.h.button = t.neu;
      geaendert = true;
    }
    return geaendert;
  }

  async save() {
    await writeJsonAtomic(this.layoutsPath, this.layouts); // atomar + .bak (23.10.2026)
  }

  getLayout(moduleId) {
    return this.layouts[moduleId] || { image: null, hotspots: [], disabledButtons: [] };
  }

  // Markiert eine Taste als in diesem Setup (nicht) verbaut -- rein für Anzeige/Kalibrierung, keine
  // Firmware-Auswirkung. Hotspot-Daten bleiben beim Ausblenden erhalten (nur gefiltert, nicht gelöscht),
  // damit ein späteres Wieder-Einblenden nichts neu kalibrieren muss.
  async setButtonVisibility(moduleId, button, visible) {
    if (!this.layouts[moduleId]) this.layouts[moduleId] = { image: null, hotspots: [], disabledButtons: [] };
    const layout = this.layouts[moduleId];
    if (!Array.isArray(layout.disabledButtons)) layout.disabledButtons = [];
    layout.disabledButtons = layout.disabledButtons.filter(b => b !== button);
    if (!visible) layout.disabledButtons.push(button);
    await this.save();
  }

  getAllLayouts() {
    return this.layouts;
  }

  // Kappenfarbe je Fingertip (Hendrik 23.10.2026: es gibt unterschiedlich gefärbte Kappen, der Kunde wählt die Farbe
  // selbst). Rein für die Anzeige: ein farbiger Ring um die Tasten dieses Fingertips im Modulbild. color = Farb-ID wie bei
  // den Tasten (s. SM_BUTTON_COLORS) oder null = kein Ring.
  async setCapColor(moduleId, key, color) {
    const mod = MODULES.find(m => m.id === moduleId);
    if (!mod?.axisKeys?.includes(key) || !/^finger\d$/.test(key)) throw new Error('Unbekannter Fingertip');
    if (color != null && !CAP_COLOR_IDS.includes(color)) throw new Error('Unbekannte Farbe');
    if (!this.layouts[moduleId]) this.layouts[moduleId] = { image: null, hotspots: [], disabledButtons: [] };
    const caps = { ...(this.layouts[moduleId].capColors || {}) };
    if (color) caps[key] = color; else delete caps[key];
    if (Object.keys(caps).length) this.layouts[moduleId].capColors = caps; else delete this.layouts[moduleId].capColors;
    await this.save();
  }

  async setImage(moduleId, imagePath) {
    if (!this.layouts[moduleId]) this.layouts[moduleId] = { image: null, hotspots: [] };
    this.layouts[moduleId].image = imagePath;
    this.layouts[moduleId].hotspots = []; // altes Bild ersetzt -> alte Prozent-Positionen sind ungültig
    await this.save();
  }

  // `target` ist eine Tastennummer (number, wie bisher), ein Achsen-Key (string, z.B. "thumbX") oder
  // ein Achse/Taste-Umschalter-Key mit "toggle:"-Präfix (string, z.B. "toggle:leverA", 21.08.2026
  // ergänzt -- eigener platzierbarer Hotspot für den Modus-Umschalter selbst, s. moduleFlow.js
  // AXIS_MODE_CONFIG). Ein Hotspot trägt entsprechend genau eins von `button`/`axisKey`/`modeToggleKey`.
  async setHotspot(moduleId, target, x, y, shape = 'circle', width = 6, height = 6, rotation = 0) {
    if (!this.layouts[moduleId]) this.layouts[moduleId] = { image: null, hotspots: [] };
    const hotspots = this.layouts[moduleId].hotspots;
    let matchFn, entry;
    if (typeof target === 'number') {
      matchFn = h => h.button === target;
      entry = { button: target, x, y, shape, width, height, rotation };
    } else if (target.startsWith('toggle:')) {
      const axisKey = target.slice('toggle:'.length);
      matchFn = h => h.modeToggleKey === axisKey;
      entry = { modeToggleKey: axisKey, x, y, shape, width, height, rotation };
    } else {
      matchFn = h => h.axisKey === target;
      entry = { axisKey: target, x, y, shape, width, height, rotation };
    }
    const existing = hotspots.find(matchFn);
    if (existing) {
      existing.x = x; existing.y = y; existing.shape = shape; existing.width = width; existing.height = height; existing.rotation = rotation;
    } else {
      hotspots.push(entry);
    }
    await this.save();
  }

  async clearHotspots(moduleId) {
    if (!this.layouts[moduleId]) return;
    this.layouts[moduleId].hotspots = [];
    await this.save();
  }

  // Ersetzt Hotspots + disabledButtons eines Moduls komplett (Modul-Import, 25.08.2026, Hendriks
  // Wunsch: kalibrierte Module exportieren/importieren, z.B. um dieselbe Griff-Kalibrierung auf einen
  // anderen CraftSlot zu übertragen). Bewusst ein direktes Ersetzen statt Merge über setHotspot()-
  // Aufrufe -- der Client hat die Tastennummern bereits auf das Ziel-Modul umgerechnet (Remapping-UI),
  // hier gibt es nichts mehr zusammenzuführen. Das Bild wird separat über setImage() gesetzt.
  async importLayout(moduleId, { hotspots, disabledButtons }) {
    if (!this.layouts[moduleId]) this.layouts[moduleId] = { image: null, hotspots: [], disabledButtons: [] };
    this.layouts[moduleId].hotspots = Array.isArray(hotspots) ? hotspots : [];
    this.layouts[moduleId].disabledButtons = Array.isArray(disabledButtons) ? disabledButtons : [];
    await this.save();
  }

  // Komplettübersichtsbild: gleiche Persistenz, reservierter Zusatz-Schlüssel 'overview'
  // (taucht in getAllLayouts() für /api/modules nie auf, da dort über das feste MODULES-Array iteriert wird)
  getOverviewLayout() {
    return this.layouts['overview'] || { image: null, hotspots: [] };
  }

  async setOverviewImage(imagePath) {
    if (!this.layouts['overview']) this.layouts['overview'] = { image: null, hotspots: [] };
    this.layouts['overview'].image = imagePath;
    this.layouts['overview'].hotspots = [];
    await this.save();
  }

  async setOverviewHotspot(moduleId, x, y, shape = 'circle', width = 6, height = 6, rotation = 0) {
    if (!this.layouts['overview']) this.layouts['overview'] = { image: null, hotspots: [] };
    const hotspots = this.layouts['overview'].hotspots;
    const existing = hotspots.find(h => h.moduleId === moduleId);
    if (existing) {
      existing.x = x; existing.y = y; existing.shape = shape; existing.width = width; existing.height = height; existing.rotation = rotation;
    } else {
      hotspots.push({ moduleId, x, y, shape, width, height, rotation });
    }
    await this.save();
  }

  async clearOverviewHotspots() {
    if (!this.layouts['overview']) return;
    this.layouts['overview'].hotspots = [];
    await this.save();
  }
}
