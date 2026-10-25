/**
 * ActionPicker: einheitliche Zuordnungs-Oberfläche für eine Bedienpanel-Taste (steuerungsmenues.js)
 * oder einen Makro-Schritt (vorgewende.js) -- ersetzt die bisher getrennten Wege "Funktion zuordnen"
 * (PanelFunctionPicker) und "Schnellbelegung" (SM_KEYCODE_TO_NAME-Erfassung, vormals in
 * steuerungsmenues.js).
 *
 * Ablauf: erst ein Modus-Menü (Funktion/Achse/Taste), danach der passende Bildschirm. Jeder Aufrufer
 * bekommt über onSelect(result) ein normalisiertes Ergebnis zurück und entscheidet selbst, wie es
 * gespeichert wird (steuerungsmenues.js persistiert sofort per PUT, vorgewende.js schreibt nur in den
 * Entwurf -- gespeichert wird erst über den bestehenden "Speichern"-Button):
 *   { mode: 'function', functionId, label }
 *   { mode: 'axis', quickActions: [{type:'axis', axisId, value}], durationSeconds, label }
 *   { mode: 'keys', quickActions: [{type:'keyboard', key}, ...], label }
 *
 * open(current, options, onSelect):
 *   current  -- bisherige Zuordnung zur Vorbelegung, {functionId?, quickActions?, durationSeconds?}
 *   options  -- { includeMacros: bool } -- true für Bedienpanel-Tasten (können wie physische Tasten
 *               auch ein Makro auslösen, s. MappingModal in app.js), false für Makro-Schritte (ein
 *               Schritt darf kein weiteres Makro referenzieren -- macroEngine.fireStep() erwartet eine
 *               echte Funktion/Aktion, keine Makro-Ablaufsteuerung).
 */

// Tastennamen (event.code -> Name) und Bildschirmtastatur stehen seit 24.10.2026 gemeinsam mit dem Funktions-Editor in
// bildschirmtastatur.js (volle Tastatur mit Steuer- und Ziffernblock, Hendrik: „alle Tasten … inklusive KeyPad“).
// Anzeige: seit 21.10.2026 zeigt keyLabel() selbst die deutsche Beschriftung (functionEditor.js)
function apKeyText(name) {
  return keyLabel(name);
}

// Seit 24.10.2026 (Hendrik: „Auch das Menü zum Auswählen einer Funktion sollte … modernisiert werden“): kein Auswahl-
// bildschirm mehr, sondern oben ein Umschalter Funktion | Achse | Taste (öffnet auf der Art der aktuellen Belegung),
// daneben „Aktuell: …“ und „Zuordnung entfernen“. Achse und Taste wie im Funktions-Editor.
const AP_MODES = [['function', '📋 Funktion'], ['axis', '🎚 Achse'], ['keys', '⌨ Taste']];

class ActionPicker {
  constructor() {
    this.modal = document.getElementById('action-picker-modal');
    this.titleEl = document.getElementById('action-picker-title');
    this.body = document.getElementById('action-picker-body');

    this.onSelect = null;
    this.includeMacros = false;
    this.axisNeedsDuration = true;
    this.allowClear = false;
    this.contextLabel = null;
    this.current = {};
    this.mode = null; // 'function' | 'axis' | 'keys' (Umschalter oben, seit 24.10.2026 kein eigenes Auswahlmenü mehr)

    this.allFunctions = [];
    this.allCategories = [];
    this.functionCategory = null;

    this.axisState = null;      // { axisId, direction, durationSeconds }
    this.tasten = [];           // Taste-Modus: gewählte Tasten (bildschirmtastatur.js-Namen)
    this._keyDownHandler = null;
    this._keyUpHandler = null;

    // Funktions-Modus soll wie die echte Funktionsübersicht (app.js resizeProfileList()-Prinzip) immer
    // die volle Höhe ausfüllen, damit Gruppen-Tabs beim Wechseln zwischen unterschiedlich langen
    // Gruppen nicht ihre Position ändern -- nur die Liste selbst scrollt.
    window.addEventListener('resize', () => this.resizeFunctionsList());
  }

