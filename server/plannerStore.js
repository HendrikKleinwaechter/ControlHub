/**
 * Arbeitsplaner: Feldkomplexe, Fruchtfolge, Bodenbearbeitung (Umsetzungsplan Paket E2, Mockup Bild 4).
 * Eine Datei je Spiel: games/<id>/planer.json -- darin Planer-Sätze, je Spielstand einer (Hendrik 22.10.2026:
 * ein Einzel- und ein Mehrspieler-Spielstand auf derselben Karte dürfen nicht durcheinanderkommen).
 *
 *   { version: 1, current, sets: { [id]: Satz }, bySavegame: { [Kennung]: id } }
 *   Satz = { id, name, fruchtfolge: { rotation: [Frucht…], plaene: { [Frucht]: Plan } },     EINE Fruchtfolge (24.10.2026)
 *            complexes: { [cid]: { name, now } }, complexOrder: [cid],   now = Stelle in der Fruchtfolge dieses Jahr, null = außerhalb
 *            complexOf: { [Feld]: cid }, soil: { [Feld]: 'grubber'|'pflug'|'keine' },
 *            vonHand: { [Feld]: [{ s: Schritt, ok }] },                          Anmerkung 24 (24.10.2026)
 *            verlauf: { [Feld]: { frucht, offen: [Arbeit], ok: [Schritt-Id] } },
 *            fruechte: [{ key, title }] }                                       Früchte des Spiels (Mod 0.7.4, 24.10.2026)
 *   Früchte stehen überall (rotation, plaene, verlauf.frucht, Schritt-Ids „Frucht|…“) mit ihrem INTERNEN Namen (WHEAT …),
 *   s. public/js/plannerLogic.js fruchtKey. Ältere Sätze mit Anzeigenamen („Weizen“) werden beim Lesen umgestellt.
 *   Plan = { vor: [Schritt], saat: 'sow'|'direktsaat', pflege: [Schritt], ernte: bool (false = Zwischenfrucht), nach: [Schritt] }
 *   Schritt = { k: Schlüssel aus PlannerLogic.SCHRITTE } oder { n: eigener Name }. verlauf: letzte Frucht des Felds und
 *   die seither im Spiel offen gemeldeten Arbeiten (führt der Server, merkeFelder), abgehakte Schritte (das Tablet).
 *
 * Kennung des Spielstands aus der Mod (0.5, craftConsoleMap.xml): Einzelspieler = Karte + Spielstand-Nummer,
 * eindeutig → automatisch zuordnen (unbekannt = neuen Satz anlegen). Mehrspieler: als Gast ist die Nummer nicht
 * sicher → ControlHub fragt einmal, welcher Satz gilt (pending), und merkt sich die Antwort.
 */
import { readJsonFile, writeJsonAtomic } from './jsonStore.js';
import '../public/js/plannerLogic.js';

const SOILS = ['grubber', 'pflug', 'keine'];
const TASK_KEYS = ['harvest', 'mulch', 'cultivate', 'plow', 'stones', 'roll', 'sow', 'fertilize', 'lime', 'weeds'];
const str = (v, n = 60) => String(v ?? '').trim().slice(0, n);
const newId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

const fruchtListe = l => (Array.isArray(l) ? l : []).map(x => str(x, 40)).filter(Boolean).slice(0, 12);
// Früchte des Spiels: interner Name nur harmlose Zeichen (landet in onclick-Attributen, s. KOMPLEX_ID)
const FRUCHT_KEY = /^[A-Za-z0-9_.-]{1,40}$/;
export function cleanFruechte(l) {
  const out = [], gesehen = new Set();
  for (const f of Array.isArray(l) ? l : []) {
    const key = str(f?.key, 40);
    if (!FRUCHT_KEY.test(key) || gesehen.has(key)) continue;
    gesehen.add(key);
    out.push({ key, title: str(f?.title, 40) || key });
    if (out.length >= 80) break;
  }
  return out;
}
// Kennungen landen in onclick-Attributen der Oberfläche: nur harmlose Zeichen (Durchsicht 24.10.2026: aus einer
// geteilten Planer-Datei ließ sich sonst Skript einschleusen). Felder sind Nummern.
const KOMPLEX_ID = /^[A-Za-z0-9_-]{1,30}$/;
const FELD_ID = /^\d{1,6}$/;
const SCHRITT_ID = /^[a-z0-9]{4,12}$/;
const neueSchrittId = () => Math.random().toString(36).slice(2, 10).padEnd(6, '0');

