/**
 * Navigation mit einer Leiste oben (Mockup „Navigation und Seiten“, von Hendrik am 22.10.2026 freigegeben):
 * - Links fest ‹ Zurück · ⌂ Start · ☰ Menü. ‹ geht den Weg zurück, den man gekommen ist; vorher schließt es
 *   offene Fenster, das Vollbild einer Kachel oder das Einrichten.
 * - Mitte „wo bin ich“ mit Umschalter ‹ [Name ▾] ›: auf der Startseite die Kachelseiten (mit Seiten verwalten,
 *   Seite bearbeiten (bis 24.10.2026 „Seite einrichten“), + Neue Seite; „Seite folgt der Situation“ seit dem Test vom 23.10.2026 entfernt), bei den Kacheln alle Kacheln (eigene mit ✎ Bearbeiten), in
 *   einem Bereich (Belegung, Einstellungen) dessen Unterseiten.
 * - Rechts der Statusknopf (statusMenus.js). Keine untere Leiste mehr.
 * - Mehrere zusammengehörige Seiten innerhalb einer Unterseite (Armlehne einrichten, Für Entwickler) werden zu
 *   Reitern direkt über dem Inhalt (#page-tabs).
 * - Menü: GPS (Reiter Aktuelles Gerät · Geräte verwalten), Arbeitsplaner, Kacheln, Belegung ›, Einstellungen ›. Dashboards und Bedienfelder sind
 *   zusammen „Kacheln“ (Hendrik 22.10.2026, erst „Bausteine“ genannt): fest ist nur die Karte, alle anderen sind frei
 *   gestaltete Kacheln (intern steuerungsmenues), auch die aus Vorlagen wie Cockpit oder Arbeitsplaner. „Kacheln“ führt
 *   ohne Untermenü direkt in die Übersicht (sm-manage, steuerungsmenues.js renderManagePage()): eine Liste aus allen
 *   zum Öffnen, Bearbeiten, Importieren, Exportieren, Zurücksetzen. „Arbeitsplaner“ ist das Planer-Menü (Felder,
 *   Fruchtfolge, Planer-Satz; planner.js), die Planer-Kachel selbst ist eine normale Kachel.
 *
 * Navigiert wird weiter über app.navigateToTab() -- die (unsichtbare) Seitenleiste dient app.js nur noch als
 * Verzeichnis der Seiten (Titel, Spiel-Fähigkeiten über .feature-off, Entwickler-Code).
 */
