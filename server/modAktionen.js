/**
 * Woher eine Aktion der inputBinding.xml kommt (Hendrik 24.10.2026: „die Mods dann einfach die Kategorie“).
 *
 * Die inputBinding.xml nennt nur den internen Namen einer Aktion, nicht die Mod. Jede Mod listet ihre Aktionen
 * aber in der eigenen modDesc.xml (<actions><action name="…"/>) und bringt die Texte dazu mit
 * (<l10n>, Schlüssel input_<Aktion>). ControlHub liest dafür den Mods-Ordner des Spiels: nur lesen, nichts
 * entpacken, nichts ändern. Das klappt auch für Mods, die im aktuellen Spielstand nicht aktiv sind.
 *
 * Dazu die Aktionsliste, die die FS25-Mod ab 0.7.6 schreibt (craftConsoleInputActions.xml, s. parseSpielAktionen).
 *
 * Mods sind ZIP-Dateien oder entpackte Ordner. Den ZIP-Teil gibt es hier ohne neue Abhängigkeit: Inhaltsverzeichnis
 * am Dateiende lesen, dann nur die paar gebrauchten Dateien (modDesc.xml, Sprachdateien) holen.
 */

import { promises as fs } from 'fs';
import path from 'path';
import zlib from 'zlib';
import { gameUserDirs, modDataDirs } from './telemetryReader.js';
import { parseSpielAktionen } from './inputBindingImporter.js';

const MAX_DATEI = 4 * 1024 * 1024;   // größer ist keine modDesc/Sprachdatei -- schützt vor kaputten oder riesigen Einträgen
const SPRACHEN = ['de', 'en'];       // Texte bevorzugt deutsch, sonst englisch

// ---------- ZIP lesen (nur das Nötigste) ----------

/** Inhaltsverzeichnis einer ZIP-Datei: Name (klein geschrieben) -> Eintrag. null, wenn keine (lesbare) ZIP. */
async function zipVerzeichnis(fh, groesse) {
  const laenge = Math.min(groesse, 22 + 0xffff);   // Endsatz (22 Byte) + höchstens 64 KB Kommentar
  const ende = Buffer.alloc(laenge);
  await fh.read(ende, 0, laenge, groesse - laenge);
  const p = ende.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (p < 0 || p + 22 > laenge) return null;
  const cdGroesse = ende.readUInt32LE(p + 12), cdStart = ende.readUInt32LE(p + 16);
  if (cdStart === 0xffffffff || cdStart + cdGroesse > groesse) return null;   // ZIP64 kommt bei Mods praktisch nicht vor
  const cd = Buffer.alloc(cdGroesse);
  await fh.read(cd, 0, cdGroesse, cdStart);
  const eintraege = new Map();
  for (let i = 0; i + 46 <= cd.length && cd.readUInt32LE(i) === 0x02014b50;) {
    const flags = cd.readUInt16LE(i + 8), methode = cd.readUInt16LE(i + 10);
    const gepackt = cd.readUInt32LE(i + 20), entpackt = cd.readUInt32LE(i + 24);
    const nl = cd.readUInt16LE(i + 28), xl = cd.readUInt16LE(i + 30), kl = cd.readUInt16LE(i + 32);
    const start = cd.readUInt32LE(i + 42);
    const name = cd.toString(flags & 0x800 ? 'utf8' : 'latin1', i + 46, i + 46 + nl).replace(/\\/g, '/');
    if (!(flags & 1)) eintraege.set(name.toLowerCase(), { methode, gepackt, entpackt, start });   // verschlüsselt: überspringen
    i += 46 + nl + xl + kl;
  }
  return eintraege;
}

async function zipDatei(fh, e) {
  if (!e || e.entpackt > MAX_DATEI || e.gepackt > MAX_DATEI) return null;
  const kopf = Buffer.alloc(30);
  await fh.read(kopf, 0, 30, e.start);
  if (kopf.readUInt32LE(0) !== 0x04034b50) return null;
  const daten = Buffer.alloc(e.gepackt);
  await fh.read(daten, 0, e.gepackt, e.start + 30 + kopf.readUInt16LE(26) + kopf.readUInt16LE(28));
  if (e.methode === 0) return daten;
  if (e.methode === 8) return zlib.inflateRawSync(daten, { maxOutputLength: MAX_DATEI });
  return null;
}

