/**
 * Eigene Dialoge statt alert()/confirm()/prompt() des Browsers (21.10.2026, Hendriks Entscheidung).
 *
 * Warum: Browser-Dialoge sehen auf dem Tablet fremd aus, blockieren die ganze Seite und kennen nur
 * „OK/Abbrechen“ (vorher z. B. „Merge (OK) oder Replace (Abbrechen)?“). Diese hier passen zum
 * ControlHub-Design (.modal/.modal-content), haben frei beschriftbare, große Knöpfe und funktionieren
 * mit Touch, Enter (Hauptknopf) und Escape (Abbrechen).
 *
 * Alle Funktionen geben ein Promise zurück -- aufrufende Stellen müssen also `await` nutzen:
 *   await uiAlert('Text')                                  -> Meldung mit OK (Erfolgsmeldungen als Toast)
 *   if (await uiConfirm('Wirklich löschen?', { ok: 'Löschen', danger: true })) …
 *   const name = await uiPrompt('Name:', 'Vorgabe')        -> Text oder null (abgebrochen)
 *   const mode = await uiChoice('Wie importieren?', [{ label: 'Zusammenführen', value: 'merge' }, …])
 * Mehrere gleichzeitige Dialoge werden nacheinander gezeigt (Warteschlange).
 * Muss VOR allen anderen App-Skripten geladen werden (index.html).
 */
