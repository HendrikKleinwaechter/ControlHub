// Bedienpanel: Anzeigen mit Spielwerten und Tasten mit Zustand (Umsetzungsplan Paket J).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { SteuerungsmenuesManager } from '../server/steuerungsmenuesManager.js';

async function manager(pages) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-sm-'));
  const file = path.join(dir, 'steuerungsmenues.json');
  if (pages) await fs.writeFile(file, JSON.stringify({ order: Object.keys(pages), pages }));
  const m = new SteuerungsmenuesManager(file);
  await m.initialize();
  return { m, file };
}

test('alte Seiten bekommen eine leere Anzeigenliste, kaputte Anzeigen werden repariert', async () => {
  const { m } = await manager({ p1: { id: 'p1', name: 'Alt', buttons: [], displays: [{ type: 'quatsch', warn: 7, dec: 9, width: 500 }] } });
  const d = m.getPage('p1').displays[0];
  assert.equal(d.type, 'zahl');
  assert.equal(d.warn, 0);
  assert.equal(d.dec, 2);
  assert.equal(d.width, 100);   // höchstens volle Breite
  assert.equal(d.value, 'speed');
  assert.equal(d.range, 'auto');
  // Ausrichtung des Inhalts (24.10.2026): ab Werk links/mittig, Unsinn wird zum Standard
  assert.deepEqual([d.alignH, d.alignV], ['links', 'mitte']);
});

test('Ausrichtung einer Anzeige wird gespeichert, ungültige Werte nicht', async () => {
  const { m } = await manager();
  const page = await m.createPage('Test');
  const { display } = await m.addDisplay(page.id, { value: 'fuel', alignH: 'rechts', alignV: 'unten' });
  assert.deepEqual([display.alignH, display.alignV], ['rechts', 'unten']);
  const r = await m.updateDisplay(page.id, display.id, { alignH: 'quer', alignV: 'oben' });
  assert.deepEqual([r.display.alignH, r.display.alignV], ['links', 'oben']);
});

test('Licht-Piktogramme werden gespeichert, das Traktorbild aus dem Programm auch', async () => {
  const { m } = await manager();
  const page = await m.importPage({ name: 'Beleuchtung', buttons: ['low-beam', 'high-beam', 'work-light-front', 'work-light-rear', 'beacon', 'turn-left', 'turn-right', 'hazard', 'quatsch'].map(icon => ({ icon, label: icon })),
    graphics: [{ src: '/img/vorlagen/traktor-seite.svg', width: 100, height: 56.25 }] });
  assert.deepEqual(page.buttons.map(b => b.icon), ['low-beam', 'high-beam', 'work-light-front', 'work-light-rear', 'beacon', 'turn-left', 'turn-right', 'hazard', null]);
  assert.equal(page.graphics[0].src, '/img/vorlagen/traktor-seite.svg');
});

test('Frische Installation: keine Start-Kacheln Spiegel, Menü-Navigation, GPS-Einstellungen mehr', async () => {
  const { m } = await manager();
  assert.deepEqual(m.order, []);
  for (const id of ['sm-spiegel', 'sm-menue', 'sm-gps']) assert.equal(m.getPage(id), null);
  // vorhandene Kacheln älterer Installationen bleiben
  const { m: alt } = await manager({ 'sm-spiegel': { id: 'sm-spiegel', name: 'Spiegel', buttons: [] } });
  assert.equal(alt.getPage('sm-spiegel').name, 'Spiegel');
});

