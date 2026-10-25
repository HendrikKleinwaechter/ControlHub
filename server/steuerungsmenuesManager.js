/**
 * Steuerungsmenüs-Manager (Kacheln): frei anlegbare Tasten-Seiten. Jede
 * Taste ist frei auf einem optionalen Hintergrundbild positionierbar (x/y/shape/size/rotation, Prozent-
 * bzw. Grad-Werte) und bekommt entweder eine Funktion aus der Bibliothek (functionId, auch 'macro:<id>')
 * oder eine direkte Tastatur-Schnellbelegung (quickActions, Rohformat wie eine Funktions-actions-Liste).
 * Was ein zugeordneter Button beim Klicken tatsächlich AUSLÖST, ist bewusst noch nicht Teil dieses
 * Managers -- das bleibt ein späterer Schritt (Ausführung über die MappingEngine), hier geht es nur um
 * Anlegen/Positionieren/Zuordnen/Speichern. Seiten-Verwaltung (order-Array + syncOrder()) 1:1 von
 * profileManager.js übernommen.
 *
 * "size" statt getrennter width/height: Hendriks Feedback nach der ersten Editor-Fassung -- getrennte
 * Prozentwerte für Breite/Höhe verzerren Kreise/Quadrate zu Ovalen/Rechtecken, sobald die Bedienpanel-
 * Fläche selbst nicht quadratisch ist (was sie praktisch nie ist). Ein einzelner Wert (Prozent relativ
 * zur Flächen-BREITE) plus clientseitige Umrechnung anhand des AKTUELLEN Pixel-Seitenverhältnisses der
 * Fläche (s. steuerungsmenues.js resizeCanvas()) hält Tasten immer unverzerrt -- unabhängig davon, wie
 * groß/in welchem Format die Fläche gerade dargestellt wird.
 */

import { readJsonFile, writeJsonAtomic } from './jsonStore.js';
import { BAUSTEIN_VORLAGEN, vorlagenPageId } from './bausteinVorlagen.js';

const DEFAULT_BUTTON_SIZE = 12;
const DEFAULT_FONT_SIZE = 2; // Prozent der Flächen-BREITE, gleiche Konvention wie size
const MIN_FONT_SIZE = 0.5;
const MAX_FONT_SIZE = 10;
// Positions-Raster (Hendriks Ersatz fürs Anordnen/Raster-anordnen-Werkzeug): zwei Rasterstufen je Seite,
// "normal" beim gewöhnlichen Ziehen, "fein" bei zusätzlich gedrückter Alt-Taste (s. steuerungsmenues.js
// onDrag()). Prozent der Flächen-BREITE, gleiche Konvention wie size/heightSize.
// Seit dem Kachel-Editor am PC (Hendrik 22.10.2026) feiner: 2,5 % / 0,5 % statt 5 % / 1 % (Umstellung s. initialize())
const DEFAULT_GRID_SIZE = 2.5;
const DEFAULT_FINE_GRID_SIZE = 0.5;
const MIN_GRID_SIZE = 0.1;
const MAX_GRID_SIZE = 50;
const VALID_SHAPES = ['circle', 'triangle', 'square'];
const VALID_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'white', 'gray', 'black'];
const MAX_LABEL_LENGTH = 24;
// Grafik-/Text-Elemente (Hendriks Wunsch: nicht nur Tasten, auch Grafiken/Text aufs Bedienpanel legen)
// -- eigene, den Tasten NICHT beigemischte Arrays (page.graphics/page.texts), damit am bestehenden,
// produktiv genutzten Tasten-Datenmodell nichts geändert werden muss. Teilen sich aber dieselbe
// Positionier-/Einraste-Logik (s. steuerungsmenues.js onDrag(), jetzt "kind"-parametrisiert).
const DEFAULT_GRAPHIC_SIZE = 20; // Prozent der Flächen-BREITE, Start-Breite UND -Höhe (frei ziehbar)
const MAX_TEXT_LENGTH = 200;
const DEFAULT_TEXT_WIDTH = 30;
const DEFAULT_TEXT_FONT_SIZE = 3;
// Muss deckungsgleich mit SM_ICON_DEFS in steuerungsmenues.js sein (dort die tatsächlichen SVG-Pfade) --
// hier nur zur Validierung, damit updateButton() ungültige IDs genauso ablehnt wie eine ungültige Farbe.
const VALID_ICONS = [
  "anchor","arrow-e","arrow-n","arrow-ne","arrow-nw","arrow-s","arrow-se","arrow-sw","arrow-w","asterisk",
  "at-sign","battery","battery-charging","bell","bluetooth","bolt","bookmark","calendar","calendar-check","camera",
  "chat","check","check-circle","chevron-down","chevron-left","chevron-right","chevron-up","circle-outline","clock","close",
  "close-circle","cloud","cloud-rain","collapse","compass","copy","cut","diamond","droplet","edit",
  "eject","equals","expand","eye","fast-forward","file","file-text","filter","fire","flag",
  "flag-checkered","folder","folder-open","fuel-pump","gauge","grid-view","hammer","hash","heart","hexagon",
  "home","hourglass","info","key","layers","leaf","lightbulb","list-view","lock","mail",
  "map-pin","maximize","menu","minimize","minus","minus-circle","moon","more-horizontal","more-vertical","mountain",
  "mute","paste","pause","percent","phone","pin","play","plug","plus","plus-circle",
  "power","print","redo","refresh","rewind","ruler","save","screwdriver","search","seatbelt",
  "settings","share","shuffle","signal","skip-back","skip-forward","smiley","snowflake","sort","square-outline",
  "star","steering-wheel","stop","sun","swap","tag","target","thumbs-down","thumbs-up","trailer",
  "trash","triangle-outline","truck","umbrella","undo","unlock","usb","volume","warning","wave",
  "wheel","wifi","wind","wrench","zoom-in","zoom-out",
  // Beleuchtung (24.10.2026)
  "low-beam","high-beam","work-light-front","work-light-rear","beacon","turn-left","turn-right","hazard"
];

// Ab welcher Kachelgröße ein Element erscheint (Hendrik 22.10.2026): immer, ab 2 Feldern, ab 2 × 2 bzw. volle Seite
const SHOW_LEVELS = ['immer', 'mittel', 'gross'];
const normShow = v => (SHOW_LEVELS.includes(v) ? v : 'immer');
// Kachel-Editor (22.10.2026): je Element ein eigener Name (sonst nennt der Editor es nach Beschriftung/Wert), die Gruppe
// (ID aus page.groups) und „gesperrt“ (auf der Fläche nicht wähl- und verschiebbar)
const ID_RE = /^[\w-]{1,40}$/;
function elementMeta(raw) {
  return {
    name: typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 40) : null,
    group: typeof raw?.group === 'string' && ID_RE.test(raw.group) ? raw.group : null,
    locked: raw?.locked === true
  };
}

