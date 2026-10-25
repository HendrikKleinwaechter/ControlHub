// Teilbreiten-Automatik, zweite Fassung (Hendrik 24.10.2026): mehrere Tasten auf einmal, Sperre bis zur Rückmeldung,
// beim Ausschalten alle wieder an, nicht bei Precision Farming
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TeilbreitenAutomatik, automatikGeraet, PULS_MS, PAUSE_MS, RUECKMELDUNG_MS, RUECKMELDUNG_GAST_MS } from '../server/teilbreitenAutomatik.js';
import { cleanTeilbreiten, TB_STANDARD } from '../server/gpsManager.js';
import { parseSections, parsePf } from '../server/telemetryReader.js';

// Düngerstreuer wie Hendriks Amazone ZA-TS (log.txt 23.10.): je Seite 6 Teilbreiten, ohne Mitte, außen 21 m
const KANTEN = [7.5, 9, 10.5, 15, 18, 21];
const sec = (anL, anR) => parseSections(`1;0;${anL};6;${anR};6;` + KANTEN.map((e, i) => `L:${i < anL ? 1 : 0}:${e.toFixed(2)}`)
  .concat(KANTEN.map((e, i) => `R:${i < anR ? 1 : 0}:${(-e).toFixed(2)}`)).join(','));
// aktiver Bereich: ein Bereich 3 m hinter dem Fahrzeug, quer von −Kante rechts bis +Kante links
const STREUER = (anL = 6, anR = 6, extra = {}) => ({ name: 'Streuer', side: 'rear', depth: 1, attach: 'mounted', on: true, canTurnOn: true,
  lowered: null, selected: true, areas: [{ type: 'SPREADER', corners: [[-3, KANTEN[anL - 1]], [-3, -KANTEN[anR - 1]], [-3.5, -KANTEN[anR - 1]], [-3.5, KANTEN[anL - 1]]] }],
  sections: sec(anL, anR), ...extra });
const takt = (u, extra = {}) => ({ available: true, inVehicle: true, posX: 0, posZ: 0, fwdX: 0, fwdZ: 1, base: { speedKmh: 10 }, units: [u], ...extra });

// Welt: x = quer (links +), z = längs. Feld nur bis x = 12 (links dahinter Feldrand), nichts bearbeitet
function aufbau({ feldBisX = 12, tb = true, gast = false } = {}) {
  const gedrueckt = [], spaeter = [];
  let jetzt = 1000;
  const mgr = { config: { einheiten: tb ? { Streuer: { tb: true } } : {}, teilbreiten: cleanTeilbreiten({}) } };
  const a = new TeilbreitenAutomatik({
    getManager: () => mgr,
    mapping: { fireAutomatic: (fn, ms) => { gedrueckt.push([fn, ms]); return true; } },
    flaeche: { istBearbeitet: () => false },
    feldAt: ([x]) => x <= feldBisX,
    now: () => jetzt,
    spaeter: (fn, ms) => spaeter.push([fn, ms]),
    mehrspielerGast: () => gast
  });
  const laufen = () => { spaeter.sort((x, y) => x[1] - y[1]).forEach(([fn]) => fn()); spaeter.length = 0; };
  return { a, mgr, gedrueckt, spaeter, laufen, zeit: ms => { jetzt += ms; } };
}

test('Automatik: am Feldrand mehrere Teilbreiten auf einmal aus, Sperre bis zur Rückmeldung', () => {
  const t = aufbau();
  t.a.tick(takt(STREUER()));
  // links: 10,5–15 m liegt zu 2/3 hinter dem Rand (≥ 50 %) → Ziel 3, also 3× „links aus“ hintereinander
  assert.equal(t.gedrueckt.length, 1, 'erster Druck sofort');
  assert.deepEqual(t.spaeter.map(([, ms]) => ms), [PULS_MS + PAUSE_MS, 2 * (PULS_MS + PAUSE_MS)]);
  t.laufen();
  assert.deepEqual(t.gedrueckt, Array(3).fill([TB_STANDARD.tasten.linksAus, PULS_MS]));
  // Spiel hat noch nicht gemeldet: keine weiteren Drücke
  t.zeit(100); t.a.tick(takt(STREUER())); t.laufen();
  assert.equal(t.gedrueckt.length, 3);
  // Rückmeldung 3 von 6: Ziel erreicht, nichts mehr zu tun
  t.zeit(100); t.a.tick(takt(STREUER(3, 6))); t.laufen();
  assert.equal(t.gedrueckt.length, 3);
});

