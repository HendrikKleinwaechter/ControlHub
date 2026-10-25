/**
 * Macro-Engine (Vorgewendemanagement)
 * Steuert den Ablauf eines aktiven Makros: Schritt 0 feuert sofort, jeder weitere Schritt hat einen
 * eigenen Auslöser (Zeit/Strecke/Tastendruck). Nur ein Makro kann systemweit gleichzeitig aktiv sein.
 * Regel (Hendrik 23.10.2026, Durchsicht B5): Es laufen nie zwei Makros. Wird ein anderes Makro ausgelöst, während eines
 * läuft (Taste, Kachel, GPS-Auslöser), bricht das nur das laufende ab -- das neue startet erst beim nächsten Auslösen.
 * Reine Ablaufsteuerung -- Persistenz übernimmt macrosManager.js, Aktions-Anwendung mappingEngine.js.
 */

export class MacroEngine {
  /**
   * @param {Function} [onStatusChange] - optionaler Callback für den Status-Indikator in der
   *   Breadcrumb-Leiste (23.08.2026, Hendriks Wunsch), bekommt bei jeder Aktiv-/Warte-Zustandsänderung
   *   den aktuellen Stand ({active, macroId, macroName, waiting}, s. getStatus()). Zeigt dauerhaft ⏹,
   *   solange kein Makro aktiv ist (Ruhezustand, kein Sonderfall/Timer nötig) -- s. index.js.
   *   Server-seitig nur zum Weiterreichen an Socket.IO gedacht, deshalb hier ganz bewusst nur ein loser
   *   Callback statt einer direkten io-Abhängigkeit -- MacroEngine kennt Socket.IO sonst nirgends.
   */
  constructor(mappingEngine, macrosManager, functionsManager, onStatusChange) {
    this.mappingEngine = mappingEngine;
    this.macrosManager = macrosManager;
    this.functionsManager = functionsManager;
    this.onStatusChange = onStatusChange;

    this.activeMacroId = null;
    this.currentStepIndex = -1;
    this.distanceAccumulatedM = 0;
    this.pendingTimer = null;
    this.onHinweis = null;   // (text) => Meldung an die Tablets (index.js: 'macro-hinweis')
  }

  hinweis(text) { this.onHinweis?.(text); }

  /**
   * Aktueller Dauerzustand für neu verbundene Clients (s. index.js setupSocketIO(), Muster wie
   * telemetryReader.cachedCourse) -- damit ein Seiten-Reload sofort den echten Stand zeigt statt erst
   * bei der nächsten Zustandsänderung.
   */
  getStatus() {
    if (!this.activeMacroId) return { active: false };
    const macro = this.macrosManager.getMacro(this.activeMacroId);
    const nextStep = macro?.steps?.[this.currentStepIndex + 1];
    return {
      active: true,
      macroId: this.activeMacroId,
      macroName: macro?.name,
      waiting: nextStep?.trigger?.type === 'button',
      // Für den Makro-Status in der Statusleiste (Paket H): „Name · 2/5“ = Schritte bereits ausgelöst / gesamt
      step: this.currentStepIndex + 1,
      total: macro?.steps?.length || 0
    };
  }

