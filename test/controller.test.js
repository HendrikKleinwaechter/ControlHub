// Geräteprofile (23.10.2026): Modul-Baukasten, Erkennung, CraftLink
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { slotParts, resolveModules, BUILTIN_PROFILES, VORLAGEN, buildModuleView, teilModulesForCalibration, isTeilLayoutId } from '../server/deviceProfiles.js';
import { ControllerManager } from '../server/controllerManager.js';

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const cc = BUILTIN_PROFILES.find(p => p.id === 'craftconsole');
const link = BUILTIN_PROFILES.find(p => p.id === 'craftlink');

test('Griff und Unterbau bestimmen die sichtbaren Tasten eines CraftSlots', () => {
  const directus = slotParts(1, { unterbau: 'fahrhebel', griff: 'directus' }, 'craftslot1');
  assert.deepEqual(directus.buttons, range(1, 24));
  assert.deepEqual(directus.axisKeys, ['thumbX', 'thumbY', 'leverA', 'leverB']);
  // Polaris an CraftSlot 2 = genau die Tasten, die Hendrik im Modulbild als verbaut markiert hat (102–112)
  const polaris = slotParts(86, { unterbau: 'fahrhebel', griff: 'polaris' }, 'craftslot2');
  assert.deepEqual(polaris.buttons, range(102, 112));
  assert.deepEqual(slotParts(1, { unterbau: 'fahrhebel', griff: 'mortis' }, 'craftslot1').buttons.filter(b => b <= 16),
    [1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14]);
  const minor = slotParts(1, { unterbau: 'schubhebel', griff: 'minor' }, 'craftslot1');
  assert.deepEqual(minor.buttons, [17, 18, 25, 26]);
  assert.deepEqual(minor.axisKeys, ['leverA']);
  assert.deepEqual(slotParts(1, { unterbau: 'keiner', griff: 'keiner' }, 'craftslot1'), { buttons: [], axisKeys: [] });
  // Lenkjoystick: eine Achse am Eingang des Schubhebels (Hebel A, Tasten 17/18), Hendrik 23.10.2026
  const lenk = slotParts(1, { unterbau: 'lenkjoystick', griff: 'keiner' }, 'craftslot1');
  assert.deepEqual(lenk, slotParts(1, { unterbau: 'schubhebel', griff: 'keiner' }, 'craftslot1'));
  assert.deepEqual(lenk, { buttons: [17, 18], axisKeys: ['leverA'] });
});

