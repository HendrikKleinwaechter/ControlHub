/**
 * "Sichern & Teilen"-Tab (Phase D, 21.08.2026): kombinierter Export/Import über mehrere Bereiche
 * (Funktionen/Profile/Bedienpanel-Seiten) in einer Datei, mit granularer Auswahl und einer
 * Konfliktprüfung vor dem eigentlichen Import (s. server/backupManager.js für die Serverseite).
 *
 * Ergänzt die vier bestehenden Einzel-Export-Buttons (Profile/Funktionen/Makros/je-eine-Bedienpanel-
 * Seite), ersetzt sie nicht -- die bleiben für schnelle Einzel-Exporte.
 */

class BackupManagerUI {
  constructor() {
    this.functionsListEl = document.getElementById('backup-functions-list');
    this.profilesListEl = document.getElementById('backup-profiles-list');
    this.pagesListEl = document.getElementById('backup-pages-list');
    this.importModal = document.getElementById('backup-import-modal');
    this.importBody = document.getElementById('backup-import-body');

    document.getElementById('backup-export').addEventListener('click', () => this.exportSelection());
    document.getElementById('backup-import').addEventListener('click', () => this.pickImportFile());

    document.addEventListener('tabchanged', e => {
      if (e.detail.tabName === 'backup') this.load();
    });

    this.pendingBundle = null; // aus der Import-Datei gelesen, wartet auf Modus-Wahl + Bestätigung
  }

  async load() {
    try {
      const [functionsRes, profilesRes, pagesRes] = await Promise.all([
        fetch('/api/functions').then(r => r.json()),
        fetch('/api/profiles').then(r => r.json()),
        fetch('/api/steuerungsmenues').then(r => r.json())
      ]);
      this.renderFunctions(functionsRes.functions || []);
      this.renderProfiles(profilesRes.profiles || []);
      this.renderPages(pagesRes.pages || []);
    } catch (error) {
      console.error('Sichern & Teilen: Laden fehlgeschlagen', error);
    }
  }

  renderFunctions(functions) {
    const sorted = [...functions].sort((a, b) => a.name.localeCompare(b.name));
    this.functionsListEl.innerHTML = sorted.map(f => `
      <label>
        <input type="checkbox" class="backup-check-functions" value="${escapeHtml(f.id)}">
        ${escapeHtml(f.name)}${f.categories?.length ? ` <span style="color: var(--text-dim);">(${escapeHtml(f.categories.join(', '))})</span>` : ''}
      </label>`).join('') || '<p style="color: var(--text-dim);">Keine Funktionen vorhanden.</p>';
  }

  renderProfiles(profiles) {
    this.profilesListEl.innerHTML = profiles.map(p => `
      <label>
        <input type="checkbox" class="backup-check-profiles" value="${escapeHtml(p.name)}">
        ${escapeHtml(profilAnzeige(p.name))}
      </label>`).join('') || '<p style="color: var(--text-dim);">Keine Profile vorhanden.</p>';
  }

  renderPages(pages) {
    this.pagesListEl.innerHTML = pages.map(p => `
      <label>
        <input type="checkbox" class="backup-check-pages" value="${escapeHtml(p.id)}">
        ${escapeHtml(profilAnzeige(p.name))}
      </label>`).join('') || '<p style="color: var(--text-dim);">Keine eigenen Kacheln vorhanden.</p>';
  }

  selectAll(section) {
    document.querySelectorAll(`.backup-check-${section}`).forEach(cb => cb.checked = true);
  }

  selectNone(section) {
    document.querySelectorAll(`.backup-check-${section}`).forEach(cb => cb.checked = false);
  }

  getChecked(section) {
    return Array.from(document.querySelectorAll(`.backup-check-${section}:checked`)).map(cb => cb.value);
  }

