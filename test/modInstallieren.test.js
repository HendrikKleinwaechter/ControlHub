// „Mod installieren“ (25.10.2026): Zustand, Kopieren in den Mod-Ordner, Doppel nur melden, eigener Mod-Ordner, Fehlerfälle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { modStatus, installiereMod, spielProfil, MOD_DATEI } from '../server/modInstallieren.js';
import { modVersion } from '../server/modAktionen.js';

/** Kleine ZIP-Datei (ungepackt) mit einer modDesc.xml der Version v */
function modZip(v) {
  const name = Buffer.from('modDesc.xml'), daten = Buffer.from(`<?xml version="1.0"?><modDesc><version>${v}</version></modDesc>`);
  const lokal = Buffer.alloc(30); lokal.writeUInt32LE(0x04034b50, 0); lokal.writeUInt16LE(20, 4);
  lokal.writeUInt32LE(daten.length, 18); lokal.writeUInt32LE(daten.length, 22); lokal.writeUInt16LE(name.length, 26);
  const zentral = Buffer.alloc(46); zentral.writeUInt32LE(0x02014b50, 0); zentral.writeUInt16LE(20, 4); zentral.writeUInt16LE(20, 6);
  zentral.writeUInt32LE(daten.length, 20); zentral.writeUInt32LE(daten.length, 24); zentral.writeUInt16LE(name.length, 28);
  const cdStart = 30 + name.length + daten.length, cdGroesse = 46 + name.length;
  const ende = Buffer.alloc(22); ende.writeUInt32LE(0x06054b50, 0); ende.writeUInt16LE(1, 8); ende.writeUInt16LE(1, 10);
  ende.writeUInt32LE(cdGroesse, 12); ende.writeUInt32LE(cdStart, 16);
  return Buffer.concat([lokal, name, daten, zentral, name, ende]);
}

async function umgebung() {
  const t = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-mod-'));
  const profil = path.join(t, 'Documents', 'My Games', 'FarmingSimulator2025');
  await fs.mkdir(profil, { recursive: true });
  await fs.writeFile(path.join(profil, 'gameSettings.xml'), '<gameSettings/>');
  const mitgeliefert = path.join(t, 'ControlHub', 'Mod', MOD_DATEI);
  await fs.mkdir(path.dirname(mitgeliefert), { recursive: true });
  await fs.writeFile(mitgeliefert, modZip('0.7.9.0'));
  return { t, profil, mitgeliefert, opts: { mitgeliefert, profile: [path.join(t, 'OneDrive', 'Dokumente', 'My Games', 'FarmingSimulator2025'), profil] } };
}

test('Mod-Version aus der modDesc.xml einer ZIP', async () => {
  const { mitgeliefert } = await umgebung();
  assert.equal(await modVersion(mitgeliefert), '0.7.9.0');
  assert.equal(await modVersion(mitgeliefert + '.gibtesnicht'), null);
});

test('Noch nicht installiert → installieren kopiert in mods/, danach aktuell, keine Zwischendatei übrig', async () => {
  const { profil, opts } = await umgebung();
  const vorher = await modStatus(opts);
  assert.deepEqual({ ...vorher, ordner: path.relative(profil, vorher.ordner) },
    { mitgeliefert: '0.7.9.0', spiel: true, ordner: 'mods', installiert: null, doppelt: [], aktuell: false });
  const nachher = await installiereMod(opts);
  assert.equal(nachher.installiert, '0.7.9.0');
  assert.equal(nachher.aktuell, true);
  assert.deepEqual(await fs.readdir(path.join(profil, 'mods')), [MOD_DATEI]);
});

test('Ältere Mod wird ersetzt; Doppel und entpackter Ordner werden nur gemeldet, nicht gelöscht', async () => {
  const { profil, opts } = await umgebung();
  const mods = path.join(profil, 'mods');
  await fs.mkdir(path.join(mods, 'FS25_CraftConsoleHUD'), { recursive: true });
  await fs.writeFile(path.join(mods, MOD_DATEI), modZip('0.7.8.0'));
  await fs.writeFile(path.join(mods, 'FS25_CraftConsoleHUD (1).zip'), modZip('0.7.6.0'));
  await fs.writeFile(path.join(mods, 'FS25_AutoDrive.zip'), modZip('7.0.0.0'));
  const vorher = await modStatus(opts);
  assert.equal(vorher.installiert, '0.7.8.0');
  assert.equal(vorher.aktuell, false);
  assert.deepEqual(vorher.doppelt, ['FS25_CraftConsoleHUD', 'FS25_CraftConsoleHUD (1).zip']);
  const nachher = await installiereMod(opts);
  assert.equal(nachher.installiert, '0.7.9.0');
  assert.deepEqual((await fs.readdir(mods)).sort(), ['FS25_AutoDrive.zip', 'FS25_CraftConsoleHUD', 'FS25_CraftConsoleHUD (1).zip', MOD_DATEI].sort());
});

test('Neuere installierte Mod gilt als aktuell; unlesbare Datei als „?“', async () => {
  const { profil, opts } = await umgebung();
  await fs.mkdir(path.join(profil, 'mods'));
  await fs.writeFile(path.join(profil, 'mods', MOD_DATEI), modZip('0.8.0.0'));
  assert.equal((await modStatus(opts)).aktuell, true);
  await fs.writeFile(path.join(profil, 'mods', MOD_DATEI), 'kaputt');
  const st = await modStatus(opts);
  assert.equal(st.installiert, '?');
  assert.equal(st.aktuell, false);
});

test('Eigener Mod-Ordner aus gameSettings.xml; Profil mit der neuesten gameSettings.xml gilt', async () => {
  const { t, profil, opts } = await umgebung();
  const eigen = path.join(t, 'Spiele', 'LS25-Mods');
  await fs.writeFile(path.join(profil, 'gameSettings.xml'), `<gameSettings><modsDirectoryOverride active="true" directory="${eigen}"/></gameSettings>`);
  const st = await installiereMod(opts);
  assert.equal(st.ordner, eigen);
  assert.equal(await modVersion(path.join(eigen, MOD_DATEI)), '0.7.9.0');
  // Zweites Profil (OneDrive) mit neuerer gameSettings.xml wird bevorzugt
  const od = opts.profile[0];
  await fs.mkdir(od, { recursive: true });
  await new Promise(r => setTimeout(r, 20));
  await fs.writeFile(path.join(od, 'gameSettings.xml'), '<gameSettings/>');
  assert.equal(await spielProfil(opts.profile), od);
});

test('Ohne Spielordner bzw. ohne mitgelieferte Mod: verständlicher Fehler', async () => {
  const { t, opts } = await umgebung();
  const ohneSpiel = { ...opts, profile: [path.join(t, 'gibtesnicht')] };
  assert.deepEqual(await modStatus(ohneSpiel), { mitgeliefert: '0.7.9.0', spiel: false });
  await assert.rejects(installiereMod(ohneSpiel), /Ordner des LS25/);
  await assert.rejects(installiereMod({ ...opts, mitgeliefert: path.join(t, 'fehlt.zip') }), /fehlt die Mod/);
});
