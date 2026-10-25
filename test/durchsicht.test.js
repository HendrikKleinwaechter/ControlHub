// Durchsicht B2, B3, B5 (23.10.2026): Löschen mit Verwendung, Profil gezielt ändern, Makro-Regel und Impulse
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imProfil, inAchsen, inMakros, inKacheln, inKachelseiten, inGps } from '../server/verwendung.js';
import { wendeProfilAenderungenAn } from '../server/profileManager.js';
import { MacroEngine } from '../server/macroEngine.js';
import { MappingEngine } from '../server/mappingEngine.js';

test('B2: Fundstellen in einem Profil (Tasten, Ebenen, Listen, Achsen, Achsen-Auslöser) und Entfernen', () => {
  const profil = {
    buttons: { 3: 'func-licht', 4: 'macro:m1', 5: ['func-licht', 'func-hupe'], 6: [{ type: 'keyboard', key: 'A' }] },
    craftSlotLayers: { craftslot1: { 2: { 7: 'func-licht' } } },
    axes: { 2: { type: 'function', functionPlus: 'func-licht', functionMinus: 'func-x' } },
    axisTriggers: { 'func-licht': { axis: 2 } }
  };
  assert.deepEqual(imProfil(profil, 'func-licht'), ['Taste 3', 'Taste 5', 'Ebene II · CraftSlot 1 · Taste 7', 'Achse CraftSlot 1 – Hebel vor/zurück (+)', 'Achsen-Auslöser']);
  assert.deepEqual(imProfil(profil, 'macro:m1'), ['Taste 4']);
  imProfil(profil, 'func-licht', { entfernen: true });
  assert.equal(profil.buttons[3], undefined);
  assert.deepEqual(profil.buttons[5], ['func-hupe'], 'aus einer Liste nur die eine Referenz');
  assert.deepEqual(profil.buttons[6], [{ type: 'keyboard', key: 'A' }], 'Schnellbelegung bleibt');
  assert.deepEqual(profil.craftSlotLayers.craftslot1[2], {});
  assert.equal(profil.axes[2].functionPlus, null);
  assert.equal(profil.axes[2].functionMinus, 'func-x');
  assert.equal(profil.axisTriggers['func-licht'], undefined);
  assert.deepEqual(imProfil(profil, 'func-licht'), []);
});

test('B2: Makros, Kacheln, Tastenleisten, GPS, globale Achsen', () => {
  const makros = {
    m1: { name: 'Vorgewende', steps: [{ functionId: 'func-a' }, { functionId: 'func-b' }] },
    m2: { name: 'Nur A', steps: [{ functionId: 'func-a' }] }
  };
  const r = inMakros(makros, 'func-a', { entfernen: true });
  assert.deepEqual(r.funde, ['Makro „Vorgewende“ · Schritt 1', 'Makro „Nur A“ · Schritt 1']);
  assert.deepEqual(r.leer, ['m2'], 'Makro ohne Schritte meldet der Aufrufer zum Löschen');
  assert.deepEqual(makros.m1.steps, [{ functionId: 'func-b' }]);

  const seiten = { p1: { name: 'Cockpit', buttons: [{ label: 'Licht', functionId: 'macro:m1' }, { functionId: 'func-b' }] } };
  assert.deepEqual(inKacheln(seiten, 'macro:m1', { entfernen: true }), ['Kachel „Cockpit“ · Taste „Licht“']);
  assert.equal(seiten.p1.buttons[0].functionId, null);

  const kacheln = { pages: [{ name: 'Feld', settings: { karte: { keys: [{ label: 'Hupe', functionId: 'func-b' }, { label: 'X', functionId: 'func-c' }] } } }] };
  assert.deepEqual(inKachelseiten(kacheln, 'func-b', { entfernen: true }), ['Startseite „Feld“ · Tastenleiste „Hupe“']);
  assert.deepEqual(kacheln.pages[0].settings.karte.keys.map(k => k.label), ['X']);

  const gps = { devices: { Pflug: { exit: { functionId: 'macro:m1' }, entry: null } }, live: { exit: { functionId: 'macro:m1' }, entry: null } };
  assert.deepEqual(inGps(gps, 'macro:m1', { entfernen: true }), ['GPS-Gerät „Pflug“ · Ausfahrt', 'GPS (aktuelle Einstellungen) · Ausfahrt']);
  assert.equal(gps.devices.Pflug.exit, null);

  assert.deepEqual(inAchsen({ 0: { functionMinus: 'func-b' } }, 'func-b'), ['Achse CraftSlot 1 – Thumbstick links/rechts (−)']);
});

