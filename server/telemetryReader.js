/**
 * FS25-Telemetrie: liest die vom Lua-Mod (FS25-Mod/FS25_CraftConsoleHUD) geschriebene
 * craftConsoleHud.xml direkt ein (früher Python-Bridge + Serial, längst ersetzt).
 *
 * Stand Phase 1 (21.10.2026): Dateien liegen in modSettings/FS25_CraftConsoleHUD/ (alter Ort als
 * Rückfall, s. modDataDirs), gelesen wird im Takt der eingestellten Rate (4/10/20/25 pro Sekunde),
 * ControlHub schreibt Rate + Anzahl verbundener Browser als craftConsoleSettings.xml für die Mod,
 * und am Schreibzähler seq erkennt der Reader, wenn die Mod nicht mehr schreibt.
 * Format 1 (bis 0.95), Format 2 (mit <unit>/<fill>) und Format 3 (ab Mod 0.5: Lage, Arbeitsbereiche, danach Teilbreiten,
 * Precision Farming, Sitzung, Früchte …) werden gelesen; das Format beschreibt die Doku „XML-Schnittstelle“.
 *
 * Bewusst kein XML-Parser-Package: ein paar Regexe reichen für das feste Format (vermeidet eine
 * neue Abhaengigkeit in der per pkg gebauten .exe).
 */

import { promises as fs, readdirSync } from 'fs';
import os from 'os';
import path from 'path';

const DEFAULT_RATE = 4;            // Schreibrunden pro Sekunde, wie die Mod ohne Einstellungsdatei
export const TELEMETRY_RATES = [4, 10, 20, 25]; // 22.10.2026: 30 entfernt, 25 dazu (Karte zeichnet höchstens 30 Bilder/s)
const DIR_CHECK_MS = 5000;         // so oft wird geprüft, welcher Ordner die frischere Datei hat
const STALE_MIN_MS = 3000;         // seq so lange unverändert -> Mod schreibt nicht mehr (Spiel pausiert/beendet)
const UNAVAILABLE_REPEAT_MS = 1000; // „nicht verfügbar“ beim Wechsel sofort, danach höchstens 1×/s wiederholen (23.10.2026)
const COURSE_RETRY_MS = 1000;      // Kursdatei nicht lesbar (fehlt, halb geschrieben) -> höchstens 1×/s neu versuchen

// Mögliche Spiel-Profilordner. Windows legt "Dokumente" oft in OneDrive ab (dann liegt auch
// "My Games" dort) -- deshalb neben dem Standardort die OneDrive-Varianten (deutsch/englisch).
export function gameUserDirs() {
  const home = os.homedir();
  const docs = [path.join(home, 'Documents')];
  for (const od of [process.env.OneDrive, process.env.OneDriveConsumer, path.join(home, 'OneDrive')]) {
    if (od) docs.push(path.join(od, 'Documents'), path.join(od, 'Dokumente'));
  }
  return [...new Set(docs)].map(d => path.join(d, 'My Games', 'FarmingSimulator2025'));
}

// Ordner, in denen die Mod ihre Dateien ablegt -- je Profilordner in derselben Reihenfolge wie baseDir()
// im Lua-Mod: ab Phase 1 (21.10.2026) modSettings/FS25_CraftConsoleHUD/, bis 0.95 direkt im Profilordner.
// Der Ordner heißt wie die ZIP der Mod beim Gastgeber bzw. auf dem Server. Benennt jemand sie um (z. B.
// „FS25_CraftConsoleHUD (1).zip“), heißt auch der Ordner so -- daher auch Ordner, die so anfangen
// (Mehrspieler-Prüfung 25.10.2026, R2). Welcher gilt, entscheidet resolveDataDir() nach der frischesten Datei.
const MOD_ORDNER = 'FS25_CraftConsoleHUD';
export const istModOrdner = dir => path.basename(dir || '').startsWith(MOD_ORDNER);
export function modDataDirs() {
  return gameUserDirs().flatMap(g => {
    const ms = path.join(g, 'modSettings');
    let umbenannt = [];
    try {
      umbenannt = readdirSync(ms, { withFileTypes: true })
        .filter(e => e.isDirectory() && e.name !== MOD_ORDNER && e.name.startsWith(MOD_ORDNER)).map(e => path.join(ms, e.name)).sort();
    } catch { /* kein modSettings-Ordner */ }
    return [path.join(ms, MOD_ORDNER), ...umbenannt, g];
  });
}

// XML-Entities in Attributwerten zurückwandeln (z. B. "Sämaschine &amp; Düngerstreuer"). &amp; zuletzt,
// damit ein geschriebenes "&amp;lt;" nicht doppelt umgewandelt wird.
function unescapeXml(s) {
  return s
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

// Ein Element mit seinen Attributen bis zu seinem Ende: Werte in Anführungszeichen dürfen „>“ enthalten (Durchsicht
// 24.10.2026 -- vorher endete das Element am ersten „>“, z. B. in einem Fahrzeug-, Geräte- oder Feldnamen, und alle
// Werte dahinter fehlten). Gruppe 1 = Attribute, danach die Gruppen aus `rest`.
const ATTRS = '((?:\\s+[\\w:.-]+="[^"]*")*)';
const tagRe = (tag, rest, flags) => new RegExp(`<${tag}${ATTRS}\\s*${rest}`, flags);

function parseAttrs(text) {
  const attrs = {};
  const attrRegex = /(\w+)="([^"]*)"/g;
  let m;
  while ((m = attrRegex.exec(text)) !== null) {
    attrs[m[1]] = unescapeXml(m[2]);
  }
  return attrs;
}

// Optionaler Wahrheitswert: fehlt das Attribut (gilt für dieses Gerät nicht, z. B. "gesenkt" beim
// Anhänger), kommt null statt false -- so kann das Frontend "nicht vorhanden" von "aus" unterscheiden.
function optBool(attrs, key) {
  return attrs[key] === undefined ? null : attrs[key] === 'true';
}

