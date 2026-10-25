/**
 * Modul-/Bauteil-Erkennung (Einstellungen -> Modul-Erkennung)
 * Fragt STATUS über /api/device-status ab (server/deviceConfigClient.js -> Firmware DET-Zeilen,
 * s. detectAll()/emitStatus() in CraftConsolePro_Pico.ino) und zeigt an, was gerade erkannt wird --
 * keine neue Firmware nötig, die Firmware liefert diese Daten bereits.
 */

const MODULE_STATUS_ITEMS = [
  { key: 'es1', label: 'CraftPad 1 (MCP23017)' },
  { key: 'es2', label: 'CraftPad 2 (MCP23017)' },
  { key: 'bedien', label: 'CraftDeck (MCP23017)' },
  { key: 'finger', label: 'Fingertip-Modul (ADS1115 0x48)' },
  { key: 'thumb', label: 'Daumenstick (ADS1115 0x49)' },
  { key: 's1grip', label: 'CraftSlot 1 – Griff (MCP23017)' },
  { key: 's1encA', label: 'CraftSlot 1 – Encoder A (AS5600)', addrKey: 's1encAaddr' },
  { key: 's1encB', label: 'CraftSlot 1 – Encoder B (AS5600)', addrKey: 's1encBaddr' },
  { key: 's2grip', label: 'CraftSlot 2 – Griff (MCP23017)' },
  { key: 's2encA', label: 'CraftSlot 2 – Encoder A (AS5600)', addrKey: 's2encAaddr' },
  { key: 's2encB', label: 'CraftSlot 2 – Encoder B (AS5600)', addrKey: 's2encBaddr' },
  { key: 'serverActive', label: 'Tastatur-/Gamepad-Ausgabe aktiv (Server-Modus)' }
];

class ModuleStatus {
  constructor() {
    this.body = document.getElementById('module-status-body');
    this.diagBody = document.getElementById('diag-log-body');
  }

  async refresh() {
    this.body.innerHTML = '<p style="color: var(--text-dim); padding: 10px;">Prüfe...</p>';
    try {
      const res = await fetch('/api/device-status');
      const data = await res.json();
      if (!data.success) {
        this.renderError(data.error);
        return;
      }
      this.render(data.status);
    } catch (error) {
      this.renderError(error.message);
    }
  }

  renderError(message) {
    this.body.innerHTML = `
      <p style="color: var(--danger); padding: 10px;">
        Keine Antwort vom Gerät${message ? ` (${message})` : ''}. Ist der Controller per USB verbunden --
        siehe Tab "Verbindung"?
      </p>
    `;
  }

  render(status) {
    const rows = MODULE_STATUS_ITEMS.map(item => {
      const detected = status[item.key] === '1';
      const addr = item.addrKey && status[item.addrKey] ? ` (Adresse ${status[item.addrKey]})` : '';
      return `
        <div class="action-item">
          <div>${item.label}${addr}</div>
          <span class="status ${detected ? 'connected' : 'disconnected'}">${detected ? '✓ erkannt' : '⚠ nicht erkannt'}</span>
        </div>
      `;
    }).join('');

    // Rohdaten der Antwort mitanzeigen -- deckt auf einen Blick auf, wenn ein erwarteter Schluessel
    // ganz fehlt (Uebertragungsproblem) oder unter anderem Namen ankommt, statt nur "nicht erkannt".
    const expectedKeys = new Set(MODULE_STATUS_ITEMS.flatMap(i => [i.key, i.addrKey]).filter(Boolean));
    const missingKeys = [...expectedKeys].filter(k => !(k in status));
    const rawJson = JSON.stringify(status, null, 2);

    this.body.innerHTML = `
      ${rows}
      <details style="margin-top: 16px;">
        <summary style="cursor: pointer; color: var(--text-dim);">Rohdaten der Antwort (${Object.keys(status).length} Werte${missingKeys.length ? `, ${missingKeys.length} erwartete fehlen komplett` : ''})</summary>
        ${missingKeys.length ? `<p style="color: var(--danger); font-size: 0.85rem;">Komplett fehlend (keine Antwort dafuer erhalten): ${missingKeys.join(', ')}</p>` : ''}
        <pre style="background: var(--bg); padding: 10px; border-radius: 6px; overflow-x: auto; font-size: 0.85rem;">${rawJson}</pre>
      </details>
    `;
  }

  // Diagnose-Log (WebSerial-Konfig DIAG-Befehl) -- eigener, separater Anzeigebereich, damit ein
  // geladenes Log nicht bei jedem STATUS-"Neu prüfen" durch render()/renderError() mitgelöscht wird.
  async loadDiag() {
    if (!this.diagBody) return;
    this.diagBody.innerHTML = '<p style="color: var(--text-dim); padding: 10px;">Lade Diagnose-Log...</p>';
    try {
      const res = await fetch('/api/device-diag');
      const data = await res.json();
      if (!data.success) {
        this.renderDiagError(data.error);
        return;
      }
      this.renderDiag(data.lines);
    } catch (error) {
      this.renderDiagError(error.message);
    }
  }

  renderDiagError(message) {
    this.diagBody.innerHTML = `
      <p style="color: var(--danger); padding: 10px;">
        Diagnose-Log konnte nicht geladen werden${message ? ` (${message})` : ''}. Ist der Controller per
        USB verbunden – siehe Tab "Verbindung"?
      </p>
    `;
  }

  renderDiag(lines) {
    if (!lines || lines.length === 0) {
      this.diagBody.innerHTML = '<p style="color: var(--text-dim); padding: 10px;">Log ist leer.</p>';
      return;
    }
    // Zeilen zum watchdog-ausgeloesten Reset (Rundenzeit/Phase vor Reset) hervorheben -- genau die
    // Zeilen, die beim Eingrenzen eines Aufhaengers/Resets interessant sind.
    const isHighlight = (line) => /Rundenzeit vor Reset|Phase vor Reset|Watchdog|Reset/i.test(line);
    const rendered = lines.map(line => {
      const highlight = isHighlight(line);
      return `<div style="${highlight ? 'color: var(--warning, #e0a030); font-weight: 600;' : ''}">${escapeHtml(line)}</div>`;
    }).join('');
    this.diagBody.innerHTML = `
      <pre style="background: var(--bg); padding: 10px; border-radius: 6px; overflow-x: auto; font-size: 0.85rem; white-space: pre-wrap;">${rendered}</pre>
    `;
  }
}

window.moduleStatus = new ModuleStatus();
