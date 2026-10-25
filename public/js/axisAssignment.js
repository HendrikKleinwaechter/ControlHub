/**
 * Achsen-Zuordnung: welche physische Achse (Thumbstick/Hebel/Fingertip/Poti) auf welchen der 8
 * Gamepad-Ausgabe-Plätze geht (kontinuierliche Durchreichung, s. mappingEngine.js processAllAxes()).
 * Getrennt von der Hardware-Kalibrierung (Einstellungen → Ersteinrichtung → Achsen-Kalibrierung,
 * axisCalibration.js) -- das hier ist Belegung/Fahrzeug-Logik, gehört deshalb zur Funktionsbelegung.
 *
 * Geltungsbereich (pro Profil oder global) wird unter Einstellungen → Ersteinrichtung →
 * Achsen-Kalibrierung umgeschaltet (axisCalibration.js renderModeToggle()) -- diese Seite hier zeigt
 * NUR im Profil-Modus überhaupt Zuordnungs-UI. Im globalen Modus gehört diese Seite (die "pro Profil"
 * bedeutet) inhaltlich nicht mehr hierher -- stattdessen nur ein Hinweis + Link zu den Einstellungen.
 */

const PHYSICAL_AXIS_INDEX = {
  thumbX: 0, thumbY: 1, leverA: 2, leverB: 3,
  thumb2X: 4, thumb2Y: 5, leverA2: 6, leverB2: 7,
  poti: 8, finger1: 9, finger2: 10, finger3: 11, finger4: 12
};

const KEY_LABELS = {
  thumbX: 'CraftSlot 1 – Thumbstick links/rechts', thumbY: 'CraftSlot 1 – Thumbstick hoch/runter',
  leverA: 'CraftSlot 1 – Hebel vor/zurück', leverB: 'CraftSlot 1 – Hebel links/rechts',
  thumb2X: 'CraftSlot 2 – Thumbstick links/rechts', thumb2Y: 'CraftSlot 2 – Thumbstick hoch/runter',
  leverA2: 'CraftSlot 2 – Hebel vor/zurück', leverB2: 'CraftSlot 2 – Hebel links/rechts',
  finger1: 'Fingertip 1', finger2: 'Fingertip 2', finger3: 'Fingertip 3', finger4: 'Fingertip 4',
  poti: 'Poti-Rad'
};

// Nur die 8 Plätze des einzigen aktiven Gamepads (zweites Gamepad-Gerät bleibt deaktiviert, s.
// USB-Race-Condition-Fix) -- Reihenfolge entspricht MainReport in der Firmware (x,y,z,rx,ry,rz,slider,dial).
// Namen aus AXIS_SLOT_NAMES (app.js), damit Achsen-Zuordnung, Funktions-Editor und ActionPicker gleich heißen.
const OUTPUT_SLOTS = AXIS_SLOT_NAMES.map((name, i) => `Achse ${i + 1} (${name})`);

class AxisAssignment {
  constructor() {
    this.body = document.getElementById('axis-assignment-body');
    this.mode = 'profile';
    this.profile = null;
    this.profileName = null;
    this.globalAxes = {};
    this.socket = window.hubSocket;   // gemeinsame Verbindung der Seite (hubSocket.js, B4)
    this.socket.on('profileChanged', () => this.loadData());
    this.socket.on('profile-updated', () => this.loadData());   // B3: geändert, auch von einem anderen Gerät
    // Geltungsbereich (pro Profil/global) kann sich auf einer anderen Seite oder an einem anderen Gerät
    // geändert haben -- beim Öffnen der Seite frisch laden
    document.addEventListener('tabchanged', e => { if (e.detail?.tabName === 'axis-assignment') this.loadData(); });
    // Geräteprofile (23.10.2026): nur die Achsen des aktiven Controllers zeigen
    document.addEventListener('controllerinfo', () => { if (this.body) this.render(); });
    this.loadData();
  }

  async loadData() {
    try {
      const [modeRes, profilesRes] = await Promise.all([
        fetch('/api/axis-assignment-mode').then(r => r.json()),
        fetch('/api/profiles').then(r => r.json())
      ]);
      this.mode = modeRes.mode || 'profile';
      this.globalAxes = modeRes.globalAxes || {};
      const found = profilesRes.success && profilesRes.current
        ? profilesRes.profiles?.find(p => p.name === profilesRes.current)
        : null;
      if (found) {
        this.profileName = profilesRes.current;
        this.profile = found;
      }
    } catch (error) {
      console.error('Achsen-Zuordnung konnte nicht geladen werden:', error);
    }
    this.render();
  }

  // Liefert die aktuell WIRKSAME Achsen-Map (profile.axes oder globalAxes, je nach Modus) --
  // einziger Lese-Zugriffspunkt, damit render()/assignSlot()/etc. nicht selbst unterscheiden müssen.
  currentAxes() {
    return this.mode === 'global' ? this.globalAxes : (this.profile?.axes || {});
  }

