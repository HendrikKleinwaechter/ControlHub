/**
 * Kartenansicht (Dashboard-Unterseite "Karte", 12.08.2026): Feldgrenze + GPS-Spurführungslinie +
 * Fahrzeug-/Arbeitsbereich-Symbol (echte Meter-Größe) + Hervorhebung der Lenkführungs-Linie.
 *
 * Kamera folgt dem Fahrzeug (immer zentriert, Hendriks Wunsch), Default "Heading-up": die Welt dreht
 * sich um das Fahrzeug, das Symbol selbst zeigt fest nach oben (per 🧭-Taste umschaltbar auf Nord-oben,
 * dort dreht sich stattdessen das Symbol). Die Fahrzeugposition wird zwischen zwei 250ms-Telemetrie-
 * Ticks per requestAnimationFrame INTERPOLIERT (this.displayPos) statt bei jedem Tick zu springen --
 * ohne das wirkte die Bewegung bei Hendriks Test "ruckelig", da 250ms bei normalem Lenktempo schon ein
 * spürbarer Sprung sind. Kamera-Zentrierung UND Symbol-Position nutzen beide this.displayPos, dadurch
 * bleiben sie zwangsläufig konsistent (kein "Symbol läuft der Kamera davon"-Effekt).
 *
 * Zwei übereinanderliegende <canvas>-Ebenen (Feldgeometrie/Live-Position) bleiben aus Code-Klarheit
 * erhalten, werden aber jetzt bei JEDEM Animationsframe (nicht nur jedem Tick) neu gezeichnet -- für die
 * geringe Punktezahl (Feldgrenze + wenige Kurs-Segmente) ist das für Canvas 2D auch bei 60fps trivial.
 *
 * Die "bereits bearbeitet"-Einfärbung (courseSegStates) wurde nach Hendriks Test wieder entfernt: sie
 * hätte ohnehin nur die ganze Linie markiert, nicht die tatsächlich bearbeitete Fläche -- Feature erst
 * mal weggelassen (12.08.2026).
 *
 * Socket.IO über die gemeinsame Verbindung window.hubSocket (seit 23.10.2026, B4) statt window.app.socket (gleicher Grund wie telemetry.js/dashboard.js --
 * dieses Skript lädt synchron vor app.js' DOMContentLoaded-Handler).
 */

const TICK_INTERVAL_MS = 250; // Startwert; seit 22.10.2026 wird der echte Paketabstand gemessen (tickIntervalMs)
// Fahrtrichtung geglättet (Hendrik 22.10.2026: „Karte wackelt stark hin und her“): Richtung über eine
// Wegstrecke (je nach Glättungsstufe) statt von Paket zu Paket (bei 20/s nur ~14 cm -- Federungszittern reichte für Sprünge),
// dazu zeitbasierte Trägheit, damit es bei 4/s und 20/s gleich ruhig wirkt.
// Stufen seit dem Test vom 23.10.2026 für alle Geräte gleich (Einstellungen → Karte → „Glättung“, server/routes/karte.js;
// vorher je Gerät bzw. je Kartenkachel): Wegstrecke für
// die Richtung (m) + Trägheit (s). „mittel“ = abgestimmt: Streuung 0,44° statt 5,1°, Kurvennachlauf ~14°.
// tauVehS: Trägheit, wenn die Mod (ab 0.4.2) die echte Fahrzeug-Ausrichtung mitschickt -- die zittert nicht,
// deshalb reicht dort sehr wenig Glättung (Hendrik 22.10.: mit 2 m / 0,3 s „hängt zu stark nach“).
const MAP_SMOOTHING = {
  aus: { baseM: 0.3, tauS: 0, tauVehS: 0 },
  wenig: { baseM: 1.0, tauS: 0.15, tauVehS: 0.05 },
  mittel: { baseM: 2.0, tauS: 0.3, tauVehS: 0.1 },
  stark: { baseM: 4.0, tauS: 0.6, tauVehS: 0.25 }
};
const MAP_SETTING_FPS = 'map.fps';               // 'maximal' = Bildschirmtakt, 'flussig' = 30 Bilder/s, 'sparsam' = im Datentakt (mind. 10)
const MAP_FPS_MODI = ['maximal', 'flussig', 'sparsam'];
const mapSettingRead = (k, def) => { try { return localStorage.getItem(k) ?? def; } catch { return def; } };
const mapSettingWrite = (k, v) => { try { localStorage.setItem(k, v); } catch { /* privat/gesperrt -- egal */ } };
// Ansicht (2D/3D, Norden oben) und Zoom je Fahrzeug (Hendrik 24.10.2026: „sollten immer je Fahrzeug gespeichert sein
// (je Fahrzeug, nicht nach Gerät!)“; vorher setzte die Kachel beim Wiedereinhängen ihre Ausrichtung neu → zurück auf 2D).
// Schlüssel = feste Fahrzeugkennung aus dem Spiel (vid, Mod ab 0.6), sonst der Name; je Browser gespeichert.
const ANSICHT_KEY = 'karte.ansichtJeFahrzeug';
const ANSICHT_MAX = 100;
const ladeAnsichten = () => { try { return JSON.parse(mapSettingRead(ANSICHT_KEY, '{}')) || {}; } catch { return {}; } };
// Bildrate der Karte (Hendrik 22.10.2026): nur zeichnen, solange die Karte zu sehen ist; höchstens 30 Bilder/s.
// Je Gerät: „flüssig“ = 30 (Standard), „sparsam“ = so oft, wie Daten kommen (4/10/20/25), mindestens 10, damit
// das Symbol bei 4 Paketen/s trotzdem weich gleitet; beim Ziehen/Zoomen kurz 30. Vorher ~60/s, auch im Hintergrund.
// Seit 25.10.2026 Standard „maximal“ = ungedrosselt im Bildschirmtakt (meist 60), Hendrik: „Es soll möglichst auf bester
// Leistung laufen … die Aktualisierung der Karte so hoch wie möglich“; „flüssig“ und „sparsam“ für ältere Tablets.
const MAP_FPS_MAX = 30;
const MAP_FPS_MIN = 10;
const TRACTOR_LENGTH_M = 3;      // Hendriks Vorgabe: feste, maßstabsgetreue Fahrzeuggröße statt fixer Pixel
const TRACTOR_HALF_WIDTH_M = 1;
const IMPLEMENT_DEPTH_M = 0.8;   // "schmal" -- der Arbeitsbereich-Balken braucht keine reale Gerätelänge
// Abstand zwischen Fahrzeug-Heck und Arbeitsbereich-Balken -- jetzt EINSTELLBAR (Hendriks Wunsch,
// 13.08.2026: per +/- in 0,5m-Schritten), s. this.implementGapM/adjustImplementGap() in der Klasse
// unten. Die drei Konstanten hier sind nur noch Default/Schrittweite/Grenzen.
const IMPLEMENT_GAP_DEFAULT_M = 0.5;
const IMPLEMENT_GAP_STEP_M = 0.5;
const IMPLEMENT_GAP_MIN_M = 0;
const IMPLEMENT_GAP_MAX_M = 15;
// Zwei wählbare Farben für die "bereits bearbeitet"-Fläche (Hendriks Wunsch, 13.08.2026: Taste zum
// Umschalten Blau/Grün) -- Fläche etwas transparenter (0.4) als die Legenden-Farbe (0.6), damit
// darunterliegende Feldgrenze/Spurführung noch erkennbar bleiben.
const COVERAGE_COLOR_BLUE = { fill: 'rgba(58, 140, 176, 0.4)', legend: 'rgba(58, 140, 176, 0.6)', doppelt: 'rgb(26, 63, 79)' };
const COVERAGE_COLOR_GREEN = { fill: 'rgba(74, 156, 47, 0.4)', legend: 'rgba(74, 156, 47, 0.6)', doppelt: 'rgb(33, 70, 21)' };

// Fahrzeugsymbole in der Draufsicht (Mockup 22.10.2026, wählbar in der Kartenkachel), Einheit 0,1 m, vorne = −y,
// Nullpunkt = Fahrzeugposition. Traktor 2,8 × 4,8 m. Teile: w = Rad, r = Rechteck (x, y, b, h, Rundung, Farbe),
// l = Linie, p = Vieleck, q = Bogen (Auswurfkrümmer), c = Kreis.
const VEHICLE_SYMBOLS = {
  traktor: [
    ['w', -14, -1, 5.5, 16, 2], ['w', 8.5, -1, 5.5, 16, 2], ['l', -10, -21.5, 10, -21.5],
    ['w', -12, -26, 4, 9, 1.5], ['w', 8, -26, 4, 9, 1.5],
    ['r', -2.5, 11, 5, 7, 0, '#8b93a1'], ['r', -6, -30, 12, 3, 1, '#8b93a1'], ['r', -5, -28, 10, 22, 3.5, '#c3c9d2'],
    ['r', -8, -7, 16, 18, 3, '#e8ebee'], ['r', -6.5, -6, 13, 3, 1, '#5c6470'], ['r', -5.5, -1, 11, 10, 2, '#d1d6dd']
  ],
  drescher: [
    ['w', -21, -30, 8, 22, 3], ['w', 13, -30, 8, 22, 3], ['w', -17, 8, 6, 12, 2], ['w', 11, 8, 6, 12, 2],
    ['r', -13, -36, 26, 56, 4, '#e8ebee'], ['r', -6, -41, 12, 5, 1, '#8b93a1'], ['r', -10, -38, 20, 12, 3, '#d1d6dd'],
    ['r', -8, -37, 16, 3, 1, '#5c6470'], ['r', -10, -22, 20, 22, 2, '#c3c9d2'], ['r', -8, 5, 16, 12, 2, '#b6bdc8'],
    ['r', -16, -20, 3, 34, 1.5, '#8b93a1']
  ],
  pfeil: [['p', [[0, -41], [18, 12], [0, 2], [-18, 12]], '#e8ebee']]
};

function roundedRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r || 0, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// Zeichnet ein Symbol am aktuellen Nullpunkt; pxPerM = Kartenmaßstab. Sehr weit herausgezoomt bleibt es
// mindestens ~18 px lang, damit man das Fahrzeug noch findet.
function drawVehicleSymbol(ctx, kind, pxPerM, marke, opts) {
  // Neue Modelle (kartenFahrzeuge.js, 23.10.2026); die einfachen Formen unten bleiben als Rückfall
  if (window.KartenFahrzeuge) { window.KartenFahrzeuge.zeichne(ctx, kind, pxPerM, marke, opts); return; }
  const parts = VEHICLE_SYMBOLS[kind] || VEHICLE_SYMBOLS.traktor;
  const k = Math.max(pxPerM / 10, 18 / 48);
  ctx.save();
  ctx.scale(k, k);
  ctx.lineWidth = 1;
  for (const p of parts) {
    if (p[0] === 'w' || p[0] === 'r') {
      roundedRectPath(ctx, p[1], p[2], p[3], p[4], p[5]);
      ctx.fillStyle = p[0] === 'w' ? '#2b3038' : p[6];
      ctx.fill();
      if (p[0] === 'w') { ctx.strokeStyle = '#6b7380'; ctx.stroke(); }
    } else if (p[0] === 'l') {
      ctx.beginPath(); ctx.moveTo(p[1], p[2]); ctx.lineTo(p[3], p[4]);
      ctx.strokeStyle = '#6b7380'; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
    } else if (p[0] === 'p') {
      ctx.beginPath();
      p[1].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = p[2]; ctx.fill();
      ctx.strokeStyle = '#11161c'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.lineWidth = 1;
    } else if (p[0] === 'q') {
      ctx.beginPath(); ctx.moveTo(p[1], p[2]); ctx.quadraticCurveTo(p[3], p[4], p[5], p[6]);
      ctx.strokeStyle = p[7]; ctx.lineWidth = p[8]; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineWidth = 1; ctx.lineCap = 'butt';
    } else if (p[0] === 'c') {
      ctx.beginPath(); ctx.arc(p[1], p[2], p[3], 0, Math.PI * 2); ctx.fillStyle = p[4]; ctx.fill();
    }
  }
  ctx.restore();
}

