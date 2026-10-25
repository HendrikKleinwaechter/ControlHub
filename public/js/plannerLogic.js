/**
 * Arbeitsplaner: Rechnen ohne DOM (Hendrik 22.10.2026 abends, Planer als normale Kachel). Läuft wie die Werteliste an
 * zwei Stellen mit genau derselben Logik: im Browser (window.PlannerLogic, planner.js mit Planer-Menü und den
 * Planer-Teilen in Kacheln) und im Server (`import '../public/js/plannerLogic.js'`, daraus die Planer-Werte der
 * Werteliste in jedem 'telemetry-update' als d.planner, s. server/index.js plannerContext()).
 *
 * plan = craftConsolePlan.xml der Mod (server/telemetryReader.js parsePlanXml): { rules, fields: [{ id, area, phase,
 * fruit, fruitKey, live, tasks: { harvest: 0..1, … } }] } -- je Arbeit der offene Anteil des Felds; fruit = Anzeigename,
 * fruitKey = interner Name der Frucht (ab Mod 0.7.4, z. B. WHEAT).
 *
 * Früchte (24.10.2026, Hendrik: „woher nimmst du die Fruchttypen?“): Fruchtfolge, Pläne und Verlauf führen den
 * INTERNEN Namen der Frucht (FruitTypeDesc.name, z. B. WHEAT). So passen Plan und Feld unabhängig von Schreibweise und
 * Spielsprache. Die Liste der Früchte kommt ab Mod 0.7.4 aus dem Spiel (craftConsoleMap.xml <fruit>, im Satz als
 * set.fruechte gemerkt); ohne sie gelten die Fruchtarten von LS25 (FRUECHTE). Angezeigt wird immer fruchtName().
 * set = Planer-Satz des Spielstands (server/plannerStore.js): eine Fruchtfolge mit Schritten je Frucht, Komplexe mit
 * ihrer Stelle darin,
 * Bodenbearbeitung je Feld, Arbeiten von Hand und der Verlauf je Feld (letzte Frucht, gesehene offene Arbeiten, Abgehakt).
 */