export function cleanSet(raw, id) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const fruechte = cleanFruechte(r.fruechte);
  const fk = x => globalThis.PlannerLogic.fruchtKey(x, { fruechte });   // Anzeigename → interner Name (24.10.2026)
  // Schritt-Kennung „Frucht|…“ (Abhaken im Verlauf) auf den internen Namen umstellen
  const okId = x => { const i = x.indexOf('|'); return i > 0 && !x.startsWith('hand:') ? fk(x.slice(0, i)) + x.slice(i) : x; };
  const roh = Object.entries(r.complexes || {}).filter(([, c]) => c && typeof c === 'object').slice(0, 50);
  const rohOrder = (Array.isArray(r.complexOrder) ? r.complexOrder : []).map(x => str(x, 30));
  // EINE Fruchtfolge für den Satz (Hendrik 24.10.2026: „es gibt eine Fruchtfolge und die Komplexe wandern Schritt für
  // Schritt durch“). Umzug aus der Zeit mit einer Fruchtfolge je Komplex: die längste wird die gemeinsame, Pläne kommen
  // aus allen Komplexen (der erste gewinnt), ebenso die kurz gültigen „Regeln je Frucht“
  let rotation, plaeneRoh;
  if (r.fruchtfolge && typeof r.fruchtfolge === 'object') {
    rotation = fruchtListe(r.fruchtfolge.rotation).map(fk);
    plaeneRoh = r.fruchtfolge.plaene || {};
  } else {
    const sortiert = [...roh].sort((a, b) => (rohOrder.indexOf(a[0]) + 1 || 99) - (rohOrder.indexOf(b[0]) + 1 || 99));
    rotation = fruchtListe(sortiert.map(([, c]) => fruchtListe(c.rotation)).reduce((a, b) => (b.length > a.length ? b : a), [])).map(fk);
    plaeneRoh = {};
    for (const [, c] of sortiert) for (const [k, pl] of Object.entries(c.plaene || {})) if (!plaeneRoh[k]) plaeneRoh[k] = pl;
    for (const [k, rg] of Object.entries(r.regeln || {})) {
      if (plaeneRoh[k]) continue;
      plaeneRoh[k] = { nach: (rg?.schritte || []).filter(x => !['sow', 'direktsaat'].includes(x?.k)), ernte: rg?.stehend !== true };
    }
  }
  const plaene = {};
  // auch für Früchte, die (noch) nicht in der Fruchtfolge stehen: beim Umzug aus mehreren Fruchtfolgen geht so kein Plan
  // verloren; „Aus der Fruchtfolge“ löscht den Plan in der Oberfläche ausdrücklich
  for (const [frucht, pl] of Object.entries(plaeneRoh).slice(0, 24)) {
    const k = fk(str(frucht, 40));
    if (k && !plaene[k]) plaene[k] = cleanPlan(pl);   // zwei Schreibweisen derselben Frucht: die erste gewinnt
  }
  const complexes = {};
  const umbenannt = {};   // unsichere Kennung → neue
  let lfd = 1;
  for (const [rohId, c] of roh) {
    let cid = String(rohId);
    if (!KOMPLEX_ID.test(cid)) { do { cid = 'k' + lfd++; } while (complexes[cid] || roh.some(([x]) => x === cid)); umbenannt[rohId] = cid; }
    let now;
    if (c.now === null) now = null;
    else if (r.fruchtfolge) now = Number.isInteger(c.now) ? Math.min(Math.max(0, c.now), Math.max(0, rotation.length - 1)) : 0;
    else {   // Umzug: Stelle der Frucht, die der Komplex „dieses Jahr“ hatte; ohne eigene Fruchtfolge außerhalb
      const eigene = fruchtListe(c.rotation).map(fk);
      const i = eigene.length ? rotation.indexOf(eigene[Number.isInteger(c.now) ? Math.min(Math.max(0, c.now), eigene.length - 1) : 0]) : -1;
      now = i >= 0 ? i : null;
    }
    complexes[cid] = { name: str(c.name) || 'Komplex', now };
  }
  const neuId = x => umbenannt[x] || x;
  const order = (Array.isArray(r.complexOrder) ? r.complexOrder : []).map(x => neuId(String(x))).filter(c => complexes[c]);
  for (const cid of Object.keys(complexes)) if (!order.includes(cid)) order.push(cid);
  const complexOf = {};
  for (const [fid, cid] of Object.entries(r.complexOf || {}).slice(0, 2000)) if (FELD_ID.test(String(fid)) && complexes[neuId(String(cid))]) complexOf[String(fid)] = neuId(String(cid));
  const soil = {};
  for (const [fid, s] of Object.entries(r.soil || {}).slice(0, 2000)) if (FELD_ID.test(String(fid)) && SOILS.includes(s)) soil[String(fid)] = s;
  const vonHand = {};
  for (const [fid, liste] of Object.entries(r.vonHand || {}).slice(0, 2000)) {
    const l = (Array.isArray(liste) ? liste : []).map(h => { const st = cleanSchritt(h?.s, true); return st ? { s: st, ok: h.ok === true } : null; }).filter(Boolean).slice(0, 12);
    if (l.length && FELD_ID.test(String(fid))) vonHand[String(fid)] = l;
  }
  const verlauf = {};
  for (const [fid, v] of Object.entries(r.verlauf || {}).slice(0, 2000)) {
    const frucht = fk(str(v?.frucht, 40));
    if (!frucht) continue;
    if (!FELD_ID.test(String(fid))) continue;
    verlauf[String(fid)] = { frucht, offen: (Array.isArray(v.offen) ? v.offen : []).filter(t => TASK_KEYS.includes(t)),
      ok: (Array.isArray(v.ok) ? v.ok : []).map(x => okId(str(x, 60))).filter(Boolean).slice(-20),
      gruppe: v.gruppe === 'wachsen' ? 'wachsen' : 'ruhe' };
  }
  return { id: str(id ?? r.id, 40) || newId('satz-'), name: str(r.name) || 'Planer-Satz', fruchtfolge: { rotation, plaene }, complexes, complexOrder: order, complexOf, soil, vonHand, verlauf, fruechte };
}

