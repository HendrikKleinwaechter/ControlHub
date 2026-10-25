// Weg der Spieldaten Mod → Server (Prüfung 23.10.2026): Parser mit halber Datei, Kursdatei, „nicht verfügbar“ gedrosselt,
// keine überlappenden Abfragen, Ordnerwechsel, zu Fuß unbekannt statt Ersatzwerte, Karte neu nach Spielneustart,
// GPS-Zustand bei Fahrzeugwechsel/Sprung/Spiel weg.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { TelemetryReader, parseHudXml, parseWorldXml, parsePlanXml, parseCourseXml, parseMapXml } from '../server/telemetryReader.js';
import { toBase } from '../server/telemetryBase.js';
import { GpsManager } from '../server/gpsManager.js';
import { GpsEngine } from '../server/gpsEngine.js';
import '../public/js/werteliste.js';

const W = globalThis.Werteliste;
const v = (id, d) => W.value(W.get('fs25', id), d);
const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'cc-daten-'));
const hud = (attrs) => `<?xml version="1.0" encoding="utf-8" standalone="no"?>\n<hud ${Object.entries(attrs).map(([k, x]) => `${k}="${x}"`).join(' ')}/>\n`;

// ---------- Parser ----------
test('Parser: halb geschriebene Dateien werden verworfen, vollständige gelesen', () => {
  const world = '<world rev="4">\n    <e kind="player" name="Mia" farm="2" x="1" z="2"/>\n</world>\n';
  assert.equal(parseWorldXml(world).entities.length, 1);
  assert.equal(parseWorldXml(world.slice(0, world.indexOf('</world>'))), null, 'ohne </world> = halbe Datei');
  assert.deepEqual(parseWorldXml('<world rev="5"/>').entities, [], 'leer und selbstschließend ist vollständig');

  const plan = '<plan rev="2" lime="true">\n    <field id="34" area="6" phase="erntereif" fruit="Weizen" points="9" tasks="harvest:0.56" live="true"/>\n</plan>\n';
  assert.equal(parsePlanXml(plan).fields[0].live, true);
  assert.equal(parsePlanXml(plan.slice(0, 60)), null);
  assert.equal(parsePlanXml(plan.slice(0, plan.indexOf('</plan>'))), null, 'Felder da, aber ohne </plan>');
  assert.deepEqual(parsePlanXml('<plan rev="3" lime="false"/>').fields, []);
  // Mod 0.7.9: Sitzung im Planer, Version der Mod, Server-Merker der Karte
  assert.equal(parsePlanXml('<plan rev="3" session="s-1"/>').session, 's-1');
  assert.equal(parseHudXml(hud({ format: 3, seq: 1, mv: '0.7.9.0' })).modVersion, '0.7.9.0');
  assert.equal(parseHudXml(hud({ format: 3, seq: 1 })).modVersion, null, 'ältere Mod: keine Version');
  assert.equal(parseHudXml(hud({ format: 3, seq: 1, mv: '<script>' })).modVersion, null, 'nur Versionsnummern');
  const karte = s => parseMapXml(`<map name="K" savegame="3" savegameName="X" mapId="M" mp="true"${s}></map>`).savegame.server;
  assert.deepEqual([karte(' server="true"'), karte(' server="false"'), karte('')], [true, false, null]);

  assert.equal(parseCourseXml('<course boundary="0,0|100,0|10'), null);
  assert.deepEqual(parseCourseXml('<course boundary="" implementWidth="-1.000000"/>').boundary, [], 'leere Kursdatei (kein Kurs)');

  assert.equal(parseHudXml('<hud speed="5" format="2" seq="3">\n    <unit name="Pflug"/>'), null, 'Format 2 ohne </hud>');
});

test('Parser: Füllstand -1 bleibt unbekannt, sonst 0..100', () => {
  assert.equal(parseHudXml(hud({ fill: -1 })).fill, -1);
  assert.equal(parseHudXml(hud({ fill: 50 })).fill, 50);
  assert.equal(parseHudXml(hud({ fill: 130 })).fill, 100);
  assert.equal(parseHudXml(hud({ speed: 3 })).fill, -1, 'fehlt das Feld, ist es unbekannt');
});

