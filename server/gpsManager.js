/**
 * GPS-Menü, Gerätespeicher (Umsetzungsplan Paket I2, Mockup Bild 3): GPS-Einstellungen je Arbeitsgerät,
 * unabhängig vom Profil. Eine Datei je Spiel: games/<id>/gps.json
 *
 *   { version: 1, autoLoad, beep, beepBack, current, live, devices: { [Name]: Einstellungen },
 *     einheiten: { [Gerätename im Spiel]: { map, cov, tb } }, gpsEinheit, teilbreiten }
 *
 * live    = die gerade benutzten Einstellungen; danach richten sich Karte und Vorgewende-Auslöser.
 * current = Name des geladenen Geräts (null = neu, noch nicht gespeichert).
 * Seit 24.10.2026 (Hendrik: „Änderungen sollten automatisch direkt gespeichert werden, sonst ist das verwirrend“)
 * schreibt jede Änderung live sofort auch in devices[current]; ein neues Gerät wird bei der ersten Änderung angelegt.
 * „Geändert – noch nicht gespeichert“ und die Frage „speichern oder verwerfen“ beim Gerätewechsel gibt es damit nicht mehr.
 *
 * Werte mit null heißen „automatisch“: sie kommen aus dem Spiel (Mod 0.5, s. gpsEngine.js autoValues()).
 * Ein neues Gerät startet mit Hauptschalter AUS (Hendrik 22.10.2026, gilt für alle Geräte).
 * Automatisch laden: Zuordnung über den Gerätenamen aus der Mod (match).
 *
 * Test 23.10.2026:
 * - Auslöser je Richtung (Anmerkung 20, Hendrik: „einfacher“): exitAct/exitBeep und entryAct/entryBeep -- je Ausfahrt
 *   und Einfahrt „Aktion ausführen“ und „Ton“. Ersetzt den Hauptschalter (armed) und beepWhen; alte Dateien werden beim
 *   Lesen umgerechnet.
 * - Optionen je ANGEHÄNGTEM Gerät (Anmerkungen 5, 13, 21): einheiten[Name im Spiel] = { map: „Auf der Karte zeigen“,
 *   cov: wann die Fläche als bearbeitet zählt } -- auch für Frontgewicht oder Anhänger, die nie GPS-Gerät werden.
 *   (Kurz waren das showOnMap/coverageWhen je GPS-Gerät; die ziehen beim Lesen hierher um.)
 * - gpsEinheit (Anmerkung 21): „Als GPS-Gerät verwenden“ -- solange dieses Gerät angehängt ist, rechnet das GPS mit ihm.
 * - Global (Einstellungen → Karte): beep = worüber der Ton kommt; beepBack merkt die Ausgabe für „Vorgewende-Ton an/aus“
 *   per Taste. (hinweise = Meldungen beim Fahrzeugwechsel gibt es seit 24.10.2026 nicht mehr, fällt beim Lesen weg.)
 *
 * 24.10.2026:
 * - einheiten[Name].tb = „Teilbreiten automatisch schalten“ (server/teilbreitenAutomatik.js); teilbreiten = gemeinsame
 *   Einstellungen der Automatik { schwelle, vorlauf, tasten } (TB_STANDARD, cleanTeilbreiten).
 * - cov 'auto' heißt in der Oberfläche „Automatisch“ und hängt vom Gerät ab (public/js/teilbreiten.js arbeitet/
 *   autoRegel): Geräte mit Ein/Aus zählen eingeschaltet (Spritzen schon dann, andere nur nicht angehoben), sonst gesenkt.
 */
import { readJsonFile, writeJsonAtomic } from './jsonStore.js';

export const BEEP_MODES = ['aus', 'tablet', 'armlehne', 'beide'];
// auto = je nach Gerät (s. oben, bis 23.10.2026: gesenkt ODER eingeschaltet); beides = gesenkt UND eingeschaltet
export const COVERAGE_WHEN = ['auto', 'gesenkt', 'an', 'beides'];
const SIDES = ['auto', 'front', 'rear'];
const ATTACH = ['auto', 'mounted', 'trailed'];
const OVERLAPS = [0, 25, 50, 75, 100];
// Diese Felder gehören zum Gerät und zählen für „geändert“
export const DEVICE_KEYS = ['side', 'attach', 'drawbar', 'pos', 'lat', 'width', 'headland', 'overlap',
  'exit', 'entry', 'exitAct', 'exitBeep', 'entryAct', 'entryBeep', 'exitOffset', 'entryOffset'];
