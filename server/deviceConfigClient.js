/**
 * Request/Response-Layer für das WebSerial-Konfig-Protokoll (GETALL/SET/CAL, siehe
 * Firmware/WebSerial-Konfig/PROTOKOLL.md) über die bestehende serielle Verbindung
 * (serialCommunication.js). Bisher sprach nur die eigenständige Controller-Konfig.html dieses
 * Protokoll -- ControlHub nutzt jetzt dieselbe, ohnehin offene FRAME/OUT-Verbindung mit, ohne den
 * Streaming-Betrieb zu stören (jede eingehende Zeile ohne <FRAME>-Tag geht an handleLine()).
 */
export class DeviceConfigClient {
  constructor(serialCommunication, logger = null) {
    this.serial = serialCommunication;
    this.logger = logger; // s. server/serialLogger.js -- optional, nur TX/Timing-Diagnose
    this.pending = null; // { type: 'getall'|'command', resolve, reject, timeoutHandle, buffer? }
    this.liveCalibrationCallback = null; // während einer laufenden CAL <gruppe> gesetzt
  }

  isPending() {
    return this.pending !== null;
  }

  handleLine(line) {
    // LIVE-Zeilen laufen unabhängig vom Pending-Mechanismus -- während eine Kalibrierung läuft,
    // ist normalerweise kein GETALL/SET/CAL-STOP gleichzeitig ausstehend.
    if (line.startsWith('LIVE ')) {
      if (this.liveCalibrationCallback) {
        const parts = line.split(' '); // LIVE key cur lo hi
        this.liveCalibrationCallback({ key: parts[1], current: +parts[2], lo: +parts[3], hi: +parts[4] });
      }
      return;
    }

    if (!this.pending) return;
    if (this.pending.type === 'getall') {
      if (line === 'END') {
        this._settle(this.pending.buffer);
      } else {
        const eq = line.indexOf('=');
        if (eq > 0) this.pending.buffer[line.slice(0, eq)] = line.slice(eq + 1);
      }
    } else if (this.pending.type === 'command') {
      if (line.startsWith('OK')) this._settle({ success: true });
      else if (line.startsWith('ERR')) this._settle({ success: false, error: line });
    } else if (this.pending.type === 'status') {
      if (line.startsWith('DET ')) this.pending.onDetLine(line);
    } else if (this.pending.type === 'stat') {
      // STAT (Firmware ab 2.15): eine Zeile; ältere antworten „ERR“ → null
      if (line.startsWith('STAT ')) this._settle(line);
      else if (line === 'ERR' || line.startsWith('ERR ')) this._settle(null);
    } else if (this.pending.type === 'diag') {
      if (line === 'DIAGEND') {
        this._settle(this.pending.lines);
      } else if (line.startsWith('DIAG ')) {
        this.pending.lines.push(line.slice('DIAG '.length));
      }
    }
  }

  _settle(value) {
    const { resolve, timeoutHandle } = this.pending;
    clearTimeout(timeoutHandle);
    this.pending = null;
    resolve(value);
  }

  _failPending(message) {
    if (!this.pending) return;
    const { reject, timeoutHandle } = this.pending;
    clearTimeout(timeoutHandle);
    this.pending = null;
    reject(new Error(message));
  }

  // Senden mit Fehlerbehandlung (23.10.2026): ein Schreibfehler (USB-Wackler) ließ das Versprechen aus _startRequest()
  // vorher ohne Abnehmer per Timeout ablehnen -- Node beendet den Prozess bei unbehandelten Ablehnungen.
  async _send(line) {
    try {
      const ok = await this.serial.send(line);
      if (!ok) this._failPending('Senden fehlgeschlagen (nicht verbunden)');
    } catch (error) {
      this._failPending('Senden fehlgeschlagen: ' + error.message);
    }
  }