  /**
   * @param {Object} options
   * @param {boolean} [options.includeMacros] - Makros als Pseudo-Funktionen einmischen (Bedienpanel-
   *   Tasten/physische Tasten können wie ein Makro auslösen; ein Makro-SCHRITT nicht, s. Header).
   * @param {boolean} [options.axisNeedsDuration] - Default true (Bedienpanel-Touch-Taste): zeigt im
   *   Achse-Screen ein Pflicht-Dauer-Feld. Auf false setzen, wenn die auslösende Taste ohnehin ein
   *   echtes Halten/Loslassen unterstützt (physische Taste, s. Modulübersichten) oder eine eigene
   *   Dauer-Angabe bereits woanders existiert (Makro-Schritt-Haltedauer) -- sonst wäre die Dauer
   *   doppelt abgefragt ("doppelt gemoppelt", Hendriks Feedback).
   * @param {boolean} [options.allowClear] - zeigt eine zusätzliche "Zuordnung entfernen"-Kachel im
   *   Modus-Menü (nur sinnvoll, wenn der Aufrufer eine leere Zuordnung von "kein Aufruf" unterscheiden
   *   kann, s. physische Tasten -- ein Bedienpanel-Button hat dafür bislang keine eigene UI).
   * @param {string} [options.contextLabel] - z.B. "Taste 5 (Ebene II)", wird dem Titel vorangestellt --
   *   hilfreich, sobald der große Picker den Hintergrund (welche Taste war das nochmal?) verdeckt.
   */
  async open(current, options, onSelect) {
    this.current = current || {};
    this.includeMacros = !!(options && options.includeMacros);
    this.axisNeedsDuration = !(options && options.axisNeedsDuration === false);
    this.allowClear = !!(options && options.allowClear);
    this.contextLabel = (options && options.contextLabel) || null;
    this.onSelect = onSelect;
    this.mode = null;
    this.functionCategory = null;
    this.axisState = null;
    this.tasten = [];
    this.tastenVk = false;

    try {
      const functionsRes = await fetch('/api/functions');
      const functionsData = await functionsRes.json();
      this.allFunctions = functionsData.functions || [];
      this.allCategories = functionsData.categories || [];

      if (this.includeMacros) {
        const macrosRes = await fetch('/api/macros');
        const macrosData = await macrosRes.json();
        const macros = macrosData.macros || [];
        // Makros als Pseudo-Funktionen einmischen, exakt wie MappingModal (app.js) es für physische
        // Tasten tut -- eine Bedienpanel-Taste soll wie eine physische Taste auch ein Makro auslösen
        // können. 'actions: m.steps' ist bewusst dasselbe Format wie dort (die Aktions-Kurzbeschreibung
        // unter dem Makro-Namen zeigt dadurch "Keine Aktion" statt einer Schritt-Zusammenfassung, exakt
        // wie überall sonst im Projekt, wo Makros so eingemischt werden).
        // 'categories' (Plural-Array) -- nicht 'category' (Singular) -- da functionGroups.js
        // functionInGroup() ausschließlich func.categories prüft; mit 'category' landeten Makros
        // bisher fälschlich in der Auffanggruppe "Ohne Gruppe" statt unter "Makros" (Hendriks Bug-Fund
        // 23.08.2026), weil hier ein Array erwartet, aber ein einzelner String gesetzt wurde.
        const macroFunctions = macros.map(m => ({
          id: `macro:${m.id}`,
          name: `🔁 ${m.name}`,
          categories: ['Makros'],
          actions: m.steps
        }));
        this.allFunctions = [...this.allFunctions, ...macroFunctions];
        if (macros.length > 0 && !this.allCategories.includes('Makros')) this.allCategories.push('Makros');

        // ControlHub-Aktionen (Paket J: Profil laden, Kachelseite) -- überall, wo auch Makros gehen
        // (Taste der Armlehne, Bedienpanel), nicht in Makro-Schritten.
        const hub = await window.hubActions.pseudoFunctions();
        this.allFunctions = [...this.allFunctions, ...hub];
        if (hub.length > 0 && !this.allCategories.includes(window.hubActions.GROUP)) this.allCategories.push(window.hubActions.GROUP);
      }
    } catch (error) {
      if (this.onSelect === onSelect) uiAlert('Funktionen konnten nicht geladen werden: ' + error.message);
      return;
    }

    // Zwischen Start dieses Ladevorgangs und jetzt kann der Picker bereits fertig durchlaufen (finish()/
    // close(), setzt this.onSelect auf null) oder für eine ANDERE Taste/einen anderen Schritt neu
    // geöffnet worden sein (setzt this.onSelect auf einen anderen Callback) -- der hier lokal erfasste
    // onSelect-Parameter identifiziert eindeutig DIESEN Aufruf. Weicht er vom aktuellen this.onSelect ab,
    // ist dieser Ladevorgang veraltet und darf das Modal nicht nachträglich (wieder) anzeigen.
    if (this.onSelect !== onSelect) return;

    const qa = this.current.quickActions || [];
    this.chooseMode(this.current.functionId ? 'function' : qa.some(a => a.type === 'axis') ? 'axis' : qa.some(a => a.type === 'keyboard') ? 'keys' : 'function');
    this.modal.style.display = 'flex';
    this.resizeFunctionsList();
  }

