/**
 * Bearbeitete Fläche (Test 23.10.2026, Anmerkung 8; Entscheidung Hendrik: je Spielstand und Fahrzeug, bis man sie löscht).
 *
 * Bis dahin zeichnete jedes Tablet die Fläche selbst als bis zu 40.000 einzelne Vierecke (dashboardMap.js) -- nach einer
 * Weile ruckelte die Karte, und nach dem Neuladen war alles weg. Jetzt rechnet ControlHub selbst mit, auch ohne Tablet:
 * - Raster aus Kästchen von 0,5 m, eingeteilt in Kacheln zu 128 × 128 Kästchen (64 m), je Kachel ein Bitfeld (2 KB).
 * - Je Spielstand eine Datei im Datenordner: games/<Spiel>/flaeche/<Spielstand>.json mit allen Fahrzeugen.
 * - Fahrzeug = feste Kennung aus der Mod 0.6 (hud#vid), sonst der Fahrzeugname.
 * - Die Tablets bekommen fertige Kacheln ('flaeche') und zeichnen sie als Bilder -- flüssig, egal wie viel bearbeitet ist.
 * Gezählt wird nur ein echter Arbeitsbereich (nicht der Auswurf hinter dem Mähdrescher, Anmerkung 6), und je Gerät nach
 * „Fläche zählt als bearbeitet“ und „Auf der Karte zeigen“ aus dem GPS-Menü (Anmerkungen 5 und 13).
 * Doppelt bearbeitet (Hendrik 23.10.2026: „noch einmal dunkler, nur in zwei Schritten“): ein zweites Bitfeld je Kachel.
 * Ein Kästchen zählt erst als doppelt, wenn es schon vor mindestens FRISCH_M Fahrt markiert wurde -- sonst würden die
 * Naht zwischen zwei Takten oder der zweite Balken einer Kombination (Kreiselegge + Sämaschine) schon dunkel.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { readJsonFile, writeJsonAtomic } from './jsonStore.js';
import '../public/js/teilbreiten.js';

export const ZELLE_M = 0.5;
export const KACHEL_Z = 128;
export const KACHEL_M = ZELLE_M * KACHEL_Z;
const BYTES = (KACHEL_Z * KACHEL_Z) / 8;
const MAX_KACHELN = 6000;              // Schutz: ~12 MB je Fahrzeug
const SPRUNG_M = 15;                   // größerer Sprung zwischen zwei Takten = kein Viereck (Umsetzen, Teleport)
const FRISCH_M = 12;                   // so viel Fahrt gehört noch zur selben Überfahrt (nicht doppelt)
const SPEICHERN_MS = 5000;
const SENDEN_MS = 50;                  // fast sofort (23.10.2026: mit 400 ms blieb hinter dem Balken kurz eine Lücke)

// Arbeitsbereiche, die nicht als bearbeitet zählen (Mod 0.6 schickt den Namen der Art); Liste in public/js/teilbreiten.js
export const KEINE_ARBEIT = globalThis.Teilbreiten.KEINE_ARBEIT;

// Wann ein Gerät arbeitet: public/js/teilbreiten.js (gemeinsam mit der Karte)
export const covWirksam = (u, opt) => globalThis.Teilbreiten.covWirksam(u, opt);

// Noch nicht auseinandergeklappt: arbeitet nicht und erscheint nicht auf der Karte (Hendrik 24.10.2026); wie
// public/js/dashboardMap.js unitFolded. Unbekannt (unfolded fehlt) gilt als ausgeklappt.
export const eingeklappt = u => u?.canFold === true && u?.unfolded === false;

export const unitArbeitet = (u, opt) => globalThis.Teilbreiten.arbeitet(u, opt);

function frame(d) {
  const fl = Math.hypot(d?.fwdX || 0, d?.fwdZ || 0);
  if (!(fl > 0.1) || !Number.isFinite(d?.posX) || !Number.isFinite(d?.posZ)) return null;
  return { x: d.posX, z: d.posZ, fx: d.fwdX / fl, fz: d.fwdZ / fl };
}
const relToWorld = (F, along, across) => [F.x + F.fx * along + F.fz * across, F.z + F.fz * along - F.fx * across];

// Arbeitsbereich eines Geräts ohne Auswurf/Krautablage, Flügel nebeneinander zusammen (public/js/teilbreiten.js)
export const hauptBereich = u => globalThis.Teilbreiten.arbeitsbereich(u);

/**
 * Arbeitsbalken, die gerade arbeiten, als zwei Endpunkte in Weltkoordinaten.
 * @returns {Array<{key: string, ends: number[][]}>}
 */