test('B3: Profil gezielt ändern – nur die Stelle, Rest bleibt; Entfernen; unsichere Pfade abgelehnt', () => {
  const profil = { buttons: { 1: 'a' }, autoSwitchTriggers: ['Fendt'], axes: { 2: { type: 'gamepad', axisId: 1 } } };
  wendeProfilAenderungenAn(profil, [{ pfad: ['buttons', '12'], wert: 'func-x' }]);
  assert.deepEqual(profil.buttons, { 1: 'a', 12: 'func-x' });
  assert.deepEqual(profil.autoSwitchTriggers, ['Fendt'], 'Fahrzeug-Zuordnung bleibt (der Fehler aus B3)');
  wendeProfilAenderungenAn(profil, [{ pfad: ['craftSlotLayers', 'craftslot1', '2', '7'], wert: 'func-y' }]);
  assert.equal(profil.craftSlotLayers.craftslot1['2']['7'], 'func-y');
  wendeProfilAenderungenAn(profil, [{ pfad: ['axes', '2'], wert: null }, { pfad: ['gibts', 'nicht'], wert: null }]);
  assert.deepEqual(profil.axes, {});
  assert.equal(profil.gibts, undefined, 'Entfernen legt nichts an');
  assert.throws(() => wendeProfilAenderungenAn(profil, [{ pfad: ['__proto__', 'x'], wert: 1 }]), /Pfad/);
  assert.throws(() => wendeProfilAenderungenAn(profil, [{ pfad: ['name'], wert: 'neu' }]), /Pfad/);
  assert.throws(() => wendeProfilAenderungenAn(profil, []), /Änderungen/);
});

test('B5: Läuft ein Makro, bricht ein anderes es nur ab – es laufen nie zwei', () => {
  const hinweise = [];
  const macros = { getMacro: id => ({ m1: { name: 'Ausfahrt', steps: [{ quickActions: [{ type: 'keyboard', key: 'A' }] }, { quickActions: [{ type: 'keyboard', key: 'B' }], trigger: { type: 'button' } }] },
    m2: { name: 'Einfahrt', steps: [{ quickActions: [{ type: 'keyboard', key: 'C' }] }, { quickActions: [{ type: 'keyboard', key: 'D' }], trigger: { type: 'button' } }] } }[id] || null) };
  const gepulst = [];
  const e = new MacroEngine({ pulseActions: a => gepulst.push(a[0].key) }, macros, null, () => {});
  e.onHinweis = t => hinweise.push(t);
  e.start('m1');
  assert.equal(e.activeMacroId, 'm1');
  e.start('m2');
  assert.equal(e.activeMacroId, null, 'm1 abgebrochen, m2 nicht gestartet');
  assert.deepEqual(gepulst, ['A'], 'm2 hat nichts ausgelöst');
  assert.match(hinweise[0], /„Ausfahrt“ abgebrochen/);
  e.start('m2');
  assert.equal(e.activeMacroId, 'm2', 'beim nächsten Auslösen startet es');
});

test('B2: Makro-Schritt mit gelöschter Funktion meldet sich statt still zu fehlen', () => {
  const hinweise = [];
  const macros = { getMacro: () => ({ name: 'Pflug', steps: [{ functionId: 'func-weg' }, { functionId: 'func-weg', trigger: { type: 'button' } }] }) };
  const e = new MacroEngine({ pulseActions: () => assert.fail('nichts pulsen') }, macros, { getFunction: () => null }, () => {});
  e.onHinweis = t => hinweise.push(t);
  e.start('m1');
  assert.match(hinweise[0], /„Pflug“, Schritt 1: Die Funktion gibt es nicht mehr/);
});

