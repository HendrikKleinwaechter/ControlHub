/**
 * Anzeige-Bausteine (Umsetzungsplan Paket J, Mockup Bild 5): Zahl, Balken, Tacho, Leuchte und Text für
 * einen Wert aus der Werteliste (werteliste.js). Gemeinsam genutzt von Bedienpanel (steuerungsmenues.js),
 * Werte-Kachel (tiles.js), Tasten mit Zustand und dem Funktions-Editor (Bedingung).
 *
 * Eine Anzeige: { value, type: 'zahl'|'balken'|'tacho'|'leuchte'|'text', range: 'auto'|'manual', min, max,
 *   warn: 0|10|25 (Balken/Tacho rot unter x %), dec: 0–2 }
 *
 * Socket.IO über window.hubSocket (gemeinsame Verbindung, B4) wie dashboardMap.js; Abonnenten bekommen höchstens 10 Updates/s und
 * zeichnen selbst nur, was sichtbar ist.
 * Werteliste-Fenster: Anzeigen.pick({...}) → Promise mit der Wert-ID, null (= „keiner“) oder undefined (abgebrochen).
 */
(function () {
  const W = window.Werteliste;
  const esc = escapeHtml;   // js/basis.js (Durchsicht B9: vorher eigene Kopie)
  const TYPE_NAMES = { zahl: 'Zahl', balken: 'Balken', tacho: 'Tacho', leuchte: 'Leuchte', text: 'Text' };
  // Fertige Anzeigen (Plan: 10 Stück) -- [Name, Darstellung, Wert]
  const PRESETS = [
    ['Tacho Geschwindigkeit', 'tacho', 'speed'], ['Drehzahl', 'tacho', 'rpm'], ['Tank Diesel', 'balken', 'fuel'],
    ['AdBlue', 'balken', 'adblue'], ['Füllstand Anhänger', 'balken', 'r1_fill'], ['Alle Anhänger zusammen', 'balken', 'all_fill'],
    ['Motortemperatur', 'tacho', 'motor_temp'], ['Kontostand', 'zahl', 'money'], ['Spielzeit', 'text', 'clock'], ['Rundumleuchte', 'leuchte', 'beacon']
  ];
  // Startgröße neuer Anzeigen im Bedienpanel: [Breite, Höhe] in % der Flächen-BREITE (wie Grafiken)
  const SIZES = { tacho: [22, 18], balken: [28, 8], zahl: [18, 8], leuchte: [20, 7], text: [18, 8] };

  const f1 = n => n.toFixed(1);
  const P = (deg, r) => [100 + r * Math.sin((deg * Math.PI) / 180), 95 - r * Math.cos((deg * Math.PI) / 180)];
  const arc = (a0, a1, r) => {
    const [x0, y0] = P(a0, r), [x1, y1] = P(a1, r);
    return `M ${f1(x0)} ${f1(y0)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${f1(x1)} ${f1(y1)}`;
  };
  const compact = n => (Math.abs(n) >= 1000 ? (n / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' k' : Math.round(n).toLocaleString('de-DE'));

  class Anzeigen {
    constructor() {
      this.data = null;
      this.listeners = new Set();
      this.lastNotify = 0;
      this.pending = null;
      this.TYPE_NAMES = TYPE_NAMES;
      this.PRESETS = PRESETS;
      this.SIZES = SIZES;
      if (typeof io === 'function') {
        this.socket = window.hubSocket;   // gemeinsame Verbindung der Seite (hubSocket.js, B4)
        this.socket.on('telemetry-update', d => this.onData(d));
      }
    }

    // Werteliste des aktiven Spiels; null bei Spielen ohne Spieldaten (eigene Spiele)
    game() {
      const g = window.gameSwitcher?.activeGame;
      const id = g ? g.telemetry : 'fs25';
      return id && W.has(id) ? id : null;
    }
    available() { return !!this.game(); }
    def(id) { const g = this.game(); return g ? W.get(g, id) : null; }
    value(id) { return W.value(this.def(id), this.data); }

    onData(d) {
      this.data = d;
      const now = Date.now();
      if (now - this.lastNotify >= 100) { this.notify(); return; }
      if (!this.pending) this.pending = setTimeout(() => this.notify(), 100 - (now - this.lastNotify));
    }
    notify() {
      clearTimeout(this.pending);
      this.pending = null;
      this.lastNotify = Date.now();
      for (const fn of this.listeners) { try { fn(this.data); } catch (e) { console.warn('Anzeige:', e); } }
    }
    subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

    // Darstellung, die zum Wert passt (gewünschte, sonst die erste erlaubte)
    fitType(id, wanted) {
      const types = W.displayTypes(this.def(id));
      return types.includes(wanted) ? wanted : types[0];
    }

    rangeOf(a, d = this.data) {
      const manual = a.range === 'manual' && Number.isFinite(a.min) && Number.isFinite(a.max) ? [a.min, a.max] : null;
      return W.range(this.def(a.value), d, manual);
    }

    // Inhalt eines Anzeige-Elements (ohne äußeren Rahmen)
    html(a, d = this.data) {
      const def = this.def(a.value);
      if (!def) return `<div class="anz anz--leer"><div class="anz-label">Wert fehlt</div></div>`;
      const v = W.value(def, d);
      const type = this.fitType(a.value, a.type);
      const label = esc(a.label || def.name);
      const unit = esc(def.unit || '');
      // Ausrichtung im Rahmen (24.10.2026): waagerecht links/mitte/rechts, senkrecht oben/mitte/unten
      const ausr = ` anz--h-${['mitte', 'rechts'].includes(a.alignH) ? a.alignH : 'links'} anz--v-${['oben', 'unten'].includes(a.alignV) ? a.alignV : 'mitte'}`;
      if (type === 'leuchte') {
        return `<div class="anz anz--leuchte${ausr} ${v ? 'on' : ''} ${v == null ? 'unknown' : ''}"><span class="anz-lamp"></span><div class="anz-label">${label}</div></div>`;
      }
      // Füllgut zur Füllstand-Anzeige (Test 23.10.2026, Anmerkung 17), z. B. „Weizen“
      let sorte = null;
      try { sorte = def.typeOf && a.typeOf !== false && d ? def.typeOf(d) : null; } catch { sorte = null; }
      if (type === 'text' || type === 'zahl') {
        const txt = esc(W.format(def, v, a.dec));
        return `<div class="anz anz--${type}${ausr}"><div class="anz-label">${label}${sorte ? ` · ${esc(sorte)}` : ''}</div><div class="anz-big">${txt}${type === 'zahl' && unit && v != null ? `<span>${unit}</span>` : ''}</div></div>`;
      }
      const [mn, mx] = this.rangeOf(a, d);
      const fr = v == null ? 0 : Math.max(0, Math.min(1, (v - mn) / (mx - mn || 1)));
      const warn = a.warn > 0 && v != null && fr * 100 < a.warn;
      if (type === 'balken') {
        return `<div class="anz anz--balken${ausr} ${warn ? 'warn' : ''}">
          <div class="anz-row"><span class="anz-label">${label}</span><b>${v == null ? '–' : Math.round(fr * 100) + ' %'}</b></div>
          <div class="anz-bar"><div style="width:${(fr * 100).toFixed(1)}%"></div></div>
          <div class="anz-sub">${sorte ? `<b class="anz-sorte">${esc(sorte)}</b> · ` : ''}${v == null ? '–' : `${esc(W.format(def, v, 0))} von ${esc(W.format(def, mx, 0))} ${unit}`}</div>
        </div>`;
      }
      // Tacho: 240°-Bogen wie im Mockup, Nadel + drei Teilstriche
      const ang = -120 + 240 * fr;
      const [nx, ny] = P(ang, 64);
      const lab = k => { const [x, y] = P(-120 + 240 * k, 54); return `<text x="${f1(x)}" y="${f1(y + 4)}" text-anchor="middle" class="anz-tick">${compact(mn + (mx - mn) * k)}</text>`; };
      // lange Werte („1.500“) kleiner, sonst stoßen sie an die Skalenzahlen links/rechts (23.10.2026)
      const valTxt = esc(W.format(def, v, a.dec));
      const valSize = Math.max(14, 22 - Math.max(0, valTxt.length - 4) * 3);
      return `<div class="anz anz--tacho ${warn ? 'warn' : ''}">
        <div class="anz-label">${label}</div>
        <svg viewBox="0 0 200 150" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${label}">
          <path d="${arc(-120, 120, 78)}" class="anz-arc-bg"/>
          ${v != null && fr > 0.002 ? `<path d="${arc(-120, ang, 78)}" class="anz-arc"/>` : ''}
          ${lab(0)}${lab(0.5)}${lab(1)}
          ${v != null ? `<line x1="100" y1="95" x2="${f1(nx)}" y2="${f1(ny)}" class="anz-needle"/>` : ''}
          <circle cx="100" cy="95" r="6" class="anz-hub"/>
          <text x="100" y="135" text-anchor="middle" class="anz-val" style="font-size:${valSize}px">${valTxt}</text>
          <text x="100" y="148" text-anchor="middle" class="anz-unit">${unit}</text>
        </svg>
      </div>`;
    }

    // Taste mit Zustand: an/aus → leuchtet (lit), Zahl/Text → klein im Knopf (text)
    keyState(valueId, d = this.data) {
      const def = this.def(valueId);
      if (!def) return null;
      const v = W.value(def, d);
      if (def.kind === 'bool') return { lit: v === true, text: null };
      return { lit: false, text: v == null ? '–' : W.format(def, v) + (def.unit && typeof v === 'number' ? ' ' + def.unit : '') };
    }

    describe(valueId) {
      const def = this.def(valueId);
      return def ? `${def.name}` : 'Wert fehlt';
    }
    pathOf(valueId) {
      const def = this.def(valueId);
      return def ? `${def.cat} › ${def.sub}` : '';
    }

    // ---------- Werteliste-Fenster ----------
    /**
     * @param {object} o  { title, current, kinds: ['bool','num','text'] (Filter), none: 'Text für „keinen“' }
     */
    pick(o = {}) {
      const game = this.game();
      if (!game) { window.uiAlert?.('Dieses Spiel liefert keine Spieldaten.'); return Promise.resolve(undefined); }
      this.closePick(undefined);
      return new Promise(resolve => {
        const cur = this.def(o.current);
        this.pk = { resolve, o, game, q: '', path: cur ? [cur.cat, cur.sub] : [] };
        const el = document.createElement('div');
        el.className = 'wl-overlay';
        el.innerHTML = `<div class="wl-pick" role="dialog" aria-label="${esc(o.title || 'Wert auswählen')}">
          <div class="wl-top"><div class="sheet-title">${esc(o.title || 'Wert auswählen')}</div><button type="button" class="btn-secondary btn-small" data-close>Schließen</button></div>
          <input type="search" class="wl-search" placeholder="Suchen, z. B. Diesel oder hinten 1" autocomplete="off">
          <div class="wl-crumbs"></div>
          <div class="wl-rows"></div>
        </div>`;
        el.addEventListener('pointerdown', e => { if (e.target === el) this.closePick(undefined); });
        el.querySelector('[data-close]').onclick = () => this.closePick(undefined);
        el.querySelector('.wl-search').oninput = e => { this.pk.q = e.target.value; this.renderPick(); };
        el.addEventListener('click', e => {
          const row = e.target.closest('[data-go]');
          if (!row) return;
          const go = JSON.parse(row.dataset.go);
          if (go.path) { this.pk.path = go.path; this.pk.q = ''; el.querySelector('.wl-search').value = ''; this.renderPick(); }
          else this.closePick(go.id);
        });
        document.body.appendChild(el);
        this.pk.el = el;
        this.pk.unsub = this.subscribe(() => this.updatePickValues());
        this.renderPick();
      });
    }

    closePick(result) {
      if (!this.pk) return;
      const { resolve, el, unsub } = this.pk;
      this.pk = null;
      unsub?.();
      el?.remove();
      resolve(result);
    }

    renderPick() {
      const { el, game, o, q, path } = this.pk;
      const ok = v => !o.kinds || o.kinds.includes(v.kind);
      const go = obj => esc(JSON.stringify(obj));
      const valRow = v => `<button type="button" class="wl-row ${v.id === o.current ? 'on' : ''}" data-go="${go({ id: v.id })}">
        <span><b>${esc(v.name)}</b><small>${esc(v.cat)} › ${esc(v.sub)}${v.kind === 'bool' ? ` · ${esc(W.zustand(v, true))} oder ${esc(W.zustand(v, false))}` : ''}</small></span><span class="wl-val" data-val="${esc(v.id)}">${esc(this.valText(v))}</span></button>`;
      let rows;
      if (q.trim()) {
        const hits = W.search(game, q).filter(ok);
        rows = hits.length ? hits.map(valRow).join('') : `<div class="wl-empty">Nichts gefunden – anderen Begriff versuchen oder über die Kategorien suchen.</div>`;
      } else {
        const tree = W.tree(game).map(c => ({ ...c, subs: c.subs.map(s => ({ ...s, values: s.values.filter(ok) })).filter(s => s.values.length) })).filter(c => c.subs.length);
        if (!path.length) {
          rows = tree.map(c => `<button type="button" class="wl-row" data-go="${go({ path: [c.cat] })}"><span><b>${esc(c.cat)}</b><small>${esc(c.subs.map(s => s.sub).join(' · '))}</small></span><span class="wl-chev">›</span></button>`).join('');
        } else if (path.length === 1) {
          const c = tree.find(x => x.cat === path[0]);
          rows = (c?.subs || []).map(s => `<button type="button" class="wl-row" data-go="${go({ path: [path[0], s.sub] })}"><span><b>${esc(s.sub)}</b><small>${esc(s.values.map(v => v.name).join(' · '))}</small></span><span class="wl-chev">›</span></button>`).join('');
        } else {
          const s = tree.find(x => x.cat === path[0])?.subs.find(x => x.sub === path[1]);
          rows = (s?.values || []).map(valRow).join('');
        }
        if (o.none && !path.length) rows = `<button type="button" class="wl-row wl-none" data-go="${go({ id: null })}"><span><b>${esc(o.none)}</b></span></button>` + rows;
      }
      const crumbs = [['Alle Werte', []], ...path.map((p, i) => [p, path.slice(0, i + 1)])];
      el.querySelector('.wl-crumbs').innerHTML = q.trim() ? '' : crumbs.map(([label, p], i) =>
        `<button type="button" class="wl-crumb ${i === crumbs.length - 1 ? 'on' : ''}" data-go="${go({ path: p })}">${i ? '› ' : ''}${esc(label)}</button>`).join('');
      el.querySelector('.wl-rows').innerHTML = rows;
    }

    valText(v) {
      const x = W.value(v, this.data);
      if (x == null) return '–';
      return W.format(v, x, typeof x === 'number' && x % 1 && Math.abs(x) < 100 ? 1 : v.dec) + (v.unit && typeof x === 'number' ? ' ' + v.unit : '');
    }

    updatePickValues() {
      if (!this.pk) return;
      this.pk.el.querySelectorAll('[data-val]').forEach(n => {
        const v = W.get(this.pk.game, n.dataset.val);
        if (v) n.textContent = this.valText(v);
      });
    }
  }

  window.anzeigen = new Anzeigen();
})();