// Felder, die das Bearbeiten-Fenster der Seite „GPS-Geräte“ ändern darf (zusätzlich Name und „Gehört zu“)
const EDIT_KEYS = ['side', 'attach', 'drawbar', 'pos', 'lat', 'width', 'headland', 'overlap'];

const round2 = (v) => Math.round(v * 100) / 100;
// Versatz der Auslösung (Hendrik 24.10.2026): 0,5-m-Schritte, −10 … +10 m; + = nach der Linie, − = schon davor
export const VERSATZ_MAX = 10;
export const cleanVersatz = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.min(VERSATZ_MAX, Math.max(-VERSATZ_MAX, Math.round(n * 2) / 2)) : 0; };
// null/undefined/'auto' = automatisch, sonst Zahl in den Grenzen
function autoNum(v, min, max) {
  if (v === null || v === undefined || v === 'auto') return null;
  const n = Number(v);
  return Number.isFinite(n) ? round2(Math.min(max, Math.max(min, n))) : null;
}

// Aktion eines Auslösers: wie eine Bedienpanel-Taste (Funktion inkl. 'macro:'/'hub:' oder Schnellbelegung)
export function cleanAction(a) {
  if (!a || typeof a !== 'object') return null;
  if (typeof a.functionId === 'string' && a.functionId) return { functionId: a.functionId.slice(0, 120), quickActions: null };
  if (Array.isArray(a.quickActions) && a.quickActions.length) return { functionId: null, quickActions: a.quickActions.slice(0, 8) };
  return null;
}

export function cleanSettings(raw, name) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const nm = String(name ?? r.name ?? 'Neues Gerät').trim().slice(0, 60) || 'Neues Gerät';
  const ov = Number(r.overlap);
  return {
    name: nm,
    match: typeof r.match === 'string' ? r.match.slice(0, 120) : nm,   // '' = keinem Gerät im Spiel zugeordnet
    side: SIDES.includes(r.side) ? r.side : 'auto',
    attach: ATTACH.includes(r.attach) ? r.attach : 'auto',
    // Grenzen seit 24.10.2026 (Hendrik): Deichsel bis 20 m, Seitenversatz ±40 m, Breite bis 50 m; Werte auf 0,01 m
    drawbar: autoNum(r.drawbar, 0.5, 20),     // Deichsel (nur angehängt)
    pos: autoNum(r.pos, 0, 30),               // Arbeitsbereich: Abstand zum Traktor
    lat: autoNum(r.lat, -40, 40),             // Seitenversatz, + = rechts (wie im Menü ← →)
    width: autoNum(r.width, 0.5, 50),         // Arbeitsbreite
    headland: Math.round(Math.min(45, Math.max(1, Number(r.headland) || 12))),
    overlap: OVERLAPS.includes(ov) ? ov : 50,
    exit: cleanAction(r.exit),                // Ausfahrt aus der Arbeitsfläche (ins Vorgewende)
    entry: cleanAction(r.entry),              // Einfahrt in die Arbeitsfläche
    // Je Richtung Aktion und Ton (Anmerkung 20). Neue Geräte: Aktionen aus, Ton an (Hendrik 22.10.: Hauptschalter aus).
    // Aus alten Dateien: armed → beide Aktionen, beepWhen → die Töne.
    exitAct: typeof r.exitAct === 'boolean' ? r.exitAct : r.armed === true,
    entryAct: typeof r.entryAct === 'boolean' ? r.entryAct : r.armed === true,
    exitBeep: typeof r.exitBeep === 'boolean' ? r.exitBeep : !['aus', 'einfahrt'].includes(r.beepWhen),
    entryBeep: typeof r.entryBeep === 'boolean' ? r.entryBeep : !['aus', 'ausfahrt'].includes(r.beepWhen),
    exitOffset: cleanVersatz(r.exitOffset),   // Ausfahrt: + = so viele Meter im Vorgewende, − = so viele davor
    entryOffset: cleanVersatz(r.entryOffset)  // Einfahrt: + = so viele Meter in der Arbeitsfläche, − = so viele davor
  };
}

