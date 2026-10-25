/**
 * Geräteprofile (23.10.2026): welche Controller ControlHub
 * kennt und welche Module, Tasten und Achsen er davon anzeigt. Reine Produktdaten + Rechenfunktionen, kein Speicher --
 * den hat controllerManager.js. Liegt bewusst nicht in server/config/ (dort nur persönliche Daten + modules.js), damit
 * es mit jedem Update-Paket mitkommt.
 *
 * Tasten und Achsen sind bei jedem Gerät dieselben (128 Tasten, 16 Achsen im <FRAME>) -- hier geht es nur darum, was
 * die Oberfläche zeigt. Die Tastennummern der CraftConsole stehen weiter in config/modules.js (MODULES).
 */
import { MODULES } from './config/modules.js';

// ---- Griffe und Unterbauten (Konzept § 3.1; Quellen: 01_SwitchGrip/Griffe/*/PRODUKT.md, KOMPATIBILITAET.md,
// Faktencheck Pro; Polaris über die Modulbilder bestätigt). `fw` = Wert von slotNgriff/slotNunterbau in der Firmware.
// grip: belegte Griff-Tasten (Position 1–16 im Slot). Mortis aus seiner MCP-Belegung (GPA0–6, GPB0–4) über
// mapDirectus der Firmware abgeleitet: Positionen 1–7 und 10–14.
const ALLE_16 = Array.from({ length: 16 }, (_, i) => i + 1);
export const GRIFFE = [
  { id: 'directus', fw: 0, name: 'Directus', grip: ALLE_16, thumb: true, aux: 0 },
  { id: 'mortis', fw: 1, name: 'Mortis', grip: [1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14], thumb: true, aux: 0 },
  { id: 'minor', fw: 2, name: 'Minor', grip: [], thumb: false, aux: 2 },
  { id: 'vector-r', fw: 3, name: 'Vector R', grip: [], thumb: true, aux: 5 },
  { id: 'vector-l', fw: 4, name: 'Vector L', grip: [], thumb: true, aux: 5 },
  { id: 'polaris', fw: 5, name: 'Polaris', grip: [], thumb: true, aux: 3 }
];
// levers: welche Hebel-Achsen der Unterbau hat (A = vor/zurück, B = links/rechts). Lenkjoystick und Schubhebel haben
// je eine Achse am selben Eingang (Hendrik 23.10.2026: „die Achse des Lenkjoysticks kommt dahin, wo auch die Achse des
// Schubhebels hinkommt“) -- also Hebel A, Tasten 17/18.
export const UNTERBAUTEN = [
  { id: 'fahrhebel', fw: 0, name: 'Fahrhebel/Joystick', levers: ['A', 'B'] },
  { id: 'schubhebel', fw: 1, name: 'Schubhebel', levers: ['A'] },
  { id: 'lenkjoystick', fw: 2, name: 'Lenkjoystick', levers: ['A'] }
];
const griffById = id => GRIFFE.find(g => g.id === id) || null;
const unterbauById = id => UNTERBAUTEN.find(u => u.id === id) || null;

// Achsen der CraftConsole: physischer Index im <FRAME> (wie axisAssignment.js PHYSICAL_AXIS_INDEX) und Name
export const CC_AXES = {
  thumbX: { index: 0, label: 'CraftSlot 1 – Thumbstick links/rechts' },
  thumbY: { index: 1, label: 'CraftSlot 1 – Thumbstick hoch/runter' },
  leverA: { index: 2, label: 'CraftSlot 1 – Hebel vor/zurück' },
  leverB: { index: 3, label: 'CraftSlot 1 – Hebel links/rechts' },
  thumb2X: { index: 4, label: 'CraftSlot 2 – Thumbstick links/rechts' },
  thumb2Y: { index: 5, label: 'CraftSlot 2 – Thumbstick hoch/runter' },
  leverA2: { index: 6, label: 'CraftSlot 2 – Hebel vor/zurück' },
  leverB2: { index: 7, label: 'CraftSlot 2 – Hebel links/rechts' },
  poti: { index: 8, label: 'Poti-Rad' },
  finger1: { index: 9, label: 'Fingertip 1' },
  finger2: { index: 10, label: 'Fingertip 2' },
  finger3: { index: 11, label: 'Fingertip 3' },
  finger4: { index: 12, label: 'Fingertip 4' }
};
const SLOT_AXES = {
  craftslot1: { thumb: ['thumbX', 'thumbY'], A: 'leverA', B: 'leverB' },
  craftslot2: { thumb: ['thumb2X', 'thumb2Y'], A: 'leverA2', B: 'leverB2' }
};