// Kürzeste Winkeldifferenz von "from" zu "to" (Bogenmaß), Ergebnis in [-π, π) -- ohne das würde eine
// naive lineare Interpolation über die 360°/0°-Grenze hinweg den LANGEN Weg herum drehen statt den
// kurzen (z.B. von 170° nach -170° sind es nur 20°, nicht 340°).
function shortestAngleDelta(from, to) {
  let delta = to - from;
  delta = ((delta + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return delta;
}


// Feldfarben (Paket D, 21.10.2026): eigene Felder in Hoffarbe, fremde in deren Hoffarbe, freie grau
const FIELD_FREE_COLOR = '#8b93a1';
// Ansicht „schräg von hinten“ (Hendrik 23.10.2026): die Kartenebene wird per CSS geneigt (Grafikkarte, kein Neuzeichnen).
// Bühne = Leinwand größer als der sichtbare Ausschnitt (wf × hf), unten bündig; Fahrzeug bei anchor × Höhe über dem
// unteren Rand der Bühne. Hinten blendet die Ebene in Dunst aus (CSS-Maske). dpr gedeckelt, weil die Bühne größer ist.
// Danach (Hendrik: „etwas horizontaler, der Traktor etwas weiter oben“) flacher: 58° statt 45°, Fahrzeug bei gut einem
// Drittel der Bildhöhe. Die Fahrzeugbilder von schräg hinten sind passend aus 32° (= 90° − deg) gerendert.
const TILT = { wf: 2.2, hf: 3, persp: 2.4, deg: 58, anchor: 0.75, zoom: 1.5, dprMax: 1.25 };
// Bearbeitete Fläche als glatte Umrisse statt Kästchen, sobald ein Kästchen mindestens so viele Bildpunkte groß ist
const COVERAGE_SMOOTH_MIN_PX = 2.5;
// Marching Squares: Ecken (tl, tr, br, bl) → Vieleck im Einheitsquadrat zwischen vier Proben, als Namen der Punkte
// (Ecken TL/TR/BR/BL, Kantenpunkte T/R/B/L werden beim Zeichnen auf die 0,5-Schwelle gelegt). Alle Vielecke gleich
// herum (für die Füllregel, sonst entstehen Haarlinien zwischen Nachbarn).
const MS_CASES = (() => {
  const P = { TL: [0, 0], TR: [1, 0], BR: [1, 1], BL: [0, 1], T: [0.5, 0], R: [1, 0.5], B: [0.5, 1], L: [0, 0.5] };
  const raw = { 1: 'L B BL', 2: 'B R BR', 3: 'L R BR BL', 4: 'T TR R', 5: 'L T TR R B BL', 6: 'T TR BR B', 7: 'L T TR BR BL', 8: 'TL T L',
    9: 'TL T B BL', 10: 'TL T R BR B L', 11: 'TL T R BR BL', 12: 'TL TR R L', 13: 'TL TR R B BL', 14: 'TL TR BR B L' };
  const out = [];
  for (const [k, names] of Object.entries(raw)) {
    let list = names.split(' ');
    const pts = list.map(n => P[n]);
    let a = 0;
    for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; a += x1 * y2 - x2 * y1; }
    if (a < 0) list = list.reverse();   // wie rect(): im Uhrzeigersinn (y nach unten)
    out[Number(k)] = list;
  }
  return out;
})();
const MAX_ZOOM = 20;
const MIN_ZOOM = 0.25;

function hexToRgba(hex, a) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return `rgba(139, 147, 161, ${a})`;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${a})`;
}

function pointInPolygon(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function polygonCenter(pts) {
  let x = 0, z = 0;
  for (const p of pts) { x += p[0]; z += p[1]; }
  return [x / pts.length, z / pts.length];
}

class DashboardMapView {
  constructor() {
    this.container = document.getElementById('dashboard-map-body');
    this.built = false;
    this.course = null;
    this.bounds = null;
    this.zoomFactor = 1;
    this.cssWidth = 0;
    this.cssHeight = 0;
    this.lastTelemetry = null;
    this.lastPos = null;
    // Interpolation der Fahrzeugposition UND -drehung zwischen zwei Ticks (s. Datei-Kommentar oben) --
    // beide teilen sich denselben Zeitstempel (tickReceivedAt), damit Position und Drehung exakt
    // synchron übergeblendet werden.
    this.prevTickPos = null;
    this.targetTickPos = null;
    this.prevHeadingRad = null;
    this.targetHeadingRad = null;
    this.tickReceivedAt = 0;
    this.displayPos = null;
    this.displayHeadingRad = null;
    // Bearbeitete Fläche (seit dem Test vom 23.10.2026, Anmerkung 8): rechnet der Server (server/flaeche.js) je
    // Spielstand und Fahrzeug als Raster aus 0,5-m-Kästchen und schickt fertige Kacheln ('flaeche'). Jede Kachel wird
    // hier einmal in ein kleines Bild gemalt und beim Zeichnen nur noch als Bild gesetzt -- vorher zeichnete jedes
    // Tablet bis zu 40 000 Vierecke in jedem Bild selbst (Karte wurde mit der Zeit langsam, nach Neuladen war alles weg).
    this.flaecheTiles = new Map();   // "kx,kz" → { canvas, bits, kx, kz }
    this.flaecheMass = { zelleM: 0.5, kachelZ: 128 };
    // Spur direkt hinter dem Arbeitsbalken, bis der Server die Fläche schickt (Hendrik 23.10.2026: „schliert nach“):
    // Balken-Schlüssel → [{ ends: [[x, z], [x, z]], t }] an der angezeigten (geglätteten) Fahrzeuglage
    this.coverageTrail = new Map();
    // Fläche zeigen an/aus (Werkzeugleiste, Kachel-Zahnrad); gezählt wird im Server immer
    this.coverageEnabled = true;
    // Straßennetz (Mod 0.6, Anmerkung 19): einmal je Spielstand, als Pfad in Weltkoordinaten zwischengespeichert
    this.roads = null;
    this.roadPath = null;
    this.roadsVisible = true;
    // Farbe der bearbeiteten Fläche -- Standard Blau, per Taste umschaltbar auf Grün.
    this.coverageColorGreen = false;
    // Einstellbarer Abstand Fahrzeug-Heck -> Arbeitsbereich-Symbol/-Fläche (s. Konstanten oben).
    this.implementGapM = IMPLEMENT_GAP_DEFAULT_M;
    // Heading-up (Fahrzeug zeigt immer nach oben, Feld dreht sich darum) ist der Default -- Hendriks
    // Wunsch, per Taste umschaltbar auf Nord-oben (Feld fest, Fahrzeug-Symbol dreht sich) falls das im
    // Alltag doch unübersichtlicher ist.
    this.headingUp = true;
    this.tilt = false;                // schräg von hinten (Kachel-Einstellung „Ausrichtung“ oder Taste 3D)
    // Glättung für alle Geräte (karteEinstellungen.js setzt sie beim Start), Bildrate je Gerät (MAP_SETTING_FPS)
    this.smoothing = 'wenig';   // Standard seit 25.10.2026 (vorher mittel), s. server/routes/karte.js
    this.roadsVisible = true;
    this.fpsMode = this.pruefeFpsMode(mapSettingRead(MAP_SETTING_FPS, 'maximal'));
    this.renderMapSettings();
    // Kachel-Einstellungen (Paket H, 22.10.2026): Fahrzeugsymbol, Abstandsanzeige, Kachelmodus -- s. applyTileSettings()
    this.vehicleSymbol = 'traktor';   // wählt man je Kachelseite (Hendrik 23.10.2026: keine Automatik, Seite je Profil)
    this.aheadMode = 'vg';            // 'vg' | 'fr' | 'aus' -- bis zum GPS-Menü (Paket I) zeigt beides die Wende der Spurführung
    this.tileMode = null;             // null = eigene Kartenseite, 'tile' = in einer Kachel, 'full' = Kachel im Vollbild
    this.tileButtons = false;
    // Karte (Paket D): Felder/Höfe (craftConsoleMap.xml) + andere Fahrzeuge (craftConsoleWorld.xml)
    this.mapData = null;
    this.world = null;
    // Verschieben per Finger/Maus: Versatz in Bildschirm-Pixeln (nach der Drehung angewandt, daher auch im
    // Heading-up-Modus intuitiv) -- ⤢ setzt Zoom UND Versatz zurück
    this.pan = { x: 0, y: 0 };
    this.socket = window.hubSocket;   // gemeinsame Verbindung der Seite (hubSocket.js, B4)
    this.socket.on('telemetry-map', (map) => { this.mapData = map; });
    this.socket.on('telemetry-world', (world) => { this.world = world; this.renderOthers(); });
    this.socket.on('telemetry-roads', (roads) => { this.roads = roads; this.roadPath = null; });
    this.socket.on('telemetry-session', () => { this.roads = null; this.roadPath = null; });
    this.socket.on('flaeche', (f) => this.onFlaeche(f));
    this.socket.on('telemetry-update', (data) => this.onTelemetry(data));
    this.socket.on('telemetry-course-update', (course) => {
      // Leerer Kurs (Mod ab 0.4 schreibt ihn, wenn die Spurführung ausgeht) = kein Kurs mehr anzeigen
      this.course = (course?.boundary?.length || course?.segments?.length) ? course : null;
      const newBounds = this.computeBounds(course);
      // Nur uebernehmen, wenn sich die Feldgeometrie WESENTLICH geaendert hat -- sonst flackert der
      // Auto-Zoom bei jedem (evtl. nur intern neu erzeugten) Kurs-Update minimal hin und her, obwohl
      // sich am Feld nichts geaendert hat (Hendriks Beobachtung "Auto-Zoom flackert manchmal").
      if (newBounds && this.boundsChangedSignificantly(newBounds)) {
        this.bounds = newBounds;
      }
    });
    // Der Kartentab kann beim allerersten Aufbau noch unsichtbar sein (display:none, falls Telemetrie
    // schon eintrifft, bevor Hendrik überhaupt auf "Karte" geklickt hat) -- getBoundingClientRect()
    // liefert dann 0x0 und die Canvas-Puffer werden auf die 200px-Mindestgröße geklemmt. Ohne erneute
    // Messung bleibt der Puffer dauerhaft zu klein und wird per CSS auf die tatsächliche (größere)
    // Fläche hochskaliert -- genau das erzeugte das "unscharf/verpixelt"-Symptom. app.js feuert bei
    // jedem Tab-Wechsel 'tabchanged' (s. dort) -- darüber messen wir beim Sichtbarwerden neu.
    document.addEventListener('tabchanged', (e) => {
      if (e.detail?.tabName === 'dashboard-map' && this.built) this.resize();
    });
    this.renderIdle('Warte auf Daten aus Farming Simulator 25 ...');

    // Vollbild (23.08.2026, Hendriks Wunsch): Fullscreen-API auf den Wrapper statt einer eigenen Seite
    // -- Sidebar/Header bleiben einfach unsichtbar im Hintergrund, ein zweiter Klick/Escape holt alles
    // zurück, ohne Seitenwechsel. Der Knopf liegt bewusst INNERHALB des Fullscreen-Wrappers in
    // index.html (sonst wäre er im Vollbild-Zustand unsichtbar).
    this.fullscreenTarget = document.getElementById('dashboard-map-fullscreen-target');
    this.fullscreenBtn = document.getElementById('dashboard-map-fullscreen-btn');
    if (this.fullscreenBtn && this.fullscreenTarget) {
      this.fullscreenBtn.addEventListener('click', () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else this.fullscreenTarget.requestFullscreen().catch(() => {});
      });
      document.addEventListener('fullscreenchange', () => {
        const active = document.fullscreenElement === this.fullscreenTarget;
        this.fullscreenBtn.textContent = active ? '⛶ Vollbild verlassen' : '⛶ Vollbild';
        // Canvas-Puffer müssen auf die neue Größe neu vermessen werden (s. Kommentar bei
        // 'tabchanged' oben) -- window-'resize' feuert bei Ein-/Austritt zwar meist auch, aber nicht
        // zuverlässig genug während der Übergangsanimation, deshalb hier zusätzlich explizit.
        if (this.built) this.resize();
      });
    }
  }

  renderIdle(message) {
    // Nur bei geändertem Text neu aufbauen (23.10.2026): „nicht verfügbar“ kam bis zu 25×/s und ersetzte jedes Mal den Inhalt
    if (!this.built && this.idleMessage === message && this.container.firstElementChild?.classList?.contains('tacho-idle')) return;
    this.built = false;
    this.idleMessage = message;
    this.container.innerHTML = `<div class="tacho-idle">${message}</div>`;
  }

  ensureCanvases() {
    if (this.built) return;
    this.container.innerHTML = `
      <div class="map-legend">
        <span class="map-legend-item"><span class="map-legend-swatch map-legend-swatch--active"></span>Aktiv gelenkt</span>
        <span class="map-legend-item"><span class="map-legend-swatch map-legend-swatch--preview"></span>Würde übernommen</span>
        <span class="map-legend-item"><span class="map-legend-swatch map-legend-swatch--coverage" id="map-legend-coverage-swatch"></span>Bereits bearbeitet</span>
        <span class="map-legend-item"><span class="map-legend-swatch map-legend-swatch--coverage" id="map-legend-coverage-swatch2"></span>Doppelt</span>
      </div>
      <div class="dashboard-map-wrap" id="dashboard-map-wrap">
        <div class="map-turn-banner" id="map-turn-banner" style="display: none;"></div>
        <div class="map-stage" id="map-stage">
          <canvas id="map-canvas-static"></canvas>
          <canvas id="map-canvas-live"></canvas>
        </div>
        <img class="map-vehicle-3d" id="map-vehicle-3d" alt="" style="display: none;">
        <div class="map-field-info" id="map-field-info" style="display: none;"></div>
        <button type="button" class="map-vga" id="map-vga" style="display: none;" title="Vorgewendeautomatik an/aus"></button>
        <div class="map-others" id="map-others" style="display: none;"></div>
        <div class="map-zoom-controls">
          <button type="button" class="map-zoom-btn" id="map-zoom-in" title="Vergrößern">+</button>
          <button type="button" class="map-zoom-btn" id="map-zoom-out" title="Verkleinern">−</button>
          <button type="button" class="map-zoom-btn map-zoom-btn--reset" id="map-zoom-reset" title="Zoom und Ausschnitt zurücksetzen (Karte folgt wieder dem Fahrzeug)">⤢</button>
          <button type="button" class="map-zoom-btn map-zoom-btn--heading" id="map-heading-toggle" title="Ausrichtung umschalten (Fahrzeug oben / Norden oben)">${navIcon('compass')}</button>
          <button type="button" class="map-zoom-btn map-zoom-btn--tilt" id="map-tilt-toggle" title="Ansicht: von oben / schräg von hinten">3D</button>
        </div>
        <div class="map-toolbar">
          <!-- Geräteabstand +/− entfällt (Paket I): Lage und Breite kommen aus dem Spiel (Mod 0.5) oder aus dem GPS-Menü -->
          <button type="button" class="map-toolbar-btn" id="map-gps-menu" title="Gerät, Arbeitsposition und Vorgewende-Auslöser">GPS</button>
          <button type="button" class="map-toolbar-btn map-toolbar-btn--active" id="map-coverage-toggle" title="Bearbeitete Fläche zeigen an/aus">Fläche zeigen: An</button>
          <button type="button" class="map-toolbar-btn" id="map-coverage-color-toggle" title="Farbe der bearbeiteten Fläche umschalten">Farbe: Blau</button>
          <button type="button" class="map-toolbar-btn map-toolbar-btn--danger" id="map-clear-coverage" title="Bearbeitete Fläche dieses Fahrzeugs löschen">Fläche löschen</button>
        </div>
      </div>
    `;
    this.wrap = document.getElementById('dashboard-map-wrap');
    this.stage = document.getElementById('map-stage');
    this.staticCanvas = document.getElementById('map-canvas-static');
    this.liveCanvas = document.getElementById('map-canvas-live');
    // Fahrzeugbild für 3D neu holen: nach einer Spielpause wird alles neu aufgebaut, das alte Bild hängt dann nicht mehr
    // auf der Seite (Hendrik 23.10.2026: „in der 3D-Ansicht sind die Maschinenmodelle nicht mehr zu sehen“)
    this.vehicleImg = document.getElementById('map-vehicle-3d');
    document.getElementById('map-tilt-toggle')?.classList.toggle('map-zoom-btn--on', this.tilt);
    // vorigen Handler entfernen: die Karte wird nach jeder Spielpause neu aufgebaut, vorher sammelten sich die
    // Handler an (23.10.2026)
    if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);
    this.resizeHandler = () => this.resize();
    window.addEventListener('resize', this.resizeHandler);

    document.getElementById('map-zoom-in').addEventListener('click', () => this.zoomBy(1.25));
    document.getElementById('map-zoom-out').addEventListener('click', () => this.zoomBy(1 / 1.25));
    document.getElementById('map-zoom-reset').addEventListener('click', () => this.zoomReset());
    this.attachGestures();
    document.getElementById('map-heading-toggle').addEventListener('click', () => {
      if (this.tilt) { this.setTilt(false); this.headingUp = false; this.merkeAnsicht(); return; }   // aus 3D heraus: Norden oben
      this.headingUp = !this.headingUp;
      this.merkeAnsicht();
    });
    document.getElementById('map-tilt-toggle').addEventListener('click', () => { this.setTilt(!this.tilt); this.merkeAnsicht(); });
    document.getElementById('map-gps-menu').addEventListener('click', () => window.app?.navigateToTab('gps'));
    // Vorgewendeautomatik (Hendrik 24.10.2026): Anzeige auf der Karte, antippen schaltet um
    document.getElementById('map-vga').addEventListener('click', async () => {
      const an = this.lastTelemetry?.gps?.automatik !== false;
      try {
        await fetch('/api/gps/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ automatik: !an }) });
        if (this.lastTelemetry?.gps) this.lastTelemetry.gps.automatik = !an;
        this.renderVga(this.lastTelemetry?.gps);
        window.showToast?.(`Vorgewendeautomatik ${an ? 'aus' : 'an'}`);
      } catch (e) { uiAlert('Umschalten fehlgeschlagen: ' + e.message); }
    });
    document.getElementById('map-clear-coverage').addEventListener('click', () => this.clearCoverage());
    document.getElementById('map-coverage-toggle').addEventListener('click', () => this.toggleCoverageEnabled());
    document.getElementById('map-coverage-color-toggle').addEventListener('click', () => this.toggleCoverageColor());
    this.updateImplementGapLabel();
    this.updateCoverageLegendSwatch();

    this.built = true;
    this.resize();
    this.startRenderLoop();
    this.renderOthers(); // Fahrzeugdaten können schon vor dem Aufbau angekommen sein
  }

  // s. IMPLEMENT_GAP_*-Konstanten oben -- deltaSteps ist +1/-1, ein "Schritt" = IMPLEMENT_GAP_STEP_M.
  adjustImplementGap(deltaSteps) {
    const next = this.implementGapM + deltaSteps * IMPLEMENT_GAP_STEP_M;
    this.implementGapM = Math.round(Math.min(IMPLEMENT_GAP_MAX_M, Math.max(IMPLEMENT_GAP_MIN_M, next)) * 10) / 10;
    this.updateImplementGapLabel();
  }

  updateImplementGapLabel() {
    const el = document.getElementById('map-implement-gap-label');
    if (el) el.textContent = `Geräteabstand: ${this.implementGapM.toLocaleString('de-DE')} m`;
  }

  // Abstand vom Fahrzeug-Referenzpunkt (posX/posZ, Traktor) bis zur MITTE des Arbeitsbereich-Balkens (nur noch für
  // das Ersatz-Symbol ohne Mod 0.5, s. drawLive())
  getImplementOffsetM() {
    return TRACTOR_LENGTH_M * 0.5 + this.implementGapM + IMPLEMENT_DEPTH_M * 0.5;
  }

  // Löscht die Fläche des Fahrzeugs, in dem man sitzt (im Server; alle Tablets bekommen den neuen Stand)
  clearCoverage() {
    fetch('/api/flaeche', { method: 'DELETE' }).catch(() => {});
  }

  // Fläche zeigen an/aus (gezählt wird im Server immer; was als bearbeitet zählt, stellt man je Gerät im GPS-Menü ein)
  toggleCoverageEnabled() {
    this.coverageEnabled = !this.coverageEnabled;
    const btn = document.getElementById('map-coverage-toggle');
    if (btn) {
      btn.textContent = `Fläche zeigen: ${this.coverageEnabled ? 'An' : 'Aus'}`;
      btn.classList.toggle('map-toolbar-btn--active', this.coverageEnabled);
    }
  }

  // Neue Funktion (13.08.2026, Hendriks Wunsch): Farbe der bearbeiteten Fläche Blau <-> Grün.
  toggleCoverageColor() {
    this.coverageColorGreen = !this.coverageColorGreen;
    this.recolorFlaeche();
    const btn = document.getElementById('map-coverage-color-toggle');
    if (btn) btn.textContent = `Farbe: ${this.coverageColorGreen ? 'Grün' : 'Blau'}`;
    this.updateCoverageLegendSwatch();
  }

  updateCoverageLegendSwatch() {
    const swatch = document.getElementById('map-legend-coverage-swatch');
    if (swatch) swatch.style.background = (this.coverageColorGreen ? COVERAGE_COLOR_GREEN : COVERAGE_COLOR_BLUE).legend;
    const swatch2 = document.getElementById('map-legend-coverage-swatch2');   // doppelt bearbeitet (wie paintFlaecheTile: Farbe × 0,45)
    if (swatch2) swatch2.style.background = (this.coverageColorGreen ? COVERAGE_COLOR_GREEN : COVERAGE_COLOR_BLUE).doppelt;
  }

  // Läuft dauerhaft mit dem Bildschirm-Takt (i.d.R. 60fps), sobald die Karte einmal aufgebaut wurde --
  // ersetzt das frühere "nur bei neuem Tick zeichnen" (s. Datei-Kommentar: sonst wirkt die Bewegung
  // ruckelig, weil 250ms bei normalem Tempo ein spürbarer Sprung sind). Für die geringe Geometriemenge
  // Seit 22.10.2026 gedrosselt (MAP_FPS_*) und nur bei sichtbarer Karte -- auf älteren Tablets war das
  // Dauer-Neuzeichnen mit ~60 Bildern/s doch spürbar (Felder + bearbeitete Fläche bis 40 000 Vierecke).
  startRenderLoop() {
    if (this._renderLoopStarted) return;
    this._renderLoopStarted = true;
    const loop = (now) => {
      requestAnimationFrame(loop);
      // Karte nicht zu sehen (andere Seite offen, Kachel ohne Karte): gar nicht zeichnen
      if (!this.liveCanvas || this.liveCanvas.offsetParent === null) return;
      if (this.fpsMode === 'maximal') {
        this.lastDrawAt = now;
      } else {
        const fps = (this.fpsMode !== 'sparsam' || now < (this.interactUntil || 0)) ? MAP_FPS_MAX
          : Math.min(MAP_FPS_MAX, Math.max(MAP_FPS_MIN, 1000 / (this.tickIntervalMs || TICK_INTERVAL_MS)));
        // Takt mit Übertrag: der Browser liefert Bilder im 16,7-ms-Raster -- „mindestens 40 ms seit dem letzten Bild“
        // ergäbe immer 50 ms (20 statt 25/s); so wechseln sich 33 und 50 ms ab und treffen im Mittel 40 ms.
        const interval = 1000 / fps;
        if (now - (this.lastDrawAt || 0) < interval - 8) return;
        this.lastDrawAt = Math.max((this.lastDrawAt || 0) + interval, now - interval);
      }
      this.updateDisplayPos();
      this.updateCoverageTrail();
      this.drawStatic();
      this.drawLive();
    };
    requestAnimationFrame(loop);
  }

  // Lineare Interpolation zwischen dem vorherigen und dem neuesten bekannten Tick -- sowohl Position
  // ALS AUCH Drehung, mit demselben Zeitfaktor t (beide Ticks kommen ja gemeinsam alle 250ms). Ohne die
  // Drehungs-Interpolation sprang die ganze Welt (Heading-up-Modus) bei jedem Tick sofort auf den neuen
  // Winkel -- beim Geradeausfahren kaum sichtbar (Winkel ändert sich pro Tick nur minimal), in eng
  // gefahrenen Kurven aber deutlich als Ruckeln (Hendriks Beobachtung "ruckelt stark in Kurven").
  // this.displayPos/displayHeadingRad sind die einzige Quelle für Kamera-Zentrierung UND
  // Symbol-Zeichenposition/-drehung (s. worldToCanvas()/drawLive()), bleiben dadurch zwangsläufig synchron.
  updateDisplayPos() {
    const t = Math.min(1, (performance.now() - this.tickReceivedAt) / (this.tickIntervalMs || TICK_INTERVAL_MS));

    if (!this.targetTickPos) {
      this.displayPos = null;
    } else {
      const from = this.prevTickPos || this.targetTickPos;
      this.displayPos = {
        x: from.x + (this.targetTickPos.x - from.x) * t,
        z: from.z + (this.targetTickPos.z - from.z) * t
      };
    }

    if (this.targetHeadingRad != null) {
      const from = this.prevHeadingRad ?? this.targetHeadingRad;
      this.displayHeadingRad = from + shortestAngleDelta(from, this.targetHeadingRad) * t;
    }
  }

  // Fahrzeugbild von schräg hinten (3D) aufrecht an die Stelle setzen, an der die geneigte Karte das Fahrzeug zeigt.
  // Leinwandpunkt p (Bühne) → Bildschirm: Neigung um die Unterkante (TILT), Perspektive s = P / (P + Höhe · sin θ).
  placeVehicle3d(b, p, scale) {
    const el = this.vehicleImg || (this.vehicleImg = document.getElementById('map-vehicle-3d'));
    if (!el) return;
    if (!b || !p) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
    const vh = this.viewH || this.cssHeight, vw = this.viewW || this.cssWidth;
    const th = TILT.deg * Math.PI / 180, P = vh * TILT.persp;
    const dx = p.x - this.cssWidth / 2, dy = p.y - this.cssHeight;   // dy < 0: über der Unterkante
    const s = P / (P - dy * Math.sin(th));
    const sx = vw / 2 + dx * s, sy = vh + dy * Math.cos(th) * s;
    const k = (Math.max(scale, 20 / (b.laenge || 4.8)) * s) / b.ppm;
    if (el.getAttribute('src') !== b.src) el.setAttribute('src', b.src);
    el.style.width = `${b.w}px`;
    el.style.height = `${b.h}px`;
    el.style.transform = `translate(${(sx - b.ox * k).toFixed(1)}px, ${(sy - b.oy * k).toFixed(1)}px) scale(${k.toFixed(4)})`;
    if (el.style.display !== 'block') el.style.display = 'block';
  }

  /**
   * Spur hinter dem Arbeitsbalken fortschreiben (in jedem Bild): wo der Balken gerade arbeitet, an der angezeigten Lage des
   * Fahrzeugs. Sie überbrückt die Zeit, bis der Server die gezählte Fläche schickt (Takt der Spieldaten), und zeichnet
   * sich mit der übrigen Fläche in einem Pfad. Ältere Teile als 2 s, Sprünge und ausgehobene Geräte fallen heraus.
   */
  updateCoverageTrail() {
    const data = this.lastTelemetry, trail = this.coverageTrail;
    const now = performance.now();
    if (!this.coverageEnabled || !data || !this.displayPos || this.displayHeadingRad == null || data.inVehicle === false) { trail.clear(); return; }
    const h = this.displayHeadingRad;
    const F = { x: this.displayPos.x, z: this.displayPos.z, fx: Math.sin(h), fz: -Math.cos(h) };
    const segs = workSegments(data) || [];
    const aktiv = new Set();
    for (const seg of segs) {
      if (!seg.active || !seg.rel || seg.rel.length < 2) continue;
      // dieselbe gleitende Lage wie beim Zeichnen (geraetLage), am geglätteten Symbol
      const { rel, ang } = this.geraetLage(seg);
      let ends;
      if (rel.length === 2) ends = rel.map(([al, ac]) => relToWorld(F, al, ac));
      else {   // wie server/flaeche.js arbeitsBalken: Enden im Rahmen des Geräts (gezogen: abgeknickt)
        ends = window.Teilbreiten.balkenLage(rel, ang).ends.map(([al, ac]) => relToWorld(F, al, ac));
      }
      // Teilbreiten (auch Precision Farming, Mod 0.7.2): nur die Teile, die arbeiten, wie server/flaeche.js arbeitsBalken;
      // ein Balken von Hand steht für die volle Breite (seg.hand)
      const teile = (seg.pf || (seg.hand && seg.sections)) ? window.Teilbreiten?.arbeitsTeile({ sections: seg.sections, pfSek: seg.pf, on: seg.on }, ends, seg.hand) : null;
      const stuecke = teile ? teile.map(t => ({ key: `${seg.key}|pf${t.nr}`, ends: t.ends })) : [{ key: seg.key, ends }];
      for (const { key, ends: e } of stuecke) {
        aktiv.add(key);
        let spur = trail.get(key);
        if (!spur) trail.set(key, spur = []);
        const last = spur[spur.length - 1];
        if (last && Math.hypot(last.ends[0][0] - e[0][0], last.ends[0][1] - e[0][1]) > 5) spur.length = 0;   // Sprung
        if (!last || Math.hypot(last.ends[0][0] - e[0][0], last.ends[0][1] - e[0][1]) > 0.05) spur.push({ ends: e, t: now });
        while (spur.length > 2 && now - spur[0].t > 2000) spur.shift();
      }
    }
    for (const k of trail.keys()) if (!aktiv.has(k)) trail.delete(k);
  }

  // Ansicht schräg von hinten an/aus; im 3D gilt immer „Fahrtrichtung oben“
  setTilt(on) {
    this.tilt = !!on;
    if (this.tilt) this.headingUp = true;
    document.getElementById('map-tilt-toggle')?.classList.toggle('map-zoom-btn--on', this.tilt);
    const info = this.wrap?.querySelector('#map-field-info');
    if (info) info.style.display = 'none';
    if (this.built) this.resize();
  }

  zoomBy(factor) {
    this.zoomFactor = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoomFactor * factor));
    this.merkeAnsichtBald();
  }

  zoomReset() {
    this.zoomFactor = 1;
    this.pan = { x: 0, y: 0 };
    this.merkeAnsichtBald();
  }

  // ---------- Ansicht und Zoom je Fahrzeug ----------
  merkeAnsicht() {
    const k = this.fahrzeug;
    if (!k) return;
    const alle = ladeAnsichten();
    alle[k] = { tilt: this.tilt, headingUp: this.headingUp, zoom: Math.round(this.zoomFactor * 1000) / 1000, t: Date.now() };
    const keys = Object.keys(alle).sort((a, b) => (alle[b].t || 0) - (alle[a].t || 0));
    for (const alt of keys.slice(ANSICHT_MAX)) delete alle[alt];
    mapSettingWrite(ANSICHT_KEY, JSON.stringify(alle));
  }

  merkeAnsichtBald() {
    clearTimeout(this._ansichtTimer);
    this._ansichtTimer = setTimeout(() => this.merkeAnsicht(), 400);
  }

  // Gespeicherte Ansicht des Fahrzeugs übernehmen; false = für dieses Fahrzeug ist noch nichts gespeichert
  setzeAnsicht(k) {
    const a = k ? ladeAnsichten()[k] : null;
    if (!a) return false;
    if (!!a.tilt !== this.tilt) this.setTilt(!!a.tilt);
    this.headingUp = a.tilt ? true : a.headingUp !== false;
    this.zoomFactor = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(a.zoom) || 1));
    this.pan = { x: 0, y: 0 };
    return true;
  }

  // Vorgabe der Kachel (Einstellung „Ausrichtung“) -- gilt, solange für das Fahrzeug nichts gespeichert ist
  setzeVorgabe(mitZoom = false) {
    const v = this.ansichtVorgabe || { tilt: false, headingUp: true };
    if (v.tilt !== this.tilt) this.setTilt(v.tilt);
    this.headingUp = v.tilt ? true : v.headingUp;
    if (mitZoom) { this.zoomFactor = 1; this.pan = { x: 0, y: 0 }; }   // neues Fahrzeug: normaler Zoom
  }

  // Canvas-Puffer in tatsächlichen Geräte-Pixeln anlegen (devicePixelRatio) statt 1:1 in CSS-Pixeln --
  // sonst skaliert der Browser einen zu kleinen Bitmap-Puffer auf die CSS-Größe hoch, was auf Retina-/
  // hochauflösenden Tablet-Displays genau die von Hendrik beobachtete Unschärfe/Pixeligkeit erzeugt.
  // ctx.setTransform(dpr,...) übersetzt danach alle Zeichen-Koordinaten weiterhin in CSS-Pixeln (s.
  // worldToCanvas(), die bewusst this.cssWidth/cssHeight statt canvas.width/height nutzt).
  resize() {
    if (!this.wrap) return;
    const rect = this.wrap.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return; // Tab noch unsichtbar -- 'tabchanged' misst nach
    const vw = Math.round(rect.width);
    const vh = Math.round(rect.height);
    this.viewW = vw;
    this.viewH = vh;
    // 3D: Bühne größer als der Ausschnitt, unten bündig, geneigt (s. TILT)
    const tilt = !!this.tilt;
    const w = tilt ? Math.round(vw * TILT.wf) : vw;
    const h = tilt ? Math.round(vh * TILT.hf) : vh;
    const dpr = Math.min(window.devicePixelRatio || 1, tilt ? TILT.dprMax : 4);
    this.cssWidth = w;
    this.cssHeight = h;
    if (this.stage) {
      this.stage.style.width = `${w}px`;
      this.stage.style.height = `${h}px`;
      this.stage.style.left = `${Math.round((vw - w) / 2)}px`;
      this.stage.style.top = `${vh - h}px`;
      this.stage.style.transform = tilt ? `perspective(${Math.round(vh * TILT.persp)}px) rotateX(${TILT.deg}deg)` : '';
      this.stage.classList.toggle('map-stage--tilt', tilt);
      this.wrap.classList.toggle('map-tilt', tilt);
    }
    for (const c of [this.staticCanvas, this.liveCanvas]) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  // Vorgewendeautomatik an/aus (nur wenn das GPS rechnet, also ein Gerät angehängt ist)
  renderVga(g) {
    const el = document.getElementById('map-vga');
    if (!el) return;
    el.style.display = g ? '' : 'none';
    if (!g) return;
    const an = g.automatik !== false;
    el.classList.toggle('an', an);
    el.innerHTML = `<span class="map-vga-dot"></span>Vorgewendeautomatik ${an ? 'an' : 'aus'}`;
  }

  onTelemetry(data) {
    if (!data.available) {
      this.renderIdle((data.stale ? 'Farming Simulator 25 sendet gerade keine neuen Daten – ist das Spiel pausiert, im Menü oder beendet?' : 'Keine Verbindung zu Farming Simulator 25 – läuft das Spiel, ist der CraftConsoleHUD-Mod aktiv?'));
      return;
    }
    this.ensureCanvases();
    this.lastTelemetry = data;
    // anderes Fahrzeug: seine Ansicht und seinen Zoom übernehmen (sonst die Vorgabe der Kachel)
    const fz = data.vehicleId || data.vehicleName || null;
    if (fz && fz !== this.fahrzeug) {
      this.fahrzeug = fz;
      if (!this.setzeAnsicht(fz)) this.setzeVorgabe(true);
    }
    // Entfernungen in der Liste der anderen mitlaufen lassen (höchstens 1×/s neu zeichnen)
    if (this.world && performance.now() - (this.othersRenderedAt || 0) > 1000) {
      this.othersRenderedAt = performance.now();
      this.renderOthers();
    }
    this.renderVga(data.gps);
    // Abstandsanzeige (Paket I): „Vorgewende in …“ bzw. „Feldrand in …“ aus der GPS-Rechnung im Server
    // (data.gps, ab Mod 0.5 mit echter Gerätelage). Ohne Feld/Rechnung bleibt „Wende in“ der Spurführung.
    const turnEl = document.getElementById('map-turn-banner');
    if (turnEl) {
      const g = data.gps;
      let dist = null, label = '', soon = 30;
      if (this.aheadMode === 'vg' && g?.headlandAheadM != null) { dist = g.headlandAheadM; label = 'Vorgewende in'; }
      else if (this.aheadMode === 'fr' && g?.fieldEdgeAheadM != null) { dist = g.fieldEdgeAheadM; label = 'Feldrand in'; soon = 20; }
      else if (this.aheadMode !== 'aus' && data.base?.turn) { dist = data.base.turn.distanceM; label = '↶ Wende in'; }
      turnEl.style.display = dist != null ? 'block' : 'none';
      if (dist != null) {
        const v = (data.base?.speedKmh ?? data.speed ?? 0) / 3.6;
        const sec = v >= 0.3 ? Math.round(dist / v) : null;
        turnEl.textContent = `${label} ${Math.round(dist)} m${sec != null && sec < 600 ? ` · ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : ''}`;
        turnEl.classList.toggle('map-turn-banner--soon', dist < soon);
      }
    }
    // GEMEINSAMER Zeitstempel für Positions- UND Drehungs-Interpolation (s. updateDisplayPos()) --
    // unconditional, damit beide immer denselben Zeitfaktor t verwenden, auch wenn sich in einem
    // bestimmten Tick nur eines von beiden tatsächlich ändert.
    // Echten Paketabstand mitmessen (4–20/s je nach Einstellung, an Tablets höchstens 10/s) und die Überblendung
    // dort fortsetzen, wo die Anzeige gerade steht -- vorher fest 250 ms: bei 10 Paketen/s sprang das Symbol
    // bei jedem Paket ein Stück vor (Teil des „Wackelns“, Test 22.10.2026).
    const now = performance.now();
    if (this.lastPacketAt) {
      const iv = now - this.lastPacketAt;
      if (iv > 20 && iv < 1000) this.tickIntervalMs = (this.tickIntervalMs || TICK_INTERVAL_MS) * 0.8 + iv * 0.2;
    }
    this.lastPacketAt = now;
    this.updateDisplayPos();
    this.tickReceivedAt = now;
    this.updateMoveHeading(data);

    // Sprung statt Fahrt (Fahrzeugwechsel, Einsteigen, Zurücksetzen): sofort an die neue Stelle, auch im Stand
    // (Hendrik 22.10.2026: nach dem Wechsel drehte die Karte, die Position kam aber erst beim Losfahren).
    // Sprung = weiter als 3 m und deutlich weiter, als das Tempo in einem Paket erlaubt.
    const jumpM = this.targetTickPos && !(data.posX === 0 && data.posZ === 0)
      ? Math.hypot(data.posX - this.targetTickPos.x, data.posZ - this.targetTickPos.z) : 0;
    const expectedM = (Math.max(0, data.speed || 0) / 3.6) * ((this.tickIntervalMs || TICK_INTERVAL_MS) / 1000);
    if (jumpM > Math.max(3, expectedM * 4)) {
      const p = { x: data.posX, z: data.posZ };
      this.prevTickPos = p;
      this.targetTickPos = p;
      this.displayPos = p;
      this.headingTrail = [p];
      this.fwdCheckFrom = null;
    } else if (data.posX === 0 && data.posZ === 0) {
      this.prevTickPos = null;
      this.targetTickPos = null;
    } else if (data.speed >= 1 || !this.targetTickPos) {
      this.prevTickPos = this.displayPos || this.targetTickPos || { x: data.posX, z: data.posZ };
      this.targetTickPos = { x: data.posX, z: data.posZ };
    } else {
      // Bei (nahezu) Stillstand NICHT einfach "nicht mehr aktualisieren" -- das reichte NICHT: prev/
      // target blieben dabei zwei UNTERSCHIEDLICHE Punkte von kurz vor dem Anhalten, und weil
      // tickReceivedAt trotzdem bei jedem Tick neu gesetzt wird, ist updateDisplayPos()s Zeitfaktor t
      // immer wieder bei 0 losgelaufen -- die Anzeige ist dadurch ständig zwischen diesen zwei alten
      // Punkten hin- und hergesprungen (Hendriks Beobachtung "hüpft im Stand", zwei Fixversuche zuvor
      // hatten genau diesen Denkfehler). Fix: auf GENAU EINEN festen Punkt kollabieren, damit die
      // Interpolation unabhängig von t immer denselben Wert ergibt.
      const frozen = this.targetTickPos || { x: data.posX, z: data.posZ };
      this.prevTickPos = frozen;
      this.targetTickPos = frozen;
    }

  }

  // Fahrtrichtung aus der tatsächlichen Positionsänderung ableiten statt aus dem Engine-Feld "heading"
  // -- die Rotationskonvention von getWorldRotation() (Lua-Mod) war nicht zuverlässig zu treffen (erst
  // roh, dann +Math.PI, laut Hendriks Test beides falsch). Bewegungsrichtung ist dagegen rein
  // geometrisch aus unserer EIGENEN, bekannten Weltkoordinate->Canvas-Abbildung ableitbar (kein
  // Rätselraten über Engine-Konventionen mehr nötig). Bei Stillstand bleibt die letzte bekannte
  // Richtung erhalten statt auf 0 zurückzuspringen. Aktualisiert prevHeadingRad/targetHeadingRad für
  // die sanfte Drehungs-Interpolation in updateDisplayPos() -- analog zu prevTickPos/targetTickPos.
  updateMoveHeading(data) {
    if (data.posX === 0 && data.posZ === 0) return;
    const cur = { x: data.posX, z: data.posZ };
    this.lastPos = cur;
    // Echte Fahrzeug-Ausrichtung aus dem Spiel (Mod ab 0.4.2, Vorwärtsvektor): kein Zittern, kein Nachlauf, auch im
    // Stand und beim Rückwärtsfahren richtig. Ohne Vektor (ältere Mod) gilt der Weg aus der Fahrbewegung unten.
    if (Number.isFinite(data.fwdX) && Number.isFinite(data.fwdZ) && Math.hypot(data.fwdX, data.fwdZ) > 0.1) {
      this.checkForwardSign(cur, data);
      const s = this.fwdSign;
      this.applyHeading(Math.atan2(s * data.fwdX, -s * data.fwdZ), (MAP_SMOOTHING[this.smoothing] || MAP_SMOOTHING.wenig).tauVehS);
      return;
    }
    // Bei (nahezu) Stillstand NICHT versuchen, aus der Position eine Richtung abzuleiten -- kleinstes
    // Positionsrauschen hat dann eine praktisch zufällige Richtung ("speed < 1" wie im Lua-Mod für F/R/N).
    // prev/target dabei auf denselben Wert kollabieren (sonst pendelt updateDisplayPos() zwischen zwei alten
    // Werten, s. onTelemetry()). Stillstand und Wechsel vorwärts/rückwärts beginnen den Wegverlauf neu --
    // sonst läge der Bezugspunkt beim Zurücksetzen VOR dem Fahrzeug und die Richtung kippte kurz um 180°.
    if (data.speed < 1 || data.dir !== this.headingTrailDir) {
      this.headingTrail = [cur];
      this.headingTrailDir = data.dir;
      if (this.targetHeadingRad != null) this.prevHeadingRad = this.targetHeadingRad;
      return;
    }
    const trail = this.headingTrail;
    trail.push(cur);
    // Jüngsten Punkt suchen, der mindestens die Wegstrecke der Glättungsstufe zurückliegt; ältere werden nicht mehr gebraucht
    const { baseM, tauS } = MAP_SMOOTHING[this.smoothing] || MAP_SMOOTHING.wenig;
    let base = null;
    for (let i = trail.length - 2; i >= 0; i--) {
      if (Math.hypot(cur.x - trail[i].x, cur.z - trail[i].z) >= baseM) { base = trail[i]; trail.splice(0, i); break; }
    }
    if (trail.length > 600) trail.splice(0, trail.length - 600);
    if (!base) { // noch nicht genug Weg gefahren: Richtung halten
      if (this.targetHeadingRad != null) this.prevHeadingRad = this.targetHeadingRad;
      return;
    }
    let raw = Math.atan2(cur.x - base.x, -(cur.z - base.z));
    // Rückwärts zeigt die Bewegung entgegen der Fahrzeug-Ausrichtung -- das Fahrzeug dreht sich ja nicht um
    if (data.dir === 'R') raw += Math.PI;
    this.applyHeading(raw, tauS);
  }

  // Neue Richtung mit zeitbasierter Trägheit übernehmen (tauS = 0: sofort)
  applyHeading(raw, tauS) {
    const now = performance.now();
    const dt = Math.min(1, Math.max(0, (now - (this.headingAt || now)) / 1000));
    this.headingAt = now;
    const prev = this.targetHeadingRad;
    const alpha = prev == null || tauS <= 0 ? 1 : 1 - Math.exp(-dt / tauS);
    this.prevHeadingRad = this.displayHeadingRad ?? prev ?? raw;
    this.targetHeadingRad = prev == null ? raw : prev + shortestAngleDelta(prev, raw) * alpha;
  }

  // Zeigt der Vektor des Spiels wirklich nach vorn? Je 3 m Fahrweg gegen die Bewegung prüfen (vorwärts: gleiche
  // Richtung, rückwärts: entgegen) und das Vorzeichen per Mehrheit festlegen -- kein Raten über Spiel-Konventionen.
  checkForwardSign(cur, data) {
    if (this.fwdSign == null) { this.fwdSign = 1; this.fwdVotes = 0; }
    if (data.speed < 1 || (data.dir !== 'F' && data.dir !== 'R')) { this.fwdCheckFrom = null; return; }
    if (!this.fwdCheckFrom) { this.fwdCheckFrom = cur; return; }
    const mx = cur.x - this.fwdCheckFrom.x, mz = cur.z - this.fwdCheckFrom.z;
    if (Math.hypot(mx, mz) < 3) return;
    this.fwdCheckFrom = cur;
    const dot = (mx * data.fwdX + mz * data.fwdZ) * (data.dir === 'R' ? -1 : 1);
    this.fwdVotes = Math.max(-5, Math.min(5, this.fwdVotes + (dot >= 0 ? 1 : -1)));
    this.fwdSign = this.fwdVotes < 0 ? -1 : 1;
  }

  // Einstellungen der Kartenkachel (Zahnrad in der Kachel, gespeichert mit der Kachelseite). Gelten für die eine
  // Karte, solange sie in dieser Kachel steckt -- ruft tiles.js beim Einhängen und bei jeder Änderung auf.
  // o.ansicht = „Ausrichtung“ wurde gerade im Zahnrad geändert: dann gilt sie sofort und wird fürs Fahrzeug gemerkt.
  applyTileSettings(s = {}, o = {}) {
    this.ansichtVorgabe = { tilt: !!s.tilt && !s.north, headingUp: !s.north };
    if (o.ansicht) { this.setzeVorgabe(); this.merkeAnsicht(); }
    else if (!this.setzeAnsicht(this.fahrzeug)) this.setzeVorgabe();
    const cov = s.cov !== false;
    this.coverageEnabled = cov;
    this.coverageColorGreen = s.color === 'gruen';
    // Häcksler gibt es nicht mehr als eigenes Symbol (23.10.2026) -- gespeichertes „haecksler“ zeigt den Mähdrescher
    const sym = s.sym === 'haecksler' ? 'drescher' : s.sym;
    this.vehicleSymbol = VEHICLE_SYMBOLS[sym] ? sym : 'traktor';
    this.aheadMode = ['vg', 'fr', 'aus'].includes(s.ahead) ? s.ahead : 'vg';
    this.tileButtons = !!s.btns;
    this.syncToolbarLabels();
    this.applyTileClasses();
  }

  // 'tile' | 'full' | null -- in der Kachel sind Legende und Werkzeugleiste aus (alles übers Zahnrad),
  // Kartentasten nur auf Wunsch; im Vollbild sind die Kartentasten immer da.
  setTileMode(mode) {
    this.tileMode = mode || null;
    this.applyTileClasses();
    if (this.built) setTimeout(() => this.resize(), 30);
  }

  applyTileClasses() {
    const host = document.getElementById('dashboard-map-fullscreen-target');
    if (!host) return;
    host.classList.toggle('map-in-tile', this.tileMode === 'tile');
    host.classList.toggle('map-in-full', this.tileMode === 'full');
    host.classList.toggle('map-tile-buttons', this.tileMode === 'full' || (this.tileMode === 'tile' && this.tileButtons));
  }

  syncToolbarLabels() {
    const t = document.getElementById('map-coverage-toggle');
    if (t) { t.textContent = `Fläche zeigen: ${this.coverageEnabled ? 'An' : 'Aus'}`; t.classList.toggle('map-toolbar-btn--active', this.coverageEnabled); }
    const c = document.getElementById('map-coverage-color-toggle');
    if (c) c.textContent = `Farbe: ${this.coverageColorGreen ? 'Grün' : 'Blau'}`;
    this.updateCoverageLegendSwatch();
  }

  // Glättung für alle Geräte (Einstellungen → Karte, karteEinstellungen.js)
  setSmoothing(v) {
    if (MAP_SMOOTHING[v]) this.smoothing = v;
  }
  setRoadsVisible(on) {
    this.roadsVisible = on !== false;
  }

  pruefeFpsMode(v) {
    return MAP_FPS_MODI.includes(v) ? v : 'maximal';
  }

  setFpsMode(v) {
    this.fpsMode = this.pruefeFpsMode(v);
    mapSettingWrite(MAP_SETTING_FPS, this.fpsMode);
  }

  renderMapSettings() {
    const f = document.getElementById('map-fps-select');
    if (f) f.value = this.fpsMode;
  }

  // Bounding-Box über Feldgrenze + alle Segment-Wegpunkte -- Grundlage fürs "auf Feld einpassen"
  // (Hendriks Feedback: die Karte mit der terrainSize der GANZEN Spielkarte als Maßstab zeigte das
  // Feld nur als winzigen Punkt, "zu sehr rausgezoomt"). Rückgabe null, wenn kein einziger Punkt
  // vorliegt (z.B. Kurs ohne Feldgrenze).
  computeBounds(course) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const consider = (x, z) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    };
    (course?.boundary || []).forEach(([x, z]) => consider(x, z));
    (course?.segments || []).forEach((seg) => (seg.positions || []).forEach(([x, z]) => consider(x, z)));
    if (!Number.isFinite(minX)) return null;
    return { minX, maxX, minZ, maxZ };
  }

  // Vergleich gegen die aktuellen Bounds mit 5%-Toleranz (relativ zur jeweiligen Spannweite) --
  // filtert minimales numerisches Rauschen zwischen zwei Kurs-Updates raus, das sonst als sichtbares
  // Auto-Zoom-Flackern auffällt, ohne echte Feldänderungen (z.B. ein neu angelegter Kurs) zu verpassen.
  boundsChangedSignificantly(nb) {
    if (!this.bounds) return true;
    const thresh = 0.05;
    const spanX = Math.max(1, this.bounds.maxX - this.bounds.minX);
    const spanZ = Math.max(1, this.bounds.maxZ - this.bounds.minZ);
    return Math.abs(nb.minX - this.bounds.minX) > spanX * thresh ||
      Math.abs(nb.maxX - this.bounds.maxX) > spanX * thresh ||
      Math.abs(nb.minZ - this.bounds.minZ) > spanZ * thresh ||
      Math.abs(nb.maxZ - this.bounds.maxZ) > spanZ * thresh;
  }

  // Meter-pro-Pixel-Maßstab -- dieselbe Formel, die worldToCanvas() für die Positionierung nutzt, hier
  // separat verfügbar, um Fahrzeug-/Arbeitsbereich-Symbol maßstabsgetreu (in echten Metern) statt in
  // festen Pixeln zu zeichnen (Hendriks Wunsch: Fahrzeuggröße bleibt beim Zoomen realitätsgetreu).
  // Maßstab nach dem sichtbaren Ausschnitt (im 3D ist die Bühne größer als der Ausschnitt)
  getScale() {
    const vw = this.viewW || this.cssWidth, vh = this.viewH || this.cssHeight;
    const z = this.zoomFactor * (this.tilt ? TILT.zoom : 1);
    if (this.bounds) {
      const margin = 0.1;
      const w = Math.max(1, this.bounds.maxX - this.bounds.minX);
      const h = Math.max(1, this.bounds.maxZ - this.bounds.minZ);
      return Math.min((vw * (1 - 2 * margin)) / w, (vh * (1 - 2 * margin)) / h) * z;
    }
    const terrainSize = this.lastTelemetry?.terrainSize > 0 ? this.lastTelemetry.terrainSize : 2048;
    return (vw / terrainSize) * z;
  }

  // Bildschirmpunkt des Fahrzeugs auf der Leinwand: Mitte, im 3D unten (anchor × Ausschnitthöhe über dem Rand)
  anchorY() { return this.tilt ? this.cssHeight - TILT.anchor * (this.viewH || this.cssHeight) : this.cssHeight / 2; }
  isHeadingUp() { return this.headingUp || this.tilt; }

  // Weltkoordinate -> Canvas-Pixel (CSS-Pixel-Raum, s. resize()). Kamera folgt IMMER dem Fahrzeug
  // (this.displayPos, interpoliert -- s. Datei-Kommentar) statt fest auf die Feldgrenze einzupassen --
  // der Maßstab (wie "groß" das Feld wirkt) kommt weiterhin aus den Kurs-Bounds (mit 10% Rand) ×
  // manuellem zoomFactor (Zoom-Tasten), nur der MITTELPUNKT ist jetzt immer die Fahrzeugposition.
  // Zusätzlich "Heading-up": die ganze Welt wird um die Fahrzeugposition entgegen der Bewegungsrichtung
  // gedreht, sodass das Fahrzeug-Symbol selbst NIE rotiert werden muss (bleibt fest "oben") --
  // stattdessen drehen sich Feldgrenze/Spurführungslinien darum (s. drawLive()). Ohne Position
  // (this.displayPos noch null) fällt alles auf den Bounds-Mittelpunkt (0,0-Verschiebung) zurück.
  worldToCanvas(x, z) {
    const vx = this.displayPos?.x ?? 0;
    const vz = this.displayPos?.z ?? 0;
    const scale = this.getScale();

    let dx = (x - vx) * scale;
    let dz = (z - vz) * scale;

    if (this.isHeadingUp() && this.displayHeadingRad != null) {
      // Gegendrehung um -heading (Herleitung/Vorzeichen s. drawLive()-Kommentar): dreht die Welt so,
      // dass die aktuelle Bewegungsrichtung auf dem Bildschirm immer "oben" ist.
      const th = this.displayHeadingRad;
      const cos = Math.cos(th), sin = Math.sin(th);
      const rdx = dx * cos + dz * sin;
      const rdz = -dx * sin + dz * cos;
      dx = rdx; dz = rdz;
    }

    return { x: this.cssWidth / 2 + dx + this.pan.x, y: this.anchorY() + dz + this.pan.y };
  }

  // Umkehrung von worldToCanvas() -- für Antippen eines Felds
  canvasToWorld(sx, sy) {
    const vx = this.displayPos?.x ?? 0;
    const vz = this.displayPos?.z ?? 0;
    const scale = this.getScale();
    let dx = sx - this.cssWidth / 2 - this.pan.x;
    let dz = sy - this.anchorY() - this.pan.y;
    if (this.isHeadingUp() && this.displayHeadingRad != null) {
      const th = this.displayHeadingRad;
      const cos = Math.cos(th), sin = Math.sin(th);
      const ox = dx * cos - dz * sin;
      const oz = dx * sin + dz * cos;
      dx = ox; dz = oz;
    }
    return { x: vx + dx / scale, z: vz + dz / scale };
  }

  farmColor(farmId) {
    return this.mapData?.farms?.find(f => f.id === farmId)?.color || (farmId === this.mapData?.myFarm ? '#4a9c2f' : '#5b8def');
  }

  // Felder unter allem anderen: eigene/fremde in Hoffarbe, freie grau; Nummer, sobald das Feld groß genug ist
  drawFields(ctx) {
    const fields = this.mapData?.fields;
    if (!fields?.length) return;
    const scale = this.getScale();
    ctx.save();
    ctx.lineWidth = 1.5;
    for (const f of fields) {
      if (f.pts.length < 3) continue;
      const color = f.owner > 0 ? this.farmColor(f.owner) : FIELD_FREE_COLOR;
      ctx.beginPath();
      f.pts.forEach(([x, z], i) => {
        const p = this.worldToCanvas(x, z);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fillStyle = hexToRgba(color, f.owner === this.mapData.myFarm ? 0.22 : 0.12);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(color, 0.6);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(232, 235, 238, 0.85)';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of fields) {
      const sizePx = Math.sqrt(Math.max(0, f.area) * 10000) * scale;
      if (sizePx < 40) continue; // zu klein für eine lesbare Nummer
      const [cx, cz] = f.pts.length >= 3 ? polygonCenter(f.pts) : [f.x, f.z];
      if (cx == null) continue;
      const p = this.worldToCanvas(cx, cz);
      ctx.fillText(String(f.id), p.x, p.y);
    }
    ctx.restore();
  }

  // Andere Spieler (zu Fuß/im Fahrzeug) und Helfer als Punkte mit Namen
  drawOthers(ctx) {
    const list = this.world?.entities;
    if (!list?.length) return;
    ctx.save();
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const e of list) {
      const p = this.worldToCanvas(e.x, e.z);
      if (p.x < -40 || p.y < -40 || p.x > this.cssWidth + 40 || p.y > this.cssHeight + 40) continue;
      ctx.fillStyle = this.farmColor(e.farm);
      ctx.strokeStyle = '#0d0f13';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (e.kind === 'helper') ctx.rect(p.x - 6, p.y - 6, 12, 12); else ctx.arc(p.x, p.y, e.vehicle ? 7 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(232, 235, 238, 0.95)';
      ctx.fillText(e.name, p.x + 10, p.y);
    }
    ctx.restore();
  }

  // Liste der anderen auf der Karte (unten links): Name, Fahrzeug/zu Fuß, Entfernung
  renderOthers() {
    const el = this.wrap?.querySelector('#map-others');
    if (!el) return;
    const list = this.world?.entities || [];
    if (!list.length) { el.style.display = 'none'; return; }
    const me = this.displayPos;
    el.style.display = 'block';
    el.innerHTML = list.slice(0, 6).map(e => {
      const dist = me ? Math.round(Math.hypot(e.x - me.x, e.z - me.z)) : null;
      const what = e.kind === 'helper' ? `Helfer · ${e.vehicle}` : e.vehicle || 'zu Fuß';
      return `<div class="map-other"><span class="map-other-dot ${e.kind === 'helper' ? 'map-other-dot--helper' : ''}" style="background:${this.farmColor(e.farm)}"></span>
        <b>${e.name.replace(/[<>&]/g, '')}</b><span>${what.replace(/[<>&]/g, '')}${dist != null ? ` · ${dist.toLocaleString('de-DE')} m` : ''}</span></div>`;
    }).join('');
  }

  // Feld unter einem Bildschirmpunkt -> kleines Info-Fenster (Nummer, Größe, Besitzer)
  showFieldInfo(sx, sy, ev) {
    const info = this.wrap?.querySelector('#map-field-info');
    if (!info) return;
    const w = this.canvasToWorld(sx, sy);
    const f = this.mapData?.fields?.find(x => x.pts.length >= 3 && pointInPolygon(w.x, w.z, x.pts));
    if (!f) { info.style.display = 'none'; return; }
    const owner = f.owner === 0 ? 'frei (zu kaufen)' : f.owner === this.mapData.myFarm ? 'eigener Hof' : (this.mapData.farms.find(x => x.id === f.owner)?.name || `Hof ${f.owner}`);
    info.innerHTML = `<b>Feld ${f.id}</b><span>${Number.isFinite(f.area) && f.area > 0 ? f.area.toLocaleString('de-DE', { maximumFractionDigits: 2 }) + ' ha · ' : ''}${owner.replace(/[<>&]/g, '')}</span>`;
    // im 3D liegt die Leinwand geneigt -- das Fenster an die Fingerposition im Ausschnitt setzen
    const r = this.wrap.getBoundingClientRect();
    const px = this.tilt && ev ? ev.clientX - r.left : sx, py = this.tilt && ev ? ev.clientY - r.top : sy;
    info.style.left = `${Math.min(px + 12, (this.viewW || this.cssWidth) - 180)}px`;
    info.style.top = `${Math.max(py - 40, 8)}px`;
    info.style.display = 'block';
  }

  // Ziehen (1 Finger/Maus) verschiebt, 2 Finger zoomen, Mausrad zoomt, kurzes Tippen zeigt Feldinfo
  attachGestures() {
    const el = this.liveCanvas;
    el.style.touchAction = 'none';
    const pointers = new Map();
    let start = null;
    let pinchDist = null;
    const interacting = () => { this.interactUntil = performance.now() + 500; }; // solange Finger/Maus aktiv: 30 Bilder/s
    el.addEventListener('pointerdown', (e) => {
      interacting();
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      start = pointers.size === 1 ? { x: e.offsetX, y: e.offsetY, t: Date.now(), moved: false, pan: { ...this.pan } } : null;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      interacting();
      pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (pointers.size === 2 && pinchDist) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > 0) { this.zoomBy(d / pinchDist); pinchDist = d; }
      } else if (start) {
        const dx = e.offsetX - start.x, dy = e.offsetY - start.y;
        if (Math.hypot(dx, dy) > 6) start.moved = true;
        if (start.moved) this.pan = { x: start.pan.x + dx, y: start.pan.y + dy };
      }
    });
    const end = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchDist = null;
      if (start && !start.moved && Date.now() - start.t < 400 && pointers.size === 0) this.showFieldInfo(e.offsetX, e.offsetY, e);
      if (pointers.size === 0) start = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => { e.preventDefault(); interacting(); this.zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
  }

  drawStatic() {
    if (!this.staticCanvas || !this.cssWidth) return;
    const ctx = this.staticCanvas.getContext('2d');
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);

    // Felder, Straßen und bearbeitete Fläche -- unabhängig von einem GPS-Kurs, deshalb VOR dem folgenden
    // „kein Kurs -> Ebene bleibt leer“-Ausstieg.
    this.drawFields(ctx);
    this.drawRoads(ctx);
    this.drawCoverage(ctx);

    if (!this.course) return; // noch kein GPS-Kurs im Spiel angelegt -- Rest der Ebene bleibt leer

    if (this.course.boundary?.length > 1) {
      ctx.beginPath();
      this.course.boundary.forEach(([x, z], i) => {
        const p = this.worldToCanvas(x, z);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      // Feldfläche dezent gefüllt + kräftigere, deutlich sichtbare Kontur (Hendriks Wunsch: Feldrand
      // stärker hervorheben, Fläche füllen) -- Grün passend zum App-Akzent (--primary: #4a9c2f).
      ctx.fillStyle = 'rgba(74, 156, 47, 0.16)';
      ctx.fill();
      ctx.strokeStyle = '#8fce6b';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    (this.course.segments || []).forEach((seg) => {
      if (!seg.positions || seg.positions.length < 2) return;
      ctx.beginPath();
      seg.positions.forEach(([x, z], j) => {
        const p = this.worldToCanvas(x, z);
        if (j === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      });
      ctx.strokeStyle = '#7c93b0';
      ctx.lineWidth = seg.isHeadlandSegment ? 2 : 3;
      ctx.stroke();
    });
  }

  // ---------- Bearbeitete Fläche (Kacheln vom Server) ----------
  onFlaeche(f) {
    if (!f) return;
    if (f.zelleM && f.kachelZ) this.flaecheMass = { zelleM: f.zelleM, kachelZ: f.kachelZ };
    if (f.voll) { this.flaecheTiles.clear(); this.coverageTrail.clear(); }
    const decode = b64 => { const bin = atob(b64); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; };
    for (const [key, b64] of Object.entries(f.tiles || {})) {
      const [kx, kz] = key.split(',').map(Number);
      if (!Number.isFinite(kx) || !Number.isFinite(kz)) continue;
      let bits, doppelt = null;
      try { bits = decode(b64); if (f.doppelt?.[key]) doppelt = decode(f.doppelt[key]); } catch { continue; }
      let t = this.flaecheTiles.get(key);
      if (!t) { t = { kx, kz, canvas: document.createElement('canvas') }; this.flaecheTiles.set(key, t); }
      t.bits = bits;
      t.doppelt = doppelt;   // mehr als einmal bearbeitet (Server schickt es mit jeder geänderten Kachel, sonst gibt es keins)
      this.paintFlaecheTile(t);
      // glatte Umrisse dieser Kachel und der Nachbarn neu rechnen (Ränder hängen an den Nachbarn), erst beim Zeichnen
      // (die alten bleiben bis dahin stehen -- sonst sprang die Kachel kurz auf die Kästchen-Darstellung zurück)
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const n = this.flaecheTiles.get(`${kx + dx},${kz + dz}`); if (n) n.veraltet = true; }
    }
  }

  // Bit eines Kästchens über Kachelgrenzen hinweg (layer = 'bits' | 'doppelt')
  flaecheBit(layer, gc, gr) {
    const n = this.flaecheMass.kachelZ;
    const kx = Math.floor(gc / n), kz = Math.floor(gr / n);
    const b = this.flaecheTiles.get(`${kx},${kz}`)?.[layer];
    if (!b) return 0;
    const i = (gr - kz * n) * n + (gc - kx * n);
    return (b[i >> 3] >> (i & 7)) & 1;
  }

  // Wem gehört das Quadrat zwischen den Kästchen-Mittelpunkten (gc..gc+1, gr..gr+1)? Der ersten vorhandenen Kachel
  // in der Reihenfolge links oben, rechts oben, links unten, rechts unten -- so zeichnet es genau eine Kachel.
  flaecheOwner(gc, gr) {
    const n = this.flaecheMass.kachelZ;
    for (const [c, r] of [[gc, gr], [gc + 1, gr], [gc, gr + 1], [gc + 1, gr + 1]]) {
      const key = `${Math.floor(c / n)},${Math.floor(r / n)}`;
      if (this.flaecheTiles.has(key)) return key;
    }
    return null;
  }

  /**
   * Glatter Umriss einer Kachel als Path2D in Weltkoordinaten (Meter). Das Raster wird erst weich gezeichnet (1-4-6-4-1
   * in beide Richtungen), dann zieht Marching Squares die Linie genau bei 0,5 -- so werden schräge Bahnränder gerade statt
   * Treppen oder Zacken. Gerade Ränder bleiben exakt auf der Kästchengrenze. Volle Bereiche werden zu Rechtecken
   * zusammengefasst (zeilenweise Läufe, gleiche Läufe untereinander verschmolzen).
   * @returns {Path2D|null} null = in dieser Ebene nichts
   */
  buildFlaechePath(t, layer) {
    const { kachelZ: n, zelleM: zm } = this.flaecheMass;
    const x0 = t.kx * n, y0 = t.kz * n;
    const key = `${t.kx},${t.kz}`;
    // Rohraster mit M Kästchen Rand aus den Nachbarkacheln: Index (r + M) * R + (c + M), c, r = -M..n+M-1
    const K = [1, 4, 6, 4, 1], KR = 2, M = KR + 1, R = n + 2 * M;
    const raw = new Uint8Array(R * R);
    const own = t[layer];
    let any = false;
    if (own) for (let i = 0; i < n * n; i++) if ((own[i >> 3] >> (i & 7)) & 1) { raw[((i / n | 0) + M) * R + (i % n) + M] = 1; any = true; }
    for (let r = -M; r < n + M; r++) {
      const inner = r >= 0 && r < n;
      for (let c = -M; c < n + M; c++) {
        if (inner && c === 0) c = n;   // Innenteil schon gefüllt
        if (this.flaecheBit(layer, x0 + c, y0 + r)) { raw[(r + M) * R + c + M] = 1; any = true; }
      }
    }
    if (!any) return null;
    // weiche Proben an den Kästchen-Mittelpunkten -1..n: Index (r + 1) * W + (c + 1); erst quer, dann längs
    const W = n + 2;
    const tmp = new Float32Array(R * W), smp = new Float32Array(W * W);
    for (let r = 0; r < R; r++) for (let c = 0; c < W; c++) {
      const i = r * R + c - 1 + M;
      let v = 0; for (let k = 0; k < 5; k++) v += K[k] * raw[i + k - KR];
      tmp[r * W + c] = v / 16;
    }
    for (let r = 0; r < W; r++) for (let c = 0; c < W; c++) {
      const i = (r - 1 + M) * W + c;
      let v = 0; for (let k = 0; k < 5; k++) v += K[k] * tmp[i + (k - KR) * W];
      smp[r * W + c] = v / 16;
    }
    const path = new Path2D();
    let drawn = false;
    const open = new Map();   // Lauf "c0,c1" → Startzeile
    const flushRect = (c0, c1, r0, r1) => { path.rect((x0 + c0 + 0.5) * zm, (y0 + r0 + 0.5) * zm, (c1 - c0 + 1) * zm, (r1 - r0) * zm); drawn = true; };
    const cut = (a, b) => (a === b ? 0.5 : Math.min(1, Math.max(0, (0.5 - a) / (b - a))));
    for (let r = -1; r < n; r++) {
      const runs = [];
      let runStart = null;
      for (let c = -1; c < n; c++) {
        const i = (r + 1) * W + (c + 1);
        const tl = smp[i], tr = smp[i + 1], br = smp[i + W + 1], bl = smp[i + W];
        const code = (tl >= 0.5) * 8 + (tr >= 0.5) * 4 + (br >= 0.5) * 2 + (bl >= 0.5);
        const mine = (c >= 0 && r >= 0) || this.flaecheOwner(x0 + c, y0 + r) === key;
        if (code === 15 && mine) { if (runStart === null) runStart = c; continue; }
        if (runStart !== null) { runs.push(`${runStart},${c - 1}`); runStart = null; }
        if (!code || !mine) continue;
        const P = { TL: [0, 0], TR: [1, 0], BR: [1, 1], BL: [0, 1], T: [cut(tl, tr), 0], R: [1, cut(tr, br)], B: [cut(bl, br), 1], L: [0, cut(tl, bl)] };
        const names = MS_CASES[code];
        const bx = x0 + c + 0.5, by = y0 + r + 0.5;
        names.forEach((nm, j) => { const [px, py] = P[nm]; if (j) path.lineTo((bx + px) * zm, (by + py) * zm); else path.moveTo((bx + px) * zm, (by + py) * zm); });
        path.closePath();
        drawn = true;
      }
      if (runStart !== null) runs.push(`${runStart},${n - 1}`);
      const now = new Set(runs);
      for (const [k, r0] of open) if (!now.has(k)) { const [c0, c1] = k.split(',').map(Number); flushRect(c0, c1, r0, r); open.delete(k); }
      for (const k of runs) if (!open.has(k)) open.set(k, r);
    }
    for (const [k, r0] of open) { const [c0, c1] = k.split(',').map(Number); flushRect(c0, c1, r0, n); }
    return drawn ? path : null;
  }

  paintFlaecheTile(t) {
    const n = this.flaecheMass.kachelZ;
    t.canvas.width = n; t.canvas.height = n;
    const c = t.canvas.getContext('2d');
    const img = c.createImageData(n, n);
    const [r, g, b] = this.coverageColorGreen ? [74, 156, 47] : [58, 140, 176];
    // Doppelt bearbeitet (Hendrik 23.10.2026): dieselbe Farbe dunkler und deckender -- nur zwei Stufen
    const [r2, g2, b2] = [r, g, b].map(v => Math.round(v * 0.45));
    const dop = t.doppelt;
    for (let i = 0; i < n * n; i++) {
      if (!(t.bits[i >> 3] & (1 << (i & 7)))) continue;
      const o = i * 4;
      if (dop && (dop[i >> 3] & (1 << (i & 7)))) { img.data[o] = r2; img.data[o + 1] = g2; img.data[o + 2] = b2; img.data[o + 3] = 242; continue; }   // 95 % deckend
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 102;   // 40 % deckend
    }
    c.putImageData(img, 0, 0);
  }

  recolorFlaeche() { for (const t of this.flaecheTiles.values()) this.paintFlaecheTile(t); }

  // Welt → Leinwand als Matrix (dieselbe Abbildung wie worldToCanvas(), nur einmal je Bild ausgerechnet)
  worldMatrix() {
    const o = this.worldToCanvas(0, 0), ex = this.worldToCanvas(1, 0), ez = this.worldToCanvas(0, 1);
    return [ex.x - o.x, ex.y - o.y, ez.x - o.x, ez.y - o.y, o.x, o.y];
  }

  drawCoverage(ctx) {
    if (!this.coverageEnabled || !this.flaecheTiles.size) return;
    const { zelleM, kachelZ } = this.flaecheMass;
    const size = zelleM * kachelZ;
    const reach = size * 0.75 * this.getScale() + 4;
    // Nah herangezoomt: glatte Umrisse (Hendrik 23.10.2026: „weniger verpixelt“). Alle sichtbaren Kacheln in EINEM
    // Pfad gefüllt, so gibt es keine Nähte an den Kachelrändern. Gerechnet wird je Kachel nur nach einer Änderung.
    if (zelleM * this.getScale() >= COVERAGE_SMOOTH_MIN_PX && typeof Path2D === 'function') {
      // Umrisse rechnen kostet je Kachel einige ms -- höchstens 6 je Bild, die übrigen so lange noch als Kästchen-Bild
      const einmal = new Path2D(), doppelt = new Path2D();
      let hatDoppelt = false, gerechnet = 0;
      const nochBild = [];
      for (const t of this.flaecheTiles.values()) {
        const c = this.worldToCanvas((t.kx + 0.5) * size, (t.kz + 0.5) * size);
        if (c.x < -reach || c.y < -reach || c.x > this.cssWidth + reach || c.y > this.cssHeight + reach) continue;
        if (!t.paths || t.veraltet) {
          if (gerechnet < 6) {
            t.paths = { e: this.buildFlaechePath(t, 'bits'), d: this.buildFlaechePath(t, 'doppelt') };
            t.veraltet = false;
            gerechnet++;
          } else if (!t.paths) { nochBild.push(t); continue; }
        }
        if (t.paths.e) einmal.addPath(t.paths.e);
        if (t.paths.d) { doppelt.addPath(t.paths.d); hatDoppelt = true; }
      }
      // Spur hinter dem Balken in denselben Pfad (keine doppelte Deckkraft, wo der Server schon Fläche geschickt hat).
      // Jedes Viereck gleich herum wie die übrigen Umrisse -- gegenläufige würden die Füllregel aufheben (Löcher)
      for (const spur of this.coverageTrail.values()) {
        for (let i = 1; i < spur.length; i++) {
          const [a0, a1] = spur[i - 1].ends, [b0, b1] = spur[i].ends;
          let q = [a0, a1, b1, b0], flaeche = 0;
          for (let j = 0; j < 4; j++) { const [x1, z1] = q[j], [x2, z2] = q[(j + 1) % 4]; flaeche += x1 * z2 - x2 * z1; }
          if (flaeche < 0) q = q.reverse();
          einmal.moveTo(q[0][0], q[0][1]); for (let j = 1; j < 4; j++) einmal.lineTo(q[j][0], q[j][1]); einmal.closePath();
        }
      }
      const [r, g, b] = this.coverageColorGreen ? [74, 156, 47] : [58, 140, 176];
      const m = this.worldMatrix();
      ctx.save();
      ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.4)`;
      ctx.fill(einmal, 'nonzero');
      if (hatDoppelt) { ctx.fillStyle = `rgba(${Math.round(r * 0.45)}, ${Math.round(g * 0.45)}, ${Math.round(b * 0.45)}, 0.95)`; ctx.fill(doppelt); }
      ctx.imageSmoothingEnabled = false;
      for (const t of nochBild) ctx.drawImage(t.canvas, t.kx * size, t.kz * size, size, size);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.imageSmoothingEnabled = false;   // scharfe Kästchen, keine hellen Nähte an den Kachelrändern
    const m = this.worldMatrix();
    for (const t of this.flaecheTiles.values()) {
      const c = this.worldToCanvas((t.kx + 0.5) * size, (t.kz + 0.5) * size);
      if (c.x < -reach || c.y < -reach || c.x > this.cssWidth + reach || c.y > this.cssHeight + reach) continue;   // außerhalb
      ctx.save();
      ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
      ctx.drawImage(t.canvas, t.kx * size, t.kz * size, size, size);
      ctx.restore();
    }
    ctx.restore();
  }

  // Straßennetz als ein Pfad in Weltkoordinaten (einmal gebaut), gezeichnet mit der Welt-Matrix
  drawRoads(ctx) {
    if (!this.roadsVisible || !this.roads?.lines?.length) return;
    if (!this.roadPath) {
      const p = new Path2D();
      for (const line of this.roads.lines) line.forEach(([x, z], i) => (i === 0 ? p.moveTo(x, z) : p.lineTo(x, z)));
      this.roadPath = p;
    }
    const scale = this.getScale();
    ctx.save();
    const m = this.worldMatrix();
    ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(150, 156, 166, 0.55)';
    ctx.lineWidth = Math.max(3.5, 6 * scale) / scale;   // ~6 m breit, mindestens 3,5 Pixel
    ctx.stroke(this.roadPath);
    ctx.restore();
  }

  drawLive() {
    if (!this.liveCanvas || !this.cssWidth) return;
    const ctx = this.liveCanvas.getContext('2d');
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    const data = this.lastTelemetry;
    if (!data) return;
    this.drawOthers(ctx);

    // Aktuelle Lenkführungs-Linie hervorheben: courseSegIdx kommt aus course.currentSegmentIndex
    // (s. Lua-Mod getSteeringInfo()) -- läuft laut Mod-Kommentar auch dann weiter mit, wenn das
    // Lenksystem gerade AUS ist (Fallback auf lastActiveSteeringFieldCourse), zeigt also "die Linie,
    // die bei Aktivierung übernommen würde". steerOn entscheidet nur den Stil, nicht ob überhaupt
    // etwas gezeichnet wird. "-1": Hendriks Test zeigte, dass IMMER die im Uhrzeigersinn/links
    // benachbarte Linie markiert war, statt der tatsächlichen -- klassisches Anzeichen für Lua
    // (1-basiert, currentSegmentIndex direkt aus dem Spiel) vs. unser per .map() aufgebautes JS-Array
    // (0-basiert): Index N aus dem Spiel entspricht Element N-1 in diesem Array.
    const seg = this.course?.segments?.[data.courseSegIdx - 1];
    if (seg?.positions?.length > 1) {
      ctx.beginPath();
      seg.positions.forEach(([x, z], j) => {
        const p = this.worldToCanvas(x, z);
        if (j === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      });
      if (data.steerOn) {
        ctx.setLineDash([]);
        ctx.strokeStyle = '#3ad6ff';
        ctx.lineWidth = 5;
        ctx.shadowColor = '#3ad6ff';
        ctx.shadowBlur = 10;
      } else {
        ctx.setLineDash([10, 8]);
        ctx.strokeStyle = '#ffb23a';
        ctx.lineWidth = 4;
        ctx.shadowBlur = 0;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.setLineDash([]);
    }

    if (!this.displayPos) { this.placeVehicle3d(null); return; } // kein Fahrzeug/keine Position bekannt

    const p = this.worldToCanvas(this.displayPos.x, this.displayPos.z);
    const scale = this.getScale();
    ctx.save();
    ctx.translate(p.x, p.y);
    // Im Heading-up-Modus dreht sich die WELT um das Fahrzeug (s. worldToCanvas()) -- das Symbol
    // selbst bleibt dann fest "oben" stehen. Nur im Nord-oben-Modus zeigt es seine tatsächliche
    // Bewegungsrichtung.
    if (!this.isHeadingUp()) ctx.rotate(this.displayHeadingRad ?? 0);

    // Arbeitsbereich (Anbaugerät) HINTER dem Fahrzeug -- Breite = tatsächliche Arbeitsbreite (pfWorkWidth,
    // Meter), Tiefe fest schmal (nur ein Balken, keine reale Gerätelänge bekannt/nötig), mit etwas Abstand
    // zum Fahrzeug-Heck (Hendriks Wunsch). Farbe zeigt Aus+Angehoben (grau) vs. Gesenkt/Angeschaltet
    // (grün) -- getIsLowered()/getIsTurnedOn() aus dem Lua-Mod (impLow/impOn), nicht die sprüherspezifische
    // pfIsWorking (gilt nur für Sprüher/Streuer, dieses Symbol soll für jedes Anbaugerät funktionieren).
    // Jedes Gerät gleitend (geraetLage): gezogene, Deichselgeräte an den Unterlenkern (das Spiel meldet sie als
    // angebaut) und der Balken von Hand knicken ab; starr angebaute ändern ihre Lage nicht, bei ihnen bleibt es gleich.
    const segs = workSegments(data)?.map(seg => (seg.rel ? { ...seg, ...this.geraetLage(seg) } : seg));
    if (segs) {
      // Lage relativ zum Fahrzeug -- so bleibt das Gerät am geglätteten Symbol (s. geraetLage).
      // Leinwand: vorn = −y, quer + = links = −x.
      for (const seg of segs) {
        if (seg.sections || seg.pf) { this.drawSections(ctx, seg, scale); continue; }
        if (seg.rel.length > 2) this.drawImplementBody(ctx, seg, scale);   // Rahmen von der Anhängung zum Balken
        ctx.fillStyle = seg.active ? 'rgba(74, 156, 47, 0.85)' : 'rgba(120, 128, 138, 0.8)';
        ctx.strokeStyle = seg.active ? '#a6dc84' : '#1f2328';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        seg.rel.forEach(([along, across], i) => {
          const x = -across * scale, y = -along * scale;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.closePath();
        // ein Balken mit nur zwei Ecken (Handwerte) bekommt eine sichtbare Tiefe
        if (seg.rel.length === 2) { ctx.lineWidth = Math.max(3, IMPLEMENT_DEPTH_M * scale); ctx.strokeStyle = ctx.fillStyle; ctx.stroke(); }
        else { ctx.fill(); ctx.stroke(); this.drawTines(ctx, seg, scale); }
      }
      // Der Auslösepunkt (Ton/Aktionen) steht seit dem Test vom 23.10.2026 nur noch in der Vorschau des GPS-Menüs,
      // nicht mehr auf der Karte (Hendrik: „in der normalen Kartenübersicht nicht auf der Maschine“).
    } else if (data.pfWorkWidth > 0) {
      const halfWidthPx = (data.pfWorkWidth / 2) * scale;
      const depthPx = IMPLEMENT_DEPTH_M * scale;
      const rearPx = (TRACTOR_LENGTH_M * 0.5 + this.implementGapM) * scale;
      const active = data.impLow === 1 || data.impOn === 1;
      ctx.fillStyle = active ? 'rgba(74, 156, 47, 0.75)' : 'rgba(160, 160, 160, 0.55)';
      ctx.strokeStyle = active ? '#8fce6b' : '#c9c9c9';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(-halfWidthPx, rearPx, halfWidthPx * 2, depthPx);
      ctx.fill();
      ctx.stroke();
    }

    // Fahrzeugsymbol in echter Größe (Traktor 2,8 × 4,8 m), skaliert mit dem Zoom -- wählbar in der Kartenkachel
    // (Automatisch/Traktor/Drescher/Pfeil, 22.10.2026; vorher ein orangefarbenes Dreieck).
    const art = this.vehicleSymbol;
    // 3D: gibt es ein Bild von schräg hinten, steht das Fahrzeug aufrecht darüber (placeVehicle3d), hier nur sein Schatten
    const bild3d = this.tilt ? window.KartenFahrzeuge?.schraeg(art) : null;
    drawVehicleSymbol(ctx, art, scale, data.brand, { nurSchatten: !!bild3d });
    ctx.restore();
    this.placeVehicle3d(bild3d, p, scale);
  }
}

// Lage eines gezogenen Geräts relativ zum Fahrzeug, gleitend zwischen zwei Datensätzen wie das Fahrzeug selbst
// (updateDisplayPos, gleicher Paketabstand; neuer Datensatz: Überblendung von der gerade gezeigten Lage aus, Sprung > 5 m
// ohne). Hendrik 24.10.2026: „läuft immer noch komisch nach, z. B. Sämaschine oder Anhänger“ -- kurz zuvor stand das
// Gerät in der Lage der Welt; gegen das geglättete Symbol schwenkte es dann zu früh bzw. zu spät aus und rückte je
// Datensatz ruckartig nach. Am Symbol mit dem echten Knickwinkel aus dem Spiel bleibt das Nachlaufen wie im Spiel.
// Durchsicht 24.10.2026: gilt jetzt für jedes Gerät (vorher nur „gezogen“) -- Deichselgeräte an den Unterlenkern meldet
// das Spiel als angebaut, sie sprangen sonst je Datensatz. Der Gerätewinkel (seg.ang) gleitet mit, sonst passten Balken
// und Rahmen zwischen zwei Datensätzen nicht zusammen. Ergebnis: { rel, ang }.
DashboardMapView.prototype.geraetLage = function (seg) {
  const rel = seg.rel, ang = Number.isFinite(seg.ang) ? seg.ang : null;
  const m = this.geraeteRel || (this.geraeteRel = new Map());
  const now = performance.now(), iv = this.tickIntervalMs || TICK_INTERVAL_MS;
  const lage = e => {
    const t = Math.min(1, (now - e.at) / iv);
    const d = e.ang != null && e.prevAng != null ? ((e.ang - e.prevAng + 540) % 360) - 180 : 0;   // kürzester Weg
    return { rel: e.cur.map((p, i) => [e.prev[i][0] + (p[0] - e.prev[i][0]) * t, e.prev[i][1] + (p[1] - e.prev[i][1]) * t]),
      ang: e.ang == null ? null : (e.prevAng == null ? e.ang : e.prevAng + d * t) };
  };
  let e = m.get(seg.key);
  const neu = !e || e.cur.length !== rel.length || e.ang !== ang || e.cur.some((p, i) => p[0] !== rel[i][0] || p[1] !== rel[i][1]);
  if (neu) {
    const jetzt = e && e.cur.length === rel.length ? lage(e) : null;
    const sprung = !jetzt || Math.hypot(jetzt.rel[0][0] - rel[0][0], jetzt.rel[0][1] - rel[0][1]) > 5;
    e = { prev: sprung ? rel : jetzt.rel, cur: rel, prevAng: sprung ? ang : jetzt.ang, ang, at: now };
    m.set(seg.key, e);
    if (m.size > 20) m.delete(m.keys().next().value);
  }
  const r = lage(e);
  return { rel: r.rel, ang: r.ang ?? seg.ang };
};

// ---------- Geräte-Darstellung (23.10.2026: „Modelle müssen besser werden“) ----------
// Lage relativ zum Fahrzeug: längs + = vorn, quer + = links; Leinwand: x = −quer, y = −längs (wie drawLive)
// Rahmen zwischen Anhängepunkt und Arbeitsbalken: angebaut als Dreipunkt-Rahmen, angehängt als Deichsel + Rahmen
DashboardMapView.prototype.drawImplementBody = function (ctx, seg, scale) {
  if (!seg.hitch) return;
  // Im Rahmen des Geräts rechnen (gezogen: abgeknickt, Hendrik 24.10.2026), zum Zeichnen zurück relativ zum Fahrzeug
  const L = window.Teilbreiten.balkenLage(seg.rel, seg.ang);
  if (!L) return;
  const [hl, hq] = L.zuLokal(seg.hitch);
  const left = L.qMax, right = L.qMin;
  // Vorderkante des Balkens (zum Anhängepunkt hin)
  const front = Math.abs(L.lMax - hl) < Math.abs(L.lMin - hl) ? L.lMax : L.lMin;
  const dir = front < hl ? 1 : -1;   // Gerät hinten: Rahmen liegt vor dem Balken
  const P = (l, q) => { const [a, c] = L.zurueck([l, q]); return [-c * scale, -a * scale]; };
  const linie = (a, b) => { ctx.moveTo(...P(...a)); ctx.lineTo(...P(...b)); };
  const frameDepth = Math.min(1.2, Math.abs(hl - front) * 0.6);
  const y0 = front + dir * frameDepth, y1 = front + dir * frameDepth * 0.35;
  ctx.save();
  ctx.lineJoin = 'round';
  if (seg.attach === 'trailed') {
    ctx.strokeStyle = '#2a2f36'; ctx.lineWidth = Math.max(2, 0.18 * scale); ctx.lineCap = 'round';
    ctx.beginPath(); linie([hl, hq], [y0, (left + right) / 2]); ctx.stroke();
  } else {
    ctx.strokeStyle = '#3a4048'; ctx.lineWidth = Math.max(1.5, 0.12 * scale);
    ctx.beginPath();
    linie([hl, hq + 0.45], [y0, left * 0.35]);
    linie([hl, hq - 0.45], [y0, right * 0.35]);
    linie([hl + 0.15 * dir, hq], [y0, (left + right) / 2]);
    ctx.stroke();
  }
  // Querträger über die ganze Breite
  ctx.fillStyle = '#4b525c'; ctx.strokeStyle = '#1f2328'; ctx.lineWidth = 1;
  ctx.beginPath();
  [[y0, left], [y0, right], [y1, right], [y1, left]].forEach((q, i) => (i ? ctx.lineTo(...P(...q)) : ctx.moveTo(...P(...q))));
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
};

// Teilbreiten als Kästchen (Anmerkung 28, Hendrik: „die gesamtmögliche Breite immer anzeigen, aktive grün hinterlegt,
// die anderen nicht, und leicht voneinander abgetrennt“). Aktive grün (kräftig beim Arbeiten, blasser angehoben),
// ausgeschaltete nur als Rahmen, zwischen den Teilbreiten eine kleine Lücke. Lage aus public/js/teilbreiten.js; die
// letzte Lage bleibt gemerkt, damit bei „alles aus“ die volle Breite stehen bleibt. Der Rahmen des Geräts reicht über
// die volle Breite.
DashboardMapView.prototype.drawSections = function (ctx, seg, scale) {
  const T = window.Teilbreiten;
  if (!T) return;
  this.tbBasis = this.tbBasis || new Map();
  this.tbLaengs = this.tbLaengs || new Map();
  let ends = null;
  if (seg.rel) {
    // Enden und Tiefe im Rahmen des Geräts (gezogene Spritze knickt ab, Hendrik 24.10.2026); Handwerte: [links, rechts]
    const L = seg.rel.length > 2 ? T.balkenLage(seg.rel, seg.ang) : null;
    ends = L ? L.ends : [seg.rel[0], seg.rel[1]];
    this.tbLaengs.set(seg.unit, L ? L.lMax - L.lMin : 0);
  }
  const lage = T.kaesten({ sections: seg.sections, pfSek: seg.pf, on: seg.on }, ends, this.tbBasis.get(seg.unit), seg.hand);
  if (!lage) return;
  this.tbBasis.set(seg.unit, lage.basis);
  const h = Math.max(this.tbLaengs.get(seg.unit) || 0, 1.2, 7 / scale) / 2;   // Kästchentiefe: gut sichtbar, auch weit herausgezoomt
  const n = [lage.basis.dir[1], -lage.basis.dir[0]];   // längs, senkrecht zum Balken
  // Rahmen des Geräts über die volle Breite (alle Kästchen), entlang des Balkens
  const d = lage.basis.dir, M = lage.basis.mitte;
  const alle = lage.boxes.flatMap(b => [b.a, b.b]).map(p => (p[0] - M[0]) * d[0] + (p[1] - M[1]) * d[1]);
  const EL = [M[0] + d[0] * Math.max(...alle), M[1] + d[1] * Math.max(...alle)], ER = [M[0] + d[0] * Math.min(...alle), M[1] + d[1] * Math.min(...alle)];
  this.drawImplementBody(ctx, { ...seg, ang: Math.atan2(-n[1], n[0]) * 180 / Math.PI,
    rel: [[EL[0] + n[0] * h, EL[1] + n[1] * h], [ER[0] + n[0] * h, ER[1] + n[1] * h], [ER[0] - n[0] * h, ER[1] - n[1] * h], [EL[0] - n[0] * h, EL[1] - n[1] * h]] }, scale);
  const luecke = Math.max(0.12, 2 / scale);            // Abstand zwischen den Teilbreiten (mind. 2 Bildpunkte)
  const px = ([al, q]) => [-q * scale, -al * scale];
  ctx.save();
  ctx.lineJoin = 'round';
  for (const b of lage.boxes) {
    const dx = b.b[0] - b.a[0], dy = b.b[1] - b.a[1], len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const g = Math.min(luecke / 2, len / 4), ux = dx / len, uy = dy / len;
    const A = [b.a[0] + ux * g, b.a[1] + uy * g], B = [b.b[0] - ux * g, b.b[1] - uy * g];
    const pts = [[A[0] + n[0] * h, A[1] + n[1] * h], [B[0] + n[0] * h, B[1] + n[1] * h], [B[0] - n[0] * h, B[1] - n[1] * h], [A[0] - n[0] * h, A[1] - n[1] * h]].map(px);
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    if (b.on) {
      // nur ein Teil der Düsen an (Precision Farming, Einzeldüsen): blasser
      ctx.fillStyle = seg.active && !b.teil ? 'rgba(74, 156, 47, 0.9)' : 'rgba(74, 156, 47, 0.45)';
      ctx.fill();
      ctx.strokeStyle = seg.active ? '#a6dc84' : '#6fa458';
      ctx.lineWidth = Math.max(1, Math.min(2, 0.08 * scale));
    } else {
      ctx.fillStyle = 'rgba(20, 24, 28, 0.35)';   // nur leicht abgedunkelt, damit der Rahmen auf jedem Grund lesbar bleibt
      ctx.fill();
      ctx.strokeStyle = 'rgba(190, 196, 204, 0.8)';
      ctx.lineWidth = Math.max(1, Math.min(1.6, 0.06 * scale));
    }
    ctx.stroke();
  }
  ctx.restore();
};

// Zinken bzw. Werkzeuge als kurze Striche quer über den Balken, etwa alle 0,5 m
DashboardMapView.prototype.drawTines = function (ctx, seg, scale) {
  if (scale < 6) return;   // weit herausgezoomt nur der Balken
  const L = window.Teilbreiten.balkenLage(seg.rel, seg.ang);   // im Rahmen des Geräts (gezogen: abgeknickt)
  if (!L) return;
  const P = (l, q) => { const [a, c] = L.zurueck([l, q]); return [-c * scale, -a * scale]; };
  const tief = (L.lMax - L.lMin) * scale;
  ctx.save();
  ctx.strokeStyle = seg.active ? 'rgba(20, 50, 10, 0.55)' : 'rgba(20, 24, 28, 0.55)';
  ctx.lineWidth = Math.max(1, 0.06 * scale);
  ctx.beginPath();
  const rand = tief > 2 ? 1 / scale : 0;
  for (let q = L.qMin + 0.25; q < L.qMax; q += 0.5) { ctx.moveTo(...P(L.lMax - rand, q)); ctx.lineTo(...P(L.lMin + rand, q)); }
  ctx.stroke();
  ctx.restore();
};

// ---------- Paket I: Geräte aus Mod 0.5 (Lage relativ zum Fahrzeug: längs + = vorn, quer + = links) ----------
function frameOf(d) {
  const fl = Math.hypot(d?.fwdX || 0, d?.fwdZ || 0);
  return fl > 0.1 ? { x: d.posX, z: d.posZ, fx: d.fwdX / fl, fz: d.fwdZ / fl } : null;
}
function relToWorld(F, along, across) {
  return [F.x + F.fx * along + F.fz * across, F.z + F.fz * along - F.fx * across];
}
function worldToRel(F, p) {
  const dx = p[0] - F.x, dz = p[1] - F.z;
  return [dx * F.fx + dz * F.fz, dx * F.fz - dz * F.fx];
}
// Arbeitsbalken je Gerät: breitester Arbeitsbereich aus dem Spiel; hat der Server (GPS-Menü) Handwerte
// für das GPS-Gerät, gilt dessen Balken. null = keine Mod-0.5-Daten → altes Modell.
// Arbeitsbereiche, die nicht als Arbeit zählen (Mod 0.6 schickt den Namen der Art; gleiche Liste wie server/flaeche.js)
// Wann ein Gerät als arbeitend zählt (GPS-Menü je Gerät, Test 23.10.2026): auto = gesenkt oder eingeschaltet
// Gerät ohne Ein/Aus im Spiel: „Eingeschaltet“/„Gesenkt und eingeschaltet“ zählen nach dem Absenken (wie server/flaeche.js covWirksam)
// Noch nicht auseinandergeklappt (Hendrik 24.10.2026: Balken dann automatisch ausblenden); wie server/flaeche.js eingeklappt.
// Unbekannt (unfolded fehlt) gilt als ausgeklappt.
const unitFolded = u => u?.canFold === true && u?.unfolded === false;

// Arbeitet das Gerät? Gleiche Regel wie der Server (public/js/teilbreiten.js arbeitet)
const unitWorking = (u, opt) => window.Teilbreiten.arbeitet(u, opt);
function workSegments(d) {
  const units = Array.isArray(d?.units) ? d.units : [];
  const gps = d?.gps;
  const opts = gps?.geraete || {};
  const segs = [];
  for (const u of units) {
    if (opts[u.name]?.map === false) continue;   // „Auf der Karte zeigen“ aus, z. B. Frontgewicht oder Anhänger
    if (unitFolded(u)) continue;                 // eingeklappt: kein Balken, bis das Gerät ausgeklappt ist
    // Teilbreiten (Mod 0.7, Anmerkung 28): Balken über alle aktiven Arbeitsbereiche, gezeichnet als Kästchen; ist alles
    // aus, kommt kein Bereich -- dann nur die (grauen) Kästchen an der zuletzt bekannten Lage
    // Mit Handwerten im GPS-Menü (Test 23.10.2026, Dammann): Kästchen entlang des Handwert-Balkens, vorher fehlten sie dann
    // Precision Farming (Mod 0.7.2): Kästchen nach den Düsen-Teilbreiten von PF (public/js/teilbreiten.js kaesten)
    if (u.sections || u.pfSek) {
      const tb = window.Teilbreiten?.balken(u);
      const F = frameOf(d);
      // Handwerte nur, wenn wirklich von Hand gesetzt (sonst ist es die Rechnung ohne Arbeitsbereich, z. B. alles aus);
      // ein Balken von Hand steht dann für die ganze Breite (hand: kaesten im Modus voll)
      const hand = !!(gps?.source === 'hand' && gps.manual !== false && gps.unit === u.name && Array.isArray(gps.corners) && F);
      segs.push({ key: u.name + '|' + u.side + u.depth, rel: hand ? gps.corners.map(p => worldToRel(F, p)) : (tb ? tb.corners : null), active: unitWorking(u, opts[u.name]),
        hitch: u.joint ? [u.joint.along, u.joint.across] : null, attach: u.attach, ang: window.Teilbreiten?.geraeteWinkel(u), sections: u.sections, pf: u.pfSek, on: u.on, unit: u.name, hand });
      continue;
    }
    if (!u.areas?.length || (gps?.source === 'hand' && gps.manual !== false && gps.unit === u.name)) continue;
    // Arbeitsbereich wie Server und GPS: ohne Auswurf (Anmerkung 6), Flügel nebeneinander zusammen (Durchsicht 24.10.)
    const best = window.Teilbreiten.arbeitsbereich(u);
    if (!best) continue;
    segs.push({ key: u.name + '|' + u.side + u.depth, rel: best.corners, active: unitWorking(u, opts[u.name]),
      hitch: u.joint ? [u.joint.along, u.joint.across] : null, attach: u.attach, ang: window.Teilbreiten?.geraeteWinkel(u) });
  }
  // Balken von Hand nur, wenn Werte von Hand gesetzt sind -- sonst zeichnete die Karte z. B. hinter einem Anhänger ohne
  // Arbeitsbereich einen erfundenen 6-m-Balken (Durchsicht 24.10.2026)
  if (gps?.source === 'hand' && gps.manual !== false && gps.corners && opts[gps.unit]?.map !== false && !units.some(x => x.name === gps.unit && (x.sections || x.pfSek || unitFolded(x)))) {
    const F = frameOf(d);
    const u = units.find(x => x.name === gps.unit);
    if (F) segs.push({ key: 'gps', rel: gps.corners.map(p => worldToRel(F, p)), active: u ? unitWorking(u, opts[u.name]) : (d.impLow === 1 || d.impOn === 1), attach: u?.attach });
  }
  // Mit Mod-0.5-Daten nie auf das alte Ersatz-Symbol zurückfallen -- sonst zeichnete die Karte für ein Gerät mit
  // „Auf der Karte zeigen: aus“ wieder einen Balken hinter das Fahrzeug (Test 23.10.2026)
  if (segs.length || units.some(u => Array.isArray(u.areas) && u.areas.length) || gps?.source) return segs;
  return null;
}

window.dashboardMapView = new DashboardMapView();
