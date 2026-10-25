/**
 * Frontend-Logik - Vereinfacht für Multi-Action-Mappings
 */

// Fasst die Actions einer Funktion in einem kurzen, lesbaren Text zusammen (z.B. "W + LALT" oder
// "Gamepad-Taste 3") -- an einer Stelle, damit Funktionsliste UND Tasten-Picker (moduleFlow.js)
// dieselbe Beschreibung zeigen, egal ob die Funktion importiert oder im Editor gebaut wurde.
const AXIS_SLOT_NAMES = ['X', 'Y', 'Z', 'Rx', 'Ry', 'Rz', 'Slider', 'Dial'];
// Funktionen-Übersicht: Pseudo-Gruppe „Alle Funktionen“ (nur im Browser, wie UNCATEGORIZED_ID in functionGroups.js)
const FN_ALL = '__all__';
// Feste Gruppe „ControlHub-Steuerung“ (Hendrik 23.10.2026): die ControlHub-Aktionen aus hubActions.js stehen auch in der
// Funktionsliste -- nur zum Ansehen, belegt werden sie wie jede Funktion über die Tastenauswahl
const FN_HUB = '__hub__';

// Nav-Sektionen, die selbst wieder eine Eltern-Sektion haben statt direkt auf die Wurzel-Ebene
// zurückzuspringen (z.B. Entwicklertools/Ersteinrichtung liegen "unter" Einstellungen -- Zurück soll
// dorthin, nicht bis ganz nach oben). Alles, was hier nicht drinsteht, hat die Wurzel-Ebene als
// Elternebene (bisheriges "Ebene 1"-Verhalten, s. showNavRoot()).
// Entwicklerwerkzeuge (Modul-Erkennung/Live-Diagnose/Modul-Kalibrierung) bleiben bewusst im Produkt --
// ControlHub wird Open Source, andere Entwickler sollen sie nutzen können. Der Code ist NUR eine
// Hürde gegen versehentliches Herumklicken normaler Nutzer, keine echte Sicherheit (steht im Klartext
// im Frontend-Code) -- gehört in die künftige Benutzerdokumentation, wer die liest findet ihn.
const DEV_TOOLS_CODE = '1164';
// Große Meldung erst nach so langer ununterbrochener Trennung (Hendrik: ~3 s), s. armLinkLost()
const LINK_LOST_DELAY_MS = 3000;

const NAV_PARENT = {
  entwicklungstools: 'einstellungen',
  ersteinrichtung: 'einstellungen',
  konfiguration: 'root',
  steuerungsmenues: 'root'
};

// Dezente, handgezeichnete Liniensymbole je Menüpunkt (Konzept-Mockup) -- kein Icon-Font/Sprite-
// System, nur ein paar simple SVG-Pfade. Global (kein Modul-Export), damit steuerungsmenues.js beim
// dynamischen Erzeugen der Seiten-Buttons dieselbe navIcon()-Funktion mitbenutzen kann.
const NAV_ICONS = {
  list: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  gauge: '<path d="M4.5 16.5a7.5 7.5 0 1 1 15 0"/><path d="M12 16.5 15.5 11"/><circle cx="12" cy="16.5" r="1" fill="currentColor" stroke="none"/>',
  uturn: '<path d="M6 5v7a5 5 0 0 0 5 5h7"/><path d="M14 13l4 4-4 4"/>',
  panel: '<rect x="3" y="3" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
  toolbox: '<path d="M4 9h16v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18V9Z"/><path d="M8 9V6.5A1.5 1.5 0 0 1 9.5 5h5A1.5 1.5 0 0 1 16 6.5V9"/><path d="M4 13h16"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.2"/>',
  axis: '<path d="M12 3v18M3 12h18"/><path d="M12 3l-2.2 2.2M12 3l2.2 2.2M21 12l-2.2-2.2M21 12l-2.2 2.2"/>',
  stack: '<path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="M3 12l9 5 9-5"/><path d="M3 16l9 5 9-5"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="7.5"/><path d="M19.5 12L21.3 12M17.3 17.3L18.6 18.6M12 19.5L12 21.3M6.7 17.3L5.4 18.6M4.5 12L2.7 12M6.7 6.7L5.4 5.4M12 4.5L12 2.7M17.3 6.7L18.6 5.4"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  plug: '<path d="M9 3v5M15 3v5M6 8h12v4a6 6 0 0 1-12 0V8Z"/><path d="M12 18v3"/>',
  power: '<circle cx="12" cy="13" r="8"/><path d="M12 5v5"/>',
  terminal: '<rect x="3" y="4.5" width="18" height="15" rx="1.5"/><path d="M7 9.5l3 2.5-3 2.5M12.5 14.5h4.5"/>',
  'map-pin': '<path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11Z"/><circle cx="12" cy="10" r="2.3"/>',
  cloud: '<path d="M6.5 18a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.6-1.5A4 4 0 0 1 17 18H6.5Z"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none"/>',
  wrench: '<path d="M14.5 6.5a4 4 0 1 0-5.6 5.6L4 17l3 3 4.9-4.9a4 4 0 0 0 5.6-5.6l-2.6 2.6-2-2Z"/>',
  radar: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><path d="M12 12 18 6"/>',
  pulse: '<path d="M3 12h4l2 6 4-14 2 8h6"/>',
  crosshair: '<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  droplet: '<path d="M12 3s6.5 7.2 6.5 11.5a6.5 6.5 0 1 1-13 0C5.5 10.2 12 3 12 3Z"/>',
  flask: '<path d="M9.5 3h5M10 3v6.2L5.7 17a2 2 0 0 0 1.8 3h9a2 2 0 0 0 1.8-3L14 9.2V3"/><path d="M8 15h8"/>',
  fuel: '<path d="M4 21V6.5A1.5 1.5 0 0 1 5.5 5H12a1.5 1.5 0 0 1 1.5 1.5V21"/><path d="M4 11h9.5"/><path d="M14 8.5l3 2v6a1.5 1.5 0 0 0 3 0V9.5L17.5 7"/><path d="M2 21h13.5"/>',
  ruler: '<rect x="3" y="8" width="18" height="8" rx="1.2"/><path d="M7 8v3M11 8v3M15 8v3"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 3v2.2M12 18.8V21M4.2 12H2.4M21.6 12h-1.8M5.6 5.6l1.3 1.3M17.1 17.1l1.3 1.3M18.4 5.6l-1.3 1.3M6.9 17.1l-1.3 1.3"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/>',
  calendar: '<rect x="3.5" y="4.5" width="17" height="16" rx="1.5"/><path d="M3.5 9.5h17M8 3v3M16 3v3"/>',
  coin: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 9.5c0-1 1-1.8 2.5-1.8s2.5.6 2.5 1.6c0 2.2-5 1-5 3.2 0 1 1 1.6 2.5 1.6s2.5-.7 2.5-1.7"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
  route: '<path d="M3 12h4M11 12h2M17 12h4"/><path d="M17 8l4 4-4 4"/>',
  stopwatch: '<circle cx="12" cy="13" r="8"/><path d="M12 13V9"/><path d="M9 3h6"/><path d="M18.5 5.5l1.5 1.5"/>',
  bell: '<path d="M12 3a5 5 0 0 0-5 5v3.3c0 1-.4 2-1.1 2.7L4.5 16h15l-1.4-2c-.7-.7-1.1-1.7-1.1-2.7V8a5 5 0 0 0-5-5Z"/><path d="M9.5 19a2.5 2.5 0 0 0 5 0"/>',
  hash: '<path d="M5 9h14M5 15h14M9 4l-2 16M17 4l-2 16"/>',
  archive: '<path d="M4 7h16v3H4V7Z"/><path d="M5 10v9a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-9"/><path d="M10 14h4"/>',
  check: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12.5l2.5 2.5L16 9"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2"/><path d="M7 7l1 13h8l1-13"/><path d="M10.5 11v6M13.5 11v6"/>',
  // Ab 21.10.2026: Symbole für Cockpit/Wetter/Karte statt bunter Emojis (gleicher Strichstil wie oben)
  battery: '<rect x="2.5" y="7" width="17" height="10" rx="2"/><path d="M21.5 11v2"/><path d="M6 10v4M9.5 10v4"/>',
  thermometer: '<path d="M14 14.8V4.5a2 2 0 0 0-4 0v10.3a4 4 0 1 0 4 0Z"/><path d="M12 11v6"/>',
  broom: '<path d="M19 4l-7 7"/><path d="M9 11.5l3.5 3.5"/><path d="M9 11.5c-2.5.5-4.5 3-5.5 8 4.5-1 7.5-3 8.5-5"/>',
  lightbulb: '<path d="M9.5 18h5M10.5 21h3"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z"/>',
  beacon: '<path d="M7 18v-5a5 5 0 0 1 10 0v5"/><path d="M5 18h14M12 3v2M5 6l1.4 1.4M19 6l-1.4 1.4"/>',
  robot: '<rect x="5" y="8" width="14" height="11" rx="2"/><path d="M12 4v4"/><circle cx="12" cy="3.5" r=".8"/><circle cx="9.5" cy="13" r="1"/><circle cx="14.5" cy="13" r="1"/>',
  tractor: '<circle cx="7" cy="16.5" r="3.5"/><circle cx="18" cy="17.5" r="2.5"/><path d="M3.5 13V7h6l2 6h6.5a2 2 0 0 1 2 2v1"/><path d="M10.5 16.5H15.5"/>',
  wheat: '<path d="M12 21V8"/><path d="M12 8c-1.8-1-2.6-2.6-2.6-4.6 1.8 1 2.6 2.6 2.6 4.6Z"/><path d="M12 12.5c-1.6-1.2-3.4-1.4-4.6-3 1.8 0 3.6 1 4.6 3Z"/><path d="M12 12.5c1.6-1.2 3.4-1.4 4.6-3-1.8 0-3.6 1-4.6 3Z"/><path d="M12 17c-1.6-1.2-3.4-1.4-4.6-3 1.8 0 3.6 1 4.6 3Z"/><path d="M12 17c1.6-1.2 3.4-1.4 4.6-3-1.8 0-3.6 1-4.6 3Z"/>',
  sprout: '<path d="M12 21v-9"/><path d="M12 12c0-3.5-2.5-5.5-6.5-5.5 0 3.5 2.5 5.5 6.5 5.5Z"/><path d="M12 14c0-3 2-4.8 5.5-4.8 0 3-2 4.8-5.5 4.8Z"/>',
  trailer: '<rect x="2" y="7" width="15" height="9" rx="1"/><path d="M17 12h5"/><circle cx="7" cy="18" r="2"/><circle cx="12" cy="18" r="2"/>',
  mower: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M20 4L8 16M14.5 14.5L20 20M8 8l4 4"/>',
  plow: '<path d="M3 7h11l-3.5 11H5.5Z"/><path d="M14 7l6 6M10.5 18l3-3"/>',
  'cloud-sun': '<path d="M8 3v1.5M3.5 5.5l1 1M2 10h1.5"/><path d="M5.6 12a3.5 3.5 0 0 1 6.2-3.4"/><path d="M17 20H9a3.5 3.5 0 1 1 .7-6.9 4.5 4.5 0 0 1 8.8 1.4A3 3 0 0 1 17 20Z"/>',
  rain: '<path d="M19 14.5A4 4 0 0 0 17 7h-1A6.5 6.5 0 1 0 4.5 13"/><path d="M8 16v4M12 17v4M16 16v4"/>',
  snow: '<path d="M19 14.5A4 4 0 0 0 17 7h-1A6.5 6.5 0 1 0 4.5 13"/><circle cx="8" cy="18" r=".7"/><circle cx="12" cy="20.5" r=".7"/><circle cx="16" cy="18" r=".7"/>',
  storm: '<path d="M19 14.5A4 4 0 0 0 17 7h-1A6.5 6.5 0 1 0 4.5 13"/><path d="M13 11l-3.5 5H14l-3.5 5"/>',
  fog: '<path d="M3 9h18M5 13h14M3 17h18"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5Z"/>'
};

