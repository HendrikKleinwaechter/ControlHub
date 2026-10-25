/**
 * FunctionEditor (Funktion anlegen/bearbeiten, Icons) + Anzeigenamen für Tasten (keyLabel,
 * auch von actionPicker.js genutzt -- muss daher vor actionPicker.js geladen werden).
 * Ausgelagert aus app.js am 21.10.2026 (Inhalt unverändert). Klassisches <script> -- teilt sich den
 * globalen Namensraum mit den anderen Skripten; instanziiert wird im DOMContentLoaded-Block in app.js.
 *
 * Seit 23.10.2026 (Durchsicht B1): Maßgeblich sind die gespeicherten `actions` (die führt die MappingEngine aus),
 * nicht die Hilfsfelder keyboardKeys/axisConfig -- importierte Funktionen (inputBinding.xml) und Systemfunktionen
 * haben nur `actions`. Der Editor leitet seine Felder daraus ab; was er nicht darstellen kann (z. B. Tastatur und
 * Gamepad gemischt), zeigt er fest an. Solange man an der Aktion nichts ändert, speichert er sie unverändert.
 * Systemfunktionen (Makro abbrechen, Gamepad-Taste 1–128) sind schreibgeschützt: nur Name, Gruppen, Icon, Bedingung.
 */
// Systemfunktionen legt functionsManager.ensureBuiltinFunctions() bei jedem Start an
const isSystemFunctionId = id => id === 'func-macro-abort' || String(id || '').startsWith('func-basicgamepad-');

// Aktionen → Editor-Felder. null = leer (neue Funktion), { kind: 'fest' } = im Editor nicht darstellbar
function editorFieldsFromActions(actions) {
  if (!Array.isArray(actions) || !actions.length) return null;
  if (actions.every(a => a?.type === 'keyboard' && typeof a.key === 'string')) {
    return { kind: 'keyboard', keyboardKeys: actions.map(a => a.key) };
  }
  const axes = actions.filter(a => a?.type === 'axis');
  const pads = actions.filter(a => a?.type === 'gamepad');
  const passt = axes.length + pads.length === actions.length && axes.length <= 1
    && axes.every(a => Number.isInteger(a.axisId) && (a.value === 0 || a.value === 65535))
    && pads.every(a => Number.isInteger(a.buttonId));
  if (passt) {
    return { kind: 'axis', axisConfig: {
      useAxis: axes.length === 1, axisId: axes[0]?.axisId ?? 0, direction: axes[0]?.value === 0 ? 'minus' : 'plus',
      gamepadButtons: [...new Set(pads.map(a => a.buttonId))]
    } };
  }
  return { kind: 'fest' };
}

// Anzeigenamen für Tasten, die als Rohname schlecht lesbar sind. Gespeichert wird immer der
// Rohname (den kennt die Firmware), angezeigt der Klartext. Die drei Alt-Namen ohne Seitenangabe
// kommen aus Belegungen von vor dem 30.09.2026 -- als "(alt)" gekennzeichnet, damit beim Bearbeiten
// klar ist, warum es sie doppelt zu geben scheint.
// Name bewusst mit KEYBOARD_-Praefix: axisAssignment.js hat ein eigenes top-level `const KEY_LABELS`
// (Achsen-Namen). Klassische <script>-Tags teilen sich einen globalen Scope -- zwei gleichnamige
// `const` waeren ein SyntaxError und wuerden die spaeter geladene Datei komplett lahmlegen
// (derselbe Fallstrick ist im Kommentarkopf von axisConfigModal.js dokumentiert).
//
// Seit 21.10.2026 (Hendrik: „alles deutsch“): Beschriftung wie auf einer DEUTSCHEN Tastatur. Gespeichert
// und an die Firmware geschickt wird weiter der Name der physischen Tastenposition (US-Layout, wie
// event.code) -- z. B. 'Y' = die Taste, auf der bei deutscher Tastatur „Z“ steht. Deshalb hier Y↔Z,
// Ö/Ä/Ü usw. Nur die Anzeige ändert sich, keine gespeicherte Belegung.
const KEYBOARD_KEY_LABELS = {
  LSHIFT: 'Shift links',  RSHIFT: 'Shift rechts',
  LCTRL:  'Strg links',   RCTRL:  'Strg rechts',
  LALT:   'Alt links',    RALT:   'Alt Gr (rechts)',
  SHIFT:  'Shift links (alt)', CTRL: 'Strg links (alt)', ALT: 'Alt links (alt)',
  Y: 'Z', Z: 'Y',
  SEMICOLON: 'Ö', QUOTE: 'Ä', LBRACKET: 'Ü', RBRACKET: '+', MINUS: 'ß', EQUALS: '´ (Akzent)',
  BACKSLASH: '#', GRAVE: '^', SLASH: '-', LESS: '<', COMMA: ',', PERIOD: '.',
  SPACE: 'Leertaste', ENTER: 'Enter', TAB: 'Tab', ESCAPE: 'Esc', BACKSPACE: 'Rücktaste', DELETE: 'Entf',
  INSERT: 'Einfg', HOME: 'Pos1', END: 'Ende', PAGEUP: 'Bild ↑', PAGEDOWN: 'Bild ↓',
  UP: 'Pfeil ↑', DOWN: 'Pfeil ↓', LEFT: 'Pfeil ←', RIGHT: 'Pfeil →',
  PAUSE: 'Pause', PRINTSCREEN: 'Druck', SCROLLLOCK: 'Rollen',
  NUMPAD0: 'Num 0', NUMPAD1: 'Num 1', NUMPAD2: 'Num 2', NUMPAD3: 'Num 3', NUMPAD4: 'Num 4',
  NUMPAD5: 'Num 5', NUMPAD6: 'Num 6', NUMPAD7: 'Num 7', NUMPAD8: 'Num 8', NUMPAD9: 'Num 9',
  NUMPAD_MULTIPLY: 'Num ×', NUMPAD_ADD: 'Num +', NUMPAD_SUBTRACT: 'Num −', NUMPAD_DECIMAL: 'Num ,', NUMPAD_DIVIDE: 'Num ÷',
  // Namen der Firmware (Import, Bildschirmtastatur seit 24.10.2026) und Tasten, die die Firmware noch nicht sendet
  ESC: 'Esc', KP0: 'Num 0', KP1: 'Num 1', KP2: 'Num 2', KP3: 'Num 3', KP4: 'Num 4', KP5: 'Num 5', KP6: 'Num 6', KP7: 'Num 7',
  KP8: 'Num 8', KP9: 'Num 9', KPDIV: 'Num ÷', KPMUL: 'Num ×', KPMINUS: 'Num −', KPPLUS: 'Num +', KPDOT: 'Num ,',
  KPENTER: 'Num Enter', NUMLOCK: 'Num-Lock', CAPSLOCK: 'Feststell', LGUI: 'Win links', RGUI: 'Win rechts', MENU: 'Menü'
};
function keyLabel(key) { return KEYBOARD_KEY_LABELS[key] || key; }

