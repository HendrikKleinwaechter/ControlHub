/**
 * Einrichtungs-Assistent und Tour (23.10.2026; Server: server/einrichtung.js + server/routes/einrichtung.js).
 *
 * - Assistent: Fragen als Karte im Vollbild. Für Einstellungen öffnet er die echte Seite (Module, Achsen-Kalibrierung,
 *   Geräte-Einstellungen) und zeigt unten eine Leiste mit Erklärung und „Weiter“ -- nichts doppelt gebaut, und man
 *   lernt nebenbei, wo alles liegt. Läuft beim ersten Start (app.json einrichtung.fertig = false) und jederzeit über
 *   Einstellungen → Allgemein. Teil-Läufe nach einer Frage des Servers: neuer Controller (ab „Controller“), offene
 *   Kalibrierung (nur „Kalibrieren“). Der Fortschritt steht im sessionStorage und übersteht das Neuladen nach einem
 *   Spiel- oder Controller-Wechsel.
 * - Tour: Hervorhebung + Sprechblase auf der Startseite, zwei Mitmach-Schritte (Menü öffnen, Taste am Controller
 *   drücken -- ControlHub sieht den Tastendruck live über 'state-update').
 * - Ersetzt die frühere Erststart-Frage „Welches Spiel spielst du?“ (games.js zeigt sie nur noch, wenn es diesen
 *   Assistenten nicht gibt).
 */
const einrEsc = escapeHtml;   // js/basis.js (Durchsicht B9: vorher eigene Kopie)
const einrWarte = ms => new Promise(r => setTimeout(r, ms));
const EINR_SPEICHER = 'ch-einrichtung';

// Reihenfolge der Schritte je Lauf; welche davon gelten, entscheidet gilt() (Controller-Fähigkeiten, Verbindung, Spiel)
const EINR_TEILE = {
  alles: ['willkommen', 'spiel', 'controller', 'module', 'kalibrierung', 'einstellungen', 'spieldaten', 'tablet', 'fertig'],
  controller: ['controller', 'module', 'kalibrierung', 'einstellungen', 'fertig'],
  kalibrierung: ['kalibrierung', 'fertig']
};
// Schritte, die eine echte Seite öffnen (sonst Karte)
const EINR_SEITEN = { module: 'armlehnen-setup', kalibrierung: 'axis-calibration', einstellungen: 'settings' };
const EINR_NAMEN = { willkommen: 'Willkommen', spiel: 'Spiel', controller: 'Controller', module: 'Module', kalibrierung: 'Kalibrieren',
  einstellungen: 'Geräte-Einstellungen', spieldaten: 'Spieldaten', tablet: 'Tablet', fertig: 'Fertig' };

// Tour: ziel = Elemente, die hervorgehoben werden (gemeinsamer Rahmen), warte = Mitmach-Schritt
const EINR_TOUR = [
  { ziel: ['#tb-back', '#tb-home', '#tb-menu'], titel: 'Oben links',
    text: '<b>‹</b> geht den Weg zurück, den du gekommen bist. <b>⌂</b> bringt dich zur Startseite, <b>☰ Menü</b> öffnet das Menü.' },
  { ziel: ['#tb-center'], titel: 'Wo bin ich?',
    text: 'Hier steht, welche Seite du siehst. <b>‹ ›</b> blättern weiter, ein Tipp auf den Namen öffnet die Liste – auf der Startseite mit „Seite bearbeiten“ und „+ Neue Seite“.' },
  { ziel: ['#tb-status'], titel: 'Statusknopf',
    text: 'Controller, Profil und Uhrzeit auf einen Blick. Antippen: Controller verbinden, Profil wählen, Auto-Wechsel ein- und ausschalten.' },
  { ziel: ['#tab-dashboard-tiles'], titel: 'Kacheln',
    text: 'Die Startseite besteht aus Kacheln: Karte, Cockpit, Tasten und was du dir sonst einrichtest. Antippen öffnet eine Kachel groß, das Zahnrad stellt sie ein.' },
  { ziel: ['#tb-menu'], titel: 'Mach mal: Menü öffnen', text: 'Tippe auf <b>☰ Menü</b>.', warte: () => !!window.appNav?.menu },
  { ziel: ['#app-menu .tb-pop'], titel: 'Das Menü', vorher: () => { if (!window.appNav?.menu) window.appNav?.toggleMenu(true); },
    text: '<b>GPS</b> und <b>Arbeitsplaner</b> (mit Spieldaten), alle <b>Kacheln</b>, <b>Belegung</b> (Tasten, Funktionen, Makros, Achsen, Profile) und <b>Einstellungen</b>.' },
  { ziel: null, titel: 'Mach mal: Taste drücken', taste: true, vorher: () => window.appNav?.closeAll() },
  { ziel: null, titel: 'Das war’s',
    text: 'Was eine Taste tut, legst du unter <b>☰ → Belegung → Tastenbelegung</b> fest. Tour und Einrichtung kannst du jederzeit unter <b>☰ → Einstellungen → Allgemein</b> wiederholen.' }
];

