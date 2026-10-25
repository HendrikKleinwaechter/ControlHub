/**
 * Einstellungen → Karte (Test 23.10.2026, Anmerkung 11; Server: server/routes/karte.js).
 * Glättung und Straßen gelten für alle Geräte und alle Kartenkacheln (vorher je Kachel bzw. je Gerät), dazu
 * worüber der Vorgewende-Ton kommt. Jedes Gerät holt den Stand
 * beim Start und bekommt Änderungen per 'karte-einstellungen'.
 */
(function () {
  class KarteEinstellungen {
    constructor() {
      this.stand = { glaetten: 'wenig', strassen: true, beep: 'tablet' };
      window.hubSocket?.on('karte-einstellungen', k => { if (k) this.anwenden(k); });
      document.addEventListener('tabchanged', e => { if (e.detail?.tabName === 'karte-einstellungen') this.laden(); });
      this.laden();
    }

    async laden() {
      try {
        const r = await (await fetch('/api/karte')).json();
        if (r.success) this.anwenden(r.karte);
      } catch (e) { console.warn('Karten-Einstellungen nicht ladbar:', e); }
    }

    anwenden(k) {
      this.stand = { ...this.stand, ...k };
      const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
      setVal('karte-glaetten', this.stand.glaetten);
      setVal('karte-strassen', this.stand.strassen ? 'an' : 'aus');
      setVal('karte-beep', this.stand.beep);
      window.dashboardMapView?.setSmoothing(this.stand.glaetten);
      window.dashboardMapView?.setRoadsVisible?.(this.stand.strassen);
      window.dashboardMapView?.renderMapSettings();
    }

    async alleFlaechenLoeschen() {
      if (!(await uiConfirm('Die bearbeitete Fläche ALLER Fahrzeuge in diesem Spielstand löschen? Das lässt sich nicht rückgängig machen.', { title: 'Alle Flächen löschen', ok: 'Löschen', danger: true }))) return;
      try {
        const r = await (await fetch('/api/flaeche?alle=1', { method: 'DELETE' })).json();
        if (!r.success) throw new Error(r.error);
        window.showToast?.('Bearbeitete Flächen gelöscht');
      } catch (e) { uiAlert('Löschen fehlgeschlagen: ' + e.message); }
    }

    async set(patch) {
      try {
        const r = await (await fetch('/api/karte', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })).json();
        if (!r.success) throw new Error(r.error);
        this.anwenden(r.karte);
      } catch (e) {
        uiAlert('Speichern fehlgeschlagen: ' + e.message);
        this.laden();
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => { window.karteEinstellungen = new KarteEinstellungen(); });
})();
