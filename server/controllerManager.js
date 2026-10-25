/**
 * Welcher Controller hängt an ControlHub? (Geräteprofile, 23.10.2026)
 *
 * - server/config/controller.json: aktiver Controller, Modul-Auswahl (Baukasten) je Controller, zuletzt gemeldete
 *   Gerätedaten (GETALL). Gilt für alle Spiele, persönlich (nicht im Repo).
 * - server/config/geraeteprofile.json: eigene Geräteprofile (Editor „Eigene Controller“, Paket G3).
 * - Einrichtung (23.10.2026, server/einrichtung.js): in controller.json auch, welche Controller schon eingerichtet sind
 *   (eingerichtet: { id: Datum }; null = Version davor, wird beim Start einmal gesetzt) und „Nein, danke“ zur
 *   Kalibrier-Frage (hinweisAus: { id: offene Gruppen }).
 * Produktdaten (Griffe, Unterbauten, Vorlagen, mitgelieferte Profile) stehen in deviceProfiles.js.
 */
import path from 'path';
import { readJsonFile, writeJsonAtomic } from './jsonStore.js';
import { BUILTIN_PROFILES, GRIFFE, UNTERBAUTEN, VORLAGEN, VORLAGE_FUER_MODEL, CC_KATALOG, cleanSetup, resolveModules, resolveAxes, teilModulesForCalibration, isTeilLayoutId } from './deviceProfiles.js';
import { MODULES } from './config/modules.js';

export const DEFAULT_CONTROLLER = 'craftconsole';
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

export class ControllerManager {
  constructor(configDir) {
    this.file = path.join(configDir, 'controller.json');
    this.customFile = path.join(configDir, 'geraeteprofile.json');
    this.state = { active: DEFAULT_CONTROLLER, setups: {}, info: {}, eingerichtet: null, hinweisAus: {}, farben: {} };
    this.custom = [];
  }

  async initialize() {
    const { data } = await readJsonFile(this.file, { fallback: null });
    if (data && typeof data === 'object') {
      this.state = {
        active: typeof data.active === 'string' ? data.active : DEFAULT_CONTROLLER,
        setups: data.setups && typeof data.setups === 'object' ? data.setups : {},
        info: data.info && typeof data.info === 'object' ? data.info : {},
        eingerichtet: data.eingerichtet && typeof data.eingerichtet === 'object' ? data.eingerichtet : null,
        hinweisAus: data.hinweisAus && typeof data.hinweisAus === 'object' ? data.hinweisAus : {},
        farben: data.farben && typeof data.farben === 'object' ? data.farben : {}
      };
    }
    const { data: custom } = await readJsonFile(this.customFile, { fallback: null });
    this.custom = Array.isArray(custom?.profiles) ? custom.profiles.filter(p => p && ID_RE.test(p.id)) : [];
    if (!this.profile(this.state.active)) this.state.active = DEFAULT_CONTROLLER;
  }

  save() { return writeJsonAtomic(this.file, this.state); }
  saveCustom() { return writeJsonAtomic(this.customFile, { profiles: this.custom }); }

  profiles() {
    return [...BUILTIN_PROFILES, ...this.custom.map(p => ({ ...p, builtin: false }))];
  }
  profile(id) { return this.profiles().find(p => p.id === id) || null; }
  get activeId() { return this.profile(this.state.active) ? this.state.active : DEFAULT_CONTROLLER; }
  get activeProfile() { return this.profile(this.activeId); }

  setup(id = this.activeId) {
    const profile = this.profile(id);
    if (!profile) return {};
    return profile.builtin ? cleanSetup(profile, this.state.setups[id]) : {};
  }

  modules(id = this.activeId) {
    return resolveModules(this.profile(id), this.setup(id), this.state.info[id]);
  }

  axes(id = this.activeId) {
    return resolveAxes(this.profile(id), this.setup(id), this.state.info[id]);
  }

