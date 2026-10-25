/**
 * Profil-Manager für Mapping-Profile
 * Verwaltet Profile, Umschaltung und Persistierung
 */

import { readJsonFile, writeJsonAtomic } from './jsonStore.js';

/**
 * Profil gezielt ändern (Durchsicht B3, 23.10.2026): Statt das ganze Profil aus einer evtl. alten Kopie zurückzuschicken
 * (dabei gingen z. B. die Fahrzeug-Zuordnung oder Änderungen eines anderen Tablets verloren), schickt die Oberfläche nur
 * die geänderten Stellen; der Server wendet sie auf SEINEN Stand an.
 * aenderungen: [{ pfad: ['buttons', '12'], wert }] -- wert null/undefined = Eintrag entfernen.
 * @returns {Object} das geänderte Profil (dasselbe Objekt)
 */
const VERBOTEN = new Set(['__proto__', 'prototype', 'constructor']);
export function wendeProfilAenderungenAn(profil, aenderungen) {
  if (!profil || typeof profil !== 'object') throw new Error('Profil fehlt');
  if (!Array.isArray(aenderungen) || !aenderungen.length || aenderungen.length > 500) throw new Error('Keine gültigen Änderungen');
  for (const a of aenderungen) {
    const pfad = a?.pfad;
    if (!Array.isArray(pfad) || pfad.length < 1 || pfad.length > 6) throw new Error('Ungültiger Pfad');
    const teile = pfad.map(t => String(t));
    if (teile.some(t => !t || t.length > 60 || VERBOTEN.has(t)) || teile[0] === 'name') throw new Error('Ungültiger Pfad');
    let ziel = profil;
    for (const t of teile.slice(0, -1)) {
      if (!ziel[t] || typeof ziel[t] !== 'object' || Array.isArray(ziel[t])) {
        if (a.wert === null || a.wert === undefined) { ziel = null; break; }   // zu entfernender Eintrag gibt es nicht
        ziel[t] = {};
      }
      ziel = ziel[t];
    }
    if (!ziel) continue;
    const letzter = teile[teile.length - 1];
    if (a.wert === null || a.wert === undefined) delete ziel[letzter];
    else ziel[letzter] = structuredClone(a.wert);
  }
  return profil;
}

// Der Gamepad-Modus (Profil „default“) ist schreibgeschützt (Hendrik 24.10.2026: „muss schreibgeschützt sein und kann
// nicht verändert werden. Das dient ja nur zum Zweck, dass man die Fallback-Belegung auch mit dem ControlHub nutzen
// kann“). Seine Belegung stellt index.js ensureDefaultProfileIsBasicGamepad() beim Laden her (intern: true).
export const GAMEPAD_MODUS = 'default';
export const SCHREIBGESCHUETZT = 'Der Gamepad-Modus ist schreibgeschützt. Für eine eigene Belegung das Profil kopieren.';

export class ProfileManager {
  constructor(configPath = './server/config/profiles.json') {
    this.configPath = configPath;
    this.profiles = {};
    this.currentProfileName = null;
    this.order = []; // Anzeige-Reihenfolge auf der Profil-Seite, per Hand sortierbar (s. reorderProfiles())
    // Stand der einmal angelegten Beispielprofile (index.js applyControllerData(), 24.10.2026): 1 = schon dazugelegt,
    // danach nie wieder -- wer eines löscht, holt es über „Beispielprofile hinzufügen“. Ab 2 (25.10.2026) zählen die
    // Nachträge der Beispielbelegung mit (beispielprofile.js wendeNachtraegeAn(), z. B. Zündschloss).
    this.beispiele = 0;
  }