function navIcon(name) {
  if (!NAV_ICONS[name]) return '';
  return `<svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${NAV_ICONS[name]}</svg>`;
}

function describeActions(actions) {
  if (!actions || actions.length === 0) return 'Keine Aktion';

  const parts = actions.map(action => {
    if (action.type === 'keyboard') return keyLabel(action.key);
    if (action.type === 'gamepad') return `Gamepad-Taste ${(action.buttonId ?? 0) + 1}`;
    if (action.type === 'axis') {
      // value ist immer genau 0 (Minus-Anschlag) oder 65535 (Plus-Anschlag), s. actionPicker.js
      // buildAxisResult() -- dieselbe Konvention, ?? statt || wegen des 0-ist-gueltig-Fallstricks
      // (s. mappingEngine.js-Fix an anderer Stelle in diesem Projekt).
      const dir = (action.value ?? 65535) === 0 ? '-' : '+';
      return `Achse ${AXIS_SLOT_NAMES[action.axisId] || action.axisId + 1} (${dir})`;
    }
    if (action.type === 'macro-abort') return 'Makro abbrechen';
    if (action.type === 'hub') return 'nur in ControlHub';
    return null;
  }).filter(Boolean);

  return parts.length > 0 ? parts.join(' + ') : 'Keine Aktion';
}

// Profil gezielt ändern (Durchsicht B3, 23.10.2026): nur die geänderten Stellen an den Server, der wendet sie auf
// SEINEN Stand an (POST /api/profile/patch). Vorher schickten mehrere Seiten das ganze Profil aus ihrer evtl. alten
// Kopie zurück -- z. B. ging nach „Fahrzeug zuordnen“ und einer Achsen-Änderung die Zuordnung verloren.
// aenderungen: [{ pfad: ['buttons', '12'], wert }], wert null = Eintrag entfernen; name null = aktives Profil.
async function profilAendern(name, aenderungen) {
  const res = await fetch('/api/profile/patch', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, aenderungen })
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Speichern fehlgeschlagen');
  return data;
}

// Löschen mit Blick auf die Verwendung (Durchsicht B2, 23.10.2026): zeigt vorher, wo die Funktion bzw. das Makro noch
// belegt ist (Tasten aller Controller, Ebenen, Achsen, Makro-Schritte, Kacheln, Tastenleisten, GPS-Auslöser), und nimmt
// sie auf Wunsch überall mit heraus. Vorher blieben Tasten stumm und Makros übersprangen still einen Schritt.
// @returns {Promise<boolean>} true = gelöscht
async function loeschenMitVerwendung({ art, name, verwendungUrl, loeschUrl }) {
  let funde = [];
  try { funde = (await (await fetch(verwendungUrl)).json()).funde || []; } catch { /* dann ohne Liste */ }
  let entfernen = false;
  if (funde.length) {
    const liste = funde.slice(0, 12).map(f => `• ${f}`).join('\n') + (funde.length > 12 ? `\n… und ${funde.length - 12} weitere` : '');
    const { button } = await uiDialog({
      title: `${art} löschen`,
      message: `„${name}“ ist noch ${funde.length === 1 ? 'an einer Stelle' : `an ${funde.length} Stellen`} belegt:\n\n${liste}\n\nBeim Löschen werden diese Belegungen mit entfernt.`,
      danger: true,
      buttons: [{ label: 'Abbrechen', value: false, cancel: true }, { label: 'Löschen und Belegungen entfernen', value: true, primary: true, kind: 'danger' }]
    });
    if (button !== true) return false;
    entfernen = true;
  } else if (!(await uiConfirm(`${art} „${name}“ wirklich löschen? Belegt ist ${art === 'Makro' ? 'es' : 'sie'} nirgends.`, { title: `${art} löschen`, ok: 'Löschen', danger: true }))) {
    return false;
  }
  const res = await fetch(loeschUrl + (entfernen ? '?belegungen=entfernen' : ''), { method: 'DELETE' });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Löschen fehlgeschlagen');
  return true;
}

// Kurztext einer Bedingung „nur auslösen, wenn …“ (Paket J) für Funktionslisten
function conditionText(c) {
  if (!c?.value || !window.anzeigen) return '';
  const def = window.anzeigen.def(c.value);
  const name = def?.name || c.value;
  if (c.op === 'lt' || c.op === 'gt') return ` · nur wenn ${name} ${c.op === 'lt' ? '<' : '>'} ${c.num}${def?.unit ? ' ' + def.unit : ''}`;
  return ` · nur wenn ${def && window.Werteliste?.satz ? window.Werteliste.satz(def, c.is !== false) : `${name} ${c.is === false ? 'aus' : 'an'}`}`;
}

class ControllerApp {
  constructor() {
    this.socket = window.hubSocket;   // gemeinsame Verbindung der Seite (hubSocket.js, B4)
    this.connected = false;
    this.currentProfile = null;
    this.currentProfileData = null;
    this.allFunctions = [];
    this.allCategories = [];
    this.currentCategory = null; // wird beim ersten Laden der Funktionen gesetzt (Gruppen sind dynamisch)
    this.lastAxisValue = new Array(16).fill(32768);
    this.currentNavSection = null; // aktuelle Sektion, s. NAV_PARENT/showNavRoot()
    // sessionStorage statt localStorage: Freischaltung gilt fürs offene Browser-Fenster, nicht dauerhaft
    // auf dem Gerät -- passt besser zur "Hürde gegen Fehlbedienung", s. DEV_TOOLS_CODE oben.
    this.devToolsUnlocked = sessionStorage.getItem('ch-dev-tools-unlocked') === '1';
    // Für die Ingame-Uhrzeit-Anzeige (s. tickClock()) -- envHour/envMinute kommen mit jedem
    // 'telemetry-update', hier nur der letzte bekannte Stand gemerkt statt live nachzufragen.
    this.lastGameTime = null;

    this.init();
  }

  init() {
    this.setupSocketListeners();
    this.setupEventListeners();
    this.setupTabNavigation();
    this.showNavRoot(); // Start-Ansicht: Wurzel-Ebene (Übersicht ist deren aktiver Default-Tab)
    this.updateChromeHeight();
    window.addEventListener('resize', () => this.updateChromeHeight());
    window.addEventListener('resize', () => this.resizeProfileList());
    window.addEventListener('resize', () => this.resizeFunctionsList());
    this.loadSidebarPosition();
    this.loadFunctionIconsPreference();
    this.loadThemePreference();
    this.loadScanlinePreference();
    this.loadClockModePreference();
    this.loadTelemetryRate();
    this.tickClock();
    setInterval(() => this.tickClock(), 1000);
    this.loadPorts();
    this.loadProfiles();
    this.loadFunctions();
    this.loadAutoSwitchStatus();
  }

  // Misst die TATSÄCHLICHE Höhe der Statusleiste und schreibt sie in eine CSS-
  // Variable (--chrome-height), statt sie irgendwo als Pixel-Zahl zu raten/hart zu kodieren. Die
  // Modulbild-Höhe in style.css (calc(100vh - var(--chrome-height) - ...)) hängt davon ab -- bei
  // geratenen Werten kam es zweimal zu ungewolltem Scrollen, weil die Chrome-Höhe sich geändert hatte,
  // ohne dass die Rechnung mitgezogen wurde. So bleibt es korrekt, auch wenn sich Schriftgröße/Zeilen-
  // umbruch/Zoom ändert. Läuft einmal beim Start und bei jeder Fenstergrößenänderung erneut.
  updateChromeHeight() {
    const topBar = document.querySelector('.top-statusbar');
    const total = topBar?.offsetHeight || 0;
    document.documentElement.style.setProperty('--chrome-height', total + 'px');
  }

  // Hendriks Feedback: bei vielen Profilen schiebt eine lange Liste die Buttons darunter (Umbenennen/
  // Duplizieren/Löschen/Reihenfolge ändern) aus dem sichtbaren Bereich, weil bisher die GANZE Seite
  // gescrollt hat. Jetzt bekommt NUR #profile-list eine eigene, gemessene (nicht geratene) Maximalhöhe
  // -- gleiches Prinzip wie updateChromeHeight()/moduleFlow.js resizeCanvas(): tatsächliche Position
  // der Liste im Viewport messen, davon die verfügbare Resthöhe ableiten, direkt als Pixelwert setzen.
  // Bei kurzen Listen bleibt die Karte wie bisher kompakt (die Liste ist dann schlicht kürzer als ihr
  // eigenes max-height und braucht kein Scrollen).
  resizeProfileList() {
    const list = document.getElementById('profile-list');
    if (!list || !document.getElementById('tab-profiles')?.classList.contains('active')) return;
    const top = list.getBoundingClientRect().top;
    // Der Button-Block UNTER der Liste (Umbenennen/Duplizieren/Löschen/Reihenfolge ändern) braucht
    // seinen eigenen Platz -- dessen Höhe ist unabhängig von der aktuellen Listenhöhe (eigener
    // Block darunter), lässt sich also gefahrlos vorab messen, bevor die Liste selbst begrenzt wird.
    const bottomActions = list.nextElementSibling;
    const bottomHeight = bottomActions ? bottomActions.getBoundingClientRect().height + 12 : 0;
    const available = window.innerHeight - top - bottomHeight - 24; // 24px ~ <main> Bottom-Padding
    // Feste Höhe statt max-height (Hendriks Feedback): die Liste soll den verfügbaren Platz IMMER
    // ausfüllen, auch wenn wenige Profile drin sind, nicht auf die Inhaltsgröße zusammenschrumpfen.
    // overflow-y:auto (s. CSS) sorgt weiterhin dafür, dass bei VIELEN Profilen intern gescrollt wird.
    list.style.height = Math.max(80, available) + 'px';
  }

  // Gleiches Prinzip wie resizeProfileList() (Hendriks Feedback): die Funktionsliste soll immer die
  // volle verfügbare Höhe ausfüllen, auch bei wenigen Funktionen in der aktuellen Kategorie -- sonst
  // verschieben sich Kategorie-/Unterkategorie-Tabs beim Wechseln zwischen unterschiedlich langen
  // Kategorien (die Karte darüber ist dann mal kurz, mal lang). Kein Button-Block darunter (anders als
  // bei #profile-list), deshalb ohne trailing-Höhen-Abzug.
  resizeFunctionsList() {
    const body = document.getElementById('fn-body');
    if (!body || !document.getElementById('tab-functions')?.classList.contains('active')) return;
    const top = body.getBoundingClientRect().top;
    const available = window.innerHeight - top - 24; // 24px ~ <main> Bottom-Padding
    body.style.height = Math.max(240, available) + 'px';
  }

  // Früher: Werkzeugspalte des Editors links/rechts. Seit dem Kachel-Editor am PC (22.10.2026) ohne Bedeutung --
  // eine alte Einstellung „rechts“ darf das Layout nicht mehr spiegeln.
  loadSidebarPosition() {
    document.body.classList.remove('sidebar-right');
  }

  setSidebarPosition(pos) {
    localStorage.setItem('sidebarPosition', pos);
    document.body.classList.toggle('sidebar-right', pos === 'right');
  }

  // Reine Anzeige-Präferenz: Icons/Platzhalter in Funktionslisten aus- statt anzeigen (nützlich,
  // solange nicht jede Funktion ein eigenes Icon hat -- viele Platzhalter wirken sonst unruhig).
  loadFunctionIconsPreference() {
    const pref = localStorage.getItem('showFunctionIcons') || 'show';
    document.body.classList.toggle('hide-function-icons', pref === 'hide');
    const select = document.getElementById('function-icons-select');
    if (select) select.value = pref;
  }

