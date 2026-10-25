// Bearbeitete Fläche je Spielstand und Fahrzeug (Test 23.10.2026, Anmerkungen 5, 6, 8, 13)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { Flaeche, arbeitsBalken, hauptBereich, ZELLE_M } from '../server/flaeche.js';

// Gerät 6 m breit, Balken 4 m hinter dem Fahrzeug-Nullpunkt (quer + = links)
const GRUBBER = { name: 'Grubber', side: 'rear', depth: 1, lowered: true, on: null,
  areas: [{ type: 'DEFAULT', corners: [[-4, 3], [-4, -3], [-5, -3], [-5, 3]] }] };
const DRESCHER = { name: 'Lexion', side: 'self', depth: 0, lowered: null, on: true,
  areas: [{ type: 'COMBINECHOPPER', corners: [[-6, 5], [-6, -5], [-9, -5], [-9, 5]] }] };
const takt = (z, extra = {}) => ({ available: true, inVehicle: true, posX: 100, posZ: z, fwdX: 0, fwdZ: 1, vehicleName: 'Fendt', vehicleId: 'vehicleAAA', units: [GRUBBER], ...extra });

test('Arbeitsbalken: echter Arbeitsbereich, Auswurf des Mähdreschers zählt nicht (Anmerkung 6)', () => {
  assert.equal(hauptBereich(DRESCHER), null);
  assert.equal(arbeitsBalken(takt(0, { units: [DRESCHER] })).length, 0);
  const b = arbeitsBalken(takt(0));
  assert.equal(b.length, 1);
  assert.deepEqual(b[0].ends.map(p => p.map(v => Math.round(v * 10) / 10)), [[103, -4.5], [97, -4.5]]);
});

test('Arbeitsbalken: je Gerät „zählt als bearbeitet“ und „auf der Karte zeigen“ (Anmerkungen 5, 13)', () => {
  const gps = (o) => ({ gps: { geraete: { Grubber: o } } });
  assert.equal(arbeitsBalken(takt(0, { ...gps({ cov: 'an' }), units: [{ ...GRUBBER, canTurnOn: true, on: false }] })).length, 0, 'nur gesenkt, nicht an → zählt nicht');
  assert.equal(arbeitsBalken(takt(0, gps({ cov: 'gesenkt' }))).length, 1);
  assert.equal(arbeitsBalken(takt(0, gps({ map: false }))).length, 0, 'nicht auf der Karte → keine Fläche');
});

test('Arbeitsbalken: eingeklapptes Gerät zählt nicht, ausgeklappt oder ohne Klappen schon (Hendrik 24.10.2026)', () => {
  const mit = extra => arbeitsBalken(takt(0, { units: [{ ...GRUBBER, ...extra }] })).length;
  assert.equal(mit({ canFold: true, unfolded: false }), 0, 'eingeklappt');
  assert.equal(mit({ canFold: true, unfolded: false, folding: true }), 0, 'klappt gerade aus');
  assert.equal(mit({ canFold: true, unfolded: true }), 1, 'ausgeklappt');
  assert.equal(mit({ canFold: false, unfolded: null }), 1, 'kann nicht klappen');
  assert.equal(mit({ canFold: true, unfolded: null }), 1, 'Zustand unbekannt → wie bisher');
  // auch mit Handwerten im GPS-Menü
  const hand = { gps: { source: 'hand', unit: 'Grubber', corners: [[103, -4], [97, -4]], geraete: {} } };
  assert.equal(arbeitsBalken(takt(0, { ...hand, units: [{ ...GRUBBER, canFold: true, unfolded: false }] })).length, 0);
  assert.equal(arbeitsBalken(takt(0, { ...hand, units: [{ ...GRUBBER, canFold: true, unfolded: true }] })).length, 1);
});

test('Sämaschine: „Gesenkt und an“ hält sich ans Einschalten; Gerät ohne Ein/Aus zählt beim Absenken (Test 23.10.2026)', () => {
  const opt = { gps: { geraete: { Cirrus: { cov: 'beides' } } } };
  const saer = (low, on) => ({ ...GRUBBER, name: 'Cirrus', canTurnOn: true, lowered: low, on });
  assert.equal(arbeitsBalken(takt(0, { ...opt, units: [saer(true, false)] })).length, 0, 'gesenkt, aber aus → keine Fläche');
  assert.equal(arbeitsBalken(takt(0, { ...opt, units: [saer(false, true)] })).length, 0, 'an, aber oben → keine Fläche');
  assert.equal(arbeitsBalken(takt(0, { ...opt, units: [saer(true, true)] })).length, 1);
  const ohneAn = { ...GRUBBER, name: 'Cirrus', canTurnOn: false, on: null };
  assert.equal(arbeitsBalken(takt(0, { ...opt, units: [ohneAn] })).length, 1, 'kein Ein/Aus im Spiel → zählt beim Absenken');
  assert.equal(arbeitsBalken(takt(0, { ...opt, units: [{ ...ohneAn, lowered: false }] })).length, 0);
});

