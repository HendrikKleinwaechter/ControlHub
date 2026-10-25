/**
 * Steuerungsmenüs (Kacheln): frei anlegbare Tasten-Seiten. Jede Taste ist
 * frei auf einem optionalen Hintergrundbild positionierbar (Kreis/Dreieck/Viereck, Drag zum Verschieben,
 * Eck-Handle zum Skalieren) und bekommt entweder eine Funktion aus der Bibliothek oder eine direkte
 * Tastatur-Schnellbelegung. Was ein zugeordneter Button beim Klicken tatsächlich AUSLÖST, ist bewusst
 * noch nicht Teil dieser Datei -- das bleibt ein späterer Schritt (Ausführung über die MappingEngine).
 *
 * Zwei Darstellungs-Modi derselben Seite (this.editingPageId steuert, welcher aktiv ist):
 *  - Anzeige-Modus (normaler Klick in der Bedienpanel-Leiste): nur Ansicht, keine Struktur-Änderungen
 *    möglich (Löschen/Verschieben/Hinzufügen -- verhindert Fehlbedienung im laufenden Betrieb).
 *  - Editier-Modus (Klick auf "Bearbeiten" in der Verwaltungsseite): volle Kontrollen.
 *
 * Anders als der Rest der Navigation (feste Buttons in index.html) sind die Seiten hier
 * nutzergeneriert -- Rail-Buttons UND ihre Tab-Content-Divs werden deshalb zur Laufzeit erzeugt,
 * inkl. eigener Klick-Verdrahtung (gleiches Prinzip wie renderCategoryTabs() in app.js das für
 * dynamische Kategorie-Tabs schon macht -- setupTabNavigation() lief beim Start bereits einmal und
 * kennt Buttons, die danach entstehen, nicht automatisch).
 *
 * Das frühere Anpinnen von Seiten je Profil (profile.pinnedPanels, Stern in der Pfadzeile) gibt es seit der Menüführung
 * ohne Seitenleiste (22.10.2026) nicht mehr; der Code dazu liegt seit dem Aufräumen am 24.10.2026 (Durchsicht B9) im
 * Archiv. Alte pinnedPanels-Einträge in Profilen stören nicht.
 */

const SM_MIN_BTN_SIZE = 3;
const SM_MAX_BTN_SIZE = 50;
const SM_MIN_FONT_SIZE = 0.5;
const SM_MAX_FONT_SIZE = 10;
// Positions-Raster je Seite (s. server/steuerungsmenuesManager.js, gleiche Konstanten dort) -- Ersatz
// fürs frühere Anordnen-/Raster-anordnen-Werkzeug: Tasten rasten beim Ziehen ein, statt sie im Nachhinein
// auszurichten. "normal" beim gewöhnlichen Ziehen, "fein" mit zusätzlich gedrückter Shift-links-Taste (bis 21.10.2026 Alt, geht weiterhin).
const SM_DEFAULT_GRID_SIZE = 2.5;        // seit dem Kachel-Editor am PC (22.10.2026) feiner
const SM_DEFAULT_FINE_GRID_SIZE = 0.5;
const SM_MIN_GRID_SIZE = 0.1;
const SM_MAX_GRID_SIZE = 50;

// Festes Seitenverhältnis der Fläche (Breite/Höhe) -- KEIN Nutzer-Setting (Hendriks frühere
// Vereinfachung: kein Dropdown mehr), sondern eine feste Konstante. Ohne sie würden Breite und Höhe
// der Fläche unabhängig voneinander mit dem Browserfenster wachsen/schrumpfen, wodurch sich die
// RELATIVEN Abstände zwischen Tasten je nach Fenstergröße verschieben und Tasten überlappen könnten
// (Hendriks Bug-Report). Die Fläche behält deshalb IMMER dieses Verhältnis und wird nur noch als Ganzes
// (gleicher Faktor in beide Richtungen) auf die größtmögliche Größe skaliert, die ohne Scrollen in den
// verfügbaren Platz passt (s. resizeCanvas()) -- wie object-fit:contain, nur fürs Layout selbst.
const SM_CANVAS_ASPECT = 16 / 9;
// Kachelformen (Hendrik 22.10.2026): dieselben Elemente, je Form eine eigene Anordnung (Lage, Größe, ausblenden).
// Schlüssel Zeilen x Spalten im 2 × 3-Raster; „2x3“ = ganze Seite = die normale 16:9-Fläche. Die echte Größe misst
// formSize() auf dem jeweiligen Bildschirm; SM_FORM_SIZE (1280 × 800-Tablet) ist nur der Ersatz, falls das nicht geht.
const SM_FORMS = [['2x3', 'Ganze Seite'], ['2x2', '2 × 2'], ['2x1', '2 hoch'], ['1x3', '3 breit'], ['1x2', '2 breit'], ['1x1', '1 Feld']];
const SM_FORM_SIZE = { '1x1': [393, 289], '1x2': [816, 289], '1x3': [1240, 289], '2x1': [393, 652], '2x2': [816, 652] };
// Kacheln aus diesen Vorlagen gestaltet man nicht im Editor, man stellt sie nur ein (Hendrik 22.10.2026: bei der
// Steuerungsübersicht zählt, welches Modul sie zeigt, nicht wie sie aussieht). Einstellungen: Übersicht und Zahnrad.
const SM_NUR_EINSTELLEN = ['steuerung'];
const SM_KIND_LIST = { button: 'buttons', graphic: 'graphics', text: 'texts', display: 'displays', embed: 'embeds' };
const SM_GEOM_KEYS = {
  button: ['x', 'y', 'size', 'heightSize', 'fontSize'], graphic: ['x', 'y', 'width', 'height'], text: ['x', 'y', 'width', 'fontSize'],
  display: ['x', 'y', 'width', 'height'], embed: ['x', 'y', 'width', 'height']
};

// Lage/Größe einer eigenen Anordnung auf das Seitenverhältnis dieses Bildschirms umrechnen (22.10.2026 abends). g.a =
// Seitenverhältnis der Kachelform, für die die Lage entworfen wurde (Vorlagen: 1280 × 800-Tablet, im Editor: der
// Bildschirm beim Speichern). Kästen -- Anzeigen, fertige Inhalte (Karte, Listen, Planer) und eckige Tasten -- behalten
// ihren Anteil an Breite und Höhe, so bleiben Reihen bündig (23.10.2026: vorher wurden auch sie nur kleiner, auf
// breiteren Kacheln standen sie dann mit Lücken eingerückt). Alles andere wird gleichmäßig kleiner, bis es in die Höhe
// passt (Kreise bleiben rund). Ohne a bleibt alles, wie es ist. el = das Element (Form der Taste).
function smAdaptGeom(kind, g, aCur, el) {
  if (!(g?.a > 0) || !(aCur > 0) || Math.abs(g.a - aCur) < 0.02) return g;
  const out = { ...g };
  const r = g.a / aCur;
  if (kind === 'embed' || kind === 'display') {
    if (typeof g.height === 'number') out.height = g.height * r;
    return out;
  }
  if (kind === 'button' && (el?.shape || 'circle') === 'square' && typeof g.size === 'number') {
    out.heightSize = (typeof g.heightSize === 'number' ? g.heightSize : g.size) * r;
    if (typeof g.fontSize === 'number') out.fontSize = g.fontSize * Math.min(1, r);
    return out;
  }
  const k = Math.min(1, r);
  for (const key of ['size', 'heightSize', 'width', 'height', 'fontSize']) if (typeof g[key] === 'number') out[key] = g[key] * k;
  return out;
}

