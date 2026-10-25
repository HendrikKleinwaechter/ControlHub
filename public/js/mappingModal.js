/**
 * MappingModal: Zuordnung einer Taste zu Funktion/Aktionen (über den ActionPicker).
 * Ausgelagert aus app.js am 21.10.2026. Der frühere Achsen-Teil mit eigenem Fenster (#mapping-modal) war nicht mehr
 * erreichbar und liegt seit dem Aufräumen am 24.10.2026 (Durchsicht B9) im Archiv. Klassisches <script> -- teilt sich den
 * globalen Namensraum mit den anderen Skripten; instanziiert wird im DOMContentLoaded-Block in app.js.
 */

// Mapping Modal Manager
class MappingModal {
  constructor() {
    this.currentType = null; // 'button'
    this.currentId = null;
    this.currentFunction = null; // Function-/Makro-ID (string) ODER rohe Actions-Liste (Array, s. ActionPicker Achse/Taste) ODER null
    this.humanButtonNumber = null;   // 1-basierte Anzeige-Nummer für Dialoge/Toasts
    this.onSavedCallback = null;     // wird vom Bearbeiten-Flow gesetzt, um nach dem Speichern zur Übersicht zurückzukehren
    this.currentSlotId = null;       // 'craftslot1'/'craftslot2', nur gesetzt wenn über die Ebenenbelegung geöffnet
    this.currentLayer = 1;           // 1 = profile.buttons (Standard), 2-4 = profile.craftSlotLayers[slotId][layer]
  }

  /**
   * Einstiegspunkt für den neuen Bearbeiten-Flow (Übersicht -> Modul -> Taste -> Funktion).
   * @param {number} buttonId - 0-basierte Button-ID (wie überall sonst im Code)
   * @param {Function} onSaved - Callback, der nach erfolgreichem Speichern aufgerufen wird
   * @param {string|null} slotId - 'craftslot1'/'craftslot2', falls über die Ebenenbelegung geöffnet
   * @param {number} layer - angezeigte Ebene (1-4) aus CraftSlotLayerToolbar, sonst 1
   */
  openButtonMappingForModuleFlow(buttonId, onSaved, slotId = null, layer = 1) {
    this.onSavedCallback = onSaved;
    this.currentSlotId = slotId;
    this.currentLayer = layer;
    return this.openButtonMapping(buttonId);
  }

  /**
   * Öffnet den ActionPicker (s. public/js/actionPicker.js) für eine physische Taste -- genau wie bei
   * Bedienpanel-Tasten/Makro-Schritten, nur mit axisNeedsDuration:false (eine physische Taste kann
   * echt gehalten werden, braucht also keinen künstlichen Achsen-Impuls mit fester Dauer, s. Hendriks
   * Feedback) und allowClear:true (eine physische Taste kann anders als eine Bedienpanel-Taste auf
   * "keine Funktion" zurückgesetzt werden, ohne sie zu löschen -- 100 feste Hardware-Tasten existieren
   * immer). Ersetzt die frühere, eigene Kategorie-Kacheln+Suche-Funktionsauswahl.
   */
  async openButtonMapping(buttonId) {
    this.currentType = 'button';
    this.currentId = buttonId;

    const response = await fetch('/api/profiles');
    const data = await response.json();
    if (profilGeschuetzt(data.current)) return gamepadModusHinweis();   // schreibgeschützt (basis.js)
    const profile = data.profiles.find(p => p.name === data.current);

    // Button hat maximal EINE Zuordnung: Function-/Makro-ID (string) oder eine rohe Actions-Liste
    // (Array, s. ActionPicker Achse/Taste) -- bei Ebene > 1 aus profile.craftSlotLayers lesen statt
    // aus profile.buttons (s. openButtonMappingForModuleFlow()).
    this.currentFunction = (this.currentLayer > 1 && this.currentSlotId)
      ? (profile?.craftSlotLayers?.[this.currentSlotId]?.[this.currentLayer]?.[buttonId] ?? null)
      : (profile?.buttons?.[buttonId] || null);
    this.humanButtonNumber = buttonId + 1;

    const label = `Taste ${this.humanButtonNumber}`
      + (this.currentLayer > 1 ? ` (Ebene ${['', 'I', 'II', 'III', 'IV'][this.currentLayer]})` : '');
    const current = typeof this.currentFunction === 'string'
      ? { functionId: this.currentFunction }
      : { quickActions: Array.isArray(this.currentFunction) ? this.currentFunction : null };

    window.actionPicker.open(
      current,
      { includeMacros: true, axisNeedsDuration: false, allowClear: true, contextLabel: label },
      (result) => this.handleActionPickerResult(result, label)
    );
  }