  close() {
    this.cleanupKeyCapture();
    this.modal.style.display = 'none';
    this.onSelect = null;
  }

  finish(result) {
    this.cleanupKeyCapture();
    const callback = this.onSelect;
    this.modal.style.display = 'none';
    this.onSelect = null;
    if (callback) callback(result);
  }

  render() {
    this.titleEl.textContent = this.contextLabel ? `${this.contextLabel} – belegen` : 'Aktion zuordnen';
    let html;
    if (this.mode === 'axis') html = this.renderAxisScreen();
    else if (this.mode === 'keys') html = this.renderKeysScreen();
    else html = this.renderFunctionScreen();
    const hasCurrent = !!(this.current.functionId || (this.current.quickActions && this.current.quickActions.length > 0));
    this.body.innerHTML = `
      <div class="ap-kopf">
        <div class="fe-seg ap-tabs">${AP_MODES.map(([m, t]) => `<button type="button" class="${(this.mode || 'function') === m ? 'on' : ''}" onclick="window.actionPicker.chooseMode('${m}')">${t}</button>`).join('')}</div>
        <div class="ap-aktuell">Aktuell: <b>${escapeHtml(this.describeCurrent())}</b>
          ${this.allowClear && hasCurrent ? '<button type="button" class="fe-link fe-link--danger" onclick="window.actionPicker.chooseClear()">Zuordnung entfernen</button>' : ''}</div>
      </div>
      ${html}`;

    if (this.mode === 'function') {
      this.resizeFunctionsList();
    } else {
      // Zurücksetzen, falls zuvor im Funktions-Modus eine feste Höhe gesetzt wurde -- die anderen
      // Bildschirme (Modus-Menü/Achse/Taste) haben eine feste, datenunabhängige Inhaltsmenge und
      // sollen wie gewohnt auf ihren Inhalt schrumpfen, nicht auf 90vh aufgeblasen bleiben.
      this.modal.querySelector('.modal-content').style.height = '';
    }
  }