  /**
   * Initialisiert den Profil-Manager und lädt gespeicherte Profile
   */
  async initialize() {
    // Lesen über jsonStore (23.10.2026): kaputte Datei als .defekt gesichert (notfalls .bak genommen)
    const { data: config, status } = await readJsonFile(this.configPath, { fallback: null });
    if (status === 'missing') {
      console.log('Keine Profile gefunden, erstelle Standard-Profil...');
      await this.createDefaultProfile();
    } else if (status === 'broken') {
      console.error('Fehler beim Laden der Profile: Datei beschädigt, starte ohne Profile');
    } else {
      try {
        this.profiles = config.profiles || {};
        this.currentProfileName = config.currentProfile || Object.keys(this.profiles)[0] || null;
        // Ältere Dateien ohne "order" -- Einfüge-Reihenfolge der Objekt-Keys als Ausgangspunkt nehmen.
        this.order = config.order || Object.keys(this.profiles);
        this.beispiele = Number(config.beispiele) || 0;
        this.syncOrder();
        console.log(`Profile geladen: ${Object.keys(this.profiles).join(', ')}`);
      } catch (error) {
        console.error('Fehler beim Laden der Profile:', error);
      }
    }
  }

  /**
   * Erstellt ein Standard-Profil
   */
  async createDefaultProfile() {
    // Leer anlegen (23.10.2026): index.js ensureDefaultProfileIsBasicGamepad() belegt ein leeres „default“ als
    // BasicGamepad-Durchgriff. Vorher standen hier Beispiel-Belegungen im alten Format (Objekte statt Funktions-IDs),
    // die nichts taten, und name 'Standard' passte nicht zum Schlüssel -- ein neues eigenes Spiel war so unbenutzbar.
    this.profiles = {
      'default': { name: 'default', description: 'Standard-Mapping-Profil', buttons: {}, axes: {} }
    };
    this.currentProfileName = 'default';
    this.order = ['default'];
    await this.save();
  }

  /**
   * Hält this.order konsistent mit this.profiles -- entfernt Namen, die es nicht mehr gibt, hängt
   * neue/unbekannte Profile ans Ende an. Selbstheilend, falls beide je auseinanderlaufen.
   */
  syncOrder() {
    this.order = this.order.filter(name => this.profiles[name]);
    for (const name of Object.keys(this.profiles)) {
      if (!this.order.includes(name)) this.order.push(name);
    }
  }

  /**
   * Gibt das aktuell aktive Profil zurück
   * @returns {Object|null} Aktuelles Profil
   */
  getCurrentProfile() {
    if (!this.currentProfileName) return null;
    return this.profiles[this.currentProfileName] || null;
  }

  /**
   * Wechselt zu einem anderen Profil
   * @param {string} profileName - Name des Profils
   * @returns {boolean} Erfolg
   */
  switchProfile(profileName) {
    if (!this.profiles[profileName]) {
      console.warn(`Profil '${profileName}' nicht gefunden`);
      return false;
    }
    this.currentProfileName = profileName;
    console.log(`Profil gewechselt zu: ${profileName}`);
    return true;
  }

  /**
   * Gibt alle verfügbaren Profile zurück
   * @returns {Array} Liste der Profile
   */
  getAllProfiles() {
    this.syncOrder();
    return this.order.map(name => ({
      ...this.profiles[name],
      name   // der Schlüssel gilt, nicht ein abweichendes internes name-Feld
    }));
  }

  /**
   * Fügt ein neues Profil hinzu oder aktualisiert ein bestehendes
   * @param {string} name - Profil-Name
   * @param {Object} profileData - Profil-Daten
   */
  async setProfile(name, profileData, { intern = false } = {}) {
    if (name === GAMEPAD_MODUS && !intern) throw new Error(SCHREIBGESCHUETZT);
    this.profiles[name] = profileData;
    if (!this.order.includes(name)) this.order.push(name);
    await this.save();
    console.log(`Profil '${name}' gespeichert`);
  }

  /** Einzelne Stellen eines Profils ändern (B3, s. wendeProfilAenderungenAn()); name null = aktives Profil */
  async patchProfile(name, aenderungen) {
    const ziel = name || this.currentProfileName;
    if (!ziel || !this.profiles[ziel]) throw new Error('Profil nicht gefunden');
    if (ziel === GAMEPAD_MODUS) throw new Error(SCHREIBGESCHUETZT);
    wendeProfilAenderungenAn(this.profiles[ziel], aenderungen);
    await this.save();
    return ziel;
  }

