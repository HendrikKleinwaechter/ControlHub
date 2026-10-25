/**
 * Bildschirmtastatur (Hendrik 24.10.2026: „muss wirklich alle Tasten einer Tastatur anzeigen, inklusive KeyPad“):
 * volle deutsche Tastatur mit Hauptblock, Steuerblock (Druck/Rollen/Pause, Einfg/Pos1/Bild, Pfeile) und Ziffernblock.
 * Genutzt im Funktions-Editor (functionEditor.js) und bei „Taste eingeben“ (actionPicker.js).
 *
 * Gespeichert wird der Name der Tastenposition, den auch die Aufnahme mit der echten Tastatur liefert (CODE, aus
 * event.code); beschriftet ist die Taste deutsch (z. B. Name 'Y' = die Taste mit „Z“). Ziffernblock mit den Namen der
 * Firmware (KP0 … KPPLUS); ältere Belegungen mit NUMPAD0 … gelten weiter (norm(), server/outputGenerator.js).
 *
 * NEUE_TASTEN: sendet die Armlehne erst ab CraftConsole-Firmware 2.13 bzw. CraftLink 1.1 (24.10.2026, Hendrik: „bevor
 * wir es doch irgendwo brauchen … jetzt mit aufnehmen“). Meldet das verbundene Gerät eine ältere Firmware, sind sie
 * ausgegraut, mit Hinweis; ohne verbundenes Gerät nicht (dann ist die Version unbekannt).
 */
