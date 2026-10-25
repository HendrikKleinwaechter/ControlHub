/**
 * Editor „Eigene Controller“ (Einstellungen → Für Entwickler, mit Code; Geräteprofile G3/G4, 23.10.2026 -- Hendriks
 * Idee: „eine Art kleiner Editor im Entwicklermenü“, Konzept-Geraeteprofile.md § 6).
 *
 * Ein eigener Controller (Selbstbau) hat beliebig viele Module. Je Modul: Name, Tasten (anlernen = Taste am Controller
 * drücken, oder eintragen), Achsen (anlernen = Poti/Hebel bewegen), Tastennamen, optional ein Bild mit Tastenlage
 * (Upload hier, Platzieren in der Modul-Kalibrierung). Gespeichert wird jede Änderung sofort (server/controllerManager.js,
 * server/config/geraeteprofile.json). Anlernen nutzt die Zustandsmeldungen ('state-update'), kein Firmware-Befehl nötig.
 */
const ceEsc = escapeHtml;   // js/basis.js (Durchsicht B9: vorher eigene Kopie)

class ControllerEditor {
  constructor() {
    this.body = document.getElementById('controller-editor-body');
    this.list = [];
    this.active = null;
    this.editId = null;
    this.edit = null;          // Arbeitskopie des bearbeiteten Controllers
    this.learn = null;         // { mod, kind: 'tasten'|'achse', baseline }
    this.layouts = {};         // Modulbilder der Module (layoutId -> layout)
    this.saveTimer = null;
    this.socket = window.hubSocket;   // gemeinsame Verbindung der Seite (hubSocket.js, B4)
    this.socket.on('state-update', (d) => this.onState(d));
    this.socket.on('controller-custom-changed', () => { if (!this.edit) this.load(); });
    document.addEventListener('tabchanged', e => {
      if (e.detail?.tabName === 'controller-editor') this.load();
      else this.stopLearn();
    });
  }

  async load() {
    try {
      const res = await fetch('/api/controller/custom');
      const data = await res.json();
      this.list = data.controllers || [];
      this.active = data.active;
      if (this.editId) {
        const fresh = this.list.find(c => c.id === this.editId);
        if (!fresh) { this.editId = null; this.edit = null; }
        else if (!this.saveTimer) this.edit = structuredClone(fresh);
      }
      if (this.edit) await this.loadLayouts();
    } catch (e) {
      console.warn('Eigene Controller nicht ladbar:', e);
    }
    this.render();
  }

  async loadLayouts() {
    this.layouts = {};
    await Promise.all((this.edit?.module || []).map(async m => {
      const id = `${this.edit.id}--${m.id}`;
      try { this.layouts[id] = (await (await fetch(`/api/module-layout/${encodeURIComponent(id)}`)).json()).layout || {}; } catch { this.layouts[id] = {}; }
    }));
  }

  render() {
    if (!this.body) return;
    this.body.innerHTML = this.edit ? this.renderEdit() : this.renderList();
  }

  renderList() {
    const rows = this.list.map(c => {
      const tasten = (c.module || []).reduce((n, m) => n + (m.tasten || []).length, 0);
      const achsen = (c.module || []).reduce((n, m) => n + (m.achsen || []).length, 0);
      return `<div class="ce-item">
        <div class="ce-item-text"><b>${ceEsc(c.name)}</b>${c.id === this.active ? ' <span class="ce-badge">aktiv</span>' : ''}
          <small>Kennung: ${c.erkennung?.device ? ceEsc(c.erkennung.device) : '–'} · ${(c.module || []).length} Module · ${tasten} Tasten · ${achsen} Achsen</small></div>
        <button type="button" class="btn-secondary btn-small" onclick="window.controllerEditor.open('${ceEsc(c.id)}')">Bearbeiten</button>
      </div>`;
    }).join('');
    return `
      <div class="ce-head">
        <p class="setting-hint" style="margin: 0; flex: 1;">Für Selbstbau-Controller (z. B. CraftLink mit eigenen Tastern oder ein Arduino mit ControlHub-Firmware):
          Module anlegen, Tasten und Achsen anlernen, Namen vergeben, optional ein Bild mit Tastenlage. Die Gerätekennung ist die
          <code>DEVICE_ID</code> der Firmware – daran erkennt ControlHub den Controller beim Anstecken.</p>
        <div class="ce-head-btns">
          <button type="button" class="btn-primary btn-small" onclick="window.controllerEditor.create()">+ Neuer Controller</button>
          <button type="button" class="btn-secondary btn-small" onclick="window.controllerEditor.pickImport()">Importieren</button>
        </div>
      </div>
      <div class="ce-list">${rows || '<p style="color: var(--text-dim);">Noch keine eigenen Controller.</p>'}</div>`;
  }