/** Zugriff auf eine Mod (ZIP oder Ordner): lies(relativerPfad) -> Text|null, Groß-/Kleinschreibung egal wie unter Windows. */
async function oeffneMod(pfad) {
  const st = await fs.stat(pfad);
  if (st.isDirectory()) {
    const lies = async (rel) => {
      // Ordner: Datei direkt versuchen, sonst Namen im Ordner ohne Rücksicht auf Groß-/Kleinschreibung suchen
      try { return await fs.readFile(path.join(pfad, rel), 'utf8'); } catch { /* weiter unten */ }
      const teile = rel.split('/');
      let dir = pfad;
      for (const t of teile) {
        const namen = await fs.readdir(dir).catch(() => []);
        const treffer = namen.find(n => n.toLowerCase() === t.toLowerCase());
        if (!treffer) return null;
        dir = path.join(dir, treffer);
      }
      return fs.readFile(dir, 'utf8').catch(() => null);
    };
    return { lies, schliessen: async () => {} };
  }
  const fh = await fs.open(pfad, 'r');
  try {
    const verzeichnis = await zipVerzeichnis(fh, st.size);
    if (!verzeichnis) { await fh.close(); return null; }
    const lies = async (rel) => {
      const buf = await zipDatei(fh, verzeichnis.get(rel.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase()));
      return buf ? buf.toString('utf8') : null;
    };
    return { lies, schliessen: () => fh.close() };
  } catch (e) {
    await fh.close();
    throw e;
  }
}

// ---------- modDesc.xml und Sprachdateien ----------

const entXml = v => v.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&').trim();

function attribute(tagInhalt) {
  const a = {};
  for (const m of tagInhalt.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) a[m[1]] = entXml(m[2]);
  return a;
}

const ohneKommentare = t => t.replace(/^﻿/, '').replace(/<!--[\s\S]*?-->/g, '');

/** Text in der bevorzugten Sprache aus einem Block wie <de>…</de><en>…</en> (oder schlichtem Text). */
function spracheAus(block) {
  for (const s of SPRACHEN) {
    const m = block.match(new RegExp(`<${s}>([\\s\\S]*?)</${s}>`));
    if (m && entXml(m[1])) return entXml(m[1]);
  }
  const erste = block.match(/<([a-z]{2})>([\s\S]*?)<\/\1>/);
  if (erste) return entXml(erste[2]) || null;
  return entXml(block) || null;
}

/** Sprachdatei (<text name="…" text="…"/>, ältere Form <e k="…" v="…"/>) -> { name: text } */
function sprachTexte(xml) {
  const t = {};
  if (!xml) return t;
  for (const m of ohneKommentare(xml).matchAll(/<(text|e)\s([^>]*?)\/?>/g)) {
    const a = attribute(m[2]);
    const k = m[1] === 'e' ? a.k : a.name, v = m[1] === 'e' ? a.v : a.text;
    if (k && v != null && !(k in t)) t[k] = v;
  }
  return t;
}

/**
 * Eine Mod lesen.
 * standard: ihr <inputBinding>-Abschnitt (Standardbelegung, gleiches Format wie die inputBinding.xml des Spiels) oder null --
 * damit kennt „Aus dem Spiel neu einlesen“ die Tasten einer neuen Mod, bevor das Spiel sie in die inputBinding.xml schreibt.
 * @returns {{ titel: string, aktionen: Map<string, {plus: string|null, minus: string|null}>, standard: string|null }|null}
 */
