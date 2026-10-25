// Bilder in Kachel-Dateien (24.10.2026): einbetten beim Export, ablegen und Verweise umstellen beim Import.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { bilderEinbetten, bilderUebernehmen } from '../server/kachelBilder.js';
import { SteuerungsmenuesManager } from '../server/steuerungsmenuesManager.js';
import { exportiereSeiten, importiereSeiten } from '../server/seitenAustausch.js';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';

async function ordner() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-kb-'));
  const quelle = { assetsDir: path.join(root, 'quelle'), publicDir: path.join(root, 'public') };
  await fs.mkdir(path.join(quelle.assetsDir, 'steuerungsmenue-graphics', 'fs25'), { recursive: true });
  await fs.mkdir(path.join(quelle.assetsDir, 'steuerungsmenue-bg', 'fs25'), { recursive: true });
  await fs.mkdir(path.join(quelle.publicDir, 'img', 'vorlagen'), { recursive: true });
  await fs.writeFile(path.join(quelle.assetsDir, 'steuerungsmenue-graphics', 'fs25', 'gfx-1.png'), PNG);
  await fs.writeFile(path.join(quelle.assetsDir, 'steuerungsmenue-bg', 'fs25', 'p1.png'), PNG);
  await fs.writeFile(path.join(quelle.publicDir, 'img', 'vorlagen', 'traktor.svg'), SVG);
  return { root, quelle };
}

test('Export: eigene Bilder und Bilder aus dem Programm als data-URL, fehlende fehlen', async () => {
  const { quelle } = await ordner();
  const kachel = { background: '/steuerungsmenue-bg/fs25/p1.png', graphics: [{ src: '/steuerungsmenue-graphics/fs25/gfx-1.png' }, { src: '/img/vorlagen/traktor.svg' }, { src: '/steuerungsmenue-graphics/fs25/weg.png' }, { src: null }] };
  const b = await bilderEinbetten(kachel, quelle);
  assert.deepEqual(Object.keys(b).sort(), ['/img/vorlagen/traktor.svg', '/steuerungsmenue-bg/fs25/p1.png', '/steuerungsmenue-graphics/fs25/gfx-1.png']);
  assert.equal(b['/steuerungsmenue-graphics/fs25/gfx-1.png'], `data:image/png;base64,${PNG.toString('base64')}`);
  assert.match(b['/img/vorlagen/traktor.svg'], /^data:image\/svg\+xml;base64,/);
  assert.deepEqual(await bilderEinbetten({ graphics: [{ src: '/steuerungsmenue-graphics/../../geheim.png' }] }, quelle), {});
});

test('Import: Bilder in den Ordner des Spiels, benannt nach den neuen IDs; Programm-Bild bleibt Verweis, wenn es da ist', async () => {
  const { root, quelle } = await ordner();
  const kachel = { background: '/steuerungsmenue-bg/fs25/p1.png', graphics: [{ src: '/steuerungsmenue-graphics/fs25/gfx-1.png' }, { src: '/img/vorlagen/traktor.svg' }] };
  const bilder = await bilderEinbetten(kachel, quelle);
  const ziel = { assetsDir: path.join(root, 'ziel'), gameId: 'meins' };
  // Ziel hat das Programm-Bild
  const neu = { id: 'kneu', background: kachel.background, graphics: [{ id: 'gfx-a', src: kachel.graphics[0].src }, { id: 'gfx-b', src: '/img/vorlagen/traktor.svg' }] };
  assert.equal(await bilderUebernehmen(neu, bilder, { ...ziel, publicDir: quelle.publicDir }), 2);
  assert.equal(neu.background, '/steuerungsmenue-bg/meins/kneu.png');
  assert.equal(neu.graphics[0].src, '/steuerungsmenue-graphics/meins/gfx-a.png');
  assert.equal(neu.graphics[1].src, '/img/vorlagen/traktor.svg');
  assert.deepEqual(await fs.readFile(path.join(ziel.assetsDir, 'steuerungsmenue-graphics', 'meins', 'gfx-a.png')), PNG);
  // Ziel ohne das Programm-Bild (andere Version): wird als eigenes Bild abgelegt
  const neu2 = { id: 'k2', graphics: [{ id: 'gfx-c', src: '/img/vorlagen/traktor.svg' }] };
  assert.equal(await bilderUebernehmen(neu2, bilder, { ...ziel, publicDir: path.join(root, 'leer') }), 1);
  assert.equal(neu2.graphics[0].src, '/steuerungsmenue-graphics/meins/gfx-c.svg');
});

test('Import: unsichere SVG, kaputte Daten und ältere Dateien ohne Bilder ändern nichts', async () => {
  const { root } = await ordner();
  const ziel = { assetsDir: path.join(root, 'ziel'), gameId: 'fs25', publicDir: path.join(root, 'leer') };
  const boese = { '/steuerungsmenue-graphics/x/a.svg': `data:image/svg+xml;base64,${Buffer.from('<svg onload="alert(1)"/>').toString('base64')}`,
    '/steuerungsmenue-graphics/x/b.png': 'data:text/html;base64,PGgxPg==' };
  const k = { id: 'k', graphics: [{ id: 'g1', src: '/steuerungsmenue-graphics/x/a.svg' }, { id: 'g2', src: '/steuerungsmenue-graphics/x/b.png' }] };
  assert.equal(await bilderUebernehmen(k, boese, ziel), 0);
  assert.equal(k.graphics[0].src, '/steuerungsmenue-graphics/x/a.svg');
  assert.equal(await bilderUebernehmen(k, undefined, ziel), 0);
});

test('Kachelseiten: Bilder reisen mit, die importierte Kachel zeigt auf ihre eigene Kopie', async () => {
  const { root, quelle } = await ordner();
  const sm = new SteuerungsmenuesManager(path.join(root, 'a.json'));
  await sm.initialize();
  const k = await sm.importPage({ name: 'Mit Bild', graphics: [{ src: '/steuerungsmenue-graphics/fs25/gfx-1.png', width: 20, height: 20 }] });
  const daten = exportiereSeiten({ pages: [{ id: 's1', name: 'Seite', cells: Array(6).fill(`panel:${k.id}`), profiles: [] }] }, sm);
  for (const x of Object.values(daten.kacheln)) x.bilder = await bilderEinbetten(x, quelle);
  const datei = JSON.parse(JSON.stringify(daten));   // wie über die Festplatte

  const sm2 = new SteuerungsmenuesManager(path.join(root, 'b.json'));
  await sm2.initialize();
  let config = { pages: [] };
  const km = { get: () => config, set: async c => { config = c; return c; } };
  const ziel = { assetsDir: path.join(root, 'ziel'), gameId: 'fs25' };
  const r = await importiereSeiten(datei, km, sm2, [], { nachKachel: (kachel, ausDatei) => bilderUebernehmen(kachel, ausDatei.bilder, ziel) });
  assert.equal(r.kacheln, 1);
  const neu = sm2.getPage(config.pages[0].cells[0].slice(6));
  assert.equal(neu.graphics[0].src, `/steuerungsmenue-graphics/fs25/${neu.graphics[0].id}.png`);
  assert.deepEqual(await fs.readFile(path.join(ziel.assetsDir, 'steuerungsmenue-graphics', 'fs25', `${neu.graphics[0].id}.png`)), PNG);
});
