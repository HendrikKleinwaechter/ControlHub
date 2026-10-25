/**
 * Parser für die FS25 inputBinding.xml -- portiert nach server/, damit der Import direkt in der
 * App läuft (kein externes Skript + manueller JSON-Zwischenschritt mehr nötig). Portiert die
 * reichhaltigere der beiden bisherigen Dev-Skript-Varianten (scripts/parseInputBindings.py, mit
 * Unterkategorien) -- nicht die abweichende .js-Variante, die andere Kategorienamen verwendet
 * und keine Unterkategorien kennt (technische Altlast, jetzt obsolet).
 *
 * XML-Parsing bewusst ohne neue Abhängigkeit (kein xmldom o.ae.): wir brauchen nur das
 * "action"-Attribut jedes <actionBinding>-Tags, die <binding>-Kindelemente (Geraete/Tasten) sind
 * fuer die Funktionsbibliothek irrelevant -- ein einfacher Regex reicht.
 *
 * Kategorisierung/Benennung wurde von Hand anhand von Hendriks realer inputBinding.xml
 * nachgebessert (562 Actions durchgesehen) -- die rein mechanische Schlüsselwort-Heuristik allein
 * war zu ungenau (u.a. warf sie ~276 von 450 Funktionen unsortiert in einen "Mods"-Sammeltopf).
 * Jeder erkannte Mod bekommt jetzt eine eigene Kategorie (Hendriks Wunsch), auch wenn der genaue
 * Mod-Name bei einigen nur eine begründete Vermutung ist (die XML selbst nennt keine Mod-Quelle,
 * s. Kommentar bei resolveAction()).
 */

// Kategorie-Mapping: Action-Keywords -> Kategorie. Einstufig (keine Ober-/Unterkategorie mehr) --
// die früheren Unterkategorien SIND jetzt die Kategorien, auf Hendriks Wunsch ("die brauche ich
// nicht [die 6 Oberkategorien], die Unterkategorien könnten dann ja die Hauptkategorien sein").
// Reihenfolge ist relevant (erster Treffer gewinnt) -- die Spieler-Einträge stehen bewusst VOR den
// Fahrzeug-Einträgen, da z.B. "AXIS_MOVE_SIDE_PLAYER" sonst am kürzeren Fahrzeug-Keyword
// "AXIS_MOVE_SIDE" hängen bleiben würde (reiner Teilstring-Vergleich, kein Wortgrenzen-Check).
const CATEGORY_MAP = [
  { keywords: ['JUMP', 'CROUCH', 'RUN', 'AXIS_MOVE_FORWARD_PLAYER', 'AXIS_MOVE_SIDE_PLAYER', 'HANDS_LEVEL',
      'AXIS_RUN', 'AXIS_LADDER'],
    category: 'Bewegung' },
  { keywords: ['ENTER', 'INTERACT', 'ACTIVATE_OBJECT', 'ANIMAL_PET', 'SWITCH_SEAT',
      'ACTIVATE_HANDTOOL', 'THROW_OBJECT', 'ROTATE_OBJECT', 'IC_CLICK', 'IC_TOGGLE_STATE'],
    category: 'Interaktion' },
  { keywords: ['MOTOR_STATE', 'SHIFT_GEAR', 'SHIFT_GROUP', 'DIRECTION_CHANGE', 'TOGGLE_CRUISE_CONTROL',
      'CHANGE_DRIVING_DIRECTION', 'AXIS_ACCELERATE', 'AXIS_BRAKE', 'AXIS_CLUTCH', 'AXIS_MOVE_SIDE',
      'TOGGLE_FUELING'],
    category: 'Motor & Antrieb' },
  { keywords: ['TOGGLE_LIGHT', 'TOGGLE_BEACON_LIGHTS', 'TOGGLE_TURNLIGHT', 'TOGGLE_HIGH_BEAM',
      'SIGNAL_HOLD_BEAM', 'SWITCH_INDICATOR_MODE'],
    category: 'Beleuchtung' },
  { keywords: ['SWITCH_VEHICLE', 'ATTACH', 'DETACH', 'SWITCH_IMPLEMENT', 'HONK', 'TOGGLE_AI',
      'CRABSTEERING', 'WORKMODE', 'LIFTABLE_AXLE', 'RADIO', 'MODULE_ATTACH_ASSIST'],
    category: 'Kupplung & Geräte' },
  { keywords: ['LOWER_IMPLEMENT', 'ALL_IMPLEMENTS', 'IMPLEMENT_EXTRA', 'FOLDABLESTEPS', 'TOGGLE_TENSION_BELTS',
      'TOGGLE_TIPSIDE', 'TOGGLE_TIPSTATE', 'VEHICLE_ACTION_CONTROL', 'TOGGLE_BALE_TYPES', 'BALE',
      'PALLET_FILLER', 'CYCLE_LENGTH_INDICATOR', 'CYCLE_WEIGHT_INDICATOR', 'SET_ALLOW_ROLLER_BUTTON'],
    category: 'Gerätesteuerung' },
  { keywords: ['FRONTLOADER', 'CRANE', 'AXIS_HYDRAULIC'],
    category: 'Frontlader & Kran' },
  { keywords: ['HYDRAULIC', 'DRAWBAR', 'WHEEL_BASE'],
    category: 'Hydraulik' },
  { keywords: ['TOGGLE_PIPE', 'TOGGLE_CHOPPER', 'TOGGLE_COVER', 'CUTTER', 'CUT_LENGTH', 'UNLOAD'],
    category: 'Ernte' },
  // Teilbreiten eigene Gruppe (Hendrik 23.10.2026, für das spätere automatische Schalten im Feldkeil)
  { keywords: ['VARIABLE_WORK_WIDTH'],
    category: 'Teilbreiten' },
  { keywords: ['TOGGLE_SEEDS'],
    category: 'Säen & Pflanzen' },
  { keywords: ['SPRAYER', 'DOUBLED_SPRAY_AMOUNT'],
    category: 'Spritzen & Düngen' },
  { keywords: ['WOOD_HARVESTER', 'TREE_AUTOMATIC_ALIGN'],
    category: 'Holzernte' },
  { keywords: ['YARDER', 'WINCH'],
    category: 'Holztransport' },
  { keywords: ['PRECISIONFARMING'],
    category: 'Precision Farming' },
  { keywords: ['CAMERA', 'AXIS_LOOK', 'RESET_HEAD_TRACKING', 'INDOOR_CAM'],
    category: 'Kamera' },
  { keywords: ['MENU', 'PAUSE', 'TOGGLE_STORE', 'TOGGLE_CONSTRUCTION', 'TOGGLE_CHARACTER_CREATION',
      'SKIP_MESSAGE', 'TOGGLE_MAP', 'SEARCH_SHOP', 'ACTIVATE_WORKSHOP', 'INPUT_HELP_PAGE'],
    category: 'Menü & UI' },
  { keywords: ['TOGGLE_HELP', 'INCREASE_TIMESCALE', 'DECREASE_TIMESCALE', 'TAKE_SCREENSHOT', 'SCREENSHOT_MODE',
      'CHAT', 'PUSH_TO_TALK'],
    category: 'Spieleinstellungen' }
];