  /**
   * Legt eine neue Anzeige-Reihenfolge fest (Profil-Seite, ↑/↓-Buttons).
   * @param {string[]} newOrder - vollständige Liste aller Profil-Namen in der gewünschten Reihenfolge
   */
  async reorderProfiles(newOrder) {
    const known = new Set(Object.keys(this.profiles));
    const filtered = newOrder.filter(name => known.has(name));
    if (filtered.length !== known.size) {
      throw new Error('Reihenfolge muss alle vorhandenen Profile genau einmal enthalten');
    }
    this.order = filtered;
    await this.save();
  }

  /**
   * Löscht ein Profil
   * @param {string} name - Profil-Name
   */
  async deleteProfile(name) {
    if (name === 'default') {
      throw new Error('Der Gamepad-Modus (Profil „default“) kann nicht gelöscht werden');
    }
    delete this.profiles[name];
    this.order = this.order.filter(n => n !== name);
    if (this.currentProfileName === name) {
      this.currentProfileName = 'default';
    }
    await this.save();
    console.log(`Profil '${name}' gelöscht`);
  }

  /**
   * Benennt ein Profil um (Speicher-Schlüssel UND das interne name-Feld, konsistent mit setProfile()/create)
   * @param {string} oldName
   * @param {string} newName
   */
  async renameProfile(oldName, newName) {
    if (oldName === 'default') {
      throw new Error('Der Gamepad-Modus (Profil „default“) kann nicht umbenannt werden');
    }
    if (!this.profiles[oldName]) {
      throw new Error(`Profil '${oldName}' nicht gefunden`);
    }
    if (!newName || !newName.trim()) {
      throw new Error('Neuer Name darf nicht leer sein');
    }
    if (this.profiles[newName]) {
      throw new Error(`Profil '${newName}' existiert bereits`);
    }

    const profileData = this.profiles[oldName];
    profileData.name = newName;
    this.profiles[newName] = profileData;
    delete this.profiles[oldName];
    const orderIdx = this.order.indexOf(oldName);
    if (orderIdx !== -1) this.order[orderIdx] = newName;
    if (this.currentProfileName === oldName) {
      this.currentProfileName = newName;
    }
    await this.save();
    console.log(`Profil '${oldName}' umbenannt zu '${newName}'`);
  }

  /**
   * Dupliziert ein Profil (Tasten-/Achsenbelegung) unter neuem Namen, ohne automatisch zu wechseln
   * @param {string} sourceName
   * @param {string} newName
   * @returns {Object} die neue Profil-Kopie
   */
  async duplicateProfile(sourceName, newName) {
    if (!this.profiles[sourceName]) {
      throw new Error(`Profil '${sourceName}' nicht gefunden`);
    }
    if (!newName || !newName.trim()) {
      throw new Error('Neuer Name darf nicht leer sein');
    }
    if (this.profiles[newName]) {
      throw new Error(`Profil '${newName}' existiert bereits`);
    }

    const copy = JSON.parse(JSON.stringify(this.profiles[sourceName]));
    copy.name = newName;
    this.profiles[newName] = copy;
    await this.save();
    console.log(`Profil '${sourceName}' dupliziert zu '${newName}'`);
    return copy;
  }

  /**
   * Speichert alle Profile in die Konfigurationsdatei
   */
  async save() {
    try {
      const config = {
        currentProfile: this.currentProfileName,
        order: this.order,
        beispiele: this.beispiele,
        profiles: this.profiles
      };
      await writeJsonAtomic(this.configPath, config); // atomar + .bak (23.10.2026)
    } catch (error) {
      console.error('Fehler beim Speichern der Profile:', error);
      throw error;
    }
  }
}