  // Im globalen Modus gehört diese (pro-Profil-)Seite inhaltlich nicht mehr hierher -- statt der
  // Zuordnungs-UI nur ein Hinweis + Link zu den Einstellungen, wo der Modus zurückgestellt werden kann.
  renderGlobalRedirect() {
    return `
      <div class="mapping-card" style="text-align: center; padding: 48px 24px;">
        <p style="margin: 0 0 10px;">
          Die Achsen-Zuordnung ist aktuell <strong>global</strong> festgelegt (eine Zuordnung für alle Profile gleich).
        </p>
        <p style="color: var(--text-dim); font-size: 0.85rem; margin: 0 0 20px;">
          Um Achsen hier – pro Profil – zuzuordnen, den Geltungsbereich unter Einstellungen auf
          "Pro Profil" umstellen.
        </p>
        <button class="btn-secondary" onclick="window.app.navigateToTab('axis-calibration')">Zu Einstellungen → Achsen-Kalibrierung</button>
      </div>`;
  }

  renderBudget() {
    const mappings = Object.values(this.currentAxes()).filter(m => m?.type === 'gamepad');
    const usedSlots = new Set(mappings.map(m => m.axisId)).size;
    const sharedHint = mappings.length > usedSlots
      ? ` (${mappings.length} Achsen zugeordnet, ${mappings.length - usedSlots} teilen sich einen Platz mit einer anderen)`
      : '';
    return `
      <div class="mapping-card" style="margin-bottom: 12px;">
        <strong>${usedSlots} von ${OUTPUT_SLOTS.length} Achsen-Plätzen belegt${sharedHint}</strong>
        <p style="color: var(--text-dim); font-size: 0.85rem; margin-top: 4px;">
          Nur eine zugewiesene Achse bewegt sich im Spiel proportional.${window.controllerInfo?.profile?.kann?.achsModus === false ? '' : ` Hebel und Fingertips müssen dafür
          in der Tastenbelegung auf „Achse“ stehen (orange Taste ⇄ am Modul), sonst sind sie zwei Tasten.`} Mehrere
          physische Achsen können sich bewusst denselben Platz teilen (z. B. zwei Thumbsticks für dieselbe
          Funktion) – es zählt dann automatisch die gerade ausgelenkte.
          Gilt nur für das Profil "${escapeHtml(profilAnzeige(this.profileName) || '...')}".
        </p>
      </div>`;
  }

  // Welche ANDEREN physischen Kanäle sind aktuell auch auf diesen Ausgabe-Slot gelegt?
  slotOwners(slotIndex, excludePhysicalIndex) {
    const owners = [];
    for (const [idxStr, mapping] of Object.entries(this.currentAxes())) {
      const idx = Number(idxStr);
      if (idx === excludePhysicalIndex) continue;
      if (mapping?.type === 'gamepad' && mapping.axisId === slotIndex) {
        const ownerKey = Object.keys(PHYSICAL_AXIS_INDEX).find(k => PHYSICAL_AXIS_INDEX[k] === idx);
        owners.push(KEY_LABELS[ownerKey] || ownerKey);
      }
    }
    return owners;
  }

  renderRow(key) {
    const physicalIndex = PHYSICAL_AXIS_INDEX[key];
    const mapping = this.currentAxes()[physicalIndex];
    const currentSlot = (mapping && mapping.type === 'gamepad') ? mapping.axisId : '';
    const invert = mapping?.type === 'gamepad' && !!mapping.invert;
    const options = ['<option value="">Nicht als Achse verwenden</option>'].concat(
      OUTPUT_SLOTS.map((label, i) => {
        const owners = this.slotOwners(i, physicalIndex);
        const suffix = owners.length ? ` – geteilt mit: ${owners.join(', ')}` : '';
        return `<option value="${i}" ${currentSlot === i ? 'selected' : ''}>${label}${suffix}</option>`;
      })
    );
    return `
      <div class="mapping-card" style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
        <label style="color: var(--text-dim); font-size: 0.85rem;">${KEY_LABELS[key] || key}</label>
        <div style="display: flex; align-items: center; gap: 10px;">
          <label style="display: flex; align-items: center; gap: 4px; font-size: 0.85rem; color: var(--text-dim); ${currentSlot === '' ? 'opacity: 0.5;' : ''}">
            <input type="checkbox" ${invert ? 'checked' : ''} ${currentSlot === '' || this.gesperrt() ? 'disabled' : ''}
                   onchange="window.axisAssignment.toggleInvert('${key}', this.checked)">
            Achse spiegeln
          </label>
          <select class="form-control" style="max-width: 260px;" ${this.gesperrt() ? 'disabled' : ''} onchange="window.axisAssignment.assignSlot('${key}', this.value)">
            ${options.join('')}
          </select>
        </div>
      </div>`;
  }