// Function Editor Modal - Überarbeitet für Keyboard ODER Achse+Buttons
class FunctionEditor {
  constructor() {
    this.modal = document.getElementById('function-modal');
    this.title = document.getElementById('function-modal-title');
    this.body = document.getElementById('function-modal-body');
    this.currentFunctionId = null;
    this.currentFunction = null;
    this.categories = [];
    this.actionType = 'keyboard'; // 'keyboard' oder 'axis'
    // Icon-Dateien: die alte Datei wird erst NACH erfolgreichem Speichern gelöscht (vorher schon beim
    // Hochladen/Entfernen -- bei Abbrechen zeigte die Funktion dann auf eine nicht mehr vorhandene Datei).
    // Hochgeladene, noch nicht gespeicherte Bilder werden beim Abbrechen wieder entfernt.
    this.savedIcon = null;    // Icon laut gespeicherter Funktion (beim Öffnen)
    this.pendingIcons = [];   // in diesem Dialog hochgeladen, noch nicht gespeichert

    // Tasten wählt man seit 24.10.2026 per Aufnahme oder Bildschirmtastatur (bildschirmtastatur.js), nicht mehr aus einer Liste

    // Achsennamen -- aus AXIS_SLOT_NAMES (app.js), gleiche Bezeichnung wie Achsen-Zuordnung/ActionPicker
    this.axisNames = AXIS_SLOT_NAMES.map((name, i) => `Achse ${i + 1} (${name})`);

    // Gamepad-Tasten: alle 128 Ausgabe-Tasten außer den für Ebenentaster reservierten (kommt mit /api/functions)
    this.gamepadButtonCount = 128;
    this.reservedGamepadButtons = [];
    // Aktionen beim Öffnen und ob sie seitdem geändert wurden (unverändert = genau so zurückspeichern)
    this.originalActions = [];
    this.actionsDirty = false;
    this.festeAktionen = false;   // Systemfunktion oder im Editor nicht darstellbar
  }

  applyMeta(data) {
    if (Number.isInteger(data?.gamepadButtonCount)) this.gamepadButtonCount = data.gamepadButtonCount;
    if (Array.isArray(data?.reservedGamepadButtons)) this.reservedGamepadButtons = data.reservedGamepadButtons;
  }

  async openCreate() {
    await this.discardPendingIcons();
    this.savedIcon = null;
    this.currentFunctionId = null;
    // Vorbelegung mit der gerade angezeigten Gruppe -- Auffanggruppe (Pseudo-ID) zählt dabei bewusst
    // NICHT als echte Vorbelegung, sonst würde eine neue Funktion sofort wieder "kategorielos" starten.
    const preselected = window.app.currentCategory ? [window.app.currentCategory] : [];   // geprüft nach loadCategories()
    this.currentFunction = {
      name: '',
      categories: preselected,
      actionType: 'keyboard',
      keyboardKeys: [],
      axisConfig: {
        axisId: 0,
        direction: 'plus',
        gamepadButtons: [],
        useAxis: false   // neue Funktionen starten ohne Achse -- reine Gamepad-Buttons sind der Normalfall,
                          // Achse ist bewusst ein Opt-in (s. renderAxisConfig())
      }
    };
    this.actionType = 'keyboard';
    this.originalActions = [];
    this.actionsDirty = false;
    this.festeAktionen = false;
    this.zustandZuruecksetzen();
    await this.loadCategories();
    // nur echte Gruppen vorbelegen (nicht „Alle Funktionen“, „Ohne Gruppe“ oder die feste ControlHub-Steuerung)
    this.currentFunction.categories = this.currentFunction.categories.filter(c => this.categories.includes(c));
    this.title.textContent = 'Neue Funktion';
    this.render();
    this.show();
  }

  async openEdit(functionId) {
    await this.discardPendingIcons();
    this.currentFunctionId = functionId;

    try {
      const response = await fetch('/api/functions');
      const data = await response.json();

      if (data.success) {
        const func = data.functions.find(f => f.id === functionId);
        if (func) {
          this.currentFunction = structuredClone(func);
          this.savedIcon = func.icon || null;
          this.categories = data.categories;
          this.applyMeta(data);
          this.originalActions = structuredClone(func.actions || []);
          this.originalFelder = { actionType: func.actionType, keyboardKeys: func.keyboardKeys, axisConfig: func.axisConfig };
          this.actionsDirty = false;

          // Felder aus den gespeicherten Aktionen ableiten (B1) -- nicht aus keyboardKeys/axisConfig, die fehlen bei
          // importierten Funktionen und Systemfunktionen oder können veraltet sein
          const felder = editorFieldsFromActions(func.actions);
          this.festeAktionen = isSystemFunctionId(func.id) || felder?.kind === 'fest';
          this.actionType = felder?.kind === 'axis' ? 'axis' : 'keyboard';
          this.currentFunction.keyboardKeys = felder?.kind === 'keyboard' ? felder.keyboardKeys : [];
          this.currentFunction.axisConfig = felder?.kind === 'axis' ? felder.axisConfig : { axisId: 0, direction: 'plus', gamepadButtons: [], useAxis: false };
          if (!this.currentFunction.categories) this.currentFunction.categories = [];
          this.zustandZuruecksetzen();
          this.title.textContent = func.name;
          this.render();
          this.show();
          this.ladeVerwendung(func.id);
        }
      }
    } catch (error) {
      uiAlert('Fehler beim Laden der Funktion: ' + error.message);
    }
  }

