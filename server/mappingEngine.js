/**
 * Mapping-Engine für Button/Axis → Gamepad/Keyboard Zuordnung (Multi-Action Support)
 * Unterstützt mehrere gleichzeitige Aktionen pro Button/Achse
 * NEU: Unterstützt Function-IDs die zu Actions aufgelöst werden
 */

import { getModuleForButton, MAIN_BUTTON_COUNT } from './config/modules.js';
import { RESERVED_GAMEPAD_BUTTONS } from './craftSlotLayerManager.js';

export class MappingEngine {
  constructor(functionsManager = null, calibrationManager = null) {
    this.currentProfile = null;
    this.functionsManager = functionsManager;
    this.calibrationManager = calibrationManager;
    this.macroEngine = null; // s. setMacroEngine() -- für Vorgewendemanagement (server/macroEngine.js)
    this.craftSlotLayerConfig = null; // s. setCraftSlotLayerConfig() -- welche Taste je CraftSlot Ebenentaster ist
    this.axisAssignmentConfig = { mode: 'profile', globalAxes: {} }; // s. setAxisAssignmentConfig()
    this.gamepadState = {
      axes: new Array(16).fill(32768), // Neutral position (0-65535)
      buttons: new Array(MAIN_BUTTON_COUNT).fill(0)
    };
    this.heldKeys = new Set(); // aktuell gehaltene Tastatur-Tasten (Vollzustand, nicht DOWN/UP-Ereignisse)
    this.pulses = new Set();   // laufende Impulse (Makro-Schritte, Auslöser), s. pulseActions() -- überstehen reset()
    this.activeFunctions = {}; // Tracking für aktive Achsen-Funktionen: { axisId: { direction: 'plus'|'minus', functionId: '...' } }
    this.activeAxisTriggers = {}; // Tracking für aktive Achsen-Trigger: { functionId: true/false }
    // Merkt sich pro gehaltener Taste, was beim DRÜCKEN aufgelöst wurde (Function-ID/Array/Makro-String) --
    // handleButtonUp() gibt beim Loslassen exakt DAS wieder frei, nicht das, was die AKTUELLE Ebene gerade
    // sagen würde (die könnte sich geändert haben, während die Taste gehalten wurde -- sonst bliebe z.B.
    // eine Tastatur-Taste für immer gehalten).
    this.heldButtonResolvedItems = {};
  }

  /**
   * Setzt den FunctionsManager (für Function-ID zu Actions Auflösung)
   */
  setFunctionsManager(functionsManager) {
    this.functionsManager = functionsManager;
  }

  /**
   * Setzt den CalibrationManager (für globale Achsen-Kalibrierung)
   */
  setCalibrationManager(calibrationManager) {
    this.calibrationManager = calibrationManager;
  }

  /**
   * Setzt die MacroEngine (Vorgewendemanagement) -- handleButtonDown() leitet Tasten, die auf ein
   * Makro ("macro:<id>") oder den Abbrechen-Sondereintrag ("macro-abort") zeigen, dorthin um.
   */
  /**
   * Bedingungen „nur auslösen, wenn …“ (Paket J, s. conditions.js) -- ohne Checker gilt alles als erlaubt.
   */
  setConditionChecker(checker) {
    this.conditions = checker;
  }

  /**
   * Entfernt Funktionen, deren Bedingung gerade nicht erfüllt ist. Wird beim DRÜCKEN angewendet; das
   * Ergebnis landet in heldButtonResolvedItems, damit beim Loslassen genau das wieder freigegeben wird
   * (die Bedingung kann sich durch den Tastendruck selbst ändern, z. B. „Gerät absenken“).
   * Makro- und ControlHub-Einträge haben keine Bedingung.
   * @param {String|Array|null} items
   * @param {boolean} manual - Tastendruck von Hand (bei unbekanntem Wert trotzdem senden)
   */
  filterAllowed(items, manual) {
    if (!items || !this.conditions || !this.functionsManager) return items;
    const ok = (item) => {
      if (typeof item !== 'string' || item.startsWith('macro:') || item.startsWith('hub:')) return true;
      const func = this.functionsManager.getFunction(item);
      return !func?.condition || this.conditions.allows(func.condition, { manual });
    };
    if (typeof items === 'string') return ok(items) ? items : null;
    if (!Array.isArray(items)) return items;
    const kept = items.filter(ok);
    return kept.length > 0 ? kept : null;
  }

  /**
   * ControlHub-Aktionen ("hub:profile:<Name>", "hub:tiles:next|prev", "hub:tiles:show:<Seite>", Paket J)
   * wirken nur in ControlHub, nicht im Spiel -- sofort beim Drücken ausgeführt (onHubAction, s.
   * server/index.js runHubAction()), nichts davon wird gehalten. Gibt die übrigen Einträge zurück.
   */
  runHubItems(items) {
    const isHub = (item) => typeof item === 'string' && item.startsWith('hub:');
    if (isHub(items)) {
      this.onHubAction?.(items.slice(4));
      return null;
    }
    if (!Array.isArray(items) || !items.some(isHub)) return items;
    items.filter(isHub).forEach(item => this.onHubAction?.(item.slice(4)));
    const rest = items.filter(item => !isHub(item));
    return rest.length > 0 ? rest : null;
  }

