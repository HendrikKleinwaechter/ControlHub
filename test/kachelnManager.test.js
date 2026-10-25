// Kachelseiten, Format 2 (Raster 2 × 3) und Umzug aus Format 1 (Umsetzungsplan Paket H).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { cleanKachelConfig, isV1Config, migratePageV1, KachelnManager, GRID_CELLS } from '../server/kachelnManager.js';

test('leere oder kaputte Datei ergibt eine leere Konfiguration', () => {
  assert.deepEqual(cleanKachelConfig(null), { version: 2, bausteine: 0, pages: [] });
  assert.deepEqual(cleanKachelConfig({ pages: 'kaputt' }), { version: 2, bausteine: 0, pages: [] });
  assert.equal(cleanKachelConfig({ bausteine: 1, pages: [] }).bausteine, 1);
});

test('Format 2: sechs Felder, fehlende werden leer, zu viele abgeschnitten', () => {
  const { pages } = cleanKachelConfig({ pages: [{ id: 'p1', cells: ['karte', 'karte'] }, { id: 'p2', cells: Array(9).fill('werte') }] });
  assert.deepEqual(pages[0].cells, ['karte', 'karte', '', '', '', '']);
  assert.equal(pages[1].cells.length, GRID_CELLS);
});

test('Format 2: Standard- und Profilseiten', () => {
  const { pages } = cleanKachelConfig({ pages: [
    { id: 'a', cells: [], profiles: [] },
    { id: 'b', cells: [], profiles: ['Pflügen', ' Pflügen ', 'Mähwerk', 3, ''] }
  ] });
  assert.deepEqual(pages[0].profiles, []);
  assert.deepEqual(pages[1].profiles, ['Pflügen', 'Mähwerk']);
});

test('Format 2: Kachel-Einstellungen bleiben einfache Werte und kurze Listen', () => {
  const { pages } = cleanKachelConfig({ pages: [{ id: 'p', cells: [], settings: {
    karte: { north: true, color: 'gruen', sym: 'traktor', bad: { tief: 1 }, fn: null },
    steuerung: { count: 'auto', mods: ['craftslot1', 'fingertip'] },
    werte: { values: ['tempo', 'tank', 3, 'adblue', 'a', 'b', 'c', 'd', 'e', 'f'] },
    kaputt: 'kein Objekt'
  } }] });
  const s = pages[0].settings;
  assert.deepEqual(s.karte, { north: true, color: 'gruen', sym: 'traktor' });
  assert.deepEqual(s.steuerung, { count: 'auto', mods: ['craftslot1', 'fingertip'] });
  assert.deepEqual(s.werte.values, ['tempo', 'tank', 'adblue', 'a', 'b', 'c', 'd', 'e']);
  assert.equal(s.kaputt, undefined);
});

test('Umzug: jede alte Aufteilung landet sinnvoll im Raster', () => {
  const slots = [{ module: 'fahrzeug' }, { module: 'karte' }, { module: 'werte', values: ['tempo'] }, { module: 'geraete' }];
  const cellsOf = layout => migratePageV1({ layout, slots }).cells;
  assert.deepEqual(cellsOf('single'), Array(6).fill('fahrzeug'));
  assert.deepEqual(cellsOf('half'), ['fahrzeug', 'fahrzeug', 'fahrzeug', 'karte', 'karte', 'karte']);
  assert.deepEqual(cellsOf('third'), ['fahrzeug', 'karte', 'karte', 'fahrzeug', 'karte', 'karte']);
  assert.deepEqual(cellsOf('twothird'), ['fahrzeug', 'fahrzeug', 'karte', 'fahrzeug', 'fahrzeug', 'karte']);
  assert.deepEqual(cellsOf('quad'), ['fahrzeug', 'fahrzeug', 'karte', 'werte', 'geraete', 'geraete']);
});

test('Umzug: Name, Automatik und Werte-Auswahl bleiben erhalten, alte Seiten werden Standardseiten', () => {
  const v1 = { autoSwitch: false, pages: [
    { id: 'feld1', name: 'Feld', layout: 'third', auto: 'field', slots: [{ module: 'fahrzeug' }, { module: 'karte' }] },
    { id: 'str1', name: 'Straße', layout: 'half', auto: 'road', slots: [{ module: 'fahrzeug' }, { module: 'werte', values: ['tank', 'adblue', 'uhrzeit'] }] }
  ] };
  assert.equal(isV1Config(v1), true);
  const c = cleanKachelConfig(v1);
  assert.equal(c.autoSwitch, undefined, 'Automatik entfernt (Test 23.10.2026)');
  assert.deepEqual(c.pages.map(p => [p.id, p.name, p.auto, p.profiles.length]), [['feld1', 'Feld', undefined, 0], ['str1', 'Straße', undefined, 0]]);
  assert.deepEqual(c.pages[1].settings.werte.values, ['tank', 'adblue', 'uhrzeit']);
  assert.equal(isV1Config(c), false);
});

test('doppelte Seiten-IDs werden eindeutig gemacht, höchstens 100 Seiten je Spiel', () => {
  const many = Array.from({ length: 102 }, () => ({ id: 'gleich', cells: [] }));
  const { pages } = cleanKachelConfig({ pages: many });
  assert.equal(pages.length, 100);
  assert.equal(new Set(pages.map(p => p.id)).size, 100);
});

