// Gruppen beim Import der inputBinding.xml (24.10.2026): Mods als eigene Gruppe (aus dem Mods-Ordner), sonst die
// Abschnitte wie im Steuerungsmenü des Spiels (craftConsoleInputActions.xml der Mod), sonst die eigene Zuordnung.
// Alle Mods und Spieldaten hier sind ausgedacht.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { leseMod, leseModAktionen, modsOrdner, leseSpielAktionen } from '../server/modAktionen.js';
import { parseInputBindingXml, parseSpielAktionen } from '../server/inputBindingImporter.js';

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'cc-mods-'));

// Kleine ZIP-Datei bauen (deflate, wie die Mods) -- Prüfsumme lässt der Leser aus, deshalb 0
function zip(dateien) {
  const lokal = [], zentral = [];
  let pos = 0;
  for (const [name, text] of Object.entries(dateien)) {
    const roh = Buffer.from(text, 'utf8'), gepackt = zlib.deflateRawSync(roh), n = Buffer.from(name, 'utf8');
    const kopf = Buffer.alloc(30);
    kopf.writeUInt32LE(0x04034b50, 0); kopf.writeUInt16LE(20, 4); kopf.writeUInt16LE(0x800, 6); kopf.writeUInt16LE(8, 8);
    kopf.writeUInt32LE(gepackt.length, 18); kopf.writeUInt32LE(roh.length, 22); kopf.writeUInt16LE(n.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0x800, 8); cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(gepackt.length, 20); cd.writeUInt32LE(roh.length, 24); cd.writeUInt16LE(n.length, 28); cd.writeUInt32LE(pos, 42);
    lokal.push(kopf, n, gepackt);
    zentral.push(cd, n);
    pos += 30 + n.length + gepackt.length;
  }
  const cdBuf = Buffer.concat(zentral), ende = Buffer.alloc(22);
  ende.writeUInt32LE(0x06054b50, 0); ende.writeUInt16LE(zentral.length / 2, 8); ende.writeUInt16LE(zentral.length / 2, 10);
  ende.writeUInt32LE(cdBuf.length, 12); ende.writeUInt32LE(pos, 16);
  return Buffer.concat([...lokal, cdBuf, ende]);
}

// Mod 1 (ZIP): Texte in eigenen Sprachdateien, eine Achse mit zwei Richtungen
const MOD_ZIP = {
  'modDesc.xml': `<?xml version="1.0" encoding="utf-8"?>
<modDesc descVersion="92">
  <title><en>Field Helper</en><de>Feldhelfer</de></title>
  <!-- <actions><action name="AUSKOMMENTIERT"/></actions> -->
  <actions>
    <action name="FH_START" category="VEHICLE"/>
    <action name="FH_SPEED" axisType="FULL"/>
  </actions>
  <l10n filenamePrefix="translations/translation"/>
</modDesc>`,
  'Translations/translation_de.xml': `<l10n><texts><text name="input_FH_START" text="Helfer starten"/>
    <text name="input_FH_SPEED_1" text="Tempo hoch"/><text name="input_FH_SPEED_2" text="Tempo runter"/></texts></l10n>`,
  'translations/translation_en.xml': `<l10n><texts><text name="input_FH_START" text="Start helper"/></texts></l10n>`
};

// Mod 2 (Ordner): Texte direkt in der modDesc, Titel nur englisch
const MOD_ORDNER = `<?xml version="1.0" encoding="utf-8"?>
<modDesc descVersion="92">
  <title><en>Mirror &amp; Camera</en></title>
  <actions><action name="MC_MIRROR"/><action name="FH_START"/></actions>
  <l10n><text name="input_MC_MIRROR"><en>Adjust mirror</en><de>Spiegel einstellen</de></text></l10n>
</modDesc>`;

async function modsAnlegen() {
  const dir = await tmp();
  await fs.writeFile(path.join(dir, 'FS25_FieldHelper.zip'), zip(MOD_ZIP));
  await fs.mkdir(path.join(dir, 'FS25_MirrorCam'));
  await fs.writeFile(path.join(dir, 'FS25_MirrorCam', 'modDesc.xml'), MOD_ORDNER);
  await fs.writeFile(path.join(dir, 'FS25_Kaputt.zip'), 'keine zip');
  await fs.writeFile(path.join(dir, 'liesmich.txt'), 'kein mod');
  return dir;
}