function makeElementId(prefix) {
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function makeButtonId() {
  return makeElementId('btn');
}

function normalizeRotation(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return ((value % 360) + 360) % 360;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function defaultButtons(count = 6) {
  // Einfaches Raster als Startpunkt (3 Spalten x 2 Reihen), damit neue Seiten nicht mit lauter
  // übereinanderliegenden Tasten in der Bildmitte starten.
  const cols = 3;
  return Array.from({ length: count }, (_, i) => ({
    id: makeButtonId(),
    x: 20 + (i % cols) * 30,
    y: 30 + Math.floor(i / cols) * 40,
    shape: 'circle',
    size: DEFAULT_BUTTON_SIZE,
    heightSize: null,
    cornerRadius: null,
    rotation: 0,
    label: '',
    icon: null,
    fontSize: DEFAULT_FONT_SIZE,
    color: null,
    functionId: null,
    quickActions: null,
    quickActionsDurationSeconds: null
  }));
}

// Selbstheilend: alte Bestandsdaten (frühere {functionId}- bzw. {width,height}-Form) und neu
// importierte/unvollständige Objekte bekommen fehlende Felder mit sinnvollen Defaults ergänzt, statt
// beim Laden zu verschwinden. Migration von width/height -> size: der bisherige width-Wert wird
// übernommen (war der ohnehin sichtbar dominante Wert, s. Kommentar oben).
function normalizeButton(raw, index) {
  const shape = VALID_SHAPES.includes(raw?.shape) ? raw.shape : 'circle';
  const rawSize = typeof raw?.size === 'number' ? raw.size
    : typeof raw?.width === 'number' ? raw.width
    : DEFAULT_BUTTON_SIZE;
  // Auf Hundertstel gerundet -- Ziehen am Resize-Handle lieferte vor Hendriks Feedback ungerundete
  // Pixel-Präzision (viele Nachkommastellen), hier zusätzlich als Selbstheilung für bereits so
  // gespeicherte Bestandsdaten (steuerungsmenues.js onDrag() rundet neue Werte bereits selbst).
  const size = Math.round(rawSize * 100) / 100;
  return {
    id: raw?.id || makeButtonId(),
    x: typeof raw?.x === 'number' ? raw.x : 20 + (index % 3) * 30,
    y: typeof raw?.y === 'number' ? raw.y : 30 + Math.floor(index / 3) * 40,
    shape,
    size,
    // Nur beim Viereck relevant (s. steuerungsmenues.js smHeightBasis()) -- Kreis/Dreieck bleiben immer
    // an "size" gekoppelt (unverzerrt), ein Viereck kann Hendriks Wunsch nach länglichen/breiten
    // Rechtecken zufolge eine davon UNABHÄNGIGE Höhe bekommen. null = noch nicht eigens gesetzt, folgt
    // weiter size (bleibt quadratisch).
    heightSize: typeof raw?.heightSize === 'number' && raw.heightSize > 0 ? Math.round(raw.heightSize * 100) / 100 : null,
    // Prozent, nur bei shape==='square' wirksam (s. steuerungsmenues.js renderButtonHtml()). Anders als
    // heightSize ist 0 hier ein GÜLTIGER, oft gewollter Wert (scharfe statt abgerundete Ecken) -- deshalb
    // typeof-Prüfung statt "> 0", die 0 fälschlich als "nicht gesetzt" behandeln würde.
    cornerRadius: typeof raw?.cornerRadius === 'number' ? clamp(raw.cornerRadius, 0, 50) : null,
    rotation: normalizeRotation(raw?.rotation),
    label: typeof raw?.label === 'string' ? raw.label.slice(0, MAX_LABEL_LENGTH) : '',
    // Piktogramm statt Text -- schließt sich mit label nicht zwingend aus (label bleibt beim Wechsel
    // gespeichert), steuerungsmenues.js zeigt aber nur eines von beiden an (icon hat Vorrang).
    icon: VALID_ICONS.includes(raw?.icon) ? raw.icon : null,
    fontSize: typeof raw?.fontSize === 'number' ? clamp(raw.fontSize, MIN_FONT_SIZE, MAX_FONT_SIZE) : DEFAULT_FONT_SIZE,
    color: VALID_COLORS.includes(raw?.color) ? raw.color : null,
    functionId: raw?.functionId ?? null,
    quickActions: Array.isArray(raw?.quickActions) ? raw.quickActions : null,
    // Nur relevant, wenn quickActions eine Achsen-Aktion enthält (s. ActionPicker "Achse belegen") --
    // eine Achse braucht anders als eine Tastatur-Taste immer eine feste Impulsdauer, da es (anders als
    // bei echtem Halten der Bedienpanel-Taste) keinen sinnvollen "gehalten"-Zustand für eine Achse gibt,
    // die per Touch ausgelöst wird. null = normales Halten/Loslassen (Tastatur-Fall).
    quickActionsDurationSeconds: typeof raw?.quickActionsDurationSeconds === 'number' && raw.quickActionsDurationSeconds > 0
      ? raw.quickActionsDurationSeconds
      : null,
    // Zustand zeigen (Paket J): Wert aus der Werteliste -- an/aus lässt die Taste leuchten, Zahl/Text steht klein im Knopf
    stateSource: typeof raw?.stateSource === 'string' && raw.stateSource ? raw.stateSource.slice(0, 40) : null,
    show: normShow(raw?.show),
    ...elementMeta(raw)
  };
}

// Rein visuell, keine Zuordnung/Funktion -- Position/Größe/Drehung wie ein Viereck-Button (eigene
// Breite UND Höhe, beide Prozent der Flächen-BREITE, s. steuerungsmenues.js smHeightBasis()-Muster),
// aber ohne shape/color/functionId/... "src" wie page.background: Web-Pfad zum hochgeladenen Bild,
// null bis eins hochgeladen wurde (Platzhalter-Rahmen bis dahin, s. Client-Rendering).
function normalizeGraphic(raw, index) {
  return {
    id: raw?.id || makeElementId('gfx'),
    x: typeof raw?.x === 'number' ? raw.x : 30 + (index % 3) * 15,
    y: typeof raw?.y === 'number' ? raw.y : 30 + Math.floor(index / 3) * 20,
    width: typeof raw?.width === 'number' ? Math.round(clamp(raw.width, 2, 100) * 100) / 100 : DEFAULT_GRAPHIC_SIZE,
    height: typeof raw?.height === 'number' ? Math.round(clamp(raw.height, 2, 100) * 100) / 100 : DEFAULT_GRAPHIC_SIZE,
    rotation: normalizeRotation(raw?.rotation),
    src: safeImgPath(raw?.src),
    keepRatio: raw?.keepRatio !== false,   // Ecken ziehen hält das Seitenverhältnis (Kachel-Editor)
    show: normShow(raw?.show),
    ...elementMeta(raw)
  };
}

// Freier Textzug, unabhängig von jeder Taste -- z.B. eine Zwischenüberschrift auf dem Bedienpanel.
// "width" ist die Zeilenumbruch-Breite (Prozent der Flächen-BREITE), keine Höhe nötig -- die Höhe
// ergibt sich aus dem Inhalt (wie bei einer normalen Textbox), anders als bei Tasten/Grafiken also KEIN
// Resize-Handle, nur ein Textgröße-Regler im Panel.
function normalizeText(raw, index) {
  return {
    id: raw?.id || makeElementId('txt'),
    x: typeof raw?.x === 'number' ? raw.x : 30 + (index % 3) * 15,
    y: typeof raw?.y === 'number' ? raw.y : 15 + Math.floor(index / 3) * 15,
    width: typeof raw?.width === 'number' ? clamp(raw.width, 5, 95) : DEFAULT_TEXT_WIDTH,
    text: typeof raw?.text === 'string' ? raw.text.slice(0, MAX_TEXT_LENGTH) : 'Text',
    fontSize: typeof raw?.fontSize === 'number' ? clamp(raw.fontSize, MIN_FONT_SIZE, MAX_FONT_SIZE * 2) : DEFAULT_TEXT_FONT_SIZE,
    color: VALID_COLORS.includes(raw?.color) ? raw.color : null,
    rotation: normalizeRotation(raw?.rotation),
    show: normShow(raw?.show),
    ...elementMeta(raw)
  };
}

// Anzeige mit Spielwert (Paket J, Mockup Bild 5): Position/Größe wie eine Grafik (Mitte x/y, Breite und
// Höhe in % der Flächen-BREITE), dazu Wert aus der Werteliste (public/js/werteliste.js), Darstellung,
// Bereich (aus dem Spiel oder von Hand), Warnfarbe, Nachkommastellen und optional „Beim Antippen“
// (dieselbe Zuordnung wie eine Taste: functionId inkl. 'macro:'/'hub:' oder quickActions).
const VALID_DISPLAY_TYPES = ['zahl', 'balken', 'tacho', 'leuchte', 'text'];
function normalizeDisplay(raw, index) {
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    id: raw?.id || makeElementId('anz'),
    x: n(raw?.x) ?? 30 + (index % 3) * 15,
    y: n(raw?.y) ?? 30 + Math.floor(index / 3) * 20,
    width: n(raw?.width) != null ? Math.round(clamp(raw.width, 4, 100) * 100) / 100 : 20,
    height: n(raw?.height) != null ? Math.round(clamp(raw.height, 3, 100) * 100) / 100 : 10,
    value: typeof raw?.value === 'string' && raw.value ? raw.value.slice(0, 40) : 'speed',
    // eigene, kurze Beschriftung (sonst der Name aus der Werteliste), z. B. „Diesel“ statt „Diesel in %“
    label: typeof raw?.label === 'string' && raw.label.trim() ? raw.label.trim().slice(0, 30) : null,
    type: VALID_DISPLAY_TYPES.includes(raw?.type) ? raw.type : 'zahl',
    range: raw?.range === 'manual' ? 'manual' : 'auto',
    min: n(raw?.min),
    max: n(raw?.max),
    warn: [10, 25].includes(raw?.warn) ? raw.warn : 0,
    dec: Number.isInteger(raw?.dec) ? clamp(raw.dec, 0, 2) : 0,
    // Ausrichtung des Inhalts im Rahmen (Hendrik 24.10.2026: „links-, rechtsbündig oder zentriert … das Gleiche auch für
    // die vertikale Anordnung“); ab Werk wie bisher links und mittig
    alignH: ['links', 'mitte', 'rechts'].includes(raw?.alignH) ? raw.alignH : 'links',
    alignV: ['oben', 'mitte', 'unten'].includes(raw?.alignV) ? raw.alignV : 'mitte',
    functionId: raw?.functionId ?? null,
    quickActions: Array.isArray(raw?.quickActions) ? raw.quickActions : null,
    quickActionsDurationSeconds: n(raw?.quickActionsDurationSeconds) > 0 ? raw.quickActionsDurationSeconds : null,
    show: normShow(raw?.show),
    ...elementMeta(raw)
  };
}

// Element mit fertigem Inhalt (Hendrik 22.10.2026): Karte, Geräteliste, Steuerungsübersicht und die drei Planer-Teile
// als frei platzierbare Fläche in einer eigenen Kachel. Mittelpunkt x/y in % der Fläche, Breite/Höhe in % der
// Breite (wie Anzeigen). Alles andere ist aus Anzeigen und Tasten gebaut (bausteinVorlagen.js). Unbekannte (z. B.
// die ausgebauten Zähler) fallen weg; der frühere ganze Arbeitsplaner ('planer') wird zur Feldliste.
export const EMBED_BAUSTEINE = ['karte', 'geraete', 'steuerung', 'planer-aktuell', 'planer-naechstes', 'planer-felder'];
const EMBED_ALT = { planer: 'planer-felder' };
const PLANER_OPTS = { group: ['komplex', 'frucht', 'keine'], filter: ['alle', 'ernte', 'bestellung', 'duengen', 'schutz'], sort: ['arbeit', 'feld', 'frucht'] };
function embedOpts(baustein, o) {
  // Steuerungsübersicht: wie viele Module (auto = nach Größe) und welche in welcher Reihenfolge
  if (baustein === 'steuerung') return {
    count: [1, 2, 3, 4].includes(o?.count) ? o.count : 'auto',
    mods: Array.isArray(o?.mods) ? o.mods.filter(m => typeof m === 'string' && /^[\w-]{1,30}$/.test(m)).slice(0, 6) : []
  };
  // Feldliste: Gruppieren, Filter, Sortierung, auch Felder ohne offene Arbeit
  if (baustein === 'planer-felder') {
    const out = { alle: o?.alle === true };
    for (const [k, list] of Object.entries(PLANER_OPTS)) out[k] = list.includes(o?.[k]) ? o[k] : list[0];
    return out;
  }
  return {};
}
function normalizeEmbed(raw, index) {
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const baustein = EMBED_ALT[raw?.baustein] || raw?.baustein;
  if (!EMBED_BAUSTEINE.includes(baustein)) return null;
  return {
    id: raw?.id || makeElementId('bst'),
    x: n(raw?.x) ?? 50,
    y: n(raw?.y) ?? 40 + (index % 3) * 10,
    width: n(raw?.width) != null ? Math.round(clamp(raw.width, 8, 100) * 100) / 100 : 40,
    height: n(raw?.height) != null ? Math.round(clamp(raw.height, 6, 100) * 100) / 100 : 24,
    baustein,
    show: normShow(raw?.show),
    opts: embedOpts(baustein, raw?.opts),
    ...elementMeta(raw)
  };
}

// Anordnung je Kachelform (Hendrik 22.10.2026): dieselben Elemente, aber eigene Lage/Größe/Sichtbarkeit je Form.
// Schlüssel = Zeilen x Spalten im 2 × 3-Raster; „2x3“ (ganze Seite) ist die normale Fläche und steht nicht hier. Fehlt eine
// Form, ordnet die Oberfläche automatisch an. Je Element nur Lage und Größe (wie die Element-Felder, aber in % der
// Fläche dieser Form) und hidden; Funktion, Beschriftung, Farbe … gelten in allen Formen. a = Seitenverhältnis der
// Form auf dem Bildschirm, auf dem die Lage entstand -- andere Bildschirme rechnen damit um (steuerungsmenues.js smAdaptGeom()).
export const VARIANTEN = ['1x1', '1x2', '1x3', '2x1', '2x2'];
// Höhen in % der Breite: in hohen Formen (2 hoch: 393 × 652) ist die volle Höhe gut 160 % (23.10.2026, vorher bei 100 gekappt)
const GEOM = { x: [-10, 110], y: [-10, 110], size: [1, 100], heightSize: [1, 400], width: [1, 100], height: [1, 400], fontSize: [0.3, 40], a: [0.1, 20] };
function cleanGeom(raw) {
  const g = {};
  for (const [k, [lo, hi]] of Object.entries(GEOM)) {
    if (typeof raw?.[k] === 'number' && Number.isFinite(raw[k])) g[k] = Math.round(clamp(raw[k], lo, hi) * 100) / 100;
  }
  if (raw?.hidden === true) g.hidden = true;
  return g;
}
function elementIds(page) {
  return new Set(['buttons', 'graphics', 'texts', 'displays', 'embeds'].flatMap(k => (page[k] || []).map(e => e.id)));
}
function normalizeVarianten(page, idMap = null) {
  const ids = elementIds(page);
  const out = {};
  for (const v of VARIANTEN) {
    const m = page.varianten?.[v];
    if (!m || typeof m !== 'object') continue;
    const clean = {};
    for (const [oldId, g] of Object.entries(m)) {
      const id = idMap ? idMap.get(oldId) : oldId;
      if (id && ids.has(id)) clean[id] = cleanGeom(g);
    }
    out[v] = clean;
  }
  page.varianten = out;
  return page;
}

// Ebenen (Kachel-Editor 22.10.2026): page.layers = alle Element-IDs von hinten nach vorne, über alle Arten. Fehlt die
// Liste, gilt die frühere feste Reihenfolge (Grafik, Text, Anzeige, Element, Taste); neue Elemente kommen nach vorne.
// Gruppen (page.groups = { id: { name } }) haben mindestens zwei Elemente und liegen in der Liste immer zusammen, an
// der Stelle ihres vordersten Elements; nicht verschachtelt.
function normalizeLayersAndGroups(page) {
  const all = [...page.graphics, ...page.texts, ...page.displays, ...page.embeds, ...page.buttons];
  const byId = new Map(all.map(e => [e.id, e]));
  const seen = new Set();
  const layers = (Array.isArray(page.layers) ? page.layers : []).filter(id => byId.has(id) && !seen.has(id) && seen.add(id));
  for (const e of all) if (!seen.has(e.id)) { layers.push(e.id); seen.add(e.id); }
  const count = {};
  for (const e of all) if (e.group) count[e.group] = (count[e.group] || 0) + 1;
  const groups = {};
  for (const [gid, g] of Object.entries(page.groups && typeof page.groups === 'object' ? page.groups : {})) {
    if (ID_RE.test(gid) && count[gid] >= 2) groups[gid] = { name: typeof g?.name === 'string' && g.name.trim() ? g.name.trim().slice(0, 40) : 'Gruppe' };
  }
  for (const e of all) {
    if (!e.group) continue;
    if (!groups[e.group]) {
      if (count[e.group] >= 2) groups[e.group] = { name: 'Gruppe' };
      else e.group = null;
    }
  }
  const out = [], done = new Set();
  for (let i = layers.length - 1; i >= 0; i--) {
    const id = layers[i];
    if (done.has(id)) continue;
    const g = byId.get(id).group;
    const block = g ? layers.filter(x => byId.get(x).group === g) : [id];
    for (const x of [...block].reverse()) { out.unshift(x); done.add(x); }
  }
  page.layers = out;
  page.groups = groups;
}

// Bildpfade nur aus ControlHub selbst (eigene Uploads, mitgelieferte Vorlagenbilder) -- eine importierte Kachel kann
// sonst über den Pfad Code in die Oberfläche schleusen (23.10.2026)
const IMG_PATH_RE = /^\/(img\/vorlagen|steuerungsmenue-bg|steuerungsmenue-graphics)\/[\w./-]{1,200}$/;
const safeImgPath = v => (typeof v === 'string' && IMG_PATH_RE.test(v) && !v.includes('..') ? v : null);
const pageName = v => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 40) : 'Kachel');

