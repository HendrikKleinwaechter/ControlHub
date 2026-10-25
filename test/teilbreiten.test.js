// Teilbreiten (Anmerkung 28): Mod-Daten lesen, Kästchen am Balken (Anzeige; die Automatik ist wieder entfallen)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../public/js/teilbreiten.js';
import { parseSections, parsePf } from '../server/telemetryReader.js';
import { arbeitsBalken } from '../server/flaeche.js';

const T = globalThis.Teilbreiten;
const r1 = v => Math.round(v * 10) / 10;

// Spritze 24 m, je Seite 3 Teilbreiten zu 4 m, ohne Mitte; Außenkanten 4/8/12 m
const sec = (anL, anR) => parseSections(`1;0;${anL};3;${anR};3;` + [1, 2, 3].map(i => `L:${i <= anL ? 1 : 0}:${(4 * i).toFixed(2)}`).concat([1, 2, 3].map(i => `R:${i <= anR ? 1 : 0}:${(-4 * i).toFixed(2)}`)).join(','));
// aktiver Balken 6 m hinter dem Fahrzeug, quer von −kanteR bis +kanteL (Mitte bei quer 0)
const flaeche = (anL, anR) => { const qL = anL * 4, qR = -anR * 4; return [{ type: 'SPRAYER', corners: [[-6, qL], [-6, qR], [-6.5, qR], [-6.5, qL]] }]; };
const SPRITZE = (anL = 3, anR = 3) => ({ name: 'Spritze', side: 'rear', depth: 1, selected: true, lowered: false, on: true, canTurnOn: true, areas: flaeche(anL, anR), sections: sec(anL, anR) });

test('Teilbreiten: Mod-Text lesen, Balken über alle Bereiche, Kästchen auch für ausgeschaltete', () => {
  const s = sec(2, 3);
  assert.deepEqual([s.links, s.rechts, s.liste.length], [{ an: 2, max: 3 }, { an: 3, max: 3 }, 6]);
  assert.equal(parseSections('kaputt'), null);
  assert.equal(T.text(s), 'links 2/3 · rechts 3/3');
  const u = SPRITZE(2, 3);
  const b = T.balken(u);
  assert.deepEqual(b.corners.map(c => c.map(r1)), [[-6, 8], [-6, -12], [-6.5, -12], [-6.5, 8]]);
  const L = T.lage(u.sections, [[-6, 8], [-6, -12]]);
  const links3 = L.boxes.find(x => x.side === 'L' && x.nr === 3);
  assert.equal(links3.on, false);
  assert.deepEqual([links3.a.map(r1), links3.b.map(r1)], [[-6, 8], [-6, 12]], 'ausgeschaltete Teilbreite liegt außen neben dem aktiven Balken');
  assert.deepEqual(L.boxes.find(x => x.side === 'R' && x.nr === 1).b.map(r1), [-6, -4]);
  // alles aus: letzte Lage gilt weiter
  const aus = T.lage(sec(0, 0), null, L.basis);
  assert.equal(aus.boxes.filter(x => x.on).length, 0);
  assert.equal(aus.boxes.length, 6);
});

// Dammann DT 2800H S5 aus Hendriks log.txt (23.10.2026): je Seite 4 zu 3 m, Mitte mit abs 0 (lässt sich nicht abschalten)
const dammann = (anL, anR) => parseSections(`1;1;${anL};4;${anR};4;` + [4, 3, 2, 1].map(i => `L:${i <= anL ? 1 : 0}:${(3 * i).toFixed(2)}`)
  .concat(['C:1:0.00'], [1, 2, 3, 4].map(i => `R:${i <= anR ? 1 : 0}:${(-3 * i).toFixed(2)}`)).join(','));
const lagen = L => L.boxes.map(x => `${x.side}${x.nr}:${x.a.map(r1)}|${x.b.map(r1)}`).sort();