  zustandZuruecksetzen() {
    this.body.innerHTML = '';   // sonst übernähme merkeName() den Namen aus dem zuletzt offenen Editor
    this.aufnahmeStopp(false);
    this.gruppenOffen = false;
    this.gruppenSuche = '';
    this.gruppenAuf = new Set();
    this.vkOffen = false;
    this.padWahlOffen = false;
    this.verwendung = null;
  }

  async loadCategories() {
    try {
      const response = await fetch('/api/functions');
      const data = await response.json();
      if (data.success) {
        this.categories = data.categories;
        this.applyMeta(data);
      }
    } catch (error) {
      console.error('Fehler beim Laden der Kategorien:', error);
      this.categories = [];
    }
  }

  // ---------- Darstellung (24.10.2026, Hendriks freigegebener Entwurf „Funktions-Editor“) ----------
  // Abschnitte wie im GPS-Menü: Name und Bild · Gruppen (Chips, „+ Gruppe“ mit der aufklappbaren Gruppenliste) ·
  // Was die Funktion auslöst (Tastatur: aufnehmen oder Bildschirmtastatur; Gamepad: Achse, Richtung, Tasten) ·
  // Nur auslösen, wenn … · Belegt auf. Unten Löschen/Duplizieren, Abbrechen, Speichern.
  // Der Zustand steht in this.currentFunction; vor jedem Neuzeichnen wird der getippte Name übernommen.
  render() {
    this.merkeName();
    const f = this.currentFunction;
    const bild = f.icon
      ? `<button type="button" class="fe-bild hat" title="Bild ändern" onclick="document.getElementById('icon-upload').click()"><img src="/icons/${escapeHtml(encodeURIComponent(f.icon))}" alt=""></button>
         <button type="button" class="fe-bild-weg" title="Bild entfernen" aria-label="Bild entfernen" onclick="window.functionEditor.removeIcon()">✕</button>`
      : `<button type="button" class="fe-bild" onclick="document.getElementById('icon-upload').click()">Bild<br>wählen</button>`;
    this.body.innerHTML = `
      <div class="fe">
        <section class="fe-card">
          <div class="fe-kicker">Name und Bild</div>
          <div class="fe-namerow">
            <div class="fe-bild-wrap">${bild}</div>
            <input type="text" id="function-name" class="fe-name" value="${escapeHtml(f.name || '')}" placeholder="z. B. Licht ein/aus, Gas geben">
            <input type="file" id="icon-upload" accept="image/*" style="display: none;" onchange="window.functionEditor.uploadIcon(event)">
          </div>
        </section>

        <section class="fe-card">
          <div class="fe-kicker">Gruppen <span>· eine Funktion kann in mehreren stehen</span></div>
          <div class="fe-chips">${this.gruppenChipsHtml()}
            <button type="button" class="fe-add" onclick="window.functionEditor.toggleGruppenWahl()">${this.gruppenOffen ? 'Fertig' : '+ Gruppe'}</button></div>
          ${this.gruppenOffen ? `<div class="fe-gwahl">${this.gruppenWahlHtml()}</div>` : ''}
        </section>

        ${this.festeAktionen ? this.renderFesteAktionen() : `
        <section class="fe-card" id="fe-aktion">
          <div class="fe-kicker">Was die Funktion auslöst</div>
          <div class="fe-seg">
            <button type="button" class="${this.actionType === 'keyboard' ? 'on' : ''}" onclick="window.functionEditor.switchActionType('keyboard')">⌨ Tastatur</button>
            <button type="button" class="${this.actionType === 'axis' ? 'on' : ''}" onclick="window.functionEditor.switchActionType('axis')">🎮 Gamepad</button>
          </div>
          ${this.actionType === 'keyboard' ? this.renderKeyboardConfig() : this.renderAxisConfig()}
        </section>`}

        ${window.anzeigen?.available() ? `<section class="fe-card" id="function-condition">${this.renderConditionConfig()}</section>` : ''}

        ${this.currentFunctionId ? `<section class="fe-card" id="fe-verwendung">${this.verwendungHtml()}</section>` : ''}
      </div>`;
    this.renderFooter();
    // Mit Bildschirmtastatur breiter, damit Steuer- und Ziffernblock neben dem Hauptblock Platz haben
    this.modal.querySelector('.modal-content')?.classList.toggle('fe-breit', !!this.vkOffen && this.actionType === 'keyboard' && !this.festeAktionen);
  }

  merkeName() {
    const el = document.getElementById('function-name');
    if (el && this.currentFunction && this.body.contains(el)) this.currentFunction.name = el.value;
  }

  renderFooter() {
    const foot = document.getElementById('function-modal-footer');
    if (!foot) return;
    const bearbeiten = !!this.currentFunctionId, system = isSystemFunctionId(this.currentFunctionId);
    foot.innerHTML = `
      ${bearbeiten && !system ? '<button type="button" class="fe-link fe-link--danger" onclick="window.functionEditor.loeschen()">Löschen</button>' : ''}
      ${bearbeiten ? '<button type="button" class="fe-link" onclick="window.functionEditor.duplizieren()">Duplizieren</button>' : ''}
      <span class="fe-sp"></span>
      <button type="button" class="btn-secondary" onclick="window.functionEditor.close()">Abbrechen</button>
      <button type="button" class="btn-success" onclick="window.functionEditor.save()">${bearbeiten ? 'Speichern' : 'Anlegen'}</button>`;
  }

