// Update-Weg (23.10.2026): Datenordner außerhalb des Programms, Umzug alter Daten, Vorgaben, Sicherung, Versionsvergleich,
// „Nach Updates suchen“ nur auf Knopfdruck
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { standardDatenOrdner, VERSION } from '../server/paths.js';
import { datenOrdnerVorbereiten, sichereDaten, neuerAls } from '../server/datenOrdner.js';
import { registerUpdateRoutes } from '../server/routes/update.js';

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'cc-daten-'));
const schreib = async (p, inhalt = '{}') => { await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, inhalt); };
const gibts = async p => { try { await fs.access(p); return true; } catch { return false; } };

test('Datenordner je System, CONTROLHUB_DATEN hat Vorrang', () => {
  assert.equal(standardDatenOrdner({ APPDATA: 'C:\\Users\\x\\AppData\\Roaming' }, 'win32', 'C:\\Users\\x'), path.join('C:\\Users\\x\\AppData\\Roaming', 'ControlHub'));
  assert.equal(standardDatenOrdner({}, 'darwin', '/Users/x'), '/Users/x/Library/Application Support/ControlHub');
  assert.equal(standardDatenOrdner({}, 'linux', '/home/x'), '/home/x/.config/ControlHub');
  assert.equal(standardDatenOrdner({ CONTROLHUB_DATEN: '/tmp/test-daten' }, 'win32', 'C:\\x'), path.resolve('/tmp/test-daten'));
});

async function aufbau() {
  const t = await tmp();
  const p = { configDir: path.join(t, 'daten/config'), assetsDir: path.join(t, 'daten/assets'),
    altConfigDir: path.join(t, 'programm/server/config'), altAssetsDir: path.join(t, 'programm/server/assets'),
    vorgabenDir: path.join(t, 'programm/vorgaben') };
  await schreib(path.join(p.vorgabenDir, 'config/moduleLayouts.json'), '{"vorgabe":1}');
  await schreib(path.join(p.vorgabenDir, 'assets/module-layouts/craftslot1.png'), 'png');
  await schreib(path.join(p.altConfigDir, 'modules.js'), 'export const MODULES = [];');
  return p;
}

test('Neue Installation: Vorgaben in den Datenordner, modules.js bleibt im Programm', async () => {
  const p = await aufbau();
  await schreib(path.join(p.altConfigDir, 'moduleLayouts.json'), '{"alt":1}');   // lag bis 23.10. in jeder frischen Kopie
  const r = await datenOrdnerVorbereiten(p);
  assert.equal(r.aktion, 'neu');
  assert.equal(await fs.readFile(path.join(p.configDir, 'moduleLayouts.json'), 'utf-8'), '{"vorgabe":1}');
  assert.ok(await gibts(path.join(p.assetsDir, 'module-layouts/craftslot1.png')));
  assert.ok(!(await gibts(path.join(p.configDir, 'modules.js'))));
});

test('Update von einer älteren Version: Daten aus dem Programmordner kopiert, alter Ordner bleibt mit Hinweis', async () => {
  const p = await aufbau();
  await schreib(path.join(p.altConfigDir, 'app.json'), '{"games":{"chosen":true}}');
  await schreib(path.join(p.altConfigDir, 'games/fs25/functions.json'), '{"f":1}');
  await schreib(path.join(p.altConfigDir, 'moduleLayouts.json'), '{"meine":1}');
  await schreib(path.join(p.altAssetsDir, 'function-icons/hupe.png'), 'icon');
  const r = await datenOrdnerVorbereiten(p);
  assert.equal(r.aktion, 'umgezogen');
  assert.equal(await fs.readFile(path.join(p.configDir, 'games/fs25/functions.json'), 'utf-8'), '{"f":1}');
  assert.equal(await fs.readFile(path.join(p.configDir, 'moduleLayouts.json'), 'utf-8'), '{"meine":1}', 'eigene Tastenlage statt Vorgabe');
  assert.ok(await gibts(path.join(p.assetsDir, 'function-icons/hupe.png')));
  assert.ok(await gibts(path.join(p.assetsDir, 'module-layouts/craftslot1.png')), 'fehlende Modulbilder aus den Vorgaben ergänzt');
  assert.ok(!(await gibts(path.join(p.configDir, 'modules.js'))));
  assert.ok(await gibts(path.join(p.altConfigDir, 'app.json')), 'alter Ordner bleibt als Rückweg');
  assert.ok(await gibts(path.join(p.altConfigDir, 'DATEN-LIEGEN-JETZT-IM-DATENORDNER.txt')));
  // zweiter Start: nichts mehr kopieren, auch wenn sich der alte Ordner ändert
  await schreib(path.join(p.altConfigDir, 'app.json'), '{"neu":1}');
  assert.equal((await datenOrdnerVorbereiten(p)).aktion, 'vorhanden');
  assert.equal(await fs.readFile(path.join(p.configDir, 'app.json'), 'utf-8'), '{"games":{"chosen":true}}');
});

