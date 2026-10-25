// Beispielprofile mit fertiger Belegung (24.10.2026): Daten im Programm, Aufbau der Profile, Hinzufügen ohne vorhandene
// Profile zu ändern, fehlende Funktionen aus der inputBinding.xml des Spiels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { funktionsId, ladeBeispielprofile, baueBeispielprofile, achsenVorlage, fuegeBeispielprofileHinzu, beispielStand, wendeNachtraegeAn } from '../server/beispielprofile.js';
import { MODULES } from '../server/config/modules.js';

test('Funktions-ID wie beim Einlesen der inputBinding.xml, Gegenrichtung mit -minus', () => {
  assert.equal(funktionsId('LOWER_IMPLEMENT'), 'func-fs-lower-implement');
  assert.equal(funktionsId('AXIS_FRONTLOADER_ARM-'), 'func-fs-axis-frontloader-arm-minus');
});

test('Mitgelieferte Beispielprofile FS25/CraftConsole: fünf Profile, Säen und Spritzen getrennt, Tasten gültig, Stick wie in der Firmware', async () => {
  const daten = await ladeBeispielprofile('fs25', 'craftconsole');
  assert.deepEqual(Object.keys(daten.profile), ['Bodenbearbeitung', 'Säen', 'Spritzen & Düngen', 'Ernte', 'Frontlader']);
  const erlaubt = new Set(MODULES.flatMap(m => { const [a, b] = m.buttonRange; return Array.from({ length: b - a + 1 }, (_, i) => a + i); }));
  for (const t of [daten.gemeinsam, ...Object.values(daten.profile).map(p => p.tasten)]) {
    for (const [nr, [aktion, name]] of Object.entries(t)) {
      assert.ok(erlaubt.has(Number(nr)), `Taste ${nr} gibt es nicht`);
      assert.match(aktion, /^[A-Z0-9_]+-?$/, `Aktion ${aktion}`);
      assert.ok(name, `Name zu ${aktion}`);
    }
  }
  // Stick hoch (23) / runter (24) = Hydraulik 1 +/− bzw. Arm heben/senken
  assert.deepEqual(daten.profile.Bodenbearbeitung.tasten['23'], ['AXIS_HYDRAULICATTACHER1', 'Hydraulik 1 +']);
  assert.deepEqual(daten.profile.Bodenbearbeitung.tasten['24'], ['AXIS_HYDRAULICATTACHER1-', 'Hydraulik 1 −']);
  assert.equal(daten.profile.Frontlader.tasten['23'][0], 'AXIS_FRONTLOADER_ARM');
  assert.equal(daten.profile.Säen.tasten['38'][0], 'TOGGLE_SEEDS');
  assert.equal(daten.profile['Spritzen & Düngen'].tasten['47'][0], 'AXIS_SPRAYER_ARM');
  assert.equal(await ladeBeispielprofile('fs25', '../x'), null, 'kein Pfad aus dem Ordner heraus');
  assert.equal(await ladeBeispielprofile('ets2', 'craftconsole'), null);
});

test('Profile bauen: gemeinsam + je Profil, 0-basiert, Achsen als eigene Kopie', () => {
  const achsen = { 0: { type: 'gamepad', axisId: 0 } };
  const p = baueBeispielprofile({ gemeinsam: { 1: ['A', 'a'], 2: ['B', 'b'] }, profile: { X: { beschreibung: 'x', tasten: { 2: ['C-', 'c'], 0: ['UNSINN', '?'] } } } }, achsen);
  assert.deepEqual(p, [{ name: 'X', description: 'x', buttons: { 0: 'func-fs-a', 1: 'func-fs-c-minus' }, axes: achsen }]);
  assert.notEqual(p[0].axes, achsen);
  assert.deepEqual(achsenVorlage({ name: 'leer', axes: {} }, [{ name: 'A', axes: {} }, { name: 'B', axes: achsen }]), { axes: achsen, von: 'B' });
  assert.deepEqual(achsenVorlage(null, []), { axes: {}, von: null });
});