(function (root) {
  const TASKS = {
    harvest: { label: 'Ernten', group: 'ernte', prio: 1 },
    mulch: { label: 'Mulchen', group: 'ernte', prio: 6 },
    cultivate: { label: 'Bodenbearbeitung', group: 'bestellung', prio: 4 },
    plow: { label: 'Pflügen', group: 'bestellung', prio: 5 },
    stones: { label: 'Steine sammeln', group: 'bestellung', prio: 5 },
    roll: { label: 'Walzen', group: 'bestellung', prio: 6 },
    sow: { label: 'Säen', group: 'bestellung', prio: 2 },
    fertilize: { label: 'Düngen', group: 'duengen', prio: 3 },
    lime: { label: 'Kalken', group: 'duengen', prio: 4 },
    weeds: { label: 'Unkraut', group: 'schutz', prio: 3 }
  };
  const GROUPS = { alle: 'Alle', ernte: 'Ernte', bestellung: 'Bestellung', duengen: 'Düngen & Kalk', schutz: 'Pflanzenschutz' };
  const PHASES = { leer: 'leer', vorbereitet: 'vorbereitet', waechst: 'wächst', erntereif: 'erntereif', geerntet: 'geerntet', verdorrt: 'verdorrt' };
  // Zustand mit Wachstumsstufe (Mod 0.6, Test 23.10.2026, Anmerkung 16): „wächst · Stufe 3 von 6“ (6 = erntereif)
  const phaseText = f => {
    const p = PHASES[f?.phase] || f?.phase || '';
    return f?.phase === 'waechst' && f.growth > 0 && f.growthMax > 0 ? `${p} · Stufe ${f.growth} von ${f.growthMax}` : p;
  };
  // Was das angehängte Gerät gerade erledigt (Hendrik 22.10.2026: beim Grubbern zeigte der Fortschritt „Säen“ und
  // sank, weil die zu säende Fläche wuchs). Arten aus der Mod (describeUnit/IMPL_KINDS), Spritze/Streuer je Füllstoff.
  const ACTIVITY = { cultivate: 'Grubbern', plow: 'Pflügen', sow: 'Säen', fertilize: 'Düngen', lime: 'Kalken', weeds: 'Unkraut bekämpfen',
    roll: 'Walzen', stones: 'Steine sammeln', mulch: 'Mulchen', harvest: 'Ernten' };
  const KIND_TASK = { cultivator: 'cultivate', plow: 'plow', seeder: 'sow', roller: 'roll', weeder: 'weeds', stonePicker: 'stones',
    mulcher: 'mulch', header: 'harvest', harvester: 'harvest' };
  const MIN_SHARE = 0.1; // unter 10 % der Messpunkte zählt eine Arbeit nicht als offen (Messrauschen)

  // Offene Arbeiten eines Felds, wichtigste zuerst: [[task, offener Anteil], …]
  function openTasks(f) {
    return Object.entries(f?.tasks || {}).filter(([k, v]) => TASKS[k] && v >= MIN_SHARE)
      .sort((a, b) => TASKS[a[0]].prio - TASKS[b[0]].prio);
  }

  // Arbeit des Geräts: gesenkte/eingeschaltete Geräte zuerst, sonst irgendein angehängtes; Drescher selbst = Ernten
  function activityOf(units) {
    if (!Array.isArray(units)) return null;
    if (units.some(u => u.side === 'self' && u.kind === 'harvester')) return 'harvest';
    const imps = units.filter(u => u.side !== 'self');
    const working = imps.filter(u => u.lowered === true || u.on === true);
    for (const u of (working.length ? working : imps)) {
      if (KIND_TASK[u.kind]) return KIND_TASK[u.kind];
      if (u.kind === 'sprayer') {
        const fills = (u.fills || []).map(f => `${f.type || ''} ${f.name || ''}`.toUpperCase());
        if (fills.some(f => f.includes('LIME') || f.includes('KALK'))) return 'lime';
        if (fills.some(f => f.includes('HERBICIDE') || f.includes('HERBIZID'))) return 'weeds';
        return 'fertilize';
      }
    }
    return null;
  }

  // Offener Anteil der Arbeit des Geräts auf dem Feld (0..1). Pflügen ohne Pflugpflicht im Spiel zählt wie
  // Bodenbearbeitung (der Pflug macht die Fläche ja ebenfalls „bearbeitet“).
  function activityShare(f, task, rules) {
    const t = task === 'plow' && !rules?.plow ? 'cultivate' : task;
    return f?.tasks?.[t] ?? 0;
  }

  // ---------- Vorgaben (Planer-Satz) ----------
  function complexOf(set, fid) { const cid = set?.complexOf?.[fid]; return cid && set.complexes?.[cid] ? cid : ''; }
  // EINE Fruchtfolge je Planer-Satz; jeder Komplex steht an einer Stelle (now) und rückt jedes Anbaujahr eine Frucht
  // weiter (Hendrik 24.10.2026: „die Komplexe wandern Schritt für Schritt durch“). now = null: außerhalb der Fruchtfolge.
  const fruchtfolge = set => set?.fruchtfolge?.rotation || [];
  function fruchtIm(set, cid, jahre = 0) {
    const r = fruchtfolge(set), c = set?.complexes?.[cid];
    if (!r.length || !Number.isInteger(c?.now)) return null;
    return r[(((c.now + jahre) % r.length) + r.length) % r.length];
  }
  function nextFruit(set, fid) { return fruchtIm(set, complexOf(set, fid), 1); }
  // ---------- Schritte in der Fruchtfolge und Arbeiten von Hand (Anmerkung 24, Hendrik 24.10.2026) ----------
  // Erst als „Regeln je Frucht“ (eigener Reiter), dann auf Hendriks Wunsch zusammen mit der Fruchtfolge: „man behält
  // besser die Übersicht“. Je Frucht der Fruchtfolge ein Plan in fünf Abschnitten (gilt für alle Komplexe):
  //   Vorbereitung (vor der Saat) → Saat (Säen oder Direktsaat) → Pflege → Ernte (oder Zwischenfrucht ohne Ernte) → Nach der Ernte
  // Wo das Feld steht, ergibt sich aus dem Feldzustand: Frucht wächst → Pflege und Ernte dieser Frucht; geerntet bzw.
  // bearbeitet → „Nach der Ernte“ dieser Frucht, dann Vorbereitung und Saat der nächsten Frucht der Fruchtfolge. Nach dem
  // Grubbern meldet die Mod keine Frucht mehr -- der Server merkt sich die letzte je Feld (plannerStore.js merkeFelder).
  // Schritt = { k: Schlüssel aus SCHRITTE } oder { n: eigener Name }.
  const SCHRITTE = {
    mulch: { label: 'Mulchen', task: 'mulch', group: 'ernte', prio: 6 },
    grubber: { label: 'Grubbern', soil: true, group: 'bestellung', prio: 4 },
    pflug: { label: 'Pflügen', soil: true, group: 'bestellung', prio: 4 },
    stones: { label: 'Steine sammeln', task: 'stones', group: 'bestellung', prio: 5 },
    lime: { label: 'Kalken', task: 'lime', group: 'duengen', prio: 4 },
    roll: { label: 'Walzen', task: 'roll', group: 'bestellung', prio: 6 },
    fertilize: { label: 'Düngen', task: 'fertilize', group: 'duengen', prio: 3 },
    weeds: { label: 'Unkraut bekämpfen', task: 'weeds', group: 'schutz', prio: 3 },
    // feste Punkte des Plans (Saat, Ernte); in Listen „von Hand“ auch als Schritt wählbar
    sow: { label: 'Säen', sow: true, fest: true, group: 'bestellung', prio: 2 },
    direktsaat: { label: 'Direktsaat', sow: true, fest: true, group: 'bestellung', prio: 2 },
    harvest: { label: 'Ernten', task: 'harvest', fest: true, group: 'ernte', prio: 1 }
  };
  const ABSCHNITTE = { vor: 'Vorbereitung', pflege: 'Pflege', nach: 'Nach der Ernte' };
  const LEER = '(leer)';   // Verlauf eines Felds, auf dem noch keine Frucht gesehen wurde
  const schrittLabel = st => SCHRITTE[st?.k]?.label || st?.n || '?';

  // ---------- Früchte: interner Name ↔ Anzeigename ----------
  // Fruchtarten, die LS25 lädt (Hendriks log.txt vom 22.10.2026, „Loaded fruit type …“), mit deutschem Namen. Gilt nur,
  // solange die Mod (ab 0.7.4) die Liste des Spiels noch nicht geliefert hat; die Namen des Spiels haben Vorrang.
  const FRUECHTE = { WHEAT: 'Weizen', BARLEY: 'Gerste', OAT: 'Hafer', CANOLA: 'Raps', MAIZE: 'Mais', SUNFLOWER: 'Sonnenblumen',
    SOYBEAN: 'Sojabohnen', POTATO: 'Kartoffeln', RICE: 'Reis', RICELONGGRAIN: 'Langkornreis', SUGARBEET: 'Zuckerrüben',
    SUGARCANE: 'Zuckerrohr', COTTON: 'Baumwolle', SORGHUM: 'Sorghum', GRAPE: 'Trauben', OLIVE: 'Oliven', POPLAR: 'Pappeln',
    BEETROOT: 'Rote Bete', CARROT: 'Karotten', PARSNIP: 'Pastinaken', GREENBEAN: 'Grüne Bohnen', PEA: 'Erbsen', SPINACH: 'Spinat',
    GRASS: 'Gras', OILSEEDRADISH: 'Ölrettich', MEADOW: 'Wiese', ONION: 'Zwiebeln' };
  // andere Schreibweisen (Einzahl, ältere Planer-Daten) → interner Name
  const ANDERE_NAMEN = { 'rote beete': 'BEETROOT', sonnenblume: 'SUNFLOWER', sojabohne: 'SOYBEAN', soja: 'SOYBEAN', kartoffel: 'POTATO',
    'zuckerrübe': 'SUGARBEET', karotte: 'CARROT', 'möhren': 'CARROT', 'möhre': 'CARROT', pastinake: 'PARSNIP', erbse: 'PEA',
    bohnen: 'GREENBEAN', olive: 'OLIVE', pappel: 'POPLAR', zwiebel: 'ONION', traube: 'GRAPE', weintrauben: 'GRAPE', grünland: 'MEADOW' };
  const ZWISCHENFRUECHTE = ['OILSEEDRADISH'];   // im Plan ohne Ernte, die nächste Frucht kommt in den Bestand
  const klein = x => String(x || '').trim().replace(/\s+/g, ' ').toLowerCase();
  // Liste der Früchte [{ key, title }]: aus dem Spiel, sonst die von LS25
  function fruchtListe(set) {
    return Array.isArray(set?.fruechte) && set.fruechte.length ? set.fruechte : Object.entries(FRUECHTE).map(([key, title]) => ({ key, title }));
  }
  // Interner Name zu einem gespeicherten oder gemeldeten Wert (interner Name, Anzeigename des Spiels, deutscher oder
  // englischer Name); unbekannt (z. B. eine eigene Frucht ohne Liste des Spiels): unverändert
  function fruchtKey(x, set) {
    const s = String(x || '').trim();
    if (!s || s === LEER) return s;
    const liste = Array.isArray(set?.fruechte) ? set.fruechte : [];
    if (liste.some(f => f.key === s) || FRUECHTE[s]) return s;
    const k = klein(s);
    const imSpiel = liste.find(f => klein(f.title) === k || klein(f.key) === k);
    if (imSpiel) return imSpiel.key;
    const deutsch = Object.entries(FRUECHTE).find(([, t]) => klein(t) === k);
    if (deutsch) return deutsch[0];
    if (ANDERE_NAMEN[k]) return ANDERE_NAMEN[k];
    const gross = s.toUpperCase().replace(/[\s_-]+/g, '');   // englische Namen: „Wheat“, „Sugar Beet“, „Green Bean“
    return FRUECHTE[gross] ? gross : s;
  }
  // Anzeigename: wie im Spiel, sonst deutsch, sonst der Wert selbst (meldet das Spiel keinen Namen, steht dort der interne)
  function fruchtName(key, set) {
    if (!key) return '';
    const f = Array.isArray(set?.fruechte) ? set.fruechte.find(x => x.key === key) : null;
    return (f?.title && f.title !== key ? f.title : '') || FRUECHTE[key] || f?.title || String(key);
  }
  // Frucht auf dem Feld (interner Name): ab Mod 0.7.4 gemeldet, sonst aus dem Anzeigenamen
  function fruchtVonFeld(f, set) { return f?.fruitKey || fruchtKey(f?.fruit, set); }
  const istZwischenfrucht = key => ZWISCHENFRUECHTE.includes(key);

  // Frucht, die zuletzt auf dem Feld stand (auf dem Feld, sonst aus dem Verlauf), als interner Name
  function letzteFrucht(f, set) {
    const v = set?.verlauf?.[f?.id]?.frucht;
    return fruchtVonFeld(f, set) || (v && v !== LEER ? v : '');
  }
  // Frucht nach k in der Fruchtfolge; steht k nicht darin: die Frucht, die für den Komplex als Nächstes dran ist.
  // Steht k mehrfach darin (z. B. Raps → Weizen → Weizen → Gerste), zählt die Stelle, an der der Komplex dieses oder
  // zuletzt stand (Durchsicht 24.10.2026: vorher kam nach dem zweiten Weizen wieder Weizen)
  function folgeFrucht(set, cid, k) {
    const r = fruchtfolge(set), n = r.length;
    if (!n) return null;
    const stellen = r.map((x, i) => (x === k ? i : -1)).filter(i => i >= 0);
    if (!k || !stellen.length) return fruchtIm(set, cid, 1);
    const now = set?.complexes?.[cid]?.now;
    const zurueck = j => (Number.isInteger(now) ? (((now - j) % n) + n) % n : j);   // 0 = dieses Jahr, 1 = letztes …
    const i = stellen.reduce((best, j) => (zurueck(j) < zurueck(best) ? j : best), stellen[0]);
    return r[(i + 1) % n];
  }
  // Nächste Frucht eines Felds aus seinem Zustand -- eine Stelle für alle Anzeigen (Durchsicht 24.10.2026: Planer,
  // Feldfenster und „danach“ waren sich vorher uneinig): steht oder stand eine Frucht darauf, deren Folgefrucht; geerntet
  // ohne bekannte Frucht: die nach „dieses Jahr“; leeres Feld ohne Vorfrucht: die Frucht „dieses Jahr“
  function naechsteFrucht(f, set) {
    const cid = complexOf(set, f?.id), K = letzteFrucht(f, set);
    if (K) return folgeFrucht(set, cid, K);
    return fruchtIm(set, cid, f?.phase === 'geerntet' || f?.phase === 'verdorrt' ? 1 : 0);
  }

  /**
   * Wo steht das Feld im Plan seines Komplexes? null = kein Komplex oder keine Schritte geplant.
   * @returns {{ cid, c, stufe: 'pflege'|'nach'|'vor', K, N, pK, pN }|null}  K = Frucht im/nach dem Anbau, N = nächste
   */
  function planLage(f, set) {
    const cid = complexOf(set, f?.id), c = cid ? set.complexes[cid] : null;
    const plaene = set?.fruchtfolge?.plaene || {};
    if (!c || !Number.isInteger(c.now) || !fruchtfolge(set).length || !Object.keys(plaene).length) return null;
    const K = letzteFrucht(f, set);
    const stufe = f.fruit && (f.phase === 'waechst' || f.phase === 'erntereif') ? 'pflege' : K ? 'nach' : 'vor';
    const N = naechsteFrucht(f, set);
    const pK = plaene[K] || null, pN = plaene[N] || null;
    // Nur mit Plan für den Abschnitt, in dem das Feld steht -- sonst wie bisher aus dem Bodenzustand (Durchsicht 24.10.:
    // ein Plan für irgendeine Frucht schaltete alle Felder um, die Arbeiten aus dem Spiel fehlten dann)
    if (stufe === 'pflege' ? !pK : stufe === 'nach' ? !(pK || pN) : !pN) return null;
    return { cid, c, stufe, K: stufe === 'vor' ? '' : K, N, pK, pN };
  }

  /**
   * Nächste Schritte mit Herkunft: [{ label, id?, k?, quelle: 'hand'|'plan'|'spiel', abhaken, abschnitt?, frucht? }]
   * - Von Hand festgelegt (set.vonHand[Feld], mit Abhaken): gilt, bis alles abgehakt ist.
   * - Plan der Fruchtfolge: ersetzt die erzeugten Schritte. Bodenbearbeitung vor der Saat erledigt der Feldzustand,
   *   Saat und Ernte ebenso; eine Arbeit, die das Spiel meldet, ist erledigt, sobald sie dort offen war und es nicht mehr
   *   ist. Meldet das Spiel sie gar nicht (oder ist es ein eigener Schritt), hakt man ab.
   * - Sonst wie bisher aus dem Bodenzustand und den Vorgaben.
   */
  // erledigte: true liefert die abgehakten Schritte mit (erledigt: true), damit man sie zurücknehmen kann (24.10.2026)
  function nextStepsDetail(f, set, { erledigte = false } = {}) {
    const hand = set?.vonHand?.[f.id];
    if (Array.isArray(hand) && hand.some(h => !h.ok)) {
      return hand.map((h, i) => ({ label: schrittLabel(h.s), id: `hand:${i}`, k: h.s?.k, quelle: 'hand', abhaken: true, erledigt: !!h.ok }))
        .filter(x => erledigte || !x.erledigt);
    }
    const z = planLage(f, set);
    if (!z) return autoSteps(f, set).map(label => ({ label, quelle: 'spiel', abhaken: false }));
    const open = new Map(openTasks(f));
    const v = set.verlauf?.[f.id] || { offen: [], ok: [] };
    const out = [];
    const add = (liste, abschnitt, frucht) => (liste || []).forEach((st, i) => {
      // Abhaken je Schritt-Kennung (sonst je Stelle: beim Entfernen eines Schritts wanderte das Häkchen weiter)
      const id = `${frucht}|${st.id || `${abschnitt}:${i}`}`, d = SCHRITTE[st.k];
      if ((v.ok || []).includes(id)) {
        if (erledigte) out.push({ label: schrittLabel(st), id, k: st.k, quelle: 'plan', abhaken: true, abschnitt, frucht, erledigt: true });
        return;
      }
      if (d?.soil && abschnitt !== 'pflege' && f.phase === 'vorbereitet') return;       // Boden ist bearbeitet
      // war im jetzigen Abschnitt (Wachstum bzw. Ruhe) offen und ist es nicht mehr; offen führt der Server je Abschnitt
      if (d?.task && !open.has(d.task) && (v.offen || []).includes(d.task)) return;
      out.push({ label: schrittLabel(st), id, k: st.k, quelle: 'plan', abhaken: true, abschnitt, frucht });
    });
    const saat = () => {
      add(z.pN?.vor, 'vor', z.N);
      const k = z.pN?.saat === 'direktsaat' ? 'direktsaat' : 'sow';
      out.push({ label: `${SCHRITTE[k].label}: ${fruchtName(z.N, set)}`, k, quelle: 'plan', abhaken: false, abschnitt: 'saat', frucht: z.N });
    };
    if (z.stufe === 'pflege') {
      add(z.pK?.pflege, 'pflege', z.K);
      if (z.pK?.ernte === false) saat();   // Zwischenfrucht: die nächste Frucht kommt in den Bestand
      else {
        // „Ernten“ steht als Ausblick in der Liste, ist aber erst dran, wenn die Frucht reif ist (Als Nächstes)
        out.push({ label: 'Ernten', k: 'harvest', quelle: 'plan', abhaken: false, abschnitt: 'ernte', frucht: z.K, spaeter: !open.has('harvest') });
        add(z.pK?.nach, 'nach', z.K);
      }
    } else {
      if (z.stufe === 'nach') add(z.pK?.nach, 'nach', z.K);
      saat();
    }
    return out;
  }
  function nextSteps(f, set) { return nextStepsDetail(f, set).map(x => x.label); }

  // Wächst auf dem Feld eine andere Frucht, als die Fruchtfolge vorsieht? (Hendrik 24.10.2026) Erlaubt sind die Frucht
  // des Komplexes dieses, letztes und nächstes Jahr (Anbaujahr noch nicht oder schon weitergeschaltet).
  // @returns {{ ist, soll, stelle }|null}  stelle = Stelle von ist in der Fruchtfolge (-1 = nicht darin)
  function abweichung(f, set) {
    if (f?.phase !== 'waechst' && f?.phase !== 'erntereif') return null;
    const cid = complexOf(set, f.id), r = fruchtfolge(set);
    if (!cid || !r.length || !Number.isInteger(set.complexes[cid].now)) return null;
    const ist = fruchtVonFeld(f, set);
    if (!ist || [-1, 0, 1].some(j => fruchtIm(set, cid, j) === ist)) return null;
    return { ist, soll: fruchtIm(set, cid, 0), stelle: r.indexOf(ist) };
  }

  // Arbeitsliste je Arbeit (Hendrik 24.10.2026): welche Felder jetzt Düngen, Grubbern … brauchen -- nach Plan, von Hand
  // oder aus dem Spiel (jetztDran). „Ernten“ erst, wenn reif. gruppe = Filter (ernte/bestellung/duengen/schutz).
  // @returns [{ label, group, prio, felder: [{ f, id, abhaken }] }]  dringlichste Arbeit zuerst
  const NACH_LABEL = {};
  for (const d of [...Object.values(TASKS), ...Object.values(SCHRITTE)]) NACH_LABEL[d.label] = { group: d.group, prio: d.prio };
  // Arbeit aus dem Spiel (ohne Plan), die gerade offen ist -- Säen auch auf leerem bzw. vorbereitetem Feld
  const SPIEL_ARBEIT = { Ernten: ['harvest'], Mulchen: ['mulch'], 'Pflügen': ['plow', 'cultivate'], Grubbern: ['cultivate', 'plow'],
    Bodenbearbeitung: ['cultivate', 'plow'], 'Steine sammeln': ['stones'], Kalken: ['lime'], Walzen: ['roll'], 'Düngen': ['fertilize'],
    'Unkraut bekämpfen': ['weeds'], 'Säen': ['sow'] };
  // Was auf dem Feld JETZT dran ist: beim Plan alle Schritte des ersten offenen Abschnitts (z. B. Düngen und Unkraut in der
  // Pflege), von Hand der nächste Schritt, sonst was das Spiel offen meldet (nicht schon „Säen“, solange geerntet werden muss)
  function jetztDran(f, set) {
    const det = nextStepsDetail(f, set).filter(d => !d.spaeter && d.label !== 'nichts geplant');
    if (!det.length) return [];
    if (det[0].quelle === 'hand') return [det[0]];
    if (det[0].quelle === 'plan') return det.filter(d => d.abschnitt === det[0].abschnitt || d.k === 'harvest');   // reif: Ernten auch
    const open = new Map(openTasks(f));
    return det.filter(d => {
      const basis = d.label.split(':')[0];
      return (SPIEL_ARBEIT[basis] || []).some(t => open.has(t)) || (basis === 'Säen' && (f.phase === 'leer' || f.phase === 'vorbereitet'));
    });
  }
  function arbeitsListe(fields, set, gruppe = 'alle') {
    const m = new Map();
    for (const f of fields || []) {
      for (const d of jetztDran(f, set)) {
        const def = SCHRITTE[d.k] || NACH_LABEL[d.label] || NACH_LABEL[d.label.split(':')[0]] || null;
        if (gruppe !== 'alle' && def?.group !== gruppe) continue;
        let g = m.get(d.label);
        if (!g) m.set(d.label, g = { label: d.label, group: def?.group || '', prio: def?.prio ?? 3, felder: [] });
        if (!g.felder.some(x => x.f === f)) g.felder.push({ f, id: d.id, abhaken: d.abhaken });
      }
    }
    return [...m.values()].sort((a, b) => a.prio - b.prio || a.label.localeCompare(b.label, 'de'));
  }

  // Nächste Schritte ohne Regel: Bodenzustand aus der Mod plus Vorgaben (Bodenbearbeitung, Fruchtfolge)
  function autoSteps(f, set) {
    const open = new Map(openTasks(f));
    const soil = set?.soil?.[f.id] || null;
    const afterHarvest = f.phase === 'geerntet' || open.has('cultivate') || open.has('plow');
    const steps = [];
    if (open.has('harvest')) steps.push('Ernten');
    if (open.has('mulch')) steps.push('Mulchen');
    if (afterHarvest || open.has('harvest')) {
      if (soil === 'pflug') steps.push('Pflügen');
      else if (soil === 'grubber') steps.push('Grubbern');
      else if (soil !== 'keine' && (open.has('cultivate') || open.has('plow'))) steps.push(open.has('plow') ? 'Pflügen' : 'Bodenbearbeitung');
    }
    if (open.has('stones')) steps.push('Steine sammeln');
    if (open.has('lime')) steps.push('Kalken');
    if (open.has('sow') || afterHarvest || open.has('harvest') || f.phase === 'leer' || f.phase === 'vorbereitet') {
      const nf = naechsteFrucht(f, set);
      steps.push(nf ? `Säen: ${fruchtName(nf, set)}` : 'Säen');
    }
    if (open.has('roll')) steps.push('Walzen');
    if (open.has('fertilize')) steps.push('Düngen');
    if (open.has('weeds')) steps.push('Unkraut bekämpfen');
    return steps.length ? steps : ['nichts geplant'];
  }

  // ---------- Listen ----------
  // rows = [{ f, tasks }]; Dringlichkeit = wichtigste offene Arbeit, dann Feldnummer
  function sortRows(rows, sort) {
    return rows.sort((a, b) => {
      if (sort === 'feld') return a.f.id - b.f.id;
      if (sort === 'frucht') {   // nach Frucht (ohne Frucht ans Ende), innerhalb nach Feldnummer
        const fa = a.f.fruit || '￿', fb = b.f.fruit || '￿';
        return fa.localeCompare(fb, 'de') || a.f.id - b.f.id;
      }
      return (a.tasks[0] ? TASKS[a.tasks[0][0]].prio : 99) - (b.tasks[0] ? TASKS[b.tasks[0][0]].prio : 99) || a.f.id - b.f.id;
    });
  }
  // Erste Arbeit eines Felds { label, group, prio }: mit Plan der Fruchtfolge oder von Hand deren erster Schritt (ein
  // nicht geplantes, im Spiel noch offenes Mulchen zählt dann nicht), sonst die dringendste offene Arbeit aus dem Spiel
  function ersteArbeit(f, set) {
    if (set && (planLage(f, set) || set.vonHand?.[f.id]?.some(h => !h.ok))) {
      const d = nextStepsDetail(f, set).find(x => !x.spaeter);   // Ernten erst, wenn reif
      if (!d) return null;
      const def = SCHRITTE[d.k];
      return { label: d.label, group: def?.group || 'bestellung', prio: def?.prio ?? 3 };
    }
    const t = openTasks(f)[0];
    return t ? { label: TASKS[t[0]].label, group: TASKS[t[0]].group, prio: TASKS[t[0]].prio } : null;
  }
  // „Als Nächstes“: die dringendsten Arbeiten (mit set: nach Plan und von Hand), ohne das Feld, auf dem gerade
  // gearbeitet wird. rows = [{ f, tasks, erste }]
  function nextUp(fields, live, n = 5, set = null) {
    return (fields || []).filter(f => f !== live).map(f => ({ f, tasks: openTasks(f), erste: ersteArbeit(f, set) })).filter(r => r.erste)
      .sort((a, b) => a.erste.prio - b.erste.prio || a.f.id - b.f.id).slice(0, n);
  }

  // Feld in Arbeit: Arbeit des Geräts (sonst die wichtigste offene) mit Anteil erledigt, offene ha und was danach kommt
  function liveInfo(plan, activity, set) {
    const live = (plan?.fields || []).find(f => f.live);
    if (!live) return null;
    const main = activity ? [activity, activityShare(live, activity, plan.rules)] : openTasks(live)[0];
    const next = activity ? openTasks(live).filter(([k]) => k !== activity)[0] : null;
    const nf = next?.[0] === 'sow' ? naechsteFrucht(live, set) : null;
    return {
      f: live,
      task: main ? main[0] : null,
      label: main ? (activity ? ACTIVITY[activity] : TASKS[main[0]].label) : '',
      done: main ? 1 - main[1] : 1,
      openHa: main && live.area > 0 ? main[1] * live.area : null,
      next: next ? TASKS[next[0]].label + (nf ? `: ${fruchtName(nf, set)}` : '') : ''
    };
  }

  // Kurzfassung für die Werteliste (server/index.js → d.planner)
  function summary(plan, units, set) {
    if (!plan) return null;
    const fields = plan.fields || [];
    const open = fields.filter(f => openTasks(f).length);
    const li = liveInfo(plan, activityOf(units), set);
    const nx = nextUp(fields, li?.f, 1, set)[0];
    const area = list => list.reduce((s, f) => s + (f.area > 0 ? f.area : 0), 0);
    return {
      fields: fields.length,
      area: area(fields),
      openFields: open.length,
      openArea: area(open),
      live: li ? { id: li.f.id, fruit: li.f.fruit || PHASES[li.f.phase] || '', task: li.label || 'nichts offen',
        done: Math.round(li.done * 100), openHa: li.openHa, next: li.next } : null,
      next: nx ? `Feld ${nx.f.id}: ${nx.erste.label}` : null
    };
  }

  root.PlannerLogic = { TASKS, GROUPS, PHASES, phaseText, ACTIVITY, MIN_SHARE, openTasks, activityOf, activityShare, complexOf, nextFruit,
    fruchtfolge, fruchtIm, naechsteFrucht, SCHRITTE, ABSCHNITTE, LEER, FRUECHTE, fruchtListe, fruchtKey, fruchtName, fruchtVonFeld, istZwischenfrucht, schrittLabel, letzteFrucht, folgeFrucht, planLage, nextStepsDetail, nextSteps, abweichung, arbeitsListe, autoSteps, ersteArbeit, sortRows, nextUp,
    liveInfo, summary };
})(globalThis);
