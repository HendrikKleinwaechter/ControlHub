/**
 * Mod installieren (Hendrik 25.10.2026: „Kann der ControlHub die Mod nicht auch … in den Mods-Ordner machen?“ –
 * „Das macht es einfacher für den Nutzer“). Die fertige Mod liegt im Programm unter Mod/FS25_CraftConsoleHUD.zip
 * (die Veröffentlichung legt sie dort ab, s. oeffentlich_bauen.sh). Nur auf Knopfdruck:
 * ControlHub schreibt nie von selbst in die Dateien des Spiels.
 *
 * Ziel ist der Mod-Ordner des Profilordners, den das Spiel nutzt (zuletzt geänderte gameSettings.xml; Dokumente oder
 * OneDrive), bzw. der dort eingestellte eigene Mod-Ordner (modsDirectoryOverride, s. modAktionen.js modsOrdner()).
 * Weitere Fassungen (z. B. „FS25_CraftConsoleHUD (1).zip“ oder ein entpackter Ordner) meldet der Status nur, gelöscht
 * wird nichts.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { PROGRAM_DIR } from './paths.js';
import { gameUserDirs } from './telemetryReader.js';
import { modVersion, modsOrdner } from './modAktionen.js';
import { neuerAls } from './datenOrdner.js';

export const MOD_DATEI = 'FS25_CraftConsoleHUD.zip';
export const MITGELIEFERT = path.join(PROGRAM_DIR, 'Mod', MOD_DATEI);

/** Profilordner, den das Spiel nutzt: der mit der zuletzt geänderten gameSettings.xml, sonst der erste vorhandene */
export async function spielProfil(profile = gameUserDirs()) {
  let beste = null, erster = null;
  for (const g of profile) {
    try { await fs.access(g); } catch { continue; }
    erster ??= g;
    try {
      const t = (await fs.stat(path.join(g, 'gameSettings.xml'))).mtimeMs;
      if (!beste || t > beste.t) beste = { g, t };
    } catch { /* keine gameSettings.xml */ }
  }
  return beste?.g || erster;
}

/**
 * @returns {{ mitgeliefert: string|null, spiel: boolean, ordner?: string, installiert?: string|null, doppelt?: string[], aktuell?: boolean }}
 *   mitgeliefert/installiert = Version (installiert „?“, wenn die Datei da, aber nicht lesbar ist; null = keine)
 */
export async function modStatus({ mitgeliefert = MITGELIEFERT, profile = gameUserDirs() } = {}) {
  const mit = await modVersion(mitgeliefert).catch(() => null);
  const profil = await spielProfil(profile);
  if (!profil) return { mitgeliefert: mit, spiel: false };
  const [ordner] = await modsOrdner([profil]);
  const eintraege = await fs.readdir(ordner, { withFileTypes: true }).catch(() => []);
  const datei = eintraege.find(e => e.isFile() && e.name.toLowerCase() === MOD_DATEI.toLowerCase());
  const installiert = datei ? (await modVersion(path.join(ordner, datei.name)).catch(() => null)) || '?' : null;
  const doppelt = eintraege.filter(e => e !== datei && /^fs25_craftconsolehud/i.test(e.name)).map(e => e.name).sort();
  const aktuell = !!(installiert && installiert !== '?' && mit && !neuerAls(mit, installiert));
  return { mitgeliefert: mit, spiel: true, ordner, installiert, doppelt, aktuell };
}

/** Mitgelieferte Mod in den Mod-Ordner kopieren (über eine Zwischendatei, die dann umbenannt wird). @returns modStatus() */
export async function installiereMod(opts = {}) {
  const { mitgeliefert = MITGELIEFERT } = opts;
  const st = await modStatus(opts);
  if (!st.mitgeliefert) throw new Error('In diesem ControlHub-Ordner fehlt die Mod (Ordner „Mod“). Bitte ControlHub neu herunterladen.');
  if (!st.spiel) throw new Error('Der Ordner des LS25 wurde auf diesem PC nicht gefunden. Läuft ControlHub auf dem PC, auf dem du spielst, und lief das Spiel dort schon einmal?');
  await fs.mkdir(st.ordner, { recursive: true });
  const ziel = path.join(st.ordner, MOD_DATEI), zwischen = `${ziel}.neu`;
  try {
    await fs.copyFile(mitgeliefert, zwischen);
    await fs.rename(zwischen, ziel);
  } catch (e) {
    await fs.rm(zwischen, { force: true }).catch(() => {});
    if (['EBUSY', 'EPERM', 'EACCES'].includes(e.code)) throw new Error('Die Mod ist gerade in Benutzung. Bitte das Spiel beenden und noch einmal versuchen.');
    throw e;
  }
  return modStatus(opts);
}
