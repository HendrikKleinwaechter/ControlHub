/**
 * Controller und Geräteprofile in der Oberfläche (23.10.2026, Server: server/controllerManager.js).
 *
 * - Hält window.controllerInfo (aktiver Controller, Module, Achsen, Fähigkeiten) aktuell und meldet Änderungen per
 *   Dokument-Ereignis 'controllerinfo' (Tastenbelegung, Steuerungsübersicht, Achsen hören darauf).
 * - Trägt Achsen ohne festen Namen (z. B. Poti am CraftLink, eigene Controller) in die Achsen-Tabellen ein
 *   (PHYSICAL_AXIS_INDEX/KEY_LABELS aus axisAssignment.js, AXIS_LABELS aus moduleFlow.js).
 * - Blendet Seiten aus, die das Gerät nicht hat (data-ctrl-kann="…" an den Navigations-Knöpfen).
 * - Reiter „Gerät“ (Einstellungen → Controller) und „Module“ (Baukasten, ersetzt das Armlehnen-Setup).
 * - Wechselt der Controller (erkannt oder von Hand), lädt die Seite neu -- wie beim Spielwechsel.
 */
// eigene Maskierung: ctrlEsc() aus steuerungsmenues.js ist beim ersten Laden evtl. noch nicht da
const ctrlEsc = escapeHtml;   // js/basis.js (Durchsicht B9: vorher eigene Kopie)

class ControllerUi {
  constructor() {
    this.info = null;
    this.connected = false;
    this.suggestion = null;   // Vorschlag aus „Erkennen“ (noch nicht gespeichert)
    this.socket = window.hubSocket;   // gemeinsame Verbindung der Seite (hubSocket.js, B4)
    this.socket.on('controller-changed', () => window.location.reload());
    this.socket.on('controller-setup-changed', (p) => this.apply(p));
    this.socket.on('controller-info', (p) => this.apply(p));
    this.socket.on('controller-unknown', (d) => this.unknown(d));
    this.socket.on('serialStatus', (s) => { this.connected = !!s?.connected; this.renderGeraet(); });
    this.socket.on('status', (s) => { this.connected = !!s?.serial?.connected; this.renderGeraet(); });
    document.addEventListener('tabchanged', e => {
      if (e.detail?.tabName === 'controller-geraet' || e.detail?.tabName === 'armlehnen-setup') this.load();
    });
    this.load();
  }

  get kann() { return this.info?.profile?.kann || {}; }

  async load() {
    try {
      const res = await fetch('/api/controller');
      const data = await res.json();
      if (data.success) this.apply(data);
    } catch (e) {
      console.warn('Controller nicht ladbar:', e);
    }
  }

  apply(payload) {
    if (!payload?.success) return;
    const first = !this.info;
    const modulesBefore = JSON.stringify([this.info?.modules || null, this.info?.farbe || null]);   // Farbe: andere Modulbilder
    if (payload.belegungen === undefined && this.info?.belegungen) payload.belegungen = this.info.belegungen;   // kommt nur mit GET /api/controller
    this.info = payload;
    window.controllerInfo = payload;
    this.registerAxes();
    this.applyCapabilities();
    this.renderStatusName();
    this.renderGeraet();
    this.renderModule();
    if (first || JSON.stringify([payload.modules, payload.farbe || null]) !== modulesBefore) {
      document.dispatchEvent(new CustomEvent('controllerinfo', { detail: payload }));
    }
  }

  registerAxes() {
    for (const a of this.info.axes || []) {
      if (typeof PHYSICAL_AXIS_INDEX !== 'undefined' && !(a.key in PHYSICAL_AXIS_INDEX)) PHYSICAL_AXIS_INDEX[a.key] = a.index;
      if (typeof KEY_LABELS !== 'undefined' && !(a.key in KEY_LABELS)) KEY_LABELS[a.key] = a.label;
      if (typeof AXIS_LABELS !== 'undefined' && !(a.key in AXIS_LABELS)) AXIS_LABELS[a.key] = a.label;
    }
  }

