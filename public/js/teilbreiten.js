/**
 * Teilbreiten (Hendrik 23.10.2026, Anmerkung 28) und Arbeitsbalken: Lage der Teilbreiten am Balken, Balken eines Geräts
 * im eigenen Rahmen (auch gezogen, abgeknickt), Precision-Farming-Düsen.
 * Läuft wie die Werteliste an zwei Stellen: im Browser (window.Teilbreiten, Karte zeichnet die Kästchen) und im Server
 * (`import '../public/js/teilbreiten.js'`: Fläche, GPS, Teilbreiten-Automatik in server/teilbreitenAutomatik.js).
 * Deshalb kein import/export und kein DOM.
 *
 * Mit Precision Farming (Mod 0.7.2, unit.pfSek) zeigen die Kästchen die Düsen-Teilbreiten von PF (s. unten kaesten).
 *
 * Daten aus der Mod 0.7 je Gerät (unit.sections, server/telemetryReader.js parseSections):
 *   { aktiv, mitte, links: { an, max }, rechts: { an, max }, liste: [{ side: 'L'|'R'|'C', on, abs }] }
 * Im Spiel (GDN VariableWorkWidth) sind Teilbreiten je Seite von innen nach außen sortiert; „Zustand n“ = die inneren
 * n sind an, abgeschaltet wird immer außen. abs = Außenkante der Teilbreite quer zur Gerätemitte, in Metern (bestätigt
 * mit Hendriks log.txt vom 23.10.2026: Dammann 3/6/9/12 m je Seite). Die Mitte (falls vorhanden) lässt sich nicht
 * abschalten und hat in den Daten oft abs 0.
 * Ausgeschaltete Teilbreiten schickt die Mod nicht als Arbeitsbereich: der Balken aus den Arbeitsbereichen ist also
 * immer nur der aktive Teil (bei Spritzen wird der eine Arbeitsbereich im Spiel ohnehin schmaler).
 *
 * Koordinaten: relativ zum Fahrzeug [längs, quer], längs + = vorn, quer + = links (wie die Mod).
 */
