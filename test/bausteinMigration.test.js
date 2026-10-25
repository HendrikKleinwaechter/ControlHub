// Umzug alter Kacheln auf die nachgebauten Bausteine (22.10.2026)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { SteuerungsmenuesManager } from '../server/steuerungsmenuesManager.js';
import { KachelnManager } from '../server/kachelnManager.js';
import { migrateKachelnToBausteine } from '../server/bausteinMigration.js';

test('Kacheln ziehen auf Bausteine um, Werte mit eigener Auswahl bekommen einen eigenen, Zähler werden leer', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-mig-'));
  const sm = new SteuerungsmenuesManager(path.join(dir, 'steuerungsmenues.json'));
  await sm.initialize();
  await sm.ensureVorlagen(true);
  const k = new KachelnManager(path.join(dir, 'kacheln.json'));
  await k.initialize();
  await k.set({ pages: [
    { id: 'feld', name: 'Feld', cells: ['fahrzeug', 'karte', 'karte', 'cockpit', 'stoppuhr', 'werte'], settings: { werte: { values: ['tank', 'money'] }, karte: { north: true } } },
    { id: 'str', name: 'Straße', cells: ['werte', 'wecker', 'planer', 'geraete', 'steuerung', 'strecke'], settings: { werte: { values: ['speed', 'fuel_pct'] } } }
  ] });
  assert.equal(await migrateKachelnToBausteine(k, sm), true);
  const [feld, str] = k.get().pages;
  const werteFeld = feld.cells[5].slice(6);
  assert.deepEqual(feld.cells.slice(0, 5), ['panel:sm-v-fahrzeug', 'karte', 'karte', 'panel:sm-v-cockpit', '']);
  assert.notEqual(werteFeld, 'sm-v-werte');
  assert.deepEqual(sm.getPage(werteFeld).displays.map(d => d.value), ['fuel_pct', 'money']);
  assert.equal(sm.getPage(werteFeld).name, 'Werte · Feld');
  assert.deepEqual(str.cells, ['panel:sm-v-werte', '', 'panel:sm-v-planer', 'panel:sm-v-geraete', 'panel:sm-v-steuerung', 'panel:sm-v-strecke']);
  assert.deepEqual(Object.keys(feld.settings), ['karte'], 'Einstellungen der Karte bleiben, die der umgezogenen fallen weg');
  // nur einmal
  assert.equal(k.get().bausteine, 2);
  assert.equal(await migrateKachelnToBausteine(k, sm), false);
  await fs.rm(dir, { recursive: true, force: true });
});

test('Schritt 2: schon umgezogene Seiten bekommen den Arbeitsplaner als normale Kachel', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-mig2-'));
  const sm = new SteuerungsmenuesManager(path.join(dir, 'steuerungsmenues.json'));
  await sm.initialize();
  await sm.ensureVorlagen(true);
  const k = new KachelnManager(path.join(dir, 'kacheln.json'));
  await k.initialize();
  await k.set({ bausteine: 1, pages: [{ id: 'e', name: 'Ernte', cells: ['karte', 'karte', 'planer', 'karte', 'karte', 'cockpit'], settings: { planer: { x: 1 } } }] });
  assert.equal(k.get().bausteine, 1);
  assert.equal(await migrateKachelnToBausteine(k, sm), true);
  const [e] = k.get().pages;
  assert.deepEqual(e.cells, ['karte', 'karte', 'panel:sm-v-planer', 'karte', 'karte', 'cockpit'], 'Schritt 1 läuft nicht noch einmal');
  assert.equal(e.settings?.planer, undefined);
  assert.equal(k.get().bausteine, 2);
  // ohne Planer-Vorlage (Spiel ohne Planer) wird das Feld leer
  await sm.deletePage('sm-v-planer');
  await k.set({ bausteine: 1, pages: [{ id: 'x', name: 'X', cells: ['planer', '', '', '', '', ''] }] });
  await migrateKachelnToBausteine(k, sm);
  assert.equal(k.get().pages[0].cells[0], '');
  await fs.rm(dir, { recursive: true, force: true });
});