  // Gleiches Prinzip wie app.js resizeProfileList(): die Funktionsliste soll immer die volle
  // verfügbare Höhe ausfüllen, nicht auf wenige Funktionen zusammenschrumpfen. Da #action-picker-modal
  // vertikal zentriert ist (s. .modal), würde eine inhaltsabhängige Höhe die ganze Box beim Wechsel
  // zwischen kurzen/langen Kategorien verschieben -- deshalb zuerst die Box selbst auf eine feste,
  // vom Inhalt UNABHÄNGIGE Höhe setzen (90% Fensterhöhe, wie der bestehende max-height:90vh-Rahmen),
  // und ERST DANACH die Liste messen (sonst Zirkelbezug: Listenhöhe hängt von Boxhöhe ab, Boxhöhe
  // hinge sonst von Listenhöhe ab).
  resizeFunctionsList() {
    if (this.modal.style.display !== 'flex') return; // Modal geschlossen -- z.B. Aufruf über den globalen resize-Listener
    const modalContent = this.modal.querySelector('.modal-content');
    const list = this.body.querySelector('#ap-fn-liste') || this.body.querySelector('.functions-list');
    const nav = this.body.querySelector('.ap-fn-groups');
    if (!modalContent || !list) return;
    modalContent.style.height = Math.round(window.innerHeight * 0.9) + 'px';
    const top = list.getBoundingClientRect().top;
    const available = modalContent.getBoundingClientRect().bottom - top - 20; // 20px ~ unterer Innenabstand
    list.style.height = Math.max(120, available) + 'px';
    if (nav) nav.style.height = Math.max(120, modalContent.getBoundingClientRect().bottom - nav.getBoundingClientRect().top - 20) + 'px';
  }

  // -----------------------------------------------------------------------------------------------
  // Modus-Menü
  // -----------------------------------------------------------------------------------------------

  chooseClear() {
    this.finish({ mode: 'clear' });
  }

  describeCurrent() {
    if (this.current.functionId) {
      const func = this.allFunctions.find(f => f.id === this.current.functionId);
      return func ? func.name : this.current.functionId;
    }
    if (this.current.quickActions && this.current.quickActions.length > 0) {
      return describeActions(this.current.quickActions);
    }
    return 'Keine Zuordnung';
  }

  chooseMode(mode) {
    this.mode = mode;
    if (mode === 'axis') {
      const axisAction = (this.current.quickActions || []).find(a => a.type === 'axis');
      this.axisState = axisAction
        ? { axisId: axisAction.axisId, direction: axisAction.value === 0 ? 'minus' : 'plus', durationSeconds: this.current.durationSeconds || 1 }
        : { axisId: 0, direction: 'plus', durationSeconds: 1 };
      this.render();
    } else if (mode === 'keys') {
      // vorhandene Tasten der Belegung zeigen; aufgenommen wird erst auf Knopfdruck (sonst finge das Fenster jede Taste ab)
      this.cleanupKeyCapture();
      this.tasten = (this.current.quickActions || []).filter(a => a.type === 'keyboard').map(a => a.key);
      this.render();
    } else {
      this.functionCategory = null;
      this.suche = '';
      if (this.current.functionId) {
        const func = this.allFunctions.find(f => f.id === this.current.functionId);
        // Erste Gruppe der Funktion vorauswählen (falls sie in mehreren ist) -- ohne jede Gruppe
        // (Auffanggruppe) landet man konsequenterweise auf dem Auffanggruppe-Tab.
        if (func) this.functionCategory = (func.categories && func.categories[0]) || window.FunctionGroups.UNCATEGORIZED_ID;
      }
      this.render();
    }
  }

  backToModeSelect() {   // ältere Aufrufer: zurück zur Funktionsliste
    this.cleanupKeyCapture();
    this.chooseMode('function');
  }

  // -----------------------------------------------------------------------------------------------
  // Funktion (Gruppen-Tabs + Liste -- exakt das Rendering der echten Funktionsübersicht, s. app.js
  // renderCategoryTabs()/renderFunctionsList(), nur ohne Verwaltungsoptionen).
  // -----------------------------------------------------------------------------------------------