// ---------- Leser ----------
test('Kursdatei: lastCourseVersion erst nach erfolgreichem Lesen, danach erneuter Versuch', async () => {
  const dir = await tmp();
  const hudFile = path.join(dir, 'craftConsoleHud.xml'), courseFile = path.join(dir, 'craftConsoleCourse.xml');
  const courses = [];
  const r = new TelemetryReader(() => {}, c => courses.push(c), hudFile, courseFile);
  await fs.writeFile(hudFile, hud({ format: 3, seq: 1, courseVer: 1 }));
  await r.poll();
  assert.equal(courses.length, 0, 'Kursdatei fehlt noch');
  assert.equal(r.lastCourseVersion, -1, 'Version nicht als gelesen gemerkt');

  await fs.writeFile(courseFile, '<course boundary="0,0|100,0'); // halb geschrieben
  await fs.writeFile(hudFile, hud({ format: 3, seq: 2, courseVer: 1 }));
  r.courseFailedAt = 0; // Wartezeit für den neuen Versuch abgelaufen
  await r.poll();
  assert.equal(courses.length, 0);
  assert.equal(r.lastCourseVersion, -1);

  await fs.writeFile(courseFile, '<course boundary="0,0|100,0|100,100" implementWidth="6.000000" segMeta="1,100,0,1" segPositions="3,0|3,100"/>');
  await fs.writeFile(hudFile, hud({ format: 3, seq: 3, courseVer: 1 }));
  await r.poll();
  assert.equal(courses.length, 0, 'innerhalb der Wartezeit nicht in jedem Takt neu lesen');
  r.courseFailedAt = 0;
  await fs.writeFile(hudFile, hud({ format: 3, seq: 4, courseVer: 1 }));
  await r.poll();
  assert.equal(courses.length, 1);
  assert.equal(courses[0].boundary.length, 3);
  assert.equal(r.lastCourseVersion, 1);
  await fs.writeFile(hudFile, hud({ format: 3, seq: 5, courseVer: 1 }));
  await r.poll();
  assert.equal(courses.length, 1, 'gleiche Version nicht noch einmal');
});

test('„nicht verfügbar“: beim Wechsel sofort, danach höchstens 1×/s', async () => {
  const dir = await tmp();
  const updates = [];
  const r = new TelemetryReader(d => updates.push(d), null, path.join(dir, 'fehlt.xml'));
  for (let i = 0; i < 20; i++) await r.poll();
  assert.equal(updates.length, 1, '20 Abfragen ohne Datei → eine Meldung');
  assert.equal(updates[0].available, false);
  r.unavailableSentAt -= 1000;
  await r.poll();
  assert.equal(updates.length, 2, 'nach 1 s wieder eine');

  const ok = path.join(dir, 'craftConsoleHud.xml');
  await fs.writeFile(ok, hud({ format: 3, seq: 1, speed: 4 }));
  r.fixedXmlPath = ok;
  await r.poll();
  assert.equal(updates.at(-1).available, true);
  r.fixedXmlPath = path.join(dir, 'fehlt.xml');
  await r.poll(); await r.poll(); await r.poll();
  assert.equal(updates.filter(u => u.available === false).length, 3, 'Wechsel auf „weg“ wird sofort gemeldet, aber nur einmal');
});

test('Abfragen überlappen sich nicht', async () => {
  const dir = await tmp();
  const file = path.join(dir, 'craftConsoleHud.xml');
  await fs.writeFile(file, hud({ speed: 5, dir: 'F' })); // ohne seq (alte Mod) -- jede Abfrage würde melden
  const updates = [];
  const r = new TelemetryReader(d => updates.push(d), null, file);
  await Promise.all([r.poll(), r.poll(), r.poll()]);
  assert.equal(updates.length, 1);
  assert.equal(r.polling, false);
  await r.poll();
  assert.equal(updates.length, 2, 'danach geht es normal weiter');
});

test('Ordnerwechsel (Documents ↔ OneDrive): Einstellungen landen im neuen Ordner', async () => {
  const home = await tmp();
  const saved = { HOME: process.env.HOME, OneDrive: process.env.OneDrive, OneDriveConsumer: process.env.OneDriveConsumer };
  process.env.HOME = home;
  process.env.OneDrive = path.join(home, 'OneDrive');
  delete process.env.OneDriveConsumer;
  try {
    const modDir = (docs) => path.join(home, ...docs, 'My Games', 'FarmingSimulator2025', 'modSettings', 'FS25_CraftConsoleHUD');
    const A = modDir(['Documents']), B = modDir(['OneDrive', 'Documents']);
    for (const d of [A, B]) { await fs.mkdir(d, { recursive: true }); await fs.writeFile(path.join(d, 'craftConsoleHud.xml'), hud({ format: 3, seq: 1 })); }
    const old = new Date(Date.now() - 60000);
    await fs.utimes(path.join(A, 'craftConsoleHud.xml'), old, old); // B hat die frischere Datei

    const r = new TelemetryReader(() => {});
    assert.equal(r.dataDir, A);
    await r.writeModSettings(1, false);
    assert.ok(r.lastSettingsXml);
    await fs.access(path.join(A, 'craftConsoleSettings.xml'));
    await r.resolveDataDir();
    assert.equal(r.dataDir, B);
    const text = await fs.readFile(path.join(B, 'craftConsoleSettings.xml'), 'utf-8');
    assert.match(text, /clients="1"/, 'gleiche Einstellungen sofort auch im neuen Ordner');
  } finally {
    for (const [k, x] of Object.entries(saved)) { if (x === undefined) delete process.env[k]; else process.env[k] = x; }
  }
});