// Schritt; feste Punkte (Säen, Direktsaat, Ernten) nur in Listen von Hand -- im Plan sind sie eigene Abschnitte
// Schritt mit fester Kennung id (Abhaken hängt daran, nicht an der Stelle in der Liste)
function cleanSchritt(st, festErlaubt = false) {
  const d = st?.k ? globalThis.PlannerLogic.SCHRITTE[st.k] : null;
  const id = typeof st?.id === 'string' && SCHRITT_ID.test(st.id) ? st.id : neueSchrittId();
  if (d) return !d.fest || festErlaubt ? { k: st.k, id } : null;
  const n = str(st?.n, 40);
  return n ? { n, id } : null;
}

export function cleanPlan(pl) {
  const liste = l => (Array.isArray(l) ? l : []).map(x => cleanSchritt(x)).filter(Boolean).slice(0, 12);
  return { vor: liste(pl?.vor), saat: pl?.saat === 'direktsaat' ? 'direktsaat' : 'sow', pflege: liste(pl?.pflege), ernte: pl?.ernte !== false, nach: liste(pl?.nach) };
}

// Kennung eines Spielstands; null = keine Angaben (Mod älter als 0.5)
export function savegameKey(sg, mapName) {
  if (!sg) return null;
  const map = sg.mapId || mapName || 'Karte';
  // Gastgeber (Mod 0.7.9, map#server): sein eigener Spielstand -- wie im Einzelspiel über die Nummer, damit Planer und
  // Fläche dieselben bleiben (Mehrspieler-Prüfung 25.10.2026, R5). Gast und ältere Mods: über den Namen wie bisher.
  if (sg.multiplayer && !(sg.server === true && sg.index >= 1)) return `mp|${map}|${sg.name || ''}`;
  return sg.index >= 1 ? `sp|${map}|${sg.index}` : null;
}

