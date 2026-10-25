/**
 * Statische Modul-Definitionen -- welche physischen Tasten (1-100) zu welchem Modul gehören.
 * Nummerierung entspricht der Firmware (CraftConsolePro_Pico.ino BTN_*-Defines).
 *
 * `axisKeys`: welche Achsen physisch zu diesem Modul gehören -- für die Achsen-Hotspots in
 * Modulübersicht + Modul-Kalibrierung (s. public/js/moduleFlow.js), 21.08.2026 ergänzt. Die Achsen-
 * Namen selbst sind KEIN neues Konzept, sondern dieselben Keys wie in public/js/axisAssignment.js
 * (PHYSICAL_AXIS_INDEX) und axisCalibration.js (AXIS_CALIBRATION_GROUPS) -- diese beiden Listen
 * pflegen die Modul-Zuordnung bisher nur implizit über Label-Texte, hier erstmals explizit als
 * Struktur. `poti` (Drehrad) steht hier in keinem Modul; es gehört zum CraftDeck (deviceProfiles.js, Modul-Kalibrierung),
 * sein Feld liegt seit 25.10.2026 auf dem Drehrad im CraftDeck-Bild.
 */
// Bereiche Stand Schritt 2 (24.08.2026, große Neunummerierung) -- beide CraftSlots jetzt identisch
// aufgebaut (Grip 16 + Hebel-als-Taste 4 + Thumbstick-als-Taste 4 + Aux 5 = 29), Einschub/Bedienteil
// auf volle MCP23017-Kapazität (16) angehoben, s. CraftConsolePro_Pico.ino BTN_*-Konstanten.
// Gesamtzahl virtueller Gamepad-Tasten (physisch 1..128, s. Firmware MAIN_BTNS in
// CraftConsolePro_Pico.ino) -- EINZIGE Quelle fuer diese Zahl auf Server-Seite. Frueher war "100"
// an sieben verschiedenen Stellen (frameParser.js/stateManager.js/mappingEngine.js/
// outputGenerator.js/functionsManager.js/index.js) einzeln hartkodiert -- bei der Tasten-
// Neunummerierung (Schritt 2, 24.08.2026, CraftSlot2 auf 86-114 verschoben) wurde das an mehreren
// dieser Stellen übersehen, wodurch alle CraftSlot2-Tasten ab physisch 101 (Hebel/Thumbstick-als-
// Taste/Aux) weder als Tastendruck erkannt noch an die Firmware zurückgemeldet wurden (25.08.2026,
// Hendriks Fund: "an CraftSlot 2 funktionieren keine Tasten"). Jetzt EIN gemeinsamer Import statt
// erneuter Einzel-Hartkodierung.
export const MAIN_BUTTON_COUNT = 128;

// Anzeigenamen = Produktnamen (22.10.2026): CraftPad statt Einschubslot, CraftDeck statt Bedienteil rechts,
// Fingertip-Modul. Die ids (einschub1/2, bedienteil) bleiben -- daran hängen gespeicherte Daten.
export const MODULES = [
  { id: 'craftslot1', name: 'CraftSlot 1',        buttonRange: [1, 29],    axisKeys: ['thumbX', 'thumbY', 'leverA', 'leverB'] },
  { id: 'craftslot2', name: 'CraftSlot 2',        buttonRange: [86, 114],  axisKeys: ['thumb2X', 'thumb2Y', 'leverA2', 'leverB2'] },
  { id: 'fingertip',  name: 'Fingertip-Modul',     buttonRange: [46, 53],  axisKeys: ['finger1', 'finger2', 'finger3', 'finger4'] },
  { id: 'einschub1',  name: 'CraftPad 1',          buttonRange: [30, 45],  axisKeys: [] },
  { id: 'einschub2',  name: 'CraftPad 2',          buttonRange: [54, 69],  axisKeys: [] },
  { id: 'bedienteil', name: 'CraftDeck',           buttonRange: [70, 85],  axisKeys: [] }
];

export function getModuleById(id) {
  return MODULES.find(m => m.id === id) || null;
}

export function getModuleForButton(buttonId) {
  return MODULES.find(m => buttonId >= m.buttonRange[0] && buttonId <= m.buttonRange[1]) || null;
}
