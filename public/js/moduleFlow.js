/**
 * Bearbeiten-Flow: Übersicht -> Modul -> Detailansicht -> Taste -> Funktion (via MappingModal)
 * Plus: Bestätigungsdialog, Toast, das Kalibrierungs-Werkzeug für Modul-/Übersichts-Draufsichten
 * und ein Zuschneiden-Werkzeug für hochgeladene Bilder.
 *
 * Wichtige Konvention: Modul-`buttonRange` und Hotspot-`button` sind 1-basiert (globale
 * Tastennummerierung wie in der Firmware, z.B. "Taste 5 von 16"). Die bestehende MappingModal-API
 * (`openButtonMappingForModuleFlow`) erwartet dagegen 0-basierte `buttonId` -- die Umrechnung
 * (-1) passiert ausschließlich an der Übergabestelle in `ModuleFlow.openButton()`.
 *
 * Hotspots (Modul- und Übersichts-Hotspots) tragen optional `shape` ('circle'|'rect') und
 * `width`/`height` (Prozent der Bildbreite/-höhe) -- fehlen diese Felder (ältere Daten), greifen
 * über `hotspotStyleAttr()` Standardwerte (Kreis, 6%).
 */

// Ebenenfarben (Ebenenbelegung, s. CraftSlotLayerToolbar) -- jede der 4 Ebenen hat eine eigene, klar
// unterscheidbare Farbe: I grün, II blau, III violett, IV gelb. Dieselbe solide Farbe für den
// Ebenen-Umschalt-Button, als transluzenter Ton (+Alpha-Suffix) für die Tasten-Hotspots selbst, damit
// man NIE übersehen kann, in welcher Ebene man gerade belegt.
const CRAFTSLOT_LAYER_COLORS = ['#22c55e', '#3b82f6', '#a855f7', '#eab308'];

// Achsen-Hotspots (Modulübersicht + Modul-Kalibrierung, 21.08.2026): dieselben Achsen-Keys wie in
// axisAssignment.js/axisCalibration.js (dort bisher nur je eigene Label-Texte) -- hier kurze,
// modul-lokale Labels, weil der Modulkontext (CraftSlot 1 vs. 2 etc.) bereits klar ist. Immer BLAU,
// unabhängig von der Ebenenfarbe der Tasten, damit man Achsen auf einen Blick von Tasten unterscheidet.
// Beschreibt die Bewegungsrichtung statt der technischen Encoder-/Achsen-Bezeichnung (Hendriks
// Wunsch 21.08.2026: "Hebel vor/zurück, links/rechts, hoch/runter" statt "Hebel A"/"Thumb X").
const AXIS_LABELS = {
  thumbX: 'Thumbstick links/rechts', thumbY: 'Thumbstick hoch/runter', leverA: 'Hebel vor/zurück', leverB: 'Hebel links/rechts',
  thumb2X: 'Thumbstick links/rechts', thumb2Y: 'Thumbstick hoch/runter', leverA2: 'Hebel vor/zurück', leverB2: 'Hebel links/rechts',
  finger1: 'Fingertip 1', finger2: 'Fingertip 2', finger3: 'Fingertip 3', finger4: 'Fingertip 4'
};
const AXIS_HOTSPOT_COLOR = '#3b82f6';
const AXIS_TOGGLE_COLOR = '#f97316'; // orange -- eigener, dritter Hotspot-Typ (Achse/Taste-Umschalter), s. AXIS_MODE_CONFIG

// Achsen mit Achse/Taste-Umschalter (Geräte-Einstellungen) + den beiden physischen Tastennummern,
// die NUR im Tastenmodus überhaupt gedrückt werden (vor/zurück bzw. links/rechts, s.
// CraftConsolePro_Pico.ino BTN_S1_LEVER/BTN_S2_LEVER/BTN_FINGER). Einzige Quelle der Wahrheit für
// beide Seiten (Modulübersicht/Kalibrierung hier UND axisConfigModal.js) -- Hendriks Wunsch
// 21.08.2026: je nach aktivem Modus braucht man nie beide Hotspot-Arten gleichzeitig zu sehen.
// leverthresh/fingerthresh gelten geräteweit für alle 4 Hebel- bzw. alle 4 Fingertip-Achsen gemeinsam
// (ein einziges Firmware-Feld) -- kein Tippfehler, dass mehrere Einträge denselben threshKey teilen.
// Tastennummern Stand Schritt 2 (24.08.2026, große Neunummerierung, s. CraftConsolePro_Pico.ino
// BTN_*-Konstanten -- einzige Quelle der Wahrheit dafür). Beide CraftSlots identisch aufgebaut:
// Grip(16) + Hebel-als-Taste(4) + Thumbstick-als-Taste(4) + Aux(5) = 29 je Slot.
const AXIS_MODE_CONFIG = {
  leverA:  { modeKey: 'levera',  threshKey: 'leverthresh',  buttonValue: 'taster', title: 'Hebel vor/zurück (CraftSlot 1)', buttons: [17, 18] },
  leverB:  { modeKey: 'leverb',  threshKey: 'leverthresh',  buttonValue: 'taster', title: 'Hebel links/rechts (CraftSlot 1)', buttons: [19, 20] },
  leverA2: { modeKey: 'levera2', threshKey: 'leverthresh',  buttonValue: 'taster', title: 'Hebel vor/zurück (CraftSlot 2)', buttons: [102, 103] },
  leverB2: { modeKey: 'leverb2', threshKey: 'leverthresh',  buttonValue: 'taster', title: 'Hebel links/rechts (CraftSlot 2)', buttons: [104, 105] },
  finger1: { modeKey: 'finger1', threshKey: 'fingerthresh', buttonValue: 'taste',  title: 'Fingertip 1',          buttons: [46, 47] },
  finger2: { modeKey: 'finger2', threshKey: 'fingerthresh', buttonValue: 'taste',  title: 'Fingertip 2',          buttons: [48, 49] },
  finger3: { modeKey: 'finger3', threshKey: 'fingerthresh', buttonValue: 'taste',  title: 'Fingertip 3',          buttons: [50, 51] },
  finger4: { modeKey: 'finger4', threshKey: 'fingerthresh', buttonValue: 'taste',  title: 'Fingertip 4',          buttons: [52, 53] },
  thumbX:  { modeKey: 'thumbmodex',  threshKey: 'thumbbtnthresh', buttonValue: 'taste', title: 'Thumbstick links/rechts (CraftSlot 1)', buttons: [21, 22] },
  thumbY:  { modeKey: 'thumbmodey',  threshKey: 'thumbbtnthresh', buttonValue: 'taste', title: 'Thumbstick hoch/runter (CraftSlot 1)', buttons: [23, 24] },
  thumb2X: { modeKey: 'thumbmodex2', threshKey: 'thumbbtnthresh', buttonValue: 'taste', title: 'Thumbstick links/rechts (CraftSlot 2)', buttons: [106, 107] },
  thumb2Y: { modeKey: 'thumbmodey2', threshKey: 'thumbbtnthresh', buttonValue: 'taste', title: 'Thumbstick hoch/runter (CraftSlot 2)', buttons: [108, 109] }
};
window.AXIS_MODE_CONFIG = AXIS_MODE_CONFIG;

// true, wenn deviceConfig Einstellungen einer CraftConsole enthält. Leer = Gerät nicht verbunden. Ein Gerät, das
// sich per GETALL mit device=... meldet (CraftLink, 23.10.2026; die CraftConsole-Firmware sendet kein device=),
// hat (noch) keine Achse/Taste-Modi und keinen Zündschloss-Schalter -- dann wie "nicht verbunden" alles
// sichtbar lassen, sonst verschwänden die Tasten 17-24 (= Hebel/Thumbstick-Tasten von CraftSlot 1, beim
// CraftLink die seiner CraftUnit). Bis es Geräteprofile gibt.
function hasCraftConsoleSettings(deviceConfig) {
  if (!deviceConfig || Object.keys(deviceConfig).length === 0) return false;
  return !deviceConfig.device || String(deviceConfig.device).startsWith('craftconsole');
}

// true, wenn diese Achse laut deviceConfig gerade im TASTENMODUS läuft (Achsen ohne Modus-Umschalter,
// z.B. Thumbsticks, sind nie im Tastenmodus). Ohne CraftConsole-Einstellungen (nicht verbunden oder
// anderes Gerät, s. o.) bleibt sicherheitshalber alles sichtbar (weder Tasten noch Achse ausblenden).
function isButtonMode(axisKey, deviceConfig) {
  const cfg = AXIS_MODE_CONFIG[axisKey];
  if (!cfg || !hasCraftConsoleSettings(deviceConfig)) return false;
  return deviceConfig[cfg.modeKey] === cfg.buttonValue;
}

// Gemeinsam für ModuleFlow (Übersicht) UND LayoutCalibrator (Kalibrierung): welche Tasten- bzw.
// Achsen-Hotspots sind angesichts des aktuellen Achse/Taste-Modus gerade NICHT relevant.
function axisModeFiltering(module, deviceConfig) {
  const hiddenButtons = new Set();
  const hiddenAxisKeys = new Set();
  if (!hasCraftConsoleSettings(deviceConfig)) return { hiddenButtons, hiddenAxisKeys };
  for (const axisKey of module?.axisKeys || []) {
    const cfg = AXIS_MODE_CONFIG[axisKey];
    if (!cfg) continue;
    if (isButtonMode(axisKey, deviceConfig)) hiddenAxisKeys.add(axisKey);
    else cfg.buttons.forEach(b => hiddenButtons.add(b));
  }
  return { hiddenButtons, hiddenAxisKeys };
}

// NUR für ModuleFlow (normale Nutzungsansicht), NICHT für die Kalibrierung -- analog zu
// axisModeFiltering(), nur für den Bedienteil-rechts-Schalter (70/71/72 statt Achse/Taste): welche
// der drei Zündschloss-Tasten je nach Geräte-Einstellung (bedienmode/ignitionpositions/
// ignitionposNbtn) gerade überhaupt ausgelöst werden können (25.08.2026, Hendriks Wunsch). "ebene"
// zählt hier wie "taste": genau diese Ansicht läuft immer im Kontext eines verbundenen ControlHub,
// und dort verhält sich der Schalter laut Firmware ohnehin immer wie im Tastenmodus (s.
// CraftConsolePro_Pico.ino runController(), effMode-Herleitung) -- Taste 127 selbst gehört zu keinem
// Modul und taucht hier nie auf.
function bedienteilFiltering(deviceConfig) {
  const hidden = new Set();
  if (!hasCraftConsoleSettings(deviceConfig)) return hidden;
  const mode = deviceConfig.bedienmode;
  if (mode === 'ebene' || mode === 'taste') {
    hidden.add(70); hidden.add(72);
  } else if (mode === 'zuendschloss') {
    const positions = deviceConfig.ignitionpositions === '3' ? 3 : 2;
    const live = new Set();
    for (let i = 0; i < positions; i++) {
      const btn = Number(deviceConfig[`ignitionpos${i}btn`]);
      if (btn) live.add(btn);
    }
    for (const b of [70, 71, 72]) if (!live.has(b)) hidden.add(b);
  }
  return hidden;
}

class ConfirmDialog {
  // Seit 21.10.2026 über die gemeinsamen Dialoge (public/js/dialogs.js) -- gleiche Optik wie alle
  // anderen Rückfragen. Das alte #confirm-dialog-HTML ist seit 21.10.2026 entfernt.
  // danger (rote Bestätigen-Taste) seit 23.10.2026 standardmäßig AUS -- harmlose Rückfragen wie
  // „Profil laden?“ oder „Funktion auf Taste legen?“ erschienen sonst rot. Lösch-/Entfernen-/Zurücksetzen-
  // Fragen bleiben rot: entweder ausdrücklich per opts.danger = true oder, falls der Aufrufer nichts angibt,
  // am Wortlaut erkannt (Absicherung für Aufrufer, die opts.danger noch nicht setzen).
  show(message, onConfirm, opts = {}) {
    const danger = opts.danger ?? /löschen|gelöscht|entfernen|zurücksetzen|unwiderruflich/i.test(String(message));
    uiConfirm(message, { title: opts.title || 'Bitte bestätigen', ok: opts.ok || 'Bestätigen', danger })
      .then(ok => { if (ok) onConfirm(); });
  }
}