function optNum(attrs, key, fallback = -1) {
  const v = parseFloat(attrs[key]);
  return Number.isFinite(v) ? v : fallback;
}

/**
 * Einheiten der Kombi (seit Format 2, Erweiterung nach Version 0.95): <unit .../> bzw. <unit ...>
 * mit <fill .../>-Kindern innerhalb von <hud>. Reihenfolge wie vom Mod geschrieben: Fahrzeug selbst
 * (side "self", nur wenn es eigene Ladung/Funktionen hat), dann Anbaugeräte mit side front/rear.
 */
// "Art:Sl,Sq,Wl,Wq,Hl,Hq|…" → [{ type, corners: [[l,q] × 4] }]; vierte Ecke = W + H − S (Parallelogramm des Spiels)
function parseAreas(str) {
  if (!str) return [];
  return str.split('|').map(part => {
    const [type, nums] = part.split(':');
    const v = (nums || '').split(',').map(Number);
    if (v.length !== 6 || !v.every(Number.isFinite)) return null;
    const S = [v[0], v[1]], Wd = [v[2], v[3]], H = [v[4], v[5]];
    // Art: ab Mod 0.6 der Name (CUTTER, COMBINECHOPPER …), davor eine Nummer
    const t = String(type || '').trim();
    return { type: /^\d+$/.test(t) ? parseInt(t, 10) : (t || 0), corners: [S, Wd, [Wd[0] + H[0] - S[0], Wd[1] + H[1] - S[1]], H] };
  }).filter(Boolean);
}

// Teilbreiten (Mod 0.7, unit#sec, Anmerkung 28): „aktiv;mitte;linksAn;linksMax;rechtsAn;rechtsMax;Seite:an:Außenkante,…“
export function parseSections(str) {
  if (!str || typeof str !== 'string') return null;
  const p = str.split(';');
  if (p.length < 7) return null;
  const n = v => { const x = parseInt(v, 10); return Number.isFinite(x) ? x : -1; };
  const liste = p[6].split(',').filter(Boolean).map(e => {
    const [side, on, abs] = e.split(':');
    return { side, on: on === '1', abs: parseFloat(abs) };
  }).filter(s => (s.side === 'L' || s.side === 'R' || s.side === 'C') && Number.isFinite(s.abs));
  if (!liste.length) return null;
  return { aktiv: p[0] === '1', mitte: p[1] === '1', links: { an: n(p[2]), max: n(p[3]) }, rechts: { an: n(p[4]), max: n(p[5]) }, liste };
}

// Precision-Farming-Düsen (Mod 0.7.2, unit#pf): „nr:von:bis:an:anzahl,…“ je PF-Teilbreite, von/bis quer zur Gerätemitte
// in Metern (links +) → [{ nr, von, bis, an, n }] von links nach rechts; null = keine PF-Spritze
export function parsePf(str) {
  if (!str || typeof str !== 'string') return null;
  const liste = str.split(',').filter(Boolean).map(e => {
    const [nr, von, bis, an, n] = e.split(':').map(Number);
    return { nr, von, bis, an, n };
  }).filter(s => [s.nr, s.von, s.bis, s.an, s.n].every(Number.isFinite) && s.n > 0 && s.von > s.bis);
  return liste.length ? liste : null;
}

function parseUnits(body) {
  const units = [];
  const unitRegex = tagRe('unit', '(?:\\/>|>([\\s\\S]*?)<\\/unit>)', 'g');
  let m;
  while ((m = unitRegex.exec(body)) !== null) {
    const a = parseAttrs(m[1]);
    const fills = [];
    const fillRegex = tagRe('fill', '\\/>', 'g');
    let f;
    while ((f = fillRegex.exec(m[2] || '')) !== null) {
      const fa = parseAttrs(f[1]);
      // type = interner Füllstoffname (Mod ab 0.4.2, z. B. LIME/HERBICIDE) -- für den Planer-Fortschritt je Gerät
      fills.push({ name: (fa.name || '').trim(), type: (fa.type || '').trim(), level: optNum(fa, 'level', 0), capacity: optNum(fa, 'capacity', 0) });
    }
    units.push({
      name: (a.name || '').trim(),
      kind: a.kind || 'implement',
      side: a.side || '',
      depth: Math.trunc(optNum(a, 'depth', 0)),
      selected: a.selected === 'true',
      lowered: optBool(a, 'lowered'),
      on: optBool(a, 'on'),
      unfolded: optBool(a, 'unfolded'),
      folding: a.folding === 'true',
      canFold: a.canFold === 'true',
      canLower: a.canLower === 'true',
      canTurnOn: a.canTurnOn === 'true',
      pto: optNum(a, 'pto'),
      width: optNum(a, 'width'),
      workMode: Math.trunc(optNum(a, 'workMode')),
      workModes: (a.workModes || '').split('|').filter(Boolean),
      fills,
      // Mod 0.5 (Format 3, GPS-Menü Paket I): Anbauart, Lage zum Fahrzeug (längs/quer, quer + = links),
      // Winkel, Anbaupunkt am Zugfahrzeug, Arbeitsbereiche. Ohne Mod 0.5 null bzw. [].
      attach: a.attach === 'mounted' || a.attach === 'trailed' ? a.attach : null,
      pose: a.pa !== undefined ? { along: parseFloat(a.pa), across: parseFloat(a.pc), angle: a.ang !== undefined ? parseFloat(a.ang) : 0 } : null,
      joint: a.ja !== undefined ? { along: parseFloat(a.ja), across: parseFloat(a.jc) } : null,
      areas: parseAreas(a.areas),
      // Mod 0.6: Abladestelle erreicht (1) bzw. lädt gerade ab (2), sonst 0
      tip: Math.trunc(optNum(a, 'tip', 0)) || 0,
      // Mod 0.7: Teilbreiten (null = keine); Mod 0.7.2: Düsen-Teilbreiten von Precision Farming (null = keine)
      sections: parseSections(a.sec),
      pfSek: parsePf(a.pf)
    });
  }
  return units;
}

