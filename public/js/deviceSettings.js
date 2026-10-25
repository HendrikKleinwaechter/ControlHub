/**
 * Einstellungen-Tab: spricht dasselbe GETALL/SET-Protokoll wie die eigenständige
 * Controller-Konfig.html (über /api/device-config, s. server/deviceConfigClient.js).
 * UX bewusst identisch zur bestehenden Seite: jede Änderung wird sofort ans Gerät gesendet und dort
 * im Flash gespeichert, kein Sammel-Speichern-Knopf.
 * Armlehnen-Version + Unterbau/Griff je CraftSlot sitzen bewusst NICHT hier, sondern im eigenen Tab
 * "Armlehnen-Setup" (s. armlehnenSetup.js). Der Bedienteil-rechts-Schaltermodus (Ebenenschalter/
 * Normale Taste/Zündschloss) sitzt dagegen bewusst HIER und NICHT in Armlehnen-Setup (Hendriks
 * Einschätzung 25.08.2026: passt hier besser rein) -- war zwischenzeitlich in Armlehnen-Setup, wieder
 * hierher verschoben statt dupliziert.
 * Achse/Taste PRO EINZELNER Achse wird nicht mehr hier eingestellt, sondern direkt dynamisch in der
 * Modulansicht umgeschaltet (⇄-Hotspot, s. moduleFlow.js toggleAxisModeQuick()) -- hier bleiben nur
 * noch Totbereich/Empfindlichkeit (Achsen-Modus) und Auslöseschwelle (Tastenmodus), jeweils pro
 * einzelner Achse eigenständig einstellbar.
 * Gruppen sind ausklappbare <details> (Hendriks Wunsch 25.08.2026: "übersichtlicher") -- Auf/Zu-Status
 * bleibt über this.openGroups auch nach einem Re-Render (z.B. nach jeder Änderung) erhalten.
 */

const isZuendschloss = s => s.bedienmode === 'zuendschloss';
const isZuendschloss3 = s => s.bedienmode === 'zuendschloss' && s.ignitionpositions === '3';
const BEDIEN_BTN_OPTIONS = [['70', 'Taste 70'], ['71', 'Taste 71'], ['72', 'Taste 72']];
const BEDIEN_HOLD_OPTIONS = [['on', 'gehalten'], ['off', 'kurzer Druck (0,7s)']];

