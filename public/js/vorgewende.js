/**
 * Vorgewendemanagement -- Verwaltung der Makros (Liste + Editor).
 * Die eigentliche Ablaufsteuerung läuft serverseitig in server/macroEngine.js; hier nur CRUD-UI.
 * Zuweisung eines Makros zu einer Taste erfolgt NICHT hier, sondern im normalen Bearbeiten-Flow
 * einer Taste (s. MappingModal.openButtonMapping() in app.js -- Makros erscheinen dort als
 * Pseudo-Funktionen unter der Kategorie "Makros").
 */

class VorgewendeManager {
  constructor() {
    this.container = document.getElementById('tab-vorgewende');
    this.macros = [];
    this.allFunctions = [];
    this.editingId = null; // '' = neues Makro, sonst Makro-ID; null = Listenansicht
    this.draft = null;     // { name, steps: [...] } während der Bearbeitung

    // Liste/Schritte sollen immer den verfügbaren Platz ausfüllen (auch wenn kurz) und nur SIE SELBST
    // scrollen, nicht die ganze Seite -- muss bei jeder Fenstergrößenänderung neu berechnet werden.
    window.addEventListener('resize', () => this.resizeActiveScrollArea());
  }

  resizeActiveScrollArea() {
    if (this.draft) {
      this.resizeScrollArea('vorgewende-steps-scroll', '#vorgewende-editor-actions');
    } else {
      this.resizeScrollArea('vorgewende-list-scroll');
    }
  }