  // Für die Modul-Kalibrierung (Für Entwickler): alle Module mit eigenem Bild -- die der CraftConsole immer
  // (dort werden die mitgelieferten Bilder gepflegt), je Griff und je Unterbau ein Bild (23.10.2026), dazu die Module
  // eigener Controller (Paket G4)
  allModulesForCalibration() {
    // CraftSlots selbst haben kein Bild mehr, sie zeigen das Bild des Griffs (25.10.2026) -- kalibriert wird je Griff und
    // einmal der Unterbau
    // CraftDeck: das Drehrad (Achse poti) bekommt ein Feld auf seinem Bild (Hendrik 25.10.2026: „Die Achse für das Drehrad
    // im CraftDeck wird ja nirgendwo belegt … sollten wir auch noch einbauen und kalibrieren können“)
    const cc = MODULES.filter(m => !['craftslot1', 'craftslot2'].includes(m.id))
      .map(m => ({ ...m, buttons: undefined, layoutId: m.id, ...(m.id === 'bedienteil' ? { axisKeys: ['poti'] } : {}) }));
    const eigene = [];
    for (const p of this.custom) {
      for (const m of resolveModules({ ...p, builtin: false }, {}, {})) eigene.push({ ...m, name: `${p.name} – ${m.name}`, id: m.layoutId });
    }
    return [...cc, ...teilModulesForCalibration(), ...eigene];
  }

  // Bild-Kennung, die ein Modulbild haben darf (Griff-/Unterbau-Bilder, Module eigener Controller)
  isLayoutId(id) {
    return isTeilLayoutId(id) || this.isCustomModule(id);
  }

  // Modul eines eigenen Controllers (<controller>--<modul>)? -- für Modulbilder (Paket G4)
  isCustomModule(id) {
    return this.custom.some(p => (p.module || []).some(m => `${p.id}--${m.id}` === id));
  }

  async setActive(id) {
    if (!this.profile(id)) throw new Error('Unbekannter Controller: ' + id);
    this.state.active = id;
    await this.save();
  }

  // Farbe der Armlehne (25.10.2026): getrennt von der Modul-Auswahl, damit Vorlagen und „Erkennen“ sie nicht zurücksetzen
  farbe(id = this.activeId) {
    const liste = this.profile(id)?.farben;
    if (!Array.isArray(liste) || !liste.length) return null;
    return liste.some(f => f.id === this.state.farben?.[id]) ? this.state.farben[id] : liste[0].id;
  }

  async saveFarbe(id, farbe) {
    const liste = this.profile(id)?.farben;
    if (!Array.isArray(liste) || !liste.some(f => f.id === farbe)) throw new Error('Diese Farbe gibt es für den Controller nicht');
    this.state.farben = { ...(this.state.farben || {}), [id]: farbe };
    await this.save();
    return farbe;
  }

  async saveSetup(id, setup) {
    const profile = this.profile(id);
    if (!profile?.builtin || !profile.kann?.module) throw new Error('Dieser Controller hat keine Modul-Auswahl');
    this.state.setups[id] = cleanSetup(profile, setup);
    await this.save();
    return this.state.setups[id];
  }

  vorlage(id) {
    return VORLAGEN.find(v => v.id === id) || null;
  }

  /**
   * Erkennung beim Verbinden (Konzept § 5).
   * @param {{getAll?: object|null, usb?: {vendorId?: string, productId?: string}|null}} p
   * @returns {{id: string|null, unknownDevice?: string, changed: boolean}}
   *   id = erkanntes Geräteprofil (null = nicht sicher erkannt, aktiver bleibt)
   */
  async detect({ getAll = null, usb = null } = {}) {
    let id = null;
    let unknownDevice = null;
    const device = typeof getAll?.device === 'string' ? getAll.device.trim().toLowerCase() : '';
    if (device) {
      const p = this.profiles().find(x => x.erkennung?.device === device || x.id === device);
      if (p) id = p.id;
      else unknownDevice = device;
    } else if (getAll && 'model' in getAll) {
      id = 'craftconsole';   // CraftConsole-Firmware bis 2.12 sendet kein device=, aber model=
    }
    if (!id && !unknownDevice) {
      const vid = String(usb?.vendorId || '').toUpperCase();
      const pid = String(usb?.productId || '').toUpperCase();
      if (vid === '2E8A') id = this.profiles().find(x => x.erkennung?.usbPid === pid)?.id || null;
    }
    let changed = false;
    if (id && getAll) {
      // Gerätedaten merken (Achsenzahl, CraftUnit …) und beim ersten Mal die Firmware-Werte der CraftConsole übernehmen
      this.state.info[id] = { firmware: getAll.firmware ?? null, buttons: getAll.buttons ?? null, axes: getAll.axes ?? null,
        unit: getAll.unit ?? null, model: getAll.model ?? null, caldone: getAll.caldone ?? null, seenAt: new Date().toISOString() };
      if (id === 'craftconsole' && !this.state.setups.craftconsole && 'model' in getAll) {
        this.state.setups.craftconsole = this.setupFromFirmware(getAll);
      }
      changed = true;
    }
    if (changed) await this.save();
    return { id, unknownDevice, device };
  }

