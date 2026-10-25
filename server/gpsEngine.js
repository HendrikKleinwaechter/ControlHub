/**
 * GPS-Rechnung im Server (Umsetzungsplan Paket I3): Lage des Arbeitsbalkens, Abstand zu Vorgewende und
 * Feldrand, Vorgewende-Auslöser (Ausfahrt/Einfahrt) und Signalton. Läuft im Server, damit die Auslöser
 * auch bei geschlossenem Tablet funktionieren.
 *
 * Koordinaten: Spielwelt x/z. Gerätewerte aus der Mod (Mod 0.5) sind relativ zum Fahrzeug: längs (+ = vorn),
 * quer (+ = links, im Spiel geprüft). Im Menü ist der Seitenversatz + = rechts (Pfeile ← →).
 *
 * Arbeitsfläche = im Feld UND mehr als „Vorgewende“ Meter vom Feldrand entfernt (Feldumriss aus
 * craftConsoleMap.xml). Auslösepunkt: auf dem Balken zwischen der Ecke, die zuerst ins Vorgewende kommt
 * (0 %), und der, die zuletzt kommt (100 %) -- die Überlappung sagt, wie viel vom Balken beim Auslösen im
 * Vorgewende ist. Für die Einfahrt gilt dasselbe Maß rückwärts. Jeder Wechsel löst genau einmal aus.
 *
 * Versatz (Hendrik 24.10.2026): je Richtung −10 … +10 m. Ausgelöst wird, wenn der Auslösepunkt die um den Versatz
 * verschobene Linie überquert (Ausfahrt: + = so weit im Vorgewende, − = schon davor; Einfahrt: + = so weit in der
 * Arbeitsfläche, − = schon davor). Damit nichts doppelt auslöst, muss vorher die Gegenrichtung passiert sein
 * (st.phase / st.scharf). Der Zustand Arbeitsfläche/Vorgewende für Anzeige und Werte bleibt an der Linie selbst.
 * Vorgewendeautomatik aus (config.automatik) = keine Aktionen, der Ton bleibt.
 */

import '../public/js/teilbreiten.js';

const HYST = 0.2;          // m -- verhindert Flattern genau an der Linie
const MIN_SPEED = 1;       // km/h -- darunter (und rückwärts) keine Zustandswechsel
const DIST_EVERY_MS = 100; // Abstände voraus höchstens 10×/s rechnen
const JUMP_M = 20;         // m zwischen zwei Schreibrunden -- mehr ist kein Fahren (Teleport, Spielstand neu geladen)

// ---------- Vektoren / Fahrzeugrahmen ----------
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Fahrzeuglage: Position + Vorwärtsvektor (Mod ab 0.4.2); links = (fz, -fx), passend zu Mod relToVehicle
export function vehicleFrame(d) {
  const fl = Math.hypot(d?.fwdX || 0, d?.fwdZ || 0);
  if (!d || d.available === false || !(fl > 0.1) || !Number.isFinite(d.posX) || !Number.isFinite(d.posZ)) return null;
  const fx = d.fwdX / fl, fz = d.fwdZ / fl;
  return { x: d.posX, z: d.posZ, fx, fz };
}
export function toWorld(F, along, across) {
  return [F.x + F.fx * along + F.fz * across, F.z + F.fz * along - F.fx * across];
}

// ---------- Gerät aus den Mod-Daten ----------
// GPS-Gerät: das von Hand festgelegte („Als GPS-Gerät verwenden“, Seite GPS-Geräte), solange es angehängt ist; sonst
// das ausgewählte mit Arbeitsbereich, sonst das erste hinten, sonst vorne (Mod-Reihenfolge)
export function pickUnit(units, fest = null) {
  const list = Array.isArray(units) ? units : [];
  if (fest) { const f = list.find(u => u.name === fest); if (f) return f; }
  // nur echte Arbeitsbereiche (Durchsicht 24.10.2026: der Mähdrescher selbst hat nur Auswurf und Krautablage)
  const KEINE = globalThis.Teilbreiten?.KEINE_ARBEIT || new Set();
  const work = list.filter(u => (u.areas || []).some(a => !(typeof a.type === 'string' && KEINE.has(a.type))));
  const impl = list.filter(u => u.side === 'front' || u.side === 'rear');
  return work.find(u => u.selected) || work.find(u => u.side === 'rear' && u.depth === 1) || work.find(u => u.side === 'rear')
    || work.find(u => u.side === 'front') || work[0]
    || impl.find(u => u.selected) || impl.find(u => u.side === 'rear') || impl[0] || null;
}