// Optionen je angehängtem Gerät: nur Abweichungen vom Standard speichern. tb = Teilbreiten automatisch schalten
// (Hendrik 24.10.2026, server/teilbreitenAutomatik.js), Standard aus
function cleanEinheit(o) {
  const out = {};
  if (o?.map === false) out.map = false;
  if (COVERAGE_WHEN.includes(o?.cov) && o.cov !== 'auto') out.cov = o.cov;
  if (o?.tb === true) out.tb = true;
  return out;
}

// Teilbreiten-Automatik für alle Geräte: Spieltasten als Funktionen (Standard = Kennungen aus dem Import der
// inputBinding.xml), Schwelle zum Abschalten in %, Vorlauf in Sekunden
export const TB_STANDARD = {
  tasten: {
    linksAus: 'func-fs-variable-work-width-left', linksAn: 'func-fs-variable-work-width-left-minus',
    rechtsAus: 'func-fs-variable-work-width-right', rechtsAn: 'func-fs-variable-work-width-right-minus'
  },
  schwelle: 50,
  vorlauf: 0.8
};
export const TB_SCHWELLEN = [30, 50, 70, 90];
export function cleanTeilbreiten(t) {
  const tasten = {};
  for (const k of Object.keys(TB_STANDARD.tasten)) {
    const v = t?.tasten?.[k];
    tasten[k] = typeof v === 'string' && v ? v.slice(0, 120) : TB_STANDARD.tasten[k];
  }
  const s = Number(t?.schwelle), v = Number(t?.vorlauf);
  return {
    tasten,
    schwelle: TB_SCHWELLEN.includes(s) ? s : TB_STANDARD.schwelle,
    vorlauf: Number.isFinite(v) ? Math.min(2, Math.max(0, Math.round(v * 10) / 10)) : TB_STANDARD.vorlauf
  };
}

