/**
 * Seite „GPS-Geräte“ (Test 23.10.2026, Anmerkung 21; Hendrik: „eine eigene kleine Verwaltungsseite“).
 * Erreichbar aus dem GPS-Menü („Geräte verwalten ›“). Server: server/routes/gps.js, server/gpsManager.js.
 *
 * - Am Fahrzeug: alle angehängten Geräte aus den Spieldaten, auch Frontgewicht und Anhänger. Je Gerät „Auf der Karte
 *   zeigen“, „Fläche zählt als bearbeitet“ und „Als GPS-Gerät verwenden“ (falls ControlHub das falsche nimmt).
 * - Gespeicherte Geräte: laden, bearbeiten, exportieren, löschen; „+ Neues Gerät“ von Hand, Importieren, das geladene
 *   Gerät als neues speichern.
 * - Bearbeiten: Name, „Gehört zu“ (welches Gerät im Spiel; dann lädt es beim Anhängen automatisch), Anbauposition und
 *   -art, Deichsel, Abstand, Seitenversatz, Breite, Vorgewende, Überlappung. Leer = automatisch (Wert aus dem Spiel).
 */
(function () {
  const esc = escapeHtml;   // js/basis.js (Durchsicht B9: vorher eigene Kopie)
  const m2 = v => (v == null ? 'automatisch' : `${Number(v).toLocaleString('de-DE', { maximumFractionDigits: 2 })} m`);
  const SIDE = { auto: 'automatisch', front: 'vorne', rear: 'hinten' };
  const ATT = { auto: 'automatisch', mounted: 'angebaut', trailed: 'angehängt' };
  const COV = [['auto', 'Automatisch'], ['gesenkt', 'Gesenkt'], ['an', 'Eingeschaltet'], ['beides', 'Gesenkt und eingeschaltet']];
  const KIND = { self: 'Fahrzeug selbst', front: 'vorne', rear: 'hinten' };
  const J = v => esc(JSON.stringify(v));

  class GpsGeraete {
    constructor() {
      this.el = document.getElementById('gps-geraete-body');
      this.gps = null;
      this.units = [];
      this.unitSig = '';
      this.edit = null;        // Name des Geräts im Bearbeiten-Fenster, '' = neues Gerät
      this.form = null;
      const socket = window.hubSocket;
      // während das Bearbeiten-Fenster offen ist nicht neu zeichnen -- sonst ginge ein gerade getippter Wert verloren
      // (Durchsicht 24.10.2026); beim Schließen wird ohnehin neu gezeichnet
      socket?.on('gps-changed', g => { this.gps = g; if (this.visible && this.edit == null) this.render(); });
      socket?.on('telemetry-update', d => this.onTelemetry(d));
      document.addEventListener('tabchanged', e => { if (e.detail?.tabName === 'gps-geraete') this.open(); });
    }

    get visible() { return document.getElementById('tab-gps-geraete')?.classList.contains('active'); }

    async open() {
      try { const g = await (await fetch('/api/gps')).json(); if (g.success) this.gps = g.gps; } catch (e) { console.warn('GPS-Geräte:', e); }
      this.render();
    }

    onTelemetry(d) {
      const units = d?.available !== false && d?.inVehicle !== false && Array.isArray(d?.units) ? d.units : [];
      this.gpsUnit = d?.gps?.unit || null;
      const sig = JSON.stringify([units.map(u => [u.name, u.side, u.depth, u.kind, !!u.areas?.length]), this.gpsUnit]);
      this.units = units;
      if (sig !== this.unitSig) { this.unitSig = sig; if (this.visible && this.edit == null) this.render(); }
    }

    async api(method, url, body) {
      try {
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Fehler');
        if (data.gps) this.gps = data.gps;
        return data;
      } catch (e) {
        uiAlert('GPS: ' + e.message);
        return null;
      } finally {
        this.render();
      }
    }

    // ---------- Darstellung ----------
    render() {
      if (!this.el) return;
      if (!this.gps) { this.el.innerHTML = '<div class="gps-empty">Geräte werden geladen …</div>'; return; }
      const top = this.el.closest('.tab-content')?.scrollTop || 0;
      this.el.innerHTML = `<div class="gg-page">
          <div>${this.attachedCard()}</div>
          <div>${this.edit != null ? this.editCard() : this.storeCard()}</div>
        </div>`;
      const sc = this.el.closest('.tab-content');
      if (sc && top) sc.scrollTop = top;
    }

    sw(on, label, js) {
      return `<button type="button" role="switch" aria-checked="${on}" class="gps-switch ${on ? 'on' : ''}" onclick="${js}"><span>${esc(label)}</span><span class="gps-switch-track"><span></span></span></button>`;
    }

    attachedCard() {
      const g = this.gps;
      // Das Fahrzeug selbst nur mit eigenem Arbeitsbereich (z. B. Selbstfahrspritze); „Fläche zählt“ nur, wo es Fläche gibt
      const rows = this.units.filter(u => u.side !== 'self' || u.areas?.length || this.gpsUnit === u.name).map(u => {
        const o = g.einheiten?.[u.name] || {};
        const cov = o.cov || 'auto';
        const n = J(u.name);
        const isGps = this.gpsUnit === u.name;
        const fest = g.gpsEinheit === u.name;
        const flaeche = !!u.areas?.length || isGps;
        const set = patch => `window.gpsGeraete.api('PUT', '/api/gps/einheit', Object.assign({ name: ${n} }, ${J(patch)}))`;
        const where = [KIND[u.side] || u.side, u.side !== 'self' && u.depth > 1 ? `${u.depth}. Gerät` : null, u.attach ? ATT[u.attach] : null,
          u.areas?.length ? 'Arbeitsbereich erkannt' : 'kein Arbeitsbereich'].filter(Boolean).join(' · ');
        return `<div class="gg-row ${isGps ? 'on' : ''}">
          <div class="gg-row-top">
            <div class="gg-row-name"><b>${esc(u.name || 'Gerät')}</b><small>${esc(where)}</small></div>
            ${isGps ? `<span class="gg-badge">GPS-Gerät${fest ? ' (von Hand)' : ''}</span>` : ''}
            ${fest ? `<button type="button" class="btn-secondary btn-small" onclick="window.gpsGeraete.api('PUT', '/api/gps/gps-einheit', { name: null })">Automatisch wählen</button>`
              : `<button type="button" class="btn-secondary btn-small" onclick="window.gpsGeraete.api('PUT', '/api/gps/gps-einheit', { name: ${n} })">Als GPS-Gerät verwenden</button>`}
          </div>
          ${this.sw(o.map !== false, 'Auf der Karte zeigen', set({ map: o.map === false }))}
          ${u.sections && !u.pfSek?.length ? this.sw(o.tb === true, 'Teilbreiten automatisch schalten', set({ tb: o.tb !== true })) : ''}
          ${flaeche ? `<div class="gps-row gps-row--stack"><span class="gps-row-label">Fläche zählt als bearbeitet</span>
            <div class="gps-seg">${COV.map(([v, l]) => `<button type="button" class="${cov === v ? 'on' : ''}" ${!u.canTurnOn && (v === 'an' || v === 'beides') ? 'disabled title="Das Gerät lässt sich im Spiel nicht einschalten"' : ''} onclick="${set({ cov: v })}">${l}</button>`).join('')}</div>
            ${cov === 'auto' ? `<span class="gps-small">Automatisch: zählt, wenn ${window.Teilbreiten.autoRegel(u)}.</span>` : ''}
            ${!u.canTurnOn ? '<span class="gps-small">Lässt sich im Spiel nicht einschalten – zählt beim Absenken.</span>' : ''}</div>` : ''}
        </div>`;
      }).join('');
      return `<section class="gps-card">
        <div class="gps-kicker">Am Fahrzeug <span>· alles, was gerade angehängt ist</span></div>
        <div class="gg-list">${rows || '<p class="gps-small">Nichts angehängt – oder keine Spieldaten. Steig im Spiel in ein Fahrzeug.</p>'}</div>
        <p class="gps-small">„Als GPS-Gerät verwenden“ hilft, wenn ControlHub für Vorgewende und Arbeitsbalken das falsche Gerät nimmt oder ein Gerät nicht erkennt. Die Wahl gilt, solange dieses Gerät angehängt ist.</p>
      </section>`;
    }

    storeCard() {
      const g = this.gps;
      const items = (g.devices || []).map(d => {
        const cur = d.name === g.current;
        const sub = [d.match ? `gehört zu „${d.match}“` : 'keinem Gerät zugeordnet', SIDE[d.side], d.side !== 'front' && d.attach !== 'auto' ? ATT[d.attach] : null,
          d.width != null ? `Breite ${m2(d.width)}` : null, `Vorgewende ${d.headland} m`].filter(Boolean).join(' · ');
        const n = J(d.name);
        return `<div class="gg-row ${cur ? 'on' : ''}">
          <div class="gg-row-top">
            <div class="gg-row-name"><b>${esc(d.name)}</b><small>${esc(sub)}</small></div>
            ${cur ? '<span class="gg-badge">geladen</span>' : ''}
          </div>
          <div class="gg-row-top">
            ${cur ? '' : `<button type="button" class="btn-secondary btn-small" onclick="window.gpsGeraete.load(${n})">Laden</button>`}
            <button type="button" class="btn-secondary btn-small" onclick="window.gpsGeraete.openEdit(${n})">Bearbeiten</button>
            <button type="button" class="btn-secondary btn-small" onclick="window.gpsGeraete.exportDevice(${n})">Exportieren</button>
            ${cur ? '' : `<button type="button" class="btn-danger btn-small" onclick="window.gpsGeraete.remove(${n})">Löschen</button>`}
          </div>
        </div>`;
      }).join('');
      return `<section class="gps-card">
        <div class="gps-kicker">Gespeicherte Geräte <span>· GPS-Einstellungen je Arbeitsgerät</span></div>
        <div class="gg-row-top">
          <button type="button" class="btn-primary" onclick="window.gpsGeraete.openEdit('')">+ Neues Gerät</button>
          <button type="button" class="btn-secondary" onclick="window.gpsGeraete.saveAs()">Geladenes als neues speichern</button>
          <button type="button" class="btn-secondary" onclick="document.getElementById('gg-import-file').click()">Importieren …</button>
          <input type="file" id="gg-import-file" accept="application/json,.json" style="display:none" onchange="window.gpsGeraete.importFile(this.files[0])">
        </div>
        <div class="gg-list">${items || '<p class="gps-small">Noch keine Geräte gespeichert.</p>'}</div>
        <p class="gps-small">Ein Gerät mit „Gehört zu“ lädt von selbst, wenn du das Gerät im Spiel anhängst (Reiter „Aktuelles Gerät“: „Automatisch laden“). Ohne Zuordnung lädst du es hier von Hand.</p>
      </section>`;
    }

    // ---------- Bearbeiten ----------
    openEdit(name) {
      const d = name ? (this.gps.devices || []).find(x => x.name === name) : null;
      this.edit = name || '';
      this.form = d ? { ...d } : { name: 'Neues Gerät', match: '', side: 'auto', attach: 'auto', drawbar: null, pos: null, lat: null, width: null, headland: 12, overlap: 50 };
      this.render();
    }
    closeEdit() { this.edit = null; this.form = null; this.render(); }
    setForm(key, val) { this.form[key] = val; }

    editCard() {
      const f = this.form;
      const names = [...new Set([...this.units.map(u => u.name), f.match].filter(Boolean))];
      const num = (key, label, min, max, step, hint) => `<div class="input-group"><label>${label}:</label>
          <input type="number" inputmode="decimal" min="${min}" max="${max}" step="${step}" value="${f[key] ?? ''}" placeholder="automatisch" onchange="window.gpsGeraete.setForm('${key}', this.value === '' ? null : Number(this.value))">
          ${hint ? `<span class="gps-small">${hint}</span>` : ''}</div>`;
      const sel = (key, label, opts) => `<div class="input-group"><label>${label}:</label>
          <select onchange="window.gpsGeraete.setForm('${key}', this.value)">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(f[key] ?? '') === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
      return `<section class="gps-card gg-edit">
        <div class="gps-kicker">${this.edit ? 'Gerät bearbeiten' : 'Neues Gerät'}</div>
        <div class="input-group"><label>Name:</label><input type="text" maxlength="60" value="${esc(f.name)}" onchange="window.gpsGeraete.setForm('name', this.value)"></div>
        ${sel('match', 'Gehört zu', [['', 'keinem Gerät (nur von Hand laden)'], ...names.map(nm => [nm, nm])])}
        ${sel('side', 'Anbauposition', [['auto', 'automatisch'], ['front', 'vorne'], ['rear', 'hinten']])}
        ${sel('attach', 'Anbauart', [['auto', 'automatisch'], ['mounted', 'angebaut'], ['trailed', 'angehängt']])}
        ${num('drawbar', 'Deichsel (m)', 0.5, 20, 0.01, 'nur angehängt: Kupplung bis Achse')}
        ${num('pos', 'Abstand Arbeitsbereich (m)', 0, 30, 0.01, 'von der Kupplung bis zur Mitte des Arbeitsbalkens')}
        ${num('lat', 'Seitenversatz (m)', -40, 40, 0.01, '+ = nach rechts')}
        ${num('width', 'Breite (m)', 0.5, 50, 0.01)}
        ${num('headland', 'Vorgewende (m)', 1, 45, 1)}
        ${sel('overlap', 'Überlappung', [[0, '0 %'], [25, '25 %'], [50, '50 %'], [75, '75 %'], [100, '100 %']].map(([v, l]) => [String(v), l]))}
        <p class="gps-small">Leere Felder heißen „automatisch“: Der Wert kommt aus dem Spiel. Aktionen und Ton am Vorgewende stellst du im Reiter „Aktuelles Gerät“ ein, wenn das Gerät geladen ist.</p>
        <div class="gg-row-top">
          <button type="button" class="btn-primary" onclick="window.gpsGeraete.saveEdit()">${this.edit ? 'Speichern' : 'Anlegen'}</button>
          <button type="button" class="btn-secondary" onclick="window.gpsGeraete.closeEdit()">Abbrechen</button>
        </div>
      </section>`;
    }

    async saveEdit() {
      const f = { ...this.form, overlap: Number(this.form.overlap) };
      if (!String(f.name || '').trim()) { uiAlert('Bitte einen Namen eingeben.'); return; }
      const r = this.edit
        ? await this.api('PUT', `/api/gps/device/${encodeURIComponent(this.edit)}`, f)
        : await this.api('POST', '/api/gps/device', f);
      if (r) { window.showToast?.(this.edit ? `„${r.name}“ gespeichert` : `„${r.name}“ angelegt`); this.closeEdit(); }
    }

    // ---------- Gerätespeicher ----------
    async load(name) {
      const r = await this.api('POST', '/api/gps/load', { name });
      if (r) window.showToast?.(`„${name}“ geladen`);
    }
    async remove(name) {
      if (!(await uiConfirm(`GPS-Gerät „${name}“ löschen?`, { title: 'Gerät löschen', ok: 'Löschen', danger: true }))) return;
      const r = await this.api('DELETE', `/api/gps/device/${encodeURIComponent(name)}`);
      if (r) window.showToast?.(`„${name}“ gelöscht`);
    }
    async saveAs() {
      const name = await uiPrompt('Name für das neue Gerät', this.gps.live?.name || '', { title: 'Als neues Gerät speichern', ok: 'Speichern' });
      if (!name) return;
      const r = await this.api('POST', '/api/gps/save-as', { name });
      if (r) window.showToast?.(`Gespeichert als „${r.name}“`);
    }
    async exportDevice(name) {
      try {
        const r = await fetch(`/api/gps/device/${encodeURIComponent(name)}/export`).then(x => x.json());
        if (!r.success) throw new Error(r.error);
        downloadJson(r.data, `GPS-Gerät ${name}`);
        window.showToast?.(`„${name}“ exportiert (Ordner Downloads)`);
      } catch (e) { uiAlert('Export fehlgeschlagen: ' + e.message); }
    }
    async importFile(file) {
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const r = await this.api('POST', '/api/gps/import', { data });
        if (r) window.showToast?.(`Importiert: „${r.name}“`);
      } catch (e) { uiAlert('Import fehlgeschlagen: ' + e.message); }
    }
  }

  document.addEventListener('DOMContentLoaded', () => { window.gpsGeraete = new GpsGeraete(); });
})();
