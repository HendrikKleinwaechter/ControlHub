/**
 * Profil-Import (30.09.2026, Hendriks Wunsch): der "Importieren"-Knopf auf der Profilseite führt
 * jetzt zu einer Quellenwahl statt direkt zum Dateidialog:
 *   1. Aus Datei        -- bisheriges Verhalten (merge/replace/add-missing), nur mit richtigem
 *                          Dialog statt der alten confirm()/prompt()-Kaskade mit Zahleneingabe.
 *   2. Aus vorhandenem Profil -- NEU: ganze Modul-Belegungen aus einem anderen Profil ins AKTIVE
 *                          Profil holen, mit Auswahlliste je Taste/Ebene/Achse.
 *
 * Abgrenzung zu crossProfileApply.js: das ist die Gegenrichtung (eine gerade gespeicherte Taste in
 * andere Profile schieben). Hier wird umgekehrt aus einem anderen Profil geholt, und zwar
 * gruppenweise. Gemeinsam ist das Speichermuster: ganzes Zielprofil holen, Felder setzen, ganzes
 * Profil zurückschreiben -- eine schmalere Route gibt es nicht (s. Kommentarkopf crossProfileApply.js).
 *
 * Konventionen, die hier zusammenkommen (beide leicht zu verwechseln):
 *  - `MODULES.buttonRange` (server/config/modules.js) ist 1-BASIERT (Firmware-Tastennummern).
 *  - `profile.buttons` / `craftSlotLayers[slot][layer]` sind 0-BASIERT.
 *    Umrechnung passiert ausschließlich in buildButtonRows() -- sonst nirgends.
 *
 * Funktionen und Makros liegen global (functions.json / macros.json), nicht im Profil. Eine kopierte
 * Funktions-ID zeigt im Zielprofil also auf dasselbe Objekt -- es muss nichts mitkopiert werden.
 */

// Fällt auf eine eigene Kopie zurück, falls axisAssignment.js einmal nicht geladen ist. Bewusst
// KEINE zweite top-level `const PHYSICAL_AXIS_INDEX`: klassische <script>-Tags teilen sich einen
// globalen Scope, ein zweites `const` desselben Namens wäre ein SyntaxError und würde diese Datei
// komplett lahmlegen (s. Kommentarkopf axisConfigModal.js).
const PI_AXIS_INDEX = (typeof PHYSICAL_AXIS_INDEX !== 'undefined') ? PHYSICAL_AXIS_INDEX : {
  thumbX: 0, thumbY: 1, leverA: 2, leverB: 3,
  thumb2X: 4, thumb2Y: 5, leverA2: 6, leverB2: 7,
  poti: 8, finger1: 9, finger2: 10, finger3: 11, finger4: 12
};

const PI_AXIS_LABELS = {
  thumbX: 'Thumbstick links/rechts', thumbY: 'Thumbstick hoch/runter',
  leverA: 'Hebel vor/zurück', leverB: 'Hebel links/rechts',
  thumb2X: 'Thumbstick links/rechts', thumb2Y: 'Thumbstick hoch/runter',
  leverA2: 'Hebel vor/zurück', leverB2: 'Hebel links/rechts',
  finger1: 'Fingertip 1', finger2: 'Fingertip 2', finger3: 'Fingertip 3', finger4: 'Fingertip 4',
  poti: 'Poti-Rad'
};

// Das Poti gehört laut Hendrik zum Bedienteil rechts, steht aber bewusst in KEINEM `axisKeys`
// (dort steuert es zusätzlich die Achsen-Hotspots im Modulbild und die Positionsübersetzung beim
// Layout-Kopieren zwischen den Slots, s. moduleFlow.js -- ein Eintrag dort erzeugte einen Hotspot
// ohne kalibrierte Position). Deshalb nur hier im Import-Dialog zugeschlagen; modules.js bleibt
// unangetastet. Wenn das Poti später ein echtes Element des Bedienteil-Moduls wird (Hotspot +
// Kalibrierung, 30.09.2026 besprochen), kann diese Sonderbehandlung ersatzlos weg.
const PI_EXTRA_AXES = { bedienteil: ['poti'] };

