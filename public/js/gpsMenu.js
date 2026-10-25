/**
 * GPS-Menü (Umsetzungsplan Paket I2, Mockup Bild 3): Gerätespeicher, Gerät und Arbeitsposition, Vorgewende,
 * Auslöser am Vorgewende -- links die Vorschau-Zeichnung im Moment der Auslösung.
 *
 * Die Einstellungen liegen im Server (server/gpsManager.js, je Spiel und Gerät); gerechnet und ausgelöst wird
 * ebenfalls im Server (gpsEngine.js), damit es auch bei geschlossenem Tablet läuft. Diese Seite zeigt nur an,
 * ändert über /api/gps* und spielt den Signalton auf dem Tablet ('gps-trigger').
 *
 * Werte mit null = automatisch: aus dem Spiel (Mod 0.5, data.gps.auto) oder ein Standardwert.
 * Die Vorschau-Rechnung ist aus dem Mockup übernommen (Maßstab, gestauchtes Vorgewende, Maßpfeile).
 */
(function () {
  const esc = escapeHtml;   // js/basis.js (Durchsicht B9: vorher eigene Kopie)
  const m2 = v => v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' m';
  const f = v => v.toFixed(1);
  const TRIG = {
    exit: { title: 'Ausfahrt', sub: 'aus der Arbeitsfläche', color: '#f472b6', ctx: 'Ausfahrt aus der Arbeitsfläche (ins Vorgewende)' },
    entry: { title: 'Einfahrt', sub: 'in die Arbeitsfläche', color: '#22d3ee', ctx: 'Einfahrt in die Arbeitsfläche' }
  };
  const STATE_TEXT = { work: 'Arbeitsfläche', headland: 'Vorgewende', outside: 'außerhalb eines Felds' };
  const LEGENDE_H = 56;   // Vorschau: Streifen oben für die Beschriftung der Auslöselinie
  // Eingabe per Ziffernblock: Grenzen und Schritt je Wert (24.10.2026; Versatz am Vorgewende in 0,5-m-Schritten)
  const GPS_EINGABE = {
    drawbar: { titel: 'Deichsel', min: 0.5, max: 20, schritt: 0.01, einheit: 'm', auto: true },
    pos: { titel: 'Arbeitsbereich (Abstand)', min: 0, max: 30, schritt: 0.01, einheit: 'm', auto: true },
    lat: { titel: 'Seitenversatz', min: -40, max: 40, schritt: 0.01, einheit: 'm', auto: true, hinweis: '+ = nach rechts, − (±) = nach links' },
    width: { titel: 'Breite', min: 0.5, max: 50, schritt: 0.01, einheit: 'm', auto: true },
    headland: { titel: 'Vorgewendegröße', min: 1, max: 45, schritt: 1, einheit: 'm' },
    exitOffset: { titel: 'Versatz Ausfahrt', min: -10, max: 10, schritt: 0.5, einheit: 'm', hinweis: '+ = nach der Linie, − (±) = schon davor' },
    entryOffset: { titel: 'Versatz Einfahrt', min: -10, max: 10, schritt: 0.5, einheit: 'm', hinweis: '+ = nach der Linie, − (±) = schon davor' }
  };
  const BEEP_TEXT = { aus: 'aus', tablet: 'Tablet', armlehne: 'Armlehne', beide: 'Tablet und Armlehne' };
  const SIDE_TEXT = { front: 'vorne', rear: 'hinten' }, ATT_TEXT = { mounted: 'angebaut', trailed: 'angehängt' };

  class GpsMenu {
    constructor() {
      this.el = document.getElementById('gps-menu');
      this.gps = null;          // Kurzfassung vom Server (gpsManager.summary())
      this.status = null;       // data.gps der letzten Schreibrunde
      this.autoSig = '';
      this.view = 'exit';
      this.drive = 'links';
      this.names = new Map();
      this.functions = [];
      if (typeof io === 'function') {
        this.socket = window.hubSocket;   // gemeinsame Verbindung der Seite (hubSocket.js, B4)
        this.socket.on('gps-changed', g => this.onChanged(g));
        this.socket.on('telemetry-update', d => this.onTelemetry(d));
        this.socket.on('gps-trigger', t => this.onTrigger(t));
      }
      document.addEventListener('tabchanged', e => { if (e.detail?.tabName === 'gps') this.open(); });
      // Ton im Browser braucht einmal eine Berührung, bevor er spielen darf
      window.addEventListener('pointerdown', () => this.unlockAudio(), { once: true });
    }

    get visible() { return document.getElementById('tab-gps')?.classList.contains('active'); }

    async open() {
      try {
        const [g] = await Promise.all([fetch('/api/gps').then(r => r.json()), this.loadLabels()]);
        if (g.success) this.gps = g.gps;
      } catch (e) { console.warn('GPS-Menü:', e); }
      this.render();
    }

    async loadLabels() {
      try {
        const [fr, mr] = await Promise.all([fetch('/api/functions').then(r => r.json()), fetch('/api/macros').then(r => r.json())]);
        this.functions = fr.functions || [];
        this.names = new Map(this.functions.map(fn => [fn.id, fn.name]));
        (mr.macros || []).forEach(mc => this.names.set(`macro:${mc.id}`, `🔁 ${mc.name}`));
      } catch { /* Namen sind nur Anzeige */ }
    }

    onChanged(g) {
      this.gps = g;
      // Keine Meldungen beim Fahrzeug- oder Gerätewechsel mehr (Hendrik 24.10.2026: „diese Benachrichtigungen müssen weg,
      // die braucht man nicht“) -- welches Gerät geladen ist, steht im GPS-Menü
      if (this.visible) this.render();
    }

    onTelemetry(d) {
      this.status = d?.gps || null;
      this.units = Array.isArray(d?.units) ? d.units : [];
      this.tb = d?.teilbreiten || null;   // Stand der Teilbreiten-Automatik (server/teilbreitenAutomatik.js)
      if (!this.visible || !this.gps) return;
      const others = this.units.filter(u => u.areas?.length && u.name !== this.status?.unit).map(u => u.name);
      const tbu = this.tbUnit();
      const sig = JSON.stringify([this.status?.auto?.side, this.status?.auto?.attach, this.status?.auto?.width, this.status?.auto?.pos, this.status?.auto?.lat, this.status?.auto?.drawbar, this.status?.unit,
        this.units.find(u => u.name === this.status?.unit)?.canTurnOn, others, tbu?.name, !!tbu?.pfSek]);
      if (sig !== this.autoSig && Date.now() - (this.autoAt || 0) > 1000) { this.autoSig = sig; this.autoAt = Date.now(); this.render(); return; }
      const line = this.el.querySelector('.gps-status');
      if (line) line.innerHTML = this.statusHtml();
      const tbl = this.el.querySelector('.gps-tb-status');
      if (tbl) tbl.innerHTML = this.tbStatusHtml();
    }

    // ---------- Werte ----------
    live() { return this.gps?.live || {}; }
    auto() { return this.status?.auto || null; }
    // wirksame Werte: von Hand, sonst aus dem Spiel, sonst Standard -- mit Herkunft für die Anzeige
    eff() {
      const L = this.live(), a = this.auto() || {};
      const pick = (k, def) => (L[k] != null ? [L[k], 'hand'] : a[k] != null ? [a[k], 'spiel'] : [def, 'standard']);
      const side = L.side && L.side !== 'auto' ? L.side : (a.side || 'rear');
      const attach = side === 'front' ? 'mounted' : (L.attach && L.attach !== 'auto' ? L.attach : (a.attach || 'mounted'));
      const [drawbar, drawbarSrc] = pick('drawbar', 4);
      const [pos, posSrc] = pick('pos', side === 'front' ? 1 : 3);
      const [lat, latSrc] = pick('lat', 0);
      const [width, widthSrc] = pick('width', 6);
      return { side, attach, drawbar, pos, lat, width, src: { drawbar: drawbarSrc, pos: posSrc, lat: latSrc, width: widthSrc } };
    }

    async api(method, url, body) {
      try {
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Fehler');
        if (data.gps) this.gps = data.gps;
        return data;
      } catch (e) {
        uiAlert('GPS: ' + e.message);
        return null;
      } finally {
        this.render();
      }
    }
    patch(p) { return this.api('PUT', '/api/gps/live', p); }
    step(key, delta, min, max) {
      const base = ['headland', 'overlap', 'exitOffset', 'entryOffset'].includes(key) ? (this.live()[key] || 0) : this.eff()[key];
      const next = Math.round(Math.min(max, Math.max(min, base + delta)) * 100) / 100;
      return this.patch({ [key]: next });
    }
    setSide(v) { return this.patch({ side: v }); }
    setAttach(v) { return this.patch({ attach: v }); }

    // ---------- Darstellung ----------
    // Scroll-Stand merken (Test 23.10.2026, Hendrik: „scrollt immer wieder nach oben, sobald man etwas drückt“): render()
    // baut das ganze Menü neu -- vorher und nachher die Scroll-Position aller scrollenden Vorfahren und Innenlisten
    scrollStand() {
      const els = [];
      for (let e = this.el; e && e !== document.documentElement; e = e.parentElement) if (e.scrollHeight > e.clientHeight) els.push([e, null]);
      if (document.scrollingElement) els.push([document.scrollingElement, null]);
      for (const sel of ['.gps-side', '.gps-dev-list', '.gps-dialog']) { const e = this.el?.querySelector(sel); if (e) els.push([null, sel, e.scrollTop]); }
      return els.map(([e, sel, top]) => [e, sel, e ? e.scrollTop : top]);
    }
    scrollZurueck(stand) {
      for (const [e, sel, top] of stand) {
        const el = e || this.el?.querySelector(sel);
        if (el && el.scrollTop !== top) el.scrollTop = top;
      }
    }

    render() {
      if (!this.el) return;
      if (!this.gps) { this.el.innerHTML = '<div class="gps-empty">GPS wird geladen …</div>'; return; }
      const stand = this.scrollStand();
      this.renderInner();
      this.scrollZurueck(stand);
    }

    renderInner() {
      this.el.innerHTML = `
        <div class="gps-grid">
          <section class="gps-card gps-preview">
            <div class="gps-preview-head">
              ${['exit', 'entry'].map(k => `<button type="button" class="gps-pill ${k === this.view ? 'on' : ''}" style="--pill:${TRIG[k].color}" onclick="window.gpsMenu.setView('${k}')">${TRIG[k].title}</button>`).join('')}
              <span class="gps-flex"></span>
              ${[['gerade', 'Gerade'], ['links', this.view === 'entry' ? 'Schräg ↘' : 'Schräg ↗'], ['rechts', this.view === 'entry' ? 'Schräg ↙' : 'Schräg ↖'], ['kurve', 'Kurve']]
                .map(([id, label]) => `<button type="button" class="gps-pill gps-pill--drive ${id === this.drive ? 'on' : ''}" onclick="window.gpsMenu.setDrive('${id}')">${label}</button>`).join('')}
            </div>
            <div class="gps-svg">${this.svg()}</div>
            <div class="gps-status">${this.statusHtml()}</div>
          </section>
          <div class="gps-side">${this.storeCard()}${this.positionCard()}${this.mapCard()}${this.headlandCard()}${this.triggerCard()}${this.teilbreitenCard()}
            <p class="gps-note">Symbol, Kartentasten, Abstandsanzeige und Flächenfarbe stellst du an der Kartenkachel ein; Glättung und worüber der Ton kommt unter Einstellungen → Karte. Gerechnet und ausgelöst wird im ControlHub-Programm – auch wenn kein Tablet offen ist.</p>
          </div>
        </div>`;
    }

    statusHtml() {
      const s = this.status;
      if (!s) return 'Keine Spieldaten – die Vorschau zeigt die Einstellungen.';
      const parts = [`Jetzt: <b>${esc(STATE_TEXT[s.state] || '–')}</b>`];
      if (s.headlandAheadM != null) parts.push(`Vorgewende in <b>${Math.round(s.headlandAheadM)} m</b>`);
      if (s.fieldEdgeAheadM != null) parts.push(`Feldrand in <b>${Math.round(s.fieldEdgeAheadM)} m</b>`);
      parts.push(s.source === 'spiel' ? 'Lage aus dem Spiel' : s.source === 'hand' ? 'Lage aus den Einstellungen' : 'kein Gerät');
      if (s.feldGrenze === 'spurfuehrung') parts.push('Feldgrenze aus der Spurführung des Spiels');
      return parts.join(' · ');
    }

    // Wert antippen = Ziffernblock (Hendrik 24.10.2026); Grenzen wie im Server (gpsManager.js cleanSettings)
    async eingeben(key) {
      const G = GPS_EINGABE[key];
      if (!G) return;
      const L = this.live(), e = this.eff();
      const wert = ['headland', 'exitOffset', 'entryOffset'].includes(key) ? (L[key] || 0) : e[key];
      const v = await window.zahlenEingabe({ titel: G.titel, wert, min: G.min, max: G.max, schritt: G.schritt, einheit: G.einheit,
        automatisch: G.auto && L[key] != null, hinweis: G.hinweis });
      if (v === null || v === undefined) return;
      return this.patch({ [key]: v === 'auto' ? null : v });
    }

    stepper(key, label, color, text, min, max, d, src, lessLabel = '−', moreLabel = '+') {
      const note = src == null ? '' : src === 'hand'
        ? `<button type="button" class="gps-auto-btn" onclick="window.gpsMenu.patch({ ${key}: null })" title="Wieder den Wert aus dem Spiel nehmen">↺ automatisch</button>`
        : `<span class="gps-src">${src === 'spiel' ? 'aus dem Spiel' : 'Standard'}</span>`;
      return `<div class="gps-step">
        <span class="gps-step-label" style="color:${color}">${label}</span>
        <button type="button" class="gps-step-btn" aria-label="${label} ${lessLabel === '←' ? 'nach links' : 'kleiner'}" onclick="window.gpsMenu.step('${key}', ${-d}, ${min}, ${max})">${lessLabel}</button>
        ${GPS_EINGABE[key] ? `<button type="button" class="gps-step-val gps-step-val--tipp" title="Antippen und Zahl eingeben" onclick="window.gpsMenu.eingeben('${key}')">${text}</button>` : `<span class="gps-step-val">${text}</span>`}
        <button type="button" class="gps-step-btn" aria-label="${label} ${moreLabel === '→' ? 'nach rechts' : 'größer'}" onclick="window.gpsMenu.step('${key}', ${d}, ${min}, ${max})">${moreLabel}</button>
        ${note ? `<span class="gps-step-note">${note}</span>` : ''}
      </div>`;
    }

    sw(on, label, js, cls = '') {
      return `<button type="button" role="switch" aria-checked="${on}" class="gps-switch ${cls} ${on ? 'on' : ''}" onclick="${js}"><span>${label}</span><span class="gps-switch-track"><span></span></span></button>`;
    }
    // ---------- Teilbreiten (Hendrik 24.10.2026: Automatik für den Düngerstreuer, PF schaltet ihn nicht) ----------
    // Gerät mit Teilbreiten: das GPS-Gerät, sonst das erste angehängte
    tbUnit() {
      const k = (this.units || []).filter(u => u.sections);
      return k.find(u => u.name === this.status?.unit) || k.find(u => u.selected) || k[0] || null;
    }

    // Schalter je Gerät (gps.json einheiten[Name].tb); Tasten, Schwelle, Vorlauf für alle Geräte
    teilbreitenCard() {
      const u = this.tbUnit();
      if (!u) return '';
      const n = esc(JSON.stringify(u.name));
      const auto = this.gps?.einheiten?.[u.name]?.tb === true;
      if (u.pfSek?.length) {
        return `<section class="gps-card">
          <div class="gps-kicker">Teilbreiten <span>· ${esc(u.name)}</span></div>
          <div class="gps-tb-status gps-small">${this.tbStatusHtml()}</div>
          <p class="gps-small">Precision Farming schaltet die Düsen dieser Spritze selbst; die Karte zeigt, was gerade spritzt. Eine eigene Automatik ist hier nicht nötig.</p>
        </section>`;
      }
      const cfg = this.gps?.teilbreiten || {};
      const tasten = cfg.tasten || {};
      const fn = id => this.functions.find(f => f.id === id);
      const fehlt = Object.values(tasten).some(id => !fn(id));
      const ROWS = [['linksAus', 'Links aus'], ['linksAn', 'Links an'], ['rechtsAus', 'Rechts aus'], ['rechtsAn', 'Rechts an']];
      const setCfg = p => `window.gpsMenu.api('PUT', '/api/gps/config', { teilbreiten: ${esc(JSON.stringify(p))} })`;
      const vorlauf = cfg.vorlauf ?? 0.8;
      return `<section class="gps-card">
        <div class="gps-kicker">Teilbreiten <span>· ${esc(u.name)}</span></div>
        <div class="gps-tb-status gps-small">${this.tbStatusHtml()}</div>
        ${this.sw(auto, 'Teilbreiten automatisch schalten', `window.gpsMenu.api('PUT', '/api/gps/einheit', { name: ${n}, tb: ${!auto} })`)}
        <p class="gps-small">Schaltet außen Teilbreiten ab, sobald sie gleich überwiegend auf schon bearbeiteter Fläche oder außerhalb des Felds lägen (Feldkeil, Feldrand, Vorgewende), und wieder zu, sobald dort frei ist – mehrere auf einmal. Nur beim Arbeiten, vorwärts, ab 1 km/h. Schaltest du das Gerät aus, gehen alle Teilbreiten wieder an. Geschaltet wird mit deinen Spieltasten.</p>
        ${auto ? `<div class="gps-row gps-row--stack"><span class="gps-row-label">Abschalten ab Überlappung</span>${this.seg([30, 50, 70, 90].map(v => [`${v} %`, cfg.schwelle === v, setCfg({ schwelle: v })]))}</div>
        <div class="gps-step">
          <span class="gps-step-label">Vorlauf</span>
          <button type="button" class="gps-step-btn" aria-label="Vorlauf kürzer" onclick="${setCfg({ vorlauf: Math.max(0, Math.round((vorlauf - 0.2) * 10) / 10) })}">−</button>
          <span class="gps-step-val">${vorlauf.toLocaleString('de-DE', { minimumFractionDigits: 1 })} s</span>
          <button type="button" class="gps-step-btn" aria-label="Vorlauf länger" onclick="${setCfg({ vorlauf: Math.min(2, Math.round((vorlauf + 0.2) * 10) / 10) })}">+</button>
          <span class="gps-step-note">schaltet so viel früher – gleicht aus, dass Spieldaten, Tastendruck und Gerät etwas brauchen</span>
        </div>
        <div class="gps-tb-tasten">${ROWS.map(([k, label]) => `<div class="gps-row"><span class="gps-row-label">${label}</span>
          <button type="button" class="gps-trig-act ${fn(tasten[k]) ? '' : 'off'}" onclick="window.gpsMenu.pickTbTaste('${k}')">${esc(fn(tasten[k])?.name || 'fehlt – antippen zum Wählen')}</button></div>`).join('')}</div>
        ${fehlt ? '<p class="gps-small gps-warn">Nicht alle Tasten gefunden. Lies deine inputBinding.xml neu ein (Funktionen → Mehr → inputBinding.xml einlesen); die Teilbreiten-Tasten kommen in die Gruppe „Teilbreiten“.</p>' : ''}` : ''}
      </section>`;
    }

    tbStatusHtml() {
      const u = this.tbUnit();
      if (!u) return '';
      const t = this.tb && this.tb.unit === u.name ? this.tb : null;
      const l = t?.letzte && Date.now() - t.letzte.at < 8000
        ? ` · zuletzt <b>${t.letzte.side === 'L' ? 'links' : 'rechts'} ${esc(t.letzte.was)}${t.letzte.n > 1 ? ` (${t.letzte.n}×)` : ''}</b>${t.letzte.sent ? '' : ' (Taste fehlt)'}` : '';
      return `An: <b>${esc(window.Teilbreiten?.textGeraet(u) || '')}</b>${t ? ' · Automatik an' : ''}${l}`;
    }

    pickTbTaste(k) {
      const cur = this.gps?.teilbreiten?.tasten?.[k];
      window.actionPicker.open({ functionId: cur }, { includeMacros: false, allowClear: false, axisNeedsDuration: false, contextLabel: 'Teilbreiten-Taste' },
        (r) => {
          if (r.mode !== 'function' || !r.functionId) { uiAlert('Bitte eine Funktion wählen (z. B. aus der Gruppe „Teilbreiten“).'); return; }
          this.api('PUT', '/api/gps/config', { teilbreiten: { tasten: { [k]: r.functionId } } });
        });
    }

    seg(items) {
      return `<div class="gps-seg">${items.map(([label, on, js, off]) => `<button type="button" class="${on ? 'on' : ''}" ${off ? `disabled title="${off}"` : ''} onclick="${js}">${label}</button>`).join('')}</div>`;
    }

    storeCard() {
      const g = this.gps, L = g.live;
      // Änderungen werden sofort gespeichert (24.10.2026); ein neues Gerät bei der ersten Änderung
      const state = !g.current ? ['neu – wird gespeichert, sobald du etwas änderst', ''] : ['Änderungen werden automatisch gespeichert', 'ok'];
      const unit = this.status?.unit;
      // Ein angehängtes Gerät wartet, weil das geladene ungespeicherte Änderungen hat (Test 23.10.2026)
      const wartet = g.wartet && g.wartet !== L.match && unit === g.wartet ? `<div class="gps-wartet">
          <p>Angehängt ist <b>„${esc(g.wartet)}“</b>, geladen sind aber noch die Einstellungen von <b>„${esc(L.name)}“</b>${g.dirty ? ', weil sie noch nicht gespeichert sind' : ''}. Bis du wechselst, rechnet das GPS mit diesen Einstellungen.</p>
          <div class="gps-wartet-btns">
            ${g.dirty ? `<button type="button" class="btn-primary" onclick="window.gpsMenu.api('POST', '/api/gps/wechseln', { speichern: true })">„${esc(L.name)}“ speichern und wechseln</button>
            <button type="button" class="btn-secondary" onclick="window.gpsMenu.api('POST', '/api/gps/wechseln', { speichern: false })">Änderungen verwerfen und wechseln</button>`
              : `<button type="button" class="btn-primary" onclick="window.gpsMenu.api('POST', '/api/gps/wechseln', { speichern: false })">Zu „${esc(g.wartet)}“ wechseln</button>`}
          </div>
        </div>` : '';
      return `<section class="gps-card gps-card--store">
        <div class="gps-kicker">Gerät <span>· GPS-Einstellungen je Arbeitsgerät, unabhängig vom Profil</span></div>
        ${wartet}
        <div class="gps-store-row">
          <div class="gps-store-name"><b>${esc(L.name)}</b><small class="${state[1]}">${state[0]}</small></div>
          <button type="button" class="btn-secondary" onclick="window.appNav.go('gps-geraete')">Geräte verwalten ›</button>
        </div>
        ${this.sw(g.autoLoad, 'Automatisch laden, wenn das Gerät angehängt wird', `window.gpsMenu.api('PUT', '/api/gps/config', { autoLoad: ${!g.autoLoad} })`)}
        <div class="gps-small">${unit ? `GPS-Gerät im Spiel: <b>${esc(unit)}</b>${g.gpsEinheit === unit ? ' (von Hand festgelegt)' : ''}${L.match && L.match !== unit ? ` · dieses Gerät gehört zu „${esc(L.match)}“` : ''}` : 'Kein Gerät angehängt (oder keine Spieldaten).'}</div>
      </section>`;
    }

    positionCard() {
      const L = this.live(), e = this.eff(), a = this.auto();
      const found = a ? [SIDE_TEXT[a.side], ATT_TEXT[a.attach], a.width != null ? m2(a.width) : null].filter(Boolean).join(', ') : '';
      const latText = e.lat === 0 ? 'mittig' : e.lat < 0 ? '← ' + m2(-e.lat) : m2(e.lat) + ' →';
      return `<section class="gps-card">
        <div class="gps-kicker">Gerät und Arbeitsposition ${found ? `<span>· erkannt: ${esc(found)}</span>` : '<span>· ohne Mod 0.5 nur Handwerte</span>'}</div>
        <div class="gps-row"><span class="gps-row-label">Anbauposition</span>${this.seg([['Automatisch', L.side === 'auto', "window.gpsMenu.setSide('auto')"], ['Vorne', L.side === 'front', "window.gpsMenu.setSide('front')"], ['Hinten', L.side === 'rear', "window.gpsMenu.setSide('rear')"]])}</div>
        ${e.side === 'rear' ? `<div class="gps-row"><span class="gps-row-label">Anbauart</span>${this.seg([['Automatisch', L.attach === 'auto', "window.gpsMenu.setAttach('auto')"], ['Angebaut', L.attach === 'mounted', "window.gpsMenu.setAttach('mounted')"], ['Angehängt', L.attach === 'trailed', "window.gpsMenu.setAttach('trailed')"]])}</div>` : ''}
        <div class="gps-steps">
          ${e.attach === 'trailed' ? this.stepper('drawbar', 'Deichsel', '#b6bdc8', m2(e.drawbar), 0.5, 20, 0.5, e.src.drawbar) : ''}
          ${this.stepper('pos', 'Arbeitsbereich', '#8fd673', m2(e.pos), 0, 30, 0.5, e.src.pos)}
          ${this.stepper('lat', 'Seitenversatz', '#a78bfa', latText, -40, 40, 0.5, e.src.lat, '←', '→')}
          ${this.stepper('width', 'Breite', 'var(--text-dim)', m2(e.width), 0.5, 50, 0.5, e.src.width)}
        </div>
        <p class="gps-small">„Automatisch“ heißt: Anbauart, Arbeitsbereich, Seitenversatz und Breite kommen aus dem Spiel – auch Knickwinkel, gedrehter Pflug und abgeschaltete Teilbreiten. Ein Wert von Hand überschreibt nur diesen Wert.</p>
      </section>`;
    }

    // Je angehängtem Gerät (Anmerkungen 5, 13, 21): auf der Karte zeigen, wann die Fläche als bearbeitet zählt.
    // Alle anderen angehängten Geräte (Frontgewicht, Anhänger …) stellst du auf der Seite „GPS-Geräte“ ein.
    mapCard() {
      const unit = this.status?.unit || this.live().match || '';
      if (!unit) return '';
      const o = this.gps?.einheiten?.[unit] || {};
      const cw = o.cov || 'auto';
      const n = esc(JSON.stringify(unit));
      const set = patch => `window.gpsMenu.api('PUT', '/api/gps/einheit', Object.assign({ name: ${n} }, ${esc(JSON.stringify(patch))}))`;
      // Gerät ohne Ein/Aus im Spiel: „Eingeschaltet“ und „Gesenkt und eingeschaltet“ gehen nicht, es zählt das Absenken (flaeche.js covWirksam)
      const u = (this.units || []).find(x => x.name === unit);
      const ohneAn = u && !u.canTurnOn ? 'Das Gerät lässt sich im Spiel nicht einschalten' : '';
      // Kombination (z. B. Kreiselegge + Sämaschine): weitere Geräte mit Arbeitsbereich zählen nach ihrer eigenen Einstellung
      const others = (this.units || []).filter(x => x.areas?.length && x.name !== unit).map(x => `„${esc(x.name)}“`);
      return `<section class="gps-card">
        <div class="gps-kicker">Karte <span>· ${esc(unit)}</span></div>
        ${this.sw(o.map !== false, 'Auf der Karte zeigen', set({ map: o.map === false }))}
        <div class="gps-row gps-row--stack"><span class="gps-row-label">Fläche zählt als bearbeitet</span>${this.seg([['Automatisch', cw === 'auto', set({ cov: 'auto' })], ['Gesenkt', cw === 'gesenkt', set({ cov: 'gesenkt' })], ['Eingeschaltet', cw === 'an', set({ cov: 'an' }), ohneAn], ['Gesenkt und eingeschaltet', cw === 'beides', set({ cov: 'beides' }), ohneAn]])}</div>
        ${cw === 'auto' && u ? `<p class="gps-small">Automatisch: Bei diesem Gerät zählt die Fläche, wenn es ${window.Teilbreiten.autoRegel(u)} ist.</p>` : ''}
        ${ohneAn ? '<p class="gps-small">Dieses Gerät lässt sich im Spiel nicht einschalten – die Fläche zählt beim Absenken.</p>' : ''}
        ${others.length ? `<p class="gps-small"><b>Auch mit Arbeitsbereich:</b> ${others.join(', ')}. Diese Geräte markieren Fläche nach ihrer eigenen Einstellung, siehe Geräte verwalten.</p>` : ''}
        <p class="gps-small">Die übrigen angehängten Geräte (z. B. Frontgewicht, Anhänger) stellst du unter <button type="button" class="gps-inline-link" onclick="window.appNav.go('gps-geraete')">Geräte verwalten ›</button> ein.</p>
      </section>`;
    }

    headlandCard() {
      const L = this.live();
      return `<section class="gps-card">
        <div class="gps-kicker">Vorgewende</div>
        <div class="gps-steps">${this.stepper('headland', 'Vorgewendegröße', '#fbbf24', `${L.headland} m`, 1, 45, 1, null)}</div>
      </section>`;
    }

    // Je Richtung „Aktion ausführen“ und „Ton“ (Anmerkung 20, 23.10.2026) statt Hauptschalter + Signalton-Zeile
    triggerCard() {
      const L = this.live(), g = this.gps;
      const rows = ['exit', 'entry'].map(k => {
        const t = TRIG[k], act = L[k];
        const actOn = k === 'exit' ? L.exitAct : L.entryAct, tonOn = k === 'exit' ? L.exitBeep : L.entryBeep;
        const ak = k === 'exit' ? 'exitAct' : 'entryAct', tk = k === 'exit' ? 'exitBeep' : 'entryBeep';
        const sugg = this.suggestions(k).filter(fn => fn.id !== act?.functionId).slice(0, 3);
        const ok = k === 'exit' ? 'exitOffset' : 'entryOffset', o = L[ok] || 0;
        const oText = o === 0 ? '0 m' : `${o > 0 ? '+' : '−'}${String(Math.abs(o)).replace('.', ',')} m`;
        return `<div class="gps-trig ${k === this.view ? 'on' : ''}" style="--trig:${t.color}">
          <button type="button" class="gps-trig-title" onclick="window.gpsMenu.setView('${k}')"><b>${t.title}</b><small>${t.sub}</small></button>
          <div class="gps-trig-switches">
            ${this.sw(actOn, 'Aktion ausführen', `window.gpsMenu.patch({ ${ak}: ${!actOn} })`)}
            ${this.sw(tonOn, 'Ton', `window.gpsMenu.patch({ ${tk}: ${!tonOn} })`)}
          </div>
          <div class="gps-steps">${this.stepper(ok, 'Versatz', t.color, oText, -10, 10, 0.5, null)}</div>
          <button type="button" class="gps-trig-act ${actOn ? '' : 'off'}" onclick="window.gpsMenu.pickAction('${k}')">${esc(this.actionLabel(act))}</button>
          ${sugg.length ? `<div class="gps-sugg">Vorschlag: ${sugg.map(fn => `<button type="button" class="chip" onclick="window.gpsMenu.patch({ ${k}: { functionId: ${esc(JSON.stringify(fn.id))} } })">${esc(fn.name)}</button>`).join('')}</div>` : ''}
        </div>`;
      }).join('');
      const auto = g.automatik !== false;
      return `<section class="gps-card${auto ? '' : ' gps-card--aus'}">
        <div class="gps-kicker">Auslöser am Vorgewende</div>
        ${this.sw(auto, 'Vorgewendeautomatik', `window.gpsMenu.api('PUT', '/api/gps/config', { automatik: ${!auto} })`)}
        <p class="gps-small">${auto ? 'Aktionen am Vorgewende werden ausgeführt (je Richtung „Aktion ausführen“).' : 'Aus: am Vorgewende wird keine Aktion ausgeführt, der Ton bleibt. Gilt für alle Geräte; per Taste: ControlHub-Steuerung › GPS & Zähler.'}</p>
        <div class="gps-steps">${this.stepper('overlap', 'Vorgewendeüberlappung', 'var(--text-dim)', `${L.overlap} %`, 0, 100, 25, null)}</div>
        <p class="gps-small">0 % = Vorgewende bleibt frei, 100 % = ganzer Balken im Vorgewende.</p>
        <div class="gps-trig-body">
          ${rows}
          <p class="gps-small">Versatz: + löst so viele Meter nach der Vorgewendelinie aus, − schon davor (0,5-m-Schritte, bis 10 m). Der Ton klingt beim Ausfahren absteigend, beim Einfahren aufsteigend. Worüber er kommt: Einstellungen → Karte (jetzt: ${esc(BEEP_TEXT[g.beep] || g.beep)}). Tipp: Funktionen mit Bedingung („nur wenn Gerät hinten 1 gesenkt“ bzw. „… angehoben“) schalten nie in die falsche Richtung.</p>
        </div>
      </section>`;
    }

    // Passende Funktionen: Ausfahrt = „nur wenn gesenkt“ (ausheben), Einfahrt = „nur wenn oben“ (absenken)
    suggestions(kind) {
      return this.functions.filter(fn => /_low$/.test(fn.condition?.value || '') && (kind === 'exit' ? fn.condition.is !== false : fn.condition.is === false));
    }

    actionLabel(a) {
      if (!a) return 'Keine Aktion – antippen zum Wählen';
      if (a.functionId) return window.hubActions?.isHub(a.functionId) ? window.hubActions.label(a.functionId) : (this.names.get(a.functionId) || a.functionId);
      return 'Taste: ' + describeActions(a.quickActions);
    }

    pickAction(kind) {
      const cur = this.live()[kind] || {};
      window.actionPicker.open({ functionId: cur.functionId, quickActions: cur.quickActions },
        { includeMacros: true, allowClear: true, axisNeedsDuration: false, contextLabel: TRIG[kind].ctx },
        (r) => {
          let v = null;
          if (r.mode === 'function') { v = { functionId: r.functionId }; this.names.set(r.functionId, r.label); }
          else if (r.mode === 'keys' || r.mode === 'axis') v = { quickActions: r.quickActions };
          this.patch({ [kind]: v });
        });
    }

    setView(k) { this.view = k; this.render(); }
    setDrive(k) { this.drive = k; this.render(); }

    // ---------- Signalton und Hinweis beim Auslösen ----------
    unlockAudio() {
      try {
        if (!this.audio) this.audio = new (window.AudioContext || window.webkitAudioContext)();
        if (this.audio.state === 'suspended') this.audio.resume();
      } catch { /* kein Ton möglich */ }
    }
    beep(kind) {
      try {
        this.unlockAudio();
        const ctx = this.audio;
        if (!ctx) return;
        // Eigener Klang (Test 23.10.2026: soll anders klingen als der Ton des Spiels beim Einschalten der Spurführung):
        // weicher Zweiklang wie ein Gong statt eines Pieptons -- Ausfahrt absteigend (h → e), Einfahrt aufsteigend (e → h)
        const tones = kind === 'exit' ? [[0, 988], [0.16, 659]] : [[0, 659], [0.16, 988]];
        for (const [at, hz] of tones) {
          const o = ctx.createOscillator(), gn = ctx.createGain();
          o.type = 'triangle';
          o.frequency.value = hz;
          gn.gain.setValueAtTime(0.0001, ctx.currentTime + at);
          gn.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + at + 0.012);
          gn.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.38);
          o.connect(gn).connect(ctx.destination);
          o.start(ctx.currentTime + at);
          o.stop(ctx.currentTime + at + 0.4);
        }
      } catch { /* egal */ }
    }
    // Am Vorgewende nur der Ton, falls eingestellt (Anmerkung 20); keine Meldung je Auslöser (Hendrik 24.10.2026)
    onTrigger(t) {
      if (t && (t.beep === 'tablet' || t.beep === 'beide')) this.beep(t.kind);
    }

    // ---------- Vorschau (aus dem Mockup) ----------
    svg() {
      const L = this.live(), e = this.eff();
      const s = { bar: e.drawbar, pos: e.pos, lat: e.lat, width: e.width, headland: L.headland, overlap: L.overlap };
      const exit = this.view === 'entry';              // Einfahrt = gespiegeltes Bild
      // Versatz (24.10.2026): + = in Fahrtrichtung hinter der Linie (vor dem Spiegeln immer Richtung Feldrand, also −y)
      const versatz = (this.view === 'exit' ? L.exitOffset : L.entryOffset) || 0;
      const side = e.side === 'front' ? 'vorne' : 'hinten';
      const attach = side === 'vorne' ? 'anbau' : (e.attach === 'trailed' ? 'anhang' : 'anbau');
      const trailed = side === 'hinten' && attach === 'anhang';
      const curve = this.drive === 'kurve';
      const edgeY = 110;
      const rad = g => (g * Math.PI) / 180;
      const fwd = h => [Math.sin(rad(h)), -Math.cos(rad(h))];
      const rgt = h => [Math.cos(rad(h)), Math.sin(rad(h))];
      const add = (p, v, k) => [p[0] + v[0] * k, p[1] + v[1] * k];
      const A = { gerade: 0, links: 24, rechts: -24, kurve: 30 }[this.drive];
      const hlY = edgeY + Math.round(60 + 120 * (1 - Math.exp(-s.headland / 12)));
      const geo = (sc) => {
        const ts = sc / 10, R = 9 * sc;
        const L2 = s.bar * sc, d = s.pos * sc, w = s.width * sc;
        const gam = trailed && curve ? (Math.asin(Math.min(0.9, L2 / R)) * 180) / Math.PI : 0;
        const B = A - gam;
        const nose = add([0, 0], fwd(A), 30 * ts), hitch = add([0, 0], fwd(A), -18 * ts);
        const P = side === 'vorne' ? add(nose, fwd(A), d) : add(hitch, fwd(B), -d);
        const q = s.lat * sc, Pq = add(P, rgt(B), q);
        const Wx = add(hitch, fwd(B), -L2);
        const e1 = add(Pq, rgt(B), -w / 2), e2 = add(Pq, rgt(B), w / 2);
        const [first, last] = e1[1] <= e2[1] ? [e1, e2] : [e2, e1];
        const t = s.overlap / 100, [a0, a1] = exit ? [last, first] : [first, last];
        const anchor = [a0[0] + (a1[0] - a0[0]) * t, a0[1] + (a1[1] - a0[1]) * t];
        const kL = -(Math.max(w / 2 - q, 16 * ts) + 16), kR = Math.max(w / 2 + q, 16 * ts) + 16;
        const tip = side === 'vorne' ? nose : hitch;
        const pts = [add(nose, rgt(A), -14 * ts), add(nose, rgt(A), 14 * ts), add(hitch, rgt(A), -14 * ts), add(hitch, rgt(A), 14 * ts),
          e1, e2, Wx, add(tip, rgt(B), kR + 170), add(P, rgt(B), kR + 170), add(Pq, fwd(B), -58)];
        if (trailed) pts.push(add(hitch, rgt(B), kL - 120), add(Wx, rgt(B), kL - 120));
        return { sc, ts, R, L: L2, d, w, B, nose, hitch, P, q, Pq, Wx, first, last, a0, a1, level: Math.abs(e1[1] - e2[1]) < 0.5, anchor, kL, kR, pts };
      };
      const fits = (g) => {
        const xs = g.pts.map(p => p[0]);
        const ys = g.pts.map(p => { const y = p[1] + hlY - versatz * g.sc - g.anchor[1]; return exit ? 2 * hlY - y : y; });
        const ahead = g.anchor[1] - Math.min(g.nose[1], g.first[1]);
        if (!exit && ahead / g.sc <= s.headland && ahead > hlY - edgeY - 6) return false;
        // oben bleibt ein Streifen für die Beschriftung der Auslöselinie frei (24.10.2026: nichts übereinander)
        return Math.max(...xs) - Math.min(...xs) <= 422 && Math.min(...ys) >= LEGENDE_H + 6 && Math.max(...ys) <= 592;
      };
      const g = [10, 9, 8, 7, 6, 5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.75, 0.5].map(geo).find(fits) || geo(0.5);
      const { sc, ts, R, L: Lb, w, B, nose, hitch, P, q, Pq, Wx, a0, a1, level, anchor, kL, kR } = g;
      const gx = g.pts.map(p => p[0]);
      const dx = 237 - (Math.max(...gx) + Math.min(...gx)) / 2, dy = hlY - versatz * sc - anchor[1];
      const trigY = exit ? hlY + versatz * sc : hlY - versatz * sc;   // Auslöselinie nach dem Spiegeln
      const wp = (p) => { const y = p[1] + dy; return [p[0] + dx, exit ? 2 * hlY - y : y]; };
      const hd = (h) => (exit ? 180 - h : h);
      const tf = (p, h, k) => { const c = wp(p); return `translate(${f(c[0])} ${f(c[1])}) rotate(${f(hd(h))})${k ? ` scale(${k.toFixed(3)})` : ''}`; };
      const sbm = [1, 2, 5, 10, 20, 50].find(v => v * sc >= 50) || 50;
      const heads = (a, b) => {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
        const head = (p, sx, sy) => [[p[0], p[1]], [p[0] - sx * 8 - uy * 4, p[1] - sy * 8 + ux * 4], [p[0] - sx * 8 + uy * 4, p[1] - sy * 8 - ux * 4]].map(v => f(v[0]) + ',' + f(v[1])).join(' ');
        return [head(a, -ux, -uy), head(b, ux, uy), len > 2];
      };
      const dimOf = (a, b, k) => {
        const lv = rgt(B), sg = Math.sign(k);
        const pa = wp(add(a, lv, k)), pb = wp(add(b, lv, k));
        const mid = wp(add(add(a, lv, k + sg * 8), [b[0] - a[0], b[1] - a[1]], 0.5));
        const [h1, h2, ok] = heads(pa, pb);
        return { x1: f(pa[0]), y1: f(pa[1]), x2: f(pb[0]), y2: f(pb[1]), h1, h2, tx: f(mid[0]), ty: f(mid[1] + 4), anchor: sg < 0 ? 'end' : 'start', ok };
      };
      const bd = dimOf(hitch, Wx, kL);
      const pd = dimOf(side === 'vorne' ? nose : hitch, P, kR);
      const qa = wp(add(P, fwd(B), -36)), qb = wp(add(Pq, fwd(B), -36));
      const [qH1, qH2, qOk] = heads(qa, qb);
      // Beschriftung Seitenversatz: so weit hinter den Balken, dass sie die %-Angaben an den Enden nicht berührt
      const qtAt = k => wp(add(add(P, fwd(B), -50 - k), rgt(B), q / 2));
      const kastenText = (c, len, fs = 12) => { const w = len * fs * 0.58; return [c[0] - w / 2, c[1] - fs, c[0] + w / 2, c[1] + 4]; };
      const ueber = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
      const qe = [add(P, fwd(B), -8), add(P, fwd(B), -42), add(Pq, fwd(B), -8), add(Pq, fwd(B), -42)].map(wp);
      const qExt = `M ${f(qe[0][0])} ${f(qe[0][1])} L ${f(qe[1][0])} ${f(qe[1][1])} M ${f(qe[2][0])} ${f(qe[2][1])} L ${f(qe[3][0])} ${f(qe[3][1])}`;
      // Rechter Rand (rechts von x ≈ 450 zeichnet die Vorschau nie etwas): Maßpfeile für Vorgewendegröße (außen) und
      // Versatz der Auslösung (innen), die Werte links daneben; liegen die Werte zu nah, rückt die Vorgewendegröße weg
      const [hlH1, hlH2] = heads([498, edgeY], [498, hlY]);
      const vOn = versatz !== 0 && Math.abs(trigY - hlY) > 4;
      const [vH1, vH2] = vOn ? heads([487, hlY], [487, trigY]) : ['', ''];
      // Versatz-Wert zwischen den beiden Linien; ist der Abstand zu klein, daneben (nie auf einer Linie)
      const vLabY = Math.abs(trigY - hlY) >= 22 ? (hlY + trigY) / 2 + 4 : trigY + Math.sign(trigY - hlY || 1) * 14 + 4;
      // Vorgewendegröße mittig im Teil des Vorgewendes, den der Versatz-Pfeil nicht belegt; zu eng → über dem Feldrand
      const segBot = vOn && trigY > edgeY && trigY < hlY ? trigY : hlY;
      let hlLabY = segBot - edgeY >= 24 ? (edgeY + segBot) / 2 + 5 : edgeY - 8;
      if (vOn && Math.abs(hlLabY - vLabY) < 16) hlLabY = edgeY - 8;
      const C = add(hitch, rgt(A), R);
      const track = (X) => {
        if (!curve) return 'M 0 0';
        const r = Math.hypot(X[0] - C[0], X[1] - C[1]), c = Math.cos(rad(-75)), sn = Math.sin(rad(-75));
        const past = [C[0] + (X[0] - C[0]) * c - (X[1] - C[1]) * sn, C[1] + (X[0] - C[0]) * sn + (X[1] - C[1]) * c];
        const a = wp(past), b = wp(X);
        return `M ${f(a[0])} ${f(a[1])} A ${f(r)} ${f(r)} 0 0 ${exit ? 0 : 1} ${f(b[0])} ${f(b[1])}`;
      };
      const linkFrom = wp(side === 'vorne' ? nose : hitch), linkTo = wp(trailed && Lb > g.d ? Wx : P);
      const lab = (p) => wp(add(p, fwd(B), -18));
      const [d1, dm, d2] = [wp(a0), wp(Pq), wp(a1)];
      const [l1, lm, l2] = [lab(a0), lab(Pq), lab(a1)];
      const pctKaesten = [l1, lm, l2].map(p => kastenText(p, 7, 11));
      const latAbs = m2(Math.abs(s.lat));
      const qText = `Seitenversatz ${latAbs}`;
      let qt = qtAt(0);
      for (let k = 14; k <= 70 && pctKaesten.some(b => ueber(kastenText(qt, qText.length), b)); k += 14) qt = qtAt(k);
      const [cb1, cb2] = [wp(P), wp(Pq)];
      const act = wp(anchor);
      const st = curve ? (exit ? -28 : 28) : 0;
      const rotW = (k, cx, cy) => `rotate(${st * k} ${cx} ${cy})`;
      const sym = window.dashboardMapView?.vehicleSymbol || 'traktor';
      const trig = TRIG[this.view];
      // Ton für diese Richtung? (je Gerät: aus / beim Einfahren / beim Ausfahren / beides, Test 23.10.2026)
      // je Richtung Aktion und Ton (Anmerkung 20)
      const actOn = this.view === 'exit' ? L.exitAct : L.entryAct;
      const beepOn = this.gps?.beep && this.gps.beep !== 'aus' && (this.view === 'exit' ? L.exitBeep : L.entryBeep);
      const trigColor = (actOn && this.gps?.automatik !== false) || beepOn ? trig.color : '#6b7380';
      const autoAus = this.gps?.automatik === false;
      const vWert = `${versatz > 0 ? '+' : '−'}${String(Math.abs(versatz)).replace('.', ',')} m`;
      const trigLabel = actOn && !autoAus ? 'Auslösung ' + trig.title + (beepOn ? ' + Ton' : '') : beepOn ? trig.title + ': nur Ton' : (autoAus && actOn ? 'Auslöser aus (Vorgewendeautomatik aus)' : 'Auslöser aus');
      const vErkl = versatz === 0 ? 'an der Vorgewendelinie' : `${vWert}: ${versatz > 0 ? 'nach' : 'vor'} der Vorgewendelinie`;
      const show = on => (on ? 'inline' : 'none');
      return `<svg viewBox="0 0 520 600" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Moment der Auslösung mit Feldrand, Vorgewende, Maßen und Arbeitsbereich">
        <rect x="0" y="0" width="520" height="600" fill="#11161c"/>
        <rect x="20" y="${edgeY}" width="480" height="${600 - edgeY}" fill="#18241a"/>
        <rect x="20" y="${edgeY}" width="480" height="${hlY - edgeY}" fill="#f59e0b" fill-opacity="0.10"/>
        <line x1="28" y1="22" x2="62" y2="22" stroke="${trigColor}" stroke-width="2.5" stroke-dasharray="4 5"/>
        <text x="70" y="27" fill="${trigColor}" font-size="13" font-weight="700">${trigLabel}</text>
        <text x="70" y="46" fill="#c3c9d2" font-size="12">Auslösepunkt ${vErkl}</text>
        <line x1="20" y1="${edgeY}" x2="500" y2="${edgeY}" stroke="#c3c9d2" stroke-width="3"/>
        <text x="28" y="${edgeY - 10}" fill="#c3c9d2" font-size="13" font-weight="700">Feldrand</text>
        <line x1="20" y1="${hlY}" x2="500" y2="${hlY}" stroke="#f59e0b" stroke-width="2" stroke-dasharray="8 6"/>
        <text x="28" y="${edgeY + 20}" fill="#fbbf24" font-size="13" font-weight="700">Vorgewende</text>
        <line x1="498" y1="${edgeY}" x2="498" y2="${hlY}" stroke="#fbbf24" stroke-width="1.5"/>
        <polygon points="${hlH1}" fill="#fbbf24"/><polygon points="${hlH2}" fill="#fbbf24"/>
        <text x="${vOn ? 481 : 490}" y="${f(hlLabY)}" text-anchor="end" fill="#fbbf24" font-size="14" font-weight="700" stroke="#11161c" stroke-width="4" paint-order="stroke">${s.headland} m</text>
        <path d="${track(hitch)}" display="${show(curve)}" fill="none" stroke="#8b93a1" stroke-width="1.5" stroke-dasharray="3 5"/>
        <path d="${track(Wx)}" display="${show(curve && trailed)}" fill="none" stroke="#5c6470" stroke-width="1.5" stroke-dasharray="2 4"/>
        <path d="${track(Pq)}" display="${show(curve)}" fill="none" stroke="#8fd673" stroke-width="2" stroke-dasharray="6 5"/>
        <line x1="20" y1="${f(trigY)}" x2="500" y2="${f(trigY)}" stroke="${trigColor}" stroke-width="2.5" stroke-dasharray="4 5"/>
        <g display="${show(vOn)}">
          <line x1="487" y1="${f(hlY)}" x2="487" y2="${f(trigY)}" stroke="${trigColor}" stroke-width="1.5"/>
          <polygon points="${vH1}" fill="${trigColor}"/><polygon points="${vH2}" fill="${trigColor}"/>
          <text x="479" y="${f(vLabY)}" text-anchor="end" fill="${trigColor}" font-size="13" font-weight="700" stroke="#11161c" stroke-width="4" paint-order="stroke">${vWert}</text>
        </g>
        <g transform="${tf(Pq, B)}">
          <rect x="${-w / 2}" y="6" width="${w}" height="200" fill="#3a8cb0" fill-opacity="0.30" display="${show(!exit)}"/>
          <rect x="${-w / 2}" y="-6" width="${w}" height="12" rx="2" fill="#6cbf4d"/>
        </g>
        <line x1="${f(linkFrom[0])}" y1="${f(linkFrom[1])}" x2="${f(linkTo[0])}" y2="${f(linkTo[1])}" stroke="#8b93a1" stroke-width="4"/>
        <line x1="${f(cb1[0])}" y1="${f(cb1[1])}" x2="${f(cb2[0])}" y2="${f(cb2[1])}" stroke="#8b93a1" stroke-width="3"/>
        <g transform="${tf(Wx, B, ts)}" display="${show(trailed)}">
          <rect x="-11" y="-1.5" width="22" height="3" fill="#8b93a1"/><rect x="-14" y="-7" width="4.5" height="14" rx="1.5" fill="#5c6470"/><rect x="9.5" y="-7" width="4.5" height="14" rx="1.5" fill="#5c6470"/>
        </g>
        <g transform="${tf([0, 0], A, ts)}">${vehicleSvg(sym, rotW)}</g>
        <g display="${show(trailed && bd.ok)}">
          <line x1="${bd.x1}" y1="${bd.y1}" x2="${bd.x2}" y2="${bd.y2}" stroke="#b6bdc8" stroke-width="1.5"/>
          <polygon points="${bd.h1}" fill="#b6bdc8"/><polygon points="${bd.h2}" fill="#b6bdc8"/>
          <text x="${bd.tx}" y="${bd.ty}" text-anchor="${bd.anchor}" fill="#b6bdc8" font-size="12" font-weight="700" stroke="#11161c" stroke-width="4" paint-order="stroke">Deichsel ${m2(s.bar)}</text>
        </g>
        <g display="${show(pd.ok)}">
          <line x1="${pd.x1}" y1="${pd.y1}" x2="${pd.x2}" y2="${pd.y2}" stroke="#8fd673" stroke-width="1.5"/>
          <polygon points="${pd.h1}" fill="#8fd673"/><polygon points="${pd.h2}" fill="#8fd673"/>
          <text x="${pd.tx}" y="${pd.ty}" text-anchor="${pd.anchor}" fill="#8fd673" font-size="12" font-weight="700" stroke="#11161c" stroke-width="4" paint-order="stroke">Arbeitsbereich ${m2(s.pos)}</text>
        </g>
        <g display="${show(qOk)}">
          <path d="${qExt}" fill="none" stroke="#a78bfa" stroke-width="1" stroke-dasharray="3 3"/>
          <line x1="${f(qa[0])}" y1="${f(qa[1])}" x2="${f(qb[0])}" y2="${f(qb[1])}" stroke="#a78bfa" stroke-width="1.5"/>
          <polygon points="${qH1}" fill="#a78bfa"/><polygon points="${qH2}" fill="#a78bfa"/>
          <text x="${f(qt[0])}" y="${f(qt[1] + 4)}" text-anchor="middle" fill="#a78bfa" font-size="12" font-weight="700" stroke="#11161c" stroke-width="4" paint-order="stroke">${qText}</text>
        </g>
        <g>
          <circle cx="${f(d1[0])}" cy="${f(d1[1])}" r="4" fill="#e8ebee"/><circle cx="${f(dm[0])}" cy="${f(dm[1])}" r="4" fill="#e8ebee"/><circle cx="${f(d2[0])}" cy="${f(d2[1])}" r="4" fill="#e8ebee"/>
          <text x="${f(l1[0])}" y="${f(l1[1] + 4)}" text-anchor="middle" fill="#e8ebee" font-size="11" stroke="#11161c" stroke-width="3" paint-order="stroke">${level ? '' : '0 %'}</text>
          <text x="${f(lm[0])}" y="${f(lm[1] + 4)}" text-anchor="middle" fill="#e8ebee" font-size="11" stroke="#11161c" stroke-width="3" paint-order="stroke">${level ? '0–100 %' : '50 %'}</text>
          <text x="${f(l2[0])}" y="${f(l2[1] + 4)}" text-anchor="middle" fill="#e8ebee" font-size="11" stroke="#11161c" stroke-width="3" paint-order="stroke">${level ? '' : '100 %'}</text>
        </g>
        <circle cx="${f(act[0])}" cy="${f(act[1])}" r="7" fill="${trigColor}" stroke="#e8ebee" stroke-width="2"/>
        <line x1="28" y1="586" x2="${f(28 + sbm * sc)}" y2="586" stroke="#e8ebee" stroke-width="2"/>
        <line x1="28" y1="580" x2="28" y2="592" stroke="#e8ebee" stroke-width="2"/>
        <line x1="${f(28 + sbm * sc)}" y1="580" x2="${f(28 + sbm * sc)}" y2="592" stroke="#e8ebee" stroke-width="2"/>
        <text x="${f(28 + (sbm * sc) / 2)}" y="575" text-anchor="middle" fill="#e8ebee" font-size="12" font-weight="700" stroke="#11161c" stroke-width="3" paint-order="stroke">${sbm} m</text>
      </svg>`;
    }
  }

  // Fahrzeug-Draufsichten aus dem Mockup (Maßstab 10 px/m), Lenkräder drehen in der Kurve
  function vehicleSvg(sym, rotW) {
    if (sym === 'haecksler') sym = 'drescher';   // Häcksler entfällt (23.10.2026)
    const tire = (x, y, wd, ht, r = 2) => `<rect x="${x}" y="${y}" width="${wd}" height="${ht}" rx="${r}" fill="#2b3038" stroke="#6b7380" stroke-width="1"/>`;
    if (sym === 'drescher') return `${tire(-21, -30, 8, 22, 3)}${tire(13, -30, 8, 22, 3)}<g transform="${rotW(-1, -14, 14)}">${tire(-17, 8, 6, 12)}</g><g transform="${rotW(-1, 14, 14)}">${tire(11, 8, 6, 12)}</g>
      <rect x="-2" y="19" width="4" height="4" fill="#8b93a1"/><rect x="-13" y="-36" width="26" height="56" rx="4" fill="#e8ebee"/><rect x="-6" y="-41" width="12" height="5" rx="1" fill="#8b93a1"/>
      <rect x="-10" y="-38" width="20" height="12" rx="3" fill="#d1d6dd"/><rect x="-8" y="-37" width="16" height="3" rx="1" fill="#5c6470"/><rect x="-10" y="-22" width="20" height="22" rx="2" fill="#c3c9d2"/>
      <line x1="-10" y1="-11" x2="10" y2="-11" stroke="#9aa3ad" stroke-width="1"/><rect x="-8" y="5" width="16" height="12" rx="2" fill="#b6bdc8"/><rect x="-16" y="-20" width="3" height="34" rx="1.5" fill="#8b93a1"/>`;
    if (sym === 'pfeil') return `<line x1="0" y1="0" x2="0" y2="23" stroke="#8b93a1" stroke-width="3"/><polygon points="0,-41 18,12 0,2 -18,12" fill="#e8ebee" stroke="#11161c" stroke-width="1.5" stroke-linejoin="round"/>`;
    return `${tire(-14, -1, 5.5, 16)}${tire(8.5, -1, 5.5, 16)}<line x1="-10" y1="-21.5" x2="10" y2="-21.5" stroke="#6b7380" stroke-width="2"/>
      <g transform="${rotW(1, -10, -21.5)}">${tire(-12, -26, 4, 9, 1.5)}</g><g transform="${rotW(1, 10, -21.5)}">${tire(8, -26, 4, 9, 1.5)}</g>
      <rect x="-2.5" y="11" width="5" height="7" fill="#8b93a1"/><rect x="-6" y="-30" width="12" height="3" rx="1" fill="#8b93a1"/><rect x="-5" y="-28" width="10" height="22" rx="3.5" fill="#c3c9d2"/>
      <line x1="0" y1="-26" x2="0" y2="-9" stroke="#9aa3ad" stroke-width="1"/><circle cx="3" cy="-12" r="1.4" fill="#2b3038"/><rect x="-8" y="-7" width="16" height="18" rx="3" fill="#e8ebee"/>
      <rect x="-6.5" y="-6" width="13" height="3" rx="1" fill="#5c6470"/><rect x="-5.5" y="-1" width="11" height="10" rx="2" fill="#d1d6dd"/>`;
  }

  window.gpsMenu = new GpsMenu();
})();