test('Teilbreiten: eine Seite ganz aus -- Kästchen springen nicht (Dammann, Hendrik 23.10.)', () => {
  const voll = T.lage(dammann(4, 4), [[-5, 12], [-5, -12]]);
  assert.deepEqual(voll.basis.k, 1);
  // links alles aus: die Kante des Spiels liegt irgendwo an der Mitte (0 m oder noch an der ersten Teilbreite, 3 m)
  for (const kanteMitte of [0, 3, 1.5]) {
    const linksAus = T.lage(dammann(0, 4), [[-5, kanteMitte], [-5, -12]], voll.basis);
    assert.deepEqual(lagen(linksAus), lagen(voll), `Kante bei ${kanteMitte} m`);
    assert.equal(linksAus.boxes.filter(x => x.side === 'L' && x.on).length, 0);
  }
  const rechtsAus = T.lage(dammann(4, 0), [[-5, 12], [-5, 2]], voll.basis);
  assert.deepEqual(lagen(rechtsAus), lagen(voll));
  // andere Einheit (gemessen doppelt so breit): Maßstab aus dem Verhältnis, nur solange beide Seiten an sind
  const anders = T.lage(dammann(4, 4), [[-5, 24], [-5, -24]]);
  assert.equal(anders.basis.k, 2);
  assert.equal(T.lage(dammann(0, 4), [[-5, 0], [-5, -24]], anders.basis).basis.k, 2);
});

// Precision Farming (Mod 0.7.2): Hendriks Probe vom 23.10.2026 am Feldrand -- die beiden äußeren linken PF-Teilbreiten aus,
// die normalen Teilbreiten stehen dabei auf 4/4
const PF_RAND = '1:12.02:9.01:0:6,2:9.01:6.00:0:6,3:5.99:2.98:6:6,4:2.97:1.47:3:3,0:1.46:-1.54:6:6,6:-1.55:-3.05:3:3,7:-3.06:-6.07:6:6,8:-6.07:-9.09:6:6,9:-9.09:-12.10:6:6';
const DAMMANN = (on, pf = PF_RAND) => ({ name: 'Dammann', side: 'own', depth: 0, on, lowered: true, canTurnOn: true, canLower: true,
  areas: [{ type: 'SPRAYER', corners: [[-5, 12], [-5, -12], [-5.5, -12], [-5.5, 12]] }], sections: dammann(4, 4), pfSek: parsePf(pf) });

test('Precision Farming: Düsen-Teilbreiten lesen, Kästchen, Text', () => {
  const pf = parsePf(PF_RAND);
  assert.equal(pf.length, 9);
  assert.deepEqual(pf[0], { nr: 1, von: 12.02, bis: 9.01, an: 0, n: 6 });
  assert.equal(parsePf('kaputt'), null);
  const ends = [[-5, 12], [-5, -12]];
  // eingeschaltet: die gleich breiten Kästchen der normalen Teilbreiten, Zustand aus den Düsen darin
  const an = T.kaesten(DAMMANN(true), ends);
  assert.deepEqual(an.boxes.map(b => `${b.side}${b.nr}:${b.on ? 1 : 0}`), ['C0:1', 'L1:1', 'L2:1', 'L3:0', 'L4:0', 'R1:1', 'R2:1', 'R3:1', 'R4:1']);
  assert.deepEqual(an.boxes.find(b => b.side === 'L' && b.nr === 4).b.map(r1), [-5, 12], 'Außenkante in Metern');
  // PF-Gerät ohne normale Teilbreiten: die PF-Gruppen selbst
  const nurPf = T.kaesten({ ...DAMMANN(true), sections: null }, ends);
  assert.deepEqual(nurPf.boxes.map(b => `${b.side}${b.nr}:${b.on ? 1 : 0}`), ['L1:0', 'L2:0', 'L3:1', 'L4:1', 'C0:1', 'R6:1', 'R7:1', 'R8:1', 'R9:1']);
  assert.equal(T.textGeraet(DAMMANN(true)), 'links 2/4 · rechts 4/4');
  // ausgeschaltet: wie die normalen Teilbreiten (hier alle an), Düsen zählen nicht
  assert.ok(T.kaesten(DAMMANN(false), ends).boxes.every(b => b.on));
  assert.equal(T.textGeraet(DAMMANN(false)), 'links 4/4 · rechts 4/4');
  // ohne PF unverändert: 4 + Mitte (Breite 0, wird nicht gezeichnet) + 4
  assert.deepEqual(T.kaesten({ sections: dammann(4, 4) }, ends).boxes.length, 9);
});

