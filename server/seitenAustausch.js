/**
 * Kachelseiten exportieren und importieren (Hendrik 24.10.2026: „Es fehlt eine Funktion, um Seiten zu importieren und zu
 * exportieren“). Eine Datei enthält die Seiten und die eigenen Tastenfelder, auf die sie verweisen („panel:<id>“); die
 * mitgelieferten Kacheln (sm-v-…, server/bausteinVorlagen.js) gibt es in jeder Installation und bleiben Verweise.
 * Beim Import bekommen Seiten und Tastenfelder neue Kennungen, gleiche Namen werden durchnummeriert.
 *
 *   { controlhubKachelseiten: 1, pages: [Seite …], kacheln: { "<alte Tastenfeld-ID>": Tastenfeld ohne id } }
 *
 * Die Bilder der Tastenfelder bettet die Route ein (server/kachelBilder.js, „bilder“ je Tastenfeld).
 */

import { MAX_PAGES, sichtbarFehler } from './kachelnManager.js';

export const DATEI_KENNUNG = 'controlhubKachelseiten';
const istVorlage = id => /^sm-v-/.test(id);
const panelId = cell => /^panel:(.+)$/.exec(String(cell || ''))?.[1] || null;
const kopie = x => JSON.parse(JSON.stringify(x));

/**
 * @param {object} config     kachelnManager.get()
 * @param {object} sm         steuerungsmenuesManager (exportPage)
 * @param {string[]|null} ids nur diese Seiten (null = alle)
 */
export function exportiereSeiten(config, sm, ids = null) {
  const pages = config.pages.filter(p => !ids || ids.includes(p.id)).map(kopie);
  const kacheln = {};
  for (const p of pages) {
    for (const c of p.cells) {
      const id = panelId(c);
      if (!id || istVorlage(id) || kacheln[id]) continue;
      try { kacheln[id] = sm.exportPage(id); } catch { /* Tastenfeld gibt es nicht mehr: Verweis bleibt, Kachel fehlt */ }
    }
  }
  return { [DATEI_KENNUNG]: 1, pages, kacheln };
}

/**
 * @param {{ nachKachel?: (kachel: object, ausDatei: object) => Promise<void> }} opts  z. B. mitgelieferte Bilder ablegen
 * @returns {{ seiten: string[], kacheln: number, fehlend: number, ohneProfil: string[] }}
 */
export async function importiereSeiten(daten, kachelnManager, sm, profilNamen = [], { nachKachel = null } = {}) {
  if (!daten || daten[DATEI_KENNUNG] !== 1 || !Array.isArray(daten.pages)) throw new Error('Keine Kachelseiten-Datei von ControlHub');
  const config = kachelnManager.get();
  const frei = MAX_PAGES - config.pages.length;
  if (daten.pages.length > frei) {
    throw new Error(`Es gehen höchstens ${MAX_PAGES} Kachelseiten je Spiel. Frei sind noch ${Math.max(0, frei)}, die Datei hat ${daten.pages.length}.`);
  }
  // je Profil höchstens 10 zu sehen -- vor dem Anlegen der Tastenfelder prüfen, damit bei Abbruch nichts übrig bleibt
  const zuViel = sichtbarFehler([...config.pages, ...daten.pages.filter(p => p && typeof p === 'object')]);
  if (zuViel) throw new Error(`${zuViel} Gib den Seiten ein bestimmtes Profil (Gilt für) oder lösch welche.`);
  // Eigene Tastenfelder zuerst anlegen (neue IDs), dann die Verweise der Seiten umstellen
  const neueId = {};
  for (const [alt, k] of Object.entries(daten.kacheln || {})) {
    if (!k || typeof k !== 'object') continue;
    const kachel = await sm.importPage(k);
    neueId[alt] = kachel.id;
    if (nachKachel) await nachKachel(kachel, k);
  }
  const namen = new Set(config.pages.map(p => p.name));
  const stamp = Date.now().toString(36);
  let fehlend = 0;
  const neu = daten.pages.filter(p => p && typeof p === 'object').map((p, i) => {
    const basis = String(p.name || 'Seite').trim().slice(0, 34) || 'Seite';
    let name = basis;
    for (let n = 2; namen.has(name); n++) name = `${basis} (${n})`;
    namen.add(name);
    const cells = (Array.isArray(p.cells) ? p.cells : []).map(c => {
      const id = panelId(c);
      if (!id) return c;
      if (neueId[id]) return `panel:${neueId[id]}`;
      if (!sm.getPage?.(id)) fehlend++;
      return c;
    });
    return { ...kopie(p), id: `k${stamp}${i}`, name, cells };
  });
  await kachelnManager.set({ ...config, pages: [...config.pages, ...neu] });
  const bekannt = new Set(profilNamen);
  const ohneProfil = neu.filter(p => (p.profiles || []).length && !(p.profiles || []).some(n => bekannt.has(n))).map(p => p.name);
  return { seiten: neu.map(p => p.name), kacheln: Object.keys(neueId).length, fehlend, ohneProfil };
}