  /**
   * Automatischer Auslöser (Vorgewende, Paket I, s. gpsEngine.js): wie ein kurzer Tastendruck, aber die
   * Bedingung „nur wenn …“ gilt mit „automatisch“ -- ist ihr Wert unbekannt, wird NICHT gesendet.
   * Makros starten (bzw. gehen bei „wartet auf Taste“ einen Schritt weiter) wie per Taste.
   * @param {String|Array} items - functionId ('macro:'/'hub:' inklusive) oder Schnellbelegung
   * @returns {boolean} ob etwas ausgelöst wurde
   */
  fireAutomatic(items, durationMs = 300) {
    items = this.filterAllowed(this.runHubItems(items), false);
    if (!items) return false;
    if (typeof items === 'string' && items.startsWith('macro:')) {
      if (!this.macroEngine) return false;
      const macroId = items.slice('macro:'.length);
      if (this.macroEngine.activeMacroId === macroId) this.macroEngine.handleButtonRepeat(macroId);
      else this.macroEngine.start(macroId);
      return true;
    }
    const actions = this.resolveToActions(items);
    if (!actions.length) return false;
    this.pulseActions(actions, durationMs);
    return true;
  }

  setMacroEngine(macroEngine) {
    this.macroEngine = macroEngine;
  }

  /**
   * Setzt, ob die Achsen-Slot-Zuordnung pro Profil (profile.axes, Standard) oder global (dieselbe
   * Zuordnung für alle Profile) gilt. { mode: 'profile'|'global', globalAxes: {...} }.
   */
  setAxisAssignmentConfig(config) {
    this.axisAssignmentConfig = config;
  }

  /**
   * Setzt die aktuelle CraftSlot-Ebenentaster-Konfiguration (global, s. craftSlotLayerManager.js),
   * z.B. { craftslot1: {layerButton1, layerButton2}, craftslot2: {...} }.
   */
  setCraftSlotLayerConfig(config) {
    this.craftSlotLayerConfig = config;
  }

  /**
   * Ist buttonId selbst ein konfigurierter Ebenentaster? Gibt {slotId, reservedButtonId} oder null.
   */
  getLayerButtonInfo(buttonId) {
    if (!this.craftSlotLayerConfig) return null;
    for (const slotId of ['craftslot1', 'craftslot2']) {
      const cfg = this.craftSlotLayerConfig[slotId];
      if (!cfg) continue;
      if (cfg.layerButton1 === buttonId) return { slotId, reservedButtonId: RESERVED_GAMEPAD_BUTTONS[slotId].layerButton1 };
      if (cfg.layerButton2 === buttonId) return { slotId, reservedButtonId: RESERVED_GAMEPAD_BUTTONS[slotId].layerButton2 };
    }
    return null;
  }

  /**
   * Zu welchem CraftSlot gehört diese (0-basierte) buttonId, falls überhaupt? modules.js arbeitet
   * 1-basiert (menschliche Zählung), deshalb +1 bei der Übergabe.
   */
  getCraftSlotIdForButton(buttonId) {
    const mod = getModuleForButton(buttonId + 1);
    return (mod && (mod.id === 'craftslot1' || mod.id === 'craftslot2')) ? mod.id : null;
  }

  /**
   * Aktuelle Ebene (1-4) eines CraftSlots, anhand des LIVE gehaltenen Zustands seiner Ebenentaster
   * (currentState.buttons -- derselbe Rohwert, den auch processAllAxes()/modifiers schon direkt lesen).
   */
  getCurrentCraftSlotLayer(slotId, currentState) {
    const cfg = this.craftSlotLayerConfig?.[slotId];
    if (!cfg) return 1;
    const held1 = cfg.layerButton1 != null && currentState.buttons[cfg.layerButton1] === 1;
    const held2 = cfg.layerButton2 != null && currentState.buttons[cfg.layerButton2] === 1;
    if (held1 && held2) return 4;
    if (held2) return 3;
    if (held1) return 2;
    return 1;
  }

  /**
   * Lädt ein Mapping-Profil
   * @param {Object} profile - Profil-Konfiguration
   */
  loadProfile(profile) {
    this.currentProfile = profile;
    this.reset();
  }

  /**
   * Verarbeitet Events und aktualisiert HID-Ausgabezustände
   * @param {Object} events - Events vom StateManager
   * @param {Object} currentState - Aktueller Frame-Zustand
   * @returns {Object} HID-Ausgabe (Gamepad + Keyboard)
   */
  process(events, currentState) {
    if (!this.currentProfile) {
      return this.getOutput();
    }

    // Button-Down Events verarbeiten
    for (const buttonId of events.buttonDown) {
      this.handleButtonDown(buttonId, currentState);
    }

    // Button-Up Events verarbeiten
    for (const buttonId of events.buttonUp) {
      this.handleButtonUp(buttonId);
    }

    // Achsen verarbeiten - kontinuierlich für analoge Funktionen
    // Verarbeite ALLE Achsen jeden Frame (nicht nur bei Change-Events)
    this.processAllAxes(currentState);

    // Achsen-Trigger verarbeiten (für Funktionen mit axisTriggers)
    this.processAxisTriggers(currentState);

    // Auch alle aktuell gedrückten Buttons für Gamepad-State berücksichtigen
    this.updateGamepadFromCurrentState(currentState);

    return this.getOutput();
  }