// Arbeitsbereich wie Karte und Fläche (public/js/teilbreiten.js arbeitsbereich): Teilbreiten über alle aktiven Bereiche,
// Flügel nebeneinander zusammen, Pflug der breiteste, ohne Auswurf
function mainArea(unit) {
  return globalThis.Teilbreiten?.arbeitsbereich(unit) || null;
}

/**
 * Werte „aus dem Spiel“ für das Menü und das Modell (relativ zum Fahrzeug).
 * @returns {null|{side, attach, width, lat, pos, drawbar, hitchAlong, corners, pose}}
 */
export function autoValues(unit) {
  if (!unit) return null;
  const side = unit.side === 'front' ? 'front' : 'rear';
  const attach = unit.attach || (side === 'front' ? 'mounted' : null);
  const hitchAlong = unit.joint ? unit.joint.along : null;
  const area = mainArea(unit);
  // Knickwinkel aus den Arbeitsbereichen (gezogen), sonst pose.angle -- s. public/js/teilbreiten.js geraeteWinkel (24.10.2026)
  const winkel = globalThis.Teilbreiten?.geraeteWinkel(unit) ?? unit.pose?.angle;
  const r = { name: unit.name, side, attach, hitchAlong, hitchAcross: unit.joint ? unit.joint.across : 0, pose: unit.pose || null,
    winkel: Number.isFinite(winkel) ? winkel : null, corners: null, width: null, lat: null, pos: null, drawbar: null };
  if (unit.joint && unit.pose && attach === 'trailed') {
    r.drawbar = Math.round(Math.hypot(unit.pose.along - unit.joint.along, unit.pose.across - unit.joint.across) * 100) / 100;
  }
  if (area) {
    r.corners = area.corners;
    // Im eigenen Rahmen messen, sobald das Spiel die Lage des Geräts kennt -- nicht nur bei der Anhängekupplung: viele
    // gezogene Sämaschinen und Grubber hängen mit Deichsel an den Unterlenkern, das Spiel meldet dann „angebaut“
    // (Hendrik 24.10.2026: „verschiebt sich nur parallel und knickt nicht ab“). Starr angebaut ist der Winkel ohnehin 0.
    const trailedFrame = unit.pose && r.winkel != null && unit.joint && side === 'rear';
    if (trailedFrame) {
      // Angehängt (Test 23.10.2026, Anmerkung 7): Breite, Abstand und Seitenversatz im eigenen Rahmen des Geräts messen.
      // Vorher quer zum Traktor -- beim Abknicken in der Kurve änderten sich die Werte ständig, das Gerät schwenkte zu
      // stark und unruhig aus. Geräte-Vorwärts im Fahrzeugrahmen = (cos θ, −sin θ), links = (sin θ, cos θ).
      const t = r.winkel * Math.PI / 180, cs = Math.cos(t), sn = Math.sin(t);
      const loc = area.corners.map(([a, c]) => {
        const da = a - unit.joint.along, dc = c - unit.joint.across;
        return [da * cs - dc * sn, da * sn + dc * cs];
      });
      const qs = loc.map(p => p[1]), ls = loc.map(p => p[0]);
      const qMin = Math.min(...qs), qMax = Math.max(...qs);
      r.width = Math.round((qMax - qMin) * 100) / 100;
      r.lat = Math.round(-((qMax + qMin) / 2) * 100) / 100;          // Menü: + = rechts
      r.pos = Math.round(Math.abs(ls.reduce((s, v) => s + v, 0) / ls.length) * 100) / 100;
    } else {
      const qs = area.corners.map(c => c[1]);
      const ls = area.corners.map(c => c[0]);
      const qMin = Math.min(...qs), qMax = Math.max(...qs);
      const along = ls.reduce((s, v) => s + v, 0) / ls.length;
      r.width = Math.round((qMax - qMin) * 100) / 100;
      r.lat = Math.round(-((qMax + qMin) / 2) * 100) / 100;          // Menü: + = rechts
      if (hitchAlong != null) r.pos = Math.round(Math.abs(side === 'front' ? along - hitchAlong : hitchAlong - along) * 100) / 100;
    }
  }
  return r;
}