export function cleanPlanerConfig(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const sets = {};
  for (const [id, s] of Object.entries(r.sets || {}).slice(0, 100)) { const c = cleanSet(s, id); sets[c.id] = c; }
  const bySavegame = {};
  for (const [k, id] of Object.entries(r.bySavegame || {})) if (sets[id]) bySavegame[str(k, 200)] = id;
  const current = sets[r.current] ? r.current : (Object.keys(sets)[0] || null);
  return { version: 1, current, sets, bySavegame };
}

export class PlannerStore {
  constructor(configPath) {
    this.configPath = configPath;
    this.config = cleanPlanerConfig(null);
    this.savegame = null;     // { key, name, map, multiplayer } des laufenden Spielstands
    this.pending = false;     // Mehrspieler-Spielstand ohne Zuordnung: Tablet fragt
    this.spielFruechte = [];  // zuletzt gemeldete Früchte des Spiels (Mod 0.7.4), gelten für jeden Satz, der aktiv wird
  }

  async initialize() {
    // Lesen über jsonStore (23.10.2026): kaputte Datei als .defekt gesichert (notfalls .bak genommen)
    const { data, status } = await readJsonFile(this.configPath, { fallback: null });
    if (status === 'broken') console.error('Planer nicht lesbar: Datei beschädigt, starte leer');
    try {
      this.config = cleanPlanerConfig(data);
    } catch (error) {
      console.error('Planer nicht lesbar:', error.message);
      this.config = cleanPlanerConfig(null);
    }
    if (!this.config.current) {
      const s = cleanSet({ name: 'Planer-Satz' });
      this.config.sets[s.id] = s;
      this.config.current = s.id;
    }
  }

  async persist() {
    await writeJsonAtomic(this.configPath, this.config); // atomar + .bak (23.10.2026)
  }

  get current() { return this.config.sets[this.config.current]; }

  summary() {
    const c = this.config;
    const boundTo = (id) => Object.entries(c.bySavegame).filter(([, v]) => v === id).map(([k]) => k);
    return {
      current: this.current,
      savegame: this.savegame,
      pending: this.pending,
      sets: Object.values(c.sets).map(s => ({
        id: s.id, name: s.name, complexes: s.complexOrder.length, fields: Object.keys(s.complexOf).length, savegames: boundTo(s.id).length
      })).sort((a, b) => a.name.localeCompare(b.name, 'de'))
    };
  }

  bindCurrent() {
    if (this.savegame?.key) this.config.bySavegame[this.savegame.key] = this.config.current;
  }

  /**
   * Neuer Stand der Karte (craftConsoleMap.xml): passenden Satz laden, im Einzelspieler einen neuen anlegen,
   * im Mehrspieler einmal nachfragen. @returns {boolean} ob sich etwas geändert hat
   */
  async onSavegame(sg, mapName) {
    const key = savegameKey(sg, mapName);
    if (!key || key === this.savegame?.key) return false;
    this.savegame = { key, name: sg.name || '', map: mapName || sg.mapId || '', multiplayer: !!sg.multiplayer };
    const bound = this.config.bySavegame[key];
    this.pending = false;
    if (bound) {
      this.config.current = bound;
    } else if (sg.multiplayer) {
      this.pending = true;                     // Tablet fragt: welcher Satz gilt?
      return true;
    } else {
      // Erster Besuch dieses Spielstands: ein noch an keinen Spielstand gebundener Satz übernimmt ihn
      // (so landet ein vorher von Hand angelegter Satz im ersten Spielstand), sonst ein neuer, leerer Satz
      const free = Object.values(this.config.sets).find(s => !Object.values(this.config.bySavegame).includes(s.id));
      if (free) {
        this.config.current = free.id;
      } else {
        const s = cleanSet({ name: `${sg.name || 'Spielstand ' + sg.index} · ${mapName || sg.mapId || ''}`.replace(/ · $/, '') });
        this.config.sets[s.id] = s;
        this.config.current = s.id;
      }
      this.bindCurrent();
    }
    this.fruechteAnSatz();
    await this.persist();
    return true;
  }