test('B5: Makro-Impuls übersteht einen Profilwechsel und wird nicht von der Achsen-Durchleitung überschrieben', async () => {
  const m = new MappingEngine({ getFunction: () => null });
  m.loadProfile({ buttons: {} });
  m.pulseActions([{ type: 'keyboard', key: 'X' }, { type: 'gamepad', buttonId: 9 }, { type: 'axis', axisId: 3, value: 0 }], 80);
  m.loadProfile({ buttons: {} });   // z. B. automatischer Profilwechsel mitten im Halten
  let out = m.getOutput();
  assert.ok(out.keyboard.includes('X'));
  assert.equal(out.gamepad.buttons[9], 1);
  assert.equal(out.gamepad.axes[3], 0);
  await new Promise(r => setTimeout(r, 120));
  out = m.getOutput();
  assert.ok(!out.keyboard.includes('X'), 'nach der Haltedauer frei');
  assert.equal(out.gamepad.buttons[9], 0);
  assert.equal(out.gamepad.axes[3], 32768);
  m.pulseActions([{ type: 'keyboard', key: 'Y' }], 10000);
  m.releaseAllPulses();
  assert.ok(!m.getOutput().keyboard.includes('Y'), 'Spielwechsel lässt sofort los');
});

test('B6: neue Sitzung der Mod verwirft Karte, Kurs und Planer der alten Sitzung', async () => {
  const { TelemetryReader, parseHudXml } = await import('../server/telemetryReader.js');
  const xml = s => `<hud seq="1" format="3" session="${s}" speed="12"></hud>`;
  assert.equal(parseHudXml(xml('123-4567')).session, '123-4567');
  assert.equal(parseHudXml('<hud seq="1" speed="3"/>').session, null, 'ältere Mod ohne Kennung');
  const r = new TelemetryReader(() => {}, null, '/gibts/nicht.xml', '/gibts/nicht2.xml');
  let neu = 0;
  r.onSession = () => { neu++; };
  assert.equal(r.noteSession('a'), false, 'erste Sitzung seit dem Start: nichts verwerfen');
  r.cachedMap = { fields: [] }; r.cachedPlan = { x: 1 }; r.cachedCourse = { y: 1 }; r.lastCourseVersion = 7;
  assert.equal(r.noteSession('a'), false);
  assert.ok(r.cachedMap, 'gleiche Sitzung: bleibt');
  assert.equal(r.noteSession('b'), true);
  assert.equal(r.cachedMap, null);
  assert.equal(r.cachedPlan, null);
  assert.equal(r.cachedCourse, null);
  assert.equal(r.lastCourseVersion, -1, 'Kurs der neuen Sitzung wird gelesen');
  assert.equal(neu, 1);
  assert.equal(r.noteSession(null), false, 'Datei ohne Kennung ändert nichts');
});

// „Profil … laden“ folgt dem Umbenennen (24.10.2026): ersetzen statt entfernen
test('Verwendung ersetzen: Tasten, Ebenen, Achsen, Makros, Kacheln, Tastenleisten, GPS', async () => {
  const { imProfil, inMakros, inKacheln, inKachelseiten, inGps } = await import('../server/verwendung.js');
  const alt = 'hub:profile:Pflügen', neu = 'hub:profile:Bodenbearbeitung';
  const profil = { buttons: { 3: alt, 4: [alt, 'x'] }, craftSlotLayers: { craftslot1: { 2: { 7: alt } } }, axes: { 0: { functionPlus: alt } } };
  assert.equal(imProfil(profil, alt, { ersetzen: neu }).length, 4);
  assert.deepEqual([profil.buttons[3], profil.buttons[4], profil.craftSlotLayers.craftslot1[2][7], profil.axes[0].functionPlus], [neu, [neu, 'x'], neu, neu]);
  const makros = { m: { name: 'M', steps: [{ functionId: alt }, { functionId: 'y' }] } };
  inMakros(makros, alt, { ersetzen: neu });
  assert.deepEqual(makros.m.steps.map(s => s.functionId), [neu, 'y']);
  const seiten = { s: { name: 'S', buttons: [{ functionId: alt }] } };
  inKacheln(seiten, alt, { ersetzen: neu });
  assert.equal(seiten.s.buttons[0].functionId, neu);
  const cfg = { pages: [{ name: 'Feld', settings: { karte: { keys: [{ functionId: alt }] } } }] };
  inKachelseiten(cfg, alt, { ersetzen: neu });
  assert.equal(cfg.pages[0].settings.karte.keys[0].functionId, neu);
  const gps = { devices: { G: { exit: { functionId: alt } } }, live: { entry: { functionId: alt } } };
  inGps(gps, alt, { ersetzen: neu });
  assert.deepEqual([gps.devices.G.exit.functionId, gps.live.entry.functionId], [neu, neu]);
});