  // ---- Einrichtung (server/einrichtung.js) ----
  isEingerichtet(id) { return !!this.state.eingerichtet?.[id]; }
  async markEingerichtet(id) {
    this.state.eingerichtet = { ...(this.state.eingerichtet || {}), [id]: new Date().toISOString() };
    await this.save();
  }
  async setHinweisAus(id, signatur) {
    this.state.hinweisAus = { ...this.state.hinweisAus, [id]: String(signatur || '') };
    await this.save();
  }
  // Kalibrier-Stand nach CAL STOP neu gelesen (GETALL caldone=)
  async setCaldone(id, caldone) {
    if (!this.state.info[id]) return;
    this.state.info[id] = { ...this.state.info[id], caldone: caldone ?? null };
    await this.save();
  }

  // Firmware-Wert model → Vorlage als Baukasten (einmalig, danach gilt die Auswahl in ControlHub).
  // Unterbau und Griff kommen aus der Vorlage, nicht aus slotNunterbau/slotNgriff der Firmware (Test 23.10.2026,
  // Hendrik: „der CraftSlot 2 sollte als Vorschlag den Polaris-Griff haben, nicht den Mortis“): die Firmware wertet
  // diese Werte nicht aus, und auf älteren Armlehnen stehen dort noch Werte von vor dem Polaris-Griff.
  setupFromFirmware(getAll) {
    const profile = this.profile('craftconsole');
    const vorlage = this.vorlage(VORLAGE_FUER_MODEL[Number(getAll.model)] || 'pro');
    return cleanSetup(profile, structuredClone(vorlage.setup));
  }

  // Vorschlag aus der Modul-Erkennung der CraftConsole (STATUS → DET-Zeilen, s. moduleStatus.js)
  setupFromDetection(det) {
    const profile = this.profile('craftconsole');
    const s = this.setup('craftconsole');
    const on = k => String(det?.[k]) === '1';
    s.einschub1.an = on('es1');
    s.einschub2.an = on('es2');
    s.fingertip.an = on('finger');
    s.bedienteil.an = on('bedien');
    s.craftslot1.an = on('s1grip') || on('s1encA') || on('s1encB');
    s.craftslot2.an = on('s2grip') || on('s2encA') || on('s2encB');
    return cleanSetup(profile, s);
  }

  // ---- Eigene Controller (Editor „Eigene Controller“, Paket G3) ----
  // Format (s. deviceProfiles.js resolveModules): { id, name, erkennung: { device }, module: [{ id, name, tasten: [Nr],
  // achsen: [{ index, name }], tastenNamen: { Nr: Name } }] }

  customList() { return structuredClone(this.custom); }

  slug(text, fallback) {
    return String(text || '').toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || fallback;
  }

  // Gerätekennung (device= aus GETALL, DEVICE_ID der Firmware): klein, ohne Leerzeichen, nicht doppelt
  cleanDevice(device, ownId) {
    const d = String(device || '').trim().toLowerCase();
    if (!d) return '';
    if (!ID_RE.test(d)) throw new Error('Gerätekennung: nur Kleinbuchstaben, Ziffern und Bindestriche (höchstens 40 Zeichen)');
    const taken = this.profiles().find(p => p.id !== ownId && (p.erkennung?.device === d || p.id === d));
    if (taken) throw new Error(`Die Gerätekennung „${d}“ gehört schon zu „${taken.name}“`);
    return d;
  }

  async createCustom({ name, device } = {}) {
    const clean = String(name || '').trim().slice(0, 40);
    if (!clean) throw new Error('Bitte einen Namen angeben');
    let id = `eigen-${this.slug(clean, 'controller')}`;
    for (let i = 2; this.profile(id); i++) id = `eigen-${this.slug(clean, 'controller')}-${i}`;
    const profile = { id, name: clean, erkennung: { device: this.cleanDevice(device, id) || null },
      kann: { einstellungen: false, kalibrierung: false, achsModus: false, ebenen: false, signalton: 'led', kappenfarben: false, module: false },
      module: [{ id: 'tasten', name: 'Tasten', tasten: [], achsen: [], tastenNamen: {} }] };
    this.custom.push(profile);
    await this.saveCustom();
    return profile;
  }