test('Anzeige anlegen, ändern, Aktion zuordnen, löschen', async () => {
  const { m, file } = await manager();
  const page = await m.createPage('Test');
  const { display } = await m.addDisplay(page.id, { value: 'fuel', type: 'balken', width: 28, height: 8 });
  assert.equal(display.value, 'fuel');
  let r = await m.updateDisplay(page.id, display.id, { range: 'manual', min: 0, max: 400, warn: 25, quickActions: [{ type: 'keyboard', key: 'L' }] });
  assert.deepEqual([r.display.range, r.display.min, r.display.max, r.display.warn], ['manual', 0, 400, 25]);
  r = await m.updateDisplay(page.id, display.id, { functionId: 'licht' });
  assert.equal(r.display.functionId, 'licht');
  assert.equal(r.display.quickActions, null, 'Funktion ersetzt die Schnellbelegung');
  const saved = JSON.parse(await fs.readFile(file, 'utf-8'));
  assert.equal(saved.pages[page.id].displays.length, 1);
  await m.removeDisplay(page.id, display.id);
  assert.equal(m.getPage(page.id).displays.length, 0);
});

test('Taste mit Zustand, Export/Import behält Anzeigen', async () => {
  const { m } = await manager();
  const page = await m.createPage('Licht');
  const btn = m.getPage(page.id).buttons[0];
  await m.updateButton(page.id, btn.id, { stateSource: 'beacon' });
  assert.equal(m.getPage(page.id).buttons[0].stateSource, 'beacon');
  await m.updateButton(page.id, btn.id, { stateSource: null });
  assert.equal(m.getPage(page.id).buttons[0].stateSource, null);
  await m.addDisplay(page.id, { value: 'rpm', type: 'tacho' });
  const copy = await m.importPage(m.exportPage(page.id));
  assert.equal(copy.displays.length, 1);
  assert.equal(copy.displays[0].type, 'tacho');
  assert.notEqual(copy.displays[0].id, m.getPage(page.id).displays[0].id);
});

test('Elemente mit fertigem Inhalt: Karte, Geräte, Steuerung, Planer-Teile; Export/Import, löschen', async () => {
  const { m } = await manager({ p1: { id: 'p1', name: 'Alt', buttons: [], embeds: [{ baustein: 'stoppuhr' }, { baustein: 'geraete', width: 500, height: 1 }, { baustein: 'planer' }] } });
  const old = m.getPage('p1').embeds;
  assert.equal(old.length, 2, 'ausgebaute Zähler fallen weg');
  assert.deepEqual([old[0].baustein, old[0].width, old[0].height, old[0].show], ['geraete', 100, 6, 'immer']);
  assert.equal(old[1].baustein, 'planer-felder', 'der frühere ganze Arbeitsplaner wird zur Feldliste');
  assert.deepEqual(old[1].opts, { alle: false, group: 'komplex', filter: 'alle', sort: 'arbeit' });
  const page = await m.createPage('Feld');
  assert.deepEqual(m.getPage(page.id).embeds, []);
  const { embed } = await m.addEmbed(page.id, { baustein: 'karte' });
  assert.equal(embed.baustein, 'karte');
  await assert.rejects(m.addEmbed(page.id, { baustein: 'cockpit' }));
  const r = await m.updateEmbed(page.id, embed.id, { x: 30, width: 55, baustein: 'planer-naechstes', id: 'fremd', show: 'gross' });
  assert.deepEqual([r.embed.id, r.embed.x, r.embed.width, r.embed.baustein, r.embed.show], [embed.id, 30, 55, 'planer-naechstes', 'gross']);
  const f = (await m.updateEmbed(page.id, embed.id, { baustein: 'planer-felder', opts: { group: 'frucht', filter: 'ernte', sort: 'quatsch', alle: 'ja' } })).embed;
  assert.deepEqual(f.opts, { alle: false, group: 'frucht', filter: 'ernte', sort: 'arbeit' });
  const copy = await m.importPage(m.exportPage(page.id));
  assert.equal(copy.embeds[0].baustein, 'planer-felder');
  assert.notEqual(copy.embeds[0].id, embed.id);
  await m.removeEmbed(page.id, embed.id);
  assert.equal(m.getPage(page.id).embeds.length, 0);
  await assert.rejects(m.removeEmbed(page.id, embed.id));
});