test('Umbenannte Mod (Mehrspieler, z. B. „FS25_CraftConsoleHUD (1)“): Ordner gefunden, Einstellungen dorthin', async () => {
  const home = await tmp();
  const saved = { HOME: process.env.HOME, OneDrive: process.env.OneDrive, OneDriveConsumer: process.env.OneDriveConsumer };
  process.env.HOME = home;
  delete process.env.OneDrive; delete process.env.OneDriveConsumer;
  try {
    const ms = path.join(home, 'Documents', 'My Games', 'FarmingSimulator2025', 'modSettings');
    const N = path.join(ms, 'FS25_CraftConsoleHUD'), U = path.join(ms, 'FS25_CraftConsoleHUD (1)');
    await fs.mkdir(path.join(ms, 'FS25_AndereMod'), { recursive: true });
    for (const d of [N, U]) { await fs.mkdir(d, { recursive: true }); await fs.writeFile(path.join(d, 'craftConsoleHud.xml'), hud({ format: 3, seq: 1 })); }
    const old = new Date(Date.now() - 60000);
    await fs.utimes(path.join(N, 'craftConsoleHud.xml'), old, old);   // die Mod schreibt gerade in den umbenannten Ordner
    const r = new TelemetryReader(() => {});
    assert.equal(r.dataDir, N, 'zuerst der übliche Ordner');
    await r.resolveDataDir();
    assert.equal(r.dataDir, U);
    await r.writeModSettings(1, false);
    assert.match(await fs.readFile(path.join(U, 'craftConsoleSettings.xml'), 'utf-8'), /clients="1"/);
  } finally {
    for (const [k, x] of Object.entries(saved)) { if (x === undefined) delete process.env[k]; else process.env[k] = x; }
  }
});

test('Planer einer anderen Sitzung wird übersprungen (Mod 0.7.9, plan#session)', async () => {
  const home = await tmp();
  const saved = { HOME: process.env.HOME, OneDrive: process.env.OneDrive, OneDriveConsumer: process.env.OneDriveConsumer };
  process.env.HOME = home;
  delete process.env.OneDrive; delete process.env.OneDriveConsumer;
  try {
    const dir = path.join(home, 'Documents', 'My Games', 'FarmingSimulator2025', 'modSettings', 'FS25_CraftConsoleHUD');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'craftConsoleHud.xml'), hud({ format: 3, seq: 1, session: 'neu', mv: '0.7.9.0' }));
    await fs.writeFile(path.join(dir, 'craftConsolePlan.xml'), '<plan rev="1" session="alt"><field id="7" phase="wachsen"/></plan>');
    const plaene = [];
    const r = new TelemetryReader(() => {});
    r.onPlan = p => plaene.push(p);
    await r.poll();
    assert.equal(r.session, 'neu');
    assert.equal(r.modVersion, '0.7.9.0');
    // Karte/Planer liest poll() nebenher (ohne await) -- hier gezielt abwarten
    r.planFilesCheckedAt = 0;
    await r.pollMapAndWorld();
    assert.equal(plaene.length, 0, 'Planer der alten Sitzung nicht übernommen');
    await fs.writeFile(path.join(dir, 'craftConsolePlan.xml'), '<plan rev="2" session="neu"><field id="7" phase="wachsen"/></plan>');
    const spaeter = new Date(Date.now() + 5000); await fs.utimes(path.join(dir, 'craftConsolePlan.xml'), spaeter, spaeter);
    r.planFilesCheckedAt = 0;
    await r.pollMapAndWorld();
    assert.equal(plaene.length, 1);
    assert.equal(plaene[0].rev, 2);
  } finally {
    for (const [k, x] of Object.entries(saved)) { if (x === undefined) delete process.env[k]; else process.env[k] = x; }
  }
});