  renderEdit() {
    const c = this.edit;
    const isActive = c.id === this.active;
    const mods = (c.module || []).map((m, i) => this.renderModule(m, i, c.module.length)).join('');
    return `
      <button type="button" class="btn-secondary btn-small" onclick="window.controllerEditor.close()">‹ Alle eigenen Controller</button>
      <div class="ce-fields">
        <label class="ctrl-sel"><span>Name</span><input type="text" maxlength="40" value="${ceEsc(c.name)}" onchange="window.controllerEditor.setField('name', this.value)"></label>
        <label class="ctrl-sel"><span>Gerätekennung (DEVICE_ID der Firmware)</span><input type="text" maxlength="40" placeholder="z. B. eigen-schaltpult" value="${ceEsc(c.erkennung?.device || '')}" onchange="window.controllerEditor.setField('device', this.value)"></label>
      </div>
      <div class="ce-active">${isActive ? '<span class="ce-badge">Aktiver Controller</span> Tastenbelegung und Achsen zeigen diese Module.'
        : `<button type="button" class="btn-secondary btn-small" onclick="window.controllerEditor.useNow()">Als Controller verwenden</button> <small>Wird sonst gewählt, sobald ein Gerät mit dieser Kennung angesteckt wird.</small>`}</div>
      <div class="ce-mods-head"><h4>Module</h4><button type="button" class="btn-secondary btn-small" onclick="window.controllerEditor.addModule()">+ Modul</button></div>
      ${mods || '<p style="color: var(--text-dim);">Noch keine Module.</p>'}
      <div class="ce-foot">
        <button type="button" class="btn-secondary btn-small" onclick="window.controllerEditor.exportOne()">Exportieren</button>
        <button type="button" class="btn-danger btn-small" onclick="window.controllerEditor.remove()">Controller löschen</button>
      </div>`;
  }

