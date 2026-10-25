/**
 * Einmaliger Umzug der Kachelseiten auf die nachgebauten Bausteine (Hendrik 22.10.2026, „Ersetzen + Zurücksetzen“):
 * Kacheln mit den früher festen Bausteinen (cockpit, wetter, fahrzeug …) zeigen danach den gleichnamigen eigenen
 * Baustein (bausteinVorlagen.js, feste ID sm-v-<name>). Eine Werte-Kachel mit eigener Auswahl bekommt einen eigenen
 * Baustein „Werte · <Seite>“ mit genau diesen Werten. Die ausgebauten Zähler (Stoppuhr, Timer, Fuhrenzähler, Wecker)
 * werden zu leeren Feldern. Läuft je Spiel einmal (kacheln.json: bausteine = 1).
 * Schritt 2 (22.10.2026 abends): der Arbeitsplaner ist jetzt auch eine normale Kachel aus der Vorlage (bausteine = 2).
 */
import '../public/js/werteliste.js';
import { vorlagenPageId } from './bausteinVorlagen.js';

const UMZUG = ['cockpit', 'wetter', 'precision', 'fahrzeug', 'geraete', 'werte', 'steuerung', 'strecke'];
const AUSGEBAUT = ['stoppuhr', 'timer', 'fuhren', 'wecker'];
const STANDARD_WERTE = 'speed,fuel_pct';

const STAND = 2;

export async function migrateKachelnToBausteine(kacheln, sm) {
  const cfg = kacheln.get();
  if (cfg.bausteine >= STAND) return false;
  if (!(cfg.bausteine >= 1)) await schritt1(cfg, sm);
  const planer = vorlagenPageId('planer');
  for (const page of cfg.pages) {
    page.cells = page.cells.map(c => (c !== 'planer' ? c : sm.getPage(planer) ? `panel:${planer}` : ''));
    if (page.settings) delete page.settings.planer;
  }
  cfg.bausteine = STAND;
  await kacheln.set(cfg);
  return true;
}

async function schritt1(cfg, sm) {
  const W = globalThis.Werteliste;
  for (const page of cfg.pages) {
    let werteId = vorlagenPageId('werte');
    const vals = (page.settings?.werte?.values || []).map(v => W.migrateId(v));
    if (page.cells.includes('werte') && vals.length && vals.join() !== STANDARD_WERTE) {
      werteId = (await sm.createValuesPage(`Werte · ${page.name}`, vals, id => W.get('fs25', id)?.kind)).id;
    }
    page.cells = page.cells.map(c => {
      if (AUSGEBAUT.includes(c)) return '';
      if (!UMZUG.includes(c)) return c;
      const id = c === 'werte' ? werteId : vorlagenPageId(c);
      return sm.getPage(id) ? `panel:${id}` : '';
    });
    if (page.settings) for (const k of [...UMZUG, ...AUSGEBAUT]) delete page.settings[k];
  }
}
