// Arbeitsplaner-Rechnung (public/js/plannerLogic.js): im Browser und im Server dieselbe, Planer-Werte der Werteliste.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../public/js/plannerLogic.js';
import '../public/js/werteliste.js';

const L = globalThis.PlannerLogic;
const W = globalThis.Werteliste;
const PLAN = {
  rules: { plow: false },
  fields: [
    { id: 12, area: 4.2, phase: 'erntereif', fruit: 'Weizen', live: false, tasks: { harvest: 1 } },
    { id: 3, area: 2, phase: 'geerntet', fruit: '', live: true, tasks: { cultivate: 0.4, sow: 1, lime: 0.05 } },
    { id: 7, area: 1.5, phase: 'waechst', fruit: 'Raps', live: false, tasks: { fertilize: 0.6 } },
    { id: 9, area: 3, phase: 'waechst', fruit: 'Gerste', live: false, tasks: {} }
  ]
};
const SET = { fruchtfolge: { rotation: ['Weizen', 'Raps'], plaene: {} }, complexes: { k1: { name: 'Nord', now: 0 } }, complexOrder: ['k1'], complexOf: { 3: 'k1' }, soil: { 3: 'grubber' } };

test('offene Arbeiten nach Dringlichkeit, Messrauschen unter 10 % zählt nicht', () => {
  assert.deepEqual(L.openTasks(PLAN.fields[1]).map(([k]) => k), ['sow', 'cultivate']);
  assert.deepEqual(L.nextUp(PLAN.fields, PLAN.fields[1], 5).map(r => r.f.id), [12, 7]);
});

test('Feld in Arbeit: Arbeit des Geräts, Anteil, offene ha, danach mit Fruchtfolge', () => {
  const units = [{ side: 'rear', kind: 'cultivator', lowered: true }];
  const li = L.liveInfo(PLAN, L.activityOf(units), SET);
  assert.equal(li.f.id, 3);
  assert.equal(li.label, 'Grubbern');
  assert.equal(Math.round(li.done * 100), 60);
  assert.equal(li.openHa.toFixed(2), '0.80');
  assert.equal(li.next, 'Säen: Raps');
  // ohne Gerät: wichtigste offene Arbeit
  assert.equal(L.liveInfo(PLAN, null, SET).label, 'Säen');
  assert.deepEqual(L.nextSteps(PLAN.fields[1], SET), ['Grubbern', 'Säen: Raps']);
});

test('Kurzfassung für die Werteliste und die Planer-Werte', () => {
  const sum = L.summary(PLAN, [{ side: 'rear', kind: 'cultivator', lowered: true }], SET);
  assert.equal(sum.fields, 4);
  assert.equal(sum.openFields, 3);
  assert.equal(sum.next, 'Feld 12: Ernten');
  const d = { available: true, planner: sum };
  const v = id => W.value(W.get('fs25', id), d);
  assert.equal(v('plan_live'), true);
  assert.equal(v('plan_live_field'), 3);
  assert.equal(v('plan_live_task'), 'Grubbern');
  assert.equal(v('plan_live_done'), 60);
  assert.equal(v('plan_next'), 'Feld 12: Ernten');
  assert.equal(v('plan_area').toFixed(1), '10.7');
  // nicht gemessen → unbekannt; nicht auf eigenem Feld → kein Feld in Arbeit
  assert.equal(W.value(W.get('fs25', 'plan_live'), { available: true, planner: null }), null);
  const off = L.summary({ ...PLAN, fields: PLAN.fields.map(f => ({ ...f, live: false })) }, [], SET);
  assert.equal(W.value(W.get('fs25', 'plan_live'), { available: true, planner: off }), false);
  assert.equal(W.value(W.get('fs25', 'plan_live_field'), { available: true, planner: off }), null);
});