test('„zeigen ab“ an jedem Element, Unsinn wird zu „immer“', async () => {
  const { m } = await manager({ p1: { id: 'p1', name: 'Alt', buttons: [{ show: 'mittel' }], displays: [{ show: 'quatsch' }], texts: [{ show: 'gross' }], graphics: [{}] } });
  const p = m.getPage('p1');
  assert.deepEqual([p.buttons[0].show, p.displays[0].show, p.texts[0].show, p.graphics[0].show], ['mittel', 'immer', 'gross', 'immer']);
  await m.updateButton('p1', p.buttons[0].id, { show: 'gross' });
  assert.equal(m.getPage('p1').buttons[0].show, 'gross');
});

test('Vorlagen: einmal anlegen (feste IDs), ohne Spieldaten nur die Steuerung, zurücksetzen', async () => {
  const { m } = await manager();
  assert.equal(await m.ensureVorlagen(true), true);
  const cockpit = m.getPage('sm-v-cockpit');
  assert.equal(cockpit.vorlage, 'cockpit');
  assert.ok(cockpit.displays.some(d => d.value === 'speed' && d.type === 'tacho' && d.show === 'immer'));
  // für jede Kachelform eine eigene Anordnung (23.10.2026); in 1 Feld nur das Wichtigste
  assert.deepEqual(Object.keys(cockpit.varianten).sort(), ['1x1', '1x2', '1x3', '2x1', '2x2']);
  const tacho = cockpit.displays.find(d => d.value === 'speed'), rpm = cockpit.displays.find(d => d.value === 'rpm');
  assert.equal(cockpit.varianten['1x1'][tacho.id].a, 1.36);
  assert.deepEqual(cockpit.varianten['1x1'][rpm.id], { hidden: true });
  assert.equal(m.getPage('sm-v-strecke').buttons[0].functionId, 'hub:strecke:reset');
  assert.equal(m.getPage('sm-v-geraete').embeds[0].baustein, 'geraete');
  // volle Breite und in „2 hoch“ volle Höhe (Höhe in % der Breite, dort gut 160 %) werden nicht mehr gekappt
  assert.ok(m.getPage('sm-v-fahrzeug').displays.find(d => d.value === 'fuel_pct').width > 95);
  const ger = m.getPage('sm-v-geraete');
  assert.ok(ger.varianten['2x1'][ger.embeds[0].id].height > 150);
  assert.equal(m.getPage('sm-v-precision').buttons.length, 4);
  // gestaltet übernommen (24.10.2026): Cockpit ohne Vorgewende, mit Füllstand des gewählten Geräts; Beleuchtung mit Bild
  assert.ok(!cockpit.displays.some(d => d.value === 'headland_dist') && cockpit.displays.some(d => d.value === 'sel_fill'));
  const licht = m.getPage('sm-v-beleuchtung');
  assert.equal(licht.graphics[0].src, '/img/vorlagen/traktor-seite.svg');
  assert.equal(licht.graphics[0].locked, true);
  assert.equal(licht.buttons.filter(b => b.icon && b.functionId && b.stateSource).length, 8);
  assert.deepEqual(Object.keys(licht.varianten).sort(), ['1x1', '1x2', '1x3', '2x1', '2x2']);
  assert.ok(licht.varianten['1x1'][licht.graphics[0].id].width > 0, 'Bild auch in der kleinen Kachel');
  assert.ok(m.templateList(true).find(t => t.id === 'beleuchtung').preview.graphics[0].src);
  // nur einmal: gelöschte Vorlage kommt nicht wieder
  await m.deletePage('sm-v-werte');
  assert.equal(await m.ensureVorlagen(true), false);
  assert.equal(m.getPage('sm-v-werte'), null);
  // zurücksetzen stellt die Vorlage wieder her
  await m.removeDisplay('sm-v-cockpit', cockpit.displays[0].id);
  const n = m.getPage('sm-v-cockpit').displays.length;
  const reset = await m.resetToTemplate('sm-v-cockpit');
  assert.equal(reset.displays.length, n + 1);
  await assert.rejects(m.resetToTemplate((await m.createPage('Frei')).id));
  // Spiel ohne Spieldaten
  const { m: m2 } = await manager();
  await m2.ensureVorlagen(false);
  assert.ok(m2.getPage('sm-v-steuerung'));
  assert.equal(m2.getPage('sm-v-cockpit'), null);
  assert.ok(m.templateList(false).every(t => t.id === 'steuerung'));
  // Arbeitsplaner nur bei Spielen mit Planer
  assert.ok(m.getPage('sm-v-planer'), 'mit allen Fähigkeiten auch der Arbeitsplaner');
  const { m: m3 } = await manager();
  await m3.ensureVorlagen(['telemetry', 'map']);
  assert.ok(m3.getPage('sm-v-cockpit'));
  assert.equal(m3.getPage('sm-v-planer'), null);
  assert.ok(!m3.templateList(['telemetry']).some(t => t.id === 'planer'));
  assert.ok(m3.templateList(['telemetry', 'planner']).some(t => t.id === 'planer'));
});

