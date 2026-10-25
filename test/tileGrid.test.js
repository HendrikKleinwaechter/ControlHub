// Rasterlogik der Kachelseiten (public/js/tileGrid.js) -- Datei wird wie im Browser als Skript geladen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import vm from 'vm';

const ctx = vm.createContext({});
vm.runInContext(readFileSync(new URL('../public/js/tileGrid.js', import.meta.url), 'utf-8'), ctx);
// Ergebnisse aus der getrennten Umgebung in normale Werte umwandeln (sonst gelten gleiche Listen als ungleich)
const plain = fn => (...args) => JSON.parse(JSON.stringify(fn(...args)) ?? 'null');
const merge = plain(ctx.TileGrid.merge);
const pagesFor = plain(ctx.TileGrid.pagesFor);
const { steuerungCount, steuerungCols } = ctx.TileGrid;
const shape = t => `${t.type || '·'} ${t.row}/${t.col} ${t.rows}×${t.cols}`;

test('gleiche Bausteine nebeneinander werden zu einer Kachel', () => {
  const { tiles, bad } = merge(['karte', 'karte', 'fahrzeug', 'karte', 'karte', 'werte']);
  assert.deepEqual(tiles.map(shape), ['karte 0/0 2×2', 'fahrzeug 0/2 1×1', 'werte 1/2 1×1']);
  assert.deepEqual(bad, []);
});

test('eine große Kachel über alle Felder', () => {
  const { tiles } = merge(Array(6).fill('cockpit'));
  assert.deepEqual(tiles.map(shape), ['cockpit 0/0 2×3']);
  assert.equal(tiles[0].size, 6);
});

test('nicht rechteckig: Felder bleiben einzeln und werden gemeldet', () => {
  const { tiles, bad } = merge(['karte', 'karte', 'werte', 'karte', 'werte', 'werte']);
  assert.deepEqual(bad.sort(), ['karte', 'werte']);
  assert.equal(tiles.length, 6);
  assert.ok(tiles.every(t => t.size === 1));
});

test('leere Felder sind eigene Kacheln, Reihenfolge wie gelesen', () => {
  const { tiles } = merge(['', 'werte', 'werte', '', '', 'planer']);
  assert.deepEqual(tiles.map(shape), ['· 0/0 1×1', 'werte 0/1 1×2', '· 1/0 1×1', '· 1/1 1×1', 'planer 1/2 1×1']);
});

test('kaputte Eingabe ergibt sechs leere Felder', () => {
  assert.equal(merge(null).tiles.length, 6);
  assert.equal(merge(['karte', 7, null]).tiles.filter(t => t.type === 'karte').length, 1);
});

test('Standardseiten gelten für alle, Profilseiten nur für ihr Profil', () => {
  const pages = [{ id: 's', profiles: [] }, { id: 'p', profiles: ['Pflügen'] }, { id: 'm', profiles: ['Mähwerk', 'Pflügen'] }];
  assert.deepEqual(pagesFor(pages, 'Pflügen').map(p => p.id), ['s', 'p', 'm']);
  assert.deepEqual(pagesFor(pages, 'Mähwerk').map(p => p.id), ['s', 'm']);
  assert.deepEqual(pagesFor(pages, 'default').map(p => p.id), ['s']);
});

test('Steuerungskachel: Modulzahl nach Kachelgröße', () => {
  assert.deepEqual([1, 2, 3, 4, 6].map(s => steuerungCount('auto', s)), [1, 2, 3, 1, 1]);
  assert.equal(steuerungCount(4, 4), 4);
  assert.equal(steuerungCount(4, 2), 2);
  assert.equal(steuerungCount(9, 6), 4);
  assert.deepEqual([[1, 2], [2, 2], [2, 1], [3, 3], [4, 2], [4, 3]].map(([n, w]) => steuerungCols(n, w)), [1, 2, 1, 3, 2, 2]);   // 4 Module in 3 Spalten: 2 × 2
});

test('Hauptseite je Profil: eigene Seite vor Standardseite; Einschalten nimmt es konkurrierenden Seiten', () => {
  const TG = ctx.TileGrid;
  const pages = [
    { id: 'std', profiles: [], haupt: true },
    { id: 'ernte', profiles: ['Ernte'] },
    { id: 'ernte2', profiles: ['Ernte', 'Säen'], haupt: true },
    { id: 'std2', profiles: [] }
  ];
  assert.equal(TG.hauptseite(pages, 'Ernte').id, 'ernte2', 'eigene Hauptseite geht vor');
  assert.equal(TG.hauptseite(pages, 'Pflügen').id, 'std', 'sonst die Standard-Hauptseite');
  TG.setzeHaupt(pages, pages[1], true);
  assert.equal(TG.hauptseite(pages, 'Ernte').id, 'ernte');
  assert.equal(pages[2].haupt, undefined, 'gemeinsames Profil Ernte: die andere verliert es');
  assert.equal(pages[0].haupt, true, 'Standardseite bleibt');
  TG.setzeHaupt(pages, pages[3], true);
  assert.equal(pages[0].haupt, undefined, 'nur eine Standard-Hauptseite');
  TG.setzeHaupt(pages, pages[3], false);
  assert.equal(TG.hauptseite(pages, 'Pflügen'), null);
});
