/**
 * Live-Diagnose (Einstellungen -> Live-Diagnose): zeigt roh, was pro Frame ankommt (physische
 * Tasten) und was ControlHub daraus zurück an die Armlehne schickt (Tastatur-/Gamepad-Signale) --
 * nutzt das bereits bestehende "state-update"-Socket.IO-Event (s. server/index.js
 * emitStateUpdate()), keine eigene Server-Anfrage nötig.
 */

class LiveDiagnostics {
  constructor() {
    this.inputBody = document.getElementById('live-diag-input');
    this.outputBody = document.getElementById('live-diag-output');
    this.socket = window.hubSocket;   // gemeinsame Verbindung der Seite (hubSocket.js, B4)
    this.socket.on('state-update', (data) => this.onUpdate(data));

    this.piezoBtn = document.getElementById('piezo-test-btn');
    this.piezoInput = document.getElementById('piezo-test-ms');
    this.piezoStatus = document.getElementById('piezo-test-status');
    this.piezoBtn?.addEventListener('click', () => this.testPiezo());
  }

  async testPiezo() {
    const ms = Math.max(20, Math.min(5000, parseInt(this.piezoInput.value, 10) || 300));
    this.piezoStatus.textContent = 'sende...';
    try {
      const res = await fetch('/api/device-beep', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ms })
      });
      const result = await res.json();
      this.piezoStatus.textContent = result.success ? `OK (${ms}ms)` : 'Fehler: ' + result.error;
    } catch (error) {
      this.piezoStatus.textContent = 'Fehler: ' + error.message;
    }
  }

  listOrPlaceholder(items, placeholder) {
    if (!items || items.length === 0) {
      return `<span style="color: var(--text-dim);">${placeholder}</span>`;
    }
    return items.join(', ');
  }

  onUpdate(data) {
    if (!this.inputBody || !this.outputBody) return;

    const pressedButtons = data.buttons
      .map((v, i) => (v ? `Taste ${i + 1}` : null))
      .filter(Boolean);
    this.inputBody.innerHTML = this.listOrPlaceholder(pressedButtons, 'Keine Taste gedrückt');

    const keys = (data.output?.keyboard || []).map(k => `⌨ ${k}`);
    const gamepadButtons = (data.output?.gamepad?.buttons || [])
      .map((v, i) => (v ? `🎮 Button ${i + 1}` : null))
      .filter(Boolean);
    this.outputBody.innerHTML = this.listOrPlaceholder([...keys, ...gamepadButtons], 'Kein Signal aktiv');
  }
}

window.liveDiagnostics = new LiveDiagnostics();