const DEVICE_SETTINGS_GROUPS = [
  {
    label: 'CraftSlot 1 – Thumbstick',
    fields: [
      { key: 'thumbdzx', label: 'Totbereich links/rechts (Achsen-Modus)', type: 'range', min: 0, max: 25, unit: ' %' },
      { key: 'thumbdzy', label: 'Totbereich hoch/runter (Achsen-Modus)', type: 'range', min: 0, max: 25, unit: ' %' },
      { key: 'thumbsensx', label: 'Empfindlichkeit links/rechts (Achsen-Modus)', type: 'range', min: 50, max: 150, unit: ' %' },
      { key: 'thumbsensy', label: 'Empfindlichkeit hoch/runter (Achsen-Modus)', type: 'range', min: 50, max: 150, unit: ' %' },
      { key: 'thumbbtnthreshx', label: 'Auslöseschwelle links/rechts (Tastenmodus)', type: 'range', min: 10, max: 95, unit: ' %' },
      { key: 'thumbbtnthreshy', label: 'Auslöseschwelle hoch/runter (Tastenmodus)', type: 'range', min: 10, max: 95, unit: ' %' }
    ]
  },
  {
    label: 'CraftSlot 1 – Fahrhebel',
    fields: [
      { key: 'leverdza', label: 'Totbereich vor/zurück (Achsen-Modus)', type: 'range', min: 0, max: 25, unit: ' %' },
      { key: 'leverdzb', label: 'Totbereich links/rechts (Achsen-Modus)', type: 'range', min: 0, max: 25, unit: ' %' },
      { key: 'leversensa', label: 'Empfindlichkeit vor/zurück (Achsen-Modus)', type: 'range', min: 50, max: 150, unit: ' %' },
      { key: 'leversensb', label: 'Empfindlichkeit links/rechts (Achsen-Modus)', type: 'range', min: 50, max: 150, unit: ' %' },
      { key: 'leverthresha', label: 'Auslöseschwelle vor/zurück (Tastenmodus)', type: 'range', min: 10, max: 95, unit: ' %' },
      { key: 'leverthreshb', label: 'Auslöseschwelle links/rechts (Tastenmodus)', type: 'range', min: 10, max: 95, unit: ' %' }
    ]
  },
  {
    label: 'CraftSlot 2 – Thumbstick',
    fields: [
      { key: 'thumbdzx2', label: 'Totbereich links/rechts (Achsen-Modus)', type: 'range', min: 0, max: 25, unit: ' %' },
      { key: 'thumbdzy2', label: 'Totbereich hoch/runter (Achsen-Modus)', type: 'range', min: 0, max: 25, unit: ' %' },
      { key: 'thumbsensx2', label: 'Empfindlichkeit links/rechts (Achsen-Modus)', type: 'range', min: 50, max: 150, unit: ' %' },
      { key: 'thumbsensy2', label: 'Empfindlichkeit hoch/runter (Achsen-Modus)', type: 'range', min: 50, max: 150, unit: ' %' },
      { key: 'thumbbtnthreshx2', label: 'Auslöseschwelle links/rechts (Tastenmodus)', type: 'range', min: 10, max: 95, unit: ' %' },
      { key: 'thumbbtnthreshy2', label: 'Auslöseschwelle hoch/runter (Tastenmodus)', type: 'range', min: 10, max: 95, unit: ' %' }
    ]
  },
  {
    label: 'CraftSlot 2 – Fahrhebel',
    fields: [
      { key: 'leverdza2', label: 'Totbereich vor/zurück (Achsen-Modus)', type: 'range', min: 0, max: 25, unit: ' %' },
      { key: 'leverdzb2', label: 'Totbereich links/rechts (Achsen-Modus)', type: 'range', min: 0, max: 25, unit: ' %' },
      { key: 'leversensa2', label: 'Empfindlichkeit vor/zurück (Achsen-Modus)', type: 'range', min: 50, max: 150, unit: ' %' },
      { key: 'leversensb2', label: 'Empfindlichkeit links/rechts (Achsen-Modus)', type: 'range', min: 50, max: 150, unit: ' %' },
      { key: 'leverthresha2', label: 'Auslöseschwelle vor/zurück (Tastenmodus)', type: 'range', min: 10, max: 95, unit: ' %' },
      { key: 'leverthreshb2', label: 'Auslöseschwelle links/rechts (Tastenmodus)', type: 'range', min: 10, max: 95, unit: ' %' }
    ]
  },
  {
    label: 'Fingertip-Modul',
    fields: [
      { key: 'fingerdz1', label: 'Fingertip 1 – Totbereich (Achsen-Modus)', type: 'range', min: 0, max: 25, unit: ' %' },
      { key: 'fingersens1', label: 'Fingertip 1 – Empfindlichkeit (Achsen-Modus)', type: 'range', min: 50, max: 150, unit: ' %' },
      { key: 'fingerthresh1', label: 'Fingertip 1 – Auslöseschwelle (Tastenmodus)', type: 'range', min: 10, max: 95, unit: ' %' },
      { key: 'fingerdz2', label: 'Fingertip 2 – Totbereich (Achsen-Modus)', type: 'range', min: 0, max: 25, unit: ' %' },
      { key: 'fingersens2', label: 'Fingertip 2 – Empfindlichkeit (Achsen-Modus)', type: 'range', min: 50, max: 150, unit: ' %' },
      { key: 'fingerthresh2', label: 'Fingertip 2 – Auslöseschwelle (Tastenmodus)', type: 'range', min: 10, max: 95, unit: ' %' },
      { key: 'fingerdz3', label: 'Fingertip 3 – Totbereich (Achsen-Modus)', type: 'range', min: 0, max: 25, unit: ' %' },
      { key: 'fingersens3', label: 'Fingertip 3 – Empfindlichkeit (Achsen-Modus)', type: 'range', min: 50, max: 150, unit: ' %' },
      { key: 'fingerthresh3', label: 'Fingertip 3 – Auslöseschwelle (Tastenmodus)', type: 'range', min: 10, max: 95, unit: ' %' },
      { key: 'fingerdz4', label: 'Fingertip 4 – Totbereich (Achsen-Modus)', type: 'range', min: 0, max: 25, unit: ' %' },
      { key: 'fingersens4', label: 'Fingertip 4 – Empfindlichkeit (Achsen-Modus)', type: 'range', min: 50, max: 150, unit: ' %' },
      { key: 'fingerthresh4', label: 'Fingertip 4 – Auslöseschwelle (Tastenmodus)', type: 'range', min: 10, max: 95, unit: ' %' }
    ]
  },
  {
    label: 'Poti-Rad',
    fields: [
      { key: 'potiinv', label: 'Richtung', type: 'select', options: [['off', 'Normal'], ['on', 'Gespiegelt (links ↔ rechts)']] }
    ]
  },
  {
    label: 'CraftDeck – Schalter (D1/D2)',
    fields: [
      { key: 'bedienmode', label: 'Schalter ist', type: 'select', options: [['ebene', 'Ebenenschalter'], ['taste', 'Normale Taste'], ['zuendschloss', 'Zündschloss']] },
      { key: 'ignitionpositions', label: 'Stellungen', type: 'select', options: [['2', '2 (Nullstellung / Eingang 1)'], ['3', '3 (Nullstellung / Eingang 1 / Eingang 2)']], visibleIf: isZuendschloss },
      { key: 'ignitionpos0btn', label: 'Nullstellung → Taste', type: 'select', options: BEDIEN_BTN_OPTIONS, visibleIf: isZuendschloss },
      { key: 'ignitionpos0hold', label: 'Nullstellung → Verhalten', type: 'select', options: BEDIEN_HOLD_OPTIONS, visibleIf: isZuendschloss },
      { key: 'ignitionpos1btn', label: 'Eingang 1 (D1) → Taste', type: 'select', options: BEDIEN_BTN_OPTIONS, visibleIf: isZuendschloss },
      { key: 'ignitionpos1hold', label: 'Eingang 1 (D1) → Verhalten', type: 'select', options: BEDIEN_HOLD_OPTIONS, visibleIf: isZuendschloss },
      { key: 'ignitionpos2btn', label: 'Eingang 2 (D2) → Taste', type: 'select', options: BEDIEN_BTN_OPTIONS, visibleIf: isZuendschloss3 },
      { key: 'ignitionpos2hold', label: 'Eingang 2 (D2) → Verhalten', type: 'select', options: BEDIEN_HOLD_OPTIONS, visibleIf: isZuendschloss3 },
      // 25.10.2026: ControlHub hält die Tasten einer Funktion, solange die Taste gedrückt ist -- bei „gehalten“ und einer
      // Tastenkombination blieben Strg/Shift/Alt fest, solange der Schlüssel in der Stellung steht, und verfälschten alle
      // anderen Tasten.
      { type: 'hinweis', text: 'Liegt auf einer Stellung eine Tastenkombination mit Strg, Shift oder Alt, „kurzer Druck“ wählen. Bei „gehalten“ bleiben diese Tasten gedrückt, solange der Schlüssel dort steht.', visibleIf: isZuendschloss }
    ]
  }
];

