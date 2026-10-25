/**
 * Rasterlogik der Kachelseiten (Umsetzungsplan Paket H, 22.10.2026) -- ohne Oberfläche, damit sie sich
 * per `npm test` prüfen lässt (test/tileGrid.test.js lädt diese Datei in eine leere Umgebung).
 *
 * - Raster fest 2 Zeilen × 3 Spalten, je Feld ein Baustein (cells[0..5], Zeile für Zeile).
 * - Gleiche Bausteine in benachbarten Feldern werden zu EINER Kachel verbunden -- aber nur, wenn sie
 *   zusammen ein Rechteck bilden. Sonst bleibt jedes Feld eine eigene Kachel und der Baustein wird als
 *   "nicht rechteckig" gemeldet (Hinweis beim Einrichten).
 * - Standardseiten (profiles leer) gelten für alle Profile, Profilseiten nur für die genannten.
 * - Je Profil sind höchstens 10 Seiten zu sehen, je Spiel gibt es höchstens 100 (zuVieleSichtbar).
 */
(function (root) {
  const COLS = 3;
  const ROWS = 2;

  function merge(cells) {
    const list = Array.from({ length: COLS * ROWS }, (_, i) => (cells && typeof cells[i] === 'string' ? cells[i] : ''));
    const tiles = [];
    const bad = [];
    const single = i => ({ type: list[i], cells: [i], row: Math.floor(i / COLS), col: i % COLS, rows: 1, cols: 1, size: 1 });
    const types = [...new Set(list.filter(Boolean))];
    for (const type of types) {
      const idx = list.map((c, i) => (c === type ? i : -1)).filter(i => i >= 0);
      const rs = idx.map(i => Math.floor(i / COLS));
      const cs = idx.map(i => i % COLS);
      const r0 = Math.min(...rs), r1 = Math.max(...rs), c0 = Math.min(...cs), c1 = Math.max(...cs);
      let rect = (r1 - r0 + 1) * (c1 - c0 + 1) === idx.length;
      if (rect) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (list[r * COLS + c] !== type) rect = false;
      if (rect) tiles.push({ type, cells: idx, row: r0, col: c0, rows: r1 - r0 + 1, cols: c1 - c0 + 1, size: idx.length });
      else { bad.push(type); idx.forEach(i => tiles.push(single(i))); }
    }
    list.forEach((c, i) => { if (!c) tiles.push(single(i)); });
    tiles.sort((a, b) => a.cells[0] - b.cells[0]);   // Lesereihenfolge (für Tastatur/Screenreader)
    return { tiles, bad };
  }

  const isProfilePage = p => Array.isArray(p?.profiles) && p.profiles.length > 0;
  const pagesFor = (pages, profile) => (pages || []).filter(p => !isProfilePage(p) || p.profiles.includes(profile));
  // Hauptseite eines Profils (Hendrik 24.10.2026: „eine Hauptansicht …, die immer beim Laden des Profils ausgewählt
  // ist“): eine eigene Seite des Profils mit haupt vor einer Standardseite mit haupt; null = keine
  const hauptseite = (pages, profile) => {
    const h = pagesFor(pages, profile).filter(p => p.haupt);
    return h.find(isProfilePage) || h[0] || null;
  };
  // Hauptseite einschalten: Seiten, die für dieselben Profile Hauptseite wären, verlieren es (eigene Seiten mit
  // gemeinsamem Profil bzw. die anderen Standardseiten); ändert pages
  function setzeHaupt(pages, page, an) {
    if (!an) { delete page.haupt; return; }
    for (const q of pages) {
      if (q === page || !q.haupt) continue;
      const konflikt = isProfilePage(page) ? isProfilePage(q) && q.profiles.some(n => page.profiles.includes(n)) : !isProfilePage(q);
      if (konflikt) delete q.haupt;
    }
    page.haupt = true;
  }
  // Grenzen (Hendrik 24.10.2026: „10 pro Profil maximum sinnvoll, aber insgesamt spricht ja nichts dagegen, mehr zu machen …
  // auf 100 hoch“): je Profil höchstens MAX_SICHTBAR Seiten zu sehen (Standardseiten + seine eigenen), je Spiel MAX_GESAMT
  const MAX_SICHTBAR = 10, MAX_GESAMT = 100;
  // null = passt; sonst { profil: Name oder null (= schon die Standardseiten allein), anzahl }
  function zuVieleSichtbar(pages) {
    const std = (pages || []).filter(p => !isProfilePage(p)).length;
    if (std > MAX_SICHTBAR) return { profil: null, anzahl: std };
    const je = {};
    for (const p of pages || []) if (isProfilePage(p)) for (const n of new Set(p.profiles)) je[n] = (je[n] || 0) + 1;
    for (const [profil, n] of Object.entries(je)) if (std + n > MAX_SICHTBAR) return { profil, anzahl: std + n };
    return null;
  }

  // Steuerungskachel: wie viele Module sie zeigt. 'auto': 1 Feld = 1, 2 = 2, 3 = 3, ab 4 Feldern ein großes
  function steuerungCount(setting, size) {
    if (setting === 'auto' || setting == null) return ({ 1: 1, 2: 2, 3: 3 })[size] || 1;
    const n = Math.max(1, Math.min(4, Math.round(Number(setting)) || 1));
    return Math.min(n, size);
  }
  // Spalten für n Module in einer Kachel mit w Spalten
  function steuerungCols(n, w) {
    if (n <= 1) return 1;
    if (w >= n) return n;
    return w === 1 ? 1 : 2;
  }

  root.TileGrid = { COLS, ROWS, merge, isProfilePage, pagesFor, hauptseite, setzeHaupt, steuerungCount, steuerungCols, MAX_SICHTBAR, MAX_GESAMT, zuVieleSichtbar };
})(typeof window !== 'undefined' ? window : globalThis);