  // Achsen des schreibgeschützten Gamepad-Modus (pro Profil) nur ansehen
  gesperrt() { return this.mode !== 'global' && profilGeschuetzt(this.profileName); }
  renderGesperrt() {
    return this.gesperrt() ? `<div class="mapping-card" style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
        <span style="color: var(--text-dim); font-size: 0.85rem;">Der ${PROFIL_STANDARD_NAME} ist schreibgeschützt: Achsen 1–8 gehen unverändert als Gamepad-Achsen ans Spiel.</span>
        <button type="button" class="btn-secondary" onclick="window.app.duplicateProfile(PROFIL_STANDARD, { aktivieren: true })">Als eigenes Profil kopieren</button></div>` : '';
  }

  render() {
    if (this.mode === 'global') {
      this.body.innerHTML = this.renderGlobalRedirect();
      return;
    }
    // Achsen des aktiven Controllers (controller.js/ server deviceProfiles.js); bis die Angaben da sind, alle bekannten
    const keys = window.controllerInfo?.axes ? window.controllerInfo.axes.map(a => a.key).filter(k => k in PHYSICAL_AXIS_INDEX)
      : Object.keys(PHYSICAL_AXIS_INDEX);
    this.body.innerHTML = this.renderGesperrt() + this.renderBudget() + (keys.length ? keys.map(key => this.renderRow(key)).join('')
      : '<div class="mapping-card" style="color: var(--text-dim);">Dieser Controller hat keine Achsen.</div>');
  }

  async assignSlot(key, rawValue) {
    const physicalIndex = PHYSICAL_AXIS_INDEX[key];
    if (physicalIndex === undefined) return;
    if (this.gesperrt()) return gamepadModusHinweis();

    const slot = rawValue === '' ? null : parseInt(rawValue, 10);
    const existing = this.currentAxes()[physicalIndex];

    const apply = async () => {
      if (slot !== null) {
        const owners = this.slotOwners(slot, physicalIndex);
        if (owners.length) {
          window.showToast(`${OUTPUT_SLOTS[slot]} wird jetzt geteilt mit: ${owners.join(', ')}`);
        }
      }
      const mapping = slot === null ? null : { type: 'gamepad', axisId: slot, invert: !!existing?.invert, deadzone: 500 };
      await this.saveMapping(physicalIndex, mapping);
    };

    // Ersetzt eine bestehende Schwellwert-Funktions-Zuordnung auf dieser Achse nur nach Bestätigung
    // (die enthält ggf. eine benannte, bewusst eingerichtete Konfiguration wie "Fahrhebel").
    if (existing && existing.type === 'function' && slot !== null) {
      window.confirmDialog.show(
        `"${KEY_LABELS[key] || key}" ist aktuell als Schwellwert-Funktion${existing.name ? ` ("${existing.name}")` : ''} eingerichtet. ` +
        `Stattdessen als durchgehende Gamepad-Achse verwenden? Die bisherige Funktions-Zuordnung geht dabei verloren.`,
        apply,
        { danger: true } // bisherige Zuordnung wird überschrieben
      );
    } else {
      await apply();
    }
  }

  async toggleInvert(key, checked) {
    const physicalIndex = PHYSICAL_AXIS_INDEX[key];
    const existing = this.currentAxes()[physicalIndex];
    if (!existing || existing.type !== 'gamepad') return;
    await this.saveMapping(physicalIndex, { ...existing, invert: checked });
  }

  async saveMapping(physicalIndex, mapping) {
    try {
      if (this.mode === 'global') {
        const res = await fetch(`/api/axis-assignment/global/${physicalIndex}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mapping })
        });
        const result = await res.json();
        if (!result.success) {
          uiAlert('Speichern fehlgeschlagen: ' + result.error);
          return;
        }
      } else {
        if (!this.profileName) await this.loadData();
        if (!this.profileName) return;
        // nur diese Achse ändern (B3), nicht das ganze Profil aus der eigenen Kopie
        await profilAendern(this.profileName, [{ pfad: ['axes', String(physicalIndex)], wert: mapping }]);
      }
      window.showToast('Achsen-Zuordnung gespeichert');
      await this.loadData();
    } catch (error) {
      uiAlert('Speichern fehlgeschlagen: ' + error.message);
    }
  }
}

window.axisAssignment = new AxisAssignment();
// Für axisConfigModal.js (kompaktes Achsen-Popup aus der Modulübersicht) -- wiederverwendet dieselben
// Konstanten statt einer zweiten Kopie, einzige Quelle der Wahrheit bleibt diese Datei.
window.AXIS_PHYSICAL_INDEX = PHYSICAL_AXIS_INDEX;
window.AXIS_OUTPUT_SLOTS = OUTPUT_SLOTS;
