/**
 * "Fahrzeug zuordnen" -- Zuordnung von Fahrzeugen/Anbaugeräten zum aktuell AKTIVEN Profil für den
 * automatischen Profilwechsel (s. server/autoSwitchManager.js). Obere Liste zeigt live, was gerade im
 * Spiel aktiv ist (aus dem ohnehin fließenden 'telemetry-update'-Socket-Event -- telemetry.js nutzt es
 * schon fürs Dashboard, ein zweiter Listener stört nicht), untere Liste zeigt/verwaltet
 * profile.autoSwitchTriggers (seit 23.10.2026 gezielt über POST /api/profile/patch, s. app.js profilAendern()).
 *
 * Wirkt wie Umbenennen/Duplizieren/Löschen auf der Profil-Seite auf das aktuell AKTIVE Profil
 * (etabliertes Muster dort, s. app.js renameProfile()) -- erst ein Profil per Klick aktivieren, dann
 * zuordnen.
 */
class VehicleAssignmentModal {
  constructor() {
    this.modal = document.getElementById('vehicle-assignment-modal');
    this.profileNameEl = document.getElementById('vehicle-assignment-profile-name');
    this.currentListEl = document.getElementById('vehicle-assignment-current-list');
    this.triggersListEl = document.getElementById('vehicle-assignment-triggers-list');
    this.lastTelemetry = null;

    // window.hubSocket statt window.app.socket (gemeinsame Verbindung, B4) -- diese Klasse wird beim Laden der Seite
    // SOFORT instanziiert (s. Dateiende), window.app entsteht aber erst in app.js' eigenem
    // DOMContentLoaded-Handler, also SPÄTER als jedes normale <script>-Tag durchläuft. Gleiches Muster
    // wie telemetry.js TelemetryDashboard (seit 23.10.2026 die gemeinsame Verbindung window.hubSocket) -- mehrere Socket.IO-Verbindungen
    // von derselben Seite sind unproblematisch, io.emit() auf dem Server erreicht ohnehin alle.
    this.socket = window.hubSocket;   // gemeinsame Verbindung der Seite (hubSocket.js, B4)
    this.socket.on('telemetry-update', (data) => {
      this.lastTelemetry = data;
      if (this.modal.style.display !== 'none') this.renderCurrentList();
    });
  }

  // name: Profil aus dem „⋯“ der Profil-Liste (Durchsicht B10, 24.10.2026); ohne Angabe das aktive
  open(name = window.app.currentProfile) {
    if (!name) {
      uiAlert('Kein Profil aktiv');
      return;
    }
    if (profilGeschuetzt(name)) return gamepadModusHinweis();
    this.profileName = name;
    this.profileNameEl.textContent = profilAnzeige(name);
    this.modal.style.display = 'flex';
    this.currentListHtml = null;   // beim Öffnen immer frisch zeichnen
    this.renderCurrentList();
    this.renderTriggersList();
  }

  close() {
    this.modal.style.display = 'none';
  }

  getCurrentProfileData() {
    return window.app.allProfiles?.find(p => p.name === (this.profileName || window.app.currentProfile)) || null;
  }

  // Obere Liste: was gerade im Spiel aktiv ist (aus lastTelemetry) -- ohne aktive Telemetrie bzw.
  // außerhalb eines Fahrzeugs ein Platzhaltertext statt einer leeren Liste.
  renderCurrentList() {
    const data = this.lastTelemetry;
    const profile = this.getCurrentProfileData();
    const triggers = profile?.autoSwitchTriggers || [];
    const hasVehicle = data?.available && data?.inVehicle && (data.vehicleName || (data.implementNames || []).length > 0);
    if (!hasVehicle) {
      this.setCurrentList('<p class="sm-param-empty-hint">Kein Fahrzeug erkannt – bitte im Spiel in ein Fahrzeug einsteigen.</p>');
      return;
    }

    const entries = [];
    if (data.vehicleName) entries.push({ name: data.vehicleName, kind: 'Fahrzeug' });
    for (const imp of (data.implementNames || [])) entries.push({ name: imp, kind: 'Anbaugerät' });

    this.setCurrentList(entries.map(e => `
      <div class="profile-row" style="cursor:default;">
        <div class="profile-row-name">${escapeHtml(e.name)} <span style="color:var(--text-dim); font-size:0.85rem;">(${e.kind})</span></div>
        ${triggers.includes(e.name)
          ? '<span style="color:var(--text-dim); font-size:0.85rem;">bereits zugeordnet</span>'
          : `<button type="button" class="btn-secondary btn-small" data-add-trigger="${escapeHtml(e.name)}">+ Hinzufügen</button>`}
      </div>
    `).join(''));
  }