function normalizePage(page) {
  page.name = pageName(page.name);
  page.background = safeImgPath(page.background);
  page.buttons = (page.buttons || []).map((b, i) => normalizeButton(b, i));
  page.graphics = (page.graphics || []).map((g, i) => normalizeGraphic(g, i));
  page.texts = (page.texts || []).map((t, i) => normalizeText(t, i));
  page.displays = (page.displays || []).map((d, i) => normalizeDisplay(d, i));
  page.embeds = (page.embeds || []).map((e, i) => normalizeEmbed(e, i)).filter(Boolean);
  normalizeLayersAndGroups(page);
  // Aus welcher Vorlage der Baustein stammt (für „Auf Vorlage zurücksetzen“), sonst null
  page.vorlage = typeof page.vorlage === 'string' && BAUSTEIN_VORLAGEN[page.vorlage] ? page.vorlage : null;
  normalizeVarianten(page);
  if (page.background === undefined) page.background = null;
  page.gridSize = typeof page.gridSize === 'number' ? clamp(page.gridSize, MIN_GRID_SIZE, MAX_GRID_SIZE) : DEFAULT_GRID_SIZE;
  page.fineGridSize = typeof page.fineGridSize === 'number' ? clamp(page.fineGridSize, MIN_GRID_SIZE, MAX_GRID_SIZE) : DEFAULT_FINE_GRID_SIZE;
  delete page.aspectRatio; // ausgemustert -- die Fläche passt sich jetzt frei an den verfügbaren Platz an
  return page;
}