function showToast(message, duration = 3000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'app-toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

function hotspotStyleAttr(h) {
  const shape = h.shape || 'circle';
  const width = h.width != null ? h.width : 6;
  const height = h.height != null ? h.height : 6;
  const rotation = h.rotation || 0;
  const radius = shape === 'circle' ? '50%' : '3px';
  // Zentrierung (translate) und Drehung müssen im selben transform stehen -- die CSS-Klasse
  // setzt daher bewusst kein eigenes transform mehr, das würde diesen Wert sonst überschreiben.
  return `left:${h.x}%; top:${h.y}%; width:${width}%; height:${height}%; border-radius:${radius}; transform: translate(-50%, -50%) rotate(${rotation}deg);`;
}

// Kappenfarbe der Fingertips (Hendrik 23.10.2026): ein farbiger Ring um alle Tasten eines Fingertips (vor, zurück,
// Achse, Umschalter) in der Farbe seiner Kappe, gewählt unter Armlehne einrichten → Setup. Die Tasten eines Fingertips
// liegen paarweise hintereinander (s. buttonTest.js: Fingertip i = buttonRange[0] + 2i vor, +1 zurück).
function capRingStyle(mod, layout, h) {
  const caps = layout?.capColors;
  if (!caps || !mod?.axisKeys?.some(k => /^finger\d$/.test(k))) return '';
  const key = h.axisKey || h.modeToggleKey || (h.button != null ? `finger${Math.floor((h.button - mod.buttonRange[0]) / 2) + 1}` : null);
  const color = typeof SM_BUTTON_COLORS !== 'undefined' && SM_BUTTON_COLORS.find(c => c.id === caps[key]);
  return color ? `box-shadow: 0 0 0 3px ${color.hex}, 0 0 0 4px rgba(0, 0, 0, 0.55), 0 2px 6px rgba(0, 0, 0, 0.45);` : '';
}

// Bilder werden beim Zuschneiden/Ersetzen unter demselben Dateinamen gespeichert -- ohne
// Cache-Busting würde der Browser die alte, bereits geladene Version weiter anzeigen.
// WICHTIG: der Zeitstempel wird pro Bildpfad EINMAL vergeben und dann wiederverwendet (nicht bei
// jedem Aufruf neu), sonst bekommt das <img> bei jedem Re-Render (z.B. nach jedem Kalibrierungs-
// Schritt) eine neue URL und lädt komplett neu -- das erzeugte genau das Flackern/den Sprung nach
// oben, den Hendrik gemeldet hat (Bild fällt kurz auf Höhe 0 zusammen, bis es neu geladen ist).
// bustInvalidate() wird gezielt nach einem echten Bild-Upload/Zuschnitt aufgerufen, dann DARF/SOLL
// neu geladen werden.
const bustCache = new Map();
function bust(imagePath) {
  if (!bustCache.has(imagePath)) bustCache.set(imagePath, Date.now());
  return `${imagePath}?t=${bustCache.get(imagePath)}`;
}
function bustInvalidate(imagePath) {
  bustCache.delete(imagePath);
}

// Reihenfolge für Wischgesten/Pfeiltasten in der Übersicht: Hendriks "Rundgang" um die Armlehne (CraftSlot 1,
// CraftPad 1, Fingertip, CraftSlot 2, CraftPad 2, CraftDeck) -- seit den Geräteprofilen (23.10.2026) liefert sie der
// Server mit den Modulen des aktiven Controllers (server/deviceProfiles.js CC_KATALOG), s. ModuleFlow.order().

// Maskierung: escapeHtml aus js/basis.js (lädt als erstes Skript; Durchsicht B9)
function mfEsc(s) { return escapeHtml(s); }

// Seitenverhältnis eines Bilds (für zusammengesetzte Modulbilder)
function loadImageAspect(src) {
  return new Promise(resolve => {
    const im = new Image();
    im.onload = () => resolve(im.naturalWidth && im.naturalHeight ? im.naturalWidth / im.naturalHeight : null);
    im.onerror = () => resolve(null);
    im.src = bust(src);
  });
}

// Modulansicht (/api/module-view) zu einem Layout machen. Ein Teil = wie bisher ein Bild. Mehrere Teile (CraftSlot: Griff
// über Unterbau, Hendrik 23.10.2026) werden in gleicher Breite untereinander gesetzt; die Hotspot-Positionen rechnen von
// Prozent des Teilbilds auf Prozent des Gesamtbilds um (x und Breite bleiben, y und Höhe schrumpfen auf den Anteil).
async function composeModuleView(view) {
  const teile = (view?.teile || []).filter(t => t.image);
  const leer = { image: null, hotspots: [], disabledButtons: [] };
  if (teile.length <= 1) return teile[0] || (view?.teile?.[0] ? { ...view.teile[0], image: null } : leer);
  const aspects = await Promise.all(teile.map(t => loadImageAspect(t.image)));
  const ok = teile.map((t, i) => ({ t, a: aspects[i] })).filter(x => x.a);
  if (ok.length <= 1) return ok[0]?.t || leer;
  const heights = ok.map(x => 1 / x.a);   // Höhe bei Breite 1
  const total = heights.reduce((a, b) => a + b, 0);
  const parts = [], hotspots = [];
  let off = 0;
  ok.forEach((x, i) => {
    const top = off / total * 100, h = heights[i] / total * 100;
    parts.push({ image: x.t.image, top, height: h });
    for (const hs of x.t.hotspots || []) hotspots.push({ ...hs, y: top + (hs.y ?? 0) * h / 100, height: (hs.height ?? 6) * h / 100 });
    off += heights[i];
  });
  return { image: null, parts, aspect: 1 / total, hotspots, disabledButtons: [] };
}

// Bild(er) eines Layouts als HTML: ein Bild wie bisher, zusammengesetzt mehrere Teile untereinander
function moduleImagesHtml(layout, alt) {
  if (layout.parts) return layout.parts.map(p => `<img class="mdi-part" src="${mfEsc(bust(p.image))}" alt="" style="top:${p.top}%; height:${p.height}%;">`).join('');
  return `<img src="${mfEsc(bust(layout.image))}" alt="${mfEsc(alt || '')}">`;
}

// Tasten eines Moduls: seit den Geräteprofilen (23.10.2026) die sichtbaren Tasten vom Server (buttons), sonst der Bereich
function moduleButtonList(mod) {
  if (Array.isArray(mod?.buttons)) return mod.buttons;
  const [start, end] = mod?.buttonRange || [0, -1];
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i);
}

// Lage einer Taste für die Liste neben dem Bild (24.10.2026). Nur, was die Firmware festlegt (CraftConsolePro_Pico.ino:
// Hebel-als-Taste vor/zurück/links/rechts, Stick-als-Taste links/rechts/hoch/runter, Aux D1–D5, Fingertip je vor/zurück,
// Zündschloss 70–72); die Griff-Tasten selbst bleiben ohne Namen. Eigene Namen des Moduls (buttonNames) gehen vor.
const SLOT_LAGEN = { 17: 'Hebel vor', 18: 'Hebel zurück', 19: 'Hebel links', 20: 'Hebel rechts',
  21: 'Stick links', 22: 'Stick rechts', 23: 'Stick hoch', 24: 'Stick runter',
  25: 'Aux 1', 26: 'Aux 2', 27: 'Aux 3', 28: 'Aux 4', 29: 'Aux 5' };
function tasteLage(mod, b) {
  if (mod?.buttonNames?.[b]) return mod.buttonNames[b];
  if (mod?.layerSlot || mod?.teil === 'unterbau') {
    const i = b - (mod.buttonRange?.[0] ?? 1) + 1;
    // Lenkjoystick (25.10.2026): Eingang von Hebel A, bewegt nach links/rechts
    if (mod.unterbau === 'lenkjoystick' && (i === 17 || i === 18)) return i === 17 ? 'Lenkung links' : 'Lenkung rechts';
    return SLOT_LAGEN[i] || '';
  }
  if (mod?.id === 'fingertip' && b >= 46 && b <= 53) return `Fingertip ${Math.floor((b - 46) / 2) + 1} ${(b - 46) % 2 ? 'zurück' : 'vor'}`;
  if (mod?.id === 'bedienteil') return { 70: 'Zündschloss Nullstellung', 71: 'Zündschloss Stellung 1', 72: 'Zündschloss Stellung 2' }[b] || '';
  return '';
}

// Wo die Funktionsnamen stehen (Hendrik 24.10.2026): „liste“ = Bild nur mit Nummern, Liste daneben bzw. darunter;
// „tasten“ = wie bisher in den Tasten. Gilt je Browser.
const TB_ANSICHT_KEY = 'controlhub:tastenbelegung-ansicht';
function tbAnsicht() {
  try { return localStorage.getItem(TB_ANSICHT_KEY) === 'tasten' ? 'tasten' : 'liste'; } catch { return 'liste'; }
}

class ModuleFlow {
  constructor() {
    this.modules = [];
    this.currentModule = null;
    this.swipeIndicatorEl = document.getElementById('module-swipe-indicator');
    this.detailBody = document.getElementById('module-detail-body');
    this.carouselIndex = 0; // Index in order() (keine eigene "Gesamtübersicht"-Position mehr, 21.08.2026)
    this.deviceConfig = {}; // Achse/Taste-Modus je Achse (AXIS_MODE_CONFIG) + Bedienteil-Schaltermodus -- nur für Module geladen, die es brauchen (axisKeys oder 'bedienteil')
    this.setupSwipeGestures();
    window.addEventListener('resize', () => this.resizeModuleImage());
    // Liste und Bild koppeln: Zeile bzw. Taste unter dem Zeiger hebt das Gegenstück hervor
    const markieren = (e, an) => {
      const el = e.target.closest?.('[data-btn], [data-axis]');
      if (!el || !this.detailBody.contains(el)) return;
      const sel = el.dataset.btn ? `[data-btn="${el.dataset.btn}"]` : `[data-axis="${CSS.escape(el.dataset.axis)}"]`;
      this.detailBody.querySelectorAll(sel).forEach(x => x.classList.toggle('hl', an));
    };
    this.detailBody.addEventListener('mouseover', e => markieren(e, true));
    this.detailBody.addEventListener('mouseout', e => markieren(e, false));
    // Geräteprofile (23.10.2026): andere Modul-Auswahl → Module neu laden (Reihenfolge und Tasten kommen vom Server)
    document.addEventListener('controllerinfo', () => { if (this.modules.length) this.load(this.currentModule?.id); });
    this.load();
  }

  // Reihenfolge der Module = Reihenfolge vom Server (/api/modules, Module des aktiven Controllers)
  order() { return this.modules.map(m => m.id); }

  // Taste im aktuellen Modul sichtbar? Seit den Geräteprofilen liefert der Server die sichtbaren Tasten (Griff/Unterbau)
  isVisibleButton(b, mod = this.currentModule) {
    if (Array.isArray(mod?.buttons)) return mod.buttons.includes(b);
    const [start, end] = mod?.buttonRange || [0, -1];
    return b >= start && b <= end;
  }

