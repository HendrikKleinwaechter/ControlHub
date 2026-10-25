// Gamepad-Modus schreibgeschützt (24.10.2026): nur intern beschreibbar, Kopieren geht, Sicherungen lassen ihn stehen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { ProfileManager, GAMEPAD_MODUS } from '../server/profileManager.js';
import { BackupManager } from '../server/backupManager.js';

async function manager() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-gm-'));
  const pm = new ProfileManager(path.join(dir, 'profiles.json'));
  await pm.initialize();
  return pm;
}

test('Gamepad-Modus: ändern, umbenennen, löschen geht nicht, intern und als Kopie schon', async () => {
  const pm = await manager();
  assert.equal(GAMEPAD_MODUS, 'default');
  await assert.rejects(pm.setProfile('default', { name: 'default', buttons: { 0: 'x' }, axes: {} }), /schreibgeschützt/);
  await assert.rejects(pm.patchProfile('default', [{ pfad: ['buttons', '0'], wert: 'x' }]), /schreibgeschützt/);
  await assert.rejects(pm.patchProfile(null, [{ pfad: ['autoSwitchTriggers'], wert: ['Fendt'] }]), /schreibgeschützt/, 'aktives Profil = Gamepad-Modus');
  await assert.rejects(pm.renameProfile('default', 'Neu'));
  await assert.rejects(pm.deleteProfile('default'));
  await pm.setProfile('default', { name: 'default', buttons: { 0: 'func-basicgamepad-1' }, axes: {} }, { intern: true });
  assert.equal(pm.profiles.default.buttons[0], 'func-basicgamepad-1');
  const kopie = await pm.duplicateProfile('default', 'Meins');
  assert.equal(kopie.buttons[0], 'func-basicgamepad-1');
  await pm.patchProfile('Meins', [{ pfad: ['buttons', '0'], wert: 'eigen' }]);
  assert.equal(pm.profiles.Meins.buttons[0], 'eigen');
  assert.equal(pm.profiles.default.buttons[0], 'func-basicgamepad-1', 'Original bleibt');
});

test('Sicherung zusammenführen: der Gamepad-Modus bleibt, andere Profile kommen', async () => {
  const pm = await manager();
  await pm.setProfile('default', { name: 'default', buttons: { 0: 'func-basicgamepad-1' }, axes: {} }, { intern: true });
  const bm = new BackupManager({ functions: {} }, pm, { pages: {} });
  await bm.importBundle({ profiles: { data: [{ name: 'default', buttons: { 0: 'fremd' }, axes: {} }, { name: 'Ernte', buttons: {}, axes: {} }] } }, { profiles: 'merge' });
  assert.equal(pm.profiles.default.buttons[0], 'func-basicgamepad-1');
  assert.ok(pm.profiles.Ernte);
});

test('Fahrzeug zuordnen (Schnellmenü): dem Profil zu, aus anderen weg; entfernen; Gamepad-Modus nicht', async () => {
  const { zuordnungAendern } = await import('../server/autoSwitchManager.js');
  const pm = await manager();
  await pm.setProfile('Ernte', { name: 'Ernte', buttons: {}, axes: {}, autoSwitchTriggers: ['Fendt 939'] });
  await pm.setProfile('Pflügen', { name: 'Pflügen', buttons: {}, axes: {} });
  const r = await zuordnungAendern(pm, ' Fendt 939 ', 'Pflügen', true);
  assert.deepEqual(r, { zugeordnet: true, vorher: ['Ernte'] });
  assert.deepEqual(pm.profiles.Pflügen.autoSwitchTriggers, ['Fendt 939']);
  assert.deepEqual(pm.profiles.Ernte.autoSwitchTriggers, []);
  await zuordnungAendern(pm, 'Fendt 939', 'Pflügen', true);
  assert.deepEqual(pm.profiles.Pflügen.autoSwitchTriggers, ['Fendt 939'], 'nicht doppelt');
  await zuordnungAendern(pm, 'Fendt 939', 'Pflügen', false);
  assert.deepEqual(pm.profiles.Pflügen.autoSwitchTriggers, []);
  await assert.rejects(zuordnungAendern(pm, 'Fendt 939', 'default', true), /schreibgeschützt/);
  await assert.rejects(zuordnungAendern(pm, '', 'Pflügen', true), /Kein Fahrzeug/);
});
