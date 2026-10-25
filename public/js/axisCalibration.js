/**
 * Achsen-Kalibrierung: spricht das CAL-Kommando des WebSerial-Konfig-Protokolls über
 * /api/device-calibration/* an (server/deviceConfigClient.js). Live-Werte kommen per
 * Socket.IO-Event "calibration-live" (s. server/index.js). Bestimmt, wie die Firmware rohe
 * Sensorwerte interpretiert -- unabhängig von der (rein ControlHub-internen) mappingEngine-Kalibrierung.
 *
 * Reine Hardware-Kalibrierung (Min/Max/Deadzone am physischen Sensor) -- WELCHER Gamepad-Ausgabe-
 * Platz eine Achse bekommt, ist eine eigene Seite (Funktionsbelegung → Achsen-Zuordnung, s.
 * public/js/axisAssignment.js). Beide Seiten drehen sich um dieselben physischen Achsen, sind aber
 * bewusst getrennt: Kalibrierung ist Hardware/Ergonomie, Zuordnung ist Belegung/Fahrzeug-Logik.
 *
 * Trägt trotzdem den Pro-Profil/Global-Umschalter für die Achsen-Zuordnung (renderModeToggle()) --
 * der sitzt hier statt auf der Zuordnungs-Seite selbst, weil diese vom aktuellen Profil beeinflusst
 * wird und der Umschalter sonst auf der Seite säße, die er selbst verändert.
 *
 * Seit dem Einrichtungs-Assistenten (23.10.2026, einrichtung.js): oben eine Anleitung in der Reihenfolge, die die
 * Firmware erwartet (CAL <gruppe> misst beim Start die Mitte → vorher loslassen), je Achse ✓ kalibriert / offen aus
 * GETALL caldone= (/api/einrichtung/kalibrierung, nach jedem Speichern neu gelesen) und nur die Achsen der gewählten
 * Module -- die übrigen hinter „Weitere Achsen zeigen“.
 */

// Was während der Kalibrierung zu tun ist (Mitte ist beim Start schon gemessen)
const AXIS_CALIBRATION_HOWTO = {
  thumb: 'Den Stick ein paar Mal im Kreis bis an den Rand führen, dann loslassen und „Speichern“.',
  lever: 'Den Hebel bis an beide Anschläge bewegen, dann zurück in die Ausgangsstellung und „Speichern“.',
  finger: 'Den Fingertip bis an beide Anschläge drücken, dann loslassen und „Speichern“.',
  poti: 'Das Poti-Rad einmal ganz nach links und ganz nach rechts drehen, dann „Speichern“.',
  // Schubhebel ohne Federrückstellung: die Mitte wird in einem eigenen Schritt festgelegt (24.10.2026, FW 2.14)
  schub: 'Den Schubhebel bis an beide Anschläge bewegen, dann „Weiter: Mitte festlegen“.',
  schubMitte: 'Jetzt den Schubhebel in die Mittelstellung (Nullpunkt) stellen und „Mitte festlegen und speichern“ drücken.'
};
const axisCalibrationHowto = group => AXIS_CALIBRATION_HOWTO[group.startsWith('thumb') ? 'thumb' : group.startsWith('lever') ? 'lever' : group.startsWith('finger') ? 'finger' : 'poti'];

const AXIS_CALIBRATION_GROUPS = [
  { group: 'thumb', label: 'CraftSlot 1 – Thumbstick', keys: ['thumbX', 'thumbY'] },
  { group: 'leverA', label: 'CraftSlot 1 – Hebel vor/zurück', keys: ['leverA'] },
  { group: 'leverB', label: 'CraftSlot 1 – Hebel links/rechts', keys: ['leverB'] },
  { group: 'thumb2', label: 'CraftSlot 2 – Thumbstick', keys: ['thumb2X', 'thumb2Y'] },
  { group: 'leverA2', label: 'CraftSlot 2 – Hebel vor/zurück', keys: ['leverA2'] },
  { group: 'leverB2', label: 'CraftSlot 2 – Hebel links/rechts', keys: ['leverB2'] },
  { group: 'finger1', label: 'Fingertip 1', keys: ['finger1'] },
  { group: 'finger2', label: 'Fingertip 2', keys: ['finger2'] },
  { group: 'finger3', label: 'Fingertip 3', keys: ['finger3'] },
  { group: 'finger4', label: 'Fingertip 4', keys: ['finger4'] },
  { group: 'poti', label: 'Poti-Rad', keys: ['poti'] }
];