  // Setzt Breite+Höhe des Modulbilds im TATSÄCHLICH verfügbaren Platz, im echten Bildseitenverhältnis
  // (gleiches Prinzip wie steuerungsmenues.js resizeCanvas()) -- füllt den verfügbaren Raum bis zur
  // Grenze durch Breite ODER Höhe aus, skaliert dabei auch kleiner aufgelöste Fotos (z.B. CraftSlot)
  // gezielt HOCH statt sie auf Originalgröße zu begrenzen (Hendriks Feedback 21.08.2026). Die Wrap-Box
  // behält dabei immer exakt das Bildseitenverhältnis, sonst würden die Prozent-Hotspot-Positionen
  // nicht mehr zur sichtbaren Bildfläche passen.
  resizeModuleImage() {
    const wrap = this.detailBody.querySelector('.module-detail-image-wrap');
    const img = wrap?.querySelector('img');
    if (!wrap || !img) return;
    const fixedAspect = Number(wrap.dataset.aspect) || 0;   // zusammengesetztes Bild (Griff + Unterbau)

    const apply = () => {
      if (!fixedAspect && (!img.naturalWidth || !img.naturalHeight)) return;
      const aspect = fixedAspect || img.naturalWidth / img.naturalHeight;

      // Liste neben dem Bild, bei breiten Modulen (CraftPad, Fingertip) oder schmalem Bildschirm darunter
      const split = wrap.closest('.tb-split');
      const unten = !!split && (aspect >= 1.6 || split.getBoundingClientRect().width < 820);
      if (split) split.classList.toggle('tb-unten', unten);

      const availableWidth = (wrap.parentElement || wrap).getBoundingClientRect().width;
      const top = wrap.getBoundingClientRect().top;
      const card = wrap.closest('.card');
      const main = document.querySelector('main');
      const cardStyle = card ? getComputedStyle(card) : null;
      const reservedBelow = cardStyle
        ? (parseFloat(cardStyle.paddingBottom) || 0) + (parseFloat(cardStyle.borderBottomWidth) || 0) + (parseFloat(cardStyle.marginBottom) || 0)
        : 0;
      const mainPaddingBottom = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
      let availableHeight = Math.max(120, window.innerHeight - top - reservedBelow - mainPaddingBottom);
      if (unten && aspect < 1.6) availableHeight = Math.max(120, availableHeight * 0.65);   // hohes Bild: Anfang der Liste bleibt sichtbar

      let width = availableWidth;
      let height = width / aspect;
      if (height > availableHeight) {
        height = availableHeight;
        width = height * aspect;
      }
      wrap.style.width = width + 'px';
      wrap.style.height = height + 'px';
    };

    if (fixedAspect || (img.complete && img.naturalWidth)) apply();
    else img.onload = apply;
  }

  // Nur relevant für Module mit axisKeys (CraftSlot 1/2, Fingertip) -- scheitert lautlos, wenn kein
  // Gerät verbunden ist (dann bleibt alles sichtbar, s. isButtonMode() oben).
  async loadDeviceConfig() {
    try {
      const res = await fetch('/api/device-config');
      const data = await res.json();
      this.deviceConfig = data.success ? data.settings : {};
    } catch (error) {
      this.deviceConfig = {};
    }
  }