test('Modulbild je Griff, Unterbau-Gruppe eingeblendet und auf CraftSlot 2 umgerechnet (25.10.2026)', () => {
  const teile = teilModulesForCalibration();
  assert.deepEqual(teile.map(t => t.id), ['griff-directus', 'griff-mortis', 'griff-minor', 'griff-vector-r', 'griff-vector-l', 'griff-polaris',
    'unterbau-fahrhebel', 'unterbau-schubhebel', 'unterbau-lenkjoystick']);
  assert.deepEqual(teile.find(t => t.id === 'griff-minor').buttons, [25, 26]);
  assert.deepEqual(teile.find(t => t.id === 'unterbau-fahrhebel').buttons, [17, 18, 19, 20]);
  assert.deepEqual(teile.find(t => t.id === 'unterbau-fahrhebel').axisKeys, ['leverA', 'leverB']);
  assert.deepEqual(teile.find(t => t.id === 'unterbau-lenkjoystick').buttons, [17, 18], 'Lenkjoystick am Eingang von Hebel A');
  assert.equal(teile.find(t => t.id === 'unterbau-lenkjoystick').axisLabels.leverA, 'CraftSlot 1 – Lenkung links/rechts');
  assert.ok(isTeilLayoutId('unterbau-schubhebel') && isTeilLayoutId('griff-polaris') && !isTeilLayoutId('craftslot1') && !isTeilLayoutId('unterbau'));

  const layouts = {
    craftslot2: { image: '/alt.png', hotspots: [{ button: 86, x: 1, y: 1 }], disabledButtons: [90] },
    'griff-directus': { image: '/g.png', hotspots: [{ button: 1, x: 10, y: 20 }, { axisKey: 'thumbX', x: 5, y: 5 }, { modeToggleKey: 'thumbY', x: 6, y: 6 }], disabledButtons: [3] },
    'unterbau-fahrhebel': { image: '/kasten.png', hotspots: [{ button: 17, x: 50, y: 50 }, { axisKey: 'leverB', x: 40, y: 40 }] },
    'unterbau-lenkjoystick': { image: '/kasten.png', hotspots: [{ button: 17, x: 30, y: 60 }] }
  };
  const mods = resolveModules(cc, { ...VORLAGEN.find(v => v.id === 'pro').setup, craftslot2: { an: true, unterbau: 'fahrhebel', griff: 'directus' } });
  const s2 = mods.find(m => m.id === 'craftslot2');
  const v = buildModuleView(s2, layouts);
  assert.equal(v.zusammengesetzt, true);
  assert.deepEqual(v.teile.map(t => [t.id, t.image]), [['griff-directus', '/g.png']], 'ein Bild: das des Griffs');
  assert.deepEqual(v.teile[0].hotspots.map(h => h.button ?? h.axisKey ?? h.modeToggleKey), [86, 'thumb2X', 'thumb2Y', 102, 'leverB2'], 'Unterbau-Gruppe eingeblendet');
  assert.deepEqual(v.teile[0].disabledButtons, [], 'Griff bestimmt die Tasten, nicht die Markierung im Bild');
  // CraftSlot 1 bleibt unverschoben
  assert.equal(buildModuleView(mods.find(m => m.id === 'craftslot1'), layouts).teile[0].hotspots[0].button, 1);
  // ohne Unterbau: nur die Griff-Felder
  const ohneU = resolveModules(cc, { craftslot1: { an: true, unterbau: 'keiner', griff: 'directus' } }).find(m => m.id === 'craftslot1');
  assert.deepEqual(buildModuleView(ohneU, layouts).teile[0].hotspots.map(h => h.button ?? h.axisKey ?? h.modeToggleKey), [1, 'thumbX', 'thumbY']);
  // ohne Griff-Bild bzw. ohne Griff: das Bild des Slots, falls es eins gibt (ab Werk keins -> Raster)
  // Lenkjoystick in CraftSlot 2: seine eigenen Felder, Achse als Lenkung beschriftet
  const lenk = resolveModules(cc, { craftslot2: { an: true, unterbau: 'lenkjoystick', griff: 'directus' } }).find(m => m.id === 'craftslot2');
  assert.deepEqual(buildModuleView(lenk, layouts).teile[0].hotspots.slice(-1).map(h => [h.button, h.x]), [[102, 30]]);
  assert.equal(lenk.axisLabels.leverA2, 'CraftSlot 2 – Lenkung links/rechts');
  const alt = buildModuleView(s2, { craftslot2: layouts.craftslot2, 'unterbau-fahrhebel': layouts['unterbau-fahrhebel'] });
  assert.equal(alt.zusammengesetzt, false);
  assert.equal(alt.teile[0].image, '/alt.png');
  const nurU = resolveModules(cc, { craftslot1: { an: true, unterbau: 'fahrhebel', griff: 'keiner' } }).find(m => m.id === 'craftslot1');
  assert.deepEqual(buildModuleView(nurU, layouts).teile, []);
  // andere Module wie bisher
  assert.deepEqual(buildModuleView(mods.find(m => m.id === 'fingertip'), {}).teile, []);
});

test('Vorlagen: Pro zeigt alle Module, Mini nur CraftPad 1 und Fingertip', () => {
  const pro = resolveModules(cc, VORLAGEN.find(v => v.id === 'pro').setup);
  assert.deepEqual(pro.map(m => m.id), ['craftslot1', 'einschub1', 'fingertip', 'craftslot2', 'einschub2', 'bedienteil']);
  assert.equal(pro.find(m => m.id === 'bedienteil').axisKeys[0], 'poti');
  const mini = resolveModules(cc, VORLAGEN.find(v => v.id === 'mini').setup);
  assert.deepEqual(mini.map(m => m.id), ['einschub1', 'fingertip']);
  // ohne gespeicherte Auswahl: wie bisher alles (Pro)
  assert.equal(resolveModules(cc, undefined).length, 6);
});

