// Diagnose (25.10.2026): STAT der Armlehne lesen, Neustarts erkennen, Ereignis-Log und Diagnosedatei ohne Pfade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { Diagnose, leseStat, neustartText, auffaellig } from '../server/diagnose.js';

const ZEILE = 'STAT fw=2.15 up=42 grund=watchdog vorphase=6 vorlief=3600 vorrunde=4100000 cfgfix=8 loop=1200 ser=40 ctrl=900 i2c=0 out=2100 outfehl=0 zulang=0 srv=1 module=0x1FF';

test('STAT lesen und Neustart in Klartext', () => {
  const s = leseStat(ZEILE);
  assert.equal(s.fw, '2.15');
  assert.equal(s.up, 42);
  assert.equal(s.grund, 'watchdog');
  assert.equal(s.module, '0x1FF');
  assert.match(neustartText(s), /Watchdog.*lief davor 3600 s, zuletzt vor dem Senden an ControlHub, letzte Runde 4100 ms/);
  assert.equal(leseStat('DIAG [0s] Boot'), null);
  assert.equal(neustartText(leseStat('STAT grund=strom up=5')), 'Einschalten bzw. Strom weg');
});

test('Auffälliges: Watchdog, reparierte Einstellungen, neue I²C-Fehler', () => {
  const s = leseStat(ZEILE);
  const a = auffaellig(s);
  assert.ok(a.some(x => x.startsWith('Letzter Neustart: Watchdog')));
  assert.ok(a.some(x => x.includes('8 ungültige Einstellungen')));
  assert.deepEqual(auffaellig({ ...s, grund: 'strom', cfgfix: 0, i2c: 3 }, { i2c: 3 }), [], 'gleich viele I²C-Fehler wie vorher: nichts Neues');
  assert.ok(auffaellig({ grund: 'strom', i2c: 5 }, { i2c: 3 })[0].includes('+2'));
});

test('Ereignis-Log: Datei je Tag, Neustart der Armlehne an zurückspringender Laufzeit erkannt', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-diag-'));
  const d = new Diagnose(dir);
  d.stat(leseStat('STAT fw=2.15 up=500 grund=strom'), { beimVerbinden: true });
  d.stat(leseStat('STAT fw=2.15 up=560 grund=strom'));
  d.stat(leseStat('STAT fw=2.15 up=3 grund=absturz vorphase=8 vorlief=561'));
  assert.ok(d.letzte.some(e => e.art === 'WARNUNG' && /neu gestartet: Absturz der Firmware/.test(e.text)));
  d.diagZeilen(['[0s] Boot FW 2.15 wdt=0 wdtTimeout=0 module=0x1FF']);
  await new Promise(r => setTimeout(r, 50));
  const t = new Date(), datei = path.join(dir, `diagnose-${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}.log`);
  const text = await fs.readFile(datei, 'utf8');
  assert.match(text, /ARMLEHNE Firmware 2\.15, läuft seit 500 s/);
  assert.match(text, /ARMLEHNE Log: \[0s\] Boot FW 2\.15/);
  const p = d.paket({ version: '1.0.0', verbunden: true, gedrueckt: [69], spieldaten: { stand: 'ok', modOrdner: 'FS25_CraftConsoleHUD', mehrspieler: true } });
  assert.deepEqual(p.spieldaten, { stand: 'ok', modOrdner: 'FS25_CraftConsoleHUD', mehrspieler: true });
  assert.equal(p.controlhubDiagnose, 1);
  assert.equal(p.armlehne.stat.grund, 'absturz');
  assert.deepEqual(p.armlehne.gedrueckt, [69]);
  assert.equal(p.ereignisse.length, 3, "Verbinden, Neustart, Log-Zeile");
  assert.ok(!JSON.stringify(p).includes(dir), 'keine Pfade in der Diagnosedatei');
});