// Ist irgendein Wert von Hand gesetzt? Dann rechnet ControlHub selbst (Modell), sonst echte Ecken aus dem Spiel.
export function isManual(live) {
  return live.side !== 'auto' || live.attach !== 'auto' || live.pos != null || live.lat != null || live.width != null || live.drawbar != null;
}

/**
 * Ecken des Arbeitsbalkens in Weltkoordinaten.
 * @param {object} live   Einstellungen (gpsManager)
 * @param {object|null} auto  autoValues()
 * @param {object} F      vehicleFrame()
 * @param {object} st     Zustand für das Deichselmodell ({axle})
 * @param {number} [fallbackWidth]
 */
export function footprint(live, auto, F, st, fallbackWidth) {
  if (!F) return null;
  if (!isManual(live) && auto?.corners) return { corners: auto.corners.map(([a, c]) => toWorld(F, a, c)), source: 'spiel' };
  const side = live.side !== 'auto' ? live.side : (auto?.side || 'rear');
  const attach = side === 'front' ? 'mounted' : (live.attach !== 'auto' ? live.attach : (auto?.attach || 'mounted'));
  const width = live.width ?? auto?.width ?? (fallbackWidth > 0 ? fallbackWidth : 6);
  const across = -(live.lat ?? auto?.lat ?? 0);
  const pos = live.pos ?? auto?.pos ?? (side === 'front' ? 1 : 3);
  const hitchAlong = auto?.hitchAlong ?? (side === 'front' ? 2.5 : -2);
  const knick = auto?.winkel ?? auto?.pose?.angle;
  // Starr nur vorn oder wenn „angebaut“ von Hand gewählt ist; sonst knickt der Balken mit dem Gerät, sobald das Spiel
  // dessen Lage meldet -- auch bei Unterlenker-Deichseln, die das Spiel als „angebaut“ führt (Hendrik 24.10.2026)
  const starr = side === 'front' || live.attach === 'mounted' || (attach === 'mounted' && !(auto?.pose && Number.isFinite(knick)));
  if (starr) {
    const a = side === 'front' ? hitchAlong + pos : hitchAlong - pos;
    const q = across + (side === 'front' ? 0 : auto?.hitchAcross || 0);   // hinten misst autoValues relativ zur Kupplung
    return { corners: [toWorld(F, a, q + width / 2), toWorld(F, a, q - width / 2)], source: 'hand' };
  }
  // Angehängt: Gerät zeigt von seiner Lage zur Kupplung. Lage aus dem Spiel, sonst Deichselmodell
  // (Achspunkt folgt der Kupplung wie ein Anhänger, Abstand = Deichsel).
  // Anhängepunkt mit seinem Seitenversatz (autoValues misst lat relativ dazu, Durchsicht 24.10.2026)
  const H = toWorld(F, hitchAlong, auto?.hitchAcross || 0);
  let back;
  if (auto?.pose && Number.isFinite(knick)) {
    // Richtung aus dem Knickwinkel des Geräts im Spiel (Test 23.10.2026) statt aus Kupplung → Gerätemitte: liegt der
    // Nullpunkt des Geräts nah an der Kupplung, sprang die Richtung von Bild zu Bild
    const t = knick * Math.PI / 180;
    back = [-(F.fx * Math.cos(t) - F.fz * Math.sin(t)), -(F.fx * Math.sin(t) + F.fz * Math.cos(t))];
  } else if (auto?.pose) {
    const P = toWorld(F, auto.pose.along, auto.pose.across);
    back = [P[0] - H[0], P[1] - H[1]];
  } else {
    const L = live.drawbar ?? auto?.drawbar ?? 4;
    if (!st.axle || dist(st.axle, H) > L * 3) st.axle = toWorld(F, hitchAlong - L, 0);
    const dl = dist(st.axle, H) || 1;
    st.axle = [H[0] + (st.axle[0] - H[0]) / dl * L, H[1] + (st.axle[1] - H[1]) / dl * L];
    back = [st.axle[0] - H[0], st.axle[1] - H[1]];
  }
  const bl = Math.hypot(back[0], back[1]) || 1;
  const bx = -back[0] / bl, bz = -back[1] / bl;          // Gerät vorwärts
  const C = [H[0] - bx * pos + bz * across, H[1] - bz * pos - bx * across];
  const half = width / 2;
  return { corners: [[C[0] + bz * half, C[1] - bx * half], [C[0] - bz * half, C[1] + bx * half]], source: 'hand' };
}

