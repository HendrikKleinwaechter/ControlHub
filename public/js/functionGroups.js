/**
 * Gemeinsame Helfer für Funktionsgruppen (Mehrfachzuordnung + Auffanggruppe), damit nicht jede der
 * mehreren Stellen, die Funktionen nach Gruppe filtern (app.js, actionPicker.js), ihre eigene Kopie dieser Logik
 * pflegt.
 *
 * `func.categories` ist ein Array von Gruppennamen (kann leer sein -- das IST die Auffanggruppe,
 * kein Sonderfall/Fehler). UNCATEGORIZED_ID ist ein rein client-seitiges Pseudo-Gruppen-Kennzeichen,
 * taucht NIE in categories.json auf und kann nicht umbenannt/gelöscht werden wie eine echte Gruppe.
 *
 * Untergruppen (Hendrik 24.10.2026: „Unterkategorien … sollten wir einführen“): eine Ebene, als Name
 * „Obergruppe › Untergruppe“ (UG, wie server/inputBindingImporter.js). Die Obergruppe zählt ihre Untergruppen mit;
 * eine Funktion kann direkt in der Obergruppe stehen oder in einer Untergruppe.
 */

const UNCATEGORIZED_ID = '__uncategorized__';
const UNCATEGORIZED_LABEL = 'Ohne Gruppe';
const UG = ' › ';

function teileGruppe(name) {
  const s = String(name ?? '');
  const i = s.indexOf(UG);
  return i < 0 ? { ober: s, unter: null } : { ober: s.slice(0, i), unter: s.slice(i + UG.length) };
}

// mitUnter: bei einer Obergruppe auch die Funktionen ihrer Untergruppen
function functionInGroup(func, groupId, mitUnter = false) {
  if (groupId === UNCATEGORIZED_ID) return !func.categories || func.categories.length === 0;
  if (!Array.isArray(func.categories)) return false;
  if (func.categories.includes(groupId)) return true;
  return mitUnter && func.categories.some(c => String(c).startsWith(groupId + UG));
}

// Reihenfolge für Tab-/Dropdown-Listen: echte Gruppen in der Reihenfolge aus categories.json,
// Auffanggruppe IMMER als letzter Eintrag angehängt (fest, nimmt nicht an der Sortierung teil).
function groupTabList(categories) {
  return [...categories, UNCATEGORIZED_ID];
}

// kurz: bei einer Untergruppe nur ihr eigener Name (für die eingerückte Zeile unter der Obergruppe)
function groupLabel(groupId, kurz = false) {
  if (groupId === UNCATEGORIZED_ID) return UNCATEGORIZED_LABEL;
  return kurz ? (teileGruppe(groupId).unter ?? groupId) : groupId;
}

/**
 * Baum aus der flachen Gruppenliste: [{ name, kinder: [voller Name, …] }] in der Reihenfolge der Liste. Eine Obergruppe
 * erscheint auch, wenn nur ihre Untergruppen in der Liste stehen; weitere Namen (z. B. aus Funktionen) kommen hinten dran.
 */
function gruppenBaum(categories, extra = []) {
  const baum = [], index = new Map();
  for (const c of [...categories, ...extra]) {
    const { ober, unter } = teileGruppe(c);
    let k = index.get(ober);
    if (!k) { k = { name: ober, kinder: [] }; index.set(ober, k); baum.push(k); }
    if (unter != null && !k.kinder.includes(c)) k.kinder.push(c);
  }
  return baum;
}

/**
 * Gruppenliste als aufklappbare Liste (Funktionen-Seite und Funktionswahl): Obergruppen mit Anzahl (inkl. Untergruppen);
 * aufgeklappt ist die gewählte Obergruppe bzw. die Obergruppe der gewählten Untergruppe.
 * @param {Array} knoten    gruppenBaum()
 * @param {Array} funktionen  zum Zählen
 * @param {string|null} aktuell  gewählte Gruppe (voller Name)
 * @param {object} [o]  { klasse: CSS-Klasse der Knöpfe (Standard fn-group), attr: Name des data-Attributs (Standard group) }
 */
function gruppenListeHtml(knoten, funktionen, aktuell, o = {}) {
  const klasse = o.klasse || 'fn-group', attr = o.attr || 'group';
  const anzahl = (g, mitUnter) => funktionen.filter(f => functionInGroup(f, g, mitUnter)).length;
  const offen = aktuell != null ? teileGruppe(aktuell).ober : null;
  const knopf = (g, text, n, extraKlasse = '') => {
    const cur = g === aktuell;
    return `<button type="button" class="${klasse}${extraKlasse}${cur ? ' active' : ''}" data-${attr}="${escapeHtml(g)}"${cur ? ' aria-current="true"' : ''}>
      <span>${text}</span><span class="fn-group-n${n ? '' : ' zero'}">${n}</span></button>`;
  };
  return knoten.map(k => {
    const auf = k.kinder.length && offen === k.name;
    const pfeil = k.kinder.length ? `<i class="fn-chev${auf ? ' auf' : ''}" aria-hidden="true">›</i>` : '';
    let html = knopf(k.name, `${pfeil}${escapeHtml(groupLabel(k.name))}`, anzahl(k.name, true), k.kinder.length ? ' fn-group--ober' : '');
    if (auf) html += `<div class="fn-group-kinder">${k.kinder.map(c => knopf(c, escapeHtml(groupLabel(c, true)), anzahl(c, false), ' fn-group--unter')).join('')}</div>`;
    return html;
  }).join('');
}

window.FunctionGroups = { UNCATEGORIZED_ID, UNCATEGORIZED_LABEL, UG, teileGruppe, functionInGroup, groupTabList, groupLabel, gruppenBaum, gruppenListeHtml };
