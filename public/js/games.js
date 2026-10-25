/**
 * Spielwechsel (Phase 2 Umbauplan, 21.10.2026 -- s. server/gameManager.js).
 *
 * - Karte "Spiel" unter Einstellungen → Allgemein: aktives Spiel wählen, eigene Spiele anlegen/
 *   umbenennen/entfernen, ein Spiel komplett sichern bzw. wiederherstellen.
 * - Anzeige "Spiel: …" in der Statusleiste.
 * - Beim allerersten Start (noch kein Spiel gewählt) einmalig die Auswahl als Modal -- seit 23.10.2026 nur noch als
 *   Rückfall; normalerweise fragt der Einrichtungs-Assistent (einrichtung.js).
 * - Elemente mit data-feature="<name>" werden ausgeblendet, wenn das aktive Spiel die Fähigkeit nicht
 *   hat (z. B. Karte/Precision Farming bei eigenen Spielen ohne Telemetrie).
 * - Nach einem Wechsel (auch von einem anderen Tablet aus) lädt sich die Seite neu, damit alle
 *   Ansichten sicher die Daten des neuen Spiels zeigen.
 * Socket.IO über window.hubSocket (gemeinsame Verbindung, B4), da window.app erst nach DOMContentLoaded existiert.
 */
class GameSwitcher {
  constructor() {
    this.games = [];
    this.active = null;
    this.chosen = true;
    this.socket = window.hubSocket;   // gemeinsame Verbindung der Seite (hubSocket.js, B4)
    this.socket.on('game-changed', () => window.location.reload());
    this.socket.on('games-updated', (payload) => this.apply(payload));
    this.select = document.getElementById('game-select');
    this.select?.addEventListener('change', () => this.renderInfo());
    this.load();
  }

  async load() {
    try {
      const res = await fetch('/api/games');
      this.apply(await res.json());
    } catch (e) {
      console.warn('Spiele nicht ladbar:', e);
    }
  }

  apply(payload) {
    if (!payload?.success) return;
    this.games = payload.games;
    this.active = payload.active;
    this.chosen = payload.chosen;
    this.render();
    this.applyFeatures();
    // Die Spielwahl beim ersten Start übernimmt der Einrichtungs-Assistent (einrichtung.js, 23.10.2026)
    if (!this.chosen && !window.einrichtung) this.showFirstStart();
  }

  get activeGame() { return this.games.find(g => g.id === this.active) || null; }
  get selectedGame() { return this.games.find(g => g.id === this.select?.value) || null; }

  render() {
    const badge = document.getElementById('active-game-badge');
    if (badge) badge.textContent = this.activeGame?.name || '–';
    if (!this.select) return;
    const keep = this.select.value;
    this.select.innerHTML = '';
    const builtIn = this.games.filter(g => !g.custom);
    const custom = this.games.filter(g => g.custom);
    const addGroup = (label, list) => {
      if (list.length === 0) return;
      const grp = document.createElement('optgroup');
      grp.label = label;
      for (const g of list) {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.textContent = g.name + (g.id === this.active ? '  (aktiv)' : '');
        grp.appendChild(opt);
      }
      this.select.appendChild(grp);
    };
    addGroup('Spiele', builtIn);
    addGroup('Eigene Spiele', custom);
    this.select.value = this.games.some(g => g.id === keep) ? keep : this.active;
    this.renderInfo();
  }

  renderInfo() {
    const g = this.selectedGame;
    const info = document.getElementById('game-info');
    if (info) {
      info.textContent = !g ? '' : g.custom
        ? 'Eigenes Spiel: Profile, Belegungen, Makros und eigene Kacheln funktionieren – Spieldaten (Cockpit, Karte …) gibt es dafür nicht.'
        : `${g.name}: mit Spieldaten (Telemetrie-Mod) für Cockpit, Karte und automatischen Profilwechsel.`;
    }
    const isActive = g?.id === this.active;
    const btn = document.getElementById('game-switch-btn');
    if (btn) btn.disabled = !g || isActive;
    const rename = document.getElementById('game-rename-btn');
    if (rename) rename.disabled = !g?.custom;
    const remove = document.getElementById('game-remove-btn');
    if (remove) remove.disabled = !g?.custom || isActive;
  }

  applyFeatures() {
    const features = new Set(this.activeGame?.features || []);
    document.querySelectorAll('[data-feature]').forEach(el => {
      el.classList.toggle('feature-off', !features.has(el.dataset.feature));
    });
    // Umgekehrt: nur zeigen, wenn das Spiel die Fähigkeit NICHT hat (Erklärung, warum Seiten fehlen)
    document.querySelectorAll('[data-feature-off]').forEach(el => {
      el.classList.toggle('feature-off', features.has(el.dataset.featureOff));
    });
  }

  async openSettings() {
    await window.app?.navigateToTab('status');
    document.getElementById('game-settings-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async post(url, body, method = 'POST') {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Unbekannter Fehler');
    return data;
  }

  async switchTo(id) {
    const g = this.games.find(x => x.id === id);
    if (!g) return;
    try {
      await this.post('/api/games/switch', { id });
      // Neu laden kommt über 'game-changed'; falls das Event verloren geht, trotzdem neu laden
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      uiAlert('Wechsel nicht möglich: ' + e.message);
    }
  }