const SPIEL = `<?xml version="1.0" encoding="utf-8"?>
<inputActions session="1-1">
  <categoryText key="inputCategory_VEHICLE_WORK" text="Fahrzeug – Arbeit"/>
  <categoryText key="inputCategory_NEU" text="Neuer Bereich"/>
  <a><f k="name" v="VARIABLE_WORK_WIDTH_LEFT"/><f k="displayCategory" v="$l10n_inputCategory_VEHICLE_WORK"/><f k="displayNamePositive" v="Teilbreiten links abschalten"/><f k="displayNameNegative" v="Teilbreiten links zuschalten"/></a>
  <a><f k="name" v="JUMP"/><f k="displayCategory" v="$l10n_inputCategory_PLAYER_MOVEMENT"/><f k="displayNamePositive" v="Springen"/><f k="displayNameNegative" v="JUMP"/></a>
  <a><f k="name" v="CHEAT_MONEY"/><f k="displayCategory" v="$l10n_inputCategory_DEBUG_GENERAL"/><f k="displayNamePositive" v="Geld"/></a>
  <a><f k="name" v="PACK_GRAB"/><f k="displayCategory" v="Beispiel Pack"/><f k="displayNamePositive" v="Ballen greifen"/></a>
  <a><f k="name" v="NEU_X"/><f k="displayCategory" v="$l10n_inputCategory_NEU"/><f k="displayNamePositive" v="Neu"/></a>
  <a><f k="name" v="FH_START"/><f k="displayNamePositive" v="Helfer starten (Spiel)"/><f k="displayNameNegative" v="FH_START"/></a>
</inputActions>`;

const BINDING = `<?xml version="1.0"?><inputBinding>
  <actionBinding action="VARIABLE_WORK_WIDTH_LEFT">
    <binding device="KB_MOUSE_DEFAULT" input="KEY_i" axisComponent="+" neutralInput="0" index="1"/>
    <binding device="KB_MOUSE_DEFAULT" input="KEY_u" axisComponent="-" neutralInput="0" index="1"/>
  </actionBinding>
  <actionBinding action="JUMP"><binding device="KB_MOUSE_DEFAULT" input="KEY_space" axisComponent="+" neutralInput="0" index="1"/></actionBinding>
  <actionBinding action="CHEAT_MONEY"><binding device="KB_MOUSE_DEFAULT" input="KEY_m" axisComponent="+" neutralInput="0" index="1"/></actionBinding>
  <actionBinding action="PACK_GRAB"/>
  <actionBinding action="FH_START"><binding device="KB_MOUSE_DEFAULT" input="KEY_h" axisComponent="+" neutralInput="0" index="1"/></actionBinding>
  <actionBinding action="FH_SPEED">
    <binding device="KB_MOUSE_DEFAULT" input="KEY_KP_plus" axisComponent="+" neutralInput="0" index="1"/>
    <binding device="KB_MOUSE_DEFAULT" input="KEY_KP_minus" axisComponent="-" neutralInput="0" index="1"/>
  </actionBinding>
  <actionBinding action="MC_MIRROR"/>
  <actionBinding action="NEU_X"/>
  <actionBinding action="XY_GANZ_UNBEKANNT"/>
</inputBinding>`;

test('Mods: ZIP und Ordner gelesen, Titel deutsch, Texte aus Sprachdatei bzw. modDesc, kaputte Dateien übersprungen', async () => {
  const dir = await modsAnlegen();
  const zipMod = await leseMod(path.join(dir, 'FS25_FieldHelper.zip'));
  assert.equal(zipMod.titel, 'Feldhelfer');
  assert.deepEqual([...zipMod.aktionen.keys()], ['FH_START', 'FH_SPEED'], 'auskommentierte Aktion zählt nicht');
  assert.deepEqual(zipMod.aktionen.get('FH_START'), { plus: 'Helfer starten', minus: null }, 'deutsch vor englisch');
  assert.deepEqual(zipMod.aktionen.get('FH_SPEED'), { plus: 'Tempo hoch', minus: 'Tempo runter' }, 'Achse: _1 und _2');

  const { aktionen, mods } = await leseModAktionen([dir, path.join(dir, 'gibt-es-nicht')]);
  assert.equal(mods, 2);
  assert.deepEqual(aktionen.get('MC_MIRROR'), { mod: 'Mirror & Camera', plus: 'Spiegel einstellen', minus: null });
  assert.equal(aktionen.get('FH_START').mod, 'Feldhelfer', 'dieselbe Aktion in zwei Mods: die erste (alphabetisch) gilt');
});

