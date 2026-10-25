/**
 * Datenordner vorbereiten (Update-Weg, 23.10.2026; Pfade s. server/paths.js).
 *
 * Beim Start, bevor irgendetwas geladen wird:
 * 1. Hat der Datenordner schon Daten → nichts tun.
 * 2. Sonst liegen im Programmordner noch Daten einer Version vor dem 23.10.2026 (server/config mit app.json, games/,
 *    profiles.json …) → einmal in den Datenordner KOPIEREN (der alte Ordner bleibt als Rückweg stehen, dazu ein
 *    Hinweis-Text darin).
 * 3. Sonst ist es eine neue Installation → die Vorgaben aus vorgaben/ kopieren (Tastenlage und Bilder der Module).
 * In den Fällen 1 und 2 ergänzt er fehlende Vorgabe-Dateien, ohne Vorhandenes zu überschreiben (25.10.2026: nach einem
 * Umzug aus einem Programmordner ohne Modulbilder bzw. in einem schon angelegten Datenordner fehlten sonst die Bilder).
 *
 * Außerdem: Sicherung der Daten, wenn eine andere Version als beim letzten Start läuft (sichereDaten()), und der
 * Versionsvergleich für „Nach Updates suchen“ (neuerAls()).
 */
import { promises as fs } from 'fs';
import path from 'path';

const exists = async p => { try { await fs.access(p); return true; } catch { return false; } };

// Dateien, an denen man echte Nutzerdaten erkennt (modules.js und moduleLayouts.json lagen auch in jeder frischen Kopie)
const NUTZERDATEN = ['app.json', 'games', 'profiles.json', 'functions.json', 'controller.json', 'kacheln.json'];

async function hatNutzerdaten(configDir) {
  for (const f of NUTZERDATEN) if (await exists(path.join(configDir, f))) return true;
  return false;
}

// Ordner rekursiv kopieren; ohne die Einträge in auslassen (nur oberste Ebene). Vorhandenes wird nicht überschrieben.
async function kopiereOrdner(von, nach, auslassen = []) {
  if (!(await exists(von))) return 0;
  await fs.mkdir(nach, { recursive: true });
  let n = 0;
  for (const e of await fs.readdir(von, { withFileTypes: true })) {
    if (auslassen.includes(e.name)) continue;
    const a = path.join(von, e.name), b = path.join(nach, e.name);
    if (e.isDirectory()) n += await kopiereOrdner(a, b);
    else if (e.isFile() && !(await exists(b))) { await fs.copyFile(a, b); n++; }
  }
  return n;
}

/**
 * @param {{ configDir, assetsDir, altConfigDir, altAssetsDir, vorgabenDir }} p
 * @returns {Promise<{ aktion: 'vorhanden'|'umgezogen'|'neu', dateien?: number }>}
 */
const vorgabenErgaenzen = async (vorgabenDir, configDir, assetsDir) =>
  (await kopiereOrdner(path.join(vorgabenDir, 'config'), configDir)) + (await kopiereOrdner(path.join(vorgabenDir, 'assets'), assetsDir));

export async function datenOrdnerVorbereiten({ configDir, assetsDir, altConfigDir, altAssetsDir, vorgabenDir }) {
  if (await hatNutzerdaten(configDir)) return { aktion: 'vorhanden', ergaenzt: await vorgabenErgaenzen(vorgabenDir, configDir, assetsDir) };
  await fs.mkdir(configDir, { recursive: true });
  await fs.mkdir(assetsDir, { recursive: true });
  if (await hatNutzerdaten(altConfigDir)) {
    // modules.js ist Programm-Code und bleibt im Programm
    let dateien = await kopiereOrdner(altConfigDir, configDir, ['modules.js', 'DATEN-LIEGEN-JETZT-IM-DATENORDNER.txt']);
    dateien += await kopiereOrdner(altAssetsDir, assetsDir);
    const ergaenzt = await vorgabenErgaenzen(vorgabenDir, configDir, assetsDir);
    try {
      await fs.writeFile(path.join(altConfigDir, 'DATEN-LIEGEN-JETZT-IM-DATENORDNER.txt'),
        `ControlHub hat seine Daten am ${new Date().toLocaleString('de-DE')} in den Datenordner kopiert:\r\n${path.dirname(configDir)}\r\n\r\n`
        + 'Dort arbeitet ControlHub ab jetzt. Dieser Ordner hier bleibt nur als Rückweg für ältere Versionen stehen.\r\n', 'utf-8');
    } catch { /* Programmordner schreibgeschützt -- egal */ }
    return { aktion: 'umgezogen', dateien, ergaenzt };
  }
  return { aktion: 'neu', dateien: await vorgabenErgaenzen(vorgabenDir, configDir, assetsDir) };
}

/** Ganze config/ (ohne _sicherung) nach config/_sicherung/<Zeit>-<grund>/ kopieren; gibt den Ordner zurück */
export async function sichereDaten(configDir, grund) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const ziel = path.join(configDir, '_sicherung', `${stamp}-${grund.replace(/[^\w.-]+/g, '-')}`);
  await kopiereOrdner(configDir, ziel, ['_sicherung']);
  return ziel;
}

/** Ist Version a neuer als b? (1.2.10 > 1.2.9; ein führendes „v“ wird ignoriert, Vorab-Kennungen zählen nicht) */
export function neuerAls(a, b) {
  const teile = v => String(v || '').replace(/^v/i, '').split(/[-+]/)[0].split('.').map(x => parseInt(x, 10) || 0);
  const x = teile(a), y = teile(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  }
  return false;
}
