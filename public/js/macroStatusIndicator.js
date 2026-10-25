/**
 * Makro-Hinweis in der Kopfleiste (Mockup „Navigation und Seiten“, Hendrik 22.10.2026): erscheint nur, solange ein
 * Makro läuft oder auf einen Tastendruck wartet -- „Makro „Name“ · 2/5“ links neben dem Statusknopf. Antippen
 * öffnet das Statusfenster (statusMenus.js: abbrechen, öffnen). Im Ruhezustand ist der Platz leer.
 * Rein anzeigend, keine eigene Logik -- der Server (macroEngine.js) bestimmt, welcher Zustand gerade gilt.
 *
 * Socket.IO über die gemeinsame Verbindung window.hubSocket (seit 23.10.2026, B4) statt window.app.socket (gleicher Grund wie dashboardMap.js/telemetry.js
 * -- dieses Skript lädt synchron vor app.js' DOMContentLoaded-Handler).
 */

class MacroStatusIndicator {
  constructor() {
    this.el = document.getElementById('macro-status-slot');
    this.status = { active: false };
    this.render();

    this.socket = window.hubSocket;   // gemeinsame Verbindung der Seite (hubSocket.js, B4)
    // Hinweise der Makro-Engine (23.10.2026): zweites Makro bricht nur ab (B5), Schritt mit gelöschter Funktion (B2)
    this.socket.on('macro-hinweis', (d) => { if (d?.text) window.showToast?.(d.text); });
    this.socket.on('hub-hinweis', (d) => { if (d?.text) window.showToast?.(d.text); });   // z. B. „Vorgewende-Ton aus“ per Taste
    this.socket.on('macro-status', (status) => {
      this.status = status;
      this.render();
      window.statusMenus?.refresh('makro');
    });
  }

  // Springt zur Bearbeiten-Ansicht des GERADE aktiven Makros (Hendriks Wunsch 23.08.2026) -- nur
  // sinnvoll, solange wirklich eines läuft/wartet, s. CSS (cursor:pointer nur bei --running/--waiting).
  // vorgewende.load() wird hier bewusst nochmal explizit abgewartet (nicht nur das fire-and-forget
  // load() aus switchMainTab()), damit editMacro() garantiert erst NACH dem Nachladen der aktuellen
  // Makro-Liste läuft -- sonst könnte this.macros dort noch veraltet/leer sein.
  async openActiveMacro() {
    if (!this.status.active || !this.status.macroId) return;
    window.app.navigateToTab('vorgewende');
    await window.vorgewende.load();
    window.vorgewende.editMacro(this.status.macroId);
  }

  render() {
    if (!this.el) return;
    const status = this.status;
    const esc = escapeHtml;
    if (!status.active) { this.el.innerHTML = ''; return; }
    const name = status.macroName || status.macroId;
    const cls = status.waiting ? 'macro-status-indicator--waiting' : 'macro-status-indicator--running';
    const step = status.total ? `${status.step}/${status.total}` : '';   // Schritt bleibt sichtbar, nur der Name wird gekürzt
    const title = `Makro „${name}“ ${status.waiting ? 'wartet auf Tastendruck' : 'läuft'}`;
    this.el.innerHTML = `<button type="button" class="macro-status-btn ${cls}" title="${esc(title)}" onclick="window.statusMenus?.toggle('makro')"><span class="macro-status-icon">${status.waiting ? '⏸' : '▶'}</span><span class="macro-status-text">Makro „${esc(name)}“</span>${step ? `<span class="macro-status-step">· ${step}</span>` : ''}</button>`;
  }
}

window.macroStatusIndicator = new MacroStatusIndicator();