  /**
   * Löst Function-IDs zu Actions auf
   * @param {String|Array} items - Einzelne Function-ID (string), Array von Function-IDs (strings) oder Actions (objects)
   * @returns {Array} Array von Actions
   */
  resolveToActions(items) {
    if (!items) return [];

    const resolvedActions = [];

    // Einzelne Function-ID (string)
    if (typeof items === 'string') {
      if (this.functionsManager) {
        const func = this.functionsManager.getFunction(items);
        if (func && func.actions) {
          resolvedActions.push(...func.actions);
        }
      }
      return resolvedActions;
    }

    // Array von Function-IDs oder Actions
    if (!Array.isArray(items)) return [];

    for (const item of items) {
      if (typeof item === 'string') {
        // Es ist eine Function-ID
        if (this.functionsManager) {
          const func = this.functionsManager.getFunction(item);
          if (func && func.actions) {
            resolvedActions.push(...func.actions);
          }
        }
      } else if (typeof item === 'object' && item.type) {
        // Es ist eine direkte Action (altes Format, Abwärtskompatibilität)
        resolvedActions.push(item);
      }
    }

    return resolvedActions;
  }

  /**
   * Behandelt Button-Down Event (unterstützt Multi-Functions und einzelne Function)
   * @param {number} buttonId - Button-ID
   * @param {Object} currentState - Aktueller Frame-Zustand (für die Ebenen-Ermittlung, s. u.)
   */
  handleButtonDown(buttonId, currentState) {
    // Ebenentaster sind reine Modifier -- lösen NIE eine normale Funktion aus, nur das reservierte
    // Gamepad-Signal + den (sich automatisch aus dem gehaltenen Zustand ergebenden) Ebenenwechsel.
    const layerButtonInfo = this.getLayerButtonInfo(buttonId);
    if (layerButtonInfo) {
      this.gamepadState.buttons[layerButtonInfo.reservedButtonId] = 1;
      return;
    }

    let items = this.currentProfile.buttons?.[buttonId];

    // CraftSlot-Tasten: bei Ebene > 1 die ebenenspezifische Zuordnung statt profile.buttons verwenden --
    // aber NUR, wenn für diese Taste in dieser Ebene überhaupt ein Eintrag existiert. Kein Rückfall auf
    // Ebene I, wenn die Ebene keinen Eintrag hat (bewusst, s. Plan "Ebenenbelegung").
    const slotId = this.getCraftSlotIdForButton(buttonId);
    if (slotId && currentState) {
      const layer = this.getCurrentCraftSlotLayer(slotId, currentState);
      if (layer > 1) {
        items = this.currentProfile.craftSlotLayers?.[slotId]?.[layer]?.[buttonId];
      }
    }

    // ControlHub-Aktionen sofort, dann Bedingungen prüfen (Paket J)
    items = this.filterAllowed(this.runHubItems(items), true);

    // Merken, was JETZT aufgelöst wurde -- handleButtonUp() gibt beim Loslassen exakt das wieder frei,
    // unabhängig davon, ob sich die Ebene zwischenzeitlich geändert hat.
    this.heldButtonResolvedItems[buttonId] = items;

    if (!items) return;

    // Makro-Start wird wie eine normale Funktion zugewiesen (String-ID in profile.buttons), aber
    // nicht über resolveToActions() aufgelöst -- stattdessen an die MacroEngine delegiert (welches
    // Makro gestartet wird, ergibt sich erst zur Laufzeit aus den vorhandenen Makros, kann also keine
    // feste Funktion sein). Makro-ABBRUCH dagegen ist eine ganz normale Funktion mit der Aktion
    // {type:'macro-abort'} (s. Verarbeitung unten) -- wird von FunctionsManager fest angelegt.
    if (typeof items === 'string' && this.macroEngine) {
      if (items.startsWith('macro:')) {
        const macroId = items.slice('macro:'.length);
        if (this.macroEngine.activeMacroId === macroId) {
          this.macroEngine.handleButtonRepeat(macroId);
        } else if (this.macroEngine.activeMacroId) {
          // Ein anderes Makro läuft bereits -- dieser Druck bricht es nur ab, startet das neue NICHT
          this.macroEngine.abort();
        } else {
          this.macroEngine.start(macroId);
        }
        return;
      }
    }

    // Löse Function-IDs zu Actions auf (items kann string oder array sein)
    const actions = this.resolveToActions(items);

    // Führe alle zugeordneten Aktionen aus
    for (const action of actions) {
      if (action.type === 'keyboard') {
        this.heldKeys.add(action.key);
      } else if (action.type === 'gamepad') {
        if (action.buttonId !== undefined && action.buttonId < MAIN_BUTTON_COUNT) {
          this.gamepadState.buttons[action.buttonId] = 1;
        }
      } else if (action.type === 'macro-abort') {
        if (this.macroEngine) this.macroEngine.abort();
      } else if (action.type === 'axis') {
        // Achsen-Vollausschlag
        if (action.axisId !== undefined && action.axisId < 16) {
          this.gamepadState.axes[action.axisId] = action.value ?? 65535;
        }
      }
    }
  }

