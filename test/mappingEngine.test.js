// Tasten-Logik: Gamepad-Tasten dürfen nach dem Loslassen nicht hängen bleiben (23.10.2026)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MappingEngine } from '../server/mappingEngine.js';
import { RESERVED_GAMEPAD_BUTTONS } from '../server/craftSlotLayerManager.js';

const fm = funcs => ({ getFunction: id => funcs[id] || null });
const frame = (down = []) => { const buttons = new Array(128).fill(0); for (const b of down) buttons[b] = 1; return { buttons, axes: new Array(16).fill(32768) }; };
const ev = (down = [], up = []) => ({ buttonDown: down, buttonUp: up, axisChange: [] });

test('Gamepad-Taste aus der Belegung wird beim Loslassen frei', () => {
  const m = new MappingEngine(fm({ pad5: { actions: [{ type: 'gamepad', buttonId: 5 }] } }));
  m.loadProfile({ buttons: { 3: 'pad5' } });
  let out = m.process(ev([3]), frame([3]));
  assert.equal(out.gamepad.buttons[5], 1);
  out = m.process(ev(), frame([3]));
  assert.equal(out.gamepad.buttons[5], 1, 'bleibt gehalten, solange die Taste gehalten wird');
  out = m.process(ev([], [3]), frame([]));
  assert.equal(out.gamepad.buttons[5], 0);
});

test('Ebenentaster löst seine eigene Belegung nicht aus und hinterlässt nichts', () => {
  const m = new MappingEngine(fm({ pad7: { actions: [{ type: 'gamepad', buttonId: 7 }] } }));
  m.setCraftSlotLayerConfig?.({ craftslot1: { layerButton1: 2, layerButton2: null } });
  if (!m.craftSlotLayerConfig) m.craftSlotLayerConfig = { craftslot1: { layerButton1: 2, layerButton2: null } };
  m.loadProfile({ buttons: { 2: 'pad7' } });   // Standardprofil: auch der Ebenentaster hat eine Belegung
  let out = m.process(ev([2]), frame([2]));
  out = m.process(ev(), frame([2]));
  assert.equal(out.gamepad.buttons[7], 0, 'Belegung des Ebenentasters wird nicht gesetzt');
  assert.equal(out.gamepad.buttons[RESERVED_GAMEPAD_BUTTONS.craftslot1.layerButton1], 1);
  out = m.process(ev([], [2]), frame([]));
  assert.equal(out.gamepad.buttons[7], 0);
  assert.equal(out.gamepad.buttons[RESERVED_GAMEPAD_BUTTONS.craftslot1.layerButton1], 0);
});

test('Gesperrte Funktion (Bedingung) setzt auch beim Halten nichts', () => {
  const m = new MappingEngine(fm({ pad9: { actions: [{ type: 'gamepad', buttonId: 9 }], condition: { value: 'x', is: true } } }));
  m.setConditionChecker({ allows: () => false });
  m.loadProfile({ buttons: { 4: 'pad9' } });
  m.process(ev([4]), frame([4]));
  const out = m.process(ev(), frame([4]));
  assert.equal(out.gamepad.buttons[9], 0);
});

test('Profilwechsel bei gehaltener Taste: nichts hängt nach dem Loslassen', () => {
  const m = new MappingEngine(fm({ pad5: { actions: [{ type: 'gamepad', buttonId: 5 }] } }));
  m.loadProfile({ buttons: { 3: 'pad5' } });
  m.process(ev([3]), frame([3]));
  m.loadProfile({ buttons: { 3: 'pad5' } });   // reset() während gehalten
  m.process(ev(), frame([3]));
  const out = m.process(ev([], [3]), frame([]));
  assert.equal(out.gamepad.buttons[5], 0);
});
