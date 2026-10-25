// GPS-Menü: Gerätespeicher, Arbeitsbalken, Vorgewende-Auslöser (Umsetzungsplan Paket I).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { GpsManager, cleanSettings, cleanGpsConfig } from '../server/gpsManager.js';
import { GpsEngine, autoValues, footprint, vehicleFrame, workDepth, FieldIndex, aheadDistance, pickUnit } from '../server/gpsEngine.js';

const area = (S, Wd, H) => ({ type: 0, corners: [S, Wd, [Wd[0] + H[0] - S[0], Wd[1] + H[1] - S[1]], H] });
// Werte aus dem Spiel (ccProbeAttach 22.10.2026)
const PFLUG = { name: 'LEMKEN Juwel 6 M V 4+1', side: 'rear', depth: 1, selected: false, attach: 'mounted', pose: { along: -5.23, across: -0.01, angle: -0.1 },
  joint: { along: -2.4, across: 0 }, areas: [area([-2.87, -0.24], [-3.37, -1.47], [-6.23, 1.95]), area([-6.23, 1.95], [-6.85, 1.27], [-7.0, 1.95])] };
const SPRITZE = { name: 'Berthoud Vantage 4300', side: 'rear', depth: 1, selected: true, attach: 'trailed', pose: { along: -5.63, across: 0.43, angle: 6.6 },
  joint: { along: -2.6, across: 0 }, areas: [area([-6.22, 17.11], [-10.02, -15.67], [-6.67, 17.16])] };

async function manager() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-gps-'));
  const m = new GpsManager(path.join(dir, 'gps.json'));
  await m.initialize();
  return m;
}

test('Werte aus dem Spiel: breitester Arbeitsbereich, Seitenversatz + = rechts', () => {
  const p = autoValues(PFLUG);
  assert.equal(p.width, 3.42);
  assert.equal(p.lat, -0.24, 'Pflug links überstehend → Versatz nach links');
  assert.equal(p.attach, 'mounted');
  const s = autoValues(SPRITZE);
  assert.equal(s.width, 33, 'im eigenen Rahmen gemessen (23.10.2026); quer zum Traktor waren es bei 6,6° Knick 32,83 m');
  assert.equal(s.attach, 'trailed');
  assert.ok(s.drawbar > 2.9 && s.drawbar < 3.2);
  assert.equal(pickUnit([PFLUG, SPRITZE]).name, SPRITZE.name, 'ausgewähltes Gerät mit Arbeitsbereich zuerst');
});

test('Arbeitsbalken: echte Ecken, sonst Modell aus Handwerten', () => {
  const F = vehicleFrame({ posX: 100, posZ: 100, fwdX: 0, fwdZ: 1 });
  const live = cleanSettings({}, 'Test');
  const real = footprint(live, autoValues(PFLUG), F, {});
  assert.equal(real.source, 'spiel');
  assert.equal(real.corners.length, 4);
  const hand = footprint({ ...live, width: 6, pos: 4, attach: 'mounted', side: 'rear' }, { hitchAlong: -2 }, F, {});
  assert.equal(hand.source, 'hand');
  // Fahrt nach +z: Balken 6 m hinter dem Fahrzeug-Nullpunkt, 6 m breit quer
  assert.deepEqual(hand.corners.map(c => c.map(v => Math.round(v * 100) / 100)).sort((a, b) => a[0] - b[0]), [[97, 94], [103, 94]]);
});

test('Feld: Arbeitsfläche, Vorgewende, Abstand voraus', () => {
  const idx = new FieldIndex({ rev: 1, fields: [{ id: 7, pts: [[0, 0], [200, 0], [200, 200], [0, 200]] }] });
  const f = idx.at([50, 50]);
  assert.equal(f.id, 7);
  assert.equal(Math.round(workDepth(f, [100, 150], 12)), 38);
  assert.ok(workDepth(f, [100, 195], 12) < 0);
  assert.equal(idx.at([300, 50]), null);
  assert.equal(Math.round(aheadDistance(f, [100, 146], [0, 1], 12)), 42);
});

async function drive(engine, path) {
  const out = [];
  for (const [x, z, fx, fz] of path) {
    const data = { available: true, posX: x, posZ: z, fwdX: fx, fwdZ: fz, speed: 8, dir: 'F', base: { speedKmh: 8, direction: 'F' }, units: [] };
    engine.tick(data);
    out.push(data.gps);
  }
  return out;
}