export function cleanGpsConfig(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const einheiten = {};
  // Umzug (23.10.2026): showOnMap/coverageWhen kurz je GPS-Gerät → je Gerätename im Spiel
  for (const d of [...Object.values(r.devices || {}), r.live].filter(Boolean)) {
    if (typeof d?.match !== 'string' || !d.match) continue;
    const o = cleanEinheit({ map: d.showOnMap, cov: d.coverageWhen });
    if (Object.keys(o).length) einheiten[d.match.slice(0, 120)] = o;
  }
  if (r.einheiten && typeof r.einheiten === 'object') {
    for (const [name, o] of Object.entries(r.einheiten).slice(0, 300)) {
      const c = cleanEinheit(o);
      if (Object.keys(c).length) einheiten[String(name).slice(0, 120)] = c; else delete einheiten[name];
    }
  }
  const devices = {};
  if (r.devices && typeof r.devices === 'object') {
    for (const [name, d] of Object.entries(r.devices).slice(0, 200)) {
      const c = cleanSettings(d, name);
      devices[c.name] = c;
    }
  }
  const current = typeof r.current === 'string' && devices[r.current] ? r.current : null;
  const live = cleanSettings(r.live || (current ? devices[current] : null), r.live?.name ?? current ?? undefined);
  return {
    version: 1,
    autoLoad: r.autoLoad !== false,
    beep: BEEP_MODES.includes(r.beep) ? r.beep : 'tablet',
    beepBack: BEEP_MODES.includes(r.beepBack) && r.beepBack !== 'aus' ? r.beepBack : 'tablet',
    // Vorgewendeautomatik (Hendrik 24.10.2026): gemeinsamer Schalter für alle Geräte; aus = keine Aktionen am Vorgewende
    // (der Ton folgt weiter seinen eigenen Schaltern)
    automatik: r.automatik !== false,
    current,
    live,
    devices,
    einheiten,
    gpsEinheit: typeof r.gpsEinheit === 'string' && r.gpsEinheit ? r.gpsEinheit.slice(0, 120) : null,
    teilbreiten: cleanTeilbreiten(r.teilbreiten)
  };
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export class GpsManager {
  constructor(configPath) {
    this.configPath = configPath;
    this.config = cleanGpsConfig(null);
  }

  async initialize() {
    // Lesen über jsonStore (23.10.2026): kaputte Datei als .defekt gesichert (notfalls .bak genommen)
    const { data, status } = await readJsonFile(this.configPath, { fallback: null });
    if (status === 'broken') console.error('GPS-Einstellungen nicht lesbar: Datei beschädigt, Standardwerte');
    try {
      this.config = cleanGpsConfig(data);
    } catch (error) {
      console.error('GPS-Einstellungen nicht lesbar:', error.message);
      this.config = cleanGpsConfig(null);
    }
    // Aus der Zeit vor dem automatischen Speichern: offene Änderungen am geladenen Gerät gelten als gespeichert
    if (this.config.current && this.isDirty()) await this.save();
  }

  async persist() {
    await writeJsonAtomic(this.configPath, this.config); // atomar + .bak (23.10.2026)
  }

  get live() { return this.config.live; }

  isDirty() {
    const c = this.config;
    if (!c.current) return true; // neu, noch nie gespeichert
    const saved = c.devices[c.current];
    return !saved || DEVICE_KEYS.some(k => !same(saved[k], c.live[k]));
  }

  // Für das Menü: alles außer den rohen Gerätedaten in Kurzform
  summary() {
    const c = this.config;
    return {
      autoLoad: c.autoLoad, beep: c.beep, automatik: c.automatik, current: c.current, live: c.live, dirty: this.isDirty(), wartet: this.wartet || null,
      einheiten: c.einheiten, gpsEinheit: c.gpsEinheit, teilbreiten: c.teilbreiten,
      devices: Object.values(c.devices).map(d => ({
        name: d.name, match: d.match, side: d.side, attach: d.attach, drawbar: d.drawbar, pos: d.pos, lat: d.lat, width: d.width,
        headland: d.headland, overlap: d.overlap, exitAct: d.exitAct, entryAct: d.entryAct, exitBeep: d.exitBeep, entryBeep: d.entryBeep
      })).sort((a, b) => a.name.localeCompare(b.name, 'de'))
    };
  }

  // Optionen je angehängtem Gerät für Karte und Fläche (Schlüssel = Gerätename im Spiel)
  mapOptions() { return this.config.einheiten; }

  // „Auf der Karte zeigen“ / „Fläche zählt als bearbeitet“ für ein angehängtes Gerät (Seite GPS-Geräte, GPS-Menü)
  async setEinheit(name, patch) {
    const n = String(name || '').trim().slice(0, 120);
    if (!n) throw new Error('Gerätename fehlt');
    const o = cleanEinheit({ ...(this.config.einheiten[n] || {}), ...(patch || {}) });
    if (Object.keys(o).length) this.config.einheiten[n] = o; else delete this.config.einheiten[n];
    await this.persist();
    return o;
  }

  // „Als GPS-Gerät verwenden“ (null = wieder automatisch wählen)
  async setGpsEinheit(name) {
    this.config.gpsEinheit = typeof name === 'string' && name.trim() ? name.trim().slice(0, 120) : null;
    await this.persist();
    return this.config.gpsEinheit;
  }

  // „+ Neues Gerät“ von Hand (Seite GPS-Geräte): Name, „Gehört zu“ (match, leer = nur von Hand laden), Handwerte
  async createDevice(data) {
    const d = data && typeof data === 'object' ? data : {};
    const name = this.freeName(String(d.name || 'Neues Gerät').trim() || 'Neues Gerät');
    const raw = { match: typeof d.match === 'string' ? d.match : '' };
    for (const k of EDIT_KEYS) if (k in d) raw[k] = d[k];
    this.config.devices[name] = cleanSettings(raw, name);
    await this.persist();
    return name;
  }

  // Gespeichertes Gerät bearbeiten (auch umbenennen und „Gehört zu“). Ist es das geladene Gerät, ändert sich auch live.
  async updateDevice(name, patch) {
    const c = this.config;
    const d = c.devices[name];
    if (!d) throw new Error(`Gerät „${name}“ nicht gefunden`);
    const p = patch && typeof patch === 'object' ? patch : {};
    let nm = name;
    if (typeof p.name === 'string' && p.name.trim() && p.name.trim() !== name) {
      if (c.devices[p.name.trim()]) throw new Error(`Es gibt schon ein Gerät „${p.name.trim()}“`);
      nm = p.name.trim().slice(0, 60);
    }
    const next = { ...d };
    for (const k of EDIT_KEYS) if (k in p) next[k] = p[k];
    if (typeof p.match === 'string') next.match = p.match.slice(0, 120);
    const clean = cleanSettings(next, nm);
    if (typeof p.match === 'string') clean.match = p.match.slice(0, 120);   // leer = keinem Gerät im Spiel zugeordnet
    delete c.devices[name];
    c.devices[nm] = clean;
    if (c.current === name) {
      c.current = nm;
      const live = { ...c.live };
      for (const k of EDIT_KEYS) if (k in p) live[k] = clean[k];
      c.live = { ...cleanSettings(live, nm), match: clean.match };
    }
    await this.persist();
    return nm;
  }

  async patchLive(patch) {
    const p = patch && typeof patch === 'object' ? patch : {};
    const next = { ...this.config.live };
    for (const k of DEVICE_KEYS) if (k in p) next[k] = p[k];
    // alte Schreibweise (bis 23.10.2026): Hauptschalter = beide Aktionen, beepWhen = die Töne
    if (typeof p.armed === 'boolean') { next.exitAct = p.armed; next.entryAct = p.armed; }
    if (typeof p.beepWhen === 'string') { next.exitBeep = !['aus', 'einfahrt'].includes(p.beepWhen); next.entryBeep = !['aus', 'ausfahrt'].includes(p.beepWhen); }
    this.config.live = cleanSettings(next, this.config.live.name);
    await this.save();   // automatisch speichern (24.10.2026); persist() steckt darin
    return this.config.live;
  }

  async setConfig(patch) {
    if (typeof patch?.autoLoad === 'boolean') this.config.autoLoad = patch.autoLoad;
    if (typeof patch?.automatik === 'boolean') this.config.automatik = patch.automatik;
    if (BEEP_MODES.includes(patch?.beep)) {
      this.config.beep = patch.beep;
      if (patch.beep !== 'aus') this.config.beepBack = patch.beep;
    }
    if (patch?.teilbreiten && typeof patch.teilbreiten === 'object') {
      const alt = this.config.teilbreiten;
      this.config.teilbreiten = cleanTeilbreiten({ ...alt, ...patch.teilbreiten, tasten: { ...alt.tasten, ...(patch.teilbreiten.tasten || {}) } });
    }
    await this.persist();
  }

  // Vorgewendeautomatik an/aus (ControlHub-Aktion hub:gps:automatik, Kartenkachel, GPS-Menü)
  async toggleAutomatik() {
    this.config.automatik = !this.config.automatik;
    await this.persist();
    return this.config.automatik;
  }

  // Armlehnen-Taste „Vorgewende-Ton an/aus“ (ControlHub-Aktion hub:gps:ton): aus bzw. zurück auf die letzte Ausgabe
  async toggleBeep() {
    const c = this.config;
    if (c.beep !== 'aus') { c.beepBack = c.beep; c.beep = 'aus'; } else c.beep = c.beepBack || 'tablet';
    await this.persist();
    return c.beep;
  }

  // Speichern: das geladene Gerät überschreiben, ein neues unter seinem Namen anlegen (seit 24.10.2026 bei jeder Änderung)
  async save() {
    const c = this.config;
    const name = c.current || this.freeName(c.live.name);
    c.live = cleanSettings(c.live, name);
    c.devices[name] = { ...c.live };
    c.current = name;
    await this.persist();
    return name;
  }

  // „Als neues Gerät speichern“
  async saveAs(name) {
    const c = this.config;
    const nm = this.freeName(String(name || c.live.name).trim() || 'Neues Gerät');
    c.live = cleanSettings({ ...c.live, match: c.live.match }, nm);
    c.devices[nm] = { ...c.live };
    c.current = nm;
    await this.persist();
    return nm;
  }

  async load(name) {
    const d = this.config.devices[name];
    if (!d) throw new Error(`Gerät „${name}“ nicht gefunden`);
    this.config.live = cleanSettings(d, name);
    this.config.current = name;
    this.wartet = null;   // von Hand geladen = bewusst gewählt
    await this.persist();
    return this.config.live;
  }

  async remove(name) {
    if (!this.config.devices[name]) throw new Error(`Gerät „${name}“ nicht gefunden`);
    if (name === this.config.current) throw new Error('Das geladene Gerät lässt sich nicht löschen');
    delete this.config.devices[name];
    await this.persist();
  }

  exportDevice(name) {
    const d = this.config.devices[name];
    if (!d) throw new Error(`Gerät „${name}“ nicht gefunden`);
    return { controlhubGpsDevice: 1, ...d };
  }

  async importDevice(data) {
    if (!data || typeof data !== 'object' || data.controlhubGpsDevice !== 1) throw new Error('Keine GPS-Gerätedatei von ControlHub');
    const name = this.freeName(String(data.name || 'Importiertes Gerät').trim());
    this.config.devices[name] = cleanSettings(data, name);
    await this.persist();
    return name;
  }

  freeName(base) {
    let name = String(base).slice(0, 60);
    for (let i = 2; this.config.devices[name]; i++) name = `${String(base).slice(0, 54)} (${i})`;
    return name;
  }

  /**
   * Ein anderes Gerät ist jetzt das GPS-Gerät (gpsEngine pickUnit()). Mit „automatisch laden“: passendes
   * gespeichertes Gerät laden, sonst ein neues (Hauptschalter aus) unter dem Namen aus dem Spiel beginnen.
   * Ungespeicherte Änderungen werden nicht überschrieben.
   * @returns {{loaded?: string, created?: string, skipped?: string}|null}
   */
  async onUnitChanged(unitName) {
    const c = this.config;
    if (unitName && c.live.match === unitName) this.wartet = null;   // wieder das geladene Gerät angehängt
    if (!unitName || !c.autoLoad || c.live.match === unitName) return null;
    // Ein automatisch begonnenes, noch unverändertes neues Gerät darf ersetzt werden, sonst nur ohne offene Änderungen
    const fresh = cleanSettings({ match: c.live.match }, c.live.name);
    const untouchedNew = !c.current && DEVICE_KEYS.every(k => same(c.live[k], fresh[k]));
    if (!untouchedNew && this.isDirty()) { this.wartet = unitName; return { skipped: unitName }; }
    return this.ladeFuer(unitName);
  }

  // Gespeichertes Gerät zu diesem Gerät im Spiel laden, sonst ein neues (Aktionen aus) unter dessen Namen beginnen
  async ladeFuer(unitName) {
    const c = this.config;
    this.wartet = null;
    const hit = Object.values(c.devices).find(d => d.match === unitName) || c.devices[unitName];
    if (hit) {
      await this.load(hit.name);
      return { loaded: hit.name };
    }
    c.live = cleanSettings({ match: unitName }, unitName);
    c.current = null;
    await this.persist();
    return { created: unitName };
  }

  /**
   * Test 23.10.2026 (Sämaschine nach Grubber): Ein angehängtes Gerät wurde nicht geladen, weil das geladene noch
   * ungespeicherte Änderungen hat (`wartet`). Das GPS-Menü fragt: speichern oder verwerfen, dann wechseln.
   * Vorher half Speichern allein nicht -- das alte Gerät blieb geladen, bis man ein anderes anhängte.
   */
  async wechsle(speichern) {
    const unitName = this.wartet;
    if (!unitName) throw new Error('Es wartet kein Gerät');
    if (speichern) await this.save();
    return this.ladeFuer(unitName);
  }
}