(function () {
  const K = (name, label, w = 1) => ({ name, label, w });
  const L = w => ({ luecke: true, w });

  // Hauptblock: 6 Reihen à 15 Einheiten
  const HAUPT = [
    [K('ESC', 'Esc'), L(1), K('F1', 'F1'), K('F2', 'F2'), K('F3', 'F3'), K('F4', 'F4'), L(0.5), K('F5', 'F5'), K('F6', 'F6'), K('F7', 'F7'), K('F8', 'F8'), L(0.5), K('F9', 'F9'), K('F10', 'F10'), K('F11', 'F11'), K('F12', 'F12')],
    [K('GRAVE', '^'), K('1', '1'), K('2', '2'), K('3', '3'), K('4', '4'), K('5', '5'), K('6', '6'), K('7', '7'), K('8', '8'), K('9', '9'), K('0', '0'), K('MINUS', 'ß'), K('EQUALS', '´'), K('BACKSPACE', '⌫', 2)],
    [K('TAB', 'Tab', 1.5), K('Q', 'Q'), K('W', 'W'), K('E', 'E'), K('R', 'R'), K('T', 'T'), K('Y', 'Z'), K('U', 'U'), K('I', 'I'), K('O', 'O'), K('P', 'P'), K('LBRACKET', 'Ü'), K('RBRACKET', '+'), K('ENTER', 'Enter', 1.5)],
    [K('CAPSLOCK', 'Feststell', 1.75), K('A', 'A'), K('S', 'S'), K('D', 'D'), K('F', 'F'), K('G', 'G'), K('H', 'H'), K('J', 'J'), K('K', 'K'), K('L', 'L'), K('SEMICOLON', 'Ö'), K('QUOTE', 'Ä'), K('BACKSLASH', '#'), L(1.25)],
    [K('LSHIFT', 'Shift', 1.25), K('LESS', '<'), K('Z', 'Y'), K('X', 'X'), K('C', 'C'), K('V', 'V'), K('B', 'B'), K('N', 'N'), K('M', 'M'), K('COMMA', ','), K('PERIOD', '.'), K('SLASH', '-'), K('RSHIFT', 'Shift', 2.75)],
    [K('LCTRL', 'Strg', 1.25), K('LGUI', 'Win', 1.25), K('LALT', 'Alt', 1.25), K('SPACE', 'Leertaste', 6.25), K('RALT', 'Alt Gr', 1.25), K('RGUI', 'Win', 1.25), K('MENU', 'Menü', 1.25), K('RCTRL', 'Strg', 1.25)]
  ];
  // Steuerblock (3 Spalten) und Ziffernblock (4 Spalten): [Taste, Reihe, Spalte, Höhe, Breite]
  const STEUER = [
    [K('PRINTSCREEN', 'Druck'), 1, 1], [K('SCROLLLOCK', 'Rollen'), 1, 2], [K('PAUSE', 'Pause'), 1, 3],
    [K('INSERT', 'Einfg'), 2, 1], [K('HOME', 'Pos1'), 2, 2], [K('PAGEUP', 'Bild ↑'), 2, 3],
    [K('DELETE', 'Entf'), 3, 1], [K('END', 'Ende'), 3, 2], [K('PAGEDOWN', 'Bild ↓'), 3, 3],
    [K('UP', '↑'), 5, 2], [K('LEFT', '←'), 6, 1], [K('DOWN', '↓'), 6, 2], [K('RIGHT', '→'), 6, 3]
  ];
  const NUM = [
    [K('NUMLOCK', 'Num'), 2, 1], [K('KPDIV', '÷'), 2, 2], [K('KPMUL', '×'), 2, 3], [K('KPMINUS', '−'), 2, 4],
    [K('KP7', '7'), 3, 1], [K('KP8', '8'), 3, 2], [K('KP9', '9'), 3, 3], [K('KPPLUS', '+'), 3, 4, 2],
    [K('KP4', '4'), 4, 1], [K('KP5', '5'), 4, 2], [K('KP6', '6'), 4, 3],
    [K('KP1', '1'), 5, 1], [K('KP2', '2'), 5, 2], [K('KP3', '3'), 5, 3], [K('KPENTER', 'Enter'), 5, 4, 2],
    [K('KP0', '0'), 6, 1, 1, 2], [K('KPDOT', ','), 6, 3]
  ];

  const NEUE_TASTEN = new Set(['CAPSLOCK', 'NUMLOCK', 'LGUI', 'RGUI', 'MENU', 'KPENTER', 'KPDOT']);
  const MIN_FIRMWARE = { craftconsole: '2.13', craftlink: '1.1' };
  const alsZahlen = v => String(v).split('.').map(n => parseInt(n, 10) || 0);
  const aelter = (a, b) => { const x = alsZahlen(a), y = alsZahlen(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); } return false; };
  // null = alles sendbar, sonst { brauche, hat } für den Hinweis
  function firmwareZuAlt() {
    const ci = window.controllerInfo, min = MIN_FIRMWARE[ci?.active], fw = ci?.info?.firmware;
    return min && fw && aelter(fw, min) ? { brauche: min, hat: fw, name: ci?.profile?.name || ci?.active } : null;
  }
  const hinweisText = () => { const z = firmwareZuAlt(); return z ? `Diese Taste sendet ${z.name} erst ab Firmware ${z.brauche} (verbunden: ${z.hat}).` : ''; };
  const sendbar = name => !(NEUE_TASTEN.has(norm(name)) && firmwareZuAlt());

  // Ältere bzw. andere Schreibweisen derselben Taste
  const ALIAS = {
    ESCAPE: 'ESC', SHIFT: 'LSHIFT', CTRL: 'LCTRL', ALT: 'LALT',
    NUMPAD0: 'KP0', NUMPAD1: 'KP1', NUMPAD2: 'KP2', NUMPAD3: 'KP3', NUMPAD4: 'KP4',
    NUMPAD5: 'KP5', NUMPAD6: 'KP6', NUMPAD7: 'KP7', NUMPAD8: 'KP8', NUMPAD9: 'KP9',
    NUMPAD_MULTIPLY: 'KPMUL', NUMPAD_ADD: 'KPPLUS', NUMPAD_SUBTRACT: 'KPMINUS', NUMPAD_DIVIDE: 'KPDIV', NUMPAD_DECIMAL: 'KPDOT'
  };
  const norm = name => ALIAS[name] || name;

  // event.code -> Name (Aufnahme mit der echten Tastatur)
  const CODE = {
    Escape: 'ESC', Tab: 'TAB', CapsLock: 'CAPSLOCK', Space: 'SPACE', Enter: 'ENTER', Backspace: 'BACKSPACE',
    ShiftLeft: 'LSHIFT', ShiftRight: 'RSHIFT', ControlLeft: 'LCTRL', ControlRight: 'RCTRL', AltLeft: 'LALT', AltRight: 'RALT',
    MetaLeft: 'LGUI', MetaRight: 'RGUI', ContextMenu: 'MENU',
    Minus: 'MINUS', Equal: 'EQUALS', BracketLeft: 'LBRACKET', BracketRight: 'RBRACKET', Backslash: 'BACKSLASH',
    Semicolon: 'SEMICOLON', Quote: 'QUOTE', Backquote: 'GRAVE', Comma: 'COMMA', Period: 'PERIOD', Slash: 'SLASH', IntlBackslash: 'LESS',
    PrintScreen: 'PRINTSCREEN', ScrollLock: 'SCROLLLOCK', Pause: 'PAUSE', Insert: 'INSERT', Delete: 'DELETE',
    Home: 'HOME', End: 'END', PageUp: 'PAGEUP', PageDown: 'PAGEDOWN',
    ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
    NumLock: 'NUMLOCK', NumpadDivide: 'KPDIV', NumpadMultiply: 'KPMUL', NumpadSubtract: 'KPMINUS', NumpadAdd: 'KPPLUS',
    NumpadEnter: 'KPENTER', NumpadDecimal: 'KPDOT'
  };
  for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') CODE[`Key${c}`] = c;
  for (let i = 0; i <= 9; i++) { CODE[`Digit${i}`] = String(i); CODE[`Numpad${i}`] = `KP${i}`; }
  for (let i = 1; i <= 12; i++) CODE[`F${i}`] = `F${i}`;

  const MODS = ['LCTRL', 'RCTRL', 'LSHIFT', 'RSHIFT', 'LALT', 'RALT', 'LGUI', 'RGUI'];
  // Modifier zuerst, wie beim Drücken auf der echten Tastatur
  const sortiere = keys => [...keys].sort((a, b) => (MODS.includes(norm(b)) ? 1 : 0) - (MODS.includes(norm(a)) ? 1 : 0));

  function taste(k, gewaehlt, stil = '') {
    if (k.luecke) return `<span class="bt-luecke" style="flex-grow:${k.w}"></span>`;
    const aus = !sendbar(k.name);
    const an = gewaehlt.has(k.name);
    return `<button type="button" class="bt-k${an ? ' an' : ''}${aus ? ' aus' : ''}" data-key="${k.name}" style="flex-grow:${k.w};${stil}"${aus ? ` disabled title="${escapeHtml(hinweisText())}"` : ''}>${escapeHtml(k.label)}</button>`;
  }

  /**
   * @param {string[]} gewaehlt  gewählte Tasten (beliebige Schreibweise)
   * @param {string} fn          JS-Ausdruck, der mit dem Namen aufgerufen wird, z. B. 'window.functionEditor.vkToggle'
   */
  function html(gewaehlt, fn) {
    const g = new Set((gewaehlt || []).map(norm));
    const block = (liste, klasse) => `<div class="${klasse}">${liste.map(([k, r, c, h = 1, w = 1]) =>
      taste(k, g, `grid-row:${r} / span ${h};grid-column:${c} / span ${w};`)).join('')}</div>`;
    return `<div class="bt" onclick="const b = event.target.closest('[data-key]'); if (b && !b.disabled) ${fn}(b.dataset.key)">
      <div class="bt-haupt">${HAUPT.map(reihe => `<div class="bt-reihe">${reihe.map(k => taste(k, g)).join('')}</div>`).join('')}</div>
      ${block(STEUER, 'bt-steuer')}
      ${block(NUM, 'bt-num')}
    </div>
    ${firmwareZuAlt() ? `<p class="bt-hinweis">Ausgegraut: ${escapeHtml(hinweisText().replace('Diese Taste sendet', 'sendet'))}</p>` : ''}`;
  }

  window.Bildschirmtastatur = { html, norm, CODE, MODS, sortiere, sendbar, get HINWEIS() { return hinweisText(); } };
})();
