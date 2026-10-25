/**
 * Wo wird eine Funktion oder ein Makro benutzt? (Durchsicht B2, 23.10.2026)
 *
 * Vorher blieben nach dem Löschen Tasten stumm und Makros übersprangen still einen Schritt. Jetzt zeigt die Oberfläche
 * vor dem Löschen die Fundstellen und kann die Belegungen mit entfernen.
 *
 * ref = Funktions-ID (z. B. 'func-123') oder 'macro:<id>' -- so stehen Funktionen und Makros auch in den Belegungen.
 * Reine Funktionen auf den Daten (test/verwendung.test.js); mit { entfernen: true } wird die Fundstelle gleich
 * entfernt, mit { ersetzen: '<neue Referenz>' } umgestellt (24.10.2026: „Profil … laden“ folgt dem Umbenennen).
 * Laden und Speichern der Dateien macht index.js (verwendungen()).
 */
import { CC_AXES } from './deviceProfiles.js';

const ROEMISCH = ['', 'I', 'II', 'III', 'IV'];
const SLOT_NAMEN = { craftslot1: 'CraftSlot 1', craftslot2: 'CraftSlot 2', craftunit: 'CraftUnit' };
const ACHS_NAMEN = Object.fromEntries(Object.values(CC_AXES).map(a => [a.index, a.label]));

// Tasten-Belegung: eine Referenz (Text) oder eine Liste von Referenzen. Eine Schnellbelegung (Liste von
// Aktions-Objekten) verweist auf nichts.
const trifft = (wert, ref) => wert === ref || (Array.isArray(wert) && wert.some(x => x === ref));
const ohne = (wert, ref) => {
  if (!Array.isArray(wert)) return undefined;
  const rest = wert.filter(x => x !== ref);
  return rest.length ? rest : undefined;
};

function tasten(belegung, ref, praefix, funde, entfernen, ersetzen = null) {
  for (const [taste, wert] of Object.entries(belegung || {})) {
    if (!trifft(wert, ref)) continue;
    funde.push(`${praefix}Taste ${taste}`);
    if (ersetzen) { belegung[taste] = Array.isArray(wert) ? wert.map(x => (x === ref ? ersetzen : x)) : ersetzen; continue; }
    if (!entfernen) continue;
    const rest = ohne(wert, ref);
    if (rest === undefined) delete belegung[taste];
    else belegung[taste] = rest;
  }
}

/** Fundstellen in einem Profil: Tasten, Ebenen II–IV, Achsen (Funktion bei + / −), Achsen-Auslöser */
export function imProfil(profil, ref, { entfernen = false, ersetzen = null } = {}) {
  const funde = [];
  if (!profil || typeof profil !== 'object') return funde;
  tasten(profil.buttons, ref, '', funde, entfernen, ersetzen);
  for (const [slot, ebenen] of Object.entries(profil.craftSlotLayers || {})) {
    for (const [ebene, belegung] of Object.entries(ebenen || {})) {
      tasten(belegung, ref, `Ebene ${ROEMISCH[ebene] || ebene} · ${SLOT_NAMEN[slot] || slot} · `, funde, entfernen, ersetzen);
    }
  }
  funde.push(...inAchsen(profil.axes, ref, { entfernen, ersetzen }));
  if (profil.axisTriggers && Object.hasOwn(profil.axisTriggers, ref)) {
    funde.push('Achsen-Auslöser');
    if (ersetzen) profil.axisTriggers[ersetzen] = profil.axisTriggers[ref];
    if (entfernen || ersetzen) delete profil.axisTriggers[ref];
  }
  return funde;
}

/** Achsen-Zuordnung (im Profil oder global): Funktion bei Ausschlag + bzw. − */
export function inAchsen(achsen, ref, { entfernen = false, ersetzen = null } = {}) {
  const funde = [];
  for (const [index, m] of Object.entries(achsen || {})) {
    for (const [feld, zeichen] of [['functionPlus', '+'], ['functionMinus', '−']]) {
      if (m?.[feld] !== ref) continue;
      funde.push(`Achse ${ACHS_NAMEN[index] || `Nr. ${Number(index) + 1}`} (${zeichen})`);
      if (ersetzen) m[feld] = ersetzen;
      else if (entfernen) m[feld] = null;
    }
  }
  return funde;
}

/**
 * Makro-Schritte, die die Funktion auslösen. Entfernen nimmt den Schritt heraus; ein Makro, das dadurch leer wird,
 * steht in `leer` (der Aufrufer löscht es dann samt seiner eigenen Belegungen).
 */
export function inMakros(makros, ref, { entfernen = false, ersetzen = null } = {}) {
  const funde = [];
  const leer = [];
  for (const [id, m] of Object.entries(makros || {})) {
    const schritte = Array.isArray(m?.steps) ? m.steps : [];
    schritte.forEach((s, i) => { if (s?.functionId === ref) funde.push(`Makro „${m.name || id}“ · Schritt ${i + 1}`); });
    if (ersetzen) { schritte.forEach(s => { if (s?.functionId === ref) s.functionId = ersetzen; }); continue; }
    if (entfernen && schritte.some(s => s?.functionId === ref)) {
      m.steps = schritte.filter(s => s?.functionId !== ref);
      if (!m.steps.length) leer.push(id);
    }
  }
  return { funde, leer };
}

/** Tasten auf eigenen Kacheln (Tastenfeld-Seiten, steuerungsmenues) */
export function inKacheln(seiten, ref, { entfernen = false, ersetzen = null } = {}) {
  const funde = [];
  for (const seite of Object.values(seiten || {})) {
    (seite?.buttons || []).forEach((b, i) => {
      if (b?.functionId !== ref) return;
      funde.push(`Kachel „${seite.name || seite.id}“ · Taste ${b.label ? `„${b.label}“` : i + 1}`);
      if (ersetzen) b.functionId = ersetzen;
      else if (entfernen) b.functionId = null;
    });
  }
  return funde;
}

/** Tastenleisten an den Kacheln der Startseite (kacheln.json, settings[baustein].keys) */
export function inKachelseiten(config, ref, { entfernen = false, ersetzen = null } = {}) {
  const funde = [];
  for (const seite of config?.pages || []) {
    for (const einst of Object.values(seite?.settings || {})) {
      const keys = Array.isArray(einst?.keys) ? einst.keys : [];
      keys.filter(k => k?.functionId === ref).forEach(k => funde.push(`Startseite „${seite.name || seite.id}“ · Tastenleiste „${k.label || 'Taste'}“`));
      if (ersetzen) keys.forEach(k => { if (k?.functionId === ref) k.functionId = ersetzen; });
      else if (entfernen && keys.some(k => k?.functionId === ref)) einst.keys = keys.filter(k => k?.functionId !== ref);
    }
  }
  return funde;
}

/** GPS-Auslöser am Vorgewende: gespeicherte Geräte und die gerade benutzten Einstellungen */
export function inGps(config, ref, { entfernen = false, ersetzen = null } = {}) {
  const funde = [];
  const pruefen = (einst, wo) => {
    for (const [feld, name] of [['exit', 'Ausfahrt'], ['entry', 'Einfahrt']]) {
      if (einst?.[feld]?.functionId !== ref) continue;
      funde.push(`${wo} · ${name}`);
      if (ersetzen) einst[feld].functionId = ersetzen;
      else if (entfernen) einst[feld] = null;
    }
  };
  for (const [name, einst] of Object.entries(config?.devices || {})) pruefen(einst, `GPS-Gerät „${name}“`);
  pruefen(config?.live, 'GPS (aktuelle Einstellungen)');
  return funde;
}
