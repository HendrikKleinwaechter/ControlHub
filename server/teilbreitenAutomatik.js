/**
 * Teilbreiten automatisch schalten, zweite Fassung (Hendrik 24.10.2026: Precision Farming schaltet die Teilbreiten des
 * Düngerstreuers nicht -- „wesentlich schneller reagieren und alle Teilbreiten wieder einschalten, sobald das Gerät
 * ausgeschaltet wurde“). Die erste Fassung (23.10., wieder entfernt) drückte je Seite und Takt höchstens eine Taste und
 * wartete danach bis zu 1,5 s auf die Rückmeldung des Spiels; bei 6 Teilbreiten je Seite viel zu langsam.
 *
 * Läuft im Server (auch ohne Tablet) in jedem Takt der Spieldaten, nach der bearbeiteten Fläche (server/index.js).
 * Geschaltet wird nur per Tastendruck, mit denselben Spieltasten wie von Hand (VARIABLE_WORK_WIDTH_LEFT/RIGHT):
 * „aus“ nimmt außen eine Teilbreite weg, „an“ schaltet eine dazu. Die Mod ruft
 * dafür nichts im Spiel auf, sie meldet nur den Zustand (unit#sec).
 *
 * - Je Seite wird die Zielzahl aktiver Teilbreiten auf einmal bestimmt; die nötigen Tasten gehen kurz hintereinander
 *   raus (PULS_MS gedrückt, PAUSE_MS los). Danach wartet die Seite, bis das Spiel die Zielzahl meldet, höchstens
 *   n · (PULS_MS + PAUSE_MS) + RUECKMELDUNG_MS (als Gast im Mehrspieler RUECKMELDUNG_GAST_MS).
 * - Zielzahl: von außen nach innen die erste Teilbreite, die am vorausberechneten Ort taugt. Eine aktive bleibt an,
 *   solange weniger als „Schwelle“ von ihr schlecht ist (schon bearbeitet oder außerhalb jedes Felds); eine
 *   ausgeschaltete kommt erst wieder dazu, wenn höchstens Schwelle − 30 % schlecht ist (gegen Flattern).
 * - Nur beim Arbeiten (wie „Fläche zählt als bearbeitet“), ausgeklappt, vorwärts, ab 1 km/h.
 * - Gerät ausgeschaltet (ohne Ein/Aus: angehoben) → alle Teilbreiten wieder an.
 * - Gilt je Gerät („Teilbreiten automatisch“, gps.json einheiten[Name].tb), nicht für Spritzen mit Precision Farming
 *   (PF schaltet dort seine Düsen selbst).
 * - Sperre und noch ausstehende Drücke gehören zum Gerät: Wechselt das Gerät oder wird es ausgeschaltet, fallen noch
 *   nicht gesendete Drücke weg (Durchsicht 24.10.2026 -- sonst schaltete eine alte „aus“-Folge nach dem Ausschalten
 *   gegen das Wieder-Anschalten).
 */
import '../public/js/teilbreiten.js';
import { vehicleFrame } from './gpsEngine.js';
import { unitArbeitet, eingeklappt } from './flaeche.js';

export const PULS_MS = 70;
export const PAUSE_MS = 60;
export const RUECKMELDUNG_MS = 700;
// Als Gast im Mehrspieler geht der Tastendruck über den Server zurück zum Spieler (Mehrspieler-Prüfung R8): länger warten,
// sonst läuft die Sperre ab, bevor die Rückmeldung da ist, und es wird doppelt geschaltet.
export const RUECKMELDUNG_GAST_MS = 1500;
const WIEDER_AN_MS = 6000;   // so lange nach dem Ausschalten wird versucht, alle Teilbreiten wieder anzuschalten
const T = () => globalThis.Teilbreiten;

