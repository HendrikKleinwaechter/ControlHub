/**
 * Haupt-Server für Arduino Controller System
 * Verbindet alle Komponenten und stellt Web-Interface bereit
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { networkInterfaces } from 'os';
import { promises as fs } from 'fs';
import { readJsonFile, writeJsonAtomic, problems as dataProblems } from './jsonStore.js';
import crypto from 'crypto';

import { SerialCommunication } from './serialCommunication.js';
import { FrameParser } from './frameParser.js';
import { StateManager } from './stateManager.js';
import { MappingEngine } from './mappingEngine.js';
import { OutputGenerator } from './outputGenerator.js';
import { ProfileManager } from './profileManager.js';
import { FunctionsManager } from './functionsManager.js';
import { CalibrationManager } from './calibrationManager.js';
import { ModuleLayoutManager } from './moduleLayoutManager.js';
import { DeviceConfigClient } from './deviceConfigClient.js';
import { MODULES, MAIN_BUTTON_COUNT } from './config/modules.js';
import { TelemetryReader, TELEMETRY_RATES } from './telemetryReader.js';
import { GameManager } from './gameManager.js';
import { toBase } from './telemetryBase.js';
import { MacrosManager } from './macrosManager.js';
import { MacroEngine } from './macroEngine.js';
import { ConditionChecker } from './conditions.js';
import { SerialLogger } from './serialLogger.js';
import { Diagnose, leseStat } from './diagnose.js';
import { CraftSlotLayerManager, ALL_RESERVED_GAMEPAD_BUTTONS } from './craftSlotLayerManager.js';
import { SteuerungsmenuesManager } from './steuerungsmenuesManager.js';
import { AutoSwitchManager } from './autoSwitchManager.js';
import { BackupManager } from './backupManager.js';
import { CONFIG_DIR, ASSETS_DIR, LOGS_DIR, DATA_DIR, ALT_CONFIG_DIR, ALT_ASSETS_DIR, VORGABEN_DIR, VERSION } from './paths.js';
import { datenOrdnerVorbereiten, sichereDaten } from './datenOrdner.js';
import { registerUpdateRoutes } from './routes/update.js';
import { registerModRoutes } from './routes/mod.js';
import { registerDeviceRoutes } from './routes/device.js';
import { registerProfilesRoutes } from './routes/profiles.js';
import { registerFunctionsRoutes } from './routes/functions.js';
import { registerMacrosRoutes } from './routes/macros.js';
import { registerModulesRoutes } from './routes/modules.js';
import { registerSteuerungsmenuesRoutes } from './routes/steuerungsmenues.js';
import { registerGamesRoutes } from './routes/games.js';
import { registerKachelnRoutes } from './routes/kacheln.js';
import { KachelnManager } from './kachelnManager.js';
import { richteGrundausstattungEin } from './grundausstattung.js';
import { UNTERBAUTEN } from './deviceProfiles.js';
import { ladeBeispielprofile, fuegeBeispielprofileHinzu, beispielStand, wendeNachtraegeAn } from './beispielprofile.js';
import { migrateKachelnToBausteine } from './bausteinMigration.js';
import '../public/js/plannerLogic.js';
import { registerGpsRoutes } from './routes/gps.js';
import { registerKarteRoutes } from './routes/karte.js';
import { Flaeche } from './flaeche.js';
import { TeilbreitenAutomatik } from './teilbreitenAutomatik.js';
import { savegameKey } from './plannerStore.js';
import { GpsManager } from './gpsManager.js';
import { GpsEngine } from './gpsEngine.js';
import { registerPlanerRoutes } from './routes/planer.js';
import { PlannerStore } from './plannerStore.js';
import { ControllerManager } from './controllerManager.js';
import { registerControllerRoutes } from './routes/controller.js';
import { registerEinrichtungRoutes } from './routes/einrichtung.js';
import { initEinrichtung, kalibrierGruppen, vorschlag } from './einrichtung.js';
import { imProfil, inAchsen, inMakros, inKacheln, inKachelseiten, inGps } from './verwendung.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Alle beschreibbaren Laufzeitdaten (Einstellungen, Spiele, hochgeladene Bilder, Logs) liegen seit 23.10.2026 im
// Datenordner außerhalb des Programms (CONFIG_DIR, ASSETS_DIR, LOGS_DIR aus server/paths.js) -- so übersteht eine
// neue Version jedes Entpacken. Umzug der alten Daten aus dem Programmordner: server/datenOrdner.js (in start()).

class ControllerServer {
  constructor(port = 3000) {
    this.port = port;
    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = new Server(this.httpServer);

    // Komponenten initialisieren
    this.serial = new SerialCommunication(path.join(CONFIG_DIR, 'connection.json'));
    this.parser = new FrameParser();
    this.stateManager = new StateManager();
    this.mappingEngine = new MappingEngine();
    this.outputGenerator = new OutputGenerator();
    this.profileManager = new ProfileManager(path.join(CONFIG_DIR, 'profiles.json'));
    this.functionsManager = new FunctionsManager(
      path.join(CONFIG_DIR, 'functions.json'),
      path.join(CONFIG_DIR, 'categories.json')
    );
    this.calibrationManager = new CalibrationManager(path.join(CONFIG_DIR, 'calibration.json'));
    this.moduleLayoutManager = new ModuleLayoutManager(path.join(CONFIG_DIR, 'moduleLayouts.json'), path.join(VORGABEN_DIR, 'config', 'moduleLayouts.json'));
    // Welcher Controller hängt dran (Geräteprofile, 23.10.2026) -- vor loadGameData() initialisiert, s. start()
    this.controllerManager = new ControllerManager(CONFIG_DIR);
    this.serialLogger = new SerialLogger(LOGS_DIR);
    this.diagnose = new Diagnose(LOGS_DIR);   // Ereignis-Log und Diagnosedatei (server/diagnose.js, 25.10.2026)
    this.deviceConfigClient = new DeviceConfigClient(this.serial, this.serialLogger);
    this.macrosManager = new MacrosManager(path.join(CONFIG_DIR, 'macros.json'));
    this.macroEngine = new MacroEngine(this.mappingEngine, this.macrosManager, this.functionsManager,
      (payload) => this.io.emit('macro-status', payload));
    this.mappingEngine.setMacroEngine(this.macroEngine);
    this.macroEngine.onHinweis = (text) => this.io.emit('macro-hinweis', { text });   // B2/B5: Meldungen an die Tablets
    // Paket J: Bedingungen „nur auslösen, wenn …“ (Funktionen) und ControlHub-Aktionen (Profil, Kachelseite)
    this.conditions = new ConditionChecker();
    this.mappingEngine.setConditionChecker(this.conditions);
    this.macroEngine.conditions = this.conditions;
    this.mappingEngine.onHubAction = (cmd) => setImmediate(() => this.runHubAction(cmd));
    // Paket I: GPS-Rechnung mit Vorgewende-Auslösern (gpsManager je Spiel, s. loadGameData())
    this.gpsEngine = new GpsEngine({
      getManager: () => this.gpsManager,
      mapping: this.mappingEngine,
      beepArmrest: (ms) => (this.serial?.getStatus?.().connected ? this.deviceConfigClient.beep(ms) : Promise.resolve()),
      emit: (event, payload) => this.io?.emit(event, payload)
    });
    // Bearbeitete Fläche je Spielstand und Fahrzeug (Test 23.10.2026, server/flaeche.js)
    this.flaeche = new Flaeche({
      dir: () => path.join(this.gameManager.gameDir(this.gameManager.activeId), 'flaeche'),
      emit: (event, payload) => this.io?.emit(event, payload)
    });
    // Teilbreiten automatisch schalten (Hendrik 24.10.2026, server/teilbreitenAutomatik.js): nur per Spieltaste
    this.teilbreiten = new TeilbreitenAutomatik({
      getManager: () => this.gpsManager,
      mapping: this.mappingEngine,
      flaeche: this.flaeche,
      feldAt: (p) => !this.gpsEngine.index.fields.length || !!this.gpsEngine.feldAn(p),   // ohne Karte: überall Feld; erweiterte Felder über die Spurführung
      mehrspielerGast: () => { const sg = this.telemetryReader?.cachedMap?.savegame; return !!sg?.multiplayer && sg.server !== true; },
      emit: (event, payload) => this.io?.emit(event, payload)
    });
    this.craftSlotLayerManager = new CraftSlotLayerManager(path.join(CONFIG_DIR, 'craftSlotLayers.json'));
    this.steuerungsmenuesManager = new SteuerungsmenuesManager(path.join(CONFIG_DIR, 'steuerungsmenues.json'));
    this.autoSwitchManager = new AutoSwitchManager(path.join(CONFIG_DIR, 'autoSwitch.json'));
    this.backupManager = new BackupManager(this.functionsManager, this.profileManager, this.steuerungsmenuesManager);
    this.sendInFlight = false; // s. handleSerialData() -- verhindert ueberlappende serial.send()-Aufrufe
    // App-weite Einstellungen (Phase 1: Telemetrie-Rate; Phase 2 kommt das aktive Spiel dazu)
    this.appSettingsPath = path.join(CONFIG_DIR, 'app.json');
    // Ab Werk auf beste Leistung (Hendrik 25.10.2026: „nicht so sehr auf die Performance achten … Aktualisierungsrate
    // von 25 mal die Sekunde“); gespeicherte Werte bleiben, wie sie sind
    this.appSettings = { telemetry: { rate: 25 } };
    this.gameManager = new GameManager(CONFIG_DIR, ASSETS_DIR,
      this.appSettings, () => this.saveAppSettings());
    this.lastTelemetryEmitAt = 0;
    this.telemetryReader = new TelemetryReader(data => {
      // Jeder Schritt einzeln abgesichert (23.10.2026): vorher brach ein Fehler z. B. im Auto-Profilwechsel den ganzen
      // Takt ab -- der Leser wertete das als Lesefehler, Karte, Kurs und Planer blieben stehen, ohne Meldung.
      const safe = (label, fn) => { try { return fn(); } catch (e) { this.logOnce(label, e); return undefined; } };
      // Gemeinsame Grundwerte (Phase 3, s. telemetryBase.js) -- spielunabhängige Anzeigen lesen data.base
      const source = this.gameManager.get(this.gameManager.activeId)?.telemetry;
      const base = safe('Grundwerte', () => toBase(data, source));
      if (base) data.base = base;
      // Streckenzähler (seit 22.10.2026 im Server, gleicher Stand auf allen Tablets): fährt man ≥ 1 km/h, zählt der Weg
      if (data.available !== false) safe('Streckenzähler', () => this.countTrip(data));
      // ControlHub-Stand für die Werteliste (Profil, Makro, Ebene, Strecke) und Bedingungen im Server (Paket J)
      if (data.available !== false) data.hub = safe('ControlHub-Werte', () => this.hubContext());
      // Arbeitsplaner-Werte (Feld in Arbeit, als Nächstes …) für Anzeigen und Bedingungen
      if (data.available !== false) data.planner = safe('Planer-Werte', () => this.plannerContext(data));
      // GPS (Paket I): Arbeitsbalken, Vorgewende/Feldrand voraus, Auslöser -- vor den Bedingungen, damit
      // „Vorgewende in“ auch dort schon gilt
      safe('GPS-Rechnung', () => this.gpsEngine.tick(data));
      safe('Bearbeitete Fläche', () => this.flaeche.tick(data));   // nach dem GPS: braucht data.gps (Geräte-Optionen)
      safe('Teilbreiten', () => this.teilbreiten.tick(data));       // nach der Fläche: braucht die schon bearbeitete Fläche
      safe('Bedingungen', () => this.conditions.setTelemetry(data, source));
      // Tablets bekommen jede Schreibrunde der Mod (Rate 4/10/20/25, Hendrik 22.10.2026 -- vorher fest
      // höchstens 10/s); nur als Schutz bei ccRate 30 höchstens ~30/s. Makros/Auto-Profilwechsel immer alles.
      const now = Date.now();
      if (data.available === false || now - this.lastTelemetryEmitAt >= 30) {
        this.lastTelemetryEmitAt = now;
        this.io.emit('telemetry-update', data);
      }
      safe('Makros', () => this.macroEngine.handleTelemetryTick(data));
      safe('Auto-Profilwechsel', () => this.evaluateAutoSwitch(data));
      // nur bei frischen Daten neu bewerten (ohne Daten fehlt data.gps -- der Schalter ist dann nicht „aus“)
      // Teilbreiten-Automatik ebenso (Hendrik 24.10.2026: „wesentlich schneller reagieren“)
      const needed = data.available === false ? !!this.modNeeded : !!(data.gps?.armed || data.teilbreiten?.auto || this.macroEngine.activeMacroId);
      if (needed !== !!this.modNeeded) { this.modNeeded = needed; safe('Mod-Einstellungen', () => this.updateModSettings()); }
    }, course => {
      // Eigenes, seltenes Event statt Teil von 'telemetry-update' -- die Kursgeometrie (Feldgrenze +
      // Segmente) kann gross sein und aendert sich praktisch nie, im Gegensatz zum 250ms-Takt der
      // uebrigen Telemetrie. Wird nur ausgeloest, wenn courseVer sich wirklich geaendert hat (s.
      // TelemetryReader.poll()).
      this.gpsEngine.setKurs(course);   // Feldgrenze der Spurführung (erweiterte Felder) für Vorgewende und Teilbreiten
      this.io.emit('telemetry-course-update', course);
    });
    // Karte (Paket D): Felder/Höfe selten, andere Fahrzeuge bis 2×/s
    this.telemetryReader.onMap = (map) => {
      this.gpsEngine.setMap(map);
      this.io.emit('telemetry-map', map);
      this.applySavegame(map);   // Planer-Satz des Spielstands (Paket E2)
      this.flaeche.setzeSpielstand(savegameKey(map?.savegame, map?.name)).catch(e => this.logOnce('Fläche laden', e));
    };
    this.telemetryReader.onWorld = (world) => this.io.emit('telemetry-world', world);
    this.telemetryReader.onRoads = (roads) => this.io.emit('telemetry-roads', roads);   // Mod 0.6, Anmerkung 19
    // Neuer Spielstand in der Mod (B6): GPS-Rechnung neu beginnen; Karte, Kurs und Planer kommen frisch nach
    this.telemetryReader.onSession = () => {
      console.log('Spiel: neuer Spielstand erkannt -- Zwischenstände der vorigen Sitzung verworfen');
      this.gpsEngine?.reset();
      this.gpsEngine?.setKurs(null);   // Kurs der vorigen Sitzung gilt nicht mehr, der neue kommt mit der Kursdatei
      this.io.emit('telemetry-session', {});
    };
    // Planer/Aufträge (Paket E)
    this.telemetryReader.onPlan = (plan) => {
      this.io.emit('telemetry-plan', plan);
      // Anmerkung 24: letzte Frucht und offen gemeldete Arbeiten je Feld merken (Schritte der Fruchtfolge)
      try { if (this.plannerStore?.merkeFelder(plan)) this.io.emit('planer-changed', this.plannerStore.summary()); } catch (e) { this.logOnce('Planer-Verlauf', e); }
    };
    this.plannerWantedAt = 0;

    this.setupExpress();
    this.setupSocketIO();
  }

  /**
   * Express-Server konfigurieren
   */
  setupExpress() {
    // Statische Dateien aus public/ servieren -- rein lesend, bleibt bewusst __dirname-basiert
    // (bei einer gepackten .exe der readonly Snapshot, dort liegen diese Dateien schon fertig drin).
    // Browser-Zwischenspeicher (Hendrik 22.10.2026: nach dem Update zeigte der Browser noch die alte Seite mit
    // „30× pro Sekunde“ und den alten Kartencode): index.html nie zwischenspeichern und Skripte/Styles mit einer
    // Version je Serverstart verlinken -- nach jedem Update + Neustart lädt jeder Browser beim Neuladen alles neu.
    const assetVersion = Date.now().toString(36);
    const indexPath = path.join(__dirname, '../public/index.html');
    this.app.get(['/', '/index.html'], async (req, res, next) => {
      try {
        const html = (await fs.readFile(indexPath, 'utf-8')).replace(/(src|href)="((?:js|css)\/[^"?]+)"/g, `$1="$2?v=${assetVersion}"`);
        res.set('Cache-Control', 'no-store').type('html').send(html);
      } catch (error) { next(error); }
    });
    this.app.use(express.static(path.join(__dirname, '../public'), { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));

    // Icons servieren -- aus dem Datenordner (beschreibbar, s. Kommentar oben)
    this.app.use('/icons', express.static(path.join(ASSETS_DIR, 'function-icons')));

    // Modul-Layout-Bilder servieren (Draufsichten für die Detailansicht)
    this.app.use('/module-layouts', express.static(path.join(ASSETS_DIR, 'module-layouts')));

    // Bedienpanel-Hintergrundbilder servieren
    this.app.use('/steuerungsmenue-bg', express.static(path.join(ASSETS_DIR, 'steuerungsmenue-bg')));

    // Bedienpanel-Grafik-Elemente servieren (eigener Ordner -- mehrere Grafiken pro Seite möglich,
    // anders als das eine Hintergrundbild pro Seite)
    this.app.use('/steuerungsmenue-graphics', express.static(path.join(ASSETS_DIR, 'steuerungsmenue-graphics')));

    // Limit hoeher als Express-Standard (100kb): Modul-Import (s.u.) verschickt ein Base64-Bild
    // eingebettet im JSON-Body -- ein routen-eigenes express.json({limit}) NACH diesem globalen
    // Aufruf greift nicht, da der globale Parser fuer 'application/json' bereits vorher im Stack
    // steht und bei Ueberlaenge sofort 413 wirft, bevor die Route ueberhaupt erreicht wird.
    // 60mb seit Phase 2: Spielsicherungen (/api/games/import) enthalten alle Bedienpanel-Bilder als Base64
    this.app.use(express.json({ limit: '60mb' }));


    // Routen nach Themen (server/routes/*.js); innerhalb eines Themas Reihenfolge wie vorher in index.js
    registerDeviceRoutes(this.app, this);
    registerProfilesRoutes(this.app, this);
    registerFunctionsRoutes(this.app, this);
    registerMacrosRoutes(this.app, this);
    registerModulesRoutes(this.app, this);
    registerSteuerungsmenuesRoutes(this.app, this);
    registerGamesRoutes(this.app, this);
    registerKachelnRoutes(this.app, this);
    registerGpsRoutes(this.app, this);
    registerKarteRoutes(this.app, this);
    registerPlanerRoutes(this.app, this);
    registerControllerRoutes(this.app, this);
    registerEinrichtungRoutes(this.app, this);
    registerUpdateRoutes(this.app, this);
    registerModRoutes(this.app);

    // Fehler außerhalb der Routen (kaputtes JSON, zu große Anfrage) als JSON statt HTML-Seite -- die Oberfläche
    // liest jede Antwort mit res.json() (23.10.2026)
    // eslint-disable-next-line no-unused-vars
    this.app.use((err, req, res, next) => {
      const status = err.status || err.statusCode || 500;
      const error = err.type === 'entity.too.large' ? 'Die Datei ist zu groß.'
        : err.type === 'entity.parse.failed' ? 'Ungültige Daten (kein gültiges JSON).' : (err.message || 'Unbekannter Fehler');
      if (status >= 500) this.logOnce('Anfrage ' + req.method + ' ' + req.path, err);
      res.status(status).json({ success: false, error });
    });
  }

  // Fehler gedrosselt ins Konsolenfenster: je Stelle höchstens alle 10 s, sonst flutet ein Fehler im 25/s-Takt das Log
  logOnce(label, error) {
    this.logOnceAt = this.logOnceAt || new Map();
    const now = Date.now();
    if (now - (this.logOnceAt.get(label) || 0) < 10000) return;
    this.logOnceAt.set(label, now);
    console.error(`[${label}]`, error?.stack || error?.message || error);
  }

  /**
   * Socket.IO konfigurieren
   */
  setupSocketIO() {
    this.io.on('connection', (socket) => {
      console.log('Client verbunden:', socket.id);
      this.updateModSettings(); // Sparmodus der Mod beenden, sobald ein Browser da ist

      // War beim Laden eine Datei beschädigt (jsonStore.js), erfährt das jedes Gerät einmal je Verbindung (23.10.2026)
      if (dataProblems.length) socket.emit('data-problems', dataProblems.slice(-10));

      // Status senden
      socket.emit('status', {
        serial: this.serial.getStatus(),
        profile: this.profileManager.currentProfileName
      });

      // Kurs-Geometrie (Feldgrenze/Spurführung) nachreichen: 'telemetry-course-update' wird sonst nur
      // beim tatsächlichen Wechsel des Kurses gebroadcastet (s. telemetryReader.js poll()) -- ein Client,
      // der sich NACH dem letzten Wechsel neu verbindet (z.B. Seiten-Reload), würde sie sonst nie sehen,
      // obwohl der Kurs im Spiel unverändert weiter existiert (Hendriks Beobachtung "keine Linien mehr").
      if (this.telemetryReader?.cachedCourse) {
        socket.emit('telemetry-course-update', this.telemetryReader.cachedCourse);
      }
      if (this.telemetryReader?.cachedMap) socket.emit('telemetry-map', this.telemetryReader.cachedMap);
      if (this.telemetryReader?.cachedWorld) socket.emit('telemetry-world', this.telemetryReader.cachedWorld);
      if (this.telemetryReader?.cachedRoads) socket.emit('telemetry-roads', this.telemetryReader.cachedRoads);
      socket.emit('flaeche', this.flaeche.stand(false));
      if (this.telemetryReader?.cachedPlan) socket.emit('telemetry-plan', this.telemetryReader.cachedPlan);
      // Ein Gerät zeigt den Arbeitsplaner (meldet sich alle 10 s, solange die Seite offen ist)
      socket.on('planner-active', () => {
        const was = Date.now() - this.plannerWantedAt < 30000;
        this.plannerWantedAt = Date.now();
        if (!was) this.updateModSettings();
      });

      // Makro-Status nachreichen (23.08.2026, Hendriks Wunsch: dezenter Indikator in der Breadcrumb-
      // Leiste) -- analog zum Kurs-Nachreichen oben: ein neu verbundener Client (Seiten-Reload) soll
      // sofort den echten Stand sehen, nicht erst bei der nächsten Zustandsänderung.
      socket.emit('macro-status', this.macroEngine.getStatus());

      // Port-Verbindung
      socket.on('connect-port', async (data) => {
        try {
          await this.serial.connect(data.port, data.baudRate || 115200);
          socket.emit('connection-status', { success: true, connected: true });
          this.io.emit('serialStatus', this.serial.getStatus());
        } catch (error) {
          socket.emit('connection-status', { success: false, error: error.message });
        }
      });

      // Ein-/Ausstecken-Assistent (25.08.2026, ersetzt das bisherige blinde "ersten Kennungs-Treffer
      // nehmen" -- s. serialCommunication.js wizardBefore()/wizardAfter() für die Begründung).
      socket.on('wizard-before', async () => {
        try {
          const result = await this.serial.wizardBefore();
          socket.emit('wizard-before-result', { success: true, ...result });
        } catch (error) {
          socket.emit('wizard-before-result', { success: false, error: error.message });
        }
      });

      socket.on('wizard-after', async () => {
        try {
          const result = await this.serial.wizardAfter();
          if (result.success) {
            await this.serial.connect(result.port);
            socket.emit('wizard-after-result', { success: true, port: result.port });
            this.io.emit('serialStatus', this.serial.getStatus());
          } else {
            socket.emit('wizard-after-result', { success: false, reason: result.reason, candidates: result.candidates });
          }
        } catch (error) {
          socket.emit('wizard-after-result', { success: false, error: error.message });
        }
      });

      // Disconnect
      socket.on('disconnect-port', async () => {
        try {
          await this.serial.disconnect();
        } catch (error) {
          this.logOnce('Trennen', error);
        }
        this.io.emit('serialStatus', this.serial.getStatus());
      });

      // Profil wechseln
      socket.on('switch-profile', (data) => {
        if (typeof data?.name !== 'string' || !data.name) return;
        this.applyProfileSwitch(data.name);
      });

      // Automatischer Profilwechsel: Hendrik beantwortet eine Konflikt-Meldung (profileName gesetzt)
      // oder wählt "Immer fragen" (profileName null/undefined) -- s. autoSwitchManager.js.
      socket.on('auto-switch-resolve', async (data) => {
        if (!data?.comboKey) return;
        try {
          if (data.profileName) {
            await this.autoSwitchManager.setComboPreference(data.comboKey, data.profileName);
            this.autoSwitchManager.lastPromptedComboKey = null;
            this.applyProfileSwitch(data.profileName);
          } else {
            await this.autoSwitchManager.clearComboPreference(data.comboKey);
            this.autoSwitchManager.lastPromptedComboKey = null;
          }
        } catch (error) {
          this.logOnce('Auto-Wechsel', error);
        }
      });

      // Bedienpanel-Taste aus der Web-UI angetippt/losgelassen (steuerungsmenues.js) -- löst die
      // Zuordnung genau wie eine physische Taste über die MappingEngine aus. Die Zuordnung wird
      // bewusst SERVERSEITIG aus dem gespeicherten Bedienpanel nachgeschlagen statt dem Client zu
      // vertrauen, der nur pageId+buttonId schickt.
      socket.on('panel-button-down', (data) => {
        const page = this.steuerungsmenuesManager.getPage(data?.pageId);
        // Tasten und antippbare Anzeigen (Paket J) teilen sich denselben Weg
        const button = page?.buttons.find(b => b.id === data?.buttonId) || page?.displays?.find(d => d.id === data?.buttonId);
        if (!button) return;
        this.mappingEngine.handleVirtualButtonDown(`panel:${socket.id}:${page.id}:${button.id}`, button.functionId || button.quickActions || null, button.quickActionsDurationSeconds);
      });

      socket.on('panel-button-up', (data) => {
        if (!data?.pageId || !data?.buttonId) return;
        this.mappingEngine.handleVirtualButtonUp(`panel:${socket.id}:${data.pageId}:${data.buttonId}`);
      });

      // Taste aus der Tastenleiste einer Kachel (Startseite, s. kachelnManager.js) -- gleicher Weg wie eine
      // Tastenfeld-Taste; „panel:“-Präfix, damit releaseAllVirtualButtons() auch diese loslässt.
      socket.on('tile-key-down', (data) => {
        const key = this.kachelnManager?.findKey(data?.pageId, data?.type, data?.keyId);
        if (!key) return;
        this.mappingEngine.handleVirtualButtonDown(`panel:${socket.id}:tile:${data.pageId}:${data.type}:${key.id}`, key.functionId || key.quickActions || null, key.durationSeconds);
      });

      socket.on('tile-key-up', (data) => {
        if (!data?.pageId || !data?.type || !data?.keyId) return;
        this.mappingEngine.handleVirtualButtonUp(`panel:${socket.id}:tile:${data.pageId}:${data.type}:${data.keyId}`);
      });

      socket.on('disconnect', () => {
        console.log('Client getrennt:', socket.id);
        setImmediate(() => this.updateModSettings()); // Sparmodus der Mod, wenn kein Browser mehr da ist
        // Sicherheitsnetz: falls dieser Client eine Bedienpanel-Taste gerade hielt, als die Verbindung
        // abriss (z.B. Tab neu geladen), darf nichts dauerhaft "gedrückt" hängen bleiben. Seit 23.10.2026 nur die
        // Tasten DIESER Verbindung -- vorher ließ ein neu geladenes zweites Tablet die gehaltene Taste des ersten los.
        this.mappingEngine.releaseAllVirtualButtons(`panel:${socket.id}:`);
      });
    });
  }

  /**
   * Lädt die Daten eines Spiels aus server/config/games/<id>/ und verdrahtet sie neu (Phase 2).
   * Erst alles neu laden, dann austauschen -- schlägt das Laden fehl, bleibt das alte Spiel aktiv.
   * Wer Referenzen hält: MacroEngine (macros/functions), MappingEngine (functions, Ebenentaster,
   * Profil), BackupManager (functions/profiles/steuerungsmenues). Routen lesen this.xxxManager
   * bei jedem Aufruf neu und brauchen nichts.
   */
  // Belegung eines Controllers in einem Spiel (Geräteprofile G2, 23.10.2026): Profile, Auto-Wechsel, Ebenentaster aus
  // games/<spiel>/controller/<controller>/ -- noch nichts da (neuer Controller) = leeres Standardprofil (BasicGamepad)
  async loadControllerData(gameId, controllerId) {
    const dir = this.gameManager.controllerDir(gameId, controllerId);
    await fs.mkdir(dir, { recursive: true });
    const profileManager = new ProfileManager(path.join(dir, 'profiles.json'));
    const craftSlotLayerManager = new CraftSlotLayerManager(path.join(dir, 'craftSlotLayers.json'));
    const autoSwitchManager = new AutoSwitchManager(path.join(dir, 'autoSwitch.json'));
    await profileManager.initialize();
    await craftSlotLayerManager.initialize();
    await autoSwitchManager.initialize();
    return { profileManager, craftSlotLayerManager, autoSwitchManager };
  }

  // Belegung (aus loadControllerData()) einsetzen und alles neu verdrahten, was Referenzen darauf hält
  async applyControllerData({ profileManager, craftSlotLayerManager, autoSwitchManager }, gameId = this.gameManager.activeId) {
    if (this.macroEngine.activeMacroId) this.macroEngine.abort();
    this.mappingEngine.releaseAllVirtualButtons();
    this.mappingEngine.releaseAllPulses();   // Spiel-/Controller-Wechsel: auch gehaltene Makro-Impulse loslassen
    this.profileManager = profileManager;
    this.craftSlotLayerManager = craftSlotLayerManager;
    this.autoSwitchManager = autoSwitchManager;
    this.backupManager = new BackupManager(this.functionsManager, profileManager, this.steuerungsmenuesManager);
    // getConfig() liefert dieselbe Objekt-Referenz, die craftSlotLayerManager intern weiter mutiert -- erneutes
    // Verdrahten ist nur beim Spiel-/Controllerwechsel nötig
    this.mappingEngine.setCraftSlotLayerConfig(craftSlotLayerManager.getConfig());
    await this.ensureDefaultProfileIsBasicGamepad();
    // Beispielprofile einmal je Belegung dazu (Hendrik 24.10.2026: „Leider finde ich in der Installation immer noch nicht
    // deine Vorlagenprofile“ und nach dem Update „Die Profile hab ich immer noch nicht“): früher nur, wenn profiles.json
    // fehlte -- über eine vorhandene Installation gespielt kamen sie nie. Jetzt nach dem Stand in profiles.json
    // (beispiele), auch bei bestehenden Belegungen; gleichnamige Profile bleiben, wie sie sind. Achsen wie im aktiven
    // Profil; aktiv bleibt, was aktiv war. Nur wo es Beispielprofile gibt (LS25 + CraftConsole).
    // Seit 25.10.2026 mit Stand: Nachträge der Beispielbelegung (z. B. Zündschloss) kommen einmal in die vorhandenen Profile.
    const beispiele = await ladeBeispielprofile(gameId, this.controllerManager.activeId);
    if (beispiele && (profileManager.beispiele || 0) < beispielStand(beispiele)) {
      try {
        if (!profileManager.beispiele) {
          const r = await fuegeBeispielprofileHinzu(this, null, { spiel: gameId });
          if (r.hinzugefuegt.length) console.log(`Beispielprofile dazugelegt: ${r.hinzugefuegt.join(', ')}`);
        }
        const n = await wendeNachtraegeAn(this, beispiele, profileManager.beispiele || 0);
        if (n.geaendert.length) console.log(`Beispielbelegung nachgetragen in: ${n.geaendert.join(', ')}`);
        profileManager.beispiele = beispielStand(beispiele);
        await profileManager.save();
      } catch (error) { console.error('Beispielprofile nicht angelegt:', error.message); }
    }
    const currentProfile = this.profileManager.getCurrentProfile();
    if (currentProfile) this.mappingEngine.loadProfile(currentProfile);
  }

  async loadGameData(gameId) {
    const dir = this.gameManager.gameDir(gameId);
    await fs.mkdir(dir, { recursive: true });
    const controllerData = await this.loadControllerData(gameId, this.controllerManager.activeId);
    const functionsManager = new FunctionsManager(path.join(dir, 'functions.json'), path.join(dir, 'categories.json'));
    const macrosManager = new MacrosManager(path.join(dir, 'macros.json'));
    const steuerungsmenuesManager = new SteuerungsmenuesManager(path.join(dir, 'steuerungsmenues.json'));
    const kachelnManager = new KachelnManager(path.join(dir, 'kacheln.json'));
    const gpsManager = new GpsManager(path.join(dir, 'gps.json'));
    const plannerStore = new PlannerStore(path.join(dir, 'planer.json'));
    // Funktionen inkl. BasicGamepad-Tasten, Voraussetzung für die default-Profil-Belegung
    await functionsManager.initialize();
    await macrosManager.initialize();
    await steuerungsmenuesManager.initialize();
    await kachelnManager.initialize();
    // Früher feste Bausteine einmal als normale Bausteine anlegen und alte Kacheln darauf umziehen (22.10.2026)
    await steuerungsmenuesManager.ensureVorlagen(this.gameManager.get(gameId)?.features || []);
    await migrateKachelnToBausteine(kachelnManager, steuerungsmenuesManager);
    // Neues Spiel: Funktionen (inputBinding.xml des Spiels) und Kachelseiten ab Werk (24.10.2026)
    await richteGrundausstattungEin(gameId, { functionsManager, kachelnManager, steuerungsmenuesManager });
    await gpsManager.initialize();
    await plannerStore.initialize();

    if (this.macroEngine.activeMacroId) this.macroEngine.abort();
    this.mappingEngine.releaseAllVirtualButtons();
    this.mappingEngine.releaseAllPulses();   // Spiel-/Controller-Wechsel: auch gehaltene Makro-Impulse loslassen
    await this.flaeche?.zuruecksetzen();       // Fläche gehört zum Spiel (Ordner games/<id>/flaeche)

    this.functionsManager = functionsManager;
    this.macrosManager = macrosManager;
    this.steuerungsmenuesManager = steuerungsmenuesManager;
    this.kachelnManager = kachelnManager;
    this.gpsManager = gpsManager;
    this.gpsEngine?.reset();
    this.plannerStore = plannerStore;
    // nur bei Spielen mit Planer: sonst landete der FS25-Spielstand im Planer eines eigenen Spiels (23.10.2026)
    if (this.telemetryReader?.cachedMap && this.gameManager.get(gameId)?.features?.includes('planner')) this.applySavegame(this.telemetryReader.cachedMap);
    if (this.telemetryReader?.cachedMap && this.gameManager.get(gameId)?.features?.includes('map')) {
      this.flaeche.setzeSpielstand(savegameKey(this.telemetryReader.cachedMap.savegame, this.telemetryReader.cachedMap.name)).catch(() => {});
    }
    this.macroEngine.macrosManager = macrosManager;
    this.macroEngine.functionsManager = functionsManager;
    this.mappingEngine.setFunctionsManager(functionsManager);
    await this.applyControllerData(controllerData, gameId);
    console.log(`Spiel geladen: ${this.gameManager.get(gameId)?.name || gameId} (${this.controllerManager.activeProfile?.name})`);
  }

  // Spielwechsel und Spiel-Import nacheinander (23.10.2026): zwei Wechsel kurz hintereinander (Doppeltipp, zwei Tablets)
  // liefen sonst parallel -- am Ende waren die Daten von Spiel A geladen, als aktiv aber B gespeichert.
  exclusive(fn) {
    const run = (this.gameLock || Promise.resolve()).then(fn, fn);
    this.gameLock = run.catch(() => {});
    return run;
  }

  switchGame(gameId) {
    return this.exclusive(async () => {
      if (!this.gameManager.get(gameId)) throw new Error('Unbekanntes Spiel: ' + gameId);
      await this.loadGameData(gameId);
      await this.gameManager.setActive(gameId);
      this.applyTelemetrySource();
      this.io.emit('game-changed', { active: gameId });
    });
  }

  /**
   * Erkennt nach dem Verbinden, welcher Controller angeschlossen ist (GETALL + USB-Kennung, Konzept-Geraeteprofile § 5)
   * und schaltet bei Bedarf um. Unbekannte Geräte (device=… ohne Geräteprofil) melden sich bei den Tablets.
   */
  async detectController() {
    if (!this.serial.getStatus().connected) return;
    let getAll = null;
    try { getAll = await this.deviceConfigClient.getAll(); } catch { getAll = null; }
    const usb = await this.serial.getPortInfo();
    const result = await this.controllerManager.detect({ getAll, usb });
    if (result.unknownDevice) {
      this.io.emit('controller-unknown', { device: result.unknownDevice, buttons: getAll?.buttons ?? null, axes: getAll?.axes ?? null });
    }
    if (result.id && result.id !== this.controllerManager.activeId) {
      await this.switchController(result.id);
    } else {
      this.io.emit('controller-info', this.controllerManager.payload());
    }
    if (result.id) this.pruefeEinrichtung();
    await this.unterbauZurArmlehne(getAll);
  }

  // Diagnose beim Verbinden (25.10.2026): Stand und Ereignis-Log der Armlehne einmal festhalten (STAT ab Firmware 2.15,
  // ältere kennen nur DIAG). Kein Abfragen im laufenden Betrieb (Hendrik: „Normal müsste es doch auch reichen, wenn nach
  // der Verbindung einmal gefragt wird. Das Relevanteste wird doch in der Armlehne gespeichert“): Der Grund eines
  // Neustarts übersteht ihn in der Armlehne, und nach einem Neustart verbindet sie sich ohnehin neu.
  async diagnoseBeimVerbinden() {
    if (!this.serial.getStatus().connected) return;
    const stat = leseStat(await this.deviceConfigClient.getStat().catch(() => null));
    if (stat) this.diagnose.stat(stat, { beimVerbinden: true });
    else this.diagnose.ereignis('ARMLEHNE', 'Keine Zustandsabfrage (STAT gibt es ab Armlehnen-Firmware 2.15)');
    const diag = await this.deviceConfigClient.getDiag().catch(() => null);
    if (diag) this.diagnose.diagZeilen(diag);
  }

  // Unterbau der CraftSlots an die Armlehne (slotNunterbau): die Firmware braucht ihn für den Schubhebel, dessen Mitte
  // nur aus seiner eigenen Kalibrierung kommt (FW 2.14). getAll = zuletzt gelesene Werte, dann nur senden, was abweicht.
  async unterbauZurArmlehne(getAll = null) {
    const cm = this.controllerManager;
    if (cm.activeId !== 'craftconsole' || !this.serial.getStatus().connected) return;
    const setup = cm.setup('craftconsole');
    for (const n of [1, 2]) {
      const s = setup?.[`craftslot${n}`];
      const fw = UNTERBAUTEN.find(u => u.id === s?.unterbau)?.fw;
      if (!s?.an || fw === undefined) continue;
      if (getAll && Number(getAll[`slot${n}unterbau`]) === fw) continue;
      await this.deviceConfigClient.set(`slot${n}unterbau`, fw).catch(() => {});
    }
  }

  // ---- Verwendung von Funktionen und Makros (Durchsicht B2, server/verwendung.js) ----
  // Fundstellen im aktiven Spiel: Profile aller Controller, globale Achsen, Makros, Kacheln, Tastenleisten, GPS.
  // ref = Funktions-ID oder 'macro:<id>'. entfernen: Belegungen gleich mit entfernen (vor dem Löschen); ein Makro,
  // das dadurch keinen Schritt mehr hat, wird samt seinen eigenen Belegungen mit gelöscht.
  // ersetzen: Referenz überall umstellen statt entfernen (24.10.2026, „Profil … laden“ folgt dem Umbenennen des Profils)
  async verwendungen(ref, { entfernen = false, ersetzen = null } = {}) {
    const aendern = entfernen || !!ersetzen;
    const funde = [];
    const cm = this.controllerManager;
    const spiel = this.gameManager.activeId;
    const name = id => cm.profile(id)?.name || id;

    let profileGeaendert = false;
    for (const [pName, p] of Object.entries(this.profileManager.profiles)) {
      const f = imProfil(p, ref, { entfernen, ersetzen });
      funde.push(...f.map(t => `Profil „${pName}“ (${name(cm.activeId)}) · ${t}`));
      if (f.length) profileGeaendert = true;
    }
    if (aendern && profileGeaendert) {
      await this.profileManager.save();
      this.mappingEngine.loadProfile(this.profileManager.getCurrentProfile());
      this.io.emit('profile-updated', { name: this.profileManager.currentProfileName });
    }
    // Profile der anderen Controller dieses Spiels (G2: Belegung je Controller) stehen nur in ihren Dateien
    for (const id of await this.gameManager.controllersWithData(spiel)) {
      if (id === cm.activeId) continue;
      const datei = path.join(this.gameManager.controllerDir(spiel, id), 'profiles.json');
      const { data } = await readJsonFile(datei, { fallback: null });
      if (!data?.profiles) continue;
      let anders = false;
      for (const [pName, p] of Object.entries(data.profiles)) {
        const f = imProfil(p, ref, { entfernen, ersetzen });
        funde.push(...f.map(t => `Profil „${pName}“ (${name(id)}) · ${t}`));
        if (f.length) anders = true;
      }
      if (aendern && anders) await writeJsonAtomic(datei, data);
    }
    const global = inAchsen(this.calibrationManager.getGlobalAxes(), ref, { entfernen, ersetzen });
    funde.push(...global.map(t => `Achsen-Zuordnung für alle Profile · ${t}`));
    if (aendern && global.length) await this.calibrationManager.save();

    const makros = inMakros(this.macrosManager.macros, ref, { entfernen, ersetzen });
    funde.push(...makros.funde);
    if (aendern && makros.funde.length) {
      for (const id of makros.leer) {
        if (this.macroEngine.activeMacroId === id) this.macroEngine.abort();
        delete this.macrosManager.macros[id];
      }
      await this.macrosManager.save();
      for (const id of makros.leer) {
        const weitere = await this.verwendungen(`macro:${id}`, { entfernen: true });
        funde.push(...weitere.map(t => `${t} (Makro ohne Schritte, mit entfernt)`));
      }
    }
    const kacheln = inKacheln(this.steuerungsmenuesManager.pages, ref, { entfernen, ersetzen });
    funde.push(...kacheln);
    if (aendern && kacheln.length) { await this.steuerungsmenuesManager.save(); this.io.emit('steuerungsmenues-changed'); }
    const leisten = inKachelseiten(this.kachelnManager.get(), ref, { entfernen, ersetzen });
    funde.push(...leisten);
    if (aendern && leisten.length) { await this.kachelnManager.save(); this.io.emit('kacheln-changed', this.kachelnManager.get()); }
    const gps = inGps(this.gpsManager.config, ref, { entfernen, ersetzen });
    funde.push(...gps);
    if (aendern && gps.length) { await this.gpsManager.persist(); this.io.emit('gps-changed', this.gpsManager.summary()); }
    return funde;
  }

  // ---- Einrichtung (23.10.2026, server/einrichtung.js) ----
  // Kalibrier-Gruppen der gewählten Module mit Stand aus caldone; null bei Controllern ohne Kalibrierung (CraftLink)
  kalibrierStand(id = this.controllerManager.activeId) {
    const cm = this.controllerManager;
    if (!cm.profile(id)?.kann?.kalibrierung) return null;
    // Hebel eines Schubhebels: Kalibrieren mit eigenem Schritt „Mitte festlegen“ (24.10.2026)
    const schub = n => cm.setup(id)?.[`craftslot${n}`]?.unterbau === 'schubhebel';
    return kalibrierGruppen(cm.modules(id), cm.state.info[id]?.caldone ?? null)
      .map(g => (/^lever[AB]2?$/.test(g.group) && schub(g.group.endsWith('2') ? 2 : 1) ? { ...g, schubhebel: true } : g));
  }

  // Nach dem Erkennen: neuer Controller oder offene Kalibrierung → Frage an die Tablets (bleibt bis beantwortet/getrennt)
  pruefeEinrichtung() {
    const cm = this.controllerManager;
    this.einrichtungsVorschlag = vorschlag({
      controllerId: cm.activeId, name: cm.activeProfile.name, einrichtungFertig: !!this.appSettings.einrichtung?.fertig,
      eingerichtet: cm.state.eingerichtet || {}, hinweisAus: cm.state.hinweisAus || {}, gruppen: this.kalibrierStand()
    });
    if (this.einrichtungsVorschlag) this.io.emit('einrichtung-vorschlag', this.einrichtungsVorschlag);
  }

  // Anderer Controller aktiv (erkannt oder von Hand gewählt): seine eigene Belegung laden (G2), dann laden alle Tablets
  // neu, wie beim Spielwechsel. Erst laden, dann umschalten -- scheitert das Laden, bleibt der alte Controller aktiv.
  switchController(id) {
    return this.exclusive(async () => {
      if (!this.controllerManager.profile(id)) throw new Error('Unbekannter Controller: ' + id);
      if (id === this.controllerManager.activeId) return;
      const data = await this.loadControllerData(this.gameManager.activeId, id);
      await this.controllerManager.setActive(id);
      await this.applyControllerData(data);
      console.log(`Controller: ${this.controllerManager.activeProfile.name}`);
      this.io.emit('controller-changed', { active: id });
    });
  }

  // „Profile von … übernehmen“: Belegung eines anderen Controllers in den aktiven kopieren (alter Stand in _sicherung/)
  copyControllerProfiles(fromId) {
    return this.exclusive(async () => {
      if (!this.controllerManager.profile(fromId)) throw new Error('Unbekannter Controller: ' + fromId);
      const game = this.gameManager.activeId, to = this.controllerManager.activeId;
      await this.gameManager.copyControllerData(game, fromId, to);
      await this.applyControllerData(await this.loadControllerData(game, to));
      this.io.emit('controller-changed', { active: to });
    });
  }

  // Telemetrie passend zum aktiven Spiel: FS25 liest die Mod-Dateien, eigene Spiele haben keine
  applyTelemetrySource() {
    const game = this.gameManager.get(this.gameManager.activeId);
    if (game?.telemetry === 'fs25') {
      this.telemetryReader.start();
    } else {
      this.telemetryReader.stop();
      this.telemetryReader.clearCaches();
      this.io.emit('telemetry-update', { available: false, noTelemetry: true });
    }
  }

  gamesPayload() {
    return { success: true, games: this.gameManager.list(), active: this.gameManager.activeId, chosen: this.gameManager.chosen };
  }

  async loadAppSettings() {
    try {
      // fehlt oder kaputt (dann als app.defekt-<Zeit>.json gesichert, s. jsonStore.js) -> Standard
      const { data: loaded } = await readJsonFile(this.appSettingsPath, { fallback: null });
      if (!loaded) return;
      this.appSettingsGeladen = true;   // es gab schon Daten (für die Sicherung bei Versionswechsel)
      const rate = Number(loaded?.telemetry?.rate);
      // Inhalt ins bestehende Objekt übernehmen -- GameManager hält eine Referenz darauf
      Object.assign(this.appSettings, loaded, { telemetry: { ...loaded.telemetry, rate: TELEMETRY_RATES.includes(rate) ? rate : 25 } }); // gespeicherte 30 (bis 22.10.2026) -> 25
    } catch {
      // Datei gibt es noch nicht -> Standard (25/s seit 25.10.2026, vorher 4/s)
    }
  }

  async saveAppSettings() {
    await writeJsonAtomic(this.appSettingsPath, this.appSettings);
  }

  // Rate + Anzahl verbundener Browser an die FS25-Mod (craftConsoleSettings.xml, s. telemetryReader.js)
  // Verbundene GERÄTE (nicht Verbindungen -- jede Seite öffnet mehrere Socket-Verbindungen): je Adresse eins
  connectedDevices() {
    const addrs = new Set();
    for (const s of this.io.of('/').sockets.values()) addrs.add(s.handshake?.address || s.id);
    return addrs.size;
  }

  // lebenszeichen: alle 10 s aus start() -- die Mod (ab 0.5.2) erkennt daran, dass ControlHub noch läuft (Durchsicht B6)
  updateModSettings(lebenszeichen = false) {
    const planWanted = Date.now() - (this.plannerWantedAt || 0) < 30000; // 30 s nach der letzten Meldung aus
    // Hauptschalter GPS an oder Makro läuft: volle Rate auch ohne Tablet -- die Auslöser sollen ja ohne Tablet
    // funktionieren, im Sparmodus (2/s) kämen sie bis zu einer halben Sekunde zu spät (23.10.2026)
    const clients = Math.max(this.connectedDevices(), this.modNeeded ? 1 : 0);
    return this.telemetryReader.writeModSettings(clients, planWanted, lebenszeichen);
  }

  /**
   * Verarbeitet eingehende serielle Daten
   */
  handleSerialData(data) {
    // Non-FRAME-Zeilen (GETALL/SET/STATUS/DIAG-Antworten sowie unaufgefordert gesendete LIVE-Zeilen
    // während einer Kalibrierung) gehen an den DeviceConfigClient. handleLine() dort no-opt selbst
    // sauber, wenn gerade nichts erwartet wird -- daher IMMER aufrufen, nicht nur wenn isPending():
    // LIVE-Zeilen haben nie ein "pending" (startLiveCalibration() startet keine Request/Response-
    // Anfrage), wurden hier vorher also faelschlich verworfen -- deshalb kam nie Live-Feedback an.
    if (!data.trim().startsWith('<FRAME>')) {
      const line = data.trim();
      // Mitschnitt ALLER Nicht-FRAME-Zeilen, auch ohne aktive Anfrage -- z.B. Boot-Banner oder
      // unerwartete Meldungen, die sonst kommentarlos verworfen würden (s. server/serialLogger.js).
      this.serialLogger.log('RX', line);
      this.deviceConfigClient.handleLine(line);
      return;
    }

    // Frame parsen
    const frames = this.parser.parse(data);

    for (const frame of frames) {
      // Zustand aktualisieren und Events erkennen
      const events = this.stateManager.update(frame);

      // Mapping anwenden
      const hidOutput = this.mappingEngine.process(events, frame);

      // Output generieren und an Arduino senden
      const outputFrame = this.outputGenerator.generate(hidOutput);
      // Serialisiert: wenn mehrere <FRAME>-Zeilen in einem Schwung eintreffen (z.B. weil der
      // ReadlineParser mehrere Zeilen auf einmal emittiert), duerfen sich NIE zwei port.write()
      // ueberlappen, bevor der erste abgeschlossen ist -- das hat unter Windows zu den ständigen
      // Verbindungsabbruechen gefuehrt. Da ein OUT-Frame ohnehin nur den aktuellen Zustand
      // beschreibt (kein diskretes Ereignis), ist es unbedenklich, einen Sendevorgang zu
      // ueberspringen, wenn der vorherige noch laeuft -- der naechste (~20ms später) traegt den
      // aktuellen Stand ohnehin nach.
      if (!this.sendInFlight) {
        this.sendInFlight = true;
        this.serial.send(outputFrame)
          .catch(() => { /* Verbindung ist eh im Auto-Reconnect, nichts zu tun */ })
          .finally(() => { this.sendInFlight = false; });
      }

      // Zustand an Web-Clients senden (gedrosselt)
      this.emitStateUpdate(frame, events, hidOutput);
    }
  }

  /**
   * Sendet Zustandsupdate an Web-Clients (mit Drosselung)
   */
  emitStateUpdate(frame, events, hidOutput) {
    // Nur jedes 5. Frame senden um Bandbreite zu sparen (ca. 10-20 Hz)
    if (!this.updateCounter) this.updateCounter = 0;
    this.updateCounter++;

    // Immer (nicht gedrosselt) für die Debug-Route merken -- rein zur Fehlersuche ohne Browser
    // (s. GET /api/debug/last-state), zeigt exakt, was pro Frame roh ankommt und was rauskommt.
    this.lastFrameDebug = { buttons: frame.buttons, axes: frame.axes, events, output: hidOutput, timestamp: frame.timestamp };

    // Discrete Tastendruck-Ereignisse (buttonDown/Up) ZWISCHEN zwei gesendeten Frames sammeln statt
    // zu verwerfen -- stateManager.update() läuft auf JEDEM Rohframe und erkennt eine Flanke exakt
    // dort, wo sie passiert; die Drosselung unten sendet aber nur jeden 5. Frame. Ohne Sammeln ging
    // ein kurzer Tastendruck verloren, sobald seine Flanke auf einen der 4 übersprungenen Frames fiel
    // -- reproduzierte sich als "mal erkennt er die Taste, mal nicht" bei der (inzwischen ausgebauten) Widget-
    // Tastenzuordnung (Hendriks Fehlerbericht 13.08.2026). Tasten-Test und Modulansicht hören weiter auf
    // `events.buttonDown` aus genau diesem gedrosselten Socket-Event.
    if (!this.accumulatedButtonDown) this.accumulatedButtonDown = new Set();
    if (!this.accumulatedButtonUp) this.accumulatedButtonUp = new Set();
    events.buttonDown.forEach(i => this.accumulatedButtonDown.add(i));
    events.buttonUp.forEach(i => this.accumulatedButtonUp.add(i));

    if (this.updateCounter % 5 === 0) {
      this.io.emit('state-update', {
        buttons: frame.buttons,
        axes: frame.axes,
        events: {
          ...events,
          buttonDown: [...this.accumulatedButtonDown],
          buttonUp: [...this.accumulatedButtonUp]
        },
        output: hidOutput,
        timestamp: frame.timestamp
      });
      this.accumulatedButtonDown.clear();
      this.accumulatedButtonUp.clear();
    }
  }

  // Spielstand aus der Karte (Mod 0.5) → passenden Planer-Satz laden bzw. anlegen; Tablets bekommen 'planer-changed'
  // Danach die Früchte des Spiels (Mod 0.7.4) an den Satz: Fruchtauswahl im Planer und Abgleich über interne Namen
  applySavegame(map) {
    if (!this.plannerStore) return;
    const satz = map?.savegame ? this.plannerStore.onSavegame(map.savegame, map.name) : Promise.resolve(false);
    satz.then(async changed => (await this.plannerStore.setFruechte(map?.fruits)) || changed)
      .then(changed => { if (changed) this.io.emit('planer-changed', this.plannerStore.summary()); })
      .catch(e => console.warn('Planer-Satz:', e.message));
  }

  // Werte der Kategorie „ControlHub“ in der Werteliste (public/js/werteliste.js)
  hubContext() {
    const state = this.stateManager.getCurrentState();
    const layer = (slotId) => (state ? this.mappingEngine.getCurrentCraftSlotLayer(slotId, state) : 1);
    const macro = this.macroEngine.getStatus();
    return {
      profile: this.profileManager.currentProfileName,
      macro: macro.active ? (macro.macroName || macro.macroId) : null,
      layers: { craftslot1: layer('craftslot1'), craftslot2: layer('craftslot2') },
      tripKm: Math.round((this.tripMeters || 0)) / 1000
    };
  }

  // Kurzfassung des Arbeitsplaners für die Werteliste (public/js/plannerLogic.js summary()). Die Mod misst die Felder
  // nur, solange ein Tablet den Planer zeigt ('planner-active') -- sonst wären die Werte veraltet, also unbekannt.
  plannerContext(data) {
    const plan = this.telemetryReader?.cachedPlan;
    if (!plan || Date.now() - this.plannerWantedAt > 30000) return null;
    try { return globalThis.PlannerLogic.summary(plan, data.units, this.plannerStore?.current); } catch { return null; }
  }

  // Strecke seit dem letzten Zurücksetzen (ControlHub-Aktion „strecke:reset“); Sprünge > 50 m (Fahrzeugwechsel,
  // Teleport) zählen nicht
  countTrip(data) {
    const x = data.posX, z = data.posZ;
    if (typeof x !== 'number' || typeof z !== 'number' || (x === 0 && z === 0)) { this.tripLast = null; return; }
    if (this.tripLast && data.speed >= 1) {
      const step = Math.hypot(x - this.tripLast.x, z - this.tripLast.z);
      if (step < 50) this.tripMeters = (this.tripMeters || 0) + step;
    }
    this.tripLast = { x, z };
  }

  // ControlHub-Aktionen von Tasten der Armlehne oder des Bedienpanels (Paket J, s. mappingEngine
  // runHubItems()): wirken nur in ControlHub. Kachelseiten wechseln die Tablets selbst (tiles.js).
  runHubAction(cmd) {
    if (cmd.startsWith('profile:')) {
      const name = cmd.slice('profile:'.length);
      if (name !== this.profileManager.currentProfileName) this.applyProfileSwitch(name);
    } else if (cmd === 'tiles:next' || cmd === 'tiles:prev') {
      this.io.emit('tiles-command', { cmd: cmd.slice('tiles:'.length) });
    } else if (cmd.startsWith('tiles:show:')) {
      this.io.emit('tiles-command', { cmd: 'show', pageId: cmd.slice('tiles:show:'.length) });
    } else if (cmd === 'strecke:reset') {
      this.tripMeters = 0;
    } else if (cmd === 'gps:automatik') {
      // Vorgewendeautomatik an/aus per Taste (Hendrik 24.10.2026)
      this.gpsManager?.toggleAutomatik().then(an => {
        this.io.emit('gps-changed', this.gpsManager.summary());
        this.io.emit('hub-hinweis', { text: an ? 'Vorgewendeautomatik an' : 'Vorgewendeautomatik aus' });
      }).catch(e => this.logOnce('Vorgewendeautomatik', e));
    } else if (cmd === 'gps:ton') {
      // Vorgewende-Ton an/aus per Taste (Test 23.10.2026, Anmerkung 15)
      this.gpsManager?.toggleBeep().then(beep => {
        this.io.emit('gps-changed', this.gpsManager.summary());
        this.io.emit('karte-einstellungen', this.karteStand?.());
        this.io.emit('hub-hinweis', { text: beep === 'aus' ? 'Vorgewende-Ton aus' : 'Vorgewende-Ton an' });
      }).catch(e => this.logOnce('Vorgewende-Ton', e));
    }
  }

  // Gemeinsamer Wechsel-Ablauf für manuellen ('switch-profile') UND automatischen Profilwechsel
  // (evaluateAutoSwitch()/'auto-switch-resolve') -- keine Logik doppelt.
  applyProfileSwitch(name) {
    const success = this.profileManager.switchProfile(name);
    if (success) {
      this.mappingEngine.loadProfile(this.profileManager.getCurrentProfile());
      this.io.emit('profileChanged', { name });
    }
    return success;
  }

  // Automatischer Profilwechsel je nach Fahrzeug/Anbaugerät (Hendriks Wunsch) -- bei jedem
  // Telemetrie-Tick (alle 250ms, s. Konstruktor) aufgerufen. Reine Entscheidung kommt aus
  // autoSwitchManager.resolve(), hier nur die Auswertung: tatsächlich wechseln bzw. eine Meldung an
  // die Clients schicken. lastPromptedComboKey verhindert, dieselbe unentschiedene Kombination bei
  // jedem Tick erneut abzufragen (s. autoSwitchManager.js).
  evaluateAutoSwitch(data) {
    if (!this.autoSwitchManager.enabled || !data.available || !data.inVehicle) {
      this.autoSwitchManager.lastPromptedComboKey = null;
      return;
    }
    const result = this.autoSwitchManager.resolve(data.vehicleName, data.implementNames, this.profileManager.profiles);

    if (result.action === 'switch') {
      this.autoSwitchManager.lastPromptedComboKey = null;
      if (result.profileName !== this.profileManager.currentProfileName) {
        this.applyProfileSwitch(result.profileName);
        if (result.viaPreference) {
          this.io.emit('auto-switch-applied', {
            comboKey: result.comboKey,
            profileName: result.profileName,
            vehicleName: data.vehicleName,
            implementNames: data.implementNames,
            candidates: result.candidates
          });
        }
      }
      return;
    }

    if (result.action === 'ask') {
      if (result.comboKey !== this.autoSwitchManager.lastPromptedComboKey) {
        this.autoSwitchManager.lastPromptedComboKey = result.comboKey;
        this.io.emit('auto-switch-prompt', {
          comboKey: result.comboKey,
          vehicleName: data.vehicleName,
          implementNames: data.implementNames,
          candidates: result.candidates
        });
      }
      return;
    }

    // action === 'none'
    this.autoSwitchManager.lastPromptedComboKey = null;
  }

  /**
   * Startet den Server
   */
  /**
   * Belegt den Gamepad-Modus (Profil "default") als reines BasicGamepad-Durchreichen (jede physische Taste
   * -> die gleichnamige Gamepad-Taste, s. FunctionsManager.ensureBuiltinFunctions()), damit sich der
   * Controller mit verbundenem ControlHub im Gamepad-Modus genauso verhält wie im Offline-Fallback.
   * Seit 24.10.2026 schreibgeschützt (profileManager.js GAMEPAD_MODUS): bei jedem Laden genau diese Belegung,
   * auch wenn eine Datei oder eine ältere Version etwas anderes enthält (vorher nur, solange das Profil leer war).
   * Achsen-Reihenfolge verifiziert aus der Firmware runController(): im Offline-Fallback mappt
   * physischer Index 1:1 auf den Ausgabe-Platz (0-7); Poti/Fingertip (8-12) bekommen dort ebenfalls
   * keinen Platz (liefen nur über das inzwischen deaktivierte zweite Gamepad-Gerät).
   */
  async ensureDefaultProfileIsBasicGamepad() {
    const profile = this.profileManager.profiles?.default;
    if (!profile) return;
    const buttons = {};
    for (let i = 0; i < MAIN_BUTTON_COUNT; i++) {
      if (ALL_RESERVED_GAMEPAD_BUTTONS.includes(i)) continue; // s. craftSlotLayerManager.js
      buttons[i] = `func-basicgamepad-${i + 1}`;
    }
    const axes = {};
    for (let physicalIndex = 0; physicalIndex <= 7; physicalIndex++) {
      axes[physicalIndex] = { type: 'gamepad', axisId: physicalIndex, invert: false, deadzone: 500 };
    }
    const soll = { name: 'default', description: 'Standard-Mapping-Profil', buttons, axes };
    if (JSON.stringify(profile) === JSON.stringify(soll)) return;
    await this.profileManager.setProfile('default', soll, { intern: true });
    console.log('Gamepad-Modus auf seine feste Belegung gesetzt (jede Taste eine Gamepad-Taste, Achsen durchgereicht)');
  }

  async start() {
    try {
      // Datenordner (Update-Weg, 23.10.2026, server/datenOrdner.js): Daten einer älteren Version aus dem Programmordner
      // einmal herüberkopieren, bei einer neuen Installation die Vorgaben (Tastenlage, Modulbilder) anlegen
      const daten = await datenOrdnerVorbereiten({ configDir: CONFIG_DIR, assetsDir: ASSETS_DIR, altConfigDir: ALT_CONFIG_DIR,
        altAssetsDir: ALT_ASSETS_DIR, vorgabenDir: VORGABEN_DIR });
      if (daten.aktion === 'umgezogen') console.log(`Daten aus dem Programmordner in den Datenordner kopiert (${daten.dateien} Dateien): ${DATA_DIR}`);
      else if (daten.aktion === 'neu') console.log(`Neuer Datenordner: ${DATA_DIR}`);
      if (daten.ergaenzt) console.log(`Fehlende Vorgaben ergänzt (${daten.ergaenzt} Dateien, z. B. Modulbilder)`);

      // App-Einstellungen (Telemetrie-Rate, aktives Spiel) und einmaliger Umzug der Spieldaten nach
      // config/games/fs25/ (Phase 2, s. gameManager.js migrate())
      await this.loadAppSettings();

      // Andere Version als beim letzten Start: vorher alles sichern -- Rückweg nach einem Update (23.10.2026)
      const vorigeVersion = this.appSettings.version;
      if (vorigeVersion !== VERSION) {
        if (this.appSettingsGeladen) {
          const ziel = await sichereDaten(CONFIG_DIR, `vor-${VERSION}`);
          console.log(`Version ${VERSION} (vorher ${vorigeVersion || 'unbekannt'}): Daten gesichert in ${ziel}`);
        }
        this.appSettings.version = VERSION;
        await this.saveAppSettings();
      }
      const migration = await this.gameManager.migrate();
      if (migration.migrated) {
        console.log(`Spieldaten nach games/fs25/ umgezogen (${migration.moved.join(', ')}); Sicherung: ${migration.backupDir}`);
      }
      // Belegung je Controller (G2, 23.10.2026): bisherige Profile & Co. gehören der CraftConsole
      for (const m of await this.gameManager.migrateControllers()) {
        console.log(`Belegung von ${m.game} nach controller/craftconsole/ umgezogen (${m.moved.join(', ')}); Sicherung: ${m.backupDir}`);
      }

      // Welcher Controller zuletzt dran war (seine Module/Achsen; ab Paket G2 auch seine Belegung)
      await this.controllerManager.initialize();

      // Einrichtungs-Assistent (23.10.2026): beim ersten Start dieser Version festhalten, ob die Installation schon
      // besteht (dann kein Assistent, der bisherige Controller gilt als eingerichtet) oder frisch ist
      // Bestehend = Spiel gewählt oder Daten einer älteren Version (aus dem Programmordner kopiert, app.json schon
      // vorhanden oder gerade nach games/ umgezogen); dann gilt auch das aktive Spiel als gewählt
      const bestehend = daten.aktion === 'umgezogen' || !!this.appSettingsGeladen || !!migration.migrated;
      if (initEinrichtung(this.appSettings, { spielGewaehlt: this.gameManager.chosen, bestehend })) {
        if (this.appSettings.einrichtung.fertig && !this.gameManager.chosen) this.gameManager.markChosen();
        await this.saveAppSettings();
      }
      if (this.controllerManager.state.eingerichtet === null) {
        const jetzt = new Date().toISOString();
        const bekannt = this.appSettings.einrichtung.fertig ? [this.controllerManager.activeId, ...Object.keys(this.controllerManager.state.info)] : [];
        this.controllerManager.state.eingerichtet = Object.fromEntries(bekannt.map(id => [id, jetzt]));
        await this.controllerManager.save();
      }

      // Spielabhängige Daten (Profile, Funktionen, Makros, Bedienpanel, Auto-Wechsel, Ebenentaster)
      await this.loadGameData(this.gameManager.activeId);

      // Für alle Spiele gemeinsam: Kalibrierung, Tastenlage der Module, Widgets
      await this.calibrationManager.initialize();
      await this.moduleLayoutManager.initialize();
      this.mappingEngine.setCalibrationManager(this.calibrationManager);
      this.mappingEngine.setAxisAssignmentConfig({
        mode: this.calibrationManager.getAssignmentMode(),
        globalAxes: this.calibrationManager.getGlobalAxes()
      });

      // Serielle Daten-Handler registrieren
      this.serial.onData((data) => this.handleSerialData(data));

      // Verbindungsstatus an ALLE Browser-Clients senden, sobald er sich ändert -- auch bei einem
      // unerwarteten Abstecken/Reconnect (nicht nur nach einem Klick auf Verbinden/Trennen), damit
      // die Status-Anzeige im Webinterface verlässlich ist. Bei jedem neuen Verbinden einmal erkennen, welcher
      // Controller es ist (Geräteprofile, 23.10.2026).
      let wasConnected = false;
      this.serial.onStatusChange(() => {
        const status = this.serial.getStatus();
        this.io.emit('serialStatus', status);
        if (status.connected && !wasConnected) this.diagnose.ereignis('VERBUNDEN', `Controller an ${status.port || 'unbekanntem Anschluss'}`);
        if (!status.connected && wasConnected) this.diagnose.ereignis('GETRENNT', 'Verbindung zum Controller getrennt');
        if (!status.connected) this.einrichtungsVorschlag = null;   // Frage „einrichten?“ gilt nur für den verbundenen
        if (status.connected && !wasConnected) {
          clearTimeout(this.detectTimer);
          this.detectTimer = setTimeout(() => this.detectController().catch(e => this.logOnce('Geräteerkennung', e))
            .then(() => this.diagnoseBeimVerbinden()).catch(e => this.logOnce('Diagnose', e)), 400);
        }
        wasConnected = status.connected;
      });

      // Neustart-Gedächtnis (25.08.2026, Hendriks Wunsch): zuletzt verbundenen Port laden und
      // automatisch erneut versuchen -- ohne das müsste nach jedem Server-/Pi-Neustart von Hand neu
      // verbunden werden.
      await this.serial.initialize();
      this.serial.reconnectToLastPort();

      // Telemetrie des aktiven Spiels: pollt unabhängig vom Geräte-Link (Daten kommen aus dem Spiel)
      this.telemetryReader.setRate(this.appSettings.telemetry.rate);
      this.applyTelemetrySource();
      this.updateModSettings();
      // Alle 10 s: Lebenszeichen für die Mod (B6) -- schreibt die Datei dadurch jedes Mal neu, auch wenn der
      // Spielordner beim Start noch fehlte
      setInterval(() => this.updateModSettings(true), 10000);

      // HTTP-Server starten
      this.httpServer.listen(this.port, () => {
        this.printStartupBanner();
        this.diagnose.ereignis('START', `ControlHub ${VERSION} gestartet (${process.platform}, Node ${process.version})`);
      });
    } catch (error) {
      console.error('Fehler beim Starten des Servers:', error);
      process.exit(1);
    }
  }

  /**
   * Zeigt ein schönes Startup-Banner in der Konsole
   */
  printStartupBanner() {
    const localIP = this.getLocalIP();
    const version = VERSION;   // aus package.json (server/paths.js)

    // Console leeren (funktioniert auf Windows)
    console.clear();

    console.log('');
    console.log('  ╔══════════════════════════════════════════════════════════════╗');
    console.log('  ║                                                              ║');
    console.log('  ║                      🎮  CONTROLHUB  🎮                      ║');
    console.log('  ║                                                              ║');
    console.log(`  ║       Version: ${version.padEnd(46)}║`);
    console.log('  ║                                                              ║');
    console.log('  ╠══════════════════════════════════════════════════════════════╣');
    console.log('  ║                                                              ║');
    console.log('  ║   STATUS:  ✅ Server läuft                                   ║');
    console.log('  ║                                                              ║');
    console.log('  ╠══════════════════════════════════════════════════════════════╣');
    console.log('  ║                                                              ║');
    console.log('  ║   WEB-INTERFACE ERREICHBAR UNTER:                            ║');
    console.log('  ║                                                              ║');
    console.log(`  ║   Lokal:     http://localhost:${this.port}                          ║`);
    console.log(`  ║   Netzwerk:  http://${localIP.padEnd(15)}:${this.port}                    ║`);
    console.log('  ║                                                              ║');
    console.log('  ╠══════════════════════════════════════════════════════════════╣');
    console.log('  ║                                                              ║');
    console.log('  ║   📱 Öffne die Adresse in deinem Browser                     ║');
    console.log('  ║      (auch von Tablet/Smartphone im gleichen Netzwerk)       ║');
    console.log('  ║                                                              ║');
    console.log('  ║   ⚠️  Dieses Fenster NICHT schließen!                        ║');
    console.log('  ║      Der Server läuft solange dieses Fenster offen ist.      ║');
    console.log('  ║                                                              ║');
    console.log('  ╚══════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`  Deine Daten liegen in: ${DATA_DIR}`);
    console.log('');
    console.log('  Drücke Strg+C zum Beenden...');
    console.log('');
  }

  // Adressen fürs Tablet (Einrichtungs-Assistent): alle IPv4-Adressen im Netz, z. B. http://192.168.178.20:3000
  lanAdressen() {
    const out = [];
    for (const list of Object.values(networkInterfaces())) {
      for (const net of list || []) if (net.family === 'IPv4' && !net.internal) out.push(`http://${net.address}:${this.port}`);
    }
    return out;
  }

  /**
   * Ermittelt die lokale IP-Adresse
   */
  getLocalIP() {
    const nets = networkInterfaces();

    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
    return 'localhost';
  }
}

// Unbehandelte Fehler in asynchronem Code beenden Node sonst (ab v15) -- dann wäre die Armlehne ohne Belegung.
// Lieber laut loggen und weiterlaufen (23.10.2026).
// Seit 25.10.2026 auch im Diagnose-Log (server/diagnose.js).
process.on('unhandledRejection', (reason) => {
  console.error('Unbehandelter Fehler (async):', reason?.stack || reason);
  try { server.diagnose.ereignis('FEHLER', `Unbehandelter Fehler: ${reason?.stack || reason}`); } catch { /* noch vor dem Start */ }
});

// Server starten
const server = new ControllerServer(3000);
server.start();
