// jsonStore: atomar schreiben, Warteschlange je Datei, kaputte Dateien sichern statt überschreiben (23.10.2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import { writeJsonAtomic, readJsonFile, problems } from '../server/jsonStore.js';
import { FunctionsManager } from '../server/functionsManager.js';
import { GpsManager } from '../server/gpsManager.js';

const tmpDir = (name) => fs.mkdtemp(path.join(os.tmpdir(), `cc-json-${name}-`));
const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf-8'));
const defektFiles = async (dir, base) => (await fs.readdir(dir)).filter(f => new RegExp(`^${base}\\.defekt-\\d{8}-\\d{6}(-\\d+)?\\.json$`).test(f));

test('atomar schreiben: Ordner wird angelegt, alte Fassung bleibt als .bak, keine .tmp-Reste', async () => {
  const dir = await tmpDir('atomar');
  const file = path.join(dir, 'unter', 'ordner', 'cfg.json');
  await writeJsonAtomic(file, { n: 1 });
  await writeJsonAtomic(file, { n: 2 });
  assert.deepEqual(await readJson(file), { n: 2 });
  assert.deepEqual(await readJson(`${file}.bak`), { n: 1 });
  assert.equal(await fs.readFile(file, 'utf-8'), JSON.stringify({ n: 2 }, null, 2)); // Format wie bisher
  assert.deepEqual((await fs.readdir(path.dirname(file))).sort(), ['cfg.json', 'cfg.json.bak']);
  assert.deepEqual(await readJsonFile(file), { data: { n: 2 }, status: 'ok' });
  await fs.rm(dir, { recursive: true, force: true });
});

test('atomar schreiben: ein Leser sieht nie eine halb geschriebene Datei', async () => {
  const dir = await tmpDir('leser');
  const file = path.join(dir, 'gross.json');
  await writeJsonAtomic(file, { n: -1, list: [] });
  let done = false;
  let reads = 0;
  const reader = (async () => {
    while (!done) {
      JSON.parse(await fs.readFile(file, 'utf-8')); // wirft bei halber Datei
      reads++;
    }
  })();
  for (let i = 0; i < 20; i++) {
    await writeJsonAtomic(file, { n: i, list: Array.from({ length: 20000 + i * 2000 }, (_, k) => ({ k, text: 'Feld ' + k })) });
  }
  done = true;
  await reader;
  assert.ok(reads > 0);
  assert.equal((await readJson(file)).n, 19);
  await fs.rm(dir, { recursive: true, force: true });
});

test('parallele Schreibvorgänge enden mit gültigem JSON des letzten Aufrufs', async () => {
  const dir = await tmpDir('parallel');
  const file = path.join(dir, 'cfg.json');
  const writes = [];
  for (let i = 0; i < 50; i++) writes.push(writeJsonAtomic(file, { n: i, payload: 'x'.repeat(1000 * (50 - i)) }));
  await Promise.all(writes);
  assert.equal((await readJson(file)).n, 49);
  assert.equal((await readJson(`${file}.bak`)).n, 48); // Reihenfolge eingehalten
  assert.deepEqual((await fs.readdir(dir)).sort(), ['cfg.json', 'cfg.json.bak']);

  // Inhalt wird beim Aufruf festgehalten -- spätere Änderungen am Objekt landen nicht in diesem Schreibvorgang
  const obj = { n: 'beim Aufruf' };
  const p = writeJsonAtomic(file, obj);
  obj.n = 'danach geändert';
  await p;
  assert.equal((await readJson(file)).n, 'beim Aufruf');
  await fs.rm(dir, { recursive: true, force: true });
});