// ---------- Feldgeometrie ----------
function pip(pts, x, z) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function edgeDist(pts, x, z) {
  let best = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, az] = pts[j], [bx, bz] = pts[i];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    const d = Math.hypot(x - (ax + t * dx), z - (az + t * dz));
    if (d < best) best = d;
  }
  return best;
}
// > 0 = Arbeitsfläche (so viele Meter vor dem Vorgewende), ≤ 0 = Vorgewende bzw. außerhalb
export function workDepth(field, p, headland) {
  const d = edgeDist(field.pts, p[0], p[1]);
  return pip(field.pts, p[0], p[1]) ? d - headland : -d - headland;
}

// Inhalt der Karte (23.10.2026): Karte, Spielstand, eigener Hof, Felder mit Umriss. setMap() lädt neu, wenn sich das
// ändert -- die rev allein reicht nicht, sie beginnt nach einem Spielneustart wieder bei 1.
export function mapSignature(map) {
  if (!map) return null;
  const sg = map.savegame;
  const parts = [map.name || '', map.size ?? '', map.myFarm ?? '', sg ? `${sg.index}|${sg.dir}|${sg.mapId}|${sg.name}` : '', (map.fields || []).length];
  for (const f of map.fields || []) {
    const pts = Array.isArray(f.pts) ? f.pts : [];
    let sx = 0, sz = 0;
    for (const p of pts) { sx += p[0]; sz += p[1]; }
    parts.push(`${f.id}:${f.owner}:${pts.length}:${Math.round(sx * 10)}:${Math.round(sz * 10)}:${f.x ?? ''}:${f.z ?? ''}`);
  }
  return parts.join(';');
}

export class FieldIndex {
  constructor(map, sig = mapSignature(map)) {
    this.rev = map?.rev ?? null;
    this.sig = sig;
    this.fields = (map?.fields || []).filter(f => Array.isArray(f.pts) && f.pts.length >= 3).map(f => {
      const xs = f.pts.map(p => p[0]), zs = f.pts.map(p => p[1]);
      return { id: f.id, owner: f.owner, pts: f.pts, box: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] };
    });
  }
  at(p) {
    return this.fields.find(f => p[0] >= f.box[0] && p[0] <= f.box[2] && p[1] >= f.box[1] && p[1] <= f.box[3] && pip(f.pts, p[0], p[1])) || null;
  }
}

