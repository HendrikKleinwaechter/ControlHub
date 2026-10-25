/**
 * Functions-Manager
 * Verwaltet die Funktions-Bibliothek (Actions-Abstraktionsebene)
 */

import { readJsonFile, writeJsonAtomic } from './jsonStore.js';
import { ALL_RESERVED_GAMEPAD_BUTTONS } from './craftSlotLayerManager.js';
import { MAIN_BUTTON_COUNT } from './config/modules.js';
import { normalizeCondition } from './conditions.js';

// Startbelegung, falls noch keine categories.json existiert (bzw. nach "Alle Funktionen löschen",
// s. deleteAllFunctions()) -- danach ist die Liste dynamisch (wächst automatisch mit, siehe
// ensureCategory()), keine feste Code-Liste mehr. Einstufig -- entspricht den ehemaligen
// Unterkategorien aus server/inputBindingImporter.js, die früheren 6 Oberkategorien
// (Fahrzeug/Anbaugeräte/Feldarbeit/Forstwirtschaft/Spieler/Spiel) gibt es nicht mehr. "Mods" als
// pauschaler Sammeltopf gibt es seit der Mod-für-Mod-Kategorisierung ebenfalls nicht mehr -- der
// Importer nutzt "Sonstige/unbekannt" nur noch für die wenigen wirklich nicht zuordenbaren Reste.
// Seit 24.10.2026 mit Untergruppen („Obergruppe › Untergruppe“, s. public/js/functionGroups.js), wie der Import sie anlegt.
const DEFAULT_CATEGORIES = [
  'Fahrzeug', 'Fahrzeug › Fahren', 'Fahrzeug › Arbeit', 'Fahrzeug › Beleuchtung', 'Fahrzeug › Frontlader',
  'Zu Fuß', 'Zu Fuß › Bewegung', 'Zu Fuß › Interaktion', 'Spiel', 'Kamera'
];

// Untergruppen: eine Ebene, Name „Obergruppe › Untergruppe“
const UG = ' › ';
const oberVon = name => { const i = String(name).indexOf(UG); return i < 0 ? String(name) : String(name).slice(0, i); };

// Gruppen, die von der Firmware/vom System selbst befüllt werden (s. ensureBuiltinFunctions()) --
// dürfen nicht gelöscht werden, sonst würden z.B. alle 100 BasicGamepad-Funktionen (Grundlage des
// "default"-Profils) oder die Makro-Abbruch-Funktion mitgelöscht (Hendriks Vorgabe, 21.08.2026).
const PROTECTED_CATEGORIES = ['Makros', 'BasicGamepad Tasten'];

export class FunctionsManager {
  constructor(configPath = './server/config/functions.json', categoriesPath = './server/config/categories.json') {
    this.configPath = configPath;
    this.categoriesPath = categoriesPath;
    this.functions = {};
    this.categories = [...DEFAULT_CATEGORIES];
  }

  /**
   * Initialisiert den Functions-Manager
   */
  async initialize() {
    // Lesen über jsonStore (23.10.2026): kaputte Datei wird als .defekt gesichert (notfalls .bak genommen) --
    // dass ensureBuiltinFunctions() danach gleich speichert, überschreibt deshalb nichts Verlorenes mehr
    const fn = await readJsonFile(this.configPath, { fallback: null });
    if (fn.status === 'missing') {
      console.log('Keine Funktionen gefunden, erstelle Standard-Funktionen...');
      await this.createDefaultFunctions();
    } else if (fn.status === 'broken') {
      console.error('Fehler beim Laden der Funktionen: Datei beschädigt, starte ohne Funktionen');
    } else {
      try {
        this.functions = fn.data.functions || {};
        if (this.migrateToMultiCategory()) await this.save();
        console.log(`Funktionen geladen: ${Object.keys(this.functions).length} Funktionen`);
      } catch (error) {
        console.error('Fehler beim Laden der Funktionen:', error);
      }
    }

    const cat = await readJsonFile(this.categoriesPath, { fallback: null });
    if (cat.status === 'missing') {
      this.categories = [...DEFAULT_CATEGORIES];
      await this.saveCategories();
    } else if (cat.status === 'broken') {
      console.error('Fehler beim Laden der Kategorien: Datei beschädigt, starte mit Standard-Gruppen');
    } else {
      try {
        this.categories = cat.data.categories || [...DEFAULT_CATEGORIES];
        console.log(`Kategorien geladen: ${this.categories.length}`);
      } catch (error) {
        console.error('Fehler beim Laden der Kategorien:', error);
      }
    }

    await this.ensureBuiltinFunctions();
  }

