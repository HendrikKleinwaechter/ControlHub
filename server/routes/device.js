/**
 * Routen: Gerät: USB-Ports, Geräte-Kalibrierung/-Einstellungen, Achsen, Diagnose
 * Ausgelagert aus server/index.js (setupExpress) am 21.10.2026 -- Inhalt unverändert, nur `this` -> `server`.
 * @param {import('express').Express} app
 * @param {object} server  ControllerServer-Instanz (Manager, io, Hilfsmethoden)
 */
import path from 'path';
import { promises as fs } from 'fs';
import { leseStat, neustartText } from '../diagnose.js';
import { VERSION } from '../paths.js';

export function registerDeviceRoutes(app, server) {
  // Diagnose (25.10.2026, server/diagnose.js): letzte Ereignisse, Armlehne frisch abfragen, Diagnosedatei
  const frisch = async () => {
    if (!server.serial.getStatus().connected) return;
    const stat = leseStat(await server.deviceConfigClient.getStat().catch(() => null));
    if (stat) server.diagnose.armlehne = stat;
    const diag = await server.deviceConfigClient.getDiag().catch(() => null);
    if (diag) server.diagnose.diag = diag;
  };
  // Spieldaten (25.10.2026, für den Mehrspieler-Test): nur der Name des Mod-Ordners, kein Pfad; ohne Spielstandnamen
  const spieldatenStand = () => {
    const tr = server.telemetryReader, map = tr?.cachedMap;
    return tr ? {
      stand: tr.availability || null, modOrdner: String(tr.dataDir || '').split(/[\\/]/).pop() || null, rate: tr.rate,
      modVersion: tr.modVersion || null,
      mehrspieler: map?.savegame ? map.savegame.multiplayer : null, server: map?.savegame ? map.savegame.server : null,
      karte: map?.savegame?.mapId || null,
      spielstandNr: Number.isInteger(map?.savegame?.index) ? map.savegame.index : null, eigenerHof: map?.myFarm ?? null
    } : null;
  };
  const uebersicht = () => ({
    success: true, verbunden: server.serial.getStatus().connected, version: VERSION,
    armlehne: server.diagnose.armlehne, neustart: neustartText(server.diagnose.armlehne), log: server.diagnose.diag,
    spieldaten: spieldatenStand(),
    ereignisse: server.diagnose.letzte.slice(-100)
  });
  app.get('/api/diagnose', (req, res) => res.json(uebersicht()));
  app.post('/api/diagnose/abfragen', async (req, res) => { await frisch(); res.json(uebersicht()); });
  app.get('/api/diagnose/datei', async (req, res) => {
    try {
      await frisch();
      const verbunden = server.serial.getStatus().connected;
      const einstellungen = verbunden ? await server.deviceConfigClient.getAll().catch(() => null) : null;
      const spiel = server.gameManager.get(server.gameManager.activeId);
      const cm = server.controllerManager;
      const knoepfe = server.lastFrameDebug?.buttons || [];
      const paket = server.diagnose.paket({
        spieldaten: spieldatenStand(),
        version: VERSION, verbunden, einstellungen,
        spiel: spiel ? { id: spiel.id, name: spiel.name } : null,
        controller: { id: cm.activeId, name: cm.payload()?.profile?.name || cm.activeId, firmware: cm.payload()?.info?.firmware || null },
        gedrueckt: knoepfe.map((v, i) => (v ? i + 1 : null)).filter(Boolean)
      });
      server.diagnose.ereignis('INFO', 'Diagnosedatei gespeichert');
      const t = new Date(), z = n => String(n).padStart(2, '0');
      res.setHeader('Content-Disposition', `attachment; filename="ControlHub-Diagnose_${t.getFullYear()}-${z(t.getMonth() + 1)}-${z(t.getDate())}_${z(t.getHours())}-${z(t.getMinutes())}.json"`);
      res.json(paket);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // API-Endpunkte
  app.get('/api/ports', async (req, res) => {
    try {
      const ports = await server.serial.listPorts();
      res.json({ success: true, ports });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Calibration API
  app.get('/api/calibration', (req, res) => {
    const calibrations = server.calibrationManager.getAllCalibrations();
    res.json({ success: true, calibrations });
  });

  app.post('/api/calibration/:axisId', async (req, res) => {
    try {
      const { axisId } = req.params;
      const { calibration } = req.body;
      await server.calibrationManager.setCalibration(axisId, calibration);

      // CalibrationManager an MappingEngine übergeben
      server.mappingEngine.setCalibrationManager(server.calibrationManager);

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Achsen-Zuordnung: pro Profil (Standard) oder global -- s. Plan "Achsen-Zuordnung eigene Seite"
  app.get('/api/axis-assignment-mode', (req, res) => {
    res.json({
      success: true,
      mode: server.calibrationManager.getAssignmentMode(),
      globalAxes: server.calibrationManager.getGlobalAxes()
    });
  });

  app.post('/api/axis-assignment-mode', async (req, res) => {
    try {
      await server.calibrationManager.setAssignmentMode(req.body.mode);
      server.mappingEngine.setAxisAssignmentConfig({
        mode: server.calibrationManager.getAssignmentMode(),
        globalAxes: server.calibrationManager.getGlobalAxes()
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/axis-assignment/global/:physicalIndex', async (req, res) => {
    try {
      await server.calibrationManager.setGlobalAxis(req.params.physicalIndex, req.body.mapping ?? null);
      server.mappingEngine.setAxisAssignmentConfig({
        mode: server.calibrationManager.getAssignmentMode(),
        globalAxes: server.calibrationManager.getGlobalAxes()
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Geräte-Einstellungen (WebSerial-Konfig-Protokoll GETALL/SET, s. deviceConfigClient.js)
  app.get('/api/device-config', async (req, res) => {
    try {
      const settings = await server.deviceConfigClient.getAll();
      res.json({ success: true, settings });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/device-config', async (req, res) => {
    try {
      const { key, value } = req.body || {};
      // nur ein Schlüssel und ein Wert ohne Leerzeichen/Zeilenumbruch -- sonst ließen sich weitere Firmware-Befehle
      // anhängen (z. B. "1\nCAL RESET", 23.10.2026)
      if (!/^[A-Za-z0-9_]{1,32}$/.test(String(key ?? '')) || !/^[A-Za-z0-9_.+-]{0,32}$/.test(String(value ?? ''))) {
        return res.status(400).json({ success: false, error: 'Ungültige Einstellung' });
      }
      const result = await server.deviceConfigClient.set(key, value);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Piezo-Buzzer (BEEP-Befehl, s. deviceConfigClient.js) -- GPS-Signalton und Test aus der Oberfläche.
  app.post('/api/device-beep', async (req, res) => {
    try {
      const { ms } = req.body || {};
      const result = await server.deviceConfigClient.beep(ms);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Modul-/Bauteil-Erkennung (WebSerial-Konfig-Protokoll STATUS, s. deviceConfigClient.js) --
  // liest die von der Firmware bereits vorhandenen "DET <key> <0/1|hex>"-Zeilen aus, keine neue
  // Firmware nötig.
  app.get('/api/device-status', async (req, res) => {
    try {
      const status = await server.deviceConfigClient.getStatus();
      res.json({ success: true, status });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Reine Fehlersuche: letzter verarbeiteter FRAME + daraus resolvtes HID-Ergebnis, ohne Browser --
  // zeigt z.B. ob ein Tastendruck ueberhaupt als rohes Button-Bit ankommt und ob mappingEngine
  // daraus die erwartete Tastatur-Aktion macht.
  app.get('/api/debug/last-state', (req, res) => {
    res.json({ success: true, state: server.lastFrameDebug || null });
  });

  // Boot-/Ereignis-Log der Firmware (WebSerial-Konfig-Protokoll DIAG, s. deviceConfigClient.js) --
  // u.a. die "Boot FW ... module=0x..."-Zeile, zeigt den Modul-Erkennungsstand direkt beim Booten.
  app.get('/api/device-diag', async (req, res) => {
    try {
      const lines = await server.deviceConfigClient.getDiag();
      res.json({ success: true, lines });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Achsen-Kalibrierung (WebSerial-Konfig-Protokoll CAL, s. deviceConfigClient.js)
  const CALIBRATION_GROUPS = ['thumb', 'leverA', 'leverB', 'thumb2', 'leverA2', 'leverB2', 'finger1', 'finger2', 'finger3', 'finger4', 'poti'];
  app.post('/api/device-calibration/:group/start', async (req, res) => {
    try {
      const { group } = req.params;
      if (!CALIBRATION_GROUPS.includes(group)) {
        return res.status(400).json({ success: false, error: `Unbekannte Kalibrierungsgruppe: ${group}` });
      }
      const ok = await server.deviceConfigClient.startLiveCalibration(group, (data) => {
        server.io.emit('calibration-live', data);
      });
      if (!ok) return res.status(500).json({ success: false, error: 'Senden fehlgeschlagen (nicht verbunden)' });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/device-calibration/stop', async (req, res) => {
    try {
      const result = await server.deviceConfigClient.sendCommand('CAL STOP');
      server.deviceConfigClient.stopLiveCalibration();
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/device-calibration/abort', async (req, res) => {
    try {
      const result = await server.deviceConfigClient.sendCommand('CAL ABORT');
      server.deviceConfigClient.stopLiveCalibration();
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Schubhebel: Mitte eines einzelnen Hebels während seiner Kalibrierung festlegen (FW 2.14, CAL CENTER <hebel>)
  app.post('/api/device-calibration/mitte/:group', async (req, res) => {
    try {
      if (!['leverA', 'leverB', 'leverA2', 'leverB2'].includes(req.params.group)) {
        return res.status(400).json({ success: false, error: `Kein Hebel: ${req.params.group}` });
      }
      res.json(await server.deviceConfigClient.sendCommand(`CAL CENTER ${req.params.group}`));
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/device-calibration/center', async (req, res) => {
    try {
      const result = await server.deviceConfigClient.sendCommand('CAL CENTER');
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/device-calibration/reset', async (req, res) => {
    try {
      const result = await server.deviceConfigClient.sendCommand('CAL RESET');
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
}