// Anmerkung 24 (Hendrik 24.10.2026): Schritte je Frucht in der Fruchtfolge, Arbeiten von Hand, Abhaken
// Komplex Nord: Weizen → Raps → Mais → Ölrettich (Zwischenfrucht) → wieder Weizen
const PLAN_SET = () => ({
  // Satz mit internen Namen (wie nach plannerStore.cleanSet); die Felder melden Anzeigenamen wie eine Mod vor 0.7.4
  fruchtfolge: { rotation: ['WHEAT', 'CANOLA', 'MAIZE', 'OILSEEDRADISH'], plaene: {
    WHEAT: { vor: [{ k: 'pflug' }], saat: 'sow', pflege: [{ k: 'fertilize' }, { k: 'weeds' }], ernte: true, nach: [] },
    CANOLA: { vor: [{ k: 'grubber' }, { n: 'Gülle fahren' }], saat: 'sow', pflege: [{ k: 'fertilize' }], ernte: true, nach: [] },
    MAIZE: { vor: [{ k: 'grubber' }], saat: 'sow', pflege: [{ k: 'weeds' }], ernte: true, nach: [{ k: 'mulch' }] },
    OILSEEDRADISH: { vor: [], saat: 'sow', pflege: [], ernte: false, nach: [] }
  } },
  complexes: { k1: { name: 'Nord', now: 0 } },
  complexOrder: ['k1'], complexOf: { 1: 'k1', 2: 'k1', 3: 'k1', 4: 'k1', 5: 'k1' }, soil: {}, verlauf: {}
});
const lbl = (f, set) => L.nextSteps(f, set);

test('Fruchtfolge mit Schritten: Pflege und Ernte, danach Nach-der-Ernte und die nächste Frucht', () => {
  const set = PLAN_SET();
  // Raps wächst: Pflege (Düngen offen), Ernten
  assert.deepEqual(lbl({ id: 1, phase: 'waechst', fruit: 'Raps', tasks: { fertilize: 0.5 } }, set), ['Düngen', 'Ernten']);
  // Mais geerntet: Mulchen (nach der Ernte), dann Vorbereitung und Saat der nächsten Frucht (Ölrettich, ohne Vorbereitung)
  assert.deepEqual(lbl({ id: 2, phase: 'geerntet', fruit: 'Mais', tasks: { mulch: 1, cultivate: 1 } }, set), ['Mulchen', 'Säen: Ölrettich']);
  const det = L.nextStepsDetail({ id: 2, phase: 'geerntet', fruit: 'Mais', tasks: { mulch: 1 } }, set);
  assert.deepEqual(det.map(d => [d.abschnitt, d.frucht, d.abhaken]), [['nach', 'MAIZE', true], ['saat', 'OILSEEDRADISH', false]]);
  // Weizen geerntet und gegrubbert (Mod: keine Frucht mehr): Vorbereitung und Saat Raps; Grubbern ist am Feld erledigt
  set.verlauf[3] = { frucht: 'WHEAT', offen: ['cultivate'], ok: [] };
  assert.deepEqual(lbl({ id: 3, phase: 'vorbereitet', fruit: '', tasks: { sow: 1 } }, set), ['Gülle fahren', 'Säen: Raps']);
  set.verlauf[3].ok = ['CANOLA|vor:1'];
  assert.deepEqual(lbl({ id: 3, phase: 'vorbereitet', fruit: '', tasks: { sow: 1 } }, set), ['Säen: Raps']);
  // Zwischenfrucht steht: keine Ernte, sondern gleich Vorbereitung und Saat der nächsten Frucht (Weizen: Pflügen)
  assert.deepEqual(lbl({ id: 4, phase: 'waechst', fruit: 'Ölrettich', tasks: {} }, set), ['Pflügen', 'Säen: Weizen']);
  // leeres Feld ohne bekannte Frucht: Frucht „dieses Jahr“
  assert.deepEqual(lbl({ id: 5, phase: 'leer', fruit: '', tasks: { cultivate: 1 } }, set), ['Pflügen', 'Säen: Weizen']);
  // Mulchen war im Spiel offen und ist es nicht mehr → erledigt
  set.verlauf[2] = { frucht: 'MAIZE', offen: ['mulch'], ok: [] };
  assert.deepEqual(lbl({ id: 2, phase: 'geerntet', fruit: 'Mais', tasks: { cultivate: 1 } }, set), ['Säen: Ölrettich']);
  // ohne Plan im Komplex und ohne Komplex wie bisher
  assert.deepEqual(L.nextSteps(PLAN.fields[1], SET), ['Grubbern', 'Säen: Raps']);
});