// Seiten-Vorlagen (21.10.2026). x/y = Mitte in % der Fläche, size/heightSize in % der Breite (s. normalizeButton).
// Hintergrund liegt in public/img/vorlagen/ (gehört zum Programm, nicht zu den Nutzerdaten).
const RECT = { shape: 'square', size: 17, heightSize: 9, cornerRadius: 18, fontSize: 1.8 };
export const PAGE_TEMPLATES = {
  licht: {
    name: 'Licht',
    description: 'Traktor von oben mit Tasten für alle Leuchten',
    background: '/img/vorlagen/traktor-oben.svg',
    buttons: [
      { ...RECT, x: 22, y: 13, label: 'Abblendlicht', color: 'yellow' },
      { ...RECT, x: 78, y: 13, label: 'Fernlicht', color: 'yellow' },
      { ...RECT, x: 22, y: 37, label: 'Blinker links', color: 'orange' },
      { ...RECT, x: 78, y: 37, label: 'Blinker rechts', color: 'orange' },
      { ...RECT, x: 22, y: 61, label: 'Arbeitslicht vorne', color: 'gray' },
      { ...RECT, x: 78, y: 61, label: 'Rundumleuchte', color: 'orange' },
      { ...RECT, x: 22, y: 85, label: 'Arbeitslicht hinten', color: 'gray' },
      { ...RECT, x: 78, y: 85, label: 'Warnblinker', color: 'red' }
    ]
  }
};

// Elemente einer Vorlage frisch anlegen (neue IDs); Anordnungen je Kachelform über den key der Vorlagen-Elemente
function templateElements(tpl) {
  const ids = new Map();
  const make = (list, norm, newId) => (list || []).map((e, i) => {
    const el = norm({ ...e, key: undefined, id: newId() }, i);
    if (el && e.key) ids.set(e.key, el.id);
    return el;
  }).filter(Boolean);
  const out = {
    background: tpl.background || null,
    buttons: make(tpl.buttons, normalizeButton, makeButtonId),
    graphics: make(tpl.graphics, normalizeGraphic, () => undefined),
    texts: make(tpl.texts, normalizeText, () => undefined),
    displays: make(tpl.displays, normalizeDisplay, () => undefined),
    embeds: make(tpl.embeds, normalizeEmbed, () => undefined),
    varianten: {}
  };
  for (const [form, m] of Object.entries(tpl.varianten || {})) {
    out.varianten[form] = {};
    for (const [key, g] of Object.entries(m)) if (ids.has(key)) out.varianten[form][ids.get(key)] = { ...g };
  }
  return out;
}

// Gibt es die Vorlage in diesem Spiel? features = Fähigkeiten des Spiels (gameManager); true = alle, false = ohne Spieldaten
function vorlageErlaubt(tpl, features) {
  if (features === true) return true;
  const f = Array.isArray(features) ? features : [];
  if (!tpl.noTelemetry && !f.includes('telemetry')) return false;
  return !tpl.feature || f.includes(tpl.feature);
}
// Stand der einmal angelegten Vorlagen-Kacheln: 1 = Cockpit … Streckenzähler (22.10.2026), 2 = dazu der Arbeitsplaner,
// 3 = alle Vorlagen für jede Kachelform neu angeordnet (bestehende werden einmal erneuert) + Beispiele Feldarbeit, Straßenfahrt
const VORLAGEN_STAND = 3;

export class SteuerungsmenuesManager {
  constructor(configPath = './server/config/steuerungsmenues.json') {
    this.configPath = configPath;
    this.pages = {};
    this.order = [];
    this.vorlagen = 0;   // Stand der einmal angelegten Vorlagen-Kacheln (s. ensureVorlagen(), VORLAGEN_STAND)
  }

