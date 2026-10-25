/**
 * Diagnose (Hendrik 25.10.2026: „Hatten wir nicht auch irgendetwas wie ein Diagnose-Log-System eingebaut? … auch wenn
 * bei Kunden später mal was schiefläuft … dass die Firmware auch sendet, was in ihrem Watchdog passiert ist, wenn sie
 * abstürzt, und generell immer mal ein Statusupdate beim Verbinden“).
 *
 * - Ereignis-Log: eine Datei je Tag im Ordner logs des Datenordners (diagnose-JJJJ-MM-TT.log, 30 Tage), Zeilen
 *   „[Uhrzeit] ART Text“. Arten: START, VERBUNDEN, GETRENNT, ARMLEHNE (Stand und Log der Firmware), WARNUNG, FEHLER.
 * - Armlehne: beim Verbinden einmal STAT (ab Firmware 2.15) und DIAG, sonst nur auf Knopfdruck und für die Diagnosedatei.
 *   Den Grund eines Neustarts merkt sich die Armlehne selbst; danach verbindet sie sich neu, und die Abfrage zeigt ihn
 *   (watchdog/absturz) bzw. dass ihre Laufzeit zurückgesprungen ist.
 * - Diagnosedatei: alles für die Fehlersuche in einer JSON-Datei (Versionen, Armlehne, Spieldaten, letzte Ereignisse,
 *   serieller Mitschnitt von heute) -- ohne Pfade, Funktionen, Profile, Spielstandnamen oder andere persönliche Inhalte.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

const TAGE = 30;
// Ortszeit für Dateinamen und Zeilen (Fehlersuche mit dem, was der Nutzer auf der Uhr sah)
const zwei = n => String(n).padStart(2, '0');
const lokalDatum = (t = new Date()) => `${t.getFullYear()}-${zwei(t.getMonth() + 1)}-${zwei(t.getDate())}`;
const lokalZeit = (t = new Date()) => `${lokalDatum(t)} ${zwei(t.getHours())}:${zwei(t.getMinutes())}:${zwei(t.getSeconds())}`;
// Gründe des letzten Neustarts der Armlehne (Firmware 2.15 STAT grund=…)
export const NEUSTART_GRUND = {
  strom: 'Einschalten bzw. Strom weg',
  reset: 'Reset-Taste',
  watchdog: 'Watchdog: das Programm hing über 4 Sekunden',
  absturz: 'Absturz der Firmware',
  software: 'Neustart per Software (z. B. nach dem Aufspielen)',
  unbekannt: 'unbekannt'
};
// Stelle in der Hauptschleife der Firmware, an der sie zuletzt war (Phase-Marker)
const PHASE = { 1: 'vor dem Lesen der seriellen Daten', 2: 'vor dem Auswerten der Module', 3: 'CraftSlots', 4: 'Fingertips',
  5: 'CraftPads/CraftDeck', 6: 'vor dem Senden an ControlHub', 7: 'nach dem Senden an ControlHub', 8: 'vor dem USB-Bericht an den PC',
  11: 'USB-Bericht fertig' };

/** „STAT fw=2.15 up=12 grund=watchdog …“ → { fw: '2.15', up: 12, grund: 'watchdog', … }; null, wenn es keine STAT-Zeile ist */
export function leseStat(zeile) {
  if (typeof zeile !== 'string' || !zeile.startsWith('STAT ')) return null;
  const out = {};
  for (const teil of zeile.slice(5).trim().split(/\s+/)) {
    const i = teil.indexOf('=');
    if (i <= 0) continue;
    const k = teil.slice(0, i), v = teil.slice(i + 1);
    out[k] = /^-?\d+$/.test(v) ? Number(v) : v;
  }
  return out;
}

/** Klartext zum Neustart aus einer STAT-Antwort */
export function neustartText(stat) {
  if (!stat) return null;
  const grund = NEUSTART_GRUND[stat.grund] || stat.grund || 'unbekannt';
  const davor = stat.vorlief || stat.vorphase
    ? ` · lief davor ${stat.vorlief} s, zuletzt ${PHASE[stat.vorphase] || `Phase ${stat.vorphase}`}${stat.vorrunde ? `, letzte Runde ${Math.round(stat.vorrunde / 1000)} ms` : ''}`
    : '';
  return grund + davor;
}

/** Ungewöhnlich? Watchdog oder Absturz, ungültige Einstellungen, I²C-Fehler, verworfene Nachrichten, lange Runden */
export function auffaellig(stat, vorher = null) {
  if (!stat) return [];
  const a = [];
  if (stat.grund === 'watchdog' || stat.grund === 'absturz') a.push(`Letzter Neustart: ${neustartText(stat)}`);
  if (stat.cfgfix > 0) a.push(`${stat.cfgfix} ungültige Einstellungen beim Start auf Standard gesetzt`);
  if (stat.i2c > (vorher?.i2c ?? 0)) a.push(`I²C-Fehler: ${stat.i2c}${vorher ? ` (+${stat.i2c - (vorher.i2c || 0)})` : ''}`);
  if (stat.outfehl > (vorher?.outfehl ?? 0)) a.push(`Verworfene Nachrichten von ControlHub: ${stat.outfehl}`);
  if (stat.zulang > (vorher?.zulang ?? 0)) a.push(`Zu lange Zeilen: ${stat.zulang}`);
  if (stat.loop > 100000) a.push(`Langsame Runde: ${Math.round(stat.loop / 1000)} ms`);
  return a;
}