export function arbeitsBalken(d) {
  const F = frame(d);
  if (!F || d?.inVehicle === false) return [];
  const units = Array.isArray(d.units) ? d.units : [];
  const gps = d.gps || null;
  const opts = gps?.geraete || {};
  const out = [];
  for (const u of units) {
    if (opts[u.name]?.map === false || eingeklappt(u) || !unitArbeitet(u, opts[u.name])) continue;
    let key, ends, hand = false;
    // Balken von Hand nur, wenn wirklich Werte von Hand gesetzt sind -- sonst ist es die Rechnung ohne Arbeitsbereich aus
    // dem Spiel (z. B. alle Teilbreiten aus): die volle Breite zählte dann als bearbeitet (Durchsicht 24.10.2026)
    if (gps?.source === 'hand' && gps.manual !== false && gps.unit === u.name && Array.isArray(gps.corners) && gps.corners.length >= 2) {
      key = `gps|${u.name}`; ends = [gps.corners[0], gps.corners[1]]; hand = true;   // links, rechts (gpsEngine)
    } else {
      // Geräte mit Teilbreiten (Mod 0.7): Balken über alle (aktiven) Arbeitsbereiche, Flügel zusammen, ohne Auswurf
      const a = hauptBereich(u);
      if (!a) continue;
      // Enden im Rahmen des Geräts (gezogen: abgeknickt), nicht quer zum Traktor (Hendrik 24.10.2026)
      const L = globalThis.Teilbreiten.balkenLage(a.corners, globalThis.Teilbreiten.geraeteWinkel(u));
      key = `${u.name}|${u.side}|${u.depth}`; ends = L.ends.map(([al, q]) => relToWorld(F, al, q));
    }
    // Precision Farming (Mod 0.7.2): nur die PF-Teilbreiten, deren Düsen an sind -- je Teilbreite ein eigener Balken;
    // Balken von Hand mit Teilbreiten: nur der aktive Teil
    const teile = globalThis.Teilbreiten.arbeitsTeile(u, ends, hand);
    if (teile) { for (const t of teile) out.push({ key: `${key}|pf${t.nr}`, ends: t.ends }); continue; }
    out.push({ key, ends });
  }
  return out;
}

function inPoly(pts, x, z) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// Ein Fahrzeug: Kacheln „kx,kz“ → Bitfeld (einmal) und doppelt → Bitfeld (mehr als einmal); geänderte Kacheln in geaendert
export class FahrzeugFlaeche {
  constructor(name = '') {
    this.name = name; this.kacheln = new Map(); this.doppelt = new Map(); this.geaendert = new Set();
    this.weg = 0;               // gefahrene Meter (nur im Speicher)
    this.frisch = new Map();    // Kästchen → weg beim Markieren, solange es zur laufenden Überfahrt gehört
  }

  // Fahrt mitzählen und Kästchen, die mehr als FRISCH_M zurückliegen, aus der laufenden Überfahrt nehmen
  fahre(m) {
    this.weg += m;
    for (const [k, w] of this.frisch) { if (this.weg - w <= FRISCH_M) break; this.frisch.delete(k); }
  }

  // Viereck (Weltpunkte) ins Raster: alle Kästchen, deren Mitte darin liegt
  fuelle(poly) {
    const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
    const c0 = Math.floor(Math.min(...xs) / ZELLE_M), c1 = Math.floor(Math.max(...xs) / ZELLE_M);
    const r0 = Math.floor(Math.min(...zs) / ZELLE_M), r1 = Math.floor(Math.max(...zs) / ZELLE_M);
    if ((c1 - c0) * (r1 - r0) > 400000) return 0;    // unplausibel groß
    let n = 0;
    for (let r = r0; r <= r1; r++) {
      const z = (r + 0.5) * ZELLE_M;
      for (let c = c0; c <= c1; c++) {
        if (!inPoly(poly, (c + 0.5) * ZELLE_M, z)) continue;
        const kx = Math.floor(c / KACHEL_Z), kz = Math.floor(r / KACHEL_Z);
        const key = `${kx},${kz}`;
        let bits = this.kacheln.get(key);
        if (!bits) {
          if (this.kacheln.size >= MAX_KACHELN) continue;
          bits = new Uint8Array(BYTES);
          this.kacheln.set(key, bits);
        }
        const i = (r - kz * KACHEL_Z) * KACHEL_Z + (c - kx * KACHEL_Z);
        const byte = i >> 3, bit = 1 << (i & 7), zk = (r + 65536) * 131072 + (c + 65536);
        if (!(bits[byte] & bit)) { bits[byte] |= bit; n++; this.geaendert.add(key); this.frisch.set(zk, this.weg); continue; }
        if (this.frisch.has(zk)) continue;   // dieselbe Überfahrt
        let dop = this.doppelt.get(key);
        if (!dop) { dop = new Uint8Array(BYTES); this.doppelt.set(key, dop); }
        if (!(dop[byte] & bit)) { dop[byte] |= bit; n++; this.geaendert.add(key); }
      }
    }
    return n;
  }