test('Von Hand überschreibt den Plan bis alles abgehakt ist; Als Nächstes folgt dem Plan', () => {
  const set = PLAN_SET();
  const w = { id: 1, phase: 'geerntet', fruit: 'Weizen', tasks: { mulch: 1, cultivate: 1, sow: 1 } };
  set.vonHand = { 1: [{ s: { n: 'Kalk holen' }, ok: false }, { s: { k: 'harvest' }, ok: true }] };
  assert.deepEqual(L.nextStepsDetail(w, set).map(d => [d.label, d.id, d.quelle]), [['Kalk holen', 'hand:0', 'hand']]);
  set.vonHand = {};
  // Weizen geerntet: kein Mulchen (nicht geplant, obwohl das Spiel es meldet), sondern Grubbern für Raps
  assert.deepEqual(lbl(w, set), ['Grubbern', 'Gülle fahren', 'Säen: Raps']);
  const fields = [w, { id: 2, phase: 'waechst', fruit: 'Mais', tasks: { weeds: 0.4 } }, { id: 9, phase: 'waechst', fruit: 'Raps', tasks: { fertilize: 0.6 } }];
  assert.deepEqual(L.nextUp(fields, null, 5, set).map(x => [x.f.id, x.erste.label]), [[2, 'Unkraut bekämpfen'], [9, 'Düngen'], [1, 'Grubbern']]);
});

test('Eine Fruchtfolge, Komplexe wandern: Frucht je Komplex und Jahr, außerhalb der Fruchtfolge', () => {
  const set = { fruchtfolge: { rotation: ['CANOLA', 'WHEAT', 'BARLEY', 'MAIZE'], plaene: {} },
    complexes: { a: { name: 'A', now: 0 }, b: { name: 'B', now: 2 }, c: { name: 'C', now: null } }, complexOrder: ['a', 'b', 'c'], complexOf: { 1: 'a', 2: 'b', 3: 'c' } };
  assert.deepEqual([0, 1, 2, 3, 4].map(j => L.fruchtIm(set, 'b', j)), ['BARLEY', 'MAIZE', 'CANOLA', 'WHEAT', 'BARLEY']);
  assert.equal(L.fruchtIm(set, 'c', 0), null);
  assert.equal(L.nextFruit(set, 1), 'WHEAT');
  assert.equal(L.nextFruit(set, 3), null);
  // Folgefrucht nach der Frucht auf dem Feld, nicht nach „dieses Jahr“ (wenn der Komplex noch nicht weitergeschaltet ist)
  assert.equal(L.folgeFrucht(set, 'a', 'WHEAT'), 'BARLEY');
  assert.equal(L.folgeFrucht(set, 'a', 'OAT'), 'WHEAT', 'nicht in der Fruchtfolge: nächste Frucht des Komplexes');
});

test('Durchsicht 24.10.: dieselbe Frucht zweimal, Ernten erst wenn reif, Plan nur wo einer ist, Abhaken je Kennung', () => {
  // Raps → Weizen → Weizen → Gerste: nach dem zweiten Weizen kommt Gerste
  const set = { fruchtfolge: { rotation: ['CANOLA', 'WHEAT', 'WHEAT', 'BARLEY'], plaene: {
      WHEAT: { vor: [], saat: 'sow', pflege: [{ k: 'fertilize', id: 'aaaa01' }, { k: 'weeds', id: 'aaaa02' }], ernte: true, nach: [] },
      BARLEY: { vor: [{ k: 'grubber', id: 'bbbb01' }], saat: 'sow', pflege: [], ernte: true, nach: [] } } },
    complexes: { a: { name: 'A', now: 2 }, b: { name: 'B', now: 1 }, r: { name: 'R', now: 0 } }, complexOrder: ['a', 'b', 'r'],
    complexOf: { 1: 'a', 2: 'b', 3: 'r', 4: 'r' }, verlauf: {} };
  assert.equal(L.folgeFrucht(set, 'a', 'WHEAT'), 'BARLEY');
  assert.equal(L.folgeFrucht(set, 'b', 'WHEAT'), 'WHEAT');
  // wachsender Weizen im Stadium 1: Pflege steht, „Ernten“ nur als Ausblick, nicht als Nächstes
  const w = { id: 1, phase: 'waechst', fruit: 'Weizen', growth: 1, growthMax: 6, tasks: { fertilize: 0.5 } };
  assert.deepEqual(L.nextSteps(w, set), ['Düngen', 'Unkraut bekämpfen', 'Ernten']);
  assert.equal(L.ersteArbeit({ ...w, tasks: {} }, { ...set, fruchtfolge: { ...set.fruchtfolge, plaene: { WHEAT: { ...set.fruchtfolge.plaene.WHEAT, pflege: [] }, BARLEY: set.fruchtfolge.plaene.BARLEY } } }), null);
  assert.equal(L.ersteArbeit({ ...w, phase: 'erntereif', tasks: { harvest: 1 } }, set).label, 'Düngen');
  // Abhaken hängt an der Kennung: Düngen abgehakt, Unkraut bleibt -- auch wenn Düngen danach entfernt wird
  set.verlauf[1] = { frucht: 'WHEAT', offen: [], ok: ['WHEAT|aaaa01'], gruppe: 'wachsen' };
  assert.deepEqual(L.nextSteps(w, set), ['Unkraut bekämpfen', 'Ernten']);
  set.fruchtfolge.plaene.WHEAT.pflege.shift();
  assert.deepEqual(L.nextSteps(w, set), ['Unkraut bekämpfen', 'Ernten']);
  // Raps hat keinen Plan: wachsender Raps zeigt weiter die Arbeiten aus dem Spiel
  assert.deepEqual(L.nextSteps({ id: 3, phase: 'waechst', fruit: 'Raps', tasks: { fertilize: 0.4, weeds: 0.3 } }, set), ['Düngen', 'Unkraut bekämpfen']);
  // nächste Frucht überall gleich: leeres Feld ohne Vorfrucht = Frucht „dieses Jahr“
  const leer = { id: 4, phase: 'leer', fruit: '', tasks: { cultivate: 1 } };
  assert.equal(L.naechsteFrucht(leer, set), 'CANOLA');
  assert.equal(L.naechsteFrucht({ ...leer, phase: 'geerntet' }, set), 'WHEAT');
});