class AxisCalibration {
  constructor() {
    this.body = document.getElementById('axis-calibration-body');
    this.activeGroup = null;
    this.liveValues = {}; // key -> { current, lo, hi }
    // Geltungsbereich der Achsen-Zuordnung (Funktionsbelegung -> Achsen-Zuordnung, s. axisAssignment.js)
    // sitzt bewusst HIER statt auf der Zuordnungs-Seite selbst, da diese vom aktuellen Profil
    // beeinflusst wird und der Umschalter sonst auf der Seite säße, die er selbst verändert.
    this.mode = 'profile';
    this.stand = null;      // [{ group, label, noetig, fertig, schubhebel? }] aus caldone, null = unbekannt (dann alle Achsen zeigen)
    this.mittePhase = false;   // Schubhebel: Anschläge erfasst, jetzt die Mitte
    this.weitere = false;   // Achsen nicht gewählter Module aufgeklappt
    this.socket = window.hubSocket;   // gemeinsame Verbindung der Seite (hubSocket.js, B4)
    this.socket.on('calibration-live', (data) => this.onLiveUpdate(data));
    document.addEventListener('tabchanged', e => { if (e.detail?.tabName === 'axis-calibration') this.loadStand(); });
    document.addEventListener('controllerinfo', () => { if (document.getElementById('tab-axis-calibration')?.classList.contains('active')) this.loadStand(); });
    this.loadMode();
  }

  // Kalibrier-Stand frisch aus dem Gerät; der Einrichtungs-Assistent hört mit ('kalibrierung-stand')
  async loadStand() {
    try {
      const d = await (await fetch('/api/einrichtung/kalibrierung')).json();
      if (d.success) this.stand = d.kalibrierung;
    } catch { /* bleibt beim letzten Stand */ }
    document.dispatchEvent(new CustomEvent('kalibrierung-stand', { detail: this.stand }));
    if (!this.activeGroup) this.render();
  }
  standFuer(group) { return this.stand?.find(x => x.group === group) || null; }
  toggleWeitere() { this.weitere = !this.weitere; this.render(); }

  groupLabel(group) {
    const g = AXIS_CALIBRATION_GROUPS.find(x => x.group === group);
    return g ? g.label : group;
  }

  percentFor(v) {
    const span = (v.hi - v.lo) || 1;
    return Math.max(0, Math.min(100, ((v.current - v.lo) / span) * 100));
  }

  async loadMode() {
    try {
      const res = await fetch('/api/axis-assignment-mode');
      const data = await res.json();
      this.mode = data.mode || 'profile';
    } catch (error) {
      console.error('Geltungsbereich der Achsen-Zuordnung konnte nicht geladen werden:', error);
    }
    this.render();
  }