  async exportSelection() {
    const functionIds = this.getChecked('functions');
    const profileNames = this.getChecked('profiles');
    const pageIds = this.getChecked('pages');

    if (!functionIds.length && !profileNames.length && !pageIds.length) {
      uiAlert('Bitte mindestens einen Eintrag auswählen.');
      return;
    }

    try {
      const response = await fetch('/api/backup/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ functionIds, profileNames, pageIds })
      });
      const result = await response.json();
      if (!result.success) { uiAlert('Export fehlgeschlagen: ' + result.error); return; }

      downloadJson(result.data, `ControlHub-Sicherung ${new Date().toISOString().split('T')[0]}`);
      window.showToast?.('Sicherung exportiert (Ordner Downloads)');
    } catch (error) {
      uiAlert('Export fehlgeschlagen: ' + error.message);
    }
  }

  async pickImportFile() {
    try {
      const data = await pickJsonFile();   // js/basis.js
      if (data) await this.openImport(data);
    } catch (error) {
      uiAlert('Datei konnte nicht gelesen werden: ' + error.message);
    }
  }

  async openImport(data) {
    this.pendingBundle = data;
    this.importBody.innerHTML = '<p style="color: var(--text-dim);">Prüfe auf Konflikte …</p>';
    this.importModal.style.display = 'flex';

    let report = { missingFunctions: [], nameConflicts: [] };
    try {
      const response = await fetch('/api/backup/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data })
      });
      const result = await response.json();
      if (result.success) report = result;
    } catch (error) {
      // Konfliktprüfung fehlgeschlagen -- Import trotzdem anbieten, nur ohne Bericht.
    }

    const parts = [];
    const included = [];
    if (data.functions?.ids?.length) included.push(`${data.functions.ids.length} Funktion(en)`);
    if (data.profiles?.names?.length) included.push(`${data.profiles.names.length} Profil(e)`);
    if (data.steuerungsmenuePages?.ids?.length) included.push(`${data.steuerungsmenuePages.ids.length} ${data.steuerungsmenuePages.ids.length === 1 ? 'eigene Kachel' : 'eigene Kacheln'}`);
    parts.push(`<p>Enthält: ${included.join(', ') || 'nichts Bekanntes'}.</p>`);

    if (report.missingFunctions.length) {
      parts.push('<p style="color: var(--danger, #e05d5d);"><b>Fehlende Funktionen:</b></p><ul class="backup-conflict-list">');
      for (const m of report.missingFunctions) {
        parts.push(`<li>Profil "${escapeHtml(m.profile)}" verweist auf ${m.missing.length} unbekannte Funktion(en): ${escapeHtml(m.missing.join(', '))}</li>`);
      }
      parts.push('</ul>');
    }
    if (report.nameConflicts.length) {
      parts.push('<p style="color: var(--warning, #d9a441);"><b>Gleicher Name, andere Funktion:</b></p><ul class="backup-conflict-list">');
      for (const c of report.nameConflicts) {
        parts.push(`<li>"${escapeHtml(c.name)}" existiert bereits mit anderer Belegung (vorhanden: ${escapeHtml(c.existingId)}, importiert: ${escapeHtml(c.incomingId)})</li>`);
      }
      parts.push('</ul>');
    }
    if (!report.missingFunctions.length && !report.nameConflicts.length) {
      parts.push('<p style="color: var(--success, #5cb85c);">Keine Konflikte gefunden.</p>');
    }

    if (data.functions?.data) {
      parts.push(`
        <div class="form-group">
          <label>Funktionen-Modus</label>
          <select id="backup-import-mode-functions">
            <option value="merge">Übernehmen (bestehende gleicher ID überschreiben, neue hinzufügen)</option>
            <option value="replace">Ersetzen (alle bisherigen Funktionen löschen)</option>
          </select>
        </div>`);
    }
    if (data.profiles?.data) {
      parts.push(`
        <div class="form-group">
          <label>Profile-Modus</label>
          <select id="backup-import-mode-profiles">
            <option value="merge">Übernehmen (bestehende gleichen Namens überschreiben, neue hinzufügen)</option>
            <option value="replace">Ersetzen (alle bisherigen Profile außer dem Gamepad-Modus löschen)</option>
            <option value="add-missing">Nur neue hinzufügen (bestehende unverändert lassen)</option>
          </select>
        </div>`);
    }
    if (data.steuerungsmenuePages?.data) {
      parts.push('<p style="color: var(--text-dim); font-size: 0.85rem;">Eigene Kacheln werden immer neu hinzugefügt (bei gleichem Namen automatisch umbenannt).</p>');
    }

    this.importBody.innerHTML = parts.join('');
  }

  async confirmImport() {
    if (!this.pendingBundle) { this.closeImport(); return; }
    const modes = {};
    const fnMode = document.getElementById('backup-import-mode-functions');
    const profMode = document.getElementById('backup-import-mode-profiles');
    if (fnMode) modes.functions = fnMode.value;
    if (profMode) modes.profiles = profMode.value;

    try {
      const response = await fetch('/api/backup/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: this.pendingBundle, modes })
      });
      const result = await response.json();
      if (!result.success) { uiAlert('Import fehlgeschlagen: ' + result.error); return; }

      window.showToast?.('Sicherung importiert');
      this.closeImport();
      this.load();
      if (window.app?.loadProfiles) window.app.loadProfiles();
      if (window.app?.loadFunctions) window.app.loadFunctions();
    } catch (error) {
      uiAlert('Import fehlgeschlagen: ' + error.message);
    }
  }

  closeImport() {
    this.importModal.style.display = 'none';
    this.pendingBundle = null;
  }
}

window.backupManagerUI = new BackupManagerUI();
