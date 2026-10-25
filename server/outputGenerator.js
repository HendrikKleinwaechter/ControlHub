/**
 * Output-Generator für Arduino-Befehle
 * Generiert Frames im Format: <OUT>GP:AXES:... GP:BUTTONS:... K:key1,key2,...</OUT>
 * K: ist die Liste der aktuell gehaltenen Tasten (Vollzustand) -- nicht KB:DOWN/UP-Einzelereignisse,
 * damit ein verlorener Frame sich beim naechsten Zyklus selbst korrigiert (s. Lastenheft Abschnitt 5).
 */

// Der Funktions-Editor (app.js) bietet u. a. "ESCAPE"/"NUMPAD*" an, aber die
// Firmware (hidKeycodeFor() im .ino) kennt nur "LSHIFT"/"RSHIFT"/"LCTRL"/"RCTRL"/"LALT"/"RALT"/"ESC"/
// "KP0".."KP9"/"KPDIV"/"KPMUL"/"KPMINUS"/"KPPLUS" -- ohne diese Übersetzung wird z. B. "ALT" von der
// Firmware gar nicht erkannt (weder als Modifier-Bit noch als normale Taste) und fällt komplett weg,
// nicht nur "verzögert". NUMPAD_DECIMAL → KPDOT kennt bisher nur die CraftLink-Firmware (23.10.2026),
// die CraftConsole-Firmware noch nicht (Taste fällt dort weg wie bisher).
// Die Modifier-Einträge SHIFT/CTRL/ALT stehen seit 30.09.2026 nicht mehr zur Auswahl (der Editor
// bietet LSHIFT/RSHIFT/LCTRL/RCTRL/LALT/RALT an, s. app.js availableKeys) -- sie bleiben hier aber
// stehen, damit vor diesem Datum gespeicherte Belegungen weiterhin als linke Taste funktionieren.
// Unbekannte Namen werden unveraendert durchgereicht, LCTRL & Co. brauchen also keinen Eintrag.
import { MAIN_BUTTON_COUNT } from './config/modules.js';

const KEY_NAME_ALIASES = {
  SHIFT: 'LSHIFT',
  CTRL: 'LCTRL',
  ALT: 'LALT',
  ESCAPE: 'ESC',
  NUMPAD0: 'KP0', NUMPAD1: 'KP1', NUMPAD2: 'KP2', NUMPAD3: 'KP3', NUMPAD4: 'KP4',
  NUMPAD5: 'KP5', NUMPAD6: 'KP6', NUMPAD7: 'KP7', NUMPAD8: 'KP8', NUMPAD9: 'KP9',
  NUMPAD_MULTIPLY: 'KPMUL',
  NUMPAD_ADD: 'KPPLUS',
  NUMPAD_SUBTRACT: 'KPMINUS',
  NUMPAD_DIVIDE: 'KPDIV',
  NUMPAD_DECIMAL: 'KPDOT'   // 23.10.2026: CraftLink kennt KPDOT; die CraftConsole-Firmware ignoriert den Namen bis zu ihrem Update
};

export class OutputGenerator {
  /**
   * Generiert einen Output-Frame aus HID-Daten
   * @param {Object} hidOutput - Gamepad- und Keyboard-Daten
   * @returns {string} Formatierter Output-Frame
   */
  generate(hidOutput) {
    const parts = [];

    // Gamepad-Achsen (16 Werte)
    const axes = hidOutput.gamepad.axes.slice(0, 16);
    parts.push(`GP:AXES:${axes.join(',')}`);

    // Gamepad-Buttons (128 Werte)
    const buttons = hidOutput.gamepad.buttons.slice(0, MAIN_BUTTON_COUNT);
    parts.push(`GP:BUTTONS:${buttons.join(',')}`);

    // Tastatur: Vollzustand der aktuell gehaltenen Tasten (auf Firmware-Namen übersetzt, s. o.)
    const keys = hidOutput.keyboard.map(k => KEY_NAME_ALIASES[k] || k);
    parts.push(`K:${keys.join(',')}`);

    return `<OUT>${parts.join(' ')}</OUT>\n`;
  }

  /**
   * Generiert einen Reset-Frame (alle neutralen Werte)
   * @returns {string} Reset-Frame
   */
  generateReset() {
    const neutralAxes = new Array(16).fill(32768);
    const neutralButtons = new Array(MAIN_BUTTON_COUNT).fill(0);

    return `<OUT>GP:AXES:${neutralAxes.join(',')} GP:BUTTONS:${neutralButtons.join(',')} K:</OUT>\n`;
  }
}
