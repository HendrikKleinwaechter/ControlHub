/**
 * „Mod installieren“ (Hendrik 25.10.2026: „Kann der ControlHub die Mod nicht auch … in den Mods-Ordner machen?“): Zustand
 * der Mod und Knopf, im Einrichtungs-Assistenten (Schritt Spieldaten) und in der Diagnose. Kopiert wird nur auf Knopfdruck
 * (server/modInstallieren.js). Nach dem Kopieren meldet das Ereignis 'mod-status-neu', dass neu gezeichnet werden soll.
 */
(function () {
  const esc = s => escapeHtml(String(s ?? ''));   // js/basis.js

  class ModInstall {
    constructor() {
      this.meldung = '';   // Ergebnis des letzten Klicks (Antwort auf die eigene Aktion, keine Meldung von selbst)
    }

    async laden() {
      try {
        const d = await fetch('/api/mod/status').then(r => r.json());
        return d.success ? d : { fehler: d.error || 'keine Antwort' };
      } catch (e) {
        return { fehler: e.message };
      }
    }

    /** Zustand als HTML; st = laden(), undefined/null = wird noch geladen */
    html(st) {
      if (!st) return '<p class="setting-hint">Mod wird geprüft …</p>';
      if (st.fehler) return `<p class="setting-hint">Mod: ${esc(st.fehler)}</p>`;
      const knopf = text => ` <button type="button" class="btn-primary btn-small" onclick="window.modInstall.installieren(this)">${esc(text)}</button>`;
      let zeile, k = '', warn = false;
      if (!st.spiel) {
        zeile = 'Den Ordner des LS25 gibt es auf diesem PC nicht. Die Mod kopierst du dann von Hand auf den Spiele-PC.';
      } else if (!st.installiert) {
        zeile = 'Die Mod ist noch nicht im Mod-Ordner.'; warn = true;
        k = st.mitgeliefert ? knopf('Mod installieren') : '';
      } else if (st.aktuell) {
        zeile = `✓ Mod ${esc(st.installiert)} ist installiert.`;
      } else if (st.installiert === '?') {
        zeile = 'Im Mod-Ordner liegt eine Mod-Datei, die sich nicht lesen lässt.'; warn = true;
        k = st.mitgeliefert ? knopf('Durch die mitgelieferte ersetzen') : '';
      } else {
        zeile = `Installiert ist Mod ${esc(st.installiert)}${st.mitgeliefert ? `, mitgeliefert ist ${esc(st.mitgeliefert)}` : ''}.`; warn = !!st.mitgeliefert;
        k = st.mitgeliefert ? knopf(`Auf ${st.mitgeliefert} aktualisieren`) : '';
      }
      if (st.spiel && !st.mitgeliefert && !st.aktuell) zeile += ' Die Mod liegt im Download von ControlHub im Ordner „Mod“.';
      const doppelt = st.doppelt?.length
        ? `<p class="setting-hint diag-arm warn">Im Mod-Ordner liegt außerdem: ${st.doppelt.map(esc).join(', ')}. Bitte nur eine Fassung behalten, sonst lädt das Spiel womöglich die falsche.</p>` : '';
      return `<p class="diag-arm ${warn ? 'warn' : ''}">${zeile}${k}</p>${this.meldung ? `<p class="setting-hint">${esc(this.meldung)}</p>` : ''}${doppelt}
        ${st.ordner ? `<p class="setting-hint">Mod-Ordner: <code>${esc(st.ordner)}</code></p>` : ''}`;
    }

    async installieren(btn) {
      if (btn) { btn.disabled = true; btn.textContent = 'Kopiere …'; }
      try {
        const d = await fetch('/api/mod/installieren', { method: 'POST' }).then(r => r.json());
        if (!d.success) throw new Error(d.error || 'keine Antwort');
        this.meldung = `Mod ${d.installiert} ist im Mod-Ordner. Im Spiel beim Laden des Spielstands aktivieren; läuft das Spiel gerade, wirkt sie nach dem Neustart.`;
      } catch (e) {
        this.meldung = '';
        uiAlert('Mod nicht installiert: ' + e.message);
      }
      document.dispatchEvent(new CustomEvent('mod-status-neu'));
    }
  }

  window.modInstall = new ModInstall();
})();