test('Precision Farming: bearbeitete Fläche nur, wo Düsen an sind', () => {
  const d = { inVehicle: true, posX: 0, posZ: 0, fwdX: 0, fwdZ: 1, units: [DAMMANN(true)], gps: { geraete: {} } };   // Welt x = quer
  const b = arbeitsBalken(d);
  assert.equal(b.length, 7, 'je PF-Teilbreite mit Düsen an ein Balken');
  assert.ok(b.every(x => x.key.startsWith('Dammann|own|0|pf')));
  // quer: von −12,1 bis +6 m (links ab 6 m aus)
  const quer = b.flatMap(x => x.ends.map(e => e[0]));
  assert.deepEqual([Math.min(...quer), Math.max(...quer)].map(r1).map(Math.abs).sort((x, y) => x - y), [6, 12.1]);
  // ausgeschaltet zählt der ganze Balken wie bisher (falls „gesenkt“ reicht)
  const aus = arbeitsBalken({ ...d, units: [DAMMANN(false)], gps: { geraete: { Dammann: { cov: 'gesenkt' } } } });
  assert.equal(aus.length, 1);
});

// Gezogene Spritze, um 20° abgeknickt (Hendrik 24.10.2026: „Nachlaufverhalten stimmt überhaupt nicht“): Balken im Rahmen
// des Geräts, nicht quer zum Traktor
test('Gezogene Spritze mit Teilbreiten: Balken knickt mit ab (volle 24 m, quer zum Gerät)', () => {
  const th = 20, t = th * Math.PI / 180, cs = Math.cos(t), sn = Math.sin(t);
  const zurueck = ([l, q]) => [l * cs + q * sn - 8, -l * sn + q * cs];   // Gerätrahmen → Fahrzeug, Mitte 8 m hinten
  const ecken = [[0.25, 12], [0.25, -12], [-0.25, -12], [-0.25, 12]].map(zurueck);
  const u = { name: 'Spritze', side: 'rear', depth: 1, attach: 'trailed', pose: { along: -8, across: 0, angle: th }, lowered: true, on: true,
    areas: [{ type: 'SPRAYER', corners: ecken }], sections: dammann(4, 4) };
  const b = T.balken(u);
  const L = T.balkenLage(b.corners, th);
  assert.deepEqual([r1(L.qMax - L.qMin), r1(L.lMax - L.lMin)], [24, 0.5], 'im Gerätrahmen 24 × 0,5 m');
  // Fläche: Enden 24 m auseinander, quer zum Gerät (links = (sin θ, cos θ))
  const d = { inVehicle: true, posX: 0, posZ: 0, fwdX: 0, fwdZ: 1, units: [u], gps: { geraete: {} } };   // Welt x = quer, z = längs
  const [e] = arbeitsBalken(d);
  const dx = e.ends[0][0] - e.ends[1][0], dz = e.ends[0][1] - e.ends[1][1];
  assert.equal(r1(Math.hypot(dx, dz)), 24);
  assert.equal(r1(Math.atan2(dz, dx) * 180 / Math.PI), 20, 'Balken um 20° gedreht');
  // Kästchen entlang des abgeknickten Balkens
  const k = T.kaesten(u, L.ends);
  const aussen = k.boxes.find(x => x.side === 'L' && x.nr === 4);
  assert.deepEqual(aussen.b.map(r1), zurueck([0, 12]).map(r1));
});