test('Vorhandener Datenordner ohne Modulbilder: fehlende Vorgaben ergänzt, Vorhandenes bleibt', async () => {
  const p = await aufbau();
  await schreib(path.join(p.configDir, 'app.json'), '{}');
  const r = await datenOrdnerVorbereiten(p);
  assert.equal(r.aktion, 'vorhanden');
  assert.equal(r.ergaenzt, 2);
  assert.equal(await fs.readFile(path.join(p.configDir, 'moduleLayouts.json'), 'utf-8'), '{"vorgabe":1}');
  assert.ok(await gibts(path.join(p.assetsDir, 'module-layouts/craftslot1.png')));
  await schreib(path.join(p.configDir, 'moduleLayouts.json'), '{"meine":1}');
  await schreib(path.join(p.assetsDir, 'module-layouts/craftslot1.png'), 'eigenes');
  assert.equal((await datenOrdnerVorbereiten(p)).ergaenzt, 0);
  assert.equal(await fs.readFile(path.join(p.configDir, 'moduleLayouts.json'), 'utf-8'), '{"meine":1}');
  assert.equal(await fs.readFile(path.join(p.assetsDir, 'module-layouts/craftslot1.png'), 'utf-8'), 'eigenes');
});

test('Sicherung bei Versionswechsel: alles außer _sicherung', async () => {
  const t = await tmp();
  const config = path.join(t, 'config');
  await schreib(path.join(config, 'app.json'), '{"a":1}');
  await schreib(path.join(config, 'games/fs25/profiles.json'), '{"p":1}');
  await schreib(path.join(config, '_sicherung/alt/x.json'), '{}');
  const ziel = await sichereDaten(config, 'vor-1.1.0');
  assert.match(path.basename(ziel), /-vor-1\.1\.0$/);
  assert.equal(await fs.readFile(path.join(ziel, 'games/fs25/profiles.json'), 'utf-8'), '{"p":1}');
  assert.ok(!(await gibts(path.join(ziel, '_sicherung'))));
});

test('Versionsvergleich', () => {
  assert.ok(neuerAls('v1.1.0', '1.0.9'));
  assert.ok(neuerAls('1.2.10', '1.2.9'));
  assert.ok(!neuerAls('1.0.0', '1.0.0'));
  assert.ok(!neuerAls('v0.9.9', '1.0.0'));
  assert.ok(neuerAls('2.0', '1.9.9'));
  assert.ok(!neuerAls('1.1.0-beta', '1.1.0'), 'Vorab-Kennung zählt nicht');
});

test('Nach Updates suchen: nur auf Anfrage, neue Version, keine, offline', async () => {
  const routen = {};
  registerUpdateRoutes({ get: (p, h) => { routen['GET ' + p] = h; }, post: (p, h) => { routen['POST ' + p] = h; } });
  const rufe = async (key) => { let out; await routen[key]({}, { json: d => { out = d; }, status() { return this; } }); return out; };
  const echt = globalThis.fetch;
  let aufrufe = 0;
  try {
    globalThis.fetch = async () => { aufrufe++; return { status: 200, ok: true, json: async () => ({ tag_name: 'v99.0.0', html_url: 'https://github.com/x/y/releases/tag/v99.0.0', body: 'Neu: alles', published_at: '2026-11-01T10:00:00Z' }) }; };
    const v = await rufe('GET /api/version');
    assert.equal(v.version, VERSION);
    assert.equal(aufrufe, 0, 'Version anzeigen geht nicht ins Internet');
    const r = await rufe('POST /api/update/pruefen');
    assert.equal(aufrufe, 1);
    assert.equal(r.stand, 'neu');
    assert.equal(r.neueste, '99.0.0');
    assert.equal(r.url, 'https://github.com/x/y/releases/tag/v99.0.0');
    globalThis.fetch = async () => ({ status: 404, ok: false });
    assert.equal((await rufe('POST /api/update/pruefen')).stand, 'keine');
    globalThis.fetch = async () => { throw new Error('offline'); };
    const o = await rufe('POST /api/update/pruefen');
    assert.equal(o.success, false);
    assert.match(o.error, /nicht erreichbar/);
  } finally {
    globalThis.fetch = echt;
  }
});
