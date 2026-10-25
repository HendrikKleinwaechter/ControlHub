/**
 * Gruppen-Verwaltung (Funktionen): anlegen/umbenennen/löschen/sortieren, unabhängig vom Import.
 * Gruppen selbst stehen server-seitig in server/config/categories.json (FunctionsManager). Eine
 * Funktion kann in mehreren Gruppen gleichzeitig sein (s. functionGroups.js) -- die Zählung hier
 * zählt entsprechend pro Gruppe, nicht pro Funktion.
 */

class CategoryManager {
  constructor() {
    this.modal = document.getElementById('category-modal');
    this.body = document.getElementById('category-modal-body');
    this.categories = [];
    this.counts = {};
    this.uncategorizedCount = 0;
    this.protectedCategories = [];
  }

  async open() {
    this.modal.style.display = 'flex';
    this.suche = '';
    this.body.innerHTML = '';
    await this.load();
  }

  close() {
    this.modal.style.display = 'none';
  }

  async load() {
    try {
      const res = await fetch('/api/functions');
      const data = await res.json();
      this.categories = data.categories || [];
      this.protectedCategories = data.protectedCategories || [];
      this.counts = {};
      this.uncategorizedCount = 0;
      for (const func of data.functions || []) {
        if (!func.categories || func.categories.length === 0) { this.uncategorizedCount++; continue; }
        for (const cat of func.categories) this.counts[cat] = (this.counts[cat] || 0) + 1;
      }
    } catch (error) {
      console.error('Gruppen konnten nicht geladen werden:', error);
    }
    if (this.body.querySelector('.cm-liste-wrap')) this.renderListe(); else this.render();
  }

  // Liste im Stil der Profile und Makros (Hendrik 24.10.2026: „Die Gruppenverwaltung bei den Funktionen ist etwas
  // unübersichtlich“): Obergruppen eingeklappt, Untergruppen erst beim Aufklappen; je Zeile nur „⋯“ (Umbenennen,
  // Untergruppe, Funktionen zeigen, Nach oben/unten, Löschen) und der Griff ≡ zum Sortieren per Ziehen innerhalb der
  // Ebene; Suchfeld; Systemgruppen getrennt unter „Fest eingebaut“. Name antippen = umbenennen.
  render() {
    this.offen = this.offen || new Set();
    this.body.innerHTML = `
      <div class="cm-kopf">
        <input type="search" class="cm-suche" placeholder="Gruppe suchen …" value="${escapeHtml(this.suche || '')}" aria-label="Gruppe suchen">
        <button type="button" class="btn-secondary btn-small" data-act="alle"></button>
      </div>
      <p class="cm-info">Name antippen benennt um, „⋯“ für mehr. Am Griff ≡ ziehen ändert die Reihenfolge.</p>
      <div class="cm-liste-wrap"></div>`;
    const suche = this.body.querySelector('.cm-suche');
    suche.addEventListener('input', () => { this.suche = suche.value; this.renderListe(); });
    this.body.querySelector('[data-act="alle"]').addEventListener('click', () => {
      const ober = this.eigene().filter(k => k.kinder.length).map(k => k.name);
      this.offen = ober.every(n => this.offen.has(n)) ? new Set() : new Set(ober);
      this.renderListe();
    });
    this.renderListe();
    const foot = document.getElementById('category-modal-footer');
    if (foot) foot.innerHTML = `<button type="button" class="btn-primary" onclick="window.categoryManager.neueGruppe()">+ Neue Gruppe</button>
      <span style="flex:1"></span><button type="button" class="btn-secondary" onclick="window.categoryManager.close()">Schließen</button>`;
  }

  eigene() { return (this.baum || []).filter(k => !this.protectedCategories.includes(k.name)); }