// Früchte über den internen Namen (Hendrik 24.10.2026: „woher nimmst du die Fruchttypen?“)
test('Früchte: interner Name aus Spiel-Liste, deutschem oder englischem Namen; Anzeige wie im Spiel', () => {
  const spiel = { fruechte: [{ key: 'WHEAT', title: 'Weizen' }, { key: 'BEETROOT', title: 'Rote Beete' }, { key: 'HOPS', title: 'Hopfen' }] };
  assert.deepEqual(['Weizen', 'WHEAT', 'Wheat', 'Rote Bete', 'Sugar Beet', 'Ölrettich', 'Sonnenblume'].map(x => L.fruchtKey(x)),
    ['WHEAT', 'WHEAT', 'WHEAT', 'BEETROOT', 'SUGARBEET', 'OILSEEDRADISH', 'SUNFLOWER']);
  assert.equal(L.fruchtKey('Hopfen'), 'Hopfen', 'ohne Liste des Spiels unbekannt: bleibt');
  assert.equal(L.fruchtKey('Hopfen', spiel), 'HOPS', 'Frucht einer Karten-Mod aus der Liste des Spiels');
  assert.equal(L.fruchtName('BEETROOT', spiel), 'Rote Beete', 'Anzeige wie im Spiel');
  assert.equal(L.fruchtName('BEETROOT'), 'Rote Bete');
  assert.equal(L.fruchtName('CANOLA', { fruechte: [{ key: 'CANOLA', title: 'CANOLA' }] }), 'Raps', 'ohne Namen im Spiel: deutsch');
  assert.deepEqual(L.fruchtListe(spiel).map(f => f.key), ['WHEAT', 'BEETROOT', 'HOPS']);
  assert.equal(L.fruchtListe({}).length, 27, 'ohne Liste: die 27 Fruchtarten von LS25');
  // Feld mit Mod 0.7.4 (fruitKey) und englischer Spielsprache: passt trotzdem zum Plan
  const set = { ...PLAN_SET(), fruechte: spiel.fruechte };
  assert.deepEqual(L.nextSteps({ id: 1, phase: 'waechst', fruit: 'Canola', fruitKey: 'CANOLA', tasks: { fertilize: 0.5 } }, set), ['Düngen', 'Ernten']);
  assert.deepEqual(L.nextSteps({ id: 2, phase: 'geerntet', fruit: 'Corn', fruitKey: 'MAIZE', tasks: { mulch: 1 } }, set), ['Mulchen', 'Säen: Ölrettich']);
});