test('CraftLink: ohne CraftUnit nur die eigenen Tasten, Poti nur wenn gemeldet', () => {
  const ohne = resolveModules(link, {}, {});
  assert.deepEqual(ohne.map(m => m.id), ['craftlink-tasten']);
  assert.deepEqual(ohne[0].buttons, range(30, 43));
  assert.deepEqual(ohne[0].axisKeys, []);
  assert.deepEqual(resolveModules(link, {}, { axes: '1' })[0].axisKeys, ['ax4']);
  const mit = resolveModules(link, { craftunit: { an: true, unterbau: 'fahrhebel', griff: 'directus' } }, {});
  assert.equal(mit[0].id, 'craftunit');
  assert.equal(mit[0].layoutId, 'craftslot1');
  assert.equal(mit[0].layerSlot, 'craftslot1');
});

async function tmpManager() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-ctrl-'));
  const m = new ControllerManager(dir);
  await m.initialize();
  return { m, dir };
}

test('Erkennung: device=, model= (alte CraftConsole-Firmware), USB-Kennung, unbekanntes Gerät', async () => {
  const { m, dir } = await tmpManager();
  assert.equal(m.activeId, 'craftconsole');
  assert.equal((await m.detect({ getAll: { firmware: '1.0', device: 'craftlink', buttons: '14', axes: '0', unit: 'none' } })).id, 'craftlink');
  // CraftConsole 2.12: kein device=, aber model= → einmal die Vorlage des Modells als Baukasten übernehmen.
  // Unterbau und Griff aus der Vorlage, nicht aus der Firmware (Test 23.10.2026: dort stand noch Mortis an Slot 2)
  const r = await m.detect({ getAll: { firmware: '2.12', model: '2', slot1unterbau: '1', slot1griff: '2', slot2unterbau: '0', slot2griff: '1' } });
  assert.equal(r.id, 'craftconsole');
  const s = m.setup('craftconsole');
  assert.equal(s.craftslot1.unterbau, 'fahrhebel');
  assert.equal(s.craftslot1.griff, 'directus');
  assert.equal(s.craftslot2.griff, 'polaris', 'Vorschlag für CraftSlot 2 ist Polaris');
  assert.equal(s.craftslot2.an, false, 'Plus hat keinen CraftSlot 2');
  assert.equal(s.einschub2.an, false);
  assert.equal((await m.detect({ getAll: null, usb: { vendorId: '2e8a', productId: 'cc02' } })).id, 'craftlink');
  const u = await m.detect({ getAll: { device: 'eigen-schaltpult' } });
  assert.equal(u.id, null);
  assert.equal(u.unknownDevice, 'eigen-schaltpult');
  // gespeichert
  const again = new ControllerManager(dir);
  await again.initialize();
  assert.equal(again.setup('craftconsole').craftslot1.griff, 'directus');
  assert.equal(again.state.info.craftlink.buttons, '14');
});

test('Modul-Auswahl speichern: unbekannte Werte verworfen, aktiver Controller bleibt nach Neustart', async () => {
  const { m, dir } = await tmpManager();
  await m.saveSetup('craftconsole', { craftslot1: { an: true, unterbau: 'quatsch', griff: 'vector-l' }, bedienteil: { an: false } });
  const s = m.setup('craftconsole');
  assert.equal(s.craftslot1.unterbau, 'fahrhebel', 'unbekannter Unterbau → Standard');
  assert.equal(s.craftslot1.griff, 'vector-l');
  assert.equal(s.bedienteil.an, false);
  assert.ok(!m.modules().some(x => x.id === 'bedienteil'));
  await m.setActive('craftlink');
  await assert.rejects(m.setActive('gibtsnicht'));
  const again = new ControllerManager(dir);
  await again.initialize();
  assert.equal(again.activeId, 'craftlink');
  assert.equal(again.payload().profile.name, 'CraftLink');
});

