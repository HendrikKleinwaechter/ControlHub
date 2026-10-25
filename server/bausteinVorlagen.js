/**
 * Vorlagen der Kacheln, die ControlHub mitbringt (Hendrik 22.10.2026): Cockpit, Fahrzeug, Wetter und Wirtschaft,
 * Precision Farming, Werte, Geräte, Steuerungsübersicht, Streckenzähler und Arbeitsplaner sind ganz normale Kacheln aus
 * Anzeigen (Werteliste), Tasten und Elementen -- frei änderbar, jederzeit „Zurücksetzen“. Fest bleibt nur die Karte.
 *
 * Seit 23.10.2026 (Hendrik: „für jedes Format passend, hübsch, modern und ordentlich“) hat jede Vorlage für alle sechs
 * Kachelformen eine eigene Anordnung. Beschrieben wird sie als Zeilen und Spalten (row/col, mit Anteil f); die
 * Rechenhilfe layout() macht daraus Kästen mit gleichem Rand und gleichen Abständen, bündig auf dem Bezugs-Tablet
 * (1280 × 800, Kachelgrößen wie steuerungsmenues.js SM_FORM_SIZE). Was in einer Form nicht vorkommt, ist dort ausgeblendet.
 *
 * Koordinaten wie im Editor: x = Mitte in % der Breite, y = Mitte in % der Höhe, Breiten/Höhen in % der Breite.
 * varianten: Anordnung je Kachelform (Schlüssel = key eines Elements), a = Seitenverhältnis der Form.
 * feature: nur bei Spielen mit dieser Fähigkeit; seit: Stand von ensureVorlagen(), ab dem es die Vorlage gibt.
 *
 * Cockpit und Beleuchtung sind seit 24.10.2026 so übernommen, wie Hendrik sie im Kachel-Editor gestaltet hat
 * (vorlagenGestaltet.js, gleicher Aufbau ohne Rechenhilfe).
 */

import { GESTALTET } from './vorlagenGestaltet.js';

// Kachelflächen auf dem Bezugs-Tablet (Pixel); die ganze Seite ist die Grundform (16:9)
const REF = { '2x3': [1240, 697.5], '2x2': [816, 652], '2x1': [393, 652], '1x3': [1240, 289], '1x2': [816, 289], '1x1': [393, 289] };
const MARGIN = 6, GAP = 8;   // Pixel auf dem Bezugs-Tablet
const r2 = v => Math.round(v * 100) / 100;

// Bausteine der Beschreibung: row()/col() mit Elementen (key), null = Lücke, f(anteil, …) = Anteil (Standard 1)
const row = (...items) => ({ dir: 'row', items });
const col = (...items) => ({ dir: 'col', items });
const f = (flex, node) => ({ ...(node && typeof node === 'object' ? node : { key: node }), flex });

// Kästen einer Form in Breiten-Prozent { key: { l, t, w, h } }
function layout(form, tree) {
  const [W, H] = REF[form];
  const m = (MARGIN / W) * 100, g = (GAP / W) * 100;
  const out = {};
  const place = (node, box) => {
    const n = node && typeof node === 'object' ? node : { key: node };
    if (!n.dir) { if (n.key) out[n.key] = box; return; }
    const items = n.items.map(it => (it && typeof it === 'object' ? it : { key: it }));
    const total = items.reduce((s, it) => s + (it.flex ?? 1), 0);
    const along = (n.dir === 'row' ? box.w : box.h) - g * (items.length - 1);
    let pos = n.dir === 'row' ? box.l : box.t;
    for (const it of items) {
      const len = (along * (it.flex ?? 1)) / total;
      place(it, n.dir === 'row' ? { l: pos, t: box.t, w: len, h: box.h } : { l: box.l, t: pos, w: box.w, h: len });
      pos += len + g;
    }
  };
  place(tree, { l: m, t: m, w: 100 - 2 * m, h: (H / W) * 100 - 2 * m });
  return out;
}

