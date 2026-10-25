/**
 * Macros-Manager
 * Verwaltet die Vorgewende-Makros (mehrstufige Abfolgen bestehender Funktionen, jeder Schritt mit
 * eigenem Auslöser -- Ausführung übernimmt server/macroEngine.js, hier nur CRUD/Persistenz,
 * 1:1 nach dem Muster von functionsManager.js.
 */

import { readJsonFile, writeJsonAtomic } from './jsonStore.js';

export class MacrosManager {
  constructor(configPath = './server/config/macros.json') {
    this.configPath = configPath;
    this.macros = {};
  }

  async initialize() {
    // Lesen über jsonStore (23.10.2026): kaputte Datei als .defekt gesichert (notfalls .bak genommen)
    const { data: config, status } = await readJsonFile(this.configPath, { fallback: null });
    if (status === 'missing') {
      console.log('Keine Makros gefunden, starte leer');
      this.macros = {};
      await this.save();
    } else if (status === 'broken') {
      console.error('Fehler beim Laden der Makros: Datei beschädigt, starte leer');
    } else {
      try {
        this.macros = config.macros || {};
        console.log(`Makros geladen: ${Object.keys(this.macros).length} Makros`);
      } catch (error) {
        console.error('Fehler beim Laden der Makros:', error);
      }
    }
  }

  getAllMacros() {
    return Object.values(this.macros);
  }

  getMacro(macroId) {
    return this.macros[macroId] || null;
  }

  /**
   * Erstellt oder aktualisiert ein Makro.
   * @param {string} macroId
   * @param {{name: string, steps: Array<{functionId?: string, quickActions?: Array, trigger?: {type: 'time'|'distance'|'button', seconds?: number, meters?: number}, holdSeconds?: number}>}} macroData
   */
  async setMacro(macroId, macroData) {
    this.validate(macroData);
    macroData.id = macroId;
    this.macros[macroId] = macroData;
    await this.save();
    console.log(`Makro '${macroData.name}' gespeichert`);
  }

  // Prüft ein Makro; wirft mit verständlicher Meldung. Zeit und Strecke brauchen seit 23.10.2026 eine Zahl > 0 --
  // ein Zeit-Auslöser ohne Sekunden feuerte sonst sofort, einer ohne Meter nie.
  validate(macroData) {
    if (!macroData?.name || !Array.isArray(macroData.steps) || macroData.steps.length === 0) {
      throw new Error('Name und mindestens ein Schritt sind erforderlich');
    }
    for (let i = 0; i < macroData.steps.length; i++) {
      const step = macroData.steps[i];
      // holdSeconds (optional, s. macroEngine.js fireStep()) gilt für ALLE Schritte, deshalb eigene
      // Prüfung außerhalb der Trigger-Schleife unten (die erst ab Schritt 2 greift).
      if (step.holdSeconds != null && (typeof step.holdSeconds !== 'number' || step.holdSeconds <= 0)) {
        throw new Error(`Schritt ${i + 1}: Haltedauer muss eine positive Zahl sein`);
      }
      if (i > 0) {
        const trigger = step.trigger;
        if (!trigger || !['time', 'distance', 'button'].includes(trigger.type)) {
          throw new Error(`Schritt ${i + 1} braucht einen gültigen Auslöser (Zeit/Strecke/Tastendruck)`);
        }
        if (trigger.type === 'time' && !(Number(trigger.seconds) > 0)) throw new Error(`Schritt ${i + 1}: Zeit in Sekunden fehlt`);
        if (trigger.type === 'distance' && !(Number(trigger.meters) > 0)) throw new Error(`Schritt ${i + 1}: Strecke in Metern fehlt`);
      }
    }
  }

  async deleteMacro(macroId) {
    if (!this.macros[macroId]) {
      throw new Error('Makro nicht gefunden');
    }
    delete this.macros[macroId];
    await this.save();
    console.log(`Makro '${macroId}' gelöscht`);
  }

  /**
   * Exportiert alle Makros (1:1 nach dem Muster von FunctionsManager.exportFunctions()).
   */
  exportMacros() {
    return {
      version: '1.0',
      macros: this.macros,
      exportDate: new Date().toISOString()
    };
  }

  /**
   * Importiert Makros (1:1 nach dem Muster von FunctionsManager.importFunctions()).
   */
  async importMacros(data, mode = 'merge') {
    if (!data?.macros || typeof data.macros !== 'object' || Array.isArray(data.macros)) {
      throw new Error('Ungültiges Import-Format');
    }
    // dieselbe Prüfung wie beim Speichern; ungültige Makros werden übersprungen (23.10.2026)
    const incoming = {};
    let skipped = 0;
    for (const [id, macro] of Object.entries(data.macros)) {
      try {
        if (!/^[\w:.-]{1,80}$/.test(id)) throw new Error('ID');
        this.validate(macro);
        incoming[id] = { ...macro, id };
      } catch { skipped++; }
    }

    if (mode === 'replace') {
      this.macros = incoming;
    } else {
      Object.assign(this.macros, incoming);
    }

    await this.save();
    console.log(`Makros importiert (${mode}-Modus)${skipped ? `, ${skipped} ungültige übersprungen` : ''}`);
    return { imported: Object.keys(incoming).length, skipped };
  }

  async save() {
    try {
      await writeJsonAtomic(this.configPath, { macros: this.macros }); // atomar + .bak (23.10.2026)
    } catch (error) {
      console.error('Fehler beim Speichern der Makros:', error);
      throw error;
    }
  }
}