export function parseHudXml(xmlText) {
  // Bis Format 1 (Version 0.95) ein selbstschließendes <hud .../>, ab Format 2 <hud ...> mit
  // <unit>-Kindern -- der Regex nimmt beide Formen.
  const tagMatch = xmlText.match(tagRe('hud', '(\\/?)>'));
  if (!tagMatch) return null;
  // Format 2 ist erst vollständig, wenn das schließende </hud> da ist (sonst halb geschriebene Datei).
  if (tagMatch[2] !== '/' && !xmlText.includes('</hud>')) return null;

  const attrs = parseAttrs(tagMatch[1]);
  const body = tagMatch[2] === '/' ? '' : xmlText.slice(tagMatch.index + tagMatch[0].length);

  const gi = (key, fallback = -1) => {
    const v = parseFloat(attrs[key]);
    return Number.isFinite(v) ? Math.trunc(v) : fallback;
  };
  // Fuer Felder, die NICHT auf Ganzzahlen abgeschnitten werden duerfen (Position/Winkel/Prozentwerte
  // aus der Precision-Farming-/Lenksystem-Erweiterung, s. gi()-Kommentar oben -- gi() truncatiert bewusst
  // fuer die aelteren Felder wie rpm/damage, die neuen Felder brauchen die Nachkommastellen).
  const gf = (key, fallback = -1) => {
    const v = parseFloat(attrs[key]);
    return Number.isFinite(v) ? v : fallback;
  };

  const fill = gi('fill', -1);
  // Sitzungskennung je geladenem Spielstand (Mod ab 0.5.2, Durchsicht B6); ältere Mods: null
  const session = typeof attrs.session === 'string' && attrs.session ? attrs.session.slice(0, 40) : null;
  let direction = (attrs.dir || 'N').toUpperCase().slice(0, 1);
  if (!['F', 'R', 'N'].includes(direction)) direction = 'N';

  // Version der Mod (ab 0.7.9, hud#mv); ältere Mods: null
  const modVersion = typeof attrs.mv === 'string' && /^\d+(\.\d+){1,3}$/.test(attrs.mv) ? attrs.mv : null;

  return {
    session,
    modVersion,
    speed: gi('speed', 0),
    dir: direction,
    // -1 = unbekannt (kein Gerät/keine Ladung, Mod ab 0.5.1; ältere Mods schreiben dafür 0)
    fill: fill < 0 ? -1 : Math.min(100, fill),
    filltype: (attrs.filltype || '').replace(/\n/g, ' ').trim(),
    cruise: gi('cruise'),
    diesel: gi('diesel'),
    adblue: gi('adblue'),
    hours: gi('hours'),
    rpm: gi('rpm'),
    load: gi('load'),
    damage: gi('damage'),
    dirt: gi('dirt'),
    imp: (attrs.imp || '').replace(/\n/g, ' ').trim(),
    impOn: gi('impOn'),
    impLow: gi('impLow'),
    rig: (attrs.rig || '').trim(),
    // Der Lua-Mod schreibt inVehicle als echtes Bool ("true"/"false", setXMLBool) -- anders als
    // impOn/impLow, die als Zahl (setXMLInt) kommen. Deshalb hier ein reiner String-Vergleich statt gi().
    inVehicle: attrs.inVehicle === 'true',
    // Für den automatischen Profilwechsel (autoSwitchManager.js) -- anders als "imp" oben (das ist
    // wahlweise Fahrzeug- oder gerade fokussierter Anbaugerät-Name, je nach Spiel-Auswahl) IMMER der
    // Name des Hauptfahrzeugs. implementNames vom Lua-Mod Pipe-getrennt geschrieben (XML-Attribute
    // kennen keine Arrays), hier wieder in ein Array aufgesplittet; leere Einträge (z.B. wenn gar
    // nichts angehängt ist) rausgefiltert.
    vehicleName: (attrs.vehicleName || '').trim(),
    // Mod 0.6: feste Kennung des Fahrzeugs (bleibt über Speichern/Laden gleich) und Meldungen des Spiels
    vehicleId: (attrs.vid || '').trim(),
    warn: (attrs.warn || '').trim(),
    note: (attrs.note || '').trim(),
    implementNames: (attrs.implementNames || '').split('|').map(s => s.trim()).filter(Boolean),
    // Position/Karte (12.08.2026) -- posX/posZ/heading fuer die Live-Position auf der Kartenansicht,
    // terrainSize fuer die Umrechnung Weltkoordinate -> Kartenposition (0-1), gleiche Formel wie im
    // Lua-Mod/Diagnose-Code: (x + terrainSize/2) / terrainSize.
    posX: gf('posX', 0),
    posZ: gf('posZ', 0),
    heading: gf('heading'),
    // Vorwärtsvektor des Fahrzeugs (Mod ab 0.4.2) -- Kartendrehung ohne Nachlauf; 0/0 = nicht vorhanden
    fwdX: gf('fwdX', 0),
    fwdZ: gf('fwdZ', 0),
    terrainSize: gf('terrainSize'),
    farmlandId: gi('farmlandId'),
    // Lenksystem/GPS-Steuerungshilfe + aktueller Kurs-Fortschritt (courseSegStates bleibt bewusst ein
    // roher "0101..."-Bitstring -- das Frontend braucht ihn ohnehin wieder indexiert fuers Zeichnen).
    steerOn: attrs.steerOn === 'true',
    steerVal: gf('steerVal', 0),
    steerDistEnd: gf('steerDistEnd'),
    steerOnField: attrs.steerOnField === 'true',
    courseSegIdx: gi('courseSegIdx'),
    courseSegLeft: attrs.courseSegLeft === 'true',
    courseVehX: gf('courseVehX', 0),
    courseVehZ: gf('courseVehZ', 0),
    courseSegStates: attrs.courseSegStates || '',
    courseVer: gi('courseVer', 0),
    // Precision Farming (Stickstoff/pH/Arbeitsbreite/Sprueh-Status) -- V1 zeigt nur den ersten
    // Arbeitsbereich des Geraets, s. Lua-Mod getPrecisionFarmingInfo().
    pfWorkWidth: gf('pfWorkWidth'),
    pfNumSubSections: gi('pfNumSubSections'),
    pfNitrogen: gf('pfNitrogen'),
    pfNitrogenTarget: gf('pfNitrogenTarget'),
    pfPh: gf('pfPh'),
    pfPhTarget: gf('pfPhTarget'),
    pfIsWorking: attrs.pfIsWorking === 'true',
    pfFillLevel: gf('pfFillLevel'),
    pfUsagePerMin: gf('pfUsagePerMin'),
    // Wetter/Uhrzeit/Jahreszeit + Kontostand.
    envHour: gi('envHour'),
    envMinute: gi('envMinute'),
    envSeason: gi('envSeason'),
    envDay: gi('envDay'),
    envSunOn: attrs.envSunOn === 'true',
    money: gi('money'),
    // ---- Erweiterung nach Version 0.95 (Mod-Format 2). Mit einem Mod im Format 1 (alt) fehlen diese
    // Attribute, dann stehen hier die Fallbacks (-1 / '' / false / []).
    format: gi('format', 1),
    seq: gi('seq'),
    motorOn: attrs.motorOn === 'true',
    gear: (attrs.gear || '').trim(),
    gearDir: gi('gearDir', 0),            // 1 vor, -1 zurück, 0 neutral (eingelegt, auch im Stand)
    maxRpm: gi('maxRpm'),
    maxSpeed: gi('maxSpeed'),             // km/h
    motorTemp: gi('motorTemp'),           // °C
    fuelLevel: gf('fuelLevel'),           // Liter (Strom: kWh, Methan: kg)
    fuelCapacity: gf('fuelCapacity'),
    fuelType: attrs.fuelType || '',       // diesel | electric | methane
    defLevel: gf('defLevel'),
    defCapacity: gf('defCapacity'),
    lightsMask: gi('lightsMask'),         // Bitmaske der eingeschalteten Lichttypen
    beacon: attrs.beacon === 'true',
    turnLight: gi('turnLight'),           // 0 aus, 1 links, 2 rechts, 3 Warnblinker
    brakeLight: attrs.brakeLight === 'true',
    handbrake: attrs.handbrake === 'true',
    aiActive: attrs.aiActive === 'true',
    cruiseState: gi('cruiseState'),       // 0 aus, 1 an, 2 Vollgas-Tempomat
    slip: gf('slip'),                     // 0..1
    workWidth: gf('workWidth'),           // m
    brand: (attrs.brand || '').trim(),
    temperature: gf('temperature', -99),  // °C
    weather: attrs.weather || '',         // sun | cloudy | rain | snow | ... (Spiel-Wettertyp)
    period: gi('period'),                 // Spielmonat (1 = März auf der Nordhalbkugel)
    dayInPeriod: gi('dayInPeriod'),
    daysPerPeriod: gi('daysPerPeriod'),
    units: parseUnits(body)
  };
}