  setupSwipeGestures() {
    const el = document.getElementById('module-flow-swipe-area');
    if (!el) return;
    const THRESHOLD = 60; // px -- verhindert, dass normale Klicks/Tipps versehentlich als Wisch gewertet werden
    let startX = null;
    let startY = null;

    el.addEventListener('pointerdown', (e) => {
      startX = e.clientX;
      startY = e.clientY;
    });

    el.addEventListener('pointerup', (e) => {
      if (startX === null) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      startX = null;
      if (Math.abs(dx) > THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) this.swipeNext();
        else this.swipePrevious();
      }
    });
  }

  // Endlos-Rotation direkt zwischen den Modulen -- keine eigene "Gesamtübersicht"-Position mehr
  // (Hendriks Wunsch 21.08.2026: die Gesamtübersicht war überflüssig, das Wisch-Karussell reicht;
  // der Indikator-Streifen oben (renderSwipeIndicator()) zeigt stattdessen, wo man gerade ist).
  swipeNext() {
    const order = this.order();
    if (!order.length) return;
    this.carouselIndex = (this.carouselIndex + 1) % order.length;
    this.openModule(order[this.carouselIndex]);
  }

  swipePrevious() {
    const order = this.order();
    if (!order.length) return;
    this.carouselIndex = (this.carouselIndex - 1 + order.length) % order.length;
    this.openModule(order[this.carouselIndex]);
  }

  async load(preferId = null) {
    // Erster Aufruf kommt schon aus dem Konstruktor (Skript-Ladezeit) -- escapeHtml() fürs Rendern liegt
    // in steuerungsmenues.js, das erst NACH dieser Datei lädt. Daher mit dem Rendern warten, bis alle
    // Skripte da sind.
    if (document.readyState === 'loading') {
      await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    }
    try {
      const res = await fetch('/api/modules');
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.modules)) throw new Error(data.error || `Server antwortet mit ${res.status}`);
      this.modules = data.modules;
      window.craftSlotLayerToolbar.modules = null;   // Zugehörigkeit der Tasten zu den CraftSlots neu holen
      if (!this.modules.length) {
        this.currentModule = null;
        this.detailBody.innerHTML = '<p style="color: var(--text-dim);">Für diesen Controller sind keine Module gewählt (Einstellungen → Controller → Module).</p>';
        this.renderSwipeIndicator();
        return;
      }
      const start = this.modules.some(m => m.id === preferId) ? preferId : this.modules[0].id;
      await this.openModule(start);
    } catch (error) {
      uiAlert('Module konnten nicht geladen werden: ' + error.message);
    }
  }

  // Horizontaler Streifen mit allen Modulen in Wisch-Reihenfolge, aktives Modul hervorgehoben --
  // ersetzt die frühere separate "Gesamtübersicht"-Seite, dient hier nur noch als Positionsanzeige
  // + Direktsprung (Antippen). Zentriert, bricht bei Bedarf um -- kein Scroll-Container mehr (s. CSS),
  // daher auch kein scrollIntoView() nötig.
  // Seit Paket H (22.10.2026, Mockup Bild 2): senkrechte Modulliste links als Untermenü, je Modul „x von y belegt“
  // (gezählt in Ebene I, s. layer1Labels in openModule()).
  renderSwipeIndicator() {
    if (!this.swipeIndicatorEl) return;
    const labels = this.layer1Labels || {};
    this.swipeIndicatorEl.innerHTML = '<div class="module-list-head">Module</div>' + this.modules.map((mod, i) => {
      const active = i === this.carouselIndex;
      const [start, end] = mod.buttonRange || [0, -1];
      const visible = Array.isArray(mod.buttons) ? mod.buttons : Array.from({ length: Math.max(0, end - start + 1) }, (_, k) => start + k);
      const used = visible.filter(b => labels[b]).length;
      const sub = mod.setupLabel ? `<small class="module-list-sub">${escapeHtml(mod.setupLabel)}</small>` : '';
      return `<button type="button" class="category-tab-btn module-list-item ${active ? 'active' : ''}" onclick="window.moduleFlow.openModule(${escapeHtml(JSON.stringify(mod.id))})"><b>${escapeHtml(mod.name)}</b>${sub}<span>${used} von ${visible.length} belegt</span></button>`;
    }).join('');
  }

  async openModule(moduleId) {
    this.currentModule = this.modules.find(m => m.id === moduleId);
    if (!this.currentModule) return;

    const swipePos = this.order().indexOf(moduleId);
    if (swipePos >= 0) this.carouselIndex = swipePos;

    // Modulansicht vom Server: ein Bild, bei CraftSlots Griff + Unterbau zusammengesetzt, oder keins (Raster)
    const [viewRes, labels] = await Promise.all([
      fetch(`/api/module-view/${encodeURIComponent(moduleId)}`).then(r => r.json()).catch(() => ({})),
      this.loadButtonLabels(),
      window.craftSlotLayerToolbar.setModule(this.currentModule.layerSlot || null), // Ebenen-Toolbar nur bei CraftSlots (auch CraftUnit am CraftLink)
      ((this.currentModule.axisKeys || []).length > 0 || this.currentModule.id === 'bedienteil') ? this.loadDeviceConfig() : Promise.resolve()
    ]);
    const layout = await composeModuleView(viewRes.view);
    this.currentLayout = layout; // für refreshHotspotLabels() beim Ebenen-Wechsel erneut gebraucht
    this.buttonLabels = labels;
    this.layer1Labels = labels;  // Ebene I aller Module -- für „x von y belegt“ in der Modulliste

    if (layout.image || layout.parts) {
      this.renderImageDetail(layout);
    } else {
      this.renderListDetail();
    }

    this.renderSwipeIndicator();
    this.resizeModuleImage();
  }

  // Liefert eine Zuordnung "menschliche Tastennummer -> Funktionsname" für die aktuell aktive
  // Profil-Belegung -- nur für die Detailansicht EINES Moduls gedacht (s. renderImageDetail()),
  // in der Gesamtübersicht wären die Namen unlesbar klein.
  // @param {string|null} slotId - 'craftslot1'/'craftslot2', nur relevant zusammen mit layer > 1
  // @param {number} layer - 1 = profile.buttons (Standard), 2-4 = profile.craftSlotLayers[slotId][layer]
  async loadButtonLabels(slotId = null, layer = 1) {
    try {
      const [profilesRes, functionsRes, macrosRes] = await Promise.all([
        fetch('/api/profiles').then(r => r.json()),
        fetch('/api/functions').then(r => r.json()),
        fetch('/api/macros').then(r => r.json())
      ]);
      const profile = profilesRes.profiles?.find(p => p.name === profilesRes.current);
      if (!profile) return {};

      const functionsById = {};
      (functionsRes.functions || []).forEach(f => { functionsById[f.id] = f.name; });
      // Makro-Namen fürs Label bei "macro:<id>"-Belegungen (Hendriks Wunsch 23.08.2026: man soll auf
      // der Modulansicht sehen, DASS eine Taste ein Makro auslöst UND welches -- dasselbe 🔁-Präfix wie
      // im ActionPicker (actionPicker.js), damit es überall gleich aussieht.
      const macrosById = {};
      (macrosRes.macros || []).forEach(m => { macrosById[m.id] = m.name; });

      const source = (layer > 1 && slotId) ? (profile.craftSlotLayers?.[slotId]?.[layer] || {}) : (profile.buttons || {});
      const labels = {};
      Object.entries(source).forEach(([buttonId, items]) => {
        let label = null;
        if (typeof items === 'string') {
          if (items.startsWith('macro:')) {
            const macroName = macrosById[items.slice('macro:'.length)];
            label = macroName ? `🔁 ${macroName}` : null; // Makro evtl. inzwischen gelöscht
          } else if (window.hubActions?.isHub(items)) {
            label = window.hubActions.label(items); // ControlHub-Aktion (Paket J)
          } else if (items !== 'macro-abort') {
            label = functionsById[items];
          }
        } else if (Array.isArray(items) && items.length > 0) {
          // Achse/Tastenkombi (ActionPicker-Modi "Achse"/"Taste") -- rohe Actions-Liste statt Function-ID,
          // dieselbe Beschreibung wie Funktionsliste/Bedienpanel/Vorgewende (s. describeActions() in app.js).
          label = describeActions(items);
        }
        if (label) labels[Number(buttonId) + 1] = label; // +1: Hotspots sind 1-indexiert (h.button)
      });
      return labels;
    } catch (error) {
      console.error('Tasten-Beschriftungen konnten nicht geladen werden:', error);
      return {};
    }
  }

  // Von CraftSlotLayerToolbar.cycleLayer() aufgerufen -- die Hotspot-Beschriftungen sollen die
  // gerade ANGEZEIGTE Ebene widerspiegeln, sonst wirkt die Detailansicht beim Bearbeiten von
  // Ebene II-IV irreführend (zeigt sonst weiter Ebene I's Funktionsnamen).
  async refreshHotspotLabels(slotId, layer) {
    if (!this.currentModule || !this.currentLayout) return;
    this.buttonLabels = await this.loadButtonLabels(slotId, layer);
    if (!slotId || layer === 1) { this.layer1Labels = this.buttonLabels; this.renderSwipeIndicator(); }  // Zähler aktuell halten
    if (this.currentLayout.image || this.currentLayout.parts) {
      this.renderImageDetail(this.currentLayout);
    } else {
      this.renderListDetail();
    }
    this.resizeModuleImage();
  }

  renderImageDetail(layout) {
    // Bei CraftSlot 1/2 alle Hotspots passend zur angezeigten Ebene einfärben (auch Ebene I,
    // transluzent, damit das Foto durchscheint) -- sonst könnte man versehentlich in der falschen
    // Ebene belegen, ohne es zu merken (Hendriks ausdrücklicher Wunsch). Andere Module (Einschub/
    // Bedienteil/Fingertip) haben keine Ebenen, bekommen aber trotzdem einheitlich die Ebene-I-Farbe
    // (Grün) als Hintergrund -- rein optisch, ohne Ebenen-Bedeutung (Hendriks Wunsch 21.08.2026).
    const displayedLayer = window.craftSlotLayerToolbar.getDisplayedLayer();
    const layerTint = (window.craftSlotLayerToolbar.isActive() ? CRAFTSLOT_LAYER_COLORS[displayedLayer - 1] : CRAFTSLOT_LAYER_COLORS[0]) + '99';

    // CraftSlot: Griff/Unterbau bestimmen die Tasten (griffBestimmt), die alte Markierung „nicht verbaut“ gilt dort nicht
    const disabledButtons = new Set(this.currentModule.griffBestimmt ? [] : (layout.disabledButtons || []));
    const { hiddenButtons, hiddenAxisKeys } = axisModeFiltering(this.currentModule, this.deviceConfig);
    if (this.currentModule.id === 'bedienteil') {
      for (const b of bedienteilFiltering(this.deviceConfig)) hiddenButtons.add(b);
    }
    const liste = tbAnsicht() === 'liste';
    const layerColor = layerTint.slice(0, 7);
    const buttonHotspotsHtml = layout.hotspots
      .filter(h => h.button != null && this.isVisibleButton(h.button) && !disabledButtons.has(h.button) && !hiddenButtons.has(h.button))
      .map(h => {
        // Beschriftung = Funktions-/Makroname bzw. Tastenkombi -- Nutzertext, daher maskieren. In der Listenansicht nur die
        // Nummer; belegt kräftig, frei blass mit gestricheltem Rand.
        const belegt = !!this.buttonLabels?.[h.button];
        const label = liste ? h.button : (this.buttonLabels?.[h.button] || h.button);
        const tintStyle = `background: ${liste ? (belegt ? layerColor + 'e6' : 'rgba(15, 18, 22, 0.5)') : layerTint};`;
        return `<div class="button-hotspot${liste && !belegt ? ' frei' : ''}" data-btn="${Number(h.button)}" style="${hotspotStyleAttr(h)} ${tintStyle} ${capRingStyle(this.currentModule, layout, h)}" onclick="window.moduleFlow.openButton(${Number(h.button)})"><span class="hotspot-label">${escapeHtml(label)}</span></div>`;
      })
      .join('');

    // Achsen-Hotspots: immer blau (unabhängig von Ebene), Klick öffnet das Achsen-Konfigurations-
    // Popup. Nur Module mit axisKeys (CraftSlot 1/2, Fingertip) haben überhaupt welche.
    const moduleAxes = new Set(this.currentModule.axisKeys || []);   // z. B. Schubhebel ohne Hebel links/rechts
    const axisHotspotsHtml = layout.hotspots
      .filter(h => h.axisKey != null && moduleAxes.has(h.axisKey) && !hiddenAxisKeys.has(h.axisKey))
      .map(h => {
        const label = AXIS_LABELS[h.axisKey] || h.axisKey;
        // Achsen-Key kommt aus dem (importierbaren) Layout -- als JSON-String maskiert ins onclick
        return `<div class="button-hotspot" data-axis="${escapeHtml(String(h.axisKey))}" style="${hotspotStyleAttr(h)} background: ${AXIS_HOTSPOT_COLOR}99; ${capRingStyle(this.currentModule, layout, h)}" onclick="window.moduleFlow.openAxis(${escapeHtml(JSON.stringify(String(h.axisKey)))})"><span class="hotspot-label">${escapeHtml(liste ? '⇕' : label)}</span></div>`;
      })
      .join('');

    // Umschalter-Hotspots (Achse/Taste, immer orange): eigener platzierbarer Hotspot fürs schnelle
    // Umschalten direkt an Ort und Stelle, ohne erst das Achsen-Popup zu öffnen (Hendriks Wunsch
    // 21.08.2026). Immer sichtbar, unabhängig vom aktuellen Modus -- man muss ja in beiden
    // Zuständen zurückschalten können.
    const toggleHotspotsHtml = layout.hotspots
      .filter(h => h.modeToggleKey != null && moduleAxes.has(h.modeToggleKey))
      .map(h => {
        const label = '⇄';
        const title = AXIS_LABELS[h.modeToggleKey] || h.modeToggleKey;
        return `<div class="button-hotspot" style="${hotspotStyleAttr(h)} background: ${AXIS_TOGGLE_COLOR}99; ${capRingStyle(this.currentModule, layout, h)}" onclick="window.moduleFlow.toggleAxisModeQuick(${escapeHtml(JSON.stringify(String(h.modeToggleKey)))})" title="Umschalten: ${escapeHtml(title)}"><span class="hotspot-label">${label}</span></div>`;
      })
      .join('');

    // Tasten/Achsen ohne Platz im Bild (z. B. Unterbau-Bild fehlt noch): darunter als Knöpfe, damit man sie trotzdem
    // belegen kann -- nur bei CraftSlots und eigenen Controllern, wo Griff/Modul die Tasten bestimmt
    let missingHtml = '';
    if (this.currentModule.griffBestimmt || this.currentModule.eigen) {
      const placed = new Set(layout.hotspots.filter(h => h.button != null).map(h => h.button));
      const placedAx = new Set(layout.hotspots.filter(h => h.axisKey).map(h => h.axisKey));
      const missing = moduleButtonList(this.currentModule).filter(b => !placed.has(b) && !disabledButtons.has(b) && !hiddenButtons.has(b));
      const missingAx = (this.currentModule.axisKeys || []).filter(k => !placedAx.has(k) && !hiddenAxisKeys.has(k));
      const chips = [
        ...missing.map(b => `<button type="button" class="mdi-chip" onclick="window.moduleFlow.openButton(${Number(b)})"><b>${Number(b)}</b>${this.buttonLabels?.[b] ? `<span class="mdi-chip-name">${escapeHtml(this.buttonLabels[b])}</span>` : ''}</button>`),
        ...missingAx.map(k => `<button type="button" class="mdi-chip axis" onclick="window.moduleFlow.openAxis(${escapeHtml(JSON.stringify(k))})">${escapeHtml(AXIS_LABELS[k] || k)}</button>`)
      ];
      if (chips.length) missingHtml = `<div class="mdi-missing"><span>Ohne Platz im Bild:</span>${chips.join('')}</div>`;
    }

    const bildHtml = `
      <div class="module-detail-image-wrap${layout.parts ? ' mdi-stack' : ''}"${layout.aspect ? ` data-aspect="${layout.aspect}"` : ''}>
        ${moduleImagesHtml(layout, this.currentModule.name)}
        ${buttonHotspotsHtml}
        ${axisHotspotsHtml}
        ${toggleHotspotsHtml}
      </div>`;
    this.renderAnsichtSchalter(liste);
    if (!liste) {
      this.detailBody.innerHTML = `${bildHtml}${missingHtml}`;
      return;
    }

    // Listenansicht (Hendrik 24.10.2026): alle Tasten des Moduls mit Lage und Funktion, auch die ohne Platz im Bild,
    // danach die Achsen. Antippen wie die Taste im Bild.
    const mod = this.currentModule;
    const tasten = moduleButtonList(mod).filter(b => !disabledButtons.has(b) && !hiddenButtons.has(b)).sort((a, b) => a - b);
    const zeilen = tasten.map(b => {
      const fn = this.buttonLabels?.[b];
      const lage = tasteLage(mod, b);
      return `<button type="button" class="tb-row ${fn ? 'belegt' : 'frei'}" data-btn="${Number(b)}" onclick="window.moduleFlow.openButton(${Number(b)})">
        <span class="tb-nr">${Number(b)}</span><span class="tb-text">${lage ? `<small>${escapeHtml(lage)}</small>` : ''}${fn ? escapeHtml(fn) : '<i>frei</i>'}</span></button>`;
    });
    for (const k of mod.axisKeys || []) {
      if (hiddenAxisKeys.has(k)) continue;
      zeilen.push(`<button type="button" class="tb-row achse" data-axis="${escapeHtml(k)}" onclick="window.moduleFlow.openAxis(${escapeHtml(JSON.stringify(k))})">
        <span class="tb-nr">⇕</span><span class="tb-text"><small>Achse</small>${escapeHtml(mod.axisLabels?.[k]?.replace(/^CraftSlot \d – /, '') || AXIS_LABELS[k] || k)}</span></button>`);
    }
    this.detailBody.innerHTML = `
      <div class="tb-split" style="--tb-farbe: ${layerColor};">
        <div class="tb-bild">${bildHtml}</div>
        <div class="tb-liste">${zeilen.join('') || '<p style="color: var(--text-dim);">Keine Tasten.</p>'}</div>
      </div>`;
  }

  // Umschalter „Funktionen: Liste | In den Tasten“ über dem Bild (nur bei Modulen mit Bild)
  renderAnsichtSchalter(liste) {
    const el = document.getElementById('tb-ansicht');
    if (!el) return;
    if (liste == null) { el.innerHTML = ''; return; }
    const knopf = (wert, text, an) => `<button type="button" class="btn-secondary btn-small${an ? ' active' : ''}" aria-pressed="${an}" onclick="window.moduleFlow.setAnsicht('${wert}')">${text}</button>`;
    el.innerHTML = `<span>Funktionen:</span>${knopf('liste', 'Liste', liste)}${knopf('tasten', 'In den Tasten', !liste)}`;
  }

  setAnsicht(wert) {
    try { localStorage.setItem(TB_ANSICHT_KEY, wert); } catch { /* ohne Speicher gilt die Wahl bis zum Neuladen nicht */ }
    if (!this.currentLayout) return;
    this.renderImageDetail(this.currentLayout);
    this.resizeModuleImage();
  }

  // Ohne Modulbild: Raster mit Nummer, Name und belegter Funktion (Geräteprofile 23.10.2026; vorher eine schlichte Liste)
  renderListDetail() {
    const mod = this.currentModule;
    const disabledButtons = new Set(mod.griffBestimmt ? [] : (this.currentLayout?.disabledButtons || []));
    const { hiddenButtons, hiddenAxisKeys } = axisModeFiltering(mod, this.deviceConfig);
    if (mod.id === 'bedienteil') {
      for (const b of bedienteilFiltering(this.deviceConfig)) hiddenButtons.add(b);
    }
    const [start, end] = mod.buttonRange || [0, -1];
    const visible = Array.isArray(mod.buttons) ? mod.buttons : Array.from({ length: Math.max(0, end - start + 1) }, (_, k) => start + k);
    const names = mod.buttonNames || {};
    let items = '';
    for (const b of visible) {
      if (disabledButtons.has(b) || hiddenButtons.has(b)) continue;
      const fn = this.buttonLabels?.[b];
      items += `<button type="button" class="mb-raster-item ${fn ? 'used' : ''}" onclick="window.moduleFlow.openButton(${Number(b)})">
        <span class="mb-nr">${Number(b)}</span><b>${escapeHtml(names[b] || '')}</b><small>${fn ? escapeHtml(fn) : 'frei'}</small></button>`;
    }
    for (const axisKey of mod.axisKeys || []) {
      if (hiddenAxisKeys.has(axisKey)) continue;
      const label = AXIS_LABELS[axisKey] || axisKey;
      items += `<button type="button" class="mb-raster-item axis" onclick="window.moduleFlow.openAxis(${escapeHtml(JSON.stringify(axisKey))})">
        <span class="mb-nr">⇕</span><b>${escapeHtml(label)}</b><small>Achse</small></button>`;
      if (AXIS_MODE_CONFIG[axisKey] && hasCraftConsoleSettings(this.deviceConfig)) {
        items += `<button type="button" class="mb-raster-item toggle" onclick="window.moduleFlow.toggleAxisModeQuick(${escapeHtml(JSON.stringify(axisKey))})">
          <span class="mb-nr">⇄</span><b>${escapeHtml(label)}</b><small>Achse ⇄ Taste</small></button>`;
      }
    }
    this.renderAnsichtSchalter(null);
    const hint = mod.eigen || mod.layoutId === null ? '' : '<p style="color: var(--text-dim);">Für dieses Modul liegt noch kein Bild vor.</p>';
    this.detailBody.innerHTML = `${hint}<div class="mb-raster">${items || '<p style="color: var(--text-dim);">Keine Tasten.</p>'}</div>`;
  }

  // Schaltet Achse<->Taste direkt um (ohne das volle Achsen-Popup zu öffnen) und rendert das Modul
  // danach neu, damit sich Tasten-/Achsen-Hotspots sofort passend zum neuen Modus zeigen.
  async toggleAxisModeQuick(axisKey) {
    const cfg = AXIS_MODE_CONFIG[axisKey];
    if (!cfg) return;
    const currentlyButton = isButtonMode(axisKey, this.deviceConfig);
    const newValue = currentlyButton ? 'achse' : cfg.buttonValue;
    try {
      const res = await fetch('/api/device-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: cfg.modeKey, value: newValue })
      });
      const result = await res.json();
      if (!result.success) { uiAlert('Umschalten fehlgeschlagen: ' + result.error); return; }
      window.showToast(`${AXIS_LABELS[axisKey] || axisKey}: jetzt ${newValue === 'achse' ? 'Achse' : 'Taste'}`);
      await this.openModule(this.currentModule.id);
    } catch (error) {
      uiAlert('Umschalten fehlgeschlagen: ' + error.message);
    }
  }

  // Öffnet direkt das kompakte Achsen-Konfigurations-Popup (Modus/Auslöseweg + Gamepad-Achse) für
  // genau diese Achse, statt nur zur vollen Achsen-Zuordnungsseite zu springen (Hendriks Wunsch
  // 21.08.2026) -- Speicherlogik bleibt dieselbe wie dort, s. axisConfigModal.js.
  openAxis(axisKey) {
    window.axisConfigModal.open(axisKey);
  }

  /**
   * @param {number} humanButtonNumber - 1-basierte globale Tastennummer (Firmware-Nummerierung)
   */
  openButton(humanButtonNumber) {
    const slotId = window.craftSlotLayerToolbar.isActive() ? this.currentModule.id : null;
    const layer = slotId ? window.craftSlotLayerToolbar.getDisplayedLayer() : 1;
    window.mappingModal.openButtonMappingForModuleFlow(humanButtonNumber - 1, () => {
      // Nach erfolgreichem Speichern in der Modul-Detailansicht bleiben statt zur Gesamtübersicht
      // zurückzuspringen (Hendriks Vorgabe) -- nur die Beschriftung der gerade zugeordneten Taste
      // auffrischen, exakt derselbe Mechanismus wie beim Ebenen-Wechsel (s. refreshHotspotLabels()).
      window.moduleFlow.refreshHotspotLabels(slotId, layer);
    }, slotId, layer);
  }

  // Wird von app.js beim Klick auf "Übersicht" im Wurzel-Menü aufgerufen -- keine eigene
  // Gesamtübersicht mehr (s. load()), stattdessen einfach zum ersten Modul zurück + frische Daten
  // (z.B. falls zwischenzeitlich im Kalibrierungs-Tool etwas geändert wurde).
  backToOverview() {
    this.load();
  }
}