// Lage eines Elements aus seinem Kasten; Tasten bekommen eine zur Höhe passende Schrift, die auch in die Breite passt
// (längstes Wort der Beschriftung in einer Zeile, sonst bräche „Rundumleuchte“ in schmalen Tasten mitten im Wort um)
function geomOf(kind, b, form, label = '') {
  const [W, H] = REF[form];
  const a = W / H;
  const g = { x: r2(b.l + b.w / 2), y: r2((b.t + b.h / 2) * a) };
  if (kind === 'button') {
    const hPx = (b.h * W) / 100, wPx = (b.w * W) / 100;
    const word = Math.max(4, ...String(label).split(/\s+/).map(w => w.length));
    const px = Math.max(11, Math.min(22, hPx * 0.3, (wPx * 0.82) / (word * 0.62)));
    return { ...g, size: r2(b.w), heightSize: r2(b.h), fontSize: r2((px / W) * 100) };
  }
  return { ...g, width: r2(b.w), height: r2(b.h) };
}

// Vorlage aus Elementen und Anordnungen je Form bauen (Grundform = '2x3' muss alle Elemente enthalten)
function vorlage({ elements, layouts, ...rest }) {
  const base = layout('2x3', layouts['2x3']);
  const tpl = { ...rest, displays: [], buttons: [], embeds: [], varianten: {} };
  const list = { display: tpl.displays, button: tpl.buttons, embed: tpl.embeds };
  for (const [key, el] of Object.entries(elements)) {
    if (!base[key]) throw new Error(`Vorlage ${rest.name}: ${key} fehlt in der Grundform`);
    const { kind, ...props } = el;
    list[kind].push({ key, show: 'immer', ...props, ...geomOf(kind, base[key], '2x3', props.label) });
  }
  for (const form of ['2x2', '2x1', '1x3', '1x2', '1x1']) {
    const boxes = layout(form, layouts[form]);
    const a = r2(REF[form][0] / REF[form][1]);
    tpl.varianten[form] = Object.fromEntries(Object.entries(elements).map(([key, el]) =>
      [key, boxes[key] ? { ...geomOf(el.kind, boxes[key], form, el.label), a } : { hidden: true }]));
    sameFont(Object.entries(tpl.varianten[form]).filter(([key, g]) => elements[key].kind === 'button' && !g.hidden).map(([, g]) => g));
  }
  sameFont(tpl.buttons);
  return tpl;
}

// Alle Tasten einer Form in derselben Schriftgröße (der kleinsten, damit jede Beschriftung passt) -- sonst stünde
// „Fernlicht“ groß neben einem klein gesetzten „Rundumleuchte“
function sameFont(geoms) {
  if (!geoms.length) return;
  const min = Math.min(...geoms.map(g => g.fontSize));
  for (const g of geoms) g.fontSize = min;
}

const anz = (value, type, extra = {}) => ({ kind: 'display', value, type, ...extra });
const KEY = { kind: 'button', shape: 'square', cornerRadius: 16 };
// Teilbreiten einzeln schalten (Hendriks FS25-Tastenbelegung, vorher fest im Precision-Farming-Dashboard)
const combo = key => [{ type: 'keyboard', key: 'LCTRL' }, { type: 'keyboard', key: 'LSHIFT' }, { type: 'keyboard', key }];
// Ein Element füllt in jeder Form die ganze Kachel (Geräteliste, Steuerungsübersicht)
const FILL = { '2x3': 'inhalt', '2x2': 'inhalt', '2x1': 'inhalt', '1x3': 'inhalt', '1x2': 'inhalt', '1x1': 'inhalt' };