  async update(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('Kein Planer-Satz übergeben');
    if (this.pending) throw new Error('Erst wählen, welcher Planer-Satz für diesen Spielstand gilt');
    const cur = this.current;
    // Ein Tablet mit altem Stand (z. B. nach dem Aufwachen, Spielstand inzwischen gewechselt) darf nicht den Satz eines
    // anderen Spielstands überschreiben (Durchsicht 24.10.2026)
    if (raw.id && raw.id !== cur.id) throw new Error('Der Planer-Satz hat inzwischen gewechselt – bitte neu laden');
    // Verlauf: Frucht und offene Arbeiten führt der Server (merkeFelder); vom Tablet kommt nur, was abgehakt ist --
    // sonst überschriebe ein älterer Stand des Tablets die gemerkte Frucht
    const verlauf = { ...(cur.verlauf || {}) };
    for (const [fid, c] of Object.entries(raw?.verlauf || {})) {
      const sv = verlauf[fid];
      if (!sv) verlauf[fid] = c;
      else if (globalThis.PlannerLogic.fruchtKey(c?.frucht, cur) === sv.frucht) verlauf[fid] = { ...sv, ok: c.ok };   // auch ein Tablet mit altem Stand („Weizen“)
    }
    // Die Früchte des Spiels führt der Server (setFruechte), nicht das Tablet
    this.config.sets[cur.id] = cleanSet({ ...raw, verlauf, fruechte: cur.fruechte, id: cur.id }, cur.id);
    await this.persist();
    return this.current;
  }

  /**
   * Neue Messung der Felder (craftConsolePlan.xml): je Feld die Frucht merken (nach dem Grubbern meldet die Mod keine
   * mehr) und welche Arbeiten das Spiel seither offen gemeldet hat. Neue Frucht → neuer Verlauf (Abgehakt beginnt neu).
   * @returns {boolean} ob sich etwas geändert hat (dann speichern und an die Tablets)
   */
  merkeFelder(plan) {
    const set = this.current;
    if (!set || this.pending || !Array.isArray(plan?.fields)) return false;   // Mehrspieler: erst Satz wählen
    set.verlauf = set.verlauf || {};
    let geaendert = false;
    const LEER = globalThis.PlannerLogic.LEER;
    for (const f of plan.fields) {
      const fid = String(f.id);
      if (!FELD_ID.test(fid)) continue;
      const gruppe = f.phase === 'waechst' || f.phase === 'erntereif' ? 'wachsen' : 'ruhe';
      let v = set.verlauf[fid];
      const frucht = str(globalThis.PlannerLogic.fruchtVonFeld(f, set), 40);   // interner Name (24.10.2026)
      // Neuer Durchgang: andere Frucht, dieselbe Frucht neu gesät (Weizen nach Weizen, Durchsicht 24.10.2026) oder ein Feld,
      // das noch keinen Verlauf hat (dann auch für leere Felder, damit Erledigtes erkannt wird)
      const neu = !v || (frucht && frucht !== v.frucht) || (frucht && frucht === v.frucht && v.gruppe === 'ruhe' && gruppe === 'wachsen');
      if (neu) { v = set.verlauf[fid] = { frucht: frucht || LEER, offen: [], ok: [], gruppe }; geaendert = true; }
      // offen gilt je Abschnitt: was beim Wachsen offen war, zählt nach der Ernte nicht mehr (sonst galt z. B. „Düngen“ vor
      // der nächsten Saat als erledigt, weil es beim Wachsen der Vorfrucht einmal offen war)
      if (v.gruppe !== gruppe) { v.gruppe = gruppe; v.offen = []; geaendert = true; }
      for (const [t, anteil] of Object.entries(f.tasks || {})) {
        if (TASK_KEYS.includes(t) && anteil >= globalThis.PlannerLogic.MIN_SHARE && !v.offen.includes(t)) { v.offen.push(t); geaendert = true; }
      }
    }
    if (geaendert) this.persistBald();
    return geaendert;
  }