  /**
   * Startet ein Makro: feuert Schritt 0 sofort, schaltet danach Schritt 1 scharf (falls vorhanden).
   * @param {string} macroId
   */
  start(macroId) {
    const macro = this.macrosManager.getMacro(macroId);
    if (!macro || !macro.steps || macro.steps.length === 0) {
      this.hinweis('Makro nicht gefunden oder ohne Schritte – nichts ausgelöst.');
      return;
    }
    // Es laufen nie zwei Makros (B5): ein anderes Makro bricht das laufende nur ab
    if (this.activeMacroId && this.activeMacroId !== macroId) {
      const laufend = this.macrosManager.getMacro(this.activeMacroId)?.name || 'Makro';
      this.abort();
      this.hinweis(`„${laufend}“ abgebrochen – es läuft immer nur ein Makro. „${macro.name}“ startet beim nächsten Auslösen.`);
      return;
    }

    this.clearPendingTimer();
    this.activeMacroId = macroId;
    this.currentStepIndex = 0;
    this.distanceAccumulatedM = 0;

    this.fireStep(macro.steps[0], true); // Start = Tastendruck von Hand

    if (macro.steps.length === 1) {
      // Einzelschritt-Makro ist mit Schritt 0 bereits fertig durchlaufen -- ohne diesen Abschluss
      // bliebe activeMacroId für immer gesetzt (advance(), das sonst den "letzter Schritt"-Fall
      // erkennt, läuft hier nie), wodurch ein erneuter Tastendruck fälschlich als Wiederholung statt
      // als neuer Start behandelt würde (s. handleButtonDown()/handleVirtualButtonDown()).
      this.abort();
    } else {
      this.armNextStep();
      this.notify();
    }
  }

  /**
   * Bricht das aktive Makro ab. Stoppt nur die Warteschlange -- bereits gefeuerte Schritte werden
   * NICHT rückgängig gemacht. Deckt sowohl echten Abbruch (Makro-Abbrechen-Aktion, durch ein neues
   * Makro überschrieben, aktives Makro gelöscht) als auch normales Durchlaufen bis zum letzten Schritt
   * ab -- beides führt zurück in den Ruhezustand, den der Indikator ohnehin dauerhaft als ⏹ zeigt.
   */
  abort() {
    this.clearPendingTimer();
    this.activeMacroId = null;
    this.currentStepIndex = -1;
    this.distanceAccumulatedM = 0;
    this.notify();
  }

  notify() {
    this.onStatusChange?.(this.getStatus());
  }

  /**
   * Wird aufgerufen, wenn die Taste des aktiven Makros erneut gedrückt wird. Wirkt nur, wenn der
   * aktuell wartende Schritt einen 'button'-Auslöser hat -- sonst no-op.
   * @param {string} macroId
   */
  handleButtonRepeat(macroId) {
    if (this.activeMacroId !== macroId) return;

    const macro = this.macrosManager.getMacro(macroId);
    const nextStep = macro?.steps?.[this.currentStepIndex + 1];
    if (nextStep && nextStep.trigger?.type === 'button') {
      this.advance(true);
    }
  }

  /**
   * Wird bei jeder Schreibrunde der Mod aufgerufen (2-30 pro Sekunde, je nach eingestellter Rate und
   * Sparmodus). Akkumuliert Strecke, wenn ein 'distance'-Schritt aussteht, und löst bei Erreichen des
   * Zielwerts advance() aus. Seit Phase 1 (21.10.2026) mit der echten Zeit seit dem letzten Tick statt
   * fest 0,25 s -- sonst würde die Strecke bei 30/s das 7,5-Fache messen.
   * @param {Object} data - Telemetrie-Daten ({available, speed, ...})
   */
  handleTelemetryTick(data) {
    const now = Date.now();
    const dtSec = this.lastTelemetryTickAt ? Math.min((now - this.lastTelemetryTickAt) / 1000, 1) : 0;
    this.lastTelemetryTickAt = (data && data.available !== false) ? now : null;
    if (!this.activeMacroId || !data || data.available === false) return;

    const macro = this.macrosManager.getMacro(this.activeMacroId);
    const nextStep = macro?.steps?.[this.currentStepIndex + 1];
    if (!nextStep || nextStep.trigger?.type !== 'distance') return;

    const speedKmh = data.base?.speedKmh ?? data.speed ?? 0; // Grundwert (Phase 3), Rohfeld als Rückfall
    this.distanceAccumulatedM += (speedKmh * 1000 / 3600) * dtSec;

    if (this.distanceAccumulatedM >= nextStep.trigger.meters) {
      this.advance();
    }
  }