  // Setzt eine FESTE Höhe (nicht nur max-height) auf den Listen-Container, damit er den verfügbaren
  // Platz immer ausfüllt -- auch wenn der Inhalt kürzer ist (Hendriks Feedback) -- und nur er selbst
  // scrollt (overflow-y:auto, s. CSS), nicht die ganze Seite. Gleiches Prinzip wie app.js
  // resizeProfileList(). trailingSelector (optional): ein Element NACH dem Container, dessen Höhe
  // zusätzlich freigehalten werden muss (z.B. die feste Abbrechen/Speichern-Zeile im Editor).
  resizeScrollArea(containerId, trailingSelector) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    const trailing = trailingSelector ? document.querySelector(trailingSelector) : null;
    const trailingHeight = trailing ? trailing.getBoundingClientRect().height + 12 : 0;
    const available = window.innerHeight - top - trailingHeight - 24; // 24px ~ <main> Bottom-Padding
    el.style.height = Math.max(80, available) + 'px';
  }

  async load() {
    const [macrosRes, functionsRes, verwendungRes] = await Promise.all([
      fetch('/api/macros'),
      fetch('/api/functions'),
      fetch('/api/macros/verwendung').catch(() => null)
    ]);
    const macrosData = await macrosRes.json();
    const functionsData = await functionsRes.json();
    this.macros = macrosData.macros || [];
    this.allFunctions = functionsData.functions || [];
    try { this.verwendung = (await verwendungRes?.json())?.verwendung || {}; } catch { this.verwendung = {}; }
    this.render();
  }

  render() {
    if (this.draft) {
      this.renderEditor();
    } else {
      this.renderList();
    }
  }

  // Liste im Stil der Funktionen (Durchsicht B10, Hendrik 24.10.2026): Kopf mit Anzahl, „Mehr“ (Export/Import), „+ Neues
  // Makro“; je Zeile Name, Schritte und Auslöser, wo es belegt ist und „⋯“ (Bearbeiten, Duplizieren, Wo belegt?,
  // Exportieren, Löschen). Antippen öffnet den Editor.
  renderList() {
    const AUSL = { time: 'Zeit', distance: 'Strecke', button: 'Tastendruck' };
    const ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h11l-3-3M20 17H9l3 3"></path></svg>';
    const DOTS = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><circle cx="19" cy="12" r="1.8"></circle></svg>';
    const rows = this.macros.length === 0
      ? '<p class="ov-intro" style="padding: 16px 20px;">Noch keine Makros angelegt.</p>'
      // ID per Index statt im onclick-String (importierte IDs/Namen mit ' oder < brachen sonst die Liste)
      : this.macros.map((m, i) => {
        const n = m.steps.length;
        const ausl = [...new Set(m.steps.slice(1).map(st => AUSL[st.trigger?.type] || AUSL.button))];
        const sub = `${n} ${n === 1 ? 'Schritt' : 'Schritte'}${ausl.length ? ' · ' + ausl.join(', ') : ''}`;
        const funde = this.verwendung?.[m.id] || [];
        const belegt = funde.length
          ? `<span class="mk-belegt" title="${escapeHtml(funde.join('\n'))}">belegt${funde.length > 1 ? ` (${funde.length})` : ''}</span>`
          : '<span class="mk-belegt mk-belegt--nein">nicht belegt</span>';
        return `<div class="fn-row" data-macro="${i}">
          <button type="button" class="fn-open" data-act="edit"><span class="fn-ic">${ICON}</span>
            <span class="fn-txt"><b>${escapeHtml(m.name)}</b><small>${escapeHtml(sub)}</small></span>${belegt}</button>
          <button type="button" class="ov-icon-btn" data-act="more" aria-label="Weitere Aktionen für ${escapeHtml(m.name)}" aria-haspopup="menu">${DOTS}</button>
        </div>`;
      }).join('');

    this.container.innerHTML = `
      <div class="ov-page">
        <div class="ov-head">
          <h1 class="ov-title">Makros</h1><span class="ov-count">${this.macros.length}</span>
          <div class="ov-spacer"></div>
          <button type="button" class="ov-btn" data-act="mehr" aria-haspopup="menu">Mehr <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg></button>
          <button type="button" class="ov-btn ov-btn--primary" onclick="window.vorgewende.newMacro()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>Neues Makro</button>
        </div>
        <p class="ov-intro">Ein Makro löst mehrere Funktionen nacheinander aus: Schritt 1 sofort beim Tastendruck, jeder weitere durch seinen eigenen Auslöser (Zeit, Strecke oder erneuter Tastendruck). Auf eine Taste legst du es wie eine Funktion, in der Gruppe „Makros“; dort steht auch „Makro abbrechen“.</p>
        <section class="ov-panel" aria-label="Makroliste">
          <div class="ov-panel-head"><h2>Alle Makros</h2><div class="ov-spacer"></div><span class="ov-hint">Antippen zum Bearbeiten</span></div>
          <div id="vorgewende-list-scroll" class="fn-list">${rows}</div>
        </section>
      </div>`;
    this.container.querySelector('[data-act="mehr"]').addEventListener('click', e => this.openMoreMenu(e.currentTarget));
    this.container.querySelectorAll('.fn-row[data-macro]').forEach(row => {
      const m = this.macros[Number(row.dataset.macro)];
      row.querySelector('[data-act="edit"]').addEventListener('click', () => this.editMacro(m?.id));
      row.querySelector('[data-act="more"]').addEventListener('click', e => this.openMacroMenu(m, e.currentTarget));
    });
    this.resizeScrollArea('vorgewende-list-scroll');
  }

  openMoreMenu(anchor) {
    uiMenu(anchor, [
      { label: 'Alle exportieren', run: () => this.exportMacros() },
      { label: 'Importieren …', run: () => this.importMacros() }
    ], { key: 'macros-more' });
  }

  openMacroMenu(m, anchor) {
    if (!m) return;
    const funde = this.verwendung?.[m.id] || [];
    uiMenu(anchor, [
      { label: 'Bearbeiten', run: () => this.editMacro(m.id) },
      { label: 'Duplizieren', run: () => this.duplicateMacro(m) },
      { label: funde.length ? `Wo belegt? (${funde.length})` : 'Wo belegt?', run: () => uiAlert(funde.length ? funde.join('\n') : 'Dieses Makro liegt auf keiner Taste, Kachel und keinem GPS-Auslöser.', { title: `„${m.name}“` }) },
      { label: 'Exportieren', run: () => this.exportOne(m) },
      null,
      { label: 'Löschen', danger: true, run: () => this.confirmDeleteMacro(m.id) }
    ], { key: 'macro:' + m.id });
  }

  async duplicateMacro(m) {
    const name = (await uiPrompt('Name der Kopie:', `${m.name} (Kopie)`, { title: 'Makro duplizieren', ok: 'Duplizieren' }))?.trim();
    if (!name) return;
    try {
      const res = await fetch('/api/macro/save', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: `macro-${Date.now()}`, macro: { name, steps: JSON.parse(JSON.stringify(m.steps)) } }) });
      const r = await res.json();
      if (!r.success) throw new Error(r.error || 'unbekannter Fehler');
      window.showToast(`Makro "${name}" angelegt`);
      await this.load();
    } catch (error) {
      uiAlert('Duplizieren fehlgeschlagen: ' + error.message);
    }
  }

  // Ein Makro als Datei, im selben Format wie „Alle exportieren“ (lässt sich genauso importieren)
  exportOne(m) {
    const { id, ...macro } = m;
    downloadJson({ version: '1.0', macros: { [id]: macro }, exportDate: new Date().toISOString() }, `Makro ${m.name}`);
    window.showToast(`Makro "${m.name}" exportiert (Ordner Downloads)`);
  }

  newMacro() {
    this.draft = { name: '', steps: [{ functionId: '' }] };
    this.editingId = '';
    this.render();
  }

  editMacro(id) {
    const macro = this.macros.find(m => m.id === id);
    if (!macro) return;
    this.draft = JSON.parse(JSON.stringify(macro)); // Tiefe Kopie -- Abbrechen darf das Original nicht verändern
    this.editingId = id;
    this.render();
  }

  cancelEdit() {
    this.draft = null;
    this.editingId = null;
    this.render();
  }

  // Mit Blick auf die Verwendung (Durchsicht B2, s. app.js loeschenMitVerwendung())
  async confirmDeleteMacro(id) {
    if (id == null) return;
    const macro = this.macros.find(m => m.id === id);
    const name = macro ? macro.name : id;
    try {
      const enc = encodeURIComponent(id);
      if (!(await loeschenMitVerwendung({ art: 'Makro', name, verwendungUrl: `/api/macro/${enc}/verwendung`, loeschUrl: `/api/macro/${enc}` }))) return;
      window.showToast(`Makro "${name}" gelöscht`);
      await this.load();
    } catch (error) {
      uiAlert('Löschen fehlgeschlagen: ' + error.message);
    }
  }

  updateDraftName(value) {
    this.draft.name = value;
  }

  addStep() {
    this.draft.steps.push({ functionId: '', trigger: { type: 'time', seconds: 3 } });
    this.render();
  }

  removeStep(index) {
    if (this.draft.steps.length <= 1) return; // mindestens ein Schritt muss bleiben
    this.draft.steps.splice(index, 1);
    if (this.draft.steps[0]) delete this.draft.steps[0].trigger; // Schritt 0 darf nie einen Trigger haben
    this.render();
  }

  moveStep(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= this.draft.steps.length) return;
    [this.draft.steps[index], this.draft.steps[target]] = [this.draft.steps[target], this.draft.steps[index]];
    if (this.draft.steps[0]) delete this.draft.steps[0].trigger;
    for (let i = 1; i < this.draft.steps.length; i++) {
      if (!this.draft.steps[i].trigger) this.draft.steps[i].trigger = { type: 'time', seconds: 3 };
    }
    this.render();
  }

  // Fügt eine eigenständige Kopie direkt hinter dem Original ein -- praktisch für mehrere ähnliche
  // Schritte, die sich nur im Auslöser-Wert unterscheiden. Tiefe Kopie, damit das trigger-Objekt nicht
  // zwischen Original und Kopie geteilt wird (sonst würde eine spätere Änderung an einem der beiden
  // auch den anderen mitändern).
  duplicateStep(index) {
    const copy = JSON.parse(JSON.stringify(this.draft.steps[index]));
    this.draft.steps.splice(index + 1, 0, copy);
    // Schritt 0 darf nie einen Trigger haben (feuert sofort bei Tastendruck) -- greift z.B., wenn genau
    // Schritt 0 kopiert wird und die Kopie dadurch auf Position 1 landet.
    if (this.draft.steps[0]) delete this.draft.steps[0].trigger;
    for (let i = 1; i < this.draft.steps.length; i++) {
      if (!this.draft.steps[i].trigger) this.draft.steps[i].trigger = { type: 'time', seconds: 3 };
    }
    this.render();
  }

  openStepActionPicker(index) {
    const step = this.draft.steps[index];
    window.actionPicker.open(
      { functionId: step.functionId, quickActions: step.quickActions },
      {
        includeMacros: false, // ein Makro-Schritt darf kein weiteres Makro auslösen, s. macroEngine.fireStep()
        // Der Schritt hat schon eine eigene Haltedauer (s. holdDurationHtml() unten) -- ein zusätzliches
        // Pflicht-Dauer-Feld im ActionPicker selbst wäre doppelt gemoppelt (Hendriks Feedback).
        axisNeedsDuration: false
      },
      (result) => this.setStepAction(index, result)
    );
  }

  setStepAction(index, result) {
    const step = this.draft.steps[index];
    delete step.functionId;
    delete step.quickActions;
    if (result.mode === 'function') {
      step.functionId = result.functionId;
    } else {
      step.quickActions = result.quickActions;
      // Eine Achse braucht immer eine Dauer (anders als Tastatur/Funktion, wo "kein Haken" = kurzer
      // Antipp-Standard sinnvoll ist) -- nur setzen, wenn noch keine eigene Haltedauer für diesen
      // Schritt existiert, damit ein bereits gewählter Wert beim bloßen Ändern von Achse/Richtung
      // erhalten bleibt. holdDurationHtml() sperrt die Checkbox danach (s. dort).
      if (result.mode === 'axis' && step.holdSeconds == null) step.holdSeconds = 1;
    }
    this.render();
  }

  // Zeigt die aktuelle Zuordnung eines Schritts an -- Funktion aus this.allFunctions nachgeschlagen,
  // eine Schnellbelegung (Taste/Achse) direkt aus den quickActions beschrieben (dieselbe Beschreibung
  // wie in steuerungsmenues.js für Bedienpanel-Tasten, s. describeActions() in app.js).
  stepActionLabel(step) {
    if (step.functionId) {
      const func = this.allFunctions.find(f => f.id === step.functionId);
      return func ? func.name : step.functionId;
    }
    if (step.quickActions && step.quickActions.length > 0) {
      return describeActions(step.quickActions);
    }
    return 'Keine Zuordnung';
  }

  setStepTriggerType(index, type) {
    const step = this.draft.steps[index];
    if (type === 'time') step.trigger = { type: 'time', seconds: 3 };
    else if (type === 'distance') step.trigger = { type: 'distance', meters: 15 };
    else step.trigger = { type: 'button' };
    this.render();
  }

  setStepTriggerValue(index, value) {
    const step = this.draft.steps[index];
    const num = parseFloat(value);
    // Zeit: 0,1-s-Raster (serverseitig setTimeout, s. macroEngine.js fireStep() -- feiner als der
    // Telemetrie-Tick, an dem nur der Auslöser "Strecke" haengt). Leere/ungueltige Eingabe faellt
    // auf den kleinsten sinnvollen Wert zurueck statt auf NaN.
    if (step.trigger.type === 'time') step.trigger.seconds = Math.max(0.1, Math.round((num || 0) * 10) / 10);
    else if (step.trigger.type === 'distance') step.trigger.meters = Math.max(1, num || 1);
  }

  renderEditor() {
    const stepsHtml = this.draft.steps.map((step, i) => {
      const isFirst = i === 0;
      const triggerHtml = isFirst
        ? '<span style="color: var(--text-dim); font-size: 0.9rem;">Feuert sofort bei Tastendruck</span>'
        : this.triggerControlsHtml(step, i);

      return `
        <div class="action-item" style="align-items:flex-start; flex-direction:column; gap:10px;">
          <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
            <strong>Schritt ${i + 1}</strong>
            <div style="display:flex; gap:6px;">
              <button class="btn-secondary btn-small" ${i === 0 ? 'disabled' : ''} onclick="window.vorgewende.moveStep(${i}, -1)">↑</button>
              <button class="btn-secondary btn-small" ${i === this.draft.steps.length - 1 ? 'disabled' : ''} onclick="window.vorgewende.moveStep(${i}, 1)">↓</button>
              <button class="btn-secondary btn-small" onclick="window.vorgewende.duplicateStep(${i})">Kopieren</button>
              <button class="btn-danger btn-small" ${this.draft.steps.length <= 1 ? 'disabled' : ''} onclick="window.vorgewende.removeStep(${i})">Entfernen</button>
            </div>
          </div>
          <div class="form-group" style="width:100%;">
            <label>Aktion</label>
            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
              <span style="color: var(--text-dim);">${escapeHtml(this.stepActionLabel(step))}</span>
              <button type="button" class="btn-secondary btn-small" onclick="window.vorgewende.openStepActionPicker(${i})">Aktion zuordnen</button>
            </div>
          </div>
          ${triggerHtml}
          ${this.holdDurationHtml(step, i)}
        </div>
      `;
    }).join('');

    this.container.innerHTML = `
      <section class="card" style="display:flex; flex-direction:column; height:100%;">
        <h3 style="margin-top:0; flex-shrink:0;">${this.editingId ? 'Makro bearbeiten' : 'Neues Makro'}</h3>
        <div class="form-group" style="flex-shrink:0;">
          <label>Name</label>
          <input type="text" value="${escapeHtml(this.draft.name)}" placeholder="z.B. Vorgewende Mähdrescher" oninput="window.vorgewende.updateDraftName(this.value)">
        </div>
        <h4 style="margin-bottom: 5px; flex-shrink:0;">Schritte</h4>
        <div id="vorgewende-steps-scroll" style="overflow-y:auto;">
          ${stepsHtml}
          <button class="btn-secondary btn-small" style="margin-top:10px;" onclick="window.vorgewende.addStep()">+ Schritt hinzufügen</button>
        </div>
        <div id="vorgewende-editor-actions" style="display:flex; gap:10px; justify-content:flex-end; margin-top:20px; flex-shrink:0;">
          <button class="btn-secondary" onclick="window.vorgewende.cancelEdit()">Abbrechen</button>
          <button class="btn-primary" onclick="window.vorgewende.saveDraft()">Speichern</button>
        </div>
      </section>
    `;
    this.resizeScrollArea('vorgewende-steps-scroll', '#vorgewende-editor-actions');
  }

  triggerControlsHtml(step, i) {
    const type = step.trigger?.type || 'time';
    const value = type === 'time' ? (step.trigger?.seconds ?? 3) : type === 'distance' ? (step.trigger?.meters ?? 15) : null;
    return `
      <div class="action-controls" style="width:100%;">
        <div class="form-group">
          <label>Auslöser</label>
          <select onchange="window.vorgewende.setStepTriggerType(${i}, this.value)">
            <option value="time" ${type === 'time' ? 'selected' : ''}>Zeit nach vorherigem Schritt</option>
            <option value="distance" ${type === 'distance' ? 'selected' : ''}>Zurückgelegte Strecke</option>
            <option value="button" ${type === 'button' ? 'selected' : ''}>Erneuter Tastendruck</option>
          </select>
        </div>
        ${type !== 'button' ? `
          <div class="form-group">
            <label>${type === 'time' ? 'Sekunden' : 'Meter'}</label>
            <input type="number" min="${type === 'time' ? '0.1' : '1'}" step="${type === 'time' ? '0.1' : '1'}" value="${value}" oninput="window.vorgewende.setStepTriggerValue(${i}, this.value)">
          </div>
        ` : ''}
      </div>
    `;
  }

  // Optional je Schritt: Aktion beim Auslösen für eine feste Dauer halten statt nur kurz antippen
  // (z.B. für FS25-Funktionen, die einen gehaltenen statt kurz gedrückten Tastendruck erwarten). Ohne
  // Haken bleibt es beim bisherigen kurzen Antippen (pulseActions()-Standarddauer, s. macroEngine.js
  // fireStep()). Bei einer Achsen-Zuordnung (s. ActionPicker "Achse belegen") ist die Checkbox
  // erzwungen aktiviert und lässt sich nicht abwählen -- eine Achse braucht IMMER eine Dauer, es gibt
  // anders als bei Tastatur/Funktion keinen sinnvollen "nur kurz antippen"-Normalfall dafür.
  holdDurationHtml(step, i) {
    const isAxis = Array.isArray(step.quickActions) && step.quickActions.some(a => a.type === 'axis');
    const held = step.holdSeconds != null;
    return `
      <div class="form-group" style="width:100%;">
        <label style="display:flex; align-items:center; gap:8px; cursor:${isAxis ? 'default' : 'pointer'};"
          ${isAxis ? 'title="Eine Achsen-Zuordnung braucht immer eine Aktionsdauer"' : ''}>
          <input type="checkbox" ${held ? 'checked' : ''} ${isAxis ? 'disabled' : ''} onchange="window.vorgewende.toggleStepHold(${i}, this.checked)">
          Aktionsdauer festlegen
        </label>
      </div>
      ${held ? `
        <div class="form-group" style="width:100%;">
          <label>Aktionsdauer (Sekunden)</label>
          <input type="number" min="0.1" step="0.1" value="${step.holdSeconds}" oninput="window.vorgewende.setStepHoldSeconds(${i}, this.value)">
        </div>
      ` : ''}
    `;
  }

  toggleStepHold(index, checked) {
    this.draft.steps[index].holdSeconds = checked ? 1 : null;
    this.render();
  }

  setStepHoldSeconds(index, value) {
    this.draft.steps[index].holdSeconds = Math.max(0.1, parseFloat(value) || 0.1);
  }

  async saveDraft() {
    const name = this.draft.name.trim();
    if (!name) {
      uiAlert('Bitte einen Namen für das Makro eingeben.');
      return;
    }
    if (this.draft.steps.some(s => !s.functionId && !(s.quickActions && s.quickActions.length > 0))) {
      uiAlert('Bitte für jeden Schritt eine Aktion zuordnen.');
      return;
    }
    const id = this.editingId || `macro-${Date.now()}`;
    try {
      const res = await fetch('/api/macro/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, macro: { name, steps: this.draft.steps } })
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'unbekannter Fehler');
    } catch (error) {
      uiAlert('Speichern fehlgeschlagen: ' + error.message);
      return; // Entwurf bleibt offen, nichts geht verloren
    }
    window.showToast(`Makro "${name}" gespeichert`);
    this.draft = null;
    this.editingId = null;
    await this.load();
  }

  // Export/Import 1:1 nach dem Muster von ControllerApp.exportFunctions()/importFunctions() (app.js).
  async exportMacros() {
    try {
      const response = await fetch('/api/macros/export');
      const data = await response.json();
      if (data.success) {
        downloadJson(data.data, `Makros ${new Date().toISOString().split('T')[0]}`);
        window.showToast('Makros exportiert (Ordner Downloads)');
      }
    } catch (error) {
      uiAlert('Export fehlgeschlagen: ' + error.message);
    }
  }

  async importMacros() {
    try {
      const data = await pickJsonFile();   // js/basis.js
      if (!data) return;
      const mode = await uiChoice('Wie sollen die Makros übernommen werden?\n\nZusammenführen: neue kommen dazu, schon vorhandene mit gleicher Kennung werden durch den Import überschrieben, alle übrigen bleiben.\nErsetzen: alle bisherigen Makros werden ersetzt.', [
        { label: 'Ersetzen', value: 'replace', danger: true }, { label: 'Zusammenführen', value: 'merge' }
      ], { title: 'Makros importieren' });
      if (!mode) return;
      const response = await fetch('/api/macros/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, mode })
      });
      const result = await response.json();
      if (result.success) {
        window.showToast('Makros importiert');
        await this.load();
      } else {
        uiAlert('Fehler: ' + result.error);
      }
    } catch (error) {
      uiAlert('Import fehlgeschlagen: ' + error.message);
    }
  }
}

window.vorgewende = new VorgewendeManager();