/**
 * Sichtbare Tasten und Achsen eines CraftSlots (bzw. der CraftUnit am CraftLink) aus Unterbau und Griff.
 * Aufbau je Slot (29 Tasten, wie Firmware und modules.js): Griff 1–16, Hebel 17–20 (A: 17/18, B: 19/20),
 * Thumbstick 21–24, Aux 25–29.
 * @param {number} base   erste Tastennummer des Slots (1 bzw. 86)
 * @param {object} part   { unterbau, griff } (ids; 'keiner' oder fehlend = nicht verbaut)
 * @param {string} slotId 'craftslot1' | 'craftslot2' (für die Achsen-Namen)
 */
export function slotParts(base, part, slotId) {
  const griff = griffById(part?.griff);
  const unterbau = unterbauById(part?.unterbau);
  const ax = SLOT_AXES[slotId];
  const buttons = [];
  const axisKeys = [];
  if (griff) for (const p of griff.grip) buttons.push(base + p - 1);
  if (unterbau) {
    if (unterbau.levers.includes('A')) { buttons.push(base + 16, base + 17); axisKeys.push(ax.A); }
    if (unterbau.levers.includes('B')) { buttons.push(base + 18, base + 19); axisKeys.push(ax.B); }
  }
  if (griff?.thumb) { buttons.push(base + 20, base + 21, base + 22, base + 23); axisKeys.unshift(...ax.thumb); }
  for (let i = 0; i < (griff?.aux || 0); i++) buttons.push(base + 24 + i);
  return { buttons: buttons.sort((a, b) => a - b), axisKeys };
}

function range(from, to) { const out = []; for (let b = from; b <= to; b++) out.push(b); return out; }
function partLabel(part) {
  const u = unterbauById(part?.unterbau)?.name, g = griffById(part?.griff)?.name;
  return [u, g].filter(Boolean).join(' · ') || 'nichts verbaut';
}

// ---- CraftConsole: Modul-Katalog in Anzeige-Reihenfolge (Hendriks „Rundgang“, wie bisher MODULE_SWIPE_ORDER) ----
export const CC_KATALOG = [
  { id: 'craftslot1', art: 'slot' },
  { id: 'einschub1', art: 'modul' },
  { id: 'fingertip', art: 'modul' },
  { id: 'craftslot2', art: 'slot' },
  { id: 'einschub2', art: 'modul' },
  { id: 'bedienteil', art: 'modul' }
];

// Vorlagen füllen den Baukasten nur vor (Konzept § 3.1)
const slot = (unterbau, griff) => ({ an: true, unterbau, griff });
const AUS = { an: false };
export const VORLAGEN = [
  { id: 'pro', name: 'Pro', setup: { craftslot1: slot('fahrhebel', 'directus'), einschub1: { an: true }, fingertip: { an: true },
    craftslot2: slot('fahrhebel', 'polaris'), einschub2: { an: true }, bedienteil: { an: true } } },
  { id: 'comfort', name: 'Comfort', setup: { craftslot1: slot('fahrhebel', 'directus'), einschub1: { an: true }, fingertip: { an: true },
    craftslot2: { ...AUS, unterbau: 'fahrhebel', griff: 'polaris' }, einschub2: AUS, bedienteil: AUS } },
  { id: 'plus', name: 'Plus', setup: { craftslot1: slot('fahrhebel', 'directus'), einschub1: { an: true }, fingertip: { an: true },
    craftslot2: { ...AUS, unterbau: 'fahrhebel', griff: 'polaris' }, einschub2: AUS, bedienteil: AUS } },
  { id: 'mini', name: 'Mini', setup: { craftslot1: { ...AUS, unterbau: 'fahrhebel', griff: 'directus' }, einschub1: { an: true }, fingertip: { an: true },
    craftslot2: { ...AUS, unterbau: 'fahrhebel', griff: 'polaris' }, einschub2: AUS, bedienteil: AUS } }
];
// Firmware-Wert model (0 Pro, 1 Comfort, 2 Plus, 3 Mini, 9 Individuell) → Vorlage
export const VORLAGE_FUER_MODEL = { 0: 'pro', 1: 'comfort', 2: 'plus', 3: 'mini', 9: 'pro' };