class LayoutCalibrator {
  constructor() {
    this.modules = [];
    this.currentModuleId = null;
    this.currentModule = null;
    this.isOverviewMode = false;
    this.layout = { image: null, hotspots: [] };
    this.calibratingTarget = null; // Taste (Zahl) im Modul-Modus, moduleId (String) im Übersichts-Modus
    this.select = document.getElementById('calibration-module-select');
    this.body = document.getElementById('calibration-body');
    this.load();
    // Die Positions-/Form-Regler leeren sich, sobald man den Kalibrierungs-Tab verlässt (auch bei
    // einem Wechsel zu einer anderen Entwicklertools-Unterseite wie Live-Diagnose -- deren Ebene
    // bleibt dieselbe .nav-level, der Slot würde sonst veraltet stehen bleiben), s. renderSliderSidebar().
    document.addEventListener('tabchanged', e => {
      if (e.detail.tabName !== 'calibration-tool') this.renderSliderSidebar('');
    });
  }

  async load() {
    const res = await fetch('/api/modules?alle=1');   // alle Modulbilder, unabhängig vom aktiven Controller (Geräteprofile 23.10.2026)
    const data = await res.json();
    this.modules = data.modules || [];
    this.select.innerHTML = '<option value="">Modul wählen...</option>' +
      '<option value="__overview__">Gesamtübersicht (alle Module)</option>' +
      this.modules.map(m => `<option value="${mfEsc(m.id)}">${mfEsc(m.name)}</option>`).join('');
  }

  // Aus dem Editor „Eigene Controller“: Modulliste frisch holen und dieses Modul öffnen (Tasten aufs Bild setzen)
  async openFor(moduleId) {
    await this.load();
    this.select.value = moduleId;
    await this.selectModule(moduleId);
  }

  async selectModule(value) {
    if (!value) {
      this.currentModuleId = null;
      this.isOverviewMode = false;
      this.body.innerHTML = '';
      return;
    }
    this.currentModuleId = value;
    this.isOverviewMode = (value === '__overview__');
    this.currentModule = this.isOverviewMode ? null : this.modules.find(m => m.id === value);
    await this.reloadLayout();
    this.calibratingTarget = null;
    await this.render();
  }

  async reloadLayout() {
    const endpoint = this.isOverviewMode ? '/api/overview-layout' : `/api/module-layout/${this.currentModuleId}`;
    const res = await fetch(endpoint);
    const data = await res.json();
    this.layout = data.layout || { image: null, hotspots: [] };
  }

  targetKeyOf(hotspot) {
    if (this.isOverviewMode) return hotspot.moduleId;
    if (hotspot.modeToggleKey != null) return 'toggle:' + hotspot.modeToggleKey;
    return hotspot.axisKey != null ? hotspot.axisKey : hotspot.button;
  }

  labelFor(key) {
    if (this.isOverviewMode) {
      const mod = this.modules.find(m => m.id === key);
      return mod ? mod.name : key;
    }
    if (typeof key === 'string' && key.startsWith('toggle:')) {
      const axisKey = key.slice('toggle:'.length);
      return 'Umschalter: ' + (AXIS_LABELS[axisKey] || axisKey);
    }
    if (typeof key === 'string') return AXIS_LABELS[key] || this.currentModule?.axisInfo?.[key]?.label || key;
    const name = this.currentModule?.buttonNames?.[key];
    return name ? `Taste ${key} · ${name}` : `Taste ${key}`;
  }

  async render() {
    const uploadHtml = `
      <div class="input-group">
        <label>Bild hochladen:</label>
        <input type="file" id="calibration-image-upload" accept="image/png,image/jpeg,image/webp" onchange="window.layoutCalibrator.uploadImage(this.files[0])">
      </div>
    `;

    const targetListHtml = this.renderTargetList();

    // Export/Import der kompletten Modul-Kalibrierung (25.08.2026, Hendriks Wunsch) -- nicht in der
    // Gesamtübersicht (die hat kein sinnvolles Tastennummern-Remapping-Ziel).
    const exportImportHtml = this.isOverviewMode ? '' : `
      <div class="button-group" style="margin-top: 8px;">
        <button class="btn-secondary btn-small" onclick="window.layoutCalibrator.exportModule()">Modul exportieren</button>
        <button class="btn-secondary btn-small" onclick="window.layoutCalibrator.pickImportFile()">Modul importieren</button>
      </div>`;

    if (!this.layout.image) {
      this.body.innerHTML = uploadHtml + exportImportHtml + targetListHtml + '<p style="color: var(--text-dim); margin-top: 10px;">Noch kein Bild hinterlegt.</p>';
      this.renderSliderSidebar('');
      return;
    }

    const cropButtonHtml = `<button class="btn-secondary btn-small" style="margin-top:8px;" onclick="window.layoutCalibrator.openCrop()">Zuschneiden</button>
      <button class="btn-danger btn-small" style="margin-top:8px; margin-left:8px;" onclick="window.layoutCalibrator.clearCalibration()">Kalibrierung löschen</button>`;

    // In der Kalibrierung wird NICHT nach aktuellem Achse/Taste-Gerätemodus gefiltert (Hendriks Wunsch
    // 25.08.2026: "es müssen dort immer alle angezeigt werden, damit ich sie ordentlich anordnen kann") --
    // axisModeFiltering blendet weiterhin nur die NORMALE Nutzungsansicht aus (ModuleFlow.renderImageDetail()/
    // renderListDetail()), die hat ihre eigene, unabhängige deviceConfig/Filterlogik und ist von dieser
    // Datei hier komplett getrennt. Das "verbaut?"-Häkchen (disabledButtons) filtert dagegen weiterhin
    // auch HIER, was tatsächlich platziert/angezeigt wird -- Hendriks Korrektur 25.08.2026: nicht
    // angehakte Tasten sollen nicht mit platziert werden müssen. Die Zielliste (renderTargetList())
    // zeigt trotzdem weiterhin ausnahmslos alle Ziele, damit man eine Taste jederzeit anhaken+platzieren
    // kann.
    const disabledButtons = new Set(this.layout.disabledButtons || []);
    const toggleItems = (this.isOverviewMode ? [] : (this.currentModule.axisKeys || []))
      .filter(axisKey => AXIS_MODE_CONFIG[axisKey])
      .map(axisKey => `toggle:${axisKey}`);
    const items = this.isOverviewMode
      ? this.modules.filter(m => !m.eigen && !m.teil).map(m => m.id)   // Gesamtbild = Armlehne; eigene Controller und Griff-/Unterbau-Bilder haben keins
      : [
          ...moduleButtonList(this.currentModule).filter(b => !disabledButtons.has(b)),
          ...(this.currentModule.axisKeys || []),   // Achsen-Positionen mit kalibrieren, s. AXIS_LABELS oben
          ...toggleItems
        ];
    const calibratedKeys = new Set(this.layout.hotspots.map(h => this.targetKeyOf(h)));
    const total = items.length;

    if (this.calibratingTarget === null) {
      for (const item of items) {
        if (!calibratedKeys.has(item)) { this.calibratingTarget = item; break; }
      }
    }

    // Positionierung läuft nur noch über Schieberegler (kein Klick-auf-Bild mehr) -- ein frisch
    // angewähltes Ziel braucht daher sofort einen Hotspot-Eintrag, damit die Regler etwas zu
    // steuern haben. Als Startpunkt dient Position+Größe der zuletzt gesetzten Taste (Hendriks
    // Vorgabe: bei einer Reihe gleich großer/positionierter Tasten muss man dann nur noch die
    // Position leicht anpassen statt jedes Mal von der Bildmitte aus neu anzufangen). Nur die
    // allererste Taste eines Moduls fällt auf einen echten Default (Bildmitte, 6%, Kreis) zurück.
    if (this.calibratingTarget !== null && !this.layout.hotspots.find(h => this.targetKeyOf(h) === this.calibratingTarget)) {
      const last = this.layout.hotspots[this.layout.hotspots.length - 1];
      const start = last
        ? { x: last.x, y: last.y, shape: last.shape || 'circle', width: last.width ?? 6, height: last.height ?? 6, rotation: last.rotation || 0 }
        : { x: 50, y: 50, shape: 'circle', width: 6, height: 6, rotation: 0 };
      await this.postHotspot(this.calibratingTarget, start.x, start.y, start.shape, start.width, start.height, start.rotation);
      await this.reloadLayout();
    }

    const hotspotsHtml = this.layout.hotspots
      .filter(h => {
        const key = this.targetKeyOf(h);
        // nicht angehakte ("verbaut?"=nein) Tasten werden ausgeblendet -- außer man kalibriert sie
        // gerade aktiv (bewusst über die Zielliste angesprungen), sonst hätte man beim Positionieren
        // keine sichtbare Markierung zum Ausrichten.
        if (typeof h.button === 'number' && disabledButtons.has(h.button) && key !== this.calibratingTarget) return false;
        return true;
      })
      .map(h => {
        const key = this.targetKeyOf(h);
        const isRecal = key === this.calibratingTarget;
        const label = this.isOverviewMode ? '' : (h.modeToggleKey ? '⇄' : (h.axisKey || h.button));
        return `<div class="calibration-hotspot ${isRecal ? 'recalibrating' : ''}" style="${hotspotStyleAttr(h)}" onclick="window.layoutCalibrator.selectForRecalibration(event, ${escapeHtml(JSON.stringify(String(key)))})" title="${escapeHtml(this.labelFor(key))}">${escapeHtml(label)}</div>`;
      }).join('');

    const progressHtml = this.calibratingTarget !== null
      ? `<p class="calibration-progress">Position von <strong>${escapeHtml(this.labelFor(this.calibratingTarget))}</strong> grob per Klick setzen, dann mit den Reglern feinjustieren. (${calibratedKeys.size}/${total} gesetzt)</p>`
      : `<p class="calibration-progress">Alle ${total} sind kalibriert. Klicke auf eine Markierung, um sie neu einzustellen.</p>`;

    const activeHotspot = this.layout.hotspots.find(h => this.targetKeyOf(h) === this.calibratingTarget);
    this.renderSliderSidebar(activeHotspot ? this.renderStyleControls(activeHotspot) : '');

    this.body.innerHTML = `
      ${uploadHtml}
      ${exportImportHtml}
      ${targetListHtml}
      ${cropButtonHtml}
      ${progressHtml}
      <div class="calibration-image-wrap" onclick="window.layoutCalibrator.onImageClick(event)">
        <img src="${bust(this.layout.image)}" alt="Kalibrierung">
        ${hotspotsHtml}
      </div>
    `;
  }

