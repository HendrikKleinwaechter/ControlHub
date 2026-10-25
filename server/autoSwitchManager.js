/**
 * Automatischer Profilwechsel je nach Fahrzeug/Anbaugerät (Hendriks Wunsch) -- entscheidet anhand der
 * von telemetryReader.js gelieferten vehicleName/implementNames, ob (und wohin) das aktive Profil
 * automatisch gewechselt werden soll. Reine Entscheidungslogik + Persistenz des globalen Schalters und
 * der gemerkten Konflikt-Präferenzen -- das eigentliche Umschalten (profileManager.switchProfile() +
 * mappingEngine.loadProfile() + Socket-Broadcast) bleibt bewusst in server/index.js, wo auch der
 * bestehende manuelle Profilwechsel passiert (keine Duplikat-Logik an zwei Stellen, s. index.js
 * applyProfileSwitch()).
 *
 * Konfliktregel (mit Hendrik abgestimmt): Anbaugerät schlägt Fahrzeug (spezifischste Zuordnung
 * gewinnt). Zeigen mehrere GLEICHZEITIG angehängte Geräte (oder mehrere Fahrzeug-Treffer) auf
 * unterschiedliche Profile, ist das ein Konflikt -- die exakte Kombination (comboKey = Fahrzeug +
 * alle Geräte, sortiert) wird sich beim ersten Mal per Rückfrage gemerkt (comboPreferences), danach
 * automatisch angewendet, bis Hendrik es über die Zuordnungs-Meldung wieder ändert.
 */

import { readJsonFile, writeJsonAtomic } from './jsonStore.js';
import { GAMEPAD_MODUS, SCHREIBGESCHUETZT } from './profileManager.js';

/**
 * Fahrzeug bzw. Gerät dem Profil zuordnen oder die Zuordnung entfernen (Hendrik 24.10.2026: „Das Zuordnen … muss
 * einfacher gehen … eine Taste im Schnellmenü … damit kann man das gerade aktive ausgewählte Gerät oder Fahrzeug dem
 * gerade geladenen Profil zuordnen bzw. es von der Zuordnung entfernen“). Beim Zuordnen verschwindet der Name aus anderen
 * Profilen, sonst stünden zwei Profile für dasselbe Gerät und der Auto-Wechsel müsste nachfragen.
 * @returns {Promise<{ zugeordnet: boolean, vorher: string[] }>} vorher = Profile, aus denen der Name entfernt wurde
 */
export async function zuordnungAendern(profileManager, name, profil, zuordnen) {
  const pm = profileManager;
  name = String(name || '').trim();
  if (!name) throw new Error('Kein Fahrzeug oder Gerät gewählt');
  if (profil === GAMEPAD_MODUS) throw new Error(SCHREIBGESCHUETZT);
  if (!pm.profiles[profil]) throw new Error('Profil nicht gefunden');
  const pfad = ['autoSwitchTriggers'];
  const vorher = [];
  if (zuordnen) {
    for (const [n, p] of Object.entries(pm.profiles)) {
      const t = p.autoSwitchTriggers || [];
      if (n === profil || n === GAMEPAD_MODUS || !t.includes(name)) continue;
      await pm.patchProfile(n, [{ pfad, wert: t.filter(x => x !== name) }]);
      vorher.push(n);
    }
  }
  const t = pm.profiles[profil].autoSwitchTriggers || [];
  await pm.patchProfile(profil, [{ pfad, wert: zuordnen ? [...new Set([...t, name])] : t.filter(x => x !== name) }]);
  return { zugeordnet: !!zuordnen, vorher };
}

export class AutoSwitchManager {
  constructor(configPath = './server/config/autoSwitch.json') {
    this.configPath = configPath;
    this.enabled = false;
    this.comboPreferences = {}; // comboKey -> profileName
    // Nur im Speicher (NICHT persistiert) -- verhindert, dass dieselbe unentschiedene Kombination bei
    // jedem 250ms-Telemetrie-Tick erneut eine Rückfrage auslöst. Wird vom Aufrufer (index.js)
    // zurückgesetzt, sobald sich der erkannte comboKey ändert.
    this.lastPromptedComboKey = null;
  }