test('Auslöser: Ausfahrt und Einfahrt je einmal, beim Wenden kein Doppelauslösen', async () => {
  const mgr = await manager();
  await mgr.patchLive({ armed: true, side: 'rear', attach: 'mounted', width: 6, pos: 4, headland: 12, overlap: 0,
    exit: { functionId: 'ausheben' }, entry: { functionId: 'absenken' } });
  const fired = [], events = [];
  const engine = new GpsEngine({ getManager: () => mgr, mapping: { fireAutomatic: (id) => { fired.push(id); return true; } }, emit: (e, p) => events.push([e, p.kind]) });
  engine.setMap({ rev: 1, fields: [{ id: 7, pts: [[0, 0], [200, 0], [200, 200], [0, 200]] }] });
  const path = [];
  for (let z = 120; z <= 196; z += 1) path.push([100, z, 0, 1]);           // hoch zum Vorgewende
  for (let i = 0; i < 6; i++) path.push([100, 196, 0, 1]);                 // stehen
  for (let z = 196; z >= 120; z -= 1) path.push([106, z, 0, -1]);          // gewendet, zurück ins Feld
  const gps = await drive(engine, path);
  assert.deepEqual(fired, ['ausheben', 'absenken']);
  assert.deepEqual(events.filter(e => e[0] === 'gps-trigger').map(e => e[1]), ['exit', 'entry']);
  // Ausfahrt bei Überlappung 0: sobald der Balken (2 m + 4 m hinter dem Nullpunkt) die Linie z = 188 erreicht
  const exitAt = path[gps.findIndex(g => g.state === 'headland')][1];
  assert.ok(exitAt >= 194 && exitAt <= 195, `Ausfahrt bei z=${exitAt}`);
});

test('Aktionen aus: rechnet, sendet keine Aktion, Signalton kommt trotzdem', async () => {
  const mgr = await manager();
  await mgr.patchLive({ side: 'rear', attach: 'mounted', width: 6, pos: 4, exit: { functionId: 'ausheben' } });
  assert.deepEqual([mgr.live.exitAct, mgr.live.entryAct, mgr.live.exitBeep, mgr.live.entryBeep], [false, false, true, true], 'neues Gerät: Aktionen aus, Ton an');
  await mgr.setConfig({ beep: 'armlehne' });
  const fired = [], events = [], beeps = [];
  const engine = new GpsEngine({ getManager: () => mgr, mapping: { fireAutomatic: (id) => { fired.push(id); return true; } }, emit: (e, p) => events.push(p),
    beepArmrest: (ms) => { beeps.push(ms); return Promise.resolve(); } });
  engine.setMap({ rev: 1, fields: [{ id: 7, pts: [[0, 0], [200, 0], [200, 200], [0, 200]] }] });
  const path = [];
  for (let z = 150; z <= 196; z += 1) path.push([100, z, 0, 1]);
  await drive(engine, path);
  assert.deepEqual(fired, []);
  assert.equal(events.find(p => p.kind === 'exit')?.sent, false);
  await new Promise(r => setTimeout(r, 250));
  assert.deepEqual(beeps, [70, 70], 'Signalton kommt auch bei Hauptschalter aus (Hendrik 22.10.2026); Ausfahrt = zwei kurze Töne (23.10.2026)');
});

test('Ton je Richtung: nur beim Einfahren -- beim Ausfahren still (Anmerkung 20)', async () => {
  const mgr = await manager();
  await mgr.patchLive({ side: 'rear', attach: 'mounted', width: 6, pos: 4, exitBeep: false });
  assert.deepEqual([mgr.live.exitBeep, mgr.live.entryBeep], [false, true]);
  await mgr.setConfig({ beep: 'beide' });
  const events = [], beeps = [];
  const engine = new GpsEngine({ getManager: () => mgr, mapping: { fireAutomatic: () => true }, emit: (e, p) => events.push(p),
    beepArmrest: (ms) => { beeps.push(ms); return Promise.resolve(); } });
  engine.setMap({ rev: 1, fields: [{ id: 7, pts: [[0, 0], [200, 0], [200, 200], [0, 200]] }] });
  const path = [];
  for (let z = 150; z <= 196; z += 1) path.push([100, z, 0, 1]);
  await drive(engine, path);
  await new Promise(r => setTimeout(r, 250));
  assert.equal(events.find(p => p.kind === 'exit')?.beep, 'aus', 'Tablet piept beim Ausfahren nicht');
  assert.deepEqual(beeps, [], 'Armlehne piept beim Ausfahren nicht');
});