  // Nur neu zeichnen, wenn sich die Liste wirklich ändert (Fehler F1, Test 23.10.2026): renderCurrentList() läuft bei
  // jedem Spieldaten-Takt (bis 25/s) -- vorher wurde die Liste jedes Mal neu gebaut, der Knopf unter der Maus ständig
  // ersetzt (Flackern) und „+ Hinzufügen“ kam nie an.
  setCurrentList(html) {
    if (html === this.currentListHtml) return;
    this.currentListHtml = html;
    this.currentListEl.innerHTML = html;
    // data-Attribut statt Name direkt in ein onclick-Attribut zu interpolieren -- Fahrzeug-/Gerätenamen
    // kommen aus dem Spiel (nicht von uns kontrolliert) und könnten theoretisch ein Anführungszeichen
    // enthalten, das eine Inline-onclick-Zeichenkette bräche. escapeHtml() oben + dataset-Zugriff hier
    // umgeht das sauber (der Browser dekodiert HTML-Entities beim Lesen von dataset automatisch).
    this.currentListEl.querySelectorAll('[data-add-trigger]').forEach(btn => {
      btn.addEventListener('click', () => this.addTrigger(btn.dataset.addTrigger));
    });
  }

  // Untere Liste: profile.autoSwitchTriggers.
  renderTriggersList() {
    const profile = this.getCurrentProfileData();
    const triggers = profile?.autoSwitchTriggers || [];
    if (triggers.length === 0) {
      this.triggersListEl.innerHTML = '<p class="sm-param-empty-hint">Noch keine Zuordnung – oben aus der Liste hinzufügen.</p>';
      return;
    }
    this.triggersListEl.innerHTML = triggers.map(name => `
      <div class="profile-row" style="cursor:default;">
        <div class="profile-row-name">${escapeHtml(name)}</div>
        <button type="button" class="btn-danger btn-small" data-remove-trigger="${escapeHtml(name)}">Entfernen</button>
      </div>
    `).join('');
    this.triggersListEl.querySelectorAll('[data-remove-trigger]').forEach(btn => {
      btn.addEventListener('click', () => this.removeTrigger(btn.dataset.removeTrigger));
    });
  }

  async addTrigger(name) {
    const profile = this.getCurrentProfileData();
    if (!profile) return;
    const triggers = new Set(profile.autoSwitchTriggers || []);
    triggers.add(name);
    await this.save(profile.name, [...triggers]);
  }

  removeTrigger(name) {
    window.confirmDialog.show(`"${name}" wirklich aus der automatischen Zuordnung entfernen?`, async () => {
      const profile = this.getCurrentProfileData();
      if (!profile) return;
      const triggers = (profile.autoSwitchTriggers || []).filter(t => t !== name);
      await this.save(profile.name, triggers);
    });
  }

  // Nur die Fahrzeug-Zuordnung des Profils ändern (B3) -- vorher wurde das ganze Profil aus der eigenen Kopie
  // zurückgeschrieben und konnte so z. B. eine eben geänderte Achse überschreiben
  async save(profileName, triggers) {
    try {
      await profilAendern(profileName, [{ pfad: ['autoSwitchTriggers'], wert: triggers }]);
      await window.app.loadProfiles();
      this.renderCurrentList();
      this.renderTriggersList();
    } catch (error) {
      uiAlert('Speichern fehlgeschlagen: ' + error.message);
    }
  }
}