  /**
   * Feuert den nächsten Schritt und schaltet dessen Nachfolger scharf, oder beendet das Makro,
   * wenn kein weiterer Schritt existiert.
   */
  advance(manual = false) {
    if (!this.activeMacroId) return;
    const macro = this.macrosManager.getMacro(this.activeMacroId);
    if (!macro) {
      this.abort();
      return;
    }

    this.clearPendingTimer();
    this.currentStepIndex++;
    const step = macro.steps[this.currentStepIndex];
    if (!step) {
      // Makro fertig durchlaufen
      this.abort();
      return;
    }

    this.fireStep(step, manual);

    if (this.currentStepIndex >= macro.steps.length - 1) {
      // Letzter Schritt gefeuert -- Makro fertig durchlaufen
      this.abort();
    } else {
      this.armNextStep();
      this.notify();
    }
  }

  /**
   * Schaltet den Auslöser für den Schritt nach dem aktuellen scharf (Timer bei 'time',
   * Distanzzähler nullen bei 'distance', bei 'button' nichts zu tun -- handleButtonRepeat() prüft
   * das direkt gegen currentStepIndex).
   */
  armNextStep() {
    const macro = this.macrosManager.getMacro(this.activeMacroId);
    const nextStep = macro?.steps?.[this.currentStepIndex + 1];
    if (!nextStep || !nextStep.trigger) return;

    if (nextStep.trigger.type === 'time') {
      this.pendingTimer = setTimeout(() => {
        this.pendingTimer = null;
        this.advance();
      }, nextStep.trigger.seconds * 1000);
    } else if (nextStep.trigger.type === 'distance') {
      this.distanceAccumulatedM = 0;
    }
    // 'button': keine Vorbereitung nötig
  }

  /**
   * Wendet die Actions des Schritts an -- entweder aus einer referenzierten Funktion (functionId)
   * oder direkt aus einer Schnellbelegung (quickActions, s. ActionPicker: Taste oder Achse). Beide
   * laufen über denselben pulseActions()-Aufruf, da ein Makro-Schritt nie "live gehalten" wird wie
   * eine physische Taste, sondern immer für eine feste Dauer pulst -- standardmäßig kurz (300ms, s.
   * pulseActions()-Default), optional aber je Schritt eine eigene Haltedauer (step.holdSeconds,
   * Hendriks Feature-Wunsch: manche FS25-Aktionen brauchen eine gehaltene statt kurz angetippte Taste;
   * bei einer Achsen-Schnellbelegung erzwingt das ActionPicker-UI eine Angabe hier statt sie optional
   * zu lassen).
   * Bedingung der Funktion („nur auslösen, wenn …“, Paket J, s. conditions.js): manual = Schritt per
   * Tastendruck (Start oder Auslöser „Taste“); nach Zeit/Strecke gilt er als automatisch -- bei
   * unbekanntem Wert wird dann nicht gesendet. Der Ablauf geht trotzdem zum nächsten Schritt weiter.
   * @param {Object} step - {functionId?, quickActions?, trigger?, holdSeconds?}
   * @param {boolean} [manual]
   */
  fireStep(step, manual = false) {
    const func = step.functionId ? this.functionsManager?.getFunction(step.functionId) : null;
    if (step.functionId && !func) {
      // Funktion inzwischen gelöscht (B2): nicht mehr still überspringen, sondern Bescheid geben
      const name = this.macrosManager.getMacro(this.activeMacroId)?.name || 'Makro';
      this.hinweis(`„${name}“, Schritt ${this.currentStepIndex + 1}: Die Funktion gibt es nicht mehr – Schritt übersprungen.`);
      return;
    }
    if (func?.condition && this.conditions && !this.conditions.allows(func.condition, { manual })) return;
    const actions = step.functionId ? func?.actions : step.quickActions;
    if (!actions) return;
    const durationMs = step.holdSeconds != null ? step.holdSeconds * 1000 : undefined;
    this.mappingEngine.pulseActions(actions, durationMs);
  }

  clearPendingTimer() {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
  }
}
