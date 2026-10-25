/**
 * Kachelseiten je Spiel, gespeichert in server/config/games/<id>/kacheln.json (gehört zum Spiel,
 * kommt in "Spiel sichern").
 *
 * Format 2 (Umsetzungsplan Paket H, 22.10.2026): festes Raster aus 2 Zeilen × 3 Spalten.
 * {
 *   version: 2,
 *   pages: [{
 *     id, name,
 *     cells: ['karte', 'karte', 'fahrzeug', 'karte', 'karte', 'werte'],   // 6 Felder, Zeile für Zeile;
 *                                        // gleiche Bausteine nebeneinander bilden eine Kachel (nur Rechtecke)
 *     profiles: [],                      // leer = Standardseite (alle Profile), sonst nur diese Profile
 *     haupt: true,                       // optional: Hauptseite, beim Laden des Profils gezeigt (tileGrid.js hauptseite())
 *     settings: { karte: { north: false, ... }, werte: { values: [...] } }  // Kachel-Einstellungen je Baustein
 *   }]
 * }
 * Tastenleiste je Kachel (Mockup „Navigation und Seiten“, 22.10.2026): in den Einstellungen des Bausteins
 * keyPos: 'unten' | 'rechts' | 'aus' und keys: [{ id, label, functionId | quickActions, durationSeconds,
 * stateSource }] (bis 4) -- dieselbe Zuordnung wie eine Tastenfeld-Taste (Funktion, Makro, ControlHub-Aktion,
 * Tastatur, Achse). Ausgelöst wird serverseitig über findKey() (socket 'tile-key-down'/'tile-key-up').
 * Welche Bausteine und Einstellungen es gibt, weiß die Oberfläche (public/js/tiles.js); hier wird nur die
 * Form geprüft. Format 1 (feste Aufteilungen mit slots[]) wird beim Lesen umgezogen, die alte Datei beim
 * ersten Speichern daneben gesichert (kacheln_vor-umbau-2026-10.json).
 * Die Automatik „Seite folgt der Situation“ (autoSwitch, je Seite auto: field/road/harvest) ist seit dem Test vom
 * 23.10.2026 entfernt (Hendrik: „macht es nur unnötig kompliziert und unintuitiv“); alte Einträge fallen beim Lesen weg.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { readJsonFile, writeJsonAtomic } from './jsonStore.js';
import '../public/js/tileGrid.js';   // Grenzen je Profil/Spiel, gleiche Regel wie in der Oberfläche

export const GRID_CELLS = 6;               // 2 Zeilen × 3 Spalten
export const MAX_PAGES = globalThis.TileGrid.MAX_GESAMT;     // je Spiel (24.10.2026: 100, vorher 10)
export const MAX_SICHTBAR = globalThis.TileGrid.MAX_SICHTBAR; // je Profil zu sehen

/** Fehlertext, wenn ein Profil mehr als MAX_SICHTBAR Seiten sähe, sonst null */
export function sichtbarFehler(pages) {
  const z = globalThis.TileGrid.zuVieleSichtbar(pages);
  if (!z) return null;
  return z.profil == null
    ? `Es gehen höchstens ${MAX_SICHTBAR} Seiten für alle Profile (Standardseiten), es wären ${z.anzahl}.`
    : `In einem Profil sind höchstens ${MAX_SICHTBAR} Kachelseiten zu sehen, bei „${z.profil}“ wären es ${z.anzahl}.`;
}
const MAX_VALUES = 8;
const MAX_PROFILES = 20;
const MAX_KEYS = 4;

// Umzug der festen Aufteilungen aus Format 1: welches alte Feld (slots[i]) in welche Rasterzelle kommt
export const LAYOUT_TO_CELLS = {
  single: [0, 0, 0, 0, 0, 0],              // eine große Fläche
  half: [0, 0, 0, 1, 1, 1],                // ½·½ -> obere Reihe / untere Reihe
  third: [0, 1, 1, 0, 1, 1],               // ⅓·⅔ -> links 1 Spalte, rechts 2
  twothird: [0, 0, 1, 0, 0, 1],            // ⅔·⅓ -> links 2 Spalten, rechts 1
  quad: [0, 0, 1, 2, 3, 3]                 // 2×2 lässt sich nicht genau abbilden: A A B / C D D
};

