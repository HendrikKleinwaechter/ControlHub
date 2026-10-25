/**
 * Reihenfolge der Funktionsgruppen (24.10.2026): Obergruppen wie im Steuerungsmenü des Spiels, dann Mods und DLC, die
 * Systemgruppen zuletzt. Genutzt beim ersten Start (alles sortieren) und beim Neu-Einlesen (nur neue Gruppen einsortieren).
 */
const GRUPPEN_FOLGE = ['Fahrzeug', 'Zu Fuß', 'Spiel', 'Kamera', 'Radio', 'Kran', 'Gebäude', 'Baumodus', 'Sonstige/unbekannt', 'Mods', 'DLC', 'Makros', 'BasicGamepad Tasten'];

const rang = n => { const i = GRUPPEN_FOLGE.indexOf(String(n).split(' › ')[0]); return i < 0 ? GRUPPEN_FOLGE.indexOf('Sonstige/unbekannt') - 0.5 : i; };

/** Gruppen sortieren: Obergruppen nach GRUPPEN_FOLGE (unbekannte vor „Sonstige“), Untergruppen bleiben in ihrer Reihenfolge */
export function ordneGruppen(namen) {
  return namen.map((n, i) => [n, i]).sort((a, b) => rang(a[0]) - rang(b[0]) || a[1] - b[1]).map(([n]) => n);
}

/** Neue Gruppen in eine bestehende Liste einsortieren, ohne die übrige Reihenfolge zu ändern: hinter die letzte Gruppe
 *  derselben Obergruppe, sonst vor die erste Obergruppe, die laut GRUPPEN_FOLGE später kommt, sonst ans Ende. */
export function einsortieren(liste, neue) {
  const ober = n => String(n).split(' › ')[0];
  const ergebnis = [...liste];
  for (const n of neue) {
    if (ergebnis.includes(n)) continue;
    let i = -1;
    ergebnis.forEach((c, k) => { if (ober(c) === ober(n)) i = k; });
    if (i < 0) { const r = rang(n); i = ergebnis.findIndex(c => rang(c) > r) - 1; if (i < -1) i = ergebnis.length - 1; }
    ergebnis.splice(i + 1, 0, n);
  }
  return ergebnis;
}
