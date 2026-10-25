/**
 * JSON-Dateien sicher lesen und schreiben (23.10.2026 -- Datenverlust beim Speichern behoben).
 *
 * Vorher schrieb jeder Manager direkt mit fs.writeFile: nicht atomar (Absturz/Stromausfall = halbe Datei),
 * gleichzeitige Speichervorgänge derselben Datei ungeordnet, und eine kaputte Datei wurde beim Start
 * mit Standardwerten stillschweigend überschrieben.
 *
 * writeJsonAtomic(file, data)
 *   - je Datei eine Warteschlange: Schreibvorgänge derselben Datei laufen nacheinander (letzter Aufruf gewinnt)
 *   - bisherige Fassung bleibt als <file>.bak liegen
 *   - erst nach <file>.tmp-<pid>-<n> schreiben, dann per rename ersetzen -- die Datei ist nie halb geschrieben
 *   - Windows (Virenscanner, Sync): rename bei EPERM/EBUSY/EACCES ein paar Mal neu versuchen, notfalls direkt schreiben
 *
 * readJsonFile(file, { fallback }) -> { data, status }
 *   'ok'       Datei gelesen
 *   'missing'  Datei fehlt -> fallback
 *   'restored' Datei kaputt -> als <name>.defekt-<JJJJMMTT-HHMMSS>.json gesichert, Inhalt aus <file>.bak
 *              (die .bak wird auch gleich wieder als <file> hingelegt)
 *   'broken'   Datei kaputt, keine lesbare .bak -> als .defekt gesichert, fallback
 *   Andere Lesefehler (Rechte, gesperrt) werden geworfen -- lieber laut scheitern als Standardwerte darüberschreiben.
 *
 * problems: gesammelte Lade-Probleme { file, status, at, defekt } -- für eine spätere Warnung in der Oberfläche.
 */
import fs from 'fs/promises';
import path from 'path';

const RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
const MAX_TRIES = 5;
const MAX_PROBLEMS = 100;

export const problems = [];

const queues = new Map();   // aufgelöster Pfad -> Ende der Warteschlange (lehnt nie ab)
let tmpCounter = 0;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Datei kurz von Virenscanner/Sync gesperrt (v. a. Windows): ein paar Mal mit kurzer Pause neu versuchen
async function withRetry(fn) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (error) {
      if (!RETRY_CODES.has(error.code) || i >= MAX_TRIES) throw error;
      await sleep(30 * i);
    }
  }
}

// Alle Zugriffe auf dieselbe Datei nacheinander; ein Fehler hält die Warteschlange nicht an
function enqueue(file, job) {
  const key = path.resolve(file);
  const run = (queues.get(key) || Promise.resolve()).then(job);
  const tail = run.catch(() => {});
  queues.set(key, tail);
  tail.then(() => { if (queues.get(key) === tail) queues.delete(key); });
  return run;
}

function parseJson(text) {
  return JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text); // BOM (z. B. Windows-Editor) stört nicht
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function note(file, status, defekt) {
  problems.push({ file, status, at: new Date().toISOString(), defekt });
  if (problems.length > MAX_PROBLEMS) problems.shift();
}

// Schreibt sofort (nur innerhalb der Warteschlange aufrufen)
async function writeTextNow(file, text, { backup = true } = {}) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  if (backup) {
    try { await fs.copyFile(file, `${file}.bak`); } catch { /* erste Fassung oder gesperrt -- egal */ }
  }
  const tmp = `${file}.tmp-${process.pid}-${++tmpCounter}`;
  try {
    const fh = await fs.open(tmp, 'w');
    try {
      await fh.writeFile(text, 'utf-8');
      await fh.sync().catch(() => {}); // wirklich auf der Platte, bevor umbenannt wird
    } finally {
      await fh.close();
    }
  } catch (error) {
    await fs.unlink(tmp).catch(() => {});
    throw error;
  }
  try {
    await withRetry(() => fs.rename(tmp, file));
  } catch (error) {
    if (!RETRY_CODES.has(error.code)) {
      await fs.unlink(tmp).catch(() => {});
      throw error;
    }
    // Notfall (Windows, Datei dauerhaft gesperrt): direkt schreiben -- die .bak ist schon gesichert
    console.warn(`[jsonStore] ${file}: Ersetzen nicht möglich (${error.code}), schreibe direkt`);
    try {
      await withRetry(() => fs.writeFile(file, text, 'utf-8'));
    } finally {
      await fs.unlink(tmp).catch(() => {});
    }
  }
}

// Kaputte Datei beiseitelegen (nicht löschen): <name>.defekt-<Zeit>.json; null, wenn das nicht ging
async function quarantine(file) {
  const ext = path.extname(file) || '.json';
  const base = path.join(path.dirname(file), path.basename(file, path.extname(file)));
  const s = stamp();
  let target;
  for (let i = 1; ; i++) {
    target = `${base}.defekt-${s}${i > 1 ? `-${i}` : ''}${ext}`;
    try { await fs.access(target); } catch { break; }
  }
  try {
    await withRetry(() => fs.rename(file, target));
    return target;
  } catch {
    try { await fs.copyFile(file, target); return target; } catch { return null; }
  }
}

async function readNow(file, fallback) {
  let text;
  try {
    text = await withRetry(() => fs.readFile(file, 'utf-8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { data: fallback, status: 'missing' };
    throw error;
  }
  try {
    return { data: parseJson(text), status: 'ok' };
  } catch (parseError) {
    const defekt = await quarantine(file);
    console.error(`[jsonStore] DATEI BESCHÄDIGT: ${file} (${parseError.message}) -- `
      + (defekt ? `gesichert als ${path.basename(defekt)}` : 'konnte NICHT beiseitegelegt werden'));
    let data;
    try {
      data = parseJson(await withRetry(() => fs.readFile(`${file}.bak`, 'utf-8')));
    } catch {
      console.error(`[jsonStore] ${path.basename(file)}: keine lesbare .bak -- weiter mit Standardwerten`);
      note(file, 'broken', defekt);
      return { data: fallback, status: 'broken' };
    }
    // .bak wieder als Datei hinlegen, sonst fehlt sie beim nächsten Start (nur wenn die kaputte gesichert ist)
    if (defekt) {
      try {
        await writeTextNow(file, JSON.stringify(data, null, 2), { backup: false });
      } catch (error) {
        console.error(`[jsonStore] ${path.basename(file)}: .bak konnte nicht zurückgeschrieben werden:`, error.message);
      }
    }
    console.error(`[jsonStore] ${path.basename(file)}: letzte Fassung aus ${path.basename(file)}.bak übernommen`);
    note(file, 'restored', defekt);
    return { data, status: 'restored' };
  }
}

/**
 * Schreibt data als JSON (2 Leerzeichen eingerückt, wie bisher) atomar nach file.
 * Der Inhalt wird beim Aufruf festgehalten, geschrieben wird in Aufruf-Reihenfolge.
 */
export async function writeJsonAtomic(file, data) {
  const text = JSON.stringify(data, null, 2);
  if (text === undefined) throw new TypeError(`Nichts zu speichern: ${file}`);
  return enqueue(file, () => writeTextNow(file, text));
}

/**
 * Liest file als JSON. Wartet auf laufende Schreibvorgänge derselben Datei.
 * @returns {Promise<{data: any, status: 'ok'|'missing'|'restored'|'broken'}>}
 */
export async function readJsonFile(file, { fallback } = {}) {
  return enqueue(file, () => readNow(file, fallback));
}

export default { writeJsonAtomic, readJsonFile, problems };
