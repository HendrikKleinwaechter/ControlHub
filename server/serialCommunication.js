/**
 * Serielle Kommunikation mit Arduino
 * Unterstützt Auto-Detection und Port-Management
 */

import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { readJsonFile, writeJsonAtomic } from './jsonStore.js';

export class SerialCommunication {
  constructor(configPath) {
    this.port = null;
    this.parser = null;
    this.isConnected = false;
    this.currentPortPath = null;
    this.onDataCallback = null;
    this.onStatusChangeCallback = null; // s. onStatusChange() -- feuert bei JEDER Verbindungsänderung,
    // nicht nur bei über die UI ausgelösten (Auto-Detect/Trennen-Button), damit ein unerwartetes
    // Abstecken/Reconnect auch ohne Klick sofort im Webinterface sichtbar wird.
    this.reconnectInterval = null;
    // Zuletzt erfolgreich verbundener Port (25.08.2026, Hendriks Wunsch "Neustart-Gedächtnis") --
    // persistiert auf Platte, damit ControllerServer.start() nach einem Server-/Pi-Neustart
    // automatisch wieder denselben Port probieren kann, s. initialize()/saveLastPort()/reconnectToLastPort().
    this.configPath = configPath;
    this.lastPort = null;
    // Schnappschuss der Port-Pfade beim Start des Ein-/Ausstecken-Assistenten, s. wizardBefore()/wizardAfter().
    this.wizardBeforePaths = null;
  }

  /** Lädt den zuletzt verbundenen Port von Platte (falls vorhanden) -- vor dem ersten Verbindungsversuch aufrufen. */
  async initialize() {
    try {
      // über jsonStore (23.10.2026): kaputte Datei als .defekt gesichert (notfalls .bak genommen)
      const { data } = await readJsonFile(this.configPath, { fallback: null });
      this.lastPort = data?.lastPort || null;
    } catch (error) {
      this.lastPort = null;
    }
  }

  async saveLastPort(portPath) {
    this.lastPort = portPath;
    try {
      await writeJsonAtomic(this.configPath, { lastPort: portPath }); // atomar + .bak (23.10.2026)
    } catch (error) {
      console.error('Fehler beim Speichern des zuletzt verbundenen Ports:', error);
    }
  }

  /**
   * Versucht beim Server-Start automatisch wieder den zuletzt verbundenen Port zu öffnen (25.08.2026)
   * -- nutzt bewusst denselben Retry-Mechanismus wie ein unerwarteter Verbindungsabbruch während des
   * Betriebs (handleDisconnect(), alle 3s erneuter Versuch), damit ein zu diesem Zeitpunkt noch nicht
   * bereites/verzögert bootendes Gerät nicht nach nur einem gescheiterten Versuch aufgegeben wird.
   */
  reconnectToLastPort() {
    if (!this.lastPort) return;
    this.currentPortPath = this.lastPort;
    this.handleDisconnect();
  }

  /**
   * Listet alle verfügbaren seriellen Ports auf
   * @returns {Promise<Array>} Liste der verfügbaren Ports
   */
  async listPorts() {
    try {
      const ports = await SerialPort.list();
      return ports.map(port => ({
        path: port.path,
        manufacturer: port.manufacturer || 'Unbekannt',
        serialNumber: port.serialNumber || '-',
        vendorId: port.vendorId,
        productId: port.productId,
        isArduino: this.isLikelyArduino(port)
      }));
    } catch (error) {
      console.error('Fehler beim Auflisten der Ports:', error);
      return [];
    }
  }

  /**
   * Prüft, ob ein Port wahrscheinlich ein Arduino ist
   * @param {Object} port - Port-Info
   * @returns {boolean} Wahrscheinlichkeit
   */
  isLikelyArduino(port) {
    const arduinoVendors = ['2341', '1A86', '0403', '10C4']; // Arduino, CH340, FTDI, CP2102
    const manufacturer = (port.manufacturer || '').toLowerCase();
    const vendorId = (port.vendorId || '').toUpperCase();
    const productId = (port.productId || '').toUpperCase();

    // Exakter VID:PID-Treffer für die eigenen Pico-Firmwares (USB_VID/USB_PID): CraftConsole = CC01,
    // CraftLink (Pico ohne CraftConsole bzw. mit einer CraftUnit, 23.10.2026) = CC02
    if (vendorId === '2E8A' && (productId === 'CC01' || productId === 'CC02')) return true;

    return (
      arduinoVendors.includes(port.vendorId) ||
      manufacturer.includes('arduino') ||
      manufacturer.includes('ch340') ||
      manufacturer.includes('ftdi') ||
      manufacturer.includes('silicon labs')
    );
  }

  /**
   * Ein-/Ausstecken-Assistent (25.08.2026, ersetzt das bisherige blinde "ersten Kennungs-Treffer
   * nehmen" -- Hendriks Wunsch): Schritt 1 merkt sich, welche Ports GERADE JETZT (Armlehne
   * ausgesteckt) vorhanden sind. Schritt 2 (wizardAfter, nach dem Einstecken) vergleicht erneut und
   * findet den neu hinzugekommenen Port -- funktioniert auch dann zuverlässig, wenn parallel schon
   * andere USB-Seriell-Geräte mit ähnlicher Chip-Kennung angeschlossen sind, weil nicht geraten,
   * sondern die tatsächliche Veränderung erkannt wird.
   * @returns {Promise<{count:number}>}
   */
  async wizardBefore() {
    const ports = await this.listPorts();
    this.wizardBeforePaths = new Set(ports.map(p => p.path));
    return { count: ports.length };
  }

