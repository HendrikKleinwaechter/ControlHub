/**
 * Kachel-Editor für den Browser am PC (Entwurf von Hendrik am 22.10.2026 freigegeben). Ersetzt die frühere Werkzeugspalte
 * aus steuerungsmenues.js.
 *
 * Aufbau: oben „Neu“ (Taste, Anzeige, Text, Grafik, Karte/Planer/Liste), Rückgängig/Wiederholen, Ausschneiden/
 * Kopieren/Einfügen, Ansehen · links die Ebenen (oben = vorne; Ziehen sortiert, Gruppen, Schloss, Auge je Kachelform)
 * · Mitte die Kachelformen als Reiter und die Fläche mit 8 Griffen, Raster und Hilfslinien · rechts die Eigenschaften
 * des Gewählten, sonst der Kachel · unten Raster, Feinraster, Einrasten, Zoom und Tastenkürzel.
 *
 * Der Editor arbeitet auf einer Arbeitskopie der Kachel und speichert sie kurz verzögert als Ganzes
 * (PUT /api/steuerungsmenue/:id/inhalt) -- so bleiben Rückgängig, Gruppen, Ebenen und Einfügen einfach.
 * Lage und Größe wie bisher: Mitte x in % der Breite, y in % der Höhe, Größen in % der Breite. Intern rechnet der
 * Editor für beide Achsen in „Breiten-Prozent“ (Kasten l/t/w/h), damit das Raster quadratisch ist. Eine Kachelform
 * ohne eigene Anordnung wird beim ersten Ändern (verschieben, Größe, ausblenden) zur eigenen (Hendrik: implizit).
 */