// Zelle/Baustein-Name: nur Buchstaben, Ziffern, _ : - (23.10.2026) -- die Zelle landet in onclick-Attributen der
// Oberfläche; Anführungszeichen o. Ä. hätten dort Code einschleusen können. Alte Namen (Format 1) bleiben gültig.
const moduleId = v => (typeof v === 'string' && /^[\w:-]{0,80}$/.test(v) ? v : '');
const isPrimitive = v => typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || typeof v === 'string';
const cleanPrimitive = v => (typeof v === 'string' ? v.slice(0, 80) : v);

const text = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);

// Taste der Tastenleiste; quickActions wie bei Tastenfeld-Tasten (Liste flacher Aktionen, z. B. {type:'keyboard', key})
function cleanKey(k, i) {
  if (!k || typeof k !== 'object' || Array.isArray(k)) return null;
  const qa = Array.isArray(k.quickActions)
    ? k.quickActions.filter(a => a && typeof a === 'object' && !Array.isArray(a)).slice(0, 10)
      .map(a => Object.fromEntries(Object.entries(a).filter(([, v]) => isPrimitive(v)).slice(0, 8).map(([kk, v]) => [String(kk).slice(0, 20), cleanPrimitive(v)])))
    : [];
  return {
    id: /^[\w-]{1,20}$/.test(k.id || '') ? k.id : `t${i + 1}`,
    label: text(k.label, 24) || 'Taste',
    functionId: qa.length ? null : text(k.functionId, 120),
    quickActions: qa.length ? qa : null,
    durationSeconds: qa.length && typeof k.durationSeconds === 'number' && k.durationSeconds > 0 ? Math.min(k.durationSeconds, 600) : null,
    stateSource: text(k.stateSource, 40)
  };
}

function cleanKeys(raw) {
  const keys = raw.map(cleanKey).filter(Boolean).slice(0, MAX_KEYS);
  const ids = new Set();
  for (const k of keys) { while (ids.has(k.id)) k.id += 'x'; ids.add(k.id); }
  return keys;
}

// Einstellungen eines Bausteins liegen unter seinem Namen, die aller Tastenfeld-Kacheln gemeinsam unter 'panel'
export const settingsKey = type => (String(type).startsWith('panel:') ? 'panel' : String(type));

// Kachel-Einstellungen: je Baustein ein flaches Objekt aus einfachen Werten oder kurzen Listen davon (plus keys)
function cleanSettings(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [mod, obj] of Object.entries(raw).slice(0, 30)) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) continue;
    const clean = {};
    for (const [k, v] of Object.entries(obj).slice(0, 30)) {
      const key = String(k).slice(0, 40);
      if (isPrimitive(v)) clean[key] = cleanPrimitive(v);
      else if (key === 'keys' && Array.isArray(v)) clean.keys = cleanKeys(v);
      else if (Array.isArray(v)) clean[key] = v.filter(isPrimitive).slice(0, 20).map(cleanPrimitive);
    }
    if (Array.isArray(clean.values)) clean.values = clean.values.filter(x => typeof x === 'string').slice(0, MAX_VALUES);
    out[moduleId(mod)] = clean;
  }
  return out;
}

function cleanProfiles(raw) {
  if (!Array.isArray(raw)) return [];
  const names = raw.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim().slice(0, 60));
  return [...new Set(names)].slice(0, MAX_PROFILES);
}

// Format 1 -> Format 2: Aufteilung + slots[] auf die 6 Rasterzellen verteilen, Werte-Auswahl in settings
export function migratePageV1(p) {
  const map = LAYOUT_TO_CELLS[p?.layout] || LAYOUT_TO_CELLS.half;
  const slots = Array.isArray(p?.slots) ? p.slots : [];
  const cells = map.map(i => moduleId(slots[i]?.module));
  const settings = {};
  const werte = slots.find(s => s?.module === 'werte');
  if (werte && Array.isArray(werte.values)) settings.werte = { values: werte.values };
  return { id: p?.id, name: p?.name, cells, profiles: [], settings };
}