  /**
   * Behandelt Button-Up Event (unterstützt Multi-Functions und einzelne Function)
   * @param {number} buttonId - Button-ID
   */
  handleButtonUp(buttonId) {
    // Ebenentaster: nur das reservierte Gamepad-Signal wieder loslassen (s. handleButtonDown()).
    const layerButtonInfo = this.getLayerButtonInfo(buttonId);
    if (layerButtonInfo) {
      this.gamepadState.buttons[layerButtonInfo.reservedButtonId] = 0;
      return;
    }

    // Exakt das freigeben, was beim DRÜCKEN aufgelöst wurde -- nicht neu anhand der aktuellen Ebene
    // auflösen, die könnte sich geändert haben, während die Taste gehalten wurde (s. handleButtonDown()).
    const items = this.heldButtonResolvedItems[buttonId];
    delete this.heldButtonResolvedItems[buttonId];
    if (!items) return;

    // Löse Function-IDs zu Actions auf (items kann string oder array sein)
    const actions = this.resolveToActions(items);

    // Führe alle zugeordneten Aktionen aus
    for (const action of actions) {
      if (action.type === 'keyboard') {
        this.heldKeys.delete(action.key);
      } else if (action.type === 'gamepad') {
        if (action.buttonId !== undefined && action.buttonId < MAIN_BUTTON_COUNT) {
          this.gamepadState.buttons[action.buttonId] = 0;
        }
      } else if (action.type === 'axis') {
        // Achse zurück auf Neutral
        if (action.axisId !== undefined && action.axisId < 16) {
          this.gamepadState.axes[action.axisId] = 32768; // Neutral
        }
      }
    }
  }

  /**
   * Wie handleButtonDown()/handleButtonUp(), aber für virtuelle Bedienpanel-Tasten aus der Web-UI
   * (steuerungsmenues.js) statt physischer Hardware-Tasten -- bewusst EIGENSTÄNDIG statt
   * handleButtonDown() wiederzuverwenden: eine Bedienpanel-Taste hat weder eine numerische buttonId
   * noch Ebenen/CraftSlot-Zugehörigkeit, sie trägt ihre Zuordnung (functionId oder quickActions)
   * bereits direkt. trackingKey identifiziert die virtuelle Taste eindeutig fürs spätere Loslassen
   * (z.B. "panel:<pageId>:<buttonId>") und wird bewusst im SELBEN heldButtonResolvedItems-Objekt wie
   * physische Tasten geführt (String-Keys kollidieren nie mit den numerischen Keys echter Tasten).
   * Makro-Start/-Wiederholung/-Abbruch funktioniert identisch zu physischen Tasten, da macroEngine
   * rein über die macroId geht, nicht über die auslösende Taste.
   * @param {number} [pulseDurationSeconds] - Bei Achsen-Bindungen (s. steuerungsmenuesManager.js
   *   quickActionsDurationSeconds) statt Halten/Loslassen ein fester Impuls via pulseActions(), da ein
   *   Touch-Antippen anders als bei Tastatur-Tasten keinen sinnvollen "gehalten"-Zustand für eine Achse
   *   abbildet. Schreibt bewusst NICHT in heldButtonResolvedItems, damit das spätere
   *   handleVirtualButtonUp() für denselben trackingKey über die bestehende `if (!items) return;`-
   *   Absicherung automatisch zum No-op wird.
   */
  handleVirtualButtonDown(trackingKey, items, pulseDurationSeconds) {
    // ControlHub-Aktionen sofort, dann Bedingungen prüfen (Paket J) -- wie bei physischen Tasten
    items = this.filterAllowed(this.runHubItems(items), true);
    if (pulseDurationSeconds) {
      const actions = this.resolveToActions(items);
      this.pulseActions(actions, pulseDurationSeconds * 1000);
      return;
    }

    this.heldButtonResolvedItems[trackingKey] = items;
    if (!items) return;

    if (typeof items === 'string' && items.startsWith('macro:') && this.macroEngine) {
      const macroId = items.slice('macro:'.length);
      if (this.macroEngine.activeMacroId === macroId) {
        this.macroEngine.handleButtonRepeat(macroId);
      } else if (this.macroEngine.activeMacroId) {
        this.macroEngine.abort();
      } else {
        this.macroEngine.start(macroId);
      }
      return;
    }

    const actions = this.resolveToActions(items);
    for (const action of actions) {
      if (action.type === 'keyboard') {
        this.heldKeys.add(action.key);
      } else if (action.type === 'gamepad') {
        if (action.buttonId !== undefined && action.buttonId < MAIN_BUTTON_COUNT) {
          this.gamepadState.buttons[action.buttonId] = 1;
        }
      } else if (action.type === 'macro-abort') {
        if (this.macroEngine) this.macroEngine.abort();
      } else if (action.type === 'axis') {
        if (action.axisId !== undefined && action.axisId < 16) {
          this.gamepadState.axes[action.axisId] = action.value ?? 65535;
        }
      }
    }
  }

  handleVirtualButtonUp(trackingKey) {
    const items = this.heldButtonResolvedItems[trackingKey];
    delete this.heldButtonResolvedItems[trackingKey];
    if (!items) return;

    const actions = this.resolveToActions(items);
    for (const action of actions) {
      if (action.type === 'keyboard') {
        this.heldKeys.delete(action.key);
      } else if (action.type === 'gamepad') {
        if (action.buttonId !== undefined && action.buttonId < MAIN_BUTTON_COUNT) {
          this.gamepadState.buttons[action.buttonId] = 0;
        }
      } else if (action.type === 'axis') {
        if (action.axisId !== undefined && action.axisId < 16) {
          this.gamepadState.axes[action.axisId] = 32768;
        }
      }
    }
  }

  /**
   * Sicherheitsnetz gegen "hängengebliebene" Tasten/Aktionen, falls die Web-UI (Bedienpanel) getrennt
   * wird, während eine virtuelle Taste noch gehalten war (z.B. Tab neu geladen mitten im Tastendruck) --
   * ohne das bliebe z.B. eine Tastatur-Taste dauerhaft gehalten. Wird beim socket 'disconnect' gerufen.
   */
  releaseAllVirtualButtons(prefix = 'panel:') {
    for (const key of Object.keys(this.heldButtonResolvedItems)) {
      if (key.startsWith(prefix)) this.handleVirtualButtonUp(key);
    }
  }