test('Hinzufügen: vorhandenes Profil bleibt, fehlende Funktionen aus der inputBinding.xml des Spiels', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-bp-'));
  const spiel = path.join(home, 'Documents', 'My Games', 'FarmingSimulator2025');
  await fs.mkdir(spiel, { recursive: true });
  await fs.writeFile(path.join(spiel, 'inputBinding.xml'), `<inputBinding>
    <actionBinding action="LOWER_IMPLEMENT"><binding device="KB_MOUSE_DEFAULT" input="KEY_v" axisComponent="+" neutralInput="0" index="1"/></actionBinding>
    <actionBinding action="AXIS_FRONTLOADER_ARM"><binding device="KB_MOUSE_DEFAULT" input="KEY_KP_8" axisComponent="+" neutralInput="0" index="1"/>
      <binding device="KB_MOUSE_DEFAULT" input="KEY_KP_2" axisComponent="-" neutralInput="0" index="1"/></actionBinding>
  </inputBinding>`);
  const altHome = process.env.HOME;
  process.env.HOME = home;
  try {
    const gespeichert = {};
    const server = {
      gameManager: { activeId: 'fs25' }, controllerManager: { activeId: 'craftconsole' },
      profileManager: {
        profiles: { Ernte: { name: 'Ernte', buttons: { 0: 'eigen' } }, Meins: { name: 'Meins', axes: { 1: { type: 'gamepad', axisId: 1 } } } },
        currentProfileName: 'Meins',
        getCurrentProfile() { return this.profiles[this.currentProfileName]; },
        getAllProfiles() { return Object.entries(this.profiles).map(([name, p]) => ({ ...p, name })); },
        async setProfile(name, p) { this.profiles[name] = p; gespeichert[name] = p; }
      },
      functionsManager: {
        functions: { 'func-fs-lower-implement': { id: 'func-fs-lower-implement', name: 'Meine' } },
        async importFunctions({ functions }) { Object.assign(this.functions, functions); return { imported: Object.keys(functions).length }; }
      }
    };
    const r = await fuegeBeispielprofileHinzu(server, ['Frontlader', 'Ernte']);
    assert.deepEqual(r.hinzugefuegt, ['Frontlader']);
    assert.deepEqual(r.uebersprungen, ['Ernte']);
    assert.deepEqual(server.profileManager.profiles.Ernte.buttons, { 0: 'eigen' }, 'vorhandenes Profil unverändert');
    assert.equal(r.achsenVon, 'Meins');
    assert.deepEqual(gespeichert.Frontlader.axes, { 1: { type: 'gamepad', axisId: 1 } });
    assert.equal(gespeichert.Frontlader.buttons['22'], 'func-fs-axis-frontloader-arm', 'Taste 23 (Stick hoch)');
    assert.equal(server.functionsManager.functions['func-fs-lower-implement'].name, 'Meine', 'vorhandene Funktion bleibt');
    assert.ok(server.functionsManager.functions['func-fs-axis-frontloader-arm-minus'], 'fehlende Funktion ergänzt');
    assert.equal(r.funktionenErgaenzt, 2);
    assert.ok(r.fehlend.length > 0 && !r.fehlend.includes('func-fs-axis-frontloader-arm'), 'was nicht in der Datei steht, bleibt als fehlend gemeldet');
  } finally {
    process.env.HOME = altHome;
  }
});

test('Zündschloss (25.10.2026): 70 Motor aus, 71 Zündung, 72 Motor an in allen Beispielprofilen; Stand 2', async () => {
  const daten = await ladeBeispielprofile('fs25', 'craftconsole');
  assert.equal(beispielStand(daten), 2);
  assert.equal(beispielStand({ profile: {} }), 1);
  for (const p of baueBeispielprofile(daten)) {
    assert.equal(p.buttons['69'], 'func-fs-motor-state-off', p.name);
    assert.equal(p.buttons['70'], 'func-fs-motor-state-ignition', p.name);
    assert.equal(p.buttons['71'], 'func-fs-motor-state-on', p.name);
  }
});

test('Nachträge: nur freie Tasten oder die frühere Beispielbelegung, nie der Gamepad-Modus, Funktionen aus dem Spiel', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-bp-'));
  const spiel = path.join(home, 'Documents', 'My Games', 'FarmingSimulator2025');
  await fs.mkdir(spiel, { recursive: true });
  await fs.writeFile(path.join(spiel, 'inputBinding.xml'), `<inputBinding>
    <actionBinding action="MOTOR_STATE_ON"><binding device="KB_MOUSE_DEFAULT" input="KEY_rctrl KEY_rshift KEY_i" axisComponent="+" neutralInput="0" index="1"/></actionBinding>
    <actionBinding action="MOTOR_STATE_OFF"><binding device="KB_MOUSE_DEFAULT" input="KEY_rctrl KEY_rshift KEY_z" axisComponent="+" neutralInput="0" index="1"/></actionBinding>
    <actionBinding action="MOTOR_STATE_IGNITION"><binding device="KB_MOUSE_DEFAULT" input="KEY_rctrl KEY_rshift KEY_u" axisComponent="+" neutralInput="0" index="1"/></actionBinding>
  </inputBinding>`);
  const altHome = process.env.HOME;
  process.env.HOME = home;
  try {
    const server = {
      profileManager: {
        profiles: {
          default: { buttons: {} },
          Säen: { buttons: { 0: 'func-fs-lower-implement', 71: 'func-fs-toggle-motor-state' } },
          Meins: { buttons: { 69: 'func-eigen' } },
          Leer: {}
        },
        async setProfile(name, p) { this.profiles[name] = p; }
      },
      functionsManager: {
        functions: {},
        async importFunctions({ functions }) { Object.assign(this.functions, functions); return { imported: Object.keys(functions).length }; }
      }
    };
    const daten = await ladeBeispielprofile('fs25', 'craftconsole');
    const r = await wendeNachtraegeAn(server, daten, 1);
    const p = server.profileManager.profiles;
    assert.deepEqual(r.geaendert.sort(), ['Leer', 'Meins', 'Säen']);
    assert.deepEqual(p.default.buttons, {}, 'Gamepad-Modus bleibt');
    assert.deepEqual(p.Säen.buttons, { 0: 'func-fs-lower-implement', 69: 'func-fs-motor-state-off', 70: 'func-fs-motor-state-ignition', 71: 'func-fs-motor-state-on' });
    assert.equal(p.Meins.buttons['69'], 'func-eigen', 'eigene Belegung bleibt');
    assert.equal(p.Meins.buttons['71'], 'func-fs-motor-state-on');
    assert.equal(p.Leer.buttons['70'], 'func-fs-motor-state-ignition');
    assert.equal(r.funktionenErgaenzt, 3);
    assert.deepEqual(server.functionsManager.functions['func-fs-motor-state-ignition'].actions.map(a => a.key), ['RCTRL', 'RSHIFT', 'U']);
    // Schon auf Stand 2: nichts mehr zu tun
    assert.deepEqual((await wendeNachtraegeAn(server, daten, 2)).geaendert, []);
  } finally {
    process.env.HOME = altHome;
  }
});
