// Makro-Status für die Statusleiste (Paket H): Schritt x von y, Abbrechen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MacroEngine } from '../server/macroEngine.js';

function engine(steps) {
  const pulses = [];
  const statuses = [];
  const macros = { getMacro: id => (id === 'm1' ? { name: 'Vorgewende Pflug', steps } : null) };
  const mapping = { pulseActions: a => pulses.push(a) };
  const e = new MacroEngine(mapping, macros, null, s => statuses.push(s));
  return { e, pulses, statuses };
}

test('Status nennt Schritt und Gesamtzahl, wartet auf Tastendruck', () => {
  const { e, statuses } = engine([
    { quickActions: ['a'] },
    { quickActions: ['b'], trigger: { type: 'button' } },
    { quickActions: ['c'], trigger: { type: 'button' } }
  ]);
  e.start('m1');
  assert.deepEqual(statuses.at(-1), { active: true, macroId: 'm1', macroName: 'Vorgewende Pflug', waiting: true, step: 1, total: 3 });
  e.advance();
  assert.equal(e.getStatus().step, 2);
  e.abort();
  assert.deepEqual(e.getStatus(), { active: false });
});