  // Setzt this.pending SYNCHRON (vor jedem await) -- sonst könnten Antwortzeilen, die noch im
  // selben Tick eintreffen, verloren gehen, weil handleLine() sie ohne aktives Pending ignoriert.
  _startRequest(type, extra = {}) {
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pending = null;
        reject(new Error(`Timeout: Gerät antwortet nicht auf ${type.toUpperCase()}`));
      }, 2000);
      this.pending = { type, resolve, reject, timeoutHandle, ...extra };
    });
  }

  async _getAll() {
    if (this.pending) throw new Error('Es läuft bereits eine Konfig-Anfrage');
    const promise = this._startRequest('getall', { buffer: {} });
    this.logger?.log('TX', 'GETALL');
    await this._send('GETALL\n');
    return promise;
  }

  // Generischer Befehl mit "OK ..."/"ERR ..."-Antwort -- deckt SET sowie CAL STOP/ABORT/CENTER/RESET ab.
  async _sendCommand(line) {
    if (this.pending) throw new Error('Es läuft bereits eine Konfig-Anfrage');
    const promise = this._startRequest('command');
    this.logger?.log('TX', line);
    await this._send(`${line}\n`);
    return promise;
  }

  // Anfragen nacheinander statt „Es läuft bereits eine Konfig-Anfrage“ (23.10.2026: beim Seitenstart fragen
  // Geräte-Einstellungen, Armlehnen-Setup und Tastenbelegung gleichzeitig -- eine davon schlug sonst fehl).
  // Gleichzeitige GETALL teilen sich eine Antwort.
  _queued(fn) {
    const run = (this.chain || Promise.resolve()).then(fn, fn);
    this.chain = run.catch(() => {});
    return run;
  }
  getAll() {
    if (!this.getAllRunning) this.getAllRunning = this._queued(() => this._getAll()).finally(() => { this.getAllRunning = null; });
    return this.getAllRunning;
  }
  sendCommand(line) { return this._queued(() => this._sendCommand(line)); }
  getStatus() { return this._queued(() => this._getStatus()); }
  getDiag() { return this._queued(() => this._getDiag()); }
  getStat() { return this._queued(() => this._getStat()); }

  async set(key, value) {
    return this.sendCommand(`SET ${key} ${value}`);
  }

  // Piezo-Buzzer (GP15, s. CraftConsolePro_Pico.ino BEEP-Befehl) -- ms wird firmwareseitig auf
  // 1..5000 begrenzt, hier nur grob plausibilisiert.
  async beep(ms = 150) {
    const clamped = Math.max(1, Math.min(5000, Math.round(ms)));
    return this.sendCommand(`BEEP ${clamped}`);
  }

  // STATUS liefert (anders als GETALL) KEINE feste End-Zeile -- die Firmware schreibt einfach so viele
  // "DET <key> <0/1|hex>"-Zeilen wie sie Erkennungs-Flags hat und hört dann auf. Wir werten daher
  // "für 150ms keine weitere DET-Zeile mehr" als fertig (Idle-Fenster), statt auf einen Terminator zu warten.
  async _getStatus() {
    if (this.pending) throw new Error('Es läuft bereits eine Konfig-Anfrage');

    return new Promise(async (resolve, reject) => {
      const buffer = {};
      let idleTimer = null;
      const startedAt = Date.now();
      const elapsed = () => `${Date.now() - startedAt}ms`;

      const finish = () => {
        clearTimeout(idleTimer);
        clearTimeout(hardTimeout);
        this.pending = null;
        this.logger?.log('STATUS', `fertig nach ${elapsed()} -- ${Object.keys(buffer).length} Werte: ${JSON.stringify(buffer)}`);
        resolve(buffer);
      };

      // Absicherung: falls das Gerät gar nicht antwortet, nach 2s mit Fehler abbrechen (wie bei
      // GETALL/SET) -- kam wenigstens EINE DET-Zeile an, werten wir das stattdessen als "fertig".
      const hardTimeout = setTimeout(() => {
        if (Object.keys(buffer).length === 0) {
          this.pending = null;
          this.logger?.log('STATUS', `Timeout nach ${elapsed()} -- keine einzige DET-Zeile erhalten`);
          reject(new Error('Timeout: Gerät antwortet nicht auf STATUS'));
        } else {
          this.logger?.log('STATUS', `Hard-Timeout nach ${elapsed()} erreicht (Idle-Fenster lief nicht ab?)`);
          finish();
        }
      }, 2000);

      this.pending = {
        type: 'status',
        onDetLine: (line) => {
          this.logger?.log('RX-DET', `${line}  (+${elapsed()})`);
          const parts = line.split(' '); // DET <key> <value>
          if (parts.length >= 3) buffer[parts[1]] = parts[2];
          clearTimeout(idleTimer);
          idleTimer = setTimeout(finish, 150);
        }
      };

      this.logger?.log('TX', 'STATUS');
      let ok = false;
      try { ok = await this.serial.send('STATUS\n'); } catch { ok = false; }
      if (!ok) {
        clearTimeout(hardTimeout);
        this.pending = null;
        this.logger?.log('STATUS', 'Senden fehlgeschlagen (nicht verbunden)');
        reject(new Error('Senden fehlgeschlagen (nicht verbunden)'));
      }
    });
  }

  // DIAG liefert das RAM-Ereignis-Log der Firmware (u.a. die Boot-Zeile mit detMask() -- zeigt, welche
  // Module SCHON BEIM BOOT als erkannt galten, unabhaengig von einer spaeteren STATUS-Abfrage).
  async _getDiag() {
    if (this.pending) throw new Error('Es läuft bereits eine Konfig-Anfrage');
    const promise = this._startRequest('diag', { lines: [] });
    this.logger?.log('TX', 'DIAG');
    await this._send('DIAG\n');
    return promise;
  }

  // STAT (Diagnose, Firmware ab 2.15): Zustand in einer Zeile, ohne Modulsuche -- auch im laufenden Betrieb abfragbar
  async _getStat() {
    if (this.pending) throw new Error('Es läuft bereits eine Konfig-Anfrage');
    const promise = this._startRequest('stat');
    this.logger?.log('TX', 'STAT');
    await this._send('STAT\n');
    return promise;
  }

  // Startet eine Kalibrierungsgruppe (thumb/leverA/leverB/finger1-4/poti). Die Firmware schickt dafür
  // KEINE Bestätigungszeile, nur danach laufend "LIVE ..." -- deshalb kein Pending, nur Senden.
  async startLiveCalibration(group, onLiveUpdate) {
    this.liveCalibrationCallback = onLiveUpdate;
    return this.serial.send(`CAL ${group}\n`);
  }

  stopLiveCalibration() {
    this.liveCalibrationCallback = null;
  }
}