test('GPS: alte Schreibweise umgerechnet, Optionen je angehängtem Gerät, Ton an/aus per Taste (Anmerkungen 13, 20, 21)', async () => {
  const mgr = await manager();
  await mgr.patchLive({ armed: true, beepWhen: 'ausfahrt' });
  assert.deepEqual([mgr.live.exitAct, mgr.live.entryAct, mgr.live.exitBeep, mgr.live.entryBeep], [true, true, true, false], 'Hauptschalter/beepWhen → je Richtung');
  // alte Datei: showOnMap/coverageWhen am GPS-Gerät ziehen zu den Optionen je Gerät im Spiel um
  const alt = cleanGpsConfig({ devices: { Frontgewicht: { match: 'Frontgewicht', showOnMap: false, coverageWhen: 'gesenkt', armed: true, beepWhen: 'aus' } } });
  assert.deepEqual(alt.einheiten.Frontgewicht, { map: false, cov: 'gesenkt' });
  assert.deepEqual([alt.devices.Frontgewicht.exitAct, alt.devices.Frontgewicht.exitBeep], [true, false]);
  const mgr2 = await manager();
  await mgr2.setEinheit('Anhänger', { map: false });
  await mgr2.setEinheit('Sämaschine', { cov: 'beides' });
  assert.deepEqual(mgr2.mapOptions(), { Anhänger: { map: false }, Sämaschine: { cov: 'beides' } });
  await mgr2.setEinheit('Anhänger', { map: true });
  assert.equal(mgr2.mapOptions().Anhänger, undefined, 'Standard wird nicht gespeichert');
  await mgr.setConfig({ beep: 'armlehne' });
  assert.equal('hinweise' in mgr.summary(), false, 'Meldungen beim Fahrzeugwechsel gibt es nicht mehr (24.10.2026)');
  assert.equal(await mgr.toggleBeep(), 'aus');
  assert.equal(await mgr.toggleBeep(), 'armlehne', 'zurück auf die letzte Ausgabe');
});

test('Überlappung: schräg anfahren -- 100 % löst später aus als 0 %', async () => {
  const at = async (overlap) => {
    const mgr = await manager();
    await mgr.patchLive({ armed: true, side: 'rear', attach: 'mounted', width: 8, pos: 2, headland: 10, overlap, exit: { functionId: 'x' } });
    const engine = new GpsEngine({ getManager: () => mgr, mapping: { fireAutomatic: () => true }, emit: () => {} });
    engine.setMap({ rev: 1, fields: [{ id: 1, pts: [[0, 0], [400, 0], [400, 400], [0, 400]] }] });
    const s = Math.SQRT1_2, path = [];
    for (let k = 0; k < 160; k++) path.push([200 + k * 0.5 * s, 350 + k * 0.5 * s, s, s]);   // 45° auf den Rand z = 400 zu
    const gps = await drive(engine, path);
    return gps.findIndex(g => g.state === 'headland');
  };
  const early = await at(0), late = await at(100);
  assert.ok(early > 0 && late > early, `0 %: Schritt ${early}, 100 %: Schritt ${late}`);
});

test('Gerätespeicher: jede Änderung gleich gespeichert, automatisch laden, Export/Import, Löschen (24.10.2026)', async () => {
  const mgr = await manager();
  assert.equal(await mgr.onUnitChanged('Pflug A').then(r => r.created), 'Pflug A');
  assert.equal(mgr.config.devices['Pflug A'], undefined, 'neu und unverändert: noch nicht angelegt');
  await mgr.patchLive({ width: 3.5 });
  assert.equal(mgr.config.devices['Pflug A'].width, 3.5, 'erste Änderung legt das Gerät an');
  assert.equal(mgr.config.current, 'Pflug A');
  await mgr.patchLive({ headland: 20 });
  assert.equal(mgr.isDirty(), false, 'nie „geändert – noch nicht gespeichert“');
  assert.equal(mgr.config.devices['Pflug A'].headland, 20);
  const r = await mgr.onUnitChanged('Spritze B');
  assert.equal(r.created, 'Spritze B', 'anderes Gerät angehängt: wird sofort geladen, nichts wartet');
  assert.equal(mgr.summary().wartet, null);
  assert.equal(mgr.live.exitAct, false);
  await mgr.patchLive({ width: 24 });
  assert.deepEqual(await mgr.onUnitChanged('Pflug A'), { loaded: 'Pflug A' });
  assert.equal(mgr.live.headland, 20);
  assert.equal(mgr.config.devices['Spritze B'].width, 24);
  const exp = mgr.exportDevice('Spritze B');
  assert.equal(await mgr.importDevice(exp), 'Spritze B (2)');
  await assert.rejects(() => mgr.remove('Pflug A'), /geladene Gerät/);
  await mgr.remove('Spritze B (2)');
  assert.deepEqual(mgr.summary().devices.map(d => d.name), ['Pflug A', 'Spritze B']);
});