  /**
   * Zweiter Schritt des Ein-/Ausstecken-Assistenten (nach dem Einstecken aufrufen). Vergleicht mit
   * dem Schnappschuss aus wizardBefore(): genau ein neuer Port -> das ist die Armlehne. Mehrere neue
   * Ports gleichzeitig (z.B. weil währenddessen noch etwas anderes angeschlossen wurde) -> per
   * Kennungsprüfung (isLikelyArduino) eingrenzen, dient hier nur als zusätzliche Absicherung, nicht
   * als primäres Kriterium.
   * @returns {Promise<{success:boolean, port?:string, reason?:string, candidates?:Array}>}
   */
  async wizardAfter() {
    const before = this.wizardBeforePaths || new Set();
    this.wizardBeforePaths = null;
    const ports = await this.listPorts();
    const newPorts = ports.filter(p => !before.has(p.path));

    if (newPorts.length === 0) return { success: false, reason: 'none' };
    if (newPorts.length === 1) return { success: true, port: newPorts[0].path };

    const likely = newPorts.filter(p => p.isArduino);
    if (likely.length === 1) return { success: true, port: likely[0].path };

    return { success: false, reason: 'ambiguous', candidates: newPorts };
  }

  /**
   * Verbindet mit einem seriellen Port
   * @param {string} portPath - Port-Pfad
   * @param {number} baudRate - Baudrate (Standard: 115200)
   * @returns {Promise<boolean>} Erfolg
   */
  async connect(portPath, baudRate = 115200) {
    if (this.isConnected) {
      await this.disconnect();
    }

    return new Promise((resolve, reject) => {
      this.port = new SerialPort({
        path: portPath,
        baudRate: baudRate,
        autoOpen: false
      });

      this.port.open((error) => {
        if (error) {
          console.error('Fehler beim Öffnen des Ports:', error);
          reject(error);
          return;
        }

        this.isConnected = true;
        this.currentPortPath = portPath;
        console.log(`Verbunden mit ${portPath} @ ${baudRate} baud`);
        this.saveLastPort(portPath);   // Neustart-Gedächtnis: bei jeder erfolgreichen Verbindung merken
        if (this.onStatusChangeCallback) this.onStatusChangeCallback();

        // Parser für zeilenbasierte Daten
        this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\n' }));

        this.parser.on('data', (data) => {
          if (this.onDataCallback) {
            this.onDataCallback(data);
          }
        });

        this.port.on('error', (err) => {
          console.error('Serieller Port Fehler:', err);
          this.handleDisconnect();
        });

        this.port.on('close', () => {
          console.log('Port geschlossen');
          this.handleDisconnect();
        });

        resolve(true);
      });
    });
  }

  /**
   * Behandelt Disconnect und startet Auto-Reconnect
   */
  handleDisconnect() {
    this.isConnected = false;
    if (this.onStatusChangeCallback) this.onStatusChangeCallback();

    // Auto-Reconnect alle 3 Sekunden
    if (!this.reconnectInterval) {
      console.log('Starte Auto-Reconnect...');
      this.reconnectInterval = setInterval(async () => {
        if (!this.isConnected && this.currentPortPath) {
          console.log(`Versuche Reconnect zu ${this.currentPortPath}...`);
          try {
            await this.connect(this.currentPortPath);
            if (this.isConnected) {
              clearInterval(this.reconnectInterval);
              this.reconnectInterval = null;
            }
          } catch (error) {
            // Ignoriere Fehler, versuche es weiter
          }
        }
      }, 3000);
    }
  }

  /**
   * Trennt die Verbindung
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }

    if (this.port && this.port.isOpen) {
      return new Promise((resolve) => {
        this.port.close(() => {
          this.isConnected = false;
          this.currentPortPath = null;
          console.log('Verbindung getrennt');
          if (this.onStatusChangeCallback) this.onStatusChangeCallback();
          resolve();
        });
      });
    }
    this.isConnected = false;
    this.currentPortPath = null;
  }

  /**
   * Sendet Daten an den Arduino
   * @param {string} data - Zu sendende Daten
   * @returns {Promise<boolean>} Erfolg
   */
  async send(data) {
    if (!this.isConnected || !this.port) {
      console.warn('Nicht verbunden, kann keine Daten senden');
      return false;
    }

    return new Promise((resolve, reject) => {
      this.port.write(data, (error) => {
        if (error) {
          console.error('Fehler beim Senden:', error);
          reject(error);
        } else {
          resolve(true);
        }
      });
    });
  }

  /**
   * Registriert Callback für eingehende Daten
   * @param {Function} callback - Callback-Funktion
   */
  onData(callback) {
    this.onDataCallback = callback;
  }

  /**
   * Registriert Callback für JEDE Verbindungsänderung (verbunden/getrennt/reconnected) --
   * unabhängig davon, ob sie über die UI oder unerwartet (Kabel raus, Port-Fehler) ausgelöst wurde.
   * @param {Function} callback - Callback-Funktion (ohne Argumente, Status per getStatus() abrufen)
   */
  onStatusChange(callback) {
    this.onStatusChangeCallback = callback;
  }

  /**
   * USB-Kennung des verbundenen Ports (für die Geräteerkennung, controllerManager.detect(), 23.10.2026)
   * @returns {Promise<{vendorId?: string, productId?: string, manufacturer?: string}|null>}
   */
  async getPortInfo() {
    if (!this.currentPortPath) return null;
    try {
      const ports = await SerialPort.list();
      const p = ports.find(x => x.path === this.currentPortPath);
      return p ? { vendorId: p.vendorId, productId: p.productId, manufacturer: p.manufacturer } : null;
    } catch {
      return null;
    }
  }

  /**
   * Gibt den aktuellen Verbindungsstatus zurück
   * @returns {Object} Status-Info
   */
  getStatus() {
    return {
      connected: this.isConnected,
      port: this.currentPortPath
    };
  }
}