  async initialize() {
    // Lesen über jsonStore (23.10.2026): kaputte Datei als .defekt gesichert (notfalls .bak), sonst Standardseiten
    const { data: config, status } = await readJsonFile(this.configPath, { fallback: null });
    if (status === 'broken') console.error('Fehler beim Laden der Steuerungsmenüs: Datei beschädigt, starte mit Standardseiten');
    if (status === 'ok' || status === 'restored') {
      try {
        this.pages = config.pages || {};
        this.order = config.order || Object.keys(this.pages);
        this.vorlagen = config.vorlagen || 0;
        Object.values(this.pages).forEach(normalizePage);
        this.syncOrder();
        // Einmalig feineres Raster (Kachel-Editor 22.10.2026): Kacheln mit dem alten Standard 5 % / 1 % auf 2,5 % / 0,5 %
        this.raster = config.raster || 0;
        if (this.raster < 1) {
          for (const p of Object.values(this.pages)) {
            if (p.gridSize === 5) p.gridSize = DEFAULT_GRID_SIZE;
            if (p.fineGridSize === 1) p.fineGridSize = DEFAULT_FINE_GRID_SIZE;
          }
          this.raster = 1;
          await this.save();
        }
      } catch (error) {
        console.error('Fehler beim Laden der Steuerungsmenüs:', error);
      }
    }
    // Die früheren Start-Kacheln Spiegel, Menü-Navigation und GPS-Einstellungen gibt es seit 24.10.2026 nicht mehr
    // (Hendrik: „was wir nicht übernehmen sind die Kacheln GPS-Einstellungen, Menü-Navigation und Spiegel“); ab Werk
    // kommen nur die Vorlagen-Kacheln (ensureVorlagen()).
  }

  /**
   * Hält this.order konsistent mit this.pages -- entfernt Namen, die es nicht mehr gibt, hängt
   * neue/unbekannte Seiten ans Ende an. Selbstheilend, falls beide je auseinanderlaufen.
   */
  syncOrder() {
    this.order = this.order.filter(id => this.pages[id]);
    for (const id of Object.keys(this.pages)) {
      if (!this.order.includes(id)) this.order.push(id);
    }
  }

  getAllPages() {
    this.syncOrder();
    return this.order.map(id => this.pages[id]);
  }

  getPage(id) {
    return this.pages[id] || null;
  }