  // Vollständige, immer ungefilterte Liste ALLER möglichen Ziele dieses Moduls (Tasten + Achsen +
  // Umschalter) -- Hendriks Wunsch 25.08.2026: hier soll man JEDES Ziel anklicken können, um direkt
  // dorthin zu springen und es zu positionieren, unabhängig vom sequenziellen Ablauf und unabhängig
  // davon, ob es gerade "verbaut" ist. Die "verbaut?"-Checkbox bleibt nur für echte Tastennummern
  // erhalten (steuert weiterhin ausschließlich die normale Nutzungsansicht, s. disabledButtons dort),
  // für Achsen/Umschalter ergibt "verbaut" kein sinnvolles Konzept.
  renderTargetList() {
    if (this.isOverviewMode || !this.currentModule) return '';
    const disabledButtons = new Set(this.layout.disabledButtons || []);
    const calibratedKeys = new Set(this.layout.hotspots.map(h => this.targetKeyOf(h)));
    const toggleItems = (this.currentModule.axisKeys || [])
      .filter(axisKey => AXIS_MODE_CONFIG[axisKey])
      .map(axisKey => `toggle:${axisKey}`);
    const allItems = [
      ...moduleButtonList(this.currentModule),
      ...(this.currentModule.axisKeys || []),
      ...toggleItems
    ];
    const rows = allItems.map(item => {
      const isButtonNumber = typeof item === 'number';
      const isPlaced = calibratedKeys.has(item);
      const isActive = item === this.calibratingTarget;
      const checkboxHtml = isButtonNumber
        ? `<input type="checkbox" ${disabledButtons.has(item) ? '' : 'checked'}
             onchange="window.layoutCalibrator.toggleButtonVisibility(${item}, this.checked)" title="In diesem Setup verbaut?">`
        : '<span class="target-list-spacer"></span>';
      const keyAttr = String(item).replace(/"/g, '&quot;');
      return `
        <div class="target-list-item ${isActive ? 'active' : ''}">
          ${checkboxHtml}
          <span class="target-list-label" onclick="window.layoutCalibrator.selectTarget('${keyAttr}')">${isPlaced ? '✓' : '○'} ${this.labelFor(item)}</span>
        </div>`;
    }).join('');
    return `
      <div class="button-visibility-panel">
        <p style="color: var(--text-dim); margin: 8px 0 4px;">
          Alle Positionen dieses Moduls – anklicken, um direkt dorthin zu springen und zu positionieren.
          Die Checkbox steuert nur, ob die Taste in der normalen Ansicht später sichtbar ist ("verbaut?").
        </p>
        <div class="target-list">${rows}</div>
      </div>`;
  }

  // Springt direkt zu einem beliebigen Ziel (Taste/Achse/Umschalter), unabhängig vom sequenziellen
  // Ablauf und unabhängig vom "verbaut?"-Status -- Gegenstück zum Klick auf eine bereits gesetzte
  // Markierung (selectForRecalibration()), nur eben auch für noch NICHT platzierte Ziele nutzbar.
  async selectTarget(keyRaw) {
    const asNum = Number(keyRaw);
    const key = (!Number.isNaN(asNum) && String(asNum) === keyRaw) ? asNum : keyRaw;
    this.calibratingTarget = key;
    await this.render();
  }


  async toggleButtonVisibility(button, visible) {
    try {
      const res = await fetch(`/api/module-layout/${this.currentModuleId}/button-visibility`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ button, visible })
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'unbekannter Fehler');
    } catch (error) {
      uiAlert('Sichtbarkeit konnte nicht gespeichert werden: ' + error.message);
    }
    this.calibratingTarget = null; // Sichtbarkeitsänderung kann das aktuell anvisierte Ziel betreffen -- neu bestimmen
    await this.reloadLayout();
    await this.render();
  }

  // ---- Modul-Export/-Import (25.08.2026, Hendriks Wunsch: Kalibrierung eines Griffs später auf
  // einen anderen CraftSlot/Modul übertragen können) ----

  async exportModule() {
    if (this.isOverviewMode || !this.currentModuleId) return;
    try {
      const res = await fetch(`/api/module-layout/${this.currentModuleId}/export`);
      const result = await res.json();
      if (!result.success) { uiAlert('Export fehlgeschlagen: ' + result.error); return; }
      downloadJson(result.data, `Modul ${this.currentModuleId} ${new Date().toISOString().split('T')[0]}`);
      window.showToast?.('Modul exportiert (Ordner Downloads)');
    } catch (error) {
      uiAlert('Export fehlgeschlagen: ' + error.message);
    }
  }

  async pickImportFile() {
    if (this.isOverviewMode || !this.currentModuleId) return;
    try {
      const data = await pickJsonFile();   // js/basis.js
      if (data) this.openImportRemap(data);
    } catch (error) {
      uiAlert('Datei konnte nicht gelesen werden: ' + error.message);
    }
  }

  openImportRemap(data) {
    this.importData = data;
    // Standard-Verschiebung als Vorschlag (Ziel-Buttonrange-Start minus Quell-Buttonrange-Start) --
    // jede Zeile bleibt trotzdem einzeln editierbar, falls die Reihenfolge nicht 1:1 passt.
    const targetStart = this.currentModule.buttonRange[0];
    const sourceStart = data.sourceButtonRange ? data.sourceButtonRange[0] : targetStart;
    const defaultShift = targetStart - sourceStart;

    this.importMapping = {}; // Quell-Tastennummer -> Ziel-Tastennummer
    for (const h of (data.hotspots || [])) {
      if (typeof h.button === 'number') this.importMapping[h.button] = h.button + defaultShift;
    }
    this.importShift = defaultShift;
    this.renderImportModal();
    document.getElementById('module-import-modal').style.display = 'flex';
  }

  // Achsen-/Umschalter-Ziele automatisch übersetzen: per Position innerhalb der axisKeys-Liste von
  // Quell- bzw. Zielmodul (z.B. CraftSlot1 "leverA" an Index 2 -> CraftSlot2 "leverA2" an Index 2,
  // wenn beide Module gleich viele Achsen haben). Nicht übersetzbare Achsen fallen beim Import weg --
  // eine eigene 1:1-Zuordnungs-UI dafür lohnt bei nur 2-4 Achsen pro Modul nicht.
  mapAxisKey(sourceAxisKey, sourceAxisKeys, targetAxisKeys) {
    if (targetAxisKeys.includes(sourceAxisKey)) return sourceAxisKey;
    const idx = sourceAxisKeys.indexOf(sourceAxisKey);
    return (idx >= 0 && idx < targetAxisKeys.length) ? targetAxisKeys[idx] : null;
  }

  renderImportModal() {
    const data = this.importData;
    const body = document.getElementById('module-import-body');
    const sourceAxisKeys = data.sourceAxisKeys || [];
    const targetAxisKeys = this.currentModule.axisKeys || [];
    const [tLo, tHi] = this.currentModule.buttonRange;

    const buttonRows = (data.hotspots || [])
      .filter(h => typeof h.button === 'number')
      .map(h => {
        const target = this.importMapping[h.button];
        const outOfRange = target < tLo || target > tHi || Number.isNaN(target);
        return `
          <div class="target-list-item">
            <span style="width: 90px; display: inline-block;">Taste ${h.button} →</span>
            <input type="number" value="${target}" min="${tLo}" max="${tHi}" style="width: 70px;"
              onchange="window.layoutCalibrator.updateImportMapping(${h.button}, this.value)">
            ${outOfRange ? `<span style="color: var(--danger); font-size: 0.85rem;">außerhalb ${tLo}-${tHi}</span>` : ''}
          </div>`;
      }).join('');

    const axisRows = (data.hotspots || [])
      .filter(h => h.axisKey != null || h.modeToggleKey != null)
      .map(h => {
        const sourceKey = h.axisKey != null ? h.axisKey : h.modeToggleKey;
        const mapped = this.mapAxisKey(sourceKey, sourceAxisKeys, targetAxisKeys);
        const prefix = h.modeToggleKey != null ? 'Umschalter ' : '';
        return `<div class="target-list-item">${prefix}${escapeHtml(AXIS_LABELS[sourceKey] || sourceKey)} → ${mapped ? escapeHtml(AXIS_LABELS[mapped] || mapped) : '(nicht übertragbar, wird ausgelassen)'}</div>`;
      }).join('');

    const imageHtml = data.image
      ? `<img src="data:${escapeHtml(data.image.mimeType)};base64,${escapeHtml(data.image.base64)}" style="max-width: 100%; max-height: 160px; border-radius: 6px; margin-bottom: 8px; display: block;">`
      : '<p style="color: var(--text-dim);">Kein Bild in der Datei enthalten – aktuelles Bild dieses Moduls bleibt erhalten.</p>';

    body.innerHTML = `
      <p style="color: var(--text-dim);">
        Aus: <strong>${escapeHtml(data.sourceModuleName || data.sourceModuleId)}</strong> → Ziel: <strong>${escapeHtml(this.currentModule.name)}</strong>.
        ${data.image ? 'Das Bild ersetzt das aktuelle Bild dieses Moduls.' : ''}
      </p>
      ${imageHtml}
      <div class="input-group">
        <label>Verschiebung auf alle Tasten anwenden:</label>
        <div class="button-group">
          <input type="number" id="module-import-shift" value="${this.importShift}" style="width: 80px;">
          <button class="btn-secondary btn-small" onclick="window.layoutCalibrator.applyImportShift()">Anwenden</button>
        </div>
      </div>
      <p style="font-weight: 600; margin-top: 10px;">Tasten:</p>
      <div class="target-list">${buttonRows || '<p style="color: var(--text-dim);">Keine Tasten in der Datei.</p>'}</div>
      ${axisRows ? `<p style="font-weight: 600; margin-top: 10px;">Achsen/Umschalter:</p><div class="target-list">${axisRows}</div>` : ''}
    `;
  }

  updateImportMapping(sourceButton, value) {
    this.importMapping[sourceButton] = parseInt(value, 10);
  }

  applyImportShift() {
    const shift = parseInt(document.getElementById('module-import-shift').value, 10) || 0;
    this.importShift = shift;
    for (const h of (this.importData.hotspots || [])) {
      if (typeof h.button === 'number') this.importMapping[h.button] = h.button + shift;
    }
    this.renderImportModal();
  }

  closeImportModal() {
    document.getElementById('module-import-modal').style.display = 'none';
    this.importData = null;
    this.importMapping = null;
  }

  async confirmImport() {
    const data = this.importData;
    if (!data) return;

    const targets = Object.values(this.importMapping);
    const [tLo, tHi] = this.currentModule.buttonRange;
    if (targets.some(t => Number.isNaN(t) || t < tLo || t > tHi)) {
      uiAlert(`Alle Ziel-Tastennummern müssen im Bereich ${tLo}-${tHi} liegen.`);
      return;
    }
    if (new Set(targets).size !== targets.length) {
      uiAlert('Zwei Tasten wurden auf dieselbe Zielnummer gemappt – bitte eindeutig zuordnen.');
      return;
    }

    const sourceAxisKeys = data.sourceAxisKeys || [];
    const targetAxisKeys = this.currentModule.axisKeys || [];

    const hotspots = [];
    for (const h of (data.hotspots || [])) {
      if (typeof h.button === 'number') {
        hotspots.push({ ...h, button: this.importMapping[h.button] });
      } else if (h.axisKey != null) {
        const mapped = this.mapAxisKey(h.axisKey, sourceAxisKeys, targetAxisKeys);
        if (mapped) hotspots.push({ ...h, axisKey: mapped });
      } else if (h.modeToggleKey != null) {
        const mapped = this.mapAxisKey(h.modeToggleKey, sourceAxisKeys, targetAxisKeys);
        if (mapped) hotspots.push({ ...h, modeToggleKey: mapped });
      }
    }
    const disabledButtons = (data.disabledButtons || [])
      .filter(b => this.importMapping[b] != null)
      .map(b => this.importMapping[b]);

    const payload = { hotspots, disabledButtons };
    if (data.image) payload.image = data.image;

    try {
      const res = await fetch(`/api/module-layout/${this.currentModuleId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (!result.success) { uiAlert('Import fehlgeschlagen: ' + result.error); return; }
      window.showToast('Modul importiert');
      this.closeImportModal();
      this.calibratingTarget = null;
      await this.reloadLayout();
      await this.render();
    } catch (error) {
      uiAlert('Import fehlgeschlagen: ' + error.message);
    }
  }

  // Positions-/Form-Regler sitzen im linken Hauptmenü statt unter dem Bild (Hendriks Korrektur
  // 25.08.2026: "damit das Bild was man kalibriert nicht kleiner wird") -- daher dieselben Klassen
  // wie das Bedienpanel-Editor-Menü (.sm-sidebar-editor/.form-group/.sm-slider-value,
  // s. steuerungsmenues.js renderParamPanel()), statt der breiten .size-row-Zeilen, die für eine
  // volle Breite unter dem Bild gedacht waren.
  renderStyleControls(h) {
    const shape = h.shape || 'circle';
    const width = h.width != null ? h.width : 6;
    const height = h.height != null ? h.height : 6;
    const rotation = h.rotation || 0;
    // Regler plus Zahlenfeld (Hendrik 25.10.2026: „die Schieberegler … so feinfühlig … würde da gerne auch einfach einen
    // Wert eingeben“): Tippen und Enter übernimmt, Pfeiltasten gehen in kleinen Schritten, beide laufen mit
    const zeile = (key, label, min, max, step, value, einheit) => `
        <div class="form-group hs-zeile">
          <label for="hs-num-${key}">${label}</label>
          <div class="hs-wert">
            <input type="range" id="hs-range-${key}" min="${min}" max="${max}" step="${step}" value="${value}"
              oninput="window.layoutCalibrator.hsRegler('${key}', this.value, false)"
              onchange="window.layoutCalibrator.hsRegler('${key}', this.value, true)">
            <input type="number" id="hs-num-${key}" class="hs-zahl" min="${min}" max="${max}" step="${step}" value="${value}" inputmode="decimal"
              oninput="window.layoutCalibrator.hsZahl('${key}', this, false)"
              onchange="window.layoutCalibrator.hsZahl('${key}', this, true)"
              onkeydown="if (event.key === 'Enter') this.blur()"><span class="hs-einheit">${einheit}</span>
          </div>
        </div>`;
    return `
      <div class="sm-sidebar-editor">
        <h4>Position &amp; Form</h4>
        <div class="shape-toggle">
          <label><input type="radio" name="hotspot-shape" value="circle" ${shape === 'circle' ? 'checked' : ''} onchange="window.layoutCalibrator.commitHotspotStyle('shape','circle')"> ○ Kreis</label>
          <label><input type="radio" name="hotspot-shape" value="rect" ${shape === 'rect' ? 'checked' : ''} onchange="window.layoutCalibrator.commitHotspotStyle('shape','rect')"> ▭ Rechteck</label>
        </div>
        ${zeile('x', 'X-Position', 0, 100, 0.1, h.x, '%')}
        ${zeile('y', 'Y-Position', 0, 100, 0.1, h.y, '%')}
        ${zeile('width', 'Breite', 2, 60, 0.1, width, '%')}
        ${zeile('height', 'Höhe', 2, 60, 0.1, height, '%')}
        ${shape === 'rect' ? zeile('rotation', 'Drehung', -90, 90, 0.5, rotation, '°') : ''}
        <button class="btn-success btn-small" onclick="window.layoutCalibrator.nextTarget()">Weiter →</button>
      </div>
    `;
  }

  // Regler bewegt: Zahlenfeld mitführen; beim Loslassen speichern
  hsRegler(key, value, speichern) {
    const zahl = document.getElementById(`hs-num-${key}`);
    if (zahl) zahl.value = value;
    if (speichern) this.commitHotspotStyle(key, value); else this.liveUpdateHotspot(key, value);
  }

  // Zahl getippt (auch mit Komma): in den Grenzen halten, Regler mitführen; Enter bzw. Verlassen speichert
  hsZahl(key, el, speichern) {
    let v = parseFloat(String(el.value).replace(',', '.'));
    if (!Number.isFinite(v)) return;
    v = Math.min(parseFloat(el.max), Math.max(parseFloat(el.min), Math.round(v * 10) / 10));
    const regler = document.getElementById(`hs-range-${key}`);
    if (regler) regler.value = v;
    if (speichern) { el.value = v; this.commitHotspotStyle(key, v); } else this.liveUpdateHotspot(key, v);
  }

  renderSliderSidebar(html) {
    const slot = document.getElementById('calibration-slider-slot');
    if (slot) slot.innerHTML = html;
  }

  // true = gespeichert; bei einem Fehler Meldung + false (Aufrufer laden danach ohnehin neu)
  async postHotspot(key, x, y, shape, width, height, rotation = 0) {
    try {
      let res;
      if (this.isOverviewMode) {
        res = await fetch('/api/overview-layout/hotspot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ moduleId: key, x, y, shape, width, height, rotation })
        });
      } else {
        // key ist eine Tastennummer (number), ein Achsen-Key (string) oder "toggle:<axisKey>" (Umschalter)
        let targetField;
        if (typeof key === 'string' && key.startsWith('toggle:')) targetField = { modeToggleKey: key.slice('toggle:'.length) };
        else if (typeof key === 'string') targetField = { axisKey: key };
        else targetField = { button: key };
        res = await fetch(`/api/module-layout/${this.currentModuleId}/hotspot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...targetField, x, y, shape, width, height, rotation })
        });
      }
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'unbekannter Fehler');
      return true;
    } catch (error) {
      uiAlert('Position konnte nicht gespeichert werden: ' + error.message);
      return false;
    }
  }

  // Sofortiges visuelles Feedback beim Ziehen des Reglers, ohne Server-Roundtrip/Neu-Rendern --
  // ein volles render() würde den gerade gezogenen Regler mitten in der Bewegung zerstören.
  liveUpdateHotspot(field, value) {
    const h = this.layout.hotspots.find(x => this.targetKeyOf(x) === this.calibratingTarget);
    if (!h) return;
    h[field] = field === 'shape' ? value : parseFloat(value);
    const marker = this.body.querySelector('.calibration-hotspot.recalibrating');
    if (marker) marker.setAttribute('style', hotspotStyleAttr(h));
  }

  async commitHotspotStyle(field, value) {
    this.liveUpdateHotspot(field, value);
    const h = this.layout.hotspots.find(x => this.targetKeyOf(x) === this.calibratingTarget);
    if (!h) return;
    await this.postHotspot(this.calibratingTarget, h.x, h.y, h.shape || 'circle', h.width ?? 6, h.height ?? 6, h.rotation ?? 0);
    await this.reloadLayout();
    await this.render();
  }

  async nextTarget() {
    this.calibratingTarget = null;
    await this.render();
  }

  clearCalibration() {
    const label = this.isOverviewMode ? 'die Gesamtübersicht' : this.currentModule.name;
    window.confirmDialog.show(`Kalibrierung für ${label} wirklich löschen? Alle gesetzten Positionen gehen verloren, das Bild bleibt erhalten.`, async () => {
      const endpoint = this.isOverviewMode ? '/api/overview-layout/hotspots' : `/api/module-layout/${this.currentModuleId}/hotspots`;
      let result;
      try {
        const res = await fetch(endpoint, { method: 'DELETE' });
        result = await res.json();
      } catch (err) {
        uiAlert('Löschen fehlgeschlagen: Server antwortet nicht wie erwartet. Wurde er nach den letzten Änderungen neu gestartet?');
        return;
      }
      if (!result || !result.success) {
        uiAlert('Löschen fehlgeschlagen: ' + (result && result.error ? result.error : 'unbekannter Fehler'));
        return;
      }
      window.showToast(`Kalibrierung für ${label} gelöscht`);
      this.calibratingTarget = null;
      await this.reloadLayout();
      await this.render();
    }, { danger: true });
  }

  async uploadImage(file) {
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const endpoint = this.isOverviewMode ? '/api/overview-layout/image' : `/api/module-layout/${this.currentModuleId}/image`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: buffer
    });
    const result = await res.json();
    if (result.success) {
      bustInvalidate(result.image);   // echtes neues Bild -- jetzt DARF/SOLL frisch geladen werden
      this.calibratingTarget = null;
      await this.reloadLayout();
      await this.render();
    } else {
      uiAlert('Bild-Upload fehlgeschlagen: ' + result.error);
    }
  }

  openCrop() {
    if (!this.layout.image) return;
    window.imageCropper.open(this.layout.image, (blob) => this.uploadBlob(blob));
  }

  async uploadBlob(blob) {
    const endpoint = this.isOverviewMode ? '/api/overview-layout/image' : `/api/module-layout/${this.currentModuleId}/image`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'image/png' },
      body: blob
    });
    const result = await res.json();
    if (result.success) {
      bustInvalidate(result.image);   // echtes neues Bild -- jetzt DARF/SOLL frisch geladen werden
      this.calibratingTarget = null;
      await this.reloadLayout();
      await this.render();
    } else {
      uiAlert('Zuschneiden fehlgeschlagen: ' + result.error);
    }
  }

  async selectForRecalibration(event, key) {
    event.stopPropagation();
    // Buttons sind numerisch gespeichert, moduleIds UND Achsen-Keys sind Strings -- key kommt aus dem
    // Template immer als String an, daher nur bei einer reinen Ziffernfolge (Taste) in Number wandeln.
    this.calibratingTarget = (this.isOverviewMode || !/^\d+$/.test(key)) ? key : Number(key);
    await this.render();
  }

  // Grobe Positionierung per Klick aufs Bild -- Feinjustierung danach über die Regler in
  // renderStyleControls() (beide Wege bedienen dieselben x/y-Werte, kein Widerspruch).
  async onImageClick(event) {
    if (this.calibratingTarget === null) return; // alle gesetzt, keine Markierung zur Neukalibrierung ausgewählt
    const wrap = event.currentTarget;
    const rect = wrap.getBoundingClientRect();
    const x = Math.round(((event.clientX - rect.left) / rect.width) * 1000) / 10;
    const y = Math.round(((event.clientY - rect.top) / rect.height) * 1000) / 10;

    const existing = this.layout.hotspots.find(h => this.targetKeyOf(h) === this.calibratingTarget);
    const shape = existing?.shape || 'circle';
    const width = existing?.width ?? 6;
    const height = existing?.height ?? 6;
    const rotation = existing?.rotation ?? 0;

    await this.postHotspot(this.calibratingTarget, x, y, shape, width, height, rotation);
    await this.reloadLayout();
    await this.render();
  }
}

