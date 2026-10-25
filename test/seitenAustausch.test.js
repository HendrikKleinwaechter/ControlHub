// Kachelseiten exportieren/importieren (24.10.2026): eigene Tastenfelder kommen mit, mitgelieferte bleiben Verweise,
// neue Kennungen, Namen durchnummeriert, je Profil höchstens 10 Seiten zu sehen (insgesamt bis 100).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportiereSeiten, importiereSeiten } from '../server/seitenAustausch.js';

function sm(seiten = {}) {
  const pages = { ...seiten };
  let n = 0;
  return {
    pages,
    getPage: id => pages[id] || null,
    exportPage(id) { if (!pages[id]) throw new Error('fehlt'); const { id: _x, ...rest } = pages[id]; return JSON.parse(JSON.stringify(rest)); },
    async importPage(d) { const id = `neu${++n}`; pages[id] = { ...d, id }; return pages[id]; }
  };
}
function km(pages) {
  let config = { version: 2, bausteine: 2, pages };
  return { get: () => config, async set(c) { if (c.pages.length > 100) throw new Error('zu viele'); config = c; return config; } };   // wie KachelnManager.set (100 je Spiel)
}

test('Export: nur eigene Tastenfelder mit, mitgelieferte und fehlende bleiben Verweise', () => {
  const s = sm({ eigen1: { id: 'eigen1', name: 'Mein Feld', buttons: [{ id: 'b1' }] } });
  const k = km([
    { id: 'a', name: 'Feld', cells: ['panel:sm-v-cockpit', 'panel:eigen1', 'karte', '', 'panel:weg', ''], profiles: [], settings: {} },
    { id: 'b', name: 'Ernte', cells: ['', '', '', '', '', ''], profiles: ['Ernte'], settings: {} }
  ]);
  const d = exportiereSeiten(k.get(), s, ['a']);
  assert.equal(d.controlhubKachelseiten, 1);
  assert.deepEqual(d.pages.map(p => p.id), ['a']);
  assert.deepEqual(Object.keys(d.kacheln), ['eigen1']);
  assert.equal(d.kacheln.eigen1.name, 'Mein Feld');
  assert.equal(exportiereSeiten(k.get(), s).pages.length, 2, 'ohne Auswahl alle');
});

test('Import: neue IDs, Verweise umgestellt, Name durchnummeriert, fehlende Kacheln und fremde Profile gemeldet', async () => {
  const quelle = sm({ eigen1: { id: 'eigen1', name: 'Mein Feld' } });
  const datei = exportiereSeiten(km([{ id: 'a', name: 'Feld', cells: ['panel:eigen1', 'panel:sm-v-cockpit', 'panel:weg', '', '', ''], profiles: ['Säen'], settings: { karte: { north: true } } }]).get(), quelle);
  const ziel = sm({ 'sm-v-cockpit': { id: 'sm-v-cockpit', name: 'Cockpit' } });
  const k = km([{ id: 'x', name: 'Feld', cells: ['', '', '', '', '', ''], profiles: [], settings: {} }]);
  const r = await importiereSeiten(datei, k, ziel, ['Pflügen']);
  assert.deepEqual(r.seiten, ['Feld (2)']);
  assert.equal(r.kacheln, 1);
  assert.equal(r.fehlend, 1, 'panel:weg gibt es weder in der Datei noch hier');
  assert.deepEqual(r.ohneProfil, ['Feld (2)']);
  const seite = k.get().pages[1];
  assert.notEqual(seite.id, 'a');
  assert.deepEqual(seite.cells.slice(0, 3), ['panel:neu1', 'panel:sm-v-cockpit', 'panel:weg']);
  assert.deepEqual(seite.settings, { karte: { north: true } });
  assert.equal(ziel.pages.neu1.name, 'Mein Feld');
});

test('Import: falsche Datei und zu viele Seiten werden abgelehnt, ohne etwas anzulegen', async () => {
  const k = km(Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, name: `S${i}`, cells: [], profiles: [], settings: {} })));
  const s = sm();
  await assert.rejects(importiereSeiten({ pages: [] }, k, s), /Keine Kachelseiten-Datei/);
  const zwei = { controlhubKachelseiten: 1, pages: [{ name: 'A', cells: [] }, { name: 'B', cells: [] }], kacheln: { e: { name: 'E' } } };
  await assert.rejects(importiereSeiten(zwei, k, s), /höchstens 10/);
  assert.equal(Object.keys(s.pages).length, 0, 'keine Tastenfelder angelegt');
  assert.equal(k.get().pages.length, 9);
  // Seiten für ein bestimmtes Profil: zählen nur dort mit
  const fuerSaeen = { controlhubKachelseiten: 1, pages: [{ name: 'A', cells: [], profiles: ['Säen'] }, { name: 'B', cells: [], profiles: ['Säen'] }] };
  await assert.rejects(importiereSeiten(fuerSaeen, k, s), /bei „Säen“ wären es 11/);
  const verteilt = { controlhubKachelseiten: 1, pages: [{ name: 'A', cells: [], profiles: ['Säen'] }, { name: 'B', cells: [], profiles: ['Ernte'] }] };
  const r = await importiereSeiten(verteilt, k, s);
  assert.equal(r.seiten.length, 2);
  assert.equal(k.get().pages.length, 11, 'insgesamt mehr als 10 Seiten');
});