export class Diagnose {
  constructor(logDir) {
    this.logDir = logDir;
    this.stream = null;
    this.datum = null;
    this.letzte = [];          // die letzten Einträge im Speicher, für die Anzeige
    this.armlehne = null;      // letzte STAT-Antwort (gelesen)
    this.diag = [];            // letztes DIAG der Armlehne
  }

  _datei() {
    const datum = lokalDatum();
    if (datum === this.datum && this.stream) return;
    this.datum = datum;
    try { this.stream?.end(); } catch { /* egal */ }
    this.stream = null;
    try {
      fs.mkdirSync(this.logDir, { recursive: true });
      this.stream = fs.createWriteStream(path.join(this.logDir, `diagnose-${datum}.log`), { flags: 'a' });
      this.stream.on('error', () => { this.stream = null; });
      this._aufraeumen();
    } catch {
      this.stream = null;   // ohne Log weiter, nie den Server stören
    }
  }

  _aufraeumen() {
    const grenze = Date.now() - TAGE * 24 * 3600 * 1000;
    fs.readdir(this.logDir, (err, files) => {
      if (err) return;
      for (const f of files) {
        const m = /^diagnose-(\d{4}-\d{2}-\d{2})\.log$/.exec(f);
        if (m && Date.parse(m[1]) < grenze) fs.unlink(path.join(this.logDir, f), () => {});
      }
    });
  }

  /** Ein Ereignis festhalten. art: START | VERBUNDEN | GETRENNT | ARMLEHNE | WARNUNG | FEHLER | INFO */
  ereignis(art, text) {
    const jetzt = new Date(), zeit = jetzt.toISOString();
    const eintrag = { zeit, art, text: String(text ?? '').replace(/[\r\n]+/g, ' ').slice(0, 500) };
    this.letzte.push(eintrag);
    if (this.letzte.length > 200) this.letzte.shift();
    try {
      this._datei();
      this.stream?.write(`[${lokalZeit(jetzt)}] ${art} ${eintrag.text}\n`);
    } catch { /* nur Hilfe zur Fehlersuche */ }
    return eintrag;
  }

  /** Antwort auf STAT verarbeiten: merken und Auffälliges ins Log; beim Verbinden immer eine Zeile */
  stat(stat, { beimVerbinden = false } = {}) {
    if (!stat) return;
    const vorher = this.armlehne;
    if (vorher && stat.up < vorher.up) this.ereignis('WARNUNG', `Armlehne hat neu gestartet: ${neustartText(stat)}`);
    if (beimVerbinden) {
      this.ereignis('ARMLEHNE', `Firmware ${stat.fw}, läuft seit ${stat.up} s, letzter Neustart: ${neustartText(stat)}, Module 0x${String(stat.module ?? '').replace(/^0x/, '')}`);
    }
    for (const a of auffaellig(stat, beimVerbinden ? null : vorher)) {
      if (beimVerbinden || !a.startsWith('Letzter Neustart')) this.ereignis('WARNUNG', `Armlehne: ${a}`);
    }
    this.armlehne = stat;
  }

  /** DIAG-Zeilen der Armlehne (Ereignis-Log aus ihrem Speicher) einmal je Verbindung festhalten */
  diagZeilen(zeilen) {
    this.diag = Array.isArray(zeilen) ? zeilen : [];
    for (const z of this.diag) this.ereignis('ARMLEHNE', `Log: ${z}`);
  }

  /** Letzte Einträge aus den Dateien (neueste zuletzt), für die Diagnosedatei */
  dateiZeilen(tage = 7, maxZeilen = 2000) {
    const zeilen = [];
    try {
      const files = fs.readdirSync(this.logDir).filter(f => /^diagnose-\d{4}-\d{2}-\d{2}\.log$/.test(f)).sort().slice(-tage);
      for (const f of files) zeilen.push(...fs.readFileSync(path.join(this.logDir, f), 'utf8').split('\n').filter(Boolean));
    } catch { /* keine Dateien */ }
    return zeilen.slice(-maxZeilen);
  }

  seriellHeute(maxZeilen = 400) {
    try {
      const f = path.join(this.logDir, `serial-${new Date().toISOString().slice(0, 10)}.log`);
      return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).slice(-maxZeilen);
    } catch { return []; }
  }

  /**
   * Diagnosedatei: was für die Fehlersuche nötig ist, ohne persönliche Inhalte
   * @param {object} kontext { version, spiel, controller, verbunden, firmware, einstellungen (GETALL), status (DET), gedrueckt,
   *   spieldaten (Stand, Mod-Ordner ohne Pfad, Rate, Mehrspieler, Karte, Spielstand-Nr., eigener Hof) }
   */
  paket(kontext = {}) {
    return {
      controlhubDiagnose: 1,
      erstellt: new Date().toISOString(),
      controlhub: { version: kontext.version || null, node: process.version, system: `${os.platform()} ${os.release()} ${os.arch()}` },
      spiel: kontext.spiel || null,
      controller: kontext.controller || null,
      verbunden: !!kontext.verbunden,
      spieldaten: kontext.spieldaten || null,
      armlehne: {
        stat: this.armlehne,
        neustart: neustartText(this.armlehne),
        log: this.diag,
        einstellungen: kontext.einstellungen || null,
        module: kontext.status || null,
        gedrueckt: kontext.gedrueckt || []
      },
      ereignisse: this.dateiZeilen(),
      seriell: this.seriellHeute()
    };
  }
}
