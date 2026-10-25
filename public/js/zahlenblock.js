/**
 * Zahlen-Eingabe mit Ziffernblock (Hendrik 24.10.2026: „Die Zahlen im GPS-Menü … sind manchmal krumm, wenn sie aus dem
 * Spiel ausgelesen werden … über die Bildschirmtastatur (am besten ein extra Numpad) eingeben … begrenzen auf
 * 0,01-Schritte und nur bis zum Maximalwert“). Tippen am Ziffernblock oder mit der echten Tastatur.
 *
 *   const v = await zahlenEingabe({ titel: 'Breite', wert: 6.37, min: 0.5, max: 50, schritt: 0.01, einheit: 'm', automatisch: true })
 *   → Zahl (gerundet auf den Schritt, im Bereich), 'auto' (Knopf „Automatisch“) oder null (abgebrochen)
 */
(function () {
  const komma = n => String(n).replace('.', ',');
  const stellen = schritt => (String(schritt).split('.')[1] || '').length;

  function zahlenEingabe(o) {
    const { titel = 'Wert', min = -Infinity, max = Infinity, schritt = 0.01, einheit = '', automatisch = false, hinweis = '' } = o || {};
    const nk = stellen(schritt);
    const negativ = min < 0;
    let text = o?.wert == null || !Number.isFinite(Number(o.wert)) ? '' : komma(Number(o.wert));
    let erstesTippen = true;   // erste Ziffer ersetzt den alten Wert (wie bei einem Taschenrechner)

    return new Promise(resolve => {
      const el = document.createElement('div');
      el.className = 'zb-hinter';
      el.innerHTML = `
        <div class="zb" role="dialog" aria-modal="true" aria-label="${escapeHtml(titel)}">
          <div class="zb-kopf"><b>${escapeHtml(titel)}</b><small>${komma(min)} bis ${komma(max)} ${escapeHtml(einheit)}${nk ? `, Schritte ${komma(schritt)}` : ''}</small></div>
          <div class="zb-anzeige"><span class="zb-wert"></span><span class="zb-einheit">${escapeHtml(einheit)}</span></div>
          <div class="zb-meldung"></div>
          <div class="zb-tasten">
            ${['7', '8', '9', '⌫', '4', '5', '6', negativ ? '±' : '', '1', '2', '3', nk ? ',' : '', '0'].map(t =>
              t ? `<button type="button" class="zb-t${t === '⌫' ? ' zb-t--weg' : ''}${t === '0' ? ' zb-t--null' : ''}" data-t="${t}">${t}</button>` : '<span></span>').join('')}
          </div>
          ${hinweis ? `<p class="zb-hinweis">${escapeHtml(hinweis)}</p>` : ''}
          <div class="zb-fuss">
            ${automatisch ? '<button type="button" class="btn-secondary" data-a="auto">Automatisch</button>' : ''}
            <span style="flex:1"></span>
            <button type="button" class="btn-secondary" data-a="ab">Abbrechen</button>
            <button type="button" class="btn-success" data-a="ok">Übernehmen</button>
          </div>
        </div>`;
      document.body.appendChild(el);
      const anzeige = el.querySelector('.zb-wert'), meldung = el.querySelector('.zb-meldung');

      const wertAus = () => {
        const n = Number(text.replace(',', '.'));
        return text === '' || text === '-' || !Number.isFinite(n) ? null : n;
      };
      const zeichne = () => {
        anzeige.textContent = text === '' ? '–' : text.replace('-', '−');
        const n = wertAus();
        meldung.textContent = n == null ? '' : n > max ? `höchstens ${komma(max)} ${einheit}` : n < min ? `mindestens ${komma(min)} ${einheit}` : '';
        el.querySelector('[data-a="ok"]').disabled = n == null;
      };
      const tippe = t => {
        if (t === '⌫') { text = erstesTippen ? '' : text.slice(0, -1); erstesTippen = false; return zeichne(); }
        if (t === '±') { text = text.startsWith('-') ? text.slice(1) : '-' + text; erstesTippen = false; return zeichne(); }
        if (erstesTippen) { text = text.startsWith('-') && negativ ? '-' : ''; erstesTippen = false; }
        if (t === ',') {
          if (!nk || text.includes(',')) return;
          text = (text === '' || text === '-' ? text + '0' : text) + ',';
          return zeichne();
        }
        const [, nach = null] = text.split(',');
        if (nach != null && nach.length >= nk) return;                   // höchstens so viele Nachkommastellen wie der Schritt
        const vorher = text.replace('-', '').split(',')[0];
        if (nach == null && vorher.length >= 3) return;                  // keine unsinnig langen Zahlen
        text = (text === '0' ? '' : text === '-0' ? '-' : text) + t;
        zeichne();
      };
      const fertig = (ergebnis) => {
        document.removeEventListener('keydown', taste, true);
        el.remove();
        resolve(ergebnis);
      };
      const uebernehmen = () => {
        const n = wertAus();
        if (n == null) return;
        const gerundet = Math.round(n / schritt) * schritt;
        fertig(Number(Math.min(max, Math.max(min, gerundet)).toFixed(nk)));
      };
      const taste = (e) => {
        if (/^[0-9]$/.test(e.key)) tippe(e.key);
        else if (e.key === ',' || e.key === '.') tippe(',');
        else if (e.key === 'Backspace') tippe('⌫');
        else if (e.key === '-' && negativ) tippe('±');
        else if (e.key === 'Enter') uebernehmen();
        else if (e.key === 'Escape') fertig(null);
        else return;
        e.preventDefault();
        e.stopPropagation();
      };
      el.addEventListener('click', e => {
        if (e.target === el) return fertig(null);
        const t = e.target.closest('[data-t]')?.dataset.t;
        if (t) return tippe(t);
        const a = e.target.closest('[data-a]')?.dataset.a;
        if (a === 'ok') uebernehmen();
        else if (a === 'ab') fertig(null);
        else if (a === 'auto') fertig('auto');
      });
      document.addEventListener('keydown', taste, true);
      zeichne();
    });
  }

  window.zahlenEingabe = zahlenEingabe;
})();