  /**
   * Wendet Actions kurz an und hebt sie nach durationMs von selbst wieder auf (kein Bezug zu einer
   * gehaltenen physischen Taste) -- für Makro-Schritte (server/macroEngine.js), da FS25-Umschalt-
   * Aktionen wie Ausklappen/Zapfwelle einen kurzen Tastendruck erwarten, keinen Halte-Zustand.
   * @param {Array} actions - Actions (bereits aufgelöst, z.B. func.actions)
   * @param {number} durationMs - Dauer des "Tastendrucks" in ms
   */
  //
  // Seit 23.10.2026 (Durchsicht B5) getrennt von der Profil-Belegung: Impulse stehen in this.pulses und werden erst in
  // getOutput() dazugemischt. Vorher landeten sie direkt in heldKeys/gamepadState -- ein Profilwechsel (auch der
  // automatische) oder das Speichern einer Taste (loadProfile() → reset()) ließ z. B. „Gerät senken, 3 s halten“
  // sofort los, und die Achsen-Durchleitung konnte eine gepulste Achse im nächsten Frame überschreiben.
  pulseActions(actions, durationMs = 300) {
    if (!Array.isArray(actions) || actions.length === 0) return;
    const puls = { actions: actions.filter(a => a && typeof a === 'object') };
    this.pulses.add(puls);
    puls.timer = setTimeout(() => this.pulses.delete(puls), durationMs);
  }

  // Alle laufenden Impulse sofort beenden (Spielwechsel)
  releaseAllPulses() {
    for (const p of this.pulses) clearTimeout(p.timer);
    this.pulses.clear();
  }

  /**
   * Remappt einen Achsenwert basierend auf Kalibrierungsdaten
   * @param {number} value - Roher Eingabewert (0-65535)
   * @param {Object} calibration - Kalibrierungsdaten {centerValue, minValue, maxValue}
   * @returns {number} Remappter Wert (0-65535)
   */
  applyCalibration(value, calibration) {
    if (!calibration) return value;

    const { centerValue, minValue, maxValue } = calibration;

    // Wert unter der Mitte: von [minValue...centerValue] auf [0...32768] mappen
    if (value <= centerValue) {
      const inputRange = centerValue - minValue;
      if (inputRange === 0) return 32768;
      const normalized = (value - minValue) / inputRange;
      return Math.max(0, Math.min(32768, Math.round(normalized * 32768)));
    }
    // Wert über der Mitte: von [centerValue...maxValue] auf [32768...65535] mappen
    else {
      const inputRange = maxValue - centerValue;
      if (inputRange === 0) return 32768;
      const normalized = (value - centerValue) / inputRange;
      return Math.max(32768, Math.min(65535, Math.round(32768 + normalized * 32767)));
    }
  }

  /**
   * Verarbeitet alle Achsen kontinuierlich (jeden Frame)
   * Wichtig für flüssige proportionale Steuerung
   * @param {Object} currentState - Aktueller Zustand
   */
  processAllAxes(currentState) {
    if (!currentState?.axes) return;

    // Mehrere physische Achsen können sich bewusst denselben Ausgabe-Platz teilen (z.B. beide
    // CraftSlot-Thumbsticks für dieselbe Funktion) -- deshalb erst alle Beiträge pro Ziel-Slot
    // sammeln und danach je Slot entscheiden, statt direkt zu schreiben (sonst würde die zuletzt
    // verarbeitete Achse die andere in jedem Frame stumm überschreiben).
    const passthroughContributions = {}; // slot (0-7) -> [Werte]
    const isGlobalMode = this.axisAssignmentConfig?.mode === 'global';

    // Verarbeite alle konfigurierten Achsen
    for (let axisId = 0; axisId < 16; axisId++) {
      // Gamepad-Durchreichung: Quelle hängt vom Achsen-Zuordnung-Modus ab (Achsen-Zuordnung-Seite) --
      // Schwellwert-Funktionen (unten) bleiben davon unberührt, die gibt es nur pro Profil (kein
      // globales Äquivalent vorgesehen).
      const gamepadMapping = isGlobalMode
        ? this.axisAssignmentConfig.globalAxes?.[axisId]
        : this.currentProfile?.axes?.[axisId];

      if (gamepadMapping?.type === 'gamepad' && Number.isInteger(gamepadMapping.axisId)) {
        const value = this.computePassthroughValue(gamepadMapping, currentState.axes[axisId]);
        if (value !== undefined) {
          if (!passthroughContributions[gamepadMapping.axisId]) passthroughContributions[gamepadMapping.axisId] = [];
          passthroughContributions[gamepadMapping.axisId].push(value);
        }
        continue;
      }

      // Schwellwert-Funktionen: immer aus dem aktiven Profil, unabhängig vom Achsen-Zuordnung-Modus.
      const functionMapping = this.currentProfile?.axes?.[axisId];
      if (!functionMapping || (!functionMapping.functionPlus && !functionMapping.functionMinus)) continue;

      const value = currentState.axes[axisId];
      if (value === undefined) continue;

      // Behandle diese Achse
      this.handleAxisChange({ id: axisId, value: value }, currentState);
    }

    // Je Ziel-Slot: wer sich am weitesten von der Mitte entfernt hat, "gewinnt" -- entspricht dem
    // gewünschten Verhalten "wird gerade aktiv bewegt" bei zusammengelegten, redundanten Achsen.
    // Ruhen beide in der Mitte, bleibt der Slot ebenfalls in der Mitte.
    for (const slot of Object.keys(passthroughContributions)) {
      this.gamepadState.axes[slot] = this.pickMostDeflected(passthroughContributions[slot]);
    }
  }