export async function leseMod(pfad) {
  const mod = await oeffneMod(pfad).catch(() => null);
  if (!mod) return null;
  try {
    const roh = await mod.lies('modDesc.xml');
    if (!roh) return null;
    const desc = ohneKommentare(roh);
    const actionsBlock = desc.match(/<actions>([\s\S]*?)<\/actions>/);
    const namen = actionsBlock ? [...actionsBlock[1].matchAll(/<action\s([^>]*?)\/?>/g)].map(m => attribute(m[1]).name).filter(Boolean) : [];

    // Texte: direkt in der modDesc (<l10n><text name="…"><de>…</de></text>) und/oder in eigenen Dateien
    // (<l10n filenamePrefix="translations/translation"/> -> translations/translation_de.xml)
    const texte = {};
    const l10nTag = desc.match(/<l10n\b([^>]*?)(\/?)>/);
    if (l10nTag) {
      const prefix = attribute(l10nTag[1]).filenamePrefix;
      const inhalt = l10nTag[2] ? '' : (desc.slice(l10nTag.index + l10nTag[0].length).split('</l10n>')[0] || '');
      for (const m of inhalt.matchAll(/<text\s([^>]*?)>([\s\S]*?)<\/text>/g)) {
        const k = attribute(m[1]).name, v = spracheAus(m[2]);
        if (k && v) texte[k] = v;
      }
      if (prefix) {
        for (const s of SPRACHEN.slice().reverse()) Object.assign(texte, sprachTexte(await mod.lies(`${prefix}_${s}.xml`)));   // de überschreibt en
      }
    }

    const titelBlock = desc.match(/<title>([\s\S]*?)<\/title>/);
    let titel = titelBlock ? spracheAus(titelBlock[1]) : null;
    if (titel?.startsWith('$l10n_')) titel = texte[titel.slice(6)] || null;
    if (!titel) titel = path.basename(pfad).replace(/\.zip$/i, '').replace(/^FS25_/i, '').replace(/_/g, ' ');

    const aktionen = new Map();
    for (const n of namen) {
      // Spiel-Konvention: input_<Aktion>, bei Achsen mit zwei Richtungen input_<Aktion>_1 / _2
      aktionen.set(n, { plus: texte[`input_${n}`] || texte[`input_${n}_1`] || null, minus: texte[`input_${n}_2`] || null });
    }
    const standard = desc.match(/<inputBinding>[\s\S]*?<\/inputBinding>/)?.[0] || null;
    return { titel, aktionen, standard };
  } finally {
    await mod.schliessen();
  }
}

/** Version aus der modDesc.xml einer Mod (ZIP oder Ordner), sonst null (für „Mod installieren“, server/modInstallieren.js) */
export async function modVersion(pfad) {
  const mod = await oeffneMod(pfad).catch(() => null);
  if (!mod) return null;
  try {
    const roh = await mod.lies('modDesc.xml');
    const m = roh && ohneKommentare(roh).match(/<version>\s*([^<]*?)\s*<\/version>/);
    return m ? m[1] : null;
  } finally {
    await mod.schliessen();
  }
}

// ---------- Ordner finden und alle Mods lesen ----------

/** Mods-Ordner je Profilordner: Standard mods/, oder der in gameSettings.xml eingestellte eigene Ordner. */
export async function modsOrdner(profile = gameUserDirs()) {
  const ordner = [];
  for (const g of profile) {
    try { await fs.access(g); } catch { continue; }
    let dir = path.join(g, 'mods');
    try {
      const gs = await fs.readFile(path.join(g, 'gameSettings.xml'), 'utf8');
      const m = gs.match(/<modsDirectoryOverride\s([^>]*?)\/?>/);
      const a = m ? attribute(m[1]) : {};
      if (a.active === 'true' && a.directory) dir = a.directory;
    } catch { /* keine Einstellungsdatei -> Standardordner */ }
    if (!ordner.includes(dir)) ordner.push(dir);
  }
  return ordner;
}

/**
 * Alle Mods in den Ordnern lesen.
 * @returns {{ aktionen: Map<string, {mod: string, plus: string|null, minus: string|null}>, mods: number,
 *            standards: Array<{mod: string, xml: string}> }}
 */
export async function leseModAktionen(ordner) {
  const aktionen = new Map();
  const standards = [];
  let mods = 0;
  for (const dir of ordner) {
    const eintraege = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    eintraege.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of eintraege) {
      if (!(e.isDirectory() || (e.isFile() && /\.zip$/i.test(e.name)))) continue;
      const mod = await leseMod(path.join(dir, e.name)).catch(() => null);
      if (!mod) continue;
      mods++;
      if (mod.standard) standards.push({ mod: mod.titel, xml: mod.standard });
      for (const [name, t] of mod.aktionen) {
        if (!aktionen.has(name)) aktionen.set(name, { mod: mod.titel, ...t });   // dieselbe Aktion in zwei Mods: die erste gilt
      }
    }
  }
  return { aktionen, mods, standards };
}

/** Aktionsliste der Mod (craftConsoleInputActions.xml) aus dem Mod-Ordner, der sie zuletzt geschrieben hat. */
export async function leseSpielAktionen(ordner = modDataDirs()) {
  let beste = null;
  for (const dir of ordner) {
    const datei = path.join(dir, 'craftConsoleInputActions.xml');
    try {
      const st = await fs.stat(datei);
      if (!beste || st.mtimeMs > beste.zeit) beste = { datei, zeit: st.mtimeMs };
    } catch { /* nicht da */ }
  }
  if (!beste) return null;
  return parseSpielAktionen(await fs.readFile(beste.datei, 'utf8').catch(() => ''));
}