test('Automatik als Gast im Mehrspieler: wartet länger auf die Rückmeldung (Mehrspieler-Prüfung R8)', () => {
  for (const [gast, warte] of [[false, RUECKMELDUNG_MS], [true, RUECKMELDUNG_GAST_MS]]) {
    const t = aufbau({ gast });
    t.a.tick(takt(STREUER()));
    assert.equal(t.a.sperre.L.bis, 1000 + 3 * (PULS_MS + PAUSE_MS) + warte, gast ? 'Gast' : 'Einzelspiel/Gastgeber');
  }
});

test('Automatik: Teilbreiten wieder an, wenn dort frei ist (mit Abstand gegen Flattern)', () => {
  const t = aufbau({ feldBisX: 30 });
  t.a.tick(takt(STREUER(3, 6))); t.laufen();
  assert.deepEqual(t.gedrueckt, Array(3).fill([TB_STANDARD.tasten.linksAn, PULS_MS]));
  // Rand bei 14 m: Teilbreite 4 (10,5–15 m) zu 22 % schlecht → bleibt aus (wieder an erst ab ≤ 20 %)
  const t2 = aufbau({ feldBisX: 14 });
  t2.a.tick(takt(STREUER(3, 6))); t2.laufen();
  assert.equal(t2.gedrueckt.length, 0);
});

test('Automatik: Gerät ausgeschaltet → alle Teilbreiten wieder an; nur bei „automatisch“, nicht bei Precision Farming', () => {
  const t = aufbau();
  t.a.tick(takt(STREUER(3, 6))); t.laufen();   // arbeitet, Ziel 3 erreicht
  assert.equal(t.gedrueckt.length, 0);
  t.zeit(100); t.a.tick(takt(STREUER(3, 6, { on: false }))); t.laufen();
  assert.deepEqual(t.gedrueckt, Array(3).fill([TB_STANDARD.tasten.linksAn, PULS_MS]));
  // ausgeschaltet stehen geblieben, aber schon alle an: nichts weiter
  t.zeit(1500); t.a.tick(takt(STREUER(6, 6, { on: false }))); t.laufen();
  assert.equal(t.gedrueckt.length, 3);

  const aus = aufbau({ tb: false });
  aus.a.tick(takt(STREUER())); aus.laufen();
  assert.equal(aus.gedrueckt.length, 0, 'ohne „automatisch“ kein Druck');
  const pf = { ...STREUER(), pfSek: parsePf('1:12.02:9.01:0:6,0:1.46:-1.54:6:6') };
  assert.equal(automatikGeraet([pf], { Streuer: { tb: true } }), null, 'Precision Farming schaltet selbst');
});

test('Automatik: nur vorwärts, ab 1 km/h, ausgeklappt', () => {
  for (const extra of [{ base: { speedKmh: 0.5 } }, { dir: 'R' }]) {
    const t = aufbau();
    t.a.tick(takt(STREUER(), extra)); t.laufen();
    assert.equal(t.gedrueckt.length, 0, JSON.stringify(extra));
  }
  const t = aufbau();
  t.a.tick(takt(STREUER(6, 6, { canFold: true, unfolded: false }))); t.laufen();
  assert.equal(t.gedrueckt.length, 0, 'eingeklappt');
});

test('Automatik: ausstehende Drücke fallen weg, wenn das Gerät ausgeschaltet wird oder wechselt (Durchsicht 24.10.)', () => {
  const t = aufbau();
  t.a.tick(takt(STREUER()));            // 3× „links aus“: einer sofort, zwei ausstehend
  assert.equal(t.gedrueckt.length, 1);
  t.zeit(50); t.a.tick(takt(STREUER(5, 6, { on: false })));   // ausgeschaltet, bevor die Folge durch ist
  t.laufen();
  // die alten „aus“ fallen weg; stattdessen 1× „links an“ (5 → 6)
  assert.deepEqual(t.gedrueckt, [[TB_STANDARD.tasten.linksAus, PULS_MS], [TB_STANDARD.tasten.linksAn, PULS_MS]]);

  const w = aufbau();
  w.mgr.config.einheiten.Andere = { tb: true };
  w.a.tick(takt(STREUER()));
  w.a.tick(takt({ ...STREUER(6, 6), name: 'Andere' }));       // anderes Gerät gewählt: alte Folge verwerfen
  w.laufen();
  // 1 sofort vom ersten Gerät, dann die volle Folge (3) des neuen; die 2 ausstehenden des ersten fallen weg
  assert.equal(w.gedrueckt.length, 4);
  assert.equal(w.a.geraet, 'Andere');
});
