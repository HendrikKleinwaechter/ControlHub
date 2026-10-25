// Untergruppen der Funktionen (24.10.2026): „Obergruppe › Untergruppe“ -- anlegen, umbenennen und löschen nehmen die
// Untergruppen mit, eine Gruppe mit Untergruppen wird nicht selbst Untergruppe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { FunctionsManager } from '../server/functionsManager.js';

async function manager() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-ug-'));
  const fm = new FunctionsManager(path.join(dir, 'functions.json'), path.join(dir, 'categories.json'));
  await fm.initialize();
  fm.categories = [];
  return fm;
}

test('Untergruppe anlegen: Obergruppe kommt mit, beim Import ebenso', async () => {
  const fm = await manager();
  await fm.createCategory('Mods › AutoDrive');
  assert.deepEqual(fm.categories, ['Mods', 'Mods › AutoDrive']);
  await fm.importFunctions({ functions: { a: { name: 'A', categories: ['DLC › Pack'], actions: [] } } }, 'merge');
  assert.deepEqual(fm.categories, ['Mods', 'Mods › AutoDrive', 'DLC', 'DLC › Pack']);
  await assert.rejects(fm.createCategory('Mods'), /existiert bereits/);
});

test('Obergruppe umbenennen: Untergruppen und Funktionen ziehen mit', async () => {
  const fm = await manager();
  await fm.importFunctions({ functions: {
    a: { name: 'A', categories: ['Mods › AutoDrive'], actions: [] },
    b: { name: 'B', categories: ['Mods', 'Eigene'], actions: [] }
  } }, 'merge');
  await fm.renameCategory('Mods', 'Zusatz-Mods');
  assert.deepEqual(fm.categories.filter(c => c !== 'Eigene'), ['Zusatz-Mods', 'Zusatz-Mods › AutoDrive']);
  assert.deepEqual(fm.functions.a.categories, ['Zusatz-Mods › AutoDrive']);
  assert.deepEqual(fm.functions.b.categories, ['Zusatz-Mods', 'Eigene']);
  await assert.rejects(fm.renameCategory('Zusatz-Mods', 'Eigene › Mods'), /nicht selbst Untergruppe/);
  // Untergruppe in eine andere Obergruppe verschieben: neue Obergruppe entsteht
  await fm.renameCategory('Zusatz-Mods › AutoDrive', 'Helfer › AutoDrive');
  assert.ok(fm.categories.includes('Helfer') && fm.categories.includes('Helfer › AutoDrive'));
  assert.deepEqual(fm.functions.a.categories, ['Helfer › AutoDrive']);
});

test('Obergruppe löschen: Untergruppen mit, Funktionen nur darin werden gelöscht, andere verlieren nur die Gruppe', async () => {
  const fm = await manager();
  await fm.importFunctions({ functions: {
    a: { name: 'A', categories: ['Mods › AutoDrive'], actions: [] },
    b: { name: 'B', categories: ['Mods › Kamera', 'Eigene'], actions: [] },
    c: { name: 'C', categories: ['Mods'], actions: [] }
  } }, 'merge');
  const { toDelete, toDetach } = fm.getDeletionImpact('Mods');
  assert.deepEqual(toDelete.map(f => f.id).sort(), ['a', 'c']);
  assert.deepEqual(toDetach.map(f => f.id), ['b']);
  await fm.deleteCategory('Mods');
  assert.equal(fm.functions.a, undefined);
  assert.deepEqual(fm.functions.b.categories, ['Eigene']);
  assert.ok(!fm.categories.some(c => c.startsWith('Mods')));
  // eine Untergruppe allein löschen lässt die Obergruppe stehen
  await fm.importFunctions({ functions: { d: { name: 'D', categories: ['DLC › X', 'DLC › Y'], actions: [] } } }, 'merge');
  await fm.deleteCategory('DLC › X');
  assert.ok(fm.categories.includes('DLC') && fm.categories.includes('DLC › Y'));
  assert.deepEqual(fm.functions.d.categories, ['DLC › Y']);
});

test('Gruppe löschen mit „behalten“: Funktionen bleiben und stehen danach ohne Gruppe (24.10.2026)', async () => {
  const fm = await manager();
  await fm.importFunctions({ functions: {
    a: { name: 'A', categories: ['Mods › AutoDrive'], actions: [] },
    b: { name: 'B', categories: ['Mods', 'Eigene'], actions: [] }
  } }, 'merge');
  await fm.deleteCategory('Mods', { funktionen: 'behalten' });
  assert.deepEqual(fm.functions.a.categories, [], 'steht jetzt unter „Ohne Gruppe“');
  assert.deepEqual(fm.functions.b.categories, ['Eigene']);
  assert.ok(!fm.categories.some(c => c.startsWith('Mods')));
});