  renderFunctionScreen() {
    // Untergruppen (Hendrik 24.10.2026: „Aufklappbare Liste links“): links die Gruppen wie auf der Funktionen-Seite,
    // rechts Suche und Funktionen; bei einer Obergruppe nach Untergruppen geordnet
    const FG = window.FunctionGroups;
    const baum = FG.gruppenBaum(this.allCategories, this.allFunctions.flatMap(f => f.categories || []));
    const gueltig = [...baum.flatMap(k => [k.name, ...k.kinder]), FG.UNCATEGORIZED_ID];
    if (!this.functionCategory || !gueltig.includes(this.functionCategory)) this.functionCategory = baum[0]?.name || FG.UNCATEGORIZED_ID;
    this.baum = baum;
    const ohne = this.allFunctions.filter(f => FG.functionInGroup(f, FG.UNCATEGORIZED_ID)).length;
    const cur = (this.suche || '').trim() ? null : this.functionCategory;
    const nav = FG.gruppenListeHtml(baum, this.allFunctions, cur, { attr: 'cat' })
      + (ohne ? `<button type="button" class="fn-group${cur === FG.UNCATEGORIZED_ID ? ' active' : ''}" data-cat="${FG.UNCATEGORIZED_ID}"><span>${FG.UNCATEGORIZED_LABEL}</span><span class="fn-group-n">${ohne}</span></button>` : '');
    return `
      <div class="ap-fn">
        <nav class="fn-groups ap-fn-groups" aria-label="Gruppen" onclick="const b = event.target.closest('[data-cat]'); if (b) window.actionPicker.setFunctionCategory(b.dataset.cat)">${nav}</nav>
        <div class="ap-fn-main">
          <input type="search" class="ap-fn-search" placeholder="Funktion suchen" value="${escapeHtml(this.suche || '')}" oninput="window.actionPicker.setSuche(this.value)">
          <div id="ap-fn-liste">${this.funktionsListeHtml()}</div>
        </div>
      </div>
    `;
  }

  funktionsListeHtml() {
    const FG = window.FunctionGroups;
    const q = (this.suche || '').trim().toLowerCase();
    const karte = func => window.app.functionRowHtml(func, !!q, { gewaehlt: this.current.functionId === func.id });
    const ueberschrift = (text, n) => `<div class="fn-sec ap-fn-sec"><span>${escapeHtml(text)}</span><span>${n}</span></div>`;
    let teile = [];
    if (q) {
      const treffer = this.allFunctions.filter(f => f.name.toLowerCase().includes(q) || describeActions(f.actions).toLowerCase().includes(q));
      teile = treffer.map(karte);
    } else {
      const g = this.functionCategory;
      const knoten = (this.baum || []).find(k => k.name === g);
      const direkt = this.allFunctions.filter(f => FG.functionInGroup(f, g));
      teile = direkt.map(karte);
      for (const c of knoten?.kinder || []) {
        const drin = this.allFunctions.filter(f => FG.functionInGroup(f, c) && !FG.functionInGroup(f, g));
        if (drin.length) teile.push(ueberschrift(FG.groupLabel(c, true), drin.length), ...drin.map(karte));
      }
    }
    if (!teile.length) return `<p style="color: var(--text-dim); padding: 20px;">${q ? 'Keine Funktion gefunden.' : 'Keine Funktionen in dieser Gruppe.'}</p>`;
    return `<div class="fn-list ap-fn-list">${teile.join('')}</div>`;
  }

  setFunctionCategory(cat) {
    this.functionCategory = cat;
    this.suche = '';
    this.render();
  }

  // Suche ohne das Eingabefeld neu zu zeichnen (sonst ginge der Cursor verloren)
  setSuche(text) {
    this.suche = text;
    const liste = this.body.querySelector('#ap-fn-liste');
    if (liste) liste.innerHTML = this.funktionsListeHtml();
    this.body.querySelectorAll('.ap-fn-groups [data-cat]').forEach(b => b.classList.toggle('active', !text.trim() && b.dataset.cat === this.functionCategory));
    this.resizeFunctionsList();
  }

  selectFunction(functionId) {
    const func = this.allFunctions.find(f => f.id === functionId);
    this.finish({ mode: 'function', functionId, label: func ? func.name : functionId });
  }

