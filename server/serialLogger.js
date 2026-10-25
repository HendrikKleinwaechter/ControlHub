/**
 * Roher Mitschnitt des WebSerial-Konfig-Protokolls (GETALL/SET/CAL/STATUS + Antworten) in eine
 * Datei -- bewusst OHNE die 50-Hz-FRAME/OUT-Dauerstrecke (die würde die Datei in Sekunden fluten
 * und enthält für Fehlersuche an Modul-Erkennung/GETALL/etc. keine zusätzliche Information).
 * Ein File pro Tag, Millisekunden-Auflösung -- wichtig, um z.B. Lücken zwischen einzelnen
 * "DET ..."-Zeilen einer STATUS-Antwort sichtbar zu machen.
 */
import fs from 'fs';
import path from 'path';

export class SerialLogger {
  constructor(logDir) {
    this.logDir = logDir;
    this.stream = null;
    this.currentDate = null;
  }

  // Fehler beim Protokollieren dürfen den Server nie beenden (23.10.2026: z. B. Log-Ordner nicht beschreibbar, wenn
  // ControlHub unter „Programme“ liegt) -- dann eben ohne Mitschnitt. Mitschnitte älter als 14 Tage werden gelöscht.
  _ensureStream() {
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    if (date !== this.currentDate) {
      this.currentDate = date;
      try { this.stream?.end(); } catch { /* egal */ }
      this.stream = null;
      try {
        fs.mkdirSync(this.logDir, { recursive: true });
        this.stream = fs.createWriteStream(path.join(this.logDir, `serial-${date}.log`), { flags: 'a' });
        this.stream.on('error', () => { this.stream = null; });
        this._cleanup();
      } catch {
        this.stream = null;
      }
    }
  }

  _cleanup() {
    const limit = Date.now() - 14 * 24 * 3600 * 1000;
    fs.readdir(this.logDir, (err, files) => {
      if (err) return;
      for (const f of files) {
        const m = /^serial-(\d{4}-\d{2}-\d{2})\.log$/.exec(f);
        if (m && Date.parse(m[1]) < limit) fs.unlink(path.join(this.logDir, f), () => {});
      }
    });
  }

  log(direction, text) {
    try {
      this._ensureStream();
      if (!this.stream) return;
      const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
      this.stream.write(`[${ts}] ${direction} ${text}\n`);
    } catch { /* Mitschnitt ist nur Hilfe zur Fehlersuche */ }
  }
}
