/**
 * Achsen-Konfigurations-Popup: von einem Achsen-Hotspot in der Modulübersicht direkt erreichbar
 * (moduleFlow.js openAxis()), statt nur zur Achsen-Zuordnungsseite zu springen (Hendriks Wunsch
 * 21.08.2026: "direkt auf die Auswahl kommen"). Bündelt zwei bisher getrennte Einstellungen für
 * dieselbe physische Achse an einem Ort, ändert an deren Speicherung selbst aber nichts:
 *  - Achse-oder-Taste-Modus + Auslöseschwelle: geräteweite Einstellung (SET-Protokoll, s.
 *    deviceSettings.js) -- für Hebel A/B je CraftSlot, Fingertip 1-4 UND (seit 24.08.2026) auch
 *    Thumbstick X/Y je CraftSlot, s. AXIS_MODE_CONFIG in moduleFlow.js.
 *  - Gamepad-Achsen-Zuordnung + Spiegeln: pro Profil/global (axisAssignment.js) -- ruft dessen
 *    bestehende assignSlot()/toggleInvert()/slotOwners() direkt auf, damit es nur eine Quelle der
 *    Wahrheit fürs Speichern gibt; dieses Popup zeichnet nur eine eigene, kompaktere Zeile dafür.
 */

// Die eigentliche Config (modeKey/threshKey/buttonValue/title/buttons) kommt aus moduleFlow.js als
// window.AXIS_MODE_CONFIG -- einzige Quelle der Wahrheit, da auch die Modulübersicht/Kalibrierung
// dieselben Daten braucht (welche 2 Tasten je Achse nur im Tastenmodus relevant sind). WICHTIG: hier
// bewusst NICHT nochmal als eigenes top-level `const AXIS_MODE_CONFIG` deklariert -- normale
// <script>-Tags (kein type="module") teilen sich einen globalen Scope, eine zweite `const`/`let`
// mit demselben Namen wäre ein SyntaxError und würde diese ganze Datei am Ausführen hindern (genau
// das ist Hendrik passiert: Popup + Umschalter kamen deshalb gar nicht erst zustande).

// Nur für den Modal-Titel -- seit Thumbstick-als-Taste (24.08.2026) deckt AXIS_MODE_CONFIG bereits
// alle Achsen ab, kein separater Fallback mehr nötig.
const AXIS_TITLES = Object.fromEntries(Object.entries(window.AXIS_MODE_CONFIG).map(([k, c]) => [k, c.title]));

class AxisConfigModal {
  constructor() {
    this.modal = document.getElementById('axis-config-modal');
    this.title = document.getElementById('axis-config-modal-title');
    this.body = document.getElementById('axis-config-modal-body');
    this.axisKey = null;
    this.deviceSettings = {};
  }

  async open(axisKey) {
    this.axisKey = axisKey;
    this.title.textContent = AXIS_TITLES[axisKey] || axisKey;
    await this.loadDeviceSettings();
    this.render();
    this.modal.style.display = 'flex';
  }

  close() {
    this.modal.style.display = 'none';
  }

  async loadDeviceSettings() {
    const modeConfig = window.AXIS_MODE_CONFIG[this.axisKey];
    if (!modeConfig) { this.deviceSettings = {}; return; }
    try {
      const res = await fetch('/api/device-config');
      const data = await res.json();
      this.deviceSettings = data.success ? data.settings : {};
    } catch (error) {
      this.deviceSettings = {};
    }
  }

  render() {
    const modeConfig = window.AXIS_MODE_CONFIG[this.axisKey];
    const isButtonMode = modeConfig && this.deviceSettings[modeConfig.modeKey] === modeConfig.buttonValue;

    const modeSectionHtml = modeConfig ? `
      <div class="mapping-card">
        <div class="input-group">
          <label>Modus:</label>
          <div class="button-group">
            <button type="button" class="btn-small ${!isButtonMode ? 'btn-primary' : 'btn-secondary'}"
                    onclick="window.axisConfigModal.setMode('achse')">Achse</button>
            <button type="button" class="btn-small ${isButtonMode ? 'btn-primary' : 'btn-secondary'}"
                    onclick="window.axisConfigModal.setMode('${modeConfig.buttonValue}')">Taste</button>
          </div>
        </div>
        ${isButtonMode ? `
          <div class="size-row">
            <label>Auslöseweg</label>
            <input type="range" min="10" max="95" step="1" value="${this.deviceSettings[modeConfig.threshKey] ?? 50}"
              oninput="document.getElementById('axis-config-thresh-readout').textContent = this.value + '%'"
              onchange="window.axisConfigModal.setThreshold(this.value)">
            <span id="axis-config-thresh-readout">${this.deviceSettings[modeConfig.threshKey] ?? 50}%</span>
          </div>
          <p style="color: var(--text-dim); font-size: 0.8rem; margin-top: 4px;">
            Gilt geräteweit für alle ${this.axisKey.startsWith('finger') ? 'Fingertip' : this.axisKey.startsWith('thumb') ? 'Thumbstick' : 'Hebel'}-Achsen gemeinsam, nicht nur für diese eine.
          </p>
        ` : ''}
      </div>
    ` : '';

    // Gamepad-Achsen-Zuordnung nur sinnvoll, solange die physische Achse tatsächlich als Achse läuft
    // (im Tastenmodus gibt es keinen kontinuierlichen Wert, der einem Gamepad-Achsen-Platz zugewiesen
    // werden könnte -- deshalb hier ausgeblendet statt eine wirkungslose Auswahl zu zeigen).
    const showAxisAssignment = !modeConfig || !isButtonMode;
    const assignmentSectionHtml = showAxisAssignment ? this.renderAssignmentRow() : `
      <div class="mapping-card">
        <p style="color: var(--text-dim); font-size: 0.85rem;">
          Im Tastenmodus gibt es keine Gamepad-Achsen-Zuordnung – die Achse sendet stattdessen Tastendrücke.
        </p>
      </div>`;

    this.body.innerHTML = modeSectionHtml + assignmentSectionHtml;
  }