  renderListe() {
    const FG = window.FunctionGroups;
    this.baum = FG.gruppenBaum(this.categories);
    const q = (this.suche || '').trim().toLowerCase();
    const passt = n => n.toLowerCase().includes(q);
    const zaehle = g => Object.entries(this.counts).filter(([c]) => c === g || c.startsWith(g + FG.UG)).reduce((n, [, k]) => n + k, 0);
    const anzahl = n => `${n} ${n === 1 ? 'Funktion' : 'Funktionen'}`;
    const DOTS = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><circle cx="19" cy="12" r="1.8"></circle></svg>';
    const CHEV = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
    const zeile = (name, label, sub, { unter = false, kinder = 0, offen = false, fest = false } = {}) => `
      <div class="fn-row cm-zeile${unter ? ' cm-zeile--unter' : ''}" data-name="${escapeHtml(name)}">
        ${q || fest ? '<span class="cm-griff-platz"></span>' : '<span class="pf-grip cm-griff" title="Ziehen zum Sortieren" aria-hidden="true">≡</span>'}
        ${kinder ? `<button type="button" class="cm-auf${offen ? ' offen' : ''}" data-act="auf" aria-label="${offen ? 'Zuklappen' : 'Aufklappen'}" aria-expanded="${offen}">${CHEV}</button>` : '<span class="cm-auf-platz"></span>'}
        <button type="button" class="fn-open" data-act="name"${fest ? ' disabled' : ''}><span class="fn-txt"><b>${escapeHtml(label)}</b><small>${escapeHtml(sub)}</small></span></button>
        <button type="button" class="ov-icon-btn" data-act="mehr" aria-label="Weitere Aktionen für ${escapeHtml(label)}" aria-haspopup="menu">${DOTS}</button>
      </div>`;
    const block = (k, fest = false) => {
      const kinder = q ? k.kinder.filter(c => passt(FG.groupLabel(c, true)) || passt(k.name)) : k.kinder;
      if (q && !passt(k.name) && !kinder.length) return '';
      const offen = !!q || this.offen.has(k.name);
      const sub = `${anzahl(zaehle(k.name))}${k.kinder.length ? ` · ${k.kinder.length} ${k.kinder.length === 1 ? 'Untergruppe' : 'Untergruppen'}` : ''}`;
      return `<div class="cm-block" data-name="${escapeHtml(k.name)}">${zeile(k.name, k.name, sub, { kinder: k.kinder.length, offen, fest })}
        ${offen && kinder.length ? `<div class="cm-kinder">${kinder.map(c => zeile(c, FG.groupLabel(c, true), anzahl(this.counts[c] || 0), { unter: true })).join('')}</div>` : ''}</div>`;
    };
    const eigene = this.eigene(), system = this.baum.filter(k => this.protectedCategories.includes(k.name));
    const eigenHtml = eigene.map(k => block(k)).join('');
    const systemHtml = system.map(k => block(k, true)).join('');
    const wrap = this.body.querySelector('.cm-liste-wrap');
    wrap.innerHTML = `
      <div class="cm-liste" data-ebene="ober">${eigenHtml || `<p class="cm-leer">${q ? 'Keine Gruppe gefunden.' : 'Noch keine eigenen Gruppen.'}</p>`}</div>
      ${systemHtml ? `<div class="cm-sec">Fest eingebaut</div><div class="cm-liste cm-liste--fest">${systemHtml}</div>` : ''}
      <p class="cm-info cm-ohne">${FG.UNCATEGORIZED_LABEL}: ${anzahl(this.uncategorizedCount)} (automatisch, für Funktionen ohne Gruppe)</p>`;
    const alle = this.body.querySelector('[data-act="alle"]');
    const mitKindern = eigene.filter(k => k.kinder.length).map(k => k.name);
    if (alle) { alle.textContent = mitKindern.length && mitKindern.every(n => this.offen.has(n)) ? 'Alle zuklappen' : 'Alle aufklappen'; alle.hidden = !!q || !mitKindern.length; }

    wrap.querySelectorAll('.cm-zeile').forEach(row => {
      const name = row.dataset.name;
      row.querySelector('[data-act="auf"]')?.addEventListener('click', () => {
        const auf = !this.offen.has(name);
        if (auf) this.offen.add(name); else this.offen.delete(name);
        this.renderListe();
        // aufgeklappte Untergruppen gleich ins Bild holen (unten in der Liste sonst erst nach Blättern zu sehen)
        if (auf) [...this.body.querySelectorAll('.cm-block')].find(b => b.dataset.name === name)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
      row.querySelector('[data-act="name"]').addEventListener('click', () => this.umbenennen(name));
      row.querySelector('[data-act="mehr"]').addEventListener('click', e => this.menue(name, e.currentTarget));
      const griff = row.querySelector('.cm-griff');
      if (!griff) return;
      const unter = row.classList.contains('cm-zeile--unter');
      griff.addEventListener('pointerdown', e => {
        const el = unter ? row : row.closest('.cm-block');
        const geschw = unter ? [...row.parentElement.querySelectorAll(':scope > .cm-zeile')] : [...wrap.querySelectorAll('.cm-liste[data-ebene="ober"] > .cm-block')];
        this.ziehen(e, el, geschw, (von, nach) => this.sortiere(unter ? FG.teileGruppe(name).ober : null, von, nach));
      });
    });
  }

  // „⋯“ je Gruppe
  menue(name, anker) {
    const FG = window.FunctionGroups;
    const fest = this.protectedCategories.includes(name);
    const { ober, unter } = FG.teileGruppe(name);
    const liste = unter != null ? (this.baum.find(k => k.name === ober)?.kinder || []) : this.eigene().map(k => k.name);
    const i = liste.indexOf(name);
    uiMenu(anker, [
      { label: 'Funktionen zeigen', run: () => { this.close(); window.appNav?.go?.('functions'); window.app?.switchCategoryTab?.(name); } },
      ...(fest ? [] : [
        { label: 'Umbenennen', run: () => this.umbenennen(name) },
        ...(unter == null ? [{ label: 'Untergruppe anlegen', run: () => this.createSub(name) }] : []),
        ...(!this.suche && i > 0 ? [{ label: 'Nach oben', run: () => this.sortiere(unter != null ? ober : null, i, i - 1) }] : []),
        ...(!this.suche && i >= 0 && i < liste.length - 1 ? [{ label: 'Nach unten', run: () => this.sortiere(unter != null ? ober : null, i, i + 1) }] : []),
        null,
        { label: 'Löschen', danger: true, run: () => this.removeName(name) }
      ])
    ], { key: 'gruppe:' + name });
  }

  // Ziehen per Pointer-Events wie bei den Profilen (läuft auch per Touch): Nachbarn rutschen live, gespeichert wird beim Loslassen
  ziehen(e, el, geschw, fertig) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const start = geschw.indexOf(el);
    if (start < 0) return;
    e.preventDefault();
    const rects = geschw.map(x => x.getBoundingClientRect());
    const h = rects[start].height;
    const y0 = e.clientY;
    let ziel = start;
    el.classList.add('dragging');
    const ziehtMit = ev => {
      const d = ev.clientY - y0;
      el.style.transform = `translateY(${d}px)`;
      const mitte = rects[start].top + h / 2 + d;
      ziel = geschw.filter((x, k) => k !== start && rects[k].top + rects[k].height / 2 < mitte).length;
      geschw.forEach((x, k) => {
        if (k === start) return;
        const shift = start < ziel && k > start && k <= ziel ? -h : start > ziel && k >= ziel && k < start ? h : 0;
        x.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };
    const los = () => {
      document.removeEventListener('pointermove', ziehtMit);
      document.removeEventListener('pointerup', los);
      document.removeEventListener('pointercancel', los);
      geschw.forEach(x => { x.style.transform = ''; });
      el.classList.remove('dragging');
      if (ziel !== start) fertig(start, ziel);
    };
    document.addEventListener('pointermove', ziehtMit);
    document.addEventListener('pointerup', los);
    document.addEventListener('pointercancel', los);
  }

  // Reihenfolge ändern: ober = null (Obergruppen) bzw. Name der Obergruppe (ihre Untergruppen); Systemgruppen bleiben hinten
  async sortiere(ober, von, nach) {
    const baum = this.baum.map(k => ({ ...k, kinder: [...k.kinder] }));
    const eigene = baum.filter(k => !this.protectedCategories.includes(k.name)), system = baum.filter(k => this.protectedCategories.includes(k.name));
    const liste = ober == null ? eigene : eigene.find(k => k.name === ober)?.kinder;
    if (!liste || von < 0 || von >= liste.length || nach < 0 || nach >= liste.length) return;
    liste.splice(nach, 0, liste.splice(von, 1)[0]);
    const order = [...eigene, ...system].flatMap(k => [...(this.categories.includes(k.name) ? [k.name] : []), ...k.kinder]);
    try {
      const res = await fetch('/api/categories/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order })
      });
      const result = await res.json();
      if (!result.success) { uiAlert('Sortieren fehlgeschlagen: ' + result.error); return; }
      await this.refreshEverywhere();
    } catch (error) {
      uiAlert('Sortieren fehlgeschlagen: ' + error.message);
    }
  }

  async umbenennen(name) {
    const FG = window.FunctionGroups;
    const { ober, unter } = FG.teileGruppe(name);
    const alt = unter ?? name;
    const neu = (await uiPrompt(unter != null ? `Neuer Name der Untergruppe in „${ober}“:` : 'Neuer Name der Gruppe:', alt, { title: 'Gruppe umbenennen', ok: 'Umbenennen' }))?.trim();
    if (!neu || neu === alt) return;
    await this.renameTo(name, unter != null ? `${ober}${FG.UG}${neu}` : neu);
  }

  async neueGruppe() {
    const name = (await uiPrompt('Name der neuen Gruppe:', '', { title: 'Neue Gruppe', ok: 'Anlegen' }))?.trim();
    if (name) await this.createNamed(name);
  }

  async createSub(ober) {
    const name = (await uiPrompt(`Name der Untergruppe in „${ober}“:`, '', { title: 'Untergruppe anlegen', ok: 'Anlegen' }))?.trim();
    if (!name) return;
    await this.createNamed(`${ober}${window.FunctionGroups.UG}${name}`);
  }

  async refreshEverywhere() {
    await this.load();
    if (window.app?.loadFunctions) await window.app.loadFunctions();
  }

  async renameTo(oldName, rawValue) {
    const newName = (rawValue || '').trim();
    const FG = window.FunctionGroups;
    if (!oldName || !newName || newName === oldName || newName.endsWith(FG.UG.trim()) || newName.endsWith(FG.UG)) {
      this.render(); // Eingabefeld auf den Ausgangswert zurücksetzen, falls leer/unverändert
      return;
    }
    try {
      const res = await fetch('/api/categories/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName, newName })
      });
      const result = await res.json();
      if (!result.success) {
        uiAlert('Umbenennen fehlgeschlagen: ' + result.error);
        this.render();
        return;
      }
      window.showToast(`"${oldName}" → "${newName}" umbenannt`);
      await this.refreshEverywhere();
    } catch (error) {
      uiAlert('Umbenennen fehlgeschlagen: ' + error.message);
      this.render();
    }
  }

  async removeName(name) {
    if (!name) return;
    if (this.protectedCategories.includes(name)) return; // Button ist ohnehin disabled, s. render()

    let impact;
    try {
      const res = await fetch(`/api/categories/${encodeURIComponent(name)}/deletion-impact`);
      impact = await res.json();
    } catch (error) {
      uiAlert('Löschen fehlgeschlagen: konnte Auswirkung nicht prüfen (' + error.message + ')');
      return;
    }

    const doDelete = async (funktionen = 'loeschen') => {
      try {
        const res = await fetch(`/api/categories/${encodeURIComponent(name)}?funktionen=${funktionen}`, { method: 'DELETE' });
        const result = await res.json();
        if (!result.success) {
          uiAlert('Löschen fehlgeschlagen: ' + result.error);
          return;
        }
        window.showToast(`Gruppe "${name}" gelöscht`);
        await this.refreshEverywhere();
      } catch (error) {
        uiAlert('Löschen fehlgeschlagen: ' + error.message);
      }
    };

    const kinder = (this.baum || []).find(k => k.name === name)?.kinder.length || 0;
    const was = kinder ? `Gruppe „${name}“ mit ${kinder === 1 ? 'ihrer Untergruppe' : `ihren ${kinder} Untergruppen`}` : `Gruppe „${name}“`;
    if (!impact.success || impact.toDelete.length === 0) {
      // Keine Funktion stünde danach ohne Gruppe da (Gruppe leer oder alle noch anderweitig zugeordnet) -- einfache Nachfrage reicht.
      window.confirmDialog.show(`${was} wirklich löschen?`, () => doDelete());
      return;
    }

    // Hendrik 24.10.2026: immer fragen, ob die Funktionen mitgelöscht oder nach „Ohne Gruppe“ verschoben werden.
    // Mitlöschen bleibt doppelt abgesichert (frühere Vorgabe: muss unmissverständlich sein).
    const n = impact.toDelete.length;
    const list = impact.toDelete.slice(0, 8).map(f => `• ${f}`).join('\n') + (n > 8 ? `\n… und ${n - 8} weitere` : '');
    const wahl = await uiChoice(`${was} löschen. ${n === 1 ? 'Eine Funktion steht' : `${n} Funktionen stehen`} in keiner anderen Gruppe:\n${list}\n\nWas soll mit ${n === 1 ? 'ihr' : 'ihnen'} passieren?`, [
      { label: 'Mit löschen', value: 'loeschen', danger: true },
      { label: 'Nach „Ohne Gruppe“ verschieben', value: 'behalten' }
    ], { title: 'Gruppe löschen' });
    if (!wahl) return;
    if (wahl === 'behalten') { await doDelete('behalten'); return; }
    window.confirmDialog.show(
      `Wirklich sicher? Diese ${n} Funktion(en) werden UNWIDERRUFLICH gelöscht, nicht nur aus der Gruppe entfernt.`,
      () => doDelete('loeschen')
    );
  }

  async create() {
    const input = document.getElementById('new-category-name');
    const name = input.value.trim();
    if (!name) return;
    await this.createNamed(name);
  }

  async createNamed(name) {
    try {
      const res = await fetch('/api/categories/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const result = await res.json();
      if (!result.success) {
        uiAlert('Anlegen fehlgeschlagen: ' + result.error);
        return;
      }
      window.showToast(`Gruppe "${name}" angelegt`);
      await this.refreshEverywhere();
    } catch (error) {
      uiAlert('Anlegen fehlgeschlagen: ' + error.message);
    }
  }
}

window.categoryManager = new CategoryManager();
