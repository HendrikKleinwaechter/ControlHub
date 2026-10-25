/**
 * Verwaltet, welche physischen Tasten pro CraftSlot als "Ebenentaster" (Shift-Modifier) dienen.
 * Global wie die Achsen-Kalibrierung -- betrifft die Ergonomie/Hardware, nicht ein einzelnes
 * Fahrzeug/Profil (die eigentlichen Ebenen-Belegungen je Funktion liegen dagegen in profile.
 * craftSlotLayers, s. mappingEngine.js).
 */

import path from 'path';
import { readJsonFile, writeJsonAtomic } from './jsonStore.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Feste, für Ebenensignale reservierte Gamepad-Ausgabe-Tasten -- bewusst keine Auswahl-UI, damit sie
// nie mit normalen Funktionsbelegungen kollidieren können (s. FunctionsManager.setFunction()).
// Waren bis 25.08.2026 96-99 (0-basiert) -- das lag bei der alten ~100-Tasten-Zählung in einer nie
// benutzten Lücke, kollidierte aber seit der Tasten-Neunummerierung (Schritt 2, 24.08.2026, CraftSlot2
// auf physisch 86-114 verschoben) mit den echten CraftSlot2-Grip-Tasten 97-100 (0-basiert 96-99).
// Verschoben auf 114-117 (0-basiert) = physisch 115-118 -- explizit freie Reserve laut Firmware
// (CraftConsolePro_Pico.ino BTN_*-Kommentar: "115..126 bewusst frei").
export const RESERVED_GAMEPAD_BUTTONS = {
  craftslot1: { layerButton1: 114, layerButton2: 115 },
  craftslot2: { layerButton1: 116, layerButton2: 117 }
};

export const ALL_RESERVED_GAMEPAD_BUTTONS = [114, 115, 116, 117];

const DEFAULT_CONFIG = {
  craftslot1: { layerButton1: null, layerButton2: null },
  craftslot2: { layerButton1: null, layerButton2: null }
};

export class CraftSlotLayerManager {
  constructor(configPath = path.join(__dirname, 'config', 'craftSlotLayers.json')) {
    this.configPath = configPath;
    this.config = structuredClone(DEFAULT_CONFIG);
  }

  async initialize() {
    // Lesen über jsonStore (23.10.2026): kaputte Datei als .defekt gesichert (notfalls .bak) -- erst dann neu anlegen
    const { data, status } = await readJsonFile(this.configPath, { fallback: null });
    if (status === 'ok' || status === 'restored') {
      this.config = { ...structuredClone(DEFAULT_CONFIG), ...data };
    } else {
      console.log(status === 'broken'
        ? 'CraftSlot-Ebenen-Konfiguration beschädigt, erstelle neue Datei'
        : 'Keine CraftSlot-Ebenen-Konfiguration gefunden, erstelle neue Datei');
      await this.save();
    }
  }

  async save() {
    await writeJsonAtomic(this.configPath, this.config); // atomar + .bak (23.10.2026)
  }

  getConfig() {
    return this.config;
  }

  /**
   * @param {string} slotId - 'craftslot1' | 'craftslot2'
   * @param {number} buttonId - 0-basierte Tasten-ID (wie in profile.buttons), relativ zum CraftSlot geprüft vom Aufrufer
   * @param {1|2} slotNum - welcher der zwei Ebenentaster
   */
  async setLayerButton(slotId, slotNum, buttonId) {
    if (!this.config[slotId]) throw new Error('Unbekannter CraftSlot: ' + slotId);
    if (slotNum === 2 && this.config[slotId].layerButton1 == null) {
      throw new Error('Ebenentaster 1 muss zuerst zugeordnet werden');
    }
    this.config[slotId][`layerButton${slotNum}`] = buttonId;
    await this.save();
  }

  async clearLayerButton(slotId, slotNum) {
    if (!this.config[slotId]) throw new Error('Unbekannter CraftSlot: ' + slotId);
    this.config[slotId][`layerButton${slotNum}`] = null;
    // Ebenentaster 1 löschen räumt auch Ebenentaster 2 mit -- sonst wäre 2 gesetzt, ohne dass 1 es ist
    // (Ebene III/IV wären dann nie mehr erreichbar, aber die Zuordnung bliebe unsichtbar bestehen).
    if (slotNum === 1) this.config[slotId].layerButton2 = null;
    await this.save();
  }

  getReservedGamepadButton(slotId, slotNum) {
    return RESERVED_GAMEPAD_BUTTONS[slotId]?.[`layerButton${slotNum}`] ?? null;
  }
}