// ---- Mitgelieferte Geräteprofile ----
export const BUILTIN_PROFILES = [
  {
    id: 'craftconsole', name: 'CraftConsole', builtin: true,
    erkennung: { usbPid: 'CC01', device: 'craftconsole' },
    kann: { einstellungen: true, kalibrierung: true, achsModus: true, ebenen: true, signalton: 'piezo', kappenfarben: true, module: true },
    standardSetup: VORLAGEN[0].setup,
    // Farbe der Armlehne (Hendrik 25.10.2026: „in grau und in schwarz … die Firmware bleibt auf jeden Fall die gleiche“):
    // nur für die Modulbilder; die erste ist der Standard. Bild der Farbe: <name>-<farbe>.png, sonst das Standardbild.
    farben: [{ id: 'grau', name: 'Grau' }, { id: 'schwarz', name: 'Schwarz' }]
  },
  {
    id: 'craftlink', name: 'CraftLink', builtin: true,
    erkennung: { usbPid: 'CC02', device: 'craftlink' },
    kann: { einstellungen: false, kalibrierung: false, achsModus: false, ebenen: true, signalton: 'led', kappenfarben: false, module: true },
    standardSetup: { craftunit: { an: false, unterbau: 'fahrhebel', griff: 'directus' } }
  }
];

/** Achsen-Liste eines Controllers: [{ key, index, label }] */
function axesOf(modules) {
  const seen = new Map();
  for (const m of modules) for (const key of m.axisKeys || []) {
    if (seen.has(key)) continue;
    const def = CC_AXES[key] || m.axisInfo?.[key];
    if (def) seen.set(key, { key, index: def.index, label: m.axisLabels?.[key] || def.label });
  }
  return [...seen.values()];
}

/** Ein Setup in sich stimmig machen (fehlende Teile aus dem Standard, unbekannte Werte verwerfen) */
export function cleanSetup(profile, setup) {
  const base = structuredClone(profile.standardSetup || {});
  const out = {};
  for (const [id, std] of Object.entries(base)) {
    const s = setup?.[id] && typeof setup[id] === 'object' ? setup[id] : {};
    const entry = { an: typeof s.an === 'boolean' ? s.an : !!std.an };
    if ('unterbau' in std || 'griff' in std) {
      entry.unterbau = s.unterbau === 'keiner' || unterbauById(s.unterbau) ? s.unterbau : std.unterbau;
      entry.griff = s.griff === 'keiner' || griffById(s.griff) ? s.griff : std.griff;
    }
    out[id] = entry;
  }
  return out;
}

/**
 * Module, die die Oberfläche für diesen Controller zeigt -- gleiche Form wie bisher /api/modules (id, name,
 * buttonRange, axisKeys), dazu: buttons (sichtbare Tasten), layoutId (welches Modulbild), layerSlot (Ebenen),
 * axisLabels/axisInfo (Achsen ohne feste Namen), buttonNames, setupLabel (z. B. „Fahrhebel/Joystick · Directus“),
 * griffBestimmt (CraftSlot/CraftUnit: Griff und Unterbau legen die Tasten fest, die Markierung „nicht verbaut“ im
 * Modulbild gilt dort nicht mehr -- sonst fehlten z. B. beim Minor die Aux-Tasten, die beim Directus aus sind).
 * @param {object} profile  Geräteprofil (builtin oder eigenes)
 * @param {object} setup    Modul-Auswahl (Baukasten) für dieses Gerät
 * @param {object} info     zuletzt vom Gerät gemeldete Daten (GETALL: axes, unit …)
 */