class ImageCropper {
  constructor() {
    this.modal = document.getElementById('crop-dialog');
    this.imageEl = document.getElementById('crop-image');
    this.wrapEl = document.getElementById('crop-image-wrap');
    this.rectEl = document.getElementById('crop-rect');
    this.applyBtn = document.getElementById('crop-dialog-apply');
    this.cancelBtn = document.getElementById('crop-dialog-cancel');
    this.rotationInput = document.getElementById('crop-rotation');
    this.rotationReadout = document.getElementById('crop-rotation-readout');
    this.onApply = null;
    this.rect = { x: 10, y: 10, width: 80, height: 80 }; // Prozent, relativ zum angezeigten Bild
    this.angle = 0; // Grad -- rein visuell/für den Crop-Ausschnitt, Ziehen/Skalieren bleibt achsenparallel
    this.dragState = null;

    this.rectEl.addEventListener('pointerdown', (e) => this.startDrag(e, 'move'));
    this.rectEl.querySelectorAll('.crop-handle').forEach(handle => {
      handle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.startDrag(e, handle.dataset.handle);
      });
    });
    window.addEventListener('pointermove', (e) => this.onDrag(e));
    window.addEventListener('pointerup', () => { this.dragState = null; });

    this.applyBtn.addEventListener('click', () => this.apply());
    this.cancelBtn.addEventListener('click', () => this.close());
  }

  open(imageUrl, onApply) {
    this.onApply = onApply;
    this.imageEl.src = imageUrl;
    this.rect = { x: 10, y: 10, width: 80, height: 80 };
    this.angle = 0;
    this.rotationInput.value = 0;
    this.rotationReadout.textContent = '0°';
    this.renderRect();
    this.modal.style.display = 'flex';
  }

  close() {
    this.modal.style.display = 'none';
    this.onApply = null;
  }

  setRotation(value) {
    this.angle = parseFloat(value);
    this.rotationReadout.textContent = `${this.angle}°`;
    this.renderRect();
  }

  renderRect() {
    this.rectEl.style.left = this.rect.x + '%';
    this.rectEl.style.top = this.rect.y + '%';
    this.rectEl.style.width = this.rect.width + '%';
    this.rectEl.style.height = this.rect.height + '%';
    this.rectEl.style.transform = `rotate(${this.angle}deg)`;
  }

  startDrag(event, mode) {
    event.preventDefault();
    this.dragState = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startRect: { ...this.rect },
      wrapRect: this.wrapEl.getBoundingClientRect()
    };
  }

  onDrag(event) {
    if (!this.dragState) return;
    const { mode, startX, startY, startRect, wrapRect } = this.dragState;
    const dxPct = ((event.clientX - startX) / wrapRect.width) * 100;
    const dyPct = ((event.clientY - startY) / wrapRect.height) * 100;
    let { x, y, width, height } = startRect;

    if (mode === 'move') {
      x = startRect.x + dxPct;
      y = startRect.y + dyPct;
    } else {
      if (mode.includes('w')) { x = startRect.x + dxPct; width = startRect.width - dxPct; }
      if (mode.includes('e')) { width = startRect.width + dxPct; }
      if (mode.includes('n')) { y = startRect.y + dyPct; height = startRect.height - dyPct; }
      if (mode.includes('s')) { height = startRect.height + dyPct; }
    }

    width = Math.max(5, Math.min(width, 100));
    height = Math.max(5, Math.min(height, 100));
    x = Math.max(0, Math.min(x, 100 - width));
    y = Math.max(0, Math.min(y, 100 - height));

    this.rect = { x, y, width, height };
    this.renderRect();
  }

  apply() {
    const img = this.imageEl;
    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;
    const cropW = Math.round((this.rect.width / 100) * naturalW);
    const cropH = Math.round((this.rect.height / 100) * naturalH);
    const centerX = ((this.rect.x + this.rect.width / 2) / 100) * naturalW;
    const centerY = ((this.rect.y + this.rect.height / 2) / 100) * naturalH;

    const canvas = document.createElement('canvas');
    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext('2d');
    // Auswahl ist ggf. gedreht (this.angle) -- Ausschnitt wird "geradegerichtet" extrahiert, indem
    // das Quellbild um den gedrehten Auswahlmittelpunkt gegengedreht ins Ziel-Canvas gezeichnet wird.
    ctx.translate(cropW / 2, cropH / 2);
    ctx.rotate((-this.angle * Math.PI) / 180);
    ctx.translate(-centerX, -centerY);
    ctx.drawImage(img, 0, 0, naturalW, naturalH);

    canvas.toBlob((blob) => {
      const callback = this.onApply;
      this.close();
      if (callback) callback(blob);
    }, 'image/png');
  }
}