test('Mods-Ordner: Standard mods/, eigener Ordner aus gameSettings.xml, fehlender Profilordner ausgelassen', async () => {
  const a = await tmp(), b = await tmp();
  await fs.writeFile(path.join(b, 'gameSettings.xml'), '<gameSettings><modsDirectoryOverride active="true" directory="D:/LS-Mods"/></gameSettings>');
  assert.deepEqual(await modsOrdner([a, b, path.join(a, 'fehlt')]), [path.join(a, 'mods'), 'D:/LS-Mods']);
  await fs.writeFile(path.join(b, 'gameSettings.xml'), '<gameSettings><modsDirectoryOverride active="false" directory="D:/LS-Mods"/></gameSettings>');
  assert.deepEqual(await modsOrdner([b]), [path.join(b, 'mods')]);
});

test('Import: Mod-Aktion -> Gruppe = Mod-Name, Spiel-Aktion -> Abschnitt wie im Spiel, Rest eigene Zuordnung', async () => {
  const dir = await modsAnlegen();
  const mods = await leseModAktionen([dir]);
  const spiel = parseSpielAktionen(SPIEL);
  const { functions: f, ausSpiel, ausMods } = parseInputBindingXml(BINDING, { spiel, mods });

  assert.deepEqual(f['func-fs-variable-work-width-left'].categories, ['Fahrzeug › Arbeit'], 'bekannter Abschnitt: eigener Baum statt Text des Spiels');
  assert.equal(f['func-fs-variable-work-width-left'].name, 'Teilbreiten links abschalten');
  assert.equal(f['func-fs-variable-work-width-left-minus'].name, 'Teilbreiten links zuschalten');
  assert.deepEqual(f['func-fs-jump'].categories, ['Zu Fuß › Bewegung']);
  assert.equal(f['func-fs-cheat-money'], undefined, 'Entwickler-Aktionen nicht übernehmen');
  assert.deepEqual(f['func-fs-pack-grab'].categories, ['DLC › Beispiel Pack'], 'DLC: Klartext unter „DLC“');

  assert.deepEqual(f['func-fs-fh-start'].categories, ['Mods › Feldhelfer'], 'Mod geht vor (das Spiel nennt für Mods keine Gruppe)');
  assert.equal(f['func-fs-fh-start'].name, 'Helfer starten (Spiel)', 'Name: Spiel zuerst');
  assert.deepEqual(f['func-fs-fh-speed'].categories, ['Mods › Feldhelfer'], 'Mod im Ordner, im Spielstand nicht aktiv');
  assert.equal(f['func-fs-fh-speed'].name, 'Tempo hoch');
  assert.equal(f['func-fs-fh-speed-minus'].name, 'Tempo runter');
  assert.deepEqual(f['func-fs-mc-mirror'].categories, ['Mods › Mirror & Camera']);
  assert.deepEqual(f['func-fs-neu-x'].categories, ['Neuer Bereich'], 'unbekannter Abschnitt: Text des Spiels (Mod 0.7.7)');
  assert.deepEqual(f['func-fs-xy-ganz-unbekannt'].categories, ['Sonstige/unbekannt']);
  assert.equal(ausMods, 3, "je Aktion gezählt, die Minus-Richtung nicht extra");
  assert.equal(ausSpiel, 4);
});

test('Import ohne Spiel- und Mod-Daten: wie bisher', () => {
  const { functions: f, ausSpiel, ausMods } = parseInputBindingXml(BINDING);
  assert.equal(f['func-fs-variable-work-width-left'].name, 'Teilbreite links aus');
  assert.equal(ausSpiel, 0);
  assert.equal(ausMods, 0);
});

test('Aktionsliste der Mod: neueste Datei gilt, keine Datei -> null', async () => {
  const alt = await tmp(), neu = await tmp(), leer = await tmp();
  await fs.writeFile(path.join(alt, 'craftConsoleInputActions.xml'), SPIEL.replace('Springen', 'Alt'));
  await fs.writeFile(path.join(neu, 'craftConsoleInputActions.xml'), SPIEL);
  const spaeter = new Date(Date.now() + 5000);
  await fs.utimes(path.join(neu, 'craftConsoleInputActions.xml'), spaeter, spaeter);
  const sp = await leseSpielAktionen([alt, neu, leer]);
  assert.equal(sp.aktionen.get('JUMP').plus, 'Springen');
  assert.equal(await leseSpielAktionen([leer]), null);
});