export function resolveModules(profile, setup, info = {}) {
  if (!profile) return [];
  if (profile.id === 'craftconsole') {
    const s = cleanSetup(profile, setup);
    const out = [];
    for (const k of CC_KATALOG) {
      if (!s[k.id]?.an) continue;
      const mod = MODULES.find(m => m.id === k.id);
      if (!mod) continue;
      if (k.art === 'slot') {
        const parts = slotParts(mod.buttonRange[0], s[k.id], k.id);
        out.push({ ...mod, buttons: parts.buttons, axisKeys: parts.axisKeys, layoutId: mod.id, layerSlot: mod.id, setupLabel: partLabel(s[k.id]), griffBestimmt: true,
          griff: s[k.id].griff, unterbau: s[k.id].unterbau, axisLabels: unterbauAchsen(s[k.id].unterbau, k.id === 'craftslot2' ? 2 : 1) });
      } else {
        // CraftDeck: das Drehrad (Poti) gehört zu ihm, auch wenn modules.js es keinem Modul zuordnet; sein Feld liegt auf dem
        // großen Drehrad im Bild (seit 25.10.2026)
        const axisKeys = k.id === 'bedienteil' ? ['poti'] : mod.axisKeys;
        out.push({ ...mod, buttons: range(mod.buttonRange[0], mod.buttonRange[1]), axisKeys, layoutId: mod.id });
      }
    }
    return out;
  }
  if (profile.id === 'craftlink') {
    const s = cleanSetup(profile, setup);
    const out = [];
    if (s.craftunit?.an) {
      const parts = slotParts(1, s.craftunit, 'craftslot1');
      out.push({ id: 'craftunit', name: 'CraftUnit', buttonRange: [1, 29], buttons: parts.buttons, axisKeys: parts.axisKeys,
        layoutId: 'craftslot1', layerSlot: 'craftslot1', setupLabel: partLabel(s.craftunit), griffBestimmt: true,
        griff: s.craftunit.griff, unterbau: s.craftunit.unterbau });
    }
    const potiDa = Number(info?.axes) > 0;
    out.push({ id: 'craftlink-tasten', name: 'Tasten', buttonRange: [30, 43], buttons: range(30, 43),
      axisKeys: potiDa ? ['ax4'] : [], axisInfo: { ax4: { index: 4, label: 'Poti (GP28)' } }, layoutId: null,
      buttonNames: { 30: 'BOOTSEL' } });
    return out;
  }
  // Eigene Geräteprofile (Editor „Eigene Controller“): Module mit Tastenliste und Achsen
  return (profile.module || []).map(m => {
    const buttons = [...new Set((m.tasten || []).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 128))].sort((a, b) => a - b);
    const axisInfo = {};
    const axisKeys = [];
    for (const a of m.achsen || []) {
      const idx = Number(a.index);
      if (!Number.isInteger(idx) || idx < 0 || idx > 15) continue;
      const key = 'ax' + idx;
      axisKeys.push(key);
      axisInfo[key] = { index: idx, label: a.name || `Achse ${idx + 1}` };
    }
    // Modul-ID = <controller>--<modul> (doppelter Bindestrich kommt in keiner der beiden Kennungen vor → eindeutig;
    // dient auch als Name des Modulbilds, s. moduleLayoutManager)
    const id = `${profile.id}--${m.id}`;
    return { id, name: m.name || 'Modul', buttonRange: buttons.length ? [buttons[0], buttons[buttons.length - 1]] : [0, -1],
      buttons, axisKeys, axisInfo, layoutId: id, buttonNames: m.tastenNamen || {}, eigen: true };
  });
}

export function resolveAxes(profile, setup, info) {
  return axesOf(resolveModules(profile, setup, info));
}

// ---- Modulbilder je Griff, Unterbau eingeblendet (Hendrik 25.10.2026: „die CraftSlots an sich haben ja gar keine Tasten
// und keine Belegung“ … „den Unterbau dann einfach bei den Griffen mit einblenden … unten rechts“) ----
// Ein CraftSlot zeigt das Bild seines Griffs (alle Griff-Bilder gleich groß, gleicher Ausschnitt aus dem CAD). Darauf die
// Griff-Felder (Griff-Tasten, Thumbstick, Aux) und, wenn ein Unterbau verbaut ist, dessen Felder unten rechts -- je
// Unterbau einmal kalibriert (Hendrik 25.10.2026: „eine Kalibrierung für 3 Unterbauten … ein Kasten, der markiert, in
// welchem Bereich … ich den Platz habe“; Bild der Kalibrierung: unterbau-bereich.png). Welche Felder erscheinen,
// bestimmen Griff und Unterbau (slotParts). Kalibriert wird in der Nummerierung von CraftSlot 1; für CraftSlot 2 rechnet
// buildModuleView() um (+85, Achsen …2). Bild-Kennungen: griff-<id>, unterbau-<id> (nur Felder, Bild nur zum Kalibrieren).
export const griffLayoutId = id => `griff-${id}`;
export const unterbauLayoutId = id => `unterbau-${id}`;
const SLOT2_KEYS = { thumbX: 'thumb2X', thumbY: 'thumb2Y', leverA: 'leverA2', leverB: 'leverB2' };

