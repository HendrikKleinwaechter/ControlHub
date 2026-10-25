// Grundausstattung beim ersten Start eines Spiels (24.10.2026): Funktionen aus der inputBinding.xml des Spiels, sonst die
// mitgelieferte Liste; Kachelseiten ab Werk; vorhandene Daten bleiben unberührt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { FunctionsManager } from '../server/functionsManager.js';
import { KachelnManager } from '../server/kachelnManager.js';
import { grundFunktionen, grundKacheln, richteGrundausstattungEin, leseVorgabe, ordneGruppen } from '../server/grundausstattung.js';

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'cc-grund-'));
const XML = `<inputBinding>
  <actionBinding action="LOWER_IMPLEMENT"><binding device="KB_MOUSE_DEFAULT" input="KEY_v" axisComponent="+" neutralInput="0" index="1"/></actionBinding>
  <actionBinding action="TOGGLE_LIGHTS"><binding device="KB_MOUSE_DEFAULT" input="KEY_f" axisComponent="+" neutralInput="0" index="1"/></actionBinding>
</inputBinding>`;

test('Neues Spiel: keine Beispiel-Funktionen mehr, als neu gemerkt; vorhandene Datei: nicht neu', async () => {
  const dir = await tmp();
  const fm = new FunctionsManager(path.join(dir, 'functions.json'), path.join(dir, 'categories.json'));
  await fm.initialize();
  assert.equal(fm.neu, true);
  assert.equal(fm.getFunction('func-sprint'), null);
  assert.ok(fm.getFunction('func-macro-abort') && fm.getFunction('func-basicgamepad-1'));
  const fm2 = new FunctionsManager(path.join(dir, 'functions.json'), path.join(dir, 'categories.json'));
  await fm2.initialize();
  assert.ok(!fm2.neu);
  const km = new KachelnManager(path.join(dir, 'kacheln.json'));
  await km.initialize();
  assert.equal(km.neu, true);
  await km.save();
  const km2 = new KachelnManager(path.join(dir, 'kacheln.json'));
  await km2.initialize();
  assert.equal(km2.neu, false);
});

test('Funktionen: inputBinding.xml des Spiels zuerst, sonst die mitgelieferte Liste', async () => {
  const dir = await tmp();
  const xml = path.join(dir, 'inputBinding.xml');
  await fs.writeFile(xml, XML);
  const fm = new FunctionsManager(path.join(dir, 'functions.json'), path.join(dir, 'categories.json'));
  await fm.initialize();
  const r = await grundFunktionen('fs25', fm, { inputBinding: xml });
  assert.equal(r.quelle, 'spiel');
  assert.equal(r.anzahl, 2);
  assert.deepEqual(fm.getFunction('func-fs-lower-implement').actions, [{ type: 'keyboard', key: 'V' }]);
  assert.ok(fm.categories.includes('Fahrzeug › Arbeit') && fm.categories.includes('Fahrzeug'));

  const fm2 = new FunctionsManager(path.join(dir, 'f2.json'), path.join(dir, 'c2.json'));
  await fm2.initialize();
  const r2 = await grundFunktionen('fs25', fm2, { inputBinding: null });
  assert.equal(r2.quelle, 'vorgabe');
  const vorgabe = await leseVorgabe('funktionen', 'fs25');
  assert.equal(r2.anzahl, Object.keys(vorgabe.functions).length);
  assert.ok(r2.anzahl > 200, 'mitgelieferte Liste vollständig');
  assert.ok(!fm2.getAllFunctions().some(f => (f.categories || []).some(c => c.startsWith('Mods') || c === 'Sonstige/unbekannt')), 'ohne Mods und Unbekanntes');
  assert.deepEqual(await grundFunktionen('eigenes-spiel', fm2, { inputBinding: null }), { quelle: null, anzahl: 0 });
});

test('Kachelseiten ab Werk: Feld und Transport mit Karten-Einstellung; fehlende Vorlage = leeres Feld', async () => {
  const dir = await tmp();
  const km = new KachelnManager(path.join(dir, 'kacheln.json'));
  await km.initialize();
  const sm = { pages: { 'sm-v-cockpit': {}, 'sm-v-steuerung': {}, 'sm-v-geraete': {}, 'sm-v-planer': {} } };
  assert.equal(await grundKacheln('fs25', km, sm), 2);
  assert.deepEqual(km.config.pages.map(p => p.name), ['Feld', 'Transport']);
  assert.deepEqual(km.config.pages[0].cells, ['panel:sm-v-cockpit', 'karte', 'karte', 'panel:sm-v-steuerung', 'panel:sm-v-geraete', 'panel:sm-v-planer']);
  assert.equal(km.config.pages[0].settings.karte.btns, true, 'Kartentasten an');
  assert.equal(km.config.pages[1].cells[5], '', 'Streckenzähler-Vorlage fehlt -> leer');
  const gespeichert = JSON.parse(await fs.readFile(path.join(dir, 'kacheln.json'), 'utf8'));
  assert.equal(gespeichert.pages.length, 2);
  assert.equal(await grundKacheln('eigenes-spiel', km, sm), 0);
});

test('richteGrundausstattungEin: nur was neu ist', async () => {
  const dir = await tmp();
  const fm = { neu: false, importFunctions: () => { throw new Error('darf nicht'); } };
  const km = new KachelnManager(path.join(dir, 'kacheln.json'));
  await km.initialize();
  km.neu = false;
  await richteGrundausstattungEin('fs25', { functionsManager: fm, kachelnManager: km, steuerungsmenuesManager: { pages: {} } });
  assert.equal(km.config.pages.length, 0);
});

test('Gruppen-Reihenfolge: Spiel-Bereiche, Mods, DLC, Systemgruppen zuletzt', () => {
  assert.deepEqual(ordneGruppen(['Makros', 'Fahrzeug', 'BasicGamepad Tasten', 'Kran', 'Mods › AutoDrive', 'Fahrzeug › Arbeit', 'Eigene', 'Zu Fuß', 'DLC › Precision Farming', 'Sonstige/unbekannt']),
    ['Fahrzeug', 'Fahrzeug › Arbeit', 'Zu Fuß', 'Kran', 'Eigene', 'Sonstige/unbekannt', 'Mods › AutoDrive', 'DLC › Precision Farming', 'Makros', 'BasicGamepad Tasten']);
});