  /**
   * Berechnet den durchgereichten Wert einer physischen Achse für die Ausgabe (Invertierung +
   * Mitten-Deadzone). Der Rohwert ist bereits firmwareseitig kalibriert (0..65535, Mitte 32768) --
   * absichtlich OHNE den separaten calibrationManager (der würde die Firmware-Kalibrierung doppeln).
   * @param {Object} mapping - profile.axes[N] Eintrag mit type:'gamepad', axisId (Ziel-Slot 0-7), invert, deadzone
   * @param {number} rawValue - Rohwert der physischen Achse (0..65535)
   * @returns {number|undefined}
   */
  computePassthroughValue(mapping, rawValue) {
    if (rawValue === undefined) return undefined;

    const center = 32768;
    let value = mapping.invert ? 65535 - rawValue : rawValue;

    const deadzone = mapping.deadzone || 0;
    if (Math.abs(value - center) < deadzone) {
      value = center;
    }

    return value;
  }

  /**
   * Wählt aus mehreren Werten, die sich einen Ausgabe-Slot teilen, denjenigen mit der größten
   * Auslenkung von der Mitte (32768) -- "wer gerade bewegt wird, gewinnt".
   * @param {number[]} values
   */
  pickMostDeflected(values) {
    const center = 32768;
    return values.reduce((best, v) => Math.abs(v - center) > Math.abs(best - center) ? v : best, center);
  }

  /**
   * Behandelt Achsen-Änderung
   * @param {Object} axisChange - Achsen-Event
   * @param {Object} currentState - Aktueller Zustand
   */
  handleAxisChange(axisChange, currentState) {
    const mapping = this.currentProfile.axes?.[axisChange.id];
    if (!mapping) return;

    let value = axisChange.value;

    // 1. Kalibrierung anwenden
    if (this.calibrationManager) {
      const calibration = this.calibrationManager.getCalibration(axisChange.id);
      if (calibration) {
        value = this.applyCalibration(value, calibration);
      }
    }

    const center = 32768;
    const deadzone = mapping.deadzone || 500;
    // Threshold ist in Prozent (0-100), konvertiere zu absolutem Wert
    const thresholdPercent = mapping.threshold || 50;
    const thresholdAbsolute = Math.round((thresholdPercent / 100) * 32767);

    // 2. Bestimme Distanz vom Mittelpunkt
    const distanceFromCenter = value - center;
    const absDistance = Math.abs(distanceFromCenter);

    // 3. Prüfe Deadzone - wenn in Deadzone, release beide Funktionen
    if (absDistance < deadzone) {
      this.releaseFunctionIfActive(axisChange.id, 'plus');
      this.releaseFunctionIfActive(axisChange.id, 'minus');
      return;
    }

    // 4. Bestimme Richtung
    const isPositive = distanceFromCenter > 0;
    const direction = isPositive ? 'plus' : 'minus';
    const oppositeDirection = isPositive ? 'minus' : 'plus';

    // Release die andere Richtung falls aktiv
    this.releaseFunctionIfActive(axisChange.id, oppositeDirection);

    // 5. Hole Funktion für diese Richtung
    const functionId = isPositive ? mapping.functionPlus : mapping.functionMinus;
    if (!functionId) return;

    const func = this.functionsManager?.getFunction(functionId);
    if (!func) return;

    // 6. Prüfe Funktions-Typ und entscheide Verhalten
    const isAnalogFunction = func.actionType === 'axis';

    if (isAnalogFunction) {
      // === ACHSEN-FUNKTION: Proportional ab Deadzone (kein Threshold) ===
      // Output startet bei Mitte (32768) und geht je nach Richtung zu Max oder Min
      const effectiveDistance = absDistance - deadzone;
      const maxDistance = 32767 - deadzone;
      const normalizedValue = effectiveDistance / maxDistance; // 0.0 bis 1.0

      let scaledValue;
      if (isPositive) {
        // Plus-Richtung: von Mitte (32768) nach Maximum (65535)
        scaledValue = Math.round(32768 + normalizedValue * 32767);
      } else {
        // Minus-Richtung: von Mitte (32768) nach Minimum (0)
        scaledValue = Math.round(32768 - normalizedValue * 32768);
      }

      this.executeAxisFunction(axisChange.id, func, scaledValue, direction);
    } else {
      // === KEYBOARD-FUNKTION: Digital, nur ab Threshold ===
      if (absDistance >= thresholdAbsolute) {
        // Threshold überschritten - aktiviere Funktion
        this.executeAxisFunction(axisChange.id, func, 65535, direction);
      } else {
        // Unter Threshold - release Funktion
        this.releaseFunctionIfActive(axisChange.id, direction);
      }
    }
  }

