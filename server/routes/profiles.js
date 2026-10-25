/**
 * Routen: Profile (anlegen, umbenennen, duplizieren, wechseln, Import/Export) und Auto-Profilwechsel
 * Ausgelagert aus server/index.js (setupExpress) am 21.10.2026 -- Inhalt unverändert, nur `this` -> `server`.
 * @param {import('express').Express} app
 * @param {object} server  ControllerServer-Instanz (Manager, io, Hilfsmethoden)
 */

import { ladeBeispielprofile, fuegeBeispielprofileHinzu } from '../beispielprofile.js';
import { GAMEPAD_MODUS, SCHREIBGESCHUETZT } from '../profileManager.js';
import { zuordnungAendern } from '../autoSwitchManager.js';

export function registerProfilesRoutes(app, server) {
  app.get('/api/profiles', (req, res) => {
    const profiles = server.profileManager.getAllProfiles();
    res.json({ success: true, profiles, current: server.profileManager.currentProfileName });
  });

  app.post('/api/profile/switch', (req, res) => {
    const { name } = req.body;
    const success = server.profileManager.switchProfile(name);
    if (success) {
      server.mappingEngine.loadProfile(server.profileManager.getCurrentProfile());
      server.io.emit('profileChanged', { name });
    }
    res.json({ success });
  });

  app.post('/api/profile/save', async (req, res) => {
    try {
      const { name, profile } = req.body || {};
      if (typeof name !== 'string' || !name.trim() || !profile || typeof profile !== 'object' || Array.isArray(profile)) {
        return res.status(400).json({ success: false, error: 'Ungültiges Profil' });
      }
      if (name === GAMEPAD_MODUS) return res.status(403).json({ success: false, error: SCHREIBGESCHUETZT });
      await server.profileManager.setProfile(name, profile);
      // Läuft die Mapping-Engine gerade mit GENAU diesem Profil, muss sie die neuen Daten sofort
      // übernehmen -- sonst wirkt eine Änderung (z.B. Achsen-Zuordnung) erst nach Profilwechsel
      // oder Serverneustart, obwohl sie schon korrekt gespeichert wurde.
      if (server.profileManager.currentProfileName === name) {
        server.mappingEngine.loadProfile(server.profileManager.getCurrentProfile());
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Gezielt ändern (Durchsicht B3): nur die geänderten Stellen, der Server wendet sie auf seinen Stand an. Danach
  // bekommen alle Geräte 'profile-updated' und laden das Profil neu (statt mit einer alten Kopie weiterzuarbeiten).
  app.post('/api/profile/patch', async (req, res) => {
    try {
      const { name, aenderungen } = req.body || {};
      const ziel = await server.profileManager.patchProfile(typeof name === 'string' && name ? name : null, aenderungen);
      if (server.profileManager.currentProfileName === ziel) {
        server.mappingEngine.loadProfile(server.profileManager.getCurrentProfile());
      }
      server.io.emit('profile-updated', { name: ziel });
      res.json({ success: true, name: ziel });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post('/api/profile/create', async (req, res) => {
    try {
      const name = String(req.body?.name || '').trim();
      // nie ein vorhandenes Profil durch ein leeres ersetzen (23.10.2026)
      if (!name) return res.status(400).json({ success: false, error: 'Bitte einen Namen angeben' });
      if (server.profileManager.profiles[name]) return res.status(409).json({ success: false, error: `Ein Profil „${name}“ gibt es schon` });
      const newProfile = {
        name: name,
        description: 'Neues Profil',
        buttons: {},
        axes: {}
      };
      await server.profileManager.setProfile(name, newProfile);
      res.json({ success: true, profile: newProfile });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.delete('/api/profile/:name', async (req, res) => {
    try {
      const wasActive = server.profileManager.currentProfileName === req.params.name;
      await server.profileManager.deleteProfile(req.params.name);
      // war es das aktive: Armlehne und Tablets wechseln sichtbar auf „default“ (vorher lief die Belegung des gelöschten weiter)
      if (wasActive) server.applyProfileSwitch(server.profileManager.currentProfileName);
      // „Profil … laden“ auf Tasten, Kacheln, in Makros und GPS-Auslösern entfernen (24.10.2026, vorher blieb es tot stehen)
      await server.verwendungen(`hub:profile:${req.params.name}`, { entfernen: true }).catch(() => {});
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/profile/rename', async (req, res) => {
    try {
      const { oldName, newName } = req.body;
      await server.profileManager.renameProfile(oldName, newName);
      if (server.profileManager.currentProfileName === newName) {
        server.mappingEngine.loadProfile(server.profileManager.getCurrentProfile());
      }
      // „Profil … laden“ und „Gilt für“ der Kachelseiten folgen dem neuen Namen (24.10.2026)
      await server.verwendungen(`hub:profile:${oldName}`, { ersetzen: `hub:profile:${newName}` }).catch(() => {});
      const kc = server.kachelnManager?.get();
      if (kc?.pages?.some(p => (p.profiles || []).includes(oldName))) {
        kc.pages.forEach(p => { p.profiles = (p.profiles || []).map(n => (n === oldName ? newName : n)); });
        await server.kachelnManager.save();
        server.io.emit('kacheln-changed', kc);
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/profile/duplicate', async (req, res) => {
    try {
      const { sourceName, newName } = req.body;
      const newProfile = await server.profileManager.duplicateProfile(sourceName, newName);
      res.json({ success: true, profile: newProfile });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/profiles/reorder', async (req, res) => {
    try {
      await server.profileManager.reorderProfiles(req.body.order || []);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Beispielprofile mit fertiger Belegung (24.10.2026, server/beispielprofile.js): was es für Spiel + Controller gibt …
  app.get('/api/profiles/beispiele', async (req, res) => {
    const daten = await ladeBeispielprofile(server.gameManager.activeId, server.controllerManager.activeId);
    const profile = daten ? Object.entries(daten.profile).map(([name, p]) => ({
      name, beschreibung: p.beschreibung || '', vorhanden: !!server.profileManager.profiles[name] })) : [];
    res.json({ success: true, profile });
  });

  // … und hinzufügen (vorhandene Profile bleiben, fehlende Funktionen aus der inputBinding.xml des Spiels)
  app.post('/api/profiles/beispiele', async (req, res) => {
    try {
      const namen = Array.isArray(req.body?.namen) ? req.body.namen.filter(n => typeof n === 'string') : null;
      res.json({ success: true, ...(await fuegeBeispielprofileHinzu(server, namen)) });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/profiles/export', (req, res) => {
    const profiles = server.profileManager.getAllProfiles();
    res.json({ success: true, data: { profiles } });
  });

  app.post('/api/profiles/import', async (req, res) => {
    try {
      const { data, mode } = req.body || {};
      const importedProfiles = (Array.isArray(data?.profiles) ? data.profiles : [])
        .filter(p => p && typeof p === 'object' && typeof p.name === 'string' && p.name.trim());

      if (mode === 'replace') {
        // Ersetze alle Profile (außer default)
        const allProfiles = server.profileManager.getAllProfiles();
        for (const profile of allProfiles) {
          if (profile.name !== 'default') {
            await server.profileManager.deleteProfile(profile.name);
          }
        }
        // Importiere neue Profile
        for (const profile of importedProfiles) {
          if (profile.name !== 'default') {
            await server.profileManager.setProfile(profile.name, profile);
          }
        }
      } else if (mode === 'merge') {
        // Überschreibe bestehende Profile mit importierten -- außer dem schreibgeschützten Gamepad-Modus
        for (const profile of importedProfiles) {
          if (profile.name !== 'default') await server.profileManager.setProfile(profile.name, profile);
        }
      } else if (mode === 'add-missing') {
        // Nur neue Profile hinzufügen
        const existingProfiles = server.profileManager.getAllProfiles();
        const existingNames = new Set(existingProfiles.map(p => p.name));
        for (const profile of importedProfiles) {
          if (!existingNames.has(profile.name)) {
            await server.profileManager.setProfile(profile.name, profile);
          }
        }
      }

      // aktives Profil neu laden (ersetzt/zusammengeführt oder weggefallen)
      const pm = server.profileManager;
      if (!pm.profiles[pm.currentProfileName]) pm.currentProfileName = pm.profiles.default ? 'default' : Object.keys(pm.profiles)[0] || null;
      if (pm.currentProfileName) server.applyProfileSwitch(pm.currentProfileName);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Automatischer Profilwechsel: globaler Schalter (unabhängig vom einzelnen Profil, s.
  // autoSwitchManager.js). Die Zuordnung eines Profils zu Fahrzeugen/Geräten selbst läuft über das
  // bereits vorhandene `autoSwitchTriggers`-Feld im Profil-Objekt + die bestehende
  // POST /api/profile/save-Route (wie profile.pinnedPanels), braucht keine eigene Route.
  app.get('/api/auto-switch', (req, res) => {
    res.json({ success: true, enabled: server.autoSwitchManager.enabled });
  });

  // Gewähltes Fahrzeug/Gerät dem aktiven Profil zuordnen bzw. entfernen (Schnellmenü, 24.10.2026)
  app.post('/api/auto-switch/zuordnung', async (req, res) => {
    try {
      const pm = server.profileManager, profil = pm.currentProfileName;
      const r = await zuordnungAendern(pm, req.body?.name, profil, req.body?.zuordnen !== false);
      for (const n of [profil, ...r.vorher]) server.io.emit('profile-updated', { name: n });
      res.json({ success: true, profil, ...r });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post('/api/auto-switch/toggle', async (req, res) => {
    try {
      const enabled = await server.autoSwitchManager.toggle();
      server.io.emit('auto-switch-changed', { enabled });
      res.json({ success: true, enabled });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
}