test('Angehängtes Gerät: Werte im eigenen Rahmen, Richtung aus dem Knickwinkel (Test 23.10.2026, Anmerkung 7)', () => {
  // Gerät 6 m breit, Balken 5 m hinter der Kupplung (Kupplung 2 m hinter dem Fahrzeug-Nullpunkt)
  const unitAt = (deg) => {
    const t = deg * Math.PI / 180, cs = Math.cos(t), sn = Math.sin(t);
    const J = { along: -2, across: 0 };
    const rel = (la, lc) => [J.along + la * cs + lc * sn, J.across - la * sn + lc * cs];
    const [pa, pc] = rel(-1, 0);
    return { name: 'Grubber', side: 'rear', depth: 1, attach: 'trailed', joint: J, pose: { along: pa, across: pc, angle: deg },
      areas: [{ type: 'DEFAULT', corners: [rel(-5, 3), rel(-5, -3), rel(-5.5, 3)] }] };
  };
  const gerade = autoValues(unitAt(0)), kurve = autoValues(unitAt(30));
  assert.equal(gerade.width, 6);
  assert.equal(kurve.width, 6, 'Breite bleibt beim Abknicken gleich');
  assert.equal(kurve.lat, gerade.lat);
  assert.equal(kurve.pos, gerade.pos, 'Abstand bleibt beim Abknicken gleich');
  // Handwert (Breite) → Modell; Mitte des Balkens liegt hinter der Kupplung in Geräterichtung
  const F = { x: 0, z: 0, fx: 0, fz: 1 };
  const live = { side: 'auto', attach: 'auto', pos: null, lat: null, width: 6, drawbar: null };
  const fp = footprint(live, kurve, F, {}, 0);
  const C = [(fp.corners[0][0] + fp.corners[1][0]) / 2, (fp.corners[0][1] + fp.corners[1][1]) / 2];
  const t = 30 * Math.PI / 180;
  const g = [F.fx * Math.cos(t) - F.fz * Math.sin(t), F.fx * Math.sin(t) + F.fz * Math.cos(t)];
  const H = [0, -2];
  assert.ok(Math.hypot(C[0] - (H[0] - g[0] * kurve.pos), C[1] - (H[1] - g[1] * kurve.pos)) < 0.01, `Mitte ${C}`);
});

test('Automatisch speichern: alte Datei mit offenen Änderungen beim Start übernommen, unverändertes neues Gerät nicht angelegt (24.10.2026)', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-gps-'));
  const file = path.join(dir, 'gps.json');
  await fs.writeFile(file, JSON.stringify({ version: 1, current: 'Grubber', devices: { Grubber: { name: 'Grubber', match: 'Grubber', width: 5 } },
    live: { name: 'Grubber', match: 'Grubber', width: 6 } }));
  const mgr = new GpsManager(file);
  await mgr.initialize();
  assert.equal(mgr.isDirty(), false);
  assert.equal(mgr.config.devices.Grubber.width, 6, 'was zuletzt eingestellt war, gilt als gespeichert');
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).devices.Grubber.width, 6);
  // neues Gerät angehängt, nichts geändert, gleich das nächste: das erste wird nicht angelegt
  assert.deepEqual(await mgr.onUnitChanged('Sämaschine'), { created: 'Sämaschine' });
  assert.deepEqual(await mgr.onUnitChanged('Walze'), { created: 'Walze' });
  assert.deepEqual(Object.keys(mgr.config.devices), ['Grubber']);
  // wechsle() gibt es weiter (für ältere Oberflächen), es wartet aber nichts
  await assert.rejects(() => mgr.wechsle(true), /wartet kein Gerät/);
});