  /**
   * Einmalige Migration (21.08.2026): `category` (einzelner String) + `subcategory` (Untergruppen,
   * komplett entfernt) -> `categories` (Array, Mehrfachzuordnung zu Gruppen). Läuft bei jedem Start
   * automatisch mit -- bereits migrierte Funktionen (haben schon `categories`) werden übersprungen,
   * daher gefahrlos wiederholbar. Gibt true zurück, wenn mindestens eine Funktion geändert wurde
   * (Aufrufer speichert dann einmalig).
   */
  migrateToMultiCategory() {
    let changed = false;
    for (const func of Object.values(this.functions)) {
      if (Array.isArray(func.categories)) continue;
      func.categories = func.category ? [func.category] : [];
      delete func.category;
      delete func.subcategory;
      changed = true;
    }
    return changed;
  }

  /**
   * Stellt sicher, dass fest benötigte System-Funktionen existieren (aktuell: Makro-Abbruch, s.
   * mappingEngine.js handleButtonDown() Aktion 'macro-abort') und in der richtigen Kategorie stehen --
   * legt sie an, falls sie fehlt, und korrigiert nur die Kategorie (nicht Name/Icon o.ä.), falls sie
   * noch vom alten Stand ("Steuerung" statt "Makros") abweicht.
   */
  async ensureBuiltinFunctions() {
    const existing = this.functions['func-macro-abort'];
    if (!existing) {
      await this.setFunction('func-macro-abort', {
        name: '⛔ Makro abbrechen',
        categories: ['Makros'],
        actions: [{ type: 'macro-abort' }]
      });
      console.log('Systemfunktion "Makro abbrechen" angelegt');
    } else if (!existing.categories?.includes('Makros')) {
      existing.categories = ['Makros'];
      await this.ensureCategory('Makros');
      await this.save();
      console.log('Systemfunktion "Makro abbrechen" in Gruppe "Makros" verschoben');
    }

    // BasicGamepad-Tasten: eine Funktion je Gamepad-Ausgabe-Taste (1:1-Durchreichen), Grundlage für
    // das "default"-Profil (s. ensureDefaultProfileIsBasicGamepad() in index.js) -- damit verhält sich
    // der Controller mit verbundenem ControlHub genauso wie im Offline-Fallback (reines HID-Gamepad).
    // Die 4 für Ebenentaster reservierten Gamepad-Tasten (s. craftSlotLayerManager.js) werden bewusst
    // ausgelassen -- dieselbe Regel wie setFunction() sie schon durchsetzt, nur hier von vornherein
    // nicht erst erzeugt statt später abgelehnt.
    let addedBasicGamepad = false;
    for (let i = 1; i <= MAIN_BUTTON_COUNT; i++) {
      if (ALL_RESERVED_GAMEPAD_BUTTONS.includes(i - 1)) continue;
      const id = `func-basicgamepad-${i}`;
      if (this.functions[id]) continue;
      this.functions[id] = {
        id,
        name: `Gamepad-Taste ${i}`,
        categories: ['BasicGamepad Tasten'],
        actions: [{ type: 'gamepad', buttonId: i - 1 }]
      };
      addedBasicGamepad = true;
    }
    if (addedBasicGamepad) {
      await this.ensureCategory('BasicGamepad Tasten');
      await this.save();
      console.log('BasicGamepad-Tasten-Funktionen angelegt (1-100)');
    }
  }

  /**
   * Gibt alle bekannten Kategorien zurück
   */
  getCategories() {
    return this.categories;
  }

  // Für den Client (categoryManager.js): welche Gruppen sind Systemgruppen und dürfen nicht
  // gelöscht werden -- damit die Liste nur an EINER Stelle (oben, PROTECTED_CATEGORIES) gepflegt wird.
  getProtectedCategories() {
    return PROTECTED_CATEGORIES;
  }