// Planer-Ergänzungen (Hendrik 24.10.2026): Abhaken zurücknehmen, andere Frucht, Arbeitsliste je Arbeit
test('Abgehakte Schritte kommen auf Wunsch mit (zum Zurücknehmen), ohne Wunsch nicht', () => {
  const set = PLAN_SET();
  set.verlauf[3] = { frucht: 'WHEAT', offen: ['cultivate'], ok: ['CANOLA|vor:1'] };
  const f = { id: 3, phase: 'vorbereitet', fruit: '', tasks: { sow: 1 } };
  assert.deepEqual(L.nextSteps(f, set), ['Säen: Raps']);
  assert.deepEqual(L.nextStepsDetail(f, set, { erledigte: true }).map(d => [d.label, !!d.erledigt]), [['Gülle fahren', true], ['Säen: Raps', false]]);
  set.vonHand = { 3: [{ s: { n: 'Kalk holen' }, ok: true }, { s: { k: 'roll' }, ok: false }] };
  assert.deepEqual(L.nextStepsDetail(f, set, { erledigte: true }).map(d => [d.id, !!d.erledigt]), [['hand:0', true], ['hand:1', false]]);
  assert.deepEqual(L.nextSteps(f, set), ['Walzen']);
});

test('Andere Frucht als in der Fruchtfolge: Warnung, aber nicht für letztes, dieses oder nächstes Jahr', () => {
  const set = PLAN_SET();   // Weizen → Raps → Mais → Ölrettich, Komplex dieses Jahr Weizen
  const w = fr => ({ id: 1, phase: 'waechst', fruit: fr, tasks: {} });
  assert.equal(L.abweichung(w('Weizen'), set), null);
  assert.equal(L.abweichung(w('Raps'), set), null, 'nächstes Jahr (schon gesät, Anbaujahr noch nicht weitergeschaltet)');
  assert.equal(L.abweichung(w('Ölrettich'), set), null, 'letztes Jahr');
  assert.deepEqual(L.abweichung(w('Mais'), set), { ist: 'MAIZE', soll: 'WHEAT', stelle: 2 });
  assert.deepEqual(L.abweichung(w('Gerste'), set), { ist: 'BARLEY', soll: 'WHEAT', stelle: -1 });
  assert.equal(L.abweichung({ ...w('Gerste'), phase: 'geerntet' }, set), null, 'nur solange etwas wächst');
  assert.equal(L.abweichung({ ...w('Gerste'), id: 99 }, set), null, 'ohne Komplex keine Warnung');
});

test('Arbeitsliste: je Arbeit die Felder, dringlichste zuerst, Filter nach Art; Ernten erst, wenn reif', () => {
  const set = PLAN_SET();
  const fields = [
    { id: 1, phase: 'waechst', fruit: 'Raps', tasks: { fertilize: 0.5 } },              // Düngen (Plan), Ernten später
    { id: 2, phase: 'geerntet', fruit: 'Mais', tasks: { mulch: 1 } },                    // Mulchen, Säen: Ölrettich
    { id: 4, phase: 'waechst', fruit: 'Raps', tasks: { fertilize: 0.3 } },               // Düngen
    { id: 9, phase: 'erntereif', fruit: 'Gerste', tasks: { harvest: 1 } }                // ohne Komplex: Ernten aus dem Spiel
  ];
  const liste = L.arbeitsListe(fields, set);
  // Feld 2: erst Mulchen (Nach der Ernte), Säen kommt danach; Feld 9: erst Ernten, Säen noch nicht
  assert.deepEqual(liste.map(g => [g.label, g.felder.map(x => x.f.id)]), [['Ernten', [9]], ['Düngen', [1, 4]], ['Mulchen', [2]]]);
  const leer = { id: 5, phase: 'vorbereitet', fruit: '', tasks: { sow: 1 } };   // Komplex Nord, dieses Jahr Weizen: Pflügen, Säen
  assert.deepEqual(L.arbeitsListe([leer], set).map(g => g.label), ['Säen: Weizen'], 'Pflügen ist auf dem vorbereiteten Feld erledigt');
  assert.deepEqual(L.arbeitsListe(fields, set, 'duengen').map(g => g.label), ['Düngen']);
  // Raps reif, Düngen noch nicht abgehakt: Ernten steht trotzdem in der Liste
  assert.deepEqual(L.arbeitsListe([{ id: 1, phase: 'erntereif', fruit: 'Raps', tasks: { harvest: 1, fertilize: 0.2 } }], set).map(g => g.label), ['Ernten', 'Düngen']);
});
