/**
 * Kachelseiten als Startseite (Umsetzungsplan Paket H, 22.10.2026; Mockup Bild 1).
 * Speicherung je Spiel über server/kachelnManager.js (GET/PUT /api/kacheln), Rasterlogik in tileGrid.js.
 *
 * - Die Startseite läuft immer im Vollbild (body.home-mode). Seiten wechseln, Seiten verwalten, Einrichten und
 *   „+ Neue Seite“ sitzen seit dem Mockup „Navigation und Seiten“ (22.10.2026) im Umschalter der Kopfleiste
 *   (appNav.js); alle anderen Seiten der App erreicht man über ☰ Menü, ⌂ führt zurück.
 * - Raster 2 Zeilen × 3 Spalten, je Feld eine Kachel; gleiche nebeneinander bilden eine große Kachel.
 *   („Bausteine“ heißen seit 22.10.2026 abends in der Oberfläche „Kacheln“, Hendrik: sie sind genau das.)
 * - Tippen in eine Kachel = Inhalt im Vollbild, das Zahnrad = Kachel-Einstellungen (gehören zur Seite).
 * - Standardseiten gelten für alle Profile, Profilseiten nur für die genannten -- sie wechseln mit dem Profil.
 * - Die feste Kachel Karte LEIHT sich ihre Seite (der Inhalt wandert in die Kachel und zurück), deshalb nur einmal pro
 *   Seite. Alle anderen sind eigene Kacheln (steuerungsmenues.js, Kachel-Typ panel:<id>), auch Cockpit, Fahrzeug,
 *   Werte, Arbeitsplaner … aus den Vorlagen (server/bausteinVorlagen.js).
 * - Keine Automatik mehr (Test 23.10.2026, Hendrik: „Seite folgt der Situation“ macht es nur kompliziert, man
 *   wechselt schnell selbst). Jedes Gerät merkt sich seine zuletzt gewählte Seite (localStorage tiles.currentId), ⌂
 *   führt dorthin zurück. „Seiten verwalten“ (Liste aller Seiten) ersetzt den Automatik-Schalter im Umschalter.
 * - Tastenleiste (Mockup „Navigation und Seiten“, 22.10.2026): jede Kachel außer Tastenfeldern kann bis zu
 *   4 Tasten unten oder rechts tragen -- Aktion wie eine Tastenfeld-Taste, Zustand aus der Werteliste lässt
 *   sie leuchten. Gespeichert in den Kachel-Einstellungen (keys, keyPos), ausgelöst serverseitig
 *   (socket 'tile-key-down'/'tile-key-up', s. server/kachelnManager.js findKey()).
 */