// ---------- Zu Fuß / Grundwerte / Werteliste ----------
function onFootData() {
  return parseHudXml(hud({
    format: 3, seq: 9, inVehicle: 'false', speed: 0, dir: 'N', fill: -1, cruise: -1, steerOn: 'false', motorOn: 'false',
    handbrake: 'false', cruiseState: -1, lightsMask: -1, terrainSize: -1, farmlandId: -1,
    envHour: 14, envMinute: 5, envSeason: 1, envSunOn: 'true', money: -2500, temperature: '18.5', weather: 'cloudy'
  }));
}

test('Grundwerte zu Fuß: Fahrzeugwerte unbekannt, Zeit/Wetter/Konto bleiben; Minus-Kontostand zulässig', () => {
  const d = onFootData();
  const b = toBase({ ...d, available: true }, 'fs25');
  assert.equal(b.inVehicle, false);
  for (const k of ['speedKmh', 'direction', 'rpm', 'gear', 'motorOn', 'handbrake', 'aiActive', 'lights', 'position', 'turn', 'fuel']) {
    assert.equal(b[k], null, k);
  }
  assert.deepEqual(b.cruise, { active: null, speedKmh: null });
  assert.deepEqual(b.gameTime, { hour: 14, minute: 5 });
  assert.equal(b.weather.type, 'cloudy');
  assert.equal(b.money, -2500, 'Minus-Kontostand');
  assert.equal(toBase({ ...d, money: -1, available: true }, 'fs25').money, null, '-1 = unbekannt');
  const inV = toBase({ ...d, inVehicle: true, speed: 12, dir: 'F', motorOn: true, available: true }, 'fs25');
  assert.equal(inV.speedKmh, 12);
  assert.equal(inV.motorOn, true);
});

test('Werteliste zu Fuß: Füllstand, Spurführung, Tempo unbekannt; Tageslicht nur mit Uhrzeit; Flurstück 255 = keins', () => {
  const d = onFootData();
  d.available = true;
  d.base = toBase(d, 'fs25');
  assert.equal(v('sel_fill', d), null);
  assert.equal(v('steer_on', d), null);
  assert.equal(v('speed', d), null);
  assert.equal(v('dir', d), null);
  assert.equal(v('motor_on', d), null);
  assert.equal(v('daylight', d), true, 'Mod 0.5.1 liefert die Uhrzeit auch zu Fuß');
  assert.equal(v('clock', d), '14:05');
  assert.equal(v('money', d), -2500);
  assert.equal(W.format(W.get('fs25', 'money'), v('money', d)), '-2.500');
  assert.equal(v('daylight', { ...d, envHour: -1, envSunOn: false }), null, 'ältere Mod zu Fuß: ohne Uhrzeit kein „Nacht“');

  const inV = { ...d, inVehicle: true, fill: 40, steerOn: true, farmlandId: 255 };
  inV.base = toBase(inV, 'fs25');
  assert.equal(v('sel_fill', inV), 40);
  assert.equal(v('steer_on', inV), true);
  assert.equal(v('sel_fill', { ...inV, fill: -1 }), null, 'kein Gerät');
  // Gewähltes Gerät: gesenkt/eingeschaltet für Bedingungen (Hendrik 23.10.2026)
  assert.equal(v('sel_low', { ...inV, impLow: 1, impOn: 0 }), true);
  assert.equal(v('sel_on', { ...inV, impLow: 1, impOn: 0 }), false);
  assert.equal(v('sel_low', { ...inV, impLow: -1, units: [{ name: 'Pflug', selected: true, lowered: false }] }), false, 'Rückweg über die Gerätekette');
  assert.equal(v('sel_low', { ...inV, impLow: -1, units: [] }), null, 'kann nicht gesenkt werden → unbekannt');
  assert.equal(v('sel_name', { ...inV, units: [{ name: 'Pflug', selected: true }] }), 'Pflug');
  assert.equal(v('sel_unfolded', { ...inV, units: [{ name: 'Spritze', selected: true, unfolded: true }] }), true);
  assert.equal(v('sel_low', { ...inV, inVehicle: false, impLow: 1 }), null, 'zu Fuß unbekannt');
  assert.equal(v('farmland', inV), null, '255 = kein Flurstück');
  assert.equal(v('farmland', { ...inV, farmlandId: 12 }), 12);
});

// ---------- GPS ----------
const SQUARE = [[0, 0], [200, 0], [200, 200], [0, 200]];