test('Windows: rename gesperrt (EPERM) -> neu versuchen, notfalls direkt schreiben', async (t) => {
  const dir = await tmpDir('windows');
  const file = path.join(dir, 'cfg.json');
  await writeJsonAtomic(file, { n: 0 });
  const realRename = fsp.rename;
  const eperm = () => Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });

  // zweimal gesperrt, dann frei
  let calls = 0;
  const m = t.mock.method(fsp, 'rename', async (...args) => { if (++calls <= 2) throw eperm(); return realRename(...args); });
  await writeJsonAtomic(file, { n: 1 });
  assert.equal(calls, 3);
  assert.deepEqual(await readJson(file), { n: 1 });
  m.mock.restore();

  // dauerhaft gesperrt: direkt schreiben, keine .tmp-Reste
  t.mock.method(fsp, 'rename', async () => { throw eperm(); });
  t.mock.method(console, 'warn', () => {});
  await writeJsonAtomic(file, { n: 2 });
  assert.deepEqual(await readJson(file), { n: 2 });
  assert.deepEqual(await readJson(`${file}.bak`), { n: 1 });
  assert.deepEqual((await fs.readdir(dir)).sort(), ['cfg.json', 'cfg.json.bak']);
  assert.equal(console.warn.mock.calls.length, 1);
  await fs.rm(dir, { recursive: true, force: true });
});

test('fehlende Datei: Fallback, Status missing, nichts angelegt', async () => {
  const dir = await tmpDir('fehlt');
  const file = path.join(dir, 'cfg.json');
  assert.deepEqual(await readJsonFile(file, { fallback: { leer: true } }), { data: { leer: true }, status: 'missing' });
  assert.deepEqual(await fs.readdir(dir), []);
  await fs.rm(dir, { recursive: true, force: true });
});

test('Datei mit BOM (Windows-Editor) gilt nicht als kaputt', async () => {
  const dir = await tmpDir('bom');
  const file = path.join(dir, 'cfg.json');
  await fs.writeFile(file, '﻿{"a": 1}', 'utf-8');
  assert.deepEqual(await readJsonFile(file), { data: { a: 1 }, status: 'ok' });
  await fs.rm(dir, { recursive: true, force: true });
});

test('kaputte Datei: wird als .defekt gesichert, die .bak wird genommen und wieder hingelegt', async (t) => {
  t.mock.method(console, 'error', () => {});
  const dir = await tmpDir('restore');
  const file = path.join(dir, 'cfg.json');
  await writeJsonAtomic(file, { n: 1 });
  await writeJsonAtomic(file, { n: 2 });             // .bak = { n: 1 }
  const kaputt = '{\n  "n": 2,\n  "list": [1, 2';      // abgeschnitten
  await fs.writeFile(file, kaputt, 'utf-8');

  const res = await readJsonFile(file, { fallback: { n: 'standard' } });
  assert.deepEqual(res, { data: { n: 1 }, status: 'restored' });
  const defekt = await defektFiles(dir, 'cfg');
  assert.equal(defekt.length, 1);
  assert.equal(await fs.readFile(path.join(dir, defekt[0]), 'utf-8'), kaputt); // nichts verloren
  assert.deepEqual(await readJson(file), { n: 1 });                            // beim nächsten Start wieder da
  assert.ok(console.error.mock.calls.some(c => String(c.arguments[0]).includes('BESCHÄDIGT')));  // laut gemeldet
  const p = problems.find(x => x.file === file);
  assert.equal(p.status, 'restored');
  assert.equal(path.basename(p.defekt), defekt[0]);
  assert.ok(!Number.isNaN(Date.parse(p.at)));
  await fs.rm(dir, { recursive: true, force: true });
});