  /**
   * Registriert eine Kategorie, falls sie noch nicht bekannt ist (Kategorien stehen nicht
   * fest -- sie wachsen automatisch mit, z.B. beim Import aus einer inputBinding.xml).
   */
  async ensureCategory(name) {
    if (!name) return;
    // Untergruppe: die Obergruppe gehört mit in die Liste (davor, falls sie noch fehlt)
    const neu = [oberVon(name), name].filter((c, i, a) => a.indexOf(c) === i && !this.categories.includes(c));
    if (!neu.length) return;
    this.categories.push(...neu);
    await this.saveCategories();
  }

  /** Untergruppen einer Obergruppe (volle Namen) */
  untergruppen(name) {
    return oberVon(name) === name ? this.categories.filter(c => c.startsWith(name + UG)) : [];
  }

  async saveCategories() {
    await writeJsonAtomic(this.categoriesPath, { categories: this.categories }); // atomar + .bak (23.10.2026)
  }

  /**
   * Legt eine leere Kategorie manuell an (im Unterschied zu ensureCategory() nicht an eine
   * Funktion gekoppelt -- z.B. um eine Kategorie vorzubereiten, bevor die erste Funktion existiert).
   */
  async createCategory(name) {
    if (!name || !name.trim()) throw new Error('Name darf nicht leer sein');
    if (this.categories.includes(name)) throw new Error('Kategorie existiert bereits');
    if (oberVon(name) !== name && !oberVon(name).trim()) throw new Error('Obergruppe fehlt');
    await this.ensureCategory(name);
  }

  /**
   * Benennt eine Kategorie um -- inkl. aller Funktionen, die aktuell darauf verweisen.
   */
  async renameCategory(oldName, newName) {
    if (!newName || !newName.trim()) throw new Error('Name darf nicht leer sein');
    if (!this.categories.includes(oldName)) throw new Error('Kategorie nicht gefunden');
    // Obergruppe umbenennen: ihre Untergruppen ziehen mit (24.10.2026)
    const kinder = this.untergruppen(oldName);
    if (kinder.length && oberVon(newName) !== newName) {
      throw new Error('Eine Gruppe mit Untergruppen kann nicht selbst Untergruppe werden');
    }
    const neuName = new Map([[oldName, newName], ...kinder.map(c => [c, newName + c.slice(oldName.length)])]);
    for (const [alt, neu] of neuName) {
      if (alt !== neu && this.categories.includes(neu) && !neuName.has(neu)) {
        throw new Error('Eine Kategorie mit diesem Namen existiert bereits');
      }
    }

    this.categories = this.categories.map(c => neuName.get(c) ?? c);
    if (oberVon(newName) !== newName && !this.categories.includes(oberVon(newName))) {
      this.categories.splice(this.categories.indexOf(newName), 0, oberVon(newName));   // neue Obergruppe davor
    }
    for (const func of Object.values(this.functions)) {
      // Defensiv: eine Funktion, die aus welchem Grund auch immer noch kein gültiges categories-Array
      // hat, darf hier nicht die ganze Umbenennung (inkl. Speichern) abbrechen (s. migrateToMultiCategory()).
      if (!Array.isArray(func.categories)) { func.categories = []; continue; }
      func.categories = func.categories.map(c => neuName.get(c) ?? c);
    }

    await this.saveCategories();
    await this.save();
  }

  /**
   * Sortiert die Gruppenreihenfolge neu (rein die Anzeige-Reihenfolge in categories.json, s.
   * getCategories()). `newOrder` muss exakt dieselben Namen wie this.categories enthalten, nur in
   * neuer Reihenfolge -- sonst wird nichts übernommen (kein teilweises/fehlerhaftes Ergebnis).
   */
  async reorderCategories(newOrder) {
    const same = Array.isArray(newOrder) && newOrder.length === this.categories.length
      && this.categories.every(c => newOrder.includes(c));
    if (!same) throw new Error('Neue Reihenfolge muss genau dieselben Gruppen enthalten');
    this.categories = [...newOrder];
    await this.saveCategories();
  }

  /**
   * Liefert für eine zu löschende Gruppe eine Vorschau: welche Funktionen komplett gelöscht würden
   * (sind in KEINER anderen Gruppe mehr) vs. welche nur diese Gruppenzugehörigkeit verlieren würden
   * (sind noch in mindestens einer anderen Gruppe). Rein lesend, für die doppelte Lösch-Bestätigung
   * im Client -- ändert nichts.
   */
  getDeletionImpact(name) {
    // Eine Obergruppe nimmt ihre Untergruppen mit (24.10.2026)
    const weg = new Set([name, ...this.untergruppen(name)]);
    const affected = Object.values(this.functions).filter(f => f.categories?.some(c => weg.has(c)));
    const toDelete = affected.filter(f => f.categories.every(c => weg.has(c)));
    const toDetach = affected.filter(f => !f.categories.every(c => weg.has(c)));
    return { toDelete, toDetach };
  }

