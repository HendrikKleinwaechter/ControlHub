/**
 * State-Manager für Zustandsvergleich und Event-Erkennung
 * Vergleicht aktuelle und vorherige Frames und erkennt Änderungen
 */

import { MAIN_BUTTON_COUNT } from './config/modules.js';

export class StateManager {
  constructor() {
    this.previousFrame = null;
    this.currentFrame = null;
  }

  /**
   * Aktualisiert den Zustand mit einem neuen Frame
   * @param {Object} frame - Neuer Frame vom Parser
   * @returns {Object} Erkannte Events und Änderungen
   */
  update(frame) {
    this.previousFrame = this.currentFrame;
    this.currentFrame = frame;

    const events = {
      buttonDown: [],
      buttonUp: [],
      axisChanged: [],
      timestamp: frame.timestamp
    };

    // Bei erstem Frame keine Events generieren
    if (!this.previousFrame) {
      return events;
    }

    // Button-Events erkennen
    for (let i = 0; i < MAIN_BUTTON_COUNT; i++) {
      const prev = this.previousFrame.buttons[i];
      const curr = this.currentFrame.buttons[i];

      if (prev === 0 && curr === 1) {
        events.buttonDown.push(i);
      } else if (prev === 1 && curr === 0) {
        events.buttonUp.push(i);
      }
    }

    // Achsen-Änderungen erkennen (mit Deadzone für Rauschen)
    const deadzone = 100; // ca. 0.15% von 65535
    for (let i = 0; i < 16; i++) {
      const prev = this.previousFrame.axes[i];
      const curr = this.currentFrame.axes[i];

      if (Math.abs(curr - prev) > deadzone) {
        events.axisChanged.push({
          id: i,
          value: curr,
          delta: curr - prev
        });
      }
    }

    return events;
  }

  /**
   * Gibt den aktuellen Button-Zustand zurück
   * @param {number} buttonId - Button-ID (0-basiert, 0-127)
   * @returns {number} 0 oder 1
   */
  getButtonState(buttonId) {
    return this.currentFrame?.buttons[buttonId] ?? 0;
  }

  /**
   * Gibt den aktuellen Achsen-Wert zurück
   * @param {number} axisId - Achsen-ID (0-15)
   * @returns {number} Wert 0-65535
   */
  getAxisValue(axisId) {
    return this.currentFrame?.axes[axisId] ?? 0;
  }

  /**
   * Gibt den kompletten aktuellen Zustand zurück
   * @returns {Object|null} Aktueller Frame
   */
  getCurrentState() {
    return this.currentFrame;
  }

  /**
   * Setzt den State-Manager zurück
   */
  reset() {
    this.previousFrame = null;
    this.currentFrame = null;
  }
}