class DeviceSettings {
  constructor() {
    this.body = document.getElementById('device-settings-body');
    this.settings = {};
    this.openGroups = new Set(); // welche <details>-Gruppen (Index) gerade aufgeklappt sind
    this.loaded = false;  // true, sobald die Werte einmal erfolgreich vom Gerät kamen
    this.loading = null;  // laufender Ladevorgang (der Server beantwortet immer nur EINE Konfig-Anfrage gleichzeitig)
    this.reloadAfter = false;
    this.load();
    // Wird die Armlehne erst nach dem Seitenstart eingesteckt, blieb sonst „konnten nicht geladen werden“
    // stehen -- daher beim Öffnen des Reiters und beim Verbinden (solange der Reiter offen ist) neu laden.
    document.addEventListener('tabchanged', e => { if (e.detail?.tabName === 'settings') this.load(); });
    // window.app (und dessen Socket) gibt es erst nach app.js' DOMContentLoaded-Handler, der vor diesem läuft
    document.addEventListener('DOMContentLoaded', () => {
      window.app?.socket?.on('serialStatus', status => { if (status?.connected && this.isVisible()) this.load(); });
    });
  }

  isVisible() {
    return !!document.getElementById('tab-settings')?.classList.contains('active');
  }

  // Läuft schon ein Ladevorgang, wird danach genau einmal frisch nachgeladen (statt parallel anzufragen)
  load() {
    if (this.loading) { this.reloadAfter = true; return this.loading; }
    this.loading = this.fetchSettings().finally(() => {
      this.loading = null;
      if (this.reloadAfter) { this.reloadAfter = false; this.load(); }
    });
    return this.loading;
  }