  async initialize() {
    // Lesen über jsonStore (23.10.2026): kaputte Datei als .defekt gesichert (notfalls .bak genommen)
    const { data: config, status } = await readJsonFile(this.configPath, { fallback: null });
    if (status === 'broken') {
      console.error('Fehler beim Laden der Auto-Wechsel-Einstellungen: Datei beschädigt, Standard (aus)');
    } else if (status !== 'missing') {
      try {
        this.enabled = !!config.enabled;
        this.comboPreferences = config.comboPreferences || {};
      } catch (error) {
        console.error('Fehler beim Laden der Auto-Wechsel-Einstellungen:', error);
      }
    }
  }

  async save() {
    try {
      const config = { enabled: this.enabled, comboPreferences: this.comboPreferences };
      await writeJsonAtomic(this.configPath, config); // atomar + .bak (23.10.2026)
    } catch (error) {
      console.error('Fehler beim Speichern der Auto-Wechsel-Einstellungen:', error);
      throw error;
    }
  }

  async setEnabled(enabled) {
    this.enabled = !!enabled;
    await this.save();
    return this.enabled;
  }

  async toggle() {
    return this.setEnabled(!this.enabled);
  }

  // Sortiert, damit z.B. "Mähwerk vorne + Ladewagen hinten" unabhängig von der Reihenfolge in
  // implementNames denselben Schlüssel ergibt wie "Ladewagen hinten + Mähwerk vorne".
  comboKey(vehicleName, implementNames) {
    return [vehicleName, ...implementNames].filter(Boolean).sort().join('|');
  }

  async setComboPreference(comboKey, profileName) {
    this.comboPreferences[comboKey] = profileName;
    await this.save();
  }

  // "Immer fragen" -- bewusst KEIN eigener Sentinelwert dafür, ein fehlender Eintrag bedeutet bereits
  // "fragen" (einfacher als ein zusätzlicher dritter Zustand).
  async clearComboPreference(comboKey) {
    delete this.comboPreferences[comboKey];
    await this.save();
  }

  // Reine Entscheidung ohne Nebenwirkungen (auch kein this.lastPromptedComboKey -- das verwaltet der
  // Aufrufer in index.js, da nur er weiß, ob für diesen comboKey schon eine Meldung raus ist).
  // allProfiles: Objekt name -> profileData (wie ProfileManager.profiles), implementNames: Array.
  resolve(vehicleName, implementNames, allProfiles) {
    const implementMatches = new Set();
    const vehicleMatches = new Set();
    for (const [name, profile] of Object.entries(allProfiles)) {
      const triggers = profile.autoSwitchTriggers || [];
      if (triggers.length === 0) continue;
      if (implementNames.some(imp => triggers.includes(imp))) {
        implementMatches.add(name);
      } else if (vehicleName && triggers.includes(vehicleName)) {
        vehicleMatches.add(name);
      }
    }

    // Anbaugerät schlägt Fahrzeug: die Fahrzeug-Ebene zählt nur, wenn KEIN Gerät matcht.
    const candidates = implementMatches.size > 0 ? implementMatches : vehicleMatches;
    if (candidates.size === 0) return { action: 'none' };
    if (candidates.size === 1) return { action: 'switch', profileName: [...candidates][0], viaPreference: false };

    // Konflikt: mehrere unterschiedliche Kandidaten auf derselben Prioritätsstufe. "viaPreference"
    // sagt dem Aufrufer (index.js), ob er die dezente "automatisch wegen gemerkter Wahl"-Meldung
    // zeigen soll -- ein eindeutiger Treffer oben braucht das nie. "candidates" wird in BEIDEN Fällen
    // mitgegeben (nicht nur bei 'ask'), damit der Client beim nachträglichen Ändern über die dezente
    // Meldung dieselbe Auswahl erneut zeigen kann, ohne sie selbst neu herleiten zu müssen.
    const key = this.comboKey(vehicleName, implementNames);
    const candidateList = [...candidates];
    const remembered = this.comboPreferences[key];
    if (remembered && candidates.has(remembered)) {
      return { action: 'switch', profileName: remembered, viaPreference: true, comboKey: key, candidates: candidateList };
    }
    return { action: 'ask', comboKey: key, candidates: candidateList };
  }
}