test('Arbeitsplaner-Vorlage: drei Planer-Teile, Anordnung je Kachelform mit Seitenverhältnis; bestehende Installation bekommt ihn einmal dazu', async () => {
  const { m } = await manager();
  await m.ensureVorlagen(['telemetry', 'planner']);
  const p = m.getPage('sm-v-planer');
  assert.deepEqual(p.embeds.map(e => e.baustein), ['planer-aktuell', 'planer-naechstes', 'planer-felder']);
  const [akt, nx, fl] = p.embeds.map(e => e.id);
  assert.deepEqual(Object.keys(p.varianten).sort(), ['1x1', '1x2', '1x3', '2x1', '2x2']);
  assert.equal(p.varianten['1x1'][akt].a, 1.36);
  assert.ok(p.varianten['1x1'][akt].width > 90, 'Feld in Arbeit füllt in 1 Feld die Breite');
  assert.deepEqual(p.varianten['1x1'][fl], { hidden: true });
  assert.equal(p.varianten['1x3'][nx].a, 4.29);
  // eigene Lage überschreibt, Zurücksetzen holt die der Vorlage zurück
  await m.updateVariantElement('sm-v-planer', '1x1', fl, { hidden: false, x: 50, y: 50, width: 90, height: 60, a: 1.69 });
  assert.equal(m.getPage('sm-v-planer').varianten['1x1'][fl].a, 1.69);
  const reset = await m.resetToTemplate('sm-v-planer');
  assert.deepEqual(reset.varianten['1x1'][reset.embeds[2].id], { hidden: true });
  // Installation mit Stand 1 (vor dem Arbeitsplaner): nur er kommt dazu, gelöschte andere nicht
  const { m: alt } = await manager();
  alt.vorlagen = 1;
  assert.equal(await alt.ensureVorlagen(['telemetry', 'planner']), true);
  assert.ok(alt.getPage('sm-v-planer'));
  assert.equal(alt.getPage('sm-v-cockpit'), null);
  assert.equal(alt.vorlagen, 3);
  assert.equal(await alt.ensureVorlagen(['telemetry', 'planner']), false);
});

