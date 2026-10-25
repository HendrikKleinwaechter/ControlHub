/**
 * Diagnose in Einstellungen → Allgemein (Hendrik 25.10.2026: „ein Diagnose-Log-System … auch wenn bei Kunden später mal
 * was schiefläuft“): Zustand der Armlehne (Firmware ab 2.15: STAT, sonst nur ihr Ereignis-Log), die letzten Meldungen
 * von ControlHub und „Diagnosedatei speichern“. Daten von server/diagnose.js (GET /api/diagnose).
 */
(function () {
  const esc = escapeHtml;   // js/basis.js
  const ART = { START: 'Start', VERBUNDEN: 'Verbunden', GETRENNT: 'Getrennt', ARMLEHNE: 'Armlehne', WARNUNG: 'Achtung', FEHLER: 'Fehler', INFO: 'Info' };

  class DiagnoseSeite {
    constructor() {
      document.addEventListener('tabchanged', e => { if (e.detail?.tabName === 'status') this.laden(); });
      document.addEventListener('mod-status-neu', () => { if (this.body?.offsetParent) this.laden(); });   // nach „Mod installieren“
    }
    get body() { return document.getElementById('diagnose-body'); }

    async laden(url = '/api/diagnose', opts) {
      if (!this.body) return;
      try {
        const d = await fetch(url, opts).then(r => r.json());
        if (!d.success) throw new Error(d.error || 'keine Antwort');
        this.zeigen(d);
      } catch (e) {
        this.body.innerHTML = `<p class="setting-hint">Diagnose nicht ladbar: ${esc(e.message)}</p>`;
      }
    }
    abfragen() {
      if (this.body) this.body.innerHTML = '<p class="setting-hint">Frage die Armlehne ab …</p>';
      return this.laden('/api/diagnose/abfragen', { method: 'POST' });
    }

    zeigen(d) {
      const st = d.armlehne;
      const zeit = s => { const t = new Date(s); return `${t.toLocaleDateString('de-DE')} ${t.toLocaleTimeString('de-DE')}`; };
      const lauf = s => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : s >= 60 ? `${Math.floor(s / 60)} min` : `${s} s`);
      const arm = !d.verbunden ? 'Armlehne nicht verbunden.'
        : st ? `Firmware ${esc(st.fw)} · läuft seit ${lauf(st.up)} · letzter Neustart: ${esc(d.neustart || '–')}`
          : 'Diese Firmware meldet keinen Zustand (ab Armlehnen-Firmware 2.15).';
      const liste = (d.ereignisse || []).slice(-15).reverse().map(e => `<li class="diag-${esc(e.art.toLowerCase())}"><span>${esc(zeit(e.zeit))}</span>
          <b>${esc(ART[e.art] || e.art)}</b> ${esc(e.text)}</li>`).join('');
      // Spieldaten (25.10.2026, Mehrspieler): Version der Mod und Rolle; ältere Mod als Hinweis (keine Meldung von selbst)
      const sd = d.spieldaten;
      const rolle = !sd?.mehrspieler ? 'Einzelspiel' : sd.server === true ? 'Mehrspieler als Gastgeber' : sd.server === false ? 'Mehrspieler als Gast' : 'Mehrspieler';
      const spiel = !sd || sd.stand !== 'ok' ? 'Spieldaten: keine (Spiel aus, pausiert oder Mod fehlt).'
        : `Spieldaten: ${sd.modVersion ? `Mod ${esc(sd.modVersion)}` : 'Mod älter als 0.7.9'} · ${rolle}`;
      const alt = sd?.stand === 'ok' && !sd.modVersion
        ? '<p class="setting-hint">Für den Mehrspieler die Mod 0.7.9 oder neuer einspielen, als Gast beim Gastgeber bzw. auf dem Server.</p>' : '';
      // Mod im Mod-Ordner (25.10.2026, „Mod installieren“): nur beim LS25
      const fs25 = window.gameSwitcher?.activeGame?.telemetry === 'fs25';
      this.body.innerHTML = `<p class="diag-arm ${st && ['watchdog', 'absturz'].includes(st.grund) ? 'warn' : ''}">${arm}</p>
        <p class="diag-arm ${alt ? 'warn' : ''}">${spiel}</p>${alt}
        ${fs25 ? '<div id="diag-mod"></div>' : ''}
        ${liste ? `<ul class="diag-liste">${liste}</ul>` : '<p class="setting-hint">Noch keine Meldungen seit dem Start.</p>'}`;
      if (fs25 && window.modInstall) {
        window.modInstall.laden().then(m => { const el = document.getElementById('diag-mod'); if (el) el.innerHTML = window.modInstall.html(m); });
      }
    }

    async datei() {
      try {
        const res = await fetch('/api/diagnose/datei');
        const data = await res.json();
        if (data.success === false) throw new Error(data.error);
        const t = new Date(), z = n => String(n).padStart(2, '0');   // Ortszeit im Namen (vorher Weltzeit: „22-48“ um 00:48)
        downloadJson(data, `ControlHub-Diagnose ${t.getFullYear()}-${z(t.getMonth() + 1)}-${z(t.getDate())} ${z(t.getHours())}-${z(t.getMinutes())}`);
        window.showToast?.('Diagnosedatei gespeichert (Ordner Downloads)');
        this.laden();
      } catch (e) {
        uiAlert('Diagnosedatei nicht möglich: ' + e.message);
      }
    }
  }

  window.diagnose = new DiagnoseSeite();
})();