test('GPS-Geräte von Hand: anlegen, bearbeiten (auch Name/„Gehört zu“), festes GPS-Gerät (Anmerkung 21)', async () => {
  const mgr = await manager();
  const name = await mgr.createDevice({ name: 'Grubber 6 m', match: '', side: 'rear', attach: 'trailed', width: 6, pos: 5, drawbar: 3 });
  assert.equal(name, 'Grubber 6 m');
  assert.equal(mgr.config.devices[name].match, '', 'keinem Gerät im Spiel zugeordnet');
  // zuordnen und umbenennen
  const neu = await mgr.updateDevice(name, { name: 'Grubber Lemken', match: 'Lemken Karat', width: 6.5 });
  assert.equal(neu, 'Grubber Lemken');
  assert.equal(mgr.config.devices['Grubber 6 m'], undefined);
  assert.deepEqual([mgr.config.devices[neu].match, mgr.config.devices[neu].width, mgr.config.devices[neu].attach], ['Lemken Karat', 6.5, 'trailed']);
  await mgr.save();   // aktuelles (automatisch angelegtes) Gerät speichern, damit nichts offen ist
  assert.deepEqual(await mgr.onUnitChanged('Lemken Karat'), { loaded: 'Grubber Lemken' }, 'lädt über „Gehört zu“');
  // geladenes Gerät bearbeiten → live ändert sich mit
  await mgr.updateDevice('Grubber Lemken', { width: 7 });
  assert.equal(mgr.live.width, 7);
  assert.equal(mgr.config.current, 'Grubber Lemken');
  // festes GPS-Gerät
  await mgr.setGpsEinheit('Frontgewicht');
  assert.equal(pickUnit([{ name: 'Pflug', side: 'rear', depth: 1, areas: [{ corners: [[0, 1], [0, -1]] }] }, { name: 'Frontgewicht', side: 'front' }], mgr.config.gpsEinheit).name, 'Frontgewicht');
  assert.equal(pickUnit([{ name: 'Pflug', side: 'rear', depth: 1, areas: [{ corners: [[0, 1], [0, -1]] }] }], 'Frontgewicht').name, 'Pflug', 'nicht angehängt → automatisch');
  await mgr.setGpsEinheit(null);
  assert.equal(mgr.config.gpsEinheit, null);
});

// Hendrik 24.10.2026: „die Arbeitsfläche verschiebt sich immer nur parallel zum Fahrzeug und knickt nicht ab“ -- mit
// einem Wert von Hand rechnet ControlHub den Balken selbst; Geräte mit Unterlenker-Deichsel führt das Spiel als
// „angebaut“, das Modell hielt den Balken dann starr quer zum Traktor
test('Balken mit Handwert knickt mit dem Gerät ab, auch wenn das Spiel es als angebaut führt; „angebaut“ von Hand bleibt starr', () => {
  const F = { x: 0, z: 0, fx: 0, fz: 1 };
  const winkel = fp => { const [L, R] = fp.corners; return Math.round(Math.atan2(L[1] - R[1], L[0] - R[0]) * 1800 / Math.PI) / 10; };
  const live = { side: 'auto', attach: 'auto', pos: null, lat: null, width: 30, drawbar: null };
  assert.equal(winkel(footprint(live, autoValues(SPRITZE), F, {}, 0)), 6.6, 'Anhängekupplung');
  assert.equal(winkel(footprint(live, autoValues({ ...SPRITZE, attach: 'mounted' }), F, {}, 0)), 6.6, 'Unterlenker-Deichsel');
  assert.equal(winkel(footprint({ ...live, attach: 'mounted' }, autoValues({ ...SPRITZE, attach: 'mounted' }), F, {}, 0)), 0, '„angebaut“ von Hand');
  assert.equal(Math.abs(winkel(footprint({ ...live, width: 3.4 }, autoValues(PFLUG), F, {}, 0))) <= 0.1, true, 'Pflug bleibt gerade');
});

test('Mähdrescher: Schneidwerk zählt, Auswurf (Häcksler/Schwad) nicht -- auch für GPS-Werte (Durchsicht 24.10.2026)', () => {
  const lexion = { name: 'Lexion', side: 'self', depth: 0, selected: true, areas: [{ type: 'COMBINECHOPPER', corners: [[-6, 6], [-6, -6], [-9, -6], [-9, 6]] }] };
  const vario = { name: 'Vario 930', side: 'front', depth: 1, attach: 'mounted', areas: [{ type: 'CUTTER', corners: [[5, 4.6], [5, -4.6], [4, -4.6], [4, 4.6]] }] };
  assert.equal(pickUnit([lexion, vario]).name, 'Vario 930', 'der Auswurf ist kein Arbeitsbereich');
  assert.equal(pickUnit([lexion]), null);
  assert.equal(autoValues(vario).width, 9.2);
});