test('setMap: gleiche rev, anderer Inhalt (Spielneustart) → neu laden; gleicher Inhalt → behalten', () => {
  const e = new GpsEngine({ getManager: () => null, mapping: {}, emit: () => {} });
  e.setMap({ rev: 1, name: 'Riverbend', myFarm: 1, savegame: { index: 3, dir: 'savegame3', mapId: 'MapUS', name: 'A' }, fields: [{ id: 7, owner: 1, pts: SQUARE }] });
  const first = e.index;
  assert.equal(first.at([50, 50]).id, 7);
  e.setMap({ rev: 1, name: 'Riverbend', myFarm: 1, savegame: { index: 3, dir: 'savegame3', mapId: 'MapUS', name: 'A' }, fields: [{ id: 7, owner: 1, pts: SQUARE }] });
  assert.equal(e.index, first, 'gleicher Inhalt: nichts neu');
  e.setMap({ rev: 1, name: 'Hutan Pantai', myFarm: 1, savegame: { index: 5, dir: 'savegame5', mapId: 'MapAS', name: 'B' },
    fields: [{ id: 12, owner: 1, pts: [[1000, 1000], [1100, 1000], [1100, 1100], [1000, 1100]] }] });
  assert.notEqual(e.index, first);
  assert.equal(e.index.at([50, 50]), null);
  assert.equal(e.index.at([1050, 1050]).id, 12);
  e.setMap({ rev: 1, name: 'Hutan Pantai', myFarm: 1, savegame: { index: 5, dir: 'savegame5', mapId: 'MapAS', name: 'B' },
    fields: [{ id: 12, owner: 1, pts: [[1000, 1000], [1100, 1000], [1100, 1100], [1000, 1100]] }, { id: 13, owner: 0, pts: SQUARE }] });
  assert.equal(e.index.fields.length, 2, 'gleiche rev, ein Feld mehr');
});

async function gpsSetup() {
  const dir = await tmp();
  const mgr = new GpsManager(path.join(dir, 'gps.json'));
  await mgr.initialize();
  await mgr.patchLive({ armed: true, side: 'rear', attach: 'mounted', width: 6, pos: 4, headland: 12, overlap: 0,
    exit: { functionId: 'ausheben' }, entry: { functionId: 'absenken' } });
  const fired = [];
  const engine = new GpsEngine({ getManager: () => mgr, mapping: { fireAutomatic: (id) => { fired.push(id); return true; } }, emit: () => {} });
  engine.setMap({ rev: 1, fields: [{ id: 7, pts: SQUARE }] });
  const tick = (z, vehicleName = 'Fendt 724', x = 100) => {
    const data = { available: true, vehicleName, posX: x, posZ: z, fwdX: 0, fwdZ: 1, speed: 8, dir: 'F', base: { speedKmh: 8, direction: 'F' }, units: [] };
    engine.tick(data);
    return data.gps;
  };
  return { engine, fired, tick };
}

test('GPS: Fahrzeugwechsel ordnet neu ein -- keine „Ausfahrt“ ohne echte Einfahrt', async () => {
  const { fired, tick } = await gpsSetup();
  for (let z = 160; z <= 180; z++) assert.equal(tick(z).state, 'work');   // Balken (6 m hinter dem Fahrzeug) vor dem Vorgewende
  const g = tick(196, 'John Deere 8R');                                    // anderes Fahrzeug, Balken im Vorgewende
  assert.equal(g.state, 'headland');
  assert.deepEqual(fired, []);
});

test('GPS: Positionssprung über 20 m und „Spiel weg“ setzen den Zustand zurück', async () => {
  const { engine, fired, tick } = await gpsSetup();
  tick(150);
  assert.equal(tick(151).state, 'work');
  assert.equal(tick(196).state, 'headland', 'Sprung 45 m: neu eingeordnet');
  assert.deepEqual(fired, []);

  const s2 = await gpsSetup();
  s2.tick(179); s2.tick(180);
  s2.engine.tick({ available: false });
  assert.equal(s2.engine.st.state, null);
  assert.equal(s2.tick(196).state, 'headland');
  assert.deepEqual(s2.fired, [], 'nach „Spiel weg“ keine Ausfahrt');

  // Gegenprobe: normal durchgefahren löst weiterhin genau einmal aus
  const s3 = await gpsSetup();
  for (let z = 170; z <= 196; z++) s3.tick(z);
  assert.deepEqual(s3.fired, ['ausheben']);
  void engine;
});