  // ---------- Gruppen ----------
  gruppenChipsHtml() {
    const FG = window.FunctionGroups;
    const cats = this.currentFunction.categories || [];
    if (!cats.length) return `<span class="fe-leer">Ohne Gruppe – die Funktion steht dann unter „${FG.UNCATEGORIZED_LABEL}“.</span>`;
    return cats.map((c, i) => {
      const { ober, unter } = FG.teileGruppe(c);
      return `<span class="fe-chip">${unter != null ? `<i>${escapeHtml(ober)} ›</i> <b>${escapeHtml(unter)}</b>` : `<b>${escapeHtml(c)}</b>`}
        <button type="button" class="fe-chip-weg" aria-label="Aus der Gruppe nehmen" onclick="window.functionEditor.gruppeWeg(${i})">✕</button></span>`;
    }).join('');
  }

  toggleGruppenWahl() {
    this.gruppenOffen = !this.gruppenOffen;
    this.gruppenSuche = '';
    this.render();
  }

  gruppeWeg(i) {
    this.currentFunction.categories.splice(i, 1);
    this.render();
  }

  // Aufklappbare Gruppenliste mit Häkchen (wie links auf der Funktionen-Seite), Suche, „+ Neue Gruppe …“
  gruppenWahlHtml() {
    const FG = window.FunctionGroups;
    const baum = FG.gruppenBaum(this.categories, this.currentFunction.categories || []);
    const gewaehlt = new Set(this.currentFunction.categories || []);
    const q = (this.gruppenSuche || '').trim().toLowerCase();
    const passt = name => !q || name.toLowerCase().includes(q);
    this.gruppenAuf = this.gruppenAuf || new Set();
    const zeile = (name, text, unter, auf, kinder) => `
      <div class="fe-g${unter ? ' fe-g--unter' : ''}">
        ${unter ? '' : `<button type="button" class="fe-g-chev" ${kinder ? '' : 'disabled'} aria-label="Aufklappen" onclick="window.functionEditor.gruppeAuf(${escapeHtml(JSON.stringify(name))})">${kinder ? (auf ? '⌄' : '›') : ''}</button>`}
        <button type="button" class="fe-g-wahl" onclick="window.functionEditor.gruppeUmschalten(${escapeHtml(JSON.stringify(name))})">
          <span class="fe-box${gewaehlt.has(name) ? ' an' : ''}">${gewaehlt.has(name) ? '✓' : ''}</span>${escapeHtml(text)}</button>
      </div>`;
    const rows = baum.map(k => {
      const kinderPassend = k.kinder.filter(passt);
      if (q && !passt(k.name) && !kinderPassend.length) return '';
      const auf = !!q || this.gruppenAuf.has(k.name) || k.kinder.some(c => gewaehlt.has(c));
      return zeile(k.name, k.name, false, auf, k.kinder.length)
        + (auf ? (q && !passt(k.name) ? kinderPassend : k.kinder).map(c => zeile(c, FG.groupLabel(c, true), true)).join('') : '');
    }).join('');
    return `<input type="search" class="fe-gsuche" placeholder="Gruppe suchen" value="${escapeHtml(this.gruppenSuche || '')}" oninput="window.functionEditor.gruppenSucheSetzen(this.value)">
      <div class="fe-gliste" id="fe-gliste">${rows || '<p class="fe-leer">Keine Gruppe gefunden.</p>'}
        <button type="button" class="fe-g-neu" onclick="window.functionEditor.neueGruppe()">+ Neue Gruppe …</button></div>`;
  }

  gruppenSucheSetzen(text) {
    this.gruppenSuche = text;
    const liste = document.getElementById('fe-gliste');
    if (!liste) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = this.gruppenWahlHtml();
    liste.innerHTML = tmp.querySelector('#fe-gliste').innerHTML;   // Suchfeld bleibt, damit der Cursor nicht springt
  }

  gruppeAuf(name) {
    this.gruppenAuf = this.gruppenAuf || new Set();
    if (this.gruppenAuf.has(name)) this.gruppenAuf.delete(name); else this.gruppenAuf.add(name);
    this.render();
  }

  gruppeUmschalten(name) {
    const cats = this.currentFunction.categories || (this.currentFunction.categories = []);
    const i = cats.indexOf(name);
    if (i >= 0) cats.splice(i, 1); else cats.push(name);
    this.render();
  }