  renderModule(m, i, count) {
    const learnT = this.learn?.mod === i && this.learn.kind === 'tasten';
    const learnA = this.learn?.mod === i && this.learn.kind === 'achse';
    const names = m.tastenNamen || {};
    const chips = (m.tasten || []).map(n => `<span class="ce-chip"><button type="button" class="ce-chip-main" title="Namen ändern" onclick="window.controllerEditor.nameButton(${i}, ${n})"><b>${n}</b>${names[n] ? `<span class="ce-chip-name">${ceEsc(names[n])}</span>` : ''}</button><button type="button" class="ce-chip-x" aria-label="Taste ${n} entfernen" onclick="window.controllerEditor.removeButton(${i}, ${n})">✕</button></span>`).join('');
    const axes = (m.achsen || []).map(a => `<span class="ce-chip axis"><button type="button" class="ce-chip-main" title="Namen ändern" onclick="window.controllerEditor.nameAxis(${i}, ${a.index})"><b>Achse ${a.index + 1}</b>${a.name && a.name !== `Achse ${a.index + 1}` ? `<span class="ce-chip-name">${ceEsc(a.name)}</span>` : ''}</button><button type="button" class="ce-chip-x" aria-label="Achse entfernen" onclick="window.controllerEditor.removeAxis(${i}, ${a.index})">✕</button></span>`).join('');
    const layoutId = `${this.edit.id}--${m.id}`;
    const lay = this.layouts[layoutId] || {};
    const placed = (lay.hotspots || []).length;
    const bild = lay.image
      ? `<img class="ce-thumb" src="${ceEsc(lay.image)}?t=${Date.now()}" alt=""><span>${placed} von ${(m.tasten || []).length + (m.achsen || []).length} platziert</span>
         <button type="button" class="btn-secondary btn-small" onclick="window.controllerEditor.place(${i})">Tasten auf dem Bild platzieren</button>
         <button type="button" class="btn-secondary btn-small" onclick="window.controllerEditor.pickImage(${i})">Anderes Bild</button>`
      : `<span>Kein Bild – die Tastenbelegung zeigt ein Raster.</span>
         <button type="button" class="btn-secondary btn-small" onclick="window.controllerEditor.pickImage(${i})">Bild wählen</button>`;
    return `
      <div class="ce-mod">
        <div class="ce-mod-top">
          <input type="text" class="ce-mod-name" maxlength="40" value="${ceEsc(m.name)}" aria-label="Name des Moduls" onchange="window.controllerEditor.setModuleName(${i}, this.value)">
          <button type="button" class="btn-secondary btn-small" ${i === 0 ? 'disabled' : ''} onclick="window.controllerEditor.moveModule(${i}, -1)" aria-label="nach oben">↑</button>
          <button type="button" class="btn-secondary btn-small" ${i === count - 1 ? 'disabled' : ''} onclick="window.controllerEditor.moveModule(${i}, 1)" aria-label="nach unten">↓</button>
          <button type="button" class="btn-danger btn-small" onclick="window.controllerEditor.removeModule(${i})">Entfernen</button>
        </div>
        <div class="ce-row"><span class="ce-label">Tasten</span><div class="ce-chips">${chips || '<small>keine</small>'}</div>
          <div class="ce-row-btns">
            <button type="button" class="btn-small ${learnT ? 'btn-primary ce-learning' : 'btn-secondary'}" onclick="window.controllerEditor.toggleLearn(${i}, 'tasten')">${learnT ? 'Anlernen läuft … Tasten am Controller drücken (fertig)' : 'Tasten anlernen'}</button>
            <button type="button" class="btn-secondary btn-small" onclick="window.controllerEditor.enterButtons(${i})">Eintragen …</button>
          </div></div>
        <div class="ce-row"><span class="ce-label">Achsen</span><div class="ce-chips">${axes || '<small>keine</small>'}</div>
          <div class="ce-row-btns">
            <button type="button" class="btn-small ${learnA ? 'btn-primary ce-learning' : 'btn-secondary'}" onclick="window.controllerEditor.toggleLearn(${i}, 'achse')">${learnA ? 'Poti/Hebel jetzt bewegen … (abbrechen)' : 'Achse anlernen'}</button>
          </div></div>
        <div class="ce-row ce-bild"><span class="ce-label">Bild</span>${bild}</div>
      </div>`;
  }

  // ---- Liste ----
  async open(id) {
    this.stopLearn();
    const c = this.list.find(x => x.id === id);
    if (!c) return;
    this.editId = id;
    this.edit = structuredClone(c);
    await this.loadLayouts();
    this.render();
  }

  async close() { this.stopLearn(); await this.flush(); this.editId = null; this.edit = null; await this.load(); }

  async create(prefill = {}) {
    const name = await uiPrompt('Wie heißt dein Controller?', prefill.name || '', { title: 'Neuer Controller', placeholder: 'z. B. Mein Schaltpult' });
    if (!name) return;
    const r = await this.request('/api/controller/custom', 'POST', { name, device: prefill.device || '' });
    if (!r) return;
    await this.load();
    await this.open(r.controller.id);
  }

  // Unbekannter Controller angesteckt (controller.js): direkt einen neuen anlegen, Kennung vorausgefüllt
  async startNew(device) {
    const existing = this.list.find(c => c.erkennung?.device === device);
    if (existing) return this.open(existing.id);
    return this.create({ device });
  }

  async pickImport() {
    try {
      const data = await pickJsonFile();   // js/basis.js
      if (!data) return;
      const r = await this.request('/api/controller/custom/import', 'POST', { data });
      if (r) { window.showToast?.(`„${r.controller.name}“ importiert`); await this.load(); }
    } catch (e) { uiAlert('Import fehlgeschlagen: ' + e.message); }
  }