  // Kompakte eigene Zeile fürs Popup -- ruft dieselben Achsen-Zuordnungs-Methoden auf wie die volle
  // Achsen-Zuordnungsseite (window.axisAssignment), damit nur eine Speicherlogik existiert.
  renderAssignmentRow() {
    const aa = window.axisAssignment;
    const key = this.axisKey;
    const idx = window.AXIS_PHYSICAL_INDEX[key];
    const mapping = aa.currentAxes()[idx];
    const currentSlot = (mapping && mapping.type === 'gamepad') ? mapping.axisId : '';
    const invert = mapping?.type === 'gamepad' && !!mapping.invert;
    const options = ['<option value="">Nicht als Achse verwenden</option>'].concat(
      window.AXIS_OUTPUT_SLOTS.map((label, i) => {
        const owners = aa.slotOwners(i, idx);
        const suffix = owners.length ? ` – geteilt mit: ${owners.join(', ')}` : '';
        return `<option value="${i}" ${currentSlot === i ? 'selected' : ''}>${label}${suffix}</option>`;
      })
    );
    const zu = aa.gesperrt();   // schreibgeschützter Gamepad-Modus: Zuordnung nur ansehen
    return `
      <div class="mapping-card">
        <div class="input-group">
          <label>Gamepad-Achse:</label>
          <select ${zu ? 'disabled' : ''} onchange="window.axisConfigModal.assignSlot(this.value)">${options.join('')}</select>
        </div>
        ${zu ? `<p style="margin: 6px 0 0; font-size: 0.8rem; color: var(--text-dim);">Im ${PROFIL_STANDARD_NAME} fest (schreibgeschützt). Für eine eigene Zuordnung das Profil kopieren.</p>` : ''}
        <label style="display: flex; align-items: center; gap: 4px; font-size: 0.85rem; color: var(--text-dim); ${currentSlot === '' ? 'opacity: 0.5;' : ''}">
          <input type="checkbox" ${invert ? 'checked' : ''} ${currentSlot === '' || zu ? 'disabled' : ''}
                 onchange="window.axisConfigModal.toggleInvert(this.checked)">
          Achse spiegeln
        </label>
      </div>`;
  }

  async setMode(value) {
    const modeConfig = window.AXIS_MODE_CONFIG[this.axisKey];
    if (!modeConfig) return;
    const res = await fetch('/api/device-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: modeConfig.modeKey, value })
    });
    const result = await res.json();
    if (!result.success) { uiAlert('Speichern fehlgeschlagen: ' + result.error); return; }
    await this.loadDeviceSettings();
    this.render();
    // Modulübersicht dahinter (Tasten- vs. Achsen-Hotspots) sofort passend zum neuen Modus
    // aktualisieren, ohne dass man das Popup schließen/neu öffnen muss.
    if (window.moduleFlow?.currentModule) {
      await window.moduleFlow.openModule(window.moduleFlow.currentModule.id);
    }
  }

  async setThreshold(value) {
    const modeConfig = window.AXIS_MODE_CONFIG[this.axisKey];
    if (!modeConfig) return;
    const res = await fetch('/api/device-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: modeConfig.threshKey, value })
    });
    const result = await res.json();
    if (!result.success) uiAlert('Speichern fehlgeschlagen: ' + result.error);
  }

  async assignSlot(rawValue) {
    await window.axisAssignment.assignSlot(this.axisKey, rawValue);
    this.render();
  }

  async toggleInvert(checked) {
    await window.axisAssignment.toggleInvert(this.axisKey, checked);
    this.render();
  }
}

window.axisConfigModal = new AxisConfigModal();