// Düngerstreuer wie Hendriks Amazone ZA-TS (log.txt 23.10.): das Spiel meldet ungleiche Kanten 7,5/9/10,5/15/18/21 m,
// die Anzeige teilt gleichmäßig (Hendrik 24.10.2026: „sehr ungleichmäßig, obwohl die Teilbreiten alle gleich groß sind“)
test('Kästchen gleich breit in der Anzeige, an den echten Kanten für die Automatik', () => {
  const ZA = parseSections('1;0;6;6;6;6;L:1:21.00,L:1:18.00,L:1:15.00,L:1:10.50,L:1:9.00,L:1:7.50,R:1:-7.50,R:1:-9.00,R:1:-10.50,R:1:-15.00,R:1:-18.00,R:1:-21.00');
  const ends = [[-8, 21], [-8, -21]];
  const breiten = L => L.boxes.filter(b => b.side === 'L').sort((a, b) => a.nr - b.nr).map(b => r1(Math.abs(b.b[1] - b.a[1])));
  assert.deepEqual(breiten(T.kaesten({ sections: ZA }, ends)), [3.5, 3.5, 3.5, 3.5, 3.5, 3.5]);
  assert.deepEqual(breiten(T.lage(ZA, ends)), [7.5, 1.5, 1.5, 4.5, 3, 3]);
});

// Hendrik 24.10.2026 (zweiter Bericht): Balken blieb parallel und änderte die Breite. Der Winkel der Mod (rootNode) kann
// bei manchen gezogenen Spritzen ein anderes Teil sein -- der Winkel kommt deshalb aus den Arbeitsbereichen selbst
test('Gezogene Spritze: Knickwinkel aus den Arbeitsbereichen, auch wenn pose.angle 0 bleibt; schiefe Bereiche nicht', () => {
  const th = 20, t = th * Math.PI / 180, cs = Math.cos(t), sn = Math.sin(t);
  const zurueck = ([l, q]) => [l * cs + q * sn - 8, -l * sn + q * cs];
  // Bereich wie aus der Mod: start, width, (width + height − start), height
  const ecken = [[0.25, 12], [0.25, -12], [-0.25, -12], [-0.25, 12]].map(zurueck);
  const u = { name: 'Spritze', side: 'rear', depth: 1, attach: 'trailed', pose: { along: -3, across: 0, angle: 0 }, lowered: true, on: true,
    areas: [{ type: 'SPRAYER', corners: ecken }], sections: dammann(4, 4) };
  assert.equal(r1(T.geraeteWinkel(u)), 20);
  const [e] = arbeitsBalken({ inVehicle: true, posX: 0, posZ: 0, fwdX: 0, fwdZ: 1, units: [u], gps: { geraete: {} } });
  assert.equal(r1(Math.hypot(e.ends[0][0] - e.ends[1][0], e.ends[0][1] - e.ends[1][1])), 24, 'volle Breite');
  assert.equal(r1(Math.atan2(e.ends[0][1] - e.ends[1][1], e.ends[0][0] - e.ends[1][0]) * 180 / Math.PI), 20, 'knickt mit ab');
  // angebaut: pose.angle (0); schiefer Bereich (Pflug): pose.angle
  assert.equal(T.geraeteWinkel({ ...u, attach: 'mounted' }), 0);
  const schief = { ...u, pose: { along: -3, across: 0, angle: 3 }, areas: [{ type: 'PLOW', corners: [[-2, 1], [-5, -2], [-6, -2], [-3, 1]] }] };
  assert.equal(T.geraeteWinkel(schief), 3);
});

// Durchsicht 24.10.2026
test('Arbeitsbereich: Flügel nebeneinander zusammen, ohne Auswurf; schiefe Bereiche: der breiteste', () => {
  const fluegel = [{ type: 'DEFAULT', corners: [[-4, 6], [-4, 0], [-5, 0], [-5, 6]] }, { type: 'DEFAULT', corners: [[-4, 0], [-4, -6], [-5, -6], [-5, 0]] },
    { type: 'COMBINECHOPPER', corners: [[-8, 9], [-8, -9], [-9, -9], [-9, 9]] }];
  const a = T.arbeitsbereich({ name: 'Grubber', attach: 'mounted', areas: fluegel });
  const q = a.corners.map(c => c[1]);
  assert.equal(r1(Math.max(...q) - Math.min(...q)), 12, 'beide Flügel, ohne den 18-m-Auswurf');
  assert.equal(T.arbeitsbereich({ name: 'Lexion', areas: [fluegel[2]] }), null, 'nur Auswurf → kein Arbeitsbereich');
  // Pflug mit schiefen Bereichen (LEMKEN, 22°): nicht zusammenlegen
  const schief = [{ type: 'PLOW', corners: [[-3, 1], [-4, -1], [-6, -1], [-5, 1]] }, { type: 'PLOW', corners: [[-5, 1.5], [-6.5, -2], [-8.5, -2], [-7, 1.5]] }];
  const p = T.arbeitsbereich({ name: 'Pflug', attach: 'mounted', areas: schief });
  assert.equal(p, schief[1], 'breitester');
});