const TRANSLATIONS = {
  // Spieler
  JUMP: 'Springen', CROUCH: 'Ducken', ACTIVATE_HANDTOOL: 'Werkzeug aktivieren',
  ACTIVATE_HANDTOOL_SECONDARY: 'Werkzeug aktivieren (sekundär)',
  THROW_OBJECT: 'Objekt werfen', ENTER: 'Einsteigen', INTERACT: 'Interagieren',
  SWITCH_SEAT: 'Sitzplatz wechseln', HANDS_LEVEL: 'Hände ausrichten',
  ACTIVATE_OBJECT: 'Objekt aktivieren', ANIMAL_PET: 'Tier streicheln',
  TOGGLE_LIGHTS_FPS: 'Taschenlampe ein/aus', AXIS_RUN: 'Rennen (Achse)', AXIS_LADDER: 'Leiter (Achse)',
  ROTATE_OBJECT_LEFT_RIGHT: 'Objekt drehen links/rechts', ROTATE_OBJECT_UP_DOWN: 'Objekt drehen auf/ab',
  IC_CLICK: 'Interaktives Bedienelement klicken', IC_TOGGLE_STATE: 'Interaktives Bedienelement umschalten',
  // Fahrzeug
  SWITCH_VEHICLE: 'Fahrzeug wechseln', SWITCH_VEHICLE_BACK: 'Vorheriges Fahrzeug',
  ATTACH: 'Anhängen', DETACH: 'Abhängen', SWITCH_IMPLEMENT: 'Gerät wechseln',
  SWITCH_IMPLEMENT_BACK: 'Vorheriges Gerät', TOGGLE_AI: 'Helfer ein/aus',
  TOGGLE_AI_STEERING: 'Lenkhilfe ein/aus', TOGGLE_AI_STEERING_LINES: 'Lenklinien ein/aus',
  HONK: 'Hupen', TOGGLE_MOTOR_STATE: 'Motor an/aus', SHIFT_GEAR_UP: 'Gang hoch',
  // Ab Werk ohne Taste; für das Zündschloss am CraftDeck (Hendrik 25.10.2026)
  MOTOR_STATE_ON: 'Motor an', MOTOR_STATE_OFF: 'Motor aus', MOTOR_STATE_IGNITION: 'Zündung',
  SHIFT_GEAR_DOWN: 'Gang runter', SHIFT_GROUP_UP: 'Gruppe hoch', SHIFT_GROUP_DOWN: 'Gruppe runter',
  DIRECTION_CHANGE: 'Fahrtrichtung wechseln', TOGGLE_TIPSTATE: 'Kippen',
  TOGGLE_LIGHTS: 'Beleuchtung', TOGGLE_LIGHTS_BACK: 'Rückbeleuchtung', TOGGLE_LIGHT_FRONT: 'Frontlicht ein/aus',
  TOGGLE_LIGHTS_EXTERNAL: 'Zusatzbeleuchtung', TOGGLE_BEACON_LIGHTS: 'Rundumleuchte',
  TOGGLE_TIPSIDE: 'Kippseite wechseln', TOGGLE_TURNLIGHT_LEFT: 'Blinker links',
  TOGGLE_TURNLIGHT_RIGHT: 'Blinker rechts', TOGGLE_TURNLIGHT_HAZARD: 'Warnblinker',
  TOGGLE_WORK_LIGHT_BACK: 'Arbeitsscheinwerfer hinten', TOGGLE_WORK_LIGHT_FRONT: 'Arbeitsscheinwerfer vorne',
  TOGGLE_HIGH_BEAM_LIGHT: 'Fernlicht', SIGNAL_HOLD_BEAM: 'Lichthupe', SWITCH_INDICATOR_MODE: 'Blinker-Modus wechseln',
  TOGGLE_CRABSTEERING: 'Hundegang ein/aus',
  TOGGLE_CRABSTEERING_BACK: 'Hundegang zurück', TOGGLE_WORKMODE: 'Arbeitsmodus wechseln',
  TOGGLE_TENSION_BELTS: 'Spanngurte', TOGGLE_BALE_TYPES: 'Ballenart wechseln',
  BALE_COUNTER_RESET: 'Ballenzähler zurücksetzen', BALE_WRAPPER_DROP_CUSTOM: 'Ballen abwerfen',
  VEHICLE_ACTION_CONTROL: 'Fahrzeugaktion', LOWER_IMPLEMENT: 'Anbaugerät senken/heben',
  LOWER_ALL_IMPLEMENTS: 'Alle Geräte senken', TURN_ON_ALL_IMPLEMENTS: 'Alle Geräte einschalten',
  FOLD_ALL_IMPLEMENTS: 'Alle Geräte einklappen', IMPLEMENT_EXTRA: 'Zusatzfunktion',
  IMPLEMENT_EXTRA2: 'Zusatzfunktion 2', IMPLEMENT_EXTRA3: 'Zusatzfunktion 3',
  IMPLEMENT_EXTRA4: 'Zusatzfunktion 4', FOLDABLESTEPS_NEXT_POS: 'Stufe vor',
  FOLDABLESTEPS_NEXT_NEG: 'Stufe zurück', TOGGLE_CRUISE_CONTROL: 'Tempomat',
  CHANGE_DRIVING_DIRECTION: 'Fahrrichtung ändern', TOGGLE_TIPSTATE_GROUND: 'Auf Boden kippen',
  LIFTABLE_AXLE: 'Hubachse', TOGGLE_FUELING: 'Betanken ein/aus',
  CYCLE_LENGTH_INDICATOR: 'Längenanzeige umschalten', CYCLE_WEIGHT_INDICATOR: 'Gewichtsanzeige umschalten',
  SET_ALLOW_ROLLER_BUTTON: 'Walze zulassen', MODULE_ATTACH_ASSIST: 'Anhänge-Assistent',
  // Ernte
  TOGGLE_PIPE: 'Entladerohr ein/aus', TOGGLE_COVER: 'Abdeckung', TOGGLE_CHOPPER: 'Häcksler ein/aus',
  DOUBLED_SPRAY_AMOUNT: 'Spritzmenge verdoppeln', TOGGLE_SEEDS: 'Saatgut wechseln',
  TOGGLE_SEEDS_BACK: 'Vorheriges Saatgut', VARIABLE_WORK_WIDTH_TOGGLE: 'Teilbreiten umschalten',
  // „+“ nimmt außen eine Teilbreite weg, „−“ schaltet eine dazu (GDN VariableWorkWidth: leftSide − inputValue)
  VARIABLE_WORK_WIDTH_LEFT: 'Teilbreite links aus', VARIABLE_WORK_WIDTH_RIGHT: 'Teilbreite rechts aus',
  TOGGLE_CUT_LENGTH_BACK: 'Schnittlänge zurück', UNLOAD: 'Entladen',
  UNLOAD_BALE_EARLY: 'Ballen vorzeitig abladen',
  // Precision Farming (offizielles DLC)
  PRECISIONFARMING_SEED_RATE: 'Saatmenge', PRECISIONFARMING_SEED_RATE_MODE: 'Saatmenge-Modus',
  PRECISIONFARMING_SPRAY_AMOUNT: 'Spritzmenge', PRECISIONFARMING_SPRAY_AMOUNT_MODE: 'Spritzmenge-Modus',
  PRECISIONFARMING_TOGGLE_CROP_SENSOR: 'Feldsensor umschalten',
  // Holz
  WOOD_HARVESTER_DROP: 'Holz ablegen', TREE_AUTOMATIC_ALIGN: 'Baum automatisch ausrichten',
  TOGGLE_WOOD_HARVESTER_TILT: 'Harvester neigen', YARDER_CONTROL_LEFTRIGHT: 'Seilkran links/rechts',
  YARDER_CONTROL_UPDOWN: 'Seilkran auf/ab', YARDER_FOLLOW_ME: 'Folge mir',
  YARDER_FOLLOW_HOME: 'Zurück zur Basis', YARDER_FOLLOW_PICKUP: 'Holz aufnehmen',
  YARDER_ATTACH: 'Seilkran anhängen', YARDER_DETACH: 'Seilkran lösen',
  YARDER_SETUP_ROPE: 'Seil einrichten', WINCH_CONTROL: 'Seilwinde',
  WINCH_CONTROL_VEHICLE: 'Seilwinde Fahrzeug', WINCH_ATTACH_MODE: 'Seilwinde Anhängemodus',
  WINCH_ATTACH: 'Seilwinde anhängen', WINCH_DETACH: 'Seilwinde lösen',
  // UI/Spiel
  PAUSE: 'Pause', MENU: 'Menü', SKIP_MESSAGE_BOX: 'Nachricht überspringen',
  CAMERA_SWITCH: 'Kamera wechseln', CAMERA_ZOOM_IN_OUT: 'Kamera Zoom', TOGGLE_STORE: 'Shop öffnen',
  SEARCH_SHOP: 'Shop durchsuchen', ACTIVATE_WORKSHOP: 'Werkstatt öffnen',
  TOGGLE_CHARACTER_CREATION: 'Charaktererstellung', TOGGLE_CONSTRUCTION: 'Baumodus',
  TOGGLE_MAP_SIZE: 'Kartengröße', TOGGLE_HELP_TEXT: 'Hilfe ein/aus',
  INPUT_HELP_PAGE_UP: 'Hilfeseite vor', INPUT_HELP_PAGE_DOWN: 'Hilfeseite zurück',
  ZOOM_INDOOR_CAM_BUTTON: 'Innenraumkamera zoomen', RESET_INDOOR_CAM_BUTTON: 'Innenraumkamera zurücksetzen',
  INCREASE_TIMESCALE: 'Zeit beschleunigen', DECREASE_TIMESCALE: 'Zeit verlangsamen',
  SCREENSHOT_MODE: 'Foto-Modus', RADIO_TOGGLE: 'Radio ein/aus', RADIO_NEXT_CHANNEL: 'Nächster Sender',
  RADIO_PREVIOUS_CHANNEL: 'Vorheriger Sender', TAKE_SCREENSHOT: 'Screenshot', CHAT: 'Chat',
  PUSH_TO_TALK: 'Push-to-Talk', INTRODUCTION_HELP_SKIP: 'Tutorial überspringen',
  CONVERSATION_SKIP: 'Dialog überspringen',
  // Frontlader/Kran
  AXIS_HYDRAULICATTACHER1: 'Hydraulik 1', AXIS_HYDRAULICATTACHER2: 'Hydraulik 2',
  AXIS_FRONTLOADER_ARM: 'Frontlader Arm', AXIS_FRONTLOADER_ARM2: 'Frontlader Arm 2',
  AXIS_FRONTLOADER_TOOL: 'Frontlader Werkzeug', AXIS_FRONTLOADER_TOOL2: 'Frontlader Werkzeug 2',
  AXIS_FRONTLOADER_TOOL3: 'Frontlader Werkzeug 3', AXIS_FRONTLOADER_TOOL4: 'Frontlader Werkzeug 4',
  AXIS_FRONTLOADER_TOOL5: 'Frontlader Werkzeug 5', AXIS_CRANE_ARM: 'Kran Arm',
  AXIS_CRANE_ARM2: 'Kran Arm 2', AXIS_CRANE_ARM3: 'Kran Arm 3', AXIS_CRANE_ARM4: 'Kran Arm 4',
  AXIS_CRANE_TOOL: 'Kran Werkzeug', AXIS_CRANE_TOOL2: 'Kran Werkzeug 2',
  AXIS_CRANE_TOOL3: 'Kran Werkzeug 3', AXIS_CRANE_SUPPORT: 'Kran Abstützung',
  // Weitere
  AXIS_CUTTER_REEL: 'Mähhaspel', AXIS_CUTTER_REEL2: 'Mähhaspel 2', AXIS_PIPE: 'Entladerohr',
  AXIS_PIPE2: 'Entladerohr 2', AXIS_DOOR: 'Tür', AXIS_DOOR_2: 'Tür 2', AXIS_DOOR_3: 'Tür 3',
  AXIS_DRAWBAR: 'Deichsel', AXIS_DRAWBAR2: 'Deichsel 2', AXIS_SPRAYER_ARM: 'Spritze Arm',
  AXIS_WHEEL_BASE: 'Radstand', PALLET_FILLER_BUY_PALLETS: 'Paletten kaufen',
  CRABSTEERING_ALLWHEEL: 'Hundegang alle Räder', CRABSTEERING_CRABLEFT: 'Hundegang links',
  CRABSTEERING_CRABRIGHT: 'Hundegang rechts', WORKMODE_MIDDLE: 'Arbeitsmodus Mitte',
  WORKMODE_LEFT: 'Arbeitsmodus Links', WORKMODE_RIGHT: 'Arbeitsmodus Rechts',
  RESET_HEAD_TRACKING: 'Kopf-Tracking zurücksetzen'
};