  setShowFunctionIcons(pref) {
    localStorage.setItem('showFunctionIcons', pref);
    document.body.classList.toggle('hide-function-icons', pref === 'hide');
  }

  // Reine Anzeige-Präferenz: Dunkel/Hell, s. body.theme-light in style.css.
  loadThemePreference() {
    const pref = localStorage.getItem('theme') || 'dark';
    document.body.classList.toggle('theme-light', pref === 'light');
    const select = document.getElementById('theme-select');
    if (select) select.value = pref;
  }

  setTheme(pref) {
    localStorage.setItem('theme', pref);
    document.body.classList.toggle('theme-light', pref === 'light');
  }

  // Reine Anzeige-Präferenz: dezente Scanline-/Vignetten-Textur (Terminal-Look) ein-/ausblenden --
  // standardmäßig AUS, s. body.scanlines-on in style.css.
  loadScanlinePreference() {
    const pref = localStorage.getItem('scanlines') || 'off';
    document.body.classList.toggle('scanlines-on', pref === 'on');
    const select = document.getElementById('scanline-select');
    if (select) select.value = pref;
  }

  setScanlineEnabled(pref) {
    localStorage.setItem('scanlines', pref);
    document.body.classList.toggle('scanlines-on', pref === 'on');
  }

  // Reine Anzeige-Präferenz: welche Uhrzeit die Seitenleiste zeigt (real vs. ingame). Ingame-Uhrzeit
  // kommt aus this.lastGameTime, zuletzt vom 'telemetry-update'-Listener oben gesetzt (13.08.2026 --
  // vorher hier fälschlich als "Mod-Update nötig" ausgegeben, obwohl envHour/envMinute längst über
  // telemetryReader.js verfügbar sind, nur diese eine Anzeige war noch nicht angeschlossen).
  loadClockModePreference() {
    const pref = localStorage.getItem('clockMode') || 'real';
    const select = document.getElementById('clock-mode-select');
    if (select) select.value = pref;
  }

  // Telemetrie-Rate liegt im Server (gilt für alle Geräte), nicht im localStorage wie die Anzeige-
  // Einstellungen oben. Andere offene Browser bekommen die Änderung per 'telemetry-settings'.
  async loadTelemetryRate() {
    const select = document.getElementById('telemetry-rate-select');
    if (!select) return;
    try {
      const res = await fetch('/api/telemetry/settings');
      const data = await res.json();
      if (data.success) select.value = String(data.rate);
    } catch (e) {
      console.warn('Telemetrie-Rate nicht ladbar:', e);
    }
    this.socket?.on('telemetry-settings', (s) => { select.value = String(s.rate); });
  }