  async neueGruppe() {
    const name = (await uiPrompt('Name der neuen Gruppe (Untergruppe: „Obergruppe › Name“):', '', { title: 'Neue Gruppe', ok: 'Anlegen' }))?.trim();
    if (!name) return;
    try {
      const r = await fetch('/api/categories/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }).then(x => x.json());
      if (!r.success) { uiAlert('Anlegen fehlgeschlagen: ' + r.error); return; }
      await this.loadCategories();
      if (!this.currentFunction.categories.includes(name)) this.currentFunction.categories.push(name);
      this.render();
    } catch (error) {
      uiAlert('Anlegen fehlgeschlagen: ' + error.message);
    }
  }

  // ---------- Belegt auf ----------
  verwendungHtml() {
    const v = this.verwendung;
    const liste = v == null ? '<span class="fe-leer">wird geladen …</span>'
      : v.length ? v.map(t => `<span class="fe-used">${escapeHtml(String(t).replace('Profil „default“', `Profil „${PROFIL_STANDARD_NAME}“`))}</span>`).join('')
        : '<span class="fe-leer">Noch auf keiner Taste.</span>';
    return `<div class="fe-kicker">Belegt auf</div><div class="fe-usedlist">${liste}</div>`;
  }

  async ladeVerwendung(id) {
    this.verwendung = null;
    try {
      const r = await fetch(`/api/function/${encodeURIComponent(id)}/verwendung`).then(x => x.json());
      if (this.currentFunctionId !== id) return;
      this.verwendung = r.success ? r.funde || [] : [];
    } catch {
      this.verwendung = [];
    }
    const el = document.getElementById('fe-verwendung');
    if (el) el.innerHTML = this.verwendungHtml();
  }

  async loeschen() {
    const id = this.currentFunctionId;
    if (!id) return;
    await window.app.deleteFunction(id, this.currentFunction.name || id);
    if (!(window.app.allFunctions || []).some(f => f.id === id)) this.close();
  }

  async duplizieren() {
    const id = this.currentFunctionId;
    if (!id) return;
    this.close();
    await window.app.duplicateFunction(id);
  }

  // Aktion, die der Editor nicht darstellen kann (Systemfunktion, Import mit gemischten Aktionen): fest anzeigen.
  // Bei Nicht-Systemfunktionen lässt sie sich bewusst neu festlegen -- erst dann wird sie beim Speichern ersetzt.
  renderFesteAktionen() {
    const system = isSystemFunctionId(this.currentFunction.id);
    return `
      <section class="fe-card">
        <div class="fe-kicker">Was die Funktion auslöst</div>
        <div class="fe-fest">${escapeHtml(describeActions(this.originalActions))}</div>
        <p class="fe-hint">${system
          ? 'Systemfunktion – was sie auslöst, ist fest. Name, Gruppen, Bild und Bedingung kannst du ändern.'
          : 'Diese Aktion lässt sich hier nicht Taste für Taste darstellen (z. B. Tastatur und Gamepad gemischt). Sie bleibt beim Speichern genau so.'}</p>
        ${system ? '' : '<div><button type="button" class="btn-secondary btn-small" onclick="window.functionEditor.neuFestlegen()">Aktion neu festlegen …</button></div>'}
      </section>`;
  }

  async neuFestlegen() {
    if (!(await uiConfirm('Die bisherige Aktion wird beim Speichern ersetzt. Neu festlegen?', { title: 'Aktion neu festlegen', ok: 'Neu festlegen' }))) return;
    this.festeAktionen = false;
    this.actionsDirty = true;
    this.actionType = 'keyboard';
    this.currentFunction.keyboardKeys = [];
    this.currentFunction.axisConfig = { axisId: 0, direction: 'plus', gamepadButtons: [], useAxis: false };
    this.render();
  }

  // Bedingung „nur auslösen, wenn …“ (Paket J, s. server/conditions.js): ein an/aus-Wert oder eine Zahl aus
  // der Werteliste. Gilt überall, wo die Funktion belegt ist. Eigener Bereich, damit Name/Gruppen beim
  // Umstellen nicht neu gezeichnet werden (getippter Name bliebe sonst nicht erhalten).
  renderConditionConfig() {
    const c = this.currentFunction.condition || null;
    const A = window.anzeigen;
    const def = c ? A.def(c.value) : null;
    const seg = items => `<div class="ui-seg">${items.map(([label, on, js]) => `<button type="button" class="${on ? 'on' : ''}" onclick="${js}">${label}</button>`).join('')}</div>`;
    let detail = '';
    if (def?.kind === 'bool') {
      // die beiden Zustände in eigenen Worten (z. B. gesenkt | angehoben) statt an/aus (Hendrik 24.10.2026)
      const W = window.Werteliste;
      detail = seg([[escapeHtml(W.zustand(def, true)), c.is !== false, 'window.functionEditor.setCondition({ is: true })'], [escapeHtml(W.zustand(def, false)), c.is === false, 'window.functionEditor.setCondition({ is: false })']]);
    } else if (def?.kind === 'num') {
      detail = `<div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        ${seg([['kleiner als', c.op !== 'gt', "window.functionEditor.setCondition({ op: 'lt' })"], ['größer als', c.op === 'gt', "window.functionEditor.setCondition({ op: 'gt' })"]])}
        <input type="number" step="any" value="${c.num ?? 0}" style="width:110px" onchange="window.functionEditor.setCondition({ num: parseFloat(this.value) || 0 })">
        <span style="color: var(--text-dim);">${escapeHtml(def.unit || '')}</span>
      </div>`;
    }
    return `
      <div class="fe-kicker">Nur auslösen, wenn … <span>· optional</span></div>
      <p style="color: var(--text-dim); font-size: 0.85rem; margin: 0;">${c
        ? `<b style="color: var(--text);">${escapeHtml(def?.name || c.value)}</b> · ${escapeHtml(A.pathOf(c.value))}`
        : 'Immer auslösen (keine Bedingung). Beispiel: „Gerät absenken“ nur, wenn „Gerät hinten 1 gesenkt/angehoben“ auf „angehoben“ steht.'}</p>
      ${detail}
      ${def?.kind === 'bool' ? `<p style="font-size: 0.85rem; margin: 8px 0 0;">Löst nur aus, wenn: <b>${escapeHtml(window.Werteliste.satz(def, c.is !== false))}</b></p>` : ''}
      <div style="display:flex; gap:8px; margin-top:10px;">
        <button type="button" class="btn-secondary btn-small" onclick="window.functionEditor.pickCondition()">${c ? 'Wert ändern' : 'Bedingung wählen'}</button>
        ${c ? '<button type="button" class="btn-secondary btn-small" onclick="window.functionEditor.clearCondition()">Keine Bedingung</button>' : ''}
      </div>
      ${c ? '<p style="color: var(--text-dim); font-size: 0.8rem; margin-top: 8px;">Ohne Spieldaten wird beim Drücken von Hand trotzdem gesendet, bei automatischen Auslösern (Makro nach Zeit oder Strecke) nicht.</p>' : ''}
    `;
  }

  refreshCondition() {
    const el = document.getElementById('function-condition');
    if (el) el.innerHTML = this.renderConditionConfig();
  }

  async pickCondition() {
    const cur = this.currentFunction.condition;
    const id = await window.anzeigen.pick({ title: 'Nur auslösen, wenn …', kinds: ['bool', 'num'], current: cur?.value, none: 'Immer auslösen (keine Bedingung)' });
    if (id === undefined) return;
    if (id === null) { this.clearCondition(); return; }
    const def = window.anzeigen.def(id);
    this.currentFunction.condition = def?.kind === 'num' ? { value: id, op: 'lt', num: 0 } : { value: id, is: false };
    this.refreshCondition();
  }

  setCondition(patch) {
    if (!this.currentFunction.condition) return;
    this.currentFunction.condition = { ...this.currentFunction.condition, ...patch };
    this.refreshCondition();
  }

  clearCondition() {
    delete this.currentFunction.condition;
    this.refreshCondition();
  }

  // ---------- Tastatur: Tasten als Kappen, aufnehmen mit der echten Tastatur oder Bildschirmtastatur ----------
  renderKeyboardConfig() {
    const keys = this.currentFunction.keyboardKeys || [];
    const BT = window.Bildschirmtastatur;
    const kappen = keys.map((k, i) => `${i ? '<span class="fe-plus">+</span>' : ''}<span class="fe-kbd${BT.sendbar(k) ? '' : ' warn'}"${BT.sendbar(k) ? '' : ` title="${escapeHtml(BT.HINWEIS)}"`}>${escapeHtml(keyLabel(k))}
      <button type="button" class="fe-kbd-weg" aria-label="Taste entfernen" onclick="window.functionEditor.removeKey(${i})">✕</button></span>`).join('');
    const combo = this.aufnahme
      ? '<div class="fe-combo fe-combo--auf">Jetzt die Taste(n) auf der Tastatur drücken … <small>(Esc bricht ab)</small></div>'
      : `<div class="fe-combo${keys.length ? '' : ' leer'}">${keys.length ? kappen : 'Noch keine Taste'}</div>`;
    return `
      ${combo}
      <div class="fe-btns">
        <button type="button" class="fe-btn fe-btn--rec${this.aufnahme ? ' an' : ''}" onclick="window.functionEditor.${this.aufnahme ? 'aufnahmeStopp' : 'aufnahmeStart'}()">${this.aufnahme ? 'Abbrechen' : (keys.length ? '● Neu aufnehmen' : '● Aufnehmen')}</button>
        <button type="button" class="fe-btn${this.vkOffen ? ' an' : ''}" onclick="window.functionEditor.toggleVk()">Bildschirmtastatur</button>
      </div>
      ${this.vkOffen ? BT.html(keys, 'window.functionEditor.vkToggle') : ''}
      <p class="fe-hint">„Aufnehmen“ und dann die Tasten am PC drücken, z. B. Strg + Z. Ohne Tastatur: Bildschirmtastatur, Tasten antippen. Alle Tasten werden zusammen gedrückt.</p>`;
  }

  aufnahmeStart() {
    this.aufnahmeStopp(false);
    this.aufnahme = true;
    const gedrueckt = new Set();
    this._kd = e => {
      if (e.code === 'Escape' && !gedrueckt.size) { e.preventDefault(); this.aufnahmeStopp(); return; }
      const name = window.Bildschirmtastatur.CODE[e.code];
      if (name) { e.preventDefault(); e.stopPropagation(); gedrueckt.add(name); }
    };
    this._ku = e => {
      const name = window.Bildschirmtastatur.CODE[e.code];
      if (!name || !gedrueckt.has(name)) return;
      e.preventDefault();
      this.currentFunction.keyboardKeys = window.Bildschirmtastatur.sortiere([...gedrueckt]);
      this.actionsDirty = true;
      this.aufnahmeStopp();
    };
    window.addEventListener('keydown', this._kd, true);
    window.addEventListener('keyup', this._ku, true);
    this.render();
  }

  aufnahmeStopp(neuZeichnen = true) {
    if (this._kd) window.removeEventListener('keydown', this._kd, true);
    if (this._ku) window.removeEventListener('keyup', this._ku, true);
    this._kd = this._ku = null;
    const war = this.aufnahme;
    this.aufnahme = false;
    if (neuZeichnen && war !== undefined) this.render();
  }

  toggleVk() {
    this.vkOffen = !this.vkOffen;
    this.render();
  }

  // Bildschirmtastatur: Taste an/aus (gleiche Taste in anderer Schreibweise zählt als dieselbe)
  vkToggle(name) {
    const BT = window.Bildschirmtastatur;
    const keys = this.currentFunction.keyboardKeys || (this.currentFunction.keyboardKeys = []);
    const i = keys.findIndex(k => BT.norm(k) === BT.norm(name));
    if (i >= 0) keys.splice(i, 1);
    else if (keys.length < 6) keys.push(name);
    this.currentFunction.keyboardKeys = BT.sortiere(keys);
    this.actionsDirty = true;
    this.render();
  }

  // ---------- Gamepad: Achse (Schalter, Achse, Richtung) und Gamepad-Tasten ----------
  renderAxisConfig() {
    const cfg = this.currentFunction.axisConfig || { axisId: 0, direction: 'plus', gamepadButtons: [], useAxis: false };
    const useAxis = cfg.useAxis !== false;
    const gewaehlt = cfg.gamepadButtons || [];
    const chips = gewaehlt.map((b, i) => `<span class="fe-chip"><b>Taste ${b + 1}</b><button type="button" class="fe-chip-weg" aria-label="Entfernen" onclick="window.functionEditor.removeGamepadButton(${i})">✕</button></span>`).join('');
    let raster = '';
    if (this.padWahlOffen) {
      const zellen = [];
      for (let i = 0; i < this.gamepadButtonCount; i++) {
        if (this.reservedGamepadButtons.includes(i)) continue;
        zellen.push(`<button type="button" class="fe-pad${gewaehlt.includes(i) ? ' an' : ''}" onclick="window.functionEditor.toggleGamepadButton(${i})">${i + 1}</button>`);
      }
      raster = `<div class="fe-padraster">${zellen.join('')}</div>`;
    }
    return `
      <button type="button" class="fe-switch" onclick="window.functionEditor.toggleUseAxis()">
        <span>Achse bewegen</span><span class="fe-tog${useAxis ? '' : ' aus'}"></span></button>
      ${useAxis ? `<div class="fe-grid2">
        <div><label class="fe-l">Achse</label><select class="fe-sel" onchange="window.functionEditor.setAxis(parseInt(this.value, 10))">
          ${this.axisNames.map((n, i) => `<option value="${i}" ${cfg.axisId === i ? 'selected' : ''}>${escapeHtml(n)}</option>`).join('')}</select></div>
        <div><label class="fe-l">Richtung</label><div class="fe-seg klein">
          <button type="button" class="${cfg.direction !== 'minus' ? 'on' : ''}" onclick="window.functionEditor.setDirection('plus')">+ Voll</button>
          <button type="button" class="${cfg.direction === 'minus' ? 'on' : ''}" onclick="window.functionEditor.setDirection('minus')">− Voll</button></div></div>
      </div>` : ''}
      <label class="fe-l">Gamepad-Tasten${useAxis ? ' dazu <span>· optional</span>' : ''}</label>
      <div class="fe-chips">${chips}<button type="button" class="fe-add" onclick="window.functionEditor.togglePadWahl()">${this.padWahlOffen ? 'Fertig' : '+ Gamepad-Taste'}</button></div>
      ${raster}
      <p class="fe-hint">${useAxis
        ? 'Solange die Taste der Armlehne gedrückt ist, steht die Achse auf Vollausschlag; die Gamepad-Tasten werden gleichzeitig gedrückt.'
        : 'Die gewählten Gamepad-Tasten werden gedrückt, solange die Taste der Armlehne gedrückt ist.'}</p>`;
  }

  toggleUseAxis() {
    const cfg = this.currentFunction.axisConfig || (this.currentFunction.axisConfig = { axisId: 0, direction: 'plus', gamepadButtons: [] });
    cfg.useAxis = cfg.useAxis === false;
    this.actionsDirty = true;
    this.render();
  }

  setAxis(id) { this.currentFunction.axisConfig.axisId = id; this.actionsDirty = true; }
  setDirection(d) { this.currentFunction.axisConfig.direction = d; this.actionsDirty = true; this.render(); }
  togglePadWahl() { this.padWahlOffen = !this.padWahlOffen; this.render(); }

  toggleGamepadButton(b) {
    const list = this.currentFunction.axisConfig.gamepadButtons;
    const i = list.indexOf(b);
    if (i >= 0) list.splice(i, 1); else list.push(b);
    list.sort((x, y) => x - y);
    this.actionsDirty = true;
    this.render();
  }

  removeGamepadButton(idx) {
    this.currentFunction.axisConfig.gamepadButtons.splice(idx, 1);
    this.actionsDirty = true;
    this.render();
  }

  switchActionType(type) {
    if (type !== this.actionType) this.actionsDirty = true;
    this.aufnahmeStopp(false);
    this.actionType = type;
    this.currentFunction.actionType = type;
    this.render();
  }

  removeKey(idx) {
    this.currentFunction.keyboardKeys.splice(idx, 1);
    this.actionsDirty = true;
    this.render();
  }

  async save() {
    this.merkeName();
    this.aufnahmeStopp(false);
    const name = (this.currentFunction.name || '').trim();
    const categories = [...(this.currentFunction.categories || [])];

    if (!name) {
      uiAlert('Bitte gib einen Namen ein!');
      return;
    }

    // Aktion unverändert (Systemfunktion, nicht darstellbar oder nichts angefasst): genau so zurückspeichern (B1)
    const keepActions = !!this.currentFunctionId && (this.festeAktionen || !this.actionsDirty);

    // Validierung je nach Aktionstyp
    if (keepActions) {
      // nichts zu prüfen
    } else if (this.actionType === 'keyboard') {
      if (!this.currentFunction.keyboardKeys || this.currentFunction.keyboardKeys.length === 0) {
        uiAlert('Bitte mindestens eine Taste aufnehmen oder auf der Bildschirmtastatur wählen.');
        return;
      }
    } else if (this.actionType === 'axis') {
      const cfg = this.currentFunction.axisConfig;
      if (cfg.useAxis === false && cfg.gamepadButtons.length === 0) {
        uiAlert('Bitte „Achse bewegen“ einschalten oder mindestens eine Gamepad-Taste wählen.');
        return;
      }
    }

    // Generiere ID für neue Funktion
    const functionId = this.currentFunctionId || `func-${Date.now()}`;

    // Konvertiere zu actions-Array für Kompatibilität mit MappingEngine
    const actions = keepActions ? structuredClone(this.originalActions) : [];

    if (keepActions) {
      // unverändert
    } else if (this.actionType === 'keyboard') {
      this.currentFunction.keyboardKeys.forEach(key => {
        actions.push({ type: 'keyboard', key });
      });
    } else if (this.actionType === 'axis') {
      const config = this.currentFunction.axisConfig;
      // Achse ist optional -- nur bei aktiviertem Haken ueberhaupt eine Achsen-Aktion erzeugen,
      // sonst waere jede reine Gamepad-Tasten-Funktion gezwungen, nebenbei immer eine Achse
      // mit auf Vollausschlag zu setzen.
      if (config.useAxis !== false) {
        actions.push({
          type: 'axis',
          axisId: config.axisId,
          value: config.direction === 'plus' ? 65535 : 0
        });
      }
      // Gamepad-Buttons (mit oder ohne Achse nutzbar)
      config.gamepadButtons.forEach(btnId => {
        actions.push({ type: 'gamepad', buttonId: btnId });
      });
    }

    // Hilfsfelder nur, wenn sie zur Aktion passen; bei unveränderter Aktion bleiben die gespeicherten (oder keine)
    const felder = keepActions ? null : {
      actionType: this.actionType,
      keyboardKeys: this.actionType === 'keyboard' ? (this.currentFunction.keyboardKeys || []) : [],
      axisConfig: this.actionType === 'axis' ? (this.currentFunction.axisConfig || null) : null
    };
    const { actionType: _t, keyboardKeys: _k, axisConfig: _a, ...rest } = this.currentFunction;
    const functionData = {
      ...rest,                // weitere gespeicherte Felder (z. B. aus dem Import) bleiben erhalten
      id: functionId,
      name: name,
      categories: categories,
      icon: this.currentFunction.icon || null,
      ...(felder || {}),
      actions: actions, // Für Kompatibilität mit MappingEngine
      condition: this.currentFunction.condition || null // „nur auslösen, wenn …“ (Paket J), Server prüft
    };
    if (keepActions) {
      // gespeicherte Hilfsfelder unverändert zurück (falls es welche gab)
      const orig = this.originalFelder || {};
      for (const k of ['actionType', 'keyboardKeys', 'axisConfig']) if (orig[k] !== undefined) functionData[k] = orig[k];
    }

    try {
      const response = await fetch('/api/function/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: functionId,
          function: functionData
        })
      });