// Anteil eines Kästchens, der „schlecht“ ist: Stichproben alle ~0,5 m entlang des Kästchens.
// weltPunkt: [längs, quer] → [x, z]; schlecht: [x, z] → true/false
export function schlechtAnteil(box, weltPunkt, schlecht, schritt = 0.5) {
  const ax = weltPunkt(box.a), bx = weltPunkt(box.b);
  const len = Math.hypot(bx[0] - ax[0], bx[1] - ax[1]);
  const n = Math.max(3, Math.min(40, Math.round(len / schritt)));
  let s = 0;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    if (schlecht([ax[0] + (bx[0] - ax[0]) * t, ax[1] + (bx[1] - ax[1]) * t])) s++;
  }
  return s / n;
}

// Gerät, für das die Automatik gilt: Teilbreiten, „automatisch“ an, keine Precision-Farming-Düsen; das im Spiel gewählte zuerst
export function automatikGeraet(units, einheiten) {
  const k = (Array.isArray(units) ? units : []).filter(u => u.sections && einheiten?.[u.name]?.tb === true && !(u.pfSek?.length));
  return k.find(u => u.selected === true) || k[0] || null;
}

export class TeilbreitenAutomatik {
  /**
   * @param {object} deps { getManager: () => GpsManager, mapping: MappingEngine (fireAutomatic),
   *   flaeche: Flaeche (istBearbeitet), feldAt: ([x, z]) => boolean, emit?: (event, payload) => void,
   *   now?: () => number, spaeter?: (fn, ms) => void }
   */
  constructor(deps) {
    this.deps = deps;
    this.basis = new Map();             // Gerätename → letzte gültige Lage der Teilbreiten (wenn gerade alles aus ist)
    this.sperre = { L: null, R: null };  // { ziel, bis } nach einer Tastenfolge (gilt für this.geraet)
    this.geraet = null;                 // Gerät, zu dem Sperre und ausstehende Drücke gehören
    this.folge = 0;                     // Nummer der Tastenfolgen; abbrechen() macht ausstehende Drücke ungültig
    this.warAn = new Map();             // Gerätename → war im letzten Takt eingeschaltet
    this.wiederAn = new Map();          // Gerätename → bis wann alle Teilbreiten wieder angeschaltet werden
    this.letzte = null;
  }

  now() { return this.deps.now ? this.deps.now() : Date.now(); }
  spaeter(fn, ms) { if (this.deps.spaeter) this.deps.spaeter(fn, ms); else if (ms <= 0) fn(); else setTimeout(fn, ms); }
  // noch nicht gesendete Drücke verwerfen, Sperren lösen
  abbrechen() { this.folge++; this.sperre = { L: null, R: null }; }

