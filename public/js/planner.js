/**
 * Arbeitsplaner (Paket E Ausbauplan, 21.10.2026).
 * Daten: Socket 'telemetry-plan' (craftConsolePlan.xml: je eigenem Feld Phase, Frucht, Anteil offener
 * Arbeiten). Solange etwas vom Planer zu sehen ist, meldet sich das Tablet alle 10 s mit 'planner-active' -- nur dann
 * misst die Mod die Felder (spart sonst Leistung im Spiel); ab Mod 0.4.1 sofort beim Öffnen, danach alle 4 s.
 * Aufträge entfernt (22.10.2026): das Spiel hing beim Annehmen eines Auftrags, s. Mod 0.4.1.
 *
 * Paket E2 (22.10.2026, Mockup Bild 4): Vorgaben je Planer-Satz -- Feldkomplexe mit Fruchtfolge, Bodenbearbeitung
 * nach der Ernte, daraus nächste Frucht und nächste Schritte. Gespeichert im Server je Spielstand
 * (server/plannerStore.js, Socket 'planer-changed'); die Mod liefert nur den Bodenzustand.
 *
 * Seit 22.10.2026 abends (Hendrik): Der Planer ist eine normale Kachel aus drei Teilen -- Feld in Arbeit, Als Nächstes,
 * Feldliste (elementHtml(), tiles.js zeichnet sie in Elementen eigener Kacheln, Vorlage „Arbeitsplaner“). Ein Feld
 * darin antippen öffnet ein kleines Fenster über der Kachel (Bodenbearbeitung, nächste Schritte). Diese Seite
 * (☰ → Arbeitsplaner) ist das Planer-Menü mit den Reitern Felder · Fruchtfolge (Fruchtfolge mit Schritten, Anbauplan) · Planer-Satz; auf „Felder“
 * ist später Platz für eine Karte mit dem gewählten Feld. Gerechnet wird in plannerLogic.js (auch im Server).
 */