(function (root) {
  // Arbeitsbereiche, die nicht als Arbeit zählen (gleiche Liste wie server/flaeche.js und dashboardMap.js)
  const KEINE_ARBEIT = new Set(['COMBINECHOPPER', 'COMBINESWATH', 'HAULMDROP']);

  /**
   * Lage eines Arbeitsbalkens im eigenen Rahmen des Geräts. Gezogene Geräte knicken in der Kurve ab (unit.pose.angle,
   * Grad, wie server/gpsEngine.js autoValues: Geräte-Vorwärts im Fahrzeugrahmen = (cos θ, −sin θ), links = (sin θ, cos θ)).
   * Quer zum Traktor gemessen drehte der Balken nicht mit, wurde schmaler und verschob sich (Hendrik 24.10.2026:
   * „bei gezogenen Feldspritzen stimmt das Nachlaufverhalten überhaupt nicht“).
   * @param {number[][]} ecken  Ecken relativ zum Fahrzeug [längs, quer]
   * @param {number} [winkel]  Knickwinkel des Geräts in Grad (fehlt = 0)
   * @returns {{ ecken, ends, lMin, lMax, qMin, qMax, zuLokal, zurueck }|null}
   *   ecken = Rechteck im Gerätrahmen [vorn links, vorn rechts, hinten rechts, hinten links], ends = [linkes, rechtes Ende]
   *   auf halber Tiefe, beides relativ zum Fahrzeug; lMin…qMax im Gerätrahmen
   */
  function balkenLage(ecken, winkel) {
    if (!Array.isArray(ecken) || ecken.length < 2) return null;
    const t = Number.isFinite(winkel) ? winkel * Math.PI / 180 : 0, cs = Math.cos(t), sn = Math.sin(t);
    const zuLokal = ([a, c]) => [a * cs - c * sn, a * sn + c * cs];
    const zurueck = ([l, q]) => [l * cs + q * sn, -l * sn + q * cs];
    const loc = ecken.map(zuLokal);
    const ls = loc.map(p => p[0]), qs = loc.map(p => p[1]);
    const lMin = Math.min(...ls), lMax = Math.max(...ls), qMin = Math.min(...qs), qMax = Math.max(...qs), lm = (lMin + lMax) / 2;
    return {
      ecken: [[lMax, qMax], [lMax, qMin], [lMin, qMin], [lMin, qMax]].map(zurueck),
      ends: [zurueck([lm, qMax]), zurueck([lm, qMin])],
      lMin, lMax, qMin, qMax, zuLokal, zurueck
    };
  }

  /**
   * Knickwinkel des Geräts in Grad (wie unit.pose.angle: Geräte-Vorwärts im Fahrzeugrahmen = (cos θ, −sin θ)).
   * Angebaut (auch Unterlenker-Deichseln, die das Spiel so führt): pose.angle -- die Arbeitsbereiche eines Pflugs sind
   * schräg (echte Daten LEMKEN Juwel: Kante start→width um 22° gedreht), daraus käme ein falscher Winkel.
   * Gezogen (Anhängekupplung):
   * 1. aus den rechteckigen Arbeitsbereichen: Kante start→width liegt quer zum Gerät. Die Mod misst pose.angle am
   *    rootNode; bei manchen gezogenen Spritzen dreht dieses Teil anders als das Gestänge (Hendrik 24.10.2026).
   * 2. ohne Bereich (z. B. Anhänger): Richtung Gerät → Kupplung, wenn das Gerät weit genug dahinter liegt.
   * 3. sonst pose.angle (0, wenn unbekannt).
   */
  function geraeteWinkel(u) {
    const pose = Number.isFinite(u?.pose?.angle) ? u.pose.angle : 0;
    if (u?.attach !== 'trailed') return pose;
    let sa = 0, sc = 0;
    for (const a of Array.isArray(u?.areas) ? u.areas : []) {
      if (typeof a.type === 'string' && KEINE_ARBEIT.has(a.type)) continue;
      const [S, W, , H] = a.corners || [];
      if (!S || !W || !H) continue;
      let va = W[0] - S[0], vc = W[1] - S[1];
      const ha = H[0] - S[0], hc = H[1] - S[1], lw = Math.hypot(va, vc), lh = Math.hypot(ha, hc);
      if (lw < 0.3) continue;
      if (lh > 0.05 && Math.abs(va * ha + vc * hc) / (lw * lh) > 0.2) continue;   // schief: kein Rechteck
      if (vc < 0) { va = -va; vc = -vc; }   // Richtung nach links
      sa += va; sc += vc;
    }
    if (Math.hypot(sa, sc) > 0.3) return Math.atan2(sa, sc) * 180 / Math.PI;
    if (u.joint && u.pose) {
      const da = u.joint.along - u.pose.along, dc = u.joint.across - u.pose.across;   // Gerät → Kupplung = vorwärts
      if (Math.hypot(da, dc) >= 1.5) return Math.atan2(-dc, da) * 180 / Math.PI;
    }
    return pose;
  }

  /**
   * Arbeitsbereich eines Geräts für Balken, Fläche und GPS (eine Stelle für Karte, Server und GPS, Durchsicht 24.10.2026):
   * - mit Teilbreiten: Balken über alle aktiven Bereiche (balken);
   * - sonst ohne Auswurf/Krautablage (KEINE_ARBEIT; vorher nahm das GPS beim Mähdrescher den Häckslerauswurf);
   * - mehrere rechteckige Bereiche nebeneinander (Schmetterlings-Mähwerk, mehrteiliger Grubber): zusammen, sonst zählte
   *   nur ein Flügel; schräge Bereiche (Pflug) oder hintereinander: der breiteste.
   * @returns {{type, corners}|null}
   */
  function arbeitsbereich(u) {
    const tb = balken(u);
    if (tb) return tb;
    const liste = (Array.isArray(u?.areas) ? u.areas : []).filter(a => !(typeof a.type === 'string' && KEINE_ARBEIT.has(a.type)) && a.corners?.length >= 3);
    if (!liste.length) return null;
    const breite = a => { const q = a.corners.map(c => c[1]); return Math.max(...q) - Math.min(...q); };
    const breitester = liste.reduce((b, a) => (breite(a) > breite(b) ? a : b), liste[0]);
    if (liste.length < 2) return breitester;
    const rechteckig = a => {
      const [S, W, , H] = a.corners;
      const va = W[0] - S[0], vc = W[1] - S[1], ha = H[0] - S[0], hc = H[1] - S[1], lw = Math.hypot(va, vc), lh = Math.hypot(ha, hc);
      return lw >= 0.3 && (lh < 0.05 || Math.abs(va * ha + vc * hc) / (lw * lh) <= 0.2);
    };
    if (!liste.every(rechteckig)) return breitester;
    const w = geraeteWinkel(u);
    const lagen = liste.map(a => balkenLage(a.corners, w));
    // nebeneinander: die Bereiche überlappen sich längs (im Rahmen des Geräts)
    const lMin = Math.max(...lagen.map(L => L.lMin)), lMax = Math.min(...lagen.map(L => L.lMax));
    if (lMin > lMax + 0.5) return breitester;
    const L = balkenLage(liste.flatMap(a => a.corners), w);
    return { type: breitester.type, corners: L.ecken };
  }

  // Balken aus ALLEN Arbeitsbereichen eines Geräts mit Teilbreiten (je Teilbreite ein Bereich oder ein Bereich, der
  // schmaler wird): Rechteck über die Ausdehnung im Rahmen des Geräts. null = keine Teilbreiten oder kein Bereich.
  function balken(u) {
    if (!(u?.sections || u?.pfSek) || !Array.isArray(u.areas)) return null;
    const ecken = [];
    for (const a of u.areas) {
      if (typeof a.type === 'string' && KEINE_ARBEIT.has(a.type)) continue;
      ecken.push(...a.corners);
    }
    const L = ecken.length ? balkenLage(ecken, geraeteWinkel(u)) : null;
    if (!L || L.qMax - L.qMin < 0.05) return null;
    return { type: 'TEILBREITEN', corners: L.ecken };
  }

  /**
   * Arbeitet das Gerät gerade (zählt die Fläche, läuft die Automatik)? Je Gerät einstellbar (gps.json einheiten[Name].cov),
   * gleiche Regel für Karte und Server (vorher zweimal geschrieben).
   * - „auto“ (Durchsicht 24.10.2026): Spritze/Streuer eingeschaltet; mit Ein/Aus und Absenken (Sämaschine, Mähwerk) gesenkt
   *   und an; nur Ein/Aus: an; sonst gesenkt (oder an). Vorher „gesenkt oder an“ für alle: Eine abgesenkte, ausgeschaltete
   *   Spritze malte Fläche, die die Teilbreiten-Automatik dann für bearbeitet hielt.
   * - Ein Gerät ohne Ein/Aus im Spiel zählt bei „an“/„beides“ nach dem Absenken (Test 23.10.2026).
   */
  function covWirksam(u, opt) {
    const cov = opt?.cov || 'auto';
    return u?.canTurnOn !== true && u?.on !== true && (cov === 'an' || cov === 'beides') ? 'gesenkt' : cov;
  }
  function arbeitet(u, opt) {
    const low = u?.lowered === true, on = u?.on === true;
    switch (covWirksam(u, opt)) {
      case 'gesenkt': return low;
      case 'an': return on;
      case 'beides': return low && on;
      default:
        if (u?.canTurnOn === true) return u.kind === 'sprayer' || u.canLower !== true ? on : on && u.lowered !== false;
        return low || on;
    }
  }

  // Was „Automatisch“ bei diesem Gerät heißt (für die Einstellung „Fläche zählt als bearbeitet“), gleiche Regel wie arbeitet()
  function autoRegel(u) {
    if (u?.canTurnOn === true) return u.kind === 'sprayer' || u.canLower !== true ? 'eingeschaltet' : 'eingeschaltet und nicht angehoben';
    return 'gesenkt';
  }

  // Teilbreiten je Seite von innen nach außen, mit Außenkante e (≥ 0)
  function seiten(sec) {
    const liste = Array.isArray(sec?.liste) ? sec.liste : [];
    const sortiere = side => liste.filter(s => s.side === side).map(s => ({ ...s, e: Math.abs(s.abs) })).sort((a, b) => a.e - b.e);
    let L = sortiere('L'), R = sortiere('R');
    const C = liste.find(s => s.side === 'C') || null;
    // Ohne brauchbare Kanten (alle 0): gleich breit annehmen
    if (!L.some(s => s.e > 0.05) && !R.some(s => s.e > 0.05)) {
      L = L.map((s, i) => ({ ...s, e: i + 1 })); R = R.map((s, i) => ({ ...s, e: i + 1 }));
    }
    const c = C && Math.abs(C.abs) > 0.05 ? Math.abs(C.abs) : 0;
    return { L, R, C, c };
  }

  /**
   * Kästchen je Teilbreite entlang des Balkens.
   * @param {object} sec    unit.sections
   * @param {number[][]|null} ends  [linkes Ende, rechtes Ende] des aktiven Balkens (beliebiges 2D-System, z. B. relativ
   *   zum Fahrzeug); null = alles aus → dann gilt basis
   * @param {object} [basis] zuletzt gültige Lage { mitte, dir, k } (wenn gerade nichts aktiv ist)
   * @param {boolean} [gleich] Kästchen je Seite gleich breit (Anzeige); sonst an den echten Kanten (Automatik)
   * @returns {{ boxes: Array<{side, nr, on, a: number[], b: number[]}>, basis }|null}
   *   a/b = Endpunkte des Kästchens auf der Balkenlinie (a innen, b außen); nr = 1 innen … max außen
   */
  function lage(sec, ends, basis, gleich = false, voll = false) {
    if (!sec) return null;
    const { L, R, C, c } = seiten(sec);
    if (!L.length && !R.length && !C) return null;
    const anL = L.filter(s => s.on).length, anR = R.filter(s => s.on).length;
    const kanteL = anL ? L[anL - 1].e : c, kanteR = anR ? R[anR - 1].e : c;   // Außenkanten des aktiven Teils
    let b = null;
    if (ends && voll) {
      // Balken von Hand (GPS): steht für die ganze Breite, nicht nur den aktiven Teil (Durchsicht 24.10.2026: sonst
      // waren die Kästchen gestreckt und um Meter verschoben)
      const [PL, PR] = ends;
      const len = Math.hypot(PL[0] - PR[0], PL[1] - PR[1]);
      const aussenL = L.length ? L[L.length - 1].e : c, aussenR = R.length ? R[R.length - 1].e : c;
      if (len > 0.05 && aussenL + aussenR > 0.05) {
        const dir = [(PL[0] - PR[0]) / len, (PL[1] - PR[1]) / len], k = len / (aussenL + aussenR);
        b = { mitte: [PR[0] + dir[0] * aussenR * k, PR[1] + dir[1] * aussenR * k], dir, k };
      }
    } else if (ends) {
      const [PL, PR] = ends;
      const len = Math.hypot(PL[0] - PR[0], PL[1] - PR[1]);
      if (len > 0.05) {
        const dir = [(PL[0] - PR[0]) / len, (PL[1] - PR[1]) / len];   // nach links
        // Maßstab Kante → Koordinaten: abs ist in Metern (Hendriks log.txt 23.10.2026), also 1. Nur wenn beide Seiten an
        // sind und die gemessene Breite klar abweicht (andere Einheit), aus dem Verhältnis; sonst der zuletzt gültige.
        let k = basis?.k || 1;
        if (anL && anR && kanteL + kanteR > 0.05) { const r = len / (kanteL + kanteR); k = r > 0.85 && r < 1.18 ? 1 : r; }
        // Mitte von der Seite aus, die noch an ist: Deren Außenkante stimmt sicher. Ist eine Seite ganz aus, liegt die Kante
        // dort an der Mitte, die sich nicht abschalten lässt und in den Daten oft keine Breite hat. Vorher wurde dann neu
        // skaliert und die Anzeige sprang (Hendrik 23.10.2026: „springt, wenn man die letzte Teilbreite einer Seite abschaltet“)
        const vonR = [PR[0] + dir[0] * kanteR * k, PR[1] + dir[1] * kanteR * k];
        const vonL = [PL[0] - dir[0] * kanteL * k, PL[1] - dir[1] * kanteL * k];
        const mitte = anL && anR ? [(vonR[0] + vonL[0]) / 2, (vonR[1] + vonL[1]) / 2]
          : anR ? vonR : anL ? vonL : [(PL[0] + PR[0]) / 2, (PL[1] + PR[1]) / 2];
        b = { mitte, dir, k };
      }
    }
    if (!b) b = basis || null;
    if (!b) return null;
    const pt = (abstand) => [b.mitte[0] + b.dir[0] * abstand * b.k, b.mitte[1] + b.dir[1] * abstand * b.k];   // + = links
    // gleich: je Seite gleich breite Kästchen von der Mitte bis zur Außenkante (Anzeige, Hendrik 24.10.2026: „sehr
    // ungleichmäßig, obwohl die Teilbreiten alle gleich groß sind“ -- das Spiel meldet z. B. beim Amazone ZA-TS die
    // Kanten 7,5/9/10,5/15/18/21 m, zeigt die Teilbreiten selbst aber gleich groß). Sonst die echten Kanten (Automatik).
    const kanten = S => (gleich && S.length ? S.map((s, i) => c + (S[S.length - 1].e - c) * (i + 1) / S.length) : S.map(s => s.e));
    const eL = kanten(L), eR = kanten(R);
    const boxes = [];
    if (C) boxes.push({ side: 'C', nr: 0, on: C.on !== false, a: pt(-c), b: pt(c) });
    L.forEach((s, i) => boxes.push({ side: 'L', nr: i + 1, on: !!s.on, a: pt(i ? eL[i - 1] : c), b: pt(eL[i]) }));
    R.forEach((s, i) => boxes.push({ side: 'R', nr: i + 1, on: !!s.on, a: pt(-(i ? eR[i - 1] : c)), b: pt(-eR[i]) }));
    return { boxes, basis: b };
  }

  // Kurztext für Anzeigen: „links 3/4 · rechts 4/4“
  function text(sec) {
    if (!sec) return null;
    const { L, R } = seiten(sec);
    const anL = L.filter(s => s.on).length, anR = R.filter(s => s.on).length;
    return `links ${anL}/${L.length} · rechts ${anR}/${R.length}`;
  }

  // ---------- Precision Farming (Mod 0.7.2, unit.pfSek) ----------
  // PF schaltet seine Düsen selbst, die normalen Teilbreiten bleiben dabei an (Hendriks Probe vom 23.10.2026: am Feldrand
  // waren die beiden äußeren linken PF-Teilbreiten aus, spec_variableWorkWidth stand weiter auf 4/4). Je PF-Teilbreite
  // { nr, von, bis, an, n }: Außenkanten quer zur Gerätemitte (Meter, links +), Düsen an / alle. Die Düsen zählen nur,
  // solange das Gerät eingeschaltet ist; ausgeschaltet sind sie ohnehin alle aus.
  const hatPf = u => Array.isArray(u?.pfSek) && u.pfSek.length > 0;
  const pfZaehlt = u => hatPf(u) && u.on === true;
  const pfMitte = s => (s.von + s.bis) / 2;

  // Normale Teilbreite an der Stelle x (Meter, links +) an? Ohne Teilbreiten: an
  function anBei(sec, x) {
    if (!sec) return true;
    const { L, R, c } = seiten(sec);
    if (Math.abs(x) <= c) return true;
    const S = x >= 0 ? L : R;
    const t = S.find(s => s.e >= Math.abs(x) - 1e-6) || S[S.length - 1];
    return t ? !!t.on : true;
  }

  // Lage am Balken wie lage().basis; ohne normale Teilbreiten: Balkenmitte, Maßstab 1
  function pfBasis(u, ends, basis, voll = false) {
    if (u.sections) { const l = lage(u.sections, ends, basis, false, voll); if (l) return l.basis; }
    if (ends) {
      const [PL, PR] = ends;
      const len = Math.hypot(PL[0] - PR[0], PL[1] - PR[1]);
      if (len > 0.05) return { mitte: [(PL[0] + PR[0]) / 2, (PL[1] + PR[1]) / 2], dir: [(PL[0] - PR[0]) / len, (PL[1] - PR[1]) / len], k: 1 };
    }
    return basis || null;
  }
  const punkt = b => x => [b.mitte[0] + b.dir[0] * x * b.k, b.mitte[1] + b.dir[1] * x * b.k];

  /**
   * Kästchen für die Karte, je Seite gleich breit. Mit Precision Farming: eingeschaltet nach den Düsen im Kästchen, sonst
   * wie die normale Teilbreite; PF-Geräte ohne normale Teilbreiten zeigen die PF-Gruppen. Ohne PF die normalen
   * Teilbreiten (lage).
   * @param {{sections, pfSek, on}} u
   * @returns {{ boxes: Array<{side, nr, on, teil?, a, b}>, basis }|null}  teil = nur ein Teil der Düsen an
   */
  function kaesten(u, ends, basis, voll = false) {
    if (!hatPf(u)) return u?.sections ? lage(u.sections, ends, basis, true, voll) : null;
    // Precision Farming mit normalen Teilbreiten: deren gleich breite Kästchen, Zustand aus den Düsen darin (die
    // PF-Gruppen selbst sind ungleich, z. B. Mitte 3 m und daneben 1,5 m)
    if (u.sections) {
      const l = lage(u.sections, ends, basis, true, voll);
      if (!l || !pfZaehlt(u)) return l;
      const B = l.basis, quer = p => ((p[0] - B.mitte[0]) * B.dir[0] + (p[1] - B.mitte[1]) * B.dir[1]) / B.k;
      for (const box of l.boxes) {
        const x1 = Math.min(quer(box.a), quer(box.b)), x2 = Math.max(quer(box.a), quer(box.b));
        let alle = 0, an = 0;
        for (const s of u.pfSek) {
          const ueber = Math.min(x2, s.von) - Math.max(x1, s.bis);
          if (ueber <= 0) continue;
          const d = ueber * s.n / (s.von - s.bis);   // Düsen im Kästchen
          alle += d; an += d * s.an / s.n;
        }
        if (alle < 0.5) continue;                   // keine Düse darin (z. B. Mitte ohne Breite): Zustand der Teilbreite
        const anteil = an / alle;
        box.on = anteil >= 0.5;
        box.teil = box.on && anteil < 0.95;
      }
      return l;
    }
    const b = pfBasis(u, ends, basis, voll);
    if (!b) return null;
    const pt = punkt(b), zaehlt = pfZaehlt(u);
    const boxes = u.pfSek.map(s => {
      const m = pfMitte(s);
      return { side: m > 0.05 ? 'L' : m < -0.05 ? 'R' : 'C', nr: s.nr, on: zaehlt ? s.an > 0 : anBei(u.sections, m),
        teil: zaehlt && s.an > 0 && s.an < s.n, a: pt(s.bis), b: pt(s.von) };
    });
    return { boxes, basis: b };
  }

  /**
   * Teile des Balkens, die gerade arbeiten (bearbeitete Fläche): mit Precision Farming nur die PF-Teilbreiten mit Düsen an.
   * @param {number[][]} ends  [linkes Ende, rechtes Ende], beliebiges 2D-System (relativ zum Fahrzeug oder Welt)
   * @returns {Array<{nr, ends}>|null}  null = ganzer Balken (kein PF oder Gerät aus); [] = alle Düsen aus
   */
  function arbeitsTeile(u, ends, voll = false) {
    if (!ends) return null;
    if (pfZaehlt(u)) {
      const b = pfBasis(u, ends, null, voll);
      if (!b) return null;
      const pt = punkt(b);
      return u.pfSek.filter(s => s.an > 0).map(s => ({ nr: s.nr, ends: [pt(s.von), pt(s.bis)] }));
    }
    // Balken von Hand mit normalen Teilbreiten: nur der aktive Teil (der Balken aus dem Spiel ist es schon)
    if (voll && u?.sections) {
      const l = lage(u.sections, ends, null, false, true);
      if (!l) return null;
      const { L, R, c } = seiten(u.sections);
      const anL = L.filter(s => s.on).length, anR = R.filter(s => s.on).length;
      const kL = anL ? L[anL - 1].e : c, kR = anR ? R[anR - 1].e : c;
      if (kL + kR < 0.05) return [];   // alles aus
      const pt = punkt(l.basis);
      return [{ nr: 'tb', ends: [pt(kL), pt(-kR)] }];
    }
    return null;
  }

  // Kurztext je Gerät: mit Precision Farming (eingeschaltet) nach den Düsen, sonst die normalen Teilbreiten
  function textGeraet(u) {
    if (!pfZaehlt(u)) return u?.sections ? text(u.sections) : null;
    const L = u.pfSek.filter(s => pfMitte(s) > 0.05), R = u.pfSek.filter(s => pfMitte(s) < -0.05);
    const an = S => S.filter(s => s.an > 0).length;
    return `links ${an(L)}/${L.length} · rechts ${an(R)}/${R.length}`;
  }

  root.Teilbreiten = { KEINE_ARBEIT, covWirksam, arbeitet, autoRegel, balkenLage, geraeteWinkel, arbeitsbereich, balken, lage, text, kaesten, arbeitsTeile, textGeraet };
})(globalThis);