  /**
   * Früchte des Spiels (Mod 0.7.4, craftConsoleMap.xml <fruit>) für den aktiven Satz merken und dessen Früchte darauf
   * abgleichen: Anzeigenamen, die erst jetzt einer Frucht des Spiels zuzuordnen sind (z. B. aus einer Karten-Mod), werden
   * zum internen Namen. @returns {boolean} ob sich etwas geändert hat
   */
  async setFruechte(liste) {
    const neu = cleanFruechte(liste);
    if (neu.length) this.spielFruechte = neu;
    if (!this.fruechteAnSatz()) return false;
    await this.persist();
    return true;
  }
  // Früchte des Spiels an den aktiven Satz (auch nach „Anderen Satz laden“, „Als neuen Satz speichern“ oder einem
  // Spielstandwechsel -- sonst fehlten sie dort, bis sich die Karte ändert). @returns {boolean} ob sich etwas geändert hat
  fruechteAnSatz() {
    const set = this.current, neu = this.spielFruechte;
    if (!set || this.pending || !neu.length || JSON.stringify(neu) === JSON.stringify(set.fruechte || [])) return false;
    this.config.sets[set.id] = cleanSet({ ...set, fruechte: neu }, set.id);
    return true;
  }

  persistBald() {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => { this.persistTimer = null; this.persist().catch(e => console.error('Planer speichern:', e.message)); }, 2000);
  }

  // „Anderen Satz laden“ (oder Antwort auf die Mehrspieler-Frage): gilt ab jetzt für diesen Spielstand
  async load(id) {
    if (!this.config.sets[id]) throw new Error('Planer-Satz nicht gefunden');
    this.config.current = id;
    this.pending = false;
    this.bindCurrent();
    this.fruechteAnSatz();
    await this.persist();
  }

  // „Als neuen Satz speichern“: Kopie des aktiven (oder leer), gilt ab jetzt für diesen Spielstand
  async saveAs(name, empty = false) {
    const base = empty ? {} : this.current;
    const s = cleanSet({ ...base, id: undefined, name: str(name) || `${this.current.name} (Kopie)` });
    this.config.sets[s.id] = s;
    this.config.current = s.id;
    this.pending = false;
    this.bindCurrent();
    this.fruechteAnSatz();
    await this.persist();
    return s.id;
  }

  async remove(id) {
    if (!this.config.sets[id]) throw new Error('Planer-Satz nicht gefunden');
    if (id === this.config.current) throw new Error('Der aktive Planer-Satz lässt sich nicht löschen');
    delete this.config.sets[id];
    for (const [k, v] of Object.entries(this.config.bySavegame)) if (v === id) delete this.config.bySavegame[k];
    await this.persist();
  }

  exportSet(id) {
    const s = this.config.sets[id];
    if (!s) throw new Error('Planer-Satz nicht gefunden');
    return { controlhubPlanerSatz: 1, ...s };
  }

  async importSet(data) {
    if (!data || typeof data !== 'object' || data.controlhubPlanerSatz !== 1) throw new Error('Keine Planer-Datei von ControlHub');
    const names = new Set(Object.values(this.config.sets).map(s => s.name));
    let name = str(data.name) || 'Importierter Satz';
    for (let i = 2; names.has(name); i++) name = `${str(data.name, 54)} (${i})`;
    const s = cleanSet({ ...data, id: undefined, name });
    this.config.sets[s.id] = s;
    await this.persist();
    return s.id;
  }
}