/**
 * Liest die separate, selten geschriebene craftConsoleCourse.xml (Feldgrenze + Kurs-Segmente inkl.
 * Wegpunkte) -- eigene, verschachtelte Struktur, deshalb ein eigener Parser statt parseHudXml()
 * mitzunutzen. Kodierung s. Lua-Mod writeCourseFile(): Punkte "x,z", durch "|" getrennt; mehrere
 * Segmente durch ";" getrennt (segMeta und segPositions parallel, gleiche Reihenfolge/Anzahl, da beide
 * in derselben Lua-Schleife befuellt werden).
 */
export function parseCourseXml(xmlText) {
  const tagMatch = xmlText.match(/<course\s+([^>]*)\/>/);
  if (!tagMatch) return null;

  const attrs = {};
  const attrRegex = /(\w+)="([^"]*)"/g;
  let m;
  while ((m = attrRegex.exec(tagMatch[1])) !== null) {
    attrs[m[1]] = m[2];
  }

  const parsePointList = (str) => (str || '')
    .split('|')
    .filter(Boolean)
    .map(pair => pair.split(',').map(Number));

  const segMeta = (attrs.segMeta || '').split(';').filter(Boolean).map(s => {
    const [segmentId, length, isHeadlandSegment, lineGroupIndex] = s.split(',');
    return {
      segmentId: Number(segmentId),
      length: Number(length),
      isHeadlandSegment: isHeadlandSegment === '1',
      lineGroupIndex: Number(lineGroupIndex)
    };
  });
  const segPositions = (attrs.segPositions || '').split(';').map(parsePointList);
  const segments = segMeta.map((meta, i) => ({ ...meta, positions: segPositions[i] || [] }));

  return {
    boundary: parsePointList(attrs.boundary),
    segments,
    implementWidth: parseFloat(attrs.implementWidth),
    workDirection: parseInt(attrs.workDirection, 10),
    rowSpacing: parseFloat(attrs.rowSpacing),
    numHeadlands: parseInt(attrs.numHeadlands, 10)
  };
}

// ---- Karte (Paket D, 21.10.2026): craftConsoleMap.xml (Felder/Höfe) + craftConsoleWorld.xml (Fahrzeuge) ----
const parsePts = (str) => (str || '').split('|').filter(Boolean).map(p => p.split(',').map(Number)).filter(p => p.length === 2 && p.every(Number.isFinite));

