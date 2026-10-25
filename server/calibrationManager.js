/**
 * Verwaltet globale Achsen-Kalibrierungsdaten
 * Kalibrierung ist Hardware-spezifisch und gilt für alle Profile
 */

import path from 'path';
import { readJsonFile, writeJsonAtomic } from './jsonStore.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class CalibrationManager {
  constructor(calibrationPath = path.join(__dirname, 'config', 'calibration.json')) {
    this.calibrationPath = calibrationPath;
    this.calibration = {
      axes: {
        0: null,
        1: null,
        2: null,
        3: null
      },
      // Achsen-Zuordnung (welche physische Achse auf welchen Gamepad-Ausgabe-Platz geht) ist normalerweise
      // pro Profil gespeichert (profile.axes) -- assignmentMode:'global' schaltet stattdessen auf DIESE
      // eine gemeinsame Zuordnung um, unabhängig vom aktiven Profil. Bewusst kein Migrations-Automatismus
      // beim Umschalten: bestehende Pro-Profil-Zuordnungen bleiben einfach ungenutzt liegen.
      assignmentMode: 'profile',
      globalAxes: {}
    };
  }

  async initialize() {
    // Lesen über jsonStore (23.10.2026): kaputte Datei als .defekt gesichert (notfalls .bak) -- erst dann neu anlegen
    const { data, status } = await readJsonFile(this.calibrationPath, { fallback: null });
    if (status === 'ok' || status === 'restored') {
      // Zusammenführen statt Ersetzen -- eine ältere Datei ohne assignmentMode/globalAxes (vor dieser
      // Erweiterung geschrieben) soll die neuen Default-Felder nicht verlieren.
      this.calibration = { ...this.calibration, ...data };
    } else {
      console.log(status === 'broken'
        ? 'Kalibrierungsdaten beschädigt, erstelle neue Datei'
        : 'Keine Kalibrierungsdaten gefunden, erstelle neue Datei');
      await this.save();
    }
  }

  async save() {
    await writeJsonAtomic(this.calibrationPath, this.calibration); // atomar + .bak (23.10.2026)
  }

  getCalibration(axisId) {
    return this.calibration.axes[axisId] || null;
  }

  async setCalibration(axisId, calibrationData) {
    this.calibration.axes[axisId] = calibrationData;
    await this.save();
  }

  getAllCalibrations() {
    return this.calibration.axes;
  }

  getAssignmentMode() {
    return this.calibration.assignmentMode || 'profile';
  }

  async setAssignmentMode(mode) {
    if (mode !== 'profile' && mode !== 'global') throw new Error('Ungültiger Modus');
    this.calibration.assignmentMode = mode;
    await this.save();
  }

  getGlobalAxes() {
    return this.calibration.globalAxes || {};
  }

  async setGlobalAxis(physicalIndex, mapping) {
    if (!this.calibration.globalAxes) this.calibration.globalAxes = {};
    if (mapping === null) {
      delete this.calibration.globalAxes[physicalIndex];
    } else {
      this.calibration.globalAxes[physicalIndex] = mapping;
    }
    await this.save();
  }
}
