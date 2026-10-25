// Arbeitsplaner: Sätze je Spielstand, Komplexe, Fruchtfolge (Umsetzungsplan Paket E2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { PlannerStore, cleanSet, savegameKey } from '../server/plannerStore.js';
// Schritte ohne ihre zufällige Kennung vergleichen
const ohneId = x => JSON.parse(JSON.stringify(x, (k, v) => (k === 'id' ? undefined : v)));

async function store() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-planer-'));
  const s = new PlannerStore(path.join(dir, 'planer.json'));
  await s.initialize();
  return { s, file: path.join(dir, 'planer.json') };
}
const SP20 = { index: 20, name: 'Mein Spielstand', dir: 'savegame20', mapId: 'MapEU', multiplayer: false };
const SP21 = { ...SP20, index: 21, name: 'Zweiter', dir: 'savegame21' };
const MP = { index: 0, name: 'Server Hof', dir: '', mapId: 'MapEU', multiplayer: true };

test('Kennung: Einzelspieler Karte + Nummer, Mehrspieler eigener Schlüssel, ohne Mod 0.5 keine', () => {
  assert.equal(savegameKey(SP20, 'Zielonka'), 'sp|MapEU|20');
  assert.equal(savegameKey(MP, 'Zielonka'), 'mp|MapEU|Server Hof');
  assert.equal(savegameKey(null), null);
  // Mod 0.7.9 (map#server): Gastgeber über die Nummer wie im Einzelspiel, Gast und ältere Mods über den Namen
  assert.equal(savegameKey({ ...SP20, multiplayer: true, server: true }, 'Zielonka'), 'sp|MapEU|20', 'Gastgeber = Einzelspiel');
  assert.equal(savegameKey({ ...MP, server: false }, 'Zielonka'), 'mp|MapEU|Server Hof', 'Gast');
  assert.equal(savegameKey({ ...MP, server: true }, 'Zielonka'), 'mp|MapEU|Server Hof', 'Server ohne Nummer: wie bisher');
});

test('Satz bereinigen: Fruchtfolge, „dieses Jahr“, Zuordnungen nur zu vorhandenen Komplexen', () => {
  const s = cleanSet({ name: 'Test', complexes: { a: { name: 'Nord', rotation: ['Weizen', 'Gerste', ''], now: 7 } }, complexOf: { 34: 'a', 35: 'gibtsnicht' }, soil: { 34: 'pflug', 35: 'quatsch' } });
  assert.deepEqual(s.complexes.a, { name: 'Nord', now: 1 }, 'Umzug: Stelle der Frucht „dieses Jahr“ in der gemeinsamen Fruchtfolge');
  assert.deepEqual(s.fruchtfolge, { rotation: ['WHEAT', 'BARLEY'], plaene: {} });
  assert.deepEqual(s.complexOf, { 34: 'a' });
  assert.deepEqual(s.soil, { 34: 'pflug' });
  assert.deepEqual(s.complexOrder, ['a']);
});

test('Einzelspieler: erster Spielstand übernimmt den Start-Satz, zweiter bekommt einen eigenen, zurück lädt den alten', async () => {
  const { s } = await store();
  const first = s.current.id;
  assert.equal(await s.onSavegame(SP20, 'Zielonka'), true);
  assert.equal(s.current.id, first);
  await s.update({ ...s.current, complexes: { n: { name: 'Nord', rotation: ['Weizen'], now: 0 } }, complexOf: { 34: 'n' } });
  await s.onSavegame(SP21, 'Zielonka');
  assert.notEqual(s.current.id, first);
  assert.deepEqual(s.current.complexOf, {}, 'neuer Satz ist leer');
  assert.match(s.current.name, /Zweiter/);
  await s.onSavegame(SP20, 'Zielonka');
  assert.equal(s.current.id, first);
  assert.deepEqual(s.current.complexOf, { 34: 'n' });
});