  async switchToSelected() {
    const g = this.selectedGame;
    if (!g || g.id === this.active) return;
    if (!(await uiConfirm(`Profile, Belegungen, Makros und eigene Kacheln wechseln komplett auf „${g.name}“. Gehaltene Tasten werden losgelassen, ein laufendes Makro wird abgebrochen.`, { title: 'Spiel wechseln', ok: 'Wechseln' }))) return;
    this.switchTo(g.id);
  }

  async addCustom({ fromFirstStart = false } = {}) {
    const name = await uiPrompt('Eigene Spiele haben eigene Profile, Belegungen und Makros, aber keine Spieldaten (Cockpit, Karte …).', '', { title: 'Eigenes Spiel hinzufügen', placeholder: 'z. B. Rennspiel', ok: 'Anlegen' });
    if (name === null || !name.trim()) return;
    try {
      const switchNow = fromFirstStart || await uiConfirm(`Gleich zu „${name.trim()}“ wechseln?`, { title: 'Spiel angelegt', ok: 'Wechseln', cancel: 'Später' });
      const data = await this.post('/api/games', { name: name.trim(), switch: switchNow });
      if (switchNow) setTimeout(() => window.location.reload(), 1500);
      else this.apply(data);
    } catch (e) {
      uiAlert('Anlegen nicht möglich: ' + e.message);
    }
  }

  async renameSelected() {
    const g = this.selectedGame;
    if (!g?.custom) return;
    const name = await uiPrompt('Neuer Name:', g.name, { title: 'Spiel umbenennen', ok: 'Umbenennen' });
    if (name === null || !name.trim() || name.trim() === g.name) return;
    try {
      this.apply(await this.post(`/api/games/${encodeURIComponent(g.id)}`, { name: name.trim() }, 'PUT'));
    } catch (e) {
      uiAlert('Umbenennen nicht möglich: ' + e.message);
    }
  }

  async removeSelected() {
    const g = this.selectedGame;
    if (!g?.custom || g.id === this.active) return;
    if (!(await uiConfirm(`„${g.name}“ mit allen Profilen, Belegungen und Makros entfernen?\n\nTipp: vorher „Spiel sichern“.`, { title: 'Spiel entfernen', ok: 'Weiter', danger: true }))) return;
    if (!(await uiConfirm(`Wirklich „${g.name}“ entfernen?\n\n(Die Daten werden auf dem PC in server/config/_geloescht/ aufbewahrt, aber nicht mehr angezeigt.)`, { title: 'Spiel entfernen', ok: 'Entfernen', danger: true }))) return;
    try {
      this.apply(await this.post(`/api/games/${encodeURIComponent(g.id)}`, undefined, 'DELETE'));
    } catch (e) {
      uiAlert('Entfernen nicht möglich: ' + e.message);
    }
  }

  async exportSelected() {
    const g = this.selectedGame;
    if (!g) return;
    try {
      const res = await fetch(`/api/games/${encodeURIComponent(g.id)}/export`);
      if (!res.ok) throw new Error((await res.json()).error);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ControlHub-Spiel_${g.name.replace(/[^\w-]+/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) {
      uiAlert('Sichern nicht möglich: ' + e.message);
    }
  }

  async importFile(input) {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    let bundle;
    try {
      bundle = JSON.parse(await file.text());
      if (bundle?.type !== 'controlhub-game') throw new Error('Das ist keine ControlHub-Spielsicherung.');
    } catch (e) {
      uiAlert('Datei nicht lesbar: ' + e.message);
      return;
    }
    const from = bundle.game?.name || 'Spiel';
    const target = this.selectedGame;
    const how = await uiChoice(
      `Sicherung „${from}“ vom ${(bundle.exportedAt || '').slice(0, 10)}.\n\n` +
      (target ? `„${target.name}“ ersetzen: der bisherige Stand wird vorher auf dem PC gesichert.\n` : '') +
      'Als neues Spiel: wird zusätzlich als eigenes Spiel angelegt.',
      [...(target ? [{ label: `„${target.name}“ ersetzen`, value: 'replace', danger: true }] : []), { label: 'Als neues Spiel', value: 'new' }],
      { title: 'Spiel wiederherstellen' });
    if (!how) return;
    const replace = how === 'replace';
    try {
      if (replace) {
        await this.post('/api/games/import', { bundle, mode: 'replace', targetId: target.id });
        if (target.id === this.active) setTimeout(() => window.location.reload(), 1500);
        else uiAlert(`„${target.name}“ wiederhergestellt.`);
      } else {
        const name = await uiPrompt('Name für das neue Spiel:', `${from} (wiederhergestellt)`, { title: 'Spiel wiederherstellen', ok: 'Anlegen' });
        if (name === null || !name.trim()) return;
        const data = await this.post('/api/games/import', { bundle, mode: 'new', name: name.trim() });
        this.apply(data);
        uiAlert(`„${data.target.name}“ angelegt. Wechseln kannst du über „Aktives Spiel“.`);
      }
    } catch (e) {
      uiAlert('Wiederherstellen nicht möglich: ' + e.message);
    }
  }

  showFirstStart() {
    const modal = document.getElementById('game-first-start-modal');
    const list = document.getElementById('game-first-start-list');
    if (!modal || !list || modal.style.display === 'flex') return;
    list.innerHTML = '';
    for (const g of this.games) {
      const btn = document.createElement('button');
      btn.className = 'btn-primary';
      btn.textContent = g.name;
      btn.onclick = () => this.switchTo(g.id);
      list.appendChild(btn);
    }
    modal.style.display = 'flex';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.gameSwitcher = new GameSwitcher();
});
