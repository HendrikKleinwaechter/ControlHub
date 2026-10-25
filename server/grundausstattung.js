/**
 * Grundausstattung beim ersten Start eines Spiels (Hendrik 24.10.2026: „Außerdem fehlen wieder die ganzen Funktionen und
 * die Kategorien … Das soll in der Grundform auch schon korrekt drinnen sein. Auch die vorgefertigten Kachelübersichten“).
 * Läuft nur, wenn die Datei des Spiels noch fehlte (functions.json bzw. kacheln.json) -- vorhandene Daten bleiben, wie sie sind.
 *   Funktionen:   die inputBinding.xml des Spiels auf diesem PC, mit Gruppen wie im Spiel und je Mod (wie „inputBinding.xml
 *                 importieren“); liegt keine da, die mitgelieferte Liste vorgaben/funktionen/<spiel>.json.
 *   Kachelseiten: vorgaben/kacheln/<spiel>.json; Kacheln über die festen IDs der Vorlagen (panel:sm-v-…), fehlt eine, bleibt
 *                 das Feld leer (wie bei „Neue Seite aus Vorlage“).
 */
import { promises as fs } from 'fs';
import path from 'path';
import { VORGABEN_DIR } from './paths.js';
import { liesAusSpiel } from './funktionenEinlesen.js';
import { ordneGruppen } from './gruppenFolge.js';
import { cleanKachelConfig } from './kachelnManager.js';

const SPIELE_MIT_INPUTBINDING = new Set(['fs25']);
export { ordneGruppen };
export async function leseVorgabe(art, gameId, dir = VORGABEN_DIR) {
  if (!/^[\w-]+$/.test(String(gameId))) return null;
  try {
    return JSON.parse(await fs.readFile(path.join(dir, art, `${gameId}.json`), 'utf8'));
  } catch {
    return null;
  }
}

/** Funktionen für ein neues Spiel (wie „Aus dem Spiel neu einlesen“, s. funktionenEinlesen.js). @returns {{quelle: 'spiel'|'vorgabe'|null, anzahl: number}} */
export async function grundFunktionen(gameId, functionsManager, { dir = VORGABEN_DIR, inputBinding } = {}) {
  if (SPIELE_MIT_INPUTBINDING.has(gameId)) {
    try {
      const r = await liesAusSpiel({ inputBinding });
      const functions = Object.fromEntries(Object.entries(r.functions).map(([id, { ersatz, ...f }]) => [id, f]));
      if (r.datei && Object.keys(functions).length) {
        await functionsManager.importFunctions({ functions }, 'merge');
        return { quelle: 'spiel', anzahl: Object.keys(functions).length };
      }
    } catch (error) {
      console.error('Grundausstattung: inputBinding.xml nicht lesbar, nehme die mitgelieferte Liste:', error.message);
    }
  }
  const vorgabe = await leseVorgabe('funktionen', gameId, dir);
  if (vorgabe?.functions && typeof vorgabe.functions === 'object') {
    await functionsManager.importFunctions({ functions: vorgabe.functions }, 'merge');
    return { quelle: 'vorgabe', anzahl: Object.keys(vorgabe.functions).length };
  }
  return { quelle: null, anzahl: 0 };
}

/** Kachelseiten für ein neues Spiel. @returns {number} Anzahl Seiten */
export async function grundKacheln(gameId, kachelnManager, steuerungsmenuesManager, { dir = VORGABEN_DIR } = {}) {
  const vorgabe = await leseVorgabe('kacheln', gameId, dir);
  if (!Array.isArray(vorgabe?.pages) || !vorgabe.pages.length) return 0;
  const vorhanden = new Set(Object.keys(steuerungsmenuesManager?.pages || {}));
  const pages = vorgabe.pages.map(p => ({
    ...p,
    profiles: [],
    cells: (p.cells || []).map(c => (!String(c).startsWith('panel:') || vorhanden.has(String(c).slice(6)) ? c : ''))
  }));
  kachelnManager.config = cleanKachelConfig({ ...kachelnManager.config, pages });
  await kachelnManager.save();
  return kachelnManager.config.pages.length;
}

/** Nach dem Laden eines Spiels: was neu angelegt wurde, mit der Grundausstattung füllen. */
export async function richteGrundausstattungEin(gameId, { functionsManager, kachelnManager, steuerungsmenuesManager }) {
  if (functionsManager?.neu) {
    const r = await grundFunktionen(gameId, functionsManager);
    functionsManager.categories = ordneGruppen(functionsManager.categories);
    await functionsManager.saveCategories();
    if (r.anzahl) console.log(`Grundausstattung: ${r.anzahl} Funktionen (${r.quelle === 'spiel' ? 'aus der inputBinding.xml des Spiels' : 'mitgelieferte Liste'})`);
    functionsManager.neu = false;
  }
  if (kachelnManager?.neu) {
    const n = await grundKacheln(gameId, kachelnManager, steuerungsmenuesManager);
    if (n) console.log(`Grundausstattung: ${n} Kachelseiten`);
    kachelnManager.neu = false;
  }
}