test('Mehrspieler: fragt einmal, merkt sich die Antwort', async () => {
  const { s, file } = await store();
  await s.onSavegame(SP20, 'Zielonka');
  const sp = s.current.id;
  await s.onSavegame(MP, 'Zielonka');
  assert.equal(s.pending, true);
  const mp = await s.saveAs('Mehrspieler Hof', true);
  assert.equal(s.pending, false);
  await s.onSavegame(SP20, 'Zielonka');
  assert.equal(s.current.id, sp);
  await s.onSavegame(MP, 'Zielonka');
  assert.equal(s.pending, false);
  assert.equal(s.current.id, mp, 'Antwort gemerkt');
  const saved = JSON.parse(await fs.readFile(file, 'utf-8'));
  assert.equal(saved.bySavegame['mp|MapEU|Server Hof'], mp);
});

test('Export/Import und Löschen', async () => {
  const { s } = await store();
  const exp = s.exportSet(s.current.id);
  const id = await s.importSet(exp);
  assert.notEqual(id, s.current.id);
  assert.match(s.config.sets[id].name, /\(2\)/);
  await assert.rejects(() => s.remove(s.current.id), /aktive/);
  await s.remove(id);
  assert.equal(s.summary().sets.length, 1);
  await assert.rejects(() => s.importSet({ foo: 1 }), /Keine Planer-Datei/);
});

// Anmerkung 24 (Hendrik 24.10.2026): Schritte je Frucht in der Fruchtfolge, von Hand, Verlauf je Feld
test('Planer-Satz: Pläne je Frucht und von Hand bereinigen, alte Regeln übernehmen; Verlauf führt der Server', async () => {
  const c = cleanSet({ complexes: { k1: { name: 'Nord', rotation: ['Mais', 'Weizen'], now: 0, plaene: {
      Mais: { vor: [{ k: 'grubber' }, { k: 'sow' }, { k: 'gibtsnicht' }], saat: 'direktsaat', pflege: [{ n: ' Gülle ' }], ernte: 1, nach: [{ k: 'mulch' }] },
      Hafer: { vor: [{ k: 'pflug' }] } } } },
    regeln: { Weizen: { schritte: [{ k: 'grubber' }, { k: 'sow' }], stehend: false } },
    vonHand: { 5: [{ s: { k: 'harvest' } }, { s: {} }] }, verlauf: { 3: { frucht: 'Mais', offen: ['mulch', 'x'], ok: ['Mais|nach:0'] } } });
  assert.deepEqual(ohneId(c.fruchtfolge.plaene), {
    MAIZE: { vor: [{ k: 'grubber' }], saat: 'direktsaat', pflege: [{ n: 'Gülle' }], ernte: true, nach: [{ k: 'mulch' }] },
    OAT: { vor: [{ k: 'pflug' }], saat: 'sow', pflege: [], ernte: true, nach: [] },     // bleibt, auch außerhalb der Fruchtfolge
    WHEAT: { vor: [], saat: 'sow', pflege: [], ernte: true, nach: [{ k: 'grubber' }] }   // aus „Regeln je Frucht“
  }, 'Säen ist im Plan ein eigener Abschnitt');
  assert.ok(c.fruchtfolge.plaene.MAIZE.vor[0].id.length >= 6, 'jeder Schritt hat eine feste Kennung');
  assert.equal(c.regeln, undefined);
  assert.deepEqual(ohneId(c.vonHand), { 5: [{ s: { k: 'harvest' }, ok: false }] }, 'von Hand darf auch Ernten');
  assert.deepEqual(c.verlauf, { 3: { frucht: 'MAIZE', offen: ['mulch'], ok: ['MAIZE|nach:0'], gruppe: 'ruhe' } });

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'planer-verlauf-'));
  const st = new PlannerStore(path.join(dir, 'planer.json'));
  await st.initialize();
  st.persistBald = () => {};
  // Mais geerntet (Mulchen offen), dann gegrubbert (keine Frucht mehr): Verlauf bleibt Mais
  assert.equal(st.merkeFelder({ fields: [{ id: 3, fruit: 'Mais', phase: 'geerntet', tasks: { mulch: 1, cultivate: 1 } }] }), true);
  assert.equal(st.merkeFelder({ fields: [{ id: 3, fruit: '', phase: 'vorbereitet', tasks: { sow: 1 } }] }), true);
  assert.deepEqual(st.current.verlauf['3'], { frucht: 'MAIZE', offen: ['mulch', 'cultivate', 'sow'], ok: [], gruppe: 'ruhe' });
  // Tablet mit älterem Stand speichert: Frucht und Offenes bleiben, Abgehakt kommt an
  await st.update({ ...st.current, verlauf: { 3: { frucht: 'Mais', offen: [], ok: ['Raps|vor:1'] } } });
  assert.deepEqual(st.current.verlauf['3'], { frucht: 'MAIZE', offen: ['mulch', 'cultivate', 'sow'], ok: ['CANOLA|vor:1'], gruppe: 'ruhe' });
  // neue Frucht: Verlauf beginnt neu
  st.merkeFelder({ fields: [{ id: 3, fruit: 'Raps', phase: 'waechst', tasks: {} }] });
  assert.deepEqual(st.current.verlauf['3'], { frucht: 'CANOLA', offen: [], ok: [], gruppe: 'wachsen' });
  // Weizen nach Weizen: geerntet → neu gesät → neuer Durchgang (Abgehaktes und Offenes beginnen neu)
  st.merkeFelder({ fields: [{ id: 4, fruit: 'Weizen', phase: 'waechst', tasks: { fertilize: 1 } }] });
  st.current.verlauf['4'].ok.push('WHEAT|abc123');
  st.merkeFelder({ fields: [{ id: 4, fruit: 'Weizen', phase: 'geerntet', tasks: { cultivate: 1 } }] });
  assert.deepEqual(st.current.verlauf['4'], { frucht: 'WHEAT', offen: ['cultivate'], ok: ['WHEAT|abc123'], gruppe: 'ruhe' }, 'Ernte: Offenes je Abschnitt neu');
  st.merkeFelder({ fields: [{ id: 4, fruit: 'Weizen', phase: 'waechst', tasks: {} }] });
  assert.deepEqual(st.current.verlauf['4'], { frucht: 'WHEAT', offen: [], ok: [], gruppe: 'wachsen' }, 'neu gesät');
  // leeres Feld ohne Verlauf sammelt trotzdem
  st.merkeFelder({ fields: [{ id: 5, fruit: '', phase: 'leer', tasks: { lime: 1 } }] });
  assert.deepEqual(st.current.verlauf['5'], { frucht: '(leer)', offen: ['lime'], ok: [], gruppe: 'ruhe' });
  // altes Tablet (anderer Satz) und leere Anfrage werden abgelehnt; im Mehrspieler-Warten nichts merken
  await assert.rejects(() => st.update({ id: 'anderer-satz', name: 'X' }), /gewechselt/);
  await assert.rejects(() => st.update(null), /Kein Planer-Satz/);
  st.pending = true;
  assert.equal(st.merkeFelder({ fields: [{ id: 6, fruit: 'Raps', phase: 'waechst', tasks: {} }] }), false);
  await assert.rejects(() => st.update({ name: 'X' }), /wählen/);
  st.pending = false;
  await fs.rm(dir, { recursive: true, force: true });
});

