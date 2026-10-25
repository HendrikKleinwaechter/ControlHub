// Werteliste, Bedingungen und ControlHub-Aktionen (Umsetzungsplan Paket J).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConditionChecker, normalizeCondition } from '../server/conditions.js';
import { MappingEngine } from '../server/mappingEngine.js';

const W = globalThis.Werteliste;
const v = (id, d) => W.value(W.get('fs25', id), d);

function sample() {
  return {
    available: true, format: 2, speed: 12, dir: 'F', slip: 0.08, fill: 40, filltype: 'Weizen',
    base: { speedKmh: 12, maxSpeedKmh: 50, rpm: 1500, maxRpm: 2100, gear: 'D', motorOn: true, motorTempC: 85,
      fuel: { level: 300, capacity: 400, percent: 75, type: 'diesel' }, adblue: null,
      cruise: { active: true, speedKmh: 15 }, handbrake: false, aiActive: false,
      lights: { on: true, high: false, workFront: false, workBack: true, beacon: true, turn: 'left', brake: false },
      turn: { distanceM: 28, seconds: 8 }, gameTime: { hour: 6, minute: 5 }, weather: { temperatureC: 18, type: 'sun' }, money: 123456 },
    units: [
      { name: 'Anhänger 2', side: 'rear', depth: 2, lowered: null, on: null, unfolded: null, fills: [{ name: 'Weizen', level: 1000, capacity: 8000 }] },
      { name: 'Mähwerk', side: 'front', depth: 1, lowered: false, on: true, unfolded: true, fills: [] },
      { name: 'Anhänger 1', side: 'rear', depth: 1, lowered: true, on: false, unfolded: null, fills: [{ name: 'Gerste', level: 2000, capacity: 4000 }] }
    ],
    hub: { profile: 'Pflügen', macro: null, layers: { craftslot1: 2, craftslot2: 1 } }
  };
}

test('Blinker je Richtung als an/aus (Kachel Beleuchtung)', () => {
  const d = sample();
  assert.deepEqual(['blinker_links', 'blinker_rechts', 'warnblinker'].map(id => v(id, d)), [true, false, false]);
  d.base.lights.turn = 'hazard';
  assert.deepEqual(['blinker_links', 'blinker_rechts', 'warnblinker'].map(id => v(id, d)), [false, false, true]);
  delete d.base.lights.turn;
  assert.equal(v('blinker_links', d), null, 'ohne Angabe unbekannt');
  assert.equal(v('blinker', sample()), 'links', 'der Text-Wert bleibt');
});

test('feste Plätze: hinten 1 = erstes Gerät in der Kette, egal in welcher Reihenfolge gemeldet', () => {
  const d = sample();
  assert.equal(v('r1_name', d), 'Anhänger 1');
  assert.equal(v('r2_name', d), 'Anhänger 2');
  assert.equal(v('f_name', d), 'Mähwerk');
  assert.equal(v('r1_fill', d), 2000);
  assert.deepEqual(W.range(W.get('fs25', 'r1_fill'), d), [0, 4000]);
  assert.equal(v('r1_fill_pct', d), 50);
  assert.equal(v('r1_low', d), true);
  assert.equal(v('r2_low', d), null, 'Anhänger ohne Absenken: unbekannt statt aus');
  assert.equal(v('all_fill', d), 3000);
  assert.equal(v('all_fill_pct', d), 25);
});

test('Fahrzeugwerte, Bereich aus dem Spiel, ControlHub-Werte', () => {
  const d = sample();
  assert.equal(v('speed', d), 12);
  assert.deepEqual(W.range(W.get('fs25', 'speed'), d), [0, 60]);
  assert.deepEqual(W.range(W.get('fs25', 'rpm'), d), [0, 2400]);
  assert.deepEqual(W.range(W.get('fs25', 'speed'), d, [0, 40]), [0, 40], 'von Hand gesetzt gewinnt');
  assert.equal(v('beacon', d), true);
  assert.equal(v('clock', d), '06:05');
  assert.equal(v('weather', d), 'Sonnig');
  assert.equal(v('profile', d), 'Pflügen');
  assert.equal(v('layer1', d), 2);
  assert.equal(v('adblue', d), null);
  assert.equal(v('speed', { available: false }), null);
});