const PI_SLOT_OF_MODULE = { craftslot1: 'craftslot1', craftslot2: 'craftslot2' };

class ProfileImport {
  constructor() {
    this.modal = document.getElementById('profile-import-modal');
    this.body = document.getElementById('profile-import-body');
    this.footer = document.getElementById('profile-import-footer');
    this.titleEl = document.getElementById('profile-import-title');
    this.reset();
  }

  reset() {
    this.step = 'source';        // source | file | pick | detail
    this.fileMode = 'merge';
    this.profiles = [];
    this.currentName = null;
    this.target = null;
    this.source = null;
    this.modules = [];
    this.functionsById = {};
    this.macrosById = {};
    this.axisMode = 'profile';
    this.selectedModules = new Set();
    this.rows = [];
  }

  async open() {
    this.reset();
    this.modal.style.display = 'flex';
    this.render();
  }

  close() {
    this.modal.style.display = 'none';
    this.reset();
  }

  esc(text) { return escapeHtml(text); }   // js/basis.js

  // ===================== Schritt 1: Quelle =====================
  render() {
    const steps = { source: this.renderSource, file: this.renderFile, pick: this.renderPick, detail: this.renderDetail };
    (steps[this.step] || this.renderSource).call(this);
  }

  renderSource() {
    this.titleEl.textContent = 'Importieren';
    this.body.innerHTML = `
      <p style="color: var(--text-dim);">Woher sollen die Belegungen kommen?</p>
      <div class="button-group" style="flex-direction: column; align-items: stretch; gap: 10px;">
        <button class="btn-secondary" style="text-align: left; padding: 12px;" onclick="window.profileImport.goFile()">
          <strong>Aus Datei</strong><br>
          <span style="color: var(--text-dim); font-size: 0.9em;">Zuvor exportierte Profil-Datei (.json) einlesen – fügt ganze Profile hinzu.</span>
        </button>
        <button class="btn-secondary" style="text-align: left; padding: 12px;" onclick="window.profileImport.goPick()">
          <strong>Aus vorhandenem Profil</strong><br>
          <span style="color: var(--text-dim); font-size: 0.9em;">Einzelne Module aus einem anderen Profil ins aktive Profil übernehmen.</span>
        </button>
      </div>`;
    this.footer.innerHTML = `<button class="btn-secondary" onclick="window.profileImport.close()">Abbrechen</button>`;
  }

  // ===================== Zweig A: Datei =====================
  goFile() { this.step = 'file'; this.render(); }

  renderFile() {
    this.titleEl.textContent = 'Aus Datei importieren';
    const opt = (value, title, desc) => `
      <label style="display: flex; gap: 8px; align-items: flex-start; padding: 8px; cursor: pointer;">
        <input type="radio" name="profile-import-mode" value="${value}" ${this.fileMode === value ? 'checked' : ''}
               onchange="window.profileImport.fileMode = this.value">
        <span><strong>${title}</strong><br><span style="color: var(--text-dim); font-size: 0.9em;">${desc}</span></span>
      </label>`;
    this.body.innerHTML = `
      <p style="color: var(--text-dim);">Was soll mit Profilen passieren, die es schon gibt?</p>
      ${opt('merge', 'Zusammenführen', 'Gleichnamige Profile werden überschrieben, neue kommen dazu. (Empfohlen)')}
      ${opt('add-missing', 'Nur neue hinzufügen', 'Vorhandene Profile bleiben unangetastet.')}
      ${opt('replace', 'Alles ersetzen', 'Erst alle vorhandenen Profile löschen, dann importieren.')}`;
    this.footer.innerHTML = `
      <button class="btn-success" onclick="window.profileImport.pickFile()">Datei wählen …</button>
      <button class="btn-secondary" onclick="window.profileImport.back('source')">Zurück</button>`;
  }