  async setTelemetryRate(value) {
    try {
      const res = await fetch('/api/telemetry/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rate: Number(value) })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
    } catch (e) {
      uiAlert('Aktualisierungsrate konnte nicht gespeichert werden: ' + e.message);
      this.loadTelemetryRate();
    }
  }

  setClockMode(pref) {
    localStorage.setItem('clockMode', pref);
    this.tickClock();
  }

  tickClock() {
    const el = document.getElementById('sidebar-clock');
    if (!el) return;
    const mode = localStorage.getItem('clockMode') || 'real';
    const label = document.getElementById('clock-label');
    // Kopfleiste (22.10.2026): knapp -- „Spiel“ vor der Spielzeit, ohne Spieldaten nur --:-- (Hinweis im Tooltip)
    if (label) label.textContent = mode === 'ingame' ? 'Spiel' : '';
    if (mode === 'ingame') {
      el.textContent = this.lastGameTime
        ? `${String(this.lastGameTime.hour).padStart(2, '0')}:${String(this.lastGameTime.minute).padStart(2, '0')}`
        : '--:--';
      el.title = this.lastGameTime ? '' : 'Keine Verbindung zu Farming Simulator 25';
    } else {
      el.textContent = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      el.title = '';
    }
  }

  setupTabNavigation() {
    // Dezente Icons vor jedes Menüpunkt-Label einfügen (s. NAV_ICONS/navIcon oben) -- einmalig für
    // alle statisch in index.html stehenden Nav-Buttons; dynamisch erzeugte (Steuerungsmenüs-Seiten)
    // rufen navIcon() direkt in ihrem eigenen Template auf.
    document.querySelectorAll('.main-tab-btn[data-icon]').forEach(btn => {
      btn.insertAdjacentHTML('afterbegin', navIcon(btn.dataset.icon));
    });

    // Main Tabs (Wurzel-Ebene ohne Kinder wie "Dashboard" + alle Unterpunkte)
    const mainTabBtns = document.querySelectorAll('.main-tab-btn[data-tab]');
    mainTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;
        this.switchMainTab(tabName);
      });
    });

    // Sektions-Punkte mit Unterpunkten (Bedienpanel, Konfiguration, Einstellungen, ...):
    // Klick zeigt deren Ebene und navigiert direkt zur ersten Unterseite dieses Bereichs.
    document.querySelectorAll('.main-tab-btn[data-section]').forEach(btn => {
      btn.addEventListener('click', () => this.showNavLevel2(btn.dataset.section));
    });

    // Zurück-Button: eine Sektion hoch (Inhalt bleibt, wie er gerade ist)
    document.getElementById('nav-back-btn').addEventListener('click', () => this.showNavRoot());

    // Gruppen-Tabs werden dynamisch erzeugt (s. renderCategoryTabs()) -- Klick-Handler werden
    // dort direkt beim Erstellen angehängt.

    // "Alle Funktionen löschen" liegt seit 30.09.2026 unter Entwicklertools > Zurücksetzen
    // (#tab-reset). Der Knopf ist gesperrt, bis das Bestätigungswort getippt wurde -- ein reines
    // confirm() ist hier zu leicht wegzuklicken, und die Aktion ist nicht umkehrbar.
    const delConfirm = document.getElementById('delete-all-functions-confirm');
    const delBtn = document.getElementById('delete-all-functions');
    if (delConfirm && delBtn) {
      const sync = () => { delBtn.disabled = delConfirm.value.trim().toUpperCase() !== 'LÖSCHEN'; };
      delConfirm.addEventListener('input', sync);
      delBtn.addEventListener('click', () => this.deleteAllFunctions());
      sync();
    }
  }

  switchMainTab(tabName) {
    // Seite gibt es nicht (mehr), z. B. eine gelöschte Kachel im Zurück-Verlauf: zur Startseite statt leerem
    // Bildschirm (23.10.2026 -- vorher wurden erst alle Seiten ausgeblendet, dann brach es ab)
    if (!document.getElementById(`tab-${tabName}`)) {
      console.warn('Seite nicht gefunden:', tabName);
      if (tabName !== 'dashboard-tiles') window.appNav?.home?.();
      return;
    }
    // Deactivate all tabs
    document.querySelectorAll('.main-tab-btn[data-tab]').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    // Activate selected tab -- alle Buttons mit diesem data-tab aktivieren, nicht nur den ersten:
    // eine Steuerungsmenüs-Seite kann sowohl in ihrer eigenen Ebene als auch als angepinntes
    // Bedienpanel auf der Wurzel-Ebene einen Button haben, beide sollen als aktiv markiert werden.
    document.querySelectorAll(`[data-tab="${tabName}"]`).forEach(btn => btn.classList.add('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');

    // Modul-Vor/Zurück-Pfeile brauchen keinen eigenen Sichtbarkeits-Umschalter mehr -- sie liegen
    // jetzt innerhalb von #tab-overview und sind darüber schon automatisch mit sichtbar/versteckt
    // (.tab-content{display:none}/.active{display:flex}). Erneutes Klicken auf "Übersicht" dient
    // zugleich als "Zurück zur Gesamtübersicht" -- kein eigener Button dafür nötig.
    if (tabName === 'overview' && window.moduleFlow) window.moduleFlow.backToOverview();
    if (tabName === 'vorgewende' && window.vorgewende) window.vorgewende.load();
    if (tabName === 'module-status' && window.moduleStatus) window.moduleStatus.refresh();
    if (tabName === 'profiles') this.resizeProfileList();
    if (tabName === 'functions') this.resizeFunctionsList();

    // Genereller Hook-Punkt für Module, die auf einen Tab-Wechsel reagieren müssen, ohne dass app.js
    // sie kennen muss (z. B. gpsGeraete.js, einrichtung.js).
    document.dispatchEvent(new CustomEvent('tabchanged', { detail: { tabName } }));
  }

  // Navigiert zu einem beliebigen Tab, egal ob er das erste Kind seiner Sektion ist oder nicht --
  // switchMainTab() alleine wechselt nur den Inhalt, rührt die Sektions-Sichtbarkeit NICHT an (Bug,
  // den die Seitenleisten-Links zuvor hatten: falscher Tab-Inhalt korrekt, aber falsche/keine
  // Navigation sichtbar). Für Sidebar-Kurzlinks und alles, was "wie ein normaler Klick" wirken soll.
  async navigateToTab(tabName) {
    const btn = document.querySelector(`.main-tab-btn[data-tab="${tabName}"]`);
    const level = btn?.closest('.nav-level')?.id;
    if (level && level !== 'nav-level-root') {
      // false = Entwickler-Code abgebrochen/falsch -> Ansicht bleibt wie sie ist
      // ohne erst die erste Unterseite aufzubauen (23.10.2026: sonst wurde z. B. die Startseite kurz gezeichnet)
      if (!(await this.showNavLevel2(level.replace('nav-level-', ''), false))) return;
    } else {
      this.showNavRoot(false);
      // Profile ist strukturell Teil der Wurzel-Ebene (kein eigenes .nav-level -- nur über den
      // Profil-Klick oben rechts erreichbar, ihr Menüpunkt links ist bewusst .nav-hidden), bekommt
      // showNavRoot() zufolge also KEINE Zurück-Taste. Ohne eigenen sichtbaren Menüpunkt links ist
      // von hier aber nicht auf Anhieb klar, wie man wieder wegkommt -- deshalb hier gezielt trotzdem
      // eingeblendet (Hendriks Feedback). Klick führt über den bereits bestehenden, unveränderten
      // Handler ganz normal zu showNavRoot() zurück (= Übersicht).
      if (tabName === 'profiles') {
        document.getElementById('nav-back-btn').style.display = 'flex';
      }
    }
    this.switchMainTab(tabName);
  }

  // async seit den eigenen Dialogen (21.10.2026): gibt false zurück, wenn der Entwickler-Code
  // abgebrochen oder falsch war (Ansicht bleibt dann unverändert), sonst true.
  async showNavLevel2(section, switchTab = true) {
    // Entwickler-Code-Huerde: einziger Einstiegspunkt in jede Nav-Sektion (auch Breadcrumb-Klicks und
    // navigateToTab() laufen hier durch, s. Kommentare dort) -- reicht deshalb als einzige Pruefstelle.
    if (section === 'entwicklungstools' && !this.devToolsUnlocked) {
      const input = await uiPrompt('Entwicklerwerkzeuge sind für die normale Bedienung nicht nötig.\nCode eingeben, um fortzufahren:', '', { title: 'Entwicklerwerkzeuge', ok: 'Öffnen' });
      if (input === null) return false; // abgebrochen -- Ansicht bleibt wie sie ist
      if (input.trim() !== DEV_TOOLS_CODE) {
        await uiAlert('Falscher Code.', { title: 'Entwicklerwerkzeuge', danger: true });
        return false;
      }
      this.devToolsUnlocked = true;
      sessionStorage.setItem('ch-dev-tools-unlocked', '1');
    }
    document.getElementById('nav-level-root').style.display = 'none';
    document.querySelectorAll('.nav-level').forEach(el => {
      if (el.id.startsWith('nav-level-') && el.id !== 'nav-level-root') el.style.display = 'none';
    });
    const level2 = document.getElementById(`nav-level-${section}`);
    level2.style.display = 'flex';
    document.getElementById('nav-back-btn').style.display = 'flex';
    this.currentNavSection = section;

    // Zahnrad zeigt "aktiv", solange man sich in Einstellungen oder einer Unterebene davon befindet --
    // bleibt im Gegensatz zu früher immer sichtbar, s. showNavRoot().
    const inEinstellungen = section === 'einstellungen' || NAV_PARENT[section] === 'einstellungen';
    document.getElementById('nav-settings-btn').classList.toggle('active', inEinstellungen);

    const firstChild = level2.querySelector('.main-tab-btn[data-tab]:not(.nav-hidden)');
    if (switchTab && firstChild) this.switchMainTab(firstChild.dataset.tab);
    return true;
  }

  // Zurück-Taste: normalerweise zur Wurzel-Ebene, außer die aktuelle Sektion hat selbst eine
  // Eltern-Sektion (s. NAV_PARENT, z.B. Entwicklertools -> Einstellungen) -- dann geht's nur eine
  // Ebene hoch. Der aktuell angezeigte Inhalt bleibt in beiden Fällen unverändert.
  showNavRoot(switchTab = true) {
    const parent = NAV_PARENT[this.currentNavSection];
    if (parent) {
      this.showNavLevel2(parent, switchTab);
      return;
    }
    document.querySelectorAll('.nav-level').forEach(el => {
      if (el.id !== 'nav-level-root') el.style.display = 'none';
    });
    document.getElementById('nav-back-btn').style.display = 'none';
    const rootLevel = document.getElementById('nav-level-root');
    rootLevel.style.display = 'flex';
    document.getElementById('nav-settings-btn').classList.remove('active');
    this.currentNavSection = null;

    // Bug-Fix: bisher wurde hier nur die Leiste umgeschaltet, Inhalt+Breadcrumb blieben auf der
    // zuletzt aktiven Unterseite stehen (z.B. "Einstellungen->Allgemein"), obwohl links schon die
    // Wurzel-Ebene zu sehen war. Wie bei showNavLevel2() auf das erste sichtbare Kind zurücksetzen.
    const firstChild = rootLevel.querySelector('.main-tab-btn[data-tab]:not(.nav-hidden)');
    if (switchTab && firstChild) this.switchMainTab(firstChild.dataset.tab);
  }

  // Gruppen-Tabs komplett neu aufbauen (Gruppen sind dynamisch, s. FunctionsManager.ensureCategory()).
  // Gruppenliste links (Funktionen-Übersicht, 23.10.2026): „Alle Funktionen“, die Gruppen aus categories.json und als
  // letzte die feste Auffanggruppe „Ohne Gruppe“ (functionGroups.js), je mit Anzahl. Während einer Suche ist keine gewählt.
  renderCategoryTabs() {
    const nav = document.getElementById('fn-groups');
    if (!nav) return;
    const FG = window.FunctionGroups;
    const fns = this.allFunctions || [];
    const searching = !!(this.fnSearch || '').trim();
    const cur = searching ? null : this.currentCategory;
    const knopf = (g, text, n) => `<button type="button" class="fn-group${g === cur ? ' active' : ''}" data-group="${escapeHtml(g)}"${g === cur ? ' aria-current="true"' : ''}>
        <span>${escapeHtml(text)}</span><span class="fn-group-n${n ? '' : ' zero'}">${n}</span></button>`;
    // Untergruppen (24.10.2026): Obergruppen aufklappbar, s. functionGroups.js gruppenListeHtml()
    const ohne = fns.filter(f => FG.functionInGroup(f, FG.UNCATEGORIZED_ID)).length;
    nav.innerHTML = '<div class="ov-label">Gruppen</div>'
      + knopf(FN_ALL, 'Alle Funktionen', fns.length)
      + FG.gruppenListeHtml(FG.gruppenBaum(this.allCategories || []), fns, cur)
      + knopf(FG.UNCATEGORIZED_ID, FG.UNCATEGORIZED_LABEL, ohne)
      + this.hubGroupTabHtml(searching) + `<div class="ov-spacer"></div>
      <button type="button" class="fn-groups-manage" onclick="window.categoryManager.open()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M4 12h16M4 17h7"></path><circle cx="17" cy="7" r="2"></circle><circle cx="14" cy="17" r="2"></circle></svg>Gruppen verwalten</button>`;
  }

  // ControlHub-Steuerung: feste Gruppe unter den eigenen, mit Untergruppen (Kachelseiten, Profile, GPS & Zähler);
  // nicht umbenennbar, nicht löschbar (steht nicht in „Gruppen verwalten“)
  hubGroupTabHtml(searching) {
    const hub = this.hubFunctions || [];
    if (!hub.length) return '';
    const FG = window.FunctionGroups, G = window.hubActions.GROUP;
    const cur = searching ? null : (this.currentCategory === FN_HUB ? G : this.currentCategory);
    const baum = FG.gruppenBaum([G], hub.flatMap(f => f.categories || []));
    return `<div class="ov-label fn-group-sep">Fest eingebaut</div>${FG.gruppenListeHtml(baum, hub, cur)}`;
  }

  // Gehört die Gruppe zur festen ControlHub-Steuerung (oder ist es der alte Platzhalter)?
  istHubGruppe(g) {
    const G = window.hubActions?.GROUP;
    return g === FN_HUB || (!!G && (g === G || String(g).startsWith(G + window.FunctionGroups.UG)));
  }

  switchCategoryTab(category) {
    this.currentCategory = category;
    this.fnSearch = '';
    const input = document.getElementById('fn-search');
    if (input) input.value = '';
    this.renderCategoryTabs();
    this.renderFunctionsList();
    document.getElementById('functions-list')?.scrollTo(0, 0);
  }

  setupSocketListeners() {
    this.socket.on('connect', () => { console.log('WebSocket verbunden'); this.clearLinkLost('server'); });
    this.socket.on('disconnect', () => { console.log('WebSocket getrennt'); this.armLinkLost('server'); });

    this.socket.on('status', (data) => {
      this.updateConnectionStatus(data.serial.connected);
      this.currentProfile = data.profile;
      document.getElementById('current-profile').textContent = profilAnzeige(this.currentProfile) || 'kein Profil';
    });

    this.socket.on('serialStatus', (status) => {
      this.updateConnectionStatus(status.connected);
    });

    this.socket.on('connection-status', (data) => {
      const selbst = this.verbindungAngefragt;
      this.verbindungAngefragt = false;
      if (data.success) {
        this.updateConnectionStatus(true);
      } else if (selbst) {
        uiAlert('Verbindung fehlgeschlagen: ' + data.error);
      }
    });

    // Ein Profil wurde gezielt geändert (B3, auch von einem anderen Gerät): eigene Kopie neu laden
    this.socket.on('profile-updated', () => this.loadProfiles());

    this.socket.on('profileChanged', (data) => {
      this.currentProfile = data.name;
      document.getElementById('current-profile').textContent = profilAnzeige(this.currentProfile);
      this.renderProfileList(); // hervorgehobenes Profil in der Liste muss mitwechseln
    });

    // Automatischer Profilwechsel: globaler Schalter -- von JEDEM verbundenen Gerät aus umschaltbar,
    // deshalb per Broadcast synchron halten statt nur lokal umzuschalten (s. toggleAutoSwitch()).
    this.socket.on('auto-switch-changed', (data) => {
      this.updateAutoSwitchStatus(data.enabled);
    });

    // Ingame-Uhrzeit für die Seitenleisten-Uhr (s. tickClock()) -- envHour/envMinute werden längst von
    // telemetryReader.js geliefert (u.a. schon von der Wetter-&-Wirtschaft-Dashboardseite genutzt), nur
    // diese eine Anzeige hier war noch nicht angeschlossen.
    this.socket.on('telemetry-update', (data) => {
      this.lastGameTime = (data.available && data.envHour >= 0 && data.envMinute >= 0)
        ? { hour: data.envHour, minute: data.envMinute }
        : null;
      if ((localStorage.getItem('clockMode') || 'real') === 'ingame') this.tickClock();
    });

    this.socket.on('state-update', (data) => {
      try {
        // Speichere Achsenwerte für Kalibrierung
        if (data.axes) {
          this.lastAxisValue = data.axes;
        }

      } catch (error) {
        console.error('Fehler bei state-update:', error);
      }
    });
  }

  setupEventListeners() {
    document.getElementById('refresh-ports').addEventListener('click', () => this.loadPorts());
    // Ein-/Ausstecken-Assistent statt des frueheren blinden "ersten Kennungs-Treffer nehmen"
    // (25.08.2026, s. connectionWizard.js).
    document.getElementById('auto-detect').addEventListener('click', () => window.connectionWizard.open());

    document.getElementById('connect').addEventListener('click', () => {
      const port = document.getElementById('port-select').value;
      if (!port) {
        uiAlert('Bitte Port auswählen');
        return;
      }
      this.verbindungAngefragt = true;   // Fehler nur melden, wenn DIESER Knopf verbunden hat (B4: die Antwort an den
      this.socket.emit('connect-port', { port, baudRate: 115200 });   // Verbindungs-Assistenten kommt auf derselben Verbindung an)
    });

    document.getElementById('disconnect').addEventListener('click', () => {
      this.manualDisconnect = true; // bewusst getrennt -> keine große "Armlehne getrennt"-Meldung
      this.socket.emit('disconnect-port');
      this.updateConnectionStatus(false);
    });

    document.getElementById('new-profile').addEventListener('click', () => this.createNewProfile());
    document.getElementById('pf-more').addEventListener('click', e => uiMenu(e.currentTarget, [
      { label: 'Beispielprofile hinzufügen …', run: () => this.addExampleProfiles() },
      { label: 'Alle exportieren', run: () => this.exportProfiles() },
      { label: 'Importieren …', run: () => this.importProfiles() }
    ], { key: 'profiles-more' }));

    // Funktionen-Übersicht: Neu, „Mehr“-Menü, Suche, Gruppen und Liste (Klicks gesammelt am Container)
    document.getElementById('new-function').addEventListener('click', () => window.functionEditor.openCreate());
    document.getElementById('fn-more').addEventListener('click', e => this.openFunctionsMoreMenu(e.currentTarget));
    document.getElementById('input-binding-file').addEventListener('change', (e) => this.importInputBindingXml(e));
    document.getElementById('fn-search').addEventListener('input', e => {
      this.fnSearch = e.target.value;
      this.renderCategoryTabs();
      this.renderFunctionsList();
    });
    document.getElementById('fn-groups').addEventListener('click', e => {
      const g = e.target.closest('[data-group]');
      if (g) this.switchCategoryTab(g.dataset.group);
    });
    document.getElementById('functions-list').addEventListener('click', e => {
      const more = e.target.closest('[data-group]');
      if (more) { this.switchCategoryTab(more.dataset.group); return; }
      const row = e.target.closest('.fn-row');
      const act = e.target.closest('[data-act]');
      if (!row || !act) return;
      if (act.dataset.act === 'hub-info') { this.showHubInfo(row.dataset.fn); return; }
      if (act.dataset.act === 'more') this.openFunctionMenu(row.dataset.fn, act);
      else window.functionEditor.openEdit(row.dataset.fn);
    });
  }

  async createNewProfile() {
    const name = (await uiPrompt('Name für das neue Profil:', '', { title: 'Neues Profil', ok: 'Anlegen' }))?.trim();
    if (!name) return;

    if (this.allProfiles?.some(p => p.name === name)) {
      uiAlert('Ein Profil mit diesem Namen existiert bereits!');
      return;
    }

    try {
      const response = await fetch('/api/profile/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });

      const result = await response.json();

      if (result.success) {
        await this.loadProfiles();
        window.showToast(`Profil "${name}" erstellt`);
        this.socket.emit('switch-profile', { name });
      } else {
        uiAlert('Fehler: ' + result.error);
      }
    } catch (error) {
      uiAlert('Erstellen fehlgeschlagen: ' + error.message);
    }
  }

  // Umbenennen/Duplizieren/Löschen wirken auf das Profil aus dem „⋯“ der Zeile (Durchsicht B10, 24.10.2026: vorher nur
  // auf das AKTIVE Profil -- man musste es erst laden, und damit wechselte die Belegung im Spiel)
  async deleteProfile(name = this.currentProfile) {
    if (!name) {
      uiAlert('Kein Profil aktiv');
      return;
    }
    if (name === 'default') {
      uiAlert(`Der ${PROFIL_STANDARD_NAME} kann nicht gelöscht werden.`);
      return;
    }

    window.confirmDialog.show(`Profil "${name}" wirklich löschen?`, async () => {
      try {
        // Profilname ist Nutzertext (Leerzeichen, /, ? …) -- für den URL-Pfad kodieren
        const response = await fetch(`/api/profile/${encodeURIComponent(name)}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
          window.showToast(`Profil "${name}" gelöscht`);
          await this.loadProfiles();
        } else {
          uiAlert('Fehler: ' + result.error);
        }
      } catch (error) {
        uiAlert('Löschen fehlgeschlagen: ' + error.message);
      }
    }, { danger: true });
  }

  async renameProfile(oldName = this.currentProfile) {
    if (!oldName) {
      uiAlert('Kein Profil aktiv');
      return;
    }
    if (oldName === 'default') {
      uiAlert(`Der ${PROFIL_STANDARD_NAME} kann nicht umbenannt werden.`);
      return;
    }

    const newName = (await uiPrompt('Neuer Name für das Profil:', oldName, { title: 'Profil umbenennen', ok: 'Umbenennen' }))?.trim();
    if (!newName || newName === oldName) return;

    try {
      const response = await fetch('/api/profile/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName, newName })
      });
      const result = await response.json();
      if (result.success) {
        if (oldName === this.currentProfile) {
          this.currentProfile = newName;
          document.getElementById('current-profile').textContent = newName;
        }
        await this.loadProfiles();
      } else {
        uiAlert('Fehler: ' + result.error);
      }
    } catch (error) {
      uiAlert('Umbenennen fehlgeschlagen: ' + error.message);
    }
  }

  // aktivieren: danach gleich auf die Kopie umschalten (vom schreibgeschützten Gamepad-Modus aus, basis.js gamepadModusHinweis())
  async duplicateProfile(sourceName = this.currentProfile, { aktivieren = false } = {}) {
    if (!sourceName) {
      uiAlert('Kein Profil aktiv');
      return;
    }

    const newName = (await uiPrompt('Name für die Kopie:', `${profilAnzeige(sourceName)} (Kopie)`, { title: 'Profil duplizieren', ok: aktivieren ? 'Kopieren und aktivieren' : 'Duplizieren' }))?.trim();
    if (!newName) return;

    try {
      const response = await fetch('/api/profile/duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceName, newName })
      });
      const result = await response.json();
      if (result.success) {
        window.showToast(`Profil "${newName}" angelegt`);
        if (aktivieren) this.socket.emit('switch-profile', { name: newName });
        await this.loadProfiles();
      } else {
        uiAlert('Fehler: ' + result.error);
      }
    } catch (error) {
      uiAlert('Duplizieren fehlgeschlagen: ' + error.message);
    }
  }

  selectProfileFromList(name) {
    if (name === this.currentProfile) return; // schon aktiv, nichts zu bestätigen
    window.confirmDialog.show(`Profil "${name}" wird geladen. Fortfahren?`, () => {
      this.socket.emit('switch-profile', { name });
    }, { danger: false });
  }

  // Liste im Stil der Funktionen (Durchsicht B10, Hendrik 24.10.2026): Zeile antippen = aktivieren (wie bisher), „⋯“ =
  // Umbenennen, Duplizieren, Fahrzeug zuordnen, Exportieren, Löschen -- ohne das Profil zu laden. Der Griff ≡ sortiert
  // per Ziehen (vorher eigener Modus „Reihenfolge ändern“).
  renderProfileList() {
    const container = document.getElementById('profile-list');
    if (!container || !this.allProfiles) return;
    const total = document.getElementById('pf-total');
    if (total) total.textContent = this.allProfiles.length;
    const DOTS = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><circle cx="19" cy="12" r="1.8"></circle></svg>';
    container.innerHTML = this.allProfiles.map((profile, i) => {
      const isActive = profile.name === this.currentProfile;
      const fz = profile.autoSwitchTriggers || [];
      const sub = profile.name === PROFIL_STANDARD ? 'schreibgeschützt · jede Taste eine Gamepad-Taste, belegt wird im Spiel'
        : fz.length ? `wechselt bei: ${fz.join(', ')}` : 'kein Fahrzeug zugeordnet';
      return `<div class="fn-row pf-row ${isActive ? 'pf-row--aktiv' : ''}" data-index="${i}">
          <span class="pf-grip" title="Ziehen zum Sortieren" aria-hidden="true">≡</span>
          <button type="button" class="fn-open" data-act="activate">
            <span class="fn-txt"><b>${escapeHtml(profilAnzeige(profile.name))}${isActive ? ' <span class="profile-row-badge">aktiv</span>' : ''}</b><small>${escapeHtml(sub)}</small></span></button>
          <button type="button" class="ov-icon-btn" data-act="more" aria-label="Weitere Aktionen für ${escapeHtml(profilAnzeige(profile.name))}" aria-haspopup="menu">${DOTS}</button>
        </div>`;
    }).join('');
    // Index statt Name im Attribut: Profilnamen mit ' oder " brachen den alten onclick-String
    container.querySelectorAll('.pf-row').forEach(row => {
      const i = Number(row.dataset.index);
      const p = () => this.allProfiles[i];
      row.querySelector('[data-act="activate"]').addEventListener('click', () => { if (p()) this.selectProfileFromList(p().name); });
      row.querySelector('[data-act="more"]').addEventListener('click', e => this.openProfileMenu(p(), e.currentTarget));
      row.querySelector('.pf-grip').addEventListener('pointerdown', e => this.startProfileDrag(e, i));
    });
    this.resizeProfileList();
  }

  openProfileMenu(p, anchor) {
    if (!p) return;
    const istDefault = p.name === 'default', aktiv = p.name === this.currentProfile;
    uiMenu(anchor, [
      ...(aktiv ? [] : [{ label: 'Aktivieren', run: () => this.selectProfileFromList(p.name) }]),
      ...(istDefault ? [] : [{ label: 'Umbenennen', run: () => this.renameProfile(p.name) }]),
      { label: istDefault ? 'Als eigenes Profil kopieren' : 'Duplizieren', run: () => this.duplicateProfile(p.name) },
      ...(window.vehicleAssignmentModal && !istDefault ? [{ label: 'Fahrzeug zuordnen', run: () => window.vehicleAssignmentModal.open(p.name) }] : []),
      { label: 'Exportieren', run: () => this.exportProfile(p) },
      ...(istDefault ? [] : [null, { label: 'Löschen', danger: true, run: () => this.deleteProfile(p.name) }])
    ], { key: 'profile:' + p.name });
  }

  // Ein Profil als Datei, im Format von „Alle exportieren“ (Import über „Importieren …“)
  exportProfile(p) {
    downloadJson({ profiles: [p] }, `Profil ${p.name}`);
    window.showToast(`Profil "${p.name}" exportiert (Ordner Downloads)`);
  }

  // Ziehen per Pointer-Events (statt natives HTML5-Drag&Drop) -- läuft damit auch per Touch auf dem
  // Tablet in der Armlehnen-Halterung. Nachbar-Zeilen rutschen live per translateY, sobald die
  // gezogene Zeile ihre Mitte überschreitet (gleiches Prinzip wie iOS/Android-Listen-Neuordnung);
  // final gespeichert wird erst beim Loslassen.
  startProfileDrag(event, index) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();

    const container = document.getElementById('profile-list');
    const rows = Array.from(container.querySelectorAll('.pf-row'));
    const row = rows[index];
    if (!row) return;

    row.setPointerCapture(event.pointerId);
    row.classList.add('dragging');
    const startY = event.clientY;
    const rowHeight = row.getBoundingClientRect().height;   // Zeilen liegen ohne Abstand untereinander (B10)
    let currentIndex = index;

    const onMove = (e) => {
      const delta = e.clientY - startY;
      row.style.transform = `translateY(${delta}px)`;

      const shift = Math.round(delta / rowHeight);
      const targetIndex = Math.max(0, Math.min(rows.length - 1, index + shift));
      if (targetIndex !== currentIndex) {
        rows.forEach((r, i) => {
          if (r === row) return;
          const passed = (i > index && i <= targetIndex) ? -1 : (i < index && i >= targetIndex) ? 1 : 0;
          r.style.transform = passed ? `translateY(${passed * rowHeight}px)` : '';
        });
        currentIndex = targetIndex;
      }
    };

    const onEnd = () => {
      row.releasePointerCapture(event.pointerId);
      row.removeEventListener('pointermove', onMove);
      row.removeEventListener('pointerup', onEnd);
      row.removeEventListener('pointercancel', onEnd);
      row.classList.remove('dragging');
      rows.forEach(r => { r.style.transform = ''; });

      if (currentIndex !== index) {
        const order = this.allProfiles.map(p => p.name);
        const [moved] = order.splice(index, 1);
        order.splice(currentIndex, 0, moved);
        this.saveProfileOrder(order);
      }
    };

    row.addEventListener('pointermove', onMove);
    row.addEventListener('pointerup', onEnd);
    row.addEventListener('pointercancel', onEnd);
  }

  async saveProfileOrder(order) {
    try {
      const response = await fetch('/api/profiles/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order })
      });
      const result = await response.json();
      if (!result.success) {
        uiAlert('Umsortieren fehlgeschlagen: ' + result.error);
        return;
      }
      await this.loadProfiles();
    } catch (error) {
      uiAlert('Umsortieren fehlgeschlagen: ' + error.message);
    }
  }

  async exportProfiles() {
    try {
      const response = await fetch('/api/profiles/export');
      const data = await response.json();

      if (data.success) {
        downloadJson(data.data, `Profile ${new Date().toISOString().split('T')[0]}`);
        window.showToast?.('Profile exportiert (Ordner Downloads)');
      }
    } catch (error) {
      uiAlert('Export fehlgeschlagen: ' + error.message);
    }
  }

  // Beispielprofile mit fertiger Belegung (24.10.2026, server/beispielprofile.js): vorhandene Profile bleiben unangetastet
  async addExampleProfiles() {
    try {
      const { profile = [] } = await fetch('/api/profiles/beispiele').then(r => r.json());
      if (!profile.length) { uiAlert('Für dieses Spiel und diesen Controller gibt es noch keine Beispielprofile.'); return; }
      const neu = profile.filter(p => !p.vorhanden);
      if (!neu.length) { uiAlert('Alle Beispielprofile sind schon da.'); return; }
      const liste = neu.map(p => `• ${p.name}: ${p.beschreibung}`).join('\n');
      const schon = profile.length > neu.length ? `\n\nSchon vorhanden (bleibt unverändert): ${profile.filter(p => p.vorhanden).map(p => p.name).join(', ')}` : '';
      const wahl = await uiChoice(`${liste}${schon}\n\nDie Achsen übernehmen sie aus deinem aktiven Profil. Fehlende Funktionen holt ControlHub aus der inputBinding.xml des Spiels.`,
        [{ label: neu.length === 1 ? 'Profil hinzufügen' : `${neu.length} Profile hinzufügen`, value: 'ja' }], { title: 'Beispielprofile hinzufügen' });
      if (wahl !== 'ja') return;
      const r = await fetch('/api/profiles/beispiele', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ namen: neu.map(p => p.name) }) }).then(x => x.json());
      if (!r.success) { uiAlert('Fehler: ' + r.error); return; }
      await this.loadProfiles();
      await this.loadFunctions?.();
      let text = `Hinzugefügt: ${r.hinzugefuegt.join(', ') || 'keins'}.`;
      if (r.achsenVon) text += `\nAchsen wie im Profil „${profilAnzeige(r.achsenVon)}“.`;
      if (r.funktionenErgaenzt) text += `\n${r.funktionenErgaenzt} Funktionen aus der inputBinding.xml des Spiels ergänzt.`;
      if (r.fehlend?.length) text += `\n\n${r.fehlend.length} Tasten haben noch keine Funktion, weil sie in deiner inputBinding.xml fehlen. Funktionen → Mehr → Aus dem Spiel neu einlesen, danach sind sie belegt.`;
      uiAlert(text, { forceDialog: true });
    } catch (error) {
      uiAlert('Beispielprofile konnten nicht hinzugefügt werden: ' + error.message);
    }
  }

  async importProfiles() {
    // Öffnet den Import-Dialog mit Quellenwahl (Datei / vorhandenes Profil), s. profileImport.js.
    // Bis 30.09.2026 stand hier direkt der Dateidialog samt confirm()/prompt()-Kaskade, in der der
    // Modus als Zahl ("1 = Merge, 2 = Replace, 3 = Add-Missing") eingetippt werden musste.
    window.profileImport.open();
  }

  async loadPorts() {
    try {
      const response = await fetch('/api/ports');
      const data = await response.json();

      const select = document.getElementById('port-select');
      select.innerHTML = '<option value="">Port wählen...</option>';

      data.ports.forEach(port => {
        const option = document.createElement('option');
        option.value = port.path;
        option.textContent = `${port.path} ${port.isArduino ? '(Arduino)' : ''} - ${port.manufacturer}`;
        select.appendChild(option);
      });

      console.log('Ports aktualisiert');
    } catch (error) {
      uiAlert('Fehler beim Laden der Ports');
    }
  }

  async loadProfiles() {
    try {
      const response = await fetch('/api/profiles');
      const data = await response.json();

      // Statusleiste oben zeigt das aktive Profil nur noch als Text (kein eigenes Dropdown mehr --
      // umgeschaltet wird ausschließlich auf der Profil-Seite selbst, s. index.html .top-statusbar).
      const statusLabel = document.getElementById('current-profile');
      if (!statusLabel) {
        console.error('current-profile Element nicht gefunden!');
        return;
      }

      this.allProfiles = data.profiles || [];
      if (this.allProfiles.length === 0) {
        console.warn('Keine Profile vorhanden');
      }
      if (this.allProfiles.some(p => p.name === data.current)) {
        this.currentProfileData = this.allProfiles.find(p => p.name === data.current);
      }

      statusLabel.textContent = profilAnzeige(data.current) || 'kein Profil';
      this.currentProfile = data.current;
      this.renderProfileList();

    } catch (error) {
      console.error('Fehler beim Laden der Profile:', error);
      uiAlert('Fehler beim Laden der Profile: ' + error.message);
    }
  }

  updateConnectionStatus(connected) {
    const status = document.getElementById('connection-status');
    const connectBtn = document.getElementById('connect');
    const disconnectBtn = document.getElementById('disconnect');

    // Akustischer Hinweis nur bei einem ECHTEN Wechsel von verbunden -> getrennt -- nicht beim ersten
    // Aufruf (Seite frisch geladen, war ja nie "wirklich" verbunden) und nicht bei wiederholten
    // "immer noch getrennt"-Updates (this.wasConnected bleibt sonst undefined bzw. bereits false).
    if (this.wasConnected === true && connected === false) {
      this.playDisconnectAlert();
      if (!this.manualDisconnect) this.armLinkLost('pico');
    }
    if (connected) {
      this.manualDisconnect = false;
      this.clearLinkLost('pico');
    }
    this.wasConnected = connected;

    if (connected) {
      status.textContent = 'Verbunden';
      status.className = 'status connected';
      connectBtn.disabled = true;
      disconnectBtn.disabled = false;
    } else {
      status.textContent = 'Getrennt';
      status.className = 'status disconnected';
      connectBtn.disabled = false;
      disconnectBtn.disabled = true;
    }
  }

  // Automatischer Profilwechsel je nach Fahrzeug/Anbaugerät -- globaler Schalter im Header, unabhängig
  // vom einzelnen Profil (s. server/autoSwitchManager.js). Gleiches Optik-Muster wie
  // updateConnectionStatus() oben (.status connected/disconnected).
  async loadAutoSwitchStatus() {
    try {
      const res = await fetch('/api/auto-switch');
      const result = await res.json();
      if (result.success) this.updateAutoSwitchStatus(result.enabled);
    } catch (error) {
      console.error('Auto-Wechsel-Status konnte nicht geladen werden:', error);
    }
  }

  async toggleAutoSwitch() {
    try {
      const res = await fetch('/api/auto-switch/toggle', { method: 'POST' });
      const result = await res.json();
      // Keine lokale Optimistic-Update -- die Bestätigung kommt ohnehin sofort per
      // 'auto-switch-changed'-Broadcast (auch an DIESEN Client), einheitlich mit Umschalten von
      // einem ANDEREN Gerät aus.
      if (!result.success) uiAlert('Umschalten fehlgeschlagen: ' + result.error);
    } catch (error) {
      uiAlert('Umschalten fehlgeschlagen: ' + error.message);
    }
  }

  updateAutoSwitchStatus(enabled) {
    const status = document.getElementById('auto-switch-status');
    if (!status) return;
    status.textContent = enabled ? 'An' : 'Aus';
    status.className = enabled ? 'status connected' : 'status disconnected';
  }

  // ---- Große Meldung bei Verbindungsverlust (21.10.2026, Hendriks Entscheidung) ----
  // Erst nach LINK_LOST_DELAY_MS ununterbrochener Trennung (kurze Aussetzer/Neuverbindungen bleiben still).
  // 'pico'   = Armlehne (USB) getrennt -- die Firmware fällt dann auf ihre Standardbelegung zurück.
  // 'server' = dieses Gerät erreicht den ControlHub-Server nicht (Server beendet, WLAN weg).
  // Verschwindet von selbst, sobald die Verbindung wieder steht.
  armLinkLost(kind) {
    this.linkLostTimers = this.linkLostTimers || {};
    if (this.linkLostTimers[kind]) return;
    this.linkLostTimers[kind] = setTimeout(() => {
      this.linkLostTimers[kind] = null;
      this.showLinkLost(kind);
    }, LINK_LOST_DELAY_MS);
  }

  clearLinkLost(kind) {
    this.linkLostTimers = this.linkLostTimers || {};
    clearTimeout(this.linkLostTimers[kind]);
    this.linkLostTimers[kind] = null;
    const el = document.getElementById('link-lost-overlay');
    if (el && el.dataset.kind === kind && el.style.display !== 'none') {
      el.style.display = 'none';
      window.showToast?.(kind === 'pico' ? 'Controller wieder verbunden' : 'ControlHub wieder erreichbar');
    }
  }

  showLinkLost(kind) {
    let el = document.getElementById('link-lost-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'link-lost-overlay';
      el.className = 'link-lost-overlay';
      el.innerHTML = `
        <div class="link-lost-card" role="alertdialog" aria-live="assertive">
          <div class="link-lost-icon">⚠</div>
          <h2 class="link-lost-title"></h2>
          <p class="link-lost-text"></p>
          <div class="link-lost-buttons">
            <button class="btn-secondary" data-act="hide">Ausblenden</button>
            <button class="btn-primary" data-act="connection">Zur Verbindung</button>
          </div>
        </div>`;
      el.querySelector('[data-act="hide"]').onclick = () => { el.style.display = 'none'; };
      el.querySelector('[data-act="connection"]').onclick = () => { el.style.display = 'none'; this.navigateToTab('connection'); };
      document.body.appendChild(el);
    }
    const pico = kind === 'pico';
    // Server-Meldung hat Vorrang (ohne Server sind auch Pico-Infos nicht aktuell)
    if (pico && el.dataset.kind === 'server' && el.style.display !== 'none') return;
    el.dataset.kind = kind;
    el.querySelector('.link-lost-title').textContent = pico ? 'Controller getrennt' : 'ControlHub nicht erreichbar';
    el.querySelector('.link-lost-text').textContent = pico
      ? `Die Verbindung zum Controller${window.controllerInfo?.profile?.name ? ` (${window.controllerInfo.profile.name})` : ''} ist seit einigen Sekunden unterbrochen. Er arbeitet jetzt allein weiter (die CraftConsole mit ihrer Standardbelegung). Bitte USB-Kabel prüfen – ControlHub verbindet sich von selbst wieder.`
      : 'Dieses Gerät erreicht den ControlHub-Server nicht mehr. Läuft ControlHub auf dem PC, und ist dieses Gerät im selben WLAN? Die Seite verbindet sich von selbst wieder.';
    el.querySelector('[data-act="connection"]').style.display = pico ? '' : 'none';
    el.style.display = 'flex';
  }

  // Zwei kurze, tiefe Warntöne per Web Audio API -- bewusst ohne externe Audiodatei, damit nichts
  // mitgeliefert/nachgeladen werden muss. Fehler (z.B. Browser blockiert Audio vor erster Nutzer-
  // interaktion) werden bewusst verschluckt -- ein fehlender Ton darf die Statusanzeige nicht stören.
  playDisconnectAlert() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const playBeep = (startTime) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 220;
        gain.gain.setValueAtTime(0.15, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.25);
      };
      playBeep(ctx.currentTime);
      playBeep(ctx.currentTime + 0.3);
    } catch (error) {
      console.error('Warnton konnte nicht abgespielt werden:', error);
    }
  }

  async loadFunctions() {
    try {
      const response = await fetch('/api/functions');
      const data = await response.json();

      if (data.success) {
        this.allFunctions = data.functions;
        this.allCategories = data.categories;
        this.protectedCategories = data.protectedCategories || [];
        this.hubFunctions = (await window.hubActions?.pseudoFunctions?.().catch(() => [])) || [];

        // Falls die aktuelle Gruppe nicht (mehr) existiert (z.B. erster Start oder nach
        // "Alle Funktionen löschen"), auf die erste verfügbare Gruppe zurückfallen. Auffanggruppe
        // zählt hier mit (groupTabList()), sonst würde ein Reload mitten in ihrer Ansicht ungefragt
        // auf die erste echte Gruppe zurückspringen.
        const FGk = window.FunctionGroups;
        const knownGroups = [FN_ALL, FN_HUB, FGk.UNCATEGORIZED_ID,
          ...FGk.gruppenBaum(this.allCategories).flatMap(k => [k.name, ...k.kinder])];
        if (!this.currentCategory || !(knownGroups.includes(this.currentCategory) || this.istHubGruppe(this.currentCategory))) {
          this.currentCategory = FN_ALL;
        }

        // Gruppen-Tabs aktualisieren
        this.renderCategoryTabs();

        // Funktionsliste rendern
        this.renderFunctionsList();
      }
    } catch (error) {
      console.error('Fehler beim Laden der Funktionen:', error);
    }
  }

  // Funktionsliste (23.10.2026): eine ruhige Zeile je Funktion -- Art, Name, Tasten als Tastenkappen, „⋯“. In „Alle
  // Funktionen“ nach Gruppen mit Zwischenüberschrift; große Gruppen zeigen dort nur die ersten vier und „Alle n zeigen“.
  renderFunctionsList() {
    const list = document.getElementById('functions-list');
    if (!list) return;
    const FG = window.FunctionGroups;
    const fns = this.allFunctions || [];
    const total = document.getElementById('fn-total');
    if (total) total.textContent = fns.length;
    const q = (this.fnSearch || '').trim().toLowerCase();
    let rows = [], title, countText, empty;
    const hub = this.hubFunctions || [];
    if (q) {
      const hits = fns.filter(f => f.name.toLowerCase().includes(q) || describeActions(f.actions).toLowerCase().includes(q));
      const hubHits = hub.filter(f => f.name.toLowerCase().includes(q));
      rows = [...hits.map(f => this.functionRowHtml(f, true)), ...hubHits.map(f => this.hubRowHtml(f, true))];
      title = `Suche „${(this.fnSearch || '').trim()}“`;
      countText = `${hits.length + hubHits.length} Treffer`;
      empty = 'Keine Funktion gefunden.';
    } else if (this.currentCategory === FN_ALL || !this.currentCategory) {
      const groups = [...FG.gruppenBaum(this.allCategories || []).map(k => k.name), FG.UNCATEGORIZED_ID];
      let used = 0;
      for (const g of groups) {
        const fs = fns.filter(f => FG.functionInGroup(f, g, true));
        if (!fs.length) continue;
        used++;
        rows.push(`<div class="fn-sec"><span>${escapeHtml(FG.groupLabel(g))}</span><span>${fs.length}</span></div>`);
        const shown = fs.length > 8 ? fs.slice(0, 4) : fs;
        rows.push(...shown.map(f => this.functionRowHtml(f, false)));
        if (shown.length < fs.length) rows.push(`<div class="fn-more"><button type="button" data-group="${escapeHtml(g)}">Alle ${fs.length} in „${escapeHtml(FG.groupLabel(g))}“ zeigen ›</button></div>`);
      }
      if (hub.length) {
        rows.push(`<div class="fn-sec"><span>${escapeHtml(window.hubActions.GROUP)} · fest eingebaut</span><span>${hub.length}</span></div>`);
        rows.push(...hub.slice(0, 4).map(f => this.hubRowHtml(f, false)));
        if (hub.length > 4) rows.push(`<div class="fn-more"><button type="button" data-group="${FN_HUB}">Alle ${hub.length} in „${escapeHtml(window.hubActions.GROUP)}“ zeigen ›</button></div>`);
      }
      title = 'Alle Funktionen';
      countText = `${fns.length} in ${used} ${used === 1 ? 'Gruppe' : 'Gruppen'}`;
      empty = 'Noch keine Funktionen. Leg mit „Neue Funktion“ die erste an.';
    } else if (this.istHubGruppe(this.currentCategory)) {
      const g = this.currentCategory === FN_HUB ? window.hubActions.GROUP : this.currentCategory;
      const fs = hub.filter(f => FG.functionInGroup(f, g, true));
      rows = [`<div class="fn-hub-note">Diese Aktionen wirken nur in ControlHub, nicht im Spiel. Du legst sie wie jede andere Funktion auf eine Taste: unter Belegung das Modul öffnen, Taste antippen, Gruppe „${escapeHtml(window.hubActions.GROUP)}“. Ändern oder löschen kannst du sie nicht.</div>`,
        ...this.nachUntergruppen(g, fs, FG.gruppenBaum([window.hubActions.GROUP], hub.flatMap(f => f.categories || [])), f => this.hubRowHtml(f, false))];
      title = g;
      countText = `${fs.length} ${fs.length === 1 ? 'Aktion' : 'Aktionen'} · fest eingebaut`;
      empty = '';
    } else {
      const fs = fns.filter(f => FG.functionInGroup(f, this.currentCategory, true));
      rows = this.nachUntergruppen(this.currentCategory, fs, FG.gruppenBaum(this.allCategories || []), f => this.functionRowHtml(f, false));
      title = FG.groupLabel(this.currentCategory);
      countText = `${fs.length} ${fs.length === 1 ? 'Funktion' : 'Funktionen'}`;
      empty = this.currentCategory === FG.UNCATEGORIZED_ID ? 'Jede Funktion hat eine Gruppe.' : 'In dieser Gruppe ist noch nichts.';
    }
    document.getElementById('fn-list-title').textContent = title;
    document.getElementById('fn-list-count').textContent = countText;
    const hint = document.querySelector('#tab-functions .ov-hint');
    if (hint) hint.textContent = !q && this.istHubGruppe(this.currentCategory) ? 'Antippen für Hinweis' : 'Antippen zum Bearbeiten';
    list.innerHTML = rows.length ? rows.join('') : `<div class="fn-empty">${escapeHtml(empty)}</div>`;
    this.resizeFunctionsList();
  }

  // Zeilen einer Gruppe; bei einer Obergruppe erst die Funktionen direkt darin, dann je Untergruppe mit Überschrift
  nachUntergruppen(g, fs, baum, zeile) {
    const FG = window.FunctionGroups;
    const knoten = baum.find(k => k.name === g);
    if (!knoten || !knoten.kinder.length) return fs.map(zeile);
    const rows = fs.filter(f => FG.functionInGroup(f, g)).map(zeile);
    for (const c of knoten.kinder) {
      const drin = fs.filter(f => FG.functionInGroup(f, c) && !FG.functionInGroup(f, g));
      if (!drin.length) continue;
      rows.push(`<div class="fn-sec"><span>${escapeHtml(FG.groupLabel(c, true))}</span><span>${drin.length}</span></div>`, ...drin.map(zeile));
    }
    return rows;
  }

  // Eine Zeile: Symbol nach Art der Aktionen (oder das eigene Bild), Name, Art/Gruppe/Bedingung, Tasten.
  // waehlen = { gewaehlt } (24.10.2026): dieselbe Zeile in der Funktionswahl beim Belegen, antippen wählt die Funktion
  functionRowHtml(f, withGroup, waehlen = null) {
    const acts = f.actions || [];
    const type = acts.some(a => a.type === 'keyboard') ? 'kbd' : acts.some(a => a.type === 'gamepad' || a.type === 'axis') ? 'pad'
      : acts.some(a => a.type === 'macro-abort') ? 'macro' : acts.some(a => a.type === 'hub') ? 'hub' : 'none';
    const TYPE = { kbd: 'Tastatur', pad: 'Gamepad', macro: 'Makro-Aktion', hub: 'nur in ControlHub', none: 'keine Aktion' };
    const ICON = {
      kbd: '<rect x="3" y="6" width="18" height="12" rx="2"></rect><path d="M7 10h1M11 10h1M15 10h1M7 14h10"></path>',
      pad: '<path d="M6 8h12a4 4 0 0 1 4 4v1a3 3 0 0 1-5.2 2L15 13H9l-1.8 2A3 3 0 0 1 2 13v-1a4 4 0 0 1 4-4z"></path><path d="M7 10.5v3M5.5 12h3"></path>',
      macro: '<circle cx="12" cy="12" r="9"></circle><path d="M9 9h6v6H9z"></path>',
      hub: '<rect x="4" y="4" width="16" height="16" rx="3"></rect><path d="M9 12h6"></path>',
      none: '<circle cx="12" cy="12" r="9"></circle>'
    };
    const caps = acts.map(a => {
      if (a.type === 'keyboard') return keyLabel(a.key).replace(' (alt)', '');   // „(alt)“ = alte Belegung, im Editor erklärt
      if (a.type === 'gamepad') return `Pad ${(a.buttonId ?? 0) + 1}`;
      if (a.type === 'axis') return `Achse ${AXIS_SLOT_NAMES[a.axisId] || a.axisId + 1} ${(a.value ?? 65535) === 0 ? '−' : '+'}`;
      return null;
    }).filter(Boolean);
    const shown = caps.length > 4 ? [...caps.slice(0, 3), '…'] : caps;
    const groups = (f.categories || []).length ? f.categories.join(', ') : 'Ohne Gruppe';
    const sub = TYPE[type] + (withGroup ? ` · ${groups}` : '') + conditionText(f.condition);
    const ic = f.icon ? `<img src="/icons/${encodeURIComponent(f.icon)}" alt="">`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[type]}</svg>`;
    if (waehlen) {
      return `<div class="fn-row ap-fn-row${waehlen.gewaehlt ? ' gewaehlt' : ''}" data-fid="${escapeHtml(f.id)}">
      <button type="button" class="fn-open" onclick="window.actionPicker.selectFunction(this.parentElement.dataset.fid)"><span class="fn-ic">${ic}</span>
        <span class="fn-txt"><b>${escapeHtml(f.name)}</b><small>${escapeHtml(sub)}</small></span>
        <span class="fn-keys">${shown.map((c, i) => `${i ? '<i>+</i>' : ''}<span class="ov-kbd">${escapeHtml(c)}</span>`).join('')}</span></button>
    </div>`;
    }
    return `<div class="fn-row" data-fn="${escapeHtml(f.id)}">
      <button type="button" class="fn-open" data-act="edit"><span class="fn-ic">${ic}</span>
        <span class="fn-txt"><b>${escapeHtml(f.name)}</b><small>${escapeHtml(sub)}</small></span>
        <span class="fn-keys">${shown.map((c, i) => `${i ? '<i>+</i>' : ''}<span class="ov-kbd">${escapeHtml(c)}</span>`).join('')}</span></button>
      <button type="button" class="ov-icon-btn" data-act="more" aria-label="Weitere Aktionen für ${escapeHtml(f.name)}" aria-haspopup="menu"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><circle cx="19" cy="12" r="1.8"></circle></svg></button>
    </div>`;
  }

  // Zeile einer festen ControlHub-Aktion: ohne „⋯“, Antippen erklärt nur, wie man sie belegt
  hubRowHtml(f, withGroup) {
    return `<div class="fn-row fn-row--hub" data-fn="${escapeHtml(f.id)}">
      <button type="button" class="fn-open" data-act="hub-info"><span class="fn-ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"></rect><path d="M9 12h6"></path></svg></span>
        <span class="fn-txt"><b>${escapeHtml(f.name)}</b><small>nur in ControlHub${withGroup ? ` · ${escapeHtml(window.hubActions.GROUP)}` : ''}</small></span></button>
    </div>`;
  }

  showHubInfo(id) {
    const f = (this.hubFunctions || []).find(x => x.id === id);
    uiAlert(`„${f?.name || id}“ ist eine feste ControlHub-Aktion. Sie wirkt nur in ControlHub, nicht im Spiel.\n\nSo legst du sie auf eine Taste: unter Belegung das Modul öffnen, die Taste antippen und in der Gruppe „${window.hubActions.GROUP}“ auswählen – genau wie deine eigenen Funktionen.`, { title: window.hubActions.GROUP });
  }

  // „⋯“ einer Funktion: Bearbeiten, Duplizieren, Gruppen (Häkchen, sofort gespeichert), Löschen
  openFunctionMenu(id, anchor) {
    const f = (this.allFunctions || []).find(x => x.id === id);
    if (!f) return;
    uiMenu(anchor, [
      { label: 'Bearbeiten', run: () => window.functionEditor.openEdit(id) },
      { label: 'Duplizieren', run: () => this.duplicateFunction(id) },
      { label: 'Gruppen', hint: '›', keepOpen: true, run: () => this.openFunctionGroupsMenu(id, anchor) },
      null,
      { label: 'Löschen', danger: true, run: () => this.deleteFunction(id, f.name) }
    ], { key: 'fn:' + id });
  }

  openFunctionGroupsMenu(id, anchor) {
    const f = (this.allFunctions || []).find(x => x.id === id);
    if (!f) return;
    const cats = f.categories || [];
    uiMenu(anchor, [
      { label: '‹ Zurück', keepOpen: true, run: () => this.openFunctionMenu(id, anchor) },
      null,
      ...(this.allCategories || []).map(c => ({
        label: c, checked: cats.includes(c), keepOpen: true,
        run: async () => {
          const next = cats.includes(c) ? cats.filter(x => x !== c) : [...cats, c];
          if (await this.saveFunctionPatch(id, { categories: next })) this.openFunctionGroupsMenu(id, anchor.isConnected ? anchor : this.functionMenuAnchor(id) || anchor);
        }
      }))
    ], { key: 'fn-groups:' + id });
  }

  functionMenuAnchor(id) {
    return document.querySelector(`#functions-list .fn-row[data-fn="${CSS.escape(id)}"] [data-act="more"]`);
  }

  // Funktion mit geänderten Feldern speichern (Gruppen); lädt die Liste neu
  async saveFunctionPatch(id, patch) {
    const f = (this.allFunctions || []).find(x => x.id === id);
    if (!f) return false;
    try {
      const res = await fetch('/api/function/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, function: { ...f, ...patch } })
      });
      const result = await res.json();
      if (!result.success) { uiAlert('Speichern fehlgeschlagen: ' + result.error); return false; }
      await this.loadFunctions();
      return true;
    } catch (error) {
      uiAlert('Speichern fehlgeschlagen: ' + error.message);
      return false;
    }
  }

  async duplicateFunction(id) {
    const f = (this.allFunctions || []).find(x => x.id === id);
    if (!f) return;
    const copyId = `func-${Date.now()}`;
    try {
      const res = await fetch('/api/function/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: copyId, function: { ...structuredClone(f), id: copyId, name: `${f.name} (Kopie)` } })
      });
      const result = await res.json();
      if (!result.success) { uiAlert('Duplizieren fehlgeschlagen: ' + result.error); return; }
      await this.loadFunctions();
      window.showToast?.(`„${f.name} (Kopie)“ angelegt`);
    } catch (error) {
      uiAlert('Duplizieren fehlgeschlagen: ' + error.message);
    }
  }

  // „Mehr“ oben rechts: seltene Aktionen, die vorher als vier graue Knöpfe dastanden
  openFunctionsMoreMenu(anchor) {
    const features = new Set(window.gameSwitcher?.activeGame?.features || []);
    uiMenu(anchor, [
      { label: 'Gruppen verwalten', run: () => window.categoryManager.open() },
      { label: 'Exportieren', run: () => this.exportFunctions() },
      { label: 'Importieren', run: () => this.importFunctions() },
      ...(features.has('inputBindingImport') ? [
        { label: 'Aus dem Spiel neu einlesen', run: () => this.funktionenNeuEinlesen() },
        { label: 'inputBinding.xml aus Datei importieren', run: () => document.getElementById('input-binding-file').click() }
      ] : [])
    ]);
  }

  async deleteFunction(functionId, functionName) {
    try {
      const id = encodeURIComponent(functionId);
      const geloescht = await loeschenMitVerwendung({ art: 'Funktion', name: functionName,
        verwendungUrl: `/api/function/${id}/verwendung`, loeschUrl: `/api/function/${id}` });
      if (geloescht) {
        window.showToast?.(`„${functionName}“ gelöscht`);
        await this.loadFunctions();
      }
    } catch (error) {
      uiAlert('Löschen fehlgeschlagen: ' + error.message);
    }
  }

  async exportFunctions() {
    try {
      const response = await fetch('/api/functions/export');
      const data = await response.json();

      if (data.success) {
        downloadJson(data.data, `Funktionen ${new Date().toISOString().split('T')[0]}`);
        window.showToast?.('Funktionen exportiert (Ordner Downloads)');
      }
    } catch (error) {
      uiAlert('Export fehlgeschlagen: ' + error.message);
    }
  }

  async importFunctions() {
    try {
      const data = await pickJsonFile();   // js/basis.js
      if (!data) return;
      const mode = await uiChoice('Wie sollen die Funktionen übernommen werden?\n\nZusammenführen: neue kommen dazu, schon vorhandene mit gleicher Kennung werden durch den Import überschrieben, alle übrigen bleiben.\nErsetzen: die bisherige Funktionsliste wird komplett ersetzt.', [
        { label: 'Ersetzen', value: 'replace', danger: true }, { label: 'Zusammenführen', value: 'merge' }
      ], { title: 'Funktionen importieren' });
      if (!mode) return;
      const response = await fetch('/api/functions/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, mode })
      });
      const result = await response.json();
      if (result.success) {
        window.showToast?.('Funktionen importiert');
        await this.loadFunctions();
      } else {
        uiAlert('Fehler: ' + result.error);
      }
    } catch (error) {
      uiAlert('Import fehlgeschlagen: ' + error.message);
    }
  }

  // Entwickler-Werkzeug (Entwicklertools > Zurücksetzen): alle Funktionen (+ Kategorien) löschen,
  // um einen Import an einem sauberen Stand überprüfen zu können. Die Bestätigung passiert schon
  // über das Eingabefeld daneben, deshalb hier kein zusätzliches confirm().
  async deleteAllFunctions() {
    const status = document.getElementById('delete-all-functions-status');
    const confirmField = document.getElementById('delete-all-functions-confirm');
    const setStatus = (text) => { if (status) status.textContent = text; };
    try {
      const response = await fetch('/api/functions', { method: 'DELETE' });
      const result = await response.json();
      if (result.success) {
        await this.loadFunctions();
        setStatus('Alle Funktionen gelöscht, Gruppen auf die Startbelegung zurückgesetzt.');
      } else {
        setStatus('Fehler: ' + result.error);
      }
    } catch (error) {
      setStatus('Löschen fehlgeschlagen: ' + error.message);
    }
    // Feld leeren -> Knopf sperrt sich wieder von selbst, kein versehentlicher Doppelklick.
    if (confirmField) {
      confirmField.value = '';
      confirmField.dispatchEvent(new Event('input'));
    }
  }

  // Nach dem Einlesen der inputBinding.xml (24.10.2026): Gruppen, in denen keine Funktion mehr steht (z. B. die eigenen
  // Gruppen eines früheren Imports, jetzt nach Spiel und Mods sortiert), auf Wunsch entfernen. Nur wirklich leere,
  // nie die Systemgruppen; vor jedem Entfernen fragt der Server nach, ob die Gruppe noch leer ist.
  async leereGruppenAnbieten() {
    const FG = window.FunctionGroups;
    const fns = this.allFunctions || [];
    const fest = this.protectedCategories || [];
    const leer = (this.allCategories || []).filter(g => !fest.includes(g) && !fns.some(f => FG.functionInGroup(f, g)));
    if (!leer.length) return;
    const wahl = await uiChoice(`${leer.length === 1 ? 'Diese Gruppe ist' : `Diese ${leer.length} Gruppen sind`} jetzt leer:\n\n${leer.join(', ')}\n\nEntfernen? Funktionen sind davon nicht betroffen.`,
      [{ label: leer.length === 1 ? 'Leere Gruppe entfernen' : 'Leere Gruppen entfernen', value: 'ja' }], { title: 'Leere Gruppen', cancel: 'Behalten' });
    if (wahl !== 'ja') return;
    for (const g of leer) {
      const imp = await fetch(`/api/categories/${encodeURIComponent(g)}/deletion-impact`).then(r => r.json()).catch(() => null);
      if (!imp?.success || imp.toDelete.length || imp.toDetach.length) continue;   // inzwischen nicht mehr leer
      await fetch(`/api/categories/${encodeURIComponent(g)}`, { method: 'DELETE' }).catch(() => {});
    }
    await this.loadFunctions();
  }

  // Aus dem Spiel neu einlesen (24.10.2026): inputBinding.xml und Mods-Ordner liest der Server selbst vom PC; neue Funktionen
  // kommen dazu, Tasten wie im Spiel, eigene Namen und Gruppen bleiben (server/funktionenEinlesen.js)
  async funktionenNeuEinlesen() {
    try {
      const r = await (await fetch('/api/functions/neu-einlesen', { method: 'POST' })).json();
      if (!r.success) { uiAlert(r.error || 'Einlesen fehlgeschlagen'); return; }
      await this.loadFunctions();
      const zeilen = [];
      if (r.neu) zeilen.push(`${r.neu} neue ${r.neu === 1 ? 'Funktion' : 'Funktionen'}${r.neueMods.length ? ` (Mods: ${r.neueMods.join(', ')})` : ''}`);
      if (r.tasten) zeilen.push(`bei ${r.tasten} die Tasten wie im Spiel geändert`);
      if (r.namen || r.gruppen) zeilen.push(`${r.namen + r.gruppen}× Name oder Gruppe wie im Spiel nachgezogen`);
      let text = zeilen.length ? `Aus dem Spiel neu eingelesen: ${zeilen.join(', ')}.` : 'Aus dem Spiel neu eingelesen: alles ist schon auf dem Stand.';
      if (r.ausModStandard) text += `\n\n${r.ausModStandard} davon mit der Standardbelegung der Mod (das Spiel hat sie noch nicht in die inputBinding.xml geschrieben).`;
      if (r.weg) text += `\n\n${r.weg} ${r.weg === 1 ? 'Funktion gibt' : 'Funktionen gibt'} es im Spiel nicht mehr (z. B. Mod entfernt). Sie bleiben, bis du sie löschst.`;
      if (!r.spielListe) text += '\n\nFür Namen und Gruppen genau wie im Spiel: Spielstand mit der CraftConsole-HUD-Mod einmal laden, etwa 20 Sekunden warten und noch einmal neu einlesen.';
      uiAlert(text, { forceDialog: true });
    } catch (error) {
      uiAlert('Einlesen fehlgeschlagen: ' + error.message);
    }
  }

  async importInputBindingXml(event) {
    const file = event.target.files[0];
    event.target.value = ''; // gleiche Datei muss danach erneut wählbar sein
    if (!file) return;

    try {
      const text = await file.text();
      const mode = await uiChoice('Wie sollen die Funktionen übernommen werden?\n\nZusammenführen: neue kommen dazu, schon vorhandene mit gleicher Kennung werden durch den Import überschrieben, alle übrigen bleiben.\nErsetzen: die bisherige Funktionsliste wird komplett ersetzt.', [
          { label: 'Ersetzen', value: 'replace', danger: true }, { label: 'Zusammenführen', value: 'merge' }
        ], { title: 'inputBinding.xml importieren' });
      if (!mode) return;

      const response = await fetch(`/api/functions/import-xml?mode=${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml' },
        body: text
      });

      const result = await response.json();

      if (result.success) {
        // Woher die Gruppen kommen (24.10.2026): Steuerungsmenü des Spiels, Mods-Ordner, sonst eigene Zuordnung
        const herkunft = [];
        if (result.ausSpiel) herkunft.push(`${result.ausSpiel} nach den Gruppen im Spiel`);
        if (result.ausMods) herkunft.push(`${result.ausMods} nach Mod (${result.modsGelesen} ${result.modsGelesen === 1 ? 'Mod' : 'Mods'} gelesen)`);
        let hinweis = herkunft.length ? `\n\nSortiert: ${herkunft.join(', ')}, der Rest nach eigener Zuordnung.` : '';
        if (!result.spielListe) hinweis += '\n\nFür die Gruppen wie im Spiel: Spielstand mit der CraftConsole-HUD-Mod einmal laden und etwa 20 Sekunden warten, dann erneut importieren.';
        const meldung = uiAlert(`${result.count} Funktionen aus der inputBinding.xml importiert.${hinweis}`);
        await this.loadFunctions();
        await meldung;
        await this.leereGruppenAnbieten();
      } else {
        uiAlert('Fehler: ' + result.error);
      }
    } catch (error) {
      uiAlert('Import fehlgeschlagen: ' + error.message);
    }
  }
}

// App initialisieren
document.addEventListener('DOMContentLoaded', () => {
  window.app = new ControllerApp();
  window.mappingModal = new MappingModal();
  window.functionEditor = new FunctionEditor();
});