  alsDaten(nurKeys = null, quelle = this.kacheln) {
    const tiles = {};
    for (const [k, bits] of quelle) if (!nurKeys || nurKeys.has(k)) tiles[k] = Buffer.from(bits).toString('base64');
    return tiles;
  }
  doppeltDaten(nurKeys = null) { return this.alsDaten(nurKeys, this.doppelt); }

  static ausDaten(raw) {
    const f = new FahrzeugFlaeche(typeof raw?.name === 'string' ? raw.name : '');
    for (const [ziel, quelle] of [[f.kacheln, raw?.tiles], [f.doppelt, raw?.doppelt]]) {
      for (const [k, b64] of Object.entries(quelle || {})) {
        if (!/^-?\d+,-?\d+$/.test(k) || typeof b64 !== 'string') continue;
        const buf = Buffer.from(b64, 'base64');
        if (buf.length === BYTES) ziel.set(k, new Uint8Array(buf));
      }
    }
    return f;
  }
}

const sicher = s => String(s).replace(/[^\w.-]+/g, '_').slice(0, 120) || 'spielstand';

export class Flaeche {
  /**
   * @param {object} deps { dir: () => string (Ordner flaeche/ des aktiven Spiels), emit: (event, payload) => void }
   */
  constructor(deps) {
    this.deps = deps;
    this.spielstand = null;       // Kennung des Spielstands (plannerStore.savegameKey)
    this.fahrzeuge = new Map();   // Fahrzeug-Schlüssel → FahrzeugFlaeche
    this.aktuell = null;          // Schlüssel des Fahrzeugs, in dem man sitzt
    this.vorher = new Map();      // Balken-Schlüssel → Endpunkte im letzten Takt
    this.letztePos = null;        // Fahrzeugposition im letzten Takt (gefahrene Meter für „doppelt“)
    this.dirty = false;
    this.ladeVersprechen = null;
    this.speicherTimer = null;
    this.sendeTimer = null;
  }

  datei() { return this.spielstand ? path.join(this.deps.dir(), `${sicher(this.spielstand)}.json`) : null; }

  async setzeSpielstand(key) {
    const k = key || 'unbekannt';
    if (k === this.spielstand) return;
    await this.speichern();
    this.spielstand = k;
    this.fahrzeuge.clear();
    this.vorher.clear();
    const file = this.datei();
    this.ladeVersprechen = readJsonFile(file, { fallback: null }).then(({ data }) => {
      for (const [vk, raw] of Object.entries(data?.vehicles || {})) this.fahrzeuge.set(vk, FahrzeugFlaeche.ausDaten(raw));
    }).catch(() => {});
    await this.ladeVersprechen;
    this.sendeVoll();
  }

  // Spielwechsel: anderer Ordner, Spielstand neu bestimmen
  async zuruecksetzen() {
    await this.speichern();
    this.spielstand = null; this.fahrzeuge.clear(); this.vorher.clear(); this.aktuell = null;
  }

  fahrzeugSchluessel(d) {
    if (d?.vehicleId) return d.vehicleId;
    return d?.vehicleName ? `name:${d.vehicleName}` : null;
  }