  pickFile() {
    const input = document.getElementById('profile-import-file');
    input.value = '';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const res = await fetch('/api/profiles/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data, mode: this.fileMode })
        });
        const result = await res.json();
        if (result.success) {
          window.showToast('Profile importiert');
          if (window.app) await window.app.loadProfiles();
          this.close();
        } else {
          this.showError('Import fehlgeschlagen: ' + result.error);
        }
      } catch (error) {
        this.showError('Datei konnte nicht gelesen werden: ' + error.message);
      }
    };
    input.click();
  }

  showError(text) {
    this.body.insertAdjacentHTML('afterbegin',
      `<p style="color: var(--danger, #c62828);">${this.esc(text)}</p>`);
  }

  // ===================== Zweig B: aus Profil =====================
  async goPick() {
    try {
      const [profilesRes, functionsRes, macrosRes, modulesRes, modeRes] = await Promise.all([
        fetch('/api/profiles').then(r => r.json()),
        fetch('/api/functions').then(r => r.json()),
        fetch('/api/macros').then(r => r.json()),
        fetch('/api/modules').then(r => r.json()),
        fetch('/api/axis-assignment-mode').then(r => r.json())
      ]);
      this.profiles = profilesRes.profiles || [];
      this.currentName = profilesRes.current;
      this.target = this.profiles.find(p => p.name === this.currentName) || null;
      (functionsRes.functions || []).forEach(f => { this.functionsById[f.id] = f.name; });
      (macrosRes.macros || []).forEach(m => { this.macrosById[m.id] = m.name; });
      this.modules = modulesRes.modules || [];
      this.axisMode = modeRes.mode || 'profile';
    } catch (error) {
      this.showError('Daten konnten nicht geladen werden: ' + error.message);
      return;
    }
    this.step = 'pick';
    this.render();
  }

  back(step) { this.step = step; this.render(); }

  renderPick() {
    this.titleEl.textContent = 'Aus vorhandenem Profil übernehmen';
    const others = this.profiles.filter(p => p.name !== this.currentName);
    if (!this.target) {
      this.body.innerHTML = `<p style="color: var(--danger, #c62828);">Kein aktives Profil gefunden.</p>`;
      this.footer.innerHTML = `<button class="btn-secondary" onclick="window.profileImport.back('source')">Zurück</button>`;
      return;
    }
    if (profilGeschuetzt(this.target.name)) {
      this.body.innerHTML = `<p>Aktiv ist der ${PROFIL_STANDARD_NAME}. Er ist schreibgeschützt und übernimmt keine Belegung. Aktiviere das Profil, in das du übernehmen willst, oder kopiere den ${PROFIL_STANDARD_NAME} als eigenes Profil.</p>`;
      this.footer.innerHTML = `<button class="btn-secondary" onclick="window.profileImport.back('source')">Zurück</button>
        <button class="btn-primary" onclick="window.profileImport.close(); window.app.duplicateProfile(PROFIL_STANDARD, { aktivieren: true })">Als eigenes Profil kopieren</button>`;
      return;
    }
    if (others.length === 0) {
      this.body.innerHTML = `<p style="color: var(--text-dim);">Es gibt kein weiteres Profil, aus dem übernommen werden könnte.</p>`;
      this.footer.innerHTML = `<button class="btn-secondary" onclick="window.profileImport.back('source')">Zurück</button>`;
      return;
    }
    const items = others.map(p => `
      <label style="display: flex; align-items: center; gap: 8px; padding: 6px;">
        <input type="radio" name="profile-import-source" value="${this.esc(p.name)}"
               onchange="window.profileImport.setSource(this.value)">
        <span>${this.esc(profilAnzeige(p.name))}${p.description ? ` <span style="color: var(--text-dim);">– ${this.esc(p.description)}</span>` : ''}</span>
      </label>`).join('');
    this.body.innerHTML = `
      <p>Ziel: <strong>${this.esc(this.target.name)}</strong> <span style="color: var(--text-dim);">(aktives Profil)</span></p>
      <p style="color: var(--text-dim);">Aus welchem Profil soll übernommen werden?</p>
      <div>${items}</div>`;
    this.footer.innerHTML = `
      <button class="btn-success" id="profile-import-next" disabled onclick="window.profileImport.goDetail()">Weiter</button>
      <button class="btn-secondary" onclick="window.profileImport.back('source')">Zurück</button>`;
  }

  setSource(name) {
    this.source = this.profiles.find(p => p.name === name) || null;
    const next = document.getElementById('profile-import-next');
    if (next) next.disabled = !this.source;
  }

  goDetail() {
    if (!this.source) return;
    this.buildRows();
    this.step = 'detail';
    this.render();
  }

  // ---------- Zeilen aufbauen ----------
  sameValue(a, b) { return JSON.stringify(a ?? null) === JSON.stringify(b ?? null); }

  // Belegungstext wie in der Modulübersicht (moduleFlow.js): Funktions-ID, "macro:<id>" oder rohe
  // Aktionsliste -- alle drei Formen kommen in profile.buttons vor.
  bindingLabel(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') {
      if (value.startsWith('macro:')) {
        const name = this.macrosById[value.slice('macro:'.length)];
        return name ? `🔁 ${name}` : '🔁 (Makro gelöscht)';
      }
      if (value === 'macro-abort') return 'Makro abbrechen';
      if (window.hubActions?.isHub(value)) return window.hubActions.label(value);
      return this.functionsById[value] || `(unbekannte Funktion ${value})`;
    }
    if (Array.isArray(value) && value.length > 0) return describeActions(value);
    return null;
  }

  axisLabel(value) {
    if (!value) return null;
    if (value.type === 'gamepad') {
      return `Gamepad-Achse ${(value.axisId ?? 0) + 1}${value.invert ? ' (gespiegelt)' : ''}`;
    }
    if (value.type === 'function') {
      const plus = this.functionsById[value.functionPlus] || '–';
      const minus = this.functionsById[value.functionMinus] || '–';
      return `Funktion: ${plus} / ${minus}`;
    }
    return 'belegt';
  }

  buildRows() {
    this.rows = [];
    for (const mod of this.modules) {
      this.buildButtonRows(mod, 1, null);
      const slotId = PI_SLOT_OF_MODULE[mod.id];
      if (slotId) {
        for (let layer = 2; layer <= 4; layer++) this.buildButtonRows(mod, layer, slotId);
      }
      this.buildAxisRows(mod);
    }
  }

  buildButtonRows(mod, layer, slotId) {
    const srcBucket = layer > 1
      ? (this.source.craftSlotLayers?.[slotId]?.[layer] || {})
      : (this.source.buttons || {});
    const tgtBucket = layer > 1
      ? (this.target.craftSlotLayers?.[slotId]?.[layer] || {})
      : (this.target.buttons || {});

    const [from, to] = mod.buttonRange;
    const rows = [];
    for (let human = from; human <= to; human++) {
      const buttonId = String(human - 1);          // 1-basiert -> 0-basiert, s. Kommentarkopf
      const src = srcBucket[buttonId] ?? null;
      const tgt = tgtBucket[buttonId] ?? null;
      const same = this.sameValue(src, tgt);
      if (layer > 1 && src === null && tgt === null) continue;   // Ebenen bleiben sonst endlos lang
      rows.push({
        key: `b-${mod.id}-${layer}-${buttonId}`,
        moduleId: mod.id, kind: 'button', layer, slotId, buttonId, human,
        src, tgt,
        srcLabel: this.bindingLabel(src), tgtLabel: this.bindingLabel(tgt),
        same,
        disabled: same,
        disabledReason: same ? 'unverändert' : null,
        // Leere Quelle würde die Zielbelegung löschen -> bewusst NICHT vorausgewählt.
        checked: !same && src !== null
      });
    }
    // Ebenen 2-4 nur zeigen, wenn dort überhaupt etwas steht (Quelle ODER Ziel)
    if (layer > 1 && rows.length === 0) return;
    this.rows.push(...rows);
  }

  buildAxisRows(mod) {
    const keys = [...(mod.axisKeys || []), ...(PI_EXTRA_AXES[mod.id] || [])];
    for (const axisKey of keys) {
      const idx = PI_AXIS_INDEX[axisKey];
      if (idx === undefined) continue;
      const src = this.source.axes?.[idx] ?? null;
      const tgt = this.target.axes?.[idx] ?? null;
      const same = this.sameValue(src, tgt);
      // Im globalen Modus gilt profile.axes gar nicht -- Kopieren bliebe wirkungslos, deshalb gesperrt.
      const globalMode = this.axisMode === 'global';
      this.rows.push({
        key: `a-${mod.id}-${axisKey}`,
        moduleId: mod.id, kind: 'axis', axisKey, axisIndex: idx,
        src, tgt,
        srcLabel: this.axisLabel(src), tgtLabel: this.axisLabel(tgt),
        same,
        disabled: same || globalMode,
        disabledReason: globalMode ? 'global' : (same ? 'unverändert' : null),
        checked: !same && !globalMode && src !== null
      });
    }
  }

  // ---------- Detailansicht ----------
  renderDetail() {
    this.titleEl.textContent = `Aus „${this.source.name}“ übernehmen`;
    const blocks = this.modules.map(mod => this.renderModuleBlock(mod)).join('');
    const globalHint = this.axisMode === 'global' ? `
      <p style="color: var(--amber, #c77a00);">
        Die Achsen-Zuordnung steht auf <strong>global</strong> – sie gilt dann für alle Profile und wird
        hier nicht kopiert. Umstellen unter Einstellungen → Ersteinrichtung → Achsen-Kalibrierung.
      </p>` : '';
    this.body.innerHTML = `
      <p>Ziel: <strong>${this.esc(this.target.name)}</strong> <span style="color: var(--text-dim);">(aktives Profil)</span></p>
      ${globalHint}
      <p style="color: var(--text-dim); font-size: 0.9em;">
        Tipp: Unter <em>Sicherung</em> lässt sich vorher ein Bundle anlegen, falls du den Import zurücknehmen willst.
      </p>
      <div>${blocks}</div>`;
    this.footer.innerHTML = `
      <button class="btn-success" onclick="window.profileImport.apply()">Übernehmen</button>
      <button class="btn-secondary" onclick="window.profileImport.back('pick')">Zurück</button>`;
    this.updateSummary();
  }

  renderModuleBlock(mod) {
    const rows = this.rows.filter(r => r.moduleId === mod.id);
    if (rows.length === 0) return '';
    const changeable = rows.filter(r => !r.disabled).length;
    const open = this.selectedModules.has(mod.id);
    const head = `
      <label style="display: flex; align-items: center; gap: 8px; padding: 8px; border-top: 1px solid var(--border, #444);">
        <input type="checkbox" ${open ? 'checked' : ''} onchange="window.profileImport.toggleModule('${mod.id}', this.checked)">
        <strong>${this.esc(mod.name)}</strong>
        <span style="color: var(--text-dim); font-size: 0.9em;">
          ${changeable === 0 ? 'keine Unterschiede' : `${changeable} Änderung${changeable === 1 ? '' : 'en'} möglich`}
        </span>
      </label>`;
    if (!open) return head;
    return head + `<div style="padding: 0 0 10px 26px;">${this.renderRows(rows)}</div>`;
  }

  renderRows(rows) {
    let html = '';
    let lastGroup = null;
    for (const r of rows) {
      const group = r.kind === 'axis' ? 'Achsen'
        : (r.layer > 1 ? `Ebene ${r.layer}` : 'Ebene 1 (Grundbelegung)');
      if (group !== lastGroup) {
        html += `<div style="margin: 8px 0 4px; font-size: 0.85em; color: var(--text-dim);">${group}</div>`;
        lastGroup = group;
      }
      const name = r.kind === 'axis'
        ? this.esc(PI_AXIS_LABELS[r.axisKey] || r.axisKey)
        : `Taste ${r.human}`;
      const srcText = r.srcLabel ? this.esc(r.srcLabel) : '(leer)';
      let effect;
      if (r.disabledReason === 'global') effect = 'Achsen-Zuordnung ist global';
      else if (r.same) effect = 'unverändert';
      else if (r.src === null) effect = `würde löschen: ${this.esc(r.tgtLabel)}`;
      else if (r.tgt === null) effect = '(Ziel leer)';
      else effect = `ersetzt: ${this.esc(r.tgtLabel)}`;

      html += `
        <label style="display: flex; align-items: center; gap: 8px; padding: 3px 0; ${r.disabled ? 'opacity: 0.45;' : ''}">
          <input type="checkbox" data-row="${r.key}" ${r.checked ? 'checked' : ''} ${r.disabled ? 'disabled' : ''}
                 onchange="window.profileImport.toggleRow('${r.key}', this.checked)">
          <span style="min-width: 130px;">${name}</span>
          <span style="min-width: 160px;">${srcText}</span>
          <span style="color: var(--text-dim); font-size: 0.9em;">→ ${effect}</span>
        </label>`;
    }
    return html;
  }

  toggleModule(moduleId, checked) {
    if (checked) this.selectedModules.add(moduleId);
    else this.selectedModules.delete(moduleId);
    this.renderDetail();
  }

  toggleRow(key, checked) {
    const row = this.rows.find(r => r.key === key);
    if (row && !row.disabled) row.checked = checked;
    this.updateSummary();
  }

  // Nur Zeilen aus angehakten Modulen zählen/übernehmen -- ein abgewähltes Modul soll nichts tun,
  // auch wenn seine Zeilen noch vorausgewählt sind.
  activeRows() {
    return this.rows.filter(r => r.checked && !r.disabled && this.selectedModules.has(r.moduleId));
  }

  updateSummary() {
    const rows = this.activeRows();
    const replaced = rows.filter(r => r.src !== null).length;
    const cleared = rows.filter(r => r.src === null).length;
    const axes = rows.filter(r => r.kind === 'axis').length;
    const el = document.getElementById('profile-import-summary');
    const text = rows.length === 0
      ? 'Nichts ausgewählt'
      : `${replaced} übernehmen, ${cleared} leeren${axes ? `, davon ${axes} Achse${axes === 1 ? '' : 'n'}` : ''}`;
    if (el) el.textContent = text;
    else this.footer.insertAdjacentHTML('afterbegin',
      `<span id="profile-import-summary" style="margin-right: auto; color: var(--text-dim);">${text}</span>`);
  }

  // ---------- Übernehmen ----------
  async apply() {
    const rows = this.activeRows();
    if (rows.length === 0) { this.close(); return; }

    // Alle gewählten Stellen in EINEM Rutsch, aber nur diese (B3) -- nicht das ganze Profil aus der eigenen Kopie
    const profile = { name: this.target.name };
    const aenderungen = rows.map(r => {
      if (r.kind === 'axis') return { pfad: ['axes', String(r.axisIndex)], wert: r.src };
      const pfad = r.layer > 1 ? ['craftSlotLayers', r.slotId, String(r.layer), String(r.buttonId)] : ['buttons', String(r.buttonId)];
      return { pfad, wert: r.src };
    });

    try {
      await profilAendern(profile.name, aenderungen);

      const replaced = rows.filter(r => r.src !== null).length;
      const cleared = rows.filter(r => r.src === null).length;
      window.showToast(`${replaced} übernommen, ${cleared} geleert`);

      // Wie nach jedem Profil-Schreiben (s. app.js): Server auf das Profil neu einschwenken lassen
      // und die Ansichten neu laden, damit Modulübersicht/Funktionsliste den neuen Stand zeigen.
      if (window.app?.socket) window.app.socket.emit('switch-profile', { name: profile.name });
      if (window.app) { await window.app.loadProfiles(); window.app.loadFunctions(); }
      if (window.moduleFlow?.refreshHotspotLabels) window.moduleFlow.refreshHotspotLabels(null, 1);
      this.close();
    } catch (error) {
      this.showError('Speichern fehlgeschlagen: ' + error.message);
    }
  }
}

window.profileImport = new ProfileImport();
