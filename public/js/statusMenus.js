/**
 * Statusfenster der Kopfleiste (Mockup „Navigation und Seiten“, Hendrik 22.10.2026): der Knopf rechts oben
 * (Armlehne · Profil · Uhrzeit) öffnet EIN Fenster mit allem, was vorher einzeln in der Statusleiste stand:
 * Armlehne verbinden/trennen, Profil als Auswahlliste (bleibt auch bei vielen Profilen ruhig, Hendrik),
 * Auto-Wechsel samt „Zuordnen“ des gewählten Fahrzeugs/Geräts zum aktiven Profil, laufendes Makro abbrechen,
 * Uhrzeit Echt/Im Spiel, Spiel und Einstellungen.
 * Der Makro-Hinweis neben dem Knopf (nur solange ein Makro läuft) öffnet dasselbe Fenster.
 * Schließt bei Tipp daneben oder Escape. Nutzt nur, was die Seiten schon können (app.js, games.js,
 * macroStatusIndicator.js) -- hier liegt keine eigene Logik.
 */
(function () {
  const esc = escapeHtml;   // js/basis.js (Durchsicht B9: vorher eigene Kopie)
  const CHEVRON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>';

  class StatusMenus {
    constructor() {
      this.el = null;
      this.profOpen = false;
      document.addEventListener('keydown', e => { if (e.key === 'Escape') this.close(); });
      // Offenes Fenster folgt dem Stand, den app.js/games.js in die (alten) Status-Elemente schreiben
      document.addEventListener('DOMContentLoaded', () => {
        const watch = new MutationObserver(() => this.refresh());
        ['connection-status', 'current-profile', 'auto-switch-status', 'active-game-badge'].forEach(id => {
          const el = document.getElementById(id);
          if (el) watch.observe(el, { attributes: true, childList: true, characterData: true, subtree: true });
        });
      });
    }

    get isOpen() { return !!this.el; }

    // kind: 'status' (Knopf) oder 'makro' (Makro-Hinweis) -- beides öffnet dasselbe Fenster
    toggle() {
      if (this.el) { this.close(); return; }
      this.open();
    }

    // Gewähltes Fahrzeug bzw. Gerät im Spiel (wie der Wert „Gewähltes Gerät“) und welchen Profilen es zugeordnet ist;
    // null ohne Spieldaten oder zu Fuß. Der Name ist derselbe, den der Auto-Wechsel vergleicht (Mod: getFullName).
    zuordnung() {
      const d = window.anzeigen?.data;
      if (!d || d.available === false || !d.inVehicle) return null;
      const u = Array.isArray(d.units) ? d.units.find(x => x.selected) : null;
      const name = String(u?.name || d.vehicleName || '').trim();
      if (!name) return null;
      const bei = (window.app?.allProfiles || []).filter(p => (p.autoSwitchTriggers || []).includes(name)).map(p => p.name);
      return { name, art: u && u.side !== 'self' ? 'Gerät' : 'Fahrzeug', bei };
    }

    // Zuordnen bzw. Entfernen (Hendrik 24.10.2026): wirkt auf das geladene Profil; ein anderswo zugeordnetes Gerät zieht um
    async zuordnen() {
      const z = this.zuordnung(), cur = window.app?.currentProfile;
      if (!z || !cur) return;
      if (profilGeschuetzt(cur)) return gamepadModusHinweis();
      const hier = z.bei.includes(cur);
      try {
        const r = await fetch('/api/auto-switch/zuordnung', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: z.name, zuordnen: !hier }) }).then(x => x.json());
        if (!r.success) throw new Error(r.error);
        window.showToast?.(hier ? `„${z.name}“ ist keinem Profil mehr zugeordnet`
          : `„${z.name}“ → ${profilAnzeige(cur)}${r.vorher.length ? ` (vorher ${r.vorher.map(profilAnzeige).join(', ')})` : ''}`);
        await window.app?.loadProfiles();
        this.refresh();
      } catch (e) {
        uiAlert('Zuordnen nicht möglich: ' + e.message);
      }
    }

    open() {
      window.appNav?.closeAll('status');
      // Fahrzeugwechsel im Spiel bei offenem Fenster: Zeile „Zuordnen“ nachführen (nur wenn sie sich ändert)
      if (!this.abo && window.anzeigen?.subscribe) {
        this.abo = window.anzeigen.subscribe(() => { if (this.el && JSON.stringify(this.zuordnung()) !== this.zoKey) this.render(); });
      }
      this.el = document.createElement('div');
      this.el.className = 'tb-pop-wrap';
      this.el.innerHTML = `<button type="button" class="tb-pop-backdrop" aria-label="Schließen" data-act="close"></button>
        <div class="tb-pop tb-pop--right status-win" role="dialog" aria-label="Status"></div>`;
      this.el.addEventListener('click', e => {
        const btn = e.target.closest('[data-act]');
        if (btn) this.act(btn.dataset.act, btn.dataset.v);
      });
      document.body.appendChild(this.el);
      document.getElementById('tb-status')?.classList.add('open');
      this.render();
    }

    // Neu zeichnen, wenn sich der Stand ändert, während das Fenster offen ist (z. B. Makro-Schritt)
    refresh() { if (this.el) this.render(); }

    close() {
      if (!this.el) return;
      this.el.remove();
      this.el = null;
      this.profOpen = false;
      document.getElementById('tb-status')?.classList.remove('open');
    }

    render() {
      const app = window.app;
      const connected = !!document.getElementById('connection-status')?.classList.contains('connected');
      const port = document.getElementById('port-select')?.value || '';
      const auto = !!document.getElementById('auto-switch-status')?.classList.contains('connected');
      // Auto-Wechsel braucht Fahrzeugnamen aus dem Spiel (eigene Spiele ohne Spieldaten haben ihn nicht)
      const autoAvailable = (window.gameSwitcher?.activeGame?.features || []).includes('vehicleNames');
      const profiles = app?.allProfiles || [];
      const cur = app?.currentProfile || '';
      const m = window.macroStatusIndicator?.status || { active: false };
      const clock = (() => { try { return localStorage.getItem('clockMode') || 'real'; } catch { return 'real'; } })();
      const game = window.gameSwitcher?.activeGame?.name || '–';
      const games = window.gameSwitcher?.games || [];

      const connText = connected ? `Verbunden${port ? ` · ${port}` : ''}` : 'Getrennt – der Controller arbeitet allein weiter';
      const connBtn = connected ? 'Trennen' : port ? 'Verbinden' : 'Einrichten ›';
      const macroName = m.macroName || m.macroId;
      const macroText = m.active ? `„${macroName}“ · Schritt ${m.step} von ${m.total}${m.waiting ? ' · wartet auf Tastendruck' : ''}` : 'Kein Makro aktiv';

      this.el.querySelector('.status-win').innerHTML = `
        <section class="sw-sec">
          <div class="sheet-kicker">${esc(window.controllerInfo?.profile?.name || 'Controller')}</div>
          <div class="sw-row"><span class="sw-dot ${connected ? 'on' : ''}"></span><span class="sw-grow">${esc(connText)}</span>
            <button type="button" class="sw-btn" data-act="conn">${connBtn}</button></div>
        </section>
        <section class="sw-sec">
          <div class="sheet-kicker">Profil</div>
          <button type="button" class="sw-select ${this.profOpen ? 'open' : ''}" aria-haspopup="listbox" aria-expanded="${this.profOpen}" data-act="prof">
            <b>${esc(cur ? profilAnzeige(cur) : 'kein Profil')}</b><small>${profiles.length} ${profiles.length === 1 ? 'Profil' : 'Profile'}</small>${CHEVRON}</button>
          ${this.profOpen ? `<div class="sw-list" role="listbox" aria-label="Profil wählen">
            ${profiles.map((p, i) => `<button type="button" role="option" aria-selected="${p.name === cur}" class="sw-opt ${p.name === cur ? 'on' : ''}" data-act="pick" data-v="${i}"><span>${esc(profilAnzeige(p.name))}</span><span class="tb-check">${p.name === cur ? '✓' : ''}</span></button>`).join('')}
            <button type="button" class="sw-opt sw-opt--more" data-act="profiles">Profile verwalten …</button>
          </div>` : ''}
          ${autoAvailable ? `<button type="button" role="switch" aria-checked="${auto}" class="sheet-switch" data-act="auto"><span>Auto-Wechsel: Profil folgt dem Gerät</span><span class="ui-switch ${auto ? 'on' : ''}"><span></span></span></button>
            ${this.zuordnungHtml(cur)}` : ''}
        </section>
        <section class="sw-sec">
          <div class="sheet-kicker">Makro</div>
          <div class="sw-row"><span class="sw-grow">${esc(macroText)}</span>
            ${m.active ? '<button type="button" class="sw-btn" data-act="macro-open">Öffnen</button><button type="button" class="sw-btn danger" data-act="macro-abort">Abbrechen</button>'
              : '<button type="button" class="sw-btn" data-act="macros">Makros ›</button>'}</div>
        </section>
        <div class="sw-row">
          <span class="sheet-kicker sw-grow">Uhrzeit oben</span>
          <div class="ui-seg"><button type="button" class="${clock === 'real' ? 'on' : ''}" data-act="clock" data-v="real">Echt</button><button type="button" class="${clock === 'ingame' ? 'on' : ''}" data-act="clock" data-v="ingame">Im Spiel</button></div>
        </div>
        <div class="sw-row sw-foot">
          <span class="sw-grow">Spiel: <b>${esc(game)}</b></span>
          ${games.length > 1 ? '<button type="button" class="sw-btn" data-act="game">Wechseln …</button>' : ''}
          <button type="button" class="sw-btn" data-act="settings">Einstellungen ›</button>
        </div>`;
      if (this.profOpen) this.el.querySelector('.sw-opt.on')?.scrollIntoView({ block: 'nearest' });
    }

    zuordnungHtml(cur) {
      const z = this.zuordnung();
      this.zoKey = JSON.stringify(z);
      if (!z) return '<div class="sw-row sw-zo"><span class="sw-grow"><small>Im Spiel in ein Fahrzeug steigen, dann lässt es sich hier dem Profil zuordnen.</small></span></div>';
      const hier = z.bei.includes(cur), gesperrt = profilGeschuetzt(cur);
      const stand = hier ? `zugeordnet: ${esc(profilAnzeige(cur))}` : z.bei.length ? `zugeordnet: ${esc(z.bei.map(profilAnzeige).join(', '))}` : 'keinem Profil zugeordnet';
      return `<div class="sw-row sw-zo">
          <span class="sw-grow"><b>${esc(z.name)}</b><small>${z.art} · ${stand}${gesperrt ? ` · im ${PROFIL_STANDARD_NAME} nicht zuzuordnen` : ''}</small></span>
          <button type="button" class="sw-btn ${hier ? 'danger' : ''}" data-act="zuordnen" ${gesperrt ? 'disabled' : ''}
            title="${hier ? 'Aus der Zuordnung dieses Profils entfernen' : `Dem Profil ${esc(profilAnzeige(cur))} zuordnen`}">${hier ? 'Entfernen' : 'Zuordnen'}</button></div>`;
    }

    async act(what, v) {
      const app = window.app;
      if (what === 'close') { this.close(); return; }
      if (what === 'conn') {
        const connected = document.getElementById('connection-status')?.classList.contains('connected');
        const port = document.getElementById('port-select')?.value;
        if (connected) document.getElementById('disconnect')?.click();
        else if (port) document.getElementById('connect')?.click();
        else { this.close(); app?.navigateToTab('connection'); }
        return;
      }
      if (what === 'prof') { this.profOpen = !this.profOpen; this.render(); return; }
      if (what === 'pick') {
        const p = (app?.allProfiles || [])[Number(v)];
        this.close();
        if (p) app.selectProfileFromList(p.name);
        return;
      }
      if (what === 'profiles') { this.close(); app?.navigateToTab('profiles'); return; }
      if (what === 'auto') { app?.toggleAutoSwitch(); return; }       // Rückmeldung kommt per Socket, refresh() zeichnet neu
      if (what === 'zuordnen') { this.zuordnen(); return; }
      if (what === 'macro-abort') { this.abortMacro(); return; }
      if (what === 'macro-open') { this.close(); window.macroStatusIndicator?.openActiveMacro(); return; }
      if (what === 'macros') { this.close(); app?.navigateToTab('vorgewende'); return; }
      if (what === 'clock') {
        app?.setClockMode(v);
        const sel = document.getElementById('clock-mode-select');
        if (sel) sel.value = v;
        this.render();
        return;
      }
      if (what === 'settings') { this.close(); app?.navigateToTab('status'); return; }
      if (what === 'game') {
        this.close();
        const gs = window.gameSwitcher;
        const id = await uiChoice('Zu welchem Spiel wechseln? Die Seite lädt danach neu.',
          gs.games.filter(g => g.id !== gs.active).map(g => ({ label: g.name, value: g.id })), { title: 'Spiel wechseln' });
        if (id) gs.switchTo(id);
      }
    }

    async abortMacro() {
      try {
        const res = await fetch('/api/macro/abort', { method: 'POST' });
        if (!(await res.json()).success) throw new Error();
        window.showToast?.('Makro abgebrochen');
      } catch {
        uiAlert('Makro konnte nicht abgebrochen werden.');
      }
    }
  }

  window.statusMenus = new StatusMenus();
})();
