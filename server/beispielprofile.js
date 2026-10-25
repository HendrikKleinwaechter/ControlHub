/**
 * Beispielprofile mit fertiger Belegung (Hendrik 24.10.2026: „ein paar Beispielprofile mit fertiger Belegung“; Säen und
 * Spritzen getrennt). Die Belegung steht im Programm unter vorgaben/beispielprofile/<spiel>-<controller>.json:
 *   gemeinsam: { "<Tastennummer>": ["<AKTION>", "<Name>"] }  -- in allen Profilen gleich
 *   profile:   { "<Profilname>": { beschreibung, tasten: { … wie gemeinsam } } }  -- ergänzt/überschreibt gemeinsam
 * Tastennummern wie in ControlHub (1-basiert), gespeichert wird 0-basiert (profile.buttons). „AKTION-“ = Gegenrichtung.
 * Die Funktionen sind die aus dem Einlesen der inputBinding.xml (func-fs-<aktion>, func-fs-<aktion>-minus).
 */

import { promises as fs } from 'fs';
import path from 'path';
import { VORGABEN_DIR } from './paths.js';
import { gameUserDirs } from './telemetryReader.js';
import { parseInputBindingXml } from './inputBindingImporter.js';
import { leseSpielAktionen, leseModAktionen, modsOrdner } from './modAktionen.js';
import { GAMEPAD_MODUS } from './profileManager.js';

/** Funktions-ID zu einer Aktion des Spiels, wie beim Einlesen der inputBinding.xml */
export function funktionsId(aktion) {
  const minus = aktion.endsWith('-');
  return `func-fs-${aktion.replace(/-$/, '').toLowerCase().replace(/_/g, '-')}${minus ? '-minus' : ''}`;
}

export async function ladeBeispielprofile(spiel, controller, dir = path.join(VORGABEN_DIR, 'beispielprofile')) {
  if (!/^[\w-]+$/.test(String(spiel)) || !/^[\w-]+$/.test(String(controller))) return null;
  try {
    const daten = JSON.parse(await fs.readFile(path.join(dir, `${spiel}-${controller}.json`), 'utf8'));
    return daten?.profile && typeof daten.profile === 'object' ? daten : null;
  } catch {
    return null;
  }
}

/**
 * Profile aus den Beispieldaten bauen.
 * @param {object} daten   ladeBeispielprofile()
 * @param {object} achsen  Achsen-Zuordnung, die jedes Profil als Kopie bekommt (aus dem aktiven Profil)
 * @returns {Array<{name, description, buttons, axes}>}
 */
export function baueBeispielprofile(daten, achsen = {}) {
  const tasten = t => Object.fromEntries(Object.entries(t || {})
    .filter(([nr, wert]) => Number.isInteger(Number(nr)) && Number(nr) >= 1 && Array.isArray(wert) && typeof wert[0] === 'string')
    .map(([nr, [aktion]]) => [String(Number(nr) - 1), funktionsId(aktion)]));
  return Object.entries(daten.profile).map(([name, p]) => ({
    name,
    description: p.beschreibung || 'Beispielprofil',
    buttons: { ...tasten(daten.gemeinsam), ...tasten(p.tasten) },
    axes: JSON.parse(JSON.stringify(achsen || {}))
  }));
}

/** Achsen für neue Beispielprofile: die des aktiven Profils, sonst die des ersten Profils, das welche hat */
export function achsenVorlage(aktiv, alle = []) {
  const hat = p => p?.axes && Object.keys(p.axes).length > 0;
  if (hat(aktiv)) return { axes: aktiv.axes, von: aktiv.name };
  const p = alle.find(hat);
  return p ? { axes: p.axes, von: p.name } : { axes: {}, von: null };
}

/** inputBinding.xml des Spiels auf diesem PC (die zuletzt geänderte), sonst null */
export async function findeInputBinding(profile = gameUserDirs()) {
  let beste = null;
  for (const g of profile) {
    const datei = path.join(g, 'inputBinding.xml');
    try {
      const st = await fs.stat(datei);
      if (!beste || st.mtimeMs > beste.zeit) beste = { datei, zeit: st.mtimeMs };
    } catch { /* nicht da */ }
  }
  return beste?.datei || null;
}

/**
 * Beispielprofile hinzufügen: vorhandene Profile bleiben unangetastet (gleicher Name → übersprungen). Fehlen Funktionen,
 * werden genau diese aus der inputBinding.xml des Spiels ergänzt (mit Gruppen wie beim Einlesen), wenn sie auf dem PC liegt.
 * @param {object} server  ControllerServer (profileManager, functionsManager, gameManager, controllerManager)
 * @param {string[]|null} namen  nur diese Profile (null = alle)
 * @param {{spiel?: string, controller?: string}} wofuer  Standard: aktives Spiel und aktiver Controller (beim Spielwechsel
 *   ist das neue Spiel noch nicht aktiv, s. index.js applyControllerData)
 */