  /**
   * Verarbeitet das ActionPicker-Ergebnis für eine physische Taste -- fragt wie bisher vor dem
   * tatsächlichen Speichern nochmal per confirmDialog nach (Hendriks bestehender Bearbeiten-Flow:
   * Auswahl -> Bestätigung -> Speichern -> Toast -> automatische Rückkehr zur Übersicht).
   */
  handleActionPickerResult(result, label) {
    if (result.mode === 'clear') {
      window.confirmDialog.show(`Zuordnung für ${label} wirklich entfernen?`, () => this.applyButtonAction(null, null, label));
      return;
    }
    const value = result.mode === 'function' ? result.functionId : result.quickActions;
    window.confirmDialog.show(
      `Bist du sicher, dass du "${result.label}" auf ${label} legen willst?`,
      () => this.applyButtonAction(value, result.label, label)
    );
  }

  /**
   * Übernimmt eine Auswahl (oder Entfernung), speichert sofort und zeigt eine Erfolgsmeldung.
   * @param {string|Array|null} value - Function-/Makro-ID, rohe Actions-Liste, oder null (entfernen)
   * @param {string|null} describedLabel - Anzeigename für die Toast-Meldung, null = "entfernt"-Meldung
   * @param {string} label - Anzeigename der Taste für die Meldung
   */
  async applyButtonAction(value, describedLabel, label) {
    this.currentFunction = value;
    const success = await this.saveButtonMapping();
    if (!success) {
      uiAlert('Speichern fehlgeschlagen.');
      return;
    }
    const cb = this.onSavedCallback;
    this.onSavedCallback = null;
    window.showToast(describedLabel ? `${label} → ${describedLabel} zugewiesen` : `Zuordnung für ${label} entfernt`);
    // Optional: dieselbe Belegung auch für andere Profile übernehmen (Hendriks Wunsch 21.08.2026,
    // Phase C) -- nur für physische Tasten (dieser Pfad), nicht für Achsen-Mappings.
    if (window.crossProfileApply) {
      window.crossProfileApply.open({
        buttonId: this.currentId,
        slotId: this.currentSlotId,
        layer: this.currentLayer,
        value,
        label: describedLabel ? `${label} → ${describedLabel}` : `${label} (entfernt)`
      });
    }
    if (cb) cb();
  }

  /**
   * Speichert nur die Button-Zuordnung (this.currentFunction) im aktuellen Profil.
   * @returns {Promise<boolean>}
   */
  async saveButtonMapping() {
    try {
      // Nur diese Taste ändern (B3) -- Ebene 2-4 als additive Zusatzstruktur, Ebene I bleibt unangetastet
      const pfad = (this.currentLayer > 1 && this.currentSlotId)
        ? ['craftSlotLayers', this.currentSlotId, String(this.currentLayer), String(this.currentId)]
        : ['buttons', String(this.currentId)];
      const result = await profilAendern(null, [{ pfad, wert: this.currentFunction }]);
      window.app.socket.emit('switch-profile', { name: result.name });
      if (window.app) window.app.loadFunctions();
      return true;
    } catch (error) {
      console.error('Speichern fehlgeschlagen:', error);
      return false;
    }
  }
}