// Weg in Fahrtrichtung, bis workDepth ≤ 0 (bzw. bei headland 0 bis zum Feldrand); null = nicht in Reichweite
export function aheadDistance(field, p0, dir, headland, maxD = 200) {
  const at = (s) => workDepth(field, [p0[0] + dir[0] * s, p0[1] + dir[1] * s], headland);
  if (at(0) <= 0) return 0;
  let lo = 0, hi = null;
  for (let s = 2; s <= maxD; s += 2) { if (at(s) <= 0) { hi = s; break; } lo = s; }
  if (hi == null) return null;
  for (let i = 0; i < 10; i++) { const m = (lo + hi) / 2; if (at(m) <= 0) hi = m; else lo = m; }
  return Math.round(hi * 10) / 10;
}

// ---------- Auslöser ----------
export class GpsEngine {
  /**
   * @param {object} deps { getManager: () => GpsManager, mapping: MappingEngine, beepArmrest: (ms) => Promise,
   *   emit: (event, payload) => void }
   */
  constructor(deps) {
    this.deps = deps;
    this.index = new FieldIndex(null);
    this.kurs = null;   // Feldgrenze der Spurführung (setKurs)
    this.st = { state: null, fieldId: null, axle: null, unitName: null, vehicleName: null, lastPos: null, lastDistAt: 0, ahead: { headland: null, edge: null } };
  }

  // Neu laden bei anderer rev ODER anderem Inhalt (nach einem Spielneustart kommt wieder rev 1, s. mapSignature)
  setMap(map) {
    if (!map) return;
    const sig = mapSignature(map);
    if (map.rev !== this.index.rev || sig !== this.index.sig) this.index = new FieldIndex(map, sig);
  }

