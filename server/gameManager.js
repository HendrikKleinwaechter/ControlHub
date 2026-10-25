/**
 * Spiele (Phase 2 Umbauplan, 21.10.2026).
 *
 * Eine Installation, mehrere Spiele: jedes Spiel hat einen eigenen Datenordner
 * server/config/games/<id>/ mit Profilen, Funktionen, Makros, Bedienpanel-Seiten, Auto-Profilwechsel
 * und Ebenentastern. Zwischen Spielen wird nichts übernommen. Für alle Spiele gemeinsam bleiben in
 * server/config/: USB-Port, Kalibrierung, Tastenlage auf den Modulen, Widgets (Hendriks Entscheidung).
 *
 * Eingebaute Spiele stehen in BUILTIN_GAMES (mit Telemetrie-Quelle und Fähigkeiten), eigene Spiele
 * legt der Nutzer selbst an (ohne Telemetrie) -- sie stehen in app.json unter games.custom.
 * Diese Klasse kennt nur Ordner und Dateien; das Laden der Manager macht index.js (switchGame()).
 */

import { promises as fs } from 'fs';
import path from 'path';
import { readJsonFile, writeJsonAtomic } from './jsonStore.js';

// Fähigkeiten steuern, welche Seiten/Funktionen die Oberfläche zeigt (GET /api/games -> features)
export const BUILTIN_GAMES = [
  {
    id: 'fs25',
    name: 'Farming Simulator 25',
    telemetry: 'fs25',
    features: ['telemetry', 'map', 'precisionFarming', 'weather', 'inputBindingImport', 'vehicleNames', 'planner']
  }
];

// Dateien, die zum Spiel gehören (alles andere in server/config/ gilt für alle Spiele)
export const GAME_FILES = [
  'profiles.json', 'functions.json', 'categories.json', 'macros.json',
  'steuerungsmenues.json', 'autoSwitch.json', 'craftSlotLayers.json', 'kacheln.json', 'gps.json', 'planer.json'
];
// Belegung je Controller (Geräteprofile G2, 23.10.2026, Hendrik: „jeder Controller braucht eine eigene Belegung“):
// diese Dateien liegen je Spiel UND Controller in games/<spiel>/controller/<controller>/, alles andere je Spiel.
export const CONTROLLER_FILES = ['profiles.json', 'autoSwitch.json', 'craftSlotLayers.json'];
export const SPIEL_FILES = GAME_FILES.filter(f => !CONTROLLER_FILES.includes(f));
const CONTROLLER_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

// Bilder der Bedienpanel-Seiten liegen seit Phase 2 je Spiel in einem Unterordner
// (vorher direkt im Ordner, nach Seiten-ID benannt -- zwei Spiele hätten sich gegenseitig überschrieben)
export const IMAGE_DIRS = { '/steuerungsmenue-bg/': 'steuerungsmenue-bg', '/steuerungsmenue-graphics/': 'steuerungsmenue-graphics' };

const BUNDLE_TYPE = 'controlhub-game';
const BUNDLE_VERSION = 2;   // 2 seit 23.10.2026: Belegungen je Controller (controllers: {id: {datei: inhalt}})

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

export class GameManager {
  /**
   * @param {string} configDir  server/config
   * @param {string} assetsDir  server/assets
   * @param {object} settings   app.json-Inhalt (wird hier gelesen/geändert)
   * @param {Function} saveSettings  speichert app.json
   */
  constructor(configDir, assetsDir, settings, saveSettings) {
    this.configDir = configDir;
    this.assetsDir = assetsDir;
    this.settings = settings;
    this.saveSettings = saveSettings;
  }

  get gamesDir() { return path.join(this.configDir, 'games'); }
  gameDir(id) { return path.join(this.gamesDir, id); }
  controllerDir(gameId, controllerId) {
    if (!CONTROLLER_ID_RE.test(String(controllerId))) throw new Error('Ungültige Controller-Kennung');
    return path.join(this.gameDir(gameId), 'controller', controllerId);
  }

  // Controller, für die es in diesem Spiel schon eine Belegung gibt
  async controllersWithData(gameId) {
    try {
      const entries = await fs.readdir(path.join(this.gameDir(gameId), 'controller'), { withFileTypes: true });
      return entries.filter(e => e.isDirectory() && CONTROLLER_ID_RE.test(e.name)).map(e => e.name);
    } catch { return []; }
  }

