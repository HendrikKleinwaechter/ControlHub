--[[
  CraftConsole HUD Interface – Farming Simulator 25
  =================================================
  Liest Daten des gesteuerten Fahrzeugs, seiner Geräte, der Karte und der eigenen Felder und schreibt sie regelmäßig
  als XML in modSettings/FS25_CraftConsoleHUD/. ControlHub liest die Dateien und zeigt sie auf Tablet und PC an. Die
  Mod liest nur; im Spiel geschaltet wird ausschließlich per Tastendruck des Spielers bzw. seines Controllers.

  EIGENENTWICKLUNG (kein Code aus Fremd-Mods übernommen).

  Required Notice: Copyright 2026 Hendrik Kleinwächter
  Lizenz: PolyForm Noncommercial License 1.0.0 <https://polyformproject.org/licenses/noncommercial/1.0.0>
  (kostenlos für nicht-kommerzielle Zwecke, kein Verkauf). Zusätzlich erlaubt: die Mod in Videos und Livestreams
  benutzen und zeigen, auch mit Einnahmen (Werbung, Spenden, Abos); nicht erlaubt bleibt der Verkauf der Mod selbst.
  „ControlCraft“, „CraftConsole“ und „ControlHub“ sind Namen
  von Hendrik Kleinwächter; die Lizenz gewährt daran keine Rechte.
  Quellen: GDN LuaDoc (GIANTS Developer Network).

  ✅ bestätigt · ⚠️ ggf. an FS25-LuaDoc anpassen. Alles defensiv mit pcall.

  0.5.2.0 (23.10.2026, Durchsicht B6/B7): Sitzungskennung je Spielstand (hud#session), Sparmodus ohne Lebenszeichen
  von ControlHub (settings#alive), Gerätekette/Shop-Daten/Feldumrisse zwischengespeichert. Keine neuen Spielfunktionen.
  0.6.0.0 (23.10.2026, Anmerkungen aus Hendriks Test): Art der Arbeitsbereiche als Name (Mähdrescher-Auswurf erkennbar),
  feste Fahrzeug-Kennung (hud#vid, für die bearbeitete Fläche je Fahrzeug), Abladestelle erreicht / lädt ab je Gerät
  (unit#tip), Meldungen des Spiels (hud#warn, hud#note), Wachstumsstufe im Arbeitsplaner (field#growth/#growthMax),
  Straßennetz einmal je Karte (craftConsoleRoads.xml). Nur Felder lesen und dokumentierte Getter (GDN LuaDoc v1.20).
  0.7.0.0 (23.10.2026, Anmerkung 28): Teilbreiten je Gerät (unit#sec, nur Felder von spec_variableWorkWidth), Arbeitsbereiche
  ausgeschalteter Teilbreiten weggelassen, bis zu 12 Arbeitsbereiche je Gerät (vorher 4). Geschaltet wird nur per
  Spieltaste von ControlHub aus; die Mod ruft dafür nichts auf.
  0.7.1.0 (23.10.2026, Precision Farming): Prüfbefehl ccProbeDeep findet Spezialisierungen aus Mods, deren Name selbst
  einen Punkt enthält (spec_FS25_precisionFarming.extendedSprayer), und Zahlen-Schlüssel. Sonst unverändert.
  0.7.2.0 (23.10.2026, Precision Farming): Düsen-Teilbreiten je Gerät (unit#pf, nur Felder isActive/xOffset aus
  spec_FS25_precisionFarming.extendedSprayerEffects.sprayerEffectsBySection), einmal je Gerät ins log.txt.
  0.7.3.0 (24.10.2026, Durchsicht): ccProbeWorkAreas ruft getIsWorkAreaActive/getIsTypedWorkAreaActive nicht mehr auf
  (nur Felder lesen, wie überall); bis zu 16 Arbeitsbereiche je Gerät (vorher 12, breite Spritzen mit vielen
  Teilbreiten); Arbeitsbreite aus dem Shop wird auch „unbekannt“ gemerkt (vorher je Takt neu nachgeschlagen);
  Precision-Farming-Düsen nur mit gültiger Lage (keine NaN/unendlich); „<“ und „>“ aus Meldungen des Spiels entfernt
  (ControlHub las sonst die Zeile nur bis dorthin). Karte: map#session (wie roads#session) und nach einem
  Spielstandwechsel neu geschrieben, auch wenn Höfe und Felder gleich aussehen (ControlHub nimmt sonst die alte Datei).
  0.7.4.0 (24.10.2026, Hendrik: „woher nimmst du die Fruchttypen?“): Früchte des Spiels in craftConsoleMap.xml
  (<fruit key title>, nur Felder g_fruitTypeManager.fruitTypes / FruitTypeDesc.name / .fillType.title) und je Feld der
  interne Name der Frucht (plan field#fruitKey, FruitTypeDesc.name). ControlHub vergleicht Fruchtfolge und Feld darüber,
  unabhängig von Schreibweise und Spielsprache; die Auswahl im Planer zeigt genau die Früchte der Karte.
  0.7.5.0 (24.10.2026, Hendrik: „Straßen schonender“): Das Straßennetz wird über mehrere Bilder verteilt abgetastet
  (höchstens ROADS_POINTS_PER_FRAME Punkte je Bild) statt auf einmal -- gegen ein Ruckeln 15 s nach dem Laden. Gleiche
  Datei, gleiche Aufrufe (getSplineLength/getSplinePosition).
  0.7.6.0 (24.10.2026, Hendrik: Funktionen „mit den Kategorien, wie sie auch im Spiel genutzt werden“): Aktionen des
  Spiels mit allen einfachen Feldern (z. B. Kategorie, deutscher Anzeigename) einmal je Spielstand nach
  craftConsoleInputActions.xml, auf Wunsch per Konsole „ccDumpInputActions“. Nur Felder von g_inputBinding lesen; welche
  Felder FS25 dort führt, zeigt erst die Datei aus dem Spiel. Daraus baut ControlHub die Funktionen mit den Gruppen
  und Namen des Spiels.
  0.7.7.0 (24.10.2026): In craftConsoleInputActions.xml zusätzlich je Abschnitt des Steuerungsmenüs der Text in der
  Spielsprache (<categoryText key text>, Feld g_i18n.texts, sonst g_i18n:getText). Die Suche nach Kategorie-Tabellen
  aus 0.7.6 entfällt (im Spiel nichts Brauchbares gefunden). Die Gruppen der Mods liest ControlHub selbst aus dem
  Mods-Ordner.
  0.7.8.0 (24.10.2026): Nur das Bild der Mod: unter dem Tacho „ControlHub“ statt „HUD“ (Hendrik: „das würde es etwas
  persönlicher machen“). Erzeugt mit Werkzeuge/mod_bild.py.
  0.7.9.0 (25.10.2026, Mehrspieler-Prüfung, Hendrik: „Alles soll funktionieren“): Ein Gast (getIsServer() = false)
  schaltet die Mod nie ab, auch wenn g_dedicatedServer gesetzt sein sollte; die übrigen Merkmale eines gemieteten
  Servers zählen nur noch auf dem Server selbst. hud#mv = Version der Mod (ControlHub erkennt eine ältere Mod beim
  Gastgeber), map#server = dieser PC ist Server (Einzelspiel, Gastgeber) -- damit gilt beim Gastgeber derselbe Planer
  und dieselbe Fläche wie im Einzelspiel --, plan#session wie bei Karte und Straßen. Nur Felder und die schon
  genutzten getIsServer/getIsClient, keine neuen Spielfunktionen.
]]

CraftConsoleHud = {}
CraftConsoleHud.VERSION = "0.7.9.0"          -- wie <version> in modDesc.xml (Test/spielumgebung-mock.lua prüft das)
CraftConsoleHud.writeIntervalMs = 250        -- Standard 4/s; ControlHub stellt per craftConsoleSettings.xml um (s. readSettings)
CraftConsoleHud.timer = 0
-- Eigener Ordner modSettings/FS25_CraftConsoleHUD/ (seit Phase 1, 21.10.2026). Das Spiel setzt
-- g_currentModSettingsDirectory nur WÄHREND des Ladens der Mod-Datei, deshalb hier oben merken.
CraftConsoleHud.SETTINGS_DIR = g_currentModSettingsDirectory
CraftConsoleHud.baseDirCache = nil
CraftConsoleHud.RATES_MIN, CraftConsoleHud.RATES_MAX = 2, 30   -- Schreibrunden pro Sekunde, Grenzen gegen Tippfehler
CraftConsoleHud.SAVE_RATE = 2                                   -- Sparmodus: kein Tablet verbunden
CraftConsoleHud.settingsRate = nil       -- aus craftConsoleSettings.xml (ControlHub)
CraftConsoleHud.settingsClients = nil    -- Anzahl verbundener Browser laut ControlHub (nil = unbekannt)
CraftConsoleHud.rateOverride = nil       -- per ccRate gesetzt, hat Vorrang
CraftConsoleHud.settingsTimer = 0
CraftConsoleHud.SETTINGS_READ_MS = 2000
CraftConsoleHud.filePath = nil
CraftConsoleHud.courseFilePath = nil
CraftConsoleHud.courseVersion = 0
-- 0.5.1: false statt nil -- so unterscheidet sich auch "kein Kurs" (nil, z. B. zu Fuß) vom Startwert, und die erste
-- Runde schreibt eine (ggf. leere) Kursdatei. Mit nil blieb zu Fuß die Kursdatei der vorigen Sitzung liegen, und
-- ControlHub zeigte deren alten Kurs an.
CraftConsoleHud.lastCourseRef = false
-- 0.5.2 (Durchsicht B6, 23.10.2026): Sitzungskennung je geladenem Spielstand (hud#session) -- ändert sie sich, leert
-- ControlHub Karte, Kurs und Planer der alten Sitzung. Lebenszeichen von ControlHub (settings#alive, alle 10 s neu):
-- kommt keins mehr (ControlHub beendet oder nie gestartet), geht die Mod in den Sparmodus.
CraftConsoleHud.session = nil
CraftConsoleHud.hubAlive = nil         -- letzter Wert von settings#alive
CraftConsoleHud.hubAliveAge = 0        -- ms seit der letzten Änderung
CraftConsoleHud.HUB_GONE_MS = 45000    -- so lange ohne Lebenszeichen -> ControlHub läuft nicht
CraftConsoleHud.hubGone = false
-- 0.5.2 (Durchsicht B7): Zwischenspeicher gegen doppelte Arbeit je Schreibrunde
CraftConsoleHud.round = 0              -- Schreibrunde (für comboVehicles)
CraftConsoleHud.comboCache = nil
CraftConsoleHud.widthCache = {}        -- Arbeitsbreite aus den Shop-Daten je Gerätedatei (ändert sich nie)
CraftConsoleHud.polyCache = {}         -- Feldumriss je Feld (geleert, wenn sich die Kartensignatur ändert)

local function tryNum(fn)
  local ok, v = pcall(fn)
  if ok and type(v) == "number" then return v end
  return nil
end

-- 0.5.1: Fehler der Schreibrunden einmal je Art ins log.txt (nicht in jedem Bild). Nur print + pcall, kein Spielaufruf.
CraftConsoleHud.loggedErrors = {}
local function logError(kind, err)
  if CraftConsoleHud.loggedErrors[kind] then return end
  CraftConsoleHud.loggedErrors[kind] = true
  print(("[CraftConsoleHud] Fehler bei '%s' (wird nur einmal gemeldet): %s"):format(kind, tostring(err)))
end
local function guarded(kind, fn, ...)
  local ok, err = pcall(fn, ...)
  if not ok then logError(kind, err) end
  return ok
end

-- Ganzzahl bzw. Zahl für setXMLInt/setXMLFloat (FS25 liefert z. B. den Kontostand mit Nachkommastellen)
local function int(v, def)
  v = tonumber(v)
  if v == nil or v ~= v or v == math.huge or v == -math.huge then return def or -1 end
  return math.floor(v)
end
local function flt(v, def)
  v = tonumber(v)
  if v == nil or v ~= v or v == math.huge or v == -math.huge then return def or -1 end
  return v
end

-- Ordner für alle Dateien der Mod: modSettings/FS25_CraftConsoleHUD/ (vom Spiel geliefert), sonst
-- selbst gebaut unter dem Profilordner, zuletzt wie bis 0.95 direkt im Profilordner.
-- ControlHub (telemetryReader.js) sucht in derselben Reihenfolge.
local function baseDir()
  if CraftConsoleHud.baseDirCache ~= nil then return CraftConsoleHud.baseDirCache end
  local dir = CraftConsoleHud.SETTINGS_DIR
  local root = ""
  pcall(function() root = getUserProfileAppPath() or "" end)
  if dir == nil and root ~= "" then dir = root .. "modSettings/FS25_CraftConsoleHUD/" end
  if dir ~= nil then
    local ok = pcall(function() createFolder(dir) end)                                     -- ⚠️ FS25
    if not ok then dir = nil end
  end
  CraftConsoleHud.baseDirCache = dir or root
  print("[CraftConsoleHud] Dateien -> " .. tostring(CraftConsoleHud.baseDirCache))
  return CraftConsoleHud.baseDirCache
end

-- Kraftstoff-/Verbrauchs-Fülltypen, die NICHT als "Füllstand" zählen sollen
local FUEL = { DIESEL=true, DEF=true, ADBLUE=true, AIR=true, ELECTRICCHARGE=true, METHANE=true }

local function fillTypeNameByIdx(idx)   -- interner Name (GROSS), fuer Kraftstoff-Filter
  if idx == nil then return nil end
  local nm
  pcall(function() nm = g_fillTypeManager:getFillTypeNameByIndex(idx) end)
  if type(nm) == "string" then return string.upper(nm) end
  return nil
end

local function fillTypeTitle(idx)       -- lokalisierter Anzeigename, z.B. "Weizen"
  if idx == nil then return nil end
  local t
  pcall(function() local ft = g_fillTypeManager:getFillTypeByIndex(idx); if ft ~= nil then t = ft.title end end)
  if type(t) == "string" and t ~= "" then return t end
  return nil
end

-- bestes FillUnit eines Objekts -- direkt aus spec_fillUnit.fillUnits (FS25)
-- liefert: prozent, fülltyp-titel ; allowFuel=false überspringt Diesel/DEF/Luft/...
local function scanFill(obj, allowFuel)
  local spec = obj.spec_fillUnit
  if spec == nil or type(spec.fillUnits) ~= "table" then return nil, nil end
  local bestLvl, bestPct, bestTitle, anyPct, anyTitle = -1, nil, nil, nil, nil
  for _, fu in ipairs(spec.fillUnits) do
    local cap = fu.capacity
    if type(cap) == "number" and cap > 0 then
      local nm = fillTypeNameByIdx(fu.fillType)
      local isFuel = (nm ~= nil) and (FUEL[nm] == true)
      if allowFuel or not isFuel then
        local lvl = fu.fillLevel or 0
        local pct = math.floor(lvl / cap * 100 + 0.5)
        local title = fillTypeTitle(fu.fillType) or nm
        if anyPct == nil then anyPct = pct; anyTitle = title end
        if lvl > bestLvl then bestLvl = lvl; bestPct = pct; bestTitle = title end
      end
    end
  end
  if bestLvl > 0 then return bestPct, bestTitle end
  return anyPct, anyTitle                            -- alles leer -> 0% des relevanten Tanks
end

-- alle Fahrzeuge der Kombi (Traktor + alle Anhänge/Geräte, rekursiv)
local function comboVehicles(v)
  -- 0.5.2: je Schreibrunde nur einmal ermitteln (vorher dreimal: Füllstand, Gerätenamen, Precision Farming)
  local H = CraftConsoleHud
  local c = H.comboCache
  if c ~= nil and c.round == H.round and c.v == v then return c.list end
  local list
  local ok = pcall(function() list = v:getChildVehicles() end)      -- ⚠️ FS25
  if not (ok and type(list) == "table" and #list > 0) then
    list = { v }
    local ok2, impls = pcall(function() return v:getAttachedImplements() end)
    if ok2 and type(impls) == "table" then
      for _, imp in pairs(impls) do
        if imp ~= nil and imp.object ~= nil then list[#list + 1] = imp.object end
      end
    end
  end
  H.comboCache = { round = H.round, v = v, list = list }
  return list
end

-- Namen ALLER angehängten Geräte (Front+Heck, unabhängig davon was gerade "ausgewählt" ist) für den
-- automatischen Profilwechsel in ControlHub -- Pipe-getrennt, da XML-Attribute keine Arrays kennen
-- (ControlHub-seitig wieder aufgesplittet, s. server/telemetryReader.js). comboVehicles(v) enthält v
-- selbst als erstes Element, das hier ausdrücklich übersprungen wird (nur Anbaugeräte, nicht das
-- Hauptfahrzeug -- das steht separat in d.vehicleName).
local function implementNames(v)
  local combo = comboVehicles(v)
  local names = {}
  for _, veh in ipairs(combo) do
    if veh ~= v then
      local nm = "?"
      pcall(function() nm = veh:getFullName() end)
      if type(nm) == "string" and nm ~= "" then
        names[#names + 1] = nm:gsub("[\r\n]", " ")
      end
    end
  end
  return table.concat(names, "|")
end

local function getFill(v)
  local combo = comboVehicles(v)
  local fill, ftype = nil, nil
  -- 1) zuerst Anbaugeräte/Anhänger (ohne Kraftstoff/Luft)
  for _, veh in ipairs(combo) do
    if veh ~= v then
      local f, t = scanFill(veh, false)
      if f ~= nil and (fill == nil or f > fill) then fill = f; ftype = t end
    end
  end
  -- 2) sonst das Fahrzeug selbst (z.B. selbstfahrender Häcksler-Korntank)
  if fill == nil then fill, ftype = scanFill(v, false) end
  -- KEIN Kraftstoff-Fallback mehr: Diesel/AdBlue stehen auf eigener Seite,
  -- der Luftkessel (Typ AIR) soll NIE als Füllstand erscheinen.
  -- 0.5.1: ohne Gerät/Ladung -1 (unbekannt) statt 0 -- ControlHub zeigte sonst "0 %" an.
  return fill or -1, ftype or ""
end

local function getVehicle()
  if g_localPlayer ~= nil then
    local ok, v = pcall(function() return g_localPlayer:getCurrentVehicle() end)  -- ✅ FS25
    if ok and v ~= nil then return v end
  end
  if g_currentMission ~= nil and g_currentMission.controlledVehicle ~= nil then
    return g_currentMission.controlledVehicle
  end
  return nil
end

local function getCruise(v)
  local c = -1
  pcall(function()
    local sd = v.spec_drivable                       -- ⚠️ FS25: Drivable-Spec / cruiseControl
    if sd ~= nil and sd.cruiseControl ~= nil then
      -- IMMER die eingestellte Tempomat-Geschwindigkeit (auch wenn noch nicht aktiv)
      c = math.floor((sd.cruiseControl.speed or 0) + 0.5)
    end
  end)
  return c
end

-- ausgewaehltes Geraet + Status (an/aus, gesenkt/gehoben)
local function getImplementInfo(v)
  local sel = v
  pcall(function() local s = v:getSelectedVehicle(); if s ~= nil then sel = s end end)  -- ⚠️ FS25
  local name = ""
  pcall(function() name = sel:getFullName() end)                                        -- ⚠️ FS25
  if type(name) ~= "string" then name = "" end
  name = name:gsub("[\r\n]", " ")
  local on = -1
  pcall(function() if sel.getIsTurnedOn ~= nil then on = sel:getIsTurnedOn() and 1 or 0 end end)
  local low = -1
  pcall(function() if sel.getIsLowered ~= nil then low = sel:getIsLowered() and 1 or 0 end end)
  return name, on, low
end

-- Prozent eines bestimmten Fülltyps (z.B. Diesel/AdBlue) am Fahrzeug
local function getConsumable(v, names)
  local spec = v.spec_fillUnit
  if spec == nil or type(spec.fillUnits) ~= "table" then return -1 end
  for _, fu in ipairs(spec.fillUnits) do
    local nm = fillTypeNameByIdx(fu.fillType)
    if nm ~= nil and names[nm] and type(fu.capacity) == "number" and fu.capacity > 0 then
      return math.floor((fu.fillLevel or 0) / fu.capacity * 100 + 0.5)
    end
  end
  return -1
end

local function getHours(v)   -- ⚠️ Einheit prüfen (Brücke/Spiel vergleichen)
  local h = -1
  pcall(function() local ms = v:getOperatingTime(); if type(ms) == "number" then h = math.floor(ms / 3600000) end end)
  return h
end

local function getMotor(v)   -- ⚠️ FS25 spec_motorized
  local rpm, load = -1, -1
  pcall(function()
    local sm = v.spec_motorized
    if sm ~= nil then
      local m = sm.motor
      if m ~= nil then
        if m.getLastRealMotorRpm ~= nil then rpm = math.floor((m:getLastRealMotorRpm() or 0) + 0.5)
        elseif m.getEqualizedMotorRpm ~= nil then rpm = math.floor((m:getEqualizedMotorRpm() or 0) + 0.5) end
        if m.getSmoothLoadPercentage ~= nil then load = math.floor((m:getSmoothLoadPercentage() or 0) * 100 + 0.5) end
      end
      if load < 0 and type(sm.actualLoadPercentage) == "number" then load = math.floor(sm.actualLoadPercentage * 100 + 0.5) end
    end
  end)
  return rpm, load
end

local function getWear(v)    -- ⚠️ FS25
  local dmg, dirt = -1, -1
  pcall(function() if v.getDamageAmount ~= nil then dmg = math.floor((v:getDamageAmount() or 0) * 100 + 0.5) end end)
  pcall(function() if v.getDirtAmount ~= nil then dirt = math.floor((v:getDirtAmount() or 0) * 100 + 0.5) end end)
  return dmg, dirt
end

-- Weltposition + Blickrichtung (fuer die Kartenansicht in ControlHub) -- getWorldTranslation/
-- getWorldRotation auf v.rootNode sind bereits ueber jointIsFront() (unten) im Mod bestaetigt.
local function getPositionAndHeading(v)
  local ok, x, y, z = pcall(getWorldTranslation, v.rootNode)
  if not ok then return nil, nil, nil end
  local okR, rx, ry, rz = pcall(getWorldRotation, v.rootNode)
  local heading = okR and (math.deg(ry) % 360) or nil
  -- Vorwärtsrichtung als Vektor in Weltkoordinaten (0.4.2, 22.10.2026): für die Kartendrehung in ControlHub ohne
  -- Nachlauf. Der Drehwinkel oben taugt dafür nicht (Euler-Winkel klappen je nach Neigung um). Gleicher Aufruf wie
  -- poseOf() für die Mitspieler und beim eigenen Fahrzeug (localDirectionToWorld(node, 0, 0, 1)).
  local okF, fx, _, fz = pcall(localDirectionToWorld, v.rootNode, 0, 0, 1)
  if not okF or type(fx) ~= "number" or type(fz) ~= "number" then fx, fz = 0, 0 end
  return x, z, heading, fx, fz
end

-- Kartengroesse (fuer die Umrechnung Weltkoordinate -> Kartenposition 0-1 in ControlHub) + Farmland-ID
-- an der aktuellen Position (255 = kein/kein kaufbares Farmland, per Test bestaetigt).
local function getTerrainSizeAndFarmland(x, z)
  local terrainSize = nil
  pcall(function() terrainSize = g_currentMission.terrainSize end)
  local farmlandId = -1
  if x ~= nil and z ~= nil then
    -- ⚠️ Beide Funktionsnamen probieren (s. ccProbePosition) -- welcher tatsaechlich existiert, war
    -- zwischen FS25-Versionen laut GDN-Forum uneinheitlich benannt.
    for _, fname in ipairs({ "getFarmlandIdAtWorldPosition", "getFarmlandAtWorldPosition" }) do
      if farmlandId == -1 and g_farmlandManager ~= nil and g_farmlandManager[fname] ~= nil then
        local fOk, fRes = pcall(function() return g_farmlandManager[fname](g_farmlandManager, x, z) end)
        if fOk and type(fRes) == "number" then farmlandId = fRes end
      end
    end
  end
  return terrainSize, farmlandId
end

-- Lenksystem/GPS-Steuerungshilfe (spec_aiAutomaticSteering, per ccProbeSpec bestaetigt) + Kurs-Fortschritt.
-- steeringFieldCourse bevorzugt (aktiver Kurs), lastActiveSteeringFieldCourse als Fallback, falls das
-- Lenksystem gerade aus ist -- Prioritaet noch nicht im Spiel gegengeprueft, s. Wissensbasis Abschnitt 12.
local function getSteeringInfo(v)
  local info = { enabled=false, value=0, distEnd=-1, onField=false, segIdx=-1, segLeft=false,
                 vehX=nil, vehZ=nil, segStates="" }
  pcall(function()
    local spec = v.spec_aiAutomaticSteering
    if spec == nil then return end
    info.enabled = spec.steeringEnabled == true
    info.value = spec.steeringValue or 0
    info.distEnd = spec.lastDistanceToEnd or -1
    info.onField = spec.lastIsOnField == true
    local course = spec.steeringFieldCourse or spec.lastActiveSteeringFieldCourse
    if course ~= nil then
      info.segIdx = course.currentSegmentIndex or -1
      info.segLeft = course.currentSegmentIsLeft == true
      local vp = course.vehiclePosition
      if type(vp) == "table" then info.vehX = vp[1]; info.vehZ = vp[2] end
      local states = course.segmentStates
      if type(states) == "table" then
        local bits = {}
        for i, s in ipairs(states) do
          if i > 500 then break end   -- Obergrenze gegen unerwartet grosse Kurse, s. dumpDeep() unten
          bits[i] = s and "1" or "0"
        end
        info.segStates = table.concat(bits)
      end
    end
  end)
  return info
end

-- Precision-Farming-Werte (Stickstoff/pH/Arbeitsbreite/Sprueh-Status) vom ERSTEN Geraet der Kombi mit
-- spec_workArea/spec_sprayer -- V1-Vereinfachung: nur workAreas[1], mehrere unabhaengige
-- Arbeitsbereiche pro Geraet werden bewusst noch nicht vollstaendig abgedeckt (s. Plan).
local function getPrecisionFarmingInfo(v)
  local info = { workWidth=-1, numSubSections=-1, nitrogen=-1, nitrogenTarget=-1, ph=-1, phTarget=-1,
                 isWorking=false, fillLevel=-1, usagePerMin=-1 }
  for _, veh in ipairs(comboVehicles(v)) do
    local wa = veh.spec_workArea
    if wa ~= nil and type(wa.workAreas) == "table" and wa.workAreas[1] ~= nil then
      local w = wa.workAreas[1]
      pcall(function()
        info.workWidth = w.workWidth or -1
        info.numSubSections = w.numSubSections or -1
        info.nitrogen = w.nitrogenLevel or -1
        info.nitrogenTarget = w.nitrogenTargetLevel or -1
        info.ph = w.phLevel or -1
        info.phTarget = w.phTargetLevel or -1
      end)
    end
    local sp = veh.spec_sprayer
    if sp ~= nil then
      pcall(function()
        info.isWorking = sp.isWorking == true
        local params = sp.workAreaParameters
        if params ~= nil then
          info.fillLevel = params.sprayFillLevel or -1
          info.usagePerMin = params.usagePerMin or -1
        end
      end)
    end
    if info.workWidth ~= -1 or info.isWorking then break end   -- erstes passendes Geraet reicht
  end
  return info
end

-- Wetter/Uhrzeit/Jahreszeit + Kontostand.
local function getWorldInfo()
  local info = { hour=-1, minute=-1, season=-1, day=-1, sunOn=false, money=-1 }
  pcall(function()
    local env = g_currentMission.environment
    if env ~= nil then
      info.hour = env.currentHour or -1
      info.minute = env.currentMinute or -1
      info.season = env.currentSeason or -1
      info.day = env.currentDay or -1
      info.sunOn = env.isSunOn == true
    end
  end)
  -- ⚠️ Funktionsname unverifiziert. 0.5.1: abrunden (FS25 liefert Nachkommastellen, setXMLInt braucht eine
  -- Ganzzahl); ein Minus-Kontostand bleibt erhalten, -1 heißt weiter "unbekannt".
  pcall(function()
    local m = g_currentMission:getMoney()
    if type(m) == "number" and m == m then info.money = math.floor(m) end
  end)
  return info
end

-- ===== Feldgrenze + Kurs-Segmente (eigene, selten geschriebene Datei) =====
-- rootBoundaryLine/vehiclePosition sind laut Diagnose einfache {x,z}-Arrays (Index 1/2) -- gleiche
-- Annahme hier fuer segments[i].positions[j], noch nicht einzeln im Spiel gegengeprueft
-- (s. Wissensbasis Abschnitt "Offene Punkte").
local function encodePoint(pt)
  if type(pt) ~= "table" then return "" end
  return tostring(pt[1] or 0) .. "," .. tostring(pt[2] or 0)
end

local function encodePointList(list)
  if type(list) ~= "table" then return "" end
  local parts = {}
  for _, pt in ipairs(list) do parts[#parts + 1] = encodePoint(pt) end
  return table.concat(parts, "|")
end

-- Wird NUR aufgerufen, wenn sich der Kurs seit dem letzten Tick per Referenz unterscheidet (s.
-- CraftConsoleHud:update()) -- kein 250ms-Takt, da sich diese Geometrie praktisch nie aendert.
local function writeCourseFile(course)
  if CraftConsoleHud.courseFilePath == nil then
    local base = baseDir()
    CraftConsoleHud.courseFilePath = base .. "craftConsoleCourse.xml"
  end
  local ok, xml = pcall(function() return createXMLFile("ccCourse", CraftConsoleHud.courseFilePath, "course") end)
  if not ok or xml == nil or xml == 0 then return end
  pcall(function()
    setXMLString(xml, "course#boundary", encodePointList(course.rootBoundaryLine))
    local settings = course.fieldCourseSettings or {}
    setXMLFloat(xml, "course#implementWidth", settings.implementWidth or -1)
    setXMLInt(xml, "course#workDirection", settings.workDirection or -1)
    setXMLFloat(xml, "course#rowSpacing", settings.rowSpacing or -1)
    setXMLInt(xml, "course#numHeadlands", settings.numHeadlands or -1)
    local segs = course.segments
    if type(segs) == "table" then
      local metaParts, posParts = {}, {}
      for _, seg in ipairs(segs) do
        metaParts[#metaParts + 1] = string.format("%s,%s,%s,%s",
          tostring(seg.segmentId or 0), tostring(seg.length or 0),
          seg.isHeadlandSegment and "1" or "0", tostring(seg.lineGroupIndex or 0))
        posParts[#posParts + 1] = encodePointList(seg.positions)
      end
      setXMLString(xml, "course#segMeta", table.concat(metaParts, ";"))
      setXMLString(xml, "course#segPositions", table.concat(posParts, ";"))
    end
    saveXMLFile(xml)
  end)
  pcall(function() delete(xml) end)
end

-- ===== Test-Aufnahme (ccRecordStart/ccRecordStop): um die ControlHub-Seite ohne
-- laufendes Spiel testbar zu machen -- man faehrt einmal normal im Spiel (inkl. Lenksystem
-- an/aus in der Naehe verschiedener Spurfuehrungslinien, Teilbreiten links/rechts schalten), das Ergebnis
-- ist eine JSON-Zeilen-Aufnahme aller collect()-Ticks + Kurs-Wechsel, mit der die Kartenansicht/
-- Precision-Farming-Anzeige beliebig oft OHNE laufendes FS25 durchgespielt werden kann. Bewusst KEIN
-- rohes io.open() (in der GIANTS-Lua-Sandbox nicht zuverlaessig verfuegbar, anders als die
-- XML-Dateifunktionen, die im ganzen Mod sonst genutzt werden) -- Zeilen sammeln sich im Speicher und
-- werden erst bei ccRecordStop EINMALIG per setXMLString/saveXMLFile geschrieben (gleiches API wie
-- writeFile()/writeCourseFile() oben, also bereits bekannt funktionierend).
local function jsonStr(s)
  return '"' .. tostring(s or ""):gsub('[%c"\\]', function(c)
    if c == '"' then return '\\"' end
    if c == '\\' then return '\\\\' end
    return string.format('\\u%04x', string.byte(c))
  end) .. '"'
end

local function jsonVal(v)
  local t = type(v)
  if t == "number" then return (v == v) and tostring(v) or "0" end -- (v==v) verwirft NaN
  if t == "boolean" then return v and "true" or "false" end
  if t == "string" then return jsonStr(v) end
  if t == "table" then   -- seit der Erweiterung nach 0.95: d.units (Liste von Tabellen mit fills-Liste)
    local parts = {}
    if #v > 0 or next(v) == nil then
      for _, x in ipairs(v) do parts[#parts + 1] = jsonVal(x) end
      return "[" .. table.concat(parts, ",") .. "]"
    end
    for k, x in pairs(v) do parts[#parts + 1] = jsonStr(k) .. ":" .. jsonVal(x) end
    return "{" .. table.concat(parts, ",") .. "}"
  end
  return "null"
end

-- d ist collect()s flaches Feld->Wert-Table -- 1:1 dieselben Felder, die auch ins telemetry-update
-- ans Frontend gehen (telemetryReader.js parseHudXml()), damit das Replay-Tool ohne Uebersetzung
-- direkt dieselbe Konsumenten-Seite (dashboard.js/dashboardMap.js) fuettern kann.
local function encodeTickJson(d)
  local parts = { '"type":"tick"', '"t":' .. tostring(math.floor(g_time or 0)) }   -- Spielzeit ms, fürs Replay im echten Takt
  for k, v in pairs(d) do
    parts[#parts + 1] = jsonStr(k) .. ":" .. jsonVal(v)
  end
  return "{" .. table.concat(parts, ",") .. "}"
end

local function encodePointJson(pt)
  if type(pt) ~= "table" then return "[0,0]" end
  return "[" .. tostring(pt[1] or 0) .. "," .. tostring(pt[2] or 0) .. "]"
end

local function encodePointListJson(list)
  if type(list) ~= "table" then return "[]" end
  local parts = {}
  for _, pt in ipairs(list) do parts[#parts + 1] = encodePointJson(pt) end
  return "[" .. table.concat(parts, ",") .. "]"
end

-- Gleiche Extraktion wie writeCourseFile() oben, nur als JSON statt Pipe/Semikolon-Strings (fuers
-- Replay-Tool direkt mit JSON.parse() weiterverwendbar, ohne eigenen Decoder nachzubauen).
local function encodeCourseJson(course)
  local segParts = {}
  local segs = course.segments
  if type(segs) == "table" then
    for _, seg in ipairs(segs) do
      segParts[#segParts + 1] = string.format(
        '{"segmentId":%s,"length":%s,"isHeadlandSegment":%s,"lineGroupIndex":%s,"positions":%s}',
        tostring(seg.segmentId or 0), tostring(seg.length or 0),
        seg.isHeadlandSegment and "true" or "false", tostring(seg.lineGroupIndex or 0),
        encodePointListJson(seg.positions))
    end
  end
  return string.format('{"type":"course","boundary":%s,"segments":[%s]}',
    encodePointListJson(course.rootBoundaryLine), table.concat(segParts, ","))
end

CraftConsoleHud.recording = false
CraftConsoleHud.recordBuffer = {}
CraftConsoleHud.recordFilePath = nil
CraftConsoleHud.RECORD_MAX_LINES = 20000   -- ~83 Minuten bei 250ms-Takt, gegen unbegrenztes Wachsen

local function recordLine(line)
  if not CraftConsoleHud.recording then return end
  if #CraftConsoleHud.recordBuffer >= CraftConsoleHud.RECORD_MAX_LINES then return end
  CraftConsoleHud.recordBuffer[#CraftConsoleHud.recordBuffer + 1] = line
end

function CraftConsoleHud:consoleRecordStart()
  CraftConsoleHud.recording = true
  CraftConsoleHud.recordBuffer = {}
  print("[CC] Aufnahme gestartet -- jetzt normal fahren/testen (Lenksystem an/aus, Teilbreiten links/rechts schalten), dann 'ccRecordStop' eingeben.")
  return "ccRecordStart: Aufnahme laeuft"
end
addConsoleCommand("ccRecordStart", "CraftConsole: Test-Aufnahme starten (fuer Replay ohne laufendes Spiel)", "consoleRecordStart", CraftConsoleHud)

function CraftConsoleHud:consoleRecordStop()
  CraftConsoleHud.recording = false
  local n = #CraftConsoleHud.recordBuffer
  if CraftConsoleHud.recordFilePath == nil then
    local base = baseDir()
    CraftConsoleHud.recordFilePath = base .. "craftConsoleRecording.xml"
  end
  local ok, xml = pcall(function() return createXMLFile("ccRec", CraftConsoleHud.recordFilePath, "recording") end)
  if ok and xml ~= nil and xml ~= 0 then
    pcall(function()
      -- Trennzeichen bewusst NICHT "\n": andere Felder in diesem Mod (implementNames/vehicleName)
      -- entfernen Zeilenumbrueche explizit vor setXMLString(), da sie durch die XML-Serialisierung
      -- nicht zuverlaessig erhalten bleiben -- "~~~" ist unproblematisch, da unser eigener
      -- JSON-Encoder (jsonStr()) ohnehin jedes Steuerzeichen INNERHALB eines Wertes escaped.
      setXMLString(xml, "recording#lines", table.concat(CraftConsoleHud.recordBuffer, "~~~"))
      saveXMLFile(xml)
    end)
    pcall(function() delete(xml) end)
  end
  CraftConsoleHud.recordBuffer = {}
  print(("[CC] Aufnahme gespeichert (%d Zeilen) -- Datei: %s"):format(n, tostring(CraftConsoleHud.recordFilePath)))
  return "ccRecordStop: gespeichert"
end
addConsoleCommand("ccRecordStop", "CraftConsole: Test-Aufnahme beenden und speichern", "consoleRecordStop", CraftConsoleHud)

-- ===== Rig-Aufbau: komplette Kombi als Grafik-Datensatz für das linke Display =====
-- Ergebnis-String:  "<nVorne> <nHinten> <sel> <t0> <t1> ..."   (Reihenfolge vorne->Haupt->hinten)
-- Token t = an*10 + zustand ; zustand 0=gehoben,1=gesenkt,2=n.a. ; sel=Index (255=keins)

-- an/aus nur für angetriebene Geräte (Mäher/Häcksler/Dreschwerk...); sonst gefüllt (=1)
local function rigState(obj)
  local on = 1
  pcall(function()
    if obj.spec_turnOnVehicle ~= nil and obj.getIsTurnedOn ~= nil then
      on = obj:getIsTurnedOn() and 1 or 0
    end
  end)
  local low = 2   -- n.a. (Anhänger o. ä.)
  pcall(function() if obj.getIsLowered ~= nil then low = obj:getIsLowered() and 1 or 0 end end)
  return on, low
end

-- vorne/hinten anhand der Position des Anbaupunkts relativ zur Fahrzeug-Mitte (Z-Achse)
local function jointIsFront(vehicle, jointDescIndex)
  local isFront = false
  pcall(function()
    local spec = vehicle.spec_attacherJoints
    local joint = spec.attacherJoints[jointDescIndex]
    local node = joint.jointTransform
    local root = vehicle.rootNode
    if node ~= nil and root ~= nil then
      local _, _, z = localToLocal(node, root, 0, 0, 0)
      isFront = (z > 0)          -- Vorzeichen ggf. tauschen, falls vorne/hinten vertauscht (in-game testen)
    end
  end)
  return isFront
end

local function buildRig(v)
  local front, rear = {}, {}
  local function walk(vehicle, side)
    local spec = vehicle.spec_attacherJoints
    if spec == nil or type(spec.attachedImplements) ~= "table" then return end
    for _, impl in ipairs(spec.attachedImplements) do
      local obj = impl.object
      if obj ~= nil then
        local mySide = side
        if side == "main" then mySide = jointIsFront(vehicle, impl.jointDescIndex) and "front" or "rear" end
        local on, low = rigState(obj)
        local e = { obj = obj, on = on, low = low }
        if mySide == "front" then table.insert(front, 1, e)   -- direkt am Hauptfahrzeug -> innen (rechts der Front-Kette)
        else rear[#rear + 1] = e end                          -- hinten: direkt am Haupt zuerst (innen)
        walk(obj, mySide)
      end
    end
  end
  walk(v, "main")
  while #front > 2 do table.remove(front, 1) end   -- äußerste Frontgeräte verwerfen (max 2)
  while #rear  > 3 do table.remove(rear)      end  -- äußerste Heckgeräte verwerfen (max 3)

  local selObj = nil
  pcall(function() selObj = v:getSelectedVehicle() end)
  local mainOn = rigState(v)

  local flat = {}
  for _, e in ipairs(front) do flat[#flat + 1] = e end
  flat[#flat + 1] = { obj = v, on = mainOn, low = 2 }
  for _, e in ipairs(rear) do flat[#flat + 1] = e end

  local sel = 255
  for i, e in ipairs(flat) do if selObj ~= nil and e.obj == selObj then sel = i - 1; break end end

  local toks = {}
  for _, e in ipairs(flat) do toks[#toks + 1] = tostring(e.on * 10 + e.low) end
  return string.format("%d %d %d %s", #front, #rear, sel, table.concat(toks, " "))
end

-- ===== Erweiterung nach Version 0.95 (21.10.2026): mehr Fahrzeug-, Geräte- und Umweltdaten =====
-- Felder und Getter laut GDN LuaDoc; der Code hier ist selbst geschrieben. Alles nur LESEND, keine Funktion mit geratenen
-- Argumenten. ⚠️ Trotzdem jeden Wert einmal im Spiel gegenprüfen (ccDumpMore).

-- Antrieb: Motor an, Gang, eingelegte Fahrtrichtung, Grenzen, Temperatur
local function getDrive(v)
  local r = { motorOn=false, gear="", gearDir=0, maxRpm=-1, maxSpeed=-1, motorTemp=-1 }
  local sm = v.spec_motorized
  if sm == nil then return r end
  pcall(function() r.motorOn = v:getIsMotorStarted() == true end)                         -- ⚠️ FS25
  pcall(function()
    local t = sm.motorTemperature
    if t ~= nil and type(t.value) == "number" then r.motorTemp = math.floor(t.value + 0.5) end   -- ⚠️ °C
  end)
  local m = sm.motor
  if m == nil then return r end
  pcall(function() if type(m.maxRpm) == "number" then r.maxRpm = math.floor(m.maxRpm + 0.5) end end)
  pcall(function()                                                                         -- ⚠️ m/s -> km/h
    local s = m:getMaximumForwardSpeed()
    if type(s) == "number" then r.maxSpeed = math.floor(s * 3.6 + 0.5) end
  end)
  pcall(function()
    -- Gang wie im Spiel-HUD (Gangname bei Schaltgetriebe, D/N/R bei Vario). ⚠️ Argument "true" im Spiel
    -- prüfen; ohne die Funktion den rohen Gang nehmen.
    local g
    if m.getGearToDisplay ~= nil then g = m:getGearToDisplay(true) else g = m.gear end
    if g ~= nil then r.gear = tostring(g) end
  end)
  pcall(function()                                                                         -- 1 = vor, -1 = zurück, 0 = neutral
    local d = m:getDrivingDirection()
    if type(d) == "number" then r.gearDir = d end
  end)
  return r
end

-- Tankinhalt in Litern (bzw. kWh/kg) über den Verbraucher-Tank des Fahrzeugs
local function getTank(v, ftName)
  local lvl, cap = -1, -1
  pcall(function()
    local ft = FillType[ftName]
    if ft == nil or v.getConsumerFillUnitIndex == nil then return end
    local idx = v:getConsumerFillUnitIndex(ft)                                             -- ⚠️ FS25
    if idx == nil then return end
    lvl = v:getFillUnitFillLevel(idx) or -1
    cap = v:getFillUnitCapacity(idx) or -1
  end)
  return lvl, cap
end

-- Antriebsenergie: Diesel, sonst Strom oder Methan (erster vorhandener Tank)
local function getFuel(v)
  for _, p in ipairs({ { "DIESEL", "diesel" }, { "ELECTRICCHARGE", "electric" }, { "METHANE", "methane" } }) do
    local lvl, cap = getTank(v, p[1])
    if cap > 0 then return lvl, cap, p[2] end
  end
  return -1, -1, ""
end

-- Licht: lightsTypesMask = Bitmaske der Lichttypen (Abblend/Fern/Arbeitslicht … je nach Fahrzeug),
-- turnLightState 0 aus, 1 links, 2 rechts, 3 Warnblinker
local function getLights(v)
  local r = { mask=-1, beacon=false, turn=-1, brake=false }
  local s = v.spec_lights
  if s == nil then return r end
  pcall(function() if type(s.lightsTypesMask) == "number" then r.mask = s.lightsTypesMask end end)   -- ⚠️ FS25
  pcall(function() r.beacon = s.beaconLightsActive == true end)
  pcall(function() if type(s.turnLightState) == "number" then r.turn = s.turnLightState end end)
  pcall(function() r.brake = s.brakeLightsVisibility == true end)
  return r
end

-- Handbremse: Grundspiel nur doHandbrake (an, solange niemand fährt); Feststellbremsen aus Mods dazu
local function getHandbrake(v)
  local on = false
  pcall(function()
    if v.spec_vca ~= nil and v.spec_vca.handbrake == true then on = true end                         -- VehicleControlAddon
    if v.spec_moreVehicleControls ~= nil and v.spec_moreVehicleControls.handbrake == true then on = true end
    if v.vData ~= nil and type(v.vData.is) == "table" and v.vData.is[13] == true then on = true end  -- EnhancedVehicle
    if not on and v.spec_drivable ~= nil then on = v.spec_drivable.doHandbrake == true end
  end)
  return on
end

-- Radschlupf: Mittel über alle Räder mit Bodenkontakt (0 = kein Schlupf, 1 = 100 %)
local function getSlip(v)
  local slip = -1
  pcall(function()
    if v.getWheels == nil then return end
    local sum, n = 0, 0
    for _, w in ipairs(v:getWheels()) do
      local ph = w.physics
      if ph ~= nil and ph.hasGroundContact and ph.netInfo ~= nil and type(ph.netInfo.slip) == "number" then
        sum = sum + ph.netInfo.slip
        n = n + 1
      end
    end
    if n > 0 then slip = sum / n end
  end)
  return slip
end

-- Wetter + Kalender (Periode = Spielmonat; Umrechnung in Kalendermonat macht ControlHub)
local function getWeather()
  local r = { temperature=-99, weather="", period=-1, dayInPeriod=-1, daysPerPeriod=-1 }
  pcall(function()
    local env = g_currentMission.environment
    if env == nil then return end
    if type(env.currentPeriod) == "number" then r.period = env.currentPeriod end
    if type(env.currentDayInPeriod) == "number" then r.dayInPeriod = env.currentDayInPeriod end
    if type(env.daysPerPeriod) == "number" then r.daysPerPeriod = env.daysPerPeriod end
    local w = env.weather
    if w == nil then return end
    pcall(function() local t = w:getCurrentTemperature(); if type(t) == "number" then r.temperature = t end end)  -- ⚠️ °C
    pcall(function()
      -- Name des Wettertyps (SUN, CLOUDY, RAIN …) über die globale Tabelle WeatherType zurücksuchen
      local wt = w:getCurrentWeatherType()
      if type(WeatherType) == "table" then
        for name, val in pairs(WeatherType) do
          if val == wt and type(name) == "string" then r.weather = string.lower(name) end
        end
      end
    end)
  end)
  return r
end

-- ---- Anbaugeräte einzeln (Liste statt nur des ausgewählten Geräts) ----
local IMPL_KINDS = {   -- erste passende Spezialisierung bestimmt die Art
  { "spec_combine", "harvester" }, { "spec_cutter", "header" }, { "spec_sowingMachine", "seeder" },
  { "spec_sprayer", "sprayer" }, { "spec_baler", "baler" }, { "spec_forageWagon", "forageWagon" },
  { "spec_mulcher", "mulcher" }, { "spec_mower", "mower" }, { "spec_plow", "plow" }, { "spec_cultivator", "cultivator" },
  -- 0.4.2: für den Planer-Fortschritt je Gerät (nur Prüfung, ob die Spezialisierung existiert -- kein Aufruf)
  { "spec_weeder", "weeder" }, { "spec_stonePicker", "stonePicker" }, { "spec_roller", "roller" },
  { "spec_trailer", "trailer" },
}
CraftConsoleHud.MAX_UNITS = 8
CraftConsoleHud.MAX_FILLS = 4

-- Füllstände einer Einheit (absolut), ohne Kraftstoffe/Luft und ohne vom Spiel versteckte Tanks
local function unitFills(o)
  local fills = {}
  local spec = o.spec_fillUnit
  if spec == nil or type(spec.fillUnits) ~= "table" then return fills end
  for _, fu in ipairs(spec.fillUnits) do
    if #fills >= CraftConsoleHud.MAX_FILLS then break end
    local cap = fu.capacity
    local nm = fillTypeNameByIdx(fu.fillType)
    if type(cap) == "number" and cap > 0 and fu.showOnHud ~= false and not (nm ~= nil and FUEL[nm]) then
      local title = ""
      if nm ~= nil and nm ~= "UNKNOWN" then title = fillTypeTitle(fu.fillType) or nm end
      fills[#fills + 1] = { name = title, type = nm or "", level = fu.fillLevel or 0, capacity = cap }   -- type: interner Name (0.4.2)
    end
  end
  return fills
end

-- Zustand + Fähigkeiten einer Einheit. joint = Anbaupunkt am Zugfahrzeug (für "absenkbar"), nil beim Fahrzeug selbst
local function describeUnit(o, joint)
  local u = { name="", kind="implement", lowered=nil, on=nil, unfolded=nil, folding=false,
              canFold=false, canLower=false, canTurnOn=false, pto=-1, width=-1, workMode=-1, workModes="" }
  pcall(function() u.name = (o:getFullName() or ""):gsub("[\r\n|]", " ") end)
  for _, k in ipairs(IMPL_KINDS) do
    if o[k[1]] ~= nil then u.kind = k[2]; break end
  end
  pcall(function() if joint ~= nil and o.getIsLowered ~= nil then u.lowered = o:getIsLowered() == true end end)
  pcall(function() u.canLower = joint ~= nil and joint.allowsLowering == true end)
  pcall(function()
    if o.spec_turnOnVehicle ~= nil and o.getIsTurnedOn ~= nil then
      u.canTurnOn = true
      u.on = o:getIsTurnedOn() == true
    end
  end)
  pcall(function()
    local f = o.spec_foldable
    if f ~= nil and f.hasFoldingParts == true then
      u.canFold = true
      if o.getIsUnfolded ~= nil then u.unfolded = o:getIsUnfolded() == true end
      local t = f.foldAnimTime
      u.folding = (f.foldMoveDirection or 0) ~= 0 and type(t) == "number" and t > 0 and t < 1
    end
  end)
  pcall(function() if o.getPtoRpm ~= nil then local p = o:getPtoRpm(); if type(p) == "number" then u.pto = p end end end)
  pcall(function()   -- Arbeitsbreite aus den Shop-Daten (0.5.2: je Gerätedatei nur einmal nachschlagen)
    local cfg = o.configFileName
    if cfg == nil then return end
    -- 0.7.3: false = im Shop keine Breite; auch das merken (vorher machte „cfg and false or nil“ daraus nil → je Takt neu)
    local w = CraftConsoleHud.widthCache[cfg]
    if w == nil then
      local item = g_storeManager:getItemByXMLFilename(cfg)
      w = item ~= nil and item.specs ~= nil and tonumber(item.specs.workingWidth) or false
      CraftConsoleHud.widthCache[cfg] = w
    end
    if w then u.width = w end
  end)
  pcall(function()   -- umschaltbare Arbeitsmodi (z. B. Schwad links/rechts/mitte)
    local s = o.spec_workMode
    if s ~= nil and type(s.workModes) == "table" and #s.workModes > 1 then
      local names = {}
      for i, m in ipairs(s.workModes) do names[i] = tostring(m.name or i):gsub("[|;]", "/") end
      u.workModes = table.concat(names, "|")
      u.workMode = s.state or -1
    end
  end)
  u.fills = unitFills(o)
  -- 0.7: Teilbreiten (GDN VariableWorkWidth, Anmerkung 28). Nur Felder: isActive, hasCenter, leftSide/-Max, rightSide/-Max,
  -- sections[i].isLeft/isCenter/isActive/widthAbs. Format: „aktiv;mitte;linksAn;linksMax;rechtsAn;rechtsMax;S:an:Kante,…“
  pcall(function()
    local s = o.spec_variableWorkWidth
    if s == nil or s.hasSections ~= true or type(s.sections) ~= "table" then return end
    local parts = {}
    for _, sec in ipairs(s.sections) do
      if #parts >= 16 then break end
      local side = sec.isCenter == true and "C" or (sec.isLeft == true and "L" or "R")
      parts[#parts + 1] = string.format("%s:%d:%.2f", side, sec.isActive == false and 0 or 1, tonumber(sec.widthAbs) or 0)
    end
    if #parts == 0 then return end
    u.sec = string.format("%d;%d;%d;%d;%d;%d;", s.isActive == false and 0 or 1, s.hasCenter == true and 1 or 0,
      tonumber(s.leftSide) or -1, tonumber(s.leftSideMax) or -1, tonumber(s.rightSide) or -1, tonumber(s.rightSideMax) or -1)
      .. table.concat(parts, ",")
    -- einmal je Gerät ins log.txt, zum Prüfen der Werte im Spiel (Einheit von widthAbs)
    CraftConsoleHud.tbGemeldet = CraftConsoleHud.tbGemeldet or {}
    local key = tostring(o.configFileName or u.name)
    if not CraftConsoleHud.tbGemeldet[key] then
      CraftConsoleHud.tbGemeldet[key] = true
      print("[CC] Teilbreiten " .. tostring(u.name) .. ": " .. u.sec)
    end
  end)
  -- 0.7.2: Precision Farming schaltet seine Düsen selbst, die Teilbreiten oben bleiben dabei an (Hendriks Probe vom
  -- 23.10.2026: am Feldrand standen alle Düsen der beiden äußeren linken PF-Teilbreiten auf isActive=false, state=0).
  -- Nur Felder lesen: spec_FS25_precisionFarming.extendedSprayerEffects.sprayerEffectsBySection[Teilbreite][Düse]
  -- .isActive/.xOffset. Format je PF-Teilbreite „nr:von:bis:an:anzahl,…“, von/bis = Außenkanten quer zur Gerätemitte
  -- (Meter, links +; äußerste Düse ± halbe Düsenteilung), sortiert von links nach rechts.
  pcall(function()
    local pf = o["spec_FS25_precisionFarming.extendedSprayerEffects"]
    if type(pf) ~= "table" or type(pf.sprayerEffectsBySection) ~= "table" then return end
    local gruppen, xs = {}, {}
    for nr, effekte in pairs(pf.sprayerEffectsBySection) do
      if type(nr) == "number" and type(effekte) == "table" and #gruppen < 24 then
        local g = { nr = nr, max = -math.huge, min = math.huge, an = 0, n = 0 }
        for _, e in pairs(effekte) do
          -- 0.7.3: nur gültige Lagen (NaN ist sich selbst ungleich; mehr als 100 m quer gibt es nicht)
          if type(e) == "table" and type(e.xOffset) == "number" and e.xOffset == e.xOffset and math.abs(e.xOffset) < 100 and g.n < 64 then
            g.n = g.n + 1
            if e.isActive == true then g.an = g.an + 1 end
            if e.xOffset > g.max then g.max = e.xOffset end
            if e.xOffset < g.min then g.min = e.xOffset end
            xs[#xs + 1] = e.xOffset
          end
        end
        if g.n > 0 then gruppen[#gruppen + 1] = g end
      end
    end
    if #gruppen == 0 then return end
    table.sort(xs)
    local teilung = nil
    for i = 2, #xs do
      local dx = xs[i] - xs[i - 1]
      if dx > 0.02 and (teilung == nil or dx < teilung) then teilung = dx end
    end
    local halb = (teilung or 0.5) / 2
    table.sort(gruppen, function(a, b) return a.max > b.max end)
    local parts = {}
    for _, g in ipairs(gruppen) do
      parts[#parts + 1] = string.format("%d:%.2f:%.2f:%d:%d", g.nr, g.max + halb, g.min - halb, g.an, g.n)
    end
    u.pf = table.concat(parts, ",")
    CraftConsoleHud.pfGemeldet = CraftConsoleHud.pfGemeldet or {}
    local key = tostring(o.configFileName or u.name)
    if not CraftConsoleHud.pfGemeldet[key] then
      CraftConsoleHud.pfGemeldet[key] = true
      print("[CC] Precision-Farming-Düsen " .. tostring(u.name) .. ": " .. u.pf)
    end
  end)
  -- 0.6: Abladestelle erreicht (1) bzw. lädt gerade ab (2). Nur Felder (GDN Dischargeable/Trailer v1.20): Ziel unter dem
  -- Abladepunkt = currentDischargeNode.dischargeObject, Zustand = currentDischargeState, Anhänger = spec_trailer.tipState
  pcall(function()
    local sd = o.spec_dischargeable
    if sd ~= nil then
      local st = sd.currentDischargeState
      if st ~= nil and Dischargeable ~= nil and Dischargeable.DISCHARGE_STATE_OFF ~= nil and st ~= Dischargeable.DISCHARGE_STATE_OFF then u.tip = 2
      elseif sd.currentDischargeNode ~= nil and sd.currentDischargeNode.dischargeObject ~= nil then u.tip = 1 end
    end
    local tr = o.spec_trailer
    if tr ~= nil and tr.tipState ~= nil and Trailer ~= nil and Trailer.TIPSTATE_CLOSED ~= nil and tr.tipState ~= Trailer.TIPSTATE_CLOSED then u.tip = 2 end
  end)
  return u
end

-- ===== Mod 0.5 (22.10.2026, GPS-Menü Paket I): Anbauart, Lage und Arbeitsbereiche je Gerät =====
-- Nur Aufrufe, die ccProbeAttach im Spiel schon ausgeführt hat (getWorldTranslation auf rootNode und
-- Arbeitsbereich-Knoten, localDirectionToWorld auf rootNode, Konstanten-Tabelle AttacherJoints).
-- Bezug: Fahrzeug-Nullpunkt (rootNode); "längs" + = vor dem Fahrzeug, "quer" + = links (im Spiel geprüft).
CraftConsoleHud.MAX_AREAS = 16   -- 0.7: Geräte mit Teilbreiten haben oft je Teilbreite einen Bereich (vorher 4; 0.7.3: 16 statt 12)

local function poseRel(x, z, P)
  local dx, dz = x - P.x, z - P.z
  return dx * P.fx + dz * P.fz, dx * P.fz - dz * P.fx
end

-- Kupplungsart → "mounted" (Dreipunkt, Frontlader …) oder "trailed" (Anhängekupplung, trailer/trailerLow …)
local function attachKind(jt)
  local name = nil
  pcall(function()
    if type(AttacherJoints) ~= "table" or jt == nil then return end
    if type(AttacherJoints.jointTypeNameToInt) == "table" then
      for n, i in pairs(AttacherJoints.jointTypeNameToInt) do if i == jt then name = tostring(n) end end
    end
  end)
  if name == nil then return "" end
  if name:lower():find("trailer", 1, true) then return "trailed" end
  return "mounted"
end

-- Lage des Geräts zum Fahrzeug (längs/quer/Winkel) und seine Arbeitsbereiche als
-- "Art:Sl,Sq,Wl,Wq,Hl,Hq|…" (Knoten start/width/height; die vierte Ecke ist W+H-S)
local function unitGeometry(o, u, P)
  if P == nil then return end
  pcall(function()
    local ox, _, oz = getWorldTranslation(o.rootNode)
    if type(ox) ~= "number" then return end
    u.pa, u.pc = poseRel(ox, oz, P)
    local gx, _, gz = localDirectionToWorld(o.rootNode, 0, 0, 1)
    if type(gx) == "number" and type(gz) == "number" then
      local atan2 = math.atan2 or math.atan   -- FS25 = Lua 5.1, Testumgebung Lua 5.4+
      u.ang = math.deg(atan2(P.fx * gz - P.fz * gx, P.fx * gx + P.fz * gz))
    end
  end)
  pcall(function()
    local ws = o.spec_workArea
    if ws == nil or type(ws.workAreas) ~= "table" then return end
    local out = {}
    local vww = o.spec_variableWorkWidth
    for _, wa in ipairs(ws.workAreas) do
      if #out >= CraftConsoleHud.MAX_AREAS then break end
      -- 0.7: Arbeitsbereich einer ausgeschalteten Teilbreite weglassen (GDN VariableWorkWidth: workArea.sectionIndex →
      -- spec.sections[i].isActive; nur Felder lesen). So ist der Balken immer der aktive Teil.
      local aus = false
      if vww ~= nil and wa.sectionIndex ~= nil and type(vww.sections) == "table" then
        local sec = vww.sections[wa.sectionIndex]
        if sec ~= nil and sec.isActive == false then aus = true end
      end
      local pts = {}
      if aus then pts = nil end
      for _, key in ipairs(pts ~= nil and { "start", "width", "height" } or {}) do
        if type(wa[key]) == "number" then
          local nx, _, nz = getWorldTranslation(wa[key])
          if type(nx) == "number" then
            local a, c = poseRel(nx, nz, P)
            pts[#pts + 1] = string.format("%.2f,%.2f", a, c)
          end
        end
      end
      if pts ~= nil and #pts == 3 then
        -- 0.6: Name der Art (CUTTER, COMBINECHOPPER, COMBINESWATH …) statt der Nummer -- die vergibt das Spiel erst beim
        -- Laden. Nur Feld lesen: g_workAreaTypeManager.workAreaTypes[i].name (WorkAreaTypeManager, GDN class=900)
        local tn = nil
        pcall(function() local t = g_workAreaTypeManager.workAreaTypes[wa.type]; if t ~= nil and type(t.name) == "string" then tn = t.name end end)
        out[#out + 1] = tostring(tn or tonumber(wa.type) or 0):gsub("[:|,]", "_") .. ":" .. table.concat(pts, ",")
      end
    end
    if #out > 0 then u.areas = table.concat(out, "|") end
  end)
end

-- Alle Einheiten der Kombi: Fahrzeug selbst (nur wenn es eigene Ladung/Funktionen hat, z. B. Korntank),
-- dann jedes Anbaugerät mit Seite (front/rear, wie buildRig) und Tiefe (1 = direkt am Fahrzeug)
local function collectUnits(v)
  local units = {}
  local selObj = nil
  pcall(function() selObj = v:getSelectedVehicle() end)

  -- Fahrzeuglage für unitGeometry (0.5)
  local P = nil
  local vx, vz, _, fx, fz = getPositionAndHeading(v)
  if vx ~= nil and type(fx) == "number" then
    local fl = math.sqrt(fx * fx + fz * fz)
    if fl > 0 then P = { x = vx, z = vz, fx = fx / fl, fz = fz / fl } end
  end

  local own = describeUnit(v, nil)
  unitGeometry(v, own, P)
  own.pa, own.pc, own.ang = nil, nil, nil   -- das Fahrzeug selbst ist der Bezugspunkt
  if #own.fills > 0 or own.canTurnOn or own.canFold or own.areas ~= nil then
    own.side = "self"; own.depth = 0; own.selected = (selObj == v)
    units[#units + 1] = own
  end

  local function walk(vehicle, side, depth)
    local spec = vehicle.spec_attacherJoints
    if spec == nil or type(spec.attachedImplements) ~= "table" or depth > 4 then return end
    for _, impl in ipairs(spec.attachedImplements) do
      if #units >= CraftConsoleHud.MAX_UNITS then return end
      local obj = impl.object
      if obj ~= nil then
        local mySide = side
        if side == "main" then mySide = jointIsFront(vehicle, impl.jointDescIndex) and "front" or "rear" end
        local joint = nil
        pcall(function() joint = spec.attacherJoints[impl.jointDescIndex] end)
        local u = describeUnit(obj, joint)
        u.side = mySide; u.depth = depth; u.selected = (selObj == obj)
        if joint ~= nil then u.attach = attachKind(joint.jointType) end
        pcall(function()   -- Anbaupunkt am Zugfahrzeug (für Deichsel und Abstand)
          local jx, _, jz = getWorldTranslation(joint.jointTransform)
          if type(jx) == "number" and P ~= nil then u.ja, u.jc = poseRel(jx, jz, P) end
        end)
        unitGeometry(obj, u, P)
        units[#units + 1] = u
        walk(obj, mySide, depth + 1)
      end
    end
  end
  walk(v, "main", 1)
  return units
end

-- 0.6: Meldungen des Spiels nur lesen (Felder der Anzeige, nichts aufrufen): blinkende Warnung (hud.warningDisplay.warnings)
-- und die letzte Seitenmeldung (hud.sideNotifications.notificationQueue). Texte sind schon übersetzt.
local function getMessages()
  local warn, note = "", ""
  pcall(function()
    local hud = g_currentMission ~= nil and g_currentMission.hud or nil
    local wd = hud ~= nil and hud.warningDisplay or nil
    if wd ~= nil and type(wd.warnings) == "table" then
      for _, e in pairs(wd.warnings) do
        if type(e) == "table" and type(e.text) == "string" and e.text ~= "" then warn = e.text; break end
      end
    end
    local sn = hud ~= nil and hud.sideNotifications or nil
    if sn ~= nil and type(sn.notificationQueue) == "table" then
      local last = sn.notificationQueue[#sn.notificationQueue]
      if type(last) == "table" and type(last.text) == "string" then note = last.text end
    end
  end)
  -- 0.7.3: auch < und > weg -- ControlHub liest <hud …> bis zum ersten „>“ (telemetryReader.js), eine Meldung mit „>“
  -- schnitt sonst alle Werte dahinter ab
  return (warn:gsub("[\r\n|<>]", " ")), (note:gsub("[\r\n|<>]", " "))
end

local function collect()
  local v = getVehicle()
  local d = { speed=0, dir="N", fill=-1, ftype="", cruise=-1, diesel=-1, adblue=-1,
              hours=-1, rpm=-1, load=-1, damage=-1, dirt=-1, name="", on=-1, low=-1, rig="", inVehicle=false,
              vehicleName="", implementNames="",
              posX=0, posZ=0, heading=-1, fwdX=0, fwdZ=0, terrainSize=-1, farmlandId=-1,
              steerOn=false, steerVal=0, steerDistEnd=-1, steerOnField=false,
              courseSegIdx=-1, courseSegLeft=false, courseVehX=0, courseVehZ=0, courseSegStates="", courseVer=0,
              pfWorkWidth=-1, pfNumSubSections=-1, pfNitrogen=-1, pfNitrogenTarget=-1, pfPh=-1, pfPhTarget=-1,
              pfIsWorking=false, pfFillLevel=-1, pfUsagePerMin=-1,
              envHour=-1, envMinute=-1, envSeason=-1, envDay=-1, envSunOn=false, money=-1,
              -- Erweiterung nach 0.95
              motorOn=false, gear="", gearDir=0, maxRpm=-1, maxSpeed=-1, motorTemp=-1,
              fuelLevel=-1, fuelCapacity=-1, fuelType="", defLevel=-1, defCapacity=-1,
              lightsMask=-1, beacon=false, turnLight=-1, brakeLight=false, handbrake=false,
              aiActive=false, cruiseState=-1, slip=-1, workWidth=-1, brand="",
              temperature=-99, weather="", period=-1, dayInPeriod=-1, daysPerPeriod=-1,
              vid="", warn="", note="",
              units={} }
  d.warn, d.note = getMessages()
  -- Wetter/Kalender auch zu Fuß
  local wx = getWeather()
  d.temperature = wx.temperature
  d.weather = wx.weather
  d.period = wx.period
  d.dayInPeriod = wx.dayInPeriod
  d.daysPerPeriod = wx.daysPerPeriod
  -- Uhrzeit, Jahreszeit, Tageslicht und Kontostand ebenfalls zu Fuß (bis 0.5.0 erst nach dem Rücksprung unten,
  -- dann kam zu Fuß überall -1 bzw. "Nacht")
  local world = getWorldInfo()
  d.envHour = world.hour
  d.envMinute = world.minute
  d.envSeason = world.season
  d.envDay = world.day
  d.envSunOn = world.sunOn
  d.money = world.money
  if v == nil then return d end
  d.inVehicle = true
  d.speed = math.floor((tryNum(function() return v:getLastSpeed() end) or 0) + 0.5)
  local md = nil
  if type(v.movingDirection) == "number" then md = v.movingDirection end
  if md == nil then md = tryNum(function() return v:getDrivingDirection() end) end
  if d.speed >= 1 then d.dir = (md ~= nil and md < 0) and "R" or "F" end
  d.fill, d.ftype = getFill(v)
  d.cruise = getCruise(v)
  d.diesel = getConsumable(v, {DIESEL=true})
  d.adblue = getConsumable(v, {DEF=true, ADBLUE=true})
  d.hours = getHours(v)
  d.rpm, d.load = getMotor(v)
  d.damage, d.dirt = getWear(v)
  d.name, d.on, d.low = getImplementInfo(v)
  local okRig, rig = pcall(buildRig, v)
  d.rig = (okRig and type(rig) == "string") and rig or ""
  -- Für ControlHubs automatischen Profilwechsel: Hauptfahrzeug-Name IMMER (unabhängig von der
  -- "Auswahl", anders als d.name oben) + Liste aller angehängten Geräte.
  local vn = "?"
  pcall(function() vn = v:getFullName() end)
  d.vehicleName = (type(vn) == "string") and vn:gsub("[\r\n]", " ") or ""
  -- 0.6: feste Kennung des Fahrzeugs (Feld vehicle.uniqueId, im Spielstand gespeichert; GDN Vehicle l.406/752)
  pcall(function() if type(v.uniqueId) == "string" then d.vid = v.uniqueId end end)
  local okImp, impNames = pcall(implementNames, v)
  d.implementNames = (okImp and type(impNames) == "string") and impNames or ""

  local px, pz, heading, fx, fz = getPositionAndHeading(v)
  d.posX = px or 0
  d.posZ = pz or 0
  d.heading = heading or -1
  d.fwdX = fx or 0
  d.fwdZ = fz or 0
  local terrainSize, farmlandId = getTerrainSizeAndFarmland(px, pz)
  d.terrainSize = terrainSize or -1
  d.farmlandId = farmlandId or -1

  local steer = getSteeringInfo(v)
  d.steerOn = steer.enabled
  d.steerVal = steer.value
  d.steerDistEnd = steer.distEnd
  d.steerOnField = steer.onField
  d.courseSegIdx = steer.segIdx
  d.courseSegLeft = steer.segLeft
  d.courseVehX = steer.vehX or 0
  d.courseVehZ = steer.vehZ or 0
  d.courseSegStates = steer.segStates
  d.courseVer = CraftConsoleHud.courseVersion

  local pf = getPrecisionFarmingInfo(v)
  d.pfWorkWidth = pf.workWidth
  d.pfNumSubSections = pf.numSubSections
  d.pfNitrogen = pf.nitrogen
  d.pfNitrogenTarget = pf.nitrogenTarget
  d.pfPh = pf.ph
  d.pfPhTarget = pf.phTarget
  d.pfIsWorking = pf.isWorking
  d.pfFillLevel = pf.fillLevel
  d.pfUsagePerMin = pf.usagePerMin

  -- Erweiterung nach 0.95
  local drv = getDrive(v)
  d.motorOn = drv.motorOn
  d.gear = drv.gear
  d.gearDir = drv.gearDir
  d.maxRpm = drv.maxRpm
  d.maxSpeed = drv.maxSpeed
  d.motorTemp = drv.motorTemp
  d.fuelLevel, d.fuelCapacity, d.fuelType = getFuel(v)
  d.defLevel, d.defCapacity = getTank(v, "DEF")
  local li = getLights(v)
  d.lightsMask = li.mask
  d.beacon = li.beacon
  d.turnLight = li.turn
  d.brakeLight = li.brake
  d.handbrake = getHandbrake(v)
  pcall(function() d.aiActive = v:getIsAIActive() == true end)                             -- ⚠️ FS25
  pcall(function() local s = v:getCruiseControlState(); if type(s) == "number" then d.cruiseState = s end end)  -- 0 aus, 1 an, 2 voll
  d.slip = getSlip(v)
  pcall(function()   -- Arbeitsbreite wie sie die Spurführung des Spiels nimmt (breitestes Gerät)
    if v.getAttacherToolWorkingWidth ~= nil then
      local w = v:getAttacherToolWorkingWidth()
      if type(w) == "number" and w > 0 then d.workWidth = w end
    end
  end)
  pcall(function() if v.brand ~= nil and type(v.brand.name) == "string" then d.brand = v.brand.name end end)
  local okU, units = pcall(collectUnits, v)
  d.units = (okU and type(units) == "table") and units or {}

  return d
end

local function writeFile(d)
  if CraftConsoleHud.filePath == nil then
    local base = baseDir()
    CraftConsoleHud.filePath = base .. "craftConsoleHud.xml"
  end
  local ok, xml = pcall(function() return createXMLFile("ccHud", CraftConsoleHud.filePath, "hud") end)
  if not ok or xml == nil or xml == 0 then return end
  -- 0.5.1: mehrere Gruppen mit eigenem pcall (bis 0.5.0 ein einziger -- ein falscher Wert, z. B. der Kontostand mit
  -- Nachkommastellen, verhinderte das Speichern der ganzen Datei). Fehler je Gruppe einmal ins log.txt.
  -- Lebenszeichen zuerst: seq zählt jede Schreibrunde hoch, ControlHub erkennt daran, ob die Mod noch läuft.
  guarded("HUD-Datei: Lebenszeichen", function()
    CraftConsoleHud.seq = (CraftConsoleHud.seq or 0) + 1
    setXMLInt(xml, "hud#seq", CraftConsoleHud.seq)
    setXMLInt(xml, "hud#format", 3)   -- Dateiformat: 1 = bis 0.95, 2 = mit <unit>, 3 = Mod 0.5 (Lage/Arbeitsbereiche je <unit>)
    setXMLString(xml, "hud#session", tostring(CraftConsoleHud.session or ""))   -- 0.5.2, s. oben
    setXMLString(xml, "hud#mv", CraftConsoleHud.VERSION)                         -- 0.7.9: Version der Mod
  end)
  guarded("HUD-Datei: Fahrzeug", function()
    setXMLInt(xml, "hud#speed", int(d.speed, 0))
    setXMLString(xml, "hud#dir", tostring(d.dir or "N"))
    setXMLInt(xml, "hud#fill", int(d.fill))
    setXMLString(xml, "hud#filltype", tostring(d.ftype or ""))
    setXMLInt(xml, "hud#cruise", int(d.cruise))
    setXMLInt(xml, "hud#diesel", int(d.diesel))
    setXMLInt(xml, "hud#adblue", int(d.adblue))
    setXMLInt(xml, "hud#hours", int(d.hours))
    setXMLInt(xml, "hud#rpm", int(d.rpm))
    setXMLInt(xml, "hud#load", int(d.load))
    setXMLInt(xml, "hud#damage", int(d.damage))
    setXMLInt(xml, "hud#dirt", int(d.dirt))
    setXMLString(xml, "hud#imp", tostring(d.name or ""))
    setXMLInt(xml, "hud#impOn", int(d.on))
    setXMLInt(xml, "hud#impLow", int(d.low))
    setXMLString(xml, "hud#rig", tostring(d.rig or ""))
    setXMLBool(xml, "hud#inVehicle", d.inVehicle == true)
    setXMLString(xml, "hud#vehicleName", tostring(d.vehicleName or ""))
    setXMLString(xml, "hud#implementNames", tostring(d.implementNames or ""))
    setXMLString(xml, "hud#vid", tostring(d.vid or ""))
  end)
  guarded("HUD-Datei: Meldungen", function()
    setXMLString(xml, "hud#warn", tostring(d.warn or ""))
    setXMLString(xml, "hud#note", tostring(d.note or ""))
  end)
  guarded("HUD-Datei: Position und Spurführung", function()
    setXMLFloat(xml, "hud#posX", flt(d.posX, 0))
    setXMLFloat(xml, "hud#posZ", flt(d.posZ, 0))
    setXMLFloat(xml, "hud#heading", flt(d.heading))
    setXMLFloat(xml, "hud#fwdX", flt(d.fwdX, 0))
    setXMLFloat(xml, "hud#fwdZ", flt(d.fwdZ, 0))
    setXMLFloat(xml, "hud#terrainSize", flt(d.terrainSize))
    setXMLInt(xml, "hud#farmlandId", int(d.farmlandId))
    setXMLBool(xml, "hud#steerOn", d.steerOn == true)
    setXMLFloat(xml, "hud#steerVal", flt(d.steerVal, 0))
    setXMLFloat(xml, "hud#steerDistEnd", flt(d.steerDistEnd))
    setXMLBool(xml, "hud#steerOnField", d.steerOnField == true)
    setXMLInt(xml, "hud#courseSegIdx", int(d.courseSegIdx))
    setXMLBool(xml, "hud#courseSegLeft", d.courseSegLeft == true)
    setXMLFloat(xml, "hud#courseVehX", flt(d.courseVehX, 0))
    setXMLFloat(xml, "hud#courseVehZ", flt(d.courseVehZ, 0))
    setXMLString(xml, "hud#courseSegStates", tostring(d.courseSegStates or ""))
    setXMLInt(xml, "hud#courseVer", int(d.courseVer, 0))
  end)
  guarded("HUD-Datei: Precision Farming", function()
    setXMLFloat(xml, "hud#pfWorkWidth", flt(d.pfWorkWidth))
    setXMLInt(xml, "hud#pfNumSubSections", int(d.pfNumSubSections))
    setXMLFloat(xml, "hud#pfNitrogen", flt(d.pfNitrogen))
    setXMLFloat(xml, "hud#pfNitrogenTarget", flt(d.pfNitrogenTarget))
    setXMLFloat(xml, "hud#pfPh", flt(d.pfPh))
    setXMLFloat(xml, "hud#pfPhTarget", flt(d.pfPhTarget))
    setXMLBool(xml, "hud#pfIsWorking", d.pfIsWorking == true)
    setXMLFloat(xml, "hud#pfFillLevel", flt(d.pfFillLevel))
    setXMLFloat(xml, "hud#pfUsagePerMin", flt(d.pfUsagePerMin))
  end)
  guarded("HUD-Datei: Zeit und Konto", function()
    setXMLInt(xml, "hud#envHour", int(d.envHour))
    setXMLInt(xml, "hud#envMinute", int(d.envMinute))
    setXMLInt(xml, "hud#envSeason", int(d.envSeason))
    setXMLInt(xml, "hud#envDay", int(d.envDay))
    setXMLBool(xml, "hud#envSunOn", d.envSunOn == true)
    setXMLInt(xml, "hud#money", int(d.money))
  end)
  guarded("HUD-Datei: Antrieb und Licht", function()   -- Erweiterung nach 0.95
    setXMLBool(xml, "hud#motorOn", d.motorOn == true)
    setXMLString(xml, "hud#gear", tostring(d.gear or ""))
    setXMLInt(xml, "hud#gearDir", int(d.gearDir, 0))
    setXMLInt(xml, "hud#maxRpm", int(d.maxRpm))
    setXMLInt(xml, "hud#maxSpeed", int(d.maxSpeed))
    setXMLInt(xml, "hud#motorTemp", int(d.motorTemp))
    setXMLFloat(xml, "hud#fuelLevel", flt(d.fuelLevel))
    setXMLFloat(xml, "hud#fuelCapacity", flt(d.fuelCapacity))
    setXMLString(xml, "hud#fuelType", tostring(d.fuelType or ""))
    setXMLFloat(xml, "hud#defLevel", flt(d.defLevel))
    setXMLFloat(xml, "hud#defCapacity", flt(d.defCapacity))
    setXMLInt(xml, "hud#lightsMask", int(d.lightsMask))
    setXMLBool(xml, "hud#beacon", d.beacon == true)
    setXMLInt(xml, "hud#turnLight", int(d.turnLight))
    setXMLBool(xml, "hud#brakeLight", d.brakeLight == true)
    setXMLBool(xml, "hud#handbrake", d.handbrake == true)
    setXMLBool(xml, "hud#aiActive", d.aiActive == true)
    setXMLInt(xml, "hud#cruiseState", int(d.cruiseState))
    setXMLFloat(xml, "hud#slip", flt(d.slip))
    setXMLFloat(xml, "hud#workWidth", flt(d.workWidth))
    setXMLString(xml, "hud#brand", tostring(d.brand or ""))
  end)
  guarded("HUD-Datei: Wetter", function()
    setXMLFloat(xml, "hud#temperature", flt(d.temperature, -99))
    setXMLString(xml, "hud#weather", tostring(d.weather or ""))
    setXMLInt(xml, "hud#period", int(d.period))
    setXMLInt(xml, "hud#dayInPeriod", int(d.dayInPeriod))
    setXMLInt(xml, "hud#daysPerPeriod", int(d.daysPerPeriod))
  end)
  -- Einheiten der Kombi als <unit>-Unterelemente (mit <fill>-Unterelementen). Nicht zutreffende
  -- Zustände (z. B. "gesenkt" bei einem Anhänger) werden weggelassen statt false geschrieben.
  -- Eigener pcall je Gerät: ein Fehler bei einem Gerät darf weder die Hauptwerte noch die anderen Geräte verhindern.
  for i, u in ipairs(d.units or {}) do
    guarded("HUD-Datei: Gerät", function()
      local p = string.format("hud.unit(%d)", i - 1)
      setXMLString(xml, p .. "#name", tostring(u.name or ""))
      setXMLString(xml, p .. "#kind", tostring(u.kind or ""))
      setXMLString(xml, p .. "#side", tostring(u.side or ""))
      setXMLInt(xml, p .. "#depth", int(u.depth, 0))
      setXMLBool(xml, p .. "#selected", u.selected == true)
      if u.lowered ~= nil then setXMLBool(xml, p .. "#lowered", u.lowered == true) end
      if u.on ~= nil then setXMLBool(xml, p .. "#on", u.on == true) end
      if u.unfolded ~= nil then setXMLBool(xml, p .. "#unfolded", u.unfolded == true) end
      setXMLBool(xml, p .. "#folding", u.folding == true)
      setXMLBool(xml, p .. "#canFold", u.canFold == true)
      setXMLBool(xml, p .. "#canLower", u.canLower == true)
      setXMLBool(xml, p .. "#canTurnOn", u.canTurnOn == true)
      if flt(u.pto) > 0 then setXMLInt(xml, p .. "#pto", math.floor(flt(u.pto) + 0.5)) end
      if flt(u.width) > 0 then setXMLFloat(xml, p .. "#width", flt(u.width)) end
      if u.workModes ~= nil and u.workModes ~= "" then
        setXMLString(xml, p .. "#workModes", tostring(u.workModes))
        setXMLInt(xml, p .. "#workMode", int(u.workMode))
      end
      -- 0.5: Anbauart, Lage zum Fahrzeug, Anbaupunkt, Arbeitsbereiche (s. unitGeometry)
      if u.attach ~= nil and u.attach ~= "" then setXMLString(xml, p .. "#attach", tostring(u.attach)) end
      if u.pa ~= nil then setXMLFloat(xml, p .. "#pa", flt(u.pa, 0)); setXMLFloat(xml, p .. "#pc", flt(u.pc, 0)) end
      if u.ang ~= nil then setXMLFloat(xml, p .. "#ang", flt(u.ang, 0)) end
      if u.ja ~= nil then setXMLFloat(xml, p .. "#ja", flt(u.ja, 0)); setXMLFloat(xml, p .. "#jc", flt(u.jc, 0)) end
      if u.areas ~= nil then setXMLString(xml, p .. "#areas", tostring(u.areas)) end
      if u.tip ~= nil then setXMLInt(xml, p .. "#tip", u.tip) end
      if u.sec ~= nil then setXMLString(xml, p .. "#sec", tostring(u.sec)) end   -- 0.7: Teilbreiten
      if u.pf ~= nil then setXMLString(xml, p .. "#pf", tostring(u.pf)) end      -- 0.7.2: Precision-Farming-Düsen
      for j, f in ipairs(u.fills or {}) do
        local fp = string.format("%s.fill(%d)", p, j - 1)
        setXMLString(xml, fp .. "#name", tostring(f.name or ""))
        setXMLString(xml, fp .. "#type", tostring(f.type or ""))
        setXMLFloat(xml, fp .. "#level", flt(f.level, 0))
        setXMLFloat(xml, fp .. "#capacity", flt(f.capacity, 0))
      end
    end)
  end
  guarded("HUD-Datei: Speichern", function() saveXMLFile(xml) end)
  pcall(function() delete(xml) end)
end

-- ===== Karte: Felder + Höfe und andere Fahrzeuge (Paket D, 21.10.2026) =====
-- craftConsoleMap.xml   : Kartenname/-größe, Höfe (Name, Farbe), Felder (Nummer, Besitzer, Fläche, Umriss).
--                         Alle 10 s Signatur aus Höfen + Feldbesitzern prüfen, nur bei Änderung schreiben.
-- craftConsoleWorld.xml : Mitspieler (zu Fuß oder im Fahrzeug) und Helfer, 2×/s (Sparmodus 0,5×/s).
-- Felder und Getter laut GDN LuaDoc; Code selbst geschrieben, alles nur lesend und in pcall. ⚠️ Im Spiel prüfen (ccDumpMap).
CraftConsoleHud.MAP_CHECK_MS = 5000   -- 0.4.1: 10 -> 5 s (gekauftes Feld schneller auf der Karte)
CraftConsoleHud.WORLD_MS = 500
CraftConsoleHud.WORLD_SAVE_MS = 2000
CraftConsoleHud.mapTimer = CraftConsoleHud.MAP_CHECK_MS - 3000   -- erste Karte 3 s nach Spielstart
CraftConsoleHud.worldTimer = 0
CraftConsoleHud.mapSig = nil
CraftConsoleHud.mapRev = 0
CraftConsoleHud.worldRev = 0

local function farmColorHex(farm)
  local hex = ""
  pcall(function()
    local c = farm:getColor()                                                              -- ⚠️ FS25 {r,g,b} 0..1
    if type(c) == "table" and c[1] ~= nil then
      hex = string.format("#%02x%02x%02x", math.floor(c[1] * 255 + 0.5), math.floor(c[2] * 255 + 0.5), math.floor(c[3] * 255 + 0.5))
    end
  end)
  return hex
end

local function allFarms()
  local list = {}
  pcall(function()
    for _, farm in pairs(g_farmManager:getFarms()) do
      if farm.farmId ~= nil and farm.farmId > 0 then list[#list + 1] = farm end
    end
  end)
  table.sort(list, function(a, b) return a.farmId < b.farmId end)
  return list
end

local function allFields()
  local f = nil
  pcall(function() f = g_fieldManager.getFields ~= nil and g_fieldManager:getFields() or g_fieldManager.fields end)
  local list = {}
  if type(f) == "table" then for _, field in pairs(f) do list[#list + 1] = field end end
  return list
end

local function fieldIdOf(field, i)
  local id = nil
  pcall(function() id = field:getId() end)
  return tonumber(id or field.fieldId) or i
end

local function fieldOwnerOf(field)
  local owner = 0
  pcall(function()
    local fl = field.getFarmland ~= nil and field:getFarmland() or field.farmland
    if fl ~= nil then owner = g_farmlandManager:getFarmlandOwner(fl.id) or 0 end
  end)
  return owner
end

-- Umriss als "x,z|x,z|..." (gleiche Kodierung wie craftConsoleCourse.xml): Eckpunkte des Felds
-- (field.polygonPoints, Nodes), sonst Polygon der Dichtekarte; leer, wenn beides fehlt
local function fieldPoints(field)
  local pts = {}
  pcall(function()
    if type(field.polygonPoints) == "table" and #field.polygonPoints >= 3 then
      for _, node in ipairs(field.polygonPoints) do
        local x, _, z = getWorldTranslation(node)
        pts[#pts + 1] = string.format("%.1f,%.1f", x, z)
      end
    end
  end)
  if #pts < 3 then
    pts = {}
    pcall(function()
      local v = field.densityMapPolygon:getVerticesList()                                  -- ⚠️ FS25
      for i = 1, #v - 1, 2 do pts[#pts + 1] = string.format("%.1f,%.1f", v[i], v[i + 1]) end
    end)
  end
  return #pts >= 3 and table.concat(pts, "|") or ""
end

local function mapSignature()
  local parts = {}
  -- 0.5.1: eigener Hof mit in die Signatur (Hofwechsel im Mehrspieler) -- sonst blieb map#myFarm in der Datei alt.
  -- getFarmId() nutzt die Mod schon in writeMapFile()/ownFieldEntries().
  local myFarm = 0
  pcall(function() myFarm = tonumber(g_currentMission:getFarmId()) or 0 end)
  parts[#parts + 1] = "m" .. tostring(myFarm)
  for _, farm in ipairs(allFarms()) do parts[#parts + 1] = string.format("h%d:%s:%s", farm.farmId, tostring(farm.name), farmColorHex(farm)) end
  for i, field in ipairs(allFields()) do parts[#parts + 1] = string.format("f%d:%d", fieldIdOf(field, i), fieldOwnerOf(field)) end
  return table.concat(parts, "|")
end

local function writeMapFile()
  local H = CraftConsoleHud
  H.mapRev = H.mapRev + 1
  local ok, xml = pcall(function() return createXMLFile("ccMap", baseDir() .. "craftConsoleMap.xml", "map") end)
  if not ok or xml == nil or xml == 0 then return end
  pcall(function()
    local name, size = "", -1
    pcall(function() name = g_currentMission.missionInfo.map.title or "" end)               -- ⚠️ FS25
    pcall(function() size = g_currentMission.terrainSize or -1 end)
    setXMLString(xml, "map#name", tostring(name))
    setXMLFloat(xml, "map#size", size)
    setXMLInt(xml, "map#rev", H.mapRev)
    setXMLString(xml, "map#session", tostring(H.session or ""))   -- 0.7.3: ControlHub nimmt nur die Karte der Sitzung
    setXMLInt(xml, "map#myFarm", tonumber(g_currentMission:getFarmId()) or 0)
    -- 0.5: Spielstand-Kennung für den Planer (E2). Nur Felder lesen (ccProbeAttach im Spiel geprüft);
    -- vom Ordner nur der letzte Teil ("savegame20"), der volle Pfad enthält den Windows-Benutzernamen.
    pcall(function()
      local mi = g_currentMission.missionInfo
      setXMLInt(xml, "map#savegame", tonumber(mi.savegameIndex) or -1)
      setXMLString(xml, "map#savegameName", tostring(mi.savegameName or ""))
      setXMLString(xml, "map#savegameDir", tostring(mi.savegameDirectory or ""):match("([^/\\]+)[/\\]*$") or "")
      setXMLString(xml, "map#mapId", tostring(mi.mapId or ""))
    end)
    pcall(function()
      local md = g_currentMission.missionDynamicInfo
      setXMLBool(xml, "map#mp", md ~= nil and md.isMultiplayer == true)
    end)
    -- 0.7.9: dieser PC ist Server (Einzelspiel oder Gastgeber) bzw. Gast; nur wenn beim Laden bekannt
    if H.isServer ~= nil then setXMLBool(xml, "map#server", H.isServer == true) end
    for i, farm in ipairs(allFarms()) do
      local p = string.format("map.farm(%d)", i - 1)
      setXMLInt(xml, p .. "#id", farm.farmId)
      setXMLString(xml, p .. "#name", tostring(farm.name or ("Hof " .. farm.farmId)))
      setXMLString(xml, p .. "#color", farmColorHex(farm))
    end
    for i, field in ipairs(allFields()) do
      local p = string.format("map.field(%d)", i - 1)
      setXMLInt(xml, p .. "#id", fieldIdOf(field, i))
      setXMLInt(xml, p .. "#owner", fieldOwnerOf(field))
      local area = -1
      pcall(function() area = field:getAreaHa() end)
      if type(area) ~= "number" then area = tonumber(field.areaHa) or -1 end
      setXMLFloat(xml, p .. "#area", area)
      local pts = fieldPoints(field)
      if pts ~= "" then
        setXMLString(xml, p .. "#pts", pts)
      else
        local okC, cx, cz = pcall(function() return field:getCenterOfFieldWorldPosition() end)
        if not okC or cx == nil then cx, cz = field.posX, field.posZ end
        if cx ~= nil then setXMLFloat(xml, p .. "#x", cx); setXMLFloat(xml, p .. "#z", cz) end
      end
    end
    -- 0.7.4: Früchte des Spiels (auch aus Karten-Mods) mit internem Namen und Anzeigenamen -- nur Felder lesen
    pcall(function()
      local liste = g_fruitTypeManager ~= nil and g_fruitTypeManager.fruitTypes or nil
      if type(liste) ~= "table" then return end
      local n, namen = 0, {}
      for _, desc in ipairs(liste) do
        if n >= 80 then break end
        if type(desc) == "table" and type(desc.name) == "string" and desc.name ~= "" then
          local title = desc.name
          if type(desc.fillType) == "table" and type(desc.fillType.title) == "string" and desc.fillType.title ~= "" then title = desc.fillType.title end
          local p = string.format("map.fruit(%d)", n)
          setXMLString(xml, p .. "#key", desc.name)
          setXMLString(xml, p .. "#title", (title:gsub("[\r\n|<>]", " ")))
          n = n + 1
          namen[#namen + 1] = desc.name
        end
      end
      if H.fruechteGemeldet ~= H.session then
        H.fruechteGemeldet = H.session
        print(("[CC] Früchte des Spiels: %d (%s)"):format(n, table.concat(namen, ", ")))
      end
    end)
    saveXMLFile(xml)
  end)
  pcall(function() delete(xml) end)
end

-- Position + Blickrichtung eines Nodes
local function poseOf(node)
  local x, _, z = getWorldTranslation(node)
  local dx, dz = 0, 1
  pcall(function() local a, _, c = localDirectionToWorld(node, 0, 0, 1); dx, dz = a, c end)    -- ⚠️ FS25
  local atan2 = math.atan2 or math.atan   -- FS25 = Lua 5.1 (atan2), Testumgebung Lua 5.4+ (atan)
  return x, z, math.deg(atan2(dx, dz)) % 360
end

local function collectEntities()
  local list = {}
  local players = {}
  pcall(function()
    players = g_currentMission.playerSystem ~= nil and g_currentMission.playerSystem.players or g_currentMission.players or {}
  end)
  for _, player in pairs(players) do
    pcall(function()
      if player == g_localPlayer then return end   -- das eigene Fahrzeug zeichnet die Karte selbst
      local e = { kind = "player", name = "Spieler", farm = tonumber(player.farmId) or 0, vehicle = "", speed = 0 }
      pcall(function() e.name = g_currentMission.userManager:getUserByUserId(player.userId):getNickname() end)
      if e.farm == 0 then
        -- beim Mitspieler-PC fehlt der Hof teils -> über den Nutzer nachschlagen
        pcall(function() local farm = g_farmManager:getFarmByUserId(player.userId); if farm ~= nil then e.farm = farm.farmId end end)
      end
      local v = nil
      pcall(function() v = player:getCurrentVehicle() end)
      if v ~= nil then
        pcall(function() e.vehicle = (v:getFullName() or ""):gsub("[\r\n|]", " ") end)
        pcall(function() e.speed = v:getLastSpeed() or 0 end)
        e.x, e.z, e.heading = poseOf(v.rootNode)
      else
        e.x, e.z, e.heading = poseOf(player.rootNode)
      end
      -- fester "Server"-Spieler eines Dedi-Servers: ohne Hof bei 0/0 -> weglassen
      if e.farm == 0 and v == nil and math.abs(e.x or 1) < 0.01 and math.abs(e.z or 1) < 0.01 then return end
      list[#list + 1] = e
    end)
  end
  local vehicles = {}
  pcall(function()
    vehicles = g_currentMission.vehicleSystem ~= nil and g_currentMission.vehicleSystem.vehicles or g_currentMission.vehicles or {}
  end)
  for _, v in ipairs(vehicles) do
    pcall(function()
      local isRoot = v.rootVehicle == nil or v.rootVehicle == v
      if not isRoot or v.getIsAIActive == nil or not v:getIsAIActive() then return end
      local e = { kind = "helper", name = "Helfer", farm = 0, vehicle = "", speed = 0 }
      pcall(function() e.name = v.spec_aiJobVehicle.job:getHelperName() or "Helfer" end)
      pcall(function() e.farm = v:getOwnerFarmId() or 0 end)
      pcall(function() e.vehicle = (v:getFullName() or ""):gsub("[\r\n|]", " ") end)
      pcall(function() e.speed = v:getLastSpeed() or 0 end)
      e.x, e.z, e.heading = poseOf(v.rootNode)
      list[#list + 1] = e
    end)
  end
  return list
end

local function writeWorldFile()
  local H = CraftConsoleHud
  H.worldRev = H.worldRev + 1
  local ok, xml = pcall(function() return createXMLFile("ccWorld", baseDir() .. "craftConsoleWorld.xml", "world") end)
  if not ok or xml == nil or xml == 0 then return end
  pcall(function()
    setXMLInt(xml, "world#rev", H.worldRev)
    for i, e in ipairs(collectEntities()) do
      local p = string.format("world.e(%d)", i - 1)
      setXMLString(xml, p .. "#kind", e.kind)
      setXMLString(xml, p .. "#name", tostring(e.name))
      setXMLInt(xml, p .. "#farm", math.floor(tonumber(e.farm) or 0))
      setXMLString(xml, p .. "#vehicle", tostring(e.vehicle or ""))
      setXMLFloat(xml, p .. "#x", e.x or 0)
      setXMLFloat(xml, p .. "#z", e.z or 0)
      setXMLFloat(xml, p .. "#heading", e.heading or 0)
      setXMLFloat(xml, p .. "#speed", e.speed or 0)
    end
    saveXMLFile(xml)
  end)
  pcall(function() delete(xml) end)
end

-- ===== 0.6: Straßennetz einmal je Karte (Anmerkung 19, 23.10.2026) =====
-- g_currentMission.aiSystem.roadSplines: Liste der Straßen-Splines (Verkehr, KI-Straßen der Karte; AISystem.lua l.208/235,
-- GDN class=154). Nur im Einzelspiel bzw. beim Gastgeber gefüllt. Abtasten mit den dokumentierten Engine-Gettern
-- getSplineLength(spline) und getSplinePosition(spline, t) (GDN engine 787/791), wie das Spiel selbst seine Splines
-- abtastet. Einmal je Spielstand, 15 s nach dem Laden (die Splines kommen erst nach AI_SYSTEM_LOADED).
CraftConsoleHud.ROADS_AFTER_MS = 15000
CraftConsoleHud.ROAD_STEP_M = 8
CraftConsoleHud.ROADS_MAX_POINTS = 60000
CraftConsoleHud.ROADS_POINTS_PER_FRAME = 1500   -- 0.7.5: so viele Punkte je Bild, der Rest im nächsten
CraftConsoleHud.roadsTimer = 0
CraftConsoleHud.roadsDone = false
CraftConsoleHud.roadsJob = nil                  -- laufendes Abtasten { splines, i, t, step, pts, lines, total }

-- Straßen-Splines der Karte (Liste Index → Spline oder Menge Spline → true); nil = keine (Mehrspieler-Gast)
local function roadSplines()
  local list = nil
  pcall(function() list = g_currentMission.aiSystem.roadSplines end)
  if type(list) ~= "table" then return nil end
  local splines = {}
  for k, s in pairs(list) do
    local id = type(s) == "number" and s or (s == true and type(k) == "number" and k or nil)
    if id ~= nil then splines[#splines + 1] = id end
  end
  return #splines > 0 and splines or nil
end

-- Ein Stück abtasten (höchstens ROADS_POINTS_PER_FRAME Punkte); true = fertig
local function roadsStep(job)
  local H = CraftConsoleHud
  local budget = H.ROADS_POINTS_PER_FRAME
  while job.i <= #job.splines and job.total < H.ROADS_MAX_POINTS and budget > 0 do
    local s = job.splines[job.i]
    if job.t == nil then   -- nächster Spline
      local okL, len = pcall(getSplineLength, s)
      if okL and type(len) == "number" and len > 1 and len < 1e6 then
        job.t, job.step, job.pts = 0, math.min(1, H.ROAD_STEP_M / len), {}
      else
        job.i = job.i + 1
      end
      budget = budget - 1
    else
      while job.t < 1 and budget > 0 do
        local okP, x, _, z = pcall(getSplinePosition, s, job.t)
        if okP and type(x) == "number" and type(z) == "number" then job.pts[#job.pts + 1] = string.format("%.1f,%.1f", x, z) end
        job.t = job.t + job.step
        budget = budget - 1
      end
      if job.t >= 1 then   -- Spline fertig: Endpunkt dazu
        local okE, x, _, z = pcall(getSplinePosition, s, 1)
        if okE and type(x) == "number" and type(z) == "number" then job.pts[#job.pts + 1] = string.format("%.1f,%.1f", x, z) end
        if #job.pts >= 2 then job.lines[#job.lines + 1] = table.concat(job.pts, "|"); job.total = job.total + #job.pts end
        job.i, job.t, job.pts = job.i + 1, nil, nil
      end
    end
  end
  return job.i > #job.splines or job.total >= H.ROADS_MAX_POINTS
end

-- ===== 0.7.6: Aktionen des Spiels (Steuerung) für die Funktionen in ControlHub =====
-- Nur Felder lesen (g_inputBinding.actions bzw. .nameActions, je Aktion alle einfachen Felder; Tabellen nur als Größe
-- mit ein paar einfachen Einträgen). Einmal je Spielstand, 20 s nach dem Laden.
-- 0.7.7: dazu je Abschnitt des Steuerungsmenüs (displayCategory „$l10n_inputCategory_…“) der Text in der Spielsprache.
CraftConsoleHud.INPUT_AFTER_MS = 20000
CraftConsoleHud.INPUT_MAX_ACTIONS = 1500
CraftConsoleHud.inputDone = false
CraftConsoleHud.inputTimer = 0

local function inputText(v) return (tostring(v):gsub("[\r\n|<>]", " ")):sub(1, 200) end

-- Kurzbeschreibung eines Tabellenwerts: Anzahl und bis zu 6 einfache Einträge
local function inputTabelle(t)
  local n, probe = 0, {}
  for k, v in pairs(t) do
    n = n + 1
    local tv = type(v)
    if #probe < 6 and (tv == "string" or tv == "number" or tv == "boolean") then probe[#probe + 1] = tostring(k) .. "=" .. tostring(v) end
  end
  return ("Tabelle(%d) %s"):format(n, table.concat(probe, ", "))
end

-- Text zu einem Sprachschlüssel: erst das Feld g_i18n.texts lesen, sonst der dokumentierte Getter g_i18n:getText(key)
local function inputSprachtext(key)
  local i18n = g_i18n
  if type(i18n) ~= "table" then return nil end
  local t = type(i18n.texts) == "table" and i18n.texts[key] or nil
  if type(t) ~= "string" and type(i18n.getText) == "function" then
    local ok, r = pcall(i18n.getText, i18n, key)
    if ok then t = r end
  end
  if type(t) ~= "string" or t == "" or t:find("Missing", 1, true) then return nil end
  return t
end

local function writeInputActionsFile()
  local H = CraftConsoleHud
  local ib = g_inputBinding
  if type(ib) ~= "table" then return false end
  local liste, quelle = {}, nil
  for _, feld in ipairs({ "actions", "nameActions" }) do
    local t = ib[feld]
    if type(t) == "table" then
      for _, a in pairs(t) do if type(a) == "table" then liste[#liste + 1] = a end end
      if #liste > 0 then quelle = feld; break end
    end
  end
  if #liste == 0 then return false end
  table.sort(liste, function(a, b) return tostring(a.name) < tostring(b.name) end)
  local ok, xml = pcall(function() return createXMLFile("ccInput", baseDir() .. "craftConsoleInputActions.xml", "inputActions") end)
  if not ok or xml == nil or xml == 0 then return false end
  local n = 0
  guarded("Aktionen", function()
    setXMLString(xml, "inputActions#session", tostring(H.session or ""))
    setXMLString(xml, "inputActions#source", "g_inputBinding." .. tostring(quelle))
    local felder = {}
    for k, v in pairs(ib) do if type(k) == "string" then felder[#felder + 1] = k .. ":" .. type(v) end end
    table.sort(felder)
    setXMLString(xml, "inputActions#bindingFields", (table.concat(felder, " "):gsub("[<>]", " ")))
    -- 0.7.7: Abschnitte des Steuerungsmenüs als Text (z. B. inputCategory_VEHICLE_WORK)
    local schluessel, gesehen = {}, {}
    for _, a in ipairs(liste) do
      local d = a.displayCategory
      if type(d) == "string" and d:sub(1, 6) == "$l10n_" and not gesehen[d] then gesehen[d] = true; schluessel[#schluessel + 1] = d:sub(7) end
    end
    table.sort(schluessel)
    local nk = 0
    for _, key in ipairs(schluessel) do
      local text = inputSprachtext(key)
      if text then
        local q = string.format("inputActions.categoryText(%d)", nk)
        setXMLString(xml, q .. "#key", key)
        setXMLString(xml, q .. "#text", inputText(text))
        nk = nk + 1
      end
    end
    for _, a in ipairs(liste) do
      if n >= H.INPUT_MAX_ACTIONS then break end
      local p = string.format("inputActions.a(%d)", n)
      local keys = {}
      for k in pairs(a) do if type(k) == "string" then keys[#keys + 1] = k end end
      table.sort(keys)
      local m = 0
      for _, k in ipairs(keys) do
        if m >= 40 then break end
        local v = a[k]
        local tv = type(v)
        if tv == "string" or tv == "number" or tv == "boolean" or tv == "table" then
          setXMLString(xml, string.format("%s.f(%d)#k", p, m), k)
          setXMLString(xml, string.format("%s.f(%d)#v", p, m), tv == "table" and inputText(inputTabelle(v)) or inputText(v))
          m = m + 1
        end
      end
      n = n + 1
    end
    setXMLInt(xml, "inputActions#count", n)
    saveXMLFile(xml)
  end)
  pcall(function() delete(xml) end)
  print(("[CC] Aktionen des Spiels: %d (aus g_inputBinding.%s) -> craftConsoleInputActions.xml"):format(n, tostring(quelle)))
  return n > 0
end

function CraftConsoleHud:consoleDumpInputActions()
  local ok, done = pcall(writeInputActionsFile)
  if ok and done then return "ccDumpInputActions: craftConsoleInputActions.xml geschrieben (s. log.txt)" end
  return "ccDumpInputActions: keine Aktionen gefunden (g_inputBinding)"
end
addConsoleCommand("ccDumpInputActions", "CraftConsole: Aktionen des Spiels (Steuerung) nach craftConsoleInputActions.xml", "consoleDumpInputActions", CraftConsoleHud)

local function writeRoadsFile(lines, total)
  local ok, xml = pcall(function() return createXMLFile("ccRoads", baseDir() .. "craftConsoleRoads.xml", "roads") end)
  if not ok or xml == nil or xml == 0 then return false end
  local H = CraftConsoleHud
  guarded("Straßen", function()
    setXMLString(xml, "roads#session", tostring(H.session or ""))
    for n, l in ipairs(lines) do setXMLString(xml, string.format("roads.r(%d)#p", n - 1), l) end
    setXMLInt(xml, "roads#count", #lines)
    saveXMLFile(xml)
  end)
  pcall(function() delete(xml) end)
  print(string.format("[CraftConsoleHud] Straßennetz: %d Linien, %d Punkte", #lines, total))
  return true
end

function CraftConsoleHud:consoleDumpMap()
  local farms, fields = allFarms(), allFields()
  print(("[CC] Karte: %d Höfe, %d Felder"):format(#farms, #fields))
  for _, farm in ipairs(farms) do print(("[CC]   Hof %d '%s' Farbe %s"):format(farm.farmId, tostring(farm.name), farmColorHex(farm))) end
  for i, field in ipairs(fields) do
    if i > 10 then print("[CC]   …"); break end
    local pts = fieldPoints(field)
    local n = pts == "" and 0 or select(2, pts:gsub("|", "|")) + 1
    print(("[CC]   Feld %d Besitzer %d, %d Eckpunkte"):format(fieldIdOf(field, i), fieldOwnerOf(field), n))
  end
  for _, e in ipairs(collectEntities()) do
    print(("[CC]   %s '%s' Hof %d %s bei %.0f/%.0f"):format(e.kind, tostring(e.name), e.farm or 0, tostring(e.vehicle), e.x or 0, e.z or 0))
  end
  return "ccDumpMap fertig - siehe log.txt"
end
addConsoleCommand("ccDumpMap", "CraftConsole: Felder, Höfe und andere Fahrzeuge (Karte) ins Log", "consoleDumpMap", CraftConsoleHud)

-- ===== Arbeitsplaner (Paket E, 21.10.2026) =====
-- craftConsolePlan.xml     : je eigenem Feld Phase (leer/vorbereitet/wächst/erntereif/geerntet/verdorrt), Frucht
--                            und Anteil offener Arbeiten (0..1). Gemessen mit FieldState an bis zu 9 Punkten je
--                            Feld, verteilt auf mehrere Bilder (2 Felder je Bild), Durchlauf alle 4 s; das Feld
--                            unter dem eigenen Fahrzeug dichter (bis 120 Punkte, alle 2 s) für den Fortschritt.
-- Läuft NUR, wenn ControlHub den Planer anzeigt (craftConsoleSettings.xml: plan="1") -- spart sonst Leistung.
-- Beim Einschalten sofort ein Durchlauf (bis 0.4.0 wartete er den Rest der Pause ab -- „braucht lange“, Test 22.10.).
-- AUFTRÄGE ENTFERNT (Mod 0.4.1, 22.10.2026): Das Spiel hing beim Annehmen eines Auftrags in einer Fehlerschleife
-- (AbstractFieldMission.lua:472; einzige geladene Mod war diese). Verdacht: die Funktionsaufrufe für Titel, Lohn
-- und Fortschritt auf dem gerade startenden Auftrag. Keine Funktionen auf Auftrags-Objekten mehr aufrufen;
-- ccDumpMissions listet nur noch Feldnamen und einfache Werte (reines Lesen der Lua-Tabelle).
CraftConsoleHud.PLAN_PAUSE_MS = 4000
CraftConsoleHud.PLAN_FIELDS_PER_FRAME = 2
CraftConsoleHud.PLAN_LIVE_MS = 2000
CraftConsoleHud.PLAN_LIVE_POINTS = 120
CraftConsoleHud.planWanted = false
CraftConsoleHud.planRun = nil
CraftConsoleHud.planWait = 0
CraftConsoleHud.planLiveWait = 0
CraftConsoleHud.planLive = nil
CraftConsoleHud.planResults = {}
CraftConsoleHud.planRev = 0
CraftConsoleHud.planLiveField = nil   -- 0.5.1: Nummer des eigenen Felds unter dem Fahrzeug (nil = keins / zu Fuß)

local PREPARED = { "PLOWED", "CULTIVATED", "SEEDBED", "ROLLED_SEEDBED", "STUBBLE_TILLAGE" }

local function polyOf(field)
  local pts = {}
  for x, z in fieldPoints(field):gmatch("([%-%d%.]+),([%-%d%.]+)") do pts[#pts + 1] = { tonumber(x), tonumber(z) } end
  return pts
end

local function inPoly(pts, x, z)
  local inside, j = false, #pts
  for i = 1, #pts do
    local xi, zi, xj, zj = pts[i][1], pts[i][2], pts[j][1], pts[j][2]
    if (zi > z) ~= (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi) + xi then inside = not inside end
    j = i
  end
  return inside
end

-- Messpunkte: Raster über den Umriss, nur Punkte im Feld (n = gewünschte Anzahl, ungefähr)
local function samplePoints(pts, n)
  local minX, minZ, maxX, maxZ = math.huge, math.huge, -math.huge, -math.huge
  for _, p in ipairs(pts) do minX = math.min(minX, p[1]); maxX = math.max(maxX, p[1]); minZ = math.min(minZ, p[2]); maxZ = math.max(maxZ, p[2]) end
  local k = math.max(2, math.ceil(math.sqrt(n * 1.4)))   -- etwas mehr Raster, weil nicht jeder Punkt im Feld liegt
  local out = {}
  for gx = 1, k do
    for gz = 1, k do
      local x = minX + (maxX - minX) * (gx - 0.5) / k
      local z = minZ + (maxZ - minZ) * (gz - 0.5) / k
      if #out < n and inPoly(pts, x, z) then out[#out + 1] = { x, z } end
    end
  end
  return out
end

-- Spielregeln für Pflichtarbeiten (Kalk, Pflügen, Unkraut, Steine, Mulchen) aus den Spieleinstellungen
local function planRules()
  local r = { lime = false, plow = false, weeds = false, stones = false, stubble = false, sprayMax = 2 }
  pcall(function()
    local mi = g_currentMission.missionInfo or {}
    r.lime = mi.limeRequired == true
    r.plow = mi.plowingRequiredEnabled == true
    r.weeds = mi.weedsEnabled == true
    r.stones = mi.stonesEnabled == true
  end)
  pcall(function() r.stubble = Platform.gameplay.useStubbleShred == true end)
  pcall(function() r.sprayMax = g_currentMission.fieldGroundSystem:getMaxValue(FieldDensityMap.SPRAY_LEVEL) or 2 end)   -- ⚠️ FS25
  return r
end

-- Ein Messpunkt -> Phase, Fruchtname und offene Arbeiten (eigene Regeln nach den Wachstumsstufen der Frucht)
local function classify(st, rules)
  local tasks, phase, fruitName, fruitKey = {}, "leer", nil, nil   -- 0.7.4: fruitKey = FruitTypeDesc.name (z. B. WHEAT)
  local growth, growthMax = nil, nil   -- 0.6: Wachstumsstufe und Stufe der Erntereife (FruitTypeDesc.minHarvestingGrowthState)
  local idx, g = st.fruitTypeIndex, st.growthState or 0
  local desc = nil
  if idx ~= nil and g > 0 and (FruitType == nil or idx ~= FruitType.UNKNOWN) then
    pcall(function() desc = g_fruitTypeManager:getFruitTypeByIndex(idx) end)
  end
  local growing = false
  if desc ~= nil then
    pcall(function() fruitName = (desc.fillType ~= nil and desc.fillType.title) or desc.name end)
    if type(desc.name) == "string" and desc.name ~= "" then fruitKey = desc.name end
    if desc.witheredState ~= nil and g == desc.witheredState then
      phase = "verdorrt"; tasks.cultivate = true
    elseif type(desc.cutStates) == "table" and desc.cutStates[g] then
      phase = "geerntet"
      if not desc.regrows then tasks.cultivate = true; if rules.stubble and (st.stubbleShredLevel or 0) == 0 then tasks.mulch = true end end
    elseif (desc.minHarvestingGrowthState or 0) > 0 and g >= desc.minHarvestingGrowthState and g <= (desc.maxHarvestingGrowthState or g) then
      phase = "erntereif"; tasks.harvest = true
    else
      phase = "waechst"; growing = true
      pcall(function()
        local mh = tonumber(desc.minHarvestingGrowthState)
        if mh ~= nil and mh > 0 and g > 0 then growth, growthMax = g, mh end
      end)
    end
  else
    for _, name in ipairs(PREPARED) do
      if FieldGroundType ~= nil and FieldGroundType[name] ~= nil and st.groundType == FieldGroundType[name] then
        phase = "vorbereitet"; tasks.sow = true
        if rules.stones and (st.stoneLevel or 0) > 0 then tasks.stones = true end
        break
      end
    end
    if phase == "leer" then tasks.cultivate = true end
  end
  if (growing or phase == "vorbereitet") and rules.sprayMax > 0 and (st.sprayLevel or 0) < rules.sprayMax then tasks.fertilize = true end
  if rules.weeds and (st.weedState or 0) > 0 and (growing or phase == "vorbereitet") then tasks.weeds = true end
  if rules.lime and (st.limeLevel or 0) == 0 and not growing then tasks.lime = true end
  if rules.plow and (st.plowLevel or 0) == 0 and not growing and phase ~= "erntereif" then tasks.plow = true end
  if (st.rollerLevel or 0) == 1 then tasks.roll = true end
  return phase, fruitName, tasks, growth, growthMax, fruitKey
end

-- Messpunkte sammeln (acc kann über mehrere Bilder hinweg weitergefüllt werden) ...
local function newAcc() return { counts = {}, phases = {}, fruits = {}, titles = {}, keys = {}, growth = {}, growthMax = nil, n = 0 } end
local function accumulate(acc, points, from, to, rules, st)
  for i = from, to do
    local pt = points[i]
    local ok = pcall(function() st:update(pt[1], pt[2]) end)                                -- ⚠️ FS25 FieldState
    if ok and st.isValid ~= false then
      acc.n = acc.n + 1
      local phase, fruit, tasks, growth, growthMax, fruitKey = classify(st, rules)
      acc.phases[phase] = (acc.phases[phase] or 0) + 1
      if growth ~= nil then
        acc.growth[growth] = (acc.growth[growth] or 0) + 1
        if acc.growthMax == nil or growthMax > acc.growthMax then acc.growthMax = growthMax end
      end
      if fruit ~= nil then   -- 0.7.4: je Frucht (interner Name) zählen, Anzeigename dazu merken
        local k = fruitKey or fruit
        acc.fruits[k] = (acc.fruits[k] or 0) + 1
        acc.titles[k], acc.keys[k] = fruit, fruitKey
      end
      for k in pairs(tasks) do acc.counts[k] = (acc.counts[k] or 0) + 1 end
    end
  end
end
-- ... und zum Ergebnis zusammenfassen: { id, area, phase (häufigste), fruit, n, tasks = {name = Anteil 0..1} }
local function finishAcc(entry, acc)
  local best, bestN, fruitK, fruitN = "leer", -1, nil, 0
  for k, c in pairs(acc.phases) do if c > bestN then best, bestN = k, c end end
  for k, c in pairs(acc.fruits) do if c > fruitN then fruitK, fruitN = k, c end end
  local fruit = fruitK ~= nil and ((acc.titles or {})[fruitK] or fruitK) or ""
  local fruitKey = fruitK ~= nil and (acc.keys or {})[fruitK] or nil
  local tasks = {}
  for k, c in pairs(acc.counts) do tasks[k] = acc.n > 0 and c / acc.n or 0 end
  local growth, growthN = nil, 0   -- häufigste Wachstumsstufe der Messpunkte
  for k, c in pairs(acc.growth or {}) do if c > growthN then growth, growthN = k, c end end
  return { id = entry.id, area = entry.area, phase = best, fruit = fruit, fruitKey = fruitKey, n = acc.n, tasks = tasks,
           growth = best == "waechst" and growth or nil, growthMax = best == "waechst" and acc.growthMax or nil }
end
local function measureField(entry, points, rules, st)
  local acc = newAcc()
  accumulate(acc, points, 1, #points, rules, st)
  return finishAcc(entry, acc)
end

local function writePlanFile(rules)
  local H = CraftConsoleHud
  H.planRev = H.planRev + 1
  local ok, xml = pcall(function() return createXMLFile("ccPlan", baseDir() .. "craftConsolePlan.xml", "plan") end)
  if not ok or xml == nil or xml == 0 then return end
  pcall(function()
    setXMLInt(xml, "plan#rev", H.planRev)
    setXMLString(xml, "plan#session", tostring(H.session or ""))   -- 0.7.9: wie map#session
    for _, k in ipairs({ "lime", "plow", "weeds", "stones" }) do setXMLBool(xml, "plan#" .. k, rules[k] == true) end
    local ids = {}
    for id in pairs(H.planResults) do ids[#ids + 1] = id end
    table.sort(ids)
    for i, id in ipairs(ids) do
      local r = H.planResults[id]
      local p = string.format("plan.field(%d)", i - 1)
      setXMLInt(xml, p .. "#id", id)
      setXMLFloat(xml, p .. "#area", tonumber(r.area) or -1)
      setXMLString(xml, p .. "#phase", r.phase)
      setXMLString(xml, p .. "#fruit", tostring(r.fruit or ""))
      if type(r.fruitKey) == "string" and r.fruitKey ~= "" then setXMLString(xml, p .. "#fruitKey", r.fruitKey) end   -- 0.7.4
      setXMLInt(xml, p .. "#points", r.n)
      if r.live then setXMLBool(xml, p .. "#live", true) end
      if r.growth ~= nil and r.growthMax ~= nil then
        setXMLInt(xml, p .. "#growth", r.growth)
        setXMLInt(xml, p .. "#growthMax", r.growthMax)
      end
      local parts = {}
      for k, v in pairs(r.tasks) do parts[#parts + 1] = string.format("%s:%.2f", k, v) end
      table.sort(parts)
      setXMLString(xml, p .. "#tasks", table.concat(parts, ";"))
    end
    saveXMLFile(xml)
  end)
  pcall(function() delete(xml) end)
end

local function ownFieldEntries()
  local myFarm = 0
  pcall(function() myFarm = g_currentMission:getFarmId() or 0 end)
  local list = {}
  local cache = CraftConsoleHud.polyCache
  for i, field in ipairs(allFields()) do
    if fieldOwnerOf(field) == myFarm and myFarm > 0 then
      local area = -1
      pcall(function() area = field:getAreaHa() end)
      -- 0.5.2: Umriss je Feld nur einmal als Text bauen und zerlegen (vorher alle 2 s für alle eigenen Felder)
      local id = fieldIdOf(field, i)
      local pts = cache[id]
      if pts == nil then pts = polyOf(field); cache[id] = pts end
      if #pts >= 3 then list[#list + 1] = { id = id, area = area, pts = pts } end
    end
  end
  table.sort(list, function(a, b) return a.id < b.id end)
  return list
end

local function newFieldState()
  local st = nil
  pcall(function() if FieldState ~= nil then st = FieldState.new() end end)                  -- ⚠️ FS25
  return st
end

-- Je Bild ein kleines Stück Arbeit (Zeitbudget statt alles auf einmal)
local function updatePlan(dt)
  local H = CraftConsoleHud
  if not H.planWanted or H.hubGone then H.planRun = nil; H.planLive = nil; return end   -- 0.5.2: ohne ControlHub nie
  -- Durchlauf über alle eigenen Felder
  if H.planRun == nil then
    H.planWait = H.planWait - dt
    if H.planWait <= 0 then
      H.planWait = H.PLAN_PAUSE_MS
      local st = newFieldState()
      if st ~= nil then H.planRun = { list = ownFieldEntries(), i = 1, st = st, rules = planRules(), out = {} } end
    end
  end
  local run = H.planRun
  if run ~= nil then
    for _ = 1, H.PLAN_FIELDS_PER_FRAME do
      local e = run.list[run.i]
      if e == nil then break end
      run.out[e.id] = measureField(e, samplePoints(e.pts, 9), run.rules, run.st)
      run.i = run.i + 1
    end
    if run.i > #run.list then
      -- Live-Ergebnis des aktuellen Felds behalten (genauer als die 9 Punkte) -- nur, solange das Fahrzeug noch dort ist
      for id, r in pairs(H.planResults) do
        if r.live and id == H.planLiveField and run.out[id] ~= nil then run.out[id] = r end
      end
      H.planResults = run.out
      H.planRun = nil
      writePlanFile(run.rules)
    end
  end
  -- Feld unter dem eigenen Fahrzeug dichter messen (Fortschritt beim Arbeiten). 0.5.1: Lage alle 2 s prüfen, auch
  -- während einer Messung. Kein Fahrzeug oder kein eigenes Feld -> Merker "live" löschen (bis 0.5.0 blieb er nach dem
  -- Verlassen des Felds stehen: Fortschritt eingefroren, "Auf eigenem Feld" blieb an).
  H.planLiveWait = H.planLiveWait - dt
  if H.planLiveWait <= 0 then
    H.planLiveWait = H.PLAN_LIVE_MS
    local cur = nil
    local v = getVehicle()
    if v ~= nil then
      local okP, x, z = pcall(function() local a, _, c = getWorldTranslation(v.rootNode); return a, c end)
      if okP and type(x) == "number" and type(z) == "number" then
        for _, e in ipairs(ownFieldEntries()) do
          if inPoly(e.pts, x, z) then cur = e; break end
        end
      end
    end
    H.planLiveField = cur ~= nil and cur.id or nil
    local cleared = false
    for id, r in pairs(H.planResults) do
      if r.live and id ~= H.planLiveField then r.live = nil; cleared = true end
    end
    if H.planLive ~= nil and (cur == nil or H.planLive.e.id ~= cur.id) then H.planLive = nil end   -- Messung gehört nicht mehr zum Feld
    if cur ~= nil and H.planLive == nil then
      local st = newFieldState()
      if st ~= nil then H.planLive = { e = cur, pts = samplePoints(cur.pts, H.PLAN_LIVE_POINTS), i = 1, st = st, rules = planRules(), acc = newAcc() } end
    end
    if cleared then writePlanFile(planRules()) end
  end
  local L = H.planLive
  if L ~= nil then
    local stop = math.min(#L.pts, L.i + 29)   -- höchstens 30 Messungen je Bild
    accumulate(L.acc, L.pts, L.i, stop, L.rules, L.st)
    L.i = stop + 1
    if L.i > #L.pts then
      H.planLive = nil
      if L.e.id == H.planLiveField then   -- Ergebnis nur übernehmen, wenn es zum aktuellen Feld gehört
        local r = finishAcc(L.e, L.acc)
        r.live = true
        for _, old in pairs(H.planResults) do old.live = nil end
        H.planResults[L.e.id] = r
        writePlanFile(L.rules)
      end
    end
  end
end

function CraftConsoleHud:consoleDumpMissions()
  -- Seit 0.4.1 NUR Namen und einfache Werte der Lua-Tabelle auflisten -- keine Funktion eines Auftrags aufrufen
  -- (Fehlerschleife beim Annehmen eines Auftrags, s. Arbeitsplaner-Kommentar oben).
  local missions = {}
  pcall(function() missions = g_missionManager.missions or {} end)
  local n = 0
  for _, m in pairs(missions) do
    n = n + 1
    if n <= 3 then
      local keys = {}
      for k, v in pairs(m) do
        local t = type(v)
        keys[#keys + 1] = tostring(k) .. "(" .. ((t == "number" or t == "string" or t == "boolean") and tostring(v) or t) .. ")"
      end
      table.sort(keys)
      print(("[CC] Auftrag %d: %s"):format(n, table.concat(keys, ", ")))
    end
  end
  print(("[CC] %d Aufträge in g_missionManager.missions"):format(n))
  return "ccDumpMissions fertig - siehe log.txt"
end
addConsoleCommand("ccDumpMissions", "CraftConsole: Feldnamen der Aufträge ins Log (nur lesen, ruft nichts auf)", "consoleDumpMissions", CraftConsoleHud)

function CraftConsoleHud:consoleDumpPlan()
  local st = newFieldState()
  if st == nil then return "FieldState gibt es nicht" end
  local rules = planRules()
  print(("[CC] Regeln: Kalk %s, Pflügen %s, Unkraut %s, Steine %s, Düngestufen %s"):format(tostring(rules.lime), tostring(rules.plow), tostring(rules.weeds), tostring(rules.stones), tostring(rules.sprayMax)))
  for _, e in ipairs(ownFieldEntries()) do
    local r = measureField(e, samplePoints(e.pts, 9), rules, st)
    local parts = {}
    for k, v in pairs(r.tasks) do parts[#parts + 1] = string.format("%s %.0f%%", k, v * 100) end
    print(("[CC]   Feld %d: %s %s, %d Punkte, offen: %s"):format(r.id, r.phase, r.fruit, r.n, table.concat(parts, ", ")))
  end
  return "ccDumpPlan fertig - siehe log.txt"
end
addConsoleCommand("ccDumpPlan", "CraftConsole: Arbeitsplaner (eigene Felder) ins Log", "consoleDumpPlan", CraftConsoleHud)

-- ===== Aktualisierungsrate + Sparmodus (Phase 1, 21.10.2026) =====
-- ControlHub schreibt craftConsoleSettings.xml in den Mod-Ordner: <settings rate="20" clients="1"/>.
-- rate = Schreibrunden pro Sekunde (ControlHub bietet 4/10/20/25 an), clients = verbundene Browser.
-- Das ist KEIN Befehlskanal: die Mod erfährt nur, wie oft sie schreiben soll.
-- Vorrang: ccRate (Konsole) > clients = 0 (Sparmodus, 2/s) > rate aus der Datei > Standard 4/s.
local function clampRate(r)
  r = tonumber(r)
  if r == nil then return nil end
  return math.floor(math.max(CraftConsoleHud.RATES_MIN, math.min(CraftConsoleHud.RATES_MAX, r)) + 0.5)
end

local function applyRate()
  local H = CraftConsoleHud
  local rate = H.rateOverride
  local why = "ccRate"
  if rate == nil and H.hubGone then rate = H.SAVE_RATE; why = "Sparmodus, ControlHub läuft nicht" end
  if rate == nil and H.settingsClients == 0 then rate = H.SAVE_RATE; why = "Sparmodus, kein Tablet" end
  if rate == nil and H.settingsRate ~= nil then rate = H.settingsRate; why = "ControlHub" end
  if rate == nil then rate = 4; why = "Standard" end
  local ms = math.floor(1000 / rate + 0.5)
  if ms ~= H.writeIntervalMs then
    H.writeIntervalMs = ms
    print(("[CraftConsoleHud] Aktualisierung: %d/s (%s)"):format(rate, why))
  end
end

local function readSettings()
  local H = CraftConsoleHud
  local path = baseDir() .. "craftConsoleSettings.xml"
  local rate, clients = nil, nil
  if fileExists(path) then                                                                 -- ⚠️ FS25
    local xml = loadXMLFile("ccSettings", path)
    if xml ~= nil and xml ~= 0 then
      pcall(function()
        rate = clampRate(getXMLInt(xml, "settings#rate"))
        clients = getXMLInt(xml, "settings#clients")
        -- 0.5.2: Lebenszeichen; fehlt das Attribut (ControlHub vor 23.10.2026), gilt ControlHub als da
        local alive = getXMLInt(xml, "settings#alive")
        if alive == nil or alive ~= H.hubAlive then H.hubAlive = alive; H.hubAliveAge = 0 end
        local wanted = getXMLInt(xml, "settings#plan") == 1   -- ein Tablet zeigt gerade den Planer
        if wanted and not H.planWanted then H.planWait = 0; H.planLiveWait = 0 end   -- gleich messen statt Pause abwarten
        H.planWanted = wanted
      end)
      pcall(function() delete(xml) end)
    end
  end
  H.settingsRate = rate
  H.settingsClients = clients
  local gone = H.hubAliveAge >= H.HUB_GONE_MS
  if gone ~= H.hubGone then
    H.hubGone = gone
    print(gone and "[CraftConsoleHud] ControlHub antwortet nicht mehr -- Sparmodus." or "[CraftConsoleHud] ControlHub ist wieder da.")
  end
  applyRate()
end

function CraftConsoleHud:consoleRate(value)
  local r = tonumber(value)
  if r == nil or r <= 0 then
    CraftConsoleHud.rateOverride = nil
    applyRate()
    return "ccRate: zurück auf die Einstellung aus ControlHub (" .. math.floor(1000 / CraftConsoleHud.writeIntervalMs + 0.5) .. "/s)"
  end
  CraftConsoleHud.rateOverride = clampRate(r)
  applyRate()
  return ("ccRate: %d/s, bis 'ccRate 0' oder Spielende"):format(CraftConsoleHud.rateOverride)
end
addConsoleCommand("ccRate", "CraftConsole: Aktualisierungen pro Sekunde (2-30), 'ccRate 0' = Einstellung aus ControlHub", "consoleRate", CraftConsoleHud)

-- ===== Lastmessung: alle 30 s eine Zeile ins log.txt (Phase 1) =====
-- Misst nur die Zeit für collect() + Datei schreiben (= Kosten der Mod), nicht das ganze Spielbild.
-- getTimeSec = Sekunden mit Nachkommastellen; fehlt die Funktion, entfällt die Messung still.
local loadClock = getTimeSec
CraftConsoleHud.LOAD_LOG_MS = 30000
CraftConsoleHud.loadDt, CraftConsoleHud.loadSum, CraftConsoleHud.loadMax, CraftConsoleHud.loadWrites = 0, 0, 0, 0

local function loadReport()
  local H = CraftConsoleHud
  local secs = H.loadDt / 1000
  if H.loadWrites > 0 and secs > 0 then
    local perWrite = H.loadSum / H.loadWrites
    print(("[CraftConsoleHud] Last %d s: %d Schreibrunden (%.1f/s), je %.2f ms (max %.1f ms), zusammen %.2f %% der Zeit"):format(
      math.floor(secs + 0.5), H.loadWrites, H.loadWrites / secs, perWrite, H.loadMax, 100 * H.loadSum / H.loadDt))
  end
  H.loadDt, H.loadSum, H.loadMax, H.loadWrites = 0, 0, 0, 0
end

function CraftConsoleHud:update(dt)
  if self.disabled then return end   -- dedizierter Server, s. loadMap()
  -- Kurs-Aenderung unabhaengig vom 250ms-Takt erkennen (Referenzvergleich -- Lua-Tabellen sind
  -- Referenztypen, kein Tiefenvergleich noetig) -- ein neu geladener/geaenderter GPS-Kurs soll nicht
  -- bis zu 250ms lang falsch/fehlend angezeigt werden.
  local okCourse, course = pcall(function()
    local v = getVehicle()
    if v == nil then return nil end
    local spec = v.spec_aiAutomaticSteering
    if spec == nil then return nil end
    return spec.steeringFieldCourse or spec.lastActiveSteeringFieldCourse
  end)
  if okCourse and course ~= self.lastCourseRef then
    self.lastCourseRef = course
    self.courseVersion = self.courseVersion + 1
    -- Kurs weg (Spurführung aus, ausgestiegen): leere Kursdatei schreiben, sonst liest ControlHub beim
    -- neuen courseVer wieder die alte Datei und zeigt den alten Kurs weiter an (Fehler bis Mod 0.3).
    -- Seit 0.5.1 auch in der ersten Runde ohne Kurs (Startwert false, s. oben).
    guarded("Kursdatei", writeCourseFile, course or {})
    if course ~= nil and CraftConsoleHud.recording then
      pcall(function() recordLine(encodeCourseJson(course)) end)
    end
  end

  -- Einstellungen von ControlHub (Rate, Sparmodus) alle 2 s nachlesen
  self.hubAliveAge = self.hubAliveAge + (dt or 0)
  self.settingsTimer = self.settingsTimer + (dt or 0)
  if self.settingsTimer >= self.SETTINGS_READ_MS then
    self.settingsTimer = 0
    guarded("Einstellungen lesen", readSettings)
  end
  self.loadDt = self.loadDt + (dt or 0)

  self.timer = self.timer + (dt or 0)
  if self.timer >= self.writeIntervalMs then
    -- Rest behalten (sonst z. B. 25 statt 30/s bei 60 FPS), aber nie mehr als eine Runde nachholen
    self.timer = math.min(self.timer - self.writeIntervalMs, self.writeIntervalMs)
    local t0 = loadClock ~= nil and loadClock() or nil
    self.round = self.round + 1
    -- 0.5.1: collect() und writeFile() mit eigenem pcall -- bis 0.5.0 brach ein Fehler beim Einsammeln das ganze
    -- update() in jedem Bild ab (dann auch keine Karte, Mitspieler und Planer mehr)
    local okD, d = pcall(collect)
    if okD and type(d) == "table" then
      guarded("HUD-Datei", writeFile, d)
      if CraftConsoleHud.recording then
        pcall(function() recordLine(encodeTickJson(d)) end)
      end
    else
      logError("Werte einsammeln", d)
    end
    if t0 ~= nil then
      local ms = (loadClock() - t0) * 1000
      self.loadSum = self.loadSum + ms
      self.loadWrites = self.loadWrites + 1
      if ms > self.loadMax then self.loadMax = ms end
    end
  end
  -- Karte (selten, nur bei Änderung) und andere Fahrzeuge (2×/s, ohne Tablet seltener)
  self.mapTimer = self.mapTimer + (dt or 0)
  if self.mapTimer >= self.MAP_CHECK_MS then
    self.mapTimer = 0
    guarded("Karte", function()
      local sig = mapSignature()
      if sig ~= self.mapSig then self.mapSig = sig; self.polyCache = {}; writeMapFile() end
    end)
  end
  self.worldTimer = self.worldTimer + (dt or 0)
  if self.worldTimer >= ((self.settingsClients == 0 or self.hubGone) and self.WORLD_SAVE_MS or self.WORLD_MS) then
    self.worldTimer = 0
    guarded("Mitspieler/Helfer", writeWorldFile)
  end
  -- Aktionen des Spiels einmal je Spielstand (0.7.6), 20 s nach dem Laden
  if not self.inputDone then
    self.inputTimer = self.inputTimer + (dt or 0)
    if self.inputTimer >= self.INPUT_AFTER_MS then
      self.inputDone = true
      guarded("Aktionen", writeInputActionsFile)
    end
  end
  -- Straßennetz einmal je Spielstand (0.6), frühestens 15 s nach dem Laden; ohne Splines (MP-Client) nur ein Versuch je Minute
  -- 0.7.5: verteilt über mehrere Bilder (roadsStep), erst am Ende wird die Datei geschrieben
  if not self.roadsDone then
    if self.roadsJob ~= nil then
      local okS, fertig = pcall(roadsStep, self.roadsJob)
      if not okS then
        self.roadsJob = nil; self.roadsTimer = self.ROADS_AFTER_MS - 60000
      elseif fertig then
        local job = self.roadsJob
        self.roadsJob = nil
        local okW, done = pcall(writeRoadsFile, job.lines, job.total)
        if okW and done then self.roadsDone = true else self.roadsTimer = self.ROADS_AFTER_MS - 60000 end
      end
    else
      self.roadsTimer = self.roadsTimer + (dt or 0)
      if self.roadsTimer >= self.ROADS_AFTER_MS then
        local okL, splines = pcall(roadSplines)
        if okL and splines ~= nil then self.roadsJob = { splines = splines, i = 1, lines = {}, total = 0 }
        else self.roadsTimer = self.ROADS_AFTER_MS - 60000 end
      end
    end
  end
  -- Arbeitsplaner nur, wenn ein Tablet ihn zeigt (Aufträge seit 0.4.1 entfernt, s. Arbeitsplaner-Kommentar)
  guarded("Arbeitsplaner", updatePlan, dt or 0)
  if self.loadDt >= self.LOAD_LOG_MS then pcall(loadReport) end
end

-- ===== Diagnose: im Entwickler-Konsolenfenster "ccDumpFill" eingeben =====
function CraftConsoleHud:consoleDumpFill()
  local v = getVehicle()
  if v == nil then print("[CC] Kein gesteuertes Fahrzeug."); return end
  local vn = "?"; pcall(function() vn = v:getFullName() end)
  print("[CC] Fahrzeug: " .. tostring(vn))
  local combo = comboVehicles(v)
  print("[CC] Kombi-Fahrzeuge: " .. tostring(#combo))
  for idx, veh in ipairs(combo) do
    local nm = "?"; pcall(function() nm = veh:getFullName() end)
    local spec = veh.spec_fillUnit
    local cnt = (spec ~= nil and type(spec.fillUnits) == "table") and #spec.fillUnits or nil
    print(("[CC]  #%d  %s   fillUnits=%s"):format(idx, tostring(nm), tostring(cnt)))
    if cnt ~= nil then
      for i, fu in ipairs(spec.fillUnits) do
        print(("[CC]     unit %d  type=%s  lvl=%s  cap=%s"):format(
          i, tostring(fillTypeNameByIdx(fu.fillType)), tostring(fu.fillLevel), tostring(fu.capacity)))
      end
    end
  end
  return "ccDumpFill fertig - siehe log.txt"
end
addConsoleCommand("ccDumpFill", "CraftConsole Fuellstand-Diagnose", "consoleDumpFill", CraftConsoleHud)

-- ===== Diagnose der neuen Werte: "ccDumpExtra" =====
function CraftConsoleHud:consoleDumpExtra()
  local d = collect()
  print(("[CC] inVehicle=%s speed=%d dir=%s cruise=%d"):format(tostring(d.inVehicle), d.speed, d.dir, d.cruise))
  print(("[CC] Diesel=%d%%  AdBlue=%d%%  Betriebsstd=%d"):format(d.diesel, d.adblue, d.hours))
  print(("[CC] RPM=%d  Last=%d%%  Schaden=%d%%  Schmutz=%d%%"):format(d.rpm, d.load, d.damage, d.dirt))
  print(("[CC] Geraet='%s' on=%d low=%d  Fuelltyp='%s' fill=%d%%"):format(d.name, d.on, d.low, d.ftype, d.fill))
  print(("[CC] Rig='%s'  (nVorne nHinten sel  t0 t1 ...  -> vorne=links, hinten=rechts)"):format(d.rig))
  return "ccDumpExtra fertig - siehe log.txt (Werte mit Spiel vergleichen)"
end
addConsoleCommand("ccDumpExtra", "CraftConsole Zusatzwerte-Diagnose", "consoleDumpExtra", CraftConsoleHud)

-- ===== Diagnose der Erweiterung nach 0.95: "ccDumpMore" =====
function CraftConsoleHud:consoleDumpMore()
  local d = collect()
  local f = function(x) return tostring(x) end
  print(("[CC] Motor an=%s Gang='%s' Richtung=%s maxRPM=%s maxKmh=%s Temp=%s"):format(f(d.motorOn), f(d.gear), f(d.gearDir), f(d.maxRpm), f(d.maxSpeed), f(d.motorTemp)))
  print(("[CC] Tank %s/%s (%s)  AdBlue %s/%s"):format(f(d.fuelLevel), f(d.fuelCapacity), f(d.fuelType), f(d.defLevel), f(d.defCapacity)))
  print(("[CC] Licht Maske=%s Rundumleuchte=%s Blinker=%s Bremslicht=%s Handbremse=%s"):format(f(d.lightsMask), f(d.beacon), f(d.turnLight), f(d.brakeLight), f(d.handbrake)))
  print(("[CC] Helfer=%s Tempomat-Status=%s Schlupf=%s Arbeitsbreite=%s Marke='%s'"):format(f(d.aiActive), f(d.cruiseState), f(d.slip), f(d.workWidth), f(d.brand)))
  print(("[CC] Wetter='%s' %s°C  Periode=%s Tag %s/%s"):format(f(d.weather), f(d.temperature), f(d.period), f(d.dayInPeriod), f(d.daysPerPeriod)))
  for i, u in ipairs(d.units or {}) do
    print(("[CC] Einheit %d: '%s' Art=%s Seite=%s Tiefe=%s gewaehlt=%s | gesenkt=%s an=%s ausgeklappt=%s klappt=%s | kann klappen=%s senken=%s einschalten=%s | Zapfwelle=%s Breite=%s Modus=%s (%s)"):format(
      i, f(u.name), f(u.kind), f(u.side), f(u.depth), f(u.selected), f(u.lowered), f(u.on), f(u.unfolded), f(u.folding),
      f(u.canFold), f(u.canLower), f(u.canTurnOn), f(u.pto), f(u.width), f(u.workMode), f(u.workModes)))
    for j, fl in ipairs(u.fills or {}) do
      print(("[CC]    Fuellung %d: '%s' %s / %s"):format(j, f(fl.name), f(fl.level), f(fl.capacity)))
    end
  end
  return "ccDumpMore fertig - siehe log.txt (Werte mit Spiel vergleichen)"
end
addConsoleCommand("ccDumpMore", "CraftConsole: Diagnose der erweiterten Werte (Antrieb, Licht, Geraete einzeln)", "consoleDumpMore", CraftConsoleHud)

-- ===== Erkundungs-Werkzeuge: welche Daten gibt es ueberhaupt? (ccProbe...) =====
-- Anders als ccDumpFill/ccDumpExtra oben (die BEKANNTE, schon angebundene Werte gegenpruefen) helfen
-- diese Befehle, NEUE, noch nicht angebundene Spieldaten zu entdecken (Position/Karte, Wetter, weitere
-- Fahrzeug-Spezialisierungen). Ausgabe zeigt nur Skalarwerte + Tabellen-/Funktionsnamen (KEINE
-- Rekursion in Tabellen -- sonst uferlos bei g_currentMission-artigen Objekten) -- erst sehen WAS es
-- gibt, dann mit ccProbeSpec gezielt eine Spezialisierung tiefer anschauen.

local function dumpScalarFields(obj, indent)
  indent = indent or "  "
  local ok = pcall(function()
    local keys = {}
    for k in pairs(obj) do keys[#keys + 1] = k end
    table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)  -- feste Reihenfolge zum Vergleichen
    for _, k in ipairs(keys) do
      local v = obj[k]
      local t = type(v)
      if t == "number" or t == "string" or t == "boolean" then
        print(("[CC]%s%s = %s"):format(indent, tostring(k), tostring(v)))
      elseif t == "table" then
        local isSpec = type(k) == "string" and k:sub(1, 5) == "spec_"
        print(("[CC]%s%s = <Tabelle>%s"):format(indent, tostring(k), isSpec and "  (Spezialisierung -> ccProbeSpec)" or ""))
      end
      -- Funktionen (t == "function") bewusst uebersprungen -- nicht interessant fuer Datenauslese.
    end
  end)
  if not ok then print("[CC]" .. indent .. "(Fehler beim Lesen -- kein einfaches Datenobjekt)") end
end

-- Generischer Tiefen-Dump (12.08.2026) -- geht mehrere Ebenen automatisch durch, statt fuer jede neue
-- gefundene Unterstruktur eigenen Code zu brauchen (wie bisher bei subSectionData/segments). Schuetzt
-- sich gegen die zwei Gefahren generischer Rekursion: zyklische Referenzen (seen-Tabelle, per
-- Tabellen-IDENTITAET, nicht -Inhalt) und riesige Tabellen wie Density-Maps (maxEntries -- eine
-- Tabelle mit mehr Eintraegen wird NICHT betreten, nur ihre Groesse gemeldet).
local function dumpDeep(obj, indent, depth, seen, maxEntries)
  depth = depth or 4
  seen = seen or {}
  maxEntries = maxEntries or 40
  if depth <= 0 or seen[obj] then return end
  seen[obj] = true
  local ok = pcall(function()
    local keys = {}
    for k in pairs(obj) do keys[#keys + 1] = k end
    table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)
    for _, k in ipairs(keys) do
      local v = obj[k]
      local t = type(v)
      if t == "number" or t == "string" or t == "boolean" then
        print(("[CC]%s%s = %s"):format(indent, tostring(k), tostring(v)))
      elseif t == "table" then
        local n = 0
        for _ in pairs(v) do n = n + 1 end
        if n > maxEntries then
          print(("[CC]%s%s = <Tabelle, %d Einträge -- zu groß, nicht betreten>"):format(indent, tostring(k), n))
        elseif n == 0 then
          print(("[CC]%s%s = <leere Tabelle>"):format(indent, tostring(k)))
        else
          print(("[CC]%s%s = <Tabelle, %d Einträge>"):format(indent, tostring(k), n))
          dumpDeep(v, indent .. "  ", depth - 1, seen, maxEntries)
        end
      end
      -- Funktionen weiterhin bewusst uebersprungen.
    end
  end)
  if not ok then print("[CC]" .. indent .. "(Fehler beim Lesen)") end
end

-- Weltposition + Blickrichtung + grobe Kartenposition (0-1) + Farmland an der Position
function CraftConsoleHud:consoleProbePosition()
  local v = getVehicle()
  if v == nil then print("[CC] Kein gesteuertes Fahrzeug."); return "ccProbePosition: kein Fahrzeug" end

  local ok, x, y, z = pcall(getWorldTranslation, v.rootNode)   -- ✅ rootNode-Feld bereits in jointIsFront() bestätigt
  if ok then print(("[CC] Weltposition: x=%.2f y=%.2f z=%.2f"):format(x, y, z))
  else print("[CC] getWorldTranslation(v.rootNode) fehlgeschlagen.") end

  local okR, rx, ry, rz = pcall(getWorldRotation, v.rootNode)
  if okR then
    print(("[CC] Rotation: rx=%.3f ry=%.3f rz=%.3f  (Heading ~ %.1f Grad, aus ry)"):format(rx, ry, rz, math.deg(ry) % 360))
  else
    print("[CC] getWorldRotation(v.rootNode) fehlgeschlagen.")
  end

  if ok then
    local okT, terrainSize = pcall(function() return g_currentMission.terrainSize end)
    if okT and type(terrainSize) == "number" and terrainSize > 0 then
      print(("[CC] Kartenposition (0-1): mapX=%.4f mapZ=%.4f  (terrainSize=%.0f)"):format(
        (x + terrainSize / 2) / terrainSize, (z + terrainSize / 2) / terrainSize, terrainSize))
    else
      print("[CC] g_currentMission.terrainSize nicht gefunden -- Kartenumrechnung nicht möglich.")
    end

    -- ⚠️ Exakter Funktionsname unsicher (FS25-Forum nennt beide Varianten je nach Version) -- beide probieren.
    local found = false
    for _, fname in ipairs({ "getFarmlandIdAtWorldPosition", "getFarmlandAtWorldPosition" }) do
      if not found and g_farmlandManager ~= nil and g_farmlandManager[fname] ~= nil then
        local fOk, fRes = pcall(function() return g_farmlandManager[fname](g_farmlandManager, x, z) end)
        if fOk then print("[CC] Farmland an Position (" .. fname .. "): " .. tostring(fRes)); found = true end
      end
    end
    if not found then print("[CC] Keine der versuchten FarmlandManager-Funktionen hat funktioniert.") end
  end

  return "ccProbePosition fertig - siehe log.txt"
end
addConsoleCommand("ccProbePosition", "CraftConsole: Position/Rotation/Karte des aktuellen Fahrzeugs", "consoleProbePosition", CraftConsoleHud)

-- Alle Top-Level-Felder + vorhandenen Spezialisierungen des aktuellen Fahrzeugs UND aller angehaengten
-- Geraete (12.08.2026 erweitert -- vorher nur das direkt gesteuerte Fahrzeug, dadurch waren z.B. die
-- Sprueher-eigenen Spezialisierungen der angehaengten Hardi-Spritze nie sichtbar, nur die des Traktors).
function CraftConsoleHud:consoleProbeVehicle()
  local v = getVehicle()
  if v == nil then print("[CC] Kein gesteuertes Fahrzeug."); return "ccProbeVehicle: kein Fahrzeug" end
  for _, veh in ipairs(comboVehicles(v)) do
    local nm = "?"; pcall(function() nm = veh:getFullName() end)
    print("[CC] Fahrzeug: " .. tostring(nm))
    dumpScalarFields(veh, "  ")
  end
  return "ccProbeVehicle fertig - siehe log.txt (spec_xxx-Zeilen mit ccProbeSpec <name> vertiefen)"
end
addConsoleCommand("ccProbeVehicle", "CraftConsole: Top-Level-Felder + Spezialisierungen von Fahrzeug + allen Anbaugeräten", "consoleProbeVehicle", CraftConsoleHud)

-- Eine einzelne Spezialisierung (z.B. "spec_motorized") eine Ebene tief anzeigen -- durchsucht jetzt
-- ebenfalls Fahrzeug + alle Anbaugeraete (gleicher Grund wie bei ccProbeVehicle oben) statt nur das
-- direkt gesteuerte Fahrzeug, zeigt bei jedem Fund den Namen des jeweiligen Fahrzeugs/Geraets dazu.
-- ⚠️ Parameter-Übergabe von addConsoleCommand in FS25 nicht verifiziert (Konsolen-Argumente sollten
-- als zusätzliche String-Parameter nach self ankommen) -- defensiv mit Typ-/Leer-Check abgefangen.
function CraftConsoleHud:consoleProbeSpec(specName)
  if type(specName) ~= "string" or specName == "" then
    print("[CC] Bitte Namen angeben, z.B.: ccProbeSpec spec_motorized")
    return "ccProbeSpec: kein Name angegeben"
  end
  local v = getVehicle()
  if v == nil then print("[CC] Kein gesteuertes Fahrzeug."); return "ccProbeSpec: kein Fahrzeug" end
  local foundAny = false
  for _, veh in ipairs(comboVehicles(v)) do
    local spec = veh[specName]
    if spec ~= nil then
      foundAny = true
      local nm = "?"; pcall(function() nm = veh:getFullName() end)
      print(("[CC] %s -- %s:"):format(tostring(nm), specName))
      dumpScalarFields(spec, "  ")
    end
  end
  if not foundAny then print("[CC] '" .. specName .. "' existiert an Fahrzeug/Geräten nicht.") end
  return "ccProbeSpec fertig - siehe log.txt"
end
addConsoleCommand("ccProbeSpec", "CraftConsole: eine Spezialisierung von Fahrzeug/Anbaugeräten eine Ebene tief anzeigen (Name als Argument)", "consoleProbeSpec", CraftConsoleHud)

-- Wie ccProbeSpec, geht aber automatisch MEHRERE Ebenen tief (dumpDeep statt dumpScalarFields) --
-- fuer Faelle, in denen eine Ebene nicht reicht (z.B. sectionsLeft/sectionsRight, die selbst wieder
-- verschachtelt sein koennten). Pfad mit Punkten fuer einen Unterpfad, z.B.
-- "spec_variableWorkWidth.sectionsLeft" -- steigt dann direkt dort ein statt bei der ganzen Spec.
-- 0.7.1 (23.10.2026): Schlüssel mit Punkt im Namen gehen jetzt auch -- Spezialisierungen aus Mods heißen z.B.
-- "spec_FS25_precisionFarming.extendedSprayer" (ein einziger Schlüssel). Je Ebene wird zuerst der längste
-- zusammengesetzte Name probiert, dann kürzere; Zahlen-Schlüssel ("sprayerEffectsBySection.0") auch als Zahl.
-- Nur Tabellen lesen, nichts aufrufen.
local function probePathGet(node, key)
  local ok, val = pcall(function() return node[key] end)
  if ok and val ~= nil then return val end
  local num = tonumber(key)
  if num ~= nil then
    ok, val = pcall(function() return node[num] end)
    if ok then return val end
  end
  return nil
end

local function probeResolvePath(root, parts)
  local node, i = root, 1
  while i <= #parts do
    if type(node) ~= "table" then return nil end
    local found = nil
    for j = #parts, i, -1 do
      found = probePathGet(node, table.concat(parts, ".", i, j))
      if found ~= nil then i = j + 1; break end
    end
    if found == nil then return nil end
    node = found
  end
  return node
end

function CraftConsoleHud:consoleProbeDeep(path)
  if type(path) ~= "string" or path == "" then
    print("[CC] Bitte Pfad angeben, z.B.: ccProbeDeep spec_variableWorkWidth.sectionsLeft")
    return "ccProbeDeep: kein Pfad angegeben"
  end
  local v = getVehicle()
  if v == nil then print("[CC] Kein gesteuertes Fahrzeug."); return "ccProbeDeep: kein Fahrzeug" end
  local parts = {}
  for part in path:gmatch("[^%.]+") do parts[#parts + 1] = part end
  local foundAny = false
  for _, veh in ipairs(comboVehicles(v)) do
    local node = probeResolvePath(veh, parts)
    if node ~= nil then
      foundAny = true
      local nm = "?"; pcall(function() nm = veh:getFullName() end)
      print(("[CC] %s -- %s:"):format(tostring(nm), path))
      if type(node) == "table" then
        dumpDeep(node, "  ", 4, {})
      else
        print("[CC]   = " .. tostring(node))
      end
    end
  end
  if not foundAny then print("[CC] '" .. path .. "' existiert an Fahrzeug/Geräten nicht.") end
  return "ccProbeDeep fertig - siehe log.txt"
end
addConsoleCommand("ccProbeDeep", "CraftConsole: einen Pfad (z.B. spec_x.feldY) mehrere Ebenen tief anzeigen", "consoleProbeDeep", CraftConsoleHud)

-- Alles auf einmal: Position/Karte + Wetter/Wirtschaft + Fahrzeug und ALLE Anbaugeraete VOLLSTAENDIG
-- rekursiv (dumpDeep statt nur Namen wie ccProbeVehicle) -- ersetzt das bisherige muehsame
-- "ccProbeVehicle -> Namen ablesen -> einzeln ccProbeSpec/ccProbeDeep" fuer eine erste grobe Sichtung.
-- Kann eine SEHR lange Ausgabe produzieren (dutzende Spezialisierungen x mehrere Ebenen je Fahrzeug/
-- Geraet) -- dumpDeep()s bestehender Schutz (Zyklen-Erkennung, Obergrenze fuer Riesentabellen wie
-- Density-Maps) greift unveraendert, das faengt die schlimmsten Faelle ab.
function CraftConsoleHud:consoleProbeAll()
  local v = getVehicle()
  if v == nil then print("[CC] Kein gesteuertes Fahrzeug."); return "ccProbeAll: kein Fahrzeug" end

  print("[CC] ===== Position/Karte =====")
  local px, pz, heading = getPositionAndHeading(v)
  print(("[CC] x=%s z=%s heading=%s"):format(tostring(px), tostring(pz), tostring(heading)))
  local terrainSize, farmlandId = getTerrainSizeAndFarmland(px, pz)
  print(("[CC] terrainSize=%s farmlandId=%s"):format(tostring(terrainSize), tostring(farmlandId)))

  print("[CC] ===== Wetter/Wirtschaft =====")
  local okEnv, env = pcall(function() return g_currentMission.environment end)
  if okEnv and env ~= nil then dumpDeep(env, "  ", 1, {}) end
  local okMoney, money = pcall(function() return g_currentMission:getMoney() end)
  print(("[CC] money=%s"):format(tostring(okMoney and money or "n/a")))

  print("[CC] ===== Fahrzeug + alle Anbaugeraete, VOLLSTAENDIG =====")
  for _, veh in ipairs(comboVehicles(v)) do
    local nm = "?"; pcall(function() nm = veh:getFullName() end)
    print("[CC] ##### " .. tostring(nm) .. " #####")
    dumpDeep(veh, "  ", 4, {})
  end

  return "ccProbeAll fertig - siehe log.txt (lang! am besten nach '#####' suchen, um zwischen den Geraeten zu springen)"
end
addConsoleCommand("ccProbeAll", "CraftConsole: ALLES auf einmal -- Position/Wetter/Wirtschaft + Fahrzeug+Anbaugeraete vollstaendig rekursiv", "consoleProbeAll", CraftConsoleHud)

-- Wegpunkte/Struktur der aktuellen GPS-Spurfuehrung -- fuer eine spaetere Karten-/Spurlinien-Anzeige
-- in ControlHub (Hendriks Idee 12.08.2026: Karte mit Bereits-bearbeitet-Markierung + Spurfuehrungslinie
-- zum Nachfahren). Zeigt die beiden Kurs-Tabellen aus spec_aiAutomaticSteering (s. ccProbeSpec-Fund)
-- eine Ebene tiefer als dumpScalarFields() alleine wuerde, inkl. der ersten paar Eintraege jeder
-- listenartigen Unter-Tabelle (z.B. Wegpunkte) -- absichtlich nur die ersten 3, damit die Ausgabe bei
-- einem Kurs mit vielen Punkten nicht uferlos wird.
function CraftConsoleHud:consoleProbeSteeringCourse()
  local v = getVehicle()
  if v == nil then print("[CC] Kein gesteuertes Fahrzeug."); return "ccProbeSteeringCourse: kein Fahrzeug" end
  local spec = v.spec_aiAutomaticSteering
  if spec == nil then
    print("[CC] spec_aiAutomaticSteering existiert an diesem Fahrzeug nicht.")
    return "ccProbeSteeringCourse: nicht gefunden"
  end
  for _, fieldName in ipairs({ "steeringFieldCourse", "lastActiveSteeringFieldCourse" }) do
    local course = spec[fieldName]
    if course == nil then
      print(("[CC] %s ist nil (evtl. gerade kein aktiver Kurs -- Lenksystem einschalten und erneut versuchen)."):format(fieldName))
    else
      print(("[CC] %s:"):format(fieldName))
      dumpScalarFields(course, "  ")
      for k, val in pairs(course) do
        if type(val) == "table" then
          local count = 0
          for _ in pairs(val) do count = count + 1 end
          print(("[CC]   %s ist eine Tabelle mit %d Einträgen, erste 3:"):format(tostring(k), count))
          local shown = 0
          for idx, entry in pairs(val) do
            if shown >= 3 then break end
            if type(entry) == "table" then
              print(("[CC]     -- Eintrag %s --"):format(tostring(idx)))
              dumpScalarFields(entry, "      ")
            else
              print(("[CC]     %s = %s"):format(tostring(idx), tostring(entry)))
            end
            shown = shown + 1
          end
        end
      end
      -- 12.08.2026 empirisch gefunden: "segments" ist die Liste der eigentlichen Spurlinien-Abschnitte,
      -- die ECHTEN Wegpunkte stecken aber nochmal eine Ebene tiefer in segments[i].positions -- dafuer
      -- extra, statt den generischen Drilldown oben noch komplizierter zu machen.
      if type(course.segments) == "table" then
        print("[CC]   segments[].positions (erste 2 Segmente, je erste 4 Punkte):")
        local shownSeg = 0
        for segIdx, seg in pairs(course.segments) do
          if shownSeg < 2 and type(seg) == "table" and type(seg.positions) == "table" then
            print(("[CC]     Segment %s:"):format(tostring(segIdx)))
            local shownPt = 0
            for ptIdx, pt in pairs(seg.positions) do
              if shownPt >= 4 then break end
              if type(pt) == "table" then
                local parts = {}
                for pk, pv in pairs(pt) do parts[#parts + 1] = tostring(pk) .. "=" .. tostring(pv) end
                print(("[CC]       Punkt %s: %s"):format(tostring(ptIdx), table.concat(parts, ", ")))
              else
                print(("[CC]       %s = %s"):format(tostring(ptIdx), tostring(pt)))
              end
              shownPt = shownPt + 1
            end
            shownSeg = shownSeg + 1
          end
        end
      end
    end
  end
  return "ccProbeSteeringCourse fertig - siehe log.txt"
end
addConsoleCommand("ccProbeSteeringCourse", "CraftConsole: Wegpunkte/Struktur der aktuellen GPS-Spurführung", "consoleProbeSteeringCourse", CraftConsoleHud)

-- Umwelt/Wetter/Uhrzeit + Versuch eines Wirtschafts-/Kontostand-Zugriffs
function CraftConsoleHud:consoleProbeWorld()
  local okEnv, env = pcall(function() return g_currentMission.environment end)
  if okEnv and env ~= nil then
    print("[CC] g_currentMission.environment:")
    dumpScalarFields(env, "  ")
  else
    print("[CC] g_currentMission.environment nicht gefunden.")
  end

  local okMoney, money = pcall(function() return g_currentMission:getMoney() end)  -- ⚠️ Funktionsname ungeprüft
  if okMoney then print("[CC] g_currentMission:getMoney() = " .. tostring(money))
  else print("[CC] g_currentMission:getMoney() nicht verfügbar (Funktionsname in FS25 prüfen).") end

  return "ccProbeWorld fertig - siehe log.txt"
end
addConsoleCommand("ccProbeWorld", "CraftConsole: Umwelt/Wetter + Wirtschaft (Erkundung)", "consoleProbeWorld", CraftConsoleHud)

-- Arbeitsbereiche/Teilbreiten von Fahrzeug + allen Anbaugeraeten (spec_workArea.workAreas ist eine
-- LISTE -- dumpScalarFields() allein wuerde nur "workAreas = <Tabelle>" zeigen, deshalb hier eigens
-- pro Eintrag aufgeloest). ⚠️ Laut GDN-Doku wird die tatsaechliche Breite meist ueber den ABSTAND
-- zwischen "start"/"width"-Knoten im 3D-Modell definiert, nicht als einfache gespeicherte Zahl -- falls
-- start/width als Knoten-IDs vorliegen, wird hier zusaetzlich der Weltabstand in Metern berechnet.
function CraftConsoleHud:consoleProbeWorkAreas()
  local v = getVehicle()
  if v == nil then print("[CC] Kein gesteuertes Fahrzeug."); return "ccProbeWorkAreas: kein Fahrzeug" end
  local foundAny = false
  for _, veh in ipairs(comboVehicles(v)) do
    local spec = veh.spec_workArea
    if spec ~= nil and type(spec.workAreas) == "table" and #spec.workAreas > 0 then
      foundAny = true
      local nm = "?"; pcall(function() nm = veh:getFullName() end)
      print(("[CC] %s -- %d Arbeitsbereich(e):"):format(tostring(nm), #spec.workAreas))
      for i, wa in ipairs(spec.workAreas) do
        print(("[CC]   -- Arbeitsbereich %d --"):format(i))
        dumpScalarFields(wa, "      ")
        -- 0.7.3: getIsWorkAreaActive()/getIsTypedWorkAreaActive() werden hier nicht mehr aufgerufen (Durchsicht
        -- 24.10.2026). Seit 0.7 kommt der Zustand der Teilbreiten aus Feldern (spec_variableWorkWidth.sections[i]
        -- .isActive, unit#sec); Aufrufe von Spiel-Funktionen mit selbst gewählten Argumenten gibt es in der Mod nicht.
        if type(wa.start) == "number" and type(wa.width) == "number" then
          local ok1, x1, y1, z1 = pcall(getWorldTranslation, wa.start)
          local ok2, x2, y2, z2 = pcall(getWorldTranslation, wa.width)
          if ok1 and ok2 then
            local dist = math.sqrt((x1 - x2) ^ 2 + (y1 - y2) ^ 2 + (z1 - z2) ^ 2)
            print(("[CC]       -> Abstand start/width-Knoten: %.2f m (evtl. die tatsächliche Arbeitsbreite)"):format(dist))
          end
        end
        -- 12.08.2026 empirisch gefunden: die einzelnen Teilbreiten-Zustaende (Section Control) und der
        -- Bodentyp stecken NOCH eine Ebene tiefer als dumpScalarFields() oben zeigt -- subSectionData
        -- ist vermutlich eine LISTE (numSubSections vergleichen), deshalb jeden Tabellen-Eintrag darin
        -- zusaetzlich aufloesen (soilTypes analog, falls interessant).
        if type(wa.subSectionData) == "table" then
          print("[CC]       subSectionData:")
          dumpScalarFields(wa.subSectionData, "        ")
          for idx, entry in pairs(wa.subSectionData) do
            if type(entry) == "table" then
              print(("[CC]         -- Teilbereich %s --"):format(tostring(idx)))
              dumpScalarFields(entry, "          ")
            end
          end
        end
        if type(wa.soilTypes) == "table" then
          print("[CC]       soilTypes:")
          dumpScalarFields(wa.soilTypes, "        ")
        end
      end
    end
  end
  if not foundAny then print("[CC] Kein spec_workArea an Fahrzeug oder angehängten Geräten gefunden.") end
  return "ccProbeWorkAreas fertig - siehe log.txt"
end
addConsoleCommand("ccProbeWorkAreas", "CraftConsole: Arbeitsbereiche/Teilbreiten von Fahrzeug + allen Anbaugeräten", "consoleProbeWorkAreas", CraftConsoleHud)

-- Listet Funktionsnamen (KEINE Aufrufe) eines Objekts, optional nach Stichwort gefiltert. Bisherige
-- dumpScalarFields()/dumpDeep()-Aufrufe haben Funktionen bewusst übersprungen ("nicht interessant für
-- Datenauslese") -- das war ein blinder Fleck: der Live-Zustand einer abgeschalteten Teilbreite könnte
-- über eine abrufbare GETTER-Methode laufen statt über ein gespeichertes Feld (bisherige Kandidaten
-- subSectionData.isValid/isUncovered lieferten empirisch immer false, unabhängig vom echten Zustand).
local function dumpFunctionNames(obj, indent, keywords)
  local ok = pcall(function()
    local keys = {}
    for k in pairs(obj) do keys[#keys + 1] = k end
    table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)
    for _, k in ipairs(keys) do
      if type(k) == "string" and type(obj[k]) == "function" then
        local matches = keywords == nil
        if not matches then
          local lower = k:lower()
          for _, kw in ipairs(keywords) do
            if lower:find(kw, 1, true) then matches = true; break end
          end
        end
        if matches then print(("[CC]%sFUNKTION: %s()"):format(indent, k)) end
      end
    end
  end)
  if not ok then print("[CC]" .. indent .. "(Fehler beim Auflisten der Funktionen)") end
end

-- Neuer, selbstständiger Scan (12.08.2026, Hendriks Wunsch "nicht alles einzeln erfragen, er soll
-- selbst scannen"): sucht auf Fahrzeug + allen Anbaugeräten nach Methoden mit einschlägigen
-- Namensbestandteilen (section/area/active/coverage/width/zone/spray) -- sowohl auf dem Objekt SELBST
-- (FS25-Spezialisierungs-API registriert Methoden meist dort, nicht im spec_*-Datentable) als auch in
-- spec_workArea/spec_sprayer. Listet NUR die Namen auf, ruft NICHTS automatisch auf -- ein früherer
-- Versuch, Treffer automatisch mit geratenen Argumenten aufzurufen, hat das Spiel abstürzen lassen
-- (pcall schützt nur vor Lua-Fehlern, nicht vor Abstürzen tief im Engine-Code bei falschen Argumenten).
-- Gefundene Kandidaten werden künftig einzeln und gezielt aufgerufen, nicht mehr blind in Serie.
function CraftConsoleHud:consoleProbeSectionActive()
  local v = getVehicle()
  if v == nil then print("[CC] Kein gesteuertes Fahrzeug."); return "ccProbeSectionActive: kein Fahrzeug" end
  local keywords = { "section", "area", "active", "coverage", "width", "zone", "spray" }
  for _, veh in ipairs(comboVehicles(v)) do
    local nm = "?"; pcall(function() nm = veh:getFullName() end)
    print("[CC] ##### " .. tostring(nm) .. " #####")

    print("[CC]   -- Methoden auf dem Fahrzeug/Anbaugerät selbst --")
    dumpFunctionNames(veh, "     ", keywords)

    for _, specName in ipairs({ "spec_workArea", "spec_sprayer" }) do
      local spec = veh[specName]
      if spec ~= nil then
        print(("[CC]   -- Methoden in %s --"):format(specName))
        dumpFunctionNames(spec, "     ", nil)
      end
    end
  end
  return "ccProbeSectionActive fertig - siehe log.txt (nach '#####' und 'FUNKTION:' suchen)"
end
addConsoleCommand("ccProbeSectionActive", "CraftConsole: listet Methodennamen, die evtl. mit Teilbreiten-An/Aus zu tun haben (nur auflisten, ruft nichts auf)", "consoleProbeSectionActive", CraftConsoleHud)

-- Erkundung für GPS-Menü und Planer (0.4.3, 22.10.2026, Umsetzungsplan Schritt 0). Liest NUR Felder und
-- nutzt nur Aufrufe, die der Mod schon bestätigt verwendet: getFullName, getWorldTranslation und
-- localDirectionToWorld(node, 0, 0, 1) auf rootNode bzw. Arbeitsbereich-Knoten (wie ccProbeWorkAreas),
-- getIsServer/getIsClient (wie loadMap). Keine neuen Spielfunktionen, keine geratenen Argumente.
-- Je Gerät: Kupplungsart am Zugfahrzeug und am Gerät (jointType), Lage zum Fahrzeug (längs/quer/Winkel),
-- Arbeitsbereiche mit Lage, Teilbereiche (Teilbreiten) nur als gelesene Felder. Dazu die Angaben zum
-- laufenden Spielstand (Karte, Spielstand-Nummer/-Ordner, Einzel-/Mehrspieler) für den Planer.
-- Felder mit "pass"/"token"/"secret" im Namen werden nie ausgegeben (Mehrspieler-Passwörter).

local function dumpScalarFieldsSafe(obj, indent)
  local ok = pcall(function()
    local keys = {}
    for k in pairs(obj) do keys[#keys + 1] = k end
    table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)
    for _, k in ipairs(keys) do
      local lower = tostring(k):lower()
      if lower:find("pass", 1, true) or lower:find("token", 1, true) or lower:find("secret", 1, true) then
        print(("[CC]%s%s = <ausgeblendet>"):format(indent, tostring(k)))
      else
        local v = obj[k]
        local t = type(v)
        if t == "number" or t == "string" or t == "boolean" then
          print(("[CC]%s%s = %s"):format(indent, tostring(k), tostring(v)))
        elseif t == "table" then
          print(("[CC]%s%s = <Tabelle>"):format(indent, tostring(k)))
        end
      end
    end
  end)
  if not ok then print("[CC]" .. indent .. "(Fehler beim Lesen)") end
end

-- Name einer Kupplungsart aus den Konstanten der Spielklasse AttacherJoints (nur Tabellen lesen)
local function jointTypeName(jt)
  local name = nil
  pcall(function()
    if type(AttacherJoints) ~= "table" or jt == nil then return end
    if type(AttacherJoints.jointTypeNameToInt) == "table" then
      for n, i in pairs(AttacherJoints.jointTypeNameToInt) do if i == jt then name = tostring(n) end end
    end
    if name == nil then
      for k, val in pairs(AttacherJoints) do
        if type(k) == "string" and k:sub(1, 10) == "JOINTTYPE_" and val == jt then name = k end
      end
    end
  end)
  return name or "?"
end

-- Punkt (x/z) relativ zum Fahrzeug: längs = in Fahrtrichtung (+ = vor dem Fahrzeug-Nullpunkt), quer = rechtwinklig
-- dazu. Welche Seite bei "quer" positiv ist, zeigt der Test im Spiel (Gerät mit bekanntem Versatz).
local function relToVehicle(x, z, vx, vz, fx, fz)
  local dx, dz = x - vx, z - vz
  return dx * fx + dz * fz, dx * fz - dz * fx
end

-- Winkel zwischen zwei Vorwärtsrichtungen in Grad (für den Nachlauf angehängter Geräte)
local function angleBetween(fx1, fz1, fx2, fz2)
  local atan2 = math.atan2 or math.atan   -- FS25 = Lua 5.1 (atan2), Testumgebung Lua 5.4+ (atan)
  return math.deg(atan2(fx1 * fz2 - fz1 * fx2, fx1 * fx2 + fz1 * fz2))
end

function CraftConsoleHud:consoleProbeAttach()
  print("[CC] ===== ccProbeAttach: Spielstand (für den Planer) =====")
  pcall(function()
    local mi = g_currentMission.missionInfo
    if mi == nil then print("[CC] missionInfo nicht vorhanden."); return end
    print("[CC] missionInfo:")
    dumpScalarFieldsSafe(mi, "  ")
    if type(mi.map) == "table" then
      print("[CC] missionInfo.map:")
      dumpScalarFieldsSafe(mi.map, "  ")
    end
  end)
  pcall(function()
    local md = g_currentMission.missionDynamicInfo
    if md ~= nil then
      print("[CC] missionDynamicInfo:")
      dumpScalarFieldsSafe(md, "  ")
    end
  end)
  pcall(function()   -- ⚠️ FS25, wie in loadMap()
    print(("[CC] getIsServer=%s getIsClient=%s"):format(tostring(g_currentMission:getIsServer()), tostring(g_currentMission:getIsClient())))
  end)

  local v = getVehicle()
  if v == nil then
    print("[CC] Kein gesteuertes Fahrzeug -- Geräte-Teil übersprungen.")
    return "ccProbeAttach: Spielstand steht im log.txt; für die Geräte bitte in ein Fahrzeug mit Gerät steigen und erneut ausführen"
  end
  local vx, vz, _, fx, fz = getPositionAndHeading(v)
  if vx == nil then print("[CC] Fahrzeugposition nicht lesbar."); return "ccProbeAttach: Fahrzeugposition nicht lesbar" end
  local fl = math.sqrt(fx * fx + fz * fz)
  if fl > 0 then fx, fz = fx / fl, fz / fl end
  local vname = "?"; pcall(function() vname = v:getFullName() end)
  print(("[CC] ===== ccProbeAttach: Geräte an %s (Vorwärts x=%.3f z=%.3f) ====="):format(tostring(vname), fx, fz))

  local count = 0
  local function walk(vehicle, side, depth)
    local spec = vehicle.spec_attacherJoints
    if spec == nil or type(spec.attachedImplements) ~= "table" or depth > 4 then return end
    for _, impl in ipairs(spec.attachedImplements) do
      local obj = impl.object
      if obj ~= nil then
        count = count + 1
        local mySide = side
        if side == "main" then mySide = jointIsFront(vehicle, impl.jointDescIndex) and "front" or "rear" end
        local nm = "?"; pcall(function() nm = obj:getFullName() end)
        print(("[CC] ##### Gerät %d: %s (Seite %s, Tiefe %d) #####"):format(count, tostring(nm), mySide, depth))
        print("[CC]   Eintrag in attachedImplements:")
        dumpScalarFieldsSafe(impl, "     ")

        local joint = nil
        pcall(function() joint = spec.attacherJoints[impl.jointDescIndex] end)
        if joint ~= nil then
          print(("[CC]   Anbaupunkt am Zugfahrzeug: jointType=%s (%s)"):format(tostring(joint.jointType), jointTypeName(joint.jointType)))
          dumpScalarFieldsSafe(joint, "     ")
        else
          print("[CC]   Anbaupunkt am Zugfahrzeug nicht gefunden.")
        end
        pcall(function()
          local sa = obj.spec_attachable
          if sa == nil or type(sa.inputAttacherJoints) ~= "table" then return end
          local ij = impl.inputJointDescIndex ~= nil and sa.inputAttacherJoints[impl.inputJointDescIndex] or nil
          if ij ~= nil then
            print(("[CC]   Anbaupunkt am Gerät: jointType=%s (%s)"):format(tostring(ij.jointType), jointTypeName(ij.jointType)))
            dumpScalarFieldsSafe(ij, "     ")
          else
            print(("[CC]   Gerät hat %d Anbaupunkte, verwendeter nicht eindeutig."):format(#sa.inputAttacherJoints))
          end
        end)

        local okP, ox, _, oz = pcall(getWorldTranslation, obj.rootNode)
        local okF, gx, _, gz = pcall(localDirectionToWorld, obj.rootNode, 0, 0, 1)
        if okP and type(ox) == "number" then
          local along, across = relToVehicle(ox, oz, vx, vz, fx, fz)
          local ang = "?"
          if okF and type(gx) == "number" and type(gz) == "number" then ang = ("%.1f"):format(angleBetween(fx, fz, gx, gz)) end
          print(("[CC]   Lage Gerät (rootNode): längs %.2f m, quer %.2f m, Winkel zum Fahrzeug %s Grad"):format(along, across, ang))
        else
          print("[CC]   Gerätelage nicht lesbar.")
        end

        pcall(function()
          local ws = obj.spec_workArea
          if ws == nil or type(ws.workAreas) ~= "table" or #ws.workAreas == 0 then print("[CC]   keine Arbeitsbereiche"); return end
          for i, wa in ipairs(ws.workAreas) do
            local parts = {}
            for _, key in ipairs({ "start", "width", "height" }) do
              if type(wa[key]) == "number" then
                local okN, nx, _, nz = pcall(getWorldTranslation, wa[key])
                if okN and type(nx) == "number" then
                  local a, c = relToVehicle(nx, nz, vx, vz, fx, fz)
                  parts[#parts + 1] = ("%s längs %.2f / quer %.2f"):format(key, a, c)
                end
              end
            end
            local subs = 0
            if type(wa.subSectionData) == "table" then for _ in pairs(wa.subSectionData) do subs = subs + 1 end end
            print(("[CC]   Arbeitsbereich %d: type=%s · %s · Teilbereiche %d"):format(i, tostring(wa.type), table.concat(parts, "; "), subs))
            if type(wa.subSectionData) == "table" then
              for idx, entry in pairs(wa.subSectionData) do
                if type(entry) == "table" then
                  print(("[CC]     -- Teilbereich %s --"):format(tostring(idx)))
                  dumpScalarFieldsSafe(entry, "       ")
                end
              end
            end
          end
        end)

        walk(obj, mySide, depth + 1)
      end
    end
  end
  walk(v, "main", 1)
  if count == 0 then print("[CC] Keine Geräte angehängt.") end

  print("[CC] ===== Methodennamen zu Teilbreiten (wie ccProbeSectionActive, nur Namen) =====")
  self:consoleProbeSectionActive()
  return "ccProbeAttach fertig -- bitte log.txt schicken (nach '=====' und '#####' suchen)"
end
addConsoleCommand("ccProbeAttach", "CraftConsole: Kupplungsart, Lage, Arbeitsbereiche der Geräte + Spielstand (nur lesen, für GPS-Menü und Planer)", "consoleProbeAttach", CraftConsoleHud)

function CraftConsoleHud:loadMap(name)
  -- Dedizierter (gemieteter) Server: dort sitzt kein Spieler und kein ControlHub -- nichts schreiben.
  -- g_client == nil allein reicht nicht (gemietete Server haben teils einen Client-Teil), daher zusätzlich
  -- g_dedicatedServer bzw. "Server, aber kein Client" prüfen.
  -- Auf den PCs der Mitspieler läuft die Mod normal (jeder liest sein eigenes Fahrzeug).
  -- 0.7.9 (Mehrspieler-Prüfung R3): Ein Gast ist nie Server -- dann nie abschalten, auch wenn g_dedicatedServer gesetzt
  -- sein sollte. Die übrigen Merkmale zählen nur, wenn dieser PC Server ist oder getIsServer nicht antwortet.
  local isServer, isClient = nil, nil
  pcall(function()
    isServer = g_currentMission:getIsServer()   -- ⚠️ FS25, schon bis 0.7.8 genutzt
    isClient = g_currentMission:getIsClient()
  end)
  if isServer ~= true and isServer ~= false then isServer = nil end
  local dedicated
  if isServer == false then
    dedicated = false
  else
    dedicated = g_client == nil or g_dedicatedServer ~= nil or (isServer == true and isClient == false)
  end
  CraftConsoleHud.isServer = isServer
  CraftConsoleHud.disabled = dedicated == true
  -- 0.5.2: Sitzungskennung (Zeit seit Programmstart in ms + Zufallszahl) -- nur Lua-Standard und getTimeSec, das die
  -- Mod für die Lastmessung schon nutzt
  pcall(function()
    local ms = math.floor(((getTimeSec ~= nil and getTimeSec()) or 0) * 1000)
    CraftConsoleHud.session = string.format("%d-%d", ms % 1000000000, math.random(1000, 9999))
  end)
  CraftConsoleHud.roadsDone = false   -- 0.6: Straßennetz für diesen Spielstand neu schreiben
  CraftConsoleHud.roadsTimer = 0
  CraftConsoleHud.roadsJob = nil      -- 0.7.5: angefangenes Abtasten des vorigen Spielstands verwerfen
  CraftConsoleHud.inputDone = false   -- 0.7.6: Aktionen des Spiels für diesen Spielstand neu schreiben
  CraftConsoleHud.inputTimer = 0
  -- 0.7.3: Karte für diesen Spielstand neu schreiben (mit neuer Sitzung), auch bei gleicher Signatur
  CraftConsoleHud.mapSig = nil
  CraftConsoleHud.polyCache = {}
  CraftConsoleHud.mapTimer = CraftConsoleHud.MAP_CHECK_MS - 3000
  if CraftConsoleHud.disabled then
    print("[CraftConsoleHud] Dedizierter Server erkannt -- Telemetrie aus (läuft nur auf den Spieler-PCs).")
  else
    print("[CraftConsoleHud] geladen.")
  end
end

addModEventListener(CraftConsoleHud)   -- ✅ Standard-Registrierung