  /**
   * Löscht eine Gruppe. Funktionen, die NUR in dieser Gruppe waren, werden komplett gelöscht (Hendriks
   * ausdrückliche Vorgabe, deshalb im Client eine doppelte Nachfrage davor); Funktionen, die noch in
   * mindestens einer anderen Gruppe sind, verlieren nur die Zugehörigkeit zu dieser Gruppe und bleiben
   * sonst unverändert erhalten (verschwinden also nicht "zufällig", weil sie mehrfach zugeordnet waren).
   */
  // funktionen: 'loeschen' = Funktionen, die nur in den gelöschten Gruppen stehen, mit löschen (bisher immer);
  // 'behalten' = sie verlieren nur die Gruppe und stehen danach in „Ohne Gruppe“ (Hendrik 24.10.2026: immer fragen)
  async deleteCategory(name, { funktionen = 'loeschen' } = {}) {
    if (!this.categories.includes(name)) throw new Error('Kategorie nicht gefunden');
    if (PROTECTED_CATEGORIES.includes(name)) {
      throw new Error(`"${name}" ist eine Systemgruppe und kann nicht gelöscht werden`);
    }

    const weg = new Set([name, ...this.untergruppen(name)]);
    if ([...weg].some(c => PROTECTED_CATEGORIES.includes(c))) throw new Error('Darin steckt eine Systemgruppe');
    const { toDelete } = this.getDeletionImpact(name);
    if (funktionen !== 'behalten') for (const func of toDelete) delete this.functions[func.id];
    for (const func of Object.values(this.functions)) {
      if (Array.isArray(func.categories)) func.categories = func.categories.filter(c => !weg.has(c));
    }

    this.categories = this.categories.filter(c => !weg.has(c));
    await this.saveCategories();
    await this.save();
  }

  /**
   * Neues Spiel ohne functions.json: leer anlegen und als neu merken -- die Funktionen kommen danach aus der
   * Grundausstattung (server/grundausstattung.js: inputBinding.xml des Spiels oder mitgelieferte Liste). Die früheren
   * Beispiel-Funktionen (Sprint, Springen, Schießen) gibt es seit 24.10.2026 nicht mehr.
   */
  async createDefaultFunctions() {
    this.functions = {};
    this.neu = true;
    await this.save();
  }

  /**
   * Gibt alle Funktionen zurück
   */
  getAllFunctions() {
    return Object.values(this.functions);
  }

  /**
   * Gibt Funktionen nach Gruppe zurück. `category === null` liefert die Auffanggruppe (Funktionen
   * ohne jede Gruppenzugehörigkeit) -- s. auch public/js/functionGroups.js für die Client-Entsprechung.
   */
  getFunctionsByCategory(category) {
    if (category === null) return Object.values(this.functions).filter(f => !f.categories?.length);
    return Object.values(this.functions).filter(f => f.categories?.includes(category));
  }

  /**
   * Gibt eine Funktion per ID zurück
   */
  getFunction(functionId) {
    return this.functions[functionId] || null;
  }

  /**
   * Erstellt oder aktualisiert eine Funktion
   */
  async setFunction(functionId, functionData) {
    // Validierung -- categories ist ein Array, darf aber leer sein (Funktion landet dann in der
    // Auffanggruppe, s. getFunctionsByCategory(null)); kein Pflichtfeld mehr wie früher `category`.
    if (!functionData.name) {
      throw new Error('Name ist erforderlich');
    }
    if (!Array.isArray(functionData.categories)) functionData.categories = [];

    // Für Ebenentaster reservierte Gamepad-Tasten (s. craftSlotLayerManager.js) dürfen nie von einer
    // normalen Funktion belegt werden -- sonst kollidiert das Ebenen-Signal mit einer echten Aktion.
    const reservedHit = functionData.actions?.find(
      a => a.type === 'gamepad' && ALL_RESERVED_GAMEPAD_BUTTONS.includes(a.buttonId)
    );
    if (reservedHit) {
      throw new Error(`Gamepad-Taste ${reservedHit.buttonId + 1} ist für Ebenentaster reserviert und kann keiner Funktion zugewiesen werden`);
    }

    // Gruppen stehen nicht fest -- eine neue Gruppe wird einfach mit aufgenommen statt abgelehnt.
    for (const cat of functionData.categories) await this.ensureCategory(cat);

    // Bedingung „nur auslösen, wenn …“ (Paket J, s. conditions.js) -- ungültige/leere fallen weg
    const condition = normalizeCondition(functionData.condition);
    if (condition) functionData.condition = condition;
    else delete functionData.condition;

    // Setze ID
    functionData.id = functionId;

    this.functions[functionId] = functionData;
    await this.save();
    console.log(`Funktion '${functionData.name}' gespeichert`);
  }