const zaehle = map => { let n = 0; for (const bits of map.values()) for (const b of bits) for (let i = 0; i < 8; i++) if (b & (1 << i)) n++; return n; };

test('Doppelt bearbeitet: zweite Überfahrt dunkler, nicht die Naht und nicht der zweite Balken derselben Fahrt (Hendrik 23.10.2026)', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-flaeche-'));
  const f = new Flaeche({ dir: () => dir, emit: () => {} });
  await f.setzeSpielstand('sp|doppelt');
  // Kombination: zwei Balken hintereinander (6 m Abstand) überdecken sich in derselben Fahrt
  const SAER = { ...GRUBBER, name: 'Säer', areas: [{ type: 'DEFAULT', corners: [[-10, 3], [-10, -3], [-11, -3], [-11, 3]] }] };
  for (let z = 0; z <= 60; z += 1) f.tick(takt(z, { units: [GRUBBER, SAER] }));
  const a = f.fahrzeuge.get('vehicleAAA');
  assert.ok(zaehle(a.kacheln) > 1000);
  assert.equal(zaehle(a.doppelt), 0, 'eine Überfahrt: nichts doppelt');
  // Rückweg 3 m daneben (halbe Breite überlappt) → der Streifen von 3 m Breite ist doppelt
  for (let z = 60; z >= 0; z -= 1) f.tick(takt(z, { posX: 103, fwdZ: -1 }));
  const n = zaehle(a.doppelt);
  // Überlappung x 100…103 (6 Kästchen) × z 4,5…55,5 (102 Kästchen; Grubber 4,5 m hinter dem Fahrzeug)
  assert.equal(n, 6 * 102, 'genau der überlappte Streifen ist doppelt');
  // stand() und Datei tragen „doppelt“
  assert.ok(Object.keys(f.stand(false).doppelt).length > 0);
  await f.speichern();
  const g = new Flaeche({ dir: () => dir, emit: () => {} });
  await g.setzeSpielstand('sp|doppelt');
  assert.equal(zaehle(g.fahrzeuge.get('vehicleAAA').doppelt), n, 'nach Neustart wieder da');
});

test('Fläche je Fahrzeug, gespeichert je Spielstand, nach Neustart wieder da (Anmerkung 8)', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-flaeche-'));
  const events = [];
  const f = new Flaeche({ dir: () => dir, emit: (e, p) => events.push([e, p]) });
  await f.setzeSpielstand('sp|MapUS|3');
  for (let z = 0; z <= 20; z += 1) f.tick(takt(z));
  const a = f.fahrzeuge.get('vehicleAAA');
  assert.ok(a, 'Fahrzeug über die feste Kennung');
  let zellen = 0;
  for (const bits of a.kacheln.values()) for (const b of bits) for (let i = 0; i < 8; i++) if (b & (1 << i)) zellen++;
  const flaeche = zellen * ZELLE_M * ZELLE_M;
  assert.ok(flaeche > 6 * 20 * 0.9 && flaeche < 6 * 20 * 1.1, `≈ 120 m², gemessen ${flaeche}`);
  // anderes Fahrzeug: eigene Fläche
  f.tick({ ...takt(0), vehicleId: 'vehicleBBB', vehicleName: 'Deutz' });
  for (let z = 0; z <= 5; z += 1) f.tick({ ...takt(z), vehicleId: 'vehicleBBB', vehicleName: 'Deutz' });
  assert.ok(f.fahrzeuge.get('vehicleBBB').kacheln.size > 0);
  assert.ok(events.some(([e, p]) => e === 'flaeche' && p.voll && p.fahrzeug === 'vehicleBBB'), 'Fahrzeugwechsel → volle Fläche des neuen Fahrzeugs');
  f.dirty = true;
  await f.speichern();
  // „Neustart“
  const g = new Flaeche({ dir: () => dir, emit: () => {} });
  await g.setzeSpielstand('sp|MapUS|3');
  assert.equal(g.fahrzeuge.get('vehicleAAA').kacheln.size, a.kacheln.size);
  // anderer Spielstand: leer
  await g.setzeSpielstand('sp|MapUS|4');
  assert.equal(g.fahrzeuge.size, 0);
  // löschen: nur das aktuelle Fahrzeug
  await g.setzeSpielstand('sp|MapUS|3');
  g.tick(takt(30));
  await g.loesche(false);
  assert.equal(g.fahrzeuge.has('vehicleAAA'), false);
  assert.equal(g.fahrzeuge.has('vehicleBBB'), true);
});

test('Sprung (Umsetzen) zeichnet kein Viereck', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-flaeche-'));
  const f = new Flaeche({ dir: () => dir, emit: () => {} });
  await f.setzeSpielstand('x');
  f.tick(takt(0));
  f.tick(takt(500));
  assert.equal(f.fahrzeuge.get('vehicleAAA')?.kacheln.size || 0, 0);
});
