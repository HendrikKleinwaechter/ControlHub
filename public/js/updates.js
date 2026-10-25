/**
 * Einstellungen → Allgemein → „Version & Updates“ (23.10.2026, Update-Weg; Server: server/routes/update.js).
 *
 * Zeigt die laufende Version und den Datenordner. „Nach Updates suchen“ fragt nur auf Knopfdruck einmal bei GitHub
 * nach (Hendrik: ControlHub geht nie von selbst ins Internet) und zeigt, ob es eine neuere Version gibt, was neu ist
 * und wo man sie herunterlädt. Installiert wird nichts automatisch.
 */
const updEsc = escapeHtml;   // js/basis.js (Durchsicht B9: vorher eigene Kopie)

class Updates {
  constructor() {
    this.info = null;
    this.ergebnis = null;   // letzte Antwort von „Nach Updates suchen“
    this.sucht = false;
    document.addEventListener('tabchanged', e => { if (e.detail?.tabName === 'status' && !this.info) this.laden(); });
    this.laden();
  }

  async laden() {
    try { this.info = await (await fetch('/api/version')).json(); } catch { this.info = null; }
    this.zeichnen();
  }

  async suchen() {
    if (this.sucht) return;
    this.sucht = true;
    this.zeichnen();
    try {
      this.ergebnis = await (await fetch('/api/update/pruefen', { method: 'POST' })).json();
    } catch (e) {
      this.ergebnis = { success: false, error: 'ControlHub hat nicht geantwortet.' };
    }
    this.sucht = false;
    this.zeichnen();
  }

  ergebnisHtml() {
    const r = this.ergebnis;
    if (!r) return '';
    if (!r.success) return `<div class="upd-ergebnis fehler">${updEsc(r.error || 'Nachsehen hat nicht geklappt.')}</div>`;
    if (r.stand === 'keine') return '<div class="upd-ergebnis">Auf GitHub ist noch keine Version veröffentlicht.</div>';
    if (r.stand === 'aktuell') return `<div class="upd-ergebnis ok">✓ Du hast die neueste Version (${updEsc(r.version)}).</div>`;
    const datum = r.datum ? new Date(r.datum).toLocaleDateString('de-DE') : '';
    return `<div class="upd-ergebnis neu">
        <b>Neue Version ${updEsc(r.neueste)}</b>${datum ? ` vom ${updEsc(datum)}` : ''} – du hast ${updEsc(r.version)}.
        ${r.hinweise ? `<details class="upd-hinweise"><summary>Was ist neu?</summary><div>${updEsc(r.hinweise)}</div></details>` : ''}
        <ol class="upd-schritte">
          <li>Am PC die ZIP-Datei der neuen Version herunterladen${r.url ? ` (<a href="${updEsc(r.url)}" target="_blank" rel="noopener">Download-Seite öffnen</a>)` : ''}.</li>
          <li>Das schwarze ControlHub-Fenster schließen.</li>
          <li>Den Inhalt der ZIP in deinen ControlHub-Ordner kopieren und „Dateien ersetzen“ wählen (oder in einen neuen Ordner entpacken).</li>
          <li><code>start-server.bat</code> starten.</li>
        </ol>
        <p class="setting-hint">Deine Einstellungen, Spiele und Bilder bleiben im Datenordner; beim ersten Start der neuen Version sichert ControlHub sie zusätzlich.</p>
      </div>`;
  }

  zeichnen() {
    const el = document.getElementById('update-body');
    if (!el) return;
    const i = this.info;
    el.innerHTML = `
      <p style="margin: 0 0 6px;">ControlHub <b>${updEsc(i?.version || '–')}</b></p>
      <p class="setting-hint" style="margin-top: 0;">Deine Daten (Einstellungen, Spiele, Profile, Bilder) liegen im Datenordner<br>
        <code class="upd-pfad">${updEsc(i?.datenOrdner || '–')}</code><br>
        Eine neue Version kannst du über die alte kopieren oder woanders entpacken – die Daten bleiben dort.</p>
      <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
        <button type="button" class="btn-secondary btn-small" onclick="window.updates.suchen()" ${this.sucht ? 'disabled' : ''}>${this.sucht ? 'Sucht …' : 'Nach Updates suchen'}</button>
        ${i?.updateSeite ? `<a class="setting-hint" href="${updEsc(i.updateSeite)}" target="_blank" rel="noopener">Alle Versionen auf GitHub</a>` : ''}
      </div>
      <p class="setting-hint">ControlHub fragt dafür einmal bei GitHub nach – nur, wenn du hier drückst. Sonst geht es nie von selbst ins Internet.</p>
      ${this.ergebnisHtml()}`;
  }
}

window.updates = new Updates();