test('Eigene Controller: anlegen, Module bereinigen, Kennung eindeutig, Export/Import, Modulbilder', async () => {
  const { m } = await tmpManager();
  const c = await m.createCustom({ name: 'Mein Schaltpult', device: 'eigen-schaltpult' });
  assert.equal(c.id, 'eigen-mein-schaltpult');
  const u = await m.updateCustom(c.id, { name: 'Mein Schaltpult', erkennung: { device: 'eigen-schaltpult' }, module: [
    { name: 'Links', tasten: [31, '32', 32, 999, 0], achsen: [{ index: 4, name: 'Gas' }, { index: 4 }, { index: 99 }], tastenNamen: { 31: 'Hupe', 50: 'gehört nicht dazu' } },
    { name: 'Links', tasten: [38] }
  ] });
  assert.deepEqual(u.module[0].tasten, [31, 32]);
  assert.deepEqual(u.module[0].achsen, [{ index: 4, name: 'Gas' }]);
  assert.deepEqual(u.module[0].tastenNamen, { 31: 'Hupe' });
  assert.equal(u.module[1].id, 'links-2', 'Modul-Kennungen eindeutig');
  const mods = m.modules(c.id);
  assert.deepEqual(mods.map(x => x.id), ['eigen-mein-schaltpult--links', 'eigen-mein-schaltpult--links-2']);
  assert.deepEqual(mods[0].axisKeys, ['ax4']);
  assert.equal(m.axes(c.id)[0].label, 'Gas');
  assert.ok(m.isCustomModule('eigen-mein-schaltpult--links'));
  assert.ok(!m.isCustomModule('craftslot1'));
  await assert.rejects(m.createCustom({ name: 'Zweites', device: 'eigen-schaltpult' }), /gehört schon/);
  await assert.rejects(m.createCustom({ name: 'X', device: 'Mit Leerzeichen' }), /Gerätekennung/);
  assert.equal((await m.detect({ getAll: { device: 'eigen-schaltpult' } })).id, c.id);
  const kopie = await m.importCustom(m.exportCustom(c.id));
  assert.equal(kopie.erkennung.device, null, 'Kennung schon vergeben → Kopie ohne Kennung');
  assert.deepEqual(kopie.module[0].tasten, [31, 32]);
  await m.setActive(c.id);
  await assert.rejects(m.deleteCustom(c.id), /aktive/);
  await m.setActive('craftconsole');
  await m.deleteCustom(c.id);
  assert.equal(m.profile(c.id), null);
});

// Farbe der Armlehne (25.10.2026): Standard grau, gespeichert getrennt von der Modul-Auswahl, Bild „-schwarz“ wenn vorhanden
test('Farbe der Armlehne: Standard, speichern, bleibt bei Vorlage; CraftLink ohne Farben', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-farbe-'));
  const m = new ControllerManager(dir);
  await m.initialize();
  assert.equal(m.farbe('craftconsole'), 'grau');
  assert.deepEqual(m.payload().farben.map(f => f.id), ['grau', 'schwarz']);
  await m.saveFarbe('craftconsole', 'schwarz');
  await m.saveSetup('craftconsole', m.vorlage('mini'));
  assert.equal(m.farbe('craftconsole'), 'schwarz', 'Vorlage lässt die Farbe stehen');
  await assert.rejects(m.saveFarbe('craftconsole', 'pink'), /Farbe/);
  assert.equal(m.farbe('craftlink'), null);
  const neu = new ControllerManager(dir);
  await neu.initialize();
  assert.equal(neu.farbe('craftconsole'), 'schwarz', 'gespeichert');
});

test('Modulbild in der Farbe: nur wenn es die Datei gibt', async () => {
  const { bildInFarbe } = await import('../server/routes/modules.js');
  const da = new Set(['craftslot1-schwarz.png']);
  const gibtEs = n => da.has(n);
  assert.equal(bildInFarbe('/module-layouts/craftslot1.png', 'schwarz', gibtEs), '/module-layouts/craftslot1-schwarz.png');
  assert.equal(bildInFarbe('/module-layouts/fingertip.png', 'schwarz', gibtEs), '/module-layouts/fingertip.png', 'Fingertip: kein eigenes Bild');
  assert.equal(bildInFarbe('/module-layouts/craftslot1.png', '../x', gibtEs), '/module-layouts/craftslot1.png', 'nur einfache Farbnamen');
  assert.equal(bildInFarbe(null, 'schwarz', gibtEs), null);
});