(function () {
  const G = window.TileGrid;

  // Feste Kachel (Hendrik 22.10.2026 abends: nur noch die Karte, „Bausteine“ heißen jetzt „Kacheln“): leiht sich den
  // Inhalt ihrer Seite (tab = Tab-ID), deshalb nur einmal je Seite. Alles andere sind eigene Kacheln (steuerungsmenues.js),
  // auch die früher festen wie Cockpit oder der Arbeitsplaner -- die legt der Server als Vorlagen an (server/bausteinVorlagen.js).
  // interactive: Inhalt ist selbst bedienbar -- dann öffnet nur der Titel das Vollbild, nicht die ganze Fläche.
  const BORROWED = {
    karte: { name: 'Karte', tab: 'dashboard-map', feature: 'map' }
  };
  // Fertige Inhalte als Element in eigenen Kacheln, mehrfach nutzbar: Listen (Vorlagen „Geräte“, „Steuerungsübersicht“)
  // und die Teile des Arbeitsplaners (planner.js elementHtml(), Vorlage „Arbeitsplaner“)
  const OWN = {
    geraete: { name: 'Geräteliste', feature: 'telemetry' },
    steuerung: { name: 'Steuerungsübersicht' },
    'planer-aktuell': { name: 'Planer: Feld in Arbeit', feature: 'planner' },
    'planer-naechstes': { name: 'Planer: Als Nächstes', feature: 'planner' },
    'planer-felder': { name: 'Planer: Feldliste', feature: 'planner' }
  };
  // Auswahl beim Einrichten: eine Liste aus allen Kacheln (Karte + eigene)
  const CATALOG = [
    ['Kacheln', 'all'],
    ['Platz leeren', ['']]
  ];
  // Steuerungsübersicht: Standard-Reihenfolge der Module (Rundgang um die Armlehne). Gezeigt werden seit den
  // Geräteprofilen (23.10.2026) nur Module des aktiven Controllers, in dessen Reihenfolge (s. steuerungHtml()).
  const ST_ORDER = ['craftslot1', 'einschub1', 'fingertip', 'craftslot2', 'einschub2', 'bedienteil'];
  // Standardwerte der Kachel-Einstellungen (Karte) bzw. der Listen-Elemente
  const DEFAULTS = {
    karte: { north: false, tilt: false, cov: true, color: 'blau', sym: 'traktor', ahead: 'vg', btns: true },   // Kartentasten ab Werk an (24.10.2026)
    steuerung: { count: 'auto', mods: ST_ORDER },
    geraete: { fills: true, details: false },
    'planer-felder': { group: 'komplex', filter: 'alle', sort: 'arbeit', alle: false }
  };
  const MAX_KEYS = 4;
  const KEY_POS = [['unten', 'Unten'], ['rechts', 'Rechts'], ['aus', 'Keine Tasten']];
  const SMOOTH_INFO = {
    aus: 'Aus: genau wie vom Spiel gemeldet, kann aber zittern.',
    wenig: 'Wenig: leicht beruhigt, folgt fast ohne Verzögerung.',
    mittel: 'Mittel: ruhiger, folgt etwas verzögert.',
    stark: 'Stark: sehr ruhig, hängt in Kurven sichtbar nach.'
  };
  // Seitenvorlagen; eigene Bausteine über die festen IDs der Vorlagen (fehlt einer, bleibt das Feld leer).
  // Feld und Transport wie die Kachelseiten ab Werk (vorgaben/kacheln/fs25.json, von Hendrik am 24.10.2026 gestaltet);
  // „Ernte“ entfernt (Hendrik 25.10.2026: „Ne, kann weg.“)
  const TEMPLATES = {
    feld: { name: 'Feld', cells: ['panel:sm-v-cockpit', 'karte', 'karte', 'panel:sm-v-steuerung', 'panel:sm-v-geraete', 'panel:sm-v-planer'],
      settings: { karte: { north: false, tilt: false, cov: true, color: 'blau', sym: 'traktor', ahead: 'vg', btns: true } } },
    strasse: { name: 'Transport', cells: ['panel:sm-v-cockpit', 'panel:sm-v-steuerung', 'panel:sm-v-planer', 'panel:sm-v-cockpit', 'panel:sm-v-geraete', 'panel:sm-v-strecke'] },
    leer: { name: 'Neue Seite', cells: ['', '', '', '', '', ''] }
  };
  // ☰ Menü: alle übrigen Seiten der App, gegliedert wie im Mockup (tab = Tab-ID, section = Bereich)
  // Menü (☰) mit Untermenüs: appNav.js (Menüführung ohne Seitenleiste, Hendrik 22.10.2026)

  function fmt(v, digits) {
    return typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '–';
  }
  function esc(s) { return escapeHtml(s); }   // js/basis.js
  const readLS = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
  const writeLS = (k, v) => { try { localStorage.setItem(k, v); } catch { /* egal */ } };
  const clone = o => JSON.parse(JSON.stringify(o));

  // ---------- Listen-Elemente ----------
  // Geräte in Lage am Fahrzeug: vorne oben (äußerstes zuerst), Fahrzeug in der Mitte, hinten nach unten in Kettenfolge
  function rigHtml(d, s) {
    if (!d?.available) return `<div class="tile-empty">Keine Spieldaten</div>`;
    if (!d.inVehicle) return `<div class="tile-empty">Kein Fahrzeug</div>`;
    const units = Array.isArray(d.units) ? d.units : [];
    const front = units.filter(u => u.side === 'front').sort((a, b) => (b.depth || 0) - (a.depth || 0));
    const rear = units.filter(u => u.side === 'rear').sort((a, b) => (a.depth || 0) - (b.depth || 0));
    const self = units.find(u => u.side === 'self');
    const state = u => {
      const parts = [];
      if (u.lowered === true) parts.push('gesenkt'); else if (u.lowered === false && u.canLower) parts.push('angehoben');
      if (u.on === true) parts.push('eingeschaltet');
      if (u.folding) parts.push('klappt …'); else if (u.unfolded === false) parts.push('eingeklappt');
      if (s.details && u.width > 0) parts.push(`${fmt(u.width, 2)} m`);
      if (s.details && u.pto > 0) parts.push(`Zapfwelle ${fmt(u.pto, 0)} U/min`);
      if (s.fills !== false) for (const f of u.fills || []) {
        if (f.capacity > 0) parts.push(`${esc(f.name || 'Füllung')} ${fmt(f.level, 0)} / ${fmt(f.capacity, 0)}`);
      }
      return parts.join(' · ');
    };
    const row = (name, side, st, cls = '') => `<div class="rig-row ${cls}"><div><b>${esc(name)}</b> · <span class="rig-side">${side}</span></div>${st ? `<div class="rig-state">${st}</div>` : ''}</div>`;
    const sideLabel = (list, u, word) => word + (list.length > 1 ? ` · ${list.indexOf(u) + 1}.` : '');
    const frontRows = front.map(u => row(u.name, sideLabel([...front].reverse(), u, 'vorne'), state(u), u.lowered || u.on ? 'on' : ''));
    const rearRows = rear.map(u => row(u.name, sideLabel(rear, u, 'hinten'), state(u), u.lowered || u.on ? 'on' : ''));
    const veh = row(d.vehicleName || 'Fahrzeug', 'Fahrzeug', self ? state(self) : '', 'rig-vehicle');
    return `<div class="rig"><div class="rig-dir">↑ Fahrtrichtung</div>${frontRows.join('')}${veh}${rearRows.join('')}${!front.length && !rear.length ? '<div class="tile-empty tile-empty--small">Keine Anbaugeräte</div>' : ''}</div>`;
  }

  class TilePages {
    constructor() {
      this.config = { version: 2, pages: [] };
      this.currentId = readLS('tiles.currentId', '');
      this.profile = null;
      this.profiles = [];
      this.home = false;
      this.editing = false;
      this.editCell = 0;
      this.full = null;              // Baustein im Vollbild
      this.sheet = null;             // Baustein, dessen Einstellungen offen sind
      this.sheetKey = null;          // Tastenleiste: welche Taste gerade eingerichtet wird
      this.actionNames = null;       // Funktions-/Makro-Namen für die Tastenleiste (beim Öffnen der Einstellungen geladen)
      this.covConfirm = false;
      this.menuOpen = false;
      this.manage = false;           // „Seiten verwalten“ offen
      this.borrowed = [];            // { tabEl, nodes, type, owner } -- owner: eigener Baustein, der ein Element damit füllt
      this.ownSlots = [];            // { el, type }
      this.embedSlots = [];          // eigene Bausteine (Fahrzeug, Werte …) als Element in eigenen Bausteinen: { el, type, owner, tile }
      this.stLabels = {};            // Steuerungskachel: Tastennummer -> Funktionsname
      this.lastTelemetry = null;
      this.body = document.getElementById('tiles-body');
      this.socket = window.hubSocket;   // gemeinsame Verbindung der Seite (hubSocket.js, B4)
      this.socket.on('telemetry-update', d => this.onTelemetry(d));
      this.socket.on('kacheln-changed', cfg => { if (!this.editing) { this.config = cfg; this.renderIfVisible(); } });
      this.socket.on('profileChanged', p => this.onProfile(p?.name));
      this.socket.on('tiles-command', c => this.onCommand(c));
      // Nach einem Verbindungsabbruch (WLAN) den Stand neu holen -- sonst schickte die nächste Kleinigkeit (z. B. im
      // Zahnrad) den alten Stand aller Seiten zurück und überschrieb Änderungen anderer Geräte (23.10.2026)
      this.socket.on('connect', () => { if (this.loaded) this.reload(); });
      document.addEventListener('tabchanged', e => {
        if (e.detail?.tabName === 'dashboard-tiles') { if (!this.home) this.enterHome(true); else this.render(); }
        else if (this.home) this.leaveHome();
      });
      this.setupSwipe();
      this.body?.addEventListener('pointerdown', e => this.keyDown(e));
      window.addEventListener('resize', () => this.updateEmbedSlots());   // Anzahl Module hängt an der Größe
      // Andere Modul-Auswahl am Controller (Geräteprofile, 23.10.2026): Modulbilder und Beschriftungen neu laden
      document.addEventListener('controllerinfo', () => { this.stLayouts = null; if (this.loaded) setTimeout(() => this.loadSteuerungLabels(), 300); });
      this.load();
    }

    get pages() { return this.config.pages; }
    get visiblePages() { return this.editing ? this.pages : G.pagesFor(this.pages, this.profile); }
    get page() { return this.visiblePages.find(p => p.id === this.currentId) || this.visiblePages[0] || null; }
    get visible() { return document.getElementById('tab-dashboard-tiles')?.classList.contains('active'); }
    renderIfVisible() { if (this.visible) this.render(); }
    features() { return new Set(window.gameSwitcher?.activeGame?.features || []); }

    async load() {
      await this.reload();
      this.loadSteuerungLabels();
      this.enterHome();
    }

    // loaded: nur nach erfolgreichem Laden wird gespeichert -- sonst überschrieb ein leerer Stand alle Seiten
    async reload() {
      try {
        const [kRes, pRes] = await Promise.all([fetch('/api/kacheln').then(r => r.json()), fetch('/api/profiles').then(r => r.json())]);
        if (!kRes.success) throw new Error(kRes.error || 'Antwort ohne Daten');
        if (!this.editing) this.config = kRes.config;
        this.profiles = (pRes.profiles || []).map(p => p.name);
        this.profile = pRes.current || null;
        // Beim ersten Laden mit der Hauptseite des Profils beginnen (falls eine gesetzt ist)
        if (!this.loaded && !this.editing) { const h = G.hauptseite(this.pages, this.profile); if (h) this.currentId = h.id; }
        this.loaded = true;
        if (this.home) this.renderIfVisible();
      } catch (e) {
        console.warn('Kachelseiten nicht ladbar:', e);
      }
    }

    async save() {
      if (!this.loaded) throw new Error('Die Kachelseiten konnten nicht geladen werden – bitte die Seite neu laden.');
      const res = await fetch('/api/kacheln', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: this.config }) });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      this.config = data.config;
    }
    saveSoon() {
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => this.save().catch(e => uiAlert('Speichern fehlgeschlagen: ' + e.message)), 400);
    }

    // ---------- Startseite an/aus ----------
    async enterHome(fromTab) {
      this.home = true;
      document.body.classList.add('home-mode');
      if (!fromTab && !this.visible) { await window.app?.navigateToTab('dashboard-tiles'); return; } // tabchanged rendert
      this.render();
      setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    }

    leaveHome() {
      this.home = false;
      this.full = null; this.sheet = null; this.menuOpen = false; this.manage = false;
      if (this.editing) { this.editing = false; this.saveSoon(); }
      document.body.classList.remove('home-mode');
      this.returnBorrowed();
      this.renderBar();
      setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    }

    onProfile(name) {
      if (!name || name === this.profile) return;
      this.profile = name;
      this.loadSteuerungLabels();
      // Hauptseite des Profils, sonst bleibt die Seite, wenn sie auch zum neuen Profil gehört, sonst die erste
      const h = !this.editing && G.hauptseite(this.pages, name);
      if (h) this.currentId = h.id;
      else if (!this.editing && !G.pagesFor(this.pages, name).some(p => p.id === this.currentId)) {
        const t = G.pagesFor(this.pages, name)[0];
        if (t) this.currentId = t.id;
      }
      if (this.home) this.render();
    }

    // ---------- Kacheln ----------
    moduleName(id) {
      if (!id) return 'Leer';
      if (id.startsWith('panel:')) return (window.steuerungsmenues?.pages || []).find(p => p.id === id.slice(6))?.name || '(Kachel fehlt)';
      return (OWN[id] || BORROWED[id])?.name || id;
    }
    moduleAvailable(id) {
      const def = OWN[id] || BORROWED[id];
      return !def?.feature || this.features().has(def.feature);
    }
    settingsOf(page, type) {
      const key = type.startsWith('panel:') ? 'panel' : type;
      return { ...(DEFAULTS[key] || {}), ...((page?.settings || {})[key] || {}) };
    }
    setSetting(type, patch) {
      const p = this.page;
      if (!p) return;
      p.settings = p.settings || {};
      p.settings[type] = { ...this.settingsOf(p, type), ...patch };
      if (type === 'karte' && this.borrowed.some(b => b.type === 'karte')) window.dashboardMapView?.applyTileSettings(p.settings.karte, { ansicht: 'north' in patch || 'tilt' in patch });
      this.saveSoon();
      this.render();
    }

    // ---------- Anzeige ----------
    render() {
      this.returnBorrowed();
      this.renderBar();
      if (!this.body) return;
      if (!this.pages.length && !this.editing) { this.renderStart(); return; }
      const p = this.page;
      if (!p) { this.renderNoPage(); return; }
      if (this.page.id !== this.currentId) this.currentId = p.id;
      const { tiles, bad } = G.merge(p.cells);
      this.tiles = tiles;
      const grid = this.editing ? this.editorGridHtml(p, tiles) : this.gridHtml(tiles);
      // Scroll-Stand der Seitenleisten merken (Test 23.10.2026, Hendrik: „Das Menü für die Kacheleinstellungen scrollt
      // immer nach oben, sobald man etwas gedrückt hat“) -- render() baut alles neu
      const SCROLLER = ['.tile-sheet', '.edit-panel', '.pm-list'];
      const scroll = SCROLLER.map(sel => this.body.querySelector(sel)?.scrollTop || 0);
      this.body.innerHTML = `
        <div class="home ${this.editing ? 'home--edit' : ''}">
          ${grid}
          ${this.editing ? this.editorPanelHtml(p, bad) : ''}
          ${this.full ? this.fullHtml() : ''}
          ${this.sheet ? this.sheetHtml() : ''}
          ${this.manage ? this.manageHtml() : ''}
        </div>`;
      SCROLLER.forEach((sel, i) => { const el = this.body.querySelector(sel); if (el && scroll[i]) el.scrollTop = scroll[i]; });
      if (!this.editing) this.mountTiles(p);
    }

    renderStart() {
      this.body.innerHTML = `
        <div class="home">
          <div class="tile-start">
            <h3>Noch keine Kachelseite</h3>
            <p>Eine Kachelseite zeigt mehrere Anzeigen nebeneinander – z. B. Fahrzeug und Karte auf dem Feld, Tank und Uhrzeit auf der Straße. Zwischen den Seiten wechselst du oben oder durch Wischen.</p>
            <div class="tile-start-buttons">
              ${Object.entries(TEMPLATES).map(([k, t]) => `<button class="btn-${k === 'leer' ? 'secondary' : 'primary'}" onclick="window.tilePages.addPage('${k}')">${k === 'leer' ? 'Leere Seite' : 'Vorlage „' + t.name + '“'}</button>`).join('')}
            </div>
          </div>
        </div>`;
    }

    renderNoPage() {
      this.body.innerHTML = `
        <div class="home">
          <div class="tile-start">
            <h3>Keine Seite für das Profil „${esc(profilAnzeige(this.profile) || '')}“</h3>
            <p>Alle Kachelseiten gehören zu anderen Profilen. Lege eine Standardseite an oder gib einer Seite beim Bearbeiten „Gilt für: alle Profile“.</p>
            <div class="tile-start-buttons">
              <button class="btn-primary" onclick="window.tilePages.addPage('leer')">Neue Seite</button>
              <button class="btn-secondary" onclick="window.tilePages.edit(true)">Seiten bearbeiten</button>
            </div>
          </div>
        </div>`;
    }

    gridHtml(tiles) {
      return `<div class="home-grid">${tiles.map((t, i) => {
        const pos = `grid-row: ${t.row + 1} / span ${t.rows}; grid-column: ${t.col + 1} / span ${t.cols};`;
        if (!t.type) return `<button type="button" class="tile tile--empty" style="${pos}" onclick="window.tilePages.edit(true, ${t.cells[0]})"><span>Leer · Seite bearbeiten</span></button>`;
        const def = BORROWED[t.type];
        const interactive = t.type.startsWith('panel:') || def?.interactive;
        const keys = this.keysHtml(t.type);
        return `
          <div class="tile${t.rows === 1 ? ' tile--short' : ''}${t.rows === 1 && t.cols > 1 ? ' tile--flat' : ''}${keys ? ` tile--keys-${this.keyPos(t.type)}` : ''}" style="${pos}">
            <div class="tile-head">
              <button type="button" class="tile-title" onclick="window.tilePages.openFull(${i})" title="Im Vollbild öffnen">${esc(this.tileTitle(t))}</button>
              <button type="button" class="tile-gear" onclick="window.tilePages.openSheet(${i})" aria-label="Einstellungen der Kachel ${esc(this.moduleName(t.type))}">${navIcon('sliders')}</button>
            </div>
            <div class="tile-body baustein-host" data-tile="${i}" data-form="${t.rows}x${t.cols}"></div>
            ${keys}
            ${interactive ? '' : `<button type="button" class="tile-tap" onclick="window.tilePages.openFull(${i})" aria-label="${esc(this.moduleName(t.type))} im Vollbild"></button>`}
          </div>`;
      }).join('')}</div>`;
    }

    tileTitle(t) {
      if (t.type === 'steuerung') return 'Steuerung · Ebene I';
      return this.moduleName(t.type);
    }

    mountTiles(p) {
      const used = new Set();
      this.ownSlots = [];
      const fullBody = this.body.querySelector('.tile-full-body');
      this.tiles.forEach((t, i) => {
        if (!t.type) return;
        const tileEl = this.body.querySelector(`.tile-body[data-tile="${i}"]`);
        const isFull = this.full === t.type && fullBody;
        const el = isFull ? fullBody : tileEl;
        if (isFull && tileEl) tileEl.innerHTML = `<div class="tile-empty tile-empty--small">im Vollbild</div>`;
        this.mountOne(p, t, el, used);
      });
      // Vollbild für einen Baustein, der (gerade) nicht auf der Seite steht -- z. B. nach einem Wechsel
      if (this.full && fullBody && !this.tiles.some(t => t.type === this.full)) this.mountOne(p, { type: this.full, size: 6, cols: 3, rows: 2 }, fullBody, used);
      this.updateOwn();
    }

    mountOne(p, t, el, used) {
      const id = t.type;
      if (!el) return;
      if (!this.moduleAvailable(id)) { el.innerHTML = `<div class="tile-empty">${esc(this.moduleName(id))} gibt es nur bei Spielen mit Spieldaten</div>`; return; }
      if (OWN[id]) { this.ownSlots.push({ el, type: id, tile: t }); return; }
      if (used.has(id)) { el.innerHTML = `<div class="tile-empty">${esc(this.moduleName(id))} steht schon auf dieser Seite</div>`; return; }
      used.add(id);
      this.lend(id, el, null, p);
    }

    // Den Inhalt einer Seite (Dashboard bzw. eigener Baustein) in el umhängen; zurück über returnBorrowed()/releaseOwner()
    lend(id, el, owner, p) {
      const tab = id.startsWith('panel:') ? id.slice(6) : BORROWED[id]?.tab;
      const tabEl = tab && document.getElementById(`tab-${tab}`);
      if (!tabEl) { el.innerHTML = `<div class="tile-empty">${esc(this.moduleName(id))} nicht gefunden</div>`; return; }
      const nodes = [...tabEl.childNodes];
      nodes.forEach(n => el.appendChild(n));
      this.borrowed.push({ tabEl, nodes, type: id, owner });
      if (id === 'karte') {
        const map = window.dashboardMapView;
        map?.applyTileSettings(this.settingsOf(p, 'karte'));
        map?.setTileMode(this.full === 'karte' && !owner ? 'full' : 'tile');
      }
      if (id.startsWith('panel:')) setTimeout(() => window.steuerungsmenues?.renderPageBody(tab), 0);
    }

    // ---------- Fertige Inhalte als Element in eigenen Kacheln (steuerungsmenues.js, 22.10.2026) ----------
    // Die Karte steht immer nur an einer Stelle -- Kacheln gehen vor (sie werden zuerst gezeichnet, Elemente danach),
    // ein Element zeigt dann einen Hinweis. Listen und Planer-Teile gehen beliebig oft.
    embedTypes() { return [...Object.keys(BORROWED), ...Object.keys(OWN)].map(id => [id, this.moduleName(id)]); }

    mountEmbed(type, el, owner, opts = {}) {
      if (!el || (!OWN[type] && !BORROWED[type])) return;
      el.innerHTML = '';
      if (!this.moduleAvailable(type)) { el.innerHTML = `<div class="tile-empty">${esc(this.moduleName(type))} gibt es nur bei Spielen mit Spieldaten</div>`; return; }
      if (OWN[type]) {
        this.embedSlots.push({ el, type, owner, opts, tile: { size: 4, cols: 2, rows: 2 } });
        this.updateEmbedSlots();
        if (type.startsWith('planer-')) window.plannerPage?.ping();   // misst die Mod schon? sonst jetzt anstoßen
        return;
      }
      if (this.borrowed.some(b => b.type === type)) {
        el.innerHTML = `<div class="tile-empty tile-empty--small">${esc(this.moduleName(type))} ist gerade an anderer Stelle zu sehen</div>`;
        return;
      }
      this.lend(type, el, owner, null);
    }

    releaseOwner(owner) {
      if (!owner) return;
      this.embedSlots = this.embedSlots.filter(s => s.owner !== owner);
      const mine = this.borrowed.filter(b => b.owner === owner);
      if (!mine.length) return;
      this.borrowed = this.borrowed.filter(b => b.owner !== owner);
      for (const { tabEl, nodes, type } of mine) {
        nodes.forEach(n => tabEl.appendChild(n));
        if (type === 'karte') window.dashboardMapView?.setTileMode(null);
      }
      setTimeout(() => { window.dashboardMapView?.resize?.(); window.dispatchEvent(new Event('resize')); }, 30);
    }

    // Listen und Planer-Teile in Elementen: Einstellungen des Elements (embed.opts), live wie die Kacheln
    updateEmbedSlots() {
      if (!this.embedSlots.length) return;
      const d = this.lastTelemetry;
      this.embedSlots = this.embedSlots.filter(s => s.el.isConnected);
      for (const s of this.embedSlots) {
        const st = { ...(DEFAULTS[s.type] || {}), ...(s.opts || {}) };
        if (s.type === 'steuerung') s.tile = this.cellsOf(s.el);
        const html = s.type === 'geraete' ? rigHtml(d, st)
          : s.type === 'steuerung' ? this.steuerungHtml(s, st)
          : window.plannerPage?.elementHtml(s.type, st, s.el) || '';
        if (s.last === html) continue;
        const scroll = s.el.querySelector('.pl-scroll')?.scrollTop || 0;   // gescrollte Feldliste bleibt, wo sie war
        s.el.innerHTML = html;
        s.last = html;
        if (s.type === 'steuerung') this.stListenAnpassen(s.el);
        if (scroll) { const sc = s.el.querySelector('.pl-scroll'); if (sc) sc.scrollTop = scroll; }
      }
    }

    returnBorrowed() {
      const had = this.borrowed.length > 0;
      for (const { tabEl, nodes, type } of this.borrowed) {
        nodes.forEach(n => tabEl.appendChild(n));
        if (type === 'karte') window.dashboardMapView?.setTileMode(null);
      }
      this.borrowed = [];
      this.ownSlots = [];
      this.embedSlots = [];          // Elemente holen sich ihre Bausteine beim Neuzeichnen ihres eigenen Bausteins neu
      // Zurückgegebene Dashboards (v. a. die Karte) neu vermessen
      if (had) setTimeout(() => { window.dashboardMapView?.resize?.(); window.dispatchEvent(new Event('resize')); }, 30);
    }

    updateOwn() {
      const d = this.lastTelemetry;
      const b = d?.base || {};
      const p = this.page;
      for (const s of this.ownSlots) {
        const st = this.settingsOf(p, s.type);
        const html = s.type === 'geraete' ? rigHtml(d, st) : this.steuerungHtml(s, st);
        if (s.last !== html) { s.el.innerHTML = html; s.last = html; this.stListenAnpassen(s.el); } // nur bei Änderung neu zeichnen
      }
      this.updateKeys();
    }

    // ---------- Tastenleiste ----------
    keysOf(type) {
      if (!type || type.startsWith('panel:')) return [];      // eigene Bausteine haben ihre Tasten auf der Fläche
      const s = this.settingsOf(this.page, type);
      return s.keyPos === 'aus' || !Array.isArray(s.keys) ? [] : s.keys;
    }
    keyPos(type) { return this.settingsOf(this.page, type).keyPos === 'rechts' ? 'rechts' : 'unten'; }

    keysHtml(type) {
      const keys = this.keysOf(type);
      if (!keys.length) return '';
      const A = window.anzeigen;
      return `<div class="tile-keys">${keys.map(k => {
        const st = k.stateSource && A ? A.keyState(k.stateSource, this.lastTelemetry || undefined) : null;
        const lamp = !!k.stateSource && A?.def(k.stateSource)?.kind === 'bool';
        const free = !k.functionId && !k.quickActions;
        return `<button type="button" class="tile-key ${st?.lit ? 'lit' : ''} ${free ? 'tile-key--free' : ''}" data-type="${esc(type)}" data-key="${esc(k.id)}"${k.stateSource ? ` data-state-src="${esc(k.stateSource)}"` : ''}>
          ${lamp ? '<span class="tile-key-dot"></span>' : ''}<span class="tile-key-label">${esc(k.label)}</span>${st?.text != null ? `<span class="tile-key-state">${esc(st.text)}</span>` : ''}</button>`;
      }).join('')}</div>`;
    }

    // Zustand der Tasten live nachführen (an/aus leuchtet, Zahl/Text klein in der Taste)
    updateKeys() {
      const A = window.anzeigen;
      if (!A || !this.body) return;
      this.body.querySelectorAll('.tile-key[data-state-src]').forEach(el => {
        const st = A.keyState(el.dataset.stateSrc, this.lastTelemetry || undefined);
        el.classList.toggle('lit', !!st?.lit);
        const v = el.querySelector('.tile-key-state');
        if (v && st?.text != null && v.textContent !== st.text) v.textContent = st.text;
      });
    }

    // Drücken und Loslassen wie eine Tastenfeld-Taste (Halten-Funktionen laufen, solange der Finger drauf ist)
    keyDown(e) {
      const el = e.target.closest('.tile-key');
      if (!el || this.editing || !this.page) return;
      e.preventDefault();
      const key = this.keysOf(el.dataset.type).find(k => k.id === el.dataset.key);
      if (!key) return;
      if (!key.functionId && !key.quickActions) { window.showToast?.('Keine Aktion zugeordnet – übers Zahnrad der Kachel einrichten'); return; }
      const msg = { pageId: this.page.id, type: el.dataset.type, keyId: key.id };
      let down = true;
      const pointerId = e.pointerId;
      const up = (ev) => {
        if (!down || (ev?.pointerId != null && pointerId != null && ev.pointerId !== pointerId)) return;   // anderer Finger
        if (!down) return;
        down = false;
        el.classList.remove('pressed');
        this.socket.emit('tile-key-up', msg);
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(n => el.removeEventListener(n, up));
        document.removeEventListener('pointerup', up);
      };
      el.classList.add('pressed');
      this.socket.emit('tile-key-down', msg);
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(n => el.addEventListener(n, up));
      document.addEventListener('pointerup', up);      // falls die Taste währenddessen neu gezeichnet wurde
    }

    async loadActionNames() {
      const names = new Map();
      try {
        const [f, m] = await Promise.all([fetch('/api/functions').then(r => r.json()), fetch('/api/macros').then(r => r.json())]);
        (f.functions || []).forEach(x => names.set(x.id, x.name));
        (m.macros || []).forEach(x => names.set(`macro:${x.id}`, `Makro „${x.name}“`));
        ((await window.hubActions?.pseudoFunctions?.()) || []).forEach(h => names.set(h.id, h.name));
      } catch { /* dann stehen nur die IDs da */ }
      this.actionNames = names;
      if (this.sheet) this.render();
    }

    keyActionText(k) {
      if (k.functionId) return this.actionNames?.get(k.functionId) || window.hubActions?.label?.(k.functionId) || k.functionId;
      if (k.quickActions) return describeActions(k.quickActions) + (k.durationSeconds ? ` (${k.durationSeconds} s)` : '');
      return 'keine Aktion';
    }

    // Aktion wählen (ActionPicker wie bei Tastenfeld-Tasten); i = null legt eine neue Taste an
    pickKeyAction(type, i) {
      const keys = [...(this.settingsOf(this.page, type).keys || [])];
      const k = i == null ? null : keys[i];
      window.actionPicker.open({ functionId: k?.functionId, quickActions: k?.quickActions, durationSeconds: k?.durationSeconds }, { includeMacros: true }, result => {
        const patch = { functionId: null, quickActions: null, durationSeconds: null };
        if (result.mode === 'function') {
          patch.functionId = result.functionId;
          this.actionNames?.set(result.functionId, result.label);
        } else if (result.mode === 'axis' || result.mode === 'keys') {
          patch.quickActions = result.quickActions;
          if (result.mode === 'axis') patch.durationSeconds = result.durationSeconds;
        }
        const label = String(result.label || 'Taste').replace(/^🔁\s*/, '').slice(0, 24);
        if (k) keys[i] = { ...k, ...patch };
        else {
          if (keys.length >= MAX_KEYS || result.mode === 'clear') return;
          keys.push({ id: 'k' + Date.now().toString(36), label, stateSource: null, ...patch });
          this.sheetKey = keys.length - 1;   // gleich weiter: Beschriftung und Zustand
        }
        this.setSetting(type, { keys });
      });
    }

    // Einstellungen einer einzelnen Taste (Unteransicht der Kachel-Einstellungen)
    keyEditorOptions(type) {
      const keys = [...(this.settingsOf(this.page, type).keys || [])];
      const i = this.sheetKey;
      const k = keys[i];
      if (!k) { this.sheetKey = null; return null; }
      const setKey = patch => { keys[i] = { ...k, ...patch }; this.setSetting(type, { keys }); };
      const move = d => {
        const j = i + d;
        if (j < 0 || j >= keys.length) return;
        [keys[i], keys[j]] = [keys[j], keys[i]];
        this.sheetKey = j;
        this.setSetting(type, { keys });
      };
      const A = window.anzeigen;
      const O = [{ kind: 'head', label: `Taste ${i + 1} von ${keys.length}` }];
      O.push({ kind: 'btn', label: `Beschriftung: ${k.label}`, state: 'ändern ›', pick: async () => {
        const v = await uiPrompt('Beschriftung der Taste (kurz, passt auf die Taste):', k.label, { title: 'Taste beschriften', ok: 'Übernehmen' });
        if (v != null && v.trim()) setKey({ label: v.trim().slice(0, 24) });
      } });
      O.push({ kind: 'btn', label: `Aktion: ${this.keyActionText(k)}`, state: 'wählen ›', pick: () => this.pickKeyAction(type, i) });
      if (A?.available?.()) {
        O.push({ kind: 'btn', label: `Zustand: ${k.stateSource ? A.describe(k.stateSource) : 'keiner'}`, state: 'Werteliste ›', pick: async () => {
          const id = await A.pick({ title: 'Zustand für die Taste', current: k.stateSource, none: 'Keinen Zustand zeigen' });
          if (id !== undefined) setKey({ stateSource: id });
        } });
        O.push({ kind: 'info', label: 'Ein an/aus-Wert lässt die Taste leuchten (z. B. Spurführung lenkt), eine Zahl steht klein in der Taste.' });
      }
      if (keys.length > 1) O.push({ kind: 'seg', label: 'Reihenfolge', items: [{ label: '◀ Nach vorn', on: false, pick: () => move(-1) }, { label: 'Nach hinten ▶', on: false, pick: () => move(1) }] });
      O.push({ kind: 'btn', label: 'Taste entfernen', state: '', cls: 'danger', pick: () => { this.sheetKey = null; this.setSetting(type, { keys: keys.filter((_, j) => j !== i) }); } });
      O.push({ kind: 'btn', label: '‹ Zurück zur Kachel', state: '', pick: () => { this.sheetKey = null; this.render(); } });
      return O;
    }

    // ---------- Steuerungskachel ----------
    async loadSteuerungLabels() {
      try {
        if (!window.moduleFlow?.modules?.length) await new Promise(r => setTimeout(r, 800));
        this.stLabels = (await window.moduleFlow?.loadButtonLabels?.()) || {};
      } catch { this.stLabels = {}; }
      if (!this.stLayouts) await this.loadSteuerungLayouts();
      this.redrawSteuerung();
    }

    redrawSteuerung() {
      this.ownSlots.forEach(s => { s.last = null; });
      this.embedSlots.forEach(s => { s.last = null; });
      if (this.home) this.updateOwn();
      this.updateEmbedSlots();
    }

    // Modulbilder mit Tasten wie in der vollen Tastenbelegung (Hendrik 22.10.2026): je Modul Bild und kalibrierte
    // Tastenpositionen (/api/module-layout), dazu das Seitenverhältnis des Bilds für die Größenanpassung per CSS
    async loadSteuerungLayouts() {
      for (let i = 0; i < 10 && !this.stModules().length; i++) await new Promise(r => setTimeout(r, 300));
      if (!this.stModules().length) return;   // Module noch nicht da: beim nächsten Laden der Beschriftungen erneut
      const out = {};
      try { this.stDeviceConfig = (await (await fetch('/api/device-config')).json()).settings || {}; } catch { this.stDeviceConfig = {}; }
      await Promise.all(this.stModules().map(async m => {
        if (m.layoutId === null) return;   // Modul ohne Bild (z. B. Tasten am CraftLink) → Liste
        try {
          // Modulansicht wie in der Tastenbelegung (CraftSlot: Griff + Unterbau zusammengesetzt, moduleFlow.js)
          const lay = await composeModuleView((await (await fetch(`/api/module-view/${encodeURIComponent(m.id)}`)).json()).view);
          if (lay?.parts) { out[m.id] = lay; return; }
          if (!lay?.image) return;
          const aspect = await new Promise(res => {
            const im = new Image();
            im.onload = () => res(im.naturalWidth && im.naturalHeight ? im.naturalWidth / im.naturalHeight : null);
            im.onerror = () => res(null);
            im.src = bust(lay.image);
          });
          if (aspect) out[m.id] = { ...lay, aspect };
        } catch { /* ohne Bild bleibt es die Liste */ }
      }));
      this.stLayouts = out;
    }

    // Ein Modul als Bild mit Tasten (gleiche Hotspots, Farben und Filter wie moduleFlow.js renderImageDetail()).
    // Antippen öffnet die volle Tastenbelegung dieses Moduls.
    // liste: null = nur Nummern im Bild; 'unten' / 'neben' = dazu die Liste „Nummer – Funktion“ (Hendrik 25.10.2026:
    // „überall nur die Nummern, außer wenn es dann 2×2 ist … bei 2×1 daneben auch schon Platz (wenn nur eins angezeigt wird)“)
    stImageBox(m, lay, liste = null) {
      const [start, end] = m.buttonRange || [0, -1];
      const sichtbar = b => (Array.isArray(m.buttons) ? m.buttons.includes(b) : b >= start && b <= end);
      const achsen = new Set(m.axisKeys || []);
      const off = new Set(m.griffBestimmt ? [] : (lay.disabledButtons || []));
      const { hiddenButtons, hiddenAxisKeys } = axisModeFiltering(m, this.stDeviceConfig || {});
      if (m.id === 'bedienteil') for (const b of bedienteilFiltering(this.stDeviceConfig || {})) hiddenButtons.add(b);
      // Nur die Nummer wie in der Tastenbelegung „Liste“ (Hendrik 25.10.2026: „nicht die Funktionen in die Tasten
      // geschrieben … sondern so wie bei den Einstellungen auch einfach die Nummer der Taste“): belegt kräftig, frei blass;
      // die Funktion steht im Tooltip
      const farbe = CRAFTSLOT_LAYER_COLORS[0];
      const spots = (lay.hotspots || []).map(h => {
        if (h.button != null && sichtbar(h.button) && !off.has(h.button) && !hiddenButtons.has(h.button)) {
          const fn = this.stLabels[h.button];
          return `<div class="button-hotspot${fn ? '' : ' frei'}" style="${hotspotStyleAttr(h)} background: ${fn ? farbe + 'e6' : 'rgba(15, 18, 22, 0.5)'}; ${capRingStyle(m, lay, h)}"${fn ? ` title="${esc(fn)}"` : ''}><span class="hotspot-label">${Number(h.button)}</span></div>`;
        }
        if (h.axisKey != null && achsen.has(h.axisKey) && !hiddenAxisKeys.has(h.axisKey)) {
          return `<div class="button-hotspot" style="${hotspotStyleAttr(h)} background: ${AXIS_HOTSPOT_COLOR}99; ${capRingStyle(m, lay, h)}" title="${esc(m.axisLabels?.[h.axisKey] || AXIS_LABELS[h.axisKey] || h.axisKey)}"><span class="hotspot-label">⇕</span></div>`;
        }
        return '';
      }).join('');
      const bild = `<div class="st-img-box"><div class="st-img-wrap" style="--a: ${lay.aspect.toFixed(4)}">${moduleImagesHtml(lay, '')}${spots}</div></div>`;
      let listeHtml = '';
      if (liste) {
        const tasten = (Array.isArray(m.buttons) ? m.buttons : Array.from({ length: Math.max(0, end - start + 1) }, (_, k) => start + k))
          .filter(b => !off.has(b) && !hiddenButtons.has(b)).sort((a, b) => a - b);
        listeHtml = `<div class="st-liste">${tasten.map(b => {
          const fn = this.stLabels[b];
          return `<div class="st-li"><b>${Number(b)}</b><span class="${fn ? '' : 'frei'}">${esc(fn || 'frei')}</span></div>`;
        }).join('')}</div>`;
      }
      return `<div class="st-mod st-mod--img${liste ? ` st-mod--liste-${liste}` : ''}" role="button" tabindex="0" onclick="window.tilePages.openModuleOverview('${esc(m.id)}')" title="${esc(m.name)}: volle Tastenbelegung öffnen">
          <div class="st-mod-name">${esc(m.name)}</div>
          ${liste === 'neben' ? `<div class="st-neben">${bild}${listeHtml}</div>` : bild + listeHtml}
        </div>`;
    }

    // Liste der Steuerungsübersicht: passt sie nicht in die Höhe, mehr Spalten (bis 4), neben dem Bild auch mehr Breite
    stListenAnpassen(el) {
      for (const li of el.querySelectorAll('.st-liste')) {
        const neben = !!li.closest('.st-neben');
        for (let cols = 2; cols <= 4; cols++) {
          li.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
          if (neben) li.style.flexBasis = `${45 + (cols - 2) * 12}%`;
          if (li.scrollHeight <= li.clientHeight + 1) break;
        }
      }
    }

    async openModuleOverview(moduleId) {
      await window.app?.navigateToTab('overview');
      window.moduleFlow?.openModule(moduleId);
    }

    // Größe eines Elements in Kachelfeldern (wie viele Module die Steuerungsübersicht automatisch zeigt)
    cellsOf(el) {
      const cell = window.steuerungsmenues?.formSize?.('1x1') || [390, 280];
      const w = el.clientWidth || cell[0], h = el.clientHeight || cell[1];
      const cols = Math.max(1, Math.min(3, Math.round(w / cell[0])));
      const rows = Math.max(1, Math.min(2, Math.round(h / cell[1])));
      return { size: cols * rows, cols, rows };
    }

    stModules() { return window.moduleFlow?.modules || []; }

    steuerungHtml(slot, st) {
      const mods = this.stModules();
      if (!mods.length) return `<div class="tile-empty">Module werden geladen …</div>`;
      const t = slot.tile || { size: 1, cols: 1, rows: 1 };
      const n = G.steuerungCount(st.count, t.size);
      const order = [...(Array.isArray(st.mods) ? st.mods : []), ...mods.map(m => m.id)].filter((id, i, a) => a.indexOf(id) === i && mods.some(m => m.id === id));
      const cols = G.steuerungCols(n, t.cols);
      // Platz je Modul aus der echten Kachelgröße schätzen -- passen nicht alle Tasten hinein, „+ N weitere“
      const w = slot.el.clientWidth || 300, h = slot.el.clientHeight || 220;
      const rows = Math.ceil(n / cols);
      const big = n === 1 && t.size >= 4;
      // Liste neben bzw. unter dem Bild nur, wenn ein Modul in einer mindestens 2 Felder breiten Kachel steht
      const liste = n === 1 && t.cols >= 2 ? (t.rows >= 2 ? 'unten' : 'neben') : null;
      // Kopf der Kachel (Profilzeile) ~32 px, je Modul Rahmen + Name ~40 px, je Tastenzeile ~32 px (groß ~38 px)
      const keyCols = Math.max(1, Math.min(4, Math.floor((w / cols - 16) / 170)));
      const keyRows = Math.max(1, Math.floor(((h - 32) / rows - 40) / (big ? 38 : 32)));
      const cap = keyCols * keyRows;
      const boxes = order.slice(0, n).map(id => {
        const m = mods.find(x => x.id === id);
        if (this.stLayouts?.[id]) return this.stImageBox(m, this.stLayouts[id], liste);
        const [start, end] = m.buttonRange || [0, -1];
        const visible = Array.isArray(m.buttons) ? m.buttons : Array.from({ length: Math.max(0, end - start + 1) }, (_, k) => start + k);
        const keys = [];
        for (const btn of visible) if (this.stLabels[btn]) keys.push([m.eigen ? btn : btn - start + 1, this.stLabels[btn]]);
        const shown = keys.length > cap ? keys.slice(0, cap - 1) : keys;
        const more = keys.length - shown.length;
        return `<div class="st-mod">
          <div class="st-mod-name">${esc(m.name)}</div>
          <div class="st-keys" style="grid-template-columns: repeat(${keyCols}, minmax(0, 1fr)); font-size: ${big ? '14px' : '12px'}">
            ${shown.map(([nr, name]) => `<div class="st-key"><span>${nr}</span><span>${esc(name)}</span></div>`).join('')}
            ${more > 0 ? `<div class="st-key st-key--more">+ ${more} weitere</div>` : ''}
            ${!keys.length ? '<div class="st-key st-key--more">keine Taste belegt</div>' : ''}
          </div>
        </div>`;
      });
      return `<div class="st-wrap"><div class="st-info">Profil <b>${esc(profilAnzeige(this.profile) || '')}</b> · ${n} ${n === 1 ? 'Modul' : 'Module'}${st.count === 'auto' ? ' · automatisch' : ''}</div>
        <div class="st-grid" style="grid-template-columns: repeat(${cols}, minmax(0, 1fr))">${boxes.join('')}</div></div>`;
    }

    // ---------- Vollbild ----------
    openFull(i) {
      const t = this.tiles?.[i];
      if (!t?.type) return;
      if (t.type === 'steuerung') { window.app?.navigateToTab('overview'); return; } // eigene Seite mit Modul-Untermenü
      this.full = t.type;
      this.sheet = null;
      this.render();
      setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    }
    closeFull() { this.full = null; this.render(); setTimeout(() => window.dispatchEvent(new Event('resize')), 50); }
    fullHtml() {
      return `<div class="tile-full">
        <div class="tile-full-head">
          <b>${esc(this.moduleName(this.full))}</b>
          <span class="tile-full-hint">Vollbild · zurück mit ‹ oben links</span>
          <span style="flex:1"></span>
          <button type="button" class="tile-gear" onclick="window.tilePages.openSheetFor('${esc(this.full)}')" aria-label="Einstellungen">${navIcon('sliders')}</button>
        </div>
        <div class="tile-full-body baustein-host ${OWN[this.full] ? 'tile-full-body--own' : ''}" data-form="2x3"></div>
        ${this.keysHtml(this.full)}
      </div>`;
    }

    // ---------- Kachel-Einstellungen (Zahnrad) ----------
    openSheet(i) { const t = this.tiles?.[i]; if (t?.type) this.openSheetFor(t.type); }
    openSheetFor(type) {
      this.sheet = type; this.sheetKey = null; this.covConfirm = false;
      this.render();
      this.loadActionNames();   // frisch, falls Funktionen inzwischen umbenannt wurden
    }
    closeSheet() { this.sheet = null; this.sheetKey = null; this.covConfirm = false; this.render(); }

    sheetOptions(type) {
      if (this.sheetKey != null) { const K = this.keyEditorOptions(type); if (K) return K; }
      const p = this.page;
      const s = this.settingsOf(p, type);
      const O = [];
      const head = label => O.push({ kind: 'head', label });
      const info = label => O.push({ kind: 'info', label });
      const sw = (label, key) => O.push({ kind: 'sw', label, on: s[key] !== false, pick: () => this.setSetting(type, { [key]: s[key] === false }) });
      const seg = (label, key, items) => O.push({ kind: 'seg', label, items: items.map(([v, l]) => ({ label: l, on: s[key] === v, pick: () => this.setSetting(type, { [key]: v }) })) });
      const act = (label, state, pick, cls = '') => O.push({ kind: 'btn', label, state, pick, cls });
      if (type === 'karte') {
        head('Ausrichtung');
        // „Schräg von hinten“ (3D, Hendrik 23.10.2026): Fahrzeug unten, man sieht weiter nach vorn
        O.push({ kind: 'seg', label: '', items: [['Fahrtrichtung oben', false, false], ['Norden oben', true, false], ['Schräg von hinten (3D)', false, true]]
          .map(([l, north, tilt]) => ({ label: l, on: !!s.north === north && !!s.tilt === tilt, pick: () => this.setSetting(type, { north, tilt }) })) });
        head('Bearbeitete Fläche');
        sw('Bearbeitete Fläche zeigen', 'cov');
        info('ControlHub merkt sich die Fläche je Fahrzeug und Spielstand, auch ohne offenes Tablet. Was als bearbeitet zählt, stellst du je Gerät unter GPS ein.');
        seg('Farbe', 'color', [['blau', 'Blau'], ['gruen', 'Grün']]);
        if (this.covConfirm) {
          info('Wirklich löschen? Gelöscht wird die Fläche des Fahrzeugs, in dem du sitzt (in diesem Spielstand). Sie lässt sich danach nicht wiederherstellen.');
          act('Ja, bearbeitete Fläche löschen', '', () => { window.dashboardMapView?.clearCoverage(); this.covConfirm = false; this.render(); window.showToast?.('Bearbeitete Fläche gelöscht'); }, 'danger');
          act('Abbrechen', '', () => { this.covConfirm = false; this.render(); });
        } else act('Bearbeitete Fläche löschen', '…', () => { this.covConfirm = true; this.render(); });
        head('Fahrzeug');
        // Symbol je Kachelseite, keine Automatik (Hendrik 23.10.2026); Häcksler entfällt, gespeichert zeigt er den Drescher
        const symNow = s.sym === 'haecksler' ? 'drescher' : (['traktor', 'drescher', 'pfeil'].includes(s.sym) ? s.sym : 'traktor');
        O.push({ kind: 'seg', label: 'Symbol', items: [['traktor', 'Traktor'], ['drescher', 'Drescher'], ['pfeil', 'Pfeil']]
          .map(([v, l]) => ({ label: l, on: symNow === v, pick: () => this.setSetting(type, { sym: v }) })) });
        info('Das Symbol gilt für diese Seite. Für den Mähdrescher am besten eine eigene Seite, die für sein Profil gilt.');
        info('Glättung, Straßen und Vorgewende-Ton gelten für alle Karten: Einstellungen → Karte.');
        head('Einblendungen');
        seg('Abstandsanzeige', 'ahead', [['vg', 'Vorgewende in …'], ['fr', 'Feldrand in …'], ['aus', 'Aus']]);
        info('Vorgewende und Feldrand kommen aus GPS (Vorgewendegröße). Ohne bekanntes Feld zeigt die Anzeige die Wende der Spurführung.');
        O.push({ kind: 'sw', label: 'Kartentasten  + − ⤢  in der Kachel', on: !!s.btns, pick: () => this.setSetting(type, { btns: !s.btns }) });
        info('Im Vollbild sind die Kartentasten immer da.');
      } else if (type.startsWith('panel:')) {
        const id = type.slice(6);
        const sm = window.steuerungsmenues;
        const st = sm?.settingsOnly(id) ? sm.steuerungEmbed(sm.pages.find(pg => pg.id === id)) : null;
        if (st) {
          // Steuerungsübersicht: nur einstellen, nicht gestalten (Hendrik 22.10.2026); gilt für diese Kachel überall
          const count = st.opts?.count || 'auto';
          const mods = window.moduleFlow?.modules || [];
          head('Module');
          O.push({ kind: 'seg', label: 'Anzahl', items: ['auto', 1, 2, 3, 4].map(c => ({ label: c === 'auto' ? 'Auto' : String(c), on: count === c, pick: () => sm.setEmbedOpt(id, st.id, 'count', c) })) });
          sm.steuerungOrder(st).slice(0, count === 'auto' ? 3 : count).forEach((mid, i) =>
            act(`Platz ${i + 1}`, `${mods.find(m => m.id === mid)?.name || mid} ›`, () => sm.pickSteuerungModule(id, st.id, i)));
          info(sm.steuerungCountHint(count) + ' Gilt für diese Kachel auf allen Seiten.');
          head('Kachel');
          info('Welche Kachel hier liegt:');
        } else {
          act('Kachel bearbeiten', '✎ ›', () => { this.closeSheet(); window.steuerungsmenues?.enterEditMode(id); });
          info('Gestaltet wird im Editor, für jede Kachelgröße mit eigener Anordnung oder automatisch. Welche Kachel hier liegt:');
        }
        for (const pg of window.steuerungsmenues?.pages || []) {
          act(pg.name, type === `panel:${pg.id}` ? '●' : '', () => this.replaceType(type, `panel:${pg.id}`), type === `panel:${pg.id}` ? 'on' : '');
        }
      }
      if (type === 'panel:sm-v-planer' || window.steuerungsmenues?.pages?.find(pg => `panel:${pg.id}` === type)?.embeds?.some(e => e.baustein.startsWith('planer-'))) {
        act('Komplexe, Fruchtfolge, Planer-Satz', 'Planer-Menü ›', () => { this.closeSheet(); window.appNav?.go('dashboard-planner'); });
      }
      if (type === 'karte') act('GPS-Einstellungen des Geräts', 'GPS ›', () => { this.closeSheet(); window.app?.navigateToTab('gps'); });
      if (!type.startsWith('panel:')) {
        const keys = Array.isArray(s.keys) ? s.keys : [];
        head('Tastenleiste');
        O.push({ kind: 'seg', label: 'Position', items: KEY_POS.map(([v, l]) => ({ label: l, on: (s.keyPos || 'unten') === v, pick: () => this.setSetting(type, { keyPos: v }) })) });
        keys.forEach((k, i) => act(`${i + 1}. ${k.label}`, `${this.keyActionText(k).slice(0, 26)} ›`, () => { this.sheetKey = i; this.render(); }));
        if (keys.length < MAX_KEYS) act('+ Taste hinzufügen', 'Aktion wählen ›', () => this.pickKeyAction(type, null), 'on');
        info(`Bis ${MAX_KEYS} Tasten an der Kachel. Aktion wie überall: Funktion, Makro, Tastatur-Taste oder ControlHub-Aktion. Mit einer Bedingung an der Funktion („nur wenn …“) schaltet eine Taste nie in die falsche Richtung.`);
      }
      return O;
    }

    sheetHtml() {
      const p = this.page;
      this.sheetOpts = this.sheetOptions(this.sheet);
      const where = (G.isProfilePage(p) ? `Profilseite – ${p.profiles.map(n => esc(profilAnzeige(n))).join(', ')}` : 'Standardseite – gilt für alle Profile') + (p.haupt ? ' · Hauptseite' : '');
      const opts = this.sheetOpts.map((o, i) => {
        if (o.kind === 'head') return `<div class="sheet-head">${esc(o.label)}</div>`;
        if (o.kind === 'info') return `<div class="sheet-info">${esc(o.label)}</div>`;
        if (o.kind === 'sw') return `<button type="button" role="switch" aria-checked="${o.on}" class="sheet-switch" onclick="window.tilePages.sheetPick(${i})"><span>${esc(o.label)}</span><span class="ui-switch ${o.on ? 'on' : ''}"><span></span></span></button>`;
        if (o.kind === 'seg') return `<div class="sheet-seg-wrap">${o.label ? `<span class="sheet-seg-label">${esc(o.label)}</span>` : ''}<div class="ui-seg">${o.items.map((it, j) => `<button type="button" class="${it.on ? 'on' : ''}" onclick="window.tilePages.sheetPick(${i}, ${j})">${esc(it.label)}</button>`).join('')}</div></div>`;
        return `<button type="button" class="sheet-row ${o.cls || ''}" onclick="window.tilePages.sheetPick(${i})"><span>${esc(o.label)}</span><span class="sheet-row-state">${esc(o.state || '')}</span></button>`;
      }).join('');
      return `<button type="button" class="sheet-backdrop" aria-label="Einstellungen schließen" onclick="window.tilePages.closeSheet()"></button>
        <aside class="tile-sheet">
          <div class="tile-sheet-top">
            <div><div class="sheet-kicker">Kachel-Einstellungen</div><div class="sheet-title">${esc(this.moduleName(this.sheet))}</div></div>
            <button type="button" class="btn-secondary" aria-label="Schließen" onclick="window.tilePages.closeSheet()">×</button>
          </div>
          <div class="sheet-where">${where}</div>
          <div class="sheet-opts">${opts}</div>
          <span style="flex:1"></span>
          <button type="button" class="btn-secondary" onclick="window.tilePages.swapTile()">Kachel tauschen / Seite bearbeiten</button>
        </aside>`;
    }
    sheetPick(i, j) {
      const o = this.sheetOpts?.[i];
      if (!o) return;
      if (o.kind === 'seg') o.items[j]?.pick(); else o.pick?.();
    }
    swapTile() {
      const i = this.page?.cells.indexOf(this.sheet);
      this.sheet = null; this.full = null;
      this.edit(true, i >= 0 ? i : 0);
    }
    replaceType(from, to) {
      const p = this.page;
      p.cells = p.cells.map(c => (c === from ? to : c));
      this.sheet = this.sheet === from ? to : this.sheet;
      this.full = this.full === from ? to : this.full;
      this.saveSoon();
      this.render();
    }

    // ---------- ☰ Menü und Kopfleiste: appNav.js ----------
    toggleMenu(on) { window.appNav?.toggleMenu(on); }
    // Seitenname, Umschalter und „Fertig“ beim Einrichten zeichnet die Kopfleiste
    renderBar() { window.appNav?.render(); }

    // ControlHub-Aktion von einer Taste (Paket J, s. hubActions.js): nächste/vorherige/bestimmte Seite.
    // Holt die Startseite nach vorn -- außer jemand richtet gerade etwas ein.
    onCommand(c) {
      if (this.editing || window.steuerungsmenues?.editingPageId) return;
      const pages = this.visiblePages;
      if (!pages.length) return;
      let target = null;
      if (c?.cmd === 'show') {
        target = pages.find(p => p.id === c.pageId) || null;
        if (!target) { window.showToast?.('Diese Kachelseite gilt nicht für das aktive Profil'); return; }
      } else if (c?.cmd === 'next' || c?.cmd === 'prev') {
        const i = Math.max(0, pages.findIndex(p => p.id === this.page?.id));
        target = pages[(i + (c.cmd === 'next' ? 1 : -1) + pages.length) % pages.length];
      }
      if (!target) return;
      this.goTo(target.id, true);
      if (!this.home) this.enterHome();
    }

    goTo(id, manual) {
      if (!this.pages.some(p => p.id === id) || (id === this.currentId && !manual)) return;
      this.currentId = id;
      this.full = null; this.sheet = null;
      writeLS('tiles.currentId', id);
      if (this.home) this.render();
    }

    onTelemetry(d) {
      this.lastTelemetry = d;
      if (this.home) this.updateOwn();
      this.updateEmbedSlots();
    }

    // Wischen zwischen Seiten (nicht auf Karte/Bedienpanel, die selbst ziehen)
    // Wischen wechselt die Seite. Seit 23.10.2026 überall auf den Kacheln startbar außer auf echten Bedienelementen
    // (vorher nur in den schmalen Lücken, weil fast jede Kachel als Ganzes ausgenommen war); nach einem Wisch wird der
    // Klick, den der Browser danach noch auslöst, verschluckt.
    setupSwipe() {
      const NO_SWIPE = '.dashboard-map-wrap, .sm-btn, .sm-display-tap, .tile-key, .tile-gear, .pl-row, .pl-live, .st-mod, input, select, textarea';
      let start = null, swallow = false;
      document.addEventListener('pointerdown', e => {
        if (!this.home || this.editing || this.full || this.sheet || window.appNav?.menu || e.target.closest(NO_SWIPE) || !e.target.closest('.home-grid')) { start = null; return; }
        start = { x: e.clientX, y: e.clientY, id: e.pointerId };
      }, true);
      document.addEventListener('pointerup', e => {
        if (!start || e.pointerId !== start.id) return;
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        start = null;
        if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          const list = this.visiblePages;
          const i = list.findIndex(p => p.id === this.page?.id);
          const next = list[i + (dx < 0 ? 1 : -1)];
          if (next) { swallow = true; setTimeout(() => { swallow = false; }, 400); this.goTo(next.id, true); }
        }
      }, true);
      document.addEventListener('click', e => { if (swallow) { swallow = false; e.stopPropagation(); e.preventDefault(); } }, true);
    }

    // ---------- Einrichten ----------
    async edit(on, cell) {
      this.editing = on;
      this.full = null; this.sheet = null; this.menuOpen = false; this.manage = false;
      if (cell != null) this.editCell = cell;
      if (on) {
        try { this.profiles = ((await fetch('/api/profiles').then(r => r.json())).profiles || []).map(p => p.name); } catch { /* Liste vom Start reicht */ }
      } else {
        try { await this.save(); } catch (e) { uiAlert('Speichern fehlgeschlagen: ' + e.message); }
        // Seite, die nach dem Einrichten nicht mehr zum Profil gehört: auf eine passende wechseln
        if (!G.pagesFor(this.pages, this.profile).some(p => p.id === this.currentId)) this.currentId = G.pagesFor(this.pages, this.profile)[0]?.id || '';
      }
      this.render();
    }

    editorGridHtml(p, tiles) {
      const tileOf = i => tiles.find(t => t.cells.includes(i));
      return `<div class="home-grid home-grid--edit">${p.cells.map((c, i) => {
        const t = tileOf(i);
        const joined = t && t.size > 1;
        return `<button type="button" class="edit-cell ${i === this.editCell ? 'sel' : ''} ${c ? 'filled' : ''} ${joined ? 'joined' : ''}" style="grid-row:${Math.floor(i / 3) + 1}; grid-column:${(i % 3) + 1}" onclick="window.tilePages.selectCell(${i})">
          <span class="edit-cell-name">${esc(this.moduleName(c))}</span>
          <span class="edit-cell-hint">${i === this.editCell ? 'ausgewählt' : `Zeile ${Math.floor(i / 3) + 1}, Spalte ${(i % 3) + 1}`}</span>
        </button>`;
      }).join('')}</div>`;
    }

    editorPanelHtml(p, bad) {
      const panels = window.steuerungsmenues?.pages || [];
      const cur = p.cells[this.editCell];
      const item = (id, name) => `<button type="button" class="catalog-item ${cur === id ? 'on' : ''}" onclick="window.tilePages.setCell('${esc(id)}')" ${id && !this.moduleAvailable(id) ? 'disabled title="nur bei Spielen mit Spieldaten"' : ''}>${esc(name)}</button>`;
      const catalog = CATALOG.map(([title, list]) => {
        const items = list === 'all'
          ? [...Object.keys(BORROWED).map(id => item(id, this.moduleName(id))), ...panels.map(pg => item(`panel:${pg.id}`, pg.name))]
          : list.map(id => item(id, id ? this.moduleName(id) : 'Leer lassen'));
        if (!items.length) return '';
        return `<div class="sheet-head">${esc(title)}</div><div class="catalog-grid">${items.join('')}</div>`;
      }).join('');
      const merged = G.merge(p.cells).tiles.filter(t => t.type && t.size > 1).map(t => `${this.moduleName(t.type)} über ${t.cols} × ${t.rows} Felder`);
      const mergeInfo = bad.length
        ? `<div class="edit-merge bad">Nicht rechteckig: ${bad.map(b => esc(this.moduleName(b))).join(', ')} – nur Rechtecke werden zu einer Kachel verbunden. Diese Felder bleiben einzeln.</div>`
        : `<div class="edit-merge">${merged.length ? 'Verbunden: ' + merged.map(esc).join(' · ') : 'Keine verbundenen Felder – jedes Feld ist eine eigene Kachel.'}</div>`;
      // Geliehene Anzeigen (Karte, Wetter, Bedienpanel-Seiten …) gibt es nur einmal je Seite, s. mountOne()
      const seen = new Set(), twice = new Set();
      for (const t of G.merge(p.cells).tiles) if (t.type && !OWN[t.type]) (seen.has(t.type) ? twice : seen).add(t.type);
      const twiceInfo = twice.size ? `<div class="edit-merge bad">${[...twice].map(id => esc(this.moduleName(id))).join(', ')} kann nur einmal je Seite angezeigt werden – die zweite Kachel bleibt leer.</div>` : '';
      const all = !G.isProfilePage(p);
      const profileChips = this.profiles.map((name, i) => `<button type="button" class="chip ${p.profiles?.includes(name) ? 'on' : ''}" onclick="window.tilePages.toggleProfile(${i})">${esc(profilAnzeige(name))}</button>`).join('');
      const idx = this.pages.indexOf(p);
      return `<aside class="edit-panel">
        <div class="sheet-kicker">Kachel für Feld ${this.editCell + 1} (Zeile ${Math.floor(this.editCell / 3) + 1}, Spalte ${(this.editCell % 3) + 1})</div>
        ${catalog}
        ${mergeInfo}${twiceInfo}
        <div class="sheet-head">Seite</div>
        <label class="edit-field">Name <input type="text" value="${esc(p.name)}" maxlength="40" onchange="window.tilePages.setPage('name', this.value)"></label>
        <div class="sheet-seg-wrap"><span class="sheet-seg-label">Gilt für</span>
          <div class="chips"><button type="button" class="chip ${all ? 'on' : ''}" onclick="window.tilePages.setAllProfiles()">Alle Profile (Standardseite)</button>${profileChips}</div>
        </div>
        <button type="button" role="switch" aria-checked="${!!p.haupt}" class="sheet-switch" onclick="window.tilePages.toggleHaupt()"><span>Hauptseite: beim Laden des Profils zeigen</span><span class="ui-switch ${p.haupt ? 'on' : ''}"><span></span></span></button>
        <p class="edit-hint">${p.haupt ? (all ? 'Für alle Profile, die keine eigene Hauptseite haben.' : `Für ${p.profiles.map(n => esc(profilAnzeige(n))).join(', ')}.`)
          : 'Wechselst du auf ein Profil, zeigt ControlHub seine Hauptseite. Eine eigene Seite des Profils geht dabei vor einer Standardseite.'}</p>
        <div class="edit-actions">
          <button type="button" class="btn-secondary btn-small" onclick="window.tilePages.movePage(-1)" ${idx <= 0 ? 'disabled' : ''}>◀ Nach vorn</button>
          <button type="button" class="btn-secondary btn-small" onclick="window.tilePages.movePage(1)" ${idx >= this.pages.length - 1 ? 'disabled' : ''}>Nach hinten ▶</button>
          <button type="button" class="btn-secondary btn-small" onclick="window.tilePages.copyPage()">Seite kopieren</button>
          <button type="button" class="btn-danger btn-small" onclick="window.tilePages.deletePage()">Seite löschen</button>
        </div>
        <button type="button" class="btn-primary" onclick="window.tilePages.edit(false)">Fertig</button>
      </aside>`;
    }

    selectCell(i) { this.editCell = i; this.render(); }
    setCell(id) { this.page.cells[this.editCell] = id; this.saveSoon(); this.render(); }
    setPage(key, val) { this.page[key] = val; this.saveSoon(); this.render(); }
    // Grenzen (tileGrid.js, 24.10.2026): je Spiel höchstens 100 Seiten, in einem Profil höchstens 10 zu sehen.
    // pages = der Stand danach; bei Verstoß Hinweis und false
    grenzeOk(pages, titel) {
      if (pages.length > G.MAX_GESAMT) { uiAlert(`Es gehen höchstens ${G.MAX_GESAMT} Kachelseiten je Spiel.`, { title: titel }); return false; }
      const z = G.zuVieleSichtbar(pages);
      if (!z) return true;
      uiAlert(z.profil == null
        ? `Für alle Profile zusammen (Standardseiten) gehen höchstens ${G.MAX_SICHTBAR} Seiten. Gib einer Seite unter „Gilt für“ ein bestimmtes Profil oder lösch eine.`
        : `In einem Profil sind höchstens ${G.MAX_SICHTBAR} Seiten zu sehen, bei „${profilAnzeige(z.profil)}“ wären es ${z.anzahl}. Gib der Seite ein anderes Profil oder lösch eine.`, { title: titel });
      return false;
    }
    mitProfilen(page, profiles) { return this.pages.map(x => (x === page ? { ...x, profiles } : x)); }

    toggleHaupt() { G.setzeHaupt(this.pages, this.page, !this.page.haupt); this.saveSoon(); this.render(); }
    setAllProfiles() {
      if (!this.grenzeOk(this.mitProfilen(this.page, []), 'Gilt für')) return;
      this.page.profiles = []; this.saveSoon(); this.render();
    }
    toggleProfile(i) {
      const name = this.profiles[i];
      const p = this.page;
      if (!name) return;
      const list = p.profiles || [];
      const neu = list.includes(name) ? list.filter(x => x !== name) : list.concat(name);
      if (!this.grenzeOk(this.mitProfilen(p, neu), 'Gilt für')) return;
      p.profiles = neu;
      this.saveSoon();
      this.render();
    }

    newPage(templateKey) {
      const page = clone(TEMPLATES[templateKey] || TEMPLATES.leer);
      page.id = 'k' + Date.now().toString(36);
      page.profiles = [];
      page.settings = page.settings || {};
      // Bausteine, die es (nicht mehr) gibt, bleiben leer
      const exists = id => !id.startsWith('panel:') || (window.steuerungsmenues?.pages || []).some(pg => `panel:${pg.id}` === id);
      page.cells = page.cells.map(c => (exists(c) ? c : ''));
      if (!this.features().has('telemetry')) page.cells = page.cells.map(() => ''); // eigenes Spiel: nur leere Felder
      return page;
    }

    async addPage(templateKey) {
      if (!this.grenzeOk([...this.pages, { profiles: [] }], 'Neue Kachelseite')) return;
      const page = this.newPage(templateKey);
      this.config.pages.push(page);
      this.currentId = page.id;
      try { await this.save(); } catch (e) { uiAlert('Speichern fehlgeschlagen: ' + e.message); }
      this.edit(templateKey === 'leer' || !this.features().has('telemetry'), 0);
    }

    async addPageDialog() {
      if (!this.grenzeOk([...this.pages, { profiles: [] }], 'Neue Kachelseite')) return;
      const k = await uiChoice('Wie soll die neue Kachelseite beginnen?', [
        { label: 'Leer', value: 'leer' }, { label: 'Vorlage Transport', value: 'strasse' }, { label: 'Vorlage Feld', value: 'feld' }
      ], { title: 'Neue Kachelseite' });
      if (k) this.addPage(k);
    }

    // Aus einer Seite eine eigene Profilseite machen (z. B. „Feld“ als „Feld Pflügen“)
    copyPage() {
      if (!this.grenzeOk([...this.pages, { profiles: this.profile ? [this.profile] : [] }], 'Seite kopieren')) return;
      const src = this.page;
      const page = clone(src);
      page.id = 'k' + Date.now().toString(36);
      page.name = `${src.name} ${this.profile || 'Kopie'}`.slice(0, 40);
      page.profiles = this.profile ? [this.profile] : [];
      delete page.haupt;   // Hauptseite bleibt das Original
      this.pages.splice(this.pages.indexOf(src) + 1, 0, page);
      this.currentId = page.id;
      this.saveSoon();
      this.render();
    }

    movePage(dir) {
      const i = this.pages.indexOf(this.page), j = i + dir;
      if (i < 0 || j < 0 || j >= this.pages.length) return;
      [this.pages[i], this.pages[j]] = [this.pages[j], this.pages[i]];
      this.saveSoon();
      this.render();
    }

    async deletePage(id) {
      const p = id ? this.pages.find(x => x.id === id) : this.page;
      if (!p) return;
      if (!(await uiConfirm(`Kachelseite „${p.name}“ löschen?`, { title: 'Seite löschen', ok: 'Löschen', danger: true }))) return;
      this.pages.splice(this.pages.indexOf(p), 1);
      if (this.currentId === p.id || !this.pages.some(x => x.id === this.currentId)) this.currentId = G.pagesFor(this.pages, this.profile)[0]?.id || this.pages[0]?.id || '';
      writeLS('tiles.currentId', this.currentId);
      if (!this.pages.length) { this.editing = false; this.manage = false; }
      try { await this.save(); } catch (e) { uiAlert('Speichern fehlgeschlagen: ' + e.message); }
      this.render();
    }

    // ---------- Seiten verwalten (Test 23.10.2026, ersetzt den Automatik-Schalter) ----------
    // Liste ALLER Seiten (auch Profilseiten anderer Profile): Reihenfolge, Name, Gilt für, Kopieren, Löschen;
    // Antippen öffnet „Seite bearbeiten“ für diese Seite.
    openManage() { this.full = null; this.sheet = null; this.manage = true; this.render(); }
    closeManage() { this.manage = false; this.render(); }
    manageHtml() {
      const visible = new Set(G.pagesFor(this.pages, this.profile).map(p => p.id));
      const ico = (d, w = 18) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
      const rows = this.pages.map((p, i) => {
        const where = G.isProfilePage(p) ? `Profil: ${p.profiles.map(profilAnzeige).join(', ')}` : 'Alle Profile';
        const id = esc(p.id);
        return `<div class="pm-row ${p.id === this.page?.id ? 'on' : ''}">
          <div class="pm-order">
            <button type="button" class="pm-btn" aria-label="Nach oben" onclick="window.tilePages.managePageMove('${id}', -1)" ${i === 0 ? 'disabled' : ''}>${ico('<path d="M6 15l6-6 6 6"/>')}</button>
            <button type="button" class="pm-btn" aria-label="Nach unten" onclick="window.tilePages.managePageMove('${id}', 1)" ${i === this.pages.length - 1 ? 'disabled' : ''}>${ico('<path d="M6 9l6 6 6-6"/>')}</button>
          </div>
          <button type="button" class="pm-main" onclick="window.tilePages.managePageEdit('${id}')">
            <b>${esc(p.name)}</b><small>${esc(where)}${visible.has(p.id) ? '' : ' · gerade ausgeblendet'}</small>
          </button>
          <div class="pm-actions">
            <button type="button" class="pm-btn" aria-label="Umbenennen" title="Umbenennen" onclick="window.tilePages.managePageRename('${id}')">${ico('<path d="M4 20h4L19 9l-4-4L4 16z"/>')}</button>
            <button type="button" class="pm-btn" aria-label="Kopieren" title="Kopieren" onclick="window.tilePages.managePageCopy('${id}')">${ico('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>')}</button>
            <button type="button" class="pm-btn" aria-label="Exportieren" title="Exportieren" onclick="window.tilePages.exportPages(['${id}'])">${ico('<path d="M12 15V4M7 9l5-5 5 5M5 20h14"/>')}</button>
            <button type="button" class="pm-btn pm-btn--danger" aria-label="Löschen" title="Löschen" onclick="window.tilePages.deletePage('${id}')">${ico('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>')}</button>
          </div>
        </div>`;
      }).join('');
      return `<button type="button" class="sheet-backdrop" aria-label="Schließen" onclick="window.tilePages.closeManage()"></button>
        <aside class="tile-sheet pm-sheet">
          <div class="tile-sheet-top">
            <div><div class="sheet-kicker">Startseite</div><div class="sheet-title">Seiten verwalten</div></div>
            <button type="button" class="btn-secondary" aria-label="Schließen" onclick="window.tilePages.closeManage()">×</button>
          </div>
          <div class="sheet-info">Antippen richtet die Seite ein (Kacheln, Name, „Gilt für“). Pfeile ändern die Reihenfolge.</div>
          <div class="pm-list">${rows || '<p class="app-menu-empty">Noch keine Seite.</p>'}</div>
          <span style="flex:1"></span>
          <div class="pm-io">
            <button type="button" class="btn-secondary" onclick="window.tilePages.importPages()" ${this.pages.length >= G.MAX_GESAMT ? 'disabled' : ''}>Importieren …</button>
            <button type="button" class="btn-secondary" onclick="window.tilePages.exportPages(null)" ${this.pages.length ? '' : 'disabled'}>Alle exportieren</button>
          </div>
          <button type="button" class="btn-primary" onclick="window.tilePages.closeManage(); window.tilePages.addPageDialog()" ${this.pages.length >= G.MAX_GESAMT ? 'disabled' : ''}>+ Neue Seite</button>
        </aside>`;
    }
    // Seiten exportieren/importieren (Hendrik 24.10.2026), mit den eigenen Tastenfeldern darauf (server/seitenAustausch.js)
    async exportPages(ids) {
      try {
        await this.save();   // ungespeicherte Änderungen gehören mit in die Datei
        const q = ids ? `?ids=${encodeURIComponent(ids.join(','))}` : '';
        const r = await fetch(`/api/kacheln/export${q}`).then(x => x.json());
        if (!r.success) throw new Error(r.error || 'Fehler');
        const eine = ids?.length === 1 ? this.pages.find(p => p.id === ids[0]) : null;
        downloadJson(r.data, eine ? `Kachelseite ${eine.name}` : `Kachelseiten ${new Date().toISOString().split('T')[0]}`);
        window.showToast?.(`${r.data.pages.length === 1 ? 'Seite' : `${r.data.pages.length} Seiten`} exportiert (Ordner Downloads)`);
      } catch (e) {
        uiAlert('Export fehlgeschlagen: ' + e.message);
      }
    }
    async importPages() {
      try {
        const data = await pickJsonFile();
        if (!data) return;
        const r = await fetch('/api/kacheln/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }) }).then(x => x.json());
        if (!r.success) throw new Error(r.error || 'Fehler');
        await this.reload?.();
        let text = `Importiert: ${r.seiten.map(n => `„${n}“`).join(', ')}.`;
        if (r.kacheln) text += `\n${r.kacheln} eigene ${r.kacheln === 1 ? 'Kachel' : 'Kacheln'} dazu angelegt.`;
        if (r.fehlend) text += `\n${r.fehlend} ${r.fehlend === 1 ? 'Kachel fehlt' : 'Kacheln fehlen'} hier (steht als „Kachel fehlt“ auf der Seite).`;
        if (r.ohneProfil.length) text += `\nNur für Profile, die es hier nicht gibt: ${r.ohneProfil.map(n => `„${n}“`).join(', ')} – unter „Gilt für“ anpassen.`;
        uiAlert(text, { title: 'Seiten importieren', forceDialog: true });
      } catch (e) {
        uiAlert('Import fehlgeschlagen: ' + e.message);
      }
    }
    managePageMove(id, dir) {
      const i = this.pages.findIndex(p => p.id === id), j = i + dir;
      if (i < 0 || j < 0 || j >= this.pages.length) return;
      [this.pages[i], this.pages[j]] = [this.pages[j], this.pages[i]];
      this.saveSoon();
      this.render();
    }
    async managePageRename(id) {
      const p = this.pages.find(x => x.id === id);
      if (!p) return;
      const name = await uiPrompt('Neuer Name der Seite', p.name, { title: 'Seite umbenennen', ok: 'Umbenennen' });
      if (!name || !name.trim()) return;
      p.name = name.trim().slice(0, 40);
      this.saveSoon();
      this.render();
    }
    managePageCopy(id) {
      const src = this.pages.find(x => x.id === id);
      if (!src) return;
      if (!this.grenzeOk([...this.pages, { profiles: src.profiles || [] }], 'Seite kopieren')) return;
      const page = clone(src);
      page.id = 'k' + Date.now().toString(36);
      page.name = `${src.name} (Kopie)`.slice(0, 40);
      this.pages.splice(this.pages.indexOf(src) + 1, 0, page);
      this.saveSoon();
      this.render();
    }
    managePageEdit(id) {
      const p = this.pages.find(x => x.id === id);
      if (!p) return;
      this.manage = false;
      this.currentId = p.id;
      writeLS('tiles.currentId', p.id);
      this.edit(true, 0);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.tilePages = new TilePages();
  });
})();