// Durchsicht 24.10.2026
test('Parser: „>“ in Namen schneidet die Zeile nicht ab (Fahrzeug, Gerät, Füllung, Feld)', () => {
  const d = parseHudXml('<hud format="3" seq="5" vehicleName="Fendt > 724" warn="Tank > 90 %" speed="12" inVehicle="true">'
    + '<unit name="Spritze > 24 m" kind="sprayer" side="rear" depth="1" on="true"><fill name="Wasser" level="5" capacity="10"/></unit>'
    + '<unit name="Gewicht" side="front" depth="1"/></hud>');
  assert.equal(d.vehicleName, 'Fendt > 724');
  assert.equal(d.warn, 'Tank > 90 %');
  assert.equal(d.speed, 12, 'Werte hinter dem „>“ kommen an');
  assert.deepEqual(d.units.map(u => [u.name, u.on, u.fills.length]), [['Spritze > 24 m', true, 1], ['Gewicht', null, 0]]);
  const m = parseMapXml('<map name="Karte > 1" session="9-1" size="2048"><farm id="1" name="Hof > A" color="#112233"/><field id="3" owner="1" area="2" x="1" z="2"/></map>');
  assert.deepEqual([m.name, m.session, m.farms[0].name, m.fields[0].id], ['Karte > 1', '9-1', 'Hof > A', 3]);
  assert.equal(parsePlanXml('<plan rev="2"><field id="4" fruit="Mais > Silo" phase="waechst" points="9"/></plan>').fields[0].fruit, 'Mais > Silo');
});

test('Karte und Straßennetz nur aus der laufenden Sitzung (Spielstandwechsel, Mitspieler)', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-sitzung-'));
  await fs.writeFile(path.join(dir, 'craftConsoleMap.xml'), '<map name="Alt" session="1-1" size="2048"></map>');
  await fs.writeFile(path.join(dir, 'craftConsoleRoads.xml'), '<roads session="1-1" count="1"><r p="0,0|5,5"/></roads>');
  const r = new TelemetryReader(() => {}, null);
  const karten = [], strassen = [];
  r.onMap = k => karten.push(k); r.onRoads = s => strassen.push(s);
  r.dataDir = dir; r.session = '2-2';
  await r.pollMapAndWorld();
  assert.equal(karten.length + strassen.length, 0, 'Dateien der alten Sitzung bleiben liegen');
  // die Mod schreibt die neue Karte
  await fs.writeFile(path.join(dir, 'craftConsoleMap.xml'), '<map name="Neu" session="2-2" size="2048"></map>');
  const t = Date.now() + 5000; await fs.utimes(path.join(dir, 'craftConsoleMap.xml'), t / 1000, t / 1000);
  r.mapCheckedAt = 0; r.roadsCheckedAt = 0;
  await r.pollMapAndWorld();
  assert.deepEqual(karten.map(k => k.name), ['Neu']);
  assert.equal(strassen.length, 0, 'Straßennetz der alten Sitzung weiter nicht');
  // ältere Mod ohne Kennung: wie bisher
  await fs.writeFile(path.join(dir, 'craftConsoleRoads.xml'), '<roads count="1"><r p="0,0|5,5"/></roads>');
  await fs.utimes(path.join(dir, 'craftConsoleRoads.xml'), t / 1000 + 1, t / 1000 + 1);
  r.roadsCheckedAt = 0;
  await r.pollMapAndWorld();
  assert.equal(strassen.length, 1);
});

test('Früchte des Spiels in der Karte, interner Name je Feld (Mod 0.7.4)', () => {
  const m = parseMapXml('<map name="K" size="2048" session="1-1"><fruit key="WHEAT" title="Weizen"/><fruit key="OILSEEDRADISH" title="Ölrettich"/><fruit title="ohne"/></map>');
  assert.deepEqual(m.fruits, [{ key: 'WHEAT', title: 'Weizen' }, { key: 'OILSEEDRADISH', title: 'Ölrettich' }]);
  assert.deepEqual(parseMapXml('<map name="K" size="2048"></map>').fruits, [], 'ältere Mod: keine Liste');
  const p = parsePlanXml('<plan rev="1"><field id="3" fruit="Weizen" fruitKey="WHEAT" phase="waechst" points="9"/><field id="4" fruit="Mais" phase="waechst" points="9"/></plan>');
  assert.deepEqual(p.fields.map(f => [f.fruit, f.fruitKey]), [['Weizen', 'WHEAT'], ['Mais', '']]);
});