  applyCapabilities() {
    const kann = this.kann;
    document.querySelectorAll('[data-ctrl-kann]').forEach(el => {
      el.classList.toggle('feature-off', !kann[el.dataset.ctrlKann]);
    });
    const fingertipDa = (this.info.modules || []).some(m => m.id === 'fingertip');
    document.getElementById('kappenfarben-card')?.toggleAttribute('hidden', !(kann.kappenfarben && fingertipDa));
    window.appNav?.render?.();
  }

  // Statusknopf oben rechts: Gerätename statt „Armlehne“
  renderStatusName() {
    const name = this.info.profile?.name || 'Controller';
    document.querySelectorAll('.tb-status-label').forEach(el => { el.textContent = name; });
    document.getElementById('tb-status')?.setAttribute('aria-label', `Status: ${name}, Profil, Uhrzeit`);
  }

  // ---- Reiter „Gerät“ ----
  renderGeraet() {
    const body = document.getElementById('controller-geraet-body');
    if (!body || !this.info) return;
    const p = this.info.profile;
    const inf = this.info.info;
    const fw = inf?.firmware ? `Firmware ${ctrlEsc(String(inf.firmware))}` : '';
    const seen = inf?.seenAt ? new Date(inf.seenAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '';
    const state = this.connected
      ? `<span class="sw-dot on"></span><span><b>${ctrlEsc(p.name)}</b> ist verbunden${fw ? ` · ${fw}` : ''}</span>`
      : `<span class="sw-dot"></span><span>Kein Controller verbunden – eingestellt ist <b>${ctrlEsc(p.name)}</b>${seen ? ` (zuletzt gesehen ${ctrlEsc(seen)}${fw ? `, ${fw}` : ''})` : ''}</span>`;
    const options = this.info.profiles.map(x => `<option value="${ctrlEsc(x.id)}" ${x.id === p.id ? 'selected' : ''}>${ctrlEsc(x.name)}${x.builtin ? '' : ' (eigener)'}</option>`).join('');
    body.innerHTML = `
      <div class="ctrl-state">${state}</div>
      <div class="input-group" style="margin-top: 16px;">
        <label for="ctrl-profile-select">Geräteprofil:</label>
        <select id="ctrl-profile-select" onchange="window.controllerUi.select(this.value)">${options}</select>
        <button type="button" class="btn-secondary btn-small" onclick="window.controllerUi.detect()" ${this.connected ? '' : 'disabled'}>Neu erkennen</button>
      </div>
      <p class="setting-hint">ControlHub erkennt beim Verbinden selbst, welcher Controller angeschlossen ist. Von Hand umstellen
        brauchst du nur bei einem Selbstbau mit fremder Firmware.</p>
      <h4 style="margin: 22px 0 6px;">Profile (Belegungen)</h4>
      <p class="setting-hint" style="margin-top: 0;">Jeder Controller hat in jedem Spiel seine eigenen Profile und seinen eigenen Auto-Wechsel.
        Funktionen, Makros und Kacheln gelten für alle Controller.</p>
      ${(this.info.belegungen || []).length ? `
      <div class="input-group">
        <label for="ctrl-copy-from">Übernehmen von:</label>
        <select id="ctrl-copy-from">${this.info.belegungen.map(id => `<option value="${ctrlEsc(id)}">${ctrlEsc(this.info.profiles.find(x => x.id === id)?.name || id)}</option>`).join('')}</select>
        <button type="button" class="btn-secondary btn-small" onclick="window.controllerUi.copyProfiles()">Profile übernehmen</button>
      </div>` : ''}
      <p class="setting-hint">Eigene Controller (Selbstbau) richtest du unter <b>Für Entwickler → Eigene Controller</b> ein.</p>`;
  }

  async select(id) {
    if (!id || id === this.info?.active) return;
    const ok = await uiConfirm(`Auf „${this.info.profiles.find(p => p.id === id)?.name || id}“ umstellen? Die Seite lädt danach neu.`, { title: 'Controller wechseln', ok: 'Umstellen' });
    if (!ok) { this.renderGeraet(); return; }
    const r = await this.post('/api/controller/select', { id });
    if (!r) this.renderGeraet();
  }

  async copyProfiles() {
    const from = document.getElementById('ctrl-copy-from')?.value;
    if (!from) return;
    const fromName = this.info.profiles.find(x => x.id === from)?.name || from;
    const ok = await uiConfirm(`Alle Profile, den Auto-Wechsel und die Ebenentaster von „${fromName}“ für „${this.info.profile.name}“ übernehmen? `
      + 'Die bisherigen Profile dieses Controllers werden ersetzt (eine Sicherung bleibt im Ordner _sicherung). Die Tastennummern passen nur, wenn beide Controller gleich aufgebaut sind.',
      { title: 'Profile übernehmen', ok: 'Übernehmen', danger: true });
    if (!ok) return;
    await this.post('/api/controller/copy-profiles', { from });   // danach lädt die Seite über 'controller-changed' neu
  }

  // Unbekannter Controller angesteckt (device=… ohne Geräteprofil): anbieten, ihn im Editor „Eigene Controller“
  // einzurichten (Für Entwickler, fragt nach dem Code)
  async unknown(d) {
    if (!d?.device || this.unknownAsked === d.device) return;
    this.unknownAsked = d.device;
    const ok = await uiConfirm(`Ein unbekannter Controller ist angeschlossen (Gerätekennung „${d.device}“${d.buttons ? `, ${d.buttons} Tasten` : ''}). Jetzt als eigenen Controller einrichten?`,
      { title: 'Unbekannter Controller', ok: 'Einrichten' });
    if (!ok) return;
    await window.app?.navigateToTab('controller-editor');
    if (!document.getElementById('tab-controller-editor')?.classList.contains('active')) return;   // Code abgebrochen
    await window.controllerEditor?.load();
    await window.controllerEditor?.startNew(d.device);
  }

  async detect() {
    const r = await this.post('/api/controller/detect', {});
    if (r) window.showToast?.('Erkannt: ' + (this.info.profiles.find(p => p.id === r.active)?.name || r.active));
  }

  // ---- Reiter „Module“ (Baukasten) ----
  renderModule() {
    const body = document.getElementById('armlehnen-setup-body');
    if (!body || !this.info) return;
    const info = this.info;
    if (!this.kann.module) {
      body.innerHTML = `<p style="color: var(--text-dim);">${ctrlEsc(info.profile.name)} hat keine wählbaren Module.</p>`;
      return;
    }
    const setup = this.suggestion || info.setup;
    const vorlagen = info.vorlagen.length ? `
      <div class="ctrl-row-head">
        <span>Vorlage übernehmen:</span>
        <div class="ui-seg ctrl-vorlagen">${info.vorlagen.map(v => `<button type="button" onclick="window.controllerUi.preset('${ctrlEsc(v.id)}')">${ctrlEsc(v.name)}</button>`).join('')}</div>
        <button type="button" class="btn-secondary btn-small" onclick="window.controllerUi.detectModules()">Erkennen</button>
      </div>` : '';
    // Farbe der Armlehne (25.10.2026): nur die Modulbilder ändern sich
    const farben = info.farben?.length ? `
      <div class="ctrl-row-head">
        <span>Farbe der Armlehne:</span>
        <div class="ui-seg ctrl-farben">${info.farben.map(f => `<button type="button" class="${f.id === info.farbe ? 'on' : ''}" onclick="window.controllerUi.setFarbe('${ctrlEsc(f.id)}')">${ctrlEsc(f.name)}</button>`).join('')}</div>
      </div>` : '';
    const sel = (kat, field, list, value) => `
      <label class="ctrl-sel"><span>${field === 'unterbau' ? 'Unterbau' : 'Griff'}</span>
        <select onchange="window.controllerUi.change('${kat}', '${field}', this.value)">
          <option value="keiner" ${value === 'keiner' ? 'selected' : ''}>keiner</option>
          ${list.map(x => `<option value="${ctrlEsc(x.id)}" ${x.id === value ? 'selected' : ''}>${ctrlEsc(x.name)}</option>`).join('')}
        </select></label>`;
    const rows = info.katalog.map(k => {
      const s = setup[k.id] || {};
      const extra = k.art === 'slot' && s.an ? `<div class="ctrl-mod-parts">${sel(k.id, 'unterbau', info.unterbauten, s.unterbau)}${sel(k.id, 'griff', info.griffe, s.griff)}</div>` : '';
      const hint = k.id === 'craftunit' ? '<small>Wird ab CraftLink-Firmware 1.x ausgelesen.</small>' : '';
      return `
        <div class="ctrl-mod ${s.an ? 'on' : ''}">
          <button type="button" role="switch" aria-checked="${!!s.an}" class="sheet-switch ctrl-mod-switch" onclick="window.controllerUi.change('${k.id}', 'an', ${!s.an})">
            <span><b>${ctrlEsc(k.name)}</b>${hint}</span><span class="ui-switch ${s.an ? 'on' : ''}"><span></span></span></button>
          ${extra}
        </div>`;
    }).join('');
    const sugg = this.suggestion ? `
      <div class="ctrl-suggestion">
        <span>Vorschlag aus der Modul-Erkennung – noch nicht gespeichert.</span>
        <button type="button" class="btn-primary btn-small" onclick="window.controllerUi.saveSuggestion()">Übernehmen</button>
        <button type="button" class="btn-secondary btn-small" onclick="window.controllerUi.dropSuggestion()">Verwerfen</button>
      </div>` : '';
    body.innerHTML = `${farben}${vorlagen}${sugg}<div class="ctrl-mods">${rows}</div>
      <p class="setting-hint">Tasten und Achsen hat der Controller immer alle – hier legst du nur fest, was ControlHub in der
        Tastenbelegung, der Steuerungsübersicht und bei den Achsen zeigt. Griff und Unterbau bestimmen, welche Tasten ein CraftSlot hat.</p>`;
  }

  async change(kat, field, value) {
    const setup = structuredClone(this.suggestion || this.info.setup);
    setup[kat] = { ...(setup[kat] || {}), [field]: value };
    if (this.suggestion) { this.suggestion = setup; this.renderModule(); return; }
    await this.saveSetup(setup);
  }

  async setFarbe(farbe) {
    const r = await this.post('/api/controller/farbe', { farbe }, 'PUT');
    if (r?.controller) this.apply(r.controller);
  }

  async saveSetup(setup) {
    const r = await this.post('/api/controller/setup', { setup }, 'PUT');
    if (r?.controller) { this.suggestion = null; this.apply(r.controller); }
  }

  async preset(id) {
    const name = this.info.vorlagen.find(v => v.id === id)?.name || id;
    const ok = await uiConfirm(`Module wie bei der CraftConsole ${name} einstellen? Deine Auswahl wird ersetzt.`, { title: 'Vorlage übernehmen', ok: 'Übernehmen' });
    if (!ok) return;
    const r = await this.post('/api/controller/preset', { id });
    if (r?.controller) { this.suggestion = null; this.apply(r.controller); window.showToast?.(`Vorlage ${name} übernommen`); }
  }

  async detectModules() {
    const r = await this.post('/api/controller/detect-modules', {});
    if (!r) return;
    this.suggestion = r.setup;
    this.renderModule();
  }

  saveSuggestion() { if (this.suggestion) this.saveSetup(this.suggestion); }
  dropSuggestion() { this.suggestion = null; this.renderModule(); }

  async post(url, body, method = 'POST') {
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Unbekannter Fehler');
      return data;
    } catch (error) {
      uiAlert(error.message, { title: 'Controller' });
      return null;
    }
  }
}

window.controllerUi = new ControllerUi();
