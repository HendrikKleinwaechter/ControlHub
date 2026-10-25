/**
 * Steht AUSSERHALB des normalen ControlHub-Servers (server/index.js) -- reines Entwickler-Werkzeug,
 * nicht Teil der ausgelieferten .exe/App. Liest eine mit ccRecordStart/ccRecordStop im Lua-Mod
 * aufgezeichnete Test-Fahrt (craftConsoleRecording.xml) und spielt sie über eine EIGENE, separate
 * Socket.IO-Instanz ab -- exakt dieselben Events (telemetry-update/telemetry-course-update), die der
 * echte TelemetryReader auch sendet. Damit lässt sich das Dashboard/die Kartenansicht
 * (public/js/dashboard.js, dashboardMap.js) beliebig oft gegen eine ECHTE, einmal aufgezeichnete Fahrt
 * testen, ohne dass FS25 laufen muss (12.08.2026, Hendriks Vorschlag "Testtool für die LS-Daten" --
 * u.a. die Fahrtrichtungs-/Lenkführungslinien-Fixes ließen sich sonst nur über volle Testrunden im
 * Spiel verifizieren).
 *
 * Aufnahme starten/beenden im Spiel: Konsole (~) -> "ccRecordStart" -> normal fahren (idealerweise
 * inkl. Lenksystem an/aus in der Nähe verschiedener Spurführungslinien, Teilbreiten links/rechts
 * schalten) -> "ccRecordStop".
 *
 * Nutzung:  node server/replayTool.js [Pfad zur craftConsoleRecording.xml] [Geschwindigkeitsfaktor]
 * Standard-Pfad: ~/Documents/My Games/FarmingSimulator2025/craftConsoleRecording.xml
 * Eigener Port (3001) -- kollidiert nicht mit dem echten Server (3000), beide können parallel laufen.
 * Die Wiedergabe läuft endlos in einer Schleife (einfacher als Play/Pause-Steuerung für den ersten Wurf).
 */
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { promises as fs, existsSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3001;
const TICK_MS = 250; // Takt für Aufnahmen ohne Zeitstempel (bis 0.95 fest 250 ms)

// Ab Phase 1 legt die Mod die Aufnahme in modSettings/FS25_CraftConsoleHUD/ ab, bis 0.95 im Profilordner
function defaultRecordingPath() {
  const game = path.join(os.homedir(), 'Documents', 'My Games', 'FarmingSimulator2025');
  const neu = path.join(game, 'modSettings', 'FS25_CraftConsoleHUD', 'craftConsoleRecording.xml');
  return existsSync(neu) ? neu : path.join(game, 'craftConsoleRecording.xml');
}

// collect() (Lua) und parseHudXml() (telemetryReader.js) benennen ein paar Felder unterschiedlich --
// die Übersetzung passiert normalerweise beim XML-Schreiben (writeFile()); hier machen wir sie direkt,
// da die Aufnahme collect()s Rohfeldnamen 1:1 enthält (encodeTickJson() im Lua-Mod).
function toTelemetryShape(tick) {
  return {
    ...tick,
    available: true,
    imp: tick.name ?? '',
    impOn: tick.on ?? 0,
    impLow: tick.low ?? 0,
    filltype: tick.ftype ?? ''
  };
}

// Gegenstück zu CraftConsoleHud.lua consoleRecordStop(): Zeilen sind mit "~~~" verbunden (bewusst kein
// "\n", s. Kommentar dort -- Zeilenumbrüche überleben die GIANTS-XML-Serialisierung nicht zuverlässig).
async function loadRecording(filePath) {
  const xmlText = await fs.readFile(filePath, 'utf-8');
  const m = xmlText.match(/lines="([\s\S]*?)"\s*\/>/);
  if (!m) throw new Error('Kein "lines"-Attribut in der Aufnahme gefunden -- Datei beschädigt oder falsches Format?');
  const raw = m[1]
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return raw.split('~~~').filter(Boolean).map((line) => JSON.parse(line));
}

async function main() {
  const filePath = process.argv[2] || defaultRecordingPath();
  const speedFactor = parseFloat(process.argv[3]) || 1;
  const entries = await loadRecording(filePath);
  const ticks = entries.filter((e) => e.type === 'tick').length;
  const courses = entries.filter((e) => e.type === 'course').length;
  console.log(`Aufnahme geladen: ${entries.length} Einträge (${ticks} Ticks, ${courses} Kurs-Wechsel) aus ${filePath}`);
  if (entries.length === 0) {
    console.error('Leere Aufnahme -- nichts zum Abspielen.');
    process.exit(1);
  }

  const app = express();
  app.use(express.static(path.join(__dirname, '..', 'public')));
  const server = http.createServer(app);
  const io = new Server(server);

  // Letzten bekannten Kurs für neu verbindende Clients cachen -- exakt dasselbe Muster wie im echten
  // Server (index.js), das genau wegen "keine Linien mehr nach Reload" nötig wurde.
  let cachedCourse = null;
  io.on('connection', (socket) => {
    console.log('Replay-Client verbunden:', socket.id);
    if (cachedCourse) socket.emit('telemetry-course-update', cachedCourse);
  });

  let i = 0;
  function step() {
    const entry = entries[i % entries.length];
    if (entry.type === 'course') {
      cachedCourse = { boundary: entry.boundary, segments: entry.segments };
      io.emit('telemetry-course-update', cachedCourse);
    } else if (entry.type === 'tick') {
      io.emit('telemetry-update', toTelemetryShape(entry));
    }
    i++;
    setTimeout(step, delayToNext(entry, entries[i % entries.length]) / speedFactor);
  }

  // Seit Phase 1 (21.10.2026) tragen Ticks die Spielzeit t (ms) -- dann im echten Takt der Aufnahme
  // abspielen (die Rate ist einstellbar 2-30/s). Ältere Aufnahmen ohne t: fest TICK_MS wie bisher.
  function delayToNext(cur, next) {
    if (cur.type !== 'tick') return 0; // Kurs-Einträge ohne eigene Wartezeit
    if (typeof cur.t === 'number' && typeof next?.t === 'number' && next.t > cur.t) {
      return Math.min(next.t - cur.t, 2000);
    }
    return TICK_MS;
  }

  server.listen(PORT, () => {
    console.log(`Replay-Server läuft auf http://localhost:${PORT} (Geschwindigkeit x${speedFactor}, läuft endlos in einer Schleife)`);
    step();
  });
}

main().catch((err) => {
  console.error('Replay-Tool-Fehler:', err.message);
  process.exit(1);
});