  /**
   * Aktualisiert Gamepad-State basierend auf aktuellem Zustand
   * @param {Object} currentState - Aktueller Frame
   */
  updateGamepadFromCurrentState(currentState) {
    if (!currentState || !this.currentProfile) return;

    // Gehaltene Tasten: genau das, was beim DRÜCKEN aufgelöst wurde (heldButtonResolvedItems), erneut setzen.
    // Bis 23.10.2026 stand hier profile.buttons[i] -- ohne Ebene, Bedingung und Ebenentaster; die so gesetzten
    // Gamepad-Tasten gab handleButtonUp() nie frei, sie hingen dann im Spiel (z. B. Ebenentaster im Standardprofil).
    for (const [key, items] of Object.entries(this.heldButtonResolvedItems)) {
      const id = Number(key);
      if (Number.isInteger(id) && currentState.buttons?.[id] !== 1) continue;   // physische Taste nicht mehr gehalten
      for (const action of this.resolveToActions(items)) {
        if (action.type === 'gamepad' && action.buttonId !== undefined && action.buttonId < MAIN_BUTTON_COUNT) {
          this.gamepadState.buttons[action.buttonId] = 1;
        } else if (action.type === 'axis' && action.axisId !== undefined && action.axisId < 16) {
          this.gamepadState.axes[action.axisId] = action.value ?? 65535;
        }
      }
    }

    // Hinweis: physische Achsen werden NICHT hier verarbeitet -- entweder sie triggern Funktionen
    // über functionPlus/functionMinus (handleAxisChange()) oder sie werden proportional auf eine
    // Ausgabe-Achse durchgereicht (applyGamepadAxisPassthrough()), beides schon in processAllAxes().
  }

  /**
   * Gibt den aktuellen HID-Ausgabezustand zurück
   * @returns {Object} Gamepad- und Keyboard-Daten
   */
  getOutput() {
    const axes = [...this.gamepadState.axes];
    const buttons = [...this.gamepadState.buttons];
    const keys = new Set(this.heldKeys);
    // Laufende Impulse (pulseActions) obendrauf: Tasten zusätzlich gedrückt, eine gepulste Achse hat Vorrang
    for (const p of this.pulses) {
      for (const action of p.actions) {
        if (action.type === 'keyboard' && action.key) keys.add(action.key);
        else if (action.type === 'gamepad' && action.buttonId !== undefined && action.buttonId < MAIN_BUTTON_COUNT) buttons[action.buttonId] = 1;
        else if (action.type === 'axis' && action.axisId !== undefined && action.axisId < 16) axes[action.axisId] = action.value ?? 65535;
      }
    }
    return {
      gamepad: { axes, buttons },
      keyboard: [...keys]
    };
  }

  /**
   * Setzt den Mapping-Zustand zurück
   */
  reset() {
    this.gamepadState = {
      axes: new Array(16).fill(32768),
      buttons: new Array(MAIN_BUTTON_COUNT).fill(0)
    };
    this.heldKeys.clear();
    this.activeFunctions = {};
    this.activeAxisTriggers = {};
    this.heldButtonResolvedItems = {};
  }

  /**
   * Führt eine Funktion aus, die durch eine Achse getriggert wurde
   * @param {number} axisId - Achsen-ID (0-15)
   * @param {Object} func - Funktionsobjekt
   * @param {number} scaledValue - Skalierter Wert (0-65535)
   * @param {string} direction - 'plus' oder 'minus'
   */
  executeAxisFunction(axisId, func, scaledValue, direction) {
    // Prüfe ob bereits aktiv
    const activeKey = `axis-${axisId}`;
    const current = this.activeFunctions[activeKey];

    // Wenn andere Richtung aktiv war, release
    if (current && current.direction !== direction) {
      this.releaseFunctionActions(current.functionId);
    }

    // Merke als aktiv
    this.activeFunctions[activeKey] = { direction, functionId: func.id };

    // Prüfe ob Funktion analog arbeiten soll (actionType === 'axis')
    const isAnalogFunction = func.actionType === 'axis';

    // Führe Actions aus
    for (const action of func.actions) {
      if (action.type === 'gamepad') {
        // Gamepad-Buttons werden immer digital geschaltet (an/aus)
        this.gamepadState.buttons[action.buttonId] = 1;
      }
      else if (action.type === 'keyboard') {
        this.heldKeys.add(action.key); // Set.add() ist idempotent -- kein manueller Duplikat-Schutz mehr nötig
      }
      else if (action.type === 'axis') {
        // Für Achsen-Funktionen: nutze skalierten Wert (proportional)
        // Für Keyboard-Funktionen: nutze fixen Wert aus Action (digital)
        const axisValue = isAnalogFunction ? scaledValue : (action.value ?? 65535);
        this.gamepadState.axes[action.axisId] = axisValue;
      }
    }
  }

  /**
   * Released eine Funktion wenn sie aktiv ist
   * @param {number} axisId - Achsen-ID
   * @param {string} direction - 'plus' oder 'minus'
   */
  releaseFunctionIfActive(axisId, direction) {
    const activeKey = `axis-${axisId}`;
    const current = this.activeFunctions[activeKey];

    if (current && current.direction === direction) {
      this.releaseFunctionActions(current.functionId);
      delete this.activeFunctions[activeKey];
    }
  }

  /**
   * Released alle Actions einer Funktion
   * @param {string} functionId - Function-ID
   */
  releaseFunctionActions(functionId) {
    const func = this.functionsManager?.getFunction(functionId);
    if (!func) return;

    for (const action of func.actions) {
      if (action.type === 'gamepad') {
        this.gamepadState.buttons[action.buttonId] = 0;
      }
      else if (action.type === 'keyboard') {
        this.heldKeys.delete(action.key);
      }
      else if (action.type === 'axis') {
        this.gamepadState.axes[action.axisId] = 32768; // Neutral
      }
    }
  }