test('Planer-Satz: Umzug mehrerer Fruchtfolgen je Komplex in eine gemeinsame; neue Form bleibt', () => {
  const alt = cleanSet({ complexOrder: ['a', 'b', 'c'], complexes: {
    a: { name: 'A', rotation: ['Raps', 'Weizen'], now: 1, plaene: { Raps: { vor: [{ k: 'grubber' }] } } },
    b: { name: 'B', rotation: ['Raps', 'Weizen', 'Gerste'], now: 2 },
    c: { name: 'C', rotation: [], now: 0 } } });
  assert.deepEqual(alt.fruchtfolge.rotation, ['CANOLA', 'WHEAT', 'BARLEY'], 'die längste wird die gemeinsame');
  assert.deepEqual(ohneId(alt.fruchtfolge.plaene.CANOLA.vor), [{ k: 'grubber' }]);
  assert.deepEqual([alt.complexes.a.now, alt.complexes.b.now, alt.complexes.c.now], [1, 2, null], 'ohne eigene Fruchtfolge: außerhalb');
  const neu = cleanSet({ fruchtfolge: { rotation: ['Mais', 'Weizen'], plaene: { Hafer: {} } }, complexes: { a: { name: 'A', now: 5 }, b: { name: 'B', now: null } } });
  assert.deepEqual([neu.complexes.a.now, neu.complexes.b.now, Object.keys(neu.fruchtfolge.plaene)], [1, null, ['OAT']]);
  // unsichere Kennungen aus einer geteilten Datei: Komplex umbenannt, Zuordnung bleibt; Felder nur als Nummer
  const boese = cleanSet({ fruchtfolge: { rotation: ['Raps'] }, complexes: { "x');alert(1);('": { name: 'Böse', now: 0 } }, complexOrder: ["x');alert(1);('"],
    complexOf: { 34: "x');alert(1);('", "<img>": "x');alert(1);('" } });
  const [kid] = Object.keys(boese.complexes);
  assert.match(kid, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual([boese.complexOrder, boese.complexOf], [[kid], { 34: kid }]);
});

// Früchte über den internen Namen (Hendrik 24.10.2026)
test('Planer-Satz: alte Anzeigenamen werden interne Namen; Früchte des Spiels gleichen Karten-Mod-Früchte ab', async () => {
  // Stand vor dem 24.10.: deutsche Namen überall, auch im Abhaken; eine Frucht aus einer Karten-Mod („Hopfen“)
  const alt = { fruchtfolge: { rotation: ['Raps', 'Weizen', 'Hopfen'], plaene: { Raps: { vor: [{ k: 'grubber', id: 'abcd12' }] }, Hopfen: {} } },
    complexes: { a: { name: 'A', now: 0 } }, complexOrder: ['a'], complexOf: { 1: 'a' },
    verlauf: { 1: { frucht: 'Weizen', offen: [], ok: ['Raps|abcd12', 'Weizen|vor:0'] } } };
  const c = cleanSet(alt);
  assert.deepEqual(c.fruchtfolge.rotation, ['CANOLA', 'WHEAT', 'Hopfen']);
  assert.deepEqual(Object.keys(c.fruchtfolge.plaene).sort(), ['CANOLA', 'Hopfen']);
  assert.deepEqual(c.verlauf[1].frucht, 'WHEAT');
  assert.deepEqual(c.verlauf[1].ok, ['CANOLA|abcd12', 'WHEAT|vor:0']);
  assert.deepEqual(cleanSet(c), c, 'zweimal umstellen ändert nichts');

  const { s: st } = await store();
  await st.update({ ...st.current, ...alt });
  assert.equal(await st.setFruechte([{ key: 'CANOLA', title: 'Raps' }, { key: 'WHEAT', title: 'Weizen' }, { key: 'HOPS', title: 'Hopfen' }, { key: 'x"><script>', title: 'Böse' }]), true);
  assert.deepEqual(st.current.fruchtfolge.rotation, ['CANOLA', 'WHEAT', 'HOPS'], 'Hopfen jetzt mit internem Namen');
  assert.deepEqual(Object.keys(st.current.fruchtfolge.plaene).sort(), ['CANOLA', 'HOPS']);
  assert.deepEqual(st.current.fruechte.map(f => f.key), ['CANOLA', 'WHEAT', 'HOPS'], 'unsichere Kennung fällt weg');
  assert.equal(await st.setFruechte([{ key: 'CANOLA', title: 'Raps' }, { key: 'WHEAT', title: 'Weizen' }, { key: 'HOPS', title: 'Hopfen' }]), false, 'gleiche Liste: nichts zu tun');
  // ein Tablet speichert: die Früchte des Spiels bleiben (führt der Server)
  await st.update({ ...st.current, fruechte: [] });
  assert.equal(st.current.fruechte.length, 3);
  // anderen bzw. neuen Satz aktiv machen: die Früchte des Spiels kommen mit
  const neuId = await st.saveAs('Leer', true);
  assert.equal(st.current.id, neuId);
  assert.deepEqual(st.current.fruechte.map(f => f.key), ['CANOLA', 'WHEAT', 'HOPS'], 'neuer Satz hat die Früchte des Spiels');
  // Mod 0.7.4 meldet den internen Namen, die Anzeige darf in jeder Sprache sein
  st.merkeFelder({ fields: [{ id: 1, fruit: 'Canola', fruitKey: 'CANOLA', phase: 'waechst', tasks: {} }] });
  assert.equal(st.current.verlauf['1'].frucht, 'CANOLA');
});