  tick(d) {
    if (!d || d.available === false || !this.spielstand) return;
    const vk = d.inVehicle ? this.fahrzeugSchluessel(d) : null;
    if (vk !== this.aktuell) { this.aktuell = vk; this.vorher.clear(); this.letztePos = null; this.sendeVoll(); }
    if (!vk) return;
    let f = this.fahrzeuge.get(vk);
    const pos = Number.isFinite(d.posX) && Number.isFinite(d.posZ) ? [d.posX, d.posZ] : null;
    if (f && pos && this.letztePos) { const m = Math.hypot(pos[0] - this.letztePos[0], pos[1] - this.letztePos[1]); if (m < SPRUNG_M) f.fahre(m); }
    this.letztePos = pos;
    const balken = arbeitsBalken(d);
    const jetzt = new Map(balken.map(b => [b.key, b.ends]));
    for (const [key, ends] of jetzt) {
      const prev = this.vorher.get(key);
      if (prev && Math.hypot(prev[0][0] - ends[0][0], prev[0][1] - ends[0][1]) < SPRUNG_M) {
        if (!f) { f = new FahrzeugFlaeche(d.vehicleName || ''); this.fahrzeuge.set(vk, f); }
        if (f.fuelle([prev[0], prev[1], ends[1], ends[0]]) > 0) this.dirty = true;
      }
    }
    this.vorher = jetzt;
    if (f?.geaendert.size) this.sendeBald();
    if (this.dirty) this.speichernBald();
  }

  // Ist dieser Punkt beim aktuellen Fahrzeug schon bearbeitet? Kästchen der laufenden Überfahrt zählen nicht -- die eigene
  // Spur direkt hinter dem Balken soll die Teilbreiten-Automatik nicht auslösen (server/teilbreitenAutomatik.js)
  istBearbeitet(x, z) {
    const f = this.aktuell ? this.fahrzeuge.get(this.aktuell) : null;
    if (!f) return false;
    const c = Math.floor(x / ZELLE_M), r = Math.floor(z / ZELLE_M);
    const kx = Math.floor(c / KACHEL_Z), kz = Math.floor(r / KACHEL_Z);
    const bits = f.kacheln.get(`${kx},${kz}`);
    if (!bits) return false;
    const i = (r - kz * KACHEL_Z) * KACHEL_Z + (c - kx * KACHEL_Z);
    if (!(bits[i >> 3] & (1 << (i & 7)))) return false;
    return !f.frisch.has((r + 65536) * 131072 + (c + 65536));
  }

  // ---------- an die Tablets ----------
  stand(nurAenderungen) {
    const f = this.aktuell ? this.fahrzeuge.get(this.aktuell) : null;
    const keys = nurAenderungen && f ? new Set(f.geaendert) : null;
    if (f && nurAenderungen) f.geaendert.clear();
    return { fahrzeug: this.aktuell, zelleM: ZELLE_M, kachelZ: KACHEL_Z, voll: !nurAenderungen, tiles: f ? f.alsDaten(keys) : {}, doppelt: f ? f.doppeltDaten(keys) : {} };
  }
  sendeVoll() { clearTimeout(this.sendeTimer); this.sendeTimer = null; this.deps.emit('flaeche', this.stand(false)); }
  sendeBald() {
    if (this.sendeTimer) return;
    this.sendeTimer = setTimeout(() => { this.sendeTimer = null; this.deps.emit('flaeche', this.stand(true)); }, SENDEN_MS);
  }

  // ---------- löschen ----------
  async loesche(alle) {
    if (alle) this.fahrzeuge.clear(); else if (this.aktuell) this.fahrzeuge.delete(this.aktuell);
    this.vorher.clear();
    this.dirty = true;
    await this.speichern();
    this.sendeVoll();
  }

  // ---------- speichern ----------
  speichernBald() {
    if (this.speicherTimer) return;
    this.speicherTimer = setTimeout(() => { this.speicherTimer = null; this.speichern().catch(e => console.warn('Fläche speichern:', e.message)); }, SPEICHERN_MS);
  }
  async speichern() {
    clearTimeout(this.speicherTimer); this.speicherTimer = null;
    if (!this.dirty || !this.datei()) return;
    this.dirty = false;
    const vehicles = {};
    for (const [vk, f] of this.fahrzeuge) if (f.kacheln.size) vehicles[vk] = { name: f.name, tiles: f.alsDaten(), doppelt: f.doppeltDaten() };
    await fs.mkdir(this.deps.dir(), { recursive: true });
    await writeJsonAtomic(this.datei(), { version: 1, spielstand: this.spielstand, zelleM: ZELLE_M, kachelZ: KACHEL_Z, vehicles });
  }
}