  /**
   * Konvertiert Prozentwert zu absolutem Achsenwert
   * @param {number} percent - Prozentwert (0-100)
   * @param {string} direction - 'plus' oder 'minus'
   * @returns {number} Absoluter Wert (0-65535)
   */
  percentToAxisValue(percent, direction) {
    const center = 32768;
    if (direction === 'plus') {
      // 0% = 32768 (Mitte), 100% = 65535 (Maximum)
      return Math.round(center + (32767 * percent / 100));
    } else {
      // 0% = 32768 (Mitte), 100% = 0 (Minimum)
      return Math.round(center - (center * percent / 100));
    }
  }

  /**
   * Berechnet den Prozentwert einer Achsenposition relativ zur Mitte
   * @param {number} value - Absoluter Achsenwert (0-65535)
   * @param {string} direction - 'plus' oder 'minus'
   * @returns {number} Prozentwert (0-100)
   */
  axisValueToPercent(value, direction) {
    const center = 32768;
    if (direction === 'plus') {
      // Nur positive Abweichung vom Zentrum zählen
      if (value <= center) return 0;
      return Math.round(((value - center) / 32767) * 100);
    } else {
      // Nur negative Abweichung vom Zentrum zählen
      if (value >= center) return 0;
      return Math.round(((center - value) / center) * 100);
    }
  }

  /**
   * Verarbeitet Achsen-Trigger für Funktionen
   * @param {Object} currentState - Aktueller Frame-Zustand
   */
  processAxisTriggers(currentState) {
    const axisTriggers = this.currentProfile?.axisTriggers;
    if (!axisTriggers || !this.functionsManager) return;

    // Iteriere über alle konfigurierten Achsen-Trigger
    for (const [functionId, trigger] of Object.entries(axisTriggers)) {
      const { axis, direction, activationThreshold, deactivationThreshold, modifiers } = trigger;

      // Hole aktuellen Achsenwert
      let axisValue = currentState.axes?.[axis] ?? 32768;

      // Wende Kalibrierung an falls vorhanden
      if (this.calibrationManager) {
        const calibration = this.calibrationManager.getCalibration(axis);
        if (calibration) {
          axisValue = this.applyCalibration(axisValue, calibration);
        }
      }

      // Berechne aktuellen Prozentwert
      const currentPercent = this.axisValueToPercent(axisValue, direction);

      // Prüfe Modifikatoren (wenn definiert, müssen alle gedrückt sein)
      let modifiersActive = true;
      if (modifiers && modifiers.length > 0) {
        for (const modButtonId of modifiers) {
          if (currentState.buttons?.[modButtonId] !== 1) {
            modifiersActive = false;
            break;
          }
        }
      }

      // Hole aktuelle Funktion
      const func = this.functionsManager.getFunction(functionId);
      if (!func) continue;

      // Aktueller Status des Triggers
      const wasActive = this.activeAxisTriggers[functionId] === true;

      // Bestimme ob Trigger aktiv sein soll
      let shouldBeActive = false;

      if (modifiersActive) {
        if (wasActive) {
          // War aktiv - prüfe Deaktivierungsschwelle
          shouldBeActive = currentPercent >= deactivationThreshold;
        } else {
          // War nicht aktiv - prüfe Aktivierungsschwelle
          shouldBeActive = currentPercent >= activationThreshold;
        }
      }

      // Zustandsänderung verarbeiten
      if (shouldBeActive && !wasActive) {
        // Aktivierung
        this.activateAxisTriggerFunction(functionId, func);
        this.activeAxisTriggers[functionId] = true;
      } else if (!shouldBeActive && wasActive) {
        // Deaktivierung
        this.deactivateAxisTriggerFunction(functionId, func);
        this.activeAxisTriggers[functionId] = false;
      }
    }
  }

  /**
   * Aktiviert eine Funktion durch Achsen-Trigger
   * @param {string} functionId - Function-ID
   * @param {Object} func - Funktionsobjekt
   */
  activateAxisTriggerFunction(functionId, func) {
    if (!func.actions) return;

    for (const action of func.actions) {
      if (action.type === 'gamepad') {
        if (action.buttonId !== undefined && action.buttonId < MAIN_BUTTON_COUNT) {
          this.gamepadState.buttons[action.buttonId] = 1;
        }
      } else if (action.type === 'keyboard') {
        this.heldKeys.add(action.key);
      } else if (action.type === 'axis') {
        if (action.axisId !== undefined && action.axisId < 16) {
          this.gamepadState.axes[action.axisId] = action.value ?? 65535;
        }
      }
    }
  }

  /**
   * Deaktiviert eine Funktion durch Achsen-Trigger
   * @param {string} functionId - Function-ID
   * @param {Object} func - Funktionsobjekt
   */
  deactivateAxisTriggerFunction(functionId, func) {
    if (!func.actions) return;

    for (const action of func.actions) {
      if (action.type === 'gamepad') {
        if (action.buttonId !== undefined && action.buttonId < MAIN_BUTTON_COUNT) {
          this.gamepadState.buttons[action.buttonId] = 0;
        }
      } else if (action.type === 'keyboard') {
        this.heldKeys.delete(action.key);
      } else if (action.type === 'axis') {
        if (action.axisId !== undefined && action.axisId < 16) {
          this.gamepadState.axes[action.axisId] = 32768; // Neutral
        }
      }
    }
  }
}