test('Vorlagen-Stand 3: vorhandene Vorlagen-Kacheln werden einmal erneuert, Beispiele kommen dazu', async () => {
  const { m } = await manager();
  await m.ensureVorlagen(true);
  for (const k of ['feldarbeit', 'strasse']) await m.deletePage(`sm-v-${k}`);
  await m.deletePage('sm-v-werte');
  m.vorlagen = 2;   // Installation vor dem 23.10.2026
  const cockpit = m.getPage('sm-v-cockpit');
  const n = cockpit.displays.length;
  await m.removeDisplay('sm-v-cockpit', cockpit.displays[0].id);
  await m.renamePage('sm-v-cockpit', 'Mein Cockpit');
  assert.equal(await m.ensureVorlagen(true), true);
  const neu = m.getPage('sm-v-cockpit');
  assert.equal(neu.displays.length, n, 'Cockpit wieder wie die Vorlage');
  assert.equal(neu.name, 'Mein Cockpit', 'Name bleibt');
  assert.equal(m.getPage('sm-v-werte'), null, 'gelöschte Vorlage bleibt gelöscht');
  const feld = m.getPage('sm-v-feldarbeit');
  assert.ok(feld && m.getPage('sm-v-strasse'));
  assert.deepEqual(feld.buttons.map(b => b.stateSource), ['r1_low', 'r1_on', 'f_low', 'f_on']);
  assert.deepEqual(Object.keys(feld.varianten).sort(), ['1x1', '1x2', '1x3', '2x1', '2x2']);
  // nur einmal
  await m.removeDisplay('sm-v-cockpit', neu.displays[0].id);
  assert.equal(await m.ensureVorlagen(true), false);
  assert.equal(m.getPage('sm-v-cockpit').displays.length, n - 1);
});

test('Anordnung je Kachelform: anlegen, Element ändern/ausblenden, Aufräumen, Import, Zurücksetzen', async () => {
  const { m } = await manager();
  const page = await m.createPage('Licht');
  const [b1, b2] = m.getPage(page.id).buttons;
  await assert.rejects(m.setVariant(page.id, '3x3', {}));
  await assert.rejects(m.updateVariantElement(page.id, '1x1', b1.id, { x: 5 }), /noch keine eigene Anordnung/);
  await m.setVariant(page.id, '1x1', { [b1.id]: { x: 30, y: 40, size: 25, fontSize: 4, quatsch: 1 }, [b2.id]: { hidden: true, x: 'nein' }, fremd: { x: 1 } });
  let v = m.getPage(page.id).varianten['1x1'];
  assert.deepEqual(v[b1.id], { x: 30, y: 40, size: 25, fontSize: 4 });
  assert.deepEqual(v[b2.id], { hidden: true });
  assert.equal(v.fremd, undefined);
  await m.updateVariantElement(page.id, '1x1', b2.id, { hidden: false, x: 70, y: 40, size: 25 });
  assert.deepEqual(m.getPage(page.id).varianten['1x1'][b2.id], { x: 70, y: 40, size: 25 });
  // gelöschtes Element verschwindet auch aus der Anordnung
  await m.removeButton(page.id, b2.id);
  assert.equal(m.getPage(page.id).varianten['1x1'][b2.id], undefined);
  // Import: neue IDs, Anordnung zieht mit
  const copy = await m.importPage(m.exportPage(page.id));
  const nb1 = copy.buttons.find(b => b.label === b1.label && b.x === b1.x).id;
  assert.notEqual(nb1, b1.id);
  assert.deepEqual(copy.varianten['1x1'][nb1], { x: 30, y: 40, size: 25, fontSize: 4 });
  // wieder automatisch
  await m.removeVariant(page.id, '1x1');
  assert.equal(m.getPage(page.id).varianten['1x1'], undefined);
  // Zurücksetzen einer Vorlage verwirft eigene Anordnungen
  await m.ensureVorlagen(true);
  const c = m.getPage('sm-v-cockpit');
  await m.setVariant('sm-v-cockpit', '2x1', { [c.displays[0].id]: { x: 50, y: 30, width: 80, height: 50 } });
  const reset = await m.resetToTemplate('sm-v-cockpit');
  assert.deepEqual(Object.keys(reset.varianten).sort(), ['1x1', '1x2', '1x3', '2x1', '2x2'], 'Zurücksetzen holt die Anordnungen der Vorlage');
  assert.notEqual(reset.varianten['2x1'][reset.displays[0].id].width, 80);
});