  /**
   * Löscht eine Funktion
   */
  async deleteFunction(functionId) {
    if (!this.functions[functionId]) {
      throw new Error('Funktion nicht gefunden');
    }

    delete this.functions[functionId];
    await this.save();
    console.log(`Funktion '${functionId}' gelöscht`);
  }

  /**
   * Löscht ALLE Funktionen und setzt die Kategorien auf die Startbelegung zurück (Entwickler-Werkzeug,
   * um Importe an einem sauberen Stand zu überprüfen -- ein reiner Funktions-Reset würde sonst
   * Kategorienamen aus einem vorherigen Import-Stand mitschleppen).
   */
  async deleteAllFunctions() {
    this.functions = {};
    this.categories = [...DEFAULT_CATEGORIES];
    await this.save();
    await this.saveCategories();
    await this.ensureBuiltinFunctions();   // Systemfunktionen gleich wieder da (23.10.2026, vorher erst nach Neustart)
    console.log('Alle Funktionen gelöscht, Kategorien zurückgesetzt');
  }

  /**
   * Exportiert alle Funktionen
   */
  exportFunctions() {
    return {
      version: '1.0',
      functions: this.functions,
      exportDate: new Date().toISOString()
    };
  }

  /**
   * Importiert Funktionen
   */
  async importFunctions(data, mode = 'merge') {
    if (!data?.functions || typeof data.functions !== 'object' || Array.isArray(data.functions)) {
      throw new Error('Ungültiges Import-Format');
    }
    // Jede Funktion wie beim Anlegen prüfen (23.10.2026): Name nötig, keine reservierten Gamepad-Tasten, Bedingung
    // bereinigt -- vorher kam alles ungeprüft herein. Ungültige werden übersprungen und gezählt.
    const incoming = {};
    let skipped = 0;
    for (const [id, raw] of Object.entries(data.functions)) {
      const func = raw && typeof raw === 'object' ? { ...raw } : null;
      const bad = !func || !func.name || !/^[\w:.-]{1,80}$/.test(id)
        || (func.actions || []).some(a => a?.type === 'gamepad' && ALL_RESERVED_GAMEPAD_BUTTONS.includes(a.buttonId));
      if (bad) { skipped++; continue; }
      if (!Array.isArray(func.categories)) func.categories = func.category ? [func.category] : [];
      const condition = normalizeCondition(func.condition);
      if (condition) func.condition = condition; else delete func.condition;
      func.id = id;
      incoming[id] = func;
    }

    if (mode === 'replace') {
      this.functions = incoming;
    } else {
      // Zusammenführen: neue kommen dazu, gleiche IDs werden aktualisiert
      Object.assign(this.functions, incoming);
    }

    this.migrateToMultiCategory();
    for (const func of Object.values(incoming)) {
      for (const cat of func.categories || []) await this.ensureCategory(cat);
    }

    await this.save();
    // Systemfunktionen (Makro abbrechen, Gamepad-Tasten) nach „Ersetzen“ gleich wieder anlegen -- sonst tat das
    // Standardprofil bis zum Neustart nichts mehr
    await this.ensureBuiltinFunctions();
    console.log(`Funktionen importiert (${mode}-Modus)${skipped ? `, ${skipped} ungültige übersprungen` : ''}`);
    return { imported: Object.keys(incoming).length, skipped };
  }

  /**
   * Speichert Funktionen in die Datei
   */
  async save() {
    try {
      const config = {
        functions: this.functions
      };
      await writeJsonAtomic(this.configPath, config); // atomar + .bak (23.10.2026)
    } catch (error) {
      console.error('Fehler beim Speichern der Funktionen:', error);
      throw error;
    }
  }
}
