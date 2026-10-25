// Aus dem Spiel neu einlesen (24.10.2026): neue Funktionen dazu, Tasten wie im Spiel, eigene Namen und Gruppen bleiben,
// neue Mods mit ihrer Standardbelegung, neue Gruppen an ihren Platz. Mods und Belegungen hier sind ausgedacht.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { abgleich, neuEinlesen } from '../server/funktionenEinlesen.js';
import { einsortieren } from '../server/gruppenFolge.js';
import { grundFunktionen } from '../server/grundausstattung.js';
import { FunctionsManager } from '../server/functionsManager.js';

const K = key => [{ type: 'keyboard', key }];

test('Abgleich: Tasten immer wie im Spiel, Name/Gruppe nur, wenn nicht selbst geändert', () => {
  const vorhanden = {
    'func-fs-a': { id: 'func-fs-a', name: 'Mein Name', categories: ['Spiel'], actions: K('A'), quelle: { name: 'A', categories: ['Spiel'] } },
    'func-fs-b': { id: 'func-fs-b', name: 'B Roh', categories: ['Sonstige/unbekannt'], actions: K('B') },
    'func-fs-c': { id: 'func-fs-c', name: 'C', categories: ['Meine Gruppe'], actions: K('C') },
    'func-fs-weg': { id: 'func-fs-weg', name: 'Weg', categories: ['Spiel'], actions: K('W') },
    'func-eigen': { id: 'func-eigen', name: 'Eigen', categories: [], actions: K('E') }
  };
  const g = (id, name, categories, key, ersatz) => ({ id, name, categories, icon: null, actions: K(key), quelle: { name, categories }, ersatz });
  const gelesen = {
    'func-fs-a': g('func-fs-a', 'A neu', ['Fahrzeug › Arbeit'], 'X', { name: 'A', categories: ['Spiel'] }),
    'func-fs-b': g('func-fs-b', 'B schön', ['Mods › Feldhelfer'], 'B', { name: 'B Roh', categories: ['Sonstige/unbekannt'] }),
    'func-fs-c': g('func-fs-c', 'C', ['Spiel'], 'C', { name: 'C', categories: ['Spiel'] }),
    'func-fs-neu': g('func-fs-neu', 'Neu', ['Mods › Feldhelfer'], 'N', { name: 'Neu', categories: ['Sonstige/unbekannt'] })
  };
  const r = abgleich(vorhanden, gelesen);
  assert.deepEqual(Object.keys(r.neu), ['func-fs-neu']);
  assert.equal(r.neu['func-fs-neu'].ersatz, undefined, 'ersatz wird nicht gespeichert');
  assert.ok(r.neu['func-fs-neu'].quelle);
  assert.deepEqual(r.aenderungen['func-fs-a'].actions, K('X'), 'Tasten wie im Spiel');
  assert.equal(r.aenderungen['func-fs-a'].name, undefined, 'eigener Name bleibt');
  assert.deepEqual(r.aenderungen['func-fs-a'].categories, ['Fahrzeug › Arbeit'], 'Gruppe war unverändert -> nachgezogen');
  assert.equal(r.aenderungen['func-fs-b'].name, 'B schön', 'ohne quelle: Ersatzname gilt als unverändert');
  assert.deepEqual(r.aenderungen['func-fs-b'].categories, ['Mods › Feldhelfer']);
  assert.equal(r.aenderungen['func-fs-c']?.categories, undefined, 'eigene Gruppe bleibt');
  assert.deepEqual(r.weg, ['func-fs-weg'], 'eigene Funktionen zählen nicht als „nicht mehr im Spiel“');
  assert.deepEqual(r.zaehler, { neu: 1, tasten: 1, namen: 1, gruppen: 2, weg: 1 });
});

test('Neue Gruppen einsortieren, ohne die übrige Reihenfolge zu ändern', () => {
  const liste = ['Spiel', 'Fahrzeug', 'Mods', 'Mods › A', 'DLC', 'Makros', 'BasicGamepad Tasten'];
  assert.deepEqual(einsortieren(liste, ['Mods › B', 'Kran', 'Eigene']),
    ['Spiel', 'Fahrzeug', 'Kran', 'Eigene', 'Mods', 'Mods › A', 'Mods › B', 'DLC', 'Makros', 'BasicGamepad Tasten']);
  assert.deepEqual(einsortieren(['Spiel'], ['BasicGamepad Tasten']), ['Spiel', 'BasicGamepad Tasten']);
});