/**
 * Ebenenbelegung (Shift-Layer) pro CraftSlot -- Toolbar oben rechts in der Modul-Detailansicht,
 * nur für craftslot1/craftslot2 sichtbar. Zwei getrennte Zustände, bewusst nicht verwechseln:
 * - "angezeigte" Ebene (this.displayedLayer): rein diese Web-UI, welche Ebene man grad bearbeitet.
 * - tatsächlich AKTIVE Ebene zur Laufzeit: ergibt sich aus den physisch gehaltenen Ebenentastern
 *   (server/mappingEngine.js getCurrentCraftSlotLayer()) -- hat mit dieser Klasse nichts zu tun.
 */
class CraftSlotLayerToolbar {
  constructor() {
    this.container = document.getElementById('craftslot-layer-toolbar');
    this.socket = window.hubSocket;   // gemeinsame Verbindung der Seite (hubSocket.js, B4)
    this.modules = null;   // Cache von /api/modules, für die CraftSlot-Zugehörigkeits-Prüfung beim Zuordnen
    this.config = null;    // /api/craftslot-layers -- {craftslot1:{layerButton1,layerButton2}, craftslot2:{...}}
    this.slotId = null;    // aktuelles Modul, falls craftslot1/2, sonst null (Toolbar dann unsichtbar)
    this.displayedLayer = 1;
    this.awaitingAssignment = null; // 1 oder 2 während "warte auf Tastendruck", sonst null
    this.socket.on('state-update', (data) => this.onStateUpdate(data));
  }

  async loadConfig() {
    try {
      const res = await fetch('/api/craftslot-layers');
      this.config = (await res.json()).config;
    } catch (error) {
      console.error('CraftSlot-Ebenentaster konnten nicht geladen werden:', error);
    }
  }

  async loadModules() {
    if (this.modules) return;
    try {
      const res = await fetch('/api/modules');
      this.modules = (await res.json()).modules || [];
    } catch (error) {
      console.error('Module konnten nicht geladen werden:', error);
      this.modules = [];
    }
  }

  // Von ModuleFlow.openModule()/backToOverview() aufgerufen -- moduleId ist z.B. 'craftslot1',
  // 'einschub1' etc., oder null beim Zurückgehen zur Übersicht.
  async setModule(moduleId) {
    this.slotId = (moduleId === 'craftslot1' || moduleId === 'craftslot2') ? moduleId : null;
    this.displayedLayer = 1;
    this.awaitingAssignment = null;
    if (this.slotId) await Promise.all([this.loadConfig(), this.loadModules()]);
    this.render();
  }

  isActive() {
    return this.slotId !== null;
  }

  getDisplayedLayer() {
    return this.isActive() ? this.displayedLayer : 1;
  }

  cycleLayer() {
    this.displayedLayer = this.displayedLayer >= 4 ? 1 : this.displayedLayer + 1;
    this.render();
    window.moduleFlow.refreshHotspotLabels(this.slotId, this.displayedLayer);
  }

  render() {
    if (!this.slotId) {
      this.container.style.display = 'none';
      this.container.innerHTML = '';
      return;
    }

    this.container.style.display = 'flex';
    this.container.style.gap = '6px';
    this.container.style.alignItems = 'center';

    const romanLabels = ['I', 'II', 'III', 'IV'];
    const modeBg = CRAFTSLOT_LAYER_COLORS[this.displayedLayer - 1];

    const cfg = this.config?.[this.slotId] || { layerButton1: null, layerButton2: null };
    const grayed1 = this.displayedLayer === 2 || this.displayedLayer === 4;
    const grayed2 = this.displayedLayer === 3 || this.displayedLayer === 4;
    const grayStyle = 'background: var(--text-dim); color: #000;';

    this.container.innerHTML = `
      <button class="btn-secondary btn-small" style="${modeBg ? `background:${modeBg}; color:#000;` : ''}"
              onclick="window.craftSlotLayerToolbar.cycleLayer()"
              title="Zeigt/bearbeitet Ebene ${romanLabels[this.displayedLayer - 1]} in dieser Web-Ansicht – unabhängig davon, welche Ebene gerade physisch aktiv ist">
        Ebene ${romanLabels[this.displayedLayer - 1]}
      </button>
      <button class="btn-secondary btn-small" style="${grayed1 ? grayStyle : ''}"
              onclick="window.craftSlotLayerToolbar.startAssign(1)" title="Ebenentaster 1 zuordnen">
        ${this.awaitingAssignment === 1 ? 'Warte auf Tastendruck…' : `Taster 1: ${cfg.layerButton1 != null ? 'Taste ' + (cfg.layerButton1 + 1) : '–'}`}
      </button>
      ${cfg.layerButton1 != null ? `<button class="btn-danger btn-small" onclick="window.craftSlotLayerToolbar.clear(1)" title="Ebenentaster 1 entfernen">×</button>` : ''}
      <button class="btn-secondary btn-small" ${cfg.layerButton1 == null ? 'disabled title="Erst Ebenentaster 1 zuordnen"' : 'title="Ebenentaster 2 zuordnen"'} style="${grayed2 ? grayStyle : ''}"
              onclick="window.craftSlotLayerToolbar.startAssign(2)">
        ${this.awaitingAssignment === 2 ? 'Warte auf Tastendruck…' : `Taster 2: ${cfg.layerButton2 != null ? 'Taste ' + (cfg.layerButton2 + 1) : '–'}`}
      </button>
      ${cfg.layerButton2 != null ? `<button class="btn-danger btn-small" onclick="window.craftSlotLayerToolbar.clear(2)" title="Ebenentaster 2 entfernen">×</button>` : ''}
    `;
  }

  startAssign(slotNum) {
    if (slotNum === 2 && this.config?.[this.slotId]?.layerButton1 == null) return;
    // Erneuter Klick auf denselben Taster bricht die Zuordnung wieder ab.
    this.awaitingAssignment = this.awaitingAssignment === slotNum ? null : slotNum;
    this.render();
  }

  async onStateUpdate(data) {
    if (this.awaitingAssignment == null || !this.slotId) return;
    const buttonDownIds = data.events?.buttonDown || [];
    const hit = buttonDownIds.find(buttonId => {
      const human = buttonId + 1;
      const mod = this.modules?.find(m => human >= m.buttonRange[0] && human <= m.buttonRange[1]);
      return (mod?.layerSlot || mod?.id) === this.slotId;   // CraftUnit am CraftLink = Ebenen von CraftSlot 1
    });
    if (hit === undefined) return;

    const slotNum = this.awaitingAssignment;
    this.awaitingAssignment = null;
    try {
      const res = await fetch(`/api/craftslot-layers/${this.slotId}/layer-button/${slotNum}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buttonId: hit })
      });
      const result = await res.json();
      if (!result.success) {
        uiAlert('Zuordnen fehlgeschlagen: ' + result.error);
      } else {
        window.showToast(`Ebenentaster ${slotNum} = Taste ${hit + 1}`);
      }
    } catch (error) {
      uiAlert('Zuordnen fehlgeschlagen: ' + error.message);
    }
    await this.loadConfig();
    this.render();
  }

  clear(slotNum) {
    window.confirmDialog.show(`Ebenentaster ${slotNum} wirklich entfernen?`, async () => {
      try {
        const res = await fetch(`/api/craftslot-layers/${this.slotId}/layer-button/${slotNum}`, { method: 'DELETE' });
        const result = await res.json();
        if (!result.success) {
          uiAlert('Entfernen fehlgeschlagen: ' + result.error);
          return;
        }
        window.showToast('Ebenentaster entfernt');
        await this.loadConfig();
        this.render();
      } catch (error) {
        uiAlert('Entfernen fehlgeschlagen: ' + error.message);
      }
    }, { danger: true });
  }
}

window.confirmDialog = new ConfirmDialog();
window.showToast = showToast;
window.craftSlotLayerToolbar = new CraftSlotLayerToolbar();
window.moduleFlow = new ModuleFlow();
window.layoutCalibrator = new LayoutCalibrator();
window.imageCropper = new ImageCropper();