export async function fuegeBeispielprofileHinzu(server, namen = null, { spiel = server.gameManager.activeId, controller = server.controllerManager.activeId } = {}) {
  const daten = await ladeBeispielprofile(spiel, controller);
  if (!daten) throw new Error('Für dieses Spiel und diesen Controller gibt es keine Beispielprofile');
  const pm = server.profileManager, fm = server.functionsManager;
  const alle = pm.getAllProfiles();
  const vorlage = achsenVorlage(pm.getCurrentProfile() && { ...pm.getCurrentProfile(), name: pm.currentProfileName }, alle);
  const profile = baueBeispielprofile(daten, vorlage.axes).filter(p => !namen || namen.includes(p.name));
  const neu = profile.filter(p => !pm.profiles[p.name]);
  const uebersprungen = profile.filter(p => pm.profiles[p.name]).map(p => p.name);

  const { ergaenzt, fehlend } = await ergaenzeFunktionen(fm, neu.flatMap(p => Object.values(p.buttons)));
  for (const p of neu) await pm.setProfile(p.name, p);
  return { hinzugefuegt: neu.map(p => p.name), uebersprungen, funktionenErgaenzt: ergaenzt, fehlend, achsenVon: vorlage.von };
}

/** Fehlende Funktionen aus der inputBinding.xml des Spiels holen (nur die fehlenden, vorhandene bleiben wie sie sind) */
async function ergaenzeFunktionen(fm, ids) {
  let fehlend = [...new Set(ids)].filter(id => !fm.functions[id]);
  let ergaenzt = 0;
  if (fehlend.length) {
    const datei = await findeInputBinding();
    if (datei) {
      const spiel = await leseSpielAktionen().catch(() => null);
      const mods = await leseModAktionen(await modsOrdner()).catch(() => null);
      const { functions } = parseInputBindingXml(await fs.readFile(datei, 'utf8'), { spiel, mods });
      const dazu = Object.fromEntries(fehlend.filter(id => functions[id]).map(id => [id, functions[id]]));
      if (Object.keys(dazu).length) {
        ergaenzt = (await fm.importFunctions({ functions: dazu }, 'merge')).imported;
        fehlend = fehlend.filter(id => !fm.functions[id]);
      }
    }
  }
  return { ergaenzt, fehlend };
}

/** Stand der Beispielbelegung (1 = nur die Profile, jeder Nachtrag zählt hoch); profiles.json merkt sich, was schon drin ist */
export function beispielStand(daten) {
  return Math.max(1, ...(daten?.nachtraege || []).map(n => Number(n.stand) || 0));
}

/**
 * Nachträge für schon angelegte Profile (Hendrik 25.10.2026: Zündschloss „in allen Profilen“): je Nachtrag mit Stand über
 * `abStand` die Tasten in jedes Profil außer dem Gamepad-Modus setzen -- aber nur, wo die Taste frei ist oder noch die
 * frühere Beispielbelegung trägt (`vorher`). Was jemand selbst belegt hat, bleibt.
 * @returns {{ geaendert: string[], funktionenErgaenzt: number, fehlend: string[] }}
 */
export async function wendeNachtraegeAn(server, daten, abStand) {
  const pm = server.profileManager, fm = server.functionsManager;
  const nachtraege = (daten?.nachtraege || []).filter(n => Number(n.stand) > abStand).sort((a, b) => a.stand - b.stand);
  const geaendert = new Set(), ids = [];
  for (const n of nachtraege) {
    const tasten = Object.entries(n.tasten || {}).filter(([nr, w]) => Number(nr) >= 1 && Array.isArray(w) && typeof w[0] === 'string');
    for (const [name, profil] of Object.entries(pm.profiles)) {
      if (name === GAMEPAD_MODUS) continue;
      const buttons = { ...(profil.buttons || {}) };
      let anders = false;
      for (const [nr, [aktion]] of tasten) {
        const i = String(Number(nr) - 1), jetzt = buttons[i], vorher = n.vorher?.[nr];
        const frei = jetzt == null || jetzt === '' || (Array.isArray(jetzt) && !jetzt.length);
        if (!frei && !(vorher && jetzt === funktionsId(vorher))) continue;
        if (jetzt === funktionsId(aktion)) continue;
        buttons[i] = funktionsId(aktion);
        ids.push(buttons[i]);
        anders = true;
      }
      if (anders) { await pm.setProfile(name, { ...profil, buttons }); geaendert.add(name); }
    }
  }
  const { ergaenzt, fehlend } = await ergaenzeFunktionen(fm, ids);
  return { geaendert: [...geaendert], funktionenErgaenzt: ergaenzt, fehlend };
}