(function () {
  const esc = escapeHtml;   // js/basis.js (Durchsicht B9: vorher eigene Kopie)
  const svg = (body, extra = '') => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;
  const ICONS = {
    gps: svg('<circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="3"></circle>'),
    planer: svg('<rect x="4" y="5" width="16" height="15" rx="2"></rect><path d="M4 10h16M9 3v4M15 3v4"></path>'),
    bausteine: svg('<rect x="4" y="4" width="7" height="7" rx="1.5"></rect><rect x="13" y="4" width="7" height="7" rx="1.5"></rect><rect x="4" y="13" width="7" height="7" rx="1.5"></rect><rect x="13" y="13" width="7" height="7" rx="1.5"></rect>'),
    belegung: svg('<rect x="3" y="6" width="18" height="12" rx="2"></rect><path d="M7 10h1M11 10h1M15 10h1M7 14h10"></path>'),
    einstellungen: svg('<circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"></path>')
  };
  const CHEVRON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>';

  // Bereiche mit Unterseiten; eine Unterseite mit tabs zeigt diese als Reiter über dem Inhalt
  const AREAS = [
    { id: 'belegung', title: 'Belegung', subs: [
      { tab: 'overview', name: 'Tastenbelegung' }, { tab: 'functions', name: 'Funktionen' }, { tab: 'vorgewende', name: 'Makros' },
      { tab: 'axis-assignment', name: 'Achsen' }, { tab: 'profiles', name: 'Profile' }] },
    { id: 'einstellungen', title: 'Einstellungen', subs: [
      { tab: 'status', name: 'Allgemein' }, { tab: 'karte-einstellungen', name: 'Karte' }, { tab: 'connection', name: 'Verbindung' }, { tab: 'backup', name: 'Sichern & Teilen' },
      { name: 'Controller', tabs: [['controller-geraet', 'Gerät'], ['armlehnen-setup', 'Module'], ['axis-calibration', 'Achsen-Kalibrierung'], ['settings', 'Geräte-Einstellungen']] },
      { name: 'Für Entwickler', tabs: [['module-status', 'Modul-Erkennung'], ['live-diagnose', 'Live-Diagnose'], ['controller-editor', 'Eigene Controller'], ['calibration-tool', 'Modul-Kalibrierung'], ['button-test', 'Tasten-Test'], ['reset', 'Zurücksetzen']] }] }
  ];
  // Feste Kachel mit eigener Seite; alle anderen sind eigene Kacheln (auch die früher festen wie Cockpit oder
  // Arbeitsplaner, s. server/bausteinVorlagen.js)
  const BUILTIN = [['dashboard-map', 'Karte', 'Felder, Fahrzeuge, bearbeitete Fläche']];
  // Einzelne Seiten ohne Umschalter: Tab → [Bereich, Name]
  const SINGLE = { gps: ['', 'GPS'], 'gps-geraete': ['', 'GPS'], 'sm-manage': ['', 'Kacheln'], 'dashboard-planner': ['', 'Arbeitsplaner'] };
  // Einzelne Seiten, die zusammen EIN Menüpunkt sind, mit Reitern über dem Inhalt (Hendrik 24.10.2026: „im Menü nicht
  // zweimal GPS“, „GPS-Menü einfach nur GPS“) -- vorher zwei Menüpunkte „GPS-Menü“ und „GPS-Geräte“
  const SINGLE_TABS = [[['gps', 'Aktuelles Gerät'], ['gps-geraete', 'Geräte verwalten']]];
  const subTab = s => s.tab || s.tabs[0][0];
  const subHas = (s, tab) => s.tab === tab || !!s.tabs?.some(([t]) => t === tab);

  class AppNav {
    constructor() {
      this.tab = null;            // zuletzt gemeldeter Tab
      this.settled = null;        // Tab, auf dem die Navigation zur Ruhe kam (für ‹ Zurück)
      this.history = [];
      this.ready = false;         // Verlauf zählt erst ab der ersten Startseite (vorher läuft der App-Start)
      this.backTo = null;
      this.menu = null;           // null | 'root' | 'belegung' | 'einstellungen'
      this.picker = false;        // Auswahlliste des Umschalters in der Mitte
      document.addEventListener('tabchanged', e => {
        this.tab = e.detail?.tabName || null;
        this.closeAll();
        this.render();
        // navigateToTab() springt bei Bereichen erst auf die erste Unterseite, dann aufs Ziel -- nur das Ziel zählt
        clearTimeout(this.settleTimer);
        this.settleTimer = setTimeout(() => this.settle(), 0);
      });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && (this.menu || this.picker)) this.closeAll(); });
      window.addEventListener('resize', () => { if (this.picker) this.renderPicker(); });
    }

    // Seite gibt es im aktiven Spiel (GPS/Planer fehlen bei eigenen Spielen ohne Spieldaten)
    available(tab) {
      const btn = document.querySelector(`.main-tab-btn[data-tab="${tab}"]`);
      return !!document.getElementById(`tab-${tab}`) && !btn?.classList.contains('feature-off');
    }
    eigene() { return window.steuerungsmenues?.pages || []; }
    // Alle Kacheln mit eigener Seite: erst die feste (soweit das Spiel sie hat), dann die eigenen
    bausteine() {
      return [...BUILTIN.filter(([t]) => this.available(t)).map(([tab, name, desc]) => ({ tab, name, desc, own: false })),
        ...this.eigene().map(p => ({ tab: p.id, name: p.name, own: true }))];
    }

    // ---------- wo bin ich ----------
    loc() {
      const t = this.tab;
      if (window.tilePages?.home || t === 'dashboard-tiles') return { kind: 'home' };
      const b = this.bausteine().find(x => x.tab === t);
      if (b) return { kind: 'baustein', b };
      for (const a of AREAS) {
        const sub = a.subs.find(s => subHas(s, t));
        if (sub) return { kind: 'area', area: a, sub };
      }
      const [area, name] = SINGLE[t] || ['', document.querySelector(`.main-tab-btn[data-tab="${t}"]`)?.dataset.title || ''];
      return { kind: 'single', area, name, tabs: SINGLE_TABS.find(g => g.some(([x]) => x === t)) || null };
    }

    // zwei Reiter derselben Seite: im selben Bereich-Unterpunkt oder in derselben Reitergruppe (SINGLE_TABS)
    geschwister(a, b) {
      if (SINGLE_TABS.some(g => g.some(([x]) => x === a) && g.some(([x]) => x === b))) return true;
      return AREAS.some(ar => ar.subs.some(s => subHas(s, a) && subHas(s, b)));
    }

    settle() {
      const t = this.tab;
      if (!t || t === this.settled) return;
      if (!this.ready) {
        if (t === 'dashboard-tiles') { this.ready = true; this.history = []; }
      } else if (this.backTo === t) {
        this.backTo = null;
      } else if (this.settled && !this.geschwister(this.settled, t)) {
        // Reiter derselben Seite (z. B. GPS: Aktuelles Gerät · Geräte verwalten) zählen nicht als eigener Schritt --
        // „Zurück“ führt zur Seite davor (Durchsicht 24.10.2026)
        this.history.push(this.settled);
        if (this.history.length > 30) this.history.shift();
      }
      this.settled = t;
      this.render();
    }

    // ---------- Navigation ----------
    go(tab) {
      this.closeAll();
      Promise.resolve(window.app?.navigateToTab(tab)).then(() => {
        if (tab === 'sm-manage') window.steuerungsmenues?.renderManagePage();
      });
    }

    async home() {
      this.closeAll();
      const tp = window.tilePages;
      if (!tp) { window.app?.navigateToTab('overview'); return; }
      if (window.steuerungsmenues?.editingPageId) await window.steuerungsmenues.exitEditMode(null, { navigate: false });
      if (tp.home) { tp.full = null; tp.sheet = null; tp.render(); return; }
      tp.enterHome();
    }

    // Erst offene Fenster/Vollbild/Einrichten schließen, dann eine Seite zurück
    back() {
      if (this.menu || this.picker || window.statusMenus?.isOpen) { this.closeAll(); return; }
      const tp = window.tilePages;
      if (tp?.home && tp.manage) { tp.closeManage(); return; }
      if (tp?.home && tp.sheet) { tp.closeSheet(); return; }
      if (tp?.home && tp.full) { tp.closeFull(); return; }
      if (tp?.home && tp.editing) { tp.edit(false); return; }
      const sm = window.steuerungsmenues;
      if (sm?.editingPageId) { sm.exitEditMode(sm.editingPageId); return; }
      const prev = this.history.pop();
      if (!prev) return;
      this.backTo = prev;
      if (prev === 'dashboard-tiles') this.home(); else window.app?.navigateToTab(prev);
    }

    canBack() {
      const tp = window.tilePages;
      return this.history.length > 0 || !!(tp?.home && (tp.full || tp.sheet || tp.editing)) || !!window.steuerungsmenues?.editingPageId;
    }

    // ‹ › neben dem Umschalter
    step(d) {
      this.closeAll();
      const L = this.loc();
      if (L.kind === 'home') {
        const tp = window.tilePages;
        const list = tp?.visiblePages || [];
        if (list.length < 2) return;
        const i = Math.max(0, list.findIndex(p => p.id === tp.page?.id));
        tp.goTo(list[(i + d + list.length) % list.length].id, true);
      } else if (L.kind === 'baustein') {
        if (window.steuerungsmenues?.editingPageId) return;
        const list = this.bausteine();
        const i = list.findIndex(x => x.tab === L.b.tab);
        if (list.length > 1) this.go(list[(i + d + list.length) % list.length].tab);
      } else if (L.kind === 'area') {
        const subs = L.area.subs;
        const i = subs.indexOf(L.sub);
        this.go(subTab(subs[(i + d + subs.length) % subs.length]));
      }
    }

    // ---------- Fenster ----------
    closeAll(except) {
      if (except !== 'menu' && this.menu) { this.menu = null; this.renderMenu(); }
      if (except !== 'picker' && this.picker) { this.picker = false; this.renderPicker(); this.renderCenter(); }
      if (except !== 'status') window.statusMenus?.close();
    }

    toggleMenu(on) {
      const open = on ?? !this.menu;
      this.closeAll('menu');
      this.menu = open ? 'root' : null;
      this.renderMenu();
    }
    openGroup(id) { this.menu = id || 'root'; this.renderMenu(); }

    togglePicker() {
      const open = !this.picker;
      this.closeAll('picker');
      this.picker = open;
      this.renderPicker();
      this.renderCenter();
    }

    // ---------- Zeichnen ----------
    render() {
      this.renderCenter();
      this.renderTabs();
      const back = document.getElementById('tb-back');
      if (back) back.disabled = !this.canBack();
      document.getElementById('tb-home')?.classList.toggle('on', !!window.tilePages?.home);
      if (this.menu) this.renderMenu();
    }
    renderBar() { this.render(); }   // ältere Aufrufer (tiles.js, steuerungsmenues.js)

    renderCenter() {
      const el = document.getElementById('tb-center');
      if (!el) return;
      const L = this.loc();
      let area = L.area || '', name = L.name || '', sub = '', list = false, count = 0, extra = '', chip = '';
      if (L.kind === 'home') {
        const tp = window.tilePages;
        const pages = tp?.visiblePages || [];
        const p = tp?.page;
        area = 'Startseite';
        name = p?.name || 'Startseite';
        sub = tp?.editing ? 'wird bearbeitet' : p ? `${this.pageKind(p)} · Seite ${pages.indexOf(p) + 1} von ${pages.length}` : 'noch keine Seite';
        list = true;
        count = pages.length;
        if (tp?.editing) extra = `<button type="button" class="tb-action on" onclick="window.tilePages.edit(false)">Fertig</button>`;
      } else if (L.kind === 'baustein') {
        const all = this.bausteine();
        const i = all.findIndex(x => x.tab === L.b.tab);
        const editing = L.b.own && window.steuerungsmenues?.editingPageId === L.b.tab;
        area = 'Kacheln';
        name = L.b.name;
        sub = editing ? 'wird bearbeitet' : `${L.b.own ? 'Kachel' : 'feste Kachel'} · ${i + 1} von ${all.length}`;
        list = !editing;
        count = all.length;
        if (L.b.own && window.steuerungsmenues?.settingsOnly(L.b.tab)) extra = `<button type="button" class="tb-action" onclick="window.appNav.go('sm-manage')">Module wählen ›</button>`;
        else if (L.b.own) extra = editing
          ? `<button type="button" class="tb-action on" onclick="window.steuerungsmenues.exitEditMode('${esc(L.b.tab)}')">Fertig</button>`
          : `<button type="button" class="tb-action" onclick="window.steuerungsmenues.enterEditMode('${esc(L.b.tab)}')">✎ Bearbeiten</button>`;
      } else if (L.kind === 'area') {
        const subs = L.area.subs;
        area = L.area.title;
        name = L.sub.name;
        sub = `${subs.indexOf(L.sub) + 1} von ${subs.length}`;
        list = true;
        count = subs.length;
      }
      const text = `<span class="tb-switch-text"><b>${esc(name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>`;
      el.innerHTML = `
        ${area ? `<span class="tb-area">${esc(area)}</span>` : ''}
        ${list ? `<button type="button" class="tb-step" aria-label="Vorherige Seite" onclick="window.appNav.step(-1)" ${count < 2 ? 'disabled' : ''}>‹</button>
          <button type="button" class="tb-switch ${this.picker ? 'open' : ''}" aria-haspopup="menu" aria-expanded="${this.picker}" onclick="window.appNav.togglePicker()">${text}${CHEVRON}</button>
          <button type="button" class="tb-step" aria-label="Nächste Seite" onclick="window.appNav.step(1)" ${count < 2 ? 'disabled' : ''}>›</button>`
          : name ? `<span class="tb-switch tb-switch--static">${text}</span>` : ''}
        ${extra}${chip}`;
    }

    pageKind(p) {
      return (window.TileGrid?.isProfilePage(p) ? `Profilseite: nur ${p.profiles.map(profilAnzeige).join(', ')}` : 'Standardseite, alle Profile') + (p.haupt ? ' · Hauptseite' : '');
    }

    // Reiter über dem Inhalt (z. B. Armlehne einrichten: Setup · Achsen-Kalibrierung · Geräte-Einstellungen)
    renderTabs() {
      const el = document.getElementById('page-tabs');
      if (!el) return;
      const L = this.loc();
      const alle = L.kind === 'area' ? L.sub.tabs : L.kind === 'single' ? L.tabs : null;
      const tabs = alle ? alle.filter(([t]) => this.available(t)) : [];
      el.hidden = tabs.length < 2;
      el.innerHTML = tabs.length < 2 ? '' : `<div class="ui-seg page-tabs-seg">${tabs.map(([t, l]) =>
        `<button type="button" class="${t === this.tab ? 'on' : ''}" onclick="window.appNav.go('${t}')">${esc(l)}</button>`).join('')}</div>`;
    }

    // Auswahlliste unter dem Umschalter
    renderPicker() {
      let el = document.getElementById('tb-picker');
      if (!this.picker) { el?.remove(); return; }
      if (!el) {
        el = document.createElement('div');
        el.id = 'tb-picker';
        el.className = 'tb-pop-wrap';
        document.body.appendChild(el);
      }
      el.innerHTML = `<button type="button" class="tb-pop-backdrop" aria-label="Schließen" onclick="window.appNav.closeAll()"></button>
        <div class="tb-pop tb-pop--center" role="menu">${this.pickerHtml()}</div>`;
      const pop = el.querySelector('.tb-pop');
      const r = document.querySelector('#tb-center .tb-switch')?.getBoundingClientRect();
      if (r) pop.style.left = `${Math.round(Math.max(12, Math.min(r.left + r.width / 2 - pop.offsetWidth / 2, window.innerWidth - pop.offsetWidth - 12)))}px`;
    }

    pickerHtml() {
      const L = this.loc();
      const item = (name, kind, on, onclick) => `<button type="button" class="tb-pick ${on ? 'on' : ''}" onclick="${onclick}">
          <span class="tb-pick-text"><b>${esc(name)}</b>${kind ? `<small>${esc(kind)}</small>` : ''}</span><span class="tb-check">${on ? '✓' : ''}</span></button>`;
      if (L.kind === 'home') {
        const tp = window.tilePages;
        const pages = tp?.visiblePages || [];
        return `<div class="sheet-kicker">Seiten der Startseite</div>
          ${pages.map(p => item(p.name, this.pageKind(p), p.id === tp.page?.id, `window.appNav.closeAll(); window.tilePages.goTo('${esc(p.id)}', true)`)).join('')
            || '<p class="app-menu-empty">Noch keine Seite.</p>'}
          <div class="app-menu-sep"></div>
          <button type="button" class="tb-pick-btn tb-pick-btn--wide" onclick="window.appNav.closeAll(); window.tilePages.openManage()" ${tp?.pages?.length ? '' : 'disabled'}>Seiten verwalten</button>
          <div class="tb-pick-row">
            <button type="button" class="tb-pick-btn" onclick="window.appNav.closeAll(); window.tilePages.edit(true)" ${pages.length ? '' : 'disabled'}>Seite bearbeiten</button>
            <button type="button" class="tb-pick-btn tb-pick-btn--add" onclick="window.appNav.closeAll(); window.tilePages.addPageDialog()">+ Neue Seite</button>
          </div>`;
      }
      if (L.kind === 'baustein' || this.tab === 'sm-manage') {
        const all = this.bausteine();
        const pick = b => item(b.name, '', b.tab === this.tab, `window.appNav.go('${esc(b.tab)}')`);
        return `<div class="sheet-kicker">Kacheln</div>
          ${all.map(pick).join('')}
          <div class="app-menu-sep"></div>
          <div class="tb-pick-row">
            <button type="button" class="tb-pick-btn" onclick="window.appNav.go('sm-manage')">Alle Kacheln</button>
            <button type="button" class="tb-pick-btn tb-pick-btn--add" onclick="window.appNav.closeAll(); window.steuerungsmenues.addPage()">+ Neue Kachel</button>
          </div>`;
      }
      if (L.kind === 'area') {
        return `<div class="sheet-kicker">${esc(L.area.title)}</div>
          ${L.area.subs.map(s => item(s.name, s.tabs ? s.tabs.map(([, l]) => l).join(' · ') : '', s === L.sub, `window.appNav.go('${subTab(s)}')`)).join('')}`;
      }
      return '';
    }

    // ---------- Menü mit Untermenüs ----------
    renderMenu() {
      let el = document.getElementById('app-menu');
      document.getElementById('tb-menu')?.classList.toggle('on', !!this.menu);
      if (!this.menu) { el?.remove(); return; }
      if (!el) {
        el = document.createElement('div');
        el.id = 'app-menu';
        el.className = 'tb-pop-wrap';
        document.body.appendChild(el);
      }
      el.innerHTML = `<button type="button" class="tb-pop-backdrop" aria-label="Menü schließen" onclick="window.appNav.toggleMenu(false)"></button>
        <nav class="tb-pop tb-pop--left app-menu" aria-label="Menü">${this.menu === 'root' ? this.rootHtml() : this.groupHtml(this.menu)}</nav>`;
    }

    rootHtml() {
      const L = this.loc();
      const row = (icon, title, small, onclick, chev, on) => `<button type="button" class="app-menu-group ${on ? 'on' : ''}" onclick="${onclick}">
          <span class="app-menu-icon">${ICONS[icon]}</span>
          <span class="app-menu-text"><b>${esc(title)}</b><small>${esc(small)}</small></span>
          ${chev ? '<span class="app-menu-chev">›</span>' : ''}
        </button>`;
      const rows = [];
      if (this.available('gps')) rows.push(row('gps', 'GPS', 'Aktuelles Gerät, Vorgewende · Geräte verwalten', "window.appNav.go('gps')", false, this.tab === 'gps' || this.tab === 'gps-geraete'));
      if (this.available('dashboard-planner')) rows.push(row('planer', 'Arbeitsplaner', 'Felder, Fruchtfolge & Schritte, Planer-Satz', "window.appNav.go('dashboard-planner')", false, this.tab === 'dashboard-planner'));
      const names = this.bausteine().map(b => b.name);
      rows.push(row('bausteine', 'Kacheln', names.slice(0, 4).join(' · ') + (names.length > 4 ? ' …' : ''),
        "window.appNav.go('sm-manage')", false, L.kind === 'baustein' || this.tab === 'sm-manage'));
      for (const a of AREAS) {
        const small = a.id === 'einstellungen' ? 'Allgemein · Karte · Verbindung · Sichern · Controller · Entwickler' : a.subs.map(s => s.name).join(' · ');
        rows.push(row(a.id, a.title, small, `window.appNav.openGroup('${a.id}')`, true, L.area?.id === a.id));
      }
      return `<div class="app-menu-head"><b>Menü</b></div>${rows.join('')}`;
    }

    groupHtml(id) {
      const a = AREAS.find(x => x.id === id);
      if (!a) return '';
      return `<div class="app-menu-head">
          <button type="button" class="app-menu-back" onclick="window.appNav.openGroup('root')">‹ Menü</button><b>${esc(a.title)}</b>
        </div>
        ${a.subs.map(s => `<button type="button" class="app-menu-item ${subHas(s, this.tab) ? 'on' : ''}" onclick="window.appNav.go('${subTab(s)}')">${esc(s.name)}</button>`).join('')}`;
    }
  }

  window.appNav = new AppNav();
})();