test('alte IDs der Werte-Kachel werden übernommen, Darstellung passt zur Art', () => {
  assert.equal(W.migrateId('tank'), 'fuel_pct');
  assert.equal(W.get('fs25', 'tempo').id, 'speed');
  assert.deepEqual(W.displayTypes(W.get('fs25', 'beacon')), ['leuchte', 'text']);
  assert.deepEqual(W.displayTypes(W.get('fs25', 'money')), ['zahl']);
  assert.deepEqual(W.displayTypes(W.get('fs25', 'rpm')), ['zahl', 'balken', 'tacho']);
  assert.equal(W.format(W.get('fs25', 'money'), 123456), '123.456');
  assert.equal(W.format(W.get('fs25', 'hours'), 12.34), '12,3');
  assert.equal(W.format(W.get('fs25', 'beacon'), false), 'aus');
  assert.ok(W.search('fs25', 'hinten 1').length >= 5);
  assert.equal(W.tree('fs25')[0].cat, 'Fahrzeug');
});

test('Bedingung: an/aus, Zahl, unbekannt von Hand ja / automatisch nein', () => {
  const c = new ConditionChecker();
  assert.equal(c.allows({ value: 'r1_low', is: false }, { manual: true }), true, 'keine Daten, von Hand');
  assert.equal(c.allows({ value: 'r1_low', is: false }, { manual: false }), false, 'keine Daten, automatisch');
  c.setTelemetry(sample(), 'fs25');
  assert.equal(c.allows({ value: 'r1_low', is: false }, { manual: true }), false, 'gesenkt → „ausheben nur wenn aus“ sperrt');
  assert.equal(c.allows({ value: 'r1_low', is: true }, { manual: false }), true);
  assert.equal(c.allows({ value: 'speed', op: 'lt', num: 15 }, { manual: false }), true);
  assert.equal(c.allows({ value: 'speed', op: 'gt', num: 15 }, { manual: false }), false);
  assert.equal(c.allows({ value: 'r2_low', is: true }, { manual: false }), false, 'Wert fehlt → automatisch nicht');
  assert.equal(c.allows(null), true);
  assert.equal(normalizeCondition({ value: 'x', op: 'lt', num: 'abc' }), null);
  assert.deepEqual(normalizeCondition({ value: 'beacon' }), { value: 'beacon', is: true });
});

test('MappingEngine: gesperrte Funktion wird nicht gedrückt, Loslassen gibt nur Gedrücktes frei', () => {
  const funcs = {
    senken: { id: 'senken', actions: [{ type: 'keyboard', key: 'Q' }], condition: { value: 'r1_low', is: false } },
    heben: { id: 'heben', actions: [{ type: 'keyboard', key: 'Q' }], condition: { value: 'r1_low', is: true } }
  };
  const e = new MappingEngine({ getFunction: id => funcs[id] || null });
  const c = new ConditionChecker();
  c.setTelemetry(sample(), 'fs25'); // hinten 1 ist gesenkt
  e.setConditionChecker(c);
  e.handleVirtualButtonDown('panel:p:senken', 'senken');
  assert.equal(e.heldKeys.has('Q'), false, '„absenken“ sperrt, Gerät ist schon unten');
  e.handleVirtualButtonUp('panel:p:senken');
  e.handleVirtualButtonDown('panel:p:heben', 'heben');
  assert.equal(e.heldKeys.has('Q'), true);
  e.handleVirtualButtonUp('panel:p:heben');
  assert.equal(e.heldKeys.has('Q'), false);
});

test('MappingEngine: ControlHub-Aktionen laufen sofort, der Rest normal', () => {
  const funcs = { licht: { id: 'licht', actions: [{ type: 'keyboard', key: 'L' }] } };
  const e = new MappingEngine({ getFunction: id => funcs[id] || null });
  const ran = [];
  e.onHubAction = cmd => ran.push(cmd);
  e.handleVirtualButtonDown('panel:p:a', 'hub:tiles:next');
  e.handleVirtualButtonDown('panel:p:b', ['hub:profile:Pflügen', 'licht']);
  assert.deepEqual(ran, ['tiles:next', 'profile:Pflügen']);
  assert.equal(e.heldKeys.has('L'), true);
  e.handleVirtualButtonUp('panel:p:b');
  assert.equal(e.heldKeys.has('L'), false);
});
