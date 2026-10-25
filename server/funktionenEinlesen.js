/**
 * Funktionen aus dem Spiel neu einlesen (Hendrik 24.10.2026: „eine Funktion, mit der man die Funktionen neu auslesen kann?
 * Das wäre z. B. praktisch, wenn man neue Mods hinzufügt“). Liest wie beim ersten Start die inputBinding.xml des Spiels
 * und den Mods-Ordner vom PC (keine Datei auswählen) und gleicht mit den vorhandenen Funktionen ab:
 *   neu                  -> kommen dazu, mit Gruppe wie im Spiel bzw. je Mod
 *   vorhanden            -> Tasten wie im Spiel; Name und Gruppen nur, wenn du sie nicht selbst geändert hast
 *   nicht mehr im Spiel  -> bleiben (können in Profilen belegt sein), werden nur gezählt
 * „Nicht selbst geändert“: gleich dem Stand beim letzten Einlesen (Feld quelle); Funktionen ohne quelle (älter) gelten als
 * unverändert, wenn sie noch den Namen bzw. die Gruppe tragen, die ControlHub ohne Angaben aus Spiel und Mods vergibt.
 * Neue Mods, deren Tasten das Spiel noch nicht in die inputBinding.xml geschrieben hat: Standardbelegung aus ihrer modDesc.xml.
 */
import { promises as fs } from 'fs';
import { parseInputBindingXml } from './inputBindingImporter.js';
import { leseSpielAktionen, leseModAktionen, modsOrdner } from './modAktionen.js';
import { findeInputBinding } from './beispielprofile.js';
import { einsortieren } from './gruppenFolge.js';

const gleich = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Funktionen, wie das Spiel sie gerade kennt. Jede bekommt quelle (Name/Gruppen mit allen Angaben) und ersatz (Name/Gruppen,
 * die ControlHub ohne Angaben aus Spiel und Mods vergäbe; nur für den Abgleich, wird nicht gespeichert).
 */
export async function liesAusSpiel({ inputBinding } = {}) {
  const datei = inputBinding !== undefined ? inputBinding : await findeInputBinding();
  const spiel = await leseSpielAktionen().catch(() => null);
  const mods = await leseModAktionen(await modsOrdner()).catch(() => null);
  const functions = {};
  let ausSpiel = 0, ausMods = 0, ausModStandard = 0;
  const lies = (xml, standard) => {
    let mit, ohne;
    try { mit = parseInputBindingXml(xml, { spiel, mods }); ohne = parseInputBindingXml(xml); } catch { return; }   // keine Aktionen
    for (const [id, f] of Object.entries(mit.functions)) {
      if (functions[id]) continue;   // die Belegung im Spiel geht der Standardbelegung einer Mod vor
      functions[id] = { ...f, quelle: { name: f.name, categories: [...f.categories] }, ersatz: { name: ohne.functions[id]?.name, categories: ohne.functions[id]?.categories } };
      if (standard) ausModStandard++;
    }
    if (!standard) { ausSpiel = mit.ausSpiel; ausMods = mit.ausMods; }
  };
  if (datei) lies(await fs.readFile(datei, 'utf8'), false);
  for (const { xml } of mods?.standards || []) lies(xml, true);
  return { datei, functions, ausSpiel, ausMods, ausModStandard, spielListe: !!spiel, modsGelesen: mods?.mods || 0 };
}

/** Abgleich vorhandener mit gelesenen Funktionen (rein, ohne Speichern). */
export function abgleich(vorhanden, gelesen) {
  const neu = {}, aenderungen = {};
  let tasten = 0, namen = 0, gruppen = 0;
  for (const [id, g] of Object.entries(gelesen)) {
    const { ersatz, ...funktion } = g;
    const f = vorhanden[id];
    if (!f) { neu[id] = funktion; continue; }
    const unveraendert = feld => gleich(f[feld], f.quelle ? f.quelle[feld] : ersatz?.[feld]);
    const p = {};
    if (!gleich(f.actions, g.actions)) { p.actions = g.actions; tasten++; }
    if (g.name !== f.name && unveraendert('name')) { p.name = g.name; namen++; }
    if (!gleich(g.categories, f.categories) && (unveraendert('categories') || gleich(f.categories, ['Sonstige/unbekannt']))) { p.categories = g.categories; gruppen++; }
    if (!gleich(f.quelle, g.quelle)) p.quelle = g.quelle;
    if (Object.keys(p).length) aenderungen[id] = p;
  }
  const weg = Object.keys(vorhanden).filter(id => id.startsWith('func-fs-') && !gelesen[id]);
  return { neu, aenderungen, weg, zaehler: { neu: Object.keys(neu).length, tasten, namen, gruppen, weg: weg.length } };
}

/**
 * Neu einlesen und übernehmen. Neue Gruppen kommen an ihren Platz (Mods › … zu den Mods), die übrige Reihenfolge bleibt.
 * @returns {{neu, tasten, namen, gruppen, weg, neueMods: string[], ausModStandard, spielListe, modsGelesen}}
 */
export async function neuEinlesen(functionsManager, opts = {}) {
  const r = await liesAusSpiel(opts);
  if (!r.datei && !Object.keys(r.functions).length) {
    throw new Error('Keine inputBinding.xml gefunden. Starte den LS25 auf diesem PC einmal, dann legt er sie an.');
  }
  const { neu, aenderungen, zaehler } = abgleich(functionsManager.functions, r.functions);
  const vorher = [...functionsManager.categories];
  if (zaehler.neu) await functionsManager.importFunctions({ functions: neu }, 'merge');
  for (const [id, p] of Object.entries(aenderungen)) {
    Object.assign(functionsManager.functions[id], p);
    for (const c of p.categories || []) await functionsManager.ensureCategory(c);
  }
  const dazu = functionsManager.categories.filter(c => !vorher.includes(c));
  if (dazu.length) {
    functionsManager.categories = einsortieren(vorher, dazu);
    await functionsManager.saveCategories();
  }
  await functionsManager.save();
  const neueMods = [...new Set(Object.values(neu).flatMap(f => f.categories || []).filter(c => c.startsWith('Mods › ')).map(c => c.slice(7)))];
  return { ...zaehler, neueMods, ausModStandard: r.ausModStandard, spielListe: r.spielListe, modsGelesen: r.modsGelesen };
}