test('Je Profil höchstens 10 Seiten zu sehen, insgesamt mehr erlaubt (24.10.2026)', async () => {
  const seite = (i, profiles = []) => ({ id: `s${i}`, name: `S${i}`, cells: [], profiles, settings: {} });
  const T = globalThis.TileGrid;
  // 5 für alle + je 5 für drei Profile = 20 Seiten, jedes Profil sieht 10
  const gut = [...Array.from({ length: 5 }, (_, i) => seite(i)), ...['Säen', 'Ernte', 'Pflügen'].flatMap((n, j) => Array.from({ length: 5 }, (_, i) => seite(10 + j * 5 + i, [n])))];
  assert.equal(T.zuVieleSichtbar(gut), null);
  assert.deepEqual(T.zuVieleSichtbar([...gut, seite(99, ['Ernte'])]), { profil: 'Ernte', anzahl: 11 });
  assert.deepEqual(T.zuVieleSichtbar(Array.from({ length: 11 }, (_, i) => seite(i))), { profil: null, anzahl: 11 });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kacheln-grenze-'));
  const m = new KachelnManager(path.join(dir, 'kacheln.json'));
  await m.initialize();
  await m.set({ pages: gut });
  assert.equal(m.get().pages.length, 20);
  await assert.rejects(m.set({ pages: [...gut, seite(99, ['Ernte'])] }), /höchstens 10 Kachelseiten zu sehen, bei „Ernte“ wären es 11/);
  assert.equal(m.get().pages.length, 20, 'abgelehnt, nichts geändert');
});

test('Manager: alte Datei wird beim ersten Speichern daneben gesichert, neue im Format 2 geschrieben', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kacheln-test-'));
  const file = path.join(dir, 'kacheln.json');
  const v1 = { autoSwitch: true, pages: [{ id: 'p', name: 'Alt', layout: 'single', slots: [{ module: 'karte' }] }] };
  await fs.writeFile(file, JSON.stringify(v1));
  const m = new KachelnManager(file);
  await m.initialize();
  assert.deepEqual(m.get().pages[0].cells, Array(6).fill('karte'));
  await m.set(m.get());
  const backup = JSON.parse(await fs.readFile(path.join(dir, 'kacheln_vor-umbau-2026-10.json'), 'utf-8'));
  assert.deepEqual(backup, v1);
  const now = JSON.parse(await fs.readFile(file, 'utf-8'));
  assert.equal(now.version, 2);
  // zweites Speichern überschreibt die Sicherung nicht
  await m.set({ pages: [] });
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir, 'kacheln_vor-umbau-2026-10.json'), 'utf-8')), v1);
  await fs.rm(dir, { recursive: true, force: true });
});

test('Tastenleiste: bis 4 Tasten, Zuordnung bereinigt, findKey nur für Bausteine auf der Seite', () => {
  const keys = [
    { id: 'a', label: '  Licht  ', functionId: 'f_licht', stateSource: 'light_on', extra: { x: 1 } },
    { id: 'a', label: 'Seite weiter', functionId: 'hub:tiles:next' },
    { label: '', quickActions: [{ type: 'keyboard', key: 'L', bad: { nested: true } }, 'kaputt'], durationSeconds: 3, functionId: 'wird_ignoriert' },
    { id: 'd', label: 'x'.repeat(40) },
    { id: 'e', label: 'zu viel' },
    'keine Taste'
  ];
  const c = cleanKachelConfig({ pages: [{ id: 'p', cells: ['karte', 'karte', 'fahrzeug', 'karte', 'karte', 'panel:sm-1'],
    settings: { karte: { keyPos: 'rechts', keys }, panel: { keys: [{ id: 'z', label: 'Z', functionId: 'f' }] } } }] });
  const k = c.pages[0].settings.karte.keys;
  assert.equal(c.pages[0].settings.karte.keyPos, 'rechts');
  assert.equal(k.length, 4);
  assert.deepEqual(k.map(x => x.id), ['a', 'ax', 't3', 'd']);
  assert.deepEqual(k[0], { id: 'a', label: 'Licht', functionId: 'f_licht', quickActions: null, durationSeconds: null, stateSource: 'light_on' });
  assert.deepEqual(k[2], { id: 't3', label: 'Taste', functionId: null, quickActions: [{ type: 'keyboard', key: 'L' }], durationSeconds: 3, stateSource: null });
  assert.equal(k[3].label.length, 24);
  const m = new KachelnManager('/gibt/es/nicht.json');
  m.config = c;
  assert.equal(m.findKey('p', 'karte', 'ax').functionId, 'hub:tiles:next');
  assert.equal(m.findKey('p', 'panel:sm-1', 'z').functionId, 'f');   // Tastenfeld-Kacheln teilen sich 'panel'
  assert.equal(m.findKey('p', 'werte', 'a'), null);                    // Baustein nicht auf der Seite
  assert.equal(m.findKey('p', 'karte', 'nix'), null);
  assert.equal(m.findKey('andere', 'karte', 'a'), null);
});

test('Hauptseite wird gespeichert, sonst nichts dazu', async () => {
  const { cleanKachelConfig } = await import('../server/kachelnManager.js');
  const c = cleanKachelConfig({ pages: [{ id: 'a', name: 'A', cells: [], profiles: [], haupt: true }, { id: 'b', name: 'B', cells: [], haupt: 'ja' }] });
  assert.equal(c.pages[0].haupt, true);
  assert.equal('haupt' in c.pages[1], false);
});
