/**
 * Bedingung „nur auslösen, wenn …“ (Umsetzungsplan Paket J, V2-Idee „zustandsabhängige Tasten“).
 *
 * Eine Funktion kann in functions.json ein Feld `condition` tragen:
 *   { value: 'r1_low', is: false }            -- an/aus-Wert: nur senden, wenn er so steht
 *   { value: 'speed', op: 'lt'|'gt', num: 5 } -- Zahl: nur senden, wenn kleiner/größer als num
 * Die Werte kommen aus derselben Werteliste wie im Browser (public/js/werteliste.js).
 *
 * Ist der Wert gerade unbekannt (keine oder veraltete Spieldaten, Gerät fehlt): bei einem Tastendruck
 * von Hand wird trotzdem gesendet, bei automatischen Auslösern (Makro-Schritt nach Zeit/Strecke,
 * später die Vorgewende-Auslöser aus Paket I) nicht.
 */
import '../public/js/werteliste.js';

const W = globalThis.Werteliste;
const STALE_MS = 3000; // älter = unbekannt (Mod schreibt höchstens alle 250 ms)

export function normalizeCondition(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.value !== 'string' || !raw.value) return null;
  if (raw.op === 'lt' || raw.op === 'gt') {
    const n = Number(raw.num);
    return Number.isFinite(n) ? { value: raw.value, op: raw.op, num: n } : null;
  }
  return { value: raw.value, is: raw.is !== false };
}

export class ConditionChecker {
  constructor() {
    this.data = null;
    this.at = 0;
    this.game = 'fs25';
  }

  setTelemetry(data, game) {
    this.data = data;
    this.at = Date.now();
    if (game) this.game = game;
  }

  // Aktueller Wert oder null (unbekannt)
  current(valueId) {
    if (!this.data || this.data.available === false || Date.now() - this.at > STALE_MS) return null;
    return W.value(W.get(this.game, valueId), this.data);
  }

  /**
   * @param {object|null} condition
   * @param {{manual: boolean}} opts  manual = Tastendruck von Hand
   */
  allows(condition, { manual } = { manual: true }) {
    const c = normalizeCondition(condition);
    if (!c) return true;
    const v = this.current(c.value);
    if (v === null || v === undefined) return !!manual;
    if (c.op === 'lt') return typeof v === 'number' && v < c.num;
    if (c.op === 'gt') return typeof v === 'number' && v > c.num;
    return !!v === c.is;
  }
}