// Versatz und Vorgewendeautomatik (Hendrik 24.10.2026)
async function fahrtMitVersatz(patch) {
  const mgr = await manager();
  await mgr.patchLive({ exitAct: true, entryAct: true, side: 'rear', attach: 'mounted', width: 6, pos: 4, headland: 12, overlap: 0,
    exit: { functionId: 'ausheben' }, entry: { functionId: 'absenken' }, ...patch });
  const fired = [];
  const engine = new GpsEngine({ getManager: () => mgr, mapping: { fireAutomatic: (id) => { fired.push(id); return true; } }, emit: () => {} });
  engine.setMap({ rev: 1, fields: [{ id: 7, pts: [[0, 0], [200, 0], [200, 220], [0, 220]] }] });   // Rand bei z = 220, Linie bei 208
  const bei = {};
  const schritt = async (z, fz) => {
    const vorher = fired.length;
    await drive(engine, [[100, z, 0, fz]]);
    if (fired.length > vorher) bei[fired[fired.length - 1]] = z;
  };
  for (let z = 150; z <= 218; z += 0.5) await schritt(z, 1);      // hoch zum Vorgewende (Balken 6 m hinter dem Nullpunkt)
  for (let z = 218; z >= 150; z -= 0.5) await schritt(z, -1);     // gewendet: jetzt liegt der Balken 6 m dahinter (+z)
  return { mgr, fired, bei };
}

test('Versatz: Ausfahrt −3 m löst 3 m vor der Linie aus, Einfahrt +2 m erst 2 m in der Arbeitsfläche, je einmal', async () => {
  const ohne = await fahrtMitVersatz({});
  assert.deepEqual(ohne.fired, ['ausheben', 'absenken']);
  // Linie bei z = 208: Ausfahrt, wenn der Balken (z − 6) sie überquert; Einfahrt rückwärts (Balken bei z + 6)
  assert.ok(Math.abs(ohne.bei.ausheben - 214) <= 0.5, `ohne Versatz: Ausfahrt bei ${ohne.bei.ausheben}`);
  assert.ok(Math.abs(ohne.bei.absenken - 202) <= 0.5, `ohne Versatz: Einfahrt bei ${ohne.bei.absenken}`);
  const mit = await fahrtMitVersatz({ exitOffset: -3, entryOffset: 2 });
  assert.deepEqual(mit.fired, ['ausheben', 'absenken'], 'je einmal, nichts doppelt');
  assert.ok(Math.abs(mit.bei.ausheben - 211) <= 0.5, `Ausfahrt −3 m bei ${mit.bei.ausheben}`);
  assert.ok(Math.abs(mit.bei.absenken - 200) <= 0.5, `Einfahrt +2 m bei ${mit.bei.absenken}`);
  const spaet = await fahrtMitVersatz({ exitOffset: 4, entryOffset: -5 });
  assert.deepEqual(spaet.fired, ['ausheben', 'absenken']);
  assert.ok(Math.abs(spaet.bei.ausheben - 218) <= 0.5, `Ausfahrt +4 m bei ${spaet.bei.ausheben}`);
  assert.ok(Math.abs(spaet.bei.absenken - 207) <= 0.5, `Einfahrt −5 m bei ${spaet.bei.absenken}`);
});

test('Versatz: 0,5-m-Schritte, höchstens ±10 m, gespeichert je Gerät', async () => {
  const mgr = await manager();
  await mgr.patchLive({ exitOffset: -3.3, entryOffset: 25 });
  assert.equal(mgr.live.exitOffset, -3.5);
  assert.equal(mgr.live.entryOffset, 10);
  assert.equal(mgr.config.devices[mgr.config.current].exitOffset, -3.5, 'automatisch gespeichert');
  await mgr.patchLive({ entryOffset: 'Unsinn' });
  assert.equal(mgr.live.entryOffset, 0);
});