test('kaputte Datei ohne .bak: broken + Fallback, Datei wird beim Start nicht überschrieben', async (t) => {
  t.mock.method(console, 'error', () => {});
  const dir = await tmpDir('broken');
  const file = path.join(dir, 'cfg.json');
  const kaputt = '{"devices": {"Spritze": {"width": 2';
  await fs.writeFile(file, kaputt, 'utf-8');
  assert.deepEqual(await readJsonFile(file, { fallback: { leer: true } }), { data: { leer: true }, status: 'broken' });
  assert.equal(problems.find(x => x.file === file)?.status, 'broken');
  const defekt = await defektFiles(dir, 'cfg');
  assert.equal(defekt.length, 1);
  assert.equal(await fs.readFile(path.join(dir, defekt[0]), 'utf-8'), kaputt);
  assert.deepEqual(await fs.readdir(dir), defekt); // keine neue cfg.json geschrieben

  // Manager, der beim Start nicht speichert (GPS): Standardwerte, kaputte Datei bleibt als .defekt erhalten
  const gpsFile = path.join(dir, 'gps.json');
  await fs.writeFile(gpsFile, kaputt, 'utf-8');
  const gps = new GpsManager(gpsFile);
  await gps.initialize();
  assert.deepEqual(gps.config.devices, {});
  const gpsDefekt = await defektFiles(dir, 'gps');
  assert.equal(gpsDefekt.length, 1);
  assert.equal(await fs.readFile(path.join(dir, gpsDefekt[0]), 'utf-8'), kaputt);
  await assert.rejects(fs.access(gpsFile));       // erst beim nächsten Speichern neu
  await gps.setConfig({ beep: 'aus' });
  assert.equal((await readJson(gpsFile)).beep, 'aus');
  assert.equal(await fs.readFile(path.join(dir, gpsDefekt[0]), 'utf-8'), kaputt);
  await fs.rm(dir, { recursive: true, force: true });
});

test('functionsManager: kaputte functions.json -- Speichern gleich beim Start ist jetzt unschädlich', async (t) => {
  t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'log', () => {});
  const dir = await tmpDir('functions');
  const file = path.join(dir, 'functions.json');
  const kaputt = '{"functions": {"func-meine": {"id": "func-meine", "name": "Meine Funktion", "categ';
  await fs.writeFile(file, kaputt, 'utf-8');

  const fm = new FunctionsManager(file, path.join(dir, 'categories.json'));
  await fm.initialize();
  // Verhalten wie bisher: ohne Funktionen weiter (keine Beispiel-Funktionen), Systemfunktionen werden angelegt + gespeichert
  assert.ok(fm.getFunction('func-macro-abort'));
  assert.ok(fm.getFunction('func-basicgamepad-1'));
  assert.equal(fm.getFunction('func-sprint'), null);
  const saved = await readJson(file);
  assert.ok(saved.functions['func-macro-abort']);
  // die kaputte Fassung ist nicht verloren
  const defekt = await defektFiles(dir, 'functions');
  assert.equal(defekt.length, 1);
  assert.equal(await fs.readFile(path.join(dir, defekt[0]), 'utf-8'), kaputt);
  assert.equal(problems.find(x => x.file === file)?.status, 'broken');
  await fs.rm(dir, { recursive: true, force: true });
});

test('functionsManager: kaputte functions.json mit .bak -- eigene Funktionen kommen zurück', async (t) => {
  t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'log', () => {});
  const dir = await tmpDir('functions-bak');
  const file = path.join(dir, 'functions.json');
  const fm1 = new FunctionsManager(file, path.join(dir, 'categories.json'));
  await fm1.initialize();
  await fm1.setFunction('func-meine', { name: 'Meine Funktion', categories: ['Bewegung'], actions: [{ type: 'keyboard', key: 'A' }] });
  await fm1.setFunction('func-zweite', { name: 'Zweite', categories: [], actions: [] }); // .bak kennt func-meine
  await fs.writeFile(file, '{"functions": {', 'utf-8');

  const fm2 = new FunctionsManager(file, path.join(dir, 'categories.json'));
  await fm2.initialize();
  assert.equal(fm2.getFunction('func-meine')?.name, 'Meine Funktion');
  assert.ok(fm2.getFunction('func-macro-abort'));
  assert.ok((await readJson(file)).functions['func-meine']);
  assert.equal((await defektFiles(dir, 'functions')).length, 1);
  assert.equal(problems.find(x => x.file === file)?.status, 'restored');
  await fs.rm(dir, { recursive: true, force: true });
});