// Elemente in Ebenenreihenfolge (hinten → vorne): [[kind, element], …] -- page.layers, sonst die frühere feste Reihenfolge
function smLayerOrder(page) {
  const all = [];
  for (const kind of ['graphic', 'text', 'display', 'embed', 'button']) for (const el of page[SM_KIND_LIST[kind]] || []) all.push([kind, el]);
  const pos = new Map((page.layers || []).map((id, i) => [id, i]));
  return all.map((x, i) => [x, pos.has(x[1].id) ? pos.get(x[1].id) : 100000 + i]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
}

function smClamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// Höhen-Basiswert einer Taste (dieselbe Einheit wie "size", vor der containerAspect-Umrechnung): Kreis
// und Dreieck bleiben immer an "size" gekoppelt (unverzerrt), nur ein Viereck kann per heightSize eine
// davon UNABHÄNGIGE Höhe bekommen (Hendriks Wunsch nach länglichen/breiten statt nur quadratischen
// Rechtecken). Ein zentraler Helfer statt der Bedingung an jeder Stelle einzeln, an der Höhe aus size
// abgeleitet wird (Rendering, Zieh-Klemmen, Resize-Start).
function smHeightBasis(btn) {
  return (btn.shape === 'square' && btn.heightSize) ? btn.heightSize : btn.size;
}

// Text-Zeichen statt SVG-Icon: nach zwei erfolglosen Anläufen, das SVG-Sternchen gut sichtbar zu
// bekommen (Hendrik sah es teils gar nicht), jetzt Hendriks eigener Vorschlag -- ein normales
// Schriftzeichen kann nicht "nicht rendern", nur eine Schriftart fehlt, was praktisch nie vorkommt.
const SM_STAR_CHAR_OUTLINE = '☆';
const SM_STAR_CHAR_FILLED = '★';

// SM_BUTTON_COLORS (Tastenfarben) steht seit 24.10.2026 in js/basis.js -- sie wird schon vor dieser Datei gebraucht

// Piktogramme als Alternative zur Text-Beschriftung (Hendriks Wunsch, v.a. fürs Steuerkreuz/D-Pad-
// Layout: "Pfeile oder sowas als Beschriftung"). Ein einzelner Pfeil-Pfad wird für alle 8 Richtungen per
// CSS-Drehung wiederverwendet, statt 8x dieselben Koordinaten von Hand leicht verschoben zu pflegen --
// die Drehung ist rein optisch (fest hinterlegt je Richtung), unabhängig von btn.rotation (das dreht nur
// die Form, s. renderButtonHtml() -- ein Piktogramm braucht seine eigene, direkt gewählte Richtung statt
// über den Umweg der Formdrehung, die ja auch bei Quadrat/Kreis ohne Pfeil sinnvoll bleiben muss).
const SM_ARROW_PATH = 'M12 20 L12 4 M6 10 L12 4 L18 10';
const SM_ICON_DIRECTIONS = [
  { suffix: 'n', label: 'Pfeil ↑', rotate: 0 },
  { suffix: 'ne', label: 'Pfeil ↗', rotate: 45 },
  { suffix: 'e', label: 'Pfeil →', rotate: 90 },
  { suffix: 'se', label: 'Pfeil ↘', rotate: 135 },
  { suffix: 's', label: 'Pfeil ↓', rotate: 180 },
  { suffix: 'sw', label: 'Pfeil ↙', rotate: 225 },
  { suffix: 'w', label: 'Pfeil ←', rotate: 270 },
  { suffix: 'nw', label: 'Pfeil ↖', rotate: 315 }
];
const SM_ICON_DEFS = {};
SM_ICON_DIRECTIONS.forEach(d => {
  SM_ICON_DEFS[`arrow-${d.suffix}`] = { label: d.label, path: SM_ARROW_PATH, rotate: d.rotate };
});
Object.assign(SM_ICON_DEFS, {
  plus: { label: 'Plus', path: 'M12 5 L12 19 M5 12 L19 12', rotate: 0 },
  minus: { label: 'Minus', path: 'M5 12 L19 12', rotate: 0 },
  check: { label: 'Haken', path: 'M4 13 L9 18 L20 6', rotate: 0 },
  close: { label: 'X', path: 'M6 6 L18 18 M18 6 L6 18', rotate: 0 },
  play: { label: 'Play', path: 'M7 4 L7 20 L19 12 Z', rotate: 0 },
  pause: { label: 'Pause', path: 'M8 5 L8 19 M16 5 L16 19', rotate: 0 },
  stop: { label: 'Stop', path: 'M6 6 H18 V18 H6 Z', rotate: 0 },
  home: { label: 'Haus', path: 'M4 11 L12 4 L20 11 M6 10 V20 H18 V10', rotate: 0 },
  warning: { label: 'Warnung', path: 'M12 3 L22 20 H2 Z M12 9 V15 M12 18 V18.1', rotate: 0 },
  star: { label: 'Stern', path: 'M12 2 L14.9 8.6 L22 9.3 L16.7 14 L18.3 21 L12 17.3 L5.7 21 L7.3 14 L2 9.3 L9.1 8.6 Z', rotate: 0 },
  lock: { label: 'Gesperrt', path: 'M6 11 H18 V21 H6 Z M8 11 V7 A4 4 0 0 1 16 7 V11', rotate: 0 },
  unlock: { label: 'Entsperrt', path: 'M6 11 H18 V21 H6 Z M8 11 V8 A4 4 0 0 1 15.5 5.3', rotate: 0 },
  eye: { label: 'Auge', path: 'M2 12 C5 5 19 5 22 12 C19 19 5 19 2 12 Z M12 9 A3 3 0 1 0 12 15 A3 3 0 1 0 12 9', rotate: 0 },
  refresh: { label: 'Aktualisieren', path: 'M19.5 8.5 A8 8 0 1 1 15.5 4.3 M20 4 V9 H15', rotate: 0 },
  menu: { label: 'Menü', path: 'M4 7 H20 M4 12 H20 M4 17 H20', rotate: 0 },
  power: { label: 'Ein/Aus', path: 'M12 3 V11 M18.4 7.6 A8 8 0 1 1 5.6 7.6', rotate: 0 },
  lightbulb: { label: 'Licht', path: 'M12 3 A6 6 0 0 0 8 13.5 L9 18 H15 L16 13.5 A6 6 0 0 0 12 3 M9.5 21 H14.5', rotate: 0 },
  camera: { label: 'Kamera', path: 'M3 8 H7 L9 5 H15 L17 8 H21 V19 H3 Z M12 9 A4 4 0 1 0 12 17 A4 4 0 1 0 12 9', rotate: 0 },
  'map-pin': { label: 'Standort', path: 'M12 21 C12 21 5 14 5 9 A7 7 0 0 1 19 9 C19 14 12 21 12 21 M12 12 A3 3 0 1 0 12 6 A3 3 0 1 0 12 12', rotate: 0 },
  volume: { label: 'Lautstärke', path: 'M3 9 H7 L12 5 V19 L7 15 H3 Z M16 8.5 A6 6 0 0 1 16 15.5 M18.5 6 A9.5 9.5 0 0 1 18.5 18', rotate: 0 },
  bell: { label: 'Glocke', path: 'M12 3 A6 6 0 0 0 6 9 V13 L4 16 H20 L18 13 V9 A6 6 0 0 0 12 3 M10 19 A2 2 0 0 0 14 19', rotate: 0 },
  clock: { label: 'Uhr', path: 'M3 12 A9 9 0 1 0 21 12 A9 9 0 1 0 3 12 M12 7 V12 L16 14', rotate: 0 },
  search: { label: 'Suche', path: 'M4 10 A6 6 0 1 0 16 10 A6 6 0 1 0 4 10 M15 15 L21 21', rotate: 0 },
  info: { label: 'Info', path: 'M3 12 A9 9 0 1 0 21 12 A9 9 0 1 0 3 12 M12 11 V16 M12 8 V8.1', rotate: 0 },
  trash: { label: 'Löschen', path: 'M5 7 H19 M9 7 V5 H15 V7 M7 7 L8 20 H16 L17 7 M10 11 V16 M14 11 V16', rotate: 0 },
  wifi: { label: 'WLAN', path: 'M12 18.5 V18.6 M8.5 15.5 A5 5 0 0 1 15.5 15.5 M5.5 12 A9.5 9.5 0 0 1 18.5 12 M2.5 8.5 A14 14 0 0 1 21.5 8.5', rotate: 0 },
  battery: { label: 'Batterie', path: 'M3 8 H18 V16 H3 Z M18 10.5 H21 V13.5 H18 M6 8 V16 M9 8 V16', rotate: 0 },
  settings: { label: 'Einstellungen', path: 'M4 6 H20 M8 6 A2 2 0 1 0 8 6.1 M4 12 H20 M14 12 A2 2 0 1 0 14 12.1 M4 18 H20 M10 18 A2 2 0 1 0 10 18.1', rotate: 0 }
});

// Zweite Erweiterungsrunde (Hendriks Wunsch "noch 100 mehr") -- Chevrons wieder als EIN Pfad + Drehung
// (gleiches Prinzip wie SM_ARROW_PATH oben), der große Rest als einzelne, bewusst einfach gehaltene
// Pfade (gerade Linien, der bereits bewährte Zwei-Halbkreisbögen-Trick für Kreise, wenige Kurven) --
// vor Auslieferung per CDP-Screenshot komplett durchgesehen (s. [[project_controlhub_firmware_konsolidierung]]).
const SM_CHEVRON_PATH = 'M6 15 L12 9 L18 15';
const SM_CHEVRON_DIRECTIONS = [
  { suffix: 'up', label: 'Chevron ↑', rotate: 0 },
  { suffix: 'right', label: 'Chevron →', rotate: 90 },
  { suffix: 'down', label: 'Chevron ↓', rotate: 180 },
  { suffix: 'left', label: 'Chevron ←', rotate: 270 }
];
SM_CHEVRON_DIRECTIONS.forEach(d => {
  SM_ICON_DEFS[`chevron-${d.suffix}`] = { label: d.label, path: SM_CHEVRON_PATH, rotate: d.rotate };
});
Object.assign(SM_ICON_DEFS, {
  'plus-circle': { label: 'Plus (Kreis)', path: 'M3 12 A9 9 0 1 0 21 12 A9 9 0 1 0 3 12 M12 8 V16 M8 12 H16', rotate: 0 },
  'minus-circle': { label: 'Minus (Kreis)', path: 'M3 12 A9 9 0 1 0 21 12 A9 9 0 1 0 3 12 M8 12 H16', rotate: 0 },
  'check-circle': { label: 'Haken (Kreis)', path: 'M3 12 A9 9 0 1 0 21 12 A9 9 0 1 0 3 12 M8 12.5 L11 15.5 L16 9', rotate: 0 },
  'close-circle': { label: 'X (Kreis)', path: 'M3 12 A9 9 0 1 0 21 12 A9 9 0 1 0 3 12 M9 9 L15 15 M15 9 L9 15', rotate: 0 },
  'skip-back': { label: 'Vorheriger Titel', path: 'M17 5 L9 12 L17 19 M7 5 V19', rotate: 0 },
  'skip-forward': { label: 'Nächster Titel', path: 'M7 5 L15 12 L7 19 M17 5 V19', rotate: 0 },
  rewind: { label: 'Zurückspulen', path: 'M18 6 L11 12 L18 18 M11 6 L4 12 L11 18', rotate: 0 },
  'fast-forward': { label: 'Vorspulen', path: 'M6 6 L13 12 L6 18 M13 6 L20 12 L13 18', rotate: 0 },
  eject: { label: 'Auswerfen', path: 'M6 15 L12 6 L18 15 Z M6 18 H18', rotate: 0 },
  file: { label: 'Datei', path: 'M6 3 H14 L18 7 V21 H6 Z M14 3 V7 H18', rotate: 0 },
  'file-text': { label: 'Text-Datei', path: 'M6 3 H14 L18 7 V21 H6 Z M14 3 V7 H18 M9 12 H15 M9 16 H15', rotate: 0 },
  folder: { label: 'Ordner', path: 'M3 7 H10 L12 9 H21 V19 H3 Z', rotate: 0 },
  'folder-open': { label: 'Ordner offen', path: 'M3 9 L5 7 H10 L12 9 H21 L19 19 H5 Z', rotate: 0 },
  save: { label: 'Speichern', path: 'M4 4 H17 L20 7 V20 H4 Z M8 4 V9 H16 V4 M7 14 H17 V20 H7 Z', rotate: 0 },
  edit: { label: 'Bearbeiten', path: 'M4 20 L4.8 16.5 L16 5.3 A2 2 0 0 1 18.7 8 L7.5 19.2 Z M14 7.3 L16.7 10', rotate: 0 },
  copy: { label: 'Kopieren', path: 'M9 9 H19 V19 H9 Z M5 15 V5 H15 V7', rotate: 0 },
  cut: { label: 'Ausschneiden', path: 'M6 6 A2 2 0 1 0 6 10 A2 2 0 1 0 6 6 M6 14 A2 2 0 1 0 6 18 A2 2 0 1 0 6 14 M7.5 7.5 L19 18 M7.5 16.5 L19 6', rotate: 0 },
  paste: { label: 'Einfügen', path: 'M9 4 H15 V7 H9 Z M6 4 H8 V7 H16 V4 H18 V20 H6 Z M9 12 H15 M9 16 H13', rotate: 0 },
  undo: { label: 'Rückgängig', path: 'M9 6 L4 11 L9 16 M4 11 H15 A6 6 0 0 1 21 17', rotate: 0 },
  redo: { label: 'Wiederholen', path: 'M15 6 L20 11 L15 16 M20 11 H9 A6 6 0 0 0 3 17', rotate: 0 },
  share: { label: 'Teilen', path: 'M18 5 A2.5 2.5 0 1 0 18 5.01 M6 12 A2.5 2.5 0 1 0 6 12.01 M18 19 A2.5 2.5 0 1 0 18 19.01 M8.2 10.8 L15.8 6.2 M8.2 13.2 L15.8 17.8', rotate: 0 },
  print: { label: 'Drucken', path: 'M6 9 V3 H18 V9 M4 9 H20 V17 H16 M6 17 H4 V9 M8 13 H16 V21 H8 Z', rotate: 0 },
  'grid-view': { label: 'Rasteransicht', path: 'M4 4 H10 V10 H4 Z M14 4 H20 V10 H14 Z M4 14 H10 V20 H4 Z M14 14 H20 V20 H14 Z', rotate: 0 },
  'list-view': { label: 'Listenansicht', path: 'M4 6 H8 M4 12 H8 M4 18 H8 M11 6 H20 M11 12 H20 M11 18 H20', rotate: 0 },
  expand: { label: 'Vergrößern', path: 'M4 9 V4 H9 M20 9 V4 H15 M4 15 V20 H9 M20 15 V20 H15', rotate: 0 },
  collapse: { label: 'Verkleinern', path: 'M9 4 V9 H4 M15 4 V9 H20 M9 20 V15 H4 M15 20 V15 H20', rotate: 0 },
  maximize: { label: 'Maximieren', path: 'M4 4 H20 V20 H4 Z', rotate: 0 },
  minimize: { label: 'Minimieren', path: 'M6 12 H18', rotate: 0 },
  'zoom-in': { label: 'Vergrößern (Lupe)', path: 'M4 10 A6 6 0 1 0 16 10 A6 6 0 1 0 4 10 M15 15 L21 21 M10 7 V13 M7 10 H13', rotate: 0 },
  'zoom-out': { label: 'Verkleinern (Lupe)', path: 'M4 10 A6 6 0 1 0 16 10 A6 6 0 1 0 4 10 M15 15 L21 21 M7 10 H13', rotate: 0 },
  'more-horizontal': { label: 'Mehr (waagerecht)', path: 'M5 12 A1.2 1.2 0 1 0 5 12.01 M12 12 A1.2 1.2 0 1 0 12 12.01 M19 12 A1.2 1.2 0 1 0 19 12.01', rotate: 0 },
  'more-vertical': { label: 'Mehr (senkrecht)', path: 'M12 5 A1.2 1.2 0 1 0 12 5.01 M12 12 A1.2 1.2 0 1 0 12 12.01 M12 19 A1.2 1.2 0 1 0 12 19.01', rotate: 0 },
  pin: { label: 'Pinnen', path: 'M12 3 A4 4 0 1 0 12 3.01 M12 7 L12 21 M9 21 H15', rotate: 0 },
  flag: { label: 'Flagge', path: 'M6 21 V4 M6 4 H18 L15 8 L18 12 H6', rotate: 0 },
  bookmark: { label: 'Lesezeichen', path: 'M6 3 H18 V21 L12 16 L6 21 Z', rotate: 0 },
  tag: { label: 'Etikett', path: 'M11 3 H4 V10 L14 20 L21 13 Z M7.5 7.5 A1 1 0 1 0 7.5 7.51', rotate: 0 },
  filter: { label: 'Filter', path: 'M4 5 H20 L14 13 V19 L10 21 V13 Z', rotate: 0 },
  sort: { label: 'Sortieren', path: 'M6 8 L10 4 L14 8 M10 4 V16 M18 16 L14 20 L10 16 M14 20 V8', rotate: 0 },
  calendar: { label: 'Kalender', path: 'M4 5 H20 V21 H4 Z M4 10 H20 M8 3 V7 M16 3 V7', rotate: 0 },
  'calendar-check': { label: 'Kalender (erledigt)', path: 'M4 5 H20 V21 H4 Z M4 10 H20 M8 3 V7 M16 3 V7 M8 15 L11 18 L16 12', rotate: 0 },
  hourglass: { label: 'Sanduhr', path: 'M6 3 H18 L12 12 L18 21 H6 L12 12 Z', rotate: 0 },
  compass: { label: 'Kompass', path: 'M3 12 A9 9 0 1 0 21 12 A9 9 0 1 0 3 12 M12 7 L14 12 L12 17 L10 12 Z', rotate: 0 },
  target: { label: 'Ziel', path: 'M3 12 A9 9 0 1 0 21 12 A9 9 0 1 0 3 12 M7 12 A5 5 0 1 0 17 12 A5 5 0 1 0 7 12 M12 12 A1 1 0 1 0 12 12.01', rotate: 0 },
  anchor: { label: 'Anker', path: 'M12 3 A2 2 0 1 0 12 3.01 M12 5 V19 M8 9 H16 M4 13 A8 8 0 0 0 12 21 A8 8 0 0 0 20 13', rotate: 0 },
  'flag-checkered': { label: 'Zielflagge', path: 'M6 21 V4 M6 4 H18 L15 8 L18 12 H6 M10 4 V12 M14 4 V8 M14 10 V12', rotate: 0 },
  sun: { label: 'Sonne', path: 'M12 8 A4 4 0 1 0 12 16 A4 4 0 1 0 12 8 M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22 M4.9 4.9 L7 7 M17 17 L19.1 19.1 M4.9 19.1 L7 17 M17 7 L19.1 4.9', rotate: 0 },
  moon: { label: 'Mond', path: 'M17 4 A9 9 0 1 0 17 20 A7 7 0 1 1 17 4 Z', rotate: 0 },
  cloud: { label: 'Wolke', path: 'M7 18 A4.5 4.5 0 0 1 6.5 9.1 A6 6 0 0 1 18.4 8 A4.5 4.5 0 0 1 18 18 Z', rotate: 0 },
  'cloud-rain': { label: 'Regen', path: 'M7 15 A4.5 4.5 0 0 1 6.5 6.1 A6 6 0 0 1 18.4 5 A4.5 4.5 0 0 1 18 15 Z M9 18 V21 M13 18 V21 M17 18 V21', rotate: 0 },
  snowflake: { label: 'Schnee', path: 'M12 3 V21 M5 6.5 L19 17.5 M19 6.5 L5 17.5 M12 3 L10 5.5 M12 3 L14 5.5 M12 21 L10 18.5 M12 21 L14 18.5', rotate: 0 },
  wind: { label: 'Wind', path: 'M3 8 H14 A2.5 2.5 0 1 0 11.5 5.5 M3 13 H18 A2.5 2.5 0 1 1 15.5 15.5 M3 18 H10', rotate: 0 },
  bolt: { label: 'Blitz', path: 'M13 2 L4 14 H11 L10 22 L20 9 H13 Z', rotate: 0 },
  droplet: { label: 'Tropfen', path: 'M12 3 C12 3 5 12 5 16 A7 7 0 0 0 19 16 C19 12 12 3 12 3 Z', rotate: 0 },
  fire: { label: 'Feuer', path: 'M12 2 C12 2 6 9 6 14 A6 6 0 1 0 18 14 C18 9 12 2 12 2 Z M12 10 C12 10 9 13.5 9 15.5 A3 3 0 1 0 15 15.5 C15 13.5 12 10 12 10 Z', rotate: 0 },
  leaf: { label: 'Blatt', path: 'M4 20 C4 20 4 4 20 4 C20 16 12 20 4 20 Z M4 20 L14 10', rotate: 0 },
  mountain: { label: 'Berg', path: 'M3 20 L9 8 L13 15 L16 10 L21 20 Z', rotate: 0 },
  wave: { label: 'Welle', path: 'M2 12 A3 3 0 0 1 8 12 A3 3 0 0 0 14 12 A3 3 0 0 1 20 12 M2 17 A3 3 0 0 1 8 17 A3 3 0 0 0 14 17 A3 3 0 0 1 20 17', rotate: 0 },
  umbrella: { label: 'Regenschirm', path: 'M3 12 A9 9 0 1 1 21 12 Z M12 3 V12 M12 12 V19 A2 2 0 0 1 8 19', rotate: 0 },
  'triangle-outline': { label: 'Dreieck', path: 'M12 4 L21 20 H3 Z', rotate: 0 },
  'square-outline': { label: 'Quadrat', path: 'M4 4 H20 V20 H4 Z', rotate: 0 },
  'circle-outline': { label: 'Kreis', path: 'M3 12 A9 9 0 1 0 21 12 A9 9 0 1 0 3 12', rotate: 0 },
  diamond: { label: 'Raute', path: 'M12 3 L21 12 L12 21 L3 12 Z', rotate: 0 },
  hexagon: { label: 'Sechseck', path: 'M8 3 H16 L21 12 L16 21 H8 L3 12 Z', rotate: 0 },
  wrench: { label: 'Schraubenschlüssel', path: 'M15 6 A4 4 0 1 0 10.5 10.5 L4 17 L7 20 L13.5 13.5 A4 4 0 1 0 18 9 L15 12 L12 9 Z', rotate: 0 },
  hammer: { label: 'Hammer', path: 'M15 4 L20 9 L16 13 L11 8 Z M11 8 L4 15 A2 2 0 0 0 7 18 L14 11', rotate: 0 },
  screwdriver: { label: 'Schraubendreher', path: 'M14 3 L21 10 L18 13 L11 6 Z M11 6 L4 13 V17 H8 L15 10', rotate: 0 },
  ruler: { label: 'Lineal', path: 'M3 15 L15 3 L21 9 L9 21 Z M9 9 L11 11 M12 6 L14 8 M6 12 L8 14', rotate: 0 },
  truck: { label: 'LKW', path: 'M3 7 H14 V17 H3 Z M14 10 H18 L21 13 V17 H14 M6.5 19.5 A2 2 0 1 0 6.5 19.51 M17.5 19.5 A2 2 0 1 0 17.5 19.51', rotate: 0 },
  trailer: { label: 'Anhänger', path: 'M3 8 H18 V17 H3 Z M6.5 19.5 A2 2 0 1 0 6.5 19.51 M14.5 19.5 A2 2 0 1 0 14.5 19.51 M18 12 H21 V17 H18', rotate: 0 },
  wheel: { label: 'Reifen', path: 'M12 5 A7 7 0 1 0 12 19 A7 7 0 1 0 12 5 M12 5 V8 M12 16 V19 M5 12 H8 M16 12 H19 M7 7 L9.2 9.2 M14.8 14.8 L17 17 M17 7 L14.8 9.2 M9.2 14.8 L7 17', rotate: 0 },
  'fuel-pump': { label: 'Tankstelle', path: 'M5 21 V6 H12 V21 M5 12 H12 M14 8 L17 8 A2 2 0 0 1 19 10 V17 A1.5 1.5 0 0 1 16 17 V13 H14', rotate: 0 },
  key: { label: 'Schlüssel', path: 'M9 15 A5 5 0 1 0 9 5 A5 5 0 1 0 9 15 Z M13 11 H21 M18 11 V15 M21 11 V14', rotate: 0 },
  'steering-wheel': { label: 'Lenkrad', path: 'M12 3 A9 9 0 1 0 12 21 A9 9 0 1 0 12 3 M12 3 V9 M12 15 A3 3 0 1 0 12 15.01 M9.5 14 L4.5 18 M14.5 14 L19.5 18', rotate: 0 },
  gauge: { label: 'Anzeige', path: 'M4 17 A8 8 0 0 1 20 17 M12 17 L16 10 M4 17 H20', rotate: 0 },
  seatbelt: { label: 'Sicherheitsgurt', path: 'M6 3 V13 A6 6 0 0 0 18 13 V3 M6 13 L10 21 H14 L18 13', rotate: 0 },
  bluetooth: { label: 'Bluetooth', path: 'M7 8 L17 16 L12 20 V4 L17 8 L7 16', rotate: 0 },
  usb: { label: 'USB', path: 'M12 3 V13 M9 6 L12 3 L15 6 M7 13 A2 2 0 1 0 7 13.01 M17 9 A2 2 0 1 0 17 9.01 M17 17 A2 2 0 1 0 17 17.01 M8.5 14 L15.5 9.5 M8.5 14 L15.5 16.5', rotate: 0 },
  plug: { label: 'Stecker', path: 'M9 2 V8 M15 2 V8 M6 8 H18 V13 A6 6 0 0 1 6 13 Z M12 19 V22', rotate: 0 },
  'battery-charging': { label: 'Lädt', path: 'M3 8 H14.5 V16 H3 Z M14.5 10.5 H17.5 V13.5 H14.5 M9 8 L6.5 12 H9.5 L7 16', rotate: 0 },
  signal: { label: 'Signal', path: 'M4 20 V17 M9 20 V13 M14 20 V9 M19 20 V5', rotate: 0 },
  percent: { label: 'Prozent', path: 'M6 18 L18 6 M7.5 7.5 A1.5 1.5 0 1 0 7.5 7.51 M16.5 16.5 A1.5 1.5 0 1 0 16.5 16.51', rotate: 0 },
  layers: { label: 'Ebenen', path: 'M12 3 L21 8 L12 13 L3 8 Z M3 13 L12 18 L21 13', rotate: 0 },
  equals: { label: 'Gleich', path: 'M5 9 H19 M5 15 H19', rotate: 0 },
  swap: { label: 'Tauschen', path: 'M4 8 H16 L13 5 M16 8 L13 11 M20 16 H8 L11 19 M8 16 L11 13', rotate: 0 },
  asterisk: { label: 'Sternchen', path: 'M12 4 V20 M5 8 L19 16 M19 8 L5 16', rotate: 0 },
  hash: { label: 'Raute (#)', path: 'M9 3 L7 21 M17 3 L15 21 M4 9 H20 M3 15 H19', rotate: 0 },
  mail: { label: 'Post', path: 'M3 5 H21 V19 H3 Z M3 5 L12 13 L21 5', rotate: 0 },
  phone: { label: 'Telefon', path: 'M6 3 H10 L11 8 L8.5 9.5 A12 12 0 0 0 14.5 15.5 L16 13 L21 14 V18 A2 2 0 0 1 19 20 C11 20 4 13 4 5 A2 2 0 0 1 6 3 Z', rotate: 0 },
  chat: { label: 'Chat', path: 'M4 4 H20 V16 H10 L5 20 V16 H4 Z', rotate: 0 },
  'at-sign': { label: 'At-Zeichen', path: 'M12 3 A9 9 0 1 0 21 12 V13.5 M16 12 A4 4 0 1 1 12 8 A4 4 0 1 1 16 12 V14 A2 2 0 0 0 20 14 V12', rotate: 0 },
  'thumbs-up': { label: 'Daumen hoch', path: 'M4 11 H8 V21 H4 Z M8 11 L11 3 A2 2 0 0 1 13 5 V10 H18 A2 2 0 0 1 20 12.5 L18 20 A2 2 0 0 1 16 21 H8', rotate: 0 },
  'thumbs-down': { label: 'Daumen runter', path: 'M4 13 H8 V3 H4 Z M8 13 L11 21 A2 2 0 0 0 13 19 V14 H18 A2 2 0 0 0 20 11.5 L18 4 A2 2 0 0 0 16 3 H8', rotate: 0 },
  heart: { label: 'Herz', path: 'M12 21 C12 21 3 14 3 8 A5 5 0 0 1 12 5 A5 5 0 0 1 21 8 C21 14 12 21 12 21 Z', rotate: 0 },
  smiley: { label: 'Lächeln', path: 'M3 12 A9 9 0 1 0 21 12 A9 9 0 1 0 3 12 M9 10 A1 1 0 1 0 9 10.01 M15 10 A1 1 0 1 0 15 10.01 M8 15 A4 4 0 0 0 16 15', rotate: 0 },
  mute: { label: 'Stumm', path: 'M3 9 H7 L12 5 V19 L7 15 H3 Z M16 9 L21 15 M21 9 L16 15', rotate: 0 },
  shuffle: { label: 'Zufällig', path: 'M4 6 H8 L18 18 H21 M18 6 H21 V9 M4 18 H8 L12 13 M18 18 V15', rotate: 0 }
});

// Beleuchtung (Hendrik 24.10.2026: Kachel „Beleuchtung“ mit „Piktogramm statt Text“): angelehnt an die Zeichen im
// Armaturenbrett; Licht nach rechts = vorne (Traktor fährt nach rechts), Arbeitslicht hinten und Blinker rechts gedreht
const SM_LICHT_LAMPE = 'M10 5 C 1.5 5 1.5 19 10 19 Z';
const SM_LICHT_ARBEIT = 'M10 4 L3 7.5 V16.5 L10 20 Z M14 12 H21 M14 7.5 L20 4.5 M14 16.5 L20 19.5';
const SM_LICHT_PFEIL = 'M3 12 L10 5 V9 H20 V15 H10 V19 Z';
Object.assign(SM_ICON_DEFS, {
  'low-beam': { label: 'Abblendlicht', path: `${SM_LICHT_LAMPE} M14 7 L21 9.5 M14 12 L21 14.5 M14 17 L21 19.5`, rotate: 0 },
  'high-beam': { label: 'Fernlicht', path: `${SM_LICHT_LAMPE} M14 7 H21 M14 12 H21 M14 17 H21`, rotate: 0 },
  'work-light-front': { label: 'Arbeitslicht vorne', path: SM_LICHT_ARBEIT, rotate: 0 },
  'work-light-rear': { label: 'Arbeitslicht hinten', path: SM_LICHT_ARBEIT, rotate: 180 },
  beacon: { label: 'Rundumleuchte', path: 'M5 21 H19 M7.5 21 V15 A4.5 4.5 0 0 1 16.5 15 V21 M12 2.5 V6 M4.5 6 L7 8.5 M19.5 6 L17 8.5 M2 13 H4.5 M22 13 H19.5', rotate: 0 },
  'turn-left': { label: 'Blinker links', path: SM_LICHT_PFEIL, rotate: 0 },
  'turn-right': { label: 'Blinker rechts', path: SM_LICHT_PFEIL, rotate: 180 },
  hazard: { label: 'Warnblinker', path: 'M12 3 L22 20 H2 Z M12 10.5 L15.8 17 H8.2 Z', rotate: 0 }
});

function smIconSvg(iconId) {
  const def = SM_ICON_DEFS[iconId];
  if (!def) return '';
  const rotateStyle = def.rotate ? ` style="transform:rotate(${def.rotate}deg)"` : '';
  return `<svg class="sm-btn-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"${rotateStyle}><path d="${def.path}"/></svg>`;
}

// escapeHtml steht seit 24.10.2026 in js/basis.js

class SteuerungsmenuesManager {
  constructor() {
    this.pages = [];
    this.editingPageId = null;     // Kachel, die gerade im Kachel-Editor (kachelEditor.js) offen ist
    this.basePages = [];           // Kacheln wie vom Server (this.pages ist seit dem Kachel-Editor dieselbe Liste)
    this.functionsCache = null;    // Map functionId -> Anzeigename, lazy geladen beim Editier-Einstieg

    this.socket = window.hubSocket;   // gemeinsame Verbindung der Seite (hubSocket.js, B4)
    this.socket.on('profileChanged', () => this.profilGewechselt());
    this.socket.on('profile-updated', () => this.profilGewechselt());   // B3
    // Gehaltene Kachel-Tasten (23.10.2026): zentral gemerkt, damit ein Loslassen auch ankommt, wenn die Fläche
    // inzwischen neu gezeichnet wurde (Seitenwechsel der Automatik, Speichern auf einem anderen Gerät) -- sonst
    // blieb die Taste im Spiel gedrückt
    this.heldPanel = new Map();
    const releasePointer = e => { for (const [k, h] of this.heldPanel) if (h.pointerId === e.pointerId) this.releaseHeld(k); };
    document.addEventListener('pointerup', releasePointer, true);
    document.addEventListener('pointercancel', releasePointer, true);
    // Andere Geräte haben Kacheln geändert (angelegt, bearbeitet, gelöscht): neu laden
    this.socket.on('steuerungsmenues-changed', () => this.onRemoteChange());
    document.addEventListener('tabchanged', (e) => this.onTabChanged(e.detail.tabName));

    // Fläche füllt den verfügbaren Platz messbar aus (s. resizeCanvas()) statt eines festen
    // Seitenverhältnisses -- muss bei jeder Fenstergrößenänderung neu berechnet werden.
    window.addEventListener('resize', () => {
      const activeContentId = document.querySelector('.tab-content.active')?.id.replace('tab-', '');
      if (activeContentId && this.pages.some(p => p.id === activeContentId)) {
        this.resizeCanvas(activeContentId);
      }
    });

    // Anzeigen und Tasten mit Zustand laufen live mit (Paket J, höchstens 10×/s, s. anzeigen.js)
    window.anzeigen?.subscribe(() => this.updateLive());

    this.loadPages();
    this.profilGewechselt();
  }

  async loadPages() {
    try {
      const res = await fetch('/api/steuerungsmenues');
      const data = await res.json();
      this.basePages = data.pages || [];
    } catch (error) {
      console.error('Steuerungsmenüs konnten nicht geladen werden:', error);
      this.basePages = [];
    }
    this.applyFormOverlay();
    this.renderRail();
    if (this.editingPageId || document.getElementById('tab-sm-manage')?.classList.contains('active')) {
      this.renderManagePage();
    }
    window.appNav?.render();   // Namen im Umschalter und im Menü
  }

  // Profil gewechselt oder geändert: offene Seite neu zeichnen (Tasten und Anzeigen hängen am Profil)
  profilGewechselt() {
    this.ensureTabContainers();
    const activeContentId = document.querySelector('.tab-content.active')?.id.replace('tab-', '');
    if (activeContentId && this.pages.some(p => p.id === activeContentId)) this.renderPageBody(activeContentId);
  }

  // Hook aus app.js switchMainTab() (CustomEvent 'tabchanged') -- verlässt automatisch den Editier-Modus, sobald
  // irgendeine ANDERE Navigation als enterEditMode()/exitEditMode() selbst dafür sorgt, dass sich der Tab bzw. die sichtbare Leiste
  // ändert -- verhindert, dass "editingPageId" hängen bleibt, wenn z.B. über die Wurzel-Ebene wieder
  // ins Bedienpanel-Menü gewechselt wird, während gerade editiert wurde.
  onTabChanged(tabName) {
    // Eingebaute Bausteine aus Elementen anderer eigener Bausteine zurückgeben (sonst fehlten sie z. B. auf ihrer
    // eigenen Seite); Kacheln der Startseite holen ihre eigenen Bausteine beim Zeichnen ohnehin neu
    for (const p of this.pages) if (p.id !== tabName) window.tilePages?.releaseOwner(p.id);
    // Seite bei JEDEM Wechsel dorthin zeichnen (21.10.2026) -- vorher nur beim Klick im Menü, z. B. nach
    // „Neue Seite“ (navigateToTab) blieb die frisch angelegte Seite leer, bis man sie anklickte.
    if (!this.editingPageId && this.pages.some(p => p.id === tabName)) this.renderPageBody(tabName);

    if (this.editingPageId) {
      const smLevel = document.getElementById('nav-level-steuerungsmenues');
      const smLevelVisible = !!smLevel && smLevel.style.display !== 'none';
      if (tabName !== this.editingPageId || smLevelVisible) {
        window.kachelEditor?.close();
        this.editingPageId = null;
        this.applyFormOverlay();
        this.setEditingUi(false);
        if (this.pages.some(p => p.id === tabName)) this.renderPageBody(tabName);
      }
    }
  }

  // Werkzeugspalte links: die frühere Seitenleiste, nur noch im Editier-Modus sichtbar (CSS body.sm-editing)
  setEditingUi(on) {
    document.body.classList.toggle('sm-editing', !!on);
    window.appNav?.renderBar();
    setTimeout(() => window.dispatchEvent(new Event('resize')), 30);
  }

  // ---------------------------------------------------------------------------------------------
  // Tab-Container + Rail
  // ---------------------------------------------------------------------------------------------

  // Legt für jede Seite, die noch keinen Tab-Content-Container hat, einen an -- kann nicht vorab in
  // index.html stehen, da Seiten nutzergeneriert sind.
  ensureTabContainers() {
    const main = document.querySelector('main');
    this.pages.forEach(page => {
      if (document.getElementById(`tab-${page.id}`)) return;
      const div = document.createElement('div');
      div.id = `tab-${page.id}`;
      // sm-tab-content: eigener Marker, damit die Fläche die komplette Höhe bekommt (s. CSS
      // .sm-tab-content.active{justify-content:flex-start}) statt wie andere Tabs vertikal zentriert
      // zu werden -- die Zentrierung sorgte dafür, dass resizeCanvas() die Fläche vor dem ersten
      // Layout an der falschen (mittigen statt oberen) Position maß und dadurch zu klein blieb.
      div.className = 'tab-content sm-tab-content';
      div.innerHTML = `<section class="card"><div class="sm-page-body" data-page-id="${page.id}"></div></section>`;
      main.appendChild(div);
    });
  }

  renderRail() {
    this.ensureTabContainers();
    const container = document.getElementById('nav-level-steuerungsmenues');
    if (!container) return;

    // Welche Seite gerade aktiv ist, lesen wir vom Tab-Content ab (überlebt den Rail-Neuaufbau
    // unten, da die Content-Divs in <main> liegen, nicht in der Leiste).
    const activeContentId = document.querySelector('.tab-content.active')?.id.replace('tab-', '');

    container.innerHTML = this.pages.map(page => `
      <button class="main-tab-btn sm-rail-btn${page.id === activeContentId ? ' active' : ''}" data-tab="${escapeHtml(page.id)}" data-title="${escapeHtml(page.name)}">
        ${navIcon('panel')}<span class="sm-rail-label">${escapeHtml(page.name)}</span>
      </button>`
    ).join('')
      + '<button type="button" class="main-tab-btn rail-add" id="sm-add-page-btn">' + navIcon('panel') + ' + Neue Kachel</button>'
      + '<div class="rail-divider-plain"></div>'
      + '<button type="button" class="main-tab-btn" data-tab="sm-manage" data-title="Kacheln">' + navIcon('panel') + 'Kacheln</button>';

    container.querySelectorAll('.sm-rail-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.editingPageId = null; // normaler Rail-Klick = immer Anzeige-Modus
        window.app.switchMainTab(btn.dataset.tab);
        this.renderPageBody(btn.dataset.tab);
      });
    });
    document.getElementById('sm-add-page-btn').addEventListener('click', () => this.addPage());
    container.querySelector('[data-tab="sm-manage"]').addEventListener('click', () => {
      window.app.switchMainTab('sm-manage');
      this.renderManagePage();
    });

    if (activeContentId && this.pages.some(p => p.id === activeContentId)) {
      this.renderPageBody(activeContentId);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Seiteninhalt: Anzeige-Modus / Editier-Modus (dieselbe Seite, unterschiedliche Fähigkeiten)
  // ---------------------------------------------------------------------------------------------

  renderPageBody(pageId) {
    const page = this.pages.find(p => p.id === pageId);
    const body = document.querySelector(`.sm-page-body[data-page-id="${pageId}"]`);
    if (!page || !body) return;

    // Bearbeitet wird seit 22.10.2026 im Kachel-Editor (kachelEditor.js) -- hier immer die Ansicht
    const isEdit = false;
    body.classList.toggle('sm-mode-edit', isEdit);
    // Eingebaute Bausteine, die in Elementen dieser Fläche stecken, zuerst an ihre Seite zurückgeben -- sonst
    // würde das Neuzeichnen (innerHTML) sie mitlöschen (tiles.js mountEmbed()/releaseOwner())
    window.tilePages?.releaseOwner(pageId);
    // gehaltene Tasten dieser Fläche loslassen, bevor ihre Elemente verschwinden
    for (const [k, h] of this.heldPanel) if (h.pageId === pageId) this.releaseHeld(k);

    if (!isEdit) {
      // Kein eigener Name-Text mehr über der Fläche -- steht bereits in der Seitenleiste (aktiver
      // Menüpunkt) und in der Breadcrumb-Zeile, eine dritte Stelle war überflüssig (Hendriks Feedback).
      // Nebeneffekt: die Fläche bekommt dadurch etwas mehr Höhe, ganz im Sinne von "so groß wie möglich".
      body.innerHTML = this.renderCanvasHtml(page, false);
      // Echtes Drücken/Loslassen (nicht nur "click") -- löst die Zuordnung über die MappingEngine
      // genau wie eine physische Taste aus, für die volle Dauer des Antippens (wichtig für Halten-
      // Funktionen wie Gas geben, nicht nur kurze Umschalt-Aktionen). .sm-btn-active zeigt sofort
      // sichtbar an, dass gerade gedrückt wird (Hendriks Feedback "kein gutes Feedback beim Klicken").
      body.querySelectorAll('.sm-btn').forEach(el => {
        const btn = page.buttons.find(b => b.id === el.dataset.buttonId);
        if (!btn) return;
        const isAssigned = !!(btn.functionId || btn.quickActions);

        const press = (e) => {
          e.preventDefault();
          if (!isAssigned) { window.showToast('Keine Funktion zugeordnet'); return; }
          this.pressHeld(pageId, btn.id, el, e.pointerId);
        };
        const release = () => this.releaseHeld(`${pageId}:${btn.id}`);

        el.addEventListener('pointerdown', press);
        el.addEventListener('pointerup', release);
        el.addEventListener('pointercancel', release);
        el.addEventListener('pointerleave', release);
      });
      // Anzeigen mit „Beim Antippen“ lösen wie eine Taste aus (Paket J) -- ohne Zuordnung bleiben sie still
      body.querySelectorAll('.sm-display').forEach(el => {
        const a = (page.displays || []).find(x => x.id === el.dataset.displayId);
        if (!a || !(a.functionId || a.quickActions)) return;
        el.classList.add('sm-display-tap');
        const press = (e) => {
          e.preventDefault();
          this.pressHeld(pageId, a.id, el, e.pointerId);
        };
        const release = () => this.releaseHeld(`${pageId}:${a.id}`);
        el.addEventListener('pointerdown', press);
        el.addEventListener('pointerup', release);
        el.addEventListener('pointercancel', release);
        el.addEventListener('pointerleave', release);
      });
      this.resizeCanvas(pageId);
      // Erst nach dem laufenden Seitenwechsel ausleihen: verlässt man gerade die Startseite, gibt tiles.js dort
      // zuerst seine Bausteine zurück (dessen tabchanged-Handler läuft nach diesem)
      setTimeout(() => this.mountEmbeds(pageId), 0);
      return;
    }

  }

  // Kachel-Taste drücken/loslassen (Taste oder antippbare Anzeige) -- s. heldPanel im Konstruktor
  pressHeld(pageId, id, el, pointerId) {
    const key = `${pageId}:${id}`;
    if (this.heldPanel.has(key)) return;
    this.heldPanel.set(key, { pageId, id, el, pointerId });
    el.classList.add('sm-btn-active');
    this.socket.emit('panel-button-down', { pageId, buttonId: id });
  }
  releaseHeld(key) {
    const h = this.heldPanel.get(key);
    if (!h) return;
    this.heldPanel.delete(key);
    h.el.classList.remove('sm-btn-active');
    this.socket.emit('panel-button-up', { pageId: h.pageId, buttonId: h.id });
  }

  // Änderung von einem anderen Gerät: Kacheln neu laden und sichtbare Flächen neu zeichnen; eine gerade im Editor
  // offene Kachel bleibt unangetastet (der Editor arbeitet auf seiner Kopie)
  async onRemoteChange() {
    if (this.remoteReload || this.editingPageId) return;   // im Editor: der lädt beim Schließen ohnehin neu
    this.remoteReload = setTimeout(async () => {
      this.remoteReload = null;
      await this.loadPages();
      if (window.tilePages?.home) window.tilePages.render();
      const open = document.querySelector('.tab-content.active')?.id.replace('tab-', '');
      if (open && open !== this.editingPageId && this.pages.some(p => p.id === open)) this.renderPageBody(open);
    }, 300);
  }

  renderCanvasHtml(page, isEdit) {
    // Reihenfolge bewusst Grafik -> Text -> Taste: Grafiken sind reine Hintergrund-/Dekorationselemente,
    // Text typischerweise eine Beschriftung/Überschrift dazu, Tasten liegen IMMER zuoberst (DOM-Reihenfolge
    // = Stapelreihenfolge bei sonst gleichem position:absolute) und bleiben so garantiert klickbar, auch
    // wenn eine Grafik/ein Text darunter/danebenliegt. Beide sind wie Tasten IMMER sichtbar (auch im
    // Anzeige-Modus, s. Klassenkommentar oben) -- nur Ziehen/Skalieren/Auswählen ist editier-exklusiv
    // (Handle/Klick-Listener nur im Editier-Modus verdrahtet, s. attachCanvasHandlers()).
    // Seit dem Kachel-Editor (22.10.2026) bestimmt page.layers die Reihenfolge (hinten → vorne) über alle Arten; ohne
    // Liste bzw. für noch nicht eingetragene Elemente gilt die frühere feste Reihenfolge
    const elementsHtml = smLayerOrder(page).map(([kind, el]) => {
      if (kind === 'graphic') return this.renderGraphicHtml(el, isEdit, false);
      if (kind === 'text') return this.renderTextHtml(el, isEdit, false);
      if (kind === 'display') return this.renderDisplayHtml(el, isEdit, false);
      if (kind === 'embed') return this.renderEmbedHtml(el, isEdit, false);
      return this.renderButtonHtml(el, isEdit, false, false);
    }).join('');
    // Eigenes Overlay-Element statt background-image direkt auf .sm-canvas-wrap/-placeholder: die Fläche
    // hat dort schon entweder ein <img> (Hintergrundbild) oder ihren eigenen CSS-Verlauf (Platzhalter) --
    // ein eigenes, dazwischenliegendes Element funktioniert für beide Fälle einheitlich und verdeckt
    // keins von beidem. pointer-events:none (s. CSS) lässt Klicks/Ziehen ungehindert durch. Nur im
    // Editier-Modus vorhanden (Anzeige-Modus braucht kein Einrasten).
    const gridOverlayHtml = isEdit ? '<div class="sm-grid-overlay"></div>' : '';
    if (page.background) {
      return `
        <div class="sm-canvas-wrap" data-page-id="${page.id}">
          <img src="${escapeHtml(bust(page.background))}" alt="${escapeHtml(page.name)}">
          ${gridOverlayHtml}
          ${elementsHtml}
        </div>`;
    }
    return `
      <div class="sm-canvas-placeholder" data-page-id="${page.id}">
        ${gridOverlayHtml}
        ${elementsHtml}
      </div>`;
  }

  // Rein visuell, kein Klickverhalten -- outerStyle (Position+Größe) auf dem äußeren Element, Drehung
  // separat auf einem inneren (gleiches Zwei-Ebenen-Prinzip wie bei Tasten, s. renderButtonHtml(): so
  // kann applyElementOuterStyle() beim Ziehen/Skalieren die Drehung unangetastet lassen). Ohne
  // hochgeladenes Bild ein gestrichelter Platzhalter-Rahmen, analog zur Seiten-Platzhalterfläche.
  renderGraphicHtml(g, isEdit, isSelected) {
    const outerStyle = `left:${g.x}%; top:${g.y}%; width:${g.width}%; height:${g.height}%;`;
    const selectedClass = isSelected ? 'selected' : '';
    const handle = isEdit ? '<div class="sm-resize-handle" data-role="resize"></div>' : '';
    const innerHtml = g.src
      ? `<img src="${escapeHtml(bust(g.src))}" alt="">`
      : '<div class="sm-graphic-placeholder">Grafik</div>';
    return `<div class="sm-graphic ${selectedClass}" style="${outerStyle}" data-graphic-id="${g.id}" data-show="${g.show || 'immer'}">
      <div class="sm-graphic-inner" style="transform: rotate(${g.rotation || 0}deg);">${innerHtml}</div>
      ${handle}
    </div>`;
  }

  // Baustein-Element (Hendrik 22.10.2026): ein eingebauter Baustein (Karte, Cockpit, Stoppuhr …) als frei platzierbare
  // Fläche. In der Ansicht leiht tiles.js ihm den echten Baustein (mountEmbeds()), der sich wie in einer Kachel der
  // Größe anpasst (.baustein-host); im Editor steht nur ein beschrifteter Platzhalter, damit Ziehen nichts auslöst.
  renderEmbedHtml(e, isEdit, isSelected) {
    const outerStyle = `left:${e.x}%; top:${e.y}%; width:${e.width}%; height:${e.height}%;`;
    const handle = isEdit ? '<div class="sm-resize-handle" data-role="resize"></div>' : '';
    const name = window.tilePages?.moduleName(e.baustein) || e.baustein;
    return `<div class="sm-embed ${isSelected ? 'selected' : ''}" style="${outerStyle}" data-embed-id="${e.id}" data-show="${e.show || 'immer'}">
      <div class="sm-embed-body baustein-host" data-baustein="${escapeHtml(e.baustein)}">${isEdit ? `<div class="sm-embed-placeholder"><b>${escapeHtml(name)}</b><small>Element</small></div>` : ''}</div>
      ${handle}
    </div>`;
  }

  // Ansicht: echte Bausteine in die Elemente holen (nur solange die Fläche zu sehen ist)
  mountEmbeds(pageId) {
    const body = document.querySelector(`.sm-page-body[data-page-id="${pageId}"]`);
    if (!body || this.editingPageId === pageId || !body.offsetParent || !window.tilePages) return;
    window.tilePages.releaseOwner(pageId);
    const page = this.pages.find(p => p.id === pageId);
    body.querySelectorAll('.sm-embed-body').forEach(el => {
      const e = (page?.embeds || []).find(x => x.id === el.closest('.sm-embed')?.dataset.embedId);
      window.tilePages.mountEmbed(el.dataset.baustein, el, pageId, e?.opts || {});
    });
  }

  // Anzeige mit Spielwert (Paket J): Rahmen wie eine Grafik, Inhalt aus anzeigen.js (Container-Einheiten
  // lassen Schrift und Tacho mit der Größe mitwachsen). Im Editor mit Resize-Handle.
  renderDisplayHtml(a, isEdit, isSelected) {
    const outerStyle = `left:${a.x}%; top:${a.y}%; width:${a.width}%; height:${a.height}%;`;
    const handle = isEdit ? '<div class="sm-resize-handle" data-role="resize"></div>' : '';
    const badge = isEdit && (a.functionId || a.quickActions) ? '<span class="sm-display-badge">antippbar</span>' : '';
    const inner = window.anzeigen ? window.anzeigen.html(a) : '';
    return `<div class="sm-display ${isSelected ? 'selected' : ''}" style="${outerStyle}" data-display-id="${a.id}" data-value="${escapeHtml(a.value || '')}" data-show="${a.show || 'immer'}">
      <div class="sm-display-inner anz-box">${inner}</div>
      ${badge}${handle}
    </div>`;
  }

  // Live-Werte: Anzeigen und Tasten mit Zustand auf allen gerade sichtbaren Bedienpanel-Flächen
  updateLive() {
    const A = window.anzeigen;
    if (!A) return;
    document.querySelectorAll('.sm-display[data-display-id]').forEach(el => {
      if (!el.offsetParent) return; // unsichtbar -- nichts zu tun
      const page = this.pages.find(p => p.id === el.closest('[data-page-id]')?.dataset.pageId);
      const a = page?.displays?.find(x => x.id === el.dataset.displayId);
      const inner = el.querySelector('.sm-display-inner');
      if (!a || !inner) return;
      const html = A.html(a);
      if (inner._last !== html) { inner.innerHTML = html; inner._last = html; }
    });
    document.querySelectorAll('.sm-btn[data-state-src]').forEach(el => {
      if (!el.offsetParent) return;
      const st = A.keyState(el.dataset.stateSrc);
      el.classList.toggle('sm-btn-lit', !!st?.lit);
      const v = el.querySelector('.sm-btn-state');
      if (v && st?.text != null && v.textContent !== st.text) v.textContent = st.text;
    });
  }

  // Freier Textzug, kein Resize-Handle (Höhe ergibt sich aus dem Inhalt, s. normalizeText()-Kommentar
  // serverseitig) -- nur Ziehen (Position) + ein Textgröße-/Breite-Regler im Panel.
  renderTextHtml(t, isEdit, isSelected) {
    const outerStyle = `left:${t.x}%; top:${t.y}%; width:${t.width}%;`;
    const selectedClass = isSelected ? 'selected' : '';
    const color = SM_BUTTON_COLORS.find(c => c.id === t.color);
    const colorStyle = color ? `color:${color.hex};` : '';
    return `<div class="sm-text-el ${selectedClass}" style="${outerStyle}" data-text-id="${t.id}" data-show="${t.show || 'immer'}">
      <div class="sm-text-inner" style="${colorStyle} transform: rotate(${t.rotation || 0}deg); font-size:${t.fontSize || 3}vw;">${escapeHtml(t.text)}</div>
    </div>`;
  }

  renderButtonHtml(btn, isEdit, isSelected, isPrimary) {
    // Höhe hier nur ein Platzhalter (vorläufig auf smHeightBasis(), also bei Kreis/Dreieck "quadratisch"
    // in Prozent) -- resizeCanvas() korrigiert sie SOFORT nach dem Einfügen ins DOM anhand des
    // tatsächlichen Pixel-Seitenverhältnisses der Fläche, damit Kreise/Quadrate nie zu Ovalen/Rechtecken
    // verzerrt werden (Hendriks Bug-Report: width%/height% sind sonst relativ zu unterschiedlich großen
    // Dimensionen).
    const outerStyle = `left:${btn.x}%; top:${btn.y}%; width:${btn.size}%; height:${smHeightBasis(btn)}%;`;
    const shapeClass = `sm-btn-shape-${btn.shape || 'circle'}`;
    const filledClass = (btn.functionId || btn.quickActions) ? 'filled' : 'empty';
    const color = SM_BUTTON_COLORS.find(c => c.id === btn.color);
    const colorStyle = color ? `background-color:${color.hex};` : '';
    // Eckenradius nur bei Vierecken sinnvoll (Kreis ist immer rund, Dreieck kann clip-path nicht
    // abrunden) -- als Inline-Style, damit er den CSS-Klassen-Fallback (s. .sm-btn-shape-square) gezielt
    // überschreiben kann, sobald Hendrik ihn einmal einstellt.
    const cornerStyle = (btn.shape === 'square' && btn.cornerRadius != null) ? `border-radius:${btn.cornerRadius}cqmin;` : '';
    // Nur die FORM dreht sich (eigenes inneres Element) -- die Beschriftung ist ein Geschwister-Element
    // und bleibt dadurch unabhängig von der Drehung immer aufrecht (Hendriks ausdrückliche Vorgabe).
    const shapeStyle = `transform: rotate(${btn.rotation || 0}deg); ${colorStyle} ${cornerStyle}`;
    const selectedClass = isSelected ? 'selected' : '';
    // "primary" ist bei Mehrfachauswahl die zuletzt angefasste Taste -- nur sie zeigt den Resize-Handle
    // (Skalieren mehrerer Tasten gleichzeitig wurde nicht verlangt) und ihre Eigenschaften erscheinen im
    // Panel, s. selectButton()/toggleButtonSelection().
    const primaryClass = isPrimary ? 'selected-primary' : '';
    // Resize-Handle ist immer im Markup (nur per CSS bei .selected-primary sichtbar) -- so bleibt das
    // Element beim Auswählen/Abwählen unverändert vorhanden, ein Re-Render mitten im Ziehen ist nicht nötig.
    const handle = isEdit ? '<div class="sm-resize-handle" data-role="resize"></div>' : '';
    // font-size hier nur ein grober Platzhalter (rem-basiert) -- resizeCanvas() setzt ihn sofort exakt
    // in Pixeln, abgeleitet aus fontSize% und der tatsächlichen Flächenbreite (s. labelFontSizePx()).
    // Piktogramm hat Vorrang vor Text (beide teilen sich denselben Platz, s. renderButtonParamsContent());
    // label bleibt beim Umschalten auf ein Icon gespeichert, nur die ANZEIGE ist exklusiv.
    const labelInner = btn.icon ? smIconSvg(btn.icon) : (btn.label ? escapeHtml(btn.label) : '');
    const labelStyle = btn.icon ? '' : `font-size:${btn.fontSize || 2}vw`;
    const labelHtml = labelInner ? `<div class="sm-btn-label" style="${labelStyle}">${labelInner}</div>` : '';
    // Zustand (Paket J): an/aus lässt die Taste leuchten (sm-btn-lit), Zahl/Text steht klein im Knopf
    const st = btn.stateSource && window.anzeigen ? window.anzeigen.keyState(btn.stateSource) : null;
    const stateAttr = btn.stateSource ? ` data-state-src="${escapeHtml(btn.stateSource)}"` : '';
    const stateHtml = st && st.text != null ? `<div class="sm-btn-state">${escapeHtml(st.text)}</div>` : '';
    return `<div class="sm-btn ${selectedClass} ${primaryClass} ${st?.lit ? 'sm-btn-lit' : ''}" style="${outerStyle}" data-button-id="${btn.id}" data-show="${btn.show || 'immer'}"${stateAttr}>
      <div class="sm-btn-shape ${shapeClass} ${filledClass}" style="${shapeStyle}"></div>
      ${labelHtml}
      ${stateHtml}
      ${handle}
    </div>`;
  }

  // Setzt Position+Größe EINER Taste korrekt fürs aktuelle Pixel-Seitenverhältnis der Fläche (s.
  // resizeCanvas()) -- size%/smHeightBasis()% sind relativ zur Flächen-BREITE definiert, die tatsächliche
  // Höhe wird daraus so abgeleitet, dass die Taste in echten Pixeln unverzerrt bleibt (heightPercent =
  // smHeightBasis() * W/H) -- außer bei einem Viereck mit eigens gesetzter heightSize, das darf ja
  // bewusst länglich/breit sein (Hendriks Wunsch).
  buttonOuterStyle(btn, containerAspect) {
    const heightPercent = smHeightBasis(btn) * (containerAspect || 1);
    return `left:${btn.x}%; top:${btn.y}%; width:${btn.size}%; height:${heightPercent}%;`;
  }

  // Kein Scrollen (Hendriks harte Vorgabe) UND kein Verschieben/Überlappen der Tasten bei anderem
  // Fenster-/Bildschirm-Seitenverhältnis (Hendriks Bug-Report): die Fläche behält IMMER SM_CANVAS_ASPECT
  // und wird nur als Ganzes ("contain"-Prinzip, gleicher Faktor in beide Richtungen) auf die
  // größtmögliche Größe skaliert, die ohne Scrollen in den verfügbaren Platz passt -- je nachdem, ob
  // Breite oder Höhe zuerst an ihre Grenze stößt, bleibt links/rechts oder oben/unten etwas frei
  // (CSS margin:auto zentriert). Verfügbare Breite wird am ELTERNELEMENT gemessen (dessen Breite hängt
  // nicht von der Fläche selbst ab). Verfügbare Höhe: ALLE Box-Modell-Werte, die zwischen der Fläche und
  // dem echten unteren Rand von <main> liegen (Card-Padding/-Rand/-Außenabstand, <main>s eigenes
  // Padding), werden EINZELN per getComputedStyle GEMESSEN statt als ein Gesamtwert geraten zu werden --
  // ein geratener/unvollständiger Wert hat an anderer Stelle im Projekt schon mehrfach zu Scroll-Bugs
  // geführt (zuletzt hier selbst: ein erster Versuch mit nur "-24" vergaß das card-margin-bottom und
  // überlief bei bestimmten Fensterhöhen weiterhin um ~20px). box-sizing:border-box wird der Fläche
  // erzwungen gesetzt, damit ihr eigener Rahmen nicht zusätzlich zur gesetzten Höhe addiert wird.
  resizeCanvas(pageId) {
    const body = document.querySelector(`.sm-page-body[data-page-id="${pageId}"]`);
    const canvas = body?.querySelector('.sm-canvas-wrap, .sm-canvas-placeholder');
    const page = this.pages.find(p => p.id === pageId);
    if (!body || !canvas || !page) return;

    canvas.style.boxSizing = 'border-box';
    // Als Kachel auf der Startseite gelten eigene Regeln (s. fitIntoTile())
    if (body.closest('.tile-body, .tile-full-body') && this.editingPageId !== pageId) { this.fitIntoTile(page, body, canvas); return; }

    const availableWidth = body.getBoundingClientRect().width;
    const top = canvas.getBoundingClientRect().top;

    const card = body.closest('.card');
    const main = document.querySelector('main');
    const cardStyle = card ? getComputedStyle(card) : null;
    const reservedBelowCanvas = cardStyle
      ? (parseFloat(cardStyle.paddingBottom) || 0) + (parseFloat(cardStyle.borderBottomWidth) || 0) + (parseFloat(cardStyle.marginBottom) || 0)
      : 0;
    const mainPaddingBottom = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;

    const availableHeight = Math.max(120, window.innerHeight - top - reservedBelowCanvas - mainPaddingBottom);

    const aspect = SM_CANVAS_ASPECT;
    let width = availableWidth;
    let height = width / aspect;
    if (height > availableHeight) {
      height = availableHeight;
      width = height * aspect;
    }
    this.layoutCanvas(page, canvas, width, height, aspect);
  }

  // Baustein in einer Kachel (Hendrik 22.10.2026: „passt sich an“ und „zeigen ab“). Ohne Hintergrundbild füllt die
  // Fläche die Kachel ganz aus; Elemente, die erst ab einer größeren Kachel erscheinen sollen, fallen weg, die übrigen
  // füllen den Platz (s. unten). Mit Hintergrundbild wird die Fläche als Ganzes eingepasst, sonst säßen die Tasten
  // nicht mehr an ihrer Stelle auf dem Bild.
  fitIntoTile(page, body, canvas) {
    if (!body._fitObserver && window.ResizeObserver) {
      body._fitObserver = new ResizeObserver(() => {
        if (body.closest('.tile-body, .tile-full-body')) this.resizeCanvas(body.dataset.pageId);
      });
      body._fitObserver.observe(body);
    }
    const r = body.getBoundingClientRect();
    const W = Math.floor(r.width), H = Math.floor(r.height);
    if (W < 20 || H < 20) return;
    if (page.background) {
      let w = W, h = W / SM_CANVAS_ASPECT;
      if (h > H) { h = H; w = H * SM_CANVAS_ASPECT; }
      this.layoutCanvas(page, canvas, Math.floor(w), Math.floor(h), SM_CANVAS_ASPECT);
      return;
    }
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    // Kachelform aus tiles.js (data-form); ganze Seite und Formen mit eigener Anordnung genau wie entworfen, die übrigen automatisch
    const form = body.closest('[data-form]')?.dataset.form || '2x3';
    if (form === '2x3' || page.varianten?.[form]) this.placeDesigned(this.formPage(page, form, W / H), canvas, W, H, W / H);
    else this.applyArrangement(canvas, this.autoArrange(page, W, H));
  }

  // Entworfene Anordnung auf eine Fläche W × H: Mittelpunkte in % der echten Fläche, Größen nach der Breite, die bei
  // gleichem Seitenverhältnis wie im Entwurf hineinpasst -- so bleibt alles rund und überlappt nicht neu.
  placeDesigned(fp, canvas, W, H, aspect) {
    const Wv = Math.min(W, H * aspect);
    const px = v => `${((v * Wv) / 100).toFixed(1)}px`;
    const byId = new Map();
    for (const [kind, key] of Object.entries(SM_KIND_LIST)) (fp[key] || []).forEach(e => byId.set(e.id, [kind, e]));
    canvas.querySelectorAll('.sm-btn, .sm-graphic, .sm-display, .sm-embed, .sm-text-el').forEach(el => {
      const id = el.dataset.buttonId || el.dataset.graphicId || el.dataset.displayId || el.dataset.embedId || el.dataset.textId;
      const hit = byId.get(id);
      if (!hit) { el.style.display = 'none'; return; }     // in dieser Form ausgeblendet
      const [kind, e] = hit;
      if (kind === 'button') {
        el.setAttribute('style', `left:${e.x}%; top:${e.y}%; width:${px(e.size)}; height:${px(smHeightBasis(e))};`);
        const label = el.querySelector('.sm-btn-label');
        if (label) label.style.fontSize = this.labelFontSizePx(e, Wv) + 'px';
      } else if (kind === 'text') {
        el.setAttribute('style', `left:${e.x}%; top:${e.y}%; width:${px(e.width)};`);
        const inner = el.querySelector('.sm-text-inner');
        if (inner) inner.style.fontSize = this.labelFontSizePx(e, Wv) + 'px';
      } else {
        el.setAttribute('style', `left:${e.x}%; top:${e.y}%; width:${px(e.width)}; height:${px(e.height)};`);
      }
    });
  }

  // Automatische Anordnung für eine Fläche W × H (Pixel) -- reine Rechnung, gebraucht von der Kachel, der Vorschau im
  // Editor und „Eigene Anordnung anlegen“. Ergebnis je Element-ID: { kind, hidden } oder { kind, cx, cy, w, h, font }.
  autoArrange(page, W, H) {
    // Größenstufe wie bei den festen Bausteinen (style.css, Container „kachel“): klein = 1 Feld, groß = ab 2 × 2
    const level = W > 560 && H > 460 ? 2 : W <= 560 && H <= 460 ? 0 : 1;
    const LV = { immer: 0, mittel: 1, gross: 2 };
    // Entwurf in Bezugseinheiten (16:9, 1000 breit); Größen sind dort alle in % der Breite angegeben
    const RW = 1000, RH = RW / SM_CANVAS_ASPECT, u = v => (v / 100) * RW;
    const res = new Map();
    const items = [];
    const add = (kind, half) => (page[SM_KIND_LIST[kind]] || []).forEach(o => {
      if ((LV[o.show] || 0) > level) { res.set(o.id, { kind, hidden: true }); return; }
      const [hw, hh] = half(o);
      items.push({ kind, o, cx: (o.x / 100) * RW, cy: (o.y / 100) * RH, hw, hh });
    });
    add('button', b => [u(b.size) / 2, u(smHeightBasis(b)) / 2]);
    add('graphic', g => [u(g.width) / 2, u(g.height) / 2]);
    add('display', a => [u(a.width) / 2, u(a.height) / 2]);
    add('embed', e => [u(e.width) / 2, u(e.height) / 2]);
    add('text', t => [u(t.width) / 2, u(t.fontSize || 3) * 0.7]);
    const put = (it, k, cx, cy) => {
      const o = it.o;
      const r = { kind: it.kind, cx, cy };
      if (it.kind === 'button') Object.assign(r, { w: u(o.size) * k, h: u(smHeightBasis(o)) * k, font: u(o.fontSize || 2) * k });
      else if (it.kind === 'text') Object.assign(r, { w: u(o.width) * k, font: u(o.fontSize || 3) * k });
      else Object.assign(r, { w: u(o.width) * k, h: u(o.height) * k });
      res.set(o.id, r);
    };
    if (!items.length) return res;
    // Ein einzelnes Element mit festem Baustein (z. B. Geräteliste) füllt die ganze Fläche -- seine Inhalte passen sich selbst an
    if (items.length === 1 && items[0].kind === 'embed') {
      const m = Math.round(Math.min(W, H) * 0.02);
      res.set(items[0].o.id, { kind: 'embed', cx: W / 2, cy: H / 2, w: W - 2 * m, h: H - 2 * m });
      return res;
    }
    // Die sichtbaren Elemente füllen die Fläche: ihre Mittelpunkte verteilen sich auf die ganze Fläche (je Richtung
    // gestreckt), ihre Größen wachsen gleichmäßig so weit, wie es die knappere Richtung erlaubt -- so entsteht keine
    // Überlappung, die im Entwurf nicht schon da war, und Kreise bleiben rund.
    const pad = 0.015 * RW;
    const x0 = Math.min(...items.map(i => i.cx - i.hw)) - pad, x1 = Math.max(...items.map(i => i.cx + i.hw)) + pad;
    const y0 = Math.min(...items.map(i => i.cy - i.hh)) - pad, y1 = Math.max(...items.map(i => i.cy + i.hh)) + pad;
    const bw = x1 - x0, bh = y1 - y0;
    const k = Math.min(W / bw, H / bh);
    // Ist die Fläche viel schmaler/höher (oder flacher/breiter) als der Entwurf, werden die Elemente so klein, dass es
    // besser ist, sie in Lesereihenfolge untereinander (bzw. nebeneinander) zu stellen -- das wird nur genommen, wenn
    // die Elemente dadurch deutlich größer werden.
    const order = [...items].sort((a, b) => (a.cy - b.cy) || (a.cx - b.cx));
    const gap = 0.02 * RW;
    const sumH = order.reduce((n, i) => n + 2 * i.hh, 0) + gap * (order.length - 1);
    const sumW = order.reduce((n, i) => n + 2 * i.hw, 0) + gap * (order.length - 1);
    const maxW = Math.max(...order.map(i => 2 * i.hw)), maxH = Math.max(...order.map(i => 2 * i.hh));
    const kCol = Math.min(W / (maxW + 2 * pad), H / (sumH + 2 * pad));
    const kRow = Math.min(W / (sumW + 2 * pad), H / (maxH + 2 * pad));
    if (order.length > 1 && Math.max(kCol, kRow) > k * 1.25) {
      const col = kCol >= kRow;
      const kk = col ? kCol : kRow;
      const used = (col ? sumH : sumW) * kk;
      const space = ((col ? H : W) - used) / (order.length + 1);   // übrigen Platz gleichmäßig verteilen
      let pos = space;
      for (const it of order) {
        const len = 2 * (col ? it.hh : it.hw) * kk;
        const c = pos + len / 2;
        put(it, kk, col ? W / 2 : c, col ? c : H / 2);
        pos += len + space + gap * kk;
      }
      return res;
    }
    for (const it of items) put(it, k, ((it.cx - x0) / bw) * W, ((it.cy - y0) / bh) * H);
    return res;
  }

  // Ergebnis von autoArrange() auf die Elemente einer Fläche anwenden (Pixel)
  applyArrangement(canvas, arr) {
    canvas.querySelectorAll('.sm-btn, .sm-graphic, .sm-display, .sm-embed, .sm-text-el').forEach(el => {
      const id = el.dataset.buttonId || el.dataset.graphicId || el.dataset.displayId || el.dataset.embedId || el.dataset.textId;
      const a = arr.get(id);
      if (!a || a.hidden) { el.style.display = 'none'; return; }
      if (a.kind === 'text') {
        el.setAttribute('style', `left:${a.cx}px; top:${a.cy}px; width:${a.w}px;`);
        const inner = el.querySelector('.sm-text-inner');
        if (inner) inner.style.fontSize = a.font + 'px';
        return;
      }
      el.setAttribute('style', `left:${a.cx}px; top:${a.cy}px; width:${a.w}px; height:${a.h}px;`);
      const label = a.kind === 'button' && el.querySelector('.sm-btn-label');
      if (label) label.style.fontSize = a.font + 'px';
    });
  }

  // ---------- Kachelformen im Editor ----------
  basePage(pageId) { return this.basePages.find(p => p.id === pageId) || null; }

  // Größe der Fläche einer Kachel dieser Form auf DIESEM Bildschirm (Hendrik 22.10.2026: im Editor in Originalgröße
  // zeigen, damit man Lesbarkeit nicht verschätzt). Gemessen an einer unsichtbaren Probe-Kachel aus denselben
  // Bausteinen wie die Startseite (tiles.js gridHtml(): Raster 3 × 2, Kachelkopf, Innenabstand), je Fenstergröße gemerkt.
  formSize(form) {
    if (!SM_FORM_SIZE[form]) return null;
    const chrome = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--chrome-height')) || 64;
    const gw = window.innerWidth - 20, gh = window.innerHeight - chrome - 20;   // body.home-mode main: 10 px Rand
    const key = `${form}:${gw}x${gh}`;
    this.formSizeCache = this.formSizeCache || {};
    if (this.formSizeCache[key]) return this.formSizeCache[key];
    const [rows, cols] = form.split('x').map(Number);
    const probe = document.createElement('div');
    probe.className = 'home-grid';
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = `position:fixed; left:-100000px; top:0; width:${gw}px; height:${gh}px; visibility:hidden; pointer-events:none;`;
    probe.innerHTML = `<div class="tile${rows === 1 ? ' tile--short' : ''}${rows === 1 && cols > 1 ? ' tile--flat' : ''}" style="grid-row: 1 / span ${rows}; grid-column: 1 / span ${cols};">
        <div class="tile-head"><button type="button" class="tile-title">Kachel</button><button type="button" class="tile-gear">${navIcon('sliders')}</button></div>
        <div class="tile-body baustein-host" data-form="${form}"><section class="card"><div class="sm-page-body"></div></section></div>
      </div>`;
    document.body.appendChild(probe);
    const r = probe.querySelector('.sm-page-body').getBoundingClientRect();
    probe.remove();
    const size = r.width > 40 && r.height > 40 ? [Math.floor(r.width), Math.floor(r.height)] : SM_FORM_SIZE[form];
    this.formSizeCache[key] = size;
    return size;
  }
  // Festes Seitenverhältnis je Kachelform (Hendrik 22.10.2026: Editor am PC, „wir behalten einfach immer das gleiche
  // Seitenverhältnis“) -- Bezug ist das 1280 × 800-Tablet; auf der Startseite rechnet formPage() auf die echte Kachel um
  formAspect(form) {
    const sz = SM_FORM_SIZE[form];
    return sz ? sz[0] / sz[1] : SM_CANVAS_ASPECT;
  }

  // this.pages = Kacheln vom Server (früher mit der Anordnung der im alten Editor gewählten Form überlagert)
  applyFormOverlay() {
    this.pages = [...this.basePages];
  }

  // Baustein in einer Kachelform: eigene Anordnung (Lage/Größe je Element, ausgeblendete fehlen) oder -- ohne eigene
  // Anordnung -- die automatische, umgerechnet auf die Bezugsgröße der Form
  // Die ganze Seite ist als 16:9-Fläche entworfen und wird genauso umgerechnet (bis 23.10.2026 nur eingepasst).
  formPage(page, form, aCur = this.formAspect(form)) {
    const whole = !form || form === '2x3';
    if (whole && Math.abs(aCur - SM_CANVAS_ASPECT) < 0.02) return page;
    const v = whole ? null : (page.varianten?.[form] || this.autoGeometry(page, form));
    const out = { ...page };
    for (const [kind, key] of Object.entries(SM_KIND_LIST)) {
      out[key] = (page[key] || []).filter(e => whole || (v[e.id] && !v[e.id].hidden)).map(e => {
        const gv = smAdaptGeom(kind, whole ? { ...e, a: SM_CANVAS_ASPECT } : v[e.id], aCur, e);
        const g = {};
        for (const k of SM_GEOM_KEYS[kind]) if (typeof gv[k] === 'number') g[k] = gv[k];
        return { ...e, ...g };
      });
    }
    return out;
  }

  // Automatische Anordnung einer Form als Lage/Größe in % (wie eine eigene Anordnung gespeichert würde)
  autoGeometry(page, form) {
    const [W, H] = SM_FORM_SIZE[form];
    const r2 = v => Math.round(v * 100) / 100;
    const pct = v => r2((v / W) * 100);
    const geom = {};
    for (const [id, a] of this.autoArrange(page, W, H)) {
      if (a.hidden) { geom[id] = { hidden: true }; continue; }
      const g = { x: r2((a.cx / W) * 100), y: r2((a.cy / H) * 100) };
      if (a.kind === 'button') Object.assign(g, { size: pct(a.w), heightSize: pct(a.h), fontSize: pct(a.font) });
      else if (a.kind === 'text') Object.assign(g, { width: pct(a.w), fontSize: pct(a.font) });
      else Object.assign(g, { width: pct(a.w), height: pct(a.h) });
      geom[id] = g;
    }
    return geom;
  }

  formName(form) { return (SM_FORMS.find(([f]) => f === form) || [])[1] || form; }


  // Fläche mit festem Seitenverhältnis auf width × height setzen und alle Elemente danach ausrichten
  layoutCanvas(page, canvas, width, height, aspect = SM_CANVAS_ASPECT) {
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    canvas.querySelectorAll('.sm-btn').forEach(el => {
      const btn = page.buttons.find(b => b.id === el.dataset.buttonId);
      if (!btn) return;
      el.setAttribute('style', this.buttonOuterStyle(btn, aspect));
      const label = el.querySelector('.sm-btn-label');
      if (label) label.style.fontSize = this.labelFontSizePx(btn, width) + 'px';
    });

    // Grafiken brauchen dieselbe Korrektur wie Tasten (renderGraphicHtml() setzt height% zunächst
    // ungeprüft als Platzhalter, s. Kommentar dort) -- Text hat keine gespeicherte Höhe (ergibt sich aus
    // dem Inhalt), braucht deshalb nur die Schriftgröße in Pixeln (wie eine Tasten-Beschriftung).
    canvas.querySelectorAll('.sm-graphic').forEach(el => {
      const g = (page.graphics || []).find(x => x.id === el.dataset.graphicId);
      if (g) this.applyElementOuterStyle(el, g, 'graphic', aspect);
    });
    canvas.querySelectorAll('.sm-display').forEach(el => {
      const a = (page.displays || []).find(x => x.id === el.dataset.displayId);
      if (a) this.applyElementOuterStyle(el, a, 'display', aspect);
    });
    canvas.querySelectorAll('.sm-embed').forEach(el => {
      const e = (page.embeds || []).find(x => x.id === el.dataset.embedId);
      if (e) this.applyElementOuterStyle(el, e, 'embed', aspect);
    });
    canvas.querySelectorAll('.sm-text-el').forEach(el => {
      const t = (page.texts || []).find(x => x.id === el.dataset.textId);
      if (!t) return;
      const inner = el.querySelector('.sm-text-inner');
      if (inner) inner.style.fontSize = this.labelFontSizePx(t, width) + 'px';
    });
  }

  // Schriftgröße ist wie size% relativ zur Flächen-BREITE definiert (einstellbar, s. setButtonFontSize())
  // -- dieselbe Umrechnung wie bei der Tasten-Größe, damit Beschriftungen beim Skalieren der Fläche
  // proportional mitwachsen/-schrumpfen statt eine feste Pixelgröße zu behalten.
  labelFontSizePx(btn, canvasWidthPx) {
    return (canvasWidthPx * (btn.fontSize || 2)) / 100;
  }

  // ---------------------------------------------------------------------------------------------
  // Ziehen (Position, ggf. mehrerer Tasten gemeinsam) + Skalieren (Resize-Handle, immer nur die
  // primäre Taste) -- Muster wie ImageCropper in moduleFlow.js: pointerdown startet, ein einziger
  // globaler pointermove/pointerup rechnet Delta relativ zur Canvas-Fläche in Prozent um. Während des
  // Ziehens NUR lokale State- + Style-Änderung (kein Server-Call pro Bewegung), erst pointerup
  // persistiert per PUT (je bewegter Taste ein eigener PUT).
  // ---------------------------------------------------------------------------------------------

  // Setzt Position (+ Größe bei Taste/Grafik) direkt aufs DOM-Element, kind-übergreifend -- Drehung
  // bleibt unberührt (eigenes inneres Element, s. render*Html()).
  applyElementOuterStyle(domEl, el, kind, containerAspect) {
    if (kind === 'graphic' || kind === 'display' || kind === 'embed') {
      const heightPercent = el.height * (containerAspect || 1);
      domEl.setAttribute('style', `left:${el.x}%; top:${el.y}%; width:${el.width}%; height:${heightPercent}%;`);
      return;
    }
    if (kind === 'text') {
      domEl.setAttribute('style', `left:${el.x}%; top:${el.y}%; width:${el.width}%;`);
      return;
    }
    domEl.setAttribute('style', this.buttonOuterStyle(el, containerAspect));
  }

  // ---------------------------------------------------------------------------------------------
  // Auswahl + Bearbeitungs-Werkzeuge im linken Menü (s. #nav-level-sm-editor)
  // ---------------------------------------------------------------------------------------------


  // ---------------------------------------------------------------------------------------------
  // Dropdown-Popover für Farbe/Piktogramm ("wie die Smiley-Auswahl bei WhatsApp", Hendriks Vorgabe
  // nach der ursprünglich immer sichtbaren Reihe) -- ein gemeinsamer Öffnen-/Schließen-Mechanismus,
  // nur der Inhalt unterscheidet sich. An document.body gehängt (nicht ins schmale Seitenmenü selbst),
  // damit er nicht vom Menürand abgeschnitten wird und Sidebar-Neu-Renders (setButtonColor()/
  // setButtonIcon() rufen renderPageBody() auf) ihn nicht mitten in der Auswahl zerstören.
  // ---------------------------------------------------------------------------------------------

  openPopover(triggerEl, contentHtml, popoverClass) {
    this.closeAllPopovers();
    const popover = document.createElement('div');
    popover.className = `sm-popover ${popoverClass}`;
    popover.innerHTML = contentHtml;
    document.body.appendChild(popover);

    const rect = triggerEl.getBoundingClientRect();
    popover.style.left = rect.left + 'px';
    popover.style.top = (rect.bottom + 4) + 'px';
    const pRect = popover.getBoundingClientRect();
    if (pRect.right > window.innerWidth) popover.style.left = Math.max(4, window.innerWidth - pRect.width - 4) + 'px';
    if (pRect.bottom > window.innerHeight) popover.style.top = Math.max(4, rect.top - pRect.height - 4) + 'px';

    const closeHandler = (e) => {
      if (!popover.contains(e.target) && e.target !== triggerEl) this.closeAllPopovers();
    };
    // Erst im nächsten Tick registrieren -- sonst würde derselbe Klick, der den Popover gerade
    // geöffnet hat (der auslösende onclick auf triggerEl), sofort auch als "Außen-Klick" zählen und
    // ihn augenblicklich wieder schließen.
    setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
    popover._closeHandler = closeHandler;
  }

  closeAllPopovers() {
    document.querySelectorAll('.sm-popover').forEach(p => {
      if (p._closeHandler) document.removeEventListener('mousedown', p._closeHandler);
      p.remove();
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Grafik-Element: Panel + Hinzufügen/Bild-Upload/Größe/Drehung/Löschen.
  // ---------------------------------------------------------------------------------------------

  // ---------------------------------------------------------------------------------------------
  // Anzeigen mit Spielwerten (Paket J, Mockup Bild 5): Wert, Darstellung, Bereich, Warnfarbe,
  // Nachkommastellen, „Beim Antippen“. Bausteine und Werteliste-Fenster in anzeigen.js.
  // ---------------------------------------------------------------------------------------------

  // Gewählte Module zuerst, dann die übrigen in der Standardreihenfolge (wie tiles.js steuerungHtml())
  steuerungOrder(e) {
    const mods = window.moduleFlow?.modules || [];
    // Reihenfolge der übrigen = Module des aktiven Controllers (Geräteprofile, 23.10.2026)
    return [...(e.opts?.mods || []), ...mods.map(m => m.id)]
      .filter((id, i, a) => a.indexOf(id) === i && mods.some(m => m.id === id));
  }

  // Steuerungsübersicht in der Übersicht der Kacheln (und gleich aufgebaut im Zahnrad, tiles.js): Anzahl und Modul je Platz
  steuerungCardOptsHtml(page, e) {
    const mods = window.moduleFlow?.modules || [];
    if (!mods.length) return '<small>Module werden geladen …</small>';
    const count = e.opts?.count || 'auto';
    const name = id => mods.find(m => m.id === id)?.name || id;
    const slots = this.steuerungOrder(e).slice(0, count === 'auto' ? 3 : count);
    return `<div class="bs-opt"><span>Anzahl Module</span>
        <div class="ui-seg">${['auto', 1, 2, 3, 4].map(c => `<button type="button" class="${count === c ? 'on' : ''}" onclick="window.steuerungsmenues.setEmbedOpt('${page.id}','${e.id}','count',${c === 'auto' ? "'auto'" : c})">${c === 'auto' ? 'Auto' : c}</button>`).join('')}</div></div>
      <div class="bs-opt"><span>${slots.length === 1 ? 'Modul' : 'Module'}</span>
        <div class="planner-chips">${slots.map((id, i) => `<button type="button" class="chip" onclick="window.steuerungsmenues.pickSteuerungModule('${page.id}','${e.id}',${i})">${slots.length > 1 ? `${i + 1}. ` : ''}${escapeHtml(name(id))} ›</button>`).join('')}</div></div>
      <small>${this.steuerungCountHint(count)}</small>`;
  }
  steuerungCountHint(count) {
    return count === 'auto'
      ? 'Auto: 1 Feld zeigt Modul 1, 2 Felder Module 1–2, 3 Felder 1–3; größere Kacheln Modul 1 groß.'
      : `Zeigt ${count === 1 ? 'Modul 1' : `die Module 1–${count}`}, soweit die Kachel Platz hat.`;
  }

  // Eine Einstellung eines Elements (embed.opts) ändern; danach Editor, Übersicht und Startseite nachziehen
  async setEmbedOpt(pageId, embedId, key, value) {
    const e = this.pages.find(p => p.id === pageId)?.embeds?.find(x => x.id === embedId);
    if (!e) return;
    await this.persistEmbedPatch(pageId, embedId, { opts: { ...(e.opts || {}), [key]: value } });
    this.renderPageBody(pageId);
    if (document.getElementById('tab-sm-manage')?.offsetParent) this.renderManagePage();
    if (window.tilePages?.home) window.tilePages.render();
  }

  // Modul für einen Platz wählen; steht es schon auf einem anderen Platz, tauschen die beiden
  async pickSteuerungModule(pageId, embedId, slot) {
    const e = this.pages.find(p => p.id === pageId)?.embeds?.find(x => x.id === embedId);
    const mods = window.moduleFlow?.modules || [];
    if (!e || !mods.length) return;
    const id = await uiChoice(`Welches Modul auf Platz ${slot + 1}?`, mods.map(m => ({ label: m.name, value: m.id })), { title: 'Steuerungsübersicht' });
    if (!id) return;
    const order = this.steuerungOrder(e);
    const j = order.indexOf(id);
    if (j >= 0) order[j] = order[slot];
    order[slot] = id;
    await this.setEmbedOpt(pageId, embedId, 'mods', order);
  }

  async chooseEmbedBaustein(title) {
    const list = window.tilePages?.embedTypes() || [];
    return uiChoice('Was soll in dieses Element? Es passt sich seiner Größe an.',
      list.map(([value, label]) => ({ label, value })), { title });
  }

  // Einstellung eines Elements außerhalb des Editors speichern (Übersicht, Zahnrad: Steuerungsübersicht)
  async persistEmbedPatch(pageId, embedId, patch) {
    const b = this.pages.find(p => p.id === pageId)?.embeds?.find(x => x.id === embedId);
    if (b) Object.assign(b, patch);
    try {
      const res = await fetch(`/api/steuerungsmenue/${pageId}/embed/${embedId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch)
      });
      const result = await res.json();
      if (!result.success) { uiAlert('Speichern fehlgeschlagen: ' + result.error); return; }
      if (b) Object.assign(b, result.embed);
    } catch (error) {
      uiAlert('Speichern fehlgeschlagen: ' + error.message);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Text-Element: Panel + Hinzufügen/Inhalt/Textgröße/Breite/Drehung/Farbe/Löschen.
  // ---------------------------------------------------------------------------------------------

  // ---------------------------------------------------------------------------------------------
  // Aktions-Zuordnung (ActionPicker, s. public/js/actionPicker.js) -- ein Menü für Funktion/Achse/
  // Taste statt der früher getrennten Funktions-Auswahl und Tastatur-Schnellbelegung.
  // ---------------------------------------------------------------------------------------------

  // ---------------------------------------------------------------------------------------------
  // Hintergrundbild
  // ---------------------------------------------------------------------------------------------

  // ---------------------------------------------------------------------------------------------
  // Editier-Modus betreten/verlassen (aus der Verwaltungsseite, s. renderManagePage())
  // ---------------------------------------------------------------------------------------------

  // Kachel ohne Editor (SM_NUR_EINSTELLEN) und ihr Element mit der Steuerungsübersicht
  settingsOnly(pageId) { return SM_NUR_EINSTELLEN.includes((this.basePage(pageId) || this.pages.find(p => p.id === pageId))?.vorlage); }
  steuerungEmbed(page) { return (page?.embeds || []).find(e => e.baustein === 'steuerung') || null; }

  async enterEditMode(pageId) {
    if (this.settingsOnly(pageId)) {
      window.appNav?.go('sm-manage');
      window.showToast?.('Diese Kachel stellst du hier in der Übersicht ein: welche Module in welcher Reihenfolge.');
      return;
    }
    this.editingPageId = pageId;

    if (!this.functionsCache) {
      try {
        const [fRes, mRes] = await Promise.all([fetch('/api/functions'), fetch('/api/macros')]);
        const fData = await fRes.json();
        const mData = await mRes.json();
        this.functionsCache = new Map((fData.functions || []).map(f => [f.id, f.name]));
        (mData.macros || []).forEach(m => this.functionsCache.set(`macro:${m.id}`, `🔁 ${m.name}`));
        (await window.hubActions.pseudoFunctions()).forEach(h => this.functionsCache.set(h.id, h.name));
      } catch (error) {
        this.functionsCache = new Map();
      }
    }

    // Leisten VOR switchMainTab() ausblenden -- onTabChanged() (s.o.) erkennt Fremd-Navigation daran, dass die
    // Bedienpanel-Leiste sichtbar ist, und würde sonst den eigenen Aufruf gleich wieder aus dem Editor werfen.
    // Gearbeitet wird seit 22.10.2026 im Kachel-Editor (kachelEditor.js), der über allem liegt.
    this.showEditorSidebar();
    window.app.switchMainTab(pageId);
    window.kachelEditor.open(pageId);
    window.appNav?.renderBar();
  }

  // viewPageId gesetzt = „Ansehen“ (Paket J): zurück zur Seite selbst statt zur Verwaltung. Der Kachel-Editor speichert
  // vorher (die Ansicht zeigt danach den gespeicherten Stand).
  // opts.navigate === false: nur schließen und speichern, die Seite wählt der Aufrufer (⌂ Startseite, 23.10.2026 --
  // vorher sprang man nach dem Speichern zurück auf die Kachel-Ansicht, wenn ⌂ während des Speicherns kam)
  async exitEditMode(viewPageId = null, opts = {}) {
    await window.kachelEditor?.close();
    this.editingPageId = null;
    this.applyFormOverlay();
    this.showSteuerungsmenuesSidebar();
    this.setEditingUi(false);
    if (opts.navigate === false) return;
    if (viewPageId) {
      window.app.switchMainTab(viewPageId);
      this.renderPageBody(viewPageId);
      return;
    }
    window.app.switchMainTab('sm-manage');
    this.renderManagePage();
  }

  // Hendriks Feedback (2. Runde): die Bedienpanel-Fläche soll die volle Bildschirmhöhe/-breite
  // bekommen, die Bearbeitungs-Werkzeuge dafür komplett ins linke Menü wandern (#nav-level-sm-editor,
  // gefüllt von renderEditorSidebar()) statt eine eigene Spalte neben der Fläche zu belegen. Bewusst
  // eine eigene, schlanke Variante statt app.js showNavRoot()/showNavLevel2() wiederzuverwenden: beide
  // würden zusätzlich zwangsläufig auf den ersten Tab der Ziel-Sektion umschalten und damit den gerade
  // angezeigten Bedienpanel-Tab wieder verlassen.
  showEditorSidebar() {
    document.querySelectorAll('.nav-level').forEach(el => { el.style.display = 'none'; });
    const level = document.getElementById('nav-level-sm-editor');
    if (level) level.style.display = 'flex';
    document.getElementById('nav-back-btn').style.display = 'none';
    document.getElementById('nav-settings-btn')?.classList.remove('active');
    if (window.app) window.app.currentNavSection = null;
  }

  // Gegenstück beim Verlassen (Fertig) -- zurück zur Bedienpanel-Leiste, landet aber gezielt auf
  // "Bedienpanel verwalten" statt (wie showNavLevel2() es täte) auf der ersten Seite.
  showSteuerungsmenuesSidebar() {
    document.querySelectorAll('.nav-level').forEach(el => { el.style.display = 'none'; });
    const level = document.getElementById('nav-level-steuerungsmenues');
    if (level) level.style.display = 'flex';
    document.getElementById('nav-back-btn').style.display = 'flex';
    if (window.app) window.app.currentNavSection = 'steuerungsmenues';
  }

  // ---------------------------------------------------------------------------------------------
  // "Bedienpanel verwalten": Liste aller Seiten (Bearbeiten/Exportieren/Löschen) + Import
  // ---------------------------------------------------------------------------------------------

  // Bausteine-Übersicht (Hendrik 22.10.2026: ☰ Menü → Bausteine, eine Liste aus allen): öffnen, bearbeiten,
  // umbenennen, exportieren, auf die Vorlage zurücksetzen, löschen; dazu „+ Neuer Baustein“ und Import. Karte und
  // Arbeitsplaner sind fest (nur öffnen, als Element in andere Bausteine einbaubar). Löschen gibt es nur hier.
  // Kachel-Übersicht (23.10.2026, Hendriks freigegebener Entwurf): Abschnitte „Eigene Kacheln“ und „Aus Vorlagen“,
  // je Kachel eine Karte mit Miniatur (aus der Anordnung der ganzen Seite gezeichnet), Name, Inhalt, Stift und „⋯“.
  // Antippen öffnet die Kachel. Die Steuerungsübersicht hat statt des Stifts „Module wählen“.
  renderManagePage() {
    const body = document.getElementById('tab-sm-manage');
    if (!body) return;
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const summary = page => [
      (page.displays || []).length ? plural(page.displays.length, 'Anzeige', 'Anzeigen') : '',
      page.buttons.length ? plural(page.buttons.length, 'Taste', 'Tasten') : '',
      (page.embeds || []).length ? plural(page.embeds.length, 'Element', 'Elemente') : '',
      page.background ? 'mit Bild' : ''
    ].filter(Boolean).join(' · ') || 'noch leer';
    const icon = (path, label, act, id) => `<button type="button" class="ov-icon-btn" data-act="${act}" data-id="${escapeHtml(id)}" aria-label="${escapeHtml(label)}"${act === 'more' || act === 'mods' ? ' aria-haspopup="true"' : ''}>${path}</button>`;
    const PEN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"></path><path d="M13.5 6.5l4 4"></path></svg>';
    const MODS = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"></path><circle cx="16" cy="7" r="2"></circle><circle cx="10" cy="17" r="2"></circle></svg>';
    const DOTS = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><circle cx="19" cy="12" r="1.8"></circle></svg>';
    const card = ({ id, name, meta, preview, badge, open, actions }) => `
      <article class="kc-card" data-id="${escapeHtml(id)}">
        <button type="button" class="kc-prev" data-act="open" data-open="${escapeHtml(open)}" aria-label="${escapeHtml(name)} öffnen">${preview}${badge ? `<span class="kc-badge">${escapeHtml(badge)}</span>` : ''}</button>
        <div class="kc-foot"><div class="kc-name"><b>${escapeHtml(name)}</b><small>${escapeHtml(meta)}</small></div>${actions}</div>
      </article>`;
    const pageCard = page => {
      const nurEinstellen = this.settingsOnly(page.id);
      const st = nurEinstellen && this.steuerungEmbed(page);
      const count = st?.opts?.count || 'auto';
      return card({
        id: page.id, name: page.name, open: page.id, preview: this.kachelPreviewHtml(page),
        meta: nurEinstellen ? (st ? `Module: ${count === 'auto' ? 'automatisch' : count}` : 'Element fehlt – zurücksetzen') : summary(page),
        actions: (nurEinstellen ? (st ? icon(MODS, 'Module wählen', 'mods', page.id) : '') : icon(PEN, `${page.name} bearbeiten`, 'edit', page.id))
          + icon(DOTS, `Weitere Aktionen für ${page.name}`, 'more', page.id)
      });
    };
    const fest = (window.appNav?.bausteine() || []).filter(b => !b.own).map(b => card({
      id: b.tab, name: b.name, open: b.tab, meta: b.desc || 'feste Kachel', badge: 'Fest',
      preview: '<span class="p-map" style="inset:0"></span>', actions: ''
    }));
    const own = this.pages.filter(p => !p.vorlage), tpl = this.pages.filter(p => p.vorlage);
    const section = (title, cards) => cards.length ? `
      <div class="kc-sec-head"><h2>${title}</h2><span>${cards.length}</span></div>
      <div class="kc-grid">${cards.join('')}</div>` : '';
    body.innerHTML = `
      <div class="ov-page kc-page">
        <div class="ov-head">
          <div class="ov-head-text">
            <div class="ov-head-row"><h1 class="ov-title">Kacheln</h1><span class="ov-count">${this.pages.length + fest.length}</span></div>
            <p class="ov-intro">Auf die Startseite kommen sie über „Seite bearbeiten“. Antippen öffnet die Kachel.</p>
          </div>
          <div class="ov-spacer"></div>
          <button type="button" class="ov-btn" onclick="window.steuerungsmenues.importPage()"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"></path></svg>Importieren</button>
          <button type="button" class="ov-btn ov-btn--primary" onclick="window.steuerungsmenues.addPage()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>Neue Kachel</button>
        </div>
        <div class="kc-scroll">
          ${section('Eigene Kacheln', own.map(pageCard))}
          ${section('Aus Vorlagen', [...tpl.map(pageCard), ...fest])}
          ${own.length || tpl.length || fest.length ? '' : '<div class="fn-empty">Noch keine Kacheln. Leg mit „Neue Kachel“ die erste an.</div>'}
        </div>
      </div>`;
    body.querySelector('.kc-scroll').onclick = e => this.onManageClick(e);
    // ein offenes „Module wählen“ nach dem Neuzeichnen (Anzahl geändert) an der neuen Karte wieder öffnen
    const key = window.uiPopoverKey?.();
    if (key?.startsWith('kc-mod:')) {
      const anchor = body.querySelector(`[data-act="mods"][data-id="${CSS.escape(key.slice(7))}"]`);
      if (anchor) this.openModulesPopover(key.slice(7), anchor); else window.uiPopoverClose?.();
    }
  }

  onManageClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.dataset.id;
    const act = btn.dataset.act;
    if (act === 'open') window.appNav.go(btn.dataset.open);
    else if (act === 'edit') this.enterEditMode(id);
    else if (act === 'mods') this.openModulesPopover(id, btn);
    else if (act === 'more') {
      const page = this.pages.find(p => p.id === id);
      if (!page) return;
      uiMenu(btn, [
        ...(this.settingsOnly(id) ? [] : [{ label: 'Bearbeiten', run: () => this.enterEditMode(id) }]),
        { label: 'Umbenennen', run: () => this.renamePage(id) },
        { label: 'Exportieren', run: () => this.exportPageFile(id) },
        ...(page.vorlage ? [{ label: 'Zurücksetzen', run: () => this.resetPage(id) }] : []),
        null,
        { label: 'Löschen', danger: true, run: () => this.deletePage(id) }
      ]);
    }
  }

  openModulesPopover(pageId, anchor) {
    const page = this.pages.find(p => p.id === pageId);
    const st = page && this.steuerungEmbed(page);
    if (!st) return;
    uiPopover(anchor, this.steuerungCardOptsHtml(page, st), { className: 'kc-pop', role: 'dialog', key: 'kc-mod:' + pageId });
  }

  // Miniatur einer Kachel aus der Anordnung der ganzen Seite (16:9): einfache Formen statt echter Inhalte -- Zahl,
  // Tacho, Balken, Leuchte, Taste (Form und Farbe), Text, Bild, Karte/Liste; mit Hintergrundbild darunter
  kachelPreviewHtml(page) {
    const A = SM_CANVAS_ASPECT;
    const pct = v => `${Math.round(v * 100) / 100}%`;
    const box = (x, y, w, h) => `left:${pct(x - w / 2)};top:${pct(y - (h * A) / 2)};width:${pct(w)};height:${pct(h * A)};`;
    const out = [];
    if (page.background) out.push(`<img class="p-bg" src="${escapeHtml(page.background)}" alt="">`);
    for (const [kind, el] of smLayerOrder(page)) {
      if (kind === 'display') {
        const cls = { tacho: 'p-gauge', balken: 'p-bar', leuchte: 'p-lamp' }[el.type] || 'p-num';
        out.push(`<span class="p-frame ${cls}" style="${box(el.x, el.y, el.width, el.height)}"></span>`);
      } else if (kind === 'button') {
        const c = SM_BUTTON_COLORS.find(x => x.id === el.color);
        const shape = el.shape === 'triangle' ? ' tri' : el.shape === 'square' ? '' : ' round';
        out.push(`<span class="p-key${shape}" style="${box(el.x, el.y, el.size, smHeightBasis(el))}${c ? `background:${c.hex}66;border-color:${c.hex};` : ''}"></span>`);
      } else if (kind === 'embed') {
        out.push(`<span class="p-frame ${el.baustein === 'karte' ? 'p-map' : 'p-list'}" style="${box(el.x, el.y, el.width, el.height)}"></span>`);
      } else if (kind === 'graphic' && el.src) {
        out.push(`<img class="p-img" src="${escapeHtml(el.src)}" alt="" style="${box(el.x, el.y, el.width, el.height)}">`);
      } else if (kind === 'text') {
        out.push(`<span class="p-text" style="left:${pct(el.x - el.width / 2)};top:${pct(el.y - 1.5)};width:${pct(el.width)};"></span>`);
      }
    }
    return out.length ? out.join('') : '<span class="p-empty">leer</span>';
  }

  // Baustein aus einer Vorlage wieder in den Auslieferungszustand bringen (Name und Kacheln bleiben)
  async resetPage(pageId) {
    const page = this.pages.find(p => p.id === pageId);
    if (!page) return;
    if (!(await uiConfirm(`„${page.name}“ auf die Vorlage zurücksetzen? Deine Änderungen an Anzeigen, Tasten und Elementen gehen verloren.`, { title: 'Zurücksetzen', ok: 'Zurücksetzen', danger: true }))) return;
    try {
      const result = await (await fetch(`/api/steuerungsmenue/${pageId}/reset`, { method: 'POST' })).json();
      if (!result.success) { uiAlert('Zurücksetzen fehlgeschlagen: ' + result.error); return; }
      await this.loadPages();
      window.showToast?.('Zurückgesetzt');
    } catch (error) {
      uiAlert('Zurücksetzen fehlgeschlagen: ' + error.message);
    }
  }

  async exportPageFile(pageId) {
    try {
      const res = await fetch(`/api/steuerungsmenue/${pageId}/export`);
      const result = await res.json();
      if (!result.success) {
        uiAlert('Export fehlgeschlagen: ' + result.error);
        return;
      }
      const page = this.pages.find(p => p.id === pageId);
      downloadJson(result.page, `Kachel ${page?.name || pageId}`);
      window.showToast?.('Kachel exportiert (Ordner Downloads)');
    } catch (error) {
      uiAlert('Export fehlgeschlagen: ' + error.message);
    }
  }

  async importPage() {
    try {
      const data = await pickJsonFile();   // js/basis.js
      if (!data) return;
      const res = await fetch('/api/steuerungsmenue/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      if (!result.success) {
        uiAlert('Import fehlgeschlagen: ' + result.error);
        return;
      }
      await this.loadPages();
      this.renderManagePage();
    } catch (error) {
      uiAlert('Import fehlgeschlagen: ' + error.message);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Seiten-CRUD (Anlegen/Löschen einer ganzen Bedienpanel-Seite)
  // ---------------------------------------------------------------------------------------------

  async addPage() {
    // Leer oder aus Vorlage (21.10.2026: Vorlage „Licht“ mit Traktor-Draufsicht und fertig platzierten Tasten)
    let templates = [];
    try { templates = (await (await fetch('/api/steuerungsmenue/templates')).json()).templates || []; } catch { /* dann nur leer */ }
    const kind = await this.chooseTemplate(templates);
    if (!kind) return;
    const tpl = templates.find(t => t.id === kind);
    const name = await uiPrompt('Name der neuen Kachel:', tpl ? tpl.name : '', { title: 'Neue Kachel', ok: 'Anlegen', placeholder: 'z. B. Beleuchtung' });
    if (!name || !name.trim()) return;
    try {
      const res = await fetch(kind === 'empty' ? '/api/steuerungsmenue/create' : '/api/steuerungsmenue/create-from-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kind === 'empty' ? { name } : { template: kind, name })
      });
      const result = await res.json();
      if (!result.success) {
        uiAlert('Anlegen fehlgeschlagen: ' + result.error);
        return;
      }
      await this.loadPages();
      this.enterEditMode(result.page.id);   // neue Kachel: gleich gestalten
    } catch (error) {
      uiAlert('Anlegen fehlgeschlagen: ' + error.message);
    }
  }

  // Auswahl „Neue Kachel“ (23.10.2026): Karten mit Miniatur wie in der Übersicht statt einer langen Knopfreihe, die
  // seitlich überlief. Die Miniatur kommt aus der Vorlage selbst (templateList preview).
  chooseTemplate(templates) {
    return new Promise(resolve => {
      const prevOf = t => {
        const page = t.preview || this.pages.find(p => p.id === `sm-v-${t.id}`);
        return page ? this.kachelPreviewHtml(page) : '<span class="p-empty">Vorlage</span>';
      };
      const items = [{ id: 'empty', name: 'Leere Kachel', description: 'Selbst gestalten', prev: '<span class="p-empty">leer</span>' },
        ...templates.map(t => ({ ...t, prev: prevOf(t) }))];
      const el = document.createElement('div');
      el.className = 'kc-new';
      el.innerHTML = `<div class="kc-new-box" role="dialog" aria-modal="true" aria-label="Neue Kachel">
          <div class="kc-new-head"><div><h2>Neue Kachel</h2><p>Eine Vorlage bringt fertige Anzeigen und Tasten mit, die du danach frei änderst.</p></div>
            <button type="button" class="ov-icon-btn" data-pick="" aria-label="Schließen"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg></button></div>
          <div class="kc-new-grid">${items.map(t => `
            <button type="button" class="kc-new-card" data-pick="${escapeHtml(t.id)}">
              <span class="kc-prev">${t.prev}</span>
              <span class="kc-name"><b>${escapeHtml(t.name)}</b><small>${escapeHtml(t.description || '')}</small></span>
            </button>`).join('')}</div>
        </div>`;
      const done = v => { document.removeEventListener('keydown', onKey, true); el.remove(); resolve(v || null); };
      const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-pick]');
        if (b) done(b.dataset.pick);
        else if (e.target === el) done(null);
      });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(el);
      el.querySelector('.kc-new-card')?.focus({ preventScroll: true });
    });
  }

  // Umbenennen (13.08.2026, Hendriks Wunsch) -- gleiches prompt()-Muster wie addPage(). loadPages()
  // aktualisiert danach Rail/Pins/Verwalten-Liste in einem Rutsch, s. dortiger Kommentar.
  async renamePage(pageId) {
    const page = this.pages.find(p => p.id === pageId);
    if (!page) return;
    const name = await uiPrompt('Neuer Name für die Kachel:', page.name, { title: 'Kachel umbenennen', ok: 'Umbenennen' });
    if (!name || !name.trim() || name.trim() === page.name) return;
    try {
      const res = await fetch(`/api/steuerungsmenue/${pageId}/name`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const result = await res.json();
      if (!result.success) {
        uiAlert('Umbenennen fehlgeschlagen: ' + result.error);
        return;
      }
      await this.loadPages();
    } catch (error) {
      uiAlert('Umbenennen fehlgeschlagen: ' + error.message);
    }
  }

  deletePage(pageId) {
    const page = this.pages.find(p => p.id === pageId);
    if (!page) return;
    if (this.pages.length <= 1) {
      uiAlert('Mindestens eine eigene Kachel muss bestehen bleiben.');
      return;
    }
    window.confirmDialog.show(`Kachel "${page.name}" wirklich löschen?`, async () => {
      try {
        const res = await fetch(`/api/steuerungsmenue/${pageId}`, { method: 'DELETE' });
        const result = await res.json();
        if (!result.success) {
          uiAlert('Löschen fehlgeschlagen: ' + result.error);
          return;
        }
        if (this.editingPageId === pageId) this.editingPageId = null;
        const wasActive = document.getElementById(`tab-${pageId}`)?.classList.contains('active');
        document.getElementById(`tab-${pageId}`)?.remove();
        await this.loadPages();
        if (wasActive && this.pages.length > 0) {
          window.app.navigateToTab(this.pages[0].id);
        } else {
          this.renderManagePage();
        }
      } catch (error) {
        uiAlert('Löschen fehlgeschlagen: ' + error.message);
      }
    });
  }
}

window.steuerungsmenues = new SteuerungsmenuesManager();