class Einrichtung {
  constructor() {
    this.stand = null;          // GET /api/einrichtung
    this.lauf = null;           // { modus: 'einrichtung', teil, schritt, auto }
    this.tourLauf = null;       // { schritt }
    this.verbunden = false;
    this.spieldaten = false;    // kommen gerade Spieldaten? ('telemetry-update' available)
    this.taste = null;          // letzter Tastendruck in der Tour
    this.frageOffen = false;
    this.socket = window.hubSocket;   // gemeinsame Verbindung der Seite (hubSocket.js, B4)
    this.socket.on('einrichtung-vorschlag', v => this.frage(v));
    this.socket.on('einrichtung-geaendert', () => this.laden(true));
    this.socket.on('serialStatus', s => { this.verbunden = !!s?.connected; this.neuZeichnen(); });
    this.socket.on('telemetry-update', d => { const an = !!d?.available; if (an !== this.spieldaten) { this.spieldaten = an; this.neuZeichnen(); } });
    this.socket.on('state-update', d => this.tasteGedrueckt(d));
    document.addEventListener('controllerinfo', () => this.neuZeichnen());
    document.addEventListener('tabchanged', () => { if (this.lauf && EINR_SEITEN[this.lauf.schritt]) this.leisteZeichnen(); });
    document.addEventListener('kalibrierung-stand', e => { if (this.stand) { this.stand.kalibrierung = e.detail; this.neuZeichnen(); } });
    document.addEventListener('mod-status-neu', () => { this.modStand = undefined; this.neuZeichnen(); });   // „Mod installieren“
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && this.tourLauf && !document.querySelector('.ui-dialog')) this.tourEnde(); });
    window.addEventListener('resize', () => this.tourPlatzieren());
  }

  // ---------- Start ----------
  async init() {
    await this.laden();
    // Erst den App-Start abwarten, sonst überschreibt die Startseite gleich wieder die Seite eines Schritts
    for (let i = 0; i < 30 && !window.appNav?.ready; i++) await einrWarte(100);
    const gemerkt = this.lesen();
    if (gemerkt?.modus === 'einrichtung' && EINR_TEILE[gemerkt.teil]) { this.lauf = gemerkt; this.zeigen(); return; }
    if (gemerkt?.modus === 'tour') { this.tour(gemerkt.schritt); return; }
    if (this.stand && !this.stand.fertig) { this.start('alles', true); return; }
    if (this.stand && !this.stand.spielGewaehlt) { await window.gameSwitcher?.load(); window.gameSwitcher?.showFirstStart(); return; }
    if (this.stand?.vorschlag) this.frage(this.stand.vorschlag);
  }

  async laden(vonAussen = false) {
    try {
      const d = await (await fetch('/api/einrichtung')).json();
      if (!d.success) return;
      this.stand = d;
      this.verbunden = d.verbunden;
    } catch { return; }
    // Ersteinrichtung auf einem anderen Gerät abgeschlossen: den automatisch geöffneten Assistenten hier schließen
    if (vonAussen && this.stand.fertig && this.lauf?.auto) this.schliessen();
    this.neuZeichnen();
  }

  lesen() { try { return JSON.parse(sessionStorage.getItem(EINR_SPEICHER) || 'null'); } catch { return null; } }
  merken(v) { try { if (v) sessionStorage.setItem(EINR_SPEICHER, JSON.stringify(v)); else sessionStorage.removeItem(EINR_SPEICHER); } catch { /* privat */ } }

  async post(url, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const d = await res.json();
    if (!d.success) throw new Error(d.error || 'Unbekannter Fehler');
    return d;
  }

  // ---------- Assistent: Ablauf ----------
  get kann() { return window.controllerInfo?.profile?.kann || this.stand?.controller?.kann || {}; }
  get ctrlName() { return window.controllerInfo?.profile?.name || this.stand?.controller?.name || 'Controller'; }

  gilt(id) {
    switch (id) {
      case 'module': return !!this.kann.module;
      case 'kalibrierung': return !!this.kann.kalibrierung && this.verbunden;
      case 'einstellungen': return !!this.kann.einstellungen && this.verbunden;
      case 'spieldaten': return !!window.gameSwitcher?.activeGame?.telemetry;
      default: return true;
    }
  }
  get schritte() { return EINR_TEILE[this.lauf.teil].filter(id => id === this.lauf.schritt || this.gilt(id)); }
  nachbar(d) {
    const alle = EINR_TEILE[this.lauf.teil];
    for (let i = alle.indexOf(this.lauf.schritt) + d; i >= 0 && i < alle.length; i += d) if (this.gilt(alle[i])) return alle[i];
    return null;
  }

  start(teil = 'alles', auto = false) {
    this.tourEnde(true);
    window.appNav?.closeAll();
    this.lauf = { modus: 'einrichtung', teil, schritt: EINR_TEILE[teil].find(id => this.gilt(id)), auto };
    this.zeigen();
  }

  async zeigen() {
    this.merken(this.lauf);
    const tab = EINR_SEITEN[this.lauf.schritt];
    if (tab) {
      this.karteWeg();
      if (window.appNav?.tab !== tab) await window.app?.navigateToTab(tab);
      this.leisteZeichnen();
    } else {
      this.leisteWeg();
      this.karteZeichnen();
    }
    if (this.lauf?.schritt === 'kalibrierung' || this.lauf?.schritt === 'fertig') this.kalibrierungLaden();
  }

  weiter() { const n = this.nachbar(1); if (n) { this.lauf.schritt = n; this.zeigen(); } else this.abschliessen(); }
  zurueck() { const n = this.nachbar(-1); if (n) { this.lauf.schritt = n; this.zeigen(); } }

  async beenden() {
    const ok = await uiConfirm('Einrichtung beenden? Du kannst sie jederzeit unter ☰ Menü → Einstellungen → Allgemein wieder starten.',
      { title: 'Einrichtung', ok: 'Beenden', cancel: 'Weitermachen' });
    if (ok) this.abschliessen();
  }

  async abschliessen({ tour = false } = {}) {
    try { await this.post('/api/einrichtung/fertig'); } catch (e) { console.warn('Einrichtung nicht gespeichert:', e); }
    this.schliessen();
    if (window.gameSwitcher && !window.gameSwitcher.chosen) window.gameSwitcher.showFirstStart();   // „Ohne Assistent“ vor der Spielwahl
    else if (tour) this.tour();
    else window.appNav?.home();
  }

  schliessen() {
    this.lauf = null;
    this.merken(null);
    this.karteWeg();
    this.leisteWeg();
  }

  async kalibrierungLaden() {
    try {
      const d = await (await fetch('/api/einrichtung/kalibrierung')).json();
      if (d.success && this.stand) this.stand.kalibrierung = d.kalibrierung;
    } catch { /* letzter Stand */ }
    this.neuZeichnen();
  }

  neuZeichnen() {
    if (this.lauf) { if (EINR_SEITEN[this.lauf.schritt]) this.leisteZeichnen(); else this.karteZeichnen(); }
    if (this.tourLauf) this.tourZeichnen();
  }

  // ---------- Assistent: Zeichnen ----------
  kopf() {
    const s = this.schritte;
    const i = s.indexOf(this.lauf.schritt);
    const titel = this.lauf.teil === 'alles' ? 'Einrichtung' : this.lauf.teil === 'controller' ? 'Controller einrichten' : 'Kalibrieren';
    return { text: `${titel} · Schritt ${i + 1} von ${s.length}`, pct: Math.round(((i + 1) / s.length) * 100) };
  }

  fuss(inhalt) {
    const zurueck = this.nachbar(-1) ? '<button type="button" class="btn-secondary" onclick="window.einrichtung.zurueck()">‹ Zurück</button>' : '';
    const extra = inhalt.extra || '';
    const weiter = inhalt.weiter === false ? '' : `<button type="button" class="btn-primary" onclick="window.einrichtung.weiter()">${einrEsc(inhalt.weiter || 'Weiter')} ›</button>`;
    return `<div class="einr-fuss">${zurueck}<span class="einr-fuss-platz"></span>${extra}${weiter}</div>`;
  }

  karteZeichnen() {
    if (!this.lauf) return;
    const inhalt = this[`karte_${this.lauf.schritt}`]?.() || { titel: '', html: '' };
    let el = document.getElementById('einr-karte');
    if (!el) {
      el = document.createElement('div');
      el.id = 'einr-karte';
      el.className = 'einr-overlay';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-labelledby', 'einr-titel');
      document.body.appendChild(el);
    }
    const k = this.kopf();
    el.innerHTML = `<div class="einr-karte">
        <div class="einr-kopf"><span class="einr-kicker">${einrEsc(k.text)}</span>
          <button type="button" class="einr-x" aria-label="Einrichtung beenden" onclick="window.einrichtung.beenden()">✕</button></div>
        <div class="einr-fortschritt"><span style="width: ${k.pct}%"></span></div>
        <h2 id="einr-titel">${einrEsc(inhalt.titel)}</h2>
        <div class="einr-inhalt">${inhalt.html}</div>
        ${this.fuss(inhalt)}
      </div>`;
  }
  karteWeg() { document.getElementById('einr-karte')?.remove(); }

  leisteZeichnen() {
    if (!this.lauf) return;
    const id = this.lauf.schritt;
    const inhalt = this[`leiste_${id}`]?.() || { titel: '', html: '' };
    let el = document.getElementById('einr-leiste');
    if (!el) {
      el = document.createElement('div');
      el.id = 'einr-leiste';
      el.className = 'einr-leiste';
      el.setAttribute('role', 'region');
      el.setAttribute('aria-label', 'Einrichtung');
      document.body.appendChild(el);
    }
    const k = this.kopf();
    const tab = EINR_SEITEN[id];
    const woanders = tab && window.appNav?.tab && window.appNav.tab !== tab;
    el.innerHTML = `
      <div class="einr-fortschritt"><span style="width: ${k.pct}%"></span></div>
      <div class="einr-leiste-innen">
        <div class="einr-leiste-text">
          <div class="einr-kopf"><span class="einr-kicker">${einrEsc(k.text)} · ${einrEsc(EINR_NAMEN[id])}</span>
            <button type="button" class="einr-x" aria-label="Einrichtung beenden" onclick="window.einrichtung.beenden()">✕</button></div>
          <b class="einr-leiste-titel">${einrEsc(inhalt.titel)}</b>
          <div>${inhalt.html}</div>
          ${inhalt.wo ? `<small class="einr-wo">Findest du später unter ${einrEsc(inhalt.wo)}</small>` : ''}
        </div>
        ${this.fuss({ ...inhalt, extra: woanders ? `<button type="button" class="btn-secondary" onclick="window.app.navigateToTab('${tab}')">Zur Seite „${einrEsc(EINR_NAMEN[id])}“</button>` : '' })}
      </div>`;
    document.body.classList.add('einr-mit-leiste');
    document.documentElement.style.setProperty('--einr-leiste-h', `${el.offsetHeight}px`);
  }
  leisteWeg() {
    document.getElementById('einr-leiste')?.remove();
    document.body.classList.remove('einr-mit-leiste');
  }

  // ---------- Assistent: Inhalte ----------
  karte_willkommen() {
    return {
      titel: 'Willkommen bei ControlHub',
      html: `<p>In ein paar Schritten richten wir alles ein:</p>
        <ul class="einr-liste"><li>dein <b>Spiel</b></li><li>deinen <b>Controller</b> mit seinen Modulen</li>
          <li>die <b>Kalibrierung</b> der Achsen und die Geräte-Einstellungen</li><li>das <b>Tablet</b></li></ul>
        <p class="einr-klein">Jeder Schritt lässt sich überspringen. Alles findest du später auch unter ☰ Menü → Einstellungen.</p>`,
      extra: '<button type="button" class="einr-link" onclick="window.einrichtung.abschliessen()">Ohne Assistent starten</button>',
      weiter: 'Los geht’s'
    };
  }

  karte_spiel() {
    const gs = window.gameSwitcher;
    const games = gs?.games || [];
    const gewaehlt = this.stand?.spielGewaehlt;
    const knopf = g => `<button type="button" class="einr-wahl ${gewaehlt && g.id === gs.active ? 'on' : ''}" onclick="window.einrichtung.spielWaehlen('${einrEsc(g.id)}')">
        <b>${einrEsc(g.name)}</b><small>${g.telemetry ? 'mit Spieldaten: Werte, Karte, Arbeitsplaner, GPS' : 'eigenes Spiel, ohne Spieldaten'}</small>
        <span class="einr-wahl-haken">${gewaehlt && g.id === gs.active ? '✓' : ''}</span></button>`;
    return {
      titel: 'Welches Spiel spielst du?',
      html: `<p>Jedes Spiel hat eigene Profile, Belegungen, Makros und Kacheln.</p>
        <div class="einr-wahlen">${games.map(knopf).join('') || '<p class="einr-klein">Spiele werden geladen …</p>'}
          <button type="button" class="einr-wahl" onclick="window.einrichtung.eigenesSpiel()"><b>Anderes Spiel …</b><small>z. B. Truck- oder Flugsimulator: Tasten, Makros und eigene Kacheln, nur ohne Spieldaten</small><span class="einr-wahl-haken"></span></button>
        </div>
        <p class="einr-klein">Wechseln kannst du später jederzeit unter Einstellungen → Allgemein.</p>`,
      weiter: gewaehlt ? 'Weiter' : false
    };
  }

  async spielWaehlen(id) {
    if (id === window.gameSwitcher?.active && this.stand?.spielGewaehlt) { this.weiter(); return; }
    // Der Wechsel lädt die Seite neu -- danach geht es beim nächsten Schritt weiter
    const vorher = this.lauf.schritt;
    this.lauf.schritt = this.nachbar(1) || vorher;
    this.merken(this.lauf);
    try {
      await this.post('/api/games/switch', { id });
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      this.lauf.schritt = vorher;
      this.merken(this.lauf);
      uiAlert('Wechsel nicht möglich: ' + e.message);
    }
  }

  async eigenesSpiel() {
    const name = await uiPrompt('Für jedes andere Spiel legst du ein eigenes an. Es hat eigene Profile, Belegungen und Makros, nur ohne Spieldaten (Karte, GPS, Arbeitsplaner).',
      '', { title: 'Anderes Spiel', placeholder: 'z. B. Truck-Simulator', ok: 'Anlegen' });
    if (!name?.trim()) return;
    const vorher = this.lauf.schritt;
    this.lauf.schritt = this.nachbar(1) || vorher;
    this.merken(this.lauf);
    try {
      await this.post('/api/games', { name: name.trim(), switch: true });
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      this.lauf.schritt = vorher;
      this.merken(this.lauf);
      uiAlert('Anlegen nicht möglich: ' + e.message);
    }
  }

  karte_controller() {
    const fw = window.controllerInfo?.info?.firmware || this.stand?.controller?.firmware;
    const neu = this.lauf.teil === 'controller';
    const status = this.verbunden
      ? `<div class="einr-status ok"><span class="sw-dot on"></span><span><b>${einrEsc(this.ctrlName)}</b> ist verbunden${fw ? ` · Firmware ${einrEsc(fw)}` : ''}</span></div>`
      : '<div class="einr-status"><span class="sw-dot"></span><span>Noch kein Controller verbunden</span></div>';
    const text = this.verbunden
      ? (neu ? `<p>Jetzt richten wir ihn ein: welche Module er hat${this.kann.kalibrierung ? ', die Kalibrierung der Achsen und die Geräte-Einstellungen' : ''}. Das dauert ein paar Minuten.</p>`
        : '<p>ControlHub hat ihn erkannt. Sein Name steht ab jetzt oben rechts im Statusknopf.</p>')
      : `<p>Steck deinen Controller (CraftConsole, CraftLink …) per USB an den PC. ControlHub findet ihn meist von selbst; sonst hilft „Automatisch erkennen“ – ein kleiner Assistent fürs Ab- und Anstecken.</p>
        <p><button type="button" class="btn-primary" onclick="window.connectionWizard.open()">Automatisch erkennen</button></p>
        <p class="einr-klein">Kein Controller zur Hand? Mit „Ohne Controller weiter“ geht es trotzdem; verbinden kannst du später über den Statusknopf oben rechts.</p>`;
    return {
      titel: neu ? `Neuer Controller: ${this.ctrlName}` : 'Controller anschließen',
      html: status + text,
      weiter: this.verbunden ? 'Weiter' : 'Ohne Controller weiter'
    };
  }

  leiste_module() {
    const mods = window.controllerInfo?.modules || [];
    const liste = mods.map(m => `${einrEsc(m.name)}${m.setupLabel ? ` <small>(${einrEsc(m.setupLabel)})</small>` : ''}`).join(' · ');
    const cc = (window.controllerInfo?.vorlagen || []).length > 0;
    return {
      titel: 'Module wählen',
      html: (cc ? '<p>Oben die <b>Farbe</b> deiner Armlehne wählen (Grau oder Schwarz, nur für die Bilder). Module am schnellsten mit einer <b>Vorlage</b> (Pro, Comfort, Plus, Mini) oder mit <b>„Erkennen“</b> und dann „Übernehmen“. Bei jedem CraftSlot stellst du <b>Unterbau und Griff</b> ein – danach richten sich die Tasten in der Tastenbelegung.</p>'
        : '<p>Schalte ein, was angeschlossen ist. Bei einer CraftUnit wählst du Unterbau und Griff.</p>')
        + `<div class="einr-status-zeile">${liste ? `Gewählt: ${liste}` : 'Noch keine Module gewählt.'}</div>`,
      wo: 'Einstellungen → Controller → Module'
    };
  }

  kalibrierChips() {
    const g = (this.stand?.kalibrierung || []).filter(x => x.noetig);
    if (!g.length) return { html: '', offen: 0, bekannt: false };
    const bekannt = g.some(x => x.fertig !== null);
    const offen = g.filter(x => x.fertig === false).length;
    const chip = x => `<span class="einr-chip ${x.fertig ? 'ok' : x.fertig === false ? 'offen' : ''}">${x.fertig ? '✓' : x.fertig === false ? '○' : ''} ${einrEsc(x.label)}</span>`;
    return { html: `<div class="einr-chips">${g.map(chip).join('')}</div>`, offen, bekannt, gesamt: g.length };
  }

  leiste_kalibrierung() {
    const c = this.kalibrierChips();
    const fertig = c.bekannt && c.offen === 0;
    return {
      titel: fertig ? 'Alle Achsen deiner Module sind kalibriert' : 'Achsen kalibrieren',
      html: (fertig
        ? '<p>Neu kalibrieren musst du nur, wenn eine Achse in Ruhe nicht in der Mitte steht oder nicht bis zum Anschlag reicht.</p>'
        : '<p>ControlHub lernt die Mitte und die Anschläge jeder Achse. Je Achse: <b>loslassen</b> → „Kalibrieren“ → bis an alle Anschläge bewegen → wieder <b>loslassen</b> → „Speichern“.</p>')
        + c.html,
      weiter: fertig || !c.bekannt ? 'Weiter' : 'Überspringen',
      wo: 'Einstellungen → Controller → Achsen-Kalibrierung'
    };
  }

  leiste_einstellungen() {
    return {
      titel: 'Geräte-Einstellungen',
      html: '<p>Wie reagieren die Achsen? Totbereich, Empfindlichkeit und Auslöseschwelle je Achse, dazu der Schalter am CraftDeck. Die Standardwerte passen meistens – ändern kannst du alles jederzeit. Jede Änderung speichert die Armlehne sofort.</p>',
      wo: 'Einstellungen → Controller → Geräte-Einstellungen'
    };
  }

  karte_spieldaten() {
    const g = window.gameSwitcher?.activeGame;
    const ls25 = g?.telemetry === 'fs25';
    // Mod-Zustand einmal laden (25.10.2026, „Mod installieren“), danach neu zeichnen
    if (ls25 && this.modStand === undefined && window.modInstall) {
      this.modStand = null;
      window.modInstall.laden().then(st => { this.modStand = st; this.neuZeichnen(); });
    }
    const status = this.spieldaten
      ? '<div class="einr-status ok"><span class="sw-dot on"></span><span><b>Spieldaten kommen an</b></span></div>'
      : '<div class="einr-status"><span class="sw-dot"></span><span>Wartet auf das Spiel …</span></div>';
    return {
      titel: `Spieldaten aus ${g?.name || 'dem Spiel'}`,
      html: `<p>Für Werte, Karte, Arbeitsplaner und GPS braucht das Spiel eine kleine Mod. Sie liest nur Werte aus und löst selbst nichts im Spiel aus.</p>
        ${ls25 ? `<ol class="einr-liste"><li>Die Mod in den Mod-Ordner des Spiels bringen: mit dem Knopf unten, oder von Hand <b>FS25_CraftConsoleHUD.zip</b> (im ControlHub-Ordner unter <code>Mod</code>) nach <code>Dokumente\\My Games\\FarmingSimulator2025\\mods</code> kopieren. Nicht entpacken, nur eine Fassung.</li>
          <li>Das Spiel starten und beim Laden des Spielstands die Mod aktivieren.</li></ol>
          <div class="einr-mod">${window.modInstall ? window.modInstall.html(this.modStand) : ''}</div>` : ''}
        ${status}
        <p class="einr-klein">Ohne Mod funktionieren Belegung, Makros und eigene Kacheln trotzdem. Du kannst das auch später erledigen (Handbuch, Kapitel 2.4).</p>`,
      weiter: this.spieldaten ? 'Weiter' : 'Später erledigen'
    };
  }

  karte_tablet() {
    const amPc = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(location.hostname);
    const adressen = this.stand?.adressen || [];
    const liste = adressen.length ? `<div class="einr-adressen">${adressen.map(a => `<code>${einrEsc(a)}</code>`).join('')}</div>`
      : '<p>Die Adresse steht im schwarzen Fenster von ControlHub (z. B. <code>http://192.168.178.20:3000</code>).</p>';
    return {
      titel: 'ControlHub auf dem Tablet',
      html: (amPc
        ? `<p>Öffne auf dem Tablet den Browser und gib diese Adresse ein. Tablet und PC müssen im selben WLAN sein.</p>${liste}`
        : `<div class="einr-status ok"><span class="sw-dot on"></span><span>Du nutzt ControlHub schon auf diesem Gerät (<b>${einrEsc(location.host)}</b>).</span></div>
           <p>Weitere Geräte erreichen ControlHub unter derselben Adresse.</p>`)
        + `<ul class="einr-liste"><li>Als <b>Lesezeichen</b> oder mit „<b>Zum Startbildschirm hinzufügen</b>“ speichern.</li>
          <li><b>Vollbild</b> und „<b>Bildschirm wach halten</b>“: Einstellungen → Allgemein.</li></ul>`
    };
  }

  karte_fertig() {
    const zeile = (ok, text) => `<li class="${ok === true ? 'ok' : ok === false ? 'offen' : ''}"><span class="einr-check-icon">${ok === true ? '✓' : ok === false ? '○' : '–'}</span><span>${text}</span></li>`;
    const g = window.gameSwitcher?.activeGame;
    const mods = (window.controllerInfo?.modules || []).map(m => m.name);
    const c = this.kalibrierChips();
    const zeilen = [];
    if (this.lauf.teil === 'alles') zeilen.push(zeile(!!this.stand?.spielGewaehlt, `Spiel: <b>${einrEsc(g?.name || '–')}</b>`));
    if (this.lauf.teil !== 'kalibrierung') {
      zeilen.push(zeile(this.verbunden, this.verbunden ? `Controller: <b>${einrEsc(this.ctrlName)}</b> verbunden` : 'Controller: noch nicht verbunden'));
      if (this.kann.module) zeilen.push(zeile(mods.length > 0, `Module: ${mods.length ? einrEsc(mods.join(', ')) : 'keine gewählt'}`));
    }
    if (c.bekannt) zeilen.push(zeile(c.offen === 0, `Kalibrierung: ${c.gesamt - c.offen} von ${c.gesamt} Achsen`));
    if (this.lauf.teil === 'alles' && g?.telemetry) zeilen.push(zeile(this.spieldaten, this.spieldaten ? 'Spieldaten kommen an' : 'Spieldaten: noch nicht (Mod, Kapitel 2.4)'));
    const tour = this.lauf.teil === 'alles';
    return {
      titel: 'Fertig eingerichtet',
      html: `<ul class="einr-check">${zeilen.join('')}</ul>
        <p class="einr-klein">Einrichtung und Tour kannst du jederzeit unter ☰ Menü → Einstellungen → Allgemein wiederholen.</p>`,
      extra: tour ? '<button type="button" class="btn-secondary" onclick="window.einrichtung.abschliessen({ tour: true })">Kurze Tour starten</button>' : '',
      weiter: 'Fertig'
    };
  }

  // ---------- Fragen des Servers ----------
  async frage(v) {
    if (!v || this.lauf || this.tourLauf || this.frageOffen) return;
    this.frageOffen = true;
    const ok = v.grund === 'neu'
      ? await uiConfirm(`${v.name} ist zum ersten Mal an diesem ControlHub. Jetzt einrichten? Der Assistent führt in ein paar Minuten durch Module, Kalibrierung und Einstellungen.`,
        { title: 'Neuer Controller', ok: 'Einrichten', cancel: 'Nein, danke' })
      : await uiConfirm(`Noch nicht kalibriert: ${(v.offen || []).join(', ')}. Jetzt kalibrieren? Das dauert je Achse etwa eine halbe Minute.`,
        { title: 'Kalibrierung', ok: 'Kalibrieren', cancel: 'Nein, danke' });
    this.frageOffen = false;
    try { await this.post(`/api/einrichtung/vorschlag/${ok ? 'ja' : 'nein'}`); } catch { /* egal */ }
    if (ok) this.start(v.grund === 'neu' ? 'controller' : 'kalibrierung');
  }

  // ---------- Tour ----------
  async tour(schritt = 0) {
    if (this.lauf) this.schliessen();
    this.tourLauf = { schritt: Math.max(0, Math.min(EINR_TOUR.length - 1, Number(schritt) || 0)) };
    this.merken({ modus: 'tour', schritt: this.tourLauf.schritt });
    window.appNav?.closeAll();
    if (!window.tilePages?.home) { await window.appNav?.home(); await einrWarte(400); }
    this.tourZeigen();
    clearInterval(this.tourTimer);
    this.tourTimer = setInterval(() => this.tourTakt(), 250);
  }

  async tourZeigen() {
    const s = EINR_TOUR[this.tourLauf.schritt];
    this.taste = null;
    s.vorher?.();
    if (s.taste) { try { this.tastenNamen = (await window.moduleFlow?.loadButtonLabels?.()) || {}; } catch { this.tastenNamen = {}; } }
    this.merken({ modus: 'tour', schritt: this.tourLauf.schritt });
    this.tourZeichnen();
    setTimeout(() => this.tourPlatzieren(), 50);
  }

  tourTakt() {
    if (!this.tourLauf) return;
    const s = EINR_TOUR[this.tourLauf.schritt];
    if (s.warte?.() && !this.tourWeiterGeplant) {
      this.tourWeiterGeplant = true;
      setTimeout(() => { this.tourWeiterGeplant = false; this.tourWeiter(); }, 500);
    }
    this.tourPlatzieren();
  }

  tourWeiter() {
    if (!this.tourLauf) return;
    if (this.tourLauf.schritt >= EINR_TOUR.length - 1) { this.tourEnde(); return; }
    this.tourLauf.schritt++;
    this.tourZeigen();
  }
  tourZurueck() {
    if (!this.tourLauf || this.tourLauf.schritt === 0) return;
    this.tourLauf.schritt--;
    this.tourZeigen();
  }

  tourEnde(still = false) {
    if (!this.tourLauf) return;
    clearInterval(this.tourTimer);
    this.tourLauf = null;
    this.merken(null);
    document.getElementById('einr-spot')?.remove();
    document.getElementById('einr-blase')?.remove();
    if (!still) window.appNav?.closeAll();
  }

  tourZeichnen() {
    if (!this.tourLauf) return;
    const i = this.tourLauf.schritt;
    const s = EINR_TOUR[i];
    let blase = document.getElementById('einr-blase');
    if (!blase) {
      blase = document.createElement('div');
      blase.id = 'einr-blase';
      blase.className = 'einr-blase';
      blase.setAttribute('role', 'dialog');
      blase.setAttribute('aria-live', 'polite');
      document.body.appendChild(blase);
    }
    let text = s.text || '';
    if (s.taste) {
      text = this.verbunden
        ? 'Drück eine Taste an deinem Controller. ControlHub sieht jeden Tastendruck sofort.'
        : 'Sobald dein Controller verbunden ist, zeigt ControlHub hier jeden Tastendruck an. Gerade ist keiner verbunden – einfach weiter.';
      if (this.taste) {
        const t = this.taste;
        text = `<div class="einr-taste"><b>Taste ${t.nr}</b>${t.modul ? ` · ${einrEsc(t.modul)}` : ''}<br>${t.name ? `belegt mit „${einrEsc(t.name)}“` : 'noch frei'}</div>Drück ruhig noch eine.`;
      }
    }
    const letzter = i === EINR_TOUR.length - 1;
    blase.innerHTML = `
      <div class="einr-kopf"><span class="einr-kicker">Tour · ${i + 1} von ${EINR_TOUR.length}</span>
        <button type="button" class="einr-x" aria-label="Tour beenden" onclick="window.einrichtung.tourEnde()">✕</button></div>
      <b class="einr-leiste-titel">${einrEsc(s.titel)}</b>
      <div class="einr-blase-text">${text}</div>
      <div class="einr-fuss">${i > 0 ? '<button type="button" class="btn-secondary btn-small" onclick="window.einrichtung.tourZurueck()">‹</button>' : ''}
        <span class="einr-fuss-platz"></span>
        <button type="button" class="btn-primary btn-small" onclick="window.einrichtung.tourWeiter()">${letzter ? 'Fertig' : s.warte ? 'Überspringen ›' : 'Weiter ›'}</button></div>`;
    this.tourPlatzieren();
  }

  // Rahmen um die Ziel-Elemente, Blase darunter bzw. darüber; ohne Ziel mittig unten
  tourPlatzieren() {
    if (!this.tourLauf) return;
    const s = EINR_TOUR[this.tourLauf.schritt];
    const blase = document.getElementById('einr-blase');
    if (!blase) return;
    const rects = (s.ziel || []).map(sel => document.querySelector(sel)).filter(el => el && el.offsetParent !== null).map(el => el.getBoundingClientRect());
    let spot = document.getElementById('einr-spot');
    if (!spot) {
      spot = document.createElement('div');
      spot.id = 'einr-spot';
      spot.className = 'einr-spot';
      document.body.appendChild(spot);
    }
    const vw = window.innerWidth, vh = window.innerHeight, bw = Math.min(380, vw - 24), bh = blase.offsetHeight;
    blase.style.width = `${bw}px`;
    if (!rects.length) {
      spot.classList.add('leer');
      blase.style.left = `${Math.round((vw - bw) / 2)}px`;
      blase.style.top = `${Math.round(Math.max(12, (vh - bh) / 2))}px`;
      return;
    }
    spot.classList.remove('leer');
    const pad = 6;
    const r = {
      left: Math.max(4, Math.min(...rects.map(x => x.left)) - pad), top: Math.max(4, Math.min(...rects.map(x => x.top)) - pad),
      right: Math.min(vw - 4, Math.max(...rects.map(x => x.right)) + pad), bottom: Math.min(vh - 4, Math.max(...rects.map(x => x.bottom)) + pad)
    };
    Object.assign(spot.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.right - r.left}px`, height: `${r.bottom - r.top}px` });
    const mitte = (r.left + r.right) / 2;
    blase.style.left = `${Math.round(Math.max(12, Math.min(mitte - bw / 2, vw - bw - 12)))}px`;
    if (vh - r.bottom >= bh + 24) blase.style.top = `${Math.round(r.bottom + 12)}px`;
    else if (r.top >= bh + 24) blase.style.top = `${Math.round(r.top - bh - 12)}px`;
    else blase.style.top = `${Math.round(vh - bh - 16)}px`;   // großes Ziel (Kacheln): Blase unten über dem Ziel
  }

  // Mitmach-Schritt „Taste drücken“: Nummer, Modul und Belegung der zuletzt gedrückten Taste
  tasteGedrueckt(d) {
    if (!this.tourLauf || !EINR_TOUR[this.tourLauf.schritt].taste) return;
    const ids = d?.events?.buttonDown || [];
    if (!ids.length) return;
    const nr = ids[ids.length - 1] + 1;   // Ereignisse sind 0-basiert, angezeigt wird ab 1
    const mod = (window.moduleFlow?.modules || []).find(m => Array.isArray(m.buttons) ? m.buttons.includes(nr) : (m.buttonRange && nr >= m.buttonRange[0] && nr <= m.buttonRange[1]));
    this.taste = { nr, modul: mod?.name || '', name: this.tastenNamen?.[nr] || '' };
    this.tourZeichnen();
  }
}

window.einrichtung = new Einrichtung();
document.addEventListener('DOMContentLoaded', () => { setTimeout(() => window.einrichtung.init(), 0); });