  // ---- Bearbeiten (jede Änderung wird kurz danach gespeichert) ----
  changed(rerender = true) {
    if (rerender) this.render();
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 400);
  }

  async flush() {
    if (!this.saveTimer || !this.edit) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const r = await this.request(`/api/controller/custom/${encodeURIComponent(this.edit.id)}`, 'PUT', { controller: this.edit });
    if (r?.controller) {
      const idsBefore = (this.edit.module || []).map(m => m.id).join();
      this.edit = r.controller;
      const i = this.list.findIndex(c => c.id === r.controller.id);
      if (i >= 0) this.list[i] = structuredClone(r.controller);
      if ((this.edit.module || []).map(m => m.id).join() !== idsBefore) { await this.loadLayouts(); this.render(); }
    } else {
      await this.load();   // Fehler (z. B. Kennung vergeben): Stand vom Server zurückholen
    }
  }

  setField(field, value) {
    if (field === 'name') this.edit.name = value;
    if (field === 'device') this.edit.erkennung = { device: value.trim().toLowerCase() || null };
    this.changed(false);
  }

  addModule() {
    const n = (this.edit.module || []).length + 1;
    this.edit.module.push({ id: `modul-${Date.now().toString(36)}`, name: `Modul ${n}`, tasten: [], achsen: [], tastenNamen: {} });
    this.changed();
  }

  setModuleName(i, value) { this.edit.module[i].name = value; this.changed(false); }

  moveModule(i, d) {
    const mods = this.edit.module;
    const j = i + d;
    if (j < 0 || j >= mods.length) return;
    [mods[i], mods[j]] = [mods[j], mods[i]];
    this.stopLearn();
    this.changed();
  }

  async removeModule(i) {
    const m = this.edit.module[i];
    if (!(await uiConfirm(`Modul „${m.name}“ entfernen?`, { title: 'Modul entfernen', ok: 'Entfernen', danger: true }))) return;
    this.edit.module.splice(i, 1);
    this.stopLearn();
    this.changed();
  }

  addButtons(i, nums) {
    const mod = this.edit.module[i];
    const added = [];
    for (const n of nums) {
      if (!Number.isInteger(n) || n < 1 || n > 128) continue;
      // eine Taste gehört zu genau einem Modul
      this.edit.module.forEach((m, k) => { if (k !== i) m.tasten = (m.tasten || []).filter(x => x !== n); });
      if (!mod.tasten.includes(n)) { mod.tasten.push(n); added.push(n); }
    }
    mod.tasten.sort((a, b) => a - b);
    if (added.length) this.changed();
    return added;
  }

  async enterButtons(i) {
    const text = await uiPrompt('Tastennummern, z. B. „31–37, 40“:', '', { title: 'Tasten eintragen' });
    if (!text) return;
    const nums = [];
    for (const part of text.split(/[,;\s]+/)) {
      const m = part.match(/^(\d+)\s*[-–]\s*(\d+)$/);
      if (m) { for (let n = Number(m[1]); n <= Number(m[2]) && nums.length < 128; n++) nums.push(n); }
      else if (/^\d+$/.test(part)) nums.push(Number(part));
    }
    if (!this.addButtons(i, nums).length) uiAlert('Keine neuen Tasten erkannt (erlaubt sind 1–128).');
  }

  removeButton(i, n) {
    const m = this.edit.module[i];
    m.tasten = m.tasten.filter(x => x !== n);
    delete m.tastenNamen?.[n];
    this.changed();
  }

  async nameButton(i, n) {
    const m = this.edit.module[i];
    const name = await uiPrompt(`Name für Taste ${n}:`, m.tastenNamen?.[n] || '', { title: 'Tastenname', placeholder: 'z. B. Hupe' });
    if (name === null) return;
    m.tastenNamen = m.tastenNamen || {};
    if (name.trim()) m.tastenNamen[n] = name.trim().slice(0, 30); else delete m.tastenNamen[n];
    this.changed();
  }

  removeAxis(i, index) {
    const m = this.edit.module[i];
    m.achsen = m.achsen.filter(a => a.index !== index);
    this.changed();
  }

  async nameAxis(i, index) {
    const a = this.edit.module[i].achsen.find(x => x.index === index);
    const name = await uiPrompt(`Name für Achse ${index + 1}:`, a?.name || '', { title: 'Achsenname', placeholder: 'z. B. Gas' });
    if (name === null || !a) return;
    a.name = name.trim().slice(0, 30) || `Achse ${index + 1}`;
    this.changed();
  }

  // ---- Anlernen über die Zustandsmeldungen des angeschlossenen Controllers ----
  toggleLearn(i, kind) {
    if (this.learn?.mod === i && this.learn.kind === kind) { this.stopLearn(); return; }
    this.learn = { mod: i, kind, baseline: null };
    this.render();
    if (!document.querySelector('#connection-status.connected')) window.showToast?.('Kein Controller verbunden – zum Anlernen bitte anstecken');
  }

  stopLearn() {
    if (!this.learn) return;
    this.learn = null;
    this.render();
  }

  onState(d) {
    if (!this.learn || !this.edit) return;
    if (this.learn.kind === 'tasten') {
      const nums = (d?.events?.buttonDown || []).map(id => id + 1);
      if (!nums.length) return;
      const added = this.addButtons(this.learn.mod, nums);
      if (added.length) window.showToast?.(`Taste ${added.join(', ')} hinzugefügt`);
      return;
    }
    // Achse: Ruhelage merken, dann die erste Achse nehmen, die sich deutlich bewegt (Rohwerte 0–65535)
    const axes = d?.axes;
    if (!Array.isArray(axes)) return;
    if (!this.learn.baseline) { this.learn.baseline = axes.slice(); return; }
    const index = axes.findIndex((v, k) => Math.abs(v - this.learn.baseline[k]) > 12000);
    if (index < 0) return;
    const m = this.edit.module[this.learn.mod];
    this.edit.module.forEach(x => { x.achsen = (x.achsen || []).filter(a => a.index !== index); });
    m.achsen.push({ index, name: `Achse ${index + 1}` });
    m.achsen.sort((a, b) => a.index - b.index);
    this.learn = null;
    window.showToast?.(`Achse ${index + 1} hinzugefügt`);
    this.changed();
  }

  // ---- Bild und Tastenlage (G4) ----
  pickImage(i) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      await this.flush();   // Modul muss gespeichert sein, sonst kennt der Server die Bild-Kennung nicht
      const id = `${this.edit.id}--${this.edit.module[i].id}`;
      try {
        const res = await fetch(`/api/module-layout/${encodeURIComponent(id)}/image`, { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        await this.loadLayouts();
        this.render();
        if (window.tilePages) window.tilePages.stLayouts = null;
        if (await uiConfirm('Bild gespeichert. Jetzt die Tasten auf dem Bild platzieren?', { title: 'Bild', ok: 'Platzieren' })) this.place(i);
      } catch (e) { uiAlert('Bild konnte nicht gespeichert werden: ' + e.message); }
    };
    input.click();
  }

  async place(i) {
    await this.flush();
    const id = `${this.edit.id}--${this.edit.module[i].id}`;
    await window.app?.navigateToTab('calibration-tool');
    await window.layoutCalibrator?.openFor(id);
  }

  // ---- Weiteres ----
  async useNow() {
    await this.flush();
    const r = await this.request('/api/controller/select', 'POST', { id: this.edit.id });
    if (r) window.showToast?.('Controller umgestellt');   // Seite lädt über 'controller-changed' neu
  }

  async exportOne() {
    await this.flush();
    try {
      const res = await fetch(`/api/controller/custom/${encodeURIComponent(this.edit.id)}/export`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      downloadJson(data.data, `Controller ${this.edit.name}`);
    } catch (e) { uiAlert('Export fehlgeschlagen: ' + e.message); }
  }

  async remove() {
    if (!(await uiConfirm(`Controller „${this.edit.name}“ löschen? Profile, die für ihn angelegt wurden, bleiben im Spielordner liegen.`, { title: 'Controller löschen', ok: 'Löschen', danger: true }))) return;
    clearTimeout(this.saveTimer); this.saveTimer = null;
    const r = await this.request(`/api/controller/custom/${encodeURIComponent(this.edit.id)}`, 'DELETE', {});
    if (r) { this.editId = null; this.edit = null; await this.load(); }
  }

  async request(url, method, body) {
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Unbekannter Fehler');
      return data;
    } catch (e) {
      uiAlert(e.message, { title: 'Eigene Controller' });
      return null;
    }
  }
}

window.controllerEditor = new ControllerEditor();
