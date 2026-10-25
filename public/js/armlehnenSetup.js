/**
 * Kappenfarben am Fingertip-Modul (Reiter Controller → Module).
 *
 * Bis 23.10.2026 stand hier auch das Armlehnen-Setup (Version Pro/Comfort/Plus/Mini/Individuell, Unterbau und Griff je
 * CraftSlot, per GETALL/SET in der Firmware gespeichert). Das ersetzt der Modul-Baukasten der Geräteprofile
 * (public/js/controller.js, server/controllerManager.js): Die Firmware-Werte sind dort nur Metadaten -- die Firmware
 * liest sie nie aus -- und werden beim ersten Verbinden einmal übernommen. Der alte Stand liegt in Git.
 */

// Kappenfarben der Fingertips (Hendrik 23.10.2026): je Fingertip „Ohne“ oder eine der Tastenfarben (SM_BUTTON_COLORS);
// gespeichert beim Modulbild (moduleLayouts.json, capColors), sofort wirksam
class KappenFarben {
  constructor() {
    this.body = document.getElementById('kappenfarben-body');
    this.caps = {};
    this.load();
  }

  async load() {
    try {
      const res = await fetch('/api/module-layout/fingertip');
      const data = await res.json();
      this.caps = data.layout?.capColors || {};
    } catch { this.caps = {}; }
    this.render();
  }

  render() {
    if (!this.body) return;
    const swatch = (key, c) => {
      const on = (this.caps[key] || null) === (c?.id || null);
      const style = c ? `background:${c.hex};` : '';
      return `<button type="button" class="cap-swatch${c ? '' : ' cap-swatch--none'}${on ? ' selected' : ''}" style="${style}"
        aria-pressed="${on}" title="${c ? c.label : 'Ohne Ring'}" aria-label="Fingertip ${key.slice(-1)}: ${c ? c.label : 'ohne Ring'}"
        onclick="window.kappenFarben.set('${key}', ${c ? `'${c.id}'` : 'null'})">${c ? '' : 'Ohne'}</button>`;
    };
    this.body.innerHTML = ['finger1', 'finger2', 'finger3', 'finger4'].map(key => `
      <div class="cap-row">
        <span class="cap-name">Fingertip ${key.slice(-1)}</span>
        <div class="cap-swatches">${swatch(key, null)}${SM_BUTTON_COLORS.map(c => swatch(key, c)).join('')}</div>
      </div>`).join('');
  }

  async set(key, color) {
    try {
      const res = await fetch('/api/module-layout/fingertip/cap-color', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, color })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      this.caps = data.capColors || {};
      this.render();
      if (window.tilePages) window.tilePages.stLayouts = null;   // Steuerungsübersicht lädt die Bilder neu (Tastenbelegung lädt ohnehin frisch)
    } catch (error) {
      uiAlert(`Speichern fehlgeschlagen: ${error.message}`);
    }
  }
}

window.kappenFarben = new KappenFarben();