  // Eindeutige Seiten-ID -- nur die Uhrzeit reichte nicht: zwei Bausteine in derselben Millisekunde (z. B. Anlegen und
  // gleich danach Importieren) bekamen dieselbe ID, der zweite überschrieb den ersten
  newPageId() {
    let id;
    do { id = 'sm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); } while (this.pages[id]);
    return id;
  }

  async createPage(name) {
    if (!name || !name.trim()) {
      throw new Error('Name darf nicht leer sein');
    }
    const id = this.newPageId();
    this.pages[id] = { id, name: name.trim(), background: null, gridSize: DEFAULT_GRID_SIZE, fineGridSize: DEFAULT_FINE_GRID_SIZE, buttons: defaultButtons(), graphics: [], texts: [], displays: [], embeds: [] };
    this.order.push(id);
    await this.save();
    return this.pages[id];
  }

  /**
   * Neue Seite aus einer Vorlage (21.10.2026). Tasten sind fertig platziert und beschriftet, aber noch
   * OHNE Belegung -- Hendrik ordnet nur noch Funktionen zu (je nach Spiel andere Tasten).
   */
  async createPageFromTemplate(templateId, name, id = this.newPageId()) {
    const tpl = PAGE_TEMPLATES[templateId] || BAUSTEIN_VORLAGEN[templateId];
    if (!tpl) throw new Error('Unbekannte Vorlage: ' + templateId);
    this.pages[id] = normalizePage({
      id, name: (name && name.trim()) || tpl.name, gridSize: DEFAULT_GRID_SIZE, fineGridSize: DEFAULT_FINE_GRID_SIZE,
      ...templateElements(tpl), vorlage: BAUSTEIN_VORLAGEN[templateId] ? templateId : null
    });
    if (!this.order.includes(id)) this.order.push(id);
    await this.save();
    return this.pages[id];
  }

  // Vorlagen für „+ Neue Kachel“ (Licht + die nachgebauten Kacheln), soweit es sie im Spiel gibt
  templateList(features = true) {
    return Object.entries({ ...PAGE_TEMPLATES, ...BAUSTEIN_VORLAGEN })
      .filter(([, t]) => vorlageErlaubt(t, features))
      .map(([id, t]) => ({
        id, name: t.name, description: t.description || '',
        // Lage der Grundform für die Miniatur in der Auswahl „Neue Kachel“ (23.10.2026)
        preview: {
          background: t.background || null,
          displays: (t.displays || []).map(d => ({ x: d.x, y: d.y, width: d.width, height: d.height, type: d.type })),
          buttons: (t.buttons || []).map(b => ({ x: b.x, y: b.y, size: b.size, heightSize: b.heightSize ?? null, shape: b.shape || 'square', color: b.color || null })),
          embeds: (t.embeds || []).map(e => ({ x: e.x, y: e.y, width: e.width, height: e.height, baustein: e.baustein })),
          graphics: (t.graphics || []).map(g => ({ x: g.x, y: g.y, width: g.width, height: g.height, src: g.src }))
        }
      }));
  }

  /**
   * Einmal je Spiel (Hendrik 22.10.2026: „Ersetzen + Zurücksetzen“): die früher festen Bausteine als normale Bausteine
   * anlegen, mit fester ID (vorlagenPageId), damit alte Kacheln darauf umziehen können. Danach nie wieder -- wer einen
   * löscht, legt ihn bei Bedarf über „+ Neue Kachel → Vorlage“ neu an. Ohne Spieldaten nur die Steuerungsübersicht.
   * Neue Vorlagen (seit: Stand) kommen bei bestehenden Installationen einmal dazu (Arbeitsplaner, 22.10.2026 abends).
   */
  async ensureVorlagen(features = true) {
    if (this.vorlagen >= VORLAGEN_STAND) return false;
    // Stand 3 (23.10.2026): vorhandene Vorlagen-Kacheln einmal auf die neue Vorlage setzen (Hendrik: „kannst du ruhig
    // überschreiben“) -- Name und ID bleiben, eigene Änderungen an Anzeigen, Tasten und Anordnungen fallen weg
    if (this.vorlagen > 0 && this.vorlagen < 3) {
      for (const page of Object.values(this.pages)) {
        const tpl = page.vorlage && BAUSTEIN_VORLAGEN[page.vorlage];
        if (tpl) { Object.assign(page, templateElements(tpl)); normalizePage(page); }
      }
    }
    for (const [key, tpl] of Object.entries(BAUSTEIN_VORLAGEN)) {
      if ((tpl.seit || 1) <= this.vorlagen || !vorlageErlaubt(tpl, features)) continue;
      const id = vorlagenPageId(key);
      if (!this.pages[id]) await this.createPageFromTemplate(key, tpl.name, id);
    }
    this.vorlagen = VORLAGEN_STAND;
    await this.save();
    return true;
  }

  async resetToTemplate(pageId) {
    const page = this.pages[pageId];
    const tpl = page && BAUSTEIN_VORLAGEN[page.vorlage];
    if (!tpl) throw new Error('Diese Kachel hat keine Vorlage');
    Object.assign(page, templateElements(tpl));   // samt den Anordnungen der Vorlage (eigene fallen weg)
    normalizePage(page);
    await this.save();
    return page;
  }

  // Eigener „Werte“-Baustein aus einer Liste von Werteliste-IDs (Umzug alter Werte-Kacheln mit eigener Auswahl)
  async createValuesPage(name, values, kindOf = () => 'num') {
    const n = Math.min(values.length, 8);
    const cols = Math.min(4, n), rows = Math.ceil(n / cols);
    const type = v => ({ bool: 'leuchte', text: 'text' }[kindOf(v)] || 'zahl');
    const displays = values.slice(0, 8).map((value, i) => ({
      value, type: type(value), x: ((i % cols) + 0.5) * (100 / cols), y: (Math.floor(i / cols) + 0.5) * (100 / rows),
      width: 100 / cols - 4, height: Math.min(12, 56.25 / rows - 4)
    }));
    const id = this.newPageId();
    this.pages[id] = normalizePage({ id, name, gridSize: DEFAULT_GRID_SIZE, fineGridSize: DEFAULT_FINE_GRID_SIZE,
      background: null, buttons: [], graphics: [], texts: [], displays, embeds: [] });
    this.order.push(id);
    await this.save();
    return this.pages[id];
  }

  async deletePage(id) {
    if (!this.pages[id]) {
      throw new Error(`Seite '${id}' nicht gefunden`);
    }
    if (this.order.length <= 1) {
      throw new Error('Mindestens eine Seite muss bestehen bleiben');
    }
    delete this.pages[id];
    this.order = this.order.filter(x => x !== id);
    await this.save();
  }

  async reorderPages(newOrder) {
    const known = new Set(Object.keys(this.pages));
    const filtered = (newOrder || []).filter(id => known.has(id));
    if (filtered.length !== known.size) {
      throw new Error('Reihenfolge muss alle vorhandenen Seiten genau einmal enthalten');
    }
    this.order = filtered;
    await this.save();
  }

  async addButtonSlot(pageId) {
    const page = this.pages[pageId];
    if (!page) {
      throw new Error(`Seite '${pageId}' nicht gefunden`);
    }
    // Neue Taste leicht versetzt zur Bildmitte, damit mehrfaches Hinzufügen nicht komplett
    // übereinanderliegende Tasten erzeugt.
    const offset = (page.buttons.length % 5) * 4;
    const button = {
      id: makeButtonId(),
      x: 44 + offset,
      y: 44 + offset,
      shape: 'circle',
      size: DEFAULT_BUTTON_SIZE,
      heightSize: null,
      cornerRadius: null,
      rotation: 0,
      label: '',
      icon: null,
      fontSize: DEFAULT_FONT_SIZE,
      color: null,
      functionId: null,
      quickActions: null,
      quickActionsDurationSeconds: null
    };
    page.buttons.push(button);
    await this.save();
    return { page, button };
  }

  async removeButton(pageId, buttonId) {
    const page = this.pages[pageId];
    if (!page) {
      throw new Error(`Seite '${pageId}' nicht gefunden`);
    }
    const before = page.buttons.length;
    page.buttons = page.buttons.filter(b => b.id !== buttonId);
    if (page.buttons.length === before) {
      throw new Error('Taste nicht gefunden');
    }
    await this.save();
    return page;
  }

  // Patch mit einem oder mehreren Feldern (Position/Form/Größe/Drehung/Beschriftung/Zuordnung) -- fürs
  // Ziehen/Skalieren im Editor reicht so ein einziger Request nach dem Loslassen. functionId und
  // quickActions schließen sich gegenseitig aus: wird eines gesetzt (nicht null), wird das andere
  // automatisch geleert.
  async updateButton(pageId, buttonId, patch) {
    const page = this.pages[pageId];
    if (!page) {
      throw new Error(`Seite '${pageId}' nicht gefunden`);
    }
    const button = page.buttons.find(b => b.id === buttonId);
    if (!button) {
      throw new Error('Taste nicht gefunden');
    }
    if (patch.x != null) button.x = patch.x;
    if (patch.y != null) button.y = patch.y;
    if (patch.size != null) button.size = Math.round(patch.size * 100) / 100;
    // Explizit auf null setzbar (Viereck wieder "quadratisch" koppeln) -- deshalb undefined- statt
    // null-Prüfung wie bei size/x/y oben, die ein Zurücksetzen so nicht zuließen.
    if (patch.heightSize !== undefined) button.heightSize = patch.heightSize > 0 ? Math.round(patch.heightSize * 100) / 100 : null;
    // typeof-Prüfung statt "> 0" (s. normalizeButton()) -- 0 ist ein gültiger Wert (scharfe Ecken), der
    // sonst fälschlich als "zurücksetzen" behandelt würde.
    if (patch.cornerRadius !== undefined) {
      button.cornerRadius = typeof patch.cornerRadius === 'number' ? clamp(patch.cornerRadius, 0, 50) : null;
    }
    if (patch.rotation != null) button.rotation = normalizeRotation(patch.rotation);
    if (patch.show !== undefined) button.show = normShow(patch.show);
    if (patch.label !== undefined) button.label = String(patch.label || '').slice(0, MAX_LABEL_LENGTH);
    if (patch.icon !== undefined) {
      if (patch.icon !== null && !VALID_ICONS.includes(patch.icon)) {
        throw new Error('Ungültiges Piktogramm');
      }
      button.icon = patch.icon;
    }
    if (patch.fontSize != null) button.fontSize = clamp(patch.fontSize, MIN_FONT_SIZE, MAX_FONT_SIZE);
    if (patch.shape != null) {
      if (!VALID_SHAPES.includes(patch.shape)) {
        throw new Error('Ungültige Form');
      }
      button.shape = patch.shape;
    }
    if (patch.color !== undefined) {
      if (patch.color !== null && !VALID_COLORS.includes(patch.color)) {
        throw new Error('Ungültige Farbe');
      }
      button.color = patch.color;
    }
    if (patch.functionId !== undefined) {
      button.functionId = patch.functionId;
      if (patch.functionId) {
        button.quickActions = null;
        button.quickActionsDurationSeconds = null;
      }
    }
    if (patch.quickActions !== undefined) {
      button.quickActions = patch.quickActions;
      if (patch.quickActions) button.functionId = null;
    }
    if (patch.quickActionsDurationSeconds !== undefined) {
      button.quickActionsDurationSeconds = patch.quickActionsDurationSeconds > 0 ? patch.quickActionsDurationSeconds : null;
    }
    if (patch.stateSource !== undefined) {
      button.stateSource = typeof patch.stateSource === 'string' && patch.stateSource ? patch.stateSource.slice(0, 40) : null;
    }
    await this.save();
    return { page, button };
  }

  // ---------------------------------------------------------------------------------------------
  // Grafik-Elemente (rein visuell, kein Klickverhalten) -- CRUD nach demselben Muster wie Tasten oben.
  // ---------------------------------------------------------------------------------------------

  async addGraphic(pageId) {
    const page = this.pages[pageId];
    if (!page) {
      throw new Error(`Seite '${pageId}' nicht gefunden`);
    }
    const offset = (page.graphics.length % 5) * 4;
    const graphic = normalizeGraphic({ x: 40 + offset, y: 40 + offset }, 0);
    page.graphics.push(graphic);
    await this.save();
    return { page, graphic };
  }

  async setGraphicImage(pageId, graphicId, imagePath) {
    const page = this.pages[pageId];
    if (!page) {
      throw new Error(`Seite '${pageId}' nicht gefunden`);
    }
    const graphic = page.graphics.find(g => g.id === graphicId);
    if (!graphic) {
      throw new Error('Grafik nicht gefunden');
    }
    graphic.src = imagePath;
    await this.save();
    return { page, graphic };
  }

  async updateGraphic(pageId, graphicId, patch) {
    const page = this.pages[pageId];
    if (!page) {
      throw new Error(`Seite '${pageId}' nicht gefunden`);
    }
    const graphic = page.graphics.find(g => g.id === graphicId);
    if (!graphic) {
      throw new Error('Grafik nicht gefunden');
    }
    if (patch.x != null) graphic.x = patch.x;
    if (patch.y != null) graphic.y = patch.y;
    if (patch.width != null) graphic.width = Math.round(clamp(patch.width, 2, 100) * 100) / 100;
    if (patch.height != null) graphic.height = Math.round(clamp(patch.height, 2, 100) * 100) / 100;
    if (patch.rotation != null) graphic.rotation = normalizeRotation(patch.rotation);
    if (patch.show !== undefined) graphic.show = normShow(patch.show);
    await this.save();
    return { page, graphic };
  }

  async removeGraphic(pageId, graphicId) {
    const page = this.pages[pageId];
    if (!page) {
      throw new Error(`Seite '${pageId}' nicht gefunden`);
    }
    const before = page.graphics.length;
    page.graphics = page.graphics.filter(g => g.id !== graphicId);
    if (page.graphics.length === before) {
      throw new Error('Grafik nicht gefunden');
    }
    await this.save();
    return page;
  }

  // ---------------------------------------------------------------------------------------------
  // Text-Elemente (frei stehender Textzug, unabhängig von jeder Taste).
  // ---------------------------------------------------------------------------------------------

  async addText(pageId) {
    const page = this.pages[pageId];
    if (!page) {
      throw new Error(`Seite '${pageId}' nicht gefunden`);
    }
    const offset = (page.texts.length % 5) * 4;
    const text = normalizeText({ x: 40 + offset, y: 20 + offset }, 0);
    page.texts.push(text);
    await this.save();
    return { page, text };
  }

  async updateText(pageId, textId, patch) {
    const page = this.pages[pageId];
    if (!page) {
      throw new Error(`Seite '${pageId}' nicht gefunden`);
    }
    const text = page.texts.find(t => t.id === textId);
    if (!text) {
      throw new Error('Text nicht gefunden');
    }
    if (patch.x != null) text.x = patch.x;
    if (patch.y != null) text.y = patch.y;
    if (patch.width != null) text.width = clamp(patch.width, 5, 95);
    if (patch.text !== undefined) text.text = String(patch.text || '').slice(0, MAX_TEXT_LENGTH);
    if (patch.fontSize != null) text.fontSize = clamp(patch.fontSize, MIN_FONT_SIZE, MAX_FONT_SIZE * 2);
    if (patch.color !== undefined) {
      if (patch.color !== null && !VALID_COLORS.includes(patch.color)) {
        throw new Error('Ungültige Farbe');
      }
      text.color = patch.color;
    }
    if (patch.rotation != null) text.rotation = normalizeRotation(patch.rotation);
    if (patch.show !== undefined) text.show = normShow(patch.show);
    await this.save();
    return { page, text };
  }

  async removeText(pageId, textId) {
    const page = this.pages[pageId];
    if (!page) {
      throw new Error(`Seite '${pageId}' nicht gefunden`);
    }
    const before = page.texts.length;
    page.texts = page.texts.filter(t => t.id !== textId);
    if (page.texts.length === before) {
      throw new Error('Text nicht gefunden');
    }
    await this.save();
    return page;
  }

  // ---------------------------------------------------------------------------------------------
  // Anzeigen mit Spielwerten (Paket J) -- CRUD nach dem Muster der Grafiken.
  // ---------------------------------------------------------------------------------------------

  async addDisplay(pageId, init = {}) {
    const page = this.pages[pageId];
    if (!page) {
      throw new Error(`Seite '${pageId}' nicht gefunden`);
    }
    const offset = (page.displays.length % 5) * 4;
    const display = normalizeDisplay({ x: 40 + offset, y: 35 + offset, ...init, id: undefined }, 0);
    page.displays.push(display);
    await this.save();
    return { page, display };
  }

  async updateDisplay(pageId, displayId, patch) {
    const page = this.pages[pageId];
    if (!page) {
      throw new Error(`Seite '${pageId}' nicht gefunden`);
    }
    const i = page.displays.findIndex(d => d.id === displayId);
    if (i < 0) {
      throw new Error('Anzeige nicht gefunden');
    }
    const merged = { ...page.displays[i], ...patch, id: displayId };
    // Zuordnung wie bei Tasten: Funktion ODER Schnellbelegung
    if (patch.functionId) { merged.quickActions = null; merged.quickActionsDurationSeconds = null; }
    if (patch.quickActions) merged.functionId = null;
    page.displays[i] = normalizeDisplay(merged, i);
    await this.save();
    return { page, display: page.displays[i] };
  }

  async removeDisplay(pageId, displayId) {
    const page = this.pages[pageId];
    if (!page) {
      throw new Error(`Seite '${pageId}' nicht gefunden`);
    }
    const before = page.displays.length;
    page.displays = page.displays.filter(d => d.id !== displayId);
    if (page.displays.length === before) {
      throw new Error('Anzeige nicht gefunden');
    }
    await this.save();
    return page;
  }

  // ---------------------------------------------------------------------------------------------
  // Baustein-Elemente (eingebaute Bausteine in eigenen Bausteinen) -- CRUD nach dem Muster der Anzeigen.
  // ---------------------------------------------------------------------------------------------

  async addEmbed(pageId, init = {}) {
    const page = this.pages[pageId];
    if (!page) throw new Error(`Seite '${pageId}' nicht gefunden`);
    const offset = (page.embeds.length % 5) * 4;
    const embed = normalizeEmbed({ x: 50 + offset, y: 45 + offset, ...init, id: undefined }, 0);
    if (!embed) throw new Error('Unbekannter Inhalt');
    page.embeds.push(embed);
    await this.save();
    return { page, embed };
  }

  async updateEmbed(pageId, embedId, patch) {
    const page = this.pages[pageId];
    if (!page) throw new Error(`Seite '${pageId}' nicht gefunden`);
    const i = page.embeds.findIndex(e => e.id === embedId);
    if (i < 0) throw new Error('Element nicht gefunden');
    const next = normalizeEmbed({ ...page.embeds[i], ...patch, id: embedId }, i);
    if (!next) throw new Error('Unbekannter Inhalt');
    page.embeds[i] = next;
    await this.save();
    return { page, embed: page.embeds[i] };
  }

  async removeEmbed(pageId, embedId) {
    const page = this.pages[pageId];
    if (!page) throw new Error(`Seite '${pageId}' nicht gefunden`);
    const before = page.embeds.length;
    page.embeds = page.embeds.filter(e => e.id !== embedId);
    if (page.embeds.length === before) throw new Error('Element nicht gefunden');
    await this.save();
    return page;
  }

  // ---------------------------------------------------------------------------------------------
  // Anordnung je Kachelform (s. VARIANTEN)
  // ---------------------------------------------------------------------------------------------

  // Kachel-Editor (22.10.2026): den ganzen Inhalt einer Kachel auf einmal speichern -- Elemente, Anordnungen je
  // Kachelform, Ebenen, Gruppen, Raster. Name, Hintergrund und Vorlage bleiben (eigene Wege).
  async replaceContent(pageId, data) {
    const page = this.pages[pageId];
    if (!page) throw new Error(`Seite '${pageId}' nicht gefunden`);
    if (!data || typeof data !== 'object') throw new Error('Kein Inhalt');
    // Erst prüfen, dann übernehmen (23.10.2026): ein null-Element in der Liste ließ vorher jedes weitere Speichern
    // dieses Spiels scheitern, bis zum Neustart
    const isObj = e => e && typeof e === 'object' && !Array.isArray(e);
    const before = structuredClone(page);
    for (const key of ['buttons', 'graphics', 'texts', 'displays', 'embeds']) if (Array.isArray(data[key])) page[key] = data[key].filter(isObj);
    if (data.varianten && typeof data.varianten === 'object') page.varianten = data.varianten;
    if (Array.isArray(data.layers)) page.layers = data.layers;
    if (data.groups && typeof data.groups === 'object') page.groups = data.groups;
    if (typeof data.gridSize === 'number') page.gridSize = clamp(data.gridSize, MIN_GRID_SIZE, MAX_GRID_SIZE);
    if (typeof data.fineGridSize === 'number') page.fineGridSize = clamp(data.fineGridSize, MIN_GRID_SIZE, MAX_GRID_SIZE);
    // doppelte IDs (sollte der Editor nie schicken) bekommen eine neue
    const seen = new Set();
    for (const key of ['buttons', 'graphics', 'texts', 'displays', 'embeds']) {
      for (const e of page[key]) { if (!e || typeof e.id !== 'string' || !ID_RE.test(e.id) || seen.has(e.id)) e.id = undefined; else seen.add(e.id); }
    }
    try {
      normalizePage(page);
    } catch (error) {
      this.pages[pageId] = before;   // nichts Halbes im Speicher lassen
      throw error;
    }
    await this.save();
    return this.pages[pageId];
  }

  async setVariant(pageId, v, elements) {
    const page = this.pages[pageId];
    if (!page) throw new Error(`Seite '${pageId}' nicht gefunden`);
    if (!VARIANTEN.includes(v)) throw new Error('Unbekannte Kachelform: ' + v);
    page.varianten = { ...(page.varianten || {}), [v]: elements && typeof elements === 'object' ? elements : {} };
    normalizeVarianten(page);
    await this.save();
    return page;
  }

  async updateVariantElement(pageId, v, elementId, patch) {
    const page = this.pages[pageId];
    if (!page) throw new Error(`Seite '${pageId}' nicht gefunden`);
    if (!page.varianten?.[v]) throw new Error('Für diese Kachelform gibt es noch keine eigene Anordnung');
    if (!elementIds(page).has(elementId)) throw new Error('Element nicht gefunden');
    const next = { ...(page.varianten[v][elementId] || {}), ...patch };
    if (patch?.hidden === false) delete next.hidden;
    page.varianten[v][elementId] = cleanGeom(next);
    await this.save();
    return { page, geom: page.varianten[v][elementId] };
  }

  async removeVariant(pageId, v) {
    const page = this.pages[pageId];
    if (!page) throw new Error(`Seite '${pageId}' nicht gefunden`);
    if (page.varianten) delete page.varianten[v];
    await this.save();
    return page;
  }

  async setBackground(pageId, imagePath) {
    const page = this.pages[pageId];
    if (!page) {
      throw new Error(`Seite '${pageId}' nicht gefunden`);
    }
    page.background = imagePath;
    await this.save();
    return page;
  }

  async clearBackground(pageId) {
    const page = this.pages[pageId];
    if (!page) {
      throw new Error(`Seite '${pageId}' nicht gefunden`);
    }
    page.background = null;
    await this.save();
    return page;
  }

  // Raster-Feinheit je Seite (s. Konstanten oben) -- steuert das Einrasten beim Ziehen in
  // steuerungsmenues.js onDrag(), ersetzt das frühere Anordnen-/Raster-anordnen-Werkzeug.
  async updatePageSettings(pageId, patch) {
    const page = this.pages[pageId];
    if (!page) {
      throw new Error(`Seite '${pageId}' nicht gefunden`);
    }
    if (patch.gridSize != null) page.gridSize = clamp(patch.gridSize, MIN_GRID_SIZE, MAX_GRID_SIZE);
    if (patch.fineGridSize != null) page.fineGridSize = clamp(patch.fineGridSize, MIN_GRID_SIZE, MAX_GRID_SIZE);
    await this.save();
    return page;
  }

  // Umbenennen einer bestehenden Seite (13.08.2026, Hendriks Wunsch) -- bisher war der Name nur bei
  // der Erstellung (addPage()-Prompt) setzbar. Bewusst KEINE Eindeutigkeits-Prüfung wie bei importPage()
  // -- dort geht es um Kollisionen beim Zusammenführen fremder Dateien, hier benennt der Nutzer aktiv
  // eine eigene Seite um und darf das auch auf einen bereits vergebenen Namen tun, wenn er will.
  async renamePage(pageId, name) {
    const page = this.pages[pageId];
    if (!page) {
      throw new Error(`Seite '${pageId}' nicht gefunden`);
    }
    const trimmed = (name || '').trim();
    if (!trimmed) {
      throw new Error('Name darf nicht leer sein');
    }
    page.name = trimmed;
    await this.save();
    return page;
  }

  exportPage(pageId) {
    const page = this.pages[pageId];
    if (!page) {
      throw new Error(`Seite '${pageId}' nicht gefunden`);
    }
    // id bewusst nicht mit exportieren -- beim Import entsteht immer eine neue, kollisionsfreie ID
    // (s. importPage()), analog zu profileManager.js duplicateProfile()/importProfile().
    const { id, ...exportable } = page;
    return exportable;
  }

  async importPage(pageData) {
    if (!pageData || !pageData.name || !pageData.name.trim()) {
      throw new Error('Ungültige Kachel-Datei (kein Name)');
    }
    const existingNames = new Set(Object.values(this.pages).map(p => p.name));
    let name = pageData.name.trim();
    if (existingNames.has(name)) {
      let n = 2;
      while (existingNames.has(`${name} (${n})`)) n++;
      name = `${name} (${n})`;
    }
    const id = this.newPageId();
    // Neue IDs für alle Elemente; idMap führt die Anordnungen je Kachelform mit
    const idMap = new Map();
    const renew = (list, norm) => (list || []).map((e, i) => {
      const fresh = norm({ ...e, id: undefined }, i);
      if (fresh && e?.id) idMap.set(e.id, fresh.id);
      return fresh;
    }).filter(Boolean);
    const page = {
      id,
      name,
      background: pageData.background || null,
      gridSize: typeof pageData.gridSize === 'number' ? clamp(pageData.gridSize, MIN_GRID_SIZE, MAX_GRID_SIZE) : DEFAULT_GRID_SIZE,
      fineGridSize: typeof pageData.fineGridSize === 'number' ? clamp(pageData.fineGridSize, MIN_GRID_SIZE, MAX_GRID_SIZE) : DEFAULT_FINE_GRID_SIZE,
      buttons: renew(pageData.buttons, normalizeButton),
      graphics: renew(pageData.graphics, normalizeGraphic),
      texts: renew(pageData.texts, normalizeText),
      displays: renew(pageData.displays, normalizeDisplay),
      embeds: renew(pageData.embeds, normalizeEmbed),
      vorlage: BAUSTEIN_VORLAGEN[pageData.vorlage] ? pageData.vorlage : null,
      varianten: pageData.varianten || {},
      layers: (Array.isArray(pageData.layers) ? pageData.layers : []).map(x => idMap.get(x)).filter(Boolean),
      groups: pageData.groups || {}
    };
    normalizeVarianten(page, idMap);
    normalizeLayersAndGroups(page);
    this.pages[id] = page;
    this.order.push(id);
    await this.save();
    return page;
  }

  async save() {
    try {
      Object.values(this.pages).forEach(p => { normalizeVarianten(p); normalizeLayersAndGroups(p); });
      const config = { order: this.order, pages: this.pages, vorlagen: this.vorlagen || 0, raster: this.raster || 1 };
      await writeJsonAtomic(this.configPath, config); // atomar + .bak (23.10.2026)
    } catch (error) {
      console.error('Fehler beim Speichern der Steuerungsmenüs:', error);
      throw error;
    }
  }
}
