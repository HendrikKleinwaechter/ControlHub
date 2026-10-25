/**
 * Bilder in Kachel-Dateien (Hendrik 24.10.2026: „da fehlt jetzt natürlich das Bild. Das müssen wir auch irgendwie
 * hinbekommen, dass es in den Export-/Importdaten irgendwie mit drinnen ist“).
 *
 * Export: jedes Bild, auf das eine Kachel verweist (Hintergrund, Grafiken), kommt als data-URL unter „bilder“ in die
 * Kachel (`{ …kachel, bilder: { "<Web-Pfad>": "data:image/…;base64,…" } }`), auch Bilder aus dem Programm
 * (/img/vorlagen/…), damit die Datei für sich allein steht.
 * Import: Bilder aus dem Programm, die es hier gibt, bleiben Verweise. Alle anderen schreibt ControlHub in den
 * Bilder-Ordner des aktiven Spiels, benannt wie beim Hochladen (Seiten- bzw. Grafik-ID), und die Kachel zeigt darauf.
 * Ohne mitgeliefertes Bild (ältere Dateien) bleibt der Verweis, wie er war.
 */
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const ORDNER = { '/img/vorlagen/': null, '/steuerungsmenue-bg/': 'steuerungsmenue-bg', '/steuerungsmenue-graphics/': 'steuerungsmenue-graphics' };
const ENDUNG = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };
const MAX_BYTES = 10 * 1024 * 1024;   // wie beim Hochladen
const DATA_URL = /^data:(image\/(?:png|jpeg|webp|gif|svg\+xml));base64,([A-Za-z0-9+/=]+)$/;
// SVG läuft im Browser als Teil von ControlHub, wenn man es direkt öffnet: nichts mit Skript oder eingebetteten Seiten
const SVG_UNSICHER = /<script|<foreignObject|<iframe|<embed|<object|javascript:|\son[a-z]+\s*=/i;

const istVorlage = url => url.startsWith('/img/vorlagen/');

// Web-Pfad → Datei (Programmordner für Vorlagen-Bilder, sonst Datenordner); null bei allem anderen
function datei(url, { assetsDir, publicDir = PUBLIC_DIR }) {
  const prefix = Object.keys(ORDNER).find(p => typeof url === 'string' && url.startsWith(p));
  if (!prefix) return null;
  const rel = url.slice(prefix.length);
  if (!rel || rel.includes('..') || !/^[\w./-]+$/.test(rel)) return null;
  return prefix === '/img/vorlagen/' ? path.join(publicDir, 'img', 'vorlagen', ...rel.split('/')) : path.join(assetsDir, ORDNER[prefix], ...rel.split('/'));
}

export function bildPfade(kachel) {
  const urls = new Set();
  if (typeof kachel?.background === 'string') urls.add(kachel.background);
  for (const g of kachel?.graphics || []) if (typeof g?.src === 'string') urls.add(g.src);
  return [...urls];
}

/** Bilder einer Kachel als { Web-Pfad: data-URL }; fehlende oder zu große Dateien fehlen einfach */
export async function bilderEinbetten(kachel, opts) {
  const out = {};
  for (const url of bildPfade(kachel)) {
    const f = datei(url, opts);
    const typ = ENDUNG[path.extname(url).slice(1).toLowerCase()];
    if (!f || !typ) continue;
    try {
      const buf = await fs.readFile(f);
      if (buf.length <= MAX_BYTES) out[url] = `data:${typ};base64,${buf.toString('base64')}`;
    } catch { /* Bild gibt es nicht (mehr) -- Verweis bleibt ohne Bild */ }
  }
  return out;
}

async function vorhanden(f) {
  try { await fs.access(f); return true; } catch { return false; }
}

// data-URL prüfen → { buf, ext } oder null
function lies(dataUrl) {
  const m = typeof dataUrl === 'string' ? DATA_URL.exec(dataUrl) : null;
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > MAX_BYTES) return null;
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' }[m[1]];
  if (ext === 'svg' && SVG_UNSICHER.test(buf.toString('utf-8'))) return null;
  return { buf, ext };
}

/**
 * Nach dem Import einer Kachel: mitgelieferte Bilder ablegen und die Verweise der neuen Kachel umstellen.
 * @param {object} kachel  die neu angelegte Kachel (mit ihren neuen IDs), wird geändert
 * @param {object} bilder  „bilder“ aus der Datei
 * @param {{ assetsDir: string, gameId: string, publicDir?: string }} opts
 * @returns {Promise<number>} Anzahl abgelegter Bilder
 */
export async function bilderUebernehmen(kachel, bilder, opts) {
  if (!kachel || !bilder || typeof bilder !== 'object') return 0;
  const { assetsDir, gameId } = opts;
  let n = 0;
  const ablegen = async (url, ordner, name) => {
    if (typeof url !== 'string' || !bilder[url]) return null;
    if (istVorlage(url) && await vorhanden(datei(url, opts))) return null;   // gibt es hier schon
    const b = lies(bilder[url]);
    if (!b || !/^[\w-]+$/.test(gameId) || !/^[\w-]+$/.test(name)) return null;
    const ziel = path.join(assetsDir, ordner, gameId, `${name}.${b.ext}`);
    await fs.mkdir(path.dirname(ziel), { recursive: true });
    await fs.writeFile(ziel, b.buf);
    n++;
    return `/${ordner}/${gameId}/${name}.${b.ext}`;
  };
  const bg = await ablegen(kachel.background, 'steuerungsmenue-bg', kachel.id);
  if (bg) kachel.background = bg;
  for (const g of kachel.graphics || []) {
    const neu = await ablegen(g.src, 'steuerungsmenue-graphics', g.id);
    if (neu) g.src = neu;
  }
  return n;
}