  // -----------------------------------------------------------------------------------------------
  // Achse: Dropdown + Richtung + optional Dauer. Ein Dauer-Feld macht nur Sinn, wenn die auslösende
  // Taste KEIN echtes Halten/Loslassen kennt (Touch-Bedienpanel, s. axisNeedsDuration) -- eine
  // physische Taste (Modulübersichten) kann echt gehalten werden, und ein Makro-Schritt hat bereits
  // seine eigene Haltedauer (s. vorgewende.js holdDurationHtml()); in beiden Fällen wäre ein
  // zusätzliches Dauer-Feld hier doppelt gemoppelt (Hendriks Feedback).
  // -----------------------------------------------------------------------------------------------

  renderAxisScreen() {
    const { axisId, direction, durationSeconds } = this.axisState;
    return `
      <section class="fe-card ap-karte">
        <div class="fe-kicker">Gamepad-Achse bewegen</div>
        <div class="fe-grid2">
          <div><label class="fe-l">Achse</label><select class="fe-sel" onchange="window.actionPicker.setAxisField('axisId', parseInt(this.value, 10))">
            ${AXIS_SLOT_NAMES.map((name, i) => `<option value="${i}" ${i === axisId ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select></div>
          <div><label class="fe-l">Richtung</label><div class="fe-seg klein">
            <button type="button" class="${direction !== 'minus' ? 'on' : ''}" onclick="window.actionPicker.setAxisField('direction', 'plus')">+ Voll</button>
            <button type="button" class="${direction === 'minus' ? 'on' : ''}" onclick="window.actionPicker.setAxisField('direction', 'minus')">− Voll</button></div></div>
        </div>
        ${this.axisNeedsDuration ? `<div><label class="fe-l">Dauer (Sekunden)</label>
          <input type="number" class="fe-sel ap-dauer" min="0.1" step="0.1" value="${durationSeconds}" onchange="window.actionPicker.setAxisField('durationSeconds', this.value)"></div>` : ''}
        <p class="fe-hint">${this.axisNeedsDuration ? 'Die Achse steht für die angegebene Dauer auf Vollausschlag.' : 'Solange die Taste gedrückt ist, steht die Achse auf Vollausschlag.'}</p>
        <div class="ap-ok"><button type="button" class="btn-success" onclick="window.actionPicker.confirmAxis()">Übernehmen</button></div>
      </section>`;
  }

  setAxisField(field, value) {
    this.axisState[field] = value;
    this.render();
  }

  confirmAxis() {
    const { axisId, direction, durationSeconds } = this.axisState;
    const dirLabel = direction === 'plus' ? '+' : '-';
    const result = {
      mode: 'axis',
      quickActions: [{ type: 'axis', axisId: parseInt(axisId), value: direction === 'plus' ? 65535 : 0 }],
      label: `Achse ${AXIS_SLOT_NAMES[axisId] || axisId} (${dirLabel})`
    };
    if (this.axisNeedsDuration) {
      result.durationSeconds = Math.max(0.1, parseFloat(durationSeconds) || 1);
    }
    this.finish(result);
  }

  // -----------------------------------------------------------------------------------------------
  // Taste: erfasst über event.code (Modifier sicher erkennbar), abgebildet auf die vorhandene,
  // Namens-Vokabel (bildschirmtastatur.js CODE). Erfassung endet beim ersten Loslassen einer
  // gehaltenen, erkannten Taste -- danach erst Anzeige+Bestätigung statt sofortigem Übernehmen.
  // -----------------------------------------------------------------------------------------------

  renderKeysScreen() {
    const keys = this.tasten || [];
    const BT = window.Bildschirmtastatur;
    const kappen = keys.map((k, i) => `${i ? '<span class="fe-plus">+</span>' : ''}<span class="fe-kbd${BT.sendbar(k) ? '' : ' warn'}"${BT.sendbar(k) ? '' : ` title="${escapeHtml(BT.HINWEIS)}"`}>${escapeHtml(apKeyText(k))}
      <button type="button" class="fe-kbd-weg" aria-label="Taste entfernen" onclick="window.actionPicker.tasteWeg(${i})">✕</button></span>`).join('');
    const combo = this.aufnahme
      ? '<div class="fe-combo fe-combo--auf">Jetzt die Taste(n) auf der Tastatur drücken … <small>(Esc bricht ab)</small></div>'
      : `<div class="fe-combo${keys.length ? '' : ' leer'}">${keys.length ? kappen : 'Noch keine Taste'}</div>`;
    return `
      <section class="fe-card ap-karte">
        <div class="fe-kicker">Taste oder Tastenkombination senden</div>
        ${combo}
        <div class="fe-btns">
          <button type="button" class="fe-btn fe-btn--rec" onclick="window.actionPicker.${this.aufnahme ? 'stopKeyCapture' : 'startKeyCapture'}()">${this.aufnahme ? 'Abbrechen' : (keys.length ? '● Neu aufnehmen' : '● Aufnehmen')}</button>
          <button type="button" class="fe-btn${this.tastenVk ? ' an' : ''}" onclick="window.actionPicker.toggleVk()">Bildschirmtastatur</button>
          <span class="fe-sp"></span>
          <button type="button" class="btn-success" onclick="window.actionPicker.confirmKeys()" ${keys.length ? '' : 'disabled'}>Übernehmen</button>
        </div>
        ${this.tastenVk ? BT.html(keys, 'window.actionPicker.vkToggle') : ''}
        <p class="fe-hint">„Aufnehmen“ und dann die Tasten am PC drücken, z. B. Strg + A. Ohne Tastatur: Bildschirmtastatur, Tasten antippen.</p>
      </section>`;
  }

  toggleVk() { this.tastenVk = !this.tastenVk; this.render(); }

  tasteWeg(i) { (this.tasten || []).splice(i, 1); this.render(); }

  // Bildschirmtastatur: Taste an/aus (gleiche Taste in anderer Schreibweise zählt als dieselbe)
  vkToggle(name) {
    const BT = window.Bildschirmtastatur;
    const keys = this.tasten || (this.tasten = []);
    const i = keys.findIndex(k => BT.norm(k) === BT.norm(name));
    if (i >= 0) keys.splice(i, 1); else if (keys.length < 4) keys.push(name);
    this.tasten = BT.sortiere(keys);
    this.render();
  }

  startKeyCapture() {
    this.cleanupKeyCapture();
    this.aufnahme = true;
    this.render();
    const pressed = new Set();
    const onKeyDown = (e) => {
      if (e.code === 'Escape' && !pressed.size) { e.preventDefault(); this.stopKeyCapture(); return; }
      const name = window.Bildschirmtastatur.CODE[e.code];
      if (name) { e.preventDefault(); e.stopPropagation(); pressed.add(name); }
    };
    const onKeyUp = (e) => {
      const name = window.Bildschirmtastatur.CODE[e.code];
      if (!name || !pressed.has(name)) return;
      e.preventDefault();
      this.tasten = window.Bildschirmtastatur.sortiere([...pressed]);
      this.stopKeyCapture();
    };
    this._keyDownHandler = onKeyDown;
    this._keyUpHandler = onKeyUp;
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
  }

  stopKeyCapture() {
    this.cleanupKeyCapture();
    this.render();
  }

  cleanupKeyCapture() {
    this.aufnahme = false;
    if (this._keyDownHandler) {
      window.removeEventListener('keydown', this._keyDownHandler, true);
      window.removeEventListener('keyup', this._keyUpHandler, true);
      this._keyDownHandler = null;
      this._keyUpHandler = null;
    }
  }

  confirmKeys() {
    const keys = this.tasten || [];
    if (!keys.length) return;
    this.finish({
      mode: 'keys',
      quickActions: keys.map(key => ({ type: 'keyboard', key })),
      label: keys.map(keyLabel).join(' + ') // gespeichertes Label wie bisher (ohne „dt.“-Zusatz)
    });
  }
}

window.actionPicker = new ActionPicker();