  async updateCustom(id, data) {
    const idx = this.custom.findIndex(p => p.id === id);
    if (idx < 0) throw new Error('Unbekannter eigener Controller');
    const name = String(data?.name ?? this.custom[idx].name).trim().slice(0, 40);
    if (!name) throw new Error('Bitte einen Namen angeben');
    const device = this.cleanDevice(data?.erkennung?.device ?? this.custom[idx].erkennung?.device, id) || null;
    if (!Array.isArray(data?.module)) throw new Error('Module fehlen');
    if (data.module.length > 20) throw new Error('Höchstens 20 Module');
    const usedIds = new Set();
    const module = data.module.map((m, i) => {
      let mid = this.slug(m?.id || m?.name, `modul-${i + 1}`);
      while (usedIds.has(mid)) mid += '-2';
      usedIds.add(mid);
      // Tasten 1–114: 115–118 gibt ControlHub als Ebenen-Signale aus (craftSlotLayerManager.js), 119–128 bleiben frei
      const tasten = [...new Set((Array.isArray(m?.tasten) ? m.tasten : []).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 128))].sort((a, b) => a - b);
      const achsen = [];
      for (const a of Array.isArray(m?.achsen) ? m.achsen : []) {
        const index = Number(a?.index);
        if (Number.isInteger(index) && index >= 0 && index <= 15 && !achsen.some(x => x.index === index)) achsen.push({ index, name: String(a?.name || `Achse ${index + 1}`).trim().slice(0, 30) });
      }
      const tastenNamen = {};
      for (const [k, v] of Object.entries(m?.tastenNamen || {})) {
        const n = Number(k);
        const t = String(v || '').trim().slice(0, 30);
        if (tasten.includes(n) && t) tastenNamen[n] = t;
      }
      return { id: mid, name: String(m?.name || `Modul ${i + 1}`).trim().slice(0, 40), tasten, achsen, tastenNamen };
    });
    this.custom[idx] = { ...this.custom[idx], name, erkennung: { device }, module };
    await this.saveCustom();
    return this.custom[idx];
  }

  async deleteCustom(id) {
    if (id === this.activeId) throw new Error('Der aktive Controller kann nicht gelöscht werden – erst einen anderen wählen');
    const idx = this.custom.findIndex(p => p.id === id);
    if (idx < 0) throw new Error('Unbekannter eigener Controller');
    this.custom.splice(idx, 1);
    delete this.state.setups[id];
    delete this.state.info[id];
    await Promise.all([this.saveCustom(), this.save()]);
  }

  exportCustom(id) {
    const p = this.custom.find(x => x.id === id);
    if (!p) throw new Error('Unbekannter eigener Controller');
    return { type: 'controlhub-device', version: 1, exportedAt: new Date().toISOString(), profile: structuredClone(p) };
  }

  async importCustom(data) {
    if (data?.type !== 'controlhub-device' || !data.profile || typeof data.profile !== 'object') throw new Error('Keine ControlHub-Controller-Datei');
    if (data.version > 1) throw new Error('Die Datei stammt aus einer neueren ControlHub-Version');
    let device = data.profile.erkennung?.device || null;
    try { this.cleanDevice(device, null); } catch { device = null; }   // Kennung schon vergeben → ohne Kennung übernehmen
    const created = await this.createCustom({ name: data.profile.name || 'Controller', device });
    return this.updateCustom(created.id, { ...data.profile, erkennung: { device }, name: created.name });
  }

  // Alles, was die Oberfläche über den aktiven Controller braucht (GET /api/controller)
  payload() {
    const p = this.activeProfile;
    return {
      success: true,
      active: this.activeId,
      profile: { id: p.id, name: p.name, builtin: !!p.builtin, kann: p.kann || {} },
      profiles: this.profiles().map(x => ({ id: x.id, name: x.name, builtin: !!x.builtin })),
      setup: this.setup(),
      farben: (p.farben || []).map(f => ({ id: f.id, name: f.name })),
      farbe: this.farbe(),
      modules: this.modules(),
      axes: this.axes(),
      info: this.state.info[this.activeId] || null,
      katalog: p.id === 'craftconsole' ? CC_KATALOG.map(k => ({ ...k, name: MODULES.find(m => m.id === k.id)?.name || k.id }))
        : p.id === 'craftlink' ? [{ id: 'craftunit', art: 'slot', name: 'CraftUnit' }] : [],
      griffe: GRIFFE.map(g => ({ id: g.id, name: g.name })),
      unterbauten: UNTERBAUTEN.map(u => ({ id: u.id, name: u.name })),
      vorlagen: p.id === 'craftconsole' ? VORLAGEN.map(v => ({ id: v.id, name: v.name })) : []
    };
  }
}