test('Balken von Hand mit Teilbreiten: Kästchen über die volle Breite, Fläche nur der aktive Teil', () => {
  const u = SPRITZE(2, 3);
  const hand = [[-6, 12], [-6, -12]];   // Handbalken steht immer für die volle Breite
  const L = T.kaesten(u, hand, null, true);
  assert.deepEqual(L.boxes.find(x => x.side === 'L' && x.nr === 3).b.map(r1), [-6, 12], 'äußere linke Teilbreite am Ende des Handbalkens');
  assert.equal(L.boxes.find(x => x.side === 'L' && x.nr === 3).on, false);
  const t = T.arbeitsTeile(u, hand, true);
  assert.equal(t.length, 1);
  const qs = t[0].ends.map(e => r1(e[1])).sort((a, b) => a - b);
  assert.deepEqual(qs, [-12, 8], 'links nur bis 8 m (2 von 3 an), rechts ganz');
  assert.deepEqual(T.arbeitsTeile(SPRITZE(0, 0), hand, true), [], 'alles aus → nichts bearbeitet');
  assert.equal(T.arbeitsTeile(u, hand, false), null, 'Balken aus dem Spiel: schon der aktive Teil');
  // flaeche.js: von Hand gesetzte Werte zählen nur mit gps.manual
  const takt = gps => ({ available: true, inVehicle: true, posX: 0, posZ: 0, fwdX: 0, fwdZ: 1, units: [{ ...u, lowered: true }],
    gps: { source: 'hand', unit: 'Spritze', corners: [[12, -6], [-12, -6]], geraete: {}, ...gps } });
  const breite = b => r1(Math.hypot(b.ends[0][0] - b.ends[1][0], b.ends[0][1] - b.ends[1][1]));
  assert.deepEqual(arbeitsBalken(takt({ manual: true })).map(breite), [20]);
  assert.deepEqual(arbeitsBalken(takt({ manual: false })).map(breite), [20], 'ohne Handwerte: Balken aus dem Spiel (auch 8 + 12 m)');
  assert.deepEqual(arbeitsBalken(takt({ manual: false, corners: [[30, -6], [-30, -6]] })).map(breite), [20], 'erfundene Handbreite zählt nicht');
});

test('„Automatisch“ zählt die Fläche je nach Gerät (Spritze an, Sämaschine an und unten, Grubber gesenkt)', () => {
  const spritze = { kind: 'sprayer', canTurnOn: true, canLower: true, on: true, lowered: false };
  assert.equal(T.arbeitet(spritze, {}), true, 'Spritze: an genügt, auch wenn das Spiel sie „angehoben“ führt');
  assert.equal(T.autoRegel(spritze), 'eingeschaltet');
  const saer = { kind: 'implement', canTurnOn: true, canLower: true, on: true, lowered: false };
  assert.equal(T.arbeitet(saer, {}), false, 'Sämaschine an, aber angehoben');
  assert.equal(T.arbeitet({ ...saer, lowered: true }, {}), true);
  assert.equal(T.autoRegel(saer), 'eingeschaltet und nicht angehoben');
  const grubber = { canTurnOn: false, lowered: true, on: null };
  assert.equal(T.arbeitet(grubber, { cov: 'auto' }), true);
  assert.equal(T.arbeitet({ ...grubber, lowered: false }, {}), false);
  assert.equal(T.autoRegel(grubber), 'gesenkt');
  assert.equal(T.arbeitet({ ...grubber, lowered: false }, { cov: 'an' }), false, '„Eingeschaltet“ ohne Ein/Aus → gesenkt');
});