export function parseMapXml(text) {
  const head = text.match(tagRe('map', '\\/?>'));
  if (!head || !text.includes('</map>') && !head[0].endsWith('/>')) return null;
  const a = parseAttrs(head[1]);
  const all = (tag) => [...text.matchAll(tagRe(tag, '\\/>', 'g'))].map(m => parseAttrs(m[1]));
  return {
    // Sitzung der Mod (ab 0.7.3, wie roads#session): ControlHub nimmt nur die Karte des geladenen Spielstands
    session: a.session || '',
    name: a.name || '', size: parseFloat(a.size) || null, rev: parseInt(a.rev, 10) || 0, myFarm: parseInt(a.myFarm, 10) || 0,
    // Spielstand-Kennung (Mod 0.5) für den Planer je Spielstand (E2); ohne Mod 0.5 null
    savegame: a.savegame !== undefined ? {
      index: parseInt(a.savegame, 10), name: a.savegameName || '', dir: a.savegameDir || '', mapId: a.mapId || '', multiplayer: a.mp === 'true',
      // dieser PC ist Server (Einzelspiel/Gastgeber) bzw. Gast (Mod 0.7.9, map#server); ältere Mods: null
      server: a.server === 'true' ? true : a.server === 'false' ? false : null
    } : null,
    farms: all('farm').map(f => ({ id: parseInt(f.id, 10), name: f.name || '', color: /^#[0-9a-f]{6}$/i.test(f.color || '') ? f.color : null })),
    fields: all('field').map(f => ({
      id: parseInt(f.id, 10), owner: parseInt(f.owner, 10) || 0, area: parseFloat(f.area),
      pts: parsePts(f.pts), x: f.x !== undefined ? parseFloat(f.x) : null, z: f.z !== undefined ? parseFloat(f.z) : null
    })),
    // Früchte des Spiels (Mod 0.7.4): interner Name (WHEAT …) und Anzeigename -- für die Fruchtfolge im Planer
    fruits: all('fruit').map(f => ({ key: (f.key || '').trim(), title: (f.title || '').trim() })).filter(f => f.key)
  };
}

export function parseWorldXml(text) {
  const head = text.match(tagRe('world', '\\/?>'));
  // wie parseMapXml: erst mit schließendem Tag vollständig (sonst halb geschriebene Datei, letzter Stand bleibt)
  if (!head || !text.includes('</world>') && !head[0].endsWith('/>')) return null;
  const rev = parseInt(parseAttrs(head[1]).rev, 10) || 0;
  const entities = [...text.matchAll(tagRe('e', '\\/>', 'g'))].map(m => {
    const e = parseAttrs(m[1]);
    return { kind: e.kind || 'player', name: e.name || '', farm: parseInt(e.farm, 10) || 0, vehicle: e.vehicle || '',
      x: parseFloat(e.x) || 0, z: parseFloat(e.z) || 0, heading: parseFloat(e.heading) || 0, speed: parseFloat(e.speed) || 0 };
  });
  return { rev, entities };
}

// ---- Arbeitsplaner (Paket E, 21.10.2026; Aufträge seit 22.10.2026 entfernt) ----
export function parsePlanXml(text) {
  const head = text.match(tagRe('plan', '\\/?>'));
  if (!head || !text.includes('</plan>') && !head[0].endsWith('/>')) return null;
  const a = parseAttrs(head[1]);
  const session = a.session || '';   // Mod 0.7.9 (plan#session): ControlHub nimmt nur den Planer der Sitzung
  const fields = [...text.matchAll(tagRe('field', '\\/>', 'g'))].map(m => {
    const f = parseAttrs(m[1]);
    const tasks = {};
    for (const part of (f.tasks || '').split(';').filter(Boolean)) {
      const [k, v] = part.split(':');
      if (k && Number.isFinite(parseFloat(v))) tasks[k] = parseFloat(v);
    }
    const growth = parseInt(f.growth, 10), growthMax = parseInt(f.growthMax, 10);   // Mod 0.6: Wachstumsstufe
    // fruitKey = interner Name der Frucht (Mod 0.7.4); der Planer vergleicht über ihn, fruit ist der Anzeigename
    return { id: parseInt(f.id, 10), area: parseFloat(f.area), phase: f.phase || '', fruit: f.fruit || '', fruitKey: (f.fruitKey || '').trim(), points: parseInt(f.points, 10) || 0, live: f.live === 'true', tasks,
      growth: growth > 0 && growthMax > 0 ? growth : null, growthMax: growth > 0 && growthMax > 0 ? growthMax : null };
  });
  return {
    session, rev: parseInt(a.rev, 10) || 0, rules: { lime: a.lime === 'true', plow: a.plow === 'true', weeds: a.weeds === 'true', stones: a.stones === 'true' }, fields };
}

// Straßennetz (Mod 0.6, craftConsoleRoads.xml): <roads session count><r p="x,z|x,z|…"/>…</roads>
export function parseRoadsXml(text) {
  const head = text.match(tagRe('roads', '\\/?>'));
  if (!head || (!text.includes('</roads>') && !head[0].endsWith('/>'))) return null;
  const a = parseAttrs(head[1]);
  const lines = [...text.matchAll(/<r\s+p="([^"]*)"\s*\/>/g)].map(m => m[1].split('|').map(p => p.split(',').map(Number))
    .filter(p => p.length === 2 && p.every(Number.isFinite))).filter(l => l.length >= 2);
  return { session: a.session || '', lines };
}

export class TelemetryReader {
  // onCourseUpdate ist optional (Bestandsschutz -- bisheriger Aufruf mit nur onUpdate funktioniert
  // unveraendert weiter). Wird nur aufgerufen, wenn sich courseVer seit dem letzten Tick tatsaechlich
  // geaendert hat -- die (potenziell grosse) Kursgeometrie wird NICHT bei jedem Tick gelesen.
  // xmlPath/courseXmlPath: nur für Tests -- ohne Angabe sucht der Reader selbst in modDataDirs().
  constructor(onUpdate, onCourseUpdate = null, xmlPath = null, courseXmlPath = null) {
    this.onUpdate = onUpdate;
    this.onCourseUpdate = onCourseUpdate;
    this.fixedXmlPath = xmlPath;
    this.fixedCourseXmlPath = courseXmlPath;
    this.dataDir = modDataDirs()[0];
    this.dirCheckedAt = 0;
    this.timer = null;
    this.rate = DEFAULT_RATE;
    this.lastCourseVersion = -1;
    this.cachedCourse = null;
    // Lebenszeichen (Phase 1): seq zählt in der Mod jede Schreibrunde hoch (ab Format 2). Steht seq
    // länger als staleMs, schreibt die Mod nicht mehr -> available:false statt eingefrorener Werte.
    this.lastSeq = null;
    this.lastSeqChangeAt = 0;
    this.staleMs = STALE_MIN_MS;
    this.lastSettingsXml = null;
    // Karte (Paket D): Callbacks setzt index.js; cachedMap für neu verbundene Browser
    this.onMap = null;
    this.onWorld = null;
    this.cachedMap = null;
    this.cachedWorld = null;
    // Planer (Paket E): nur relevant, solange ein Gerät den Planer zeigt. Aufträge seit 22.10.2026 entfernt
    // (Spiel hing beim Annehmen eines Auftrags, s. Mod 0.4.1) -- craftConsoleMissions.xml wird nicht mehr gelesen.
    this.onPlan = null;
    this.cachedPlan = null;
    // Straßennetz (Mod 0.6): selten (Datei ändert sich nur einmal je Spielstand)
    this.onRoads = null;
    this.cachedRoads = null;
    this.roadsCheckedAt = 0;
    this.roadsMtime = 0;
    this.planFilesCheckedAt = 0;
    this.fileMtimes = {};
    this.mapMtime = 0;
    this.mapCheckedAt = 0;
    this.worldReadAt = 0;
    this.lastWorldRev = null;
    // Toleranz gegen kurzes "Bild weg"-Flackern (Hendriks Beobachtung): der Lua-Mod schreibt
    // craftConsoleHud.xml vermutlich nicht atomar (kein Temp-Datei-plus-Umbenennen, sondern direktes
    // Überschreiben) -- ein einzelner Poll kann dadurch zufällig genau in ein kurzes
    // Schreib-Fenster fallen und die Datei leer/unvollständig antreffen. Erst nach mehreren
    // AUFEINANDERFOLGENDEN Fehlversuchen wirklich "getrennt" melden, ein einzelner Ausrutscher wird
    // übersprungen (der Client behält einfach den letzten bekannten Stand für einen Tick länger).
    this.consecutiveFailures = 0;
    this.FAILURE_THRESHOLD = 2;
    // 23.10.2026: Abfragen dürfen sich nicht überlappen (langsamer Datenträger, OneDrive), s. poll()
    this.polling = false;
    // „nicht verfügbar“ gedrosselt melden, s. reportUnavailable(); 'ok' | 'stale' | 'missing' | null
    this.availability = null;
    this.unavailableSentAt = 0;
    // Kursdatei: Fehlversuch merken, damit nicht in jedem Takt neu gelesen wird (s. loadCourse())
    this.courseFailedVer = null;
    this.courseFailedAt = 0;
    // letzte Werte von writeModSettings(), um nach einem Ordnerwechsel sofort neu zu schreiben
    this.lastSettingsArgs = null;
    // Durchsicht B6 (23.10.2026): Sitzung der Mod (neuer Spielstand -> alles Zwischengespeicherte vergessen) und
    // Lebenszeichen für die Mod (settings#alive, alle 10 s +1; ohne geht die Mod nach 45 s in den Sparmodus)
    this.session = null;
    this.onSession = null;
    this.alive = 0;
  }

  // Neue Sitzung der Mod (anderer Spielstand geladen, Spiel neu gestartet): Karte, Kurs, Planer und Fahrzeuge der alten
  // Sitzung vergessen, damit sie nicht in die neue hineinragen. @returns true, wenn die Sitzung gewechselt hat
  noteSession(session) {
    if (!session || session === this.session) return false;
    const vorher = this.session;
    this.session = session;
    if (vorher === null) return false;   // erste Sitzung seit dem Start von ControlHub
    this.clearCaches();
    this.lastSeq = null;
    this.onSession?.(session);
    return true;
  }

  get xmlPath() { return this.fixedXmlPath ?? path.join(this.dataDir, 'craftConsoleHud.xml'); }
  get courseXmlPath() { return this.fixedCourseXmlPath ?? path.join(this.dataDir, 'craftConsoleCourse.xml'); }

  // Gelesen wird so oft, wie die Mod schreibt (mindestens 4/s, damit auch ein alter Mod mit festen
  // 250 ms nicht verzögert ankommt).
  pollIntervalMs() {
    return Math.max(33, Math.round(1000 / Math.max(this.rate, DEFAULT_RATE)));
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.poll(), this.pollIntervalMs());
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // Zwischenstände vergessen (Wechsel auf ein Spiel ohne Spieldaten, 23.10.2026) -- sonst bekamen neu verbundene
  // Tablets im eigenen Spiel noch die FS25-Karte, den Kurs und den Planer
  clearCaches() {
    this.cachedMap = null; this.cachedWorld = null; this.cachedPlan = null; this.cachedCourse = null; this.cachedRoads = null; this.roadsMtime = 0;
    this.lastCourseVersion = -1; this.lastWorldRev = null; this.mapMtime = 0; this.fileMtimes = {};
    this.mapAbgelehnt = null; this.roadsAbgelehnt = null;
  }

  // Karte/Straßennetz gehören zur laufenden Sitzung? (Durchsicht 24.10.2026: nach einem Spielstandwechsel lag noch die
  // Datei des alten Spielstands da -- ControlHub las sie wieder ein, bis die Mod die neue schrieb; als Mitspieler schreibt
  // die Mod gar kein Straßennetz, ein altes aus einem Einzelspiel blieb dann stehen.) Ohne Kennung (ältere Mod) wie bisher.
  ausSitzung(d) { return !d?.session || !this.session || d.session === this.session; }

  setRate(rate) {
    this.rate = TELEMETRY_RATES.includes(rate) ? rate : (rate > 25 ? 25 : DEFAULT_RATE); // alte Einstellung 30 -> 25
    if (this.timer) {
      this.stop();
      this.start();
    }
  }

  // Welcher Ordner hat die frischere craftConsoleHud.xml? (Wechsel alte/neue Mod ohne Neustart)
  async resolveDataDir() {
    if (this.fixedXmlPath || Date.now() - this.dirCheckedAt < DIR_CHECK_MS) return;
    this.dirCheckedAt = Date.now();
    let best = null;
    for (const dir of modDataDirs()) {
      try {
        const st = await fs.stat(path.join(dir, 'craftConsoleHud.xml'));
        if (!best || st.mtimeMs > best.mtime) best = { dir, mtime: st.mtimeMs };
      } catch { /* Datei gibt es dort nicht */ }
    }
    if (best && best.dir !== this.dataDir) {
      this.dataDir = best.dir;
      this.lastCourseVersion = -1; // Kurs aus dem neuen Ordner einmal nachladen
      this.courseFailedVer = null;
      // Karte, Planer und Mitspieler aus dem neuen Ordner nachladen, Lebenszeichen neu beginnen
      this.mapMtime = 0;
      this.fileMtimes = {};
      this.lastWorldRev = null;
      this.lastSeq = null;
      // Einstellungen in den neuen Ordner schreiben (Documents ↔ OneDrive) -- sonst blieb die gleiche Datei
      // "schon geschrieben" und landete nie im Ordner, aus dem die Mod liest (23.10.2026)
      this.lastSettingsXml = null;
      if (this.lastSettingsArgs) await this.writeModSettings(...this.lastSettingsArgs).catch(() => {});
    }
  }

  /**
   * Einstellungen für die Mod: <modSettings>/FS25_CraftConsoleHUD/craftConsoleSettings.xml.
   * rate = Schreibrunden pro Sekunde, clients = verbundene Browser (0 -> Mod spart auf 2/s).
   * Nur Takt-Einstellungen, keine Spielbefehle. Geschrieben nur bei Änderung; den Mod-Ordner legt
   * ControlHub nur an, wenn es den modSettings-Ordner des Spiels schon gibt.
   */
  async writeModSettings(clients, planWanted = false, lebenszeichen = false) {
    this.lastSettingsArgs = [clients, planWanted];
    if (lebenszeichen) this.alive = (this.alive + 1) % 1000000;   // alle 10 s (index.js), s. Mod 0.5.2
    // In den Mod-Ordner, aus dem gerade gelesen wird; sonst in den ersten vorhandenen Spielordner
    let dir = istModOrdner(this.dataDir) ? this.dataDir : null;
    if (!dir) {
      for (const g of gameUserDirs()) {
        try { await fs.access(path.join(g, 'modSettings')); dir = path.join(g, 'modSettings', 'FS25_CraftConsoleHUD'); break; } catch { /* nächster */ }
      }
    }
    if (!dir) return;
    // plan="1": ein Gerät zeigt den Arbeitsplaner -> Mod misst die Felder (kostet sonst Leistung)
    const xml = `<?xml version="1.0" encoding="utf-8" standalone="no"?>\n<settings rate="${this.rate}" clients="${clients}" plan="${planWanted ? 1 : 0}" alive="${this.alive}"/>\n`;
    if (xml === this.lastSettingsXml) return;
    try {
      await fs.access(path.dirname(dir));
      await fs.mkdir(dir, { recursive: true });
      // erst in eine Hilfsdatei, dann umbenennen: die Mod liest so nie eine halb geschriebene Datei (Durchsicht 24.10.2026).
      // Hält Windows die Datei gerade offen (Umbenennen scheitert), direkt schreiben wie bisher.
      const ziel = path.join(dir, 'craftConsoleSettings.xml'), tmp = `${ziel}.${process.pid}.${(this.settingsNr = (this.settingsNr || 0) + 1)}.tmp`;
      try {
        await fs.writeFile(tmp, xml, 'utf-8');
        await fs.rename(tmp, ziel);
      } catch {
        await fs.rm(tmp, { force: true }).catch(() => {});
        await fs.writeFile(ziel, xml, 'utf-8');
      }
      this.lastSettingsXml = xml;
    } catch {
      // Spiel (noch) nicht installiert/gestartet -- beim nächsten Aufruf erneut versuchen
    }
  }

  // Eine Abfrage zur Zeit (23.10.2026): setInterval wartet nicht auf das async poll() -- dauerte ein Lesen länger als
  // der Takt (bis 25/s), liefen zwei Abfragen gleichzeitig und meldeten Werte doppelt oder in falscher Reihenfolge.
  async poll() {
    if (this.polling) return;
    this.polling = true;
    try {
      await this.pollOnce();
    } finally {
      this.polling = false;
    }
  }

  async pollOnce() {
    try {
      await this.resolveDataDir();
      const st = await fs.stat(this.xmlPath);
      const xmlText = await fs.readFile(this.xmlPath, 'utf-8');
      const data = parseHudXml(xmlText);
      if (!data) {
        this.handleReadFailure();
        return;
      }
      this.consecutiveFailures = 0;
      this.noteSession(data.session);
      if (data.modVersion !== undefined) this.modVersion = data.modVersion;

      // Datei länger nicht geschrieben -> Mod läuft gerade nicht (Hauptmenü, Spiel beendet). Gilt auch für
      // alte Dateien ohne seq (Mod bis 0.1): Test 22.10.2026, im Hauptmenü kam sonst keine Meldung,
      // ControlHub zeigte die liegengebliebene Datei der alten Mod als „live“ an.
      if (!this.fixedXmlPath && Date.now() - st.mtimeMs > this.staleMs) {
        this.reportUnavailable(true);
        return;
      }

      // Ab Format 2: nur neue Schreibrunden weitergeben, und erkennen, wenn keine mehr kommen
      if (data.seq >= 0) {
        const now = Date.now();
        if (data.seq === this.lastSeq) {
          if (now - this.lastSeqChangeAt > this.staleMs) this.reportUnavailable(true);
          return;
        }
        this.lastSeq = data.seq;
        this.lastSeqChangeAt = now;
      }
      this.availability = 'ok';
      this.onUpdate({ ...data, available: true });

      this.pollMapAndWorld().catch(() => { /* Dateien gibt es (noch) nicht -- kein Fehlerfall */ });

      if (this.onCourseUpdate && data.courseVer !== this.lastCourseVersion) await this.loadCourse(data.courseVer);
    } catch (error) {
      this.handleReadFailure();
    }
  }

  // Kursdatei zu courseVer lesen. lastCourseVersion erst nach erfolgreichem Lesen setzen (23.10.2026): vorher ging ein
  // Kurs verloren, wenn die Datei gerade halb geschrieben war oder noch fehlte -- bis zum nächsten Kurswechsel.
  async loadCourse(ver) {
    const now = Date.now();
    if (ver === this.courseFailedVer && now - this.courseFailedAt < COURSE_RETRY_MS) return;
    try {
      const course = parseCourseXml(await fs.readFile(this.courseXmlPath, 'utf-8'));
      if (course) {
        this.lastCourseVersion = ver;
        this.courseFailedVer = null;
        this.cachedCourse = course;
        this.onCourseUpdate(course);
        return;
      }
    } catch {
      // Kursdatei gibt es (noch) nicht -- kein Fehlerfall, gleich noch einmal versuchen
    }
    this.courseFailedVer = ver;
    this.courseFailedAt = now;
  }

  // „Nicht verfügbar“ beim Wechsel sofort melden, solange es so bleibt höchstens 1×/s (23.10.2026: vorher bei jeder
  // Abfrage, also bis 25×/s an alle Tablets -- die Karte baute dabei jedes Mal ihre Meldung neu auf).
  reportUnavailable(stale) {
    const kind = stale ? 'stale' : 'missing';
    const now = Date.now();
    if (this.availability === kind && now - this.unavailableSentAt < UNAVAILABLE_REPEAT_MS) return;
    this.availability = kind;
    this.unavailableSentAt = now;
    this.onUpdate(stale ? { available: false, stale: true, dir: this.dataDir } : { available: false, dir: this.dataDir });
  }

  // Karte selten (Datei-Änderungszeit alle 2 s prüfen -- nur ein stat, die Mod schreibt sie nur bei Änderung),
  // andere Fahrzeuge höchstens 2×/s
  async pollMapAndWorld() {
    if (this.fixedXmlPath) return; // Tests mit festen Pfaden
    const now = Date.now();
    if (this.onMap && now - this.mapCheckedAt >= 2000) {
      this.mapCheckedAt = now;
      const file = path.join(this.dataDir, 'craftConsoleMap.xml');
      try {
        const st = await fs.stat(file);
        const key = `${st.mtimeMs}|${this.session}`;
        if (st.mtimeMs !== this.mapMtime && key !== this.mapAbgelehnt) {
          const map = parseMapXml(await fs.readFile(file, 'utf-8'));
          if (map && !this.ausSitzung(map)) this.mapAbgelehnt = key;
          else if (map) { this.mapMtime = st.mtimeMs; this.cachedMap = map; this.onMap(map); }
        }
      } catch { /* keine Karte */ }
    }
    if (this.onPlan && now - this.planFilesCheckedAt >= 1000) {
      this.planFilesCheckedAt = now;
      for (const [file, parse, key, cb] of [['craftConsolePlan.xml', parsePlanXml, 'cachedPlan', this.onPlan]]) {
        try {
          const full = path.join(this.dataDir, file);
          const st = await fs.stat(full);
          if (st.mtimeMs === this.fileMtimes[file]) continue;
          const data = parse(await fs.readFile(full, 'utf-8'));
          // Planer einer anderen Sitzung (vorheriger Spielstand, Mod 0.7.9) überspringen; die Mod schreibt bald neu
          if (data && !this.ausSitzung(data)) { this.fileMtimes[file] = st.mtimeMs; continue; }
          if (data) { this.fileMtimes[file] = st.mtimeMs; this[key] = data; cb?.(data); }
        } catch { /* Datei gibt es (noch) nicht */ }
      }
    }
    if (this.onRoads && now - this.roadsCheckedAt >= 5000) {
      this.roadsCheckedAt = now;
      try {
        const file = path.join(this.dataDir, 'craftConsoleRoads.xml');
        const st = await fs.stat(file);
        const key = `${st.mtimeMs}|${this.session}`;
        if (st.mtimeMs !== this.roadsMtime && key !== this.roadsAbgelehnt) {
          const roads = parseRoadsXml(await fs.readFile(file, 'utf-8'));
          if (roads && !this.ausSitzung(roads)) this.roadsAbgelehnt = key;
          else if (roads) { this.roadsMtime = st.mtimeMs; this.cachedRoads = roads; this.onRoads(roads); }
        }
      } catch { /* kein Straßennetz (Mod vor 0.6, MP-Client) */ }
    }
    if (this.onWorld && now - this.worldReadAt >= 450) {
      this.worldReadAt = now;
      try {
        const world = parseWorldXml(await fs.readFile(path.join(this.dataDir, 'craftConsoleWorld.xml'), 'utf-8'));
        if (world && world.rev !== this.lastWorldRev) { this.lastWorldRev = world.rev; this.cachedWorld = world; this.onWorld(world); }
      } catch { /* keine Fahrzeugdatei */ }
    }
  }

  // s. Konstruktor-Kommentar zu consecutiveFailures/FAILURE_THRESHOLD.
  handleReadFailure() {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.FAILURE_THRESHOLD) {
      this.reportUnavailable(false); // mit dir: wo gesucht wird (Hinweis im Dashboard)
    }
    // Unterhalb der Schwelle bewusst NICHTS senden -- der Client behält seinen letzten Stand, bis
    // entweder der nächste Poll wieder erfolgreich ist oder die Schwelle doch erreicht wird.
  }
}
