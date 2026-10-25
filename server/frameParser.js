/**
 * Frame-Parser für eingehende Arduino-Daten
 * Parst Frames im Format: <FRAME>B:0/1 × 128 A:0–65535 × 16</FRAME>
 */

import { MAIN_BUTTON_COUNT } from './config/modules.js';

export class FrameParser {
  constructor() {
    this.buffer = '';
  }

  /**
   * Fügt neue Daten zum Buffer hinzu und versucht Frames zu extrahieren
   * @param {string} data - Neue serielle Daten
   * @returns {Array} Array von geparsten Frames
   */
  parse(data) {
    this.buffer += data;
    const frames = [];

    // Extrahiere alle vollständigen Frames
    let startIdx = this.buffer.indexOf('<FRAME>');
    let endIdx = this.buffer.indexOf('</FRAME>');

    while (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const frameContent = this.buffer.substring(startIdx + 7, endIdx);
      const parsedFrame = this.parseFrameContent(frameContent);

      if (parsedFrame) {
        frames.push(parsedFrame);
      }

      // Entferne verarbeitetes Frame aus Buffer
      this.buffer = this.buffer.substring(endIdx + 8);
      startIdx = this.buffer.indexOf('<FRAME>');
      endIdx = this.buffer.indexOf('</FRAME>');
    }

    // Verhindere Buffer-Overflow bei defekten Frames
    if (this.buffer.length > 10000) {
      console.warn('Frame-Buffer overflow, clearing...');
      this.buffer = '';
    }

    return frames;
  }

  /**
   * Parst den Inhalt eines einzelnen Frames
   * @param {string} content - Frame-Inhalt
   * @returns {Object|null} Geparster Frame oder null bei Fehler
   */
  parseFrameContent(content) {
    try {
      const frame = {
        buttons: new Array(MAIN_BUTTON_COUNT).fill(0),
        axes: new Array(16).fill(0),
        timestamp: Date.now()
      };

      // Teile in Button- und Axis-Teile
      const parts = content.trim().split(/\s+/);
      let parseMode = null;
      let buttonIdx = 0;
      let axisIdx = 0;

      for (const part of parts) {
        if (part.startsWith('B:')) {
          parseMode = 'button';
          const value = parseInt(part.substring(2));
          if (!isNaN(value) && (value === 0 || value === 1)) {
            frame.buttons[buttonIdx++] = value;
          }
        } else if (part.startsWith('A:')) {
          parseMode = 'axis';
          const value = parseInt(part.substring(2));
          if (!isNaN(value) && value >= 0 && value <= 65535) {
            frame.axes[axisIdx++] = value;
          }
        } else if (parseMode === 'button') {
          const value = parseInt(part);
          if (!isNaN(value) && (value === 0 || value === 1) && buttonIdx < MAIN_BUTTON_COUNT) {
            frame.buttons[buttonIdx++] = value;
          }
        } else if (parseMode === 'axis') {
          const value = parseInt(part);
          if (!isNaN(value) && value >= 0 && value <= 65535 && axisIdx < 16) {
            frame.axes[axisIdx++] = value;
          }
        }
      }

      // Validiere Frame-Vollständigkeit
      if (buttonIdx === MAIN_BUTTON_COUNT && axisIdx === 16) {
        return frame;
      } else {
        console.warn(`Unvollständiger Frame: ${buttonIdx}/${MAIN_BUTTON_COUNT} Buttons, ${axisIdx}/16 Achsen`);
        return null;
      }
    } catch (error) {
      console.error('Frame-Parsing-Fehler:', error);
      return null;
    }
  }

  /**
   * Setzt den Parser zurück
   */
  reset() {
    this.buffer = '';
  }
}