// Mod-Erkennung: die inputBinding.xml selbst enthält keinerlei Kennzeichnung, ob eine Action aus
// dem Basisspiel oder einem Mod stammt (jedes <actionBinding> hat nur das "action"-Attribut, sonst
// nichts) -- es gibt also keine echte Quelle dafür. MOD_ACTIONS ist eine von Hand erstellte Liste,
// basierend auf Hendriks realer Datei (die zusätzlichen ~95 Actions ggü. einer älteren
// Vergleichsdatei tragen fast alle einen kurzen Namens-Präfix, der sich einem bekannten Mod
// zuordnen lässt -- z.B. AD.../AD_... = AutoDrive, CP_... = Courseplay). Jeder erkannte Mod bekommt
// eine eigene Kategorie (auf Hendriks Wunsch), auch wenn der genaue Mod-Titel bei einigen nur eine
// begründete Vermutung anhand des Namensmusters ist, keine verifizierte Tatsache.
const MOD_ACTIONS = {
  // AutoDrive (sehr verbreiteter Wegpunkt-/Helfer-Mod) -- zwei Namenskonventionen im selben Mod
  // (älteres glued-CamelCase "ADRecord" und neueres "AD_FieldSpeed_down" mit Unterstrich).
  ADActivateDebug: { name: 'AutoDrive: Debug aktivieren', category: 'AutoDrive' },
  ADCallDriver: { name: 'AutoDrive: Fahrer rufen', category: 'AutoDrive' },
  ADDebugChangeNeighbor: { name: 'AutoDrive: Debug Nachbar wechseln', category: 'AutoDrive' },
  ADDebugCreateConnection: { name: 'AutoDrive: Debug Verbindung erstellen', category: 'AutoDrive' },
  ADDebugCreateMapMarker: { name: 'AutoDrive: Debug Kartenmarkierung erstellen', category: 'AutoDrive' },
  ADDebugDeleteDestination: { name: 'AutoDrive: Debug Ziel löschen', category: 'AutoDrive' },
  ADDebugDeleteWayPoint: { name: 'AutoDrive: Debug Wegpunkt löschen', category: 'AutoDrive' },
  ADDebugPreviousNeighbor: { name: 'AutoDrive: Debug vorheriger Nachbar', category: 'AutoDrive' },
  ADDebugSelectNeighbor: { name: 'AutoDrive: Debug Nachbar wählen', category: 'AutoDrive' },
  ADDebugToggleConnectionInverted: { name: 'AutoDrive: Debug Verbindung umkehren', category: 'AutoDrive' },
  ADDecLoopCounter: { name: 'AutoDrive: Rundenzähler runter', category: 'AutoDrive' },
  ADDisplayMapPoints: { name: 'AutoDrive: Kartenpunkte anzeigen', category: 'AutoDrive' },
  ADEnDisable: { name: 'AutoDrive: Ein/Aus', category: 'AutoDrive' },
  ADGoToVehicle: { name: 'AutoDrive: Zum Fahrzeug', category: 'AutoDrive' },
  ADIncLoopCounter: { name: 'AutoDrive: Rundenzähler hoch', category: 'AutoDrive' },
  ADNameDriver: { name: 'AutoDrive: Fahrer benennen', category: 'AutoDrive' },
  ADOpenGUI: { name: 'AutoDrive: Menü öffnen', category: 'AutoDrive' },
  ADParkVehicle: { name: 'AutoDrive: Fahrzeug parken', category: 'AutoDrive' },
  ADPreviousMode: { name: 'AutoDrive: Vorheriger Modus', category: 'AutoDrive' },
  ADRecord: { name: 'AutoDrive: Route aufzeichnen', category: 'AutoDrive' },
  ADRecord_Dual: { name: 'AutoDrive: Route aufzeichnen (doppelspurig)', category: 'AutoDrive' },
  ADRecord_Dual_TwoWay: { name: 'AutoDrive: Route aufzeichnen (doppelspurig, beidseitig)', category: 'AutoDrive' },
  ADRecord_SubPrio: { name: 'AutoDrive: Route aufzeichnen (Nebenpriorität)', category: 'AutoDrive' },
  ADRecord_SubPrioDual: { name: 'AutoDrive: Route aufzeichnen (Nebenpriorität, doppelspurig)', category: 'AutoDrive' },
  ADRecord_SubPrioDual_TwoWay: { name: 'AutoDrive: Route aufzeichnen (Nebenpriorität, doppelspurig, beidseitig)', category: 'AutoDrive' },
  ADRecord_SubPrio_TwoWay: { name: 'AutoDrive: Route aufzeichnen (Nebenpriorität, beidseitig)', category: 'AutoDrive' },
  ADRecord_TwoWay: { name: 'AutoDrive: Route aufzeichnen (beidseitig)', category: 'AutoDrive' },
  ADRefuelVehicle: { name: 'AutoDrive: Fahrzeug betanken', category: 'AutoDrive' },
  ADRenameMapMarker: { name: 'AutoDrive: Kartenmarkierung umbenennen', category: 'AutoDrive' },
  ADRepairVehicle: { name: 'AutoDrive: Fahrzeug reparieren', category: 'AutoDrive' },
  ADSelectNextFillType: { name: 'AutoDrive: Nächste Füllart', category: 'AutoDrive' },
  ADSelectPreviousFillType: { name: 'AutoDrive: Vorherige Füllart', category: 'AutoDrive' },
  ADSelectPreviousTarget: { name: 'AutoDrive: Vorheriges Ziel', category: 'AutoDrive' },
  ADSelectPreviousTargetUnload: { name: 'AutoDrive: Vorheriges Abladeziel', category: 'AutoDrive' },
  ADSelectTarget: { name: 'AutoDrive: Ziel wählen', category: 'AutoDrive' },
  ADSelectTargetUnload: { name: 'AutoDrive: Abladeziel wählen', category: 'AutoDrive' },
  ADSetDestinationFilter: { name: 'AutoDrive: Zielfilter setzen', category: 'AutoDrive' },
  ADSetParkDestination: { name: 'AutoDrive: Parkziel setzen', category: 'AutoDrive' },
  ADSilomode: { name: 'AutoDrive: Silo-Modus', category: 'AutoDrive' },
  ADStartHelper: { name: 'AutoDrive: Helfer starten', category: 'AutoDrive' },
  ADSwapTargets: { name: 'AutoDrive: Ziele tauschen', category: 'AutoDrive' },
  ADToggleAutomaticPickupTarget: { name: 'AutoDrive: Automatisches Abholziel', category: 'AutoDrive' },
  ADToggleAutomaticUnloadTarget: { name: 'AutoDrive: Automatisches Abladeziel', category: 'AutoDrive' },
  ADToggleHud: { name: 'AutoDrive: HUD ein/aus', category: 'AutoDrive' },
  ADToggleHudExtension: { name: 'AutoDrive: HUD-Erweiterung ein/aus', category: 'AutoDrive' },
  ADToggleLoadByFillLevel: { name: 'AutoDrive: Laden nach Füllstand', category: 'AutoDrive' },
  ADToggleMouse: { name: 'AutoDrive: Maussteuerung ein/aus', category: 'AutoDrive' },
  ADToggleUsedHelper: { name: 'AutoDrive: Verwendeten Helfer wechseln', category: 'AutoDrive' },
  AD_FieldSpeed_down: { name: 'AutoDrive: Feldgeschwindigkeit runter', category: 'AutoDrive' },
  AD_FieldSpeed_up: { name: 'AutoDrive: Feldgeschwindigkeit hoch', category: 'AutoDrive' },
  AD_Speed_down: { name: 'AutoDrive: Geschwindigkeit runter', category: 'AutoDrive' },
  AD_Speed_up: { name: 'AutoDrive: Geschwindigkeit hoch', category: 'AutoDrive' },
  AD_continue: { name: 'AutoDrive: Fortsetzen', category: 'AutoDrive' },
  AD_devAction: { name: 'AutoDrive: Entwickler-Aktion', category: 'AutoDrive' },
  AD_open_notification_history: { name: 'AutoDrive: Benachrichtigungsverlauf öffnen', category: 'AutoDrive' },
  AD_routes_manager: { name: 'AutoDrive: Routenverwaltung', category: 'AutoDrive' },

  // Courseplay (Wegpunkt-/Feldarbeits-Automatisierungs-Mod)
  CP_CHANGE_COURSE_VISIBILITY: { name: 'Courseplay: Kurs-Sichtbarkeit', category: 'Courseplay' },
  CP_CHANGE_SELECTED_JOB: { name: 'Courseplay: Auftrag wechseln', category: 'Courseplay' },
  CP_CHANGE_STARTING_POINT: { name: 'Courseplay: Startpunkt wechseln', category: 'Courseplay' },
  CP_CLEAR_COURSE: { name: 'Courseplay: Kurs löschen', category: 'Courseplay' },
  CP_DBG_CHANNEL_MENU_VISIBILITY: { name: 'Courseplay: Debug-Menü', category: 'Courseplay' },
  CP_DBG_CHANNEL_SELECT_NEXT: { name: 'Courseplay: Debug-Kanal weiter', category: 'Courseplay' },
  CP_DBG_CHANNEL_SELECT_PREVIOUS: { name: 'Courseplay: Debug-Kanal zurück', category: 'Courseplay' },
  CP_DBG_CHANNEL_TOGGLE_CURRENT: { name: 'Courseplay: Debug-Kanal umschalten', category: 'Courseplay' },
  CP_GENERATE_COURSE: { name: 'Courseplay: Kurs generieren', category: 'Courseplay' },
  CP_OPEN_CLOSE_VEHICLE_SETTING_DISPLAY: { name: 'Courseplay: Fahrzeug-Anzeige öffnen/schließen', category: 'Courseplay' },
  CP_OPEN_COURSEGENERATOR_SETTINGS: { name: 'Courseplay: Kursgenerator-Einstellungen', category: 'Courseplay' },
  CP_OPEN_COURSEMANAGER: { name: 'Courseplay: Kursverwaltung öffnen', category: 'Courseplay' },
  CP_OPEN_GLOBAL_SETTINGS: { name: 'Courseplay: Globale Einstellungen', category: 'Courseplay' },
  CP_OPEN_INGAME_MENU: { name: 'Courseplay: Menü öffnen', category: 'Courseplay' },
  CP_OPEN_VEHICLE_SETTINGS: { name: 'Courseplay: Fahrzeug-Einstellungen', category: 'Courseplay' },
  CP_START_STOP: { name: 'Courseplay: Start/Stopp', category: 'Courseplay' },
  CP_START_STOP_AT_FIRST_WAYPOINT: { name: 'Courseplay: Start/Stopp am ersten Wegpunkt', category: 'Courseplay' },
  CP_START_STOP_AT_LAST_WAYPOINT: { name: 'Courseplay: Start/Stopp am letzten Wegpunkt', category: 'Courseplay' },
  CP_START_STOP_AT_NEAREST_WAYPOINT: { name: 'Courseplay: Start/Stopp am nächsten Wegpunkt', category: 'Courseplay' },
  CP_TOGGLE_MOUSE: { name: 'Courseplay: Maussteuerung ein/aus', category: 'Courseplay' },

  // Manual Attach (realistisches An-/Abkuppeln inkl. Zapfwelle/Hydraulikschläuchen)
  MA_ATTACH_PTO_HOSE: { name: 'Manual Attach: Zapfwelle/Schlauch anschließen', category: 'Manual Attach' },
  MA_ATTACH_VEHICLE: { name: 'Manual Attach: Fahrzeug ankuppeln', category: 'Manual Attach' },

  // Vermutlich "RealPolice" o.ä. -- Sondersignale/Blaulicht für Einsatzfahrzeuge
  RP_EMERGENCY_SOUNDS_SWITCH_SIGNAL01: { name: 'Sondersignal wechseln', category: 'Blaulicht & Sondersignale' },
  RP_EMERGENCY_SOUNDS_TOGGLE_SIGNAL01: { name: 'Signalton 1 ein/aus', category: 'Blaulicht & Sondersignale' },
  RP_EMERGENCY_SOUNDS_TOGGLE_SIGNAL02: { name: 'Signalton 2 ein/aus', category: 'Blaulicht & Sondersignale' },
  RP_TOGGLE: { name: 'Blaulicht ein/aus', category: 'Blaulicht & Sondersignale' },
  RP_WARNING_LIGHTS_TOGGLE: { name: 'Warnleuchten ein/aus', category: 'Blaulicht & Sondersignale' },

  // Einstellbare Spiegel (Adjust Mirrors)
  AM_AdjustMirrors: { name: 'Spiegel einstellen', category: 'Einstellbare Spiegel' },
  AM_SwitchMirror: { name: 'Spiegel wechseln', category: 'Einstellbare Spiegel' },
  AM_TiltDown: { name: 'Spiegel neigen: runter', category: 'Einstellbare Spiegel' },
  AM_TiltLeft: { name: 'Spiegel neigen: links', category: 'Einstellbare Spiegel' },
  AM_TiltRight: { name: 'Spiegel neigen: rechts', category: 'Einstellbare Spiegel' },
  AM_TiltUp: { name: 'Spiegel neigen: hoch', category: 'Einstellbare Spiegel' },

  // Vermutlich ein GPS-Lenk-/Spurführungs-Mod ("RGPS")
  RGPS_AXIS_ZOOM: { name: 'RGPS: Zoom (Achse)', category: 'RGPS-Lenkhilfe' },
  RGPS_SETUP_MODE: { name: 'RGPS: Einrichtungsmodus', category: 'RGPS-Lenkhilfe' },
  RGPS_TOGGLE_ROTATE_MODE: { name: 'RGPS: Drehmodus umschalten', category: 'RGPS-Lenkhilfe' },
  RGPS_TOGGLE_SELECTED_MAP: { name: 'RGPS: Ausgewählte Karte umschalten', category: 'RGPS-Lenkhilfe' },

  // "Bordcomputer"/HUD-Mod (Dashboard-artige Zusatzanzeige) -- DBL-Präfix
  DBL_DARKMODE: { name: 'Bordcomputer: Dunkelmodus', category: 'Bordcomputer' },
  DBL_HUDVISIBILITY_FULL: { name: 'Bordcomputer: Anzeige voll', category: 'Bordcomputer' },
  DBL_HUDVISIBILITY_PART: { name: 'Bordcomputer: Anzeige reduziert', category: 'Bordcomputer' },
  DBL_MAPORIENTATION: { name: 'Bordcomputer: Kartenausrichtung', category: 'Bordcomputer' },
  DBL_PAGEDN: { name: 'Bordcomputer: Seite zurück', category: 'Bordcomputer' },
  DBL_PAGEGRPDN: { name: 'Bordcomputer: Seitengruppe zurück', category: 'Bordcomputer' },
  DBL_PAGEGRPUP: { name: 'Bordcomputer: Seitengruppe vor', category: 'Bordcomputer' },
  DBL_PAGEUP: { name: 'Bordcomputer: Seite vor', category: 'Bordcomputer' },
  DBL_RADIO_VOL_DOWN: { name: 'Bordcomputer: Radio leiser', category: 'Bordcomputer' },
  DBL_RADIO_VOL_UP: { name: 'Bordcomputer: Radio lauter', category: 'Bordcomputer' },
  DBL_ZOOM: { name: 'Bordcomputer: Zoom', category: 'Bordcomputer' },
  DBL_ZOOM_PERM: { name: 'Bordcomputer: Zoom dauerhaft', category: 'Bordcomputer' },
  ADBLUE_HUD_TOGGLE_POSITIONING: { name: 'Bordcomputer: AdBlue-Anzeigeposition', category: 'Bordcomputer' },

  // VCA -- Vehicle Control Addon (Getriebe-/Differenzialsperren-Zusatzsteuerung, LKW-artig)
  vcaActivateB: { name: 'VCA: Hinten aktivieren', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaActivateF: { name: 'VCA: Vorne aktivieren', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaAutoShift: { name: 'VCA: Automatikschaltung', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaCamera: { name: 'VCA: Kamera', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaClutchMod: { name: 'VCA: Kupplungs-Modifikator', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaDOWN: { name: 'VCA: Runter', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaDiffLockB: { name: 'VCA: Differenzialsperre hinten', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaDiffLockF: { name: 'VCA: Differenzialsperre vorne', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaDiffLockM: { name: 'VCA: Differenzialsperre Mitte', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaDiffManual: { name: 'VCA: Differenzialsperre manuell', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaFoldB: { name: 'VCA: Hinten einklappen', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaFoldF: { name: 'VCA: Vorne einklappen', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaGearSplit: { name: 'VCA: Splitgruppe', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaGearSplitDown: { name: 'VCA: Splitgruppe runter', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaGearSplitUp: { name: 'VCA: Splitgruppe hoch', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaHandRpm: { name: 'VCA: Handgas', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaHandbrake: { name: 'VCA: Handbremse', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaINCHING: { name: 'VCA: Inching-Funktion', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaKEEPROT: { name: 'VCA: Drehzahl halten', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaKEEPROT2: { name: 'VCA: Drehzahl halten 2', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaKEEPSPEED: { name: 'VCA: Geschwindigkeit halten', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaKEEPSPEED2: { name: 'VCA: Geschwindigkeit halten 2', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaKSAXIS: { name: 'VCA: Geschwindigkeitshalte-Achse', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaLEFT: { name: 'VCA: Links', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaLimitSpeed: { name: 'VCA: Geschwindigkeit begrenzen', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaLowerB: { name: 'VCA: Hinten senken', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaLowerF: { name: 'VCA: Vorne senken', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaMotorMod: { name: 'VCA: Motor-Modifikator', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaNO_ARB: { name: 'VCA: Ohne Querstabilisator', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaRIGHT: { name: 'VCA: Rechts', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaSNAP: { name: 'VCA: Spurführung (Snap)', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaSNAPCONT: { name: 'VCA: Spurführung fortlaufend', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaSNAPDIST: { name: 'VCA: Spurführungs-Abstand', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaSNAPLEFT: { name: 'VCA: Spurführung links', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaSNAPNEXT: { name: 'VCA: Nächste Spur', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaSNAPPREV: { name: 'VCA: Vorherige Spur', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaSNAPRESET: { name: 'VCA: Spurführung zurücksetzen', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaSNAPRIGHT: { name: 'VCA: Spurführung rechts', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaSNAPWIDTH: { name: 'VCA: Spurbreite', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaSNAP_A_B: { name: 'VCA: Spurführung A-B-Linie', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaSWAPSPEED: { name: 'VCA: Geschwindigkeit tauschen', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaSnapDOWN: { name: 'VCA: Spurführung runter', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaSnapLEFT: { name: 'VCA: Spurführung links (fein)', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaSnapRIGHT: { name: 'VCA: Spurführung rechts (fein)', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaSnapUP: { name: 'VCA: Spurführung hoch', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaUP: { name: 'VCA: Hoch', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },
  vcaWORKAREA: { name: 'VCA: Arbeitsbereich', category: 'Fahrzeug-Zusatzsteuerung (VCA)' },

  // Universal Autoload (automatisches Beladen für Anhänger/Auflieger)
  UNIVERSALAUTOLOAD_CYCLE_CONTAINER_BW: { name: 'Autoload: Container zurück', category: 'Universal Autoload' },
  UNIVERSALAUTOLOAD_CYCLE_CONTAINER_FW: { name: 'Autoload: Container vor', category: 'Universal Autoload' },
  UNIVERSALAUTOLOAD_CYCLE_MATERIAL_BW: { name: 'Autoload: Material zurück', category: 'Universal Autoload' },
  UNIVERSALAUTOLOAD_CYCLE_MATERIAL_FW: { name: 'Autoload: Material vor', category: 'Universal Autoload' },
  UNIVERSALAUTOLOAD_GLOBAL_MENU: { name: 'Autoload: Globales Menü', category: 'Universal Autoload' },
  UNIVERSALAUTOLOAD_SELECT_ALL_CONTAINERS: { name: 'Autoload: Alle Container wählen', category: 'Universal Autoload' },
  UNIVERSALAUTOLOAD_SELECT_ALL_MATERIALS: { name: 'Autoload: Alle Materialien wählen', category: 'Universal Autoload' },
  UNIVERSALAUTOLOAD_SHOP_ADJUST: { name: 'Autoload: Shop-Anpassung', category: 'Universal Autoload' },
  UNIVERSALAUTOLOAD_SHOP_CONFIG: { name: 'Autoload: Shop-Konfiguration', category: 'Universal Autoload' },
  UNIVERSALAUTOLOAD_TOGGLE_BELTS: { name: 'Autoload: Gurte ein/aus', category: 'Universal Autoload' },
  UNIVERSALAUTOLOAD_TOGGLE_COLLECTION: { name: 'Autoload: Sammlung ein/aus', category: 'Universal Autoload' },
  UNIVERSALAUTOLOAD_TOGGLE_CURTAIN: { name: 'Autoload: Plane ein/aus', category: 'Universal Autoload' },
  UNIVERSALAUTOLOAD_TOGGLE_DOOR: { name: 'Autoload: Tür ein/aus', category: 'Universal Autoload' },
  UNIVERSALAUTOLOAD_TOGGLE_FILTER: { name: 'Autoload: Filter ein/aus', category: 'Universal Autoload' },
  UNIVERSALAUTOLOAD_TOGGLE_HORIZONTAL: { name: 'Autoload: Horizontal ein/aus', category: 'Universal Autoload' },
  UNIVERSALAUTOLOAD_TOGGLE_LOADING: { name: 'Autoload: Beladen ein/aus', category: 'Universal Autoload' },
  UNIVERSALAUTOLOAD_TOGGLE_SHOW_DEBUG: { name: 'Autoload: Debug anzeigen', category: 'Universal Autoload' },
  UNIVERSALAUTOLOAD_TOGGLE_SHOW_LOADING: { name: 'Autoload: Ladeanzeige', category: 'Universal Autoload' },
  UNIVERSALAUTOLOAD_TOGGLE_TIPSIDE: { name: 'Autoload: Kippseite', category: 'Universal Autoload' },
  UNIVERSALAUTOLOAD_UNLOAD_ALL: { name: 'Autoload: Alles entladen', category: 'Universal Autoload' },

  // Rampensteuerung (Trailer-Mod, LMBF-Präfix)
  LMBF_TOGGLE_BRAMP: { name: 'Heckrampe ein/aus', category: 'Rampensteuerung' },
  LMBF_TOGGLE_RAMP: { name: 'Rampe ein/aus', category: 'Rampensteuerung' },
  LMBF_TOGGLE_RAMPD: { name: 'Rampe Fahrer-Seite ein/aus', category: 'Rampensteuerung' },
  LMBF_TOGGLE_RAMPS1: { name: 'Rampe 1 ein/aus', category: 'Rampensteuerung' },
  LMBF_TOGGLE_RAMPS2: { name: 'Rampe 2 ein/aus', category: 'Rampensteuerung' },
  LMBF_TOGGLE_RAMPS3: { name: 'Rampe 3 ein/aus', category: 'Rampensteuerung' },
  LMBF_TOGGLE_RAMPS4: { name: 'Rampe 4 ein/aus', category: 'Rampensteuerung' },
  LMBF_TOGGLE_RAMPS5: { name: 'Rampe 5 ein/aus', category: 'Rampensteuerung' },
  LMBF_TOGGLE_RAMPT: { name: 'Rampe hinten ein/aus', category: 'Rampensteuerung' },

  // CVT-Getriebe-Mod
  CVT_SHOWGUI: { name: 'CVT: Anzeige öffnen', category: 'CVT-Getriebe' },
  CVT_TOGGLEARWL: { name: 'CVT: Betriebsart wechseln', category: 'CVT-Getriebe' },

  // Vario-Getriebe-/Pedal-Zusatzmod (Fendt-Vario-artige stufenlose Kraftübertragung)
  SETVARIO3: { name: 'Vario-Voreinstellung 3', category: 'Vario-Getriebe-Zusatz' },
  SETVARIO4: { name: 'Vario-Voreinstellung 4', category: 'Vario-Getriebe-Zusatz' },
  SETVARIOADIFFS: { name: 'Vario: Differenzialsperren', category: 'Vario-Getriebe-Zusatz' },
  SETVARIOONE: { name: 'Vario-Voreinstellung 1', category: 'Vario-Getriebe-Zusatz' },
  SETVARIORPM_AXIS: { name: 'Vario: Drehzahl (Achse)', category: 'Vario-Getriebe-Zusatz' },
  SETVARIOTOGGLE: { name: 'Vario-Modus umschalten', category: 'Vario-Getriebe-Zusatz' },
  SETVARIOTWO: { name: 'Vario-Voreinstellung 2', category: 'Vario-Getriebe-Zusatz' },
  SETPEDALTMS: { name: 'Pedal-Kennlinie einstellen', category: 'Vario-Getriebe-Zusatz' },
  SETPREGLOW: { name: 'Vorglühen', category: 'Vario-Getriebe-Zusatz' },

  // Kran/Ballen-Mod (SH-Präfix, u.a. Selbstlade-/Ballengreifer-Kran)
  SH_DROP_BALES: { name: 'Ballen abwerfen', category: 'Kran & Ballen (SH)' },
  SH_GRAB_BALES: { name: 'Ballen greifen', category: 'Kran & Ballen (SH)' },
  SH_MOVE_CRANE_BRIDGE: { name: 'Kranbrücke bewegen', category: 'Kran & Ballen (SH)' },
  SH_MOVE_CRANE_TOOL: { name: 'Kranwerkzeug bewegen', category: 'Kran & Ballen (SH)' },
  SH_MOVE_CRANE_TROLLEY: { name: 'Kranlaufkatze bewegen', category: 'Kran & Ballen (SH)' },
  SH_OPEN_CRANE_TOOL: { name: 'Kranwerkzeug öffnen', category: 'Kran & Ballen (SH)' },
  SH_ROTATE_CRANE_TOOL: { name: 'Kranwerkzeug drehen', category: 'Kran & Ballen (SH)' },
  SH_TOGGLE_CRANE_TOOL: { name: 'Kranwerkzeug ein/aus', category: 'Kran & Ballen (SH)' },

  // Abschleppketten-Mod (Recovery/Bergung)
  TOWINGCHAIN_ATTACH_HOOK: { name: 'Abschlepphaken anhängen', category: 'Abschleppkette' },
  TOWINGCHAIN_ATTACH_VEHICLE: { name: 'Fahrzeug ankuppeln (Abschleppen)', category: 'Abschleppkette' },
  TOWINGCHAIN_CHANGE_ATTACHED_DIRECTION: { name: 'Anhänge-Richtung wechseln', category: 'Abschleppkette' },
  TOWINGCHAIN_MANUAL_ATTACH: { name: 'Manuell ankuppeln (Abschleppen)', category: 'Abschleppkette' },
  TOWINGCHAIN_MOVE_HOOK_BACKWARD: { name: 'Haken zurück', category: 'Abschleppkette' },
  TOWINGCHAIN_MOVE_HOOK_DOWN: { name: 'Haken runter', category: 'Abschleppkette' },
  TOWINGCHAIN_MOVE_HOOK_FORWARD: { name: 'Haken vor', category: 'Abschleppkette' },
  TOWINGCHAIN_MOVE_HOOK_LEFT: { name: 'Haken links', category: 'Abschleppkette' },
  TOWINGCHAIN_MOVE_HOOK_RIGHT: { name: 'Haken rechts', category: 'Abschleppkette' },
  TOWINGCHAIN_MOVE_HOOK_TRIGGER: { name: 'Haken auslösen', category: 'Abschleppkette' },
  TOWINGCHAIN_MOVE_HOOK_UP: { name: 'Haken hoch', category: 'Abschleppkette' },
  TOWINGCHAIN_OPEN_MENU: { name: 'Abschlepp-Menü öffnen', category: 'Abschleppkette' },
  TOWINGCHAIN_OPEN_MENU_VEHICLE: { name: 'Abschlepp-Menü (Fahrzeug)', category: 'Abschleppkette' },
  TOWINGCHAIN_STEER_LEFT: { name: 'Abschlepp-Lenkung links', category: 'Abschleppkette' },
  TOWINGCHAIN_STEER_RIGHT: { name: 'Abschlepp-Lenkung rechts', category: 'Abschleppkette' },
  TOWINGCHAIN_SWITCH: { name: 'Abschleppmodus wechseln', category: 'Abschleppkette' },
  TOWINGCHAIN_TOGGLE_STEERING_MODE: { name: 'Lenkmodus (Abschleppen) umschalten', category: 'Abschleppkette' },
  TOWINGCHAIN_VEHICLE_THROTTLE: { name: 'Gas (Abschleppen)', category: 'Abschleppkette' },

  // Fahrzeug-Folgemodus-Mod ("Follow Me")
  FOLLOW_CHASER_CHOOSE: { name: 'Folgemodus: Verfolger wählen', category: 'Fahrzeug-Folgemodus' },
  FOLLOW_CHASER_DISTANCE: { name: 'Folgemodus: Verfolger-Abstand', category: 'Fahrzeug-Folgemodus' },
  FOLLOW_CHASER_PAUSE_RESUME: { name: 'Folgemodus: Verfolger Pause/Fortsetzen', category: 'Fahrzeug-Folgemodus' },
  FOLLOW_CHASER_SIDE_OFFSET: { name: 'Folgemodus: Verfolger seitlicher Versatz', category: 'Fahrzeug-Folgemodus' },
  FOLLOW_CHASER_TOOLACTION: { name: 'Folgemodus: Verfolger-Werkzeugaktion', category: 'Fahrzeug-Folgemodus' },
  FOLLOW_DISTANCE: { name: 'Folgemodus: Abstand', category: 'Fahrzeug-Folgemodus' },
  FOLLOW_INITIATE: { name: 'Folgemodus starten', category: 'Fahrzeug-Folgemodus' },
  FOLLOW_MARKER_TOGGLE_OFFSET: { name: 'Folgemodus: Markierungs-Versatz', category: 'Fahrzeug-Folgemodus' },
  FOLLOW_PAUSE_RESUME: { name: 'Folgemodus: Pause/Fortsetzen', category: 'Fahrzeug-Folgemodus' },
  FOLLOW_SIDE_OFFSET: { name: 'Folgemodus: Seitlicher Versatz', category: 'Fahrzeug-Folgemodus' },
  FOLLOW_TOOLACTION: { name: 'Folgemodus: Werkzeugaktion', category: 'Fahrzeug-Folgemodus' },

  // Editor-/Cheat-Konsolen-Mod
  EDC_OBJECT_DELETE: { name: 'Editor: Objekt löschen', category: 'Editor & Cheats' },
  EDC_PLAYER_RUN_SPEED: { name: 'Editor: Lauftempo', category: 'Editor & Cheats' },
  EDC_SHOW_UI: { name: 'Editor: Oberfläche anzeigen', category: 'Editor & Cheats' },
  EDC_SUPER_STRENGTH: { name: 'Editor: Superkraft', category: 'Editor & Cheats' },
  EDC_TOGGLE_HUD: { name: 'Editor: HUD ein/aus', category: 'Editor & Cheats' },
  TOGGLE_SUPER_STRENGTH: { name: 'Superkraft ein/aus', category: 'Editor & Cheats' },

  // Schwader-Zusatzmod
  WINDROWER_LOWER1: { name: 'Schwader 1 senken', category: 'Schwader-Zusatz' },
  WINDROWER_LOWER2: { name: 'Schwader 2 senken', category: 'Schwader-Zusatz' },
  WINDROWER_LOWER3: { name: 'Schwader 3 senken', category: 'Schwader-Zusatz' },
  WINDROWER_LOWER4: { name: 'Schwader 4 senken', category: 'Schwader-Zusatz' },

  // Fahrassistenz-Licht-/Blinker-Zusatzsteuerung eines Fahrzeugpakets (VD-Präfix)
  VD_AI_ACTIVATE_BACK: { name: 'Fahrassistenz: hinten aktivieren', category: 'Fahrassistenz-Zusatz (VD)' },
  VD_AI_ACTIVATE_FRONT: { name: 'Fahrassistenz: vorne aktivieren', category: 'Fahrassistenz-Zusatz (VD)' },
  VD_AI_FOLD_BACK: { name: 'Fahrassistenz: hinten einklappen', category: 'Fahrassistenz-Zusatz (VD)' },
  VD_AI_FOLD_FRONT: { name: 'Fahrassistenz: vorne einklappen', category: 'Fahrassistenz-Zusatz (VD)' },
  VD_AI_FRONT_WORK_LIGHT_ON: { name: 'Fahrassistenz: Arbeitsscheinwerfer vorne an', category: 'Fahrassistenz-Zusatz (VD)' },
  VD_AI_HIGH_BEAM_OFF_FLASH_RELEASE: { name: 'Fahrassistenz: Lichthupe loslassen', category: 'Fahrassistenz-Zusatz (VD)' },
  VD_AI_HIGH_BEAM_OFF_FLASH_TRIGGER: { name: 'Fahrassistenz: Lichthupe auslösen', category: 'Fahrassistenz-Zusatz (VD)' },
  VD_AI_HIGH_BEAM_ON: { name: 'Fahrassistenz: Fernlicht an', category: 'Fahrassistenz-Zusatz (VD)' },
  VD_AI_INDICATOR_LEFT_ON: { name: 'Fahrassistenz: Blinker links an', category: 'Fahrassistenz-Zusatz (VD)' },
  VD_AI_INDICATOR_OFF: { name: 'Fahrassistenz: Blinker aus', category: 'Fahrassistenz-Zusatz (VD)' },
  VD_AI_INDICATOR_RIGHT_ON: { name: 'Fahrassistenz: Blinker rechts an', category: 'Fahrassistenz-Zusatz (VD)' },
  VD_AI_LOWER_BACK: { name: 'Fahrassistenz: hinten senken', category: 'Fahrassistenz-Zusatz (VD)' },
  VD_AI_LOWER_FRONT: { name: 'Fahrassistenz: vorne senken', category: 'Fahrassistenz-Zusatz (VD)' },
  VD_AI_LOW_BEAM_OFF: { name: 'Fahrassistenz: Abblendlicht aus', category: 'Fahrassistenz-Zusatz (VD)' },
  VD_AI_LOW_BEAM_ON: { name: 'Fahrassistenz: Abblendlicht an', category: 'Fahrassistenz-Zusatz (VD)' },

  // Baumodus-Zusatzmod (CU-Präfix)
  CU_TOGGLE_LIGHT_MODE: { name: 'Baumodus: Lichtmodus', category: 'Baumodus-Zusatz (CU)' },
  CU_TOGGLE_NO_COLLISION_MODE: { name: 'Baumodus: Kollisionsfrei', category: 'Baumodus-Zusatz (CU)' },

  // Vereinzelte, nicht eindeutig zuordenbare Mods -- eigene Kategorie pro Präfix, damit sie
  // wenigstens nicht im generischen Sammeltopf landen
  BC_MTOGGLE: { name: 'BC: Umschalten', category: 'BC-Mod' },
  UYT_REPLACE_TYRES: { name: 'Reifen wechseln', category: 'Reifenwechsel (UYT)' },
  REALMOWER_ACTIVATE: { name: 'Real Mower aktivieren', category: 'Real Mower' },
  REGLAGE_BEQUILLES: { name: 'Stützfuß einstellen', category: 'Stützfuß-Einstellung' },
  PARKVEHICLE_01: { name: 'Fahrzeug parken', category: 'Fahrzeug parken' },
  PARKVEHICLE_UNPARK_ALL: { name: 'Alle Fahrzeuge ausparken', category: 'Fahrzeug parken' },
  MAP_OBJECT_HIDER_DECOLLIDE: { name: 'Kartenobjekte: Kollision entfernen', category: 'Kartenobjekte ausblenden' },
  MAP_OBJECT_HIDER_GUI: { name: 'Kartenobjekte: Menü', category: 'Kartenobjekte ausblenden' },
  MAP_OBJECT_HIDER_HIDE: { name: 'Kartenobjekte ausblenden', category: 'Kartenobjekte ausblenden' },
  HEAPPREVIEWONOFF: { name: 'Haufen-Vorschau ein/aus', category: 'Sonstige Zusatzfunktionen' },
  CutBaleAction: { name: 'Ballenfolie schneiden', category: 'Sonstige Zusatzfunktionen' },
  VacationAction: { name: 'Urlaubsmodus', category: 'Sonstige Zusatzfunktionen' },
  DHS_AXIS_HEADERSPEED: { name: 'Schneidwerksdrehzahl (Achse)', category: 'Sonstige Zusatzfunktionen' },

  // PowerTools-Mod (Werkzeugleiste mit Zusatzfunktionen)
  POWERTOOLSMENU: { name: 'PowerTools: Menü öffnen', category: 'PowerTools' },
  POWERTOOLSMENU_ALTERNATIVE: { name: 'PowerTools: Menü öffnen (alternativ)', category: 'PowerTools' },
  POWERTOOLS_QUICKSAVE: { name: 'PowerTools: Schnellspeichern', category: 'PowerTools' },
  POWERTOOLS_REPEAT_ACTION: { name: 'PowerTools: Aktion wiederholen', category: 'PowerTools' },
  POWERTOOLS_TREE_REMOVE: { name: 'PowerTools: Baum entfernen', category: 'PowerTools' },

  // "Enhanced Vehicle"-Mod (Anbaugerät-Ausrichtungshilfe: Andocken/Snapping, Spurführung, Parken,
  // automatische Anbaugerät-Nivellierung vorne/hinten)
  FS25_EnhancedVehicle_MENU: { name: 'Enhanced Vehicle: Menü öffnen', category: 'Fahrzeug-Ausrichtungshilfe (Enhanced Vehicle)' },
  FS25_EnhancedVehicle_PARK: { name: 'Enhanced Vehicle: Parkbremse', category: 'Fahrzeug-Ausrichtungshilfe (Enhanced Vehicle)' },
  FS25_EnhancedVehicle_SNAP_ONOFF: { name: 'Enhanced Vehicle: Ausrichtungshilfe ein/aus', category: 'Fahrzeug-Ausrichtungshilfe (Enhanced Vehicle)' },
  FS25_EnhancedVehicle_SNAP_REVERSE: { name: 'Enhanced Vehicle: Ausrichtung umkehren', category: 'Fahrzeug-Ausrichtungshilfe (Enhanced Vehicle)' },
  FS25_EnhancedVehicle_SNAP_OPMODE: { name: 'Enhanced Vehicle: Betriebsmodus wechseln', category: 'Fahrzeug-Ausrichtungshilfe (Enhanced Vehicle)' },
  FS25_EnhancedVehicle_SNAP_CALC_WW: { name: 'Enhanced Vehicle: Arbeitsbreite berechnen', category: 'Fahrzeug-Ausrichtungshilfe (Enhanced Vehicle)' },
  FS25_EnhancedVehicle_SNAP_GRID_RESET: { name: 'Enhanced Vehicle: Raster zurücksetzen', category: 'Fahrzeug-Ausrichtungshilfe (Enhanced Vehicle)' },
  FS25_EnhancedVehicle_SNAP_LINES_MODE: { name: 'Enhanced Vehicle: Hilfslinien-Modus', category: 'Fahrzeug-Ausrichtungshilfe (Enhanced Vehicle)' },
  FS25_EnhancedVehicle_SNAP_TRACK: { name: 'Enhanced Vehicle: Spurführung', category: 'Fahrzeug-Ausrichtungshilfe (Enhanced Vehicle)' },
  FS25_EnhancedVehicle_SNAP_TRACKP: { name: 'Enhanced Vehicle: Spur-Parallelversatz', category: 'Fahrzeug-Ausrichtungshilfe (Enhanced Vehicle)' },
  FS25_EnhancedVehicle_SNAP_TRACKW: { name: 'Enhanced Vehicle: Spurbreite', category: 'Fahrzeug-Ausrichtungshilfe (Enhanced Vehicle)' },
  FS25_EnhancedVehicle_SNAP_TRACKO: { name: 'Enhanced Vehicle: Spur-Versatz', category: 'Fahrzeug-Ausrichtungshilfe (Enhanced Vehicle)' },
  FS25_EnhancedVehicle_SNAP_TRACKJ: { name: 'Enhanced Vehicle: Spur-Sprung', category: 'Fahrzeug-Ausrichtungshilfe (Enhanced Vehicle)' },
  FS25_EnhancedVehicle_SNAP_HL_MODE: { name: 'Enhanced Vehicle: Vorgewende-Modus', category: 'Fahrzeug-Ausrichtungshilfe (Enhanced Vehicle)' },
  FS25_EnhancedVehicle_SNAP_HL_DIST: { name: 'Enhanced Vehicle: Vorgewende-Abstand', category: 'Fahrzeug-Ausrichtungshilfe (Enhanced Vehicle)' },
  FS25_EnhancedVehicle_SNAP_ANGLE1: { name: 'Enhanced Vehicle: Winkel-Voreinstellung 1', category: 'Fahrzeug-Ausrichtungshilfe (Enhanced Vehicle)' },
  FS25_EnhancedVehicle_SNAP_ANGLE2: { name: 'Enhanced Vehicle: Winkel-Voreinstellung 2', category: 'Fahrzeug-Ausrichtungshilfe (Enhanced Vehicle)' },
  FS25_EnhancedVehicle_SNAP_ANGLE3: { name: 'Enhanced Vehicle: Winkel-Voreinstellung 3', category: 'Fahrzeug-Ausrichtungshilfe (Enhanced Vehicle)' },
  FS25_EnhancedVehicle_FD: { name: 'Enhanced Vehicle: Vorwärts', category: 'Fahrzeug-Ausrichtungshilfe (Enhanced Vehicle)' },
  FS25_EnhancedVehicle_RD: { name: 'Enhanced Vehicle: Rückwärts', category: 'Fahrzeug-Ausrichtungshilfe (Enhanced Vehicle)' },
  FS25_EnhancedVehicle_BD: { name: 'Enhanced Vehicle: Bremsen', category: 'Fahrzeug-Ausrichtungshilfe (Enhanced Vehicle)' },
  FS25_EnhancedVehicle_DM: { name: 'Enhanced Vehicle: Fahrmodus wechseln', category: 'Fahrzeug-Ausrichtungshilfe (Enhanced Vehicle)' },
  FS25_EnhancedVehicle_AJ_REAR_UPDOWN: { name: 'Enhanced Vehicle: Anbaugerät hinten heben/senken (Achse)', category: 'Fahrzeug-Ausrichtungshilfe (Enhanced Vehicle)' },
  FS25_EnhancedVehicle_AJ_REAR_ONOFF: { name: 'Enhanced Vehicle: Anbaugerät hinten ein/aus', category: 'Fahrzeug-Ausrichtungshilfe (Enhanced Vehicle)' },
  FS25_EnhancedVehicle_AJ_REAR_FOLD: { name: 'Enhanced Vehicle: Anbaugerät hinten einklappen', category: 'Fahrzeug-Ausrichtungshilfe (Enhanced Vehicle)' },
  FS25_EnhancedVehicle_AJ_FRONT_UPDOWN: { name: 'Enhanced Vehicle: Anbaugerät vorne heben/senken (Achse)', category: 'Fahrzeug-Ausrichtungshilfe (Enhanced Vehicle)' },
  FS25_EnhancedVehicle_AJ_FRONT_ONOFF: { name: 'Enhanced Vehicle: Anbaugerät vorne ein/aus', category: 'Fahrzeug-Ausrichtungshilfe (Enhanced Vehicle)' },
  FS25_EnhancedVehicle_AJ_FRONT_FOLD: { name: 'Enhanced Vehicle: Anbaugerät vorne einklappen', category: 'Fahrzeug-Ausrichtungshilfe (Enhanced Vehicle)' },
  FS25_EnhancedVehicle_ODO_MODE: { name: 'Enhanced Vehicle: Kilometerzähler-Modus', category: 'Fahrzeug-Ausrichtungshilfe (Enhanced Vehicle)' },

  // Vanilla, aber ohne passendes CATEGORY_MAP-Schlüsselwort
  AXIS_ROTATE_HANDTOOL: { name: 'Werkzeug drehen (Achse)', category: 'Interaktion' },
  AXIS_PITCH_HANDTOOL: { name: 'Werkzeug neigen (Achse)', category: 'Interaktion' },
  AXIS_CRUISE_CONTROL: { name: 'Tempomat (Achse)', category: 'Motor & Antrieb' },
  TOGGLE_BULK_FILL: { name: 'Schüttgut-Abdeckung ein/aus', category: 'Gerätesteuerung' },
  TOGGLE_FILL_SELECT: { name: 'Füllgut-Auswahl', category: 'Gerätesteuerung' },
  BULK_FILL_CYCLE_FW: { name: 'Schüttgut weiter', category: 'Gerätesteuerung' },
  BULK_FILL_CYCLE_BW: { name: 'Schüttgut zurück', category: 'Gerätesteuerung' },
  TOGGLE_FIELD_CREATION: { name: 'Feld anlegen', category: 'Menü & UI' },
  CABVIEW_LEAN_FORWARD: { name: 'Im Sitz vorlehnen', category: 'Kamera' },
  CABVIEW_LEAN_TOGGLE: { name: 'Vorlehnen ein/aus', category: 'Kamera' }
};

const SKIP_PREFIXES = [
  'DEBUG_', 'CONSOLE_', 'MOUSE_ALT_', 'AXIS_LOOK_', 'AXIS_CONSTRUCTION_', 'MENU_',
  'AXIS_PICK_COLOR', 'AXIS_MAP_', 'RELOAD_GAME', 'ADD_NOTE', 'SPRAYCAN_', 'GAMING_STATION_',
  'CONSTRUCTION_'
];

// Exakte Treffer (KEINE Teilstrings!) -- interne/redundante Duplikat-Actions ohne eigenen Effekt,
// z.B. gibt es sowohl "TOGGLE_HELP" als auch "TOGGLE_HELP_TEXT" als separate Actions in der XML --
// nur die zweite ist die "echte" mit sichtbarer Wirkung. Frühere Fassung nutzte hierfür
// fälschlich einen Teilstring-Vergleich ("SH_", "TOGGLE_HELP", "TOGGLE_MAP", "MODULE_") und
// verschluckte dadurch versehentlich echte, unabhängige Actions wie PUSH_TO_TALK (enthält "SH_"
// als Teilstring!), TOGGLE_HELP_TEXT, TOGGLE_MAP_SIZE und die komplette SH_-Kran/Ballen-Mod-Gruppe.
const SKIP_EXACT = new Set([
  'CYCLE_HANDTOOL', 'TOGGLE_HANDTOOL', 'TOGGLE_HELP', 'TOGGLE_MAP', 'MOVE_CABIN'
]);

// MOTOR_STATE_ON/OFF/IGNITION standen bis 25.10.2026 hier (ab Werk ohne Taste). Seitdem kommen sie mit: Hendrik belegt sie
// im Spiel für das Zündschloss am CraftDeck (70 Motor aus, 71 Zündung, 72 Motor an, je kurzer Druck) -- „trotzdem da
// haben, vielleicht kann es später noch geändert werden“. Stand im Spiel (Test 25.10.): Über die Tastatur gilt „Zündung“
// nur, solange sie gedrückt ist, „Motor an“ startet nur bei gehaltener Zündung; als kurzer Druck bringt die Zündung also
// nichts. Das GIANTS-Zündschloss (USB 340D:1731) sendet je Wechsel nur Impulse, das Spiel erkennt es eigens.
const SKIP_CONTAINS = [
  '_DRAG', 'DIRECTION_CHANGE_POS', 'DIRECTION_CHANGE_NEG', 'SHIFT_GEAR_SELECT', 'SHIFT_GROUP_SELECT', 'INGAMEMAP_'
];

// Namen für die „−“-Richtung (axisComponent="-"); sonst „Name (−)“
const MINUS_NAMES = {
  VARIABLE_WORK_WIDTH_LEFT: 'Teilbreite links an',
  VARIABLE_WORK_WIDTH_RIGHT: 'Teilbreite rechts an'
};

function shouldSkipAction(action) {
  if (SKIP_PREFIXES.some(prefix => action.startsWith(prefix))) return true;
  if (SKIP_EXACT.has(action)) return true;
  if (SKIP_CONTAINS.some(needle => action.includes(needle))) return true;
  return false;
}

function humanizeFallback(action) {
  return action
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // camelCase-Wortgrenzen trennen (z.B. "ADSomething")
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// FS25 "KEY_xxx"-Tokens (aus den <binding device="KB_MOUSE_DEFAULT" .../>-Kindelementen) ->
// Tastennamen, wie sie die Firmware in hidKeycodeFor() (CraftConsolePro_Pico.ino) erwartet.
// Buchstaben/Ziffern/F-Tasten/Pfeiltasten/Modifier deckt die Firmware schon länger ab (direkt
// großgeschrieben durchreichen reicht); die übrigen wurden am 08.08.2026 zusammen mit dieser
// Import-Erweiterung neu in die Firmware aufgenommen (Basis-USB-HID-Keyboard-Belegung) -- ohne den
// zugehörigen Firmware-Flash bleiben diese Tasten wirkungslos (Keycode 0, wird stillschweigend
// nicht gesendet).
const FS_KEY_MAP = {
  space: 'SPACE', return: 'ENTER', esc: 'ESC', tab: 'TAB', backspace: 'BACKSPACE',
  up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT',
  lshift: 'LSHIFT', rshift: 'RSHIFT', lctrl: 'LCTRL', rctrl: 'RCTRL', lalt: 'LALT', ralt: 'RALT',
  minus: 'MINUS', equals: 'EQUALS', leftbracket: 'LBRACKET', rightbracket: 'RBRACKET',
  backslash: 'BACKSLASH', semicolon: 'SEMICOLON', quote: 'QUOTE', grave: 'GRAVE',
  comma: 'COMMA', period: 'PERIOD', slash: 'SLASH', less: 'LESS',
  print: 'PRINTSCREEN', scrolllock: 'SCROLLLOCK', pause: 'PAUSE',
  insert: 'INSERT', home: 'HOME', pageup: 'PAGEUP', delete: 'DELETE', end: 'END', pagedown: 'PAGEDOWN',
  kp_divide: 'KPDIV', kp_multiply: 'KPMUL', kp_minus: 'KPMINUS', kp_plus: 'KPPLUS',
  kp_0: 'KP0', kp_1: 'KP1', kp_2: 'KP2', kp_3: 'KP3', kp_4: 'KP4',
  kp_5: 'KP5', kp_6: 'KP6', kp_7: 'KP7', kp_8: 'KP8', kp_9: 'KP9',
  // 24.10.2026: Num-Enter fiel bisher still weg (nicht dieselbe Taste wie Enter); Num-Komma. Beides sendet die
  // CraftConsole-Firmware noch nicht (Bildschirmtastatur zeigt es ausgegraut).
  kp_enter: 'KPENTER', kp_period: 'KPDOT'
};

/** @param {string} token - z.B. "KEY_lalt", "KEY_f8", "KEY_3", "KEY_a" */
function mapFsKeyToken(token) {
  const raw = token.replace(/^KEY_/, '');
  if (/^[a-zA-Z]$/.test(raw)) return raw.toUpperCase();
  if (/^[0-9]$/.test(raw)) return raw;
  if (/^f\d{1,2}$/.test(raw)) return raw.toUpperCase();
  return FS_KEY_MAP[raw.toLowerCase()] || null;
}

/**
 * Extrahiert die primäre Tastatur-Belegung einer Action aus ihren <binding>-Kindelementen.
 * "index" unterscheidet ALTERNATIVE Belegungen (z.B. Leertaste ODER ein Gamepad-Knopf) --
 * genommen wird die Tastatur-Alternative mit dem niedrigsten Index (= die vom Spiel vorgesehene
 * Standardbelegung). Mehrere Tasten INNERHALB eines einzelnen input="..." (z.B. "KEY_lalt KEY_KP_0")
 * sind dagegen als gleichzeitig zu haltende Kombination gemeint und werden komplett übernommen.
 * Maus-Bindings (z.B. MOUSE_BUTTON_LEFT, MOUSE_WHEEL_UP) werden ignoriert -- nur echte Tastatur gefragt.
 * @param {string} actionBlock - der Inhalt zwischen <actionBinding ...> und </actionBinding>
 * @returns {Array<{type: 'keyboard', key: string}>}
 */
function extractKeyboardActions(actionBlock, richtung = '+') {
  if (!actionBlock) return [];
  const bindingRegex = /<binding\s+device="KB_MOUSE_DEFAULT"\s+input="([^"]+)"([^>]*)>/g;
  let best = null;
  let match;
  while ((match = bindingRegex.exec(actionBlock)) !== null) {
    const tokens = match[1].split(/\s+/);
    if (!tokens.every(t => t.startsWith('KEY_'))) continue; // Maus-Kombi -- überspringen
    // axisComponent: „+“ ist die normale Taste; Aktionen mit zwei Richtungen haben zusätzlich eine „−“-Taste
    // (z. B. Teilbreite links aus/an). Fehlt die Angabe, gilt „+“.
    const comp = (match[2].match(/\baxisComponent="([+-])"/) || [])[1] || '+';
    if (comp !== richtung) continue;
    const index = parseInt((match[2].match(/\bindex="(\d+)"/) || [])[1] || '1', 10);
    if (!best || index < best.index) best = { index, tokens };
  }
  if (!best) return [];

  const actions = [];
  for (const token of best.tokens) {
    const key = mapFsKeyToken(token);
    if (key) actions.push({ type: 'keyboard', key });
  }
  return actions;
}

// ---------- Aktionen des Spiels (Mod ab 0.7.6, craftConsoleInputActions.xml) ----------
// Hendrik 24.10.2026: Funktionen „mit den Kategorien, wie sie auch im Spiel genutzt werden“. Die Mod schreibt je Aktion
// die Felder des Spiels (displayCategory = Abschnitt im Steuerungsmenü, displayNamePositive/-Negative = deutscher Name
// für + und −). Die Abschnitte kommen als Sprachschlüssel ($l10n_inputCategory_…); den Text liefert die Mod ab 0.7.7
// (<categoryText>), sonst gelten diese Bezeichnungen. DLC-Pakete stehen schon als Klartext da.
// Untergruppen (Hendrik 24.10.2026: „Unterkategorien … sollten wir einführen“): „Obergruppe › Untergruppe“, wie in
// public/js/functionGroups.js. Spiel-Bereiche als Baum, Mods und DLC je unter einer Sammelgruppe.
export const UG = ' › ';
const KATEGORIE_DE = {
  GAME: 'Spiel', CAMERA: 'Kamera', RADIO: 'Radio', PLACEABLE: 'Gebäude', CONSTRUCTION: 'Baumodus',
  PLAYER_MOVEMENT: `Zu Fuß${UG}Bewegung`, PLAYER_INTERACTIVE: `Zu Fuß${UG}Interaktion`,
  VEHICLE: 'Fahrzeug', VEHICLE_DRIVING: `Fahrzeug${UG}Fahren`, VEHICLE_GEARBOX: `Fahrzeug${UG}Getriebe`,
  VEHICLE_LIGHTS: `Fahrzeug${UG}Beleuchtung`, VEHICLE_WORK: `Fahrzeug${UG}Arbeit`, VEHICLE_FRONTLOADER: `Fahrzeug${UG}Frontlader`,
  CRANE: 'Kran'
};
export const MODS = 'Mods', DLC = 'DLC';

// Eigene Zuordnung (ohne Daten aus dem Spiel) in denselben Baum einhängen
const EIGEN_BAUM = {
  'Bewegung': `Zu Fuß${UG}Bewegung`, 'Interaktion': `Zu Fuß${UG}Interaktion`,
  'Motor & Antrieb': `Fahrzeug${UG}Fahren`, 'Beleuchtung': `Fahrzeug${UG}Beleuchtung`, 'Kupplung & Geräte': 'Fahrzeug',
  'Gerätesteuerung': `Fahrzeug${UG}Arbeit`, 'Hydraulik': `Fahrzeug${UG}Arbeit`, 'Ernte': `Fahrzeug${UG}Arbeit`,
  'Teilbreiten': `Fahrzeug${UG}Arbeit`, 'Säen & Pflanzen': `Fahrzeug${UG}Arbeit`, 'Spritzen & Düngen': `Fahrzeug${UG}Arbeit`,
  'Holzernte': `Fahrzeug${UG}Arbeit`, 'Frontlader & Kran': `Fahrzeug${UG}Frontlader`, 'Holztransport': 'Kran',
  'Precision Farming': `${DLC}${UG}Precision Farming`, 'Kamera': 'Kamera', 'Menü & UI': 'Spiel', 'Spieleinstellungen': 'Spiel'
};
const xmlWert = v => v.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&');

/**
 * craftConsoleInputActions.xml lesen.
 * @returns {{ aktionen: Map<string, {kat: string, plus: string|null, minus: string|null}>, anzahl: number }|null}
 *   kat = Gruppe wie im Spiel (Text), null-Namen = das Spiel nennt nur den internen Namen
 */
export function parseSpielAktionen(xmlText) {
  if (!xmlText || typeof xmlText !== 'string' || !xmlText.includes('<inputActions')) return null;
  const texte = {};
  for (const m of xmlText.matchAll(/<categoryText\s([^>]*?)\/?>/g)) {
    const key = m[1].match(/\bkey="([^"]*)"/)?.[1], text = m[1].match(/\btext="([^"]*)"/)?.[1];
    if (key && text) texte[xmlWert(key)] = xmlWert(text);
  }
  const aktionen = new Map();
  for (const blk of xmlText.matchAll(/<a>([\s\S]*?)<\/a>/g)) {
    const f = {};
    for (const m of blk[1].matchAll(/<f\s+k="([^"]*)"\s+v="([^"]*)"\s*\/>/g)) f[xmlWert(m[1])] = xmlWert(m[2]);
    const name = f.name;
    if (!name) continue;
    const roh = f.displayCategory || '';
    const schluessel = roh.replace(/^\$l10n_/, '');
    // Bekannte Abschnitte im eigenen Baum (der Text des Spiels passt nicht immer in „Obergruppe › Untergruppe“),
    // unbekannte mit dem Text des Spiels (Mod 0.7.7), DLC-Pakete stehen als Klartext da
    let kat = roh.startsWith('$l10n_inputCategory_') ? KATEGORIE_DE[schluessel.replace(/^inputCategory_/, '')] || null : null;
    if (!kat) kat = texte[schluessel] || null;
    if (!kat && roh && !roh.startsWith('$l10n_')) kat = `${DLC}${UG}${roh}`;
    if (/^inputCategory_DEBUG/.test(schluessel)) kat = 'DEBUG';
    const lesbar = t => (t && t !== name && !t.startsWith('$l10n_') ? t : null);
    aktionen.set(name, { kat, plus: lesbar(f.displayNamePositive), minus: lesbar(f.displayNameNegative) });
  }
  return aktionen.size ? { aktionen, anzahl: aktionen.size } : null;
}

function resolveAction(action) {
  for (const entry of CATEGORY_MAP) {
    if (entry.keywords.some(keyword => action.includes(keyword))) {
      return { name: TRANSLATIONS[action] || humanizeFallback(action), category: EIGEN_BAUM[entry.category] || entry.category };
    }
  }
  if (MOD_ACTIONS[action]) {
    // Einige Einträge tragen eine Spielgruppe (z. B. „Interaktion“) statt eines Mod-Namens -- die kommen in den Spiel-Baum
    const kat = MOD_ACTIONS[action].category;
    return { ...MOD_ACTIONS[action], category: EIGEN_BAUM[kat] || `${MODS}${UG}${kat}` };
  }
  if (TRANSLATIONS[action]) {
    return { name: TRANSLATIONS[action], category: 'Spiel' };
  }
  // Wirklich unbekannt (weder Vanilla-Keyword noch von Hand erfasster Mod) -- eigene Sammelkategorie,
  // getrennt von den benannten Mod-Kategorien oben, damit die echten Mod-Gruppen sauber bleiben.
  return { name: humanizeFallback(action), category: 'Sonstige/unbekannt' };
}

/**
 * @param {string} xmlText - Rohinhalt einer FS25 inputBinding.xml
 * @param {{ spiel?: object|null, mods?: object|null }} [quellen] - spiel = parseSpielAktionen(), mods = leseModAktionen()
 *   (server/modAktionen.js). Beide dürfen fehlen, dann gelten die eigenen Namen und Gruppen.
 * @returns {{ functions: Object, count: number, ausSpiel: number, ausMods: number }}
 */
export function parseInputBindingXml(xmlText, { spiel = null, mods = null } = {}) {
  if (!xmlText || typeof xmlText !== 'string') {
    throw new Error('Leere oder ungültige XML-Datei');
  }

  const functions = {};
  let ausSpiel = 0, ausMods = 0;
  // Erfasst pro Action optional den Inhalt bis </actionBinding> (Gruppe 2 bleibt undefined bei
  // selbstschließenden <actionBinding action="X"/> ohne jede Belegung).
  const actionRegex = /<actionBinding\s+action="([^"]+)"\s*(?:\/>|>([\s\S]*?)<\/actionBinding>)/g;
  let match;
  while ((match = actionRegex.exec(xmlText)) !== null) {
    const action = match[1];
    if (!action || shouldSkipAction(action)) continue;

    const id = `func-fs-${action.toLowerCase().replace(/_/g, '-')}`;
    // Gruppe: Aktion aus einer Mod -> der Name der Mod (Hendrik 24.10.2026), sonst der Abschnitt wie im
    // Steuerungsmenü des Spiels (s. parseSpielAktionen), sonst die eigene Zuordnung. Namen in derselben Reihenfolge.
    const sp = spiel?.aktionen?.get(action) || null;
    if (sp?.kat === 'DEBUG') continue;
    const md = mods?.aktionen?.get(action) || null;
    const eigen = resolveAction(action);
    const name = sp?.plus || md?.plus || eigen.name;
    const category = md?.mod ? `${MODS}${UG}${md.mod}` : sp?.kat || eigen.category;
    const actions = extractKeyboardActions(match[2]);

    functions[id] = { id, name, categories: [category], icon: null, actions };
    if (md) ausMods++;
    else if (sp?.kat) ausSpiel++;

    // Zweite Richtung (23.10.2026): vorher ging die „−“-Taste verloren, z. B. „Teilbreite links an“
    const minus = extractKeyboardActions(match[2], '-');
    if (minus.length) {
      const nameMinus = sp?.minus || md?.minus || MINUS_NAMES[action] || `${name} (−)`;
      functions[`${id}-minus`] = { id: `${id}-minus`, name: nameMinus, categories: [category], icon: null, actions: minus };
    }
  }

  const count = Object.keys(functions).length;
  if (count === 0) {
    throw new Error('Keine Actions in der XML gefunden -- ist das wirklich eine inputBinding.xml?');
  }

  return { functions, count, ausSpiel, ausMods };
}