(function () {
  const queue = [];
  let open = false;

  function build() {
    let el = document.getElementById('ui-dialog');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'ui-dialog';
    el.className = 'modal ui-dialog';
    el.style.display = 'none';
    el.innerHTML = `
      <div class="modal-content ui-dialog-content" role="dialog" aria-modal="true" aria-labelledby="ui-dialog-title">
        <div class="modal-header"><h3 id="ui-dialog-title"></h3></div>
        <div class="modal-body">
          <p class="ui-dialog-message" id="ui-dialog-message"></p>
          <input type="text" class="ui-dialog-input" id="ui-dialog-input" autocomplete="off">
          <textarea class="ui-dialog-input ui-dialog-textarea" id="ui-dialog-textarea" rows="10" readonly></textarea>
        </div>
        <div class="ui-dialog-buttons" id="ui-dialog-buttons"></div>
      </div>`;
    document.body.appendChild(el);
    return el;
  }

  function next() {
    if (open || queue.length === 0) return;
    open = true;
    const { opts, resolve } = queue.shift();
    const el = build();
    const titleEl = el.querySelector('#ui-dialog-title');
    const msgEl = el.querySelector('#ui-dialog-message');
    const input = el.querySelector(opts.textarea ? '#ui-dialog-textarea' : '#ui-dialog-input');
    el.querySelector(opts.textarea ? '#ui-dialog-input' : '#ui-dialog-textarea').style.display = 'none';
    const btnBox = el.querySelector('#ui-dialog-buttons');

    titleEl.textContent = opts.title || '';
    titleEl.parentElement.style.display = opts.title ? '' : 'none';
    el.querySelector('.ui-dialog-content').classList.toggle('ui-dialog--danger', !!opts.danger);
    msgEl.textContent = opts.message ?? '';
    msgEl.style.display = opts.message ? '' : 'none';
    input.style.display = opts.input ? '' : 'none';
    input.value = opts.input?.value ?? '';
    input.placeholder = opts.input?.placeholder ?? '';

    const finish = (button) => {
      el.style.display = 'none';
      document.removeEventListener('keydown', onKey, true);
      open = false;
      resolve({ button, value: opts.input ? input.value : undefined });
      setTimeout(next, 0);
    };
    const cancelBtn = opts.buttons.find(b => b.cancel);
    const primaryBtn = opts.buttons.find(b => b.primary) || opts.buttons[opts.buttons.length - 1];
    function onKey(e) {
      if (e.key === 'Escape' && cancelBtn) { e.preventDefault(); e.stopPropagation(); finish(cancelBtn.value); }
      else if (e.key === 'Enter' && primaryBtn && !opts.textarea) { e.preventDefault(); e.stopPropagation(); finish(primaryBtn.value); }
    }
    btnBox.innerHTML = '';
    for (const b of opts.buttons) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = b.kind === 'danger' ? 'btn-danger' : b.primary ? 'btn-primary' : 'btn-secondary';
      btn.innerHTML = escapeHtml(b.label);
      btn.onclick = () => finish(b.value);
      btnBox.appendChild(btn);
    }
    document.addEventListener('keydown', onKey, true);
    el.style.display = 'flex';
    setTimeout(() => (opts.input ? input : btnBox.querySelector('.btn-primary, .btn-danger, button'))?.focus(), 30);
  }

  function uiDialog(opts) {
    return new Promise(resolve => { queue.push({ opts, resolve }); next(); });
  }

  // Erfolgsmeldungen ("… gespeichert", "… exportiert") brauchen keinen Klick -> Toast, wenn vorhanden
  const SUCCESS_RX = /^(?!.*(fehl|nicht|kein|ungültig|error))[^\n]*(gespeichert|erstellt|exportiert|importiert|übernommen|zurückgesetzt|angelegt|erfolgreich|kopiert|aktualisiert|wiederhergestellt|gelöscht|entfernt|kalibriert|zentriert|umbenannt|dupliziert)[^\n]*!?$/i;
  const ERROR_RX = /(fehler|fehlgeschlagen|nicht möglich|konnte nicht|ungültig|error)/i;

  async function uiAlert(message, opts = {}) {
    const text = String(message ?? '');
    if (!opts.forceDialog && typeof window.showToast === 'function' && SUCCESS_RX.test(text.trim())) {
      window.showToast(text.replace(/!$/, ''));
      return;
    }
    const isError = opts.danger ?? ERROR_RX.test(text);
    await uiDialog({
      title: opts.title ?? (isError ? 'Fehler' : 'Hinweis'),
      message: text,
      danger: isError,
      buttons: [{ label: opts.ok || 'OK', value: true, primary: true, cancel: true }]
    });
  }

  async function uiConfirm(message, opts = {}) {
    const { button } = await uiDialog({
      title: opts.title ?? 'Bitte bestätigen',
      message,
      danger: !!opts.danger,
      buttons: [
        { label: opts.cancel || 'Abbrechen', value: false, cancel: true },
        { label: opts.ok || 'OK', value: true, primary: true, kind: opts.danger ? 'danger' : undefined }
      ]
    });
    return button === true;
  }

  async function uiPrompt(message, defaultValue = '', opts = {}) {
    const { button, value } = await uiDialog({
      title: opts.title ?? 'Eingabe',
      message,
      input: { value: defaultValue ?? '', placeholder: opts.placeholder || '' },
      buttons: [
        { label: opts.cancel || 'Abbrechen', value: false, cancel: true },
        { label: opts.ok || 'Übernehmen', value: true, primary: true }
      ]
    });
    return button === true ? value : null;
  }

  // Auswahl zwischen mehreren Möglichkeiten; null = abgebrochen
  async function uiChoice(message, choices, opts = {}) {
    const { button } = await uiDialog({
      title: opts.title ?? 'Bitte wählen',
      message,
      buttons: [
        { label: opts.cancel || 'Abbrechen', value: null, cancel: true },
        ...choices.map((c, i) => ({ label: c.label, value: c.value, primary: i === choices.length - 1, kind: c.danger ? 'danger' : undefined }))
      ]
    });
    return button;
  }

  // Text zum Kopieren anzeigen (Ersatz für prompt('… manuell kopieren:', text))
  async function uiShowText(message, text, opts = {}) {
    await uiDialog({
      title: opts.title ?? 'Text kopieren',
      message,
      input: { value: text },
      textarea: true,
      buttons: [{ label: 'Schließen', value: true, primary: true, cancel: true }]
    });
  }

  // Kleines Menü/Fenster an einem Knopf (Übersichten Funktionen und Kacheln, 23.10.2026): „⋯“, „Mehr“, Module wählen.
  // Nur eins zur Zeit; schließt bei Klick daneben, Esc, Scrollen außerhalb und Größenänderung. content = HTML oder Element.
  // opts.key merkt, wozu es gehört (uiPopoverKey()), damit es nach einem Neuzeichnen wieder geöffnet werden kann.
  let pop = null;
  function uiPopoverClose() {
    if (!pop) return;
    const p = pop;
    pop = null;
    document.removeEventListener('pointerdown', p.onDown, true);
    document.removeEventListener('keydown', p.onKey, true);
    window.removeEventListener('scroll', p.onScroll, true);
    window.removeEventListener('resize', uiPopoverClose);
    p.el.remove();
    p.opts.onClose?.();
  }
  function uiPopover(anchor, content, opts = {}) {
    uiPopoverClose();
    const el = document.createElement('div');
    el.className = 'ui-pop' + (opts.className ? ' ' + opts.className : '');
    el.setAttribute('role', opts.role || 'menu');
    if (typeof content === 'string') el.innerHTML = content; else el.appendChild(content);
    document.body.appendChild(el);
    const place = () => {
      const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
      el.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
      el.style.top = (r.bottom + 6 + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
    };
    place();
    const onDown = e => { if (!el.contains(e.target) && !anchor.contains(e.target)) uiPopoverClose(); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); uiPopoverClose(); } };
    const onScroll = e => { if (!el.contains(e.target)) uiPopoverClose(); };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', uiPopoverClose);
    pop = { el, anchor, opts, onDown, onKey, onScroll, place };
    el.querySelector('button')?.focus({ preventScroll: true });
    return el;
  }
  // items: [{ label, run, danger, checked (true/false = Häkchen-Eintrag), keepOpen, hint }]
  function uiMenu(anchor, items, opts = {}) {
    const box = document.createElement('div');
    for (const it of items) {
      if (!it) { box.insertAdjacentHTML('beforeend', '<div class="ui-pop-sep"></div>'); continue; }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ui-pop-item' + (it.danger ? ' danger' : '') + (it.checked != null ? ' check' : '');
      b.setAttribute('role', it.checked != null ? 'menuitemcheckbox' : 'menuitem');
      if (it.checked != null) b.setAttribute('aria-checked', String(!!it.checked));
      b.innerHTML = (it.checked != null ? `<span class="ui-pop-tick">${it.checked ? '✓' : ''}</span>` : '')
        + `<span>${escapeHtml(it.label)}</span>` + (it.hint ? `<small>${escapeHtml(it.hint)}</small>` : '');
      b.onclick = () => { if (!it.keepOpen) uiPopoverClose(); it.run?.(); };
      box.appendChild(b);
    }
    return uiPopover(anchor, box, opts);
  }
  const uiPopoverKey = () => pop?.opts.key ?? null;

  // Esc schließt das oberste offene Fenster (.modal mit eigenem ×-Knopf), wie bei den eigenen Dialogen (23.10.2026)
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.defaultPrevented || open || pop) return;
    const modals = [...document.querySelectorAll('.modal')].filter(m => m.style.display === 'flex' || m.classList.contains('active'));
    modals.at(-1)?.querySelector('.modal-close')?.click();
  });

  // Beschädigte Datei beim Start (server/jsonStore.js): einmal je Browser-Sitzung melden (23.10.2026)
  document.addEventListener('DOMContentLoaded', () => setTimeout(() => {
    window.app?.socket?.on('data-problems', list => {
      const last = list?.at(-1)?.at;
      let seen = null;
      try { seen = sessionStorage.getItem('controlhub.dataProblems'); } catch { /* egal */ }
      if (!last || seen === last) return;
      try { sessionStorage.setItem('controlhub.dataProblems', last); } catch { /* egal */ }
      const name = f => String(f || '').split(/[\\/]/).pop();
      const lines = list.map(p => `• ${name(p.file)}: ${p.status === 'restored' ? 'letzte gute Fassung geladen' : 'mit Standardwerten gestartet'}`
        + (p.defekt ? ` (beschädigte Datei gesichert als ${name(p.defekt)})` : ''));
      uiAlert(`Beim Start war eine Datei beschädigt, z. B. nach einem Absturz beim Speichern:\n\n${lines.join('\n')}\n\nNichts wurde gelöscht. Prüf kurz, ob alles da ist.`, { title: 'Datei beschädigt' });
    });
  }, 0));

  Object.assign(window, { uiDialog, uiAlert, uiConfirm, uiPrompt, uiChoice, uiShowText, uiPopover, uiPopoverClose, uiMenu, uiPopoverKey });
})();