// Einträge für die Modul-Kalibrierung: je Griff und je Unterbau ein „Modul“ mit seinen Tasten/Achsen (CraftSlot-1-Nummern)
export function teilModulesForCalibration() {
  const out = [];
  for (const g of GRIFFE) {
    const p = slotParts(1, { griff: g.id, unterbau: 'keiner' }, 'craftslot1');
    out.push({ id: griffLayoutId(g.id), name: `Griff: ${g.name}`, buttonRange: [1, 29], buttons: p.buttons, axisKeys: p.axisKeys, layoutId: griffLayoutId(g.id), teil: 'griff' });
  }
  for (const u of UNTERBAUTEN) {
    const p = slotParts(1, { griff: 'keiner', unterbau: u.id }, 'craftslot1');
    out.push({ id: unterbauLayoutId(u.id), name: `Unterbau: ${u.name}`, buttonRange: [1, 29], buttons: p.buttons, axisKeys: p.axisKeys,
      axisLabels: unterbauAchsen(u.id, 1), layoutId: unterbauLayoutId(u.id), teil: 'unterbau', unterbau: u.id });
  }
  return out;
}

// Lenkjoystick: liest die Armlehne am Eingang von Hebel A (wie den Schubhebel), bewegt wird er nach links/rechts
const unterbauAchsen = (unterbau, slot) => (unterbau === 'lenkjoystick'
  ? { [slot === 2 ? 'leverA2' : 'leverA']: `CraftSlot ${slot} – Lenkung links/rechts` } : undefined);

export const isTeilLayoutId = id => GRIFFE.some(g => griffLayoutId(g.id) === id) || UNTERBAUTEN.some(u => unterbauLayoutId(u.id) === id);

/**
 * Was die Tastenbelegung für ein Modul zeigt: { teile: [{ id, image, hotspots, disabledButtons, capColors }], zusammengesetzt }.
 * CraftSlot/CraftUnit: Gibt es ein Bild für den Griff, dann Griff + (falls vorhanden) Unterbau, umgerechnet auf den Slot.
 * Ohne Griff (keiner) reicht das Unterbau-Bild. Sonst wie bisher das eine Bild des Slots (craftslot1/2).
 * @param {object} mod      Modul aus resolveModules()
 * @param {object} layouts  moduleLayoutManager.getAllLayouts()
 */
export function buildModuleView(mod, layouts) {
  const one = id => (id && layouts[id] ? [{ id, image: layouts[id].image || null, hotspots: layouts[id].hotspots || [], disabledButtons: layouts[id].disabledButtons || [], capColors: layouts[id].capColors }] : []);
  if (!mod) return { teile: [], zusammengesetzt: false };
  if (mod.griffBestimmt && mod.griff && mod.griff !== 'keiner') {
    const gid = griffLayoutId(mod.griff);
    const g = layouts[gid];
    if (g?.image) {
      const u = mod.unterbau && mod.unterbau !== 'keiner' ? layouts[unterbauLayoutId(mod.unterbau)] : null;
      const zwei = mod.layerSlot === 'craftslot2';
      const key = k => (k && zwei ? SLOT2_KEYS[k] || k : k);
      const hotspots = [...(g.hotspots || []), ...(u?.hotspots || [])].map(h => ({ ...h,
        ...(h.button != null ? { button: h.button + (zwei ? 85 : 0) } : {}),
        ...(h.axisKey ? { axisKey: key(h.axisKey) } : {}),
        ...(h.modeToggleKey ? { modeToggleKey: key(h.modeToggleKey) } : {}) }));
      return { teile: [{ id: gid, image: g.image, hotspots, disabledButtons: [], capColors: g.capColors }], zusammengesetzt: true };
    }
  }
  // ohne Griff-Bild: das Bild des Slots, falls es eins gibt (ab Werk keins -> Raster)
  return { teile: mod.layoutId === null ? [] : one(mod.layoutId || mod.id), zusammengesetzt: false };
}
