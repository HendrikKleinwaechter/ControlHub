// Import der FS25-inputBinding.xml: beide Richtungen einer Aktion (Hendrik 23.10.2026, Teilbreiten)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInputBindingXml } from '../server/inputBindingImporter.js';

const XML = `<?xml version="1.0"?><inputBinding>
  <actionBinding action="VARIABLE_WORK_WIDTH_LEFT">
    <binding device="KB_MOUSE_DEFAULT" input="KEY_lctrl KEY_lshift KEY_i" axisComponent="+" neutralInput="0" index="1"/>
    <binding device="KB_MOUSE_DEFAULT" input="KEY_lctrl KEY_lshift KEY_u" axisComponent="-" neutralInput="0" index="1"/>
  </actionBinding>
  <actionBinding action="VARIABLE_WORK_WIDTH_TOGGLE">
    <binding device="KB_MOUSE_DEFAULT" input="KEY_lctrl KEY_z" axisComponent="+" neutralInput="0" index="1"/>
  </actionBinding>
  <actionBinding action="JUMP">
    <binding device="KB_MOUSE_DEFAULT" input="KEY_space" axisComponent="+" neutralInput="0" index="1"/>
  </actionBinding>
</inputBinding>`;

test('inputBinding: „+“- und „−“-Taste werden zwei Funktionen, Teilbreiten mit eigenen Namen und Gruppe', () => {
  const { functions } = parseInputBindingXml(XML);
  const aus = functions['func-fs-variable-work-width-left'], an = functions['func-fs-variable-work-width-left-minus'];
  assert.equal(aus.name, 'Teilbreite links aus');
  assert.deepEqual(aus.actions.map(a => a.key), ['LCTRL', 'LSHIFT', 'I']);
  assert.equal(an.name, 'Teilbreite links an');
  assert.deepEqual(an.actions.map(a => a.key), ['LCTRL', 'LSHIFT', 'U']);
  assert.deepEqual(aus.categories, ['Fahrzeug › Arbeit'], 'eigene Zuordnung im selben Baum wie die Spiel-Bereiche');
  assert.equal(functions['func-fs-variable-work-width-toggle'].name, 'Teilbreiten umschalten');
  assert.equal(functions['func-fs-variable-work-width-toggle-minus'], undefined, 'nur eine Richtung → eine Funktion');
  assert.equal(functions['func-fs-jump-minus'], undefined);
});

test('inputBinding: Motor an/aus und Zündung kommen mit (Zündschloss, 25.10.2026), auch ohne Taste', () => {
  const { functions } = parseInputBindingXml(`<inputBinding>
    <actionBinding action="TOGGLE_MOTOR_STATE"><binding device="KB_MOUSE_DEFAULT" input="KEY_return" axisComponent="+" neutralInput="0" index="1"/></actionBinding>
    <actionBinding action="MOTOR_STATE_ON"><binding device="KB_MOUSE_DEFAULT" input="KEY_rctrl KEY_rshift KEY_i" axisComponent="+" neutralInput="0" index="1"/></actionBinding>
    <actionBinding action="MOTOR_STATE_OFF"><binding device="KB_MOUSE_DEFAULT" input="KEY_rctrl KEY_rshift KEY_z" axisComponent="+" neutralInput="0" index="1"/></actionBinding>
    <actionBinding action="MOTOR_STATE_IGNITION"/>
  </inputBinding>`);
  const an = functions['func-fs-motor-state-on'], aus = functions['func-fs-motor-state-off'], zuendung = functions['func-fs-motor-state-ignition'];
  assert.equal(an.name, 'Motor an');
  assert.deepEqual(an.actions.map(a => a.key), ['RCTRL', 'RSHIFT', 'I']);
  assert.equal(aus.name, 'Motor aus');
  assert.deepEqual(aus.actions.map(a => a.key), ['RCTRL', 'RSHIFT', 'Z']);
  assert.equal(zuendung.name, 'Zündung');
  assert.deepEqual(zuendung.actions, [], 'ohne Taste: Funktion da, sendet aber nichts');
  for (const f of [an, aus, zuendung, functions['func-fs-toggle-motor-state']]) assert.deepEqual(f.categories, ['Fahrzeug › Fahren']);
});
