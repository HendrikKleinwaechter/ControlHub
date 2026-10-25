// Belegung je Controller (Geräteprofile G2, 23.10.2026): Umzug, Übernehmen, Spielsicherung v1/v2
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { GameManager } from '../server/gameManager.js';

async function setup() {
  const config = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-g2-'));
  const settings = { games: { active: 'fs25', chosen: true, custom: [] } };
  const gm = new GameManager(config, path.join(config, '..', 'assets-' + path.basename(config)), settings, async () => {});
  const fs25 = gm.gameDir('fs25');
  await fs.mkdir(fs25, { recursive: true });
  return { config, gm, fs25 };
}
const write = (f, d) => fs.writeFile(f, JSON.stringify(d));
const read = async f => JSON.parse(await fs.readFile(f, 'utf8'));
const exists = async f => { try { await fs.access(f); return true; } catch { return false; } };

test('Umzug: Profile, Auto-Wechsel, Ebenentaster gehören danach der CraftConsole, mit Sicherung', async () => {
  const { config, gm, fs25 } = await setup();
  await write(path.join(fs25, 'profiles.json'), { currentProfile: 'Pflügen', profiles: { Pflügen: { name: 'Pflügen', buttons: { 0: 'f1' } } } });
  await write(path.join(fs25, 'autoSwitch.json'), { enabled: true });
  await write(path.join(fs25, 'functions.json'), { functions: [] });
  const done = await gm.migrateControllers();
  assert.equal(done.length, 1);
  assert.deepEqual(done[0].moved.sort(), ['autoSwitch.json', 'profiles.json']);
  assert.equal((await read(path.join(fs25, 'controller', 'craftconsole', 'profiles.json'))).currentProfile, 'Pflügen');
  assert.equal(await exists(path.join(fs25, 'profiles.json')), false);
  assert.equal(await exists(path.join(fs25, 'functions.json')), true, 'Funktionen bleiben beim Spiel');
  assert.equal(await exists(path.join(done[0].backupDir, 'profiles.json')), true);
  assert.ok(done[0].backupDir.startsWith(path.join(config, '_sicherung')));
  assert.deepEqual(await gm.migrateControllers(), [], 'nur einmal');
  assert.deepEqual(await gm.controllersWithData('fs25'), ['craftconsole']);
});

test('Profile von einem anderen Controller übernehmen: Ziel vorher gesichert', async () => {
  const { gm } = await setup();
  const cc = gm.controllerDir('fs25', 'craftconsole'), link = gm.controllerDir('fs25', 'craftlink');
  await fs.mkdir(cc, { recursive: true }); await fs.mkdir(link, { recursive: true });
  await write(path.join(cc, 'profiles.json'), { currentProfile: 'A', profiles: { A: { name: 'A', buttons: { 30: 'f9' } } } });
  await write(path.join(link, 'profiles.json'), { currentProfile: 'alt', profiles: { alt: { name: 'alt' } } });
  await gm.copyControllerData('fs25', 'craftconsole', 'craftlink');
  assert.equal((await read(path.join(link, 'profiles.json'))).currentProfile, 'A');
  await assert.rejects(gm.copyControllerData('fs25', 'eigen-x', 'craftlink'), /noch keine Profile/);
  await assert.rejects(gm.copyControllerData('fs25', 'craftlink', 'craftlink'));
  assert.throws(() => gm.controllerDir('fs25', '../böse'));
});

test('Spielsicherung: Version 2 nimmt alle Controller mit, Version 1 landet bei der CraftConsole', async () => {
  const { gm, fs25 } = await setup();
  await write(path.join(fs25, 'functions.json'), { functions: [{ id: 'f1' }] });
  const link = gm.controllerDir('fs25', 'craftlink');
  await fs.mkdir(link, { recursive: true });
  await write(path.join(link, 'profiles.json'), { currentProfile: 'L', profiles: { L: { name: 'L' } } });
  const bundle = await gm.exportGame('fs25');
  assert.equal(bundle.version, 2);
  assert.equal(bundle.controllers.craftlink['profiles.json'].currentProfile, 'L');
  assert.equal(bundle.files['profiles.json'], undefined, 'Profile nicht mehr direkt im Spiel');
  // als neues Spiel zurückspielen
  const neu = await gm.importGame(bundle, { mode: 'new', name: 'Kopie' });
  assert.equal((await read(path.join(gm.controllerDir(neu.id, 'craftlink'), 'profiles.json'))).currentProfile, 'L');
  // alte Sicherung (Version 1): Profile direkt im Spiel → CraftConsole
  const v1 = { type: 'controlhub-game', version: 1, game: { name: 'Alt' }, files: { 'profiles.json': { currentProfile: 'P', profiles: { P: { name: 'P' } } }, 'functions.json': { functions: [] } } };
  const alt = await gm.importGame(v1, { mode: 'new', name: 'Alt' });
  assert.equal((await read(path.join(gm.controllerDir(alt.id, 'craftconsole'), 'profiles.json'))).currentProfile, 'P');
  assert.equal(await exists(path.join(gm.gameDir(alt.id), 'profiles.json')), false);
  await assert.rejects(gm.importGame({ ...bundle, controllers: { '../x': {} } }, { mode: 'new', name: 'Böse' }), /beschädigt/);
});