export const BAUSTEIN_VORLAGEN = {
  // gestaltet im Kachel-Editor (Hendrik 24.10.2026), s. vorlagenGestaltet.js
  cockpit: { name: 'Cockpit', description: 'Tacho, Drehzahl, Leuchten und Füllstände', ...GESTALTET.cockpit },
  fahrzeug: vorlage({
    name: 'Fahrzeug',
    description: 'Tempo, Gang, Tank, Vorgewende und Leuchten',
    elements: {
      speed: anz('speed', 'zahl'), gear: anz('gear', 'text', { label: 'Gang' }), rpm: anz('rpm', 'zahl', { label: 'Drehzahl' }),
      cruise: anz('cruise', 'zahl', { label: 'Tempomat' }), headland: anz('headland_dist', 'zahl', { label: 'Vorgewende' }),
      fuel: anz('fuel_pct', 'balken', { warn: 10, label: 'Diesel' }),
      light: anz('light_low', 'leuchte', { label: 'Licht' }), beacon: anz('beacon', 'leuchte', { label: 'Rundumleuchte' }),
      brake: anz('handbrake', 'leuchte', { label: 'Handbremse' }), ai: anz('ai', 'leuchte', { label: 'Helfer' })
    },
    layouts: {
      '2x3': col(f(2.2, row(f(1.4, 'speed'), col('gear', 'rpm'), col('cruise', 'headland'))), f(0.9, 'fuel'), f(0.6, row('light', 'beacon', 'brake', 'ai'))),
      '2x2': col(f(2, row(f(1.3, 'speed'), col('gear', 'rpm'))), row('cruise', 'headland'), f(0.9, 'fuel'), f(0.6, row('light', 'beacon', 'brake', 'ai'))),
      '2x1': col(f(1.7, 'speed'), row('gear', 'rpm'), row('cruise', 'headland'), f(0.9, 'fuel'), f(0.55, row('light', 'beacon')), f(0.55, row('brake', 'ai'))),
      '1x3': row(f(1.25, 'speed'), col('gear', 'rpm'), col('cruise', 'headland'), f(1.15, 'fuel'), f(0.9, col('light', 'beacon', 'brake', 'ai'))),
      '1x2': row(f(1.3, 'speed'), col('gear', 'fuel'), col('cruise', 'headland')),
      '1x1': col(f(1.5, 'speed'), row('gear', 'fuel'))
    }
  }),
  wetter: vorlage({
    name: 'Wetter und Wirtschaft',
    description: 'Spielzeit, Wetter, Temperatur und Kontostand',
    elements: {
      clock: anz('clock', 'text', { label: 'Spielzeit' }), weather: anz('weather', 'text', { label: 'Wetter' }), temp: anz('air_temp', 'zahl', { label: 'Außen' }),
      season: anz('season', 'text', { label: 'Jahreszeit' }), daylight: anz('daylight', 'leuchte', { label: 'Tag' }), money: anz('money', 'zahl', { label: 'Kontostand' })
    },
    layouts: {
      '2x3': col(f(1.7, row(f(1.3, 'clock'), col('weather', 'temp'))), row('season', f(0.8, 'daylight'), f(1.4, 'money'))),
      '2x2': col(f(1.5, 'clock'), row('weather', 'temp'), row('season', f(0.8, 'daylight')), 'money'),
      '2x1': col(f(1.4, 'clock'), 'weather', 'temp', 'season', f(0.6, 'daylight'), 'money'),
      '1x3': row(f(1.3, 'clock'), col('weather', 'temp'), col('season', f(0.7, 'daylight')), f(1.2, 'money')),
      '1x2': row(f(1.3, 'clock'), col('weather', 'temp'), 'money'),
      '1x1': col(f(1.4, 'clock'), row('weather', 'temp'))
    }
  }),
  precision: vorlage({
    name: 'Precision Farming',
    description: 'Ausbringung, Nährstoffe und Teilbreiten',
    elements: {
      on: anz('pf_on', 'leuchte', { label: 'Ausbringung aktiv' }), usage: anz('pf_usage', 'zahl', { label: 'Menge pro Minute' }),
      width: anz('pf_width', 'zahl', { label: 'Arbeitsbreite' }), sections: anz('pf_sections', 'zahl', { label: 'Teilbreiten' }),
      fill: anz('pf_fill', 'balken', { label: 'Füllstand' }), n: anz('pf_n', 'balken', { label: 'Stickstoff' }), ph: anz('pf_ph', 'balken', { label: 'pH-Wert' }),
      lOn: { ...KEY, label: '◀ Teilbreite an', quickActions: combo('U') }, lOff: { ...KEY, label: '◀ Teilbreite aus', quickActions: combo('I') },
      rOff: { ...KEY, label: 'Teilbreite aus ▶', quickActions: combo('J') }, rOn: { ...KEY, label: 'Teilbreite an ▶', quickActions: combo('K') }
    },
    layouts: {
      '2x3': col(row(f(0.9, 'on'), f(1.2, 'usage'), 'width', 'sections'), row('fill', 'n', 'ph'), f(0.9, row('lOn', 'lOff', 'rOff', 'rOn'))),
      '2x2': col(f(0.8, row('on', f(1.3, 'usage'))), row('width', 'sections'), f(0.9, 'fill'), f(0.9, row('n', 'ph')), f(0.9, row('lOn', 'lOff', 'rOff', 'rOn'))),
      '2x1': col(f(0.6, 'on'), 'usage', row('width', 'sections'), f(0.8, 'fill'), f(0.8, 'n'), f(0.8, 'ph'), f(0.8, row('lOn', 'rOn')), f(0.8, row('lOff', 'rOff'))),
      '1x3': row(col(f(0.7, 'on'), 'usage'), col('width', 'sections'), f(1.3, col('fill', 'n', 'ph')), f(1.3, col(row('lOn', 'rOn'), row('lOff', 'rOff')))),
      '1x2': row(col(f(0.7, 'on'), 'usage'), col('fill', 'n'), col(row('lOn', 'rOn'), row('lOff', 'rOff'))),
      '1x1': col(f(0.6, 'on'), 'usage', f(0.9, 'fill'))
    }
  }),
  werte: vorlage({
    name: 'Werte',
    description: 'Geschwindigkeit und Diesel – Werte frei austauschbar',
    elements: { speed: anz('speed', 'zahl'), fuel: anz('fuel_pct', 'zahl', { label: 'Diesel' }) },
    layouts: {
      '2x3': row('speed', 'fuel'), '2x2': col('speed', 'fuel'), '2x1': col('speed', 'fuel'),
      '1x3': row('speed', 'fuel'), '1x2': row('speed', 'fuel'), '1x1': col('speed', 'fuel')
    }
  }),
  geraete: vorlage({
    name: 'Geräte',
    description: 'Anbaugeräte in Lage am Fahrzeug',
    elements: { inhalt: { kind: 'embed', baustein: 'geraete' } },
    layouts: FILL
  }),
  steuerung: {
    ...vorlage({
      name: 'Steuerungsübersicht',
      description: 'Belegte Tasten der Module',
      elements: { inhalt: { kind: 'embed', baustein: 'steuerung' } },
      layouts: FILL
    }),
    noTelemetry: true
  },
  // Arbeitsplaner als normale Kachel (Hendrik 22.10.2026 abends): drei Planer-Teile, für jede Kachelform so angeordnet,
  // dass immer das Sinnvollste zu sehen ist. Komplexe, Fruchtfolge und Planer-Satz stehen im Planer-Menü (☰ → Arbeitsplaner).
  planer: {
    ...vorlage({
      name: 'Arbeitsplaner',
      description: 'Feld in Arbeit, als Nächstes und Feldliste',
      elements: {
        aktuell: { kind: 'embed', baustein: 'planer-aktuell' }, naechstes: { kind: 'embed', baustein: 'planer-naechstes' },
        felder: { kind: 'embed', baustein: 'planer-felder' }
      },
      layouts: {
        '2x3': row(col(f(0.65, 'aktuell'), 'naechstes'), f(1.05, 'felder')),
        '2x2': col(f(0.55, 'aktuell'), row('naechstes', f(1.05, 'felder'))),
        '2x1': col(f(0.55, 'aktuell'), 'naechstes'),
        '1x3': row('aktuell', 'naechstes', 'felder'),
        '1x2': row('aktuell', f(1.05, 'naechstes')),
        '1x1': col(f(0.8, 'aktuell'), 'naechstes')
      }
    }),
    feature: 'planner',
    seit: 2
  },
  strecke: vorlage({
    name: 'Streckenzähler',
    description: 'Gefahrene Strecke mit Zurücksetzen',
    elements: {
      trip: anz('trip_km', 'zahl', { dec: 2, label: 'Strecke' }),
      reset: { ...KEY, label: 'Zurücksetzen', functionId: 'hub:strecke:reset' }
    },
    layouts: {
      '2x3': col(f(4, 'trip'), row(f(2, null), 'reset')),
      '2x2': col(f(4, 'trip'), row(null, 'reset')),
      '2x1': col(f(4, 'trip'), 'reset'),
      '1x3': row(f(3, 'trip'), col(null, 'reset')),
      '1x2': row(f(2, 'trip'), col(null, 'reset')),
      '1x1': col(f(2, 'trip'), 'reset')
    }
  }),
  // Beispiel-Kacheln (Hendrik 23.10.2026: „1 oder 2 anlegen“): zeigen, wie Anzeigen und Tasten mit Zustand
  // zusammenspielen. Die Tasten leuchten nach der Werteliste; welche Funktion sie auslösen, legt man im Editor fest.
  feldarbeit: {
    ...vorlage({
      name: 'Feldarbeit',
      description: 'Beispiel: Tempo, Vorgewende, Füllstand und Tasten für die Geräte',
      elements: {
        speed: anz('speed', 'zahl', { label: 'Tempo' }), headland: anz('headland_dist', 'zahl', { label: 'Vorgewende in' }),
        fill: anz('r1_fill_pct', 'balken', { warn: 10, label: 'Füllstand hinten' }),
        steer: anz('steer_on', 'leuchte', { label: 'Spurführung' }), gps: anz('gps_armed', 'leuchte', { label: 'Vorgewende-Aktionen' }),
        hydR: { ...KEY, label: 'Hydraulik hinten', stateSource: 'r1_low' }, onR: { ...KEY, label: 'Hinten an/aus', stateSource: 'r1_on' },
        hydF: { ...KEY, label: 'Hydraulik vorne', stateSource: 'f_low' }, onF: { ...KEY, label: 'Vorne an/aus', stateSource: 'f_on' }
      },
      layouts: {
        '2x3': row(f(1.4, col(row('speed', 'headland'), f(0.8, 'fill'), f(0.55, row('steer', 'gps')))), col(row('hydR', 'hydF'), row('onR', 'onF'))),
        '2x2': col(row('speed', 'headland'), f(0.75, 'fill'), f(0.5, row('steer', 'gps')), f(1.7, col(row('hydR', 'hydF'), row('onR', 'onF')))),
        '2x1': col('speed', 'headland', f(0.8, 'fill'), f(0.55, 'steer'), row('hydR', 'hydF'), row('onR', 'onF')),
        '1x3': row(col('speed', 'headland'), f(1.25, col(f(1.3, 'fill'), 'steer', 'gps')), f(1.6, col(row('hydR', 'hydF'), row('onR', 'onF')))),
        '1x2': row(col('speed', 'headland'), f(1.3, col(row('hydR', 'hydF'), row('onR', 'onF')))),
        '1x1': col(row('speed', 'headland'), row('hydR', 'onR'))
      }
    }),
    seit: 3
  },
  strasse: {
    ...vorlage({
      name: 'Straßenfahrt',
      description: 'Beispiel: Tacho, Diesel, Ladung und Tasten fürs Licht',
      elements: {
        speed: anz('speed', 'tacho'), gear: anz('gear', 'text', { label: 'Gang' }), cruise: anz('cruise', 'zahl', { label: 'Tempomat' }),
        fuel: anz('fuel_pct', 'balken', { warn: 10, label: 'Diesel' }), load: anz('all_fill_pct', 'balken', { label: 'Ladung' }),
        light: { ...KEY, label: 'Abblendlicht', stateSource: 'light_low' }, high: { ...KEY, label: 'Fernlicht', stateSource: 'light_high' },
        beacon: { ...KEY, label: 'Rundumleuchte', stateSource: 'beacon' }, cruiseKey: { ...KEY, label: 'Tempomat', stateSource: 'cruise_on' }
      },
      layouts: {
        '2x3': row(f(1.3, 'speed'), col('gear', 'cruise', 'fuel', 'load'), f(1.1, col(row('light', 'high'), row('beacon', 'cruiseKey')))),
        '2x2': col(f(2.2, row(f(1.3, 'speed'), col('gear', 'cruise'))), row('fuel', 'load'), f(1.2, row('light', 'high', 'beacon', 'cruiseKey'))),
        '2x1': col(f(2, 'speed'), row('gear', 'cruise'), 'fuel', 'load', row('light', 'beacon'), row('high', 'cruiseKey')),
        '1x3': row(f(1.1, 'speed'), col('gear', 'cruise'), col('fuel', 'load'), f(1.5, col(row('light', 'high'), row('beacon', 'cruiseKey')))),
        '1x2': row(f(1.1, 'speed'), col('gear', 'fuel'), f(1.3, col(row('light', 'beacon'), row('high', 'cruiseKey')))),
        '1x1': row(f(1.2, 'speed'), col('light', 'beacon'))
      }
    }),
    seit: 3
  },
  // Traktor von der Seite mit Licht-Tasten (Hendrik 24.10.2026), gestaltet im Kachel-Editor, s. vorlagenGestaltet.js
  beleuchtung: { name: 'Beleuchtung', description: 'Traktor von der Seite, Licht-Tasten mit Piktogrammen an den Leuchten', ...GESTALTET.beleuchtung }
};

// Seiten-ID einer aus der Vorlage angelegten Kachel -- fest, damit alte Kacheln („cockpit“) darauf zeigen können
export const vorlagenPageId = key => `sm-v-${key}`;

// Bausteine der Beschreibung auch für Vorschläge neuer Vorlagen (z. B. Bedienkacheln zum Ausprobieren, 24.10.2026)
export { vorlage, row, col, f, anz, KEY };
