// Einrichtungs-Assistent und Tour (23.10.2026): Erststart, Kalibrier-Stand aus caldone, Fragen nach dem Erkennen
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { initEinrichtung, kalibrierGruppen, vorschlag, CAL_GROUPS } from '../server/einrichtung.js';
import { resolveModules, BUILTIN_PROFILES, VORLAGEN } from '../server/deviceProfiles.js';
import { ControllerManager } from '../server/controllerManager.js';

const cc = BUILTIN_PROFILES.find(p => p.id === 'craftconsole');
const pro = resolveModules(cc, VORLAGEN.find(v => v.id === 'pro').setup);
const plus = resolveModules(cc, VORLAGEN.find(v => v.id === 'plus').setup);

test('Erststart: frische Installation bekommt den Assistenten, bestehende nicht, vorhandener Eintrag bleibt', () => {
  const frisch = {};
  assert.equal(initEinrichtung(frisch, { spielGewaehlt: false }), true);
  assert.equal(frisch.einrichtung.fertig, false);
  const alt = { telemetry: { rate: 4 } };
  assert.equal(initEinrichtung(alt, { spielGewaehlt: true }), true);
  assert.equal(alt.einrichtung.fertig, true);
  const schon = { einrichtung: { fertig: false } };
  assert.equal(initEinrichtung(schon, { spielGewaehlt: true }), false, 'einmal angelegt, nie überschrieben');
  assert.equal(schon.einrichtung.fertig, false);
  // Hendriks Gaming-PC (23.10.2026): Daten einer älteren Version, aber nie ein Spiel gewählt -> trotzdem kein Assistent
  const ohneSpiel = { games: { active: 'fs25' } };
  assert.equal(initEinrichtung(ohneSpiel, { spielGewaehlt: false, bestehend: true }), true);
  assert.equal(ohneSpiel.einrichtung.fertig, true);
});

test('Kalibrier-Gruppen: Bits wie in der Firmware, nötig nur für gewählte Module', () => {
  assert.deepEqual(CAL_GROUPS.map(g => g.bit), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const alle = kalibrierGruppen(pro, 2047);
  assert.ok(alle.every(g => g.noetig && g.fertig), 'Pro, alles kalibriert');
  // Plus: kein CraftSlot 2; nur Thumbstick (Bit 0) und Hebel vor/zurück (Bit 1) kalibriert
  const g = kalibrierGruppen(plus, 3);
  const by = id => g.find(x => x.group === id);
  assert.equal(by('thumb').fertig, true);
  assert.equal(by('leverB').fertig, false);
  assert.equal(by('thumb2').noetig, false);
  assert.equal(by('poti').noetig, false, 'Plus hat kein CraftDeck');
  assert.equal(by('finger1').noetig, true);
  // caldone unbekannt (GETALL fehlgeschlagen) → kein Urteil
  assert.ok(kalibrierGruppen(pro, null).every(x => x.fertig === null));
  assert.equal(kalibrierGruppen(pro, '2047').find(x => x.group === 'leverB2').fertig, true, 'GETALL liefert Text');
});

test('Vorschlag: neuer Controller, offene Kalibrierung, „Nein, danke“ gemerkt', () => {
  const basis = { controllerId: 'craftconsole', name: 'CraftConsole', einrichtungFertig: true };
  assert.equal(vorschlag({ ...basis, einrichtungFertig: false }), null, 'Erststart-Assistent läuft ohnehin');
  assert.equal(vorschlag({ ...basis, eingerichtet: {} }).grund, 'neu');
  const eingerichtet = { craftconsole: '2026-10-23' };
  assert.equal(vorschlag({ ...basis, eingerichtet, gruppen: kalibrierGruppen(pro, 2047) }), null);
  assert.equal(vorschlag({ ...basis, eingerichtet, gruppen: null }), null, 'CraftLink: keine Kalibrierung');
  assert.equal(vorschlag({ ...basis, eingerichtet, gruppen: kalibrierGruppen(pro, null) }), null, 'Stand unbekannt');
  // CraftSlot 2 nachgerüstet: dessen drei Achsen offen
  const v = vorschlag({ ...basis, eingerichtet, gruppen: kalibrierGruppen(pro, 0b00011111111) });
  assert.equal(v.grund, 'kalibrierung');
  assert.deepEqual(v.offen, ['CraftSlot 2 – Thumbstick', 'CraftSlot 2 – Hebel vor/zurück', 'CraftSlot 2 – Hebel links/rechts']);
  assert.equal(vorschlag({ ...basis, eingerichtet, hinweisAus: { craftconsole: v.signatur }, gruppen: kalibrierGruppen(pro, 0b00011111111) }), null);
  // andere Achsen offen → wieder fragen
  assert.equal(vorschlag({ ...basis, eingerichtet, hinweisAus: { craftconsole: v.signatur }, gruppen: kalibrierGruppen(pro, 0) })?.grund, 'kalibrierung');
});

test('controller.json: eingerichtet und caldone bleiben gespeichert, ältere Datei ohne Eintrag → null', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-einr-'));
  await fs.writeFile(path.join(dir, 'controller.json'), JSON.stringify({ active: 'craftconsole', setups: {}, info: {} }));
  const m = new ControllerManager(dir);
  await m.initialize();
  assert.equal(m.state.eingerichtet, null, 'Datei aus der Version davor');
  await m.detect({ getAll: { firmware: '2.12', model: '0', caldone: '7' } });
  assert.equal(m.state.info.craftconsole.caldone, '7');
  await m.markEingerichtet('craftlink');
  await m.setHinweisAus('craftconsole', 'thumb2');
  await m.setCaldone('craftconsole', '2047');
  const again = new ControllerManager(dir);
  await again.initialize();
  assert.ok(again.isEingerichtet('craftlink'));
  assert.ok(!again.isEingerichtet('craftconsole'));
  assert.equal(again.state.hinweisAus.craftconsole, 'thumb2');
  assert.equal(again.state.info.craftconsole.caldone, '2047');
});