window.vehicleAssignmentModal = new VehicleAssignmentModal();

/**
 * Meldungen für den automatischen Profilwechsel bei Konflikten (mehrere gleichzeitig angehängte
 * Geräte/Fahrzeuge mit unterschiedlichen Profilen, s. server/autoSwitchManager.js resolve()) -- eigene
 * kleine Komponente statt showToast() (moduleFlow.js) zu erweitern, die an vielen Stellen für einfache
 * Text-Hinweise OHNE Klick-Aktion verwendet wird; hier werden aber Buttons gebraucht.
 *
 * 'auto-switch-applied' -- automatisch anhand einer gemerkten Präferenz gewechselt: dezente Meldung,
 * schließt sich nach 5s selbst, per Klick öffnet sie dieselbe Auswahl wie beim ersten Mal zum Ändern
 * (candidates kommt dafür schon vom Server mit, s. autoSwitchManager.resolve()).
 * 'auto-switch-prompt' -- echter Konflikt ohne gemerkte Präferenz: Meldung mit einem Button je
 * Profil-Kandidat + "Immer fragen", KEIN Auto-Timeout (bleibt bis Klick oder bis eine neue Meldung für
 * eine ANDERE Kombination sie ersetzt).
 */
class AutoSwitchNotifier {
  constructor() {
    this.container = document.getElementById('auto-switch-notice-container');
    // window.hubSocket -- gleicher Grund wie bei VehicleAssignmentModal oben (window.app
    // existiert zum Zeitpunkt dieser Instanziierung noch nicht).
    this.socket = window.hubSocket;   // gemeinsame Verbindung der Seite (hubSocket.js, B4)
    this.socket.on('auto-switch-applied', (data) => this.showApplied(data));
    this.socket.on('auto-switch-prompt', (data) => this.showPrompt(data));
  }

  clear() {
    this.container.innerHTML = '';
  }

  comboLabel(data) {
    return [data.vehicleName, ...(data.implementNames || [])].filter(Boolean).join(' + ');
  }

  showApplied(data) {
    this.clear();
    const el = document.createElement('div');
    el.className = 'auto-switch-notice auto-switch-notice-applied';
    el.title = 'Klicken zum Ändern';
    el.innerHTML = `<div class="auto-switch-notice-message">Profil auf "${escapeHtml(profilAnzeige(data.profileName))}" gewechselt (${escapeHtml(this.comboLabel(data))})</div>`;
    el.addEventListener('click', () => this.showPrompt(data));
    this.container.appendChild(el);
    setTimeout(() => { if (el.parentElement) el.remove(); }, 5000);
  }

  showPrompt(data) {
    this.clear();
    const el = document.createElement('div');
    el.className = 'auto-switch-notice';
    el.innerHTML = `
      <div class="auto-switch-notice-message">Mehrdeutige Zuordnung: ${escapeHtml(this.comboLabel(data))}. Welches Profil?</div>
      <div class="auto-switch-notice-buttons">
        ${data.candidates.map(name => `<button type="button" class="btn-secondary btn-small" data-choose-profile="${escapeHtml(name)}">${escapeHtml(profilAnzeige(name))}</button>`).join('')}
        <button type="button" class="btn-secondary btn-small" data-choose-profile="">Immer fragen</button>
      </div>
    `;
    el.querySelectorAll('[data-choose-profile]').forEach(btn => {
      btn.addEventListener('click', () => {
        const profileName = btn.dataset.chooseProfile || null;
        this.socket.emit('auto-switch-resolve', { comboKey: data.comboKey, profileName });
        this.clear();
      });
    });
    this.container.appendChild(el);
  }
}

window.autoSwitchNotifier = new AutoSwitchNotifier();
