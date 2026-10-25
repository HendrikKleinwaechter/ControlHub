// Modulbilder: Kappenfarben der Fingertips (23.10.2026)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { ModuleLayoutManager } from '../server/moduleLayoutManager.js';

test('Kappenfarbe je Fingertip setzen, entfernen, Unsinn ablehnen', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-ml-'));
  const file = path.join(dir, 'moduleLayouts.json');
  const m = new ModuleLayoutManager(file);
  await m.initialize();
  await m.setCapColor('fingertip', 'finger2', 'red');
  await m.setCapColor('fingertip', 'finger4', 'blue');
  assert.deepEqual(m.getLayout('fingertip').capColors, { finger2: 'red', finger4: 'blue' });
  await m.setCapColor('fingertip', 'finger2', null);
  assert.deepEqual(m.getLayout('fingertip').capColors, { finger4: 'blue' });
  await assert.rejects(m.setCapColor('fingertip', 'finger2', 'pink'));
  await assert.rejects(m.setCapColor('fingertip', 'finger9', 'red'));
  await assert.rejects(m.setCapColor('craftslot1', 'thumbx', 'red'));
  // gespeichert
  const again = new ModuleLayoutManager(file);
  await again.initialize();
  assert.deepEqual(again.getLayout('fingertip').capColors, { finger4: 'blue' });
  await again.setCapColor('fingertip', 'finger4', null);
  assert.equal('capColors' in again.getLayout('fingertip'), false, 'ohne Farben kein leerer Eintrag');
});

test('Stick-als-Taste: alte Lage (21 oben …) wird wie in der Firmware (21 links, 23 oben), verschobene Punkte bleiben', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-ml-'));
  const file = path.join(dir, 'moduleLayouts.json');
  const h = (button, x, y) => ({ button, x, y, shape: 'circle', width: 5.5, height: 6.5, rotation: 0 });
  await fs.writeFile(file, JSON.stringify({
    craftslot1: { image: 'a.png', disabledButtons: [], hotspots: [h(1, 10, 10), h(21, 60.7, 17.6), h(22, 60.7, 28.8), h(23, 56.1, 23), h(24, 65, 23.3)] },
    craftslot2: { image: 'b.png', disabledButtons: [], hotspots: [h(106, 57, 11), h(107, 56.9, 21.4), h(108, 53, 16), h(109, 61, 16.2)] }   // 109 von Hand verschoben
  }));
  const m = new ModuleLayoutManager(file);
  await m.initialize();
  const lage = id => Object.fromEntries(m.getLayout(id).hotspots.map(x => [x.button, `${x.x},${x.y}`]));
  assert.deepEqual(lage('craftslot1'), { 1: '10,10', 23: '60.7,17.6', 24: '60.7,28.8', 21: '56.1,23', 22: '65,23.3' });
  assert.deepEqual(lage('craftslot2'), { 106: '57,11', 107: '56.9,21.4', 108: '53,16', 109: '61,16.2' }, 'nicht mehr die alte Vorgabe: unverändert');
  const gespeichert = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(gespeichert.craftslot1.hotspots.find(x => x.x === 60.7 && x.y === 17.6).button, 23);
  const again = new ModuleLayoutManager(file);
  await again.initialize();
  assert.deepEqual(Object.fromEntries(again.getLayout('craftslot1').hotspots.map(x => [x.button, `${x.x},${x.y}`])), lage('craftslot1'), 'zweiter Start ändert nichts mehr');
});

test('Mitgelieferte Modulbilder: Stick-Tasten wie in der Firmware', async () => {
  const v = JSON.parse(await fs.readFile(new URL('../vorgaben/config/moduleLayouts.json', import.meta.url), 'utf8'));
  // seit 25.10.2026 je Griff (CraftSlot-1-Nummern), die Hebel in der gemeinsamen Unterbau-Gruppe
  for (const id of ['griff-directus', 'griff-polaris']) {
    const p = b => v[id].hotspots.find(x => x.button === b);
    assert.ok(p(21).x < p(23).x && p(22).x > p(23).x, `${id}: Stick links/rechts`);
    assert.ok(p(23).y < p(21).y && p(24).y > p(21).y, `${id}: Stick hoch/runter`);
  }
  const u = (id, b) => v[id].hotspots.find(x => x.button === b);
  assert.ok(u('unterbau-fahrhebel', 17).y < u('unterbau-fahrhebel', 18).y && u('unterbau-fahrhebel', 19).x < u('unterbau-fahrhebel', 20).x, 'Fahrhebel: vor/zurück, links/rechts');
  assert.ok(!u('unterbau-schubhebel', 19) && u('unterbau-schubhebel', 17).y < u('unterbau-schubhebel', 18).y, 'Schubhebel: nur vor/zurück');
  assert.ok(u('unterbau-lenkjoystick', 17).x < u('unterbau-lenkjoystick', 18).x && u('unterbau-lenkjoystick', 17).y === u('unterbau-lenkjoystick', 18).y, 'Lenkjoystick: links/rechts');
  assert.ok(!v.unterbau, 'keine gemeinsame Gruppe mehr');
  assert.ok(!v.craftslot1.image && !v.craftslot2.image, 'CraftSlots ohne eigenes Bild');
});
