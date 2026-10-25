/**
 * Eine Socket.IO-Verbindung je Seite (Durchsicht B4, 23.10.2026).
 *
 * Vorher baute jeder Teil der Oberfläche (Karte, Kacheln, Statusknopf, Tastenbelegung …) mit io() seine eigene
 * Verbindung auf, rund 19 je Seite. Der Server schickt die Spieldaten (bis 25/s) an jede Verbindung -- das Tablet bekam
 * sie also 19-mal und wertete sie 19-mal aus (Akku, Rechenzeit, WLAN). Jetzt nutzen alle window.hubSocket.
 *
 * Wird direkt nach socket.io.js geladen, vor allen anderen Skripten.
 *
 * Anfangsstand: Beim Verbinden schickt der Server den aktuellen Stand (Kurs, Karte, Fahrzeuge, Planer, Makro-Status)
 * an die neue Verbindung. Früher bekam ihn jeder Teil über seine eigene Verbindung; ein Teil, der sich jetzt erst
 * später anmeldet (z. B. Karte oder Planer beim ersten Öffnen), hätte ihn verpasst. Deshalb merkt sich hubSocket den
 * letzten Stand dieser Ereignisse und reicht ihn an jeden nach, der sich später dafür anmeldet.
 */
(function () {
  const sock = io();
  // Ereignisse mit „aktuellem Stand“: kommen beim Verbinden und danach bei jeder Änderung an alle
  const STAND = ['telemetry-course-update', 'telemetry-map', 'telemetry-world', 'telemetry-plan', 'telemetry-roads', 'macro-status', 'karte-einstellungen'];
  const letzter = new Map();
  for (const ev of STAND) sock.on(ev, d => letzter.set(ev, d));
  // Neuer Spielstand in der Mod (Durchsicht B6): den Stand der alten Sitzung nicht mehr nachreichen
  sock.on('telemetry-session', () => { for (const ev of STAND) if (ev !== 'macro-status') letzter.delete(ev); });

  const anmelden = sock.on.bind(sock);
  sock.on = (ev, fn) => {
    anmelden(ev, fn);
    if (letzter.has(ev)) {
      const d = letzter.get(ev);
      queueMicrotask(() => fn(d));
    }
    return sock;
  };
  window.hubSocket = sock;
})();