  tick(data) {
    const mgr = this.deps.getManager();
    if (!mgr || !data || data.available === false) return;
    const einheiten = mgr.config.einheiten || {};
    const unit = automatikGeraet(data.units, einheiten);
    const sec = unit?.sections;
    data.teilbreiten = unit ? { unit: unit.name, auto: true, text: T().text(sec), letzte: this.letzte } : null;
    const cfg = mgr.config.teilbreiten;
    if (unit?.name !== this.geraet) { this.abbrechen(); this.geraet = unit?.name ?? null; }
    if (!unit || !cfg) return;

    // Ausgeschaltet (ohne Ein/Aus: angehoben) → alle Teilbreiten wieder an
    const aus = unit.canTurnOn ? unit.on !== true : unit.lowered !== true;
    if (this.warAn.get(unit.name) === true && aus) { this.abbrechen(); this.wiederAn.set(unit.name, this.now() + WIEDER_AN_MS); }
    this.warAn.set(unit.name, !aus);
    const istStand = { L: sec.links.an, R: sec.rechts.an }, max = { L: sec.links.max, R: sec.rechts.max };
    for (const side of ['L', 'R']) {
      const sp = this.sperre[side];
      if (sp && (istStand[side] === sp.ziel || this.now() > sp.bis)) this.sperre[side] = null;
    }
    const bis = this.wiederAn.get(unit.name);
    if (bis) {
      if (!aus || this.now() > bis || (istStand.L >= max.L && istStand.R >= max.R)) this.wiederAn.delete(unit.name);
      else {
        for (const side of ['L', 'R']) if (!this.sperre[side] && istStand[side] >= 0 && istStand[side] < max[side]) this.schalte(side, istStand[side], max[side], cfg, unit, data, 'wieder an');
        return;
      }
    }

    const F = vehicleFrame(data);
    const kmh = Number(data.base?.speedKmh ?? data.speed) || 0;
    if (aus || !F || kmh < 1 || data.dir === 'R' || eingeklappt(unit) || !unitArbeitet(unit, einheiten[unit.name])) return;

    // aktiver Balken im Rahmen des Geräts (gezogen: abgeknickt), Enden relativ zum Fahrzeug
    const bal = T().balken(unit);
    const ends = bal ? T().balkenLage(bal.corners, T().geraeteWinkel(unit)).ends : null;
    const lage = T().lage(sec, ends, this.basis.get(unit.name));
    if (!lage) return;
    this.basis.set(unit.name, lage.basis);

    // Ort, an dem der Balken nach dem Vorlauf sein wird (mindestens 1 m voraus, damit die eigene Spur nicht zählt)
    const vor = Math.max(1, (kmh / 3.6) * cfg.vorlauf);
    const welt = ([al, q]) => { const a = al + vor; return [F.x + F.fx * a + F.fz * q, F.z + F.fz * a - F.fx * q]; };
    const schlecht = p => !this.deps.feldAt(p) || this.deps.flaeche.istBearbeitet(p[0], p[1]);
    const sAus = cfg.schwelle / 100, sAn = Math.max(0.05, sAus - 0.3);
    const min = sec.mitte ? 0 : 1;   // ohne Mitte bleibt je Seite mindestens eine Teilbreite an (minSideState)

    for (const side of ['L', 'R']) {
      if (this.sperre[side]) continue;   // Tastenfolge läuft noch oder das Spiel hat sie noch nicht gemeldet
      const boxes = lage.boxes.filter(b => b.side === side).sort((a, b) => a.nr - b.nr);
      if (!boxes.length) continue;
      // Stand wie vom Spiel gemeldet (dieselbe Zahl, auf die die Sperre wartet); nur ohne Zahl aus den Kästchen
      const an = istStand[side] >= 0 ? Math.min(istStand[side], boxes.length) : boxes.filter(b => b.on).length;
      let ziel = min;
      for (let i = boxes.length - 1; i >= min; i--) {
        const s = schlechtAnteil(boxes[i], welt, schlecht);
        if (i < an ? s < sAus : s <= sAn) { ziel = i + 1; break; }
      }
      if (ziel !== an) this.schalte(side, an, ziel, cfg, unit, data, ziel < an ? 'aus' : 'an');
    }
  }

  // Tastenfolge: |ziel − ist| Drücke „aus“ bzw. „an“ kurz hintereinander, dann Sperre bis zur Rückmeldung
  schalte(side, ist, ziel, cfg, unit, data, grund) {
    const n = Math.abs(ziel - ist);
    if (!n) return;
    const fn = cfg.tasten?.[(side === 'L' ? 'links' : 'rechts') + (ziel < ist ? 'Aus' : 'An')];
    const takt = PULS_MS + PAUSE_MS;
    this.sperre[side] = { ziel, bis: this.now() + n * takt + (this.deps.mehrspielerGast?.() ? RUECKMELDUNG_GAST_MS : RUECKMELDUNG_MS) };
    let sent = false;
    if (fn) {
      sent = !!this.deps.mapping.fireAutomatic(fn, PULS_MS);
      const folge = this.folge;
      for (let i = 1; i < n; i++) this.spaeter(() => { if (this.folge === folge) this.deps.mapping.fireAutomatic(fn, PULS_MS); }, i * takt);
    }
    this.letzte = { side, was: grund, n, sent, at: this.now() };
    if (data.teilbreiten) data.teilbreiten.letzte = this.letzte;
    this.deps.emit?.('teilbreiten-geschaltet', { side, was: grund, n, sent, unit: unit.name });
  }
}
