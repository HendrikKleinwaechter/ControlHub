/**
 * "Auch für andere Profile übernehmen"-Popup (Phase C, Hendriks Wunsch 21.08.2026): nach dem Speichern
 * einer physischen Tastenbelegung im aktuellen Profil optional dieselbe Belegung auf ausgewählte
 * andere Profile übertragen, statt sie manuell in jedem Profil einzeln nachzupflegen.
 *
 * Rein client-seitig, keine neue Server-Route: es gibt keine schmalere Speicherroute als das ganze
 * Profil (s. MappingModal.saveButtonMapping() in app.js) -- also derselbe Ablauf je Zielprofil: ganzes
 * Profil holen, `buttons[buttonId]` bzw. `craftSlotLayers[slotId][layer][buttonId]` setzen, ganzes
 * Profil zurückschreiben. Die Checkbox-Auswahl selbst ist die Bestätigung -- kein zusätzlicher
 * Doppel-Dialog, da hier (anders als beim Gruppen-Löschen) kein unwiderruflicher Datenverlust droht.
 */

class CrossProfileApply {
  constructor() {
    this.modal = document.getElementById('cross-profile-apply-modal');
    this.body = document.getElementById('cross-profile-apply-body');
    this.context = null; // { buttonId, slotId, layer, value, label }
    this.otherProfiles = [];
  }

  /**
   * @param {Object} context
   * @param {number} context.buttonId - 0-basierte Tastennummer (wie profile.buttons-Schlüssel)
   * @param {string|null} context.slotId - 'craftslot1'/'craftslot2', nur zusammen mit layer > 1
   * @param {number} context.layer - 1 = profile.buttons, 2-4 = profile.craftSlotLayers[slotId][layer]
   * @param {string|Array|null} context.value - Function-/Makro-ID, rohe Actions-Liste, oder null (entfernen)
   * @param {string} context.label - Anzeigetext für den Dialog (z.B. "Taste 9 → Kamera wechseln")
   */
  async open(context) {
    this.context = context;
    try {
      const res = await fetch('/api/profiles');
      const data = await res.json();
      // der schreibgeschützte Gamepad-Modus bekommt nichts übertragen
      this.otherProfiles = (data.profiles || []).filter(p => p.name !== data.current && !profilGeschuetzt(p.name));
    } catch (error) {
      this.otherProfiles = [];
    }
    this.render();
    this.modal.style.display = 'flex';
  }

  close() {
    this.modal.style.display = 'none';
    this.context = null;
  }

  render() {
    if (this.otherProfiles.length === 0) {
      this.body.innerHTML = `<p style="color: var(--text-dim);">Es gibt keine weiteren Profile.</p>`;
      return;
    }
    const items = this.otherProfiles.map(p => `
      <label style="display: flex; align-items: center; gap: 6px;">
        <input type="checkbox" class="cross-profile-apply-checkbox" value="${escapeHtml(p.name)}">
        ${escapeHtml(profilAnzeige(p.name))}
      </label>`).join('');
    this.body.innerHTML = `
      <p style="color: var(--text-dim); margin-bottom: 10px;">
        "${escapeHtml(this.context.label)}" auch auf diese Profile übertragen?
      </p>
      <div class="button-group" style="flex-direction: column; align-items: flex-start; gap: 10px;">${items}</div>
    `;
  }

  async apply() {
    const checkboxes = document.querySelectorAll('.cross-profile-apply-checkbox');
    const targets = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
    if (targets.length === 0) { this.close(); return; }

    const { buttonId, slotId, layer, value } = this.context;
    let okCount = 0;
    for (const name of targets) {
      const ok = await this.applyToProfile(name, buttonId, slotId, layer, value);
      if (ok) okCount++;
    }
    if (okCount < targets.length) {
      uiAlert(`Nur ${okCount} von ${targets.length} Profil(en) konnten übernommen werden.`);
    } else {
      window.showToast(`Übernommen in ${okCount} Profil(en)`);
    }
    this.close();
  }

  async applyToProfile(name, buttonId, slotId, layer, value) {
    try {
      // nur diese Taste im Zielprofil ändern (B3)
      const pfad = (layer > 1 && slotId)
        ? ['craftSlotLayers', slotId, String(layer), String(buttonId)]
        : ['buttons', String(buttonId)];
      await profilAendern(name, [{ pfad, wert: value }]);
      return true;
    } catch (error) {
      console.error(`Übernahme in Profil "${name}" fehlgeschlagen:`, error);
      return false;
    }
  }
}

window.crossProfileApply = new CrossProfileApply();