  async setMode(mode) {
    if (mode === this.mode) return;
    try {
      const res = await fetch('/api/axis-assignment-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
      const result = await res.json();
      if (!result.success) {
        uiAlert('Umschalten fehlgeschlagen: ' + result.error);
        this.render(); // Auswahlknopf wieder auf den tatsächlichen Modus zurücksetzen
        return;
      }
      this.mode = mode;
      window.showToast(mode === 'global' ? 'Achsen-Zuordnung ist jetzt global' : 'Achsen-Zuordnung ist jetzt pro Profil');
      this.render();
      // Achsen-Zuordnung (axisAssignment.js) hat den Modus beim Laden zwischengespeichert -- ohne Neuladen
      // zeigte sie bis zum nächsten Seitenaufruf weiter den alten Modus
      await window.axisAssignment?.loadData();
    } catch (error) {
      uiAlert('Umschalten fehlgeschlagen: ' + error.message);
      this.render();
    }
  }

  renderModeToggle() {
    return `
      <div class="mapping-card" style="margin-bottom: 12px;">
        <strong>Achsen-Zuordnung: Geltungsbereich</strong>
        <div style="display: flex; gap: 16px; margin-top: 8px;">
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="radio" name="axis-assignment-mode" value="profile" ${this.mode === 'profile' ? 'checked' : ''}
                   onchange="window.axisCalibration.setMode('profile')">
            Pro Profil
          </label>
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="radio" name="axis-assignment-mode" value="global" ${this.mode === 'global' ? 'checked' : ''}
                   onchange="window.axisCalibration.setMode('global')">
            Global (für alle Profile gleich)
          </label>
        </div>
        <p style="color: var(--text-dim); font-size: 0.85rem; margin-top: 8px;">
          Gilt für die Achsen-Zuordnung unter Funktionsbelegung → Achsen-Zuordnung. "Pro Profil" lässt
          jedes Fahrzeug eine eigene Zuordnung haben. "Global" nutzt für alle Profile dieselbe. Beim
          Umschalten geht nichts verloren – eine bestehende Pro-Profil-Zuordnung bleibt einfach
          ungenutzt liegen, bis wieder zurückgeschaltet wird.
        </p>
      </div>`;
  }

  render() {
    const noetig = g => this.standFuer(g.group)?.noetig !== false || g.group === this.activeGroup;
    const haupt = AXIS_CALIBRATION_GROUPS.filter(noetig);
    const rest = AXIS_CALIBRATION_GROUPS.filter(g => !noetig(g));
    const offen = haupt.filter(g => this.standFuer(g.group)?.fertig === false).length;
    const bekannt = haupt.some(g => typeof this.standFuer(g.group)?.fertig === 'boolean');
    const anleitung = `
      <div class="mapping-card kal-anleitung">
        <strong>So geht's</strong>
        <ol>
          <li>Achse <b>loslassen</b> und „Kalibrieren“ drücken – dabei misst ControlHub die Mitte.</li>
          <li>Die Achse bis an alle Anschläge bewegen.</li>
          <li>Wieder loslassen und „Speichern“.</li>
        </ol>
        ${haupt.some(g => this.standFuer(g.group)?.schubhebel) ? '<p>Beim <b>Schubhebel</b> kommt nach den Anschlägen ein eigener Schritt: Hebel in die Mittelstellung stellen und „Mitte festlegen“.</p>' : ''}
        <p>${bekannt ? (offen ? `Noch offen: ${offen} von ${haupt.length} Achsen.` : '✓ Alle Achsen deiner Module sind kalibriert (ab Werk). Neu kalibrieren nur, wenn eine Achse in Ruhe nicht in der Mitte steht oder nicht bis zum Anschlag reicht.')
          : 'Ob eine Achse schon kalibriert ist, zeigt ControlHub, sobald die CraftConsole verbunden ist.'}</p>
      </div>`;
    const weitere = rest.length ? `
      <button type="button" class="btn-secondary btn-small kal-weitere" onclick="window.axisCalibration.toggleWeitere()">${this.weitere ? 'Weitere Achsen ausblenden' : `Weitere Achsen zeigen (${rest.length}, nicht gewählte Module)`}</button>
      ${this.weitere ? rest.map(g => this.renderGroup(g)).join('') : ''}` : '';
    this.body.innerHTML = anleitung + haupt.map(g => this.renderGroup(g)).join('') + weitere + this.renderModeToggle();
  }

  badge(group) {
    const f = this.standFuer(group)?.fertig;
    return f === true ? '<span class="kal-badge ok">✓ kalibriert</span>' : f === false ? '<span class="kal-badge offen">offen</span>' : '';
  }

  renderGroup(g) {
    if (this.activeGroup !== g.group) {
      return `
        <div class="mapping-card">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong>${g.label}${this.standFuer(g.group)?.schubhebel ? ' · Schubhebel' : ''} ${this.badge(g.group)}</strong>
            <button class="btn-primary btn-small" onclick="window.axisCalibration.start('${g.group}')" ${this.activeGroup ? 'disabled' : ''}>Kalibrieren</button>
          </div>
        </div>`;
    }

    const schub = !!this.standFuer(g.group)?.schubhebel;
    const barsHtml = g.keys.map(key => {
      const v = this.liveValues[key] || { current: 0, lo: 0, hi: 0 };
      const pct = this.percentFor(v);
      return `
        <div style="margin-top: 10px;">
          <label style="color: var(--text-dim); font-size: 0.85rem;">${(typeof KEY_LABELS !== 'undefined' && KEY_LABELS[key]) || key}</label>
          <div class="axis-bar">
            <div id="axis-bar-fill-${key}" class="axis-bar-fill" style="width: ${pct}%;"></div>
            <div class="axis-bar-center"></div>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="mapping-card">
        <strong>${g.label}${schub ? ' · Schubhebel' : ''}</strong>
        <p style="color: var(--text-dim); font-size: 0.85rem; margin-top: 4px;">${schub ? AXIS_CALIBRATION_HOWTO[this.mittePhase ? 'schubMitte' : 'schub'] : axisCalibrationHowto(g.group)}</p>
        ${barsHtml}
        <div class="button-group" style="margin-top: 12px;">
          ${!schub ? '<button class="btn-success btn-small" onclick="window.axisCalibration.stop()">Speichern</button>'
            : this.mittePhase ? '<button class="btn-success btn-small" onclick="window.axisCalibration.mitteSpeichern()">Mitte festlegen und speichern</button>'
            : '<button class="btn-success btn-small" onclick="window.axisCalibration.weiterZurMitte()">Weiter: Mitte festlegen</button>'}
          <button class="btn-secondary btn-small" onclick="window.axisCalibration.abort()">Abbrechen</button>
        </div>
      </div>`;
  }

  // Live-Updates kommen ~8x/s -- ein voller innerHTML-Neuaufbau bei jedem Update tauscht dabei auch
  // den Speichern-Button laufend aus (Klicks landen dann oft mitten im Austausch und gehen verloren).
  // Deshalb nur die Balkenbreite direkt aktualisieren; nur beim allerersten Wert einer Achse (Element
  // existiert noch nicht) einmalig neu rendern, damit der Balken überhaupt entsteht.
  onLiveUpdate(data) {
    if (!this.activeGroup) return;
    this.liveValues[data.key] = data;
    const fill = document.getElementById(`axis-bar-fill-${data.key}`);
    if (fill) {
      fill.style.width = `${this.percentFor(data)}%`;
    } else {
      this.render();
    }
  }

  async start(group) {
    if (this.activeGroup) return;
    this.activeGroup = group;
    this.mittePhase = false;
    this.liveValues = {};
    this.render();
    try {
      const res = await fetch(`/api/device-calibration/${group}/start`, { method: 'POST' });
      const result = await res.json();
      if (!result.success) {
        uiAlert('Kalibrierung konnte nicht gestartet werden: ' + result.error);
        this.activeGroup = null;
        this.render();
      }
    } catch (error) {
      uiAlert('Kalibrierung konnte nicht gestartet werden: ' + error.message);
      this.activeGroup = null;
      this.render();
    }
  }

  weiterZurMitte() { this.mittePhase = true; this.render(); }

  // Schubhebel: Mitte an der aktuellen Stellung festlegen, dann wie „Speichern“
  async mitteSpeichern() {
    try {
      const result = await (await fetch(`/api/device-calibration/mitte/${this.activeGroup}`, { method: 'POST' })).json();
      if (!result.success) { uiAlert(`Mitte konnte nicht festgelegt werden (${result.error}). Dafür braucht die Armlehne Firmware 2.14.`); return; }
    } catch (error) {
      uiAlert('Mitte konnte nicht festgelegt werden: ' + error.message);
      return;
    }
    await this.stop();
  }

  async stop() {
    const label = this.groupLabel(this.activeGroup);
    this.mittePhase = false;
    try {
      const res = await fetch('/api/device-calibration/stop', { method: 'POST' });
      const result = await res.json();
      if (result.success) window.showToast(`${label} kalibriert`);
      else uiAlert('Speichern fehlgeschlagen: ' + result.error);
    } catch (error) {
      uiAlert('Speichern fehlgeschlagen: ' + error.message);
    }
    this.activeGroup = null;
    this.liveValues = {};
    this.render();
    await this.loadStand();   // ✓ für die eben kalibrierte Achse (caldone)
  }

  async abort() {
    this.mittePhase = false;
    try {
      await fetch('/api/device-calibration/abort', { method: 'POST' });
    } catch (error) {
      // Abbrechen soll auch ohne Geräteantwort möglich sein
    }
    this.activeGroup = null;
    this.liveValues = {};
    this.render();
  }

  async centerAll() {
    try {
      const res = await fetch('/api/device-calibration/center', { method: 'POST' });
      const result = await res.json();
      if (result.success) window.showToast('Alle Achsen zentriert');
      else uiAlert('Fehlgeschlagen: ' + result.error);
    } catch (error) {
      uiAlert('Fehlgeschlagen: ' + error.message);
    }
  }

  factoryReset() {
    window.confirmDialog.show(
      'Wirklich ALLE Einstellungen auf Werkszustand zurücksetzen? Das setzt nicht nur die Kalibrierung zurück, sondern auch Armlehnen-Version, Grifftyp, Zündschloss-Modus und alle weiteren Einstellungen.',
      async () => {
        try {
          const res = await fetch('/api/device-calibration/reset', { method: 'POST' });
          const result = await res.json();
          if (result.success) window.showToast('Werkseinstellung wiederhergestellt');
          else uiAlert('Fehlgeschlagen: ' + result.error);
        } catch (error) {
          uiAlert('Fehlgeschlagen: ' + error.message);
        }
      },
      { danger: true }
    );
  }
}

window.axisCalibration = new AxisCalibration();