  async fetchSettings() {
    if (!this.loaded) this.body.innerHTML = '<p style="color: var(--text-dim);">Lade Einstellungen...</p>';
    try {
      const res = await fetch('/api/device-config');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Unbekannter Fehler');
      this.settings = data.settings;
      this.loaded = true;
      this.render();
    } catch (error) {
      this.loaded = false;
      this.body.innerHTML = `<p style="color: var(--danger);">Einstellungen konnten nicht geladen werden: ${error.message}<br>Ist das Gerät verbunden (Tab "Verbindung")?</p>`;
    }
  }

  // Anzeigename für die Speichermeldung statt des Firmware-Schlüssels (z. B. „thumbdzx“)
  fieldLabel(key) {
    for (const group of DEVICE_SETTINGS_GROUPS) {
      const field = group.fields.find(f => f.key === key);
      if (field) return `${group.label}: ${field.label}`;
    }
    return key;
  }

  render() {
    this.body.innerHTML = DEVICE_SETTINGS_GROUPS.map((group, i) => this.renderGroup(group, i)).join('');
  }

  renderGroup(group, i) {
    const fieldsHtml = group.fields.map(field => this.renderField(field)).join('');
    const isOpen = this.openGroups.has(i);
    return `
      <details class="settings-group" ${isOpen ? 'open' : ''} ontoggle="window.deviceSettings.onGroupToggle(${i}, this.open)">
        <summary>${group.label}</summary>
        <div class="settings-group-body">${fieldsHtml}</div>
      </details>`;
  }

  onGroupToggle(i, open) {
    if (open) this.openGroups.add(i);
    else this.openGroups.delete(i);
  }

  renderField(field) {
    if (field.visibleIf && !field.visibleIf(this.settings)) return '';
    if (field.type === 'hinweis') return `<p class="hint">${field.text}</p>`;
    const value = this.settings[field.key] ?? '';
    const id = `device-setting-${field.key}`;
    const unit = field.unit || '';

    if (field.type === 'select') {
      const optionsHtml = field.options.map(([val, label]) =>
        `<option value="${val}" ${val === value ? 'selected' : ''}>${label}</option>`
      ).join('');
      return `
        <div class="settings-field">
          <label for="${id}">${field.label}</label>
          <select id="${id}" onchange="window.deviceSettings.setValue('${field.key}', this.value)">${optionsHtml}</select>
        </div>`;
    }

    // range
    return `
      <div class="settings-field">
        <div class="settings-field-label">
          <label for="${id}">${field.label}</label>
          <span class="settings-field-value" id="${id}-readout">${value}${unit}</span>
        </div>
        <input type="range" id="${id}" min="${field.min}" max="${field.max}" step="1" value="${value}"
          oninput="document.getElementById('${id}-readout').textContent = this.value + '${unit}'"
          onchange="window.deviceSettings.setValue('${field.key}', this.value)">
      </div>`;
  }

  async setValue(key, value) {
    try {
      const res = await fetch('/api/device-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value })
      });
      const result = await res.json();
      if (result.success) {
        this.settings[key] = value;
        window.showToast(`${this.fieldLabel(key)} gespeichert`);
        this.render();   // Sichtbarkeit der Zuendschloss-Unterfelder haengt von bedienmode/ignitionpositions ab -- neu aufbauen
      } else {
        uiAlert(`Speichern fehlgeschlagen: ${result.error || 'unbekannter Fehler'}`);
      }
    } catch (error) {
      uiAlert(`Speichern fehlgeschlagen: ${error.message}`);
    }
  }
}

window.deviceSettings = new DeviceSettings();