      const result = await response.json();

      if (result.success) {
        // Jetzt erst die alte Icon-Datei löschen (ersetzt oder entfernt) -- das neue gehört ab hier zur
        // gespeicherten Funktion und darf beim Schließen nicht mehr als „ungespeichert“ entfernt werden.
        const oldIcon = this.savedIcon;
        this.pendingIcons = [];
        this.savedIcon = functionData.icon;
        if (oldIcon && oldIcon !== functionData.icon) {
          try {
            await this.deleteIcon(oldIcon);
          } catch (error) {
            uiAlert('Funktion gespeichert, altes Icon konnte aber nicht gelöscht werden: ' + error.message);
          }
        }
        await window.app.loadFunctions();
        this.close();
      } else {
        uiAlert('Fehler: ' + result.error);
      }
    } catch (error) {
      uiAlert('Speichern fehlgeschlagen: ' + error.message);
    }
  }

  async uploadIcon(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      uiAlert('Bitte wähle eine Bilddatei aus!');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      uiAlert('Bild ist zu groß! Maximal 2MB erlaubt.');
      return;
    }

    try {
      const response = await fetch('/api/function/upload-icon', {
        method: 'POST',
        headers: {
          'Content-Type': file.type,
          'X-Filename': file.name.replace(/\.[^/.]+$/, '')
        },
        body: file
      });

      const result = await response.json();

      if (result.success) {
        // Ein zuvor in DIESEM Dialog hochgeladenes, ungespeichertes Bild sofort wieder entfernen; das
        // gespeicherte Icon bleibt bis zum erfolgreichen Speichern liegen (s. save()).
        await this.discardIfPending(this.currentFunction.icon);
        this.currentFunction.icon = result.filename;
        this.pendingIcons.push(result.filename);
        this.render();
      } else {
        uiAlert('Upload fehlgeschlagen: ' + result.error);
      }
    } catch (error) {
      uiAlert('Upload fehlgeschlagen: ' + error.message);
    }
  }

  async removeIcon() {
    if (!this.currentFunction.icon) return;
    if (!(await uiConfirm('Icon wirklich entfernen?', { title: 'Icon entfernen', ok: 'Entfernen', danger: true }))) return;

    // Nur ein ungespeichertes Bild sofort löschen -- das gespeicherte Icon erst nach dem Speichern (s. save())
    await this.discardIfPending(this.currentFunction.icon);
    this.currentFunction.icon = null;
    this.render();
  }

  async deleteIcon(filename) {
    const res = await fetch(`/api/function/icon/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    const result = await res.json();
    // Datei schon weg (ENOENT) = Ziel erreicht, kein Fehler
    if (!result.success && !/ENOENT/.test(result.error || '')) throw new Error(result.error || 'unbekannter Fehler');
  }

  // Entfernt alle in diesem Dialog hochgeladenen, (noch) nicht gespeicherten Bilder vom Server
  async discardPendingIcons() {
    const toDelete = this.pendingIcons;
    this.pendingIcons = [];
    for (const filename of toDelete) await this.deletePendingIcon(filename);
  }

  // Entfernt ein Bild nur, wenn es ein ungespeicherter Upload aus diesem Dialog ist -- ein gespeichertes
  // Icon bleibt unberührt (das löscht erst save())
  async discardIfPending(filename) {
    if (!filename || !this.pendingIcons.includes(filename)) return;
    this.pendingIcons = this.pendingIcons.filter(f => f !== filename);
    await this.deletePendingIcon(filename);
  }

  async deletePendingIcon(filename) {
    try {
      await this.deleteIcon(filename);
    } catch (error) {
      uiAlert('Hochgeladenes Icon konnte nicht entfernt werden: ' + error.message);
    }
  }

  show() {
    this.modal.style.display = 'flex';
  }

  // Abbrechen/×/Esc: ungespeicherte Uploads wieder entfernen (nach save() ist die Liste bereits leer)
  close() {
    this.aufnahmeStopp(false);
    this.modal.style.display = 'none';
    this.discardPendingIcons();
  }
}
