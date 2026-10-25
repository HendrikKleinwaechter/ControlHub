/**
 * Fertig gestaltete Vorlagen-Kacheln (Hendrik 24.10.2026: „übernimm die Einstellungen für die Kacheln und die
 * Kachelübersichten, … die sollen dann die Standardversion sein“). Anders als die übrigen Vorlagen in bausteinVorlagen.js
 * nicht aus Zeilen und Spalten berechnet, sondern so übernommen, wie sie im Kachel-Editor gestaltet wurden: Grundform und
 * jede Kachelform. Aufbau wie eine Vorlage (Elemente mit key, varianten je Form nach key).
 * Aus einer Spiel-Sicherung erzeugt -- nicht von Hand ändern, sondern neu gestalten, sichern und neu erzeugen.
 */
export const GESTALTET = {
 "cockpit": {
  "varianten": {
   "1x1": {
    "speed": {
     "x": 28.79,
     "y": 34.51,
     "width": 54.52,
     "height": 47.71,
     "a": 1.36
    },
    "rpm": {
     "hidden": true
    },
    "gear": {
     "x": 78.28,
     "y": 34.51,
     "width": 40.39,
     "height": 47.71,
     "a": 1.36
    },
    "cruise": {
     "hidden": true
    },
    "motor_temp": {
     "hidden": true
    },
    "light_low": {
     "hidden": true
    },
    "beacon": {
     "hidden": true
    },
    "handbrake": {
     "hidden": true
    },
    "ai": {
     "hidden": true
    },
    "motor_on": {
     "hidden": true
    },
    "fuel_pct": {
     "x": 50,
     "y": 83.82,
     "width": 96.95,
     "height": 20.74,
     "a": 1.36,
     "hidden": true
    },
    "adblue_pct": {
     "hidden": true
    },
    "all_fill_pct": {
     "hidden": true
    },
    "damage": {
     "hidden": true
    },
    "dirt": {
     "hidden": true
    },
    "sel_fill": {
     "x": 50.42,
     "y": 83.29,
     "width": 96.1,
     "height": 22.5,
     "a": 1.36
    }
   },
   "1x2": {
    "speed": {
     "x": 17.78,
     "y": 50,
     "width": 34.08,
     "height": 33.95,
     "a": 2.82
    },
    "rpm": {
     "hidden": true
    },
    "gear": {
     "x": 50,
     "y": 17.13,
     "width": 28.4,
     "height": 10.66,
     "a": 2.82
    },
    "cruise": {
     "x": 50,
     "y": 50,
     "width": 28.4,
     "height": 10.66,
     "a": 2.82
    },
    "motor_temp": {
     "hidden": true
    },
    "light_low": {
     "hidden": true
    },
    "beacon": {
     "hidden": true
    },
    "handbrake": {
     "hidden": true
    },
    "ai": {
     "hidden": true
    },
    "motor_on": {
     "hidden": true
    },
    "fuel_pct": {
     "x": 82.22,
     "y": 25.35,
     "width": 34.08,
     "height": 16.48,
     "a": 2.82
    },
    "adblue_pct": {
     "x": 82.22,
     "y": 74.65,
     "width": 34.08,
     "height": 16.48,
     "a": 2.82
    },
    "all_fill_pct": {
     "hidden": true
    },
    "damage": {
     "hidden": true
    },
    "dirt": {
     "hidden": true
    },
    "sel_fill": {
     "x": 50,
     "y": 82.87,
     "width": 28.4,
     "height": 10.66,
     "a": 2.82
    }
   },
   "1x3": {
    "speed": {
     "x": 9.74,
     "y": 50,
     "width": 18.52,
     "height": 22.34,
     "a": 4.29
    },
    "rpm": {
     "x": 27.7,
     "y": 50,
     "width": 16.1,
     "height": 22.34,
     "a": 4.29
    },
    "gear": {
     "x": 43.24,
     "y": 25.35,
     "width": 13.69,
     "height": 10.85,
     "a": 4.29
    },
    "cruise": {
     "x": 43.24,
     "y": 74.65,
     "width": 13.69,
     "height": 10.85,
     "a": 4.29
    },
    "motor_temp": {
     "x": 57.57,
     "y": 74.65,
     "width": 13.69,
     "height": 10.85,
     "a": 4.29
    },
    "light_low": {
     "x": 91.87,
     "y": 17.13,
     "width": 15.3,
     "height": 7.02,
     "a": 4.29
    },
    "beacon": {
     "x": 91.87,
     "y": 50,
     "width": 15.3,
     "height": 7.02,
     "a": 4.29
    },
    "handbrake": {
     "hidden": true
    },
    "ai": {
     "hidden": true
    },
    "motor_on": {
     "x": 91.87,
     "y": 82.87,
     "width": 15.3,
     "height": 7.02,
     "a": 4.29
    },
    "fuel_pct": {
     "x": 74.32,
     "y": 25.35,
     "width": 18.52,
     "height": 10.85,
     "a": 4.29
    },
    "adblue_pct": {
     "x": 74.32,
     "y": 74.65,
     "width": 18.52,
     "height": 10.85,
     "a": 4.29
    },
    "all_fill_pct": {
     "hidden": true
    },
    "damage": {
     "hidden": true
    },
    "dirt": {
     "hidden": true
    },
    "sel_fill": {
     "x": 57.57,
     "y": 25.35,
     "width": 13.69,
     "height": 10.85,
     "a": 4.29
    }
   },
   "2x1": {
    "speed": {
     "x": 50,
     "y": 18.01,
     "width": 96.95,
     "height": 56.71,
     "a": 0.6
    },
    "rpm": {
     "hidden": true
    },
    "gear": {
     "x": 25.25,
     "y": 42.9,
     "width": 47.46,
     "height": 21.81,
     "a": 0.6
    },
    "cruise": {
     "x": 74.75,
     "y": 42.9,
     "width": 47.46,
     "height": 21.81,
     "a": 0.6
    },
    "motor_temp": {
     "x": 74.75,
     "y": 57.27,
     "width": 47.46,
     "height": 21.81,
     "a": 0.6
    },
    "light_low": {
     "x": 25.25,
     "y": 95.14,
     "width": 47.46,
     "height": 13.09,
     "a": 0.6
    },
    "beacon": {
     "x": 74.75,
     "y": 95.14,
     "width": 47.46,
     "height": 13.09,
     "a": 0.6
    },
    "handbrake": {
     "hidden": true
    },
    "ai": {
     "hidden": true
    },
    "motor_on": {
     "hidden": true
    },
    "fuel_pct": {
     "x": 50,
     "y": 70.99,
     "width": 96.95,
     "height": 19.63,
     "a": 0.6
    },
    "adblue_pct": {
     "x": 50,
     "y": 84.05,
     "width": 96.95,
     "height": 19.63,
     "a": 0.6
    },
    "all_fill_pct": {
     "hidden": true
    },
    "damage": {
     "hidden": true
    },
    "dirt": {
     "hidden": true
    },
    "sel_fill": {
     "x": 25.26,
     "y": 57.27,
     "width": 47.46,
     "height": 21.81,
     "a": 0.6
    }
   },
   "2x2": {
    "speed": {
     "x": 29.19,
     "y": 22.39,
     "width": 56.9,
     "height": 34.31,
     "a": 1.25
    },
    "rpm": {
     "x": 78.94,
     "y": 22.39,
     "width": 40.65,
     "height": 34.31,
     "a": 1.25
    },
    "gear": {
     "x": 12.68,
     "y": 51.79,
     "width": 23.9,
     "height": 10.72,
     "a": 1.25
    },
    "cruise": {
     "x": 37.56,
     "y": 51.79,
     "width": 23.9,
     "height": 10.72,
     "a": 1.25
    },
    "motor_temp": {
     "x": 87.32,
     "y": 51.79,
     "width": 23.9,
     "height": 10.72,
     "a": 1.25
    },
    "light_low": {
     "x": 10.2,
     "y": 64.76,
     "width": 18.92,
     "height": 8.04,
     "a": 1.25
    },
    "beacon": {
     "x": 30.1,
     "y": 64.76,
     "width": 18.92,
     "height": 8.04,
     "a": 1.25
    },
    "handbrake": {
     "x": 50,
     "y": 64.76,
     "width": 18.92,
     "height": 8.04,
     "a": 1.25
    },
    "ai": {
     "x": 69.9,
     "y": 64.76,
     "width": 18.92,
     "height": 8.04,
     "a": 1.25
    },
    "motor_on": {
     "x": 89.8,
     "y": 64.76,
     "width": 18.92,
     "height": 8.04,
     "a": 1.25
    },
    "fuel_pct": {
     "x": 16.83,
     "y": 77.73,
     "width": 32.19,
     "height": 10.72,
     "a": 1.25
    },
    "adblue_pct": {
     "x": 50,
     "y": 77.73,
     "width": 32.19,
     "height": 10.72,
     "a": 1.25
    },
    "all_fill_pct": {
     "x": 83.17,
     "y": 77.73,
     "width": 32.19,
     "height": 10.72,
     "a": 1.25
    },
    "damage": {
     "x": 25.12,
     "y": 92.37,
     "width": 48.77,
     "height": 10.72,
     "a": 1.25
    },
    "dirt": {
     "x": 74.88,
     "y": 92.37,
     "width": 48.77,
     "height": 10.72,
     "a": 1.25
    }
   }
  },
  "displays": [
   {
    "key": "speed",
    "x": 20.3,
    "y": 34.66,
    "width": 39.63,
    "height": 38.02,
    "value": "speed",
    "type": "tacho",
    "range": "auto",
    "warn": 0,
    "dec": 0,
    "show": "immer",
    "locked": false
   },
   {
    "key": "rpm",
    "x": 56.6,
    "y": 34.66,
    "width": 31.7,
    "height": 38.02,
    "value": "rpm",
    "label": "Drehzahl",
    "type": "tacho",
    "range": "auto",
    "warn": 0,
    "dec": 0,
    "show": "immer",
    "locked": false
   },
   {
    "key": "gear",
    "x": 86.31,
    "y": 8.88,
    "width": 26.42,
    "height": 9.02,
    "value": "gear",
    "label": "Gang",
    "type": "text",
    "range": "auto",
    "warn": 0,
    "dec": 0,
    "show": "immer",
    "locked": false
   },
   {
    "key": "cruise",
    "x": 86.31,
    "y": 26.07,
    "width": 26.42,
    "height": 9.02,
    "value": "cruise",
    "label": "Tempomat",
    "type": "zahl",
    "range": "auto",
    "warn": 0,
    "dec": 0,
    "show": "immer",
    "locked": false
   },
   {
    "key": "motor_temp",
    "x": 86.31,
    "y": 60.44,
    "width": 26.42,
    "height": 9.02,
    "value": "motor_temp",
    "label": "Motortemperatur",
    "type": "zahl",
    "range": "auto",
    "warn": 0,
    "dec": 0,
    "show": "immer",
    "locked": false
   },
   {
    "key": "light_low",
    "x": 10.13,
    "y": 75.01,
    "width": 19.29,
    "height": 6.08,
    "value": "light_low",
    "label": "Licht",
    "type": "leuchte",
    "range": "auto",
    "warn": 0,
    "dec": 0,
    "show": "immer",
    "locked": false
   },
   {
    "key": "beacon",
    "x": 30.06,
    "y": 75.01,
    "width": 19.29,
    "height": 6.08,
    "value": "beacon",
    "label": "Rundumleuchte",
    "type": "leuchte",
    "range": "auto",
    "warn": 0,
    "dec": 0,
    "show": "immer",
    "locked": false
   },
   {
    "key": "handbrake",
    "x": 50,
    "y": 75.01,
    "width": 19.29,
    "height": 6.08,
    "value": "handbrake",
    "label": "Handbremse",
    "type": "leuchte",
    "range": "auto",
    "warn": 0,
    "dec": 0,
    "show": "immer",
    "locked": false
   },
   {
    "key": "ai",
    "x": 69.94,
    "y": 75.01,
    "width": 19.29,
    "height": 6.08,
    "value": "ai",
    "label": "Helfer",
    "type": "leuchte",
    "range": "auto",
    "warn": 0,
    "dec": 0,
    "show": "immer",
    "locked": false
   },
   {
    "key": "motor_on",
    "x": 89.87,
    "y": 75.01,
    "width": 19.29,
    "height": 6.08,
    "value": "motor_on",
    "label": "Motor an",
    "type": "leuchte",
    "range": "auto",
    "warn": 0,
    "dec": 0,
    "show": "immer",
    "locked": false
   },
   {
    "key": "fuel_pct",
    "x": 10.13,
    "y": 90.35,
    "width": 19.29,
    "height": 9.89,
    "value": "fuel_pct",
    "label": "Diesel",
    "type": "balken",
    "range": "auto",
    "warn": 10,
    "dec": 0,
    "show": "immer",
    "locked": false
   },
   {
    "key": "adblue_pct",
    "x": 30.06,
    "y": 90.35,
    "width": 19.29,
    "height": 9.89,
    "value": "adblue_pct",
    "label": "AdBlue",
    "type": "balken",
    "range": "auto",
    "warn": 10,
    "dec": 0,
    "show": "immer",
    "locked": false
   },
   {
    "key": "all_fill_pct",
    "x": 50,
    "y": 90.35,
    "width": 19.29,
    "height": 9.89,
    "value": "all_fill_pct",
    "label": "Füllstand",
    "type": "balken",
    "range": "auto",
    "warn": 0,
    "dec": 0,
    "show": "immer",
    "locked": false
   },
   {
    "key": "damage",
    "x": 69.94,
    "y": 90.35,
    "width": 19.29,
    "height": 9.89,
    "value": "damage",
    "label": "Schaden",
    "type": "balken",
    "range": "auto",
    "warn": 0,
    "dec": 0,
    "show": "immer",
    "locked": false
   },
   {
    "key": "dirt",
    "x": 89.87,
    "y": 90.35,
    "width": 19.29,
    "height": 9.89,
    "value": "dirt",
    "label": "Schmutz",
    "type": "balken",
    "range": "auto",
    "warn": 0,
    "dec": 0,
    "show": "immer",
    "locked": false
   },
   {
    "key": "sel_fill",
    "x": 86.31,
    "y": 42.89,
    "width": 26.42,
    "height": 8,
    "value": "sel_fill",
    "label": "Füllstand",
    "type": "zahl",
    "range": "auto",
    "warn": 0,
    "dec": 0,
    "show": "immer",
    "locked": false
   }
  ]
 },
 "beleuchtung": {
  "varianten": {
   "1x1": {
    "traktor": {
     "x": 50,
     "y": 50,
     "a": 1.36,
     "width": 100,
     "height": 56.25
    },
    "rund": {
     "x": 37.81,
     "y": 18.39,
     "a": 1.36,
     "size": 7,
     "fontSize": 1.6
    },
    "av": {
     "x": 52.38,
     "y": 24.25,
     "a": 1.36,
     "size": 7,
     "fontSize": 1.6
    },
    "ah": {
     "x": 23.63,
     "y": 24.25,
     "a": 1.36,
     "size": 7,
     "fontSize": 1.6
    },
    "fern": {
     "x": 82.63,
     "y": 49.15,
     "a": 1.36,
     "size": 7,
     "fontSize": 1.6
    },
    "abbl": {
     "x": 82.63,
     "y": 59.52,
     "a": 1.36,
     "size": 7,
     "fontSize": 1.6
    },
    "bl": {
     "x": 28.5,
     "y": 46.6,
     "a": 1.36,
     "size": 7,
     "fontSize": 1.6
    },
    "warn": {
     "x": 44.81,
     "y": 46.6,
     "a": 1.36,
     "size": 7,
     "fontSize": 1.6
    },
    "br": {
     "x": 59.5,
     "y": 46.6,
     "a": 1.36,
     "size": 7,
     "fontSize": 1.6
    }
   },
   "1x2": {
    "traktor": {
     "x": 50,
     "y": 50,
     "a": 2.82,
     "width": 62.96,
     "height": 35.42
    },
    "rund": {
     "x": 42.32,
     "y": 8.67,
     "a": 2.82,
     "size": 4.41,
     "fontSize": 1.01
    },
    "av": {
     "x": 51.5,
     "y": 16.33,
     "a": 2.82,
     "size": 4.41,
     "fontSize": 1.01
    },
    "ah": {
     "x": 33.4,
     "y": 16.33,
     "a": 2.82,
     "size": 4.41,
     "fontSize": 1.01
    },
    "fern": {
     "x": 70.54,
     "y": 48.89,
     "a": 2.82,
     "size": 4.41,
     "fontSize": 1.01
    },
    "abbl": {
     "x": 70.54,
     "y": 62.44,
     "a": 2.82,
     "size": 4.41,
     "fontSize": 1.01
    },
    "bl": {
     "x": 36.46,
     "y": 45.56,
     "a": 2.82,
     "size": 4.41,
     "fontSize": 1.01
    },
    "warn": {
     "x": 46.73,
     "y": 45.56,
     "a": 2.82,
     "size": 4.41,
     "fontSize": 1.01
    },
    "br": {
     "x": 55.98,
     "y": 45.56,
     "a": 2.82,
     "size": 4.41,
     "fontSize": 1.01
    }
   },
   "1x3": {
    "traktor": {
     "x": 50,
     "y": 50,
     "a": 4.29,
     "width": 41.43,
     "height": 23.31
    },
    "rund": {
     "x": 44.95,
     "y": 8.67,
     "a": 4.29,
     "size": 2.9,
     "fontSize": 0.66
    },
    "av": {
     "x": 50.99,
     "y": 16.33,
     "a": 4.29,
     "size": 2.9,
     "fontSize": 0.66
    },
    "ah": {
     "x": 39.07,
     "y": 16.33,
     "a": 4.29,
     "size": 2.9,
     "fontSize": 0.66
    },
    "fern": {
     "x": 63.52,
     "y": 48.89,
     "a": 4.29,
     "size": 2.9,
     "fontSize": 0.66
    },
    "abbl": {
     "x": 63.52,
     "y": 62.44,
     "a": 4.29,
     "size": 2.9,
     "fontSize": 0.66
    },
    "bl": {
     "x": 41.09,
     "y": 45.56,
     "a": 4.29,
     "size": 2.9,
     "fontSize": 0.66
    },
    "warn": {
     "x": 47.85,
     "y": 45.56,
     "a": 4.29,
     "size": 2.9,
     "fontSize": 0.66
    },
    "br": {
     "x": 53.94,
     "y": 45.56,
     "a": 4.29,
     "size": 2.9,
     "fontSize": 0.66
    }
   },
   "2x1": {
    "traktor": {
     "x": 50,
     "y": 50,
     "a": 0.6,
     "width": 100,
     "height": 56.25
    },
    "rund": {
     "x": 37.81,
     "y": 35.99,
     "a": 0.6,
     "size": 7,
     "fontSize": 1.6
    },
    "av": {
     "x": 52.38,
     "y": 38.58,
     "a": 0.6,
     "size": 7,
     "fontSize": 1.6
    },
    "ah": {
     "x": 23.63,
     "y": 38.58,
     "a": 0.6,
     "size": 7,
     "fontSize": 1.6
    },
    "fern": {
     "x": 82.63,
     "y": 49.62,
     "a": 0.6,
     "size": 7,
     "fontSize": 1.6
    },
    "abbl": {
     "x": 82.63,
     "y": 54.22,
     "a": 0.6,
     "size": 7,
     "fontSize": 1.6
    },
    "bl": {
     "x": 28.5,
     "y": 48.49,
     "a": 0.6,
     "size": 7,
     "fontSize": 1.6
    },
    "warn": {
     "x": 44.81,
     "y": 48.49,
     "a": 0.6,
     "size": 7,
     "fontSize": 1.6
    },
    "br": {
     "x": 59.5,
     "y": 48.49,
     "a": 0.6,
     "size": 7,
     "fontSize": 1.6
    }
   },
   "2x2": {
    "traktor": {
     "x": 50,
     "y": 50,
     "a": 1.25,
     "width": 100,
     "height": 56.25
    },
    "rund": {
     "x": 37.81,
     "y": 20.9,
     "a": 1.25,
     "size": 7,
     "fontSize": 1.6
    },
    "av": {
     "x": 52.38,
     "y": 26.3,
     "a": 1.25,
     "size": 7,
     "fontSize": 1.6
    },
    "ah": {
     "x": 23.63,
     "y": 26.3,
     "a": 1.25,
     "size": 7,
     "fontSize": 1.6
    },
    "fern": {
     "x": 82.63,
     "y": 49.22,
     "a": 1.25,
     "size": 7,
     "fontSize": 1.6
    },
    "abbl": {
     "x": 82.63,
     "y": 58.76,
     "a": 1.25,
     "size": 7,
     "fontSize": 1.6
    },
    "bl": {
     "x": 28.5,
     "y": 46.87,
     "a": 1.25,
     "size": 7,
     "fontSize": 1.6
    },
    "warn": {
     "x": 44.81,
     "y": 46.87,
     "a": 1.25,
     "size": 7,
     "fontSize": 1.6
    },
    "br": {
     "x": 59.5,
     "y": 46.87,
     "a": 1.25,
     "size": 7,
     "fontSize": 1.6
    }
   }
  },
  "buttons": [
   {
    "key": "rund",
    "x": 37.81,
    "y": 8.67,
    "shape": "circle",
    "size": 7,
    "rotation": 0,
    "label": "Rundumleuchte",
    "fontSize": 1.6,
    "functionId": "func-fs-toggle-beacon-lights",
    "stateSource": "beacon",
    "show": "immer",
    "locked": false,
    "icon": "beacon"
   },
   {
    "key": "av",
    "x": 52.38,
    "y": 16.33,
    "shape": "circle",
    "size": 7,
    "rotation": 0,
    "label": "Arbeitslicht vorne",
    "fontSize": 1.6,
    "functionId": "func-fs-toggle-work-light-front",
    "stateSource": "work_front",
    "show": "immer",
    "locked": false,
    "icon": "work-light-front"
   },
   {
    "key": "ah",
    "x": 23.63,
    "y": 16.33,
    "shape": "circle",
    "size": 7,
    "rotation": 0,
    "label": "Arbeitslicht hinten",
    "fontSize": 1.6,
    "functionId": "func-fs-toggle-work-light-back",
    "stateSource": "work_back",
    "show": "immer",
    "locked": false,
    "icon": "work-light-rear"
   },
   {
    "key": "fern",
    "x": 82.63,
    "y": 48.89,
    "shape": "circle",
    "size": 7,
    "rotation": 0,
    "label": "Fernlicht",
    "fontSize": 1.6,
    "functionId": "func-fs-toggle-high-beam-light",
    "stateSource": "light_high",
    "show": "immer",
    "locked": false,
    "icon": "high-beam"
   },
   {
    "key": "abbl",
    "x": 82.63,
    "y": 62.44,
    "shape": "circle",
    "size": 7,
    "rotation": 0,
    "label": "Abblendlicht",
    "fontSize": 1.6,
    "functionId": "func-fs-toggle-lights",
    "stateSource": "light_low",
    "show": "immer",
    "locked": false,
    "icon": "low-beam"
   },
   {
    "key": "bl",
    "x": 28.5,
    "y": 45.56,
    "shape": "circle",
    "size": 7,
    "rotation": 0,
    "label": "Blinker links",
    "fontSize": 1.6,
    "functionId": "func-fs-toggle-turnlight-left",
    "stateSource": "blinker_links",
    "show": "immer",
    "locked": false,
    "icon": "turn-left"
   },
   {
    "key": "warn",
    "x": 44.81,
    "y": 45.56,
    "shape": "circle",
    "size": 7,
    "rotation": 0,
    "label": "Warnblinker",
    "fontSize": 1.6,
    "functionId": "func-fs-toggle-turnlight-hazard",
    "stateSource": "warnblinker",
    "show": "immer",
    "locked": false,
    "icon": "hazard"
   },
   {
    "key": "br",
    "x": 59.5,
    "y": 45.56,
    "shape": "circle",
    "size": 7,
    "rotation": 0,
    "label": "Blinker rechts",
    "fontSize": 1.6,
    "functionId": "func-fs-toggle-turnlight-right",
    "stateSource": "blinker_rechts",
    "show": "immer",
    "locked": false,
    "icon": "turn-right"
   }
  ],
  "graphics": [
   {
    "key": "traktor",
    "x": 50,
    "y": 50,
    "width": 100,
    "height": 56.25,
    "rotation": 0,
    "src": "/img/vorlagen/traktor-seite.svg",
    "keepRatio": true,
    "show": "immer",
    "name": "Traktor",
    "locked": true
   }
  ]
 }
};
