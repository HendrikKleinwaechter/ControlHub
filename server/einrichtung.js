/**
 * Einrichtungs-Assistent und Tour (23.10.2026).
 * Reine Logik ohne Dateizugriff (getestet in test/einrichtung.test.js):
 * - Erststart: läuft der Assistent (frische Installation) oder nicht (bestehende Installation nach einem Update)?
 * - Kalibrier-Stand der CraftConsole aus GETALL caldone= (Bitmaske, Firmware 2.12 calStop(): Bit = Gruppe - 1)
 * - Vorschlag „Neuer Controller – einrichten?“ bzw. „Achsen noch nicht kalibriert – kalibrieren?“
 */

// Kalibrier-Gruppen der CraftConsole-Firmware (CAL <name>, Reihenfolge = calGroup CG_THUMB … CG_LEVB2 → Bit 0 … 10)
export const CAL_GROUPS = [
  { group: 'thumb', bit: 0, label: 'CraftSlot 1 – Thumbstick', keys: ['thumbX', 'thumbY'] },
  { group: 'leverA', bit: 1, label: 'CraftSlot 1 – Hebel vor/zurück', keys: ['leverA'] },
  { group: 'leverB', bit: 2, label: 'CraftSlot 1 – Hebel links/rechts', keys: ['leverB'] },
  { group: 'finger1', bit: 3, label: 'Fingertip 1', keys: ['finger1'] },
  { group: 'finger2', bit: 4, label: 'Fingertip 2', keys: ['finger2'] },
  { group: 'finger3', bit: 5, label: 'Fingertip 3', keys: ['finger3'] },
  { group: 'finger4', bit: 6, label: 'Fingertip 4', keys: ['finger4'] },
  { group: 'poti', bit: 7, label: 'Poti-Rad', keys: ['poti'] },
  { group: 'thumb2', bit: 8, label: 'CraftSlot 2 – Thumbstick', keys: ['thumb2X', 'thumb2Y'] },
  { group: 'leverA2', bit: 9, label: 'CraftSlot 2 – Hebel vor/zurück', keys: ['leverA2'] },
  { group: 'leverB2', bit: 10, label: 'CraftSlot 2 – Hebel links/rechts', keys: ['leverB2'] }
];

/**
 * Erster Start dieser Version: Eintrag `einrichtung` in app.json anlegen. Bestehende Installationen gelten als
 * eingerichtet, frische nicht. Bestehend ist eine Installation, wenn ein Spiel gewählt ist ODER es schon Daten einer
 * älteren Version gab (bestehend). Nur am Spiel erkennen reichte nicht: Auf Hendriks Gaming-PC (Test 23.10.2026) gab es
 * games/ und Profile, aber nie ein gewähltes Spiel -- der Assistent kam nach dem Update.
 * @returns {boolean} true, wenn etwas geändert wurde (dann speichern)
 */
export function initEinrichtung(appSettings, { spielGewaehlt = false, bestehend = false } = {}) {
  if (appSettings.einrichtung && typeof appSettings.einrichtung === 'object') return false;
  appSettings.einrichtung = spielGewaehlt || bestehend ? { fertig: true, am: null, bestehend: true } : { fertig: false, am: null };
  return true;
}

/**
 * Kalibrier-Gruppen für die gewählten Module: welche gebraucht werden und ob sie laut caldone kalibriert sind.
 * @param {Array} modules   Module des Controllers (resolveModules, mit axisKeys)
 * @param {number|string|null} caldone  Bitmaske aus GETALL (null = unbekannt)
 */
export function kalibrierGruppen(modules, caldone) {
  const keys = new Set((modules || []).flatMap(m => m.axisKeys || []));
  const mask = caldone === null || caldone === undefined || caldone === '' || !Number.isFinite(Number(caldone)) ? null : Number(caldone);
  return CAL_GROUPS.map(g => ({
    group: g.group, label: g.label,
    noetig: g.keys.some(k => keys.has(k)),
    fertig: mask === null ? null : (mask & (1 << g.bit)) !== 0
  }));
}

/**
 * Soll ControlHub nach dem Erkennen fragen, ob der Controller eingerichtet werden soll?
 * @param {object} p
 * @param {string} p.controllerId     erkannter Controller
 * @param {string} p.name             sein Name (für den Text)
 * @param {boolean} p.einrichtungFertig  Erststart-Assistent erledigt (sonst übernimmt der ohnehin)
 * @param {object} p.eingerichtet     controller.json eingerichtet { id: Datum }
 * @param {object} p.hinweisAus       controller.json hinweisAus { id: Signatur } („Nein, danke“ bei Kalibrierung)
 * @param {Array}  p.gruppen          kalibrierGruppen() oder null (Controller ohne Kalibrierung)
 * @returns {null | {grund: 'neu'|'kalibrierung', controller, name, offen?: string[], signatur?: string}}
 */
export function vorschlag({ controllerId, name, einrichtungFertig, eingerichtet = {}, hinweisAus = {}, gruppen = null }) {
  if (!controllerId || !einrichtungFertig) return null;
  if (!eingerichtet[controllerId]) return { grund: 'neu', controller: controllerId, name };
  if (!gruppen) return null;
  const offen = gruppen.filter(g => g.noetig && g.fertig === false);
  if (!offen.length) return null;
  const signatur = offen.map(g => g.group).join(',');
  if (hinweisAus[controllerId] === signatur) return null;
  return { grund: 'kalibrierung', controller: controllerId, name, offen: offen.map(g => g.label), signatur };
}