  /**
   * Einmaliger Umzug (Geräteprofile G2, 23.10.2026): Profile, Auto-Wechsel und Ebenentaster lagen bisher direkt im
   * Spielordner und gehören jetzt der CraftConsole (für die sie gemacht wurden) -> games/<spiel>/controller/craftconsole/.
   * Vorher wird der alte Stand nach server/config/_sicherung/<Zeit>-vor-controller-<spiel>/ kopiert. Gelöscht wird nichts.
   * @returns {Array<{game: string, moved: string[], backupDir: string}>}
   */
  async migrateControllers() {
    const done = [];
    let games = [];
    try { games = (await fs.readdir(this.gamesDir, { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name); } catch { return done; }
    for (const gameId of games) {
      const dir = this.gameDir(gameId);
      const target = path.join(dir, 'controller', 'craftconsole');
      const old = [];
      for (const f of CONTROLLER_FILES) if (await exists(path.join(dir, f))) old.push(f);
      if (!old.length || await exists(target)) continue;
      const backupDir = path.join(this.configDir, '_sicherung', `${stamp()}-vor-controller-${gameId}`);
      await fs.mkdir(backupDir, { recursive: true });
      for (const f of old) await fs.copyFile(path.join(dir, f), path.join(backupDir, f));
      await fs.mkdir(target, { recursive: true });
      for (const f of old) {
        await fs.rename(path.join(dir, f), path.join(target, f));
        if (await exists(path.join(dir, f + '.bak'))) await fs.rename(path.join(dir, f + '.bak'), path.join(target, f + '.bak'));
      }
      done.push({ game: gameId, moved: old, backupDir });
    }
    return done;
  }

  /**
   * Belegung eines anderen Controllers übernehmen („Profile von … übernehmen“): kopiert Profile, Auto-Wechsel und
   * Ebenentaster von `fromId` nach `toId` (im selben Spiel). Der bisherige Stand von `toId` geht vorher nach _sicherung/.
   */
  async copyControllerData(gameId, fromId, toId) {
    if (fromId === toId) throw new Error('Quelle und Ziel sind derselbe Controller');
    const from = this.controllerDir(gameId, fromId);
    const to = this.controllerDir(gameId, toId);
    if (!(await exists(path.join(from, 'profiles.json')))) throw new Error('Für diesen Controller gibt es in diesem Spiel noch keine Profile');
    if (await exists(to)) {
      const backupDir = path.join(this.configDir, '_sicherung', `${stamp()}-vor-uebernehmen-${gameId}-${toId}`);
      await fs.mkdir(backupDir, { recursive: true });
      for (const f of CONTROLLER_FILES) if (await exists(path.join(to, f))) await fs.copyFile(path.join(to, f), path.join(backupDir, f));
    }
    await fs.mkdir(to, { recursive: true });
    for (const f of CONTROLLER_FILES) {
      const { data, status } = await readJsonFile(path.join(from, f), { fallback: null });
      if (data && (status === 'ok' || status === 'restored')) await writeJsonAtomic(path.join(to, f), data);
    }
  }

  get customGames() {
    if (!this.settings.games) this.settings.games = {};
    if (!Array.isArray(this.settings.games.custom)) this.settings.games.custom = [];
    return this.settings.games.custom;
  }

  list() {
    return [
      ...BUILTIN_GAMES.map(g => ({ ...g, custom: false })),
      ...this.customGames.map(g => ({ id: g.id, name: g.name, telemetry: null, features: [], custom: true }))
    ];
  }

  get(id) { return this.list().find(g => g.id === id) || null; }

  get activeId() {
    const id = this.settings.games?.active;
    return this.get(id) ? id : BUILTIN_GAMES[0].id;
  }

  // false, solange beim allerersten Start noch kein Spiel ausgewählt wurde (Abfrage in der Oberfläche)
  get chosen() { return this.settings.games?.chosen === true; }

  // Bestehende Installation ohne gewähltes Spiel (s. einrichtung.js): das aktive Spiel gilt als gewählt, sonst käme
  // nach dem Update die Frage „Welches Spiel spielst du?“. Speichert nicht selbst.
  markChosen() {
    this.customGames; // stellt settings.games sicher
    if (!this.settings.games.active) this.settings.games.active = this.activeId;
    this.settings.games.chosen = true;
  }

  async setActive(id, { choose = true } = {}) {
    if (!this.get(id)) throw new Error('Unbekanntes Spiel: ' + id);
    this.customGames; // stellt settings.games sicher
    this.settings.games.active = id;
    if (choose) this.settings.games.chosen = true;
    await fs.mkdir(this.gameDir(id), { recursive: true });
    await this.saveSettings();
  }

  /**
   * Einmaliger Umzug beim ersten Start mit Phase 2: Gibt es noch keinen games/-Ordner, aber alte
   * Spieldateien direkt in server/config/, dann (1) server/config/ komplett nach
   * server/config/_sicherung/<Zeit>-vor-mehrspiel/ kopieren, (2) die Spieldateien nach games/fs25/
   * verschieben. Bestehende Nutzer landen so ohne Rückfrage in FS25 (chosen = true).
   * Frische Installation (keine alten Dateien): nur Ordner anlegen, chosen bleibt false.
   * @returns {{migrated: boolean, backupDir?: string, moved?: string[]}}
   */
  async migrate() {
    if (await exists(this.gamesDir)) return { migrated: false };
    const old = [];
    for (const f of GAME_FILES) if (await exists(path.join(this.configDir, f))) old.push(f);
    const target = this.gameDir(BUILTIN_GAMES[0].id);
    if (old.length === 0) {
      await fs.mkdir(target, { recursive: true });
      return { migrated: false };
    }
    const backupDir = path.join(this.configDir, '_sicherung', `${stamp()}-vor-mehrspiel`);
    await fs.mkdir(backupDir, { recursive: true });
    for (const entry of await fs.readdir(this.configDir, { withFileTypes: true })) {
      if (entry.isFile()) await fs.copyFile(path.join(this.configDir, entry.name), path.join(backupDir, entry.name));
    }
    await fs.mkdir(target, { recursive: true });
    for (const f of old) await fs.rename(path.join(this.configDir, f), path.join(target, f));
    this.customGames;
    this.settings.games.active = BUILTIN_GAMES[0].id;
    this.settings.games.chosen = true;
    await this.saveSettings();
    return { migrated: true, backupDir, moved: old };
  }

  async addCustom(name) {
    const clean = String(name || '').trim().slice(0, 60);
    if (!clean) throw new Error('Bitte einen Namen angeben');
    if (this.list().some(g => g.name.toLowerCase() === clean.toLowerCase())) throw new Error('Ein Spiel mit diesem Namen gibt es schon');
    const slug = clean.toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'spiel';
    let id = `eigen-${slug}`;
    for (let i = 2; this.get(id) || await exists(this.gameDir(id)); i++) id = `eigen-${slug}-${i}`;
    this.customGames.push({ id, name: clean });
    await fs.mkdir(this.gameDir(id), { recursive: true });
    await this.saveSettings();
    return this.get(id);
  }

  async renameCustom(id, name) {
    const g = this.customGames.find(x => x.id === id);
    if (!g) throw new Error('Nur eigene Spiele lassen sich umbenennen');
    const clean = String(name || '').trim().slice(0, 60);
    if (!clean) throw new Error('Bitte einen Namen angeben');
    if (this.list().some(x => x.id !== id && x.name.toLowerCase() === clean.toLowerCase())) throw new Error('Ein Spiel mit diesem Namen gibt es schon');
    g.name = clean;
    await this.saveSettings();
    return this.get(id);
  }

  /**
   * Eigenes Spiel entfernen. Gelöscht wird nichts: der Ordner wandert nach
   * server/config/_geloescht/<id>-<Zeit>/ (Hendriks Regel: nichts endgültig löschen).
   */
  async removeCustom(id) {
    if (id === this.activeId) throw new Error('Das aktive Spiel kann nicht entfernt werden -- erst ein anderes Spiel wählen');
    const idx = this.customGames.findIndex(x => x.id === id);
    if (idx < 0) throw new Error('Nur eigene Spiele lassen sich entfernen');
    if (await exists(this.gameDir(id))) {
      const dest = path.join(this.configDir, '_geloescht', `${id}-${stamp()}`);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.rename(this.gameDir(id), dest);
    }
    this.customGames.splice(idx, 1);
    await this.saveSettings();
  }

  // Alle Bilder, auf die die Bedienpanel-Seiten eines Spiels verweisen (Web-Pfade)
  static imagesOf(steuerungsmenues) {
    const urls = new Set();
    for (const page of Object.values(steuerungsmenues?.pages || {})) {
      if (typeof page.background === 'string') urls.add(page.background);
      for (const g of page.graphics || []) if (typeof g.src === 'string') urls.add(g.src);
    }
    return [...urls].filter(u => Object.keys(IMAGE_DIRS).some(prefix => u.startsWith(prefix)));
  }

  webPathToFile(url) {
    const prefix = Object.keys(IMAGE_DIRS).find(p => url.startsWith(p));
    if (!prefix) return null;
    const rel = url.slice(prefix.length);
    if (rel.includes('..')) return null;
    return path.join(this.assetsDir, IMAGE_DIRS[prefix], ...rel.split('/'));
  }

  /**
   * Ganzes Spiel als eine Datei: alle Spieldateien + die Bilder der Bedienpanel-Seiten (base64).
   * Vorher müssen die Manager des aktiven Spiels gespeichert haben (tun sie bei jeder Änderung).
   */
  async exportGame(id) {
    const game = this.get(id);
    if (!game) throw new Error('Unbekanntes Spiel: ' + id);
    const read = async (file) => {
      // über jsonStore (23.10.2026): wartet auf laufendes Speichern; kaputte Datei -> .defekt, notfalls .bak
      try {
        const { data, status } = await readJsonFile(file);
        return status === 'ok' || status === 'restored' ? data : undefined;
      } catch { return undefined; /* nicht lesbar -- fehlt in der Sicherung wie bisher */ }
    };
    const files = {};
    for (const f of SPIEL_FILES) {
      const data = await read(path.join(this.gameDir(id), f));
      if (data !== undefined) files[f] = data;
    }
    // Belegungen je Controller (Bundle-Version 2)
    const controllers = {};
    for (const ctrl of await this.controllersWithData(id)) {
      const c = {};
      for (const f of CONTROLLER_FILES) {
        const data = await read(path.join(this.controllerDir(id, ctrl), f));
        if (data !== undefined) c[f] = data;
      }
      if (Object.keys(c).length) controllers[ctrl] = c;
    }
    const images = {};
    for (const url of GameManager.imagesOf(files['steuerungsmenues.json'])) {
      const file = this.webPathToFile(url);
      try { if (file) images[url] = (await fs.readFile(file)).toString('base64'); } catch { /* Bild fehlt */ }
    }
    return {
      type: BUNDLE_TYPE, version: BUNDLE_VERSION, exportedAt: new Date().toISOString(),
      game: { id: game.id, name: game.name, custom: game.custom }, files, controllers, images
    };
  }

  /**
   * Gesichertes Spiel zurückspielen.
   * mode 'replace': Dateien von targetId ersetzen (alter Stand vorher nach _sicherung/ kopiert).
   * mode 'new':     als neues eigenes Spiel mit name anlegen.
   * Bilder werden in den Bild-Unterordner des Zielspiels geschrieben und die Verweise darauf umgestellt.
   * @returns {object} Zielspiel
   */
  async importGame(bundle, { mode, targetId, name }) {
    if (bundle?.type !== BUNDLE_TYPE || !bundle.files || typeof bundle.files !== 'object' || Array.isArray(bundle.files)) throw new Error('Keine ControlHub-Spielsicherung');
    if (bundle.version > BUNDLE_VERSION) throw new Error('Die Sicherung stammt aus einer neueren ControlHub-Version');
    // Erst alles prüfen, dann schreiben (23.10.2026): vorher brach ein fehlerhaftes Bild mitten im Schreiben ab und
    // hinterließ ein halb wiederhergestelltes Spiel
    for (const [f, v] of Object.entries(bundle.files)) {
      if (!GAME_FILES.includes(f)) continue;
      if (v !== undefined && (v === null || typeof v !== 'object')) throw new Error(`Sicherung beschädigt: ${f}`);
    }
    // Belegungen je Controller: Version 2 bringt sie mit; Version 1 hatte Profile & Co. direkt im Spiel -- die gehören
    // der CraftConsole (für die sie gemacht wurden)
    const controllers = {};
    if (bundle.controllers != null) {
      if (typeof bundle.controllers !== 'object' || Array.isArray(bundle.controllers)) throw new Error('Sicherung beschädigt: Controller');
      for (const [ctrl, c] of Object.entries(bundle.controllers)) {
        if (!CONTROLLER_ID_RE.test(ctrl) || !c || typeof c !== 'object' || Array.isArray(c)) throw new Error('Sicherung beschädigt: Controller');
        for (const [f, v] of Object.entries(c)) {
          if (!CONTROLLER_FILES.includes(f)) continue;
          if (v === null || typeof v !== 'object') throw new Error(`Sicherung beschädigt: ${ctrl}/${f}`);
        }
        controllers[ctrl] = c;
      }
    }
    const altCC = {};
    for (const f of CONTROLLER_FILES) if (bundle.files[f] !== undefined) altCC[f] = bundle.files[f];
    if (Object.keys(altCC).length && !controllers.craftconsole) controllers.craftconsole = altCC;
    if (bundle.images != null && (typeof bundle.images !== 'object' || Array.isArray(bundle.images))) throw new Error('Sicherung beschädigt: Bilder');
    for (const [url, b64] of Object.entries(bundle.images || {})) {
      if (typeof url !== 'string' || typeof b64 !== 'string') throw new Error('Sicherung beschädigt: Bild');
    }
    let target;
    if (mode === 'new') {
      target = await this.addCustom(name || `${bundle.game?.name || 'Spiel'} (wiederhergestellt)`);
    } else if (mode === 'replace') {
      target = this.get(targetId);
      if (!target) throw new Error('Unbekanntes Zielspiel');
      const backupDir = path.join(this.configDir, '_sicherung', `${stamp()}-vor-wiederherstellen-${target.id}`);
      await fs.mkdir(backupDir, { recursive: true });
      for (const f of GAME_FILES) {
        if (await exists(path.join(this.gameDir(target.id), f))) await fs.copyFile(path.join(this.gameDir(target.id), f), path.join(backupDir, f));
      }
      for (const ctrl of await this.controllersWithData(target.id)) {
        await fs.mkdir(path.join(backupDir, 'controller', ctrl), { recursive: true });
        for (const f of CONTROLLER_FILES) {
          const src = path.join(this.controllerDir(target.id, ctrl), f);
          if (await exists(src)) await fs.copyFile(src, path.join(backupDir, 'controller', ctrl, f));
        }
      }
    } else {
      throw new Error('Unbekannter Modus');
    }
    const dir = this.gameDir(target.id);
    await fs.mkdir(dir, { recursive: true });

    // Bilder: in den Ordner des Zielspiels, Verweise in den Bedienpanel-Seiten umschreiben
    const remap = {};
    for (const [url, b64] of Object.entries(bundle.images || {})) {
      const prefix = Object.keys(IMAGE_DIRS).find(p => url.startsWith(p));
      const base = path.basename(url);
      if (!prefix || !/^[\w-][\w.-]*\.(png|jpe?g|webp|gif|svg)$/i.test(base)) continue;
      const newUrl = `${prefix}${target.id}/${base}`;
      const file = this.webPathToFile(newUrl);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, Buffer.from(b64, 'base64'));
      remap[url] = newUrl;
    }
    const sm = bundle.files['steuerungsmenues.json'];
    for (const page of Object.values(sm?.pages || {})) {
      if (remap[page.background]) page.background = remap[page.background];
      for (const g of page.graphics || []) if (remap[g.src]) g.src = remap[g.src];
    }

    for (const f of SPIEL_FILES) {
      const target_ = path.join(dir, f);
      if (bundle.files[f] !== undefined) await writeJsonAtomic(target_, bundle.files[f]); // atomar + .bak (23.10.2026)
      else if (mode === 'replace' && await exists(target_)) await fs.rm(target_); // Stand der Sicherung herstellen (alt liegt in _sicherung/)
    }
    // Belegungen je Controller; Controller, die nicht in der Sicherung stehen, bleiben unverändert
    for (const [ctrl, c] of Object.entries(controllers)) {
      const cdir = this.controllerDir(target.id, ctrl);
      await fs.mkdir(cdir, { recursive: true });
      for (const f of CONTROLLER_FILES) {
        const target_ = path.join(cdir, f);
        if (c[f] !== undefined) await writeJsonAtomic(target_, c[f]);
        else if (mode === 'replace' && await exists(target_)) await fs.rm(target_);
      }
    }
    return target;
  }
}