function cleanPage(p, i) {
  const src = Array.isArray(p?.cells) ? p : migratePageV1(p);
  const cells = Array.from({ length: GRID_CELLS }, (_, k) => moduleId(src.cells?.[k]));
  return {
    id: typeof src?.id === 'string' && /^[\w-]{1,40}$/.test(src.id) ? src.id : `k${Date.now().toString(36)}${i}`,
    name: (typeof src?.name === 'string' && src.name.trim() ? src.name.trim() : `Seite ${i + 1}`).slice(0, 40),
    cells,
    profiles: cleanProfiles(src?.profiles),
    settings: cleanSettings(src?.settings),
    ...(src?.haupt === true ? { haupt: true } : {})
  };
}

export function isV1Config(raw) {
  return Array.isArray(raw?.pages) && raw.pages.some(p => p && !Array.isArray(p.cells));
}

export function cleanKachelConfig(raw) {
  const pages = (Array.isArray(raw?.pages) ? raw.pages : []).slice(0, MAX_PAGES).map(cleanPage);
  const ids = new Set();
  for (const p of pages) { while (ids.has(p.id)) p.id += 'x'; ids.add(p.id); }
  // bausteine: Stand des Umzugs auf die nachgebauten Kacheln (s. bausteinMigration.js; 2 = auch der Arbeitsplaner)
  return { version: 2, bausteine: [1, 2].includes(raw?.bausteine) ? raw.bausteine : 0, pages };
}

export class KachelnManager {
  constructor(configPath) {
    this.configPath = configPath;
    this.config = cleanKachelConfig(null);
    this.backupPending = false;
  }

  async initialize() {
    // Lesen über jsonStore (23.10.2026): kaputte Datei als .defekt gesichert (notfalls .bak) -- dass der
    // Bausteine-Umzug danach leer speichert, überschreibt deshalb nichts Verlorenes mehr
    const { data: raw, status } = await readJsonFile(this.configPath, { fallback: null });
    this.neu = status === 'missing';   // neues Spiel: Grundausstattung legt Seiten an (server/grundausstattung.js)
    if (status === 'broken') console.error('Kachelseiten nicht lesbar: Datei beschädigt, starte leer');
    try {
      this.backupPending = isV1Config(raw);
      this.config = cleanKachelConfig(raw);
    } catch (error) {
      console.error('Kachelseiten nicht lesbar:', error.message);
      this.config = cleanKachelConfig(null); // leer starten
    }
  }

  get() { return this.config; }

  // Nach einer Änderung am gespeicherten Stand (z. B. Belegung beim Löschen einer Funktion entfernt, server/verwendung.js)
  async save() { await writeJsonAtomic(this.configPath, this.config); }

  // Eine gelöschte Kachel von allen Seiten nehmen (23.10.2026, vorher blieb „Kachel fehlt“ stehen); true = geändert
  async removeTile(type) {
    let changed = false;
    for (const p of this.config.pages) {
      p.cells = p.cells.map(c => { if (c === type) { changed = true; return ''; } return c; });
    }
    if (changed) await writeJsonAtomic(this.configPath, this.config);
    return changed;
  }

  // Taste der Tastenleiste einer Kachel (für das Auslösen -- die Zuordnung kommt nie vom Browser)
  findKey(pageId, type, keyId) {
    const page = this.config.pages.find(p => p.id === pageId);
    if (!page || !page.cells.includes(type)) return null;
    return page.settings?.[settingsKey(type)]?.keys?.find(k => k.id === keyId) || null;
  }

  async set(raw) {
    if (Array.isArray(raw?.pages) && raw.pages.length > MAX_PAGES) {
      throw new Error(`Es gibt höchstens ${MAX_PAGES} Kachelseiten.`);   // vorher still abgeschnitten
    }
    const zuViel = Array.isArray(raw?.pages) ? sichtbarFehler(raw.pages) : null;
    if (zuViel) throw new Error(zuViel);
    this.config = cleanKachelConfig(raw);
    if (this.backupPending) {
      // Alte Datei (Format 1) einmalig daneben sichern, bevor sie überschrieben wird -- nichts geht verloren
      const backup = path.join(path.dirname(this.configPath), 'kacheln_vor-umbau-2026-10.json');
      try { await fs.copyFile(this.configPath, backup, fs.constants?.COPYFILE_EXCL ?? 1); } catch { /* schon da oder fehlt */ }
      this.backupPending = false;
    }
    await writeJsonAtomic(this.configPath, this.config); // atomar + .bak (23.10.2026)
    return this.config;
  }
}