(function () {
  const L = window.PlannerLogic;
  const { TASKS, GROUPS, PHASES } = L;
  // Früchte für die Fruchtfolge: die des Spiels (Mod 0.7.4), sonst die von LS25 -- s. plannerLogic.js fruchtListe. Gespeichert
  // und verglichen wird der interne Name (WHEAT …), angezeigt L.fruchtName (24.10.2026).
  const SOIL = [['grubber', 'Grubbern'], ['pflug', 'Pflügen'], ['keine', 'Direktsaat']];
  // „Arbeit“ (24.10.2026, Hendrik): je nächster Arbeit die Felder, die sie brauchen -- zum Abarbeiten mit einem Gerät
  const GROUP_BY = { komplex: 'Feldkomplex', frucht: 'Frucht', arbeit: 'Arbeit', keine: 'Keine' };
  const GROUP_KEY = 'planner.groupBy';
  const readGroupBy = () => { try { const v = localStorage.getItem(GROUP_KEY); return GROUP_BY[v] ? v : 'komplex'; } catch { return 'komplex'; } };
  const MENU_TABS = [['felder', 'Felder'], ['komplexe', 'Fruchtfolge'], ['satz', 'Planer-Satz']];
  // Farbe je Frucht (interner Name; Fruchtfolge, Anbauplan, Feldliste); unbekannte bekommen eine feste Farbe aus dem Namen
  const FARBEN = { WHEAT: '#d6a73c', BARLEY: '#e3c46a', OAT: '#cbb98c', RYE: '#b99b5a', TRITICALE: '#c4a35c', SPELT: '#c9a76a', CANOLA: '#e5cf2e',
    MAIZE: '#f09a22', SUNFLOWER: '#f5b800', SOYBEAN: '#86b84f', POTATO: '#a8784c', SUGARBEET: '#b56aa8', BEETROOT: '#b0466b',
    GRASS: '#5cae4f', MEADOW: '#4f9e48', CLOVER: '#6fbf73', ALFALFA: '#7cc46b', OILSEEDRADISH: '#3fb4a2', SORGHUM: '#c8643c', PEA: '#8cc46a',
    GREENBEAN: '#6aa84f', SPINACH: '#4e9a4a', CARROT: '#e88a2e', PARSNIP: '#d8c48a', RICE: '#cfc79a', RICELONGGRAIN: '#d9d0a0',
    COTTON: '#dcd6cc', SUGARCANE: '#8bbf5a', ONION: '#c9a0c4', GRAPE: '#7a4a8c', OLIVE: '#7d8c3c', POPLAR: '#6c9a6a' };
  const schrittId = () => Math.random().toString(36).slice(2, 10).padEnd(6, '0');   // feste Kennung je Schritt (Abhaken)
  const farbe = name => FARBEN[name] || `hsl(${[...String(name || '')].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7)} 55% 55%)`;

  const esc = escapeHtml;   // js/basis.js (Durchsicht B9: vorher eigene Kopie)
  const ha2 = v => v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });   // Hendrik 22.10.: 2 Nachkommastellen
  const ha = v => Number.isFinite(v) && v > 0 ? ha2(v) + ' ha' : '';
  const sumHa = list => list.reduce((s, f) => s + (f.area > 0 ? f.area : 0), 0);
  // Sortierung der Feldliste im Menü (je Gerät gemerkt)
  const SORTS = { arbeit: 'Dringlichkeit', feld: 'Feldnummer', frucht: 'Frucht' };
  const SORT_KEY = 'planner.sort';
  const readSort = () => { try { const v = localStorage.getItem(SORT_KEY); return SORTS[v] ? v : 'arbeit'; } catch { return 'arbeit'; } };
  const taskChips = tasks => tasks.length
    ? tasks.map(([k, v]) => `<span class="planner-chip planner-chip--${TASKS[k].group}">${TASKS[k].label}${v < 0.95 ? ` ${Math.round(v * 100)} %` : ''}</span>`).join('')
    : '<span class="planner-chip planner-chip--ok">erledigt</span>';

  class PlannerPage {
    constructor() {
      this.body = document.getElementById('planner-body');
      this.plan = null;
      this.planAt = 0;   // wann die letzte Messung ankam -- für „Stand: vor X s“
      this.group = 'alle';
      this.sort = readSort();
      this.tab = 'felder';   // Reiter des Planer-Menüs (MENU_TABS)
      this.pop = null;       // Feld im kleinen Fenster über einer Kachel: { fid, at: {x, y} }
      this.socket = window.hubSocket;   // gemeinsame Verbindung der Seite (hubSocket.js, B4)
      this.socket.on('telemetry-plan', p => { this.plan = p; this.planAt = Date.now(); this.changed(); });
      // Paket E2: Vorgaben (Planer-Satz des Spielstands)
      this.planer = null; this.set = null;
      this.groupBy = readGroupBy();
      this.sel = null; this.selectMode = false; this.selected = new Set(); this.addFor = null;
      this.msg = '';
      this.socket.on('planer-changed', pl => this.applyPlaner(pl));
      // nach einer Unterbrechung (Tablet schlief, Spielstand gewechselt) frisch laden, sonst speicherte ein alter Stand
      this.socket.on('connect', () => this.loadPlaner());
      this.loadPlaner();
      this.activity = null;   // Arbeit des angehängten Geräts (plannerLogic.js ACTIVITY), nur bei Änderung neu zeichnen
      this.socket.on('telemetry-update', d => {
        const a = d?.available && d.inVehicle ? L.activityOf(d.units) : null;
        if (a !== this.activity) { this.activity = a; this.changed(); }
      });
      // Beim Sichtbarwerden neu zeichnen: Gerät/Feld können sich geändert haben, während der Planer verdeckt war
      document.addEventListener('tabchanged', () => { this.closeFieldPop(); this.ping(); if (this.pageVisible) this.render(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && this.pop) this.closeFieldPop(); });
      setInterval(() => this.ping(), 10000);
      setInterval(() => this.updateAge(), 1000);
      this.render();
    }

    // Planer-Menü offen
    get pageVisible() { return !!this.body && this.body.offsetParent !== null; }
    // Gemessen wird, solange das Menü, ein Planer-Teil in einer Kachel oder eine Anzeige mit Planer-Wert zu sehen ist
    get visible() {
      return this.pageVisible || [...document.querySelectorAll('.pl-el, .sm-display[data-value^="plan_"]')].some(el => el.offsetParent !== null);
    }
    ping() { if (this.visible) this.socket.emit('planner-active'); }

    // Neue Messung, neue Vorgaben, anderes Gerät: Menü, Planer-Teile in Kacheln und offenes Fenster nachziehen
    changed() {
      // nicht neu zeichnen, solange im Planer getippt oder gewählt wird (die Messung kommt alle paar Sekunden und
      // löschte sonst einen halb getippten Namen); beim Verlassen des Felds holt focusout das nach
      const a = document.activeElement;
      if (a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && (this.body?.contains(a) || document.getElementById('planer-pop')?.contains(a))) {
        if (!this.nachholen) { this.nachholen = true; a.addEventListener('focusout', () => { this.nachholen = false; setTimeout(() => this.changed(), 0); }, { once: true }); }
        return;
      }
      if (this.pageVisible) this.render();
      window.tilePages?.updateEmbedSlots?.();
      if (this.pop) this.renderPop();
    }

    setGroup(g) { this.group = g; this.render(); }
    setTab(t) { if (MENU_TABS.some(([k]) => k === t)) { this.tab = t; this.msg = ''; this.render(); } }

    setSort(v) {
      if (!SORTS[v]) return;
      this.sort = v;
      try { localStorage.setItem(SORT_KEY, v); } catch { /* privat/gesperrt -- egal */ }
      this.render();
    }

    ageText() {
      if (!this.planAt) return '';
      const s = Math.round((Date.now() - this.planAt) / 1000);
      return s < 3 ? 'gerade gemessen' : `Stand: vor ${s} s`;
    }

    // Nur die Altersanzeige auffrischen, nicht die ganze Liste (sonst gingen Klicks auf die Reiter verloren)
    updateAge() {
      if (!this.pageVisible) return;
      const el = this.body.querySelector('.planner-age');
      if (el) el.textContent = this.ageText();
    }

    // ---------- Paket E2: Vorgaben laden/speichern ----------
    async loadPlaner() {
      try { const r = await fetch('/api/planer').then(x => x.json()); if (r.success) this.applyPlaner(r.planer); } catch { /* ohne Server-Vorgaben nur Anzeige */ }
    }
    applyPlaner(pl) {
      const before = this.planer?.current?.id;
      this.planer = pl;
      // eigene, noch nicht gespeicherte Änderungen nicht überschreiben (gleicher Satz, Speichern läuft)
      if (!this.saveTimer || pl?.current?.id !== before) this.set = pl?.current ? JSON.parse(JSON.stringify(pl.current)) : null;
      if (pl?.current?.id !== before) { this.sel = null; this.selected.clear(); }
      this.changed();
    }
    saveSoon() {
      clearTimeout(this.saveTimer);
      const t = this.saveTimer = setTimeout(async () => {
        try {
          const res = await fetch('/api/planer/set', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ set: this.set }) });
          const data = await res.json();
          if (!data.success) throw new Error(data.error);
        } catch (e) {
          uiAlert('Planer speichern fehlgeschlagen: ' + e.message);
          if (this.saveTimer === t) { this.saveTimer = null; this.loadPlaner(); }   // Stand vom Server holen
          return;
        }
        // nur zurücksetzen, wenn inzwischen keine neue Änderung ansteht (sonst überschriebe planer-changed sie)
        if (this.saveTimer === t) this.saveTimer = null;
      }, 400);
    }
    async api(method, url, body) {
      try {
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        this.applyPlaner(data.planer);
        return data;
      } catch (e) { uiAlert('Planer: ' + e.message); return null; }
    }
    change(fn) { if (!this.set) return; fn(this.set); this.saveSoon(); this.changed(); }

    complexOf(fid) { return L.complexOf(this.set, fid); }

    // ---------- Paket E2: Bedienung ----------
    setGroupBy(v) { if (!GROUP_BY[v]) return; this.groupBy = v; try { localStorage.setItem(GROUP_KEY, v); } catch { /* egal */ } this.render(); }
    toggleSelect() { this.selectMode = !this.selectMode; this.selected.clear(); this.render(); }
    pickField(fid) {
      if (this.selectMode) { if (this.selected.has(fid)) this.selected.delete(fid); else this.selected.add(fid); }
      else this.sel = fid;
      this.render();
    }
    newComplexId(set) { let i = Object.keys(set.complexes).length + 1; while (set.complexes['k' + i]) i++; return 'k' + i; }
    addComplex() {
      this.change(set => { const id = this.newComplexId(set); set.complexes[id] = { name: `Komplex ${set.complexOrder.length + 1}`, now: this.neueStelle(set) }; set.complexOrder.push(id); });
    }
    // neuer Komplex: die Frucht der Fruchtfolge, die gerade am wenigsten Komplexe hat
    neueStelle(set) {
      const n = set.fruchtfolge?.rotation?.length || 0;
      if (!n) return 0;
      const zahl = Array(n).fill(0);
      for (const cid of set.complexOrder) { const x = set.complexes[cid]?.now; if (Number.isInteger(x) && x < n) zahl[x]++; }
      return zahl.indexOf(Math.min(...zahl));
    }
    assign(target) {
      const n = this.selected.size;
      let name = 'Ohne Komplex';
      this.change(set => {
        let id = target;
        if (target === '*neu') { id = this.newComplexId(set); set.complexes[id] = { name: `Komplex ${set.complexOrder.length + 1}`, now: this.neueStelle(set) }; set.complexOrder.push(id); }
        for (const fid of this.selected) { if (id) set.complexOf[fid] = id; else delete set.complexOf[fid]; }
        if (id) name = set.complexes[id].name;
      });
      this.selected.clear(); this.selectMode = false;
      window.showToast?.(`${n} ${n === 1 ? 'Feld' : 'Felder'} → ${name}`);
      this.render();
    }
    setFieldComplex(fid, cid) { this.change(set => { if (cid) set.complexOf[fid] = cid; else delete set.complexOf[fid]; }); }
    setSoil(fid, v) { this.change(set => { if (set.soil[fid] === v) delete set.soil[fid]; else set.soil[fid] = v; }); }
    renameComplex(cid, name) { this.change(set => { if (set.complexes[cid] && name.trim()) set.complexes[cid].name = name.trim().slice(0, 60); }); }
    async removeComplex(cid) {
      const c = this.set?.complexes[cid];
      if (!c || !(await uiConfirm(`„${c.name}“ löschen? Die Felder sind danach ohne Komplex.`, { title: 'Komplex löschen', ok: 'Löschen', danger: true }))) return;
      this.change(set => {
        delete set.complexes[cid];
        set.complexOrder = set.complexOrder.filter(x => x !== cid);
        for (const [fid, x] of Object.entries(set.complexOf)) if (x === cid) delete set.complexOf[fid];
      });
    }
    // ---------- Fruchtfolge (eine je Satz) und Anbauplan (Komplexe wandern durch, Hendrik 24.10.2026) ----------
    ff(set) { set.fruchtfolge = set.fruchtfolge || { rotation: [], plaene: {} }; set.fruchtfolge.plaene = set.fruchtfolge.plaene || {}; return set.fruchtfolge; }
    addFruit(name) {
      this.addFor = false;
      this.change(set => {
        const ff = this.ff(set);
        if (ff.rotation.length >= 12) return;
        ff.rotation.push(name);
        this.planSel = { frucht: name, i: ff.rotation.length - 1 };
        // erste Frucht: Komplexe außerhalb steigen ein
        for (const cid of set.complexOrder) if (set.complexes[cid].now == null && ff.rotation.length === 1) set.complexes[cid].now = 0;
      });
    }
    // Frucht entfernen: Komplexe dahinter rücken eine Stelle vor, damit sie bei ihrer Frucht bleiben
    removeFruit(i) {
      this.change(set => {
        const ff = this.ff(set), [weg] = ff.rotation.splice(i, 1), n = ff.rotation.length;
        if (!ff.rotation.includes(weg)) delete ff.plaene[weg];
        for (const cid of set.complexOrder) {
          const c = set.complexes[cid];
          if (!Number.isInteger(c.now)) continue;
          if (c.now > i) c.now--;
          c.now = n ? c.now % n : 0;   // stand der Komplex auf der letzten Frucht: weiter mit der ersten
        }
        this.planSel = null;
      });
    }
    // Reihenfolge ändern: Komplexe behalten ihre Frucht
    moveFruit(i, d) {
      this.change(set => {
        const r = this.ff(set).rotation, j = i + d;
        if (j < 0 || j >= r.length) return;
        [r[i], r[j]] = [r[j], r[i]];
        for (const cid of set.complexOrder) { const c = set.complexes[cid]; if (c.now === i) c.now = j; else if (c.now === j) c.now = i; }
        if (this.planSel?.i === i) this.planSel = { frucht: r[j], i: j };
      });
    }
    toggleAdd() { this.addFor = !this.addFor; this.render(); }
    // Stelle eines Komplexes in der Fruchtfolge: ‹ › um eine Frucht, null = außerhalb
    shiftComplex(cid, d) {
      this.change(set => {
        const c = set.complexes[cid], n = this.ff(set).rotation.length;
        if (!c || !n) return;
        c.now = Number.isInteger(c.now) ? (((c.now + d) % n) + n) % n : 0;
      });
    }
    toggleInRotation(cid) { this.change(set => { const c = set.complexes[cid]; if (c) c.now = Number.isInteger(c.now) ? null : 0; }); }
    // Neues Anbaujahr: alle Komplexe der Fruchtfolge eine Frucht weiter (oder zurück)
    async jahrWeiter(d) {
      const n = this.set?.fruchtfolge?.rotation?.length || 0;
      if (!n) return;
      if (d > 0 && !(await uiConfirm('Alle Komplexe rücken in der Fruchtfolge eine Frucht weiter („dieses Jahr“ wird die nächste Frucht).', { title: 'Neues Anbaujahr', ok: 'Weiterschalten' }))) return;
      this.change(set => { for (const cid of set.complexOrder) this.shiftIn(set, cid, d, n); });
      window.showToast?.(d > 0 ? 'Neues Anbaujahr: alle Komplexe eine Frucht weiter' : 'Ein Anbaujahr zurück');
    }
    shiftIn(set, cid, d, n) { const c = set.complexes[cid]; if (Number.isInteger(c?.now)) c.now = (((c.now + d) % n) + n) % n; }

    // ---------- Schritte je Frucht der Fruchtfolge und Arbeiten von Hand (Anmerkung 24) ----------
    async schritt(k) {
      if (k !== '*eigen') return L.SCHRITTE[k] ? { k } : null;
      const n = await uiPrompt('Name des Schritts (z. B. Gülle fahren)', '', { title: 'Eigener Schritt', ok: 'Hinzufügen' });
      return n && n.trim() ? { n: n.trim().slice(0, 40) } : null;
    }
    // Frucht der Fruchtfolge zum Planen wählen: je Stelle, weil dieselbe Frucht mehrfach vorkommen kann (Weizen → Weizen)
    selectPlan(frucht, i) {
      const r = this.set?.fruchtfolge?.rotation || [];
      if (!Number.isInteger(i) || r[i] !== frucht) i = r.indexOf(frucht);
      this.planSel = this.planSel?.i === i ? null : { frucht, i };
      this.addStepFor = null; this.render();
    }
    // Plan einer Frucht (anlegen, wenn gewünscht); Zwischenfrüchte ohne Ernte
    planDer(set, frucht, anlegen = true) {
      const pl = this.ff(set).plaene;
      if (!pl[frucht] && anlegen) pl[frucht] = { vor: [], saat: 'sow', pflege: [], ernte: !L.istZwischenfrucht(frucht), nach: [] };
      return pl[frucht] || null;
    }
    toggleAddStep(frucht, abschnitt) { const k = `${frucht}|${abschnitt}`; this.addStepFor = this.addStepFor === k ? null : k; this.render(); }
    async addPlanStep(frucht, abschnitt, k) {
      const st = await this.schritt(k);
      if (st) this.change(set => { const l = this.planDer(set, frucht)[abschnitt]; if (l.length < 12) l.push({ ...st, id: schrittId() }); });
    }
    removePlanStep(frucht, abschnitt, i) { this.change(set => { this.planDer(set, frucht)?.[abschnitt].splice(i, 1); }); }
    movePlanStep(frucht, abschnitt, i) { this.change(set => { const l = this.planDer(set, frucht)?.[abschnitt]; if (l && i > 0) [l[i - 1], l[i]] = [l[i], l[i - 1]]; }); }
    setSaat(frucht, v) { this.change(set => { this.planDer(set, frucht).saat = v; }); }
    setErnte(frucht, v) { this.change(set => { this.planDer(set, frucht).ernte = v; }); }
    // Vorschlag zum Anfangen: Grubbern, Säen, Düngen und Unkraut, Ernten (Zwischenfrucht: nur Säen)
    vorschlag(frucht) {
      this.change(set => {
        this.ff(set).plaene[frucht] = L.istZwischenfrucht(frucht) ? { vor: [], saat: 'sow', pflege: [], ernte: false, nach: [] }
          : { vor: [{ k: 'grubber', id: schrittId() }], saat: 'sow', pflege: [{ k: 'fertilize', id: schrittId() }, { k: 'weeds', id: schrittId() }], ernte: true, nach: [] };
      });
    }
    async clearPlan(frucht) {
      if (!(await uiConfirm(`Alle Schritte für ${L.fruchtName(frucht, this.set)} löschen?`, { title: 'Schritte löschen', ok: 'Löschen', danger: true }))) return;
      this.change(set => { delete this.ff(set).plaene[frucht]; });
    }
    toggleHand(fid) { this.handFor = this.handFor === fid ? null : fid; this.changed(); }
    async addHandStep(fid, k) {
      const st = await this.schritt(k);
      if (st) this.change(set => { set.vonHand = set.vonHand || {}; const l = (set.vonHand[fid] || []).filter(h => !h.ok); if (l.length < 12) l.push({ s: st, ok: false }); set.vonHand[fid] = l; });
    }
    removeHandStep(fid, i) { this.change(set => { const l = (set.vonHand?.[fid] || []).filter(h => !h.ok); l.splice(i, 1); if (l.length) set.vonHand[fid] = l; else delete set.vonHand[fid]; }); }
    clearHand(fid) { this.handFor = null; this.change(set => { delete set.vonHand?.[fid]; }); }
    // Schritt abhaken: von Hand (die Liste ist fertig, wenn alles abgehakt ist) oder aus dem Plan (im Verlauf des Felds,
    // gilt bis zur nächsten Frucht)
    tick(fid, id) {
      const f = (this.plan?.fields || []).find(x => String(x.id) === String(fid));
      this.change(set => {
        if (id.startsWith('hand:')) {
          const l = set.vonHand?.[fid], h = l?.[Number(id.slice(5))];
          if (h) h.ok = true;
          if (l && l.every(x => x.ok)) { delete set.vonHand[fid]; if (this.handFor === fid) this.handFor = null; }
          return;
        }
        this.hakeAb(set, f, fid, id);
      });
    }
    hakeAb(set, f, fid, id) {
      const frucht = (f && L.letzteFrucht(f, set)) || L.LEER;
      set.verlauf = set.verlauf || {};
      let v = set.verlauf[fid];
      if (!v || v.frucht !== frucht) v = set.verlauf[fid] = { frucht, offen: [], ok: [] };
      if (!v.ok.includes(id)) v.ok.push(id);
    }
    // Abhaken zurücknehmen (24.10.2026): von Hand wieder offen, aus dem Plan aus dem Verlauf des Felds streichen
    untick(fid, id) {
      this.change(set => {
        if (id.startsWith('hand:')) { const h = set.vonHand?.[fid]?.[Number(id.slice(5))]; if (h) h.ok = false; return; }
        const v = set.verlauf?.[fid];
        if (v) v.ok = (v.ok || []).filter(x => x !== id);
      });
    }
    // Einen Schritt des Plans für alle Felder des Komplexes abhaken, bei denen er gerade ansteht (24.10.2026)
    tickKomplex(cid, id) {
      const fields = (this.plan?.fields || []).filter(f => this.complexOf(f.id) === cid);
      let n = 0;
      this.change(set => {
        for (const f of fields) {
          if (!L.nextStepsDetail(f, set).some(d => d.id === id && d.abhaken)) continue;
          this.hakeAb(set, f, String(f.id), id); n++;
        }
      });
      window.showToast?.(`${n} ${n === 1 ? 'Feld' : 'Felder'} abgehakt`);
    }
    // Komplex auf die Frucht stellen, die auf seinen Feldern wächst (Warnung „andere Frucht“)
    setComplexTo(cid, stelle) { this.change(set => { const c = set.complexes[cid]; if (c && Number.isInteger(stelle) && stelle >= 0) c.now = stelle; }); }

    // Planer-Sätze
    async loadSet(id) { if (await this.api('POST', '/api/planer/load', { id })) { this.msg = ''; this.render(); } }
    async saveAs(empty = false) {
      const name = await uiPrompt(empty ? 'Name für den neuen, leeren Satz' : 'Name für den neuen Satz (Kopie des aktiven)', empty ? (this.planer?.savegame?.name || 'Neuer Satz') : `${this.set?.name || 'Satz'} (Kopie)`, { title: 'Als neuen Satz speichern', ok: 'Speichern' });
      if (!name) return;
      if (await this.api('POST', '/api/planer/save-as', { name, empty })) { this.msg = `„${name}“ angelegt und für diesen Spielstand gewählt`; this.render(); }
    }
    async removeSet(id, name) {
      if (!(await uiConfirm(`Planer-Satz „${name}“ löschen?`, { title: 'Satz löschen', ok: 'Löschen', danger: true }))) return;
      if (await this.api('DELETE', `/api/planer/set/${encodeURIComponent(id)}`)) { this.msg = `„${name}“ gelöscht`; this.render(); }
    }
    async exportSet(id, name) {
      try {
        const r = await fetch(`/api/planer/set/${encodeURIComponent(id)}/export`).then(x => x.json());
        if (!r.success) throw new Error(r.error);
        downloadJson(r.data, `Planer ${name}`);
        this.msg = `„${name}“ exportiert (Ordner Downloads)`; this.render();
      } catch (e) { uiAlert('Export fehlgeschlagen: ' + e.message); }
    }
    async importFile(file) {
      if (!file) return;
      try { const data = JSON.parse(await file.text()); if (await this.api('POST', '/api/planer/import', { data })) { this.msg = 'Importiert'; this.render(); } }
      catch (e) { uiAlert('Import fehlgeschlagen: ' + e.message); }
    }

    // ---------- Planer-Menü (☰ → Arbeitsplaner) ----------
    render() {
      if (!this.body) return;
      const fields = this.plan?.fields || [];
      const withWork = fields.filter(f => L.openTasks(f).length);
      const stats = this.plan
        ? `${fields.length} eigene Felder · ${ha(sumHa(fields)) || '–'} · ${withWork.length} mit offener Arbeit · <span class="planner-age">${this.ageText()}</span>`
        : 'Warte auf die erste Messung …';
      let html = `<div class="planner">
        <div class="planner-head"><h3>Arbeitsplaner</h3><span>${stats}</span></div>
        ${this.pendingHtml()}
        <div class="ui-seg planner-menu-tabs">${MENU_TABS.map(([k, l]) => `<button type="button" class="${k === this.tab ? 'on' : ''}" onclick="window.plannerPage.setTab('${k}')">${l}</button>`).join('')}</div>`;
      if (this.tab === 'komplexe') html += this.set ? this.manageHtml(fields) : this.noSetHtml();
      else if (this.tab === 'satz') html += this.planer && this.set ? this.storeHtml() : this.noSetHtml();
      else html += this.fieldsTabHtml(fields);
      this.body.innerHTML = html + '</div>';
    }

    noSetHtml() {
      return '<div class="planner-empty">Noch kein Planer-Satz. Er entsteht, sobald ControlHub den Spielstand kennt (Mod ab 0.5, Spiel geladen).</div>';
    }

    // Im Mehrspieler einmal fragen, welcher Satz gilt
    pendingHtml() {
      const pl = this.planer;
      if (!pl?.pending) return '';
      return `<div class="planner-pending"><b>Neuer Mehrspieler-Spielstand „${esc(pl.savegame?.name || '')}“:</b> Welcher Planer-Satz gilt hier? ControlHub merkt sich die Antwort.
        <div>${pl.sets.map(st => `<button type="button" class="chip" onclick="window.plannerPage.loadSet(${esc(JSON.stringify(st.id))})">${esc(st.name)}</button>`).join('')}
        <button type="button" class="chip" onclick="window.plannerPage.saveAs(true)">+ Neuer, leerer Satz</button></div></div>`;
    }

    // Reiter „Felder“: Liste (gruppiert, gefiltert, sortiert) und rechts das gewählte Feld; Felder Komplexen zuordnen
    fieldsTabHtml(fields) {
      if (!this.plan) return `<div class="tacho-idle">Warte auf den Arbeitsplaner – die Mod misst die eigenen Felder, solange diese Seite offen ist (erste Messung nach wenigen Sekunden).</div>`;
      let html = `<div class="planner-tabs">
          <span class="planner-group-label">Gruppieren</span>${Object.entries(GROUP_BY).map(([k, l]) => `<button class="tile-tab ${k === this.groupBy ? 'active' : ''}" onclick="window.plannerPage.setGroupBy('${k}')">${l}</button>`).join('')}
          <span class="planner-sep"></span>
          ${Object.entries(GROUPS).map(([k, l]) => `<button class="tile-tab ${k === this.group ? 'active' : ''}" onclick="window.plannerPage.setGroup('${k}')">${l}</button>`).join('')}
          <label class="planner-sort">Sortieren <select onchange="window.plannerPage.setSort(this.value)">${Object.entries(SORTS).map(([k, l]) => `<option value="${k}" ${k === this.sort ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        </div>`;
      if (this.set) {
        html += `<div class="planner-tools">
          <button type="button" class="tile-tab ${this.selectMode ? 'active' : ''}" onclick="window.plannerPage.toggleSelect()">${this.selectMode ? 'Auswahl beenden' : 'Felder auswählen'}</button>
          ${this.selectMode && this.selected.size ? `<span class="planner-assign">${this.selected.size} ${this.selected.size === 1 ? 'Feld' : 'Felder'} zuordnen:
            ${this.set.complexOrder.map(cid => `<button type="button" class="chip" onclick="window.plannerPage.assign('${cid}')">${esc(this.set.complexes[cid].name)}</button>`).join('')}
            <button type="button" class="chip" onclick="window.plannerPage.assign('*neu')">+ Neuer Komplex</button>
            <button type="button" class="chip" onclick="window.plannerPage.assign('')">Ohne Komplex</button></span>` : ''}
        </div>`;
      }
      html += `<div class="planner-cols"><div class="planner-left">${this.renderGroups(fields)}</div>`;
      if (this.set) html += `<div class="planner-right">${this.detailHtml(fields)}</div>`;
      return html + '</div>';
    }

    rowHtml(f, tasks) {
      const checked = this.selected.has(String(f.id));
      return `<button type="button" class="planner-row ${f.live ? 'planner-row--live' : ''} ${!this.selectMode && String(f.id) === String(this.sel) ? 'planner-row--sel' : ''} ${checked ? 'planner-row--checked' : ''}" onclick="window.plannerPage.pickField('${f.id}')">
          <div class="planner-id">${this.selectMode ? `<span class="planner-check">${checked ? '✓' : ''}</span>` : ''}${f.id}</div>
          <div class="planner-main"><b>${esc(f.fruit || '–')}${this.set && L.abweichung(f, this.set) ? ' <span class="planner-warn" title="Andere Frucht als in der Fruchtfolge">⚠ andere Frucht</span>' : ''}</b><span>${esc(L.phaseText(f))}</span></div>
          <div class="planner-tasks">${taskChips(tasks)}</div>
          <div class="planner-area">${ha(f.area)}</div>
        </button>`;
    }

    // Zeilen gruppieren (Menü und Feldliste in Kacheln): [{ name, rows, cid }] -- name null = ohne Überschrift
    groupRows(rows, by, filter = 'alle') {
      if (by === 'komplex' && this.set) {
        const out = this.set.complexOrder.map(cid => ({ name: this.set.complexes[cid].name, cid, rows: rows.filter(r => this.complexOf(r.f.id) === cid) }))
          .filter(g => g.rows.length);
        const rest = rows.filter(r => !this.complexOf(r.f.id));
        return rest.length ? [...out, { name: 'Ohne Komplex', rows: rest }] : out;
      }
      if (by === 'frucht') {
        const names = [...new Set(rows.map(r => r.f.fruit || ''))].sort((a, b) => (a || '￿').localeCompare(b || '￿', 'de'));
        return names.map(n => ({ name: n || 'Ohne Frucht', rows: rows.filter(r => (r.f.fruit || '') === n) }));
      }
      if (by === 'arbeit') {   // ein Feld steht unter jeder Arbeit, die es braucht
        return L.arbeitsListe(rows.map(r => r.f), this.set, filter).map(g => ({ name: g.label, arbeit: g,
          rows: rows.filter(r => g.felder.some(x => x.f === r.f)) }));
      }
      return [{ name: null, rows }];
    }

    renderGroups(fields) {
      const arbeit = this.groupBy === 'arbeit';
      // nach Arbeit: alle Felder, gefiltert wird die Arbeit (Plan, von Hand oder Spiel), nicht die offene Arbeit im Spiel
      const rows = fields.map(f => ({ f, tasks: L.openTasks(f).filter(([k]) => arbeit || this.group === 'alle' || TASKS[k].group === this.group) }))
        .filter(r => arbeit || this.group === 'alle' || r.tasks.length);
      const gruppen = rows.length ? this.groupRows(rows, this.groupBy, this.group) : [];
      if (!gruppen.length) return `<div class="planner-empty">${fields.length ? 'Hier ist gerade nichts zu tun.' : 'Keine eigenen Felder gefunden.'}</div>`;
      return gruppen.map(g => {
        const list = `<div class="planner-list">${L.sortRows(g.rows, this.sort).map(r => this.rowHtml(r.f, r.tasks)).join('')}</div>`;
        if (g.name == null) return list;
        const c = g.cid && this.set.complexes[g.cid];
        const jetzt = c ? L.fruchtIm(this.set, g.cid, 0) : null, dann = c ? L.fruchtIm(this.set, g.cid, 1) : null;
        const N = fr => esc(L.fruchtName(fr, this.set));
        const chips = jetzt ? `<div class="planner-rot">Dieses Jahr <span class="planner-frucht" style="--frucht:${farbe(jetzt)}">${N(jetzt)}</span>${dann && dann !== jetzt ? ` → nächstes Jahr <span class="planner-frucht" style="--frucht:${farbe(dann)}">${N(dann)}</span>` : ''}</div>`
          : c && this.set.fruchtfolge?.rotation?.length ? '<div class="planner-rot">außerhalb der Fruchtfolge</div>' : '';
        return `<div class="planner-group">
          <div class="planner-group-head"><b>${esc(g.name)}</b><span>${g.rows.length} ${g.rows.length === 1 ? 'Feld' : 'Felder'}</span><span class="planner-flex"></span><span class="planner-area">${ha(sumHa(g.rows.map(r => r.f)))}</span></div>
          ${chips}${list}
        </div>`;
      }).join('');
    }

    detailHtml(fields) {
      const f = fields.find(x => String(x.id) === String(this.sel)) || fields.find(x => x.live) || null;
      if (!f) return `<div class="planner-panel"><div class="planner-panel-kicker">Feld</div><p class="planner-hint">Feld in der Liste antippen: Komplex, Bodenbearbeitung und nächste Schritte.</p></div>`;
      const cid = this.complexOf(f.id);
      return `<div class="planner-panel">
        <div><div class="planner-panel-kicker">Feld</div><div class="planner-panel-title">Feld ${f.id} · ${ha(f.area)}</div><div class="planner-hint">${esc(f.fruit || '–')} · ${esc(L.phaseText(f))}</div></div>
        <div><div class="planner-panel-kicker">Feldkomplex</div>
          <div class="planner-chips">${this.set.complexOrder.map(c => `<button type="button" class="chip ${c === cid ? 'on' : ''}" onclick="window.plannerPage.setFieldComplex('${f.id}', '${c}')">${esc(this.set.complexes[c].name)}</button>`).join('')}
            <button type="button" class="chip ${!cid ? 'on' : ''}" onclick="window.plannerPage.setFieldComplex('${f.id}', '')">Ohne</button></div></div>
        ${this.fieldPlanHtml(f)}
        <p class="planner-hint">Vorgaben gehören zum Planer-Satz dieses Spielstands in ControlHub, nicht zur Mod. Die Mod liefert nur den Bodenzustand.</p>
      </div>`;
    }

    // Bodenbearbeitung, nächste Frucht, nächste Schritte (Menü und kleines Fenster). Plant die Fruchtfolge die
    // Schritte, entfällt die Bodenbearbeitung je Feld (sie steht dann im Plan).
    fieldPlanHtml(f) {
      const cid = this.complexOf(f.id);
      const z = this.set ? L.planLage(f, this.set) : null;
      const soil = this.set?.soil?.[f.id] || null;
      const nf = z ? z.N : L.naechsteFrucht(f, this.set);
      const ab = this.set ? L.abweichung(f, this.set) : null;
      const warn = ab ? `<div class="planner-abweichung">⚠ Hier wächst ${esc(L.fruchtName(ab.ist, this.set))}, laut Fruchtfolge ist dieses Jahr ${esc(L.fruchtName(ab.soll, this.set))} dran.
          ${ab.stelle >= 0 ? `<button type="button" class="chip" onclick="window.plannerPage.setComplexTo(${esc(JSON.stringify(cid))}, ${ab.stelle})">${esc(this.set.complexes[cid].name)} auf ${esc(L.fruchtName(ab.ist, this.set))} stellen</button>` : '<span class="planner-hint">Die Frucht steht nicht in der Fruchtfolge.</span>'}</div>` : '';
      return `${warn}${this.set && !z ? `<div><div class="planner-panel-kicker">Bodenbearbeitung nach der Ernte</div>
          <div class="planner-chips">${SOIL.map(([k, l]) => `<button type="button" class="chip ${soil === k ? 'on' : ''}" onclick="window.plannerPage.setSoil('${f.id}', '${k}')">${l}</button>`).join('')}</div></div>` : ''}
        ${this.set ? `<div class="planner-next"><div class="planner-panel-kicker">Nächste Frucht laut Fruchtfolge</div><b>${nf ? esc(L.fruchtName(nf, this.set)) : (cid ? 'keine Fruchtfolge hinterlegt' : 'kein Komplex zugeordnet')}</b></div>` : ''}
        ${this.stepsHtml(f)}`;
    }

    // Nächste Schritte mit Herkunft und Abhaken; „Von Hand festlegen“ (Anmerkung 24)
    stepsHtml(f) {
      const det = L.nextStepsDetail(f, this.set, { erledigte: true });
      const z = this.set ? L.planLage(f, this.set) : null;
      const hand = !!this.set?.vonHand?.[f.id]?.some(h => !h.ok);
      const quelle = hand ? 'von Hand festgelegt' : z ? `aus der Fruchtfolge · ${z.c.name}` : '';
      const fid = esc(JSON.stringify(String(f.id)));
      const cid = this.complexOf(f.id);
      const imKomplex = cid ? Object.values(this.set.complexOf).filter(x => x === cid).length : 0;
      const vorne = st => (st.abschnitt && L.ABSCHNITTE[st.abschnitt] ? `<span class="planner-step-wo">${esc(L.fruchtName(st.frucht, this.set))} · ${L.ABSCHNITTE[st.abschnitt]}:</span>` : '');
      const ID = st => esc(JSON.stringify(st.id));
      // Abgehaktes bleibt durchgestrichen stehen und lässt sich zurücknehmen; Schritte des Plans auch für den ganzen Komplex
      const liste = det.map(st => st.erledigt
        ? `<li class="planner-step--ok"><button type="button" class="planner-tick planner-tick--ok" title="Zurücknehmen" aria-label="${esc(st.label)} wieder offen" onclick="window.plannerPage.untick(${fid}, ${ID(st)})">✓</button>${vorne(st)}<s>${esc(st.label)}</s></li>`
        : `<li>${st.abhaken ? `<button type="button" class="planner-tick" title="Abhaken" aria-label="${esc(st.label)} abhaken" onclick="window.plannerPage.tick(${fid}, ${ID(st)})"></button>` : ''}${vorne(st)}${esc(st.label)}${st.abhaken && st.quelle === 'plan' && imKomplex > 1 ? ` <button type="button" class="planner-alle" title="Für alle Felder von ${esc(this.set.complexes[cid].name)} abhaken" onclick="window.plannerPage.tickKomplex(${esc(JSON.stringify(cid))}, ${ID(st)})">alle im Komplex</button>` : ''}</li>`).join('');
      return `<div><div class="planner-panel-kicker">Nächste Schritte auf diesem Feld${quelle ? ` <span class="planner-quelle">· ${esc(quelle)}</span>` : ''}</div>
          <ol class="planner-steps">${liste}</ol>
          ${this.set ? `<div class="planner-chips"><button type="button" class="chip ${this.handFor === String(f.id) ? 'on' : ''}" onclick="window.plannerPage.toggleHand(${fid})">${hand ? 'Von Hand ändern' : 'Von Hand festlegen'}</button>
            ${hand ? `<button type="button" class="chip" onclick="window.plannerPage.clearHand(${fid})">Wieder automatisch</button>` : ''}</div>
          ${this.handFor === String(f.id) ? this.handEditHtml(f) : ''}` : ''}</div>`;
    }

    handEditHtml(f) {
      const liste = (this.set.vonHand?.[f.id] || []).filter(h => !h.ok);
      const fid = esc(JSON.stringify(String(f.id)));
      return `<div class="planner-hand">
        <div class="planner-panel-kicker">Von Hand, der Reihe nach (gilt statt Fruchtfolge und Vorschlag, bis alles abgehakt ist)</div>
        <div class="planner-chips">${liste.map((h, i) => `<span class="planner-rot-edit"><button type="button" tabindex="-1">${esc(L.schrittLabel(h.s))}</button><button type="button" aria-label="entfernen" onclick="window.plannerPage.removeHandStep(${fid}, ${i})">×</button></span>`).join('') || '<span class="planner-hint">noch leer</span>'}</div>
        ${this.stepPickerHtml(k => `window.plannerPage.addHandStep(${fid}, '${k}')`, true)}
      </div>`;
    }

    // Auswahl eines Schritts: bekannte Arbeiten und „Eigener Schritt …“; Säen/Direktsaat/Ernten nur von Hand
    stepPickerHtml(onclick, mitFesten = false) {
      return `<div class="planner-chips planner-fruits">${Object.entries(L.SCHRITTE).filter(([, d]) => mitFesten || !d.fest).map(([k, d]) => `<button type="button" class="chip" onclick="${onclick(k)}">${esc(d.label)}</button>`).join('')}
        <button type="button" class="chip" onclick="${onclick('*eigen')}">Eigener Schritt …</button></div>`;
    }

    // Schritte einer Frucht der Fruchtfolge: Vorbereitung → Saat → Pflege → Ernte → Nach der Ernte (gilt für alle Komplexe)
    planEditorHtml(frucht, idx) {
      const ff = this.set.fruchtfolge, p = ff.plaene?.[frucht] || null, n = ff.rotation.length;
      const J = v => esc(JSON.stringify(v)), F = J(frucht);
      const liste = ab => {
        const l = p?.[ab] || [], key = `${frucht}|${ab}`;
        return `<div class="planner-chips">${l.map((st, i) => `<span class="planner-rot-edit">${i ? `<button type="button" aria-label="nach vorn" onclick="window.plannerPage.movePlanStep(${F}, '${ab}', ${i})">‹</button>` : ''}<button type="button" tabindex="-1">${esc(L.schrittLabel(st))}</button><button type="button" aria-label="entfernen" onclick="window.plannerPage.removePlanStep(${F}, '${ab}', ${i})">×</button></span>`).join('')}
            <button type="button" class="chip ${this.addStepFor === key ? 'on' : ''}" onclick="window.plannerPage.toggleAddStep(${F}, '${ab}')">${this.addStepFor === key ? 'fertig' : '+ Schritt'}</button></div>
          ${this.addStepFor === key ? this.stepPickerHtml(k => `window.plannerPage.addPlanStep(${F}, '${ab}', '${k}')`) : ''}`;
      };
      const zeile = (nr, titel, inhalt, hinweis = '') => `<div class="planner-plan-row"><div class="planner-plan-label"><span>${nr}</span>${titel}${hinweis ? `<small>${hinweis}</small>` : ''}</div><div>${inhalt}</div></div>`;
      const ernte = p ? p.ernte !== false : !L.istZwischenfrucht(frucht);
      const naechste = L.fruchtName(ff.rotation[(idx + 1) % n], this.set);
      const auf = this.set.complexOrder.filter(cid => L.fruchtIm(this.set, cid, 0) === frucht).map(cid => esc(this.set.complexes[cid].name));
      return `<div class="planner-plan" style="--frucht:${farbe(frucht)}">
        <div class="planner-plan-top"><span class="planner-frucht">${esc(L.fruchtName(frucht, this.set))}</span><small>Stelle ${idx + 1} von ${n}${auf.length ? ` · dieses Jahr auf ${auf.join(', ')}` : ''}</small>
          <div class="planner-chips">
            <button type="button" class="chip" ${idx ? '' : 'disabled'} onclick="window.plannerPage.moveFruit(${idx}, -1)">‹ früher</button>
            <button type="button" class="chip" ${idx < n - 1 ? '' : 'disabled'} onclick="window.plannerPage.moveFruit(${idx}, 1)">später ›</button>
            <button type="button" class="chip" onclick="window.plannerPage.removeFruit(${idx})">Aus der Fruchtfolge</button></div></div>
        ${zeile(1, 'Vorbereitung', liste('vor'), 'vor der Saat')}
        ${zeile(2, 'Saat', `<div class="planner-chips">${[['sow', 'Säen'], ['direktsaat', 'Direktsaat']].map(([k, l]) => `<button type="button" class="chip ${(p?.saat || 'sow') === k ? 'on' : ''}" onclick="window.plannerPage.setSaat(${F}, '${k}')">${l}</button>`).join('')}</div>`)}
        ${zeile(3, 'Pflege', liste('pflege'), 'solange sie wächst')}
        ${zeile(4, 'Ernte', `<div class="planner-chips"><button type="button" class="chip ${ernte ? 'on' : ''}" onclick="window.plannerPage.setErnte(${F}, true)">Wird geerntet</button><button type="button" class="chip ${!ernte ? 'on' : ''}" onclick="window.plannerPage.setErnte(${F}, false)">Zwischenfrucht · keine Ernte</button></div>`)}
        ${ernte ? zeile(5, 'Nach der Ernte', liste('nach'), n > 1 ? `danach Vorbereitung für ${esc(naechste)}` : '') : zeile(5, 'Danach', `<span class="planner-hint">${esc(naechste)} wird in den Bestand gesät (Vorbereitung und Saat von ${esc(naechste)}).</span>`)}
        <div class="planner-chips planner-plan-foot">
          ${!p || !(p.vor.length + p.pflege.length + p.nach.length) ? `<button type="button" class="chip" onclick="window.plannerPage.vorschlag(${F})">Vorschlag einsetzen</button>` : ''}
          ${p ? `<button type="button" class="chip" onclick="window.plannerPage.clearPlan(${F})">Schritte löschen</button>` : ''}</div>
      </div>`;
    }

    // Wächst auf den Feldern eines Komplexes schon die nächste Frucht? Dann Weiterschalten vorschlagen
    weiterHinweis(cid, fs) {
      const next = L.fruchtIm(this.set, cid, 1), jetzt = L.fruchtIm(this.set, cid, 0);
      if (!next || next === jetzt || !fs.length) return '';
      const steht = fs.filter(f => L.fruchtVonFeld(f, this.set) === next && (f.phase === 'waechst' || f.phase === 'erntereif')).length;
      if (steht * 2 < fs.length) return '';
      return `Auf ${steht === fs.length ? 'den Feldern' : `${steht} von ${fs.length} Feldern`} steht schon ${esc(L.fruchtName(next, this.set))}.
        <button type="button" class="chip" onclick="window.plannerPage.shiftComplex(${esc(JSON.stringify(cid))}, 1)">${esc(this.set.complexes[cid].name)} weiterschalten</button>`;
    }

    // Reiter „Fruchtfolge“: oben die eine Fruchtfolge mit den Schritten je Frucht, darunter der Anbauplan (Komplexe ×
    // Jahre, wie die Fruchtfolge-Tabellen echter Schlagkarteien: jede Zeile rückt jedes Jahr eine Frucht weiter)
    manageHtml(fields) {
      const ff = this.set.fruchtfolge || { rotation: [], plaene: {} };
      const r = ff.rotation, n = r.length;
      const J = v => esc(JSON.stringify(v));
      // Auswahl: die Früchte des Spiels (bzw. von LS25), dazu, was auf den Feldern steht und (noch) nicht in der Liste ist
      const frei = [...new Set([...L.fruchtListe(this.set).map(f => f.key), ...fields.map(f => L.fruchtVonFeld(f, this.set)).filter(Boolean)])];
      const N = fr => esc(L.fruchtName(fr, this.set));
      const anzahl = fr => { const p = ff.plaene?.[fr]; return p ? p.vor.length + p.pflege.length + p.nach.length : 0; };
      const kette = r.map((fr, i) => `${i ? '<span class="planner-pfeil">→</span>' : ''}<button type="button" class="planner-ff-glied ${this.planSel?.i === i ? 'on' : ''}" style="--frucht:${farbe(fr)}" onclick="window.plannerPage.selectPlan(${J(fr)}, ${i})"><span class="planner-ff-nr">${i + 1}</span><b>${N(fr)}</b><small>${anzahl(fr) ? `${anzahl(fr)} ${anzahl(fr) === 1 ? 'Schritt' : 'Schritte'}` : 'Schritte planen'}</small></button>`).join('')
        + (n > 1 ? '<span class="planner-pfeil" title="danach wieder von vorn">↺</span>' : '');
      const sel = this.planSel && r[this.planSel.i] === this.planSel.frucht ? this.planSel.i : -1;
      const jahre = Math.min(Math.max(n, 1), 5);
      const kopf = ['Dieses Jahr', 'Nächstes Jahr', 'In 2 Jahren', 'In 3 Jahren', 'In 4 Jahren'].slice(0, jahre);
      const rows = this.set.complexOrder.map(cid => {
        const c = this.set.complexes[cid], C = J(cid);
        const fs = fields.filter(f => this.complexOf(f.id) === cid);
        const ids = Object.entries(this.set.complexOf).filter(([, x]) => x === cid).map(([fid]) => fid);
        const drin = Number.isInteger(c.now) && n > 0;
        const zellen = drin ? kopf.map((_, j) => {
          const fr = L.fruchtIm(this.set, cid, j), stelle = (c.now + j) % n;
          const pfeil = (d, t, z) => `<button type="button" class="planner-ap-pfeil" aria-label="${t}" onclick="window.plannerPage.shiftComplex(${C}, ${d})">${z}</button>`;
          return `<td class="${j ? '' : 'planner-ap-jetzt'}">${j ? '' : pfeil(-1, 'eine Frucht zurück', '‹')}<button type="button" class="planner-frucht planner-frucht--btn ${this.planSel?.i === stelle ? 'on' : ''}" style="--frucht:${farbe(fr)}" onclick="window.plannerPage.selectPlan(${J(fr)}, ${stelle})">${N(fr)}</button>${j ? '' : pfeil(1, 'eine Frucht weiter', '›')}</td>`;
        }).join('') : `<td colspan="${jahre}" class="planner-ap-aus">${n ? 'außerhalb der Fruchtfolge – der Planer schlägt aus dem Bodenzustand vor' : 'noch keine Fruchtfolge'}</td>`;
        const hinweis = drin ? this.weiterHinweis(cid, fs) : '';
        return `<tr>
          <th scope="row"><input type="text" value="${esc(c.name)}" maxlength="60" aria-label="Name des Komplexes" onchange="window.plannerPage.renameComplex('${cid}', this.value)">
            <small>${ids.length} ${ids.length === 1 ? 'Feld' : 'Felder'} · ${ha(sumHa(fs)) || '0,00 ha'}${ids.length ? ' · ' + ids.join(', ') : ''}</small></th>
          ${zellen}
          <td class="planner-ap-aktion">${n ? `<button type="button" class="chip" onclick="window.plannerPage.toggleInRotation(${C})">${drin ? 'Herausnehmen' : 'Aufnehmen'}</button>` : ''}<button type="button" class="btn-secondary btn-small" aria-label="Komplex löschen" onclick="window.plannerPage.removeComplex('${cid}')">×</button></td>
        </tr>${hinweis ? `<tr class="planner-ap-hinweis"><td colspan="${jahre + 2}">${hinweis}</td></tr>` : ''}`;
      }).join('');
      return `<p class="planner-hint">Es gibt <b>eine Fruchtfolge</b>. Jeder Komplex steht an einer Stelle darin und rückt jedes Anbaujahr eine Frucht weiter – so wächst auf allen Feldern eines Komplexes dieselbe Frucht. Die Schritte planst du je Frucht; sie gelten für jeden Komplex, der diese Frucht gerade anbaut.</p>
        <div class="planner-ff-wrap">
          <section class="planner-card">
            <div class="planner-card-head"><b>Fruchtfolge</b><span>Reihenfolge der Früchte · Frucht antippen = ihre Schritte</span></div>
            <div class="planner-ff-kette">${kette}<button type="button" class="chip" onclick="window.plannerPage.toggleAdd()">${this.addFor ? 'fertig' : '+ Frucht'}</button></div>
            ${this.addFor ? `<div class="planner-chips planner-fruits">${frei.map(k => `<button type="button" class="chip" onclick="window.plannerPage.addFruit(${J(k)})">${N(k)}</button>`).join('')}</div>` : ''}
            ${!n ? '<p class="planner-empty">Noch keine Fruchtfolge – füge die erste Frucht hinzu.</p>' : ''}
            ${sel >= 0 ? this.planEditorHtml(r[sel], sel) : ''}
          </section>
          <section class="planner-card">
            <div class="planner-card-head"><b>Anbauplan</b><span>Komplexe und ihre Früchte in den nächsten Jahren</span><span class="planner-flex"></span>
              ${n ? `<button type="button" class="chip" onclick="window.plannerPage.jahrWeiter(-1)">‹ Jahr zurück</button><button type="button" class="btn-primary btn-small" onclick="window.plannerPage.jahrWeiter(1)">Neues Anbaujahr ›</button>` : ''}</div>
            <div class="planner-ap-scroll"><table class="planner-ap">
              <thead><tr><th>Komplex</th>${kopf.map(k => `<th>${k}</th>`).join('')}<th></th></tr></thead>
              <tbody>${rows || `<tr><td colspan="${jahre + 2}" class="planner-ap-aus">Noch keine Komplexe.</td></tr>`}</tbody>
            </table></div>
            <div class="planner-chips"><button type="button" class="btn-primary btn-small" onclick="window.plannerPage.addComplex()">+ Neuer Komplex</button>
              <span class="planner-hint">Felder ordnest du im Reiter „Felder“ zu (Feld antippen oder „Felder auswählen“).</span></div>
          </section>
        </div>`;
    }

    // Reiter „Planer-Satz“: aktiver Satz, alle Sätze laden/exportieren/löschen, neu, importieren
    storeHtml() {
      const pl = this.planer;
      const sg = pl.savegame;
      const where = sg ? `${sg.multiplayer ? 'Mehrspieler' : 'Spielstand'} „${esc(sg.name || '–')}“${sg.map ? ' · ' + esc(sg.map) : ''}` : 'Spielstand unbekannt (Mod älter als 0.5)';
      const rows = pl.sets.map(st => {
        const cur = st.id === pl.current?.id;
        const n = esc(JSON.stringify(st.id)), nm = esc(JSON.stringify(st.name));
        return `<div class="gps-dev ${cur ? 'on' : ''}">
          <div class="gps-dev-name"><b>${esc(st.name)}</b><small>${st.complexes} ${st.complexes === 1 ? 'Komplex' : 'Komplexe'} · ${st.fields} ${st.fields === 1 ? 'Feld' : 'Felder'} zugeordnet · ${st.savegames} ${st.savegames === 1 ? 'Spielstand' : 'Spielstände'}</small></div>
          <button type="button" class="btn-secondary btn-small" ${cur ? 'disabled' : ''} onclick="window.plannerPage.loadSet(${n})">${cur ? 'Aktiv' : 'Laden'}</button>
          <button type="button" class="btn-secondary btn-small" onclick="window.plannerPage.exportSet(${n}, ${nm})">Export</button>
          ${cur ? '' : `<button type="button" class="btn-secondary btn-small" aria-label="${esc(st.name)} löschen" onclick="window.plannerPage.removeSet(${n}, ${nm})">×</button>`}
        </div>`;
      }).join('');
      return `<div class="planner-set"><div><span class="planner-set-kicker">Aktiver Planer-Satz</span><b>${esc(this.set.name)}</b><small>${where}</small></div></div>
        <p class="gps-small">Je Spielstand gilt ein Satz. Ein geladener Satz gilt ab jetzt für diesen Spielstand – so lässt sich ein Satz auch auf einen neuen Spielstand übernehmen.</p>
        <div class="gps-dev-list">${rows}</div>
        ${this.msg ? `<div class="gps-msg">${esc(this.msg)}</div>` : ''}
        <div class="gps-dialog-actions planner-set-actions">
          <button type="button" class="btn-primary" onclick="window.plannerPage.saveAs()">Als neuen Satz speichern</button>
          <button type="button" class="btn-secondary" onclick="window.plannerPage.saveAs(true)">+ Neuer, leerer Satz</button>
          <button type="button" class="btn-secondary" onclick="document.getElementById('planer-import-file').click()">Importieren …</button>
          <input type="file" id="planer-import-file" accept="application/json,.json" style="display:none" onchange="window.plannerPage.importFile(this.files[0])">
        </div>`;
    }

    // ---------- Planer-Teile in Kacheln (Elemente 'planer-…', tiles.js updateEmbedSlots()) ----------
    // Kein „Stand vor X s“ hier: das würde jede Sekunde neu zeichnen (und eine gescrollte Liste zurückspringen lassen)
    elementHtml(type, st, el) {
      if (!this.plan) return '<div class="pl-el pl-el--wait"><div class="pl-kicker">Arbeitsplaner</div><small>Warte auf die erste Messung …</small></div>';
      const fields = this.plan.fields || [];
      const li = L.liveInfo(this.plan, this.activity, this.set);
      if (type === 'planer-aktuell') return this.liveElHtml(li, fields);
      if (type === 'planer-naechstes') return this.nextElHtml(fields, li?.f, el);
      return this.listElHtml(fields, st || {});
    }

    liveElHtml(li, fields) {
      if (!li) {
        const open = fields.filter(f => L.openTasks(f).length).length;
        return `<div class="pl-el pl-live pl-live--none"><div class="pl-kicker">Feld in Arbeit</div><b>Kein eigenes Feld</b><small>${open} von ${fields.length} Feldern mit offener Arbeit</small></div>`;
      }
      const f = li.f, pct = Math.round(li.done * 100);
      const info = [li.openHa != null ? ha2(li.openHa) + ' ha offen' : '', li.next ? 'danach: ' + esc(li.next) : ''].filter(Boolean).join(' · ');
      return `<div class="pl-el pl-live" role="button" tabindex="0" onclick="window.plannerPage.openFieldPop('${f.id}', this)">
        <div class="pl-kicker">Feld in Arbeit</div>
        <div class="pl-live-top"><b>Feld ${f.id}</b><span>${esc(f.fruit || L.phaseText(f) || '')}${f.fruit && PHASES[f.phase] ? ' · ' + esc(L.phaseText(f)) : ''}</span><span class="pl-ha">${ha(f.area)}</span></div>
        ${li.task ? `<div class="pl-live-task"><b>${esc(li.label)}</b><span>${pct} %</span></div>
        <div class="planner-bar"><div style="width:${pct}%"></div></div>
        ${info ? `<small>${info}</small>` : ''}` : '<div class="pl-live-task"><b>Nichts offen</b></div>'}
      </div>`;
    }

    // Wie viele Zeilen hineinpassen, richtet sich nach der Höhe des Elements (Zeile 30 px + 4 px Abstand, Kopf ~30 px)
    nextElHtml(fields, live, el) {
      const h = el?.clientHeight || 200;
      const rows = L.nextUp(fields, live, Math.max(1, Math.min(10, Math.floor((h - 34) / 34))), this.set);
      return `<div class="pl-el pl-next"><div class="pl-kicker">Als Nächstes</div>
        ${rows.map(({ f, erste }) => `<div class="pl-row" role="button" tabindex="0" onclick="window.plannerPage.openFieldPop('${f.id}', this)">
          <span class="pl-id">${f.id}</span>
          <span class="planner-chip planner-chip--${erste.group}">${esc(erste.label)}</span>
          <span class="pl-fruit">${esc(f.fruit || PHASES[f.phase] || '')}</span>
          <span class="pl-ha">${ha(f.area)}</span>
        </div>`).join('') || '<div class="pl-none">Gerade ist nichts zu tun.</div>'}
      </div>`;
    }

    // Feldliste: Gruppieren/Filter/Sortierung stellt man im Editor am Element ein (embed.opts)
    listElHtml(fields, st) {
      const filter = GROUPS[st.filter] ? st.filter : 'alle';
      const arbeit = st.group === 'arbeit';   // nach Arbeit: alle Felder, gefiltert wird die Arbeit selbst
      const rows = fields.map(f => ({ f, tasks: L.openTasks(f).filter(([k]) => arbeit || filter === 'alle' || TASKS[k].group === filter) }))
        .filter(r => arbeit || (st.alle && filter === 'alle') || r.tasks.length);
      const row = ({ f, tasks }) => `<div class="pl-row pl-row--list ${f.live ? 'pl-row--live' : ''}" role="button" tabindex="0" onclick="window.plannerPage.openFieldPop('${f.id}', this)">
          <span class="pl-id">${f.id}</span>
          <span class="pl-fruit">${esc(f.fruit || '–')}<small>${esc(L.phaseText(f))}</small></span>
          <span class="pl-chips">${taskChips(tasks)}</span>
          <span class="pl-ha">${ha(f.area)}</span>
        </div>`;
      const body = rows.length
        ? this.groupRows(rows, st.group || 'komplex', filter).map(g => `${g.name != null ? `<div class="pl-group"><b>${esc(g.name)}</b><span>${g.rows.length}</span></div>` : ''}${L.sortRows(g.rows, st.sort || 'arbeit').map(row).join('')}`).join('')
        : `<div class="pl-none">${fields.length ? 'Hier ist gerade nichts zu tun.' : 'Keine eigenen Felder gefunden.'}</div>`;
      const title = filter === 'alle' ? (st.alle ? 'Felder' : 'Felder mit offener Arbeit') : `Felder · ${GROUPS[filter]}`;
      return `<div class="pl-el pl-list"><div class="pl-kicker">${title}<span>${rows.length}</span></div><div class="pl-scroll">${body}</div></div>`;
    }

    // ---------- Kleines Fenster über der Kachel (Feld antippen, Hendrik 22.10.2026 abends) ----------
    openFieldPop(fid, anchor) {
      const host = anchor?.closest?.('.tile, .sm-embed') || anchor;
      const r = host?.getBoundingClientRect?.();
      this.pop = { fid: String(fid), at: r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null };
      this.renderPop();
    }
    closeFieldPop() { this.pop = null; document.getElementById('planer-pop')?.remove(); }
    renderPop() {
      if (!this.pop) return;
      const f = (this.plan?.fields || []).find(x => String(x.id) === this.pop.fid);
      if (!f) { this.closeFieldPop(); return; }
      let el = document.getElementById('planer-pop');
      if (!el) {
        el = document.createElement('div');
        el.id = 'planer-pop';
        el.className = 'planer-pop-wrap';
        document.body.appendChild(el);
      }
      const cid = this.complexOf(f.id);
      el.innerHTML = `<button type="button" class="planer-pop-backdrop" aria-label="Schließen" onclick="window.plannerPage.closeFieldPop()"></button>
        <div class="planer-pop" role="dialog" aria-label="Feld ${f.id}">
          <div class="planer-pop-top"><div><b>Feld ${f.id}</b><small>${esc(f.fruit || '–')} · ${esc(L.phaseText(f))}${f.area > 0 ? ' · ' + ha(f.area) : ''}${cid ? ' · ' + esc(this.set.complexes[cid].name) : ''}</small></div>
            <button type="button" class="btn-secondary btn-small" aria-label="Schließen" onclick="window.plannerPage.closeFieldPop()">×</button></div>
          <div class="planner-chips">${taskChips(L.openTasks(f))}</div>
          ${this.fieldPlanHtml(f)}
          <button type="button" class="btn-secondary" onclick="window.plannerPage.openInMenu('${f.id}')">Im Arbeitsplaner öffnen ›</button>
        </div>`;
      // Über der Kachel, aus der das Feld kam; am Rand bleibt das Fenster ganz im Bild
      const pop = el.querySelector('.planer-pop');
      const c = this.pop.at || { x: innerWidth / 2, y: innerHeight / 2 };
      pop.style.left = `${Math.round(Math.max(12, Math.min(c.x - pop.offsetWidth / 2, innerWidth - pop.offsetWidth - 12)))}px`;
      pop.style.top = `${Math.round(Math.max(12, Math.min(c.y - pop.offsetHeight / 2, innerHeight - pop.offsetHeight - 12)))}px`;
    }
    openInMenu(fid) {
      this.closeFieldPop();
      this.tab = 'felder'; this.sel = String(fid); this.selectMode = false;
      if (window.appNav) window.appNav.go('dashboard-planner'); else window.app?.navigateToTab('dashboard-planner');
    }
  }

  document.addEventListener('DOMContentLoaded', () => { window.plannerPage = new PlannerPage(); });
})();
