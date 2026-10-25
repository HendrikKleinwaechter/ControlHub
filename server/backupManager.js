/**
 * Backup-Manager (Phase D, Hendriks Wunsch 21.08.2026): kombinierter Export/Import über mehrere
 * Bereiche (Funktionen, Profile, Bedienpanel-Seiten) in einer einzigen Datei, mit granularer Auswahl
 * und einer Konfliktprüfung vor dem eigentlichen Import. Reine Orchestrierung -- jede Sektion läuft
 * am Ende durch die schon vorhandene, jeweils zuständige Import-Methode (functionsManager/
 * profileManager/steuerungsmenuesManager), hier wird keine eigene Merge-Logik neu erfunden.
 *
 * Bewusst OHNE Makros in diesem ersten Wurf (Makros haben ihren eigenen Export/Import-Button unter
 * Vorgewendemanagement, s. macrosManager.js) und ohne Dashboard-Einstellungen (Hendriks eigene
 * Einschränkung für später).
 */

const BUNDLE_VERSION = '1.0';

/** Sammelt alle Funktions-ID-Referenzen aus einem Profil (Tasten + CraftSlot-Ebenen + Achsen), um sie
 * gegen die verfügbaren Funktionen (Ziel + im selben Bundle mitgelieferte) zu prüfen. "macro:"-Werte
 * verweisen auf ein Makro statt eine Funktion und werden ignoriert; rohe Actions-Objekte (altes
 * Format, s. mappingEngine.js resolveToActions()) sind keine Referenz und werden ebenfalls übersprungen. */
function collectFunctionRefs(profile) {
  const refs = [];
  const addValue = (value) => {
    if (typeof value === 'string') {
      if (!value.startsWith('macro:') && !value.startsWith('hub:')) refs.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && !item.startsWith('macro:') && !item.startsWith('hub:')) refs.push(item);
      }
    }
  };
  for (const value of Object.values(profile.buttons || {})) addValue(value);
  for (const slot of Object.values(profile.craftSlotLayers || {})) {
    for (const layer of Object.values(slot)) {
      for (const value of Object.values(layer)) addValue(value);
    }
  }
  for (const axis of Object.values(profile.axes || {})) {
    if (axis.functionPlus) refs.push(axis.functionPlus);
    if (axis.functionMinus) refs.push(axis.functionMinus);
  }
  return refs;
}

export class BackupManager {
  constructor(functionsManager, profileManager, steuerungsmenuesManager) {
    this.functionsManager = functionsManager;
    this.profileManager = profileManager;
    this.steuerungsmenuesManager = steuerungsmenuesManager;
  }

  /**
   * @param {Object} selection
   * @param {string[]} [selection.functionIds]
   * @param {string[]} [selection.profileNames]
   * @param {string[]} [selection.pageIds]
   */
  buildBundle({ functionIds, profileNames, pageIds } = {}) {
    const bundle = { version: BUNDLE_VERSION, exportDate: new Date().toISOString() };

    if (functionIds && functionIds.length) {
      const data = {};
      for (const func of this.functionsManager.getAllFunctions()) {
        if (functionIds.includes(func.id)) data[func.id] = func;
      }
      bundle.functions = { ids: Object.keys(data), data };
      bundle.categories = this.functionsManager.getCategories();
    }

    if (profileNames && profileNames.length) {
      const data = this.profileManager.getAllProfiles().filter(p => profileNames.includes(p.name));
      bundle.profiles = { names: data.map(p => p.name), data };
    }

    if (pageIds && pageIds.length) {
      const data = [];
      const ids = [];
      for (const id of pageIds) {
        const page = this.steuerungsmenuesManager.getPage(id);
        if (page) { data.push(this.steuerungsmenuesManager.exportPage(id)); ids.push(id); }
      }
      bundle.steuerungsmenuePages = { ids, data };
    }

    return bundle;
  }

  /**
   * Rein lesende Konfliktprüfung, importiert noch nichts.
   * @returns {{missingFunctions: Array<{profile: string, missing: string[]}>, nameConflicts: Array<{name: string, existingId: string, incomingId: string}>}}
   */
  checkImport(bundleData) {
    const missingFunctions = [];
    const nameConflicts = [];

    const bundleFunctionIds = new Set(Object.keys(bundleData.functions?.data || {}));
    const existingFunctions = this.functionsManager.getAllFunctions();
    const availableIds = new Set([...existingFunctions.map(f => f.id), ...bundleFunctionIds]);

    for (const profile of bundleData.profiles?.data || []) {
      const missing = new Set(collectFunctionRefs(profile).filter(ref => !availableIds.has(ref)));
      if (missing.size) missingFunctions.push({ profile: profile.name, missing: [...missing] });
    }

    const existingByName = new Map();
    for (const func of existingFunctions) {
      if (!existingByName.has(func.name)) existingByName.set(func.name, []);
      existingByName.get(func.name).push(func);
    }
    for (const [incomingId, func] of Object.entries(bundleData.functions?.data || {})) {
      for (const existing of existingByName.get(func.name) || []) {
        if (existing.id !== incomingId) {
          nameConflicts.push({ name: func.name, existingId: existing.id, incomingId });
        }
      }
    }

    return { missingFunctions, nameConflicts };
  }

  /**
   * Führt den eigentlichen Import durch -- jede Sektion über ihre bestehende Import-Methode.
   * @param {Object} modes - { functions: 'merge'|'replace', profiles: 'merge'|'replace'|'add-missing' }
   *   Bedienpanel-Seiten sind immer additiv (s. steuerungsmenuesManager.importPage()), kein Modus nötig.
   * @param {{ nachKachel?: Function }} opts - nach jeder importierten Kachel, z. B. mitgelieferte Bilder ablegen
   */
  async importBundle(bundleData, modes = {}, { nachKachel = null } = {}) {
    const result = { functions: 0, profiles: 0, pages: 0 };

    if (bundleData.functions?.data) {
      await this.functionsManager.importFunctions({ functions: bundleData.functions.data }, modes.functions || 'merge');
      result.functions = Object.keys(bundleData.functions.data).length;
    }

    if (bundleData.profiles?.data) {
      const mode = modes.profiles || 'merge';
      const incoming = bundleData.profiles.data;
      if (mode === 'replace') {
        for (const profile of this.profileManager.getAllProfiles()) {
          if (profile.name !== 'default') await this.profileManager.deleteProfile(profile.name);
        }
        for (const profile of incoming) {
          if (profile.name !== 'default') await this.profileManager.setProfile(profile.name, profile);
        }
      } else if (mode === 'add-missing') {
        const existingNames = new Set(this.profileManager.getAllProfiles().map(p => p.name));
        for (const profile of incoming) {
          if (!existingNames.has(profile.name)) await this.profileManager.setProfile(profile.name, profile);
        }
      } else {
        // zusammenführen: der Gamepad-Modus ist schreibgeschützt und bleibt, wie er ist
        for (const profile of incoming) if (profile.name !== 'default') await this.profileManager.setProfile(profile.name, profile);
      }
      result.profiles = incoming.length;
    }

    if (bundleData.steuerungsmenuePages?.data) {
      for (const page of bundleData.steuerungsmenuePages.data) {
        const neu = await this.steuerungsmenuesManager.importPage(page);
        if (nachKachel) await nachKachel(neu, page);
      }
      result.pages = bundleData.steuerungsmenuePages.data.length;
    }

    return result;
  }
}