test('Neu einlesen vom PC: neue Mod mit Standardbelegung, geänderte Taste, eigener Name bleibt', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-einlesen-'));
  const spiel = path.join(home, 'Documents', 'My Games', 'FarmingSimulator2025');
  await fs.mkdir(path.join(spiel, 'mods', 'FS25_Feldhelfer'), { recursive: true });
  const binding = (licht) => `<inputBinding>
    <actionBinding action="LOWER_IMPLEMENT"><binding device="KB_MOUSE_DEFAULT" input="KEY_v" axisComponent="+" neutralInput="0" index="1"/></actionBinding>
    <actionBinding action="TOGGLE_LIGHTS"><binding device="KB_MOUSE_DEFAULT" input="${licht}" axisComponent="+" neutralInput="0" index="1"/></actionBinding>
  </inputBinding>`;
  await fs.writeFile(path.join(spiel, 'inputBinding.xml'), binding('KEY_f'));
  const mod = (titel, aktion, taste, text) => `<modDesc descVersion="92"><title><de>${titel}</de></title>
    <actions><action name="${aktion}"/></actions>
    <inputBinding><actionBinding action="${aktion}"><binding device="KB_MOUSE_DEFAULT" input="${taste}"/></actionBinding></inputBinding>
    <l10n><text name="input_${aktion}"><de>${text}</de></text></l10n></modDesc>`;
  await fs.writeFile(path.join(spiel, 'mods', 'FS25_Feldhelfer', 'modDesc.xml'), mod('Feldhelfer', 'FH_START', 'KEY_lctrl KEY_k', 'Helfer starten'));
  const altHome = process.env.HOME;
  process.env.HOME = home;
  try {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-einlesen-fm-'));
    const fm = new FunctionsManager(path.join(dir, 'functions.json'), path.join(dir, 'categories.json'));
    await fm.initialize();
    const erst = await grundFunktionen('fs25', fm);
    assert.equal(erst.quelle, 'spiel');
    assert.deepEqual(fm.getFunction('func-fs-fh-start').categories, ['Mods › Feldhelfer'], 'Mod aus dem Ordner, Tasten aus ihrer Standardbelegung');
    assert.deepEqual(fm.getFunction('func-fs-fh-start').actions, [{ type: 'keyboard', key: 'LCTRL' }, { type: 'keyboard', key: 'K' }]);
    assert.ok(fm.getFunction('func-fs-lower-implement').quelle, 'beim ersten Einlesen wird der Stand gemerkt');

    // Hendrik benennt um, belegt im Spiel das Licht neu und legt eine zweite Mod dazu
    fm.functions['func-fs-lower-implement'].name = 'Pflug runter';
    await fs.writeFile(path.join(spiel, 'inputBinding.xml'), binding('KEY_l'));
    await fs.mkdir(path.join(spiel, 'mods', 'FS25_Spiegel'));
    await fs.writeFile(path.join(spiel, 'mods', 'FS25_Spiegel', 'modDesc.xml'), mod('Spiegel', 'MC_MIRROR', 'KEY_m', 'Spiegel einstellen'));
    const vorherGruppen = [...fm.categories];

    const r = await neuEinlesen(fm);
    assert.equal(r.neu, 1);
    assert.deepEqual(r.neueMods, ['Spiegel']);
    assert.equal(r.tasten, 1);
    assert.equal(r.ausModStandard, 2);
    assert.equal(fm.getFunction('func-fs-lower-implement').name, 'Pflug runter', 'eigener Name bleibt');
    assert.deepEqual(fm.getFunction('func-fs-toggle-lights').actions, [{ type: 'keyboard', key: 'L' }]);
    assert.equal(fm.getFunction('func-fs-mc-mirror').name, 'Spiegel einstellen');
    const i = fm.categories.indexOf('Mods › Spiegel');
    assert.equal(fm.categories[i - 1], 'Mods › Feldhelfer', 'neue Mod-Gruppe bei den Mods');
    assert.deepEqual(fm.categories.filter(c => c !== 'Mods › Spiegel'), vorherGruppen, 'übrige Reihenfolge unverändert');
    const gespeichert = JSON.parse(await fs.readFile(path.join(dir, 'functions.json'), 'utf8'));
    assert.ok(gespeichert.functions['func-fs-mc-mirror']);

    // noch einmal: nichts zu tun
    const r2 = await neuEinlesen(fm);
    assert.deepEqual([r2.neu, r2.tasten, r2.namen, r2.gruppen], [0, 0, 0, 0]);
  } finally {
    process.env.HOME = altHome;
  }
});
