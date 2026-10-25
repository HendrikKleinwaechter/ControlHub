/**
 * Ein-/Ausstecken-Assistent zum automatischen Erkennen der Armlehne (25.08.2026, Hendriks Wunsch) --
 * ersetzt das bisherige "Auto-Detect" (blind erster Treffer nach USB-Chip-Kennung, konnte bei
 * mehreren angeschlossenen Seriell-Geräten das falsche erwischen). Ablauf: Schnappschuss VOR dem
 * Einstecken -> Nutzer steckt die Armlehne ein -> Schnappschuss DANACH -> der neu hinzugekommene Port
 * ist die Armlehne (server/serialCommunication.js wizardBefore()/wizardAfter()).
 *
 * Socket.IO über die gemeinsame Verbindung window.hubSocket (seit 23.10.2026, B4) statt window.app.socket (gleicher Grund wie liveDiagnostics.js/
 * dashboardMap.js -- dieses Skript lädt synchron vor app.js' DOMContentLoaded-Handler).
 */
class ConnectionWizard {
  constructor() {
    this.modal = document.getElementById('connection-wizard-modal');
    this.body = document.getElementById('connection-wizard-body');
    this.socket = window.hubSocket;   // gemeinsame Verbindung der Seite (hubSocket.js, B4)
    this.step = null;
    this.foundPort = null;
    this.candidates = [];
    this.errorMsg = '';
    // Antwort auf 'connect-port' (connectSelected()) schickt der Server NUR an diese eigene Verbindung
    // zurück -- app.js hört auf seiner Verbindung davon nichts. Daher hier selbst auswerten, aber nur,
    // solange der Assistent wirklich auf eine Antwort wartet (spätere/fremde Antworten ignorieren).
    this.socket.on('connection-status', (data) => {
      if (this.step !== 'connecting') return;
      if (data?.success) {
        this.step = 'success';
        if (window.app) window.app.updateConnectionStatus(true);
      } else {
        this.errorMsg = 'Verbinden mit ' + this.foundPort + ' fehlgeschlagen: ' + (data?.error || 'unbekannter Fehler');
        this.step = 'error';
      }
      this.render();
    });
  }

  open() {
    this.step = 'before';
    this.modal.style.display = 'flex';
    this.render();
  }

  close() {
    this.modal.style.display = 'none';
    this.step = null; // eine noch ausstehende connection-status-Antwort danach nicht mehr anzeigen
  }

  render() {
    let html = '';
    if (this.step === 'before') {
      html = `
        <p><strong>Schritt 1 von 2:</strong> Bitte trenne deinen Controller jetzt von diesem PC (USB-Kabel abziehen).</p>
        <p style="color: var(--text-dim);">Ist sie gerade nicht angeschlossen, kannst du direkt weiterklicken.</p>
        <div class="button-group" style="margin-top: 16px;">
          <button class="btn-primary" onclick="window.connectionWizard.runBefore()">Weiter →</button>
          <button class="btn-secondary" onclick="window.connectionWizard.close()">Abbrechen</button>
        </div>`;
    } else if (this.step === 'waiting-before') {
      html = `<p>Einen Moment...</p>`;
    } else if (this.step === 'after') {
      html = `
        <p><strong>Schritt 2 von 2:</strong> Stecke den Controller jetzt ein und warte kurz, bis dein Rechner ihn erkannt hat.</p>
        <div class="button-group" style="margin-top: 16px;">
          <button class="btn-success" onclick="window.connectionWizard.runAfter()">Controller ist eingesteckt →</button>
          <button class="btn-secondary" onclick="window.connectionWizard.close()">Abbrechen</button>
        </div>`;
    } else if (this.step === 'waiting-after') {
      html = `<p>Suche...</p>`;
    } else if (this.step === 'connecting') {
      html = `
        <p>Verbinde mit <code>${escapeHtml(this.foundPort)}</code>...</p>
        <div class="button-group" style="margin-top: 16px;">
          <button class="btn-secondary" onclick="window.connectionWizard.close()">Abbrechen</button>
        </div>`;
    } else if (this.step === 'success') {
      html = `
        <p>✓ Controller gefunden und verbunden (<code>${escapeHtml(this.foundPort)}</code>).</p>
        <div class="button-group" style="margin-top: 16px;">
          <button class="btn-success" onclick="window.connectionWizard.close()">Fertig</button>
        </div>`;
    } else if (this.step === 'none') {
      html = `
        <p>Es wurde kein neues Gerät erkannt. Ist der Controller wirklich schon eingesteckt?</p>
        <div class="button-group" style="margin-top: 16px;">
          <button class="btn-primary" onclick="window.connectionWizard.runAfter()">Nochmal versuchen</button>
          <button class="btn-secondary" onclick="window.connectionWizard.close()">Abbrechen</button>
        </div>`;
    } else if (this.step === 'ambiguous') {
      const optionsHtml = this.candidates.map(c => `<option value="${escapeHtml(c.path)}">${escapeHtml(c.path)} – ${escapeHtml(c.manufacturer || 'unbekannter Hersteller')}</option>`).join('');
      html = `
        <p>Es sind mehrere neue Geräte gleichzeitig aufgetaucht – bitte das richtige auswählen:</p>
        <div class="input-group">
          <select id="wizard-candidate-select">${optionsHtml}</select>
        </div>
        <div class="button-group" style="margin-top: 16px;">
          <button class="btn-success" onclick="window.connectionWizard.connectSelected()">Verbinden</button>
          <button class="btn-secondary" onclick="window.connectionWizard.close()">Abbrechen</button>
        </div>`;
    } else if (this.step === 'error') {
      html = `
        <p style="color: var(--danger);">Fehler: ${escapeHtml(this.errorMsg)}</p>
        <div class="button-group" style="margin-top: 16px;">
          <button class="btn-secondary" onclick="window.connectionWizard.close()">Schließen</button>
        </div>`;
    }
    this.body.innerHTML = html;
  }

  runBefore() {
    this.step = 'waiting-before';
    this.render();
    this.socket.emit('wizard-before');
    this.socket.once('wizard-before-result', (result) => {
      if (!result.success) {
        this.errorMsg = result.error || 'Unbekannter Fehler';
        this.step = 'error';
        this.render();
        return;
      }
      this.step = 'after';
      this.render();
    });
  }

  runAfter() {
    this.step = 'waiting-after';
    this.render();
    this.socket.emit('wizard-after');
    this.socket.once('wizard-after-result', (result) => {
      if (result.success) {
        this.foundPort = result.port;
        this.step = 'success';
        if (window.app) window.app.updateConnectionStatus(true);
      } else if (result.reason === 'ambiguous') {
        this.candidates = result.candidates;
        this.step = 'ambiguous';
      } else if (result.reason === 'none') {
        this.step = 'none';
      } else {
        this.errorMsg = result.error || 'Unbekannter Fehler';
        this.step = 'error';
      }
      this.render();
    });
  }

  // Ergebnis kommt als 'connection-status' zurück, s. Listener im Konstruktor
  connectSelected() {
    const port = document.getElementById('wizard-candidate-select').value;
    this.foundPort = port;
    this.step = 'connecting';
    this.render();
    this.socket.emit('connect-port', { port, baudRate: 115200 });
  }
}

window.connectionWizard = new ConnectionWizard();