(function () {
  const KINDS = SM_KIND_LIST;   // { button: 'buttons', graphic: 'graphics', text: 'texts', display: 'displays', embed: 'embeds' }
  const KIND_NAMES = { button: 'Taste', graphic: 'Grafik', text: 'Text', display: 'Anzeige', embed: 'Karte, Planer, Listen' };
  const PREFIX = { button: 'btn', graphic: 'gfx', text: 'txt', display: 'anz', embed: 'bst' };
  const ROTATES = ['button', 'graphic', 'text'];
  const CONTENT_KEYS = ['buttons', 'graphics', 'texts', 'displays', 'embeds', 'varianten', 'layers', 'groups', 'gridSize', 'fineGridSize'];
  const CLIP_KEY = 'controlhub.kachelZwischenablage';
  const LV = { immer: 0, mittel: 1, gross: 2 };
  const SHOW_NAMES = { immer: 'immer', mittel: 'ab 2 Feldern', gross: 'nur groß' };
  const P = {
    button: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16z', display: 'M4 16a8 8 0 0 1 16 0M12 16l4-5', text: 'M5 6h14M12 6v13',
    graphic: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6', embed: 'M3 4h18v16H3zM3 9h18',
    group: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3', unlock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 7.5-2',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z',
    eyeOff: 'M3 3l18 18M10.6 6.1A9.7 9.7 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.6 6.6C3.9 8.4 2 12 2 12s4 7 10 7a9 9 0 0 0 4.4-1.1',
    chevron: 'M9 6l6 6-6 6', down: 'M6 9l6 6 6-6'
  };
  const svg = (d, size = 16, extra = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}><path d="${d}"></path></svg>`;
  const esc = s => escapeHtml(String(s ?? ''));
  const r2 = v => Math.round(v * 100) / 100;
  const de = v => r2(v).toLocaleString('de-DE');
  const clone = o => JSON.parse(JSON.stringify(o));
  const newId = prefix => prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const sm = () => window.steuerungsmenues;
  const num = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };

  class KachelEditor {
    constructor() {
      this.root = null;
      this.pageId = null;
      this.page = null;
      this.form = '2x3';
      this.sel = []; this.selGroup = null; this.inGroup = null;
      this.hist = []; this.fut = [];
      this.zoom = 1; this.showGrid = true; this.snap = true;
      this.fmt = null; this.msg = ''; this.menu = null; this.collapsed = {};
      this.drag = null; this.dnd = null; this.textH = {}; this.spreadAxis = 'x';
      this.saveTimer = null; this.dirty = false; this.saving = Promise.resolve();
    }

    get isOpen() { return !!this.root; }

    // ---------- öffnen / schließen ----------
    open(pageId) {
      const base = sm().basePage(pageId) || sm().pages.find(p => p.id === pageId);
      if (!base) return;
      this.close(true);
      this.pageId = pageId;
      this.page = clone(base);
      for (const key of Object.values(KINDS)) this.page[key] = this.page[key] || [];
      this.page.varianten = this.page.varianten || {};
      this.page.groups = this.page.groups || {};
      this.page.layers = this.layerIds();
      this.tidy();
      this.form = '2x3';
      this.sel = []; this.selGroup = null; this.inGroup = null;
      this.hist = []; this.fut = []; this.fmt = null; this.msg = ''; this.zoom = 1; this.textH = {};
      const root = document.createElement('div');
      root.id = 'kachel-editor';
      root.className = 'ke';
      root.tabIndex = 0;
      root.innerHTML = `
        <div class="ke-toolbar"></div>
        <div class="ke-main">
          <aside class="ke-layers"></aside>
          <section class="ke-center"><div class="ke-forms"></div><div class="ke-stage"></div></section>
          <aside class="ke-insp"></aside>
        </div>
        <div class="ke-status"></div>`;
      document.body.appendChild(root);
      document.body.classList.add('ke-open');
      this.root = root;
      this.bind();
      this.renderAll();
      root.focus({ preventScroll: true });
      // Fenster schließen oder neu laden, solange der Speicher-Takt (400 ms) noch läuft: trotzdem speichern (23.10.2026)
      this.onPageHide = this.onPageHide || (() => {
        if (!this.dirty || !this.page || !this.pageId) return;
        const body = {};
        for (const k of CONTENT_KEYS) body[k] = this.page[k];
        try {
          fetch(`/api/steuerungsmenue/${this.pageId}/inhalt`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true });
          this.dirty = false;
        } catch { /* nichts mehr zu retten */ }
      });
      window.addEventListener('pagehide', this.onPageHide);
      // Der Editor ist für Maus und großen Bildschirm gebaut; am Tablet nur ein Hinweis, bedienbar bleibt er
      if (window.matchMedia?.('(pointer: coarse)').matches) window.showToast?.('Der Kachel-Editor ist für den PC gebaut – am Tablet sind die Griffe klein.', 4500);
    }

    // quiet: ohne Navigation (wird gleich neu geöffnet oder die App wechselt selbst die Seite)
    close(quiet = false) {
      if (!this.root) return Promise.resolve();
      const saved = this.flushSave();
      window.removeEventListener('pagehide', this.onPageHide);
      this.ro?.disconnect();
      this.root.remove();
      this.root = null;
      document.body.classList.remove('ke-open');
      sm().closeAllPopovers?.();
      if (!quiet) this.pageId = null;
      return saved;
    }

    // ---------- Daten ----------
    all() { return Object.entries(KINDS).flatMap(([kind, key]) => (this.page[key] || []).map(el => [kind, el])); }
    find(id) {
      for (const [kind, key] of Object.entries(KINDS)) { const el = (this.page[key] || []).find(e => e.id === id); if (el) return { kind, el }; }
      return null;
    }
    layerIds() {
      const order = smLayerOrder(this.page).map(([, el]) => el.id);
      return order;
    }
    nameOf(id) {
      const f = this.find(id);
      if (!f) return '';
      const el = f.el;
      if (el.name) return el.name;
      if (f.kind === 'button') return el.label || (el.icon && SM_ICON_DEFS[el.icon]?.label) || 'Taste';
      if (f.kind === 'display') return el.label || window.anzeigen?.describe(el.value) || 'Anzeige';
      if (f.kind === 'text') return (el.text || 'Text').split('\n')[0].slice(0, 28) || 'Text';
      if (f.kind === 'embed') return window.tilePages?.moduleName(el.baustein) || 'Element';
      return 'Grafik';
    }
    members(gid) { return this.page.layers.filter(id => this.find(id)?.el.group === gid); }
    snapshot() { const o = {}; for (const k of CONTENT_KEYS) o[k] = clone(this.page[k] ?? null); return o; }

    // Gruppen liegen in der Ebenenreihenfolge zusammen (an der Stelle ihres vordersten Elements); mit weniger als zwei
    // Elementen lösen sie sich auf (wie der Server, steuerungsmenuesManager.js normalizeLayersAndGroups())
    tidy() {
      const ids = this.all().map(([, e]) => e.id);
      let layers = (this.page.layers || []).filter(id => ids.includes(id));
      for (const id of ids) if (!layers.includes(id)) layers.push(id);
      const count = {};
      for (const [, e] of this.all()) if (e.group) count[e.group] = (count[e.group] || 0) + 1;
      for (const [, e] of this.all()) if (e.group && (count[e.group] || 0) < 2) e.group = null;
      const groups = {};
      for (const [gid, g] of Object.entries(this.page.groups || {})) if (count[gid] >= 2) groups[gid] = g;
      for (const [, e] of this.all()) if (e.group && !groups[e.group]) groups[e.group] = { name: 'Gruppe' };
      const out = [], done = new Set();
      for (let i = layers.length - 1; i >= 0; i--) {
        const id = layers[i];
        if (done.has(id)) continue;
        const g = this.find(id).el.group;
        const block = g ? layers.filter(x => this.find(x).el.group === g) : [id];
        for (const x of [...block].reverse()) { out.unshift(x); done.add(x); }
      }
      this.page.layers = out;
      this.page.groups = groups;
      this.sel = this.sel.filter(id => this.find(id));
      if (this.selGroup && !groups[this.selGroup]) this.selGroup = null;
      if (this.inGroup && !groups[this.inGroup]) this.inGroup = null;
    }

    // Änderung mit Rückgängig: fn ändert this.page; danach aufräumen, merken, speichern, neu zeichnen
    change(fn, msg) {
      const pre = this.snapshot();
      fn();
      this.tidy();
      this.pushHist(pre);
      if (msg !== undefined) this.msg = msg;
      this.scheduleSave();
      this.renderAll();
    }
    pushHist(pre) {
      this.hist.push(pre);
      if (this.hist.length > 100) this.hist.shift();
      this.fut = [];
    }
    restore(snap) {
      for (const k of CONTENT_KEYS) this.page[k] = clone(snap[k]);
      this.tidy();
      this.scheduleSave();
    }
    undo() {
      if (!this.hist.length) return;
      this.fut.push(this.snapshot());
      this.restore(this.hist.pop());
      this.msg = 'Rückgängig gemacht';
      this.renderAll();
    }
    redo() {
      if (!this.fut.length) return;
      this.hist.push(this.snapshot());
      this.restore(this.fut.pop());
      this.msg = 'Wiederholt';
      this.renderAll();
    }

    // ---------- speichern ----------
    scheduleSave() {
      this.dirty = true;
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => this.flushSave(), 400);
    }
    flushSave() {
      clearTimeout(this.saveTimer);
      if (!this.dirty || !this.page) return this.saving;
      this.dirty = false;
      const id = this.pageId, body = {};
      for (const k of CONTENT_KEYS) body[k] = this.page[k];
      const json = JSON.stringify(body);
      this.saving = this.saving.then(async () => {
        try {
          const res = await fetch(`/api/steuerungsmenue/${id}/inhalt`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: json });
          const data = await res.json();
          if (!data.success) throw new Error(data.error);
          this.adopt(data.page);
        } catch (e) {
          if (this.pageId === id) this.dirty = true;
          uiAlert('Speichern fehlgeschlagen: ' + e.message);
        }
      });
      return this.saving;
    }
    // Server-Fassung in steuerungsmenues.js übernehmen (Ansicht, Kacheln der Startseite, Übersicht)
    adopt(page) {
      const s = sm();
      const i = s.basePages.findIndex(p => p.id === page.id);
      if (i >= 0) s.basePages[i] = page;
      s.applyFormOverlay();
    }

    // ---------- Kachelformen und Lage ----------
    aspect(form = this.form) { return form === '2x3' ? SM_CANVAS_ASPECT : sm().formAspect(form); }
    isOwn(form = this.form) { return form === '2x3' || !!this.page.varianten?.[form]; }
    variant(form) { return this.page.varianten?.[form] || sm().autoGeometry(this.page, form); }
    geom(id, form = this.form) {
      const f = this.find(id);
      if (!f) return null;
      if (form === '2x3') return f.el;
      const v = this.variant(form)[id];
      if (!v || v.hidden) return null;
      const g = smAdaptGeom(f.kind, v, this.aspect(form), f.el);
      const out = { ...f.el };
      for (const k of SM_GEOM_KEYS[f.kind]) if (typeof g[k] === 'number') out[k] = g[k];
      return out;
    }
    ensureOwn(form = this.form) {
      if (this.isOwn(form)) return;
      const a = r2(this.aspect(form));
      const auto = sm().autoGeometry(this.page, form);
      this.page.varianten = { ...this.page.varianten, [form]: Object.fromEntries(Object.entries(auto).map(([id, g]) => [id, g.hidden ? g : { ...g, a }])) };
    }
    // Lage/Größe in Modell-Einheiten setzen; in einer Kachelform in deren Anordnung (die dabei eigene wird)
    setGeom(id, patch, form = this.form) {
      const f = this.find(id);
      if (!f) return;
      if (form === '2x3') { for (const [k, val] of Object.entries(patch)) f.el[k] = typeof val === 'number' ? r2(val) : val; return; }
      this.ensureOwn(form);
      const v = this.page.varianten[form];
      const cur = v[id] && !v[id].hidden ? smAdaptGeom(f.kind, v[id], this.aspect(form), f.el) : f.el;
      const next = {};
      for (const k of SM_GEOM_KEYS[f.kind]) if (typeof cur[k] === 'number') next[k] = cur[k];
      for (const [k, val] of Object.entries(patch)) if (SM_GEOM_KEYS[f.kind].includes(k) && typeof val === 'number') next[k] = r2(val);
      next.a = r2(this.aspect(form));
      v[id] = next;
    }
    setHidden(id, hidden, form = this.form) {
      if (form === '2x3') return;
      this.ensureOwn(form);
      const v = this.page.varianten[form];
      if (hidden) v[id] = { ...(v[id] || {}), hidden: true };
      else {
        const cur = v[id] || {};
        delete cur.hidden;
        if (typeof cur.x !== 'number') { v[id] = undefined; this.setGeom(id, {}, form); }
        else v[id] = cur;
      }
    }
    // Kasten in Breiten-Prozent: l/t = linke obere Ecke, w/h = Breite/Höhe
    box(id, form = this.form) {
      const f = this.find(id);
      const g = f && this.geom(id, form);
      if (!g) return null;
      const r = this.aspect(form);
      let w, h;
      if (f.kind === 'button') { w = g.size; h = smHeightBasis(g); }
      else if (f.kind === 'text') { w = g.width; h = this.textH[id] ?? (g.fontSize || 3) * 1.3; }
      else { w = g.width; h = g.height; }
      return { l: g.x - w / 2, t: g.y / r - h / 2, w, h };
    }
    fromBox(id, b, form = this.form) {
      const f = this.find(id);
      const r = this.aspect(form);
      const p = { x: b.l + b.w / 2, y: (b.t + b.h / 2) * r };
      if (f.kind === 'button') {
        p.size = Math.max(1, b.w);
        if ((f.el.shape || 'circle') === 'square') p.heightSize = Math.max(1, b.h);
      } else if (f.kind === 'text') p.width = Math.max(3, b.w);
      else { p.width = Math.max(1, b.w); p.height = Math.max(1, b.h); }
      return p;
    }
    bbox(ids) {
      const bs = ids.map(id => this.box(id)).filter(Boolean);
      if (!bs.length) return null;
      const l = Math.min(...bs.map(b => b.l)), t = Math.min(...bs.map(b => b.t));
      return { l, t, w: Math.max(...bs.map(b => b.l + b.w)) - l, h: Math.max(...bs.map(b => b.t + b.h)) - t };
    }
    canvasH() { return 100 / this.aspect(); }

    // ---------- Ausrichten und Verteilen (Hendrik 24.10.2026: „wenn man mehrere auswählt … Horizontal oder Vertikal im
    // gleichen Abstand zueinander anordnen … und durch ziehen am raster den Abstand bestimmen“) ----------
    // Teile der Auswahl: eine ganz gewählte Gruppe bleibt ein Teil; ist die Gruppe selbst gewählt, zählt jedes Element
    parts() {
      const blocks = [];
      if (this.selGroup) blocks.push(...this.members(this.selGroup).map(id => [id]));
      else {
        const seen = new Set();
        for (const id of this.sel) {
          if (seen.has(id)) continue;
          const g = this.find(id)?.el.group, mem = g && this.inGroup !== g ? this.members(g) : null;
          const ids = mem && mem.every(m => this.sel.includes(m)) ? mem : [id];
          for (const x of ids) seen.add(x);
          blocks.push(ids);
        }
      }
      return blocks.map(ids => ids.filter(id => this.box(id))).filter(ids => ids.length).map(ids => ({ ids, b: this.bbox(ids) }));
    }
    // Liegen die Teile entlang der Achse mit gleichem Abstand? → { axis, order, gap } (order: Teile der Lage nach), sonst null
    spacing(parts, axis) {
      const [L, W] = axis === 'x' ? ['l', 'w'] : ['t', 'h'];
      const order = [...parts].sort((a, b) => (a.b[L] + a.b[W] / 2) - (b.b[L] + b.b[W] / 2));
      const gaps = order.slice(1).map((p, i) => p.b[L] - (order[i].b[L] + order[i].b[W]));
      if (!gaps.length || Math.min(...gaps) < -0.02 || Math.max(...gaps) - Math.min(...gaps) > 0.06) return null;
      return { axis, order, gap: Math.max(0, gaps.reduce((s, g) => s + g, 0) / gaps.length) };
    }
    lockedParts(parts) { return parts.some(p => p.ids.some(id => this.find(id).el.locked)); }
    // Gleich verteilte Auswahl (zuletzt gewählte Richtung zuerst); dann zeigt die Fläche den Abstand-Griff
    spread() {
      const parts = this.parts();
      if (parts.length < 2 || this.lockedParts(parts)) return null;
      for (const axis of this.spreadAxis === 'y' ? ['y', 'x'] : ['x', 'y']) { const s = this.spacing(parts, axis); if (s) return s; }
      return null;
    }
    // Teile der Reihe nach mit gleichem Abstand setzen, ab start (sonst bleibt das erste stehen); boxes = Ausgangslage je Element
    placeSpread(order, axis, gap, boxes, start = null) {
      const [L, W] = axis === 'x' ? ['l', 'w'] : ['t', 'h'];
      let pos = start ?? order[0].b[L];
      for (const p of order) {
        const d = pos - p.b[L];
        for (const id of p.ids) if (boxes[id]) this.setGeom(id, this.fromBox(id, { ...boxes[id], [L]: boxes[id][L] + d }));
        pos += p.b[W] + gap;
      }
    }
    boxesOf(parts) { return Object.fromEntries(parts.flatMap(p => p.ids).map(id => [id, this.box(id)])); }
    // Das erste und das letzte Teil bleiben stehen, dazwischen gleiche Abstände. Ist dafür kein Platz (Teile überlappen),
    // liegen sie ohne Abstand aneinander, mittig auf dem bisherigen Bereich und möglichst ganz auf der Kachel
    distribute(axis) {
      const parts = this.parts();
      if (parts.length < 2 || this.lockedParts(parts)) return;
      const [L, W] = axis === 'x' ? ['l', 'w'] : ['t', 'h'];
      const order = [...parts].sort((a, b) => (a.b[L] + a.b[W] / 2) - (b.b[L] + b.b[W] / 2));
      const first = order[0].b, last = order[order.length - 1].b;
      const total = order.reduce((s, p) => s + p.b[W], 0), span = last[L] + last[W] - first[L];
      const gap = Math.max(0, (span - total) / (order.length - 1));
      const end = axis === 'x' ? 100 : this.canvasH();
      const start = span >= total ? null : Math.max(0, Math.min(end - total, first[L] + (span - total) / 2));
      const boxes = this.boxesOf(order);
      this.spreadAxis = axis;
      this.change(() => this.placeSpread(order, axis, gap, boxes, start),
        `${order.length} ${!this.selGroup && order.some(p => p.ids.length > 1) ? 'Teile' : 'Elemente'} ${axis === 'x' ? 'nebeneinander' : 'untereinander'} verteilt · ${start == null ? `Abstand ${de(gap)} %` : 'zu eng, jetzt ohne Abstand: am Griff aufziehen'}`);
    }
    // Bündig an der gemeinsamen Außenkante bzw. Mitte der Auswahl
    alignSel(edge) {
      const parts = this.parts();
      if (parts.length < 2 || this.lockedParts(parts)) return;
      const bb = this.bbox(parts.flatMap(p => p.ids)), x = ['links', 'hmitte', 'rechts'].includes(edge);
      const to = b => ({ links: bb.l, hmitte: bb.l + (bb.w - b.w) / 2, rechts: bb.l + bb.w - b.w, oben: bb.t, vmitte: bb.t + (bb.h - b.h) / 2, unten: bb.t + bb.h - b.h })[edge];
      const boxes = this.boxesOf(parts);
      this.change(() => {
        for (const p of parts) {
          const d = to(p.b) - (x ? p.b.l : p.b.t);
          for (const id of p.ids) this.setGeom(id, this.fromBox(id, x ? { ...boxes[id], l: boxes[id].l + d } : { ...boxes[id], t: boxes[id].t + d }));
        }
      }, { links: 'Links bündig', hmitte: 'Waagerecht mittig', rechts: 'Rechts bündig', oben: 'Oben bündig', vmitte: 'Senkrecht mittig', unten: 'Unten bündig' }[edge]);
    }

    // ---------- Auswahl ----------
    selectOnly(ids, group = null, inGroup = null) { this.sel = ids; this.selGroup = group; this.inGroup = inGroup; this.fmt = null; }
    clickSelect(id, e) {
      const el = this.find(id).el;
      if (e.ctrlKey || e.metaKey) {
        const block = el.group && this.inGroup !== el.group ? this.members(el.group) : [id];
        const all = block.every(b => this.sel.includes(b));
        this.sel = all ? this.sel.filter(x => !block.includes(x)) : [...new Set([...this.sel, ...block])];
        this.selGroup = null; this.inGroup = null;
        return;
      }
      if (el.group && this.inGroup !== el.group) { if (this.selGroup !== el.group) this.selectOnly(this.members(el.group), el.group); return; }
      if (!this.sel.includes(id) || this.selGroup) this.selectOnly([id], null, el.group && this.inGroup === el.group ? this.inGroup : null);
    }
    single() { return this.sel.length === 1 && !this.selGroup ? this.find(this.sel[0]) : null; }

    // ---------- Zeichnen ----------
    renderAll() {
      if (!this.root) return;
      this.renderToolbar();
      this.renderLayers();
      this.renderForms();
      this.renderCanvas();
      this.renderInspector();
      this.renderStatus();
    }

    renderToolbar() {
      const A = window.anzeigen;
      const clip = this.readClip();
      const menu = (id, html) => (this.menu === id ? `<div class="ke-menu">${html}</div>` : '');
      const embeds = (window.tilePages?.embedTypes() || []).map(([id, name]) =>
        `<button type="button" data-act="add-embed" data-arg="${esc(id)}"><span>${esc(name)}</span></button>`).join('');
      const presets = A?.available() ? (A.PRESETS || []).map(([label, type], i) =>
        `<button type="button" data-act="add-preset" data-arg="${i}"><span>${esc(label)}</span><small>${esc(A.TYPE_NAMES[type] || type)}</small></button>`).join('') : '';
      this.root.querySelector('.ke-toolbar').innerHTML = `
        <span class="ke-kicker">Neu</span>
        <button type="button" class="ke-tb" data-act="add-button">${svg(P.button)}Taste</button>
        ${A?.available() ? `<span class="ke-drop"><button type="button" class="ke-tb ${this.menu === 'anz' ? 'on' : ''}" data-act="menu" data-arg="anz" aria-expanded="${this.menu === 'anz'}">${svg(P.display)}Anzeige${svg(P.down, 12)}</button>
          ${menu('anz', `<button type="button" data-act="add-display"><span>Aus der Werteliste …</span><small>alle Spielwerte</small></button><div class="ke-menu-sep"></div>${presets}`)}</span>` : ''}
        <button type="button" class="ke-tb" data-act="add-text">${svg(P.text)}Text</button>
        <button type="button" class="ke-tb" data-act="add-graphic">${svg(P.graphic)}Grafik</button>
        <span class="ke-drop"><button type="button" class="ke-tb ${this.menu === 'inh' ? 'on' : ''}" data-act="menu" data-arg="inh" aria-expanded="${this.menu === 'inh'}">${svg(P.embed)}Karte, Planer, Listen${svg(P.down, 12)}</button>
          ${menu('inh', embeds)}</span>
        <span class="ke-flex"></span>
        <button type="button" class="ke-tb" data-act="undo" ${this.hist.length ? '' : 'disabled'} title="Rückgängig (Strg+Z)">${svg('M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3')}<span class="ke-tb-label">Rückgängig</span></button>
        <button type="button" class="ke-tb" data-act="redo" ${this.fut.length ? '' : 'disabled'} title="Wiederholen (Strg+Y)">${svg('M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3')}<span class="ke-tb-label">Wiederholen</span></button>
        <span class="ke-sep"></span>
        <button type="button" class="ke-tb" data-act="cut" ${this.sel.length ? '' : 'disabled'} title="Ausschneiden (Strg+X)" aria-label="Ausschneiden">${svg('M6 15a3 3 0 1 0 0 6a3 3 0 1 0 0-6zM18 15a3 3 0 1 0 0 6a3 3 0 1 0 0-6zM8 16L19 4M16 16L5 4')}</button>
        <button type="button" class="ke-tb" data-act="copy" ${this.sel.length ? '' : 'disabled'} title="Kopieren (Strg+C)">${svg('M8 8h12v12H8zM16 8V4H4v12h4')}<span class="ke-tb-label">Kopieren</span></button>
        <button type="button" class="ke-tb" data-act="paste" ${clip ? '' : 'disabled'} title="Einfügen (Strg+V) – auch in einer anderen Kachel">${svg('M5 4h14v17H5zM9 4V3h6v1M9 11h6M9 15h4')}<span class="ke-tb-label">Einfügen</span></button>
        <span class="ke-sep"></span>
        <button type="button" class="ke-tb" data-act="view" title="So sieht die Kachel aus – Tasten lösen aus">${svg('M7 4l13 8-13 8z')}<span class="ke-tb-label">Ansehen</span></button>`;
    }

    renderForms() {
      const tabs = SM_FORMS.map(([f, name]) => `<button type="button" class="ke-form ${f === this.form ? 'on' : ''}" data-act="form" data-arg="${f}">
          <span class="sm-form-shape sm-form-shape--${f}"></span><span><b>${name}</b><small>${f === '2x3' ? 'Grundform' : this.page.varianten?.[f] ? 'eigene Anordnung' : 'automatisch'}</small></span></button>`).join('');
      this.root.querySelector('.ke-forms').innerHTML = `${tabs}<span class="ke-flex"></span>
        ${this.form !== '2x3' && this.page.varianten?.[this.form] ? '<button type="button" class="ke-mini" data-act="reset-form">Zurück auf automatisch</button>' : ''}`;
    }

    // Fläche: Elemente in Ebenenreihenfolge (Darstellung wie in der Ansicht, steuerungsmenues.js render…Html()),
    // Lage in Pixeln; darüber Auswahlrahmen, Hilfslinien und Rahmen-Auswahl
    renderCanvas() {
      const stage = this.root.querySelector('.ke-stage');
      const sw = Math.max(200, stage.clientWidth - 40), sh = Math.max(150, stage.clientHeight - 56);
      const r = this.aspect();
      let W = sw, H = W / r;
      if (H > sh) { H = sh; W = H * r; }
      this.W = Math.round(W * this.zoom); this.H = Math.round(H * this.zoom);
      const s = sm();
      const els = this.page.layers.map(id => {
        const f = this.find(id), g = this.geom(id);
        if (!f || !g) return '';
        const html = f.kind === 'graphic' ? s.renderGraphicHtml(g, true, false)
          : f.kind === 'text' ? s.renderTextHtml(g, true, false)
          : f.kind === 'display' ? s.renderDisplayHtml(g, true, false)
          : f.kind === 'embed' ? s.renderEmbedHtml(g, true, false)
          : s.renderButtonHtml(g, true, false, false);
        return f.el.locked ? html.replace(/^<div class="/, '<div class="ke-locked ') : html;
      }).join('');
      const bg = this.page.background ? `<img class="ke-bg" src="${esc(bust(this.page.background))}" alt="">` : '';
      stage.innerHTML = `<div class="ke-stage-in">
          <div class="ke-info">${esc(this.canvasInfo())}</div>
          <div class="ke-canvas ${this.page.background ? 'ke-canvas--bg' : ''} ${this.fmt ? 'ke-fmt' : ''}" style="width:${this.W}px;height:${this.H}px">
            ${bg}<div class="ke-grid"></div>${els}
            <div class="ke-sel"></div><div class="ke-guides"></div><div class="ke-marquee" hidden></div>
          </div>
        </div>`;
      this.positionAll();
    }
    canvasInfo() {
      const name = sm().formName(this.form);
      if (this.form === '2x3') return 'Ganze Seite · Grundform 16:9';
      return `${name} · festes Seitenverhältnis, auf dem Tablet passt sich die Kachel an${this.isOwn() ? '' : ' · automatisch angeordnet'}`;
    }
    nodeId(n) { return n?.dataset.buttonId || n?.dataset.graphicId || n?.dataset.textId || n?.dataset.displayId || n?.dataset.embedId || null; }
    positionAll() {
      const cv = this.root?.querySelector('.ke-canvas');
      if (!cv) return;
      const W = this.W, px = v => (v * W) / 100;
      cv.querySelector('.ke-grid').style.cssText = this.gridCss();
      let textChanged = false;
      cv.querySelectorAll('.sm-btn, .sm-graphic, .sm-text-el, .sm-display, .sm-embed').forEach(n => {
        const id = this.nodeId(n), b = this.box(id), g = this.geom(id), f = this.find(id);
        if (!b || !g) return;
        const cx = px(b.l + b.w / 2), cy = px(b.t + b.h / 2);
        if (f.kind === 'text') {
          n.setAttribute('style', `left:${cx}px; top:${cy}px; width:${px(b.w)}px;`);
          const inner = n.querySelector('.sm-text-inner');
          if (inner) inner.style.fontSize = px(g.fontSize || 3) + 'px';
          const h = (n.offsetHeight / W) * 100;
          if (h > 0 && Math.abs((this.textH[id] ?? 0) - h) > 0.05) { this.textH[id] = h; textChanged = true; }
          n.style.top = px(g.y / this.aspect()) + 'px';
          return;
        }
        n.setAttribute('style', `left:${cx}px; top:${cy}px; width:${px(b.w)}px; height:${px(b.h)}px;`);
        const label = n.querySelector('.sm-btn-label');
        if (label && f.kind === 'button' && !f.el.icon) label.style.fontSize = px(g.fontSize || 2) + 'px';
      });
      void textChanged;
      this.positionSel();
    }
    gridCss() {
      if (!this.showGrid) return '';
      const G = (this.page.gridSize ?? SM_DEFAULT_GRID_SIZE) * this.W / 100, F = (this.page.fineGridSize ?? SM_DEFAULT_FINE_GRID_SIZE) * this.W / 100;
      const fine = F >= 4;
      return `background-image: linear-gradient(to right, var(--ke-grid) 1px, transparent 1px), linear-gradient(to bottom, var(--ke-grid) 1px, transparent 1px)${fine ? ', linear-gradient(to right, var(--ke-grid-fine) 1px, transparent 1px), linear-gradient(to bottom, var(--ke-grid-fine) 1px, transparent 1px)' : ''};
        background-size: ${G}px ${G}px, ${G}px ${G}px${fine ? `, ${F}px ${F}px, ${F}px ${F}px` : ''};`;
    }
    // Auswahlrahmen: ein Element (durchgezogen) oder eine Gruppe (gestrichelt, mit Namen) mit 8 Griffen; bei mehreren
    // ohne Gruppe je Element ein Rahmen
    positionSel() {
      const cv = this.root?.querySelector('.ke-canvas');
      if (!cv) return;
      const px = v => (v * this.W) / 100;
      const one = this.single();
      const b = one ? this.box(one.el.id) : this.selGroup ? this.bbox(this.members(this.selGroup)) : null;
      const frames = !one && !this.selGroup ? this.sel.map(id => this.box(id)).filter(Boolean) : [];
      const isText = one?.kind === 'text';
      const hs = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].filter(h => !(isText && (h === 'n' || h === 's')));
      const locked = one?.el.locked || (this.selGroup && this.members(this.selGroup).every(id => this.find(id).el.locked));
      // Abstand-Griffe zwischen gleich verteilten Teilen (beim Ziehen am Abstand die gezogene Richtung)
      const sp = !this.drag ? this.spread() : this.drag.mode === 'gap' ? this.spacing(this.parts(), this.drag.axis) : null;
      const gaps = sp ? sp.order.slice(1).map((p, i) => {
        const a = sp.order[i].b, c = p.b, x = sp.axis === 'x';
        // quer zur Richtung: Mitte der Überdeckung beider Teile, sonst zwischen ihren Mitten
        const [o0, o1] = x ? [Math.max(a.t, c.t), Math.min(a.t + a.h, c.t + c.h)] : [Math.max(a.l, c.l), Math.min(a.l + a.w, c.l + c.w)];
        const mid = o0 < o1 ? (o0 + o1) / 2 : x ? (a.t + a.h / 2 + c.t + c.h / 2) / 2 : (a.l + a.w / 2 + c.l + c.w / 2) / 2;
        const from = x ? a.l + a.w : a.t + a.h, len = Math.max(0, (x ? c.l : c.t) - from);
        return `<div class="ke-gap ke-gap--${sp.axis}" data-gap="${i}" title="Abstand ziehen" style="${x ? `left:${px(from)}px;top:${px(mid)}px;width:${px(len)}px` : `top:${px(from)}px;left:${px(mid)}px;height:${px(len)}px`}"><i></i></div>`;
      }).join('') : '';
      cv.querySelector('.ke-sel').innerHTML = gaps + (b ?`<div class="ke-box ${this.selGroup ? 'ke-box--group' : ''}" style="left:${px(b.l)}px;top:${px(b.t)}px;width:${px(b.w)}px;height:${px(b.h)}px">
          ${this.selGroup ? `<span class="ke-box-label">Gruppe „${esc(this.page.groups[this.selGroup]?.name || '')}“</span>` : ''}
          ${locked ? '' : hs.map(h => `<div class="ke-hd ke-hd--${h}" data-h="${h}"></div>`).join('')}</div>` : '')
        + frames.map(f => `<div class="ke-frame" style="left:${px(f.l)}px;top:${px(f.t)}px;width:${px(f.w)}px;height:${px(f.h)}px"></div>`).join('')
        + (this.selGroup ? this.members(this.selGroup).map(id => this.box(id)).filter(Boolean).map(f => `<div class="ke-frame ke-frame--member" style="left:${px(f.l)}px;top:${px(f.t)}px;width:${px(f.w)}px;height:${px(f.h)}px"></div>`).join('') : '');
    }

    // ---------- Ebenen ----------
    renderLayers() {
      const rows = [];
      const units = this.units();
      const formName = sm().formName(this.form);
      const inForm = this.form !== '2x3';
      const hidden = id => { const v = inForm ? this.variant(this.form)[id] : null; return inForm && (!v || v.hidden); };
      const elRow = (id, indent) => {
        const f = this.find(id), el = f.el, hid = hidden(id), on = this.sel.includes(id) && !this.selGroup;
        return `<div class="ke-row ${on ? 'on' : ''} ${indent ? 'ke-row--in' : ''}" draggable="true" data-row="${esc(id)}">
          <button type="button" class="ke-li" data-act="pick" data-arg="${esc(id)}">${svg(P[f.kind], 16, 'class="ke-li-icon"')}
            <span class="ke-li-text"><span class="${hid ? 'ke-off' : ''}">${esc(this.nameOf(id))}</span><small>${esc(KIND_NAMES[f.kind])}${inForm ? (hid ? ' · ausgeblendet' : '') : ` · ${SHOW_NAMES[el.show] || 'immer'}`}</small></span></button>
          <button type="button" class="ke-ic ${el.locked ? 'on' : ''}" data-act="lock" data-arg="${esc(id)}" title="${el.locked ? 'Entsperren' : 'Sperren (auf der Fläche nicht wählbar)'}" aria-label="${el.locked ? 'Entsperren' : 'Sperren'}">${svg(el.locked ? P.lock : P.unlock, 15)}</button>
          ${inForm ? `<button type="button" class="ke-ic" data-act="eye" data-arg="${esc(id)}" title="${hid ? `In „${formName}“ zeigen` : `In „${formName}“ ausblenden`}" aria-label="${hid ? 'Zeigen' : 'Ausblenden'}">${svg(hid ? P.eyeOff : P.eye, 16)}</button>` : ''}
        </div>`;
      };
      for (const u of [...units].reverse()) {
        if (!u.group) { rows.push(elRow(u.ids[0], false)); continue; }
        const gid = u.group, closed = !!this.collapsed[gid];
        const allLocked = u.ids.every(id => this.find(id).el.locked), allHidden = u.ids.every(hidden);
        rows.push(`<div class="ke-row ke-row--group ${this.selGroup === gid ? 'on' : ''}" draggable="true" data-row="g:${esc(gid)}">
          <button type="button" class="ke-ic ke-chev" data-act="collapse" data-arg="${esc(gid)}" aria-label="${closed ? 'Aufklappen' : 'Zuklappen'}">${svg(P.chevron, 12, `style="transform: rotate(${closed ? 0 : 90}deg)"`)}</button>
          <button type="button" class="ke-li" data-act="pick-group" data-arg="${esc(gid)}">${svg(P.group, 16, 'class="ke-li-icon ke-li-icon--group"')}
            <span class="ke-li-text"><b class="${allHidden ? 'ke-off' : ''}">${esc(this.page.groups[gid]?.name || 'Gruppe')}</b><small>Gruppe · ${u.ids.length} Elemente</small></span></button>
          <button type="button" class="ke-ic ${allLocked ? 'on' : ''}" data-act="lock-group" data-arg="${esc(gid)}" title="${allLocked ? 'Gruppe entsperren' : 'Gruppe sperren'}" aria-label="${allLocked ? 'Entsperren' : 'Sperren'}">${svg(allLocked ? P.lock : P.unlock, 15)}</button>
          ${inForm ? `<button type="button" class="ke-ic" data-act="eye-group" data-arg="${esc(gid)}" title="${allHidden ? 'Gruppe zeigen' : 'Gruppe ausblenden'}" aria-label="${allHidden ? 'Zeigen' : 'Ausblenden'}">${svg(allHidden ? P.eyeOff : P.eye, 16)}</button>` : ''}
        </div>`);
        if (!closed) for (const id of [...u.ids].reverse()) rows.push(elRow(id, true));
      }
      this.root.querySelector('.ke-layers').innerHTML = `
        <div class="ke-layers-head"><span class="ke-kicker">Ebenen</span><small>${this.all().length}</small><span class="ke-flex"></span><small>oben = vorne</small></div>
        <div class="ke-layers-list">${rows.join('') || '<p class="ke-hint">Noch keine Elemente – oben „Neu“.</p>'}</div>
        <p class="ke-hint ke-layers-foot">Ziehen sortiert. Auf ein Element einer Gruppe ziehen = in die Gruppe, auf den Gruppenkopf = davor/dahinter. Doppelklick benennt um.${inForm ? ` Das Auge blendet nur in „${esc(formName)}“ aus.` : ''}</p>`;
    }
    units() {
      const u = [];
      for (const id of this.page.layers) {
        const g = this.find(id)?.el.group || null, last = u[u.length - 1];
        if (g && last && last.group === g) last.ids.push(id); else u.push({ group: g, ids: [id] });
      }
      return u;
    }

    // ---------- Eigenschaften ----------
    renderInspector() {
      const box = this.root.querySelector('.ke-insp');
      const keep = box.scrollTop;
      const one = this.single();
      let html;
      if (!this.sel.length) html = this.tileHtml();
      else if (one) html = this.singleHtml(one) + this.arrangeHtml() + this.visibilityHtml();
      else if (this.selGroup) html = this.groupHtml() + this.layoutHtml() + this.commonHtml() + this.arrangeHtml() + this.visibilityHtml();
      else html = this.multiHtml() + this.layoutHtml() + this.commonHtml() + this.arrangeHtml() + this.visibilityHtml();
      box.innerHTML = html;
      box.scrollTop = keep;
    }
    sec(title, body, extra = '') { return `<div class="ke-sec"><h3 class="ke-sech">${title}${extra}</h3>${body}</div>`; }
    row(label, control) { return `<div class="ke-row2"><span>${label}</span>${control}</div>`; }
    seg(items, cur, act) { return `<span class="ke-seg">${items.map(([v, l]) => `<button type="button" class="${v === cur ? 'on' : ''}" data-act="${act}" data-arg="${esc(String(v))}">${l}</button>`).join('')}</span>`; }
    numIn(field, value, unit = '%', attrs = '') {
      return `<span class="ke-num"><input type="number" class="ke-inp" data-f="${field}" value="${value === '' || value == null ? '' : r2(value)}" step="${this.page.fineGridSize ?? 0.5}" ${attrs}><span>${unit}</span></span>`;
    }
    colors(cur, allowNone) {
      return `<span class="ke-colors">${allowNone ? `<button type="button" class="ke-color ke-color--none ${!cur ? 'on' : ''}" data-act="color" data-arg="" title="${allowNone}" aria-label="${allowNone}">✕</button>` : ''}${SM_BUTTON_COLORS.map(c =>
        `<button type="button" class="ke-color ${cur === c.id ? 'on' : ''}" style="background:${c.hex}" data-act="color" data-arg="${c.id}" title="${c.label}" aria-label="${c.label}"></button>`).join('')}</span>`;
    }
    actionText(o) {
      if (o.functionId) return sm().functionsCache?.get(o.functionId) || o.functionId;
      if (o.quickActions) return describeActions(o.quickActions) + (o.quickActionsDurationSeconds ? ` (${o.quickActionsDurationSeconds} s)` : '');
      return '';
    }

    tileHtml() {
      const p = this.page, inForm = this.form !== '2x3', own = this.isOwn();
      const formName = sm().formName(this.form);
      return this.sec('Kachel', this.row('Name', `<input type="text" class="ke-inp" data-f="tile-name" maxlength="40" value="${esc(p.name)}">`)
          + this.row('Hintergrund', `<span class="ke-btns"><button type="button" class="ke-mini" data-act="upload-bg">${p.background ? 'Bild ändern …' : 'Bild wählen …'}</button>${p.background ? '<button type="button" class="ke-mini ke-danger" data-act="remove-bg">Entfernen</button>' : ''}</span>`)
          + (p.background ? '<p class="ke-hint">Mit Hintergrundbild behält die Kachel ihr Seitenverhältnis, damit die Tasten auf dem Bild bleiben.</p>' : ''))
        + this.sec(`Kachelform <span class="ke-sub">${esc(formName)}</span>`, `<p class="ke-text">${!inForm ? 'Grundform (ganze Seite, 16:9). Hier legst du alle Elemente an; die übrigen Formen nehmen sie mit.'
          : own ? `Eigene Anordnung: Lage und Größe gelten nur für „${esc(formName)}“, alles andere überall.` : 'Automatisch aus der Grundform. Sobald du hier etwas verschiebst, größer ziehst oder ausblendest, wird es eine eigene Anordnung.'}</p>
          ${inForm && own ? '<span><button type="button" class="ke-mini" data-act="reset-form">Zurück auf automatisch</button></span>' : ''}`)
        + this.sec('Auswählen', '<p class="ke-text">Klick wählt ein Element oder eine ganze Gruppe, <b>Doppelklick</b> ein Element in der Gruppe. <b>Strg</b>+Klick wählt mehrere, ein Rahmen über die freie Fläche alles darin, <b>Strg+A</b> alles. Gesperrte Elemente (Schloss in den Ebenen) lassen sich auf der Fläche nicht wählen.</p>');
    }

    headHtml(icon, title, sub, groupIcon = false) {
      return `<div class="ke-head">${svg(icon, 20, `class="ke-head-icon ${groupIcon ? 'ke-li-icon--group' : ''}"`)}
        <span class="ke-head-text">${title}<small>${sub}</small></span>
        <button type="button" class="ke-mini" data-act="dup" title="Duplizieren (Strg+D)">Duplizieren</button>
        <button type="button" class="ke-mini ke-danger" data-act="del" title="Löschen (Entf)" aria-label="Löschen">✕</button></div>`;
    }

    singleHtml({ kind, el }) {
      const id = el.id, b = this.box(id) || { l: 0, t: 0, w: 0, h: 0 }, g = this.geom(id) || el;
      const st = this.page.gridSize ?? SM_DEFAULT_GRID_SIZE;
      const round = kind === 'button' && (el.shape || 'circle') !== 'square';
      let html = this.headHtml(P[kind], `<input type="text" class="ke-inp ke-name" data-f="name" maxlength="40" value="${esc(this.nameOf(id))}" aria-label="Name">`, KIND_NAMES[kind]);
      if (el.group) html += `<div class="ke-note"><span>In Gruppe „${esc(this.page.groups[el.group]?.name || '')}“</span><button type="button" class="ke-mini" data-act="pick-group" data-arg="${esc(el.group)}">Gruppe wählen</button><button type="button" class="ke-mini" data-act="leave-group">Herauslösen</button></div>`;
      if (el.locked) html += `<div class="ke-note"><span>Gesperrt: auf der Fläche nicht wähl- und verschiebbar.</span><button type="button" class="ke-mini" data-act="lock" data-arg="${esc(id)}">Entsperren</button></div>`;
      html += this.sec(`Lage und Größe <span class="ke-sub">${this.form === '2x3' ? '(Grundform)' : `(nur „${esc(sm().formName(this.form))}“)`}</span>`,
        `<div class="ke-grid2">${this.row('X', this.numIn('x', b.l))}${this.row('Y', this.numIn('y', b.t))}${this.row('B', this.numIn('w', b.w))}${this.row('H', this.numIn('h', b.h, '%', kind === 'text' || round ? 'disabled' : ''))}</div>
        <p class="ke-hint">= ${de(b.w / st)} × ${de(b.h / st)} Raster · X/Y = linke obere Ecke, alles in % der Kachelbreite${kind === 'text' ? ' · Höhe ergibt sich aus dem Text' : round ? ' · Kreis und Dreieck bleiben rund' : ''}</p>
        ${ROTATES.includes(kind) ? this.row('Drehung', `<span class="ke-rot">${this.numIn('rotation', el.rotation || 0, '°', 'step="15"')}${this.seg([[0, '0°'], [90, '90°'], [180, '180°'], [270, '270°']], el.rotation || 0, 'rot')}</span>`) : ''}`);
      if (kind === 'button') {
        const icon = el.icon && SM_ICON_DEFS[el.icon];
        html += this.sec('Aussehen', this.row('Form', this.seg([['circle', '○ Kreis'], ['square', '▢ Viereck'], ['triangle', '△ Dreieck']], el.shape || 'circle', 'shape'))
            + (el.shape === 'square' ? this.row('Ecken', this.numIn('radius', el.cornerRadius ?? 0, '%', 'min="0" max="50" step="2"')) : '')
            + this.row('Farbe', this.colors(el.color, 'Keine Farbe'))
            + this.row('Beschriftung', `<input type="text" class="ke-inp" data-f="label" maxlength="24" value="${esc(el.label || '')}" placeholder="(keine)">`)
            + this.row('Piktogramm', `<button type="button" class="ke-inp ke-pick" data-act="icon">${icon ? `${smIconSvg(el.icon)} ${esc(icon.label)}` : 'Kein (nur Text)'}<span>▾</span></button>`)
            + this.row('Textgröße', this.numIn('fontSize', g.fontSize ?? 2, '', 'min="0.5" max="10" step="0.1"')),
          '<button type="button" class="ke-mini ke-sech-btn" data-act="fmt" title="Aussehen mit einem Klick auf andere Elemente übertragen">Format übertragen</button>')
          + this.sec('Funktion', this.row('Beim Drücken', `<button type="button" class="ke-inp ke-pick" data-act="action">${esc(this.actionText(el) || 'Keine Zuordnung')}<span>›</span></button>`)
            + (window.anzeigen?.available() ? this.row('Zustand zeigen', `<button type="button" class="ke-inp ke-pick" data-act="state">${el.stateSource ? `${esc(window.anzeigen.describe(el.stateSource))} · ${window.anzeigen.def(el.stateSource)?.kind === 'bool' ? 'leuchtet bei „an“' : 'Wert im Knopf'}` : 'Kein Zustand'}<span>›</span></button>`) : ''));
      } else if (kind === 'display') {
        html += this.displayHtml(el);
      } else if (kind === 'text') {
        html += this.sec('Text', `<label class="ke-row2 ke-row2--top"><span>Inhalt</span><textarea class="ke-inp" data-f="text" rows="3" maxlength="200">${esc(el.text || '')}</textarea></label>`
            + this.row('Textgröße', this.numIn('fontSize', g.fontSize ?? 3, '', 'min="0.5" max="20" step="0.1"'))
            + this.row('Farbe', this.colors(el.color, 'Weiß (Standard)')),
          '<button type="button" class="ke-mini ke-sech-btn" data-act="fmt" title="Farbe und Schriftgröße mit einem Klick auf andere Elemente übertragen">Format übertragen</button>');
      } else if (kind === 'graphic') {
        html += this.sec('Grafik', this.row('Bild', `<span class="ke-btns"><button type="button" class="ke-mini" data-act="upload-gfx">${el.src ? 'Bild ändern …' : 'Bild wählen …'}</button></span>`)
          + this.row('Ecken ziehen', this.seg([[true, 'Seitenverhältnis halten'], [false, 'frei']], el.keepRatio !== false, 'ratio')));
      } else if (kind === 'embed') {
        html += this.embedHtml(el);
      }
      return html;
    }

    displayHtml(a) {
      const A = window.anzeigen;
      if (!A) return '';
      const def = A.def(a.value), type = A.fitType(a.value, a.type);
      const ranged = type === 'balken' || type === 'tacho';
      const [mn, mx] = A.rangeOf(a);
      const fmt = n => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });
      const unit = esc(def?.unit || '');
      let body = this.row('Wert', `<button type="button" class="ke-inp ke-pick" data-act="value"><span><b>${esc(def?.name || 'Wert fehlt')}</b><small>${esc(A.pathOf(a.value))}</small></span><span>ändern …</span></button>`)
        + this.row('Beschriftung', `<input type="text" class="ke-inp" data-f="dlabel" maxlength="30" value="${esc(a.label || '')}" placeholder="${esc(def?.name || '')}">`)
        + this.row('Darstellung', this.seg(window.Werteliste.displayTypes(def).map(t => [t, A.TYPE_NAMES[t]]), type, 'anz-type'));
      if (ranged) {
        body += this.row('Bereich', this.seg([['auto', 'Automatisch'], ['manual', 'Selbst']], a.range === 'manual' ? 'manual' : 'auto', 'anz-range'))
          + (a.range === 'manual'
            ? `<div class="ke-grid2">${this.row('Start', this.numIn('min', mn, unit, 'step="any"'))}${this.row('Ende', this.numIn('max', mx, unit, 'step="any"'))}</div>`
            : `<p class="ke-hint">${def?.fixed ? `Immer ${fmt(mn)} bis ${fmt(mx)} ${unit}.` : `Aus dem Spiel: ${fmt(mn)} bis ${fmt(mx)} ${unit}. Passt sich beim Fahrzeug- oder Gerätewechsel an.`}</p>`)
          + this.row('Warnfarbe', this.seg([[0, 'Nie'], [10, 'unter 10 %'], [25, 'unter 25 %']], a.warn || 0, 'anz-warn'));
      }
      if (def?.kind === 'num' && (type === 'zahl' || type === 'tacho')) body += this.row('Komma', this.seg([[0, '0'], [1, '1'], [2, '2']], a.dec || 0, 'anz-dec'));
      // Ausrichtung im Rahmen (24.10.2026); der Tacho füllt seinen Rahmen und bleibt mittig
      if (type !== 'tacho') {
        if (type !== 'balken') body += this.row('Waagerecht', this.seg([['links', 'Links'], ['mitte', 'Mitte'], ['rechts', 'Rechts']], a.alignH || 'links', 'anz-ah'));
        body += this.row('Senkrecht', this.seg([['oben', 'Oben'], ['mitte', 'Mitte'], ['unten', 'Unten']], a.alignV || 'mitte', 'anz-av'));
      }
      body += this.row('Beim Antippen', `<button type="button" class="ke-inp ke-pick" data-act="action">${esc(this.actionText(a) || 'Keine Aktion')}<span>›</span></button>`);
      return this.sec('Anzeige', body);
    }

    embedHtml(e) {
      const name = window.tilePages?.moduleName(e.baustein) || e.baustein;
      let body = this.row('Zeigt', `<button type="button" class="ke-inp ke-pick" data-act="embed-type">${esc(name)}<span>▾</span></button>`);
      const o = e.opts || {};
      if (e.baustein === 'steuerung') {
        const mods = window.moduleFlow?.modules || [];
        const count = o.count || 'auto';
        const order = sm().steuerungOrder(e).slice(0, count === 'auto' ? 3 : count);
        body += this.row('Anzahl', this.seg([['auto', 'Auto'], [1, '1'], [2, '2'], [3, '3'], [4, '4']], count, 'st-count'))
          + this.row('Module', `<span class="ke-chips">${order.map((id, i) => `<button type="button" class="chip" data-act="st-slot" data-arg="${i}">${order.length > 1 ? `${i + 1}. ` : ''}${esc(mods.find(m => m.id === id)?.name || id)} ›</button>`).join('')}</span>`)
          + `<p class="ke-hint">${sm().steuerungCountHint(count)}</p>`;
      }
      if (e.baustein === 'planer-felder') {
        const chips = (key, items) => `<span class="ke-chips">${items.map(([v, l]) => `<button type="button" class="chip ${(o[key] ?? items[0][0]) === v ? 'on' : ''}" data-act="fl" data-arg="${key}:${v}">${l}</button>`).join('')}</span>`;
        body += this.row('Gruppieren', chips('group', [['komplex', 'Feldkomplex'], ['frucht', 'Frucht'], ['arbeit', 'Arbeit'], ['keine', 'Keine']]))
          + this.row('Arbeiten', chips('filter', [['alle', 'Alle'], ['ernte', 'Ernte'], ['bestellung', 'Bestellung'], ['duengen', 'Düngen & Kalk'], ['schutz', 'Pflanzenschutz']]))
          + this.row('Sortieren', chips('sort', [['arbeit', 'Dringlichkeit'], ['feld', 'Feldnummer'], ['frucht', 'Frucht']]))
          + this.row('Felder', chips('alle', [[false, 'Nur mit offener Arbeit'], [true, 'Alle']]));
      }
      if (e.baustein.startsWith('planer-')) body += '<p class="ke-hint">Feld antippen öffnet ein kleines Fenster. Komplexe, Fruchtfolge und Planer-Satz: ☰ Menü → Arbeitsplaner.</p>';
      if (e.baustein === 'karte') body += '<p class="ke-hint">Die Karte gibt es nur einmal gleichzeitig: Liegt sie schon in einer Kachel derselben Startseite, bleibt dieses Element leer.</p>';
      return this.sec('Inhalt', body);
    }

    groupHtml() {
      const gid = this.selGroup, b = this.bbox(this.members(gid)) || { l: 0, t: 0, w: 0, h: 0 };
      const mem = this.members(gid);
      return this.headHtml(P.group, `<input type="text" class="ke-inp ke-name" data-f="group-name" maxlength="40" value="${esc(this.page.groups[gid]?.name || '')}" aria-label="Name der Gruppe">`, `Gruppe · ${mem.length} Elemente`, true)
        + this.sec('Gruppe', this.row('Elemente', `<span class="ke-chips">${mem.map(id => `<button type="button" class="chip" data-act="enter" data-arg="${esc(id)}">${esc(this.nameOf(id))}</button>`).join('')}</span>`)
          + '<span><button type="button" class="ke-mini" data-act="ungroup" title="Strg+Shift+G">Gruppierung aufheben</button></span>')
        + this.sec(`Lage und Größe <span class="ke-sub">${this.form === '2x3' ? '(Grundform)' : `(nur „${esc(sm().formName(this.form))}“)`}</span>`,
          `<div class="ke-grid2">${this.row('X', this.numIn('gx', b.l))}${this.row('Y', this.numIn('gy', b.t))}${this.row('B', this.numIn('gw', b.w))}${this.row('H', this.numIn('gh', b.h))}</div>
          <p class="ke-hint">Breite oder Höhe ändern vergrößert die ganze Gruppe gleichmäßig, auch die Schrift.</p>`);
    }
    multiHtml() {
      return this.sec(`${this.sel.length} Elemente ausgewählt`, `<p class="ke-text">Ziehen bewegt alle gemeinsam. Als Gruppe bleiben sie zusammen und lassen sich gemeinsam größer ziehen.</p>
        <span class="ke-btns"><button type="button" class="ke-mini ke-primary" data-act="group" title="Strg+G">Gruppieren</button><button type="button" class="ke-mini" data-act="dup">Duplizieren</button><button type="button" class="ke-mini ke-danger" data-act="del">Löschen</button></span>`);
    }
    // Mehrere gleich ändern: nur, was zu den gewählten Arten passt; leeres Feld = unterschiedlich
    commonHtml() {
      const els = this.sel.map(id => this.find(id)).filter(Boolean);
      const btns = els.filter(f => f.kind === 'button'), colorable = els.filter(f => f.kind === 'button' || f.kind === 'text');
      const same = (list, fn) => { const v = [...new Set(list.map(fn))]; return v.length === 1 ? v[0] : null; };
      let body = '';
      if (btns.length) body += this.row('Form', this.seg([['circle', '○ Kreis'], ['square', '▢ Viereck'], ['triangle', '△ Dreieck']], same(btns, f => f.el.shape || 'circle'), 'shape'));
      if (colorable.length) {
        body += this.row('Farbe', this.colors(same(colorable, f => f.el.color || null), 'Keine Farbe / Standard'))
          + this.row('Textgröße', this.numIn('fontSize', same(colorable, f => (this.geom(f.el.id) || f.el).fontSize) ?? '', '', 'min="0.5" max="20" step="0.1" placeholder="gemischt"'));
      }
      if (!this.selGroup) {
        const bs = els.map(f => this.box(f.el.id)).filter(Boolean);
        const sw = same(bs, b => r2(b.w)), sh = same(bs, b => r2(b.h));
        body += `<div class="ke-grid2">${this.row('B', this.numIn('mw', sw ?? '', '%', 'placeholder="gemischt"'))}${this.row('H', this.numIn('mh', sh ?? '', '%', 'placeholder="gemischt"'))}</div>`;
      }
      if (!body) return '';
      return this.sec(`Gemeinsam ändern <span class="ke-sub">${this.selGroup ? `(alle in „${esc(this.page.groups[this.selGroup]?.name || '')}“)` : `(${this.sel.length} Elemente)`}</span>`,
        body + '<p class="ke-hint">Ein leeres Feld heißt: unterschiedlich. Was du einstellst, gilt für alle gewählten Elemente, zu denen es passt (Form nur für Tasten, Farbe und Schrift für Tasten und Texte).</p>');
    }
    // Ausrichten und gleich verteilen (ab zwei Teilen); ist die Auswahl gleich verteilt, auch der Abstand als Zahl
    layoutHtml() {
      const parts = this.parts();
      if (parts.length < 2) return '';
      const locked = this.lockedParts(parts), s = locked ? null : this.spread();
      const btn = (act, arg, label, title) => `<button type="button" data-act="${act}" data-arg="${arg}" title="${title}" ${locked ? 'disabled' : ''}>${label}</button>`;
      const grouped = !this.selGroup && parts.some(p => p.ids.length > 1);
      return this.sec(`Anordnen <span class="ke-sub">(${parts.length} ${grouped ? 'Teile, Gruppen bleiben zusammen' : 'Elemente'})</span>`,
        this.row('Ausrichten', `<span class="ke-seg">${btn('align', 'links', 'Links', 'Linke Kanten bündig')}${btn('align', 'hmitte', 'Mitte', 'Waagerecht auf eine Mitte')}${btn('align', 'rechts', 'Rechts', 'Rechte Kanten bündig')}</span>`)
        + this.row('', `<span class="ke-seg">${btn('align', 'oben', 'Oben', 'Obere Kanten bündig')}${btn('align', 'vmitte', 'Mitte', 'Senkrecht auf eine Mitte')}${btn('align', 'unten', 'Unten', 'Untere Kanten bündig')}</span>`)
        + this.row('Verteilen', `<span class="ke-seg">${btn('spread', 'x', '↔ Waagerecht', 'Nebeneinander mit gleichen Abständen')}${btn('spread', 'y', '↕ Senkrecht', 'Untereinander mit gleichen Abständen')}</span>`)
        + (s ? this.row(`Abstand ${s.axis === 'x' ? '↔' : '↕'}`, this.numIn('gap', s.gap, '%', 'min="0" max="100"')) : '')
        + `<p class="ke-hint">${locked ? 'Gesperrte Elemente bleiben stehen: zum Anordnen erst entsperren.'
          : `Beim Verteilen bleiben das erste und das letzte stehen, dazwischen kommen gleiche Abstände. ${s
            ? 'Den Abstand ziehst du am pinken Griff zwischen zwei Elementen: er rastet im Raster ein, mit Shift im Feinraster, mit Alt frei. Oder du tippst ihn hier ein.'
            : 'Danach lässt sich der Abstand am pinken Griff zwischen zwei Elementen ziehen.'}`}</p>`);
    }
    arrangeHtml() {
      const units = this.units();
      const one = this.single();
      const inside = one && one.el.group && this.inGroup === one.el.group;
      let pos = '', atFront = false, atBack = false;
      if (inside) {
        const mem = this.members(one.el.group), i = mem.indexOf(one.el.id);
        pos = `(in der Gruppe ${mem.length - i} von ${mem.length})`; atFront = i === mem.length - 1; atBack = i === 0;
      } else {
        const hit = units.map((u, i) => (u.ids.some(id => this.sel.includes(id)) ? i : -1)).filter(i => i >= 0);
        if (hit.length === 1) { pos = `(${units.length - hit[0]} von ${units.length}, 1 = vorne)`; atFront = hit[0] === units.length - 1; atBack = hit[0] === 0; }
      }
      const btn = (op, label, key, off) => `<button type="button" data-act="arrange" data-arg="${op}" title="${label} (${key})" ${off ? 'disabled' : ''}>${label}</button>`;
      return this.sec(`Ebene <span class="ke-sub">${pos}</span>`, `<span class="ke-seg">${btn('front', 'Ganz vorn', 'Strg+Shift+Bild↑', atFront)}${btn('fwd', 'Vor', 'Strg+Bild↑', atFront)}${btn('bwd', 'Zurück', 'Strg+Bild↓', atBack)}${btn('back', 'Ganz hinten', 'Strg+Shift+Bild↓', atBack)}</span>
        <p class="ke-hint">${inside ? 'Element in der Gruppe: verschiebt nur innerhalb der Gruppe.' : 'Gilt für alle Kachelformen. Gruppen bleiben dabei zusammen.'}</p>`);
    }
    visibilityHtml() {
      if (this.form === '2x3') {
        const vals = [...new Set(this.sel.map(id => this.find(id)?.el.show || 'immer'))];
        return this.sec('Sichtbarkeit', this.row('In kleinen Kacheln', this.seg([['immer', 'Immer'], ['mittel', 'ab 2 Feldern'], ['gross', 'nur groß']], vals.length === 1 ? vals[0] : null, 'show'))
          + '<p class="ke-hint">Gilt für Kachelformen, die ControlHub automatisch anordnet.</p>');
      }
      return this.sec('Sichtbarkeit', this.row(esc(sm().formName(this.form)), '<span class="ke-seg"><button type="button" class="on">Zeigen</button><button type="button" data-act="hide">Ausblenden</button></span>')
        + '<p class="ke-hint">Ausgeblendetes holst du über das Auge in den Ebenen zurück.</p>');
    }

    renderStatus() {
      const g = this.page.gridSize ?? SM_DEFAULT_GRID_SIZE, f = this.page.fineGridSize ?? SM_DEFAULT_FINE_GRID_SIZE;
      const opt = (list, cur) => list.map(v => `<option value="${v}" ${Math.abs(v - cur) < 1e-9 ? 'selected' : ''}>${de(v)} %</option>`).join('')
        + (list.some(v => Math.abs(v - cur) < 1e-9) ? '' : `<option value="${cur}" selected>${de(cur)} %</option>`);
      const one = this.single(), b = one ? this.box(one.el.id) : this.selGroup ? this.bbox(this.members(this.selGroup)) : null;
      const info = this.msg || (one && b ? `${this.nameOf(one.el.id)}: ${de(b.w)} × ${de(b.h)} %` : this.selGroup && b ? `Gruppe „${this.page.groups[this.selGroup]?.name}“: ${de(b.w)} × ${de(b.h)} %` : this.sel.length > 1 ? `${this.sel.length} Elemente${(sp => (sp ? ` · Abstand ${sp.axis === 'x' ? '↔' : '↕'} ${de(sp.gap)} %` : ''))(this.spread())}` : 'Nichts ausgewählt');
      this.root.querySelector('.ke-status').innerHTML = `
        <label>Raster <select class="ke-inp ke-sel-sm" data-f="grid">${opt([5, 2.5, 1.25, 1], g)}</select></label>
        <label>Feinraster <select class="ke-inp ke-sel-sm" data-f="fine">${opt([1, 0.5, 0.25], f)}</select></label>
        <button type="button" class="ke-mini ${this.showGrid ? 'on' : ''}" data-act="toggle-grid" aria-pressed="${this.showGrid}">Raster zeigen</button>
        <button type="button" class="ke-mini ${this.snap ? 'on' : ''}" data-act="toggle-snap" aria-pressed="${this.snap}">Einrasten</button>
        <span class="ke-sep"></span>
        <span class="ke-zoom">Zoom <button type="button" class="ke-mini" data-act="zoom" data-arg="0.8" aria-label="Verkleinern (Strg+Minus)">−</button><b>${Math.round(this.zoom * 100)} %</b><button type="button" class="ke-mini" data-act="zoom" data-arg="1.25" aria-label="Vergrößern (Strg+Plus)">+</button><button type="button" class="ke-mini" data-act="zoom" data-arg="fit" title="Strg+0">Einpassen</button></span>
        <span class="ke-sep"></span>
        <span class="ke-msg">${esc(info)}</span>
        <span class="ke-flex"></span>
        <span class="ke-keys"><b>Shift</b> fein · <b>Alt</b> frei · <b>Strg+Z/Y</b> · <b>C/X/V</b> · <b>G</b> Gruppe · <b>Bild↑/↓</b> Ebene · <b>Pfeile</b> schieben (Shift fein)</span>`;
    }

    // ---------- Ereignisse ----------
    bind() {
      const r = this.root;
      r.addEventListener('click', e => {
        const t = e.target.closest('[data-act]');
        if (this.menu && !e.target.closest('.ke-drop')) { this.menu = null; this.renderToolbar(); }
        if (!t || t.disabled) return;
        this.act(t.dataset.act, t.dataset.arg, t, e);
      });
      r.addEventListener('change', e => { const t = e.target.closest('[data-f]'); if (t) this.field(t.dataset.f, t.value, t); });
      r.addEventListener('keydown', e => this.onKey(e));
      r.addEventListener('dblclick', e => {
        const row = e.target.closest('.ke-layers [data-row]');
        if (row) { this.rename(row.dataset.row); return; }
        if (e.target.closest('.ke-canvas')) this.onDbl(e);
      });
      r.addEventListener('pointerdown', e => { const cv = e.target.closest('.ke-canvas'); if (cv) this.onDown(e, cv); });
      r.addEventListener('pointermove', e => this.onMove(e));
      r.addEventListener('pointerup', e => this.onUp(e));
      r.addEventListener('pointercancel', e => this.onUp(e));
      r.addEventListener('wheel', e => { if ((e.ctrlKey || e.metaKey) && e.target.closest('.ke-stage')) { e.preventDefault(); this.setZoom(this.zoom * (e.deltaY < 0 ? 1.1 : 0.9)); } }, { passive: false });
      // Ebenen: ziehen und ablegen
      r.addEventListener('dragstart', e => { const row = e.target.closest?.('.ke-layers [data-row]'); if (!row) return; this.dnd = row.dataset.row; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', this.dnd); });
      r.addEventListener('dragover', e => {
        const row = e.target.closest?.('.ke-layers [data-row]');
        if (!row || !this.dnd) return;
        e.preventDefault();
        const rect = row.getBoundingClientRect(), pos = e.clientY < rect.top + rect.height / 2 ? 'above' : 'below';
        r.querySelectorAll('.ke-drop-above, .ke-drop-below').forEach(x => x.classList.remove('ke-drop-above', 'ke-drop-below'));
        row.classList.add(pos === 'above' ? 'ke-drop-above' : 'ke-drop-below');
      });
      r.addEventListener('drop', e => {
        const row = e.target.closest?.('.ke-layers [data-row]');
        if (!row || !this.dnd) return;
        e.preventDefault();
        const rect = row.getBoundingClientRect();
        this.dropOn(row.dataset.row, e.clientY < rect.top + rect.height / 2 ? 'above' : 'below');
      });
      r.addEventListener('dragend', () => { this.dnd = null; r.querySelectorAll('.ke-drop-above, .ke-drop-below').forEach(x => x.classList.remove('ke-drop-above', 'ke-drop-below')); });
      this.ro = new ResizeObserver(() => { if (!this.drag) this.renderCanvas(); });
      this.ro.observe(r.querySelector('.ke-stage'));
    }

    act(name, arg, el, e) {
      const one = this.single();
      switch (name) {
        case 'menu': this.menu = this.menu === arg ? null : arg; this.renderToolbar(); return;
        case 'add-button': return this.add('button');
        case 'add-text': return this.add('text');
        case 'add-graphic': return this.add('graphic');
        case 'add-embed': return this.add('embed', { baustein: arg });
        case 'add-display': return this.addDisplay(null);
        case 'add-preset': return this.addDisplay(+arg);
        case 'undo': return this.undo();
        case 'redo': return this.redo();
        case 'cut': return this.copy(true);
        case 'copy': return this.copy(false);
        case 'paste': return this.paste();
        case 'view': return sm().exitEditMode(this.pageId);
        case 'form': this.form = arg; this.selectOnly(this.sel.filter(id => this.geom(id, arg))); this.msg = ''; return this.renderAll();
        case 'reset-form': return this.change(() => { delete this.page.varianten[this.form]; }, 'Zurück auf automatisch');
        case 'pick': this.selectOnly([arg], null, this.find(arg)?.el.group || null); this.msg = ''; return this.renderAll();
        case 'pick-group': this.selectOnly(this.members(arg), arg); this.msg = ''; return this.renderAll();
        case 'enter': this.selectOnly([arg], null, this.find(arg)?.el.group || null); return this.renderAll();
        case 'collapse': this.collapsed[arg] = !this.collapsed[arg]; return this.renderLayers();
        case 'lock': { const f = this.find(arg); return this.change(() => { f.el.locked = !f.el.locked; }, f.el.locked ? `„${this.nameOf(arg)}“ entsperrt` : `„${this.nameOf(arg)}“ gesperrt`); }
        case 'lock-group': { const mem = this.members(arg), to = !mem.every(id => this.find(id).el.locked); return this.change(() => { for (const id of mem) this.find(id).el.locked = to; }, to ? 'Gruppe gesperrt' : 'Gruppe entsperrt'); }
        case 'eye': { const v = this.variant(this.form)[arg]; const hid = !v || v.hidden; return this.change(() => this.setHidden(arg, !hid)); }
        case 'eye-group': { const mem = this.members(arg); const allHid = mem.every(id => { const v = this.variant(this.form)[id]; return !v || v.hidden; }); return this.change(() => { for (const id of mem) this.setHidden(id, !allHid); }); }
        case 'hide': return this.change(() => { for (const id of this.sel) this.setHidden(id, true); this.selectOnly([]); });
        case 'dup': return this.duplicate();
        case 'del': return this.remove();
        case 'group': return this.groupSel();
        case 'ungroup': return this.ungroupSel();
        case 'leave-group': return this.leaveGroup();
        case 'arrange': return this.arrange(arg);
        case 'align': return this.alignSel(arg);
        case 'spread': return this.distribute(arg);
        case 'fmt': if (one) { this.fmt = { from: one.el.id, kind: one.kind }; this.msg = `Format von „${this.nameOf(one.el.id)}“: Ziel anklicken · Esc bricht ab`; this.renderCanvas(); this.renderStatus(); } return;
        case 'shape': return this.setProp('shape', arg, ['button'], () => { if (arg !== 'square') for (const id of this.sel) { const f = this.find(id); if (f.kind === 'button') f.el.heightSize = null; } });
        case 'color': return this.setProp('color', arg || null, ['button', 'text']);
        case 'rot': return this.change(() => { if (one) one.el.rotation = +arg; });
        case 'show': return this.change(() => { for (const id of this.sel) this.find(id).el.show = arg; });
        case 'ratio': return this.change(() => { if (one) one.el.keepRatio = arg === 'true'; });
        case 'anz-type': return this.change(() => { one.el.type = arg; });
        case 'anz-range': return this.change(() => { if (arg === 'manual') { const [min, max] = window.anzeigen.rangeOf({ ...one.el, range: 'auto' }); Object.assign(one.el, { range: 'manual', min, max }); } else one.el.range = 'auto'; });
        case 'anz-warn': return this.change(() => { one.el.warn = +arg; });
        case 'anz-dec': return this.change(() => { one.el.dec = +arg; });
        case 'anz-ah': return this.change(() => { one.el.alignH = arg; });
        case 'anz-av': return this.change(() => { one.el.alignV = arg; });
        case 'action': return this.pickAction(one);
        case 'state': return this.pickState(one);
        case 'value': return this.pickValue(one);
        case 'icon': return this.pickIcon(one, el);
        case 'embed-type': return this.pickEmbedType(one);
        case 'st-count': return this.change(() => { one.el.opts = { ...(one.el.opts || {}), count: arg === 'auto' ? 'auto' : +arg }; });
        case 'st-slot': return this.pickModule(one, +arg);
        case 'fl': { const [k, v] = arg.split(':'); return this.change(() => { one.el.opts = { ...(one.el.opts || {}), [k]: v === 'true' ? true : v === 'false' ? false : v }; }); }
        case 'upload-gfx': return this.upload('gfx');
        case 'upload-bg': return this.upload('bg');
        case 'remove-bg': return this.removeBackground();
        case 'toggle-grid': this.showGrid = !this.showGrid; this.positionAll(); return this.renderStatus();
        case 'toggle-snap': this.snap = !this.snap; return this.renderStatus();
        case 'zoom': return arg === 'fit' ? this.setZoom(1) : this.setZoom(this.zoom * +arg);
        default:
      }
    }

    setProp(key, value, kinds, extra) {
      this.change(() => {
        for (const id of this.sel) { const f = this.find(id); if (f && kinds.includes(f.kind)) f.el[key] = value; }
        extra?.();
      });
    }
    setZoom(z) { this.zoom = Math.max(0.5, Math.min(4, r2(z))); this.renderCanvas(); this.renderStatus(); }

    field(f, value, input) {
      const one = this.single();
      const v = num(value);
      if (f === 'grid' || f === 'fine') {
        this.page[f === 'grid' ? 'gridSize' : 'fineGridSize'] = v;
        this.scheduleSave();
        this.positionAll(); this.renderInspector(); this.renderStatus();
        return;
      }
      if (f === 'tile-name') return this.renameTile(value);
      if (f === 'name') { if (one) this.change(() => { one.el.name = value.trim() ? value.trim().slice(0, 40) : null; }); return; }
      if (f === 'group-name') { const gid = this.selGroup; if (gid) this.change(() => { this.page.groups[gid] = { name: value.trim().slice(0, 40) || 'Gruppe' }; }); return; }
      if (f === 'label') return this.change(() => { one.el.label = value.slice(0, 24); });
      if (f === 'dlabel') return this.change(() => { one.el.label = value.trim() ? value.trim().slice(0, 30) : null; });
      if (f === 'text') return this.change(() => { one.el.text = value.slice(0, 200); });
      if (v == null) { this.renderInspector(); return; }
      if (f === 'rotation') return this.change(() => { one.el.rotation = ((v % 360) + 360) % 360; });
      if (f === 'radius') return this.change(() => { one.el.cornerRadius = Math.max(0, Math.min(50, v)); });
      if (f === 'min' || f === 'max') return this.change(() => { one.el[f] = v; });
      if (f === 'fontSize') return this.change(() => { for (const id of this.sel) { const k = this.find(id)?.kind; if (k === 'button' || k === 'text') this.setGeom(id, { fontSize: Math.max(0.5, Math.min(k === 'text' ? 20 : 10, v)) }); } });
      if (f === 'gap') {
        const sp = this.spread();
        if (!sp) return this.renderInspector();
        const boxes = this.boxesOf(sp.order);
        this.spreadAxis = sp.axis;
        return this.change(() => this.placeSpread(sp.order, sp.axis, Math.max(0, v), boxes));
      }
      if (['x', 'y', 'w', 'h'].includes(f) && one) {
        return this.change(() => {
          const b = { ...this.box(one.el.id) };
          if (f === 'x') b.l = v; if (f === 'y') b.t = v;
          if (f === 'w') { b.w = Math.max(1, v); if (one.kind === 'button' && (one.el.shape || 'circle') !== 'square') b.h = b.w; }
          if (f === 'h') b.h = Math.max(1, v);
          this.setGeom(one.el.id, this.fromBox(one.el.id, b));
        });
      }
      if (['gx', 'gy', 'gw', 'gh'].includes(f) && this.selGroup) {
        const mem = this.members(this.selGroup), bb = this.bbox(mem);
        return this.change(() => {
          const k = f === 'gw' ? Math.max(1, v) / bb.w : f === 'gh' ? Math.max(1, v) / bb.h : 1;
          const dx = f === 'gx' ? v - bb.l : 0, dy = f === 'gy' ? v - bb.t : 0;
          this.scaleMembers(mem, bb, k, bb.l + dx, bb.t + dy);
        });
      }
      if ((f === 'mw' || f === 'mh') && this.sel.length > 1) {
        return this.change(() => {
          for (const id of this.sel) {
            const b = this.box(id), fd = this.find(id);
            if (!b) continue;
            if (fd.kind === 'text' && f === 'mh') continue;
            const round = fd.kind === 'button' && (fd.el.shape || 'circle') !== 'square';
            const cx = b.l + b.w / 2, cy = b.t + b.h / 2;
            if (f === 'mw') { b.w = Math.max(1, v); if (round) b.h = b.w; } else { b.h = Math.max(1, v); if (round) b.w = b.h; }
            b.l = cx - b.w / 2; b.t = cy - b.h / 2;
            this.setGeom(id, this.fromBox(id, b));
          }
        });
      }
      void input;
    }
    // Elemente einer Gruppe gleichmäßig skalieren (k) und an die neue linke obere Ecke (nl/nt) setzen; Schrift wächst mit
    scaleMembers(ids, bb, k, nl, nt) {
      for (const id of ids) {
        const b = this.box(id), f = this.find(id);
        if (!b) continue;
        const nb = { l: nl + (b.l - bb.l) * k, t: nt + (b.t - bb.t) * k, w: b.w * k, h: b.h * k };
        const p = this.fromBox(id, nb);
        if (f.kind === 'button' || f.kind === 'text') p.fontSize = ((this.geom(id) || f.el).fontSize || 2) * k;
        if (f.kind === 'text') this.textH[id] = nb.h;
        this.setGeom(id, p);
      }
    }

    // ---------- Fläche: Maus ----------
    onDown(e, cv) {
      if (e.button !== 0) return;
      this.root.focus({ preventScroll: true });
      const h = e.target.closest('[data-h]')?.dataset.h;
      const node = e.target.closest('.sm-btn, .sm-graphic, .sm-text-el, .sm-display, .sm-embed');
      const id = node ? this.nodeId(node) : null;
      const rect = cv.getBoundingClientRect();
      if (this.fmt) { if (id) this.applyFmt(id); else { this.fmt = null; this.msg = 'Format übertragen abgebrochen'; this.renderCanvas(); this.renderStatus(); } return; }
      if (e.target.closest('[data-gap]')) {
        const sp = this.spread();
        if (!sp) return;
        this.drag = { mode: 'gap', axis: sp.axis, order: sp.order, gap: sp.gap, boxes: this.boxesOf(sp.order), sx: e.clientX, sy: e.clientY, rw: rect.width, pre: this.snapshot(), moved: false };
        cv.setPointerCapture?.(e.pointerId);
        return;
      }
      if (!h && !id) {
        const add = e.ctrlKey || e.metaKey;
        this.drag = { mode: 'marquee', sx: e.clientX, sy: e.clientY, rect, base: add ? [...this.sel] : [], moved: false };
        cv.setPointerCapture?.(e.pointerId);
        if (!add) { this.selectOnly([]); this.msg = ''; this.renderAll(); }
        return;
      }
      if (!h) {
        const before = JSON.stringify([this.sel, this.selGroup, this.inGroup]);
        this.clickSelect(id, e);
        if (JSON.stringify([this.sel, this.selGroup, this.inGroup]) !== before) { this.msg = ''; this.renderLayers(); this.renderInspector(); this.renderStatus(); this.renderToolbar(); this.positionSel(); }
        if (e.ctrlKey || e.metaKey) return;
      }
      if (this.sel.some(x => this.find(x)?.el.locked)) return;
      const orig = Object.fromEntries(this.sel.map(x => [x, this.box(x)]).filter(([, b]) => b));
      const others = new Set(Object.keys(orig));
      const xs = [0, 50, 100], ys = [0, this.canvasH() / 2, this.canvasH()];
      for (const lid of this.page.layers) {
        if (others.has(lid)) continue;
        const b = this.box(lid);
        if (!b) continue;
        xs.push(b.l, b.l + b.w / 2, b.l + b.w); ys.push(b.t, b.t + b.h / 2, b.t + b.h);
      }
      this.drag = { mode: h ? (this.selGroup ? 'gresize' : 'resize') : 'move', h, id: h ? this.sel[0] : id, sx: e.clientX, sy: e.clientY, rw: rect.width,
        orig, bb: this.bbox(Object.keys(orig)), xs, ys, pre: this.snapshot(), moved: false,
        fonts: Object.fromEntries(Object.keys(orig).map(x => [x, (this.geom(x) || this.find(x).el).fontSize])) };
      cv.setPointerCapture?.(e.pointerId);
    }
    nearest(vals, cands, th) {
      let best = null;
      for (const v of vals) for (const c of cands) { const d = c - v; if (Math.abs(d) <= th && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: c }; }
      return best;
    }
    onMove(e) {
      const d = this.drag;
      if (!d) return;
      if (!d.moved && Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) < 3) return;
      d.moved = true;
      if (d.mode === 'marquee') return this.marqueeTo(e);
      const dx = ((e.clientX - d.sx) / d.rw) * 100, dy = ((e.clientY - d.sy) / d.rw) * 100;
      const free = !this.snap || e.altKey;
      // Mit Shift nur das Feinraster: die Hilfslinien ziehen dann nicht an (sonst schnappt das Element bei feinem Raster
      // fast immer an die nächste Kante), sie zeigen nur, wenn etwas genau bündig liegt
      const fine = !free && e.shiftKey;
      const st = free ? 0 : fine ? (this.page.fineGridSize ?? SM_DEFAULT_FINE_GRID_SIZE) : (this.page.gridSize ?? SM_DEFAULT_GRID_SIZE);
      const sn = v => (st ? Math.round(v / st) * st : v);
      let tip;
      if (d.mode === 'gap') {
        // Abstand der gleich verteilten Teile: rastet als Vielfaches des Rasters ein
        const gap = Math.max(0, sn(d.gap + (d.axis === 'x' ? dx : dy)));
        this.placeSpread(d.order, d.axis, gap, d.boxes);
        this.spreadAxis = d.axis;
        tip = `Abstand ${de(gap)} %${st ? ` · ${de(gap / st)} ${fine ? 'Feinraster' : 'Raster'}` : ' · frei'}`;
        this.positionAll();
        this.msg = tip;
        const m = this.root.querySelector('.ke-msg');
        if (m) m.textContent = tip;
        return;
      }
      if (!d.bb) return;
      const th = (6 / d.rw) * 100;
      const guides = [];
      const fit = (vals, axis) => { const g = free || fine ? null : this.nearest(vals, axis === 'x' ? d.xs : d.ys, th); if (g) guides.push([axis, g.at]); return g; };
      const mark = (vals, axis) => { const g = fine && this.nearest(vals, axis === 'x' ? d.xs : d.ys, 0.02); if (g) guides.push([axis, g.at]); };
      const edge = (v, axis) => { const g = fit([v], axis), out = g ? v + g.d : sn(v); mark([out], axis); return out; };
      const bb = d.bb;
      if (d.mode === 'move') {
        let nx = bb.l + dx, ny = bb.t + dy;
        const gx = fit([nx, nx + bb.w / 2, nx + bb.w], 'x'), gy = fit([ny, ny + bb.h / 2, ny + bb.h], 'y');
        nx = gx ? nx + gx.d : sn(nx); ny = gy ? ny + gy.d : sn(ny);
        mark([nx, nx + bb.w / 2, nx + bb.w], 'x'); mark([ny, ny + bb.h / 2, ny + bb.h], 'y');
        const mx = nx - bb.l, my = ny - bb.t;
        for (const [id, b] of Object.entries(d.orig)) this.setGeom(id, this.fromBox(id, { ...b, l: b.l + mx, t: b.t + my }));
        tip = `X ${de(nx)} %  Y ${de(ny)} %${free ? ' · frei' : fine ? ' · Feinraster' : ''}`;
      } else {
        const min = st || 1;
        let L = bb.l, T = bb.t, R = bb.l + bb.w, B = bb.t + bb.h;
        if (d.h.includes('w')) L = Math.min(edge(bb.l + dx, 'x'), R - min);
        if (d.h.includes('e')) R = Math.max(edge(bb.l + bb.w + dx, 'x'), L + min);
        if (d.h.includes('n')) T = Math.min(edge(bb.t + dy, 'y'), B - min);
        if (d.h.includes('s')) B = Math.max(edge(bb.t + bb.h + dy, 'y'), T + min);
        const f = this.find(d.id);
        if (d.mode === 'gresize' || (f.kind === 'text' && d.h.length === 2)) {
          // Gruppe bzw. Text an der Ecke: gleichmäßig, Schrift wächst mit; die gegenüberliegende Kante bleibt stehen
          const sx = (R - L) / bb.w, sy = (B - T) / bb.h;
          const k = Math.max(0.05, d.h.length === 2 ? (f.kind === 'text' && d.mode !== 'gresize' ? sx : Math.max(sx, sy)) : (d.h === 'e' || d.h === 'w' ? sx : sy));
          const ax = d.h.includes('w') ? bb.l + bb.w : d.h.includes('e') ? bb.l : bb.l + bb.w / 2;
          const ay = d.h.includes('n') ? bb.t + bb.h : d.h.includes('s') ? bb.t : bb.t + bb.h / 2;
          for (const [id, b] of Object.entries(d.orig)) {
            const nb = { l: ax + (b.l - ax) * k, t: ay + (b.t - ay) * k, w: b.w * k, h: b.h * k };
            const p = this.fromBox(id, nb);
            const kd = this.find(id).kind;
            if ((kd === 'button' || kd === 'text') && d.fonts[id]) p.fontSize = d.fonts[id] * k;
            if (kd === 'text') this.textH[id] = nb.h;
            this.setGeom(id, p);
          }
          tip = `${de(bb.w * k)} × ${de(bb.h * k)} % · ${Math.round(k * 100)} %`;
        } else {
          let w = R - L, h = B - T;
          const round = f.kind === 'button' && (f.el.shape || 'circle') !== 'square';
          const ratio = f.kind === 'graphic' && f.el.keepRatio !== false && d.h.length === 2;
          if (round || ratio) {
            const ar = ratio ? bb.w / bb.h : 1;
            if (d.h.length === 2) { if (w / ar > h) h = w / ar; else w = h * ar; }
            else if (d.h === 'e' || d.h === 'w') h = w / ar; else w = h * ar;
            if (d.h.includes('w')) L = R - w; else if (d.h === 'n' || d.h === 's') L = bb.l + bb.w / 2 - w / 2;
            if (d.h.includes('n')) T = B - h; else if (d.h === 'e' || d.h === 'w') T = bb.t + bb.h / 2 - h / 2;
          }
          this.setGeom(d.id, this.fromBox(d.id, { l: L, t: T, w, h }));
          tip = `${de(w)} × ${de(h)} %${st ? ` · ${de(w / st)} × ${de(h / st)} ${fine ? 'Feinraster' : 'Raster'}` : ' · frei'}`;
        }
      }
      this.positionAll();
      this.showGuides(guides);
      this.msg = tip;
      const m = this.root.querySelector('.ke-msg');
      if (m) m.textContent = tip;
    }
    onUp() {
      const d = this.drag;
      this.drag = null;
      if (!d) return;
      const mq = this.root?.querySelector('.ke-marquee');
      if (mq) mq.hidden = true;
      this.showGuides([]);
      if (d.mode === 'marquee') { if (d.moved) this.renderAll(); return; }
      if (!d.moved) return;
      this.tidy();
      this.pushHist(d.pre);
      this.msg = '';
      this.scheduleSave();
      this.renderAll();
    }
    showGuides(list) {
      const g = this.root?.querySelector('.ke-guides');
      if (!g) return;
      const px = v => (v * this.W) / 100;
      g.innerHTML = list.map(([axis, at]) => (axis === 'x'
        ? `<div class="ke-guide ke-guide--v" style="left:${px(at)}px"></div>`
        : `<div class="ke-guide ke-guide--h" style="top:${px(at)}px"></div>`)).join('');
    }
    // Rahmen-Auswahl: alles, was der Rahmen berührt (Gruppen ganz, Gesperrtes nicht)
    marqueeTo(e) {
      const d = this.drag, r = d.rect;
      const P2 = (cx, cy) => [((cx - r.left) / r.width) * 100, ((cy - r.top) / r.width) * 100];
      const [ax, ay] = P2(d.sx, d.sy), [bx, by] = P2(e.clientX, e.clientY);
      const m = { l: Math.min(ax, bx), t: Math.min(ay, by), r: Math.max(ax, bx), b: Math.max(ay, by) };
      const hit = this.page.layers.filter(id => { const b = this.box(id); return b && !this.find(id).el.locked && b.l < m.r && b.l + b.w > m.l && b.t < m.b && b.t + b.h > m.t; });
      const gids = [...new Set(hit.map(id => this.find(id).el.group).filter(Boolean))];
      for (const gid of gids) hit.push(...this.members(gid));
      this.sel = [...new Set([...d.base, ...hit])];
      this.selGroup = gids.length === 1 && this.sel.every(id => this.find(id).el.group === gids[0]) ? gids[0] : null;
      this.inGroup = null;
      const mq = this.root.querySelector('.ke-marquee'), px = v => (v * this.W) / 100;
      mq.hidden = false;
      mq.setAttribute('style', `left:${px(m.l)}px;top:${px(m.t)}px;width:${px(m.r - m.l)}px;height:${px(m.b - m.t)}px`);
      this.positionSel();
    }
    onDbl(e) {
      const node = e.target.closest('.sm-btn, .sm-graphic, .sm-text-el, .sm-display, .sm-embed');
      const id = node && this.nodeId(node);
      const f = id && this.find(id);
      if (f?.el.group) { this.selectOnly([id], null, f.el.group); this.renderAll(); }
    }

    // ---------- Tastatur ----------
    onKey(e) {
      const tag = e.target.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.target.isContentEditable) return;
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      let done = true;
      if (mod && k === 'z' && !e.shiftKey) this.undo();
      else if (mod && (k === 'y' || k === 'z')) this.redo();
      else if (mod && k === 'c') this.copy(false);
      else if (mod && k === 'x') this.copy(true);
      else if (mod && k === 'v') this.paste();
      else if (mod && k === 'd') this.duplicate();
      else if (mod && k === 'a') { const ids = this.page.layers.filter(id => this.geom(id) && !this.find(id).el.locked); this.selectOnly(ids); this.renderAll(); }
      else if (mod && k === 'g') { if (e.shiftKey) this.ungroupSel(); else this.groupSel(); }
      else if (mod && k === 'pageup') this.arrange(e.shiftKey ? 'front' : 'fwd');
      else if (mod && k === 'pagedown') this.arrange(e.shiftKey ? 'back' : 'bwd');
      else if (mod && (k === '+' || k === '=')) this.setZoom(this.zoom * 1.25);
      else if (mod && k === '-') this.setZoom(this.zoom * 0.8);
      else if (mod && k === '0') this.setZoom(1);
      else if (k === 'delete' || k === 'backspace') this.remove();
      else if (k === 'escape') {
        if (this.fmt) { this.fmt = null; this.msg = 'Format übertragen abgebrochen'; this.renderCanvas(); this.renderStatus(); }
        else if (this.menu) { this.menu = null; this.renderToolbar(); }
        else { this.selectOnly([]); this.renderAll(); }
      } else if (k.startsWith('arrow') && this.sel.length) {
        // wie beim Ziehen: ein Raster, mit Shift ein Feinraster
        const st = e.shiftKey ? (this.page.fineGridSize ?? SM_DEFAULT_FINE_GRID_SIZE) : (this.page.gridSize ?? SM_DEFAULT_GRID_SIZE);
        const [mx, my] = { arrowleft: [-st, 0], arrowright: [st, 0], arrowup: [0, -st], arrowdown: [0, st] }[k];
        this.change(() => { for (const id of this.sel) { const b = this.box(id); if (b && !this.find(id).el.locked) this.setGeom(id, this.fromBox(id, { ...b, l: b.l + mx, t: b.t + my })); } });
      } else done = false;
      if (done) e.preventDefault();
    }

    // ---------- Elemente anlegen / löschen / kopieren ----------
    blank(kind, extra = {}) {
      const base = { id: newId(PREFIX[kind]), x: 50, y: 50, show: 'immer', name: null, group: null, locked: false };
      if (kind === 'button') return { ...base, shape: 'circle', size: 10, heightSize: null, cornerRadius: null, rotation: 0, label: 'Taste', icon: null, fontSize: 1.6, color: null, functionId: null, quickActions: null, quickActionsDurationSeconds: null, stateSource: null, ...extra };
      if (kind === 'graphic') return { ...base, width: 15, height: 15, rotation: 0, src: null, keepRatio: true, ...extra };
      if (kind === 'text') return { ...base, width: 25, text: 'Text', fontSize: 3, color: null, rotation: 0, ...extra };
      if (kind === 'display') return { ...base, width: 20, height: 10, value: 'speed', type: 'zahl', range: 'auto', min: null, max: null, warn: 0, dec: 0, alignH: 'links', alignV: 'mitte', functionId: null, quickActions: null, quickActionsDurationSeconds: null, ...extra };
      return { ...base, width: 30, height: 22, baustein: 'karte', opts: {}, ...extra };
    }
    // Neues Element in die Mitte der Fläche, vorne; in anderen Formen mit eigener Anordnung erst einmal ausgeblendet
    add(kind, extra = {}) {
      this.menu = null;
      const el = this.blank(kind, extra);
      this.change(() => {
        this.page[KINDS[kind]].push(el);
        this.page.layers.push(el.id);
        if (this.form !== '2x3' && this.isOwn()) this.setGeom(el.id, { x: 50, y: 50 });
        this.selectOnly([el.id]);
      }, `${KIND_NAMES[kind]} hinzugefügt`);
    }
    async addDisplay(presetIndex) {
      this.menu = null;
      const A = window.anzeigen;
      let value, type;
      if (presetIndex != null) [, type, value] = A.PRESETS[presetIndex];
      else {
        this.renderToolbar();
        value = await A.pick({ title: 'Spielwert für die Anzeige' });
        if (!value) return;
        type = A.fitType(value, 'balken');
      }
      const [width, height] = A.SIZES?.[type] || [20, 10];
      this.add('display', { value, type, width, height });
    }
    remove(msg) {
      if (!this.sel.length) return;
      const ids = new Set(this.sel);
      this.change(() => {
        for (const key of Object.values(KINDS)) this.page[key] = this.page[key].filter(e => !ids.has(e.id));
        this.page.layers = this.page.layers.filter(id => !ids.has(id));
        for (const v of Object.values(this.page.varianten || {})) for (const id of ids) delete v[id];
        this.selectOnly([]);
      }, msg || `${ids.size} ${ids.size === 1 ? 'Element' : 'Elemente'} gelöscht`);
    }
    // Zwischenablage im Browser (bleibt beim Wechsel zwischen Kacheln): Elemente samt Funktion, Aussehen, Gruppe und
    // Lage in allen Kachelformen
    clipOf(ids) {
      const order = this.page.layers.filter(id => ids.includes(id));
      const lays = {};
      for (const [form, v] of Object.entries(this.page.varianten || {})) { lays[form] = {}; for (const id of order) if (v[id]) lays[form][id] = clone(v[id]); }
      const groups = {};
      for (const id of order) { const g = this.find(id).el.group; if (g) groups[g] = clone(this.page.groups[g] || { name: 'Gruppe' }); }
      return { from: this.pageId, items: order.map(id => ({ kind: this.find(id).kind, el: clone(this.find(id).el) })), lays, groups, pastes: 0 };
    }
    readClip() { try { return JSON.parse(localStorage.getItem(CLIP_KEY) || 'null'); } catch { return null; } }
    writeClip(c) { try { localStorage.setItem(CLIP_KEY, JSON.stringify(c)); } catch { /* privat/gesperrt */ } }
    copy(cut) {
      if (!this.sel.length) return;
      const c = this.clipOf(this.sel);
      if (cut) c.pastes = -1;
      this.writeClip(c);
      const what = `${this.sel.length} ${this.sel.length === 1 ? 'Element' : 'Elemente'}`;
      if (cut) this.remove(`${what} ausgeschnitten`);
      else { this.msg = `${what} kopiert`; this.renderToolbar(); this.renderStatus(); }
    }
    paste() {
      const c = this.readClip();
      if (!c?.items?.length) return;
      c.pastes = (c.pastes || 0) + 1;
      this.writeClip(c);
      this.pasteFrom(c, 'eingefügt', c.from === this.pageId);
    }
    duplicate() { if (this.sel.length) this.pasteFrom({ ...this.clipOf(this.sel), pastes: 1 }, 'dupliziert', true); }
    // In derselben Kachel um ein Raster versetzt, in einer anderen an derselben Stelle (nach Ausschneiden zuerst auch)
    pasteFrom(c, verb, samePage) {
      const st = this.page.gridSize ?? SM_DEFAULT_GRID_SIZE;
      const off = samePage ? Math.max(0, c.pastes) * st : 0;
      const idMap = {}, gMap = {};
      for (const gid of Object.keys(c.groups || {})) gMap[gid] = newId('grp');
      const newIds = [];
      this.change(() => {
        for (const gid of Object.keys(gMap)) this.page.groups[gMap[gid]] = { name: (c.groups[gid].name || 'Gruppe') + (off ? ' (Kopie)' : '') };
        for (const { kind, el } of c.items) {
          const nid = newId(PREFIX[kind]);
          idMap[el.id] = nid;
          const copy = { ...clone(el), id: nid, group: el.group ? gMap[el.group] : null, locked: false };
          copy.x = r2(copy.x + off);
          copy.y = r2(copy.y + off * SM_CANVAS_ASPECT);
          this.page[KINDS[kind]].push(copy);
          this.page.layers.push(nid);
          newIds.push(nid);
        }
        for (const [form, lay] of Object.entries(c.lays || {})) {
          if (!samePage || !this.page.varianten?.[form]) continue;
          for (const [id, g] of Object.entries(lay)) {
            if (!idMap[id]) continue;
            const a = g.a || r2(this.aspect(form));
            this.page.varianten[form][idMap[id]] = g.hidden ? { ...g } : { ...g, x: r2(g.x + off), y: r2(g.y + off * a) };
          }
        }
        if (this.form !== '2x3' && this.isOwn()) for (const nid of newIds) if (!this.page.varianten[this.form][nid]) this.setGeom(nid, {});
        const gids = [...new Set(Object.values(gMap))];
        const whole = gids.length === 1 && newIds.every(id => this.find(id).el.group === gids[0]) ? gids[0] : null;
        this.selectOnly(newIds, whole);
      }, `${c.items.length} ${c.items.length === 1 ? 'Element' : 'Elemente'} ${verb}`);
    }

    // ---------- Gruppen und Ebenen ----------
    groupSel() {
      if (this.sel.length < 2 || this.selGroup) return;
      const gid = newId('grp');
      const sel = new Set(this.sel);
      this.change(() => {
        const L = this.page.layers;
        const top = Math.max(...L.map((id, i) => (sel.has(id) ? i : -1)));
        const at = L.slice(0, top).filter(id => !sel.has(id)).length;
        const mem = L.filter(id => sel.has(id)), rest = L.filter(id => !sel.has(id));
        rest.splice(at, 0, ...mem);
        this.page.layers = rest;
        for (const id of mem) this.find(id).el.group = gid;
        this.page.groups[gid] = { name: `Gruppe ${Object.keys(this.page.groups).length + 1}` };
        this.selectOnly(mem, gid);
      }, 'Gruppiert');
    }
    ungroupSel() {
      const gid = this.selGroup;
      if (!gid) return;
      this.change(() => {
        for (const id of this.members(gid)) this.find(id).el.group = null;
        delete this.page.groups[gid];
        this.selGroup = null;
      }, 'Gruppierung aufgehoben');
    }
    leaveGroup() {
      const one = this.single();
      if (!one?.el.group) return;
      const gid = one.el.group;
      this.change(() => {
        const mem = this.members(gid);
        const L = this.page.layers.filter(id => id !== one.el.id);
        const idx = Math.max(...mem.filter(id => id !== one.el.id).map(id => L.indexOf(id))) + 1;
        L.splice(idx, 0, one.el.id);
        this.page.layers = L;
        one.el.group = null;
        this.inGroup = null;
      }, 'Aus der Gruppe gelöst');
    }
    arrange(op) {
      if (!this.sel.length) return;
      const sel = new Set(this.sel);
      const move = (items, isSel) => {
        const a = [...items];
        if (op === 'front') return [...a.filter(x => !isSel(x)), ...a.filter(isSel)];
        if (op === 'back') return [...a.filter(isSel), ...a.filter(x => !isSel(x))];
        if (op === 'fwd') for (let i = a.length - 2; i >= 0; i--) if (isSel(a[i]) && !isSel(a[i + 1])) [a[i], a[i + 1]] = [a[i + 1], a[i]];
        if (op === 'bwd') for (let i = 1; i < a.length; i++) if (isSel(a[i]) && !isSel(a[i - 1])) [a[i], a[i - 1]] = [a[i - 1], a[i]];
        return a;
      };
      const one = this.single();
      this.change(() => {
        if (one && one.el.group && this.inGroup === one.el.group) {
          const mem = this.members(one.el.group), start = this.page.layers.indexOf(mem[0]);
          this.page.layers.splice(start, mem.length, ...move(mem, id => sel.has(id)));
        } else {
          this.page.layers = move(this.units(), u => u.ids.some(id => sel.has(id))).flatMap(u => u.ids);
        }
      });
    }
    // Ebenen-Liste: auf ein Gruppenelement = in die Gruppe, auf den Gruppenkopf = vor/hinter die Gruppe
    dropOn(tKey, pos) {
      const mKey = this.dnd;
      this.dnd = null;
      if (!mKey || mKey === tKey) return;
      const mGroup = mKey.startsWith('g:') ? mKey.slice(2) : null;
      const moving = mGroup ? this.members(mGroup) : [mKey];
      const tHead = tKey.startsWith('g:');
      const tGroup = tHead ? tKey.slice(2) : this.find(tKey)?.el.group || null;
      if (moving.includes(tKey) || (mGroup && tGroup === mGroup)) return;
      this.change(() => {
        const anchor = tHead || (mGroup && tGroup) ? this.members(tGroup) : [tKey];
        const L = this.page.layers.filter(id => !moving.includes(id));
        const idx = anchor.map(id => L.indexOf(id));
        const at = pos === 'above' ? Math.max(...idx) + 1 : Math.min(...idx);
        L.splice(at, 0, ...moving);
        this.page.layers = L;
        if (!mGroup) this.find(mKey).el.group = !tHead && tGroup ? tGroup : null;
      });
    }
    async rename(key) {
      if (key.startsWith('g:')) {
        const gid = key.slice(2);
        const name = await uiPrompt('Name der Gruppe:', this.page.groups[gid]?.name || '', { title: 'Gruppe umbenennen', ok: 'Umbenennen' });
        if (name != null) this.change(() => { this.page.groups[gid] = { name: name.trim().slice(0, 40) || 'Gruppe' }; });
        return;
      }
      const f = this.find(key);
      if (!f) return;
      const name = await uiPrompt('Name in den Ebenen (leer = automatisch nach Beschriftung bzw. Wert):', f.el.name || '', { title: 'Element umbenennen', ok: 'Umbenennen' });
      if (name != null) this.change(() => { f.el.name = name.trim() ? name.trim().slice(0, 40) : null; });
    }

    // Format übertragen: Form, Ecken, Farbe und Schriftgröße auf das angeklickte Element bzw. die ganze Gruppe
    applyFmt(id) {
      const src = this.find(this.fmt.from);
      this.fmt = null;
      if (!src) return this.renderAll();
      const t = this.find(id);
      const targets = t.el.group && this.inGroup !== t.el.group ? this.members(t.el.group) : [id];
      const fs = (this.geom(src.el.id) || src.el).fontSize;
      this.change(() => {
        for (const tid of targets) {
          const f = this.find(tid);
          if (tid === src.el.id || !(f.kind === 'button' || f.kind === 'text')) continue;
          if (f.kind === 'button' && src.kind === 'button') { f.el.shape = src.el.shape; f.el.cornerRadius = src.el.cornerRadius; if (src.el.shape !== 'square') f.el.heightSize = null; }
          f.el.color = src.el.color;
          if (fs) this.setGeom(tid, { fontSize: fs });
        }
      }, `Format von „${this.nameOf(src.el.id)}“ übertragen`);
    }

    // ---------- Auswahlfenster ----------
    pickAction(one) {
      if (!one) return;
      const o = one.el;
      window.actionPicker.open(
        { functionId: o.functionId, quickActions: o.quickActions, durationSeconds: o.quickActionsDurationSeconds },
        { includeMacros: true, allowClear: one.kind === 'display', contextLabel: one.kind === 'display' ? 'Anzeige antippen' : undefined },
        result => this.change(() => {
          Object.assign(o, { functionId: null, quickActions: null, quickActionsDurationSeconds: null });
          if (result.mode === 'function') { sm().functionsCache?.set(result.functionId, result.label); o.functionId = result.functionId; }
          else if (result.mode !== 'clear') { o.quickActions = result.quickActions; if (result.mode === 'axis') o.quickActionsDurationSeconds = result.durationSeconds; }
        })
      );
    }
    async pickState(one) {
      const id = await window.anzeigen.pick({ title: 'Zustand für die Taste', current: one.el.stateSource, none: 'Keinen Zustand zeigen' });
      if (id !== undefined) this.change(() => { one.el.stateSource = id; });
    }
    async pickValue(one) {
      const value = await window.anzeigen.pick({ title: 'Wert auswählen', current: one.el.value });
      if (value) this.change(() => { Object.assign(one.el, { value, type: window.anzeigen.fitType(value, one.el.type), range: 'auto' }); });
    }
    pickIcon(one, trigger) {
      const content = `<div class="sm-popover-grid">
          <button type="button" class="sm-icon-swatch none ${!one.el.icon ? 'active' : ''}" data-icon="" title="Text statt Piktogramm">Aa</button>
          ${Object.keys(SM_ICON_DEFS).map(id => `<button type="button" class="sm-icon-swatch ${one.el.icon === id ? 'active' : ''}" data-icon="${id}" title="${esc(SM_ICON_DEFS[id].label)}">${smIconSvg(id)}</button>`).join('')}
        </div>`;
      sm().openPopover(trigger, content, 'sm-icon-popover');
      const pop = document.querySelector('.sm-popover.sm-icon-popover');
      pop?.addEventListener('click', e => {
        const b = e.target.closest('[data-icon]');
        if (!b) return;
        sm().closeAllPopovers();
        this.change(() => { one.el.icon = b.dataset.icon || null; });
      });
    }
    async pickEmbedType(one) {
      const baustein = await sm().chooseEmbedBaustein('Anderen Inhalt wählen');
      if (baustein) this.change(() => { one.el.baustein = baustein; one.el.opts = {}; });
    }
    async pickModule(one, slot) {
      const mods = window.moduleFlow?.modules || [];
      if (!mods.length) return;
      const id = await uiChoice(`Welches Modul auf Platz ${slot + 1}?`, mods.map(m => ({ label: m.name, value: m.id })), { title: 'Steuerungsübersicht' });
      if (!id) return;
      const order = sm().steuerungOrder(one.el);
      const j = order.indexOf(id);
      if (j >= 0) order[j] = order[slot];
      order[slot] = id;
      this.change(() => { one.el.opts = { ...(one.el.opts || {}), mods: order }; });
    }
    // Bilder: erst speichern (das Element muss auf dem Server bestehen), dann hochladen
    upload(what) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png,image/jpeg,image/webp';
      input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        const one = this.single();
        await this.flushSave();
        const url = what === 'bg' ? `/api/steuerungsmenue/${this.pageId}/background` : `/api/steuerungsmenue/${this.pageId}/graphic/${one?.el.id}/image`;
        try {
          const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': file.type }, body: await file.arrayBuffer() });
          const data = await res.json();
          if (!data.success) throw new Error(data.error);
          if (what === 'bg') { this.page.background = data.page?.background || data.background || this.page.background; window.bustInvalidate?.(this.page.background); }
          else if (one) { one.el.src = data.graphic?.src || one.el.src; window.bustInvalidate?.(one.el.src); }
          if (data.page) this.adopt(data.page);
          this.renderAll();
        } catch (e) { uiAlert('Bild-Upload fehlgeschlagen: ' + e.message); }
      };
      input.click();
    }
    async removeBackground() {
      try {
        const res = await fetch(`/api/steuerungsmenue/${this.pageId}/background`, { method: 'DELETE' });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        this.page.background = null;
        if (data.page) this.adopt(data.page);
        this.renderAll();
      } catch (e) { uiAlert('Entfernen fehlgeschlagen: ' + e.message); }
    }
    async renameTile(name) {
      if (!name.trim()) return this.renderInspector();
      try {
        const res = await fetch(`/api/steuerungsmenue/${this.pageId}/name`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        this.page.name = name.trim();
        if (data.page) this.adopt(data.page);
        window.appNav?.renderBar();
      } catch (e) { uiAlert('Umbenennen fehlgeschlagen: ' + e.message); }
    }
  }

  window.kachelEditor = new KachelEditor();
})();
