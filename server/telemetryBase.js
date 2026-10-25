/**
 * Gemeinsame Telemetrie-Grundwerte für alle Spiele (Phase 3 Umbauplan, 21.10.2026 -- Teil B5).
 *
 * Jede Telemetriequelle (heute nur FS25: telemetryReader.js, später z. B. ETS2/ATS) liefert ihre
 * eigenen Rohfelder. Hier werden sie in dieselbe Form "base" übersetzt; das Ergebnis hängt der Server
 * als data.base an jedes 'telemetry-update'. Spielunabhängige Teile (Cockpit-Grundanzeige, Makro-
 * Streckenzähler) lesen nur data.base; Spezialseiten (Karte, Precision Farming, Geräte) weiter die
 * Rohfelder ihres Spiels.
 *
 * Regel: Unbekannt/nicht vorhanden = null (nicht -1 wie in den FS25-Rohfeldern).
 * Zu Fuß (inVehicle false) sind alle Fahrzeugwerte null -- nicht 0 km/h, „neutral“ oder „Motor aus“ (23.10.2026).
 * Spielzeit, Wetter und Kontostand gelten auch zu Fuß. Kontostand darf negativ sein (-1 = unbekannt, wie in der Mod).
 *
 * base = {
 *   game, inVehicle, vehicleName,
 *   speedKmh, direction ('F'|'R'|'N'), rpm, maxRpm, maxSpeedKmh, gear, motorOn, motorTempC,
 *   fuel:   { level, capacity, percent, type ('diesel'|'electric'|'methane'|...) } | null,
 *   adblue: { level, capacity, percent } | null,
 *   cruise: { active, speedKmh },
 *   handbrake, aiActive,
 *   lights: { on, high, workFront, workBack, beacon, turn ('off'|'left'|'right'|'hazard'), brake } | null,
 *   position: { x, z, heading } | null,
 *   turn:     { distanceM, seconds } | null   -- Restweg bis zum Spurende (Wende), nur bei aktiver Spurführung
 *   gameTime: { hour, minute } | null,
 *   weather:  { temperatureC, type } | null,
 *   money
 * }
 */

const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const TURN = ['off', 'left', 'right', 'hazard'];
// Werte, die es nur im Fahrzeug gibt (zu Fuß null), s. fromFs25()
const VEHICLE_KEYS = ['vehicleName', 'speedKmh', 'direction', 'rpm', 'maxRpm', 'maxSpeedKmh', 'gear', 'motorOn', 'motorTempC',
  'fuel', 'adblue', 'handbrake', 'aiActive', 'lights', 'position', 'turn'];

function tank(level, capacity, percentFallback) {
  const lvl = num(level), cap = num(capacity);
  if (cap && cap > 0 && lvl !== null) return { level: lvl, capacity: cap, percent: Math.round((lvl / cap) * 100) };
  const pct = num(percentFallback);
  return pct !== null ? { level: null, capacity: null, percent: pct } : null;
}

function fromFs25(d) {
  const f2 = d.format >= 2; // Felder aus Mod-Format 2 (ab Mod 0.2.0.0); vorher gibt es sie nicht
  const fuel = tank(f2 ? d.fuelLevel : null, f2 ? d.fuelCapacity : null, d.diesel);
  if (fuel) fuel.type = (f2 && d.fuelType) || 'diesel';
  const base = {
    game: 'fs25',
    inVehicle: !!d.inVehicle,
    vehicleName: d.vehicleName || null,
    speedKmh: num(d.speed) ?? 0,
    direction: d.dir || 'N',
    rpm: num(d.rpm),
    maxRpm: f2 ? num(d.maxRpm) : null,
    maxSpeedKmh: f2 ? num(d.maxSpeed) : null,
    gear: f2 && d.gear ? d.gear : null,
    motorOn: f2 ? !!d.motorOn : null,
    motorTempC: f2 ? num(d.motorTemp) : null,
    fuel,
    adblue: tank(f2 ? d.defLevel : null, f2 ? d.defCapacity : null, d.adblue),
    cruise: {
      active: f2 ? d.cruiseState > 0 : null,
      speedKmh: num(d.cruise)
    },
    handbrake: f2 ? !!d.handbrake : null,
    aiActive: f2 ? !!d.aiActive : null,
    // Lichter-Bitmaske: 1 Abblendlicht, 2 Arbeitslicht hinten, 4 Arbeitslicht vorne, 8 Fernlicht.
    // „Licht an“ nur bei Abblend-/Fernlicht -- andere Bits (beim Bremsen gesetzt) zählten vorher mit (Hendrik 22.10.2026).
    lights: f2 && d.lightsMask >= 0 ? {
      on: (d.lightsMask & 9) !== 0,
      high: (d.lightsMask & 8) !== 0,
      workFront: (d.lightsMask & 4) !== 0,
      workBack: (d.lightsMask & 2) !== 0,
      beacon: !!d.beacon,
      turn: TURN[d.turnLight] || 'off',
      brake: !!d.brakeLight
    } : null,
    position: d.terrainSize > 0 ? { x: d.posX, z: d.posZ, heading: num(d.heading) } : null,
    // „Wende in X m“: spec_aiAutomaticSteering.lastDistanceToEnd (Mod-Feld steerDistEnd), nur solange die
    // Spurführung des Spiels lenkt; Zeit aus Restweg und aktuellem Tempo (unter 1 km/h keine Zeit)
    turn: d.steerOn && d.steerDistEnd >= 0 ? {
      distanceM: d.steerDistEnd,
      seconds: d.speed >= 1 ? d.steerDistEnd / (d.speed / 3.6) : null
    } : null,
    gameTime: d.envHour >= 0 ? { hour: d.envHour, minute: Math.max(0, d.envMinute) } : null,
    weather: f2 && d.weather ? { temperatureC: d.temperature > -99 ? d.temperature : null, type: d.weather } : null,
    // Minus-Kontostand zulassen (bis 23.10.2026 wurde er über num() zu „–“); -1 schreibt die Mod für „unbekannt“
    money: typeof d.money === 'number' && Number.isFinite(d.money) && d.money !== -1 ? d.money : null
  };
  if (!base.inVehicle) {
    for (const k of VEHICLE_KEYS) base[k] = null;
    base.cruise = { active: null, speedKmh: null };
  }
  return base;
}

const TRANSLATORS = { fs25: fromFs25 };

/**
 * @param {object} data  Rohdaten der Quelle ({available:false} wird nicht übersetzt)
 * @param {string} source  Telemetrie-Quelle des aktiven Spiels (gameManager BUILTIN_GAMES[].telemetry)
 * @returns {object|null}
 */
export function toBase(data, source) {
  if (!data || data.available === false) return null;
  const tr = TRANSLATORS[source];
  return tr ? tr(data) : null;
}