test('Vorgewendeautomatik aus: keine Aktionen, Ton bleibt; umschalten per Taste', async () => {
  const mgr = await manager();
  assert.equal(mgr.config.automatik, true, 'Standard an');
  assert.equal(await mgr.toggleAutomatik(), false);
  assert.equal(mgr.summary().automatik, false);
  await mgr.patchLive({ exitAct: true, side: 'rear', attach: 'mounted', width: 6, pos: 4, exit: { functionId: 'ausheben' } });
  await mgr.setConfig({ beep: 'armlehne' });
  const fired = [], events = [], beeps = [];
  const engine = new GpsEngine({ getManager: () => mgr, mapping: { fireAutomatic: (id) => { fired.push(id); return true; } }, emit: (e, p) => events.push(p),
    beepArmrest: (ms) => { beeps.push(ms); return Promise.resolve(); } });
  engine.setMap({ rev: 1, fields: [{ id: 7, pts: [[0, 0], [200, 0], [200, 200], [0, 200]] }] });
  const path = [];
  for (let z = 150; z <= 196; z += 1) path.push([100, z, 0, 1]);
  const gps = await drive(engine, path);
  assert.deepEqual(fired, []);
  assert.equal(gps.at(-1).automatik, false);
  assert.equal(gps.at(-1).armed, false, 'Vorgewende-Aktionen an = nur mit Automatik');
  assert.equal(events.find(p => p.kind === 'exit')?.armed, false);
  await new Promise(r => setTimeout(r, 250));
  assert.equal(beeps.length, 2, 'Ton kommt trotzdem');
  await mgr.setConfig({ automatik: true });
  assert.equal(mgr.config.automatik, true);
});

test('Erweitertes Feld: Feldgrenze der Spurführung statt Kartenumriss (Hendrik 24.10.2026, mit dem Pflug vergrößert)', async () => {
  const mgr = await manager();
  await mgr.patchLive({ armed: true, side: 'rear', attach: 'mounted', width: 6, pos: 4, headland: 12, overlap: 0,
    exit: { functionId: 'ausheben' }, entry: { functionId: 'absenken' } });
  const fahrt = async (kurs) => {
    const fired = [];
    const engine = new GpsEngine({ getManager: () => mgr, mapping: { fireAutomatic: (id) => { fired.push(id); return true; } }, emit: () => {} });
    engine.setMap({ rev: 1, fields: [{ id: 7, pts: [[0, 0], [200, 0], [200, 200], [0, 200]] }] });   // Feld laut Karte
    engine.setKurs(kurs);
    const path = [];
    for (let z = 120; z <= 256; z += 1) path.push([100, z, 0, 1]);
    const gps = await drive(engine, path);
    return { engine, fired, gps, path };
  };
  // im Spiel um 60 m nach Norden erweitert; die Spurführung kennt die neue Grenze
  const erweitert = await fahrt({ boundary: [[0, 0], [200, 0], [200, 260], [0, 260]], segments: [] });
  const exitAt = erweitert.path[erweitert.gps.findIndex(g => g.state === 'headland')][1];
  assert.ok(exitAt >= 253 && exitAt <= 255, `Vorgewende an der neuen Kante (Linie 248 + 6 m Balken), war bei z=${exitAt}`);
  assert.deepEqual(erweitert.fired, ['ausheben']);
  const imAnbau = erweitert.gps[erweitert.path.findIndex(p => p[1] === 230)];
  assert.equal(imAnbau.fieldId, 7, 'im erweiterten Teil weiter Feld 7');
  assert.equal(imAnbau.feldGrenze, 'spurfuehrung');
  assert.ok(erweitert.engine.feldAn([100, 230]), 'Teilbreiten/Fläche: der Anbau zählt als Feld');
  assert.equal(erweitert.engine.feldAn([100, 270]), null);
  // ohne Spurführung wie bisher: Vorgewende an der Kante laut Karte
  const ohne = await fahrt(null);
  const exitOhne = ohne.path[ohne.gps.findIndex(g => g.state === 'headland')][1];
  assert.ok(exitOhne >= 194 && exitOhne <= 195, `ohne Spurführung bei z=${exitOhne}`);
  assert.equal(ohne.gps[ohne.path.findIndex(p => p[1] === 150)].feldGrenze, 'karte');
  // Grenze eines anderen Felds: gilt hier nicht
  const fremd = await fahrt({ boundary: [[500, 500], [600, 500], [600, 600]] });
  assert.equal(fremd.gps[fremd.path.findIndex(p => p[1] === 150)].feldGrenze, 'karte');
});