  // Feldgrenze der Spurführung des Spiels (24.10.2026, Hendrik: „Wenn ich Felder größer mache mit dem Pflug … die
  // Spurführung wird ja angepasst auf die erweiterte Fläche“): das Spiel ermittelt sie aus dem bearbeiteten Boden, die
  // Feldumrisse der Karte bleiben dagegen, wie der Kartenbauer sie angelegt hat. Kurs des aktuellen Fahrzeugs (auch der
  // zuletzt aktive, s. Mod writeCourseFile); ohne Grenze null.
  setKurs(course) {
    const pts = (course?.boundary || []).filter(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite));
    if (pts.length < 3) { this.kurs = null; return; }
    const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
    this.kurs = { pts, box: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)], feldId: null };
  }
  imKurs(p) {
    const k = this.kurs;
    return k && p[0] >= k.box[0] && p[0] <= k.box[2] && p[1] >= k.box[1] && p[1] <= k.box[3] && pip(k.pts, p[0], p[1]) ? k : null;
  }
  // Feld an einer Stelle: in der Grenze der Spurführung diese (mit der Nummer des Kartenfelds, in dem sie liegt -- auch im
  // erweiterten Teil, wo kein Kartenfeld ist), sonst der Umriss der Karte
  feldAn(...punkte) {
    const k = punkte.map(p => this.imKurs(p)).find(Boolean);
    if (k) {
      const id = punkte.map(p => this.index.at(p)?.id).find(x => x != null) ?? k.feldId ?? 'spurfuehrung';
      k.feldId = id;
      return { id, pts: k.pts, box: k.box, spurfuehrung: true };
    }
    return punkte.map(p => this.index.at(p)).find(Boolean) || null;
  }

  // Arbeitsfläche/Vorgewende vergessen: der nächste Takt ordnet neu ein, ohne auszulösen
  resetState() {
    const st = this.st;
    st.state = null; st.fieldId = null; st.axle = null; st.lastPos = null; st.phase = null; st.scharf = false;
    st.ahead = { headland: null, edge: null };
  }

  reset() { this.resetState(); this.st.vehicleName = null; }

  /**
   * Eine Schreibrunde der Mod: rechnet, löst ggf. aus und hängt data.gps sowie data.base.headlandAheadM/
   * fieldEdgeAheadM an (für Karte, Werteliste, Menü).
   */
  tick(data) {
    const mgr = this.deps.getManager();
    if (!data) return;
    const st = this.st;
    // 23.10.2026: Zustand vergessen, wenn das Spiel weg ist, das Fahrzeug wechselt oder die Lage springt -- sonst
    // löste danach „Ausfahrt“ aus, ohne dass vorher eine echte Einfahrt war.
    if (data.available === false) { this.resetState(); return; }
    if (!mgr) return;
    const vehicleName = data.vehicleName || '';
    if (vehicleName !== st.vehicleName) {
      if (st.vehicleName !== null) this.resetState();
      st.vehicleName = vehicleName;
    }
    const live = mgr.live;
    const unit = pickUnit(data.units, mgr.config.gpsEinheit);
    if (unit?.name && unit.name !== st.unitName) {
      st.unitName = unit.name;
      st.axle = null;
      mgr.onUnitChanged(unit.name).then(r => { if (r) this.deps.emit('gps-changed', { ...mgr.summary(), event: r }); }).catch(() => {});
    }
    const auto = autoValues(unit);
    const F = vehicleFrame(data);
    if (F) {
      if (st.lastPos && Math.hypot(F.x - st.lastPos[0], F.z - st.lastPos[1]) > JUMP_M) this.resetState();
      st.lastPos = [F.x, F.z];
    } else {
      st.lastPos = null;
    }
    const fp = footprint(live, auto, F, st, data.workWidth);
    const gps = {
      device: live.name, current: mgr.config.current, dirty: mgr.isDirty(), beep: mgr.config.beep, unit: unit?.name || null,
      // je Richtung Aktion und Ton (Anmerkung 20); armed = irgendeine Aktion an (Werteliste, Takt der Mod)
      act: { exit: live.exitAct, entry: live.entryAct }, ton: { exit: live.exitBeep, entry: live.entryBeep },
      versatz: { exit: live.exitOffset || 0, entry: live.entryOffset || 0 },
      automatik: mgr.config.automatik !== false,
      armed: mgr.config.automatik !== false && (live.exitAct || live.entryAct), fest: mgr.config.gpsEinheit,
      // manual: Werte wirklich von Hand gesetzt. Sonst ist ein „hand“-Balken nur die Rechnung ohne Arbeitsbereich aus dem
      // Spiel (z. B. Teilbreiten alle aus, Anhänger) -- Karte und Fläche nehmen ihn dann nicht (Durchsicht 24.10.2026)
      auto, source: fp?.source || null, manual: isManual(live), corners: fp?.corners || null, anchor: null, state: 'outside', fieldId: null,
      headland: live.headland, overlap: live.overlap, headlandAheadM: null, fieldEdgeAheadM: null,
      geraete: mgr.mapOptions()   // je Gerät „auf der Karte zeigen“ und „zählt als bearbeitet“ (Test 23.10.2026)
    };
    data.gps = gps;
    if (!fp || !F) { st.state = null; return; }

    const center = lerp(fp.corners[0], fp.corners[fp.corners.length > 2 ? 2 : 1], 0.5);
    let field = this.feldAn(center, [F.x, F.z]);
    if (!field && st.fieldId != null) {   // Wendemanöver: kurz über den Rand hinaus → Feld behalten, wenn nah
      const k = this.kurs;
      const last = k && k.feldId === st.fieldId ? { id: st.fieldId, pts: k.pts, box: k.box, spurfuehrung: true } : this.index.fields.find(f => f.id === st.fieldId);
      if (last && workDepth(last, center, 0) > -30) field = last;
    }
    if (!field) { st.state = 'outside'; st.fieldId = null; return; }
    if (field.id !== st.fieldId) { st.fieldId = field.id; st.state = null; }

    const H = live.headland;
    const depths = fp.corners.map(c => workDepth(field, c, H));
    const iLo = depths.indexOf(Math.min(...depths)), iHi = depths.indexOf(Math.max(...depths));
    const anchor = lerp(fp.corners[iLo], fp.corners[iHi], live.overlap / 100);
    const da = workDepth(field, anchor, H);
    gps.anchor = anchor;
    gps.fieldId = field.id;
    gps.feldGrenze = field.spurfuehrung ? 'spurfuehrung' : 'karte';

    const speed = data.base?.speedKmh ?? data.speed ?? 0;
    const forward = (data.base?.direction || data.dir) === 'F' && speed >= MIN_SPEED;
    // Anzeige: Arbeitsfläche/Vorgewende an der Linie selbst
    if (st.state !== 'work' && st.state !== 'headland') st.state = da > 0 ? 'work' : 'headland';
    else if (forward && st.state === 'work' && da < -HYST) st.state = 'headland';
    else if (forward && st.state === 'headland' && da > HYST) st.state = 'work';
    // Auslösen an den verschobenen Linien: Ausfahrt bei da < −Versatz, Einfahrt bei da > Versatz
    const tExit = -(live.exitOffset || 0), tEntry = live.entryOffset || 0;
    if (st.phase !== 'work' && st.phase !== 'headland') {
      st.phase = st.state;                                // erster Stand: nichts auslösen
      st.scharf = st.phase === 'work' ? da > tExit + HYST : da < tEntry - HYST;
    } else if (st.phase === 'work') {
      if (da > tExit + HYST) st.scharf = true;
      if (forward && st.scharf && da < tExit - HYST) { st.phase = 'headland'; st.scharf = da < tEntry - HYST; this.fire('exit', live, mgr); }
    } else {
      if (da < tEntry - HYST) st.scharf = true;
      if (forward && st.scharf && da > tEntry + HYST) { st.phase = 'work'; st.scharf = da > tExit + HYST; this.fire('entry', live, mgr); }
    }
    gps.state = st.state;

    // Abstand voraus (gedrosselt): Vorgewende ab dem Auslösepunkt, Feldrand ab der vordersten Ecke
    const now = Date.now();
    if (now - st.lastDistAt >= DIST_EVERY_MS) {
      st.lastDistAt = now;
      const dir = [F.fx, F.fz];
      st.ahead.headland = st.state === 'work' ? aheadDistance(field, anchor, dir, H) : null;
      const front = fp.corners.reduce((best, c) => ((c[0] - F.x) * F.fx + (c[1] - F.z) * F.fz > (best[0] - F.x) * F.fx + (best[1] - F.z) * F.fz ? c : best), fp.corners[0]);
      st.ahead.edge = aheadDistance(field, front, dir, 0);
    }
    gps.headlandAheadM = st.ahead.headland;
    gps.fieldEdgeAheadM = st.ahead.edge;
    if (data.base) {
      data.base.headlandAheadM = st.ahead.headland;
      data.base.fieldEdgeAheadM = st.ahead.edge;
    }
  }

  // Auslösen: Aktion wie ein kurzer Tastendruck (Bedingung „nur wenn …“ mit automatisch = unbekannt sperrt).
  // Je Richtung eigene Schalter für Aktion und Ton (Anmerkung 20, 23.10.2026; vorher Hauptschalter + Signalton-Zeile).
  // Ton je Gerät nur beim Einfahren, nur beim Ausfahren oder bei beidem (Test 23.10.2026); Armlehne: Ausfahrt =
  // zwei kurze Töne, Einfahrt = einer, damit man beides am Klang unterscheidet.
  fire(kind, live, mgr) {
    const action = live[kind];
    const act = kind === 'exit' ? live.exitAct : live.entryAct;
    let sent = false;
    const automatik = mgr.config.automatik !== false;
    if (act && action && automatik) sent = this.deps.mapping.fireAutomatic(action.functionId || action.quickActions);
    const beep = (kind === 'exit' ? live.exitBeep : live.entryBeep) ? mgr.config.beep : 'aus';
    if (beep === 'armlehne' || beep === 'beide') {
      const piep = () => this.deps.beepArmrest?.(70)?.catch?.(() => {});
      piep();
      if (kind === 'exit') setTimeout(piep, 180);
    }
    this.deps.emit('gps-trigger', { kind, device: live.name, armed: !!act && automatik, sent, beep, at: Date.now() });
  }
}