test('Steuerungsübersicht als Element: Anzahl und Module werden geprüft gespeichert', async () => {
  const { m } = await manager();
  const page = await m.createPage('Übersicht');
  const { embed } = await m.addEmbed(page.id, { baustein: 'steuerung', opts: { count: 9, mods: ['craftslot2', 'craftslot1', '<böse>', 5] } });
  assert.deepEqual(embed.opts, { count: 'auto', mods: ['craftslot2', 'craftslot1'] });
  const r = await m.updateEmbed(page.id, embed.id, { opts: { count: 2, mods: ['einschub1'] } });
  assert.deepEqual(r.embed.opts, { count: 2, mods: ['einschub1'] });
  const karte = (await m.addEmbed(page.id, { baustein: 'karte', opts: { count: 2 } })).embed;
  assert.deepEqual(karte.opts, {});
});

test('Kachel-Editor: Ebenen über alle Arten, Gruppen, Name/gesperrt, ganze Kachel speichern', async () => {
  const { m } = await manager({ p1: { id: 'p1', name: 'Alt', gridSize: 5, fineGridSize: 1,
    buttons: [{ id: 'b1' }, { id: 'b2' }], graphics: [{ id: 'g1' }], texts: [{ id: 't1' }] } });
  let p = m.getPage('p1');
  // ohne Liste: frühere feste Reihenfolge (Grafik, Text, …, Taste); altes Standardraster wird feiner
  assert.deepEqual(p.layers, ['g1', 't1', 'b1', 'b2']);
  assert.deepEqual([p.gridSize, p.fineGridSize], [2.5, 0.5]);
  assert.deepEqual(p.groups, {});
  assert.equal(p.buttons[0].locked, false);
  // ganzer Inhalt: Reihenfolge, Gruppe (liegt danach zusammen), Name, gesperrt; unbekannte IDs fallen aus der Liste
  p = await m.replaceContent('p1', {
    buttons: [{ ...p.buttons[0], group: 'k1', name: 'Hubwerk' }, { ...p.buttons[1] }],
    graphics: [{ ...p.graphics[0], locked: true }], texts: [{ ...p.texts[0], group: 'k1' }], displays: [], embeds: [],
    layers: ['b1', 'g1', 'gibtsnicht', 'b2', 't1'], groups: { k1: { name: 'Hinten' }, leer: { name: 'x' } }, gridSize: 1.25
  });
  assert.deepEqual(p.layers, ['g1', 'b2', 'b1', 't1'], 'Gruppe k1 liegt zusammen an der Stelle ihres vordersten Elements');
  assert.deepEqual(p.groups, { k1: { name: 'Hinten' } });
  assert.equal(p.buttons[0].name, 'Hubwerk');
  assert.equal(p.graphics[0].locked, true);
  assert.equal(p.gridSize, 1.25);
  // Gruppe mit nur noch einem Element löst sich auf
  p = await m.replaceContent('p1', { texts: [] });
  assert.equal(p.buttons[0].group, null);
  assert.deepEqual(p.groups, {});
  assert.deepEqual(p.layers, ['g1', 'b2', 'b1']);
  // Export/Import nimmt Reihenfolge und Gruppen mit (neue IDs)
  await m.replaceContent('p1', { buttons: p.buttons.map(b => ({ ...b, group: 'k2' })), groups: { k2: { name: 'Tasten' } } });
  const copy = await m.importPage(m.exportPage('p1'));
  assert.equal(copy.layers.length, 3);
  assert.ok(copy.layers.every(id => !['g1', 'b1', 'b2'].includes(id)));
  assert.deepEqual(copy.groups, { k2: { name: 'Tasten' } });
  assert.equal(copy.buttons.filter(b => b.group === 'k2').length, 2);
  // neues Element über eine alte Schnittstelle landet vorne
  await m.addButtonSlot('p1');
  const nb = m.getPage('p1').buttons.at(-1);
  assert.equal(m.getPage('p1').layers.at(-1), nb.id);
});
