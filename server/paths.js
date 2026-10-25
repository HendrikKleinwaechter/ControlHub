/**
 * Gemeinsame Pfade des Servers.
 *
 * Seit 23.10.2026 (Update-Weg, Hendrik): Programm und Nutzerdaten sind getrennt. Die Daten liegen in einem eigenen
 * Datenordner außerhalb des Programmordners -- so kann man eine neue Version entpacken, wohin man will (oder über die
 * alte kopieren), ohne Daten zu verlieren:
 *   Windows  %APPDATA%\ControlHub            (wird von OneDrive nicht synchronisiert, anders als „Dokumente“)
 *   macOS    ~/Library/Application Support/ControlHub
 *   Linux    $XDG_CONFIG_HOME/ControlHub bzw. ~/.config/ControlHub
 *   CONTROLHUB_DATEN=<Ordner> überschreibt das (Tests, Testkopie, mehrere Installationen)
 * Darin: config/ (Einstellungen, Spiele, Profile …), assets/ (hochgeladene Bilder), logs/.
 * Bis zur Version vom 23.10.2026 lagen sie im Programmordner unter server/config und server/assets -- von dort zieht
 * server/datenOrdner.js sie beim ersten Start einmal um. Mitgelieferte Vorgaben (Tastenlage und Bilder der Module)
 * stehen im Programm unter vorgaben/ und werden bei einer neuen Installation in den Datenordner kopiert.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
// Programmordner: im gepackten Programm (pkg) der Ordner der .exe, sonst eine Ebene über server/
export const PROGRAM_DIR = process.pkg ? path.dirname(process.execPath) : path.join(SERVER_DIR, '..');

export function standardDatenOrdner(env = process.env, platform = process.platform, home = os.homedir()) {
  if (env.CONTROLHUB_DATEN) return path.resolve(env.CONTROLHUB_DATEN);
  if (platform === 'win32') return path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'ControlHub');
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'ControlHub');
  return path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'ControlHub');
}

export const DATA_DIR = standardDatenOrdner();
export const CONFIG_DIR = path.join(DATA_DIR, 'config');
export const ASSETS_DIR = path.join(DATA_DIR, 'assets');
export const LOGS_DIR = path.join(DATA_DIR, 'logs');
// Mitgelieferte Vorgaben (im Programm, werden nie überschrieben) und die alten Datenorte (nur noch für den Umzug)
export const VORGABEN_DIR = path.join(PROGRAM_DIR, 'vorgaben');
export const ALT_CONFIG_DIR = path.join(PROGRAM_DIR, 'server', 'config');
export const ALT_ASSETS_DIR = path.join(PROGRAM_DIR, 'server', 'assets');

// Version und Update-Quelle aus package.json (Startbanner, Einstellungen → Allgemein, „Nach Updates suchen“)
function paket() {
  try { return JSON.parse(fs.readFileSync(path.join(SERVER_DIR, '..', 'package.json'), 'utf-8')); } catch { return {}; }
}
const PAKET = paket();
export const VERSION = typeof PAKET.version === 'string' ? PAKET.version : '0.0.0';
export const UPDATE_REPO = typeof PAKET.controlhub?.updateRepo === 'string' ? PAKET.controlhub.updateRepo : null;
