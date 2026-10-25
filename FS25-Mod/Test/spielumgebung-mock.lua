--[[
  Nachgebaute FS25-Spielumgebung zum Testen von CraftConsoleHud.lua OHNE Spiel (21.10.2026).
  Bildet nur das nach, was die Mod anfasst: XML-Funktionen (schreiben echte Dateien), Fahrzeug mit
  Frontmähwerk + Sämaschine, Umwelt, Felder/Höfe/Fahrzeuge (Karte), Bodenzustand (Planer), Aufträge.
  Werte und Datenformen orientieren sich an der GDN LuaDoc und an Proben aus dem Spiel -- ob das Spiel es
  genauso liefert, zeigt erst der Test im Spiel.

  Aufruf (Lua 5.4+ auf dem Mac, `brew install lua`):
    lua spielumgebung-mock.lua <Pfad zu CraftConsoleHud.lua> <Ausgabeordner> [Szenario]
  Szenarien: (leer) = im Fahrzeug (Einzelspiel/Gastgeber) · zufuss · dedi (dedizierter Server) · gast (Mitspieler bei
             einem Gastgeber; 0.7.9: g_dedicatedServer absichtlich gesetzt) · kursweg (Spurführung geht aus)
             · planlive (0.5.1: auf eigenes Feld fahren und wieder runter -- Planer-Merker "live")
             · ohnehub (0.5.2: Sparmodus, wenn ControlHub kein Lebenszeichen mehr schreibt)
  Ergebnis: die Dateien der Mod im Ausgabeordner (modSettings/FS25_CraftConsoleHUD/...), Konsolenausgabe.
  Ab 0.5.1 prüft der Ablauf unten einige Werte selbst ("[TEST] OK/FEHLER"); bei einem Fehler endet Lua mit Code 1.
]]
local MOD, OUT, SCEN = arg[1], arg[2], arg[3] or ""
local files = {}

-- ---------- Datei- und XML-Funktionen ----------
function getUserProfileAppPath() return OUT .. "/" end
g_currentModSettingsDirectory = OUT .. "/modSettings/FS25_CraftConsoleHUD/"
function createFolder(d) os.execute('mkdir -p "' .. d .. '"') end
function fileExists(f) local h = io.open(f, "r"); if h then h:close(); return true end; return false end
local clock = 0
function getTimeSec() clock = clock + 0.0004; return clock end
function createXMLFile(name, path, root) local h = #files + 1; files[h] = { path = path, root = root, v = {} }; return h end
function loadXMLFile(name, f) local h = io.open(f, "r"); local t = h:read("a"); h:close(); local id = #files + 1; files[id] = { text = t }; return id end
function getXMLInt(h, key) local attr = key:match("#(.+)$"); local v = files[h].text:match(attr .. '="([^"]*)"'); return v and math.floor(tonumber(v) or 0) or nil end
function getXMLString(h, key) local attr = key:match("#(.+)$"); return files[h].text:match(attr .. '="([^"]*)"') end
local function set(h, key, val) table.insert(files[h].v, { key, val }) end
function setXMLInt(h, k, v) assert(type(v) == "number" and v == math.floor(v), "setXMLInt ohne Ganzzahl: " .. k .. "=" .. tostring(v)); set(h, k, string.format("%d", math.floor(v))) end
function setXMLFloat(h, k, v) assert(type(v) == "number", "setXMLFloat ohne Zahl: " .. k); set(h, k, string.format("%.6f", v)) end
function setXMLString(h, k, v) assert(type(v) == "string", "setXMLString ohne Text: " .. k); set(h, k, v) end
function setXMLBool(h, k, v) assert(type(v) == "boolean", "setXMLBool ohne Bool: " .. k .. "=" .. tostring(v)); set(h, k, tostring(v)) end
local function esc(s) return (s:gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;"):gsub('"', "&quot;")) end
-- Baum aus Pfaden wie "hud.unit(1).fill(0)#name" bauen und wie GIANTS schreiben
function saveXMLFile(h)
  local f = files[h]; local tree = { attrs = {}, kids = {}, order = {} }
  for _, e in ipairs(f.v) do
    local path, attr = e[1]:match("^(.-)#(.+)$")
    local node = tree
    for seg in path:gmatch("[^.]+") do
      if seg ~= f.root then
        local nm, idx = seg:match("^(%w+)%((%d+)%)$")
        if not nm then nm, idx = seg, "0" end
        if not node.kids[nm] then node.kids[nm] = {}; table.insert(node.order, nm) end
        local i = tonumber(idx) + 1
        node.kids[nm][i] = node.kids[nm][i] or { attrs = {}, kids = {}, order = {} }
        node = node.kids[nm][i]
      end
    end
    table.insert(node.attrs, attr .. '="' .. esc(e[2]) .. '"')
  end
  local function emit(name, n, ind)
    local s = ind .. "<" .. name .. (#n.attrs > 0 and (" " .. table.concat(n.attrs, " ")) or "")
    local inner = {}
    for _, kn in ipairs(n.order) do for _, c in ipairs(n.kids[kn]) do inner[#inner + 1] = emit(kn, c, ind .. "    ") end end
    if #inner == 0 then return s .. "/>" end
    return s .. ">\n" .. table.concat(inner, "\n") .. "\n" .. ind .. "</" .. name .. ">"
  end
  local fh = io.open(f.path, "w"); fh:write('<?xml version="1.0" encoding="utf-8" standalone="no"?>\n' .. emit(f.root, tree, "") .. "\n"); fh:close()
end
function delete(h) files[h] = nil end
function addConsoleCommand() end
function addModEventListener() end
function getWorldTranslation(node) return node.wx or 100.5, 0, node.wz or -250.25 end
function getWorldRotation(node) return 0, 1.0, 0 end
function localToLocal(node, root) return 0, 0, node.z end

-- ---------- Spieldaten ----------
FillType = { DIESEL = 1, DEF = 2, AIR = 3, SEEDS = 10, FERTILIZER = 11, UNKNOWN = 0 }
local FT = { [0] = { "UNKNOWN", "" }, [1] = { "DIESEL", "Diesel" }, [2] = { "DEF", "AdBlue" }, [3] = { "AIR", "Luft" }, [10] = { "SEEDS", "Saatgut" }, [11] = { "FERTILIZER", "Dünger & Co" } }
g_fillTypeManager = {
  getFillTypeNameByIndex = function(_, i) return FT[i] and FT[i][1] end,
  getFillTypeByIndex = function(_, i) return FT[i] and { title = FT[i][2], index = i } end,
}
WeatherType = { SUN = 1, CLOUDY = 2, RAIN = 3 }
g_storeManager = { getItemByXMLFilename = function(_, fn) return { specs = { workingWidth = fn == "seeder.xml" and "6" or nil }, categoryName = "TRACTORSL" } end }
g_farmlandManager = {
  getFarmlandIdAtWorldPosition = function() return 12 end,
  getFarmlandOwner = function(_, id) return ({ [12] = 1, [13] = 2 })[id] or 0 end,
}

local function fillUnits(list) return { fillUnits = list } end
local mower = { configFileName = "mower.xml", z = 3,
  getFullName = function() return "Front-Mähwerk" end,
  spec_mower = {}, spec_turnOnVehicle = {}, getIsTurnedOn = function() return true end,
  getIsLowered = function() return true end, getPtoRpm = function() return 1000 end,
  spec_foldable = { hasFoldingParts = true, foldMoveDirection = 0, foldAnimTime = 1 }, getIsUnfolded = function() return true end }
local seeder = { configFileName = "seeder.xml", z = -3,
  getFullName = function() return "Sämaschine & Düngerstreuer" end,
  spec_sowingMachine = {}, getIsLowered = function() return false end,
  spec_workMode = { state = 2, workModes = { { name = "Säen" }, { name = "Säen + Düngen" } } },
  spec_fillUnit = fillUnits({ { capacity = 3000, fillLevel = 1500.5, fillType = 10 }, { capacity = 2000, fillLevel = 0, fillType = 0 }, { capacity = 50, fillLevel = 40, fillType = 3 } }) }
local courseObj = {
  rootBoundaryLine = { { 0, 0 }, { 100, 0 }, { 100, 100 }, { 0, 100 } },
  fieldCourseSettings = { implementWidth = 6, numHeadlands = 2 },
  segments = { { segmentId = 1, length = 100, isHeadlandSegment = false, lineGroupIndex = 1, positions = { { 3, 0 }, { 3, 100 } } } },
  currentSegmentIndex = 1, currentSegmentIsLeft = false, vehiclePosition = { 3, 40 }, segmentStates = { true },
}
local tractor
tractor = { rootNode = {}, movingDirection = 1, configFileName = "tractor.xml", brand = { name = "FENDT" },
  getLastSpeed = function() return 12.4 end, getFullName = function() return "Fendt 724 Vario" end,
  getSelectedVehicle = function() return seeder end, getOperatingTime = function() return 7200000 * 3 end,
  getChildVehicles = function() return { tractor, mower, seeder } end,
  getIsMotorStarted = function() return true end, getIsAIActive = function() return false end,
  getCruiseControlState = function() return 1 end, getAttacherToolWorkingWidth = function() return 6 end,
  getDamageAmount = function() return 0.1 end, getDirtAmount = function() return 0.3 end,
  getConsumerFillUnitIndex = function(_, ft) if ft == 1 then return 1 elseif ft == 2 then return 2 end end,
  getFillUnitFillLevel = function(_, i) return ({ 300, 40 })[i] end,
  getFillUnitCapacity = function(_, i) return ({ 400, 50 })[i] end,
  getWheels = function() return { { physics = { hasGroundContact = true, netInfo = { slip = 0.1 } } }, { physics = { hasGroundContact = true, netInfo = { slip = 0.2 } } } } end,
  spec_fillUnit = fillUnits({ { capacity = 400, fillLevel = 300, fillType = 1 }, { capacity = 50, fillLevel = 40, fillType = 2 } }),
  spec_motorized = { motorTemperature = { value = 85.4 }, motor = { maxRpm = 2100, getLastRealMotorRpm = function() return 1500 end,
    getSmoothLoadPercentage = function() return 0.42 end, getMaximumForwardSpeed = function() return 50 / 3.6 end,
    getGearToDisplay = function(_, x) assert(x == true); return "D" end, getDrivingDirection = function() return 1 end } },
  spec_drivable = { cruiseControl = { speed = 15 }, doHandbrake = false },
  spec_lights = { lightsTypesMask = 5, beaconLightsActive = true, turnLightState = 1, brakeLightsVisibility = false },
  spec_attacherJoints = { attacherJoints = { { jointTransform = { z = 3 }, allowsLowering = true }, { jointTransform = { z = -3 }, allowsLowering = true } },
    attachedImplements = { { object = mower, jointDescIndex = 1 }, { object = seeder, jointDescIndex = 2 } } },
  spec_aiAutomaticSteering = { steeringEnabled = true, steeringValue = 0.1, lastDistanceToEnd = 42.5, lastIsOnField = true, steeringFieldCourse = courseObj },
}
local onFoot = SCEN == "zufuss"
g_localPlayer = { getCurrentVehicle = function() return not onFoot and tractor or nil end }
-- Kontostand mit Nachkommastellen wie im Spiel (0.5.1: bis 0.5.0 scheiterte daran setXMLInt und mit ihm die ganze Datei)
g_currentMission = { terrainSize = 2048, getMoney = function() return 123456.78 end, getFarmId = function() return 1 end,
  -- Einzelspiel und Gastgeber sind Server mit Client, der dedizierte Server nur Server, der Gast nur Client
  getIsServer = function() return SCEN ~= "gast" end, getIsClient = function() return SCEN ~= "dedi" end,
  environment = { currentHour = 14, currentMinute = 5, currentSeason = 1, currentDay = 3, isSunOn = true,
    currentPeriod = 4, currentDayInPeriod = 2, daysPerPeriod = 3,
    weather = { getCurrentTemperature = function() return 18.5 end, getCurrentWeatherType = function() return 2 end } } }
g_client = SCEN ~= "dedi" and {} or nil
-- 0.7.9: schlimmster Fall für den Gast -- auch dort gesetzt; die Mod darf sich trotzdem nicht abschalten
g_dedicatedServer = (SCEN == "dedi" or SCEN == "gast") and {} or nil

-- Erweiterungen für Karte/Planer/Aufträge hängt die Testdatei unten an (EXTRA-Block), wenn vorhanden
local extra = io.open((arg[0]:match("(.*/)") or "./") .. "spielumgebung-extra.lua", "r")
if extra then extra:close(); dofile((arg[0]:match("(.*/)") or "./") .. "spielumgebung-extra.lua") end

-- ---------- Prüfhilfen (0.5.1) ----------
local realPrint, modErrors, failed = print, {}, 0
print = function(...)
  local s = table.concat({ ... }, " ")
  if s:find("[CraftConsoleHud] Fehler", 1, true) then modErrors[#modErrors + 1] = s end
  realPrint(...)
end
local DIR = OUT .. "/modSettings/FS25_CraftConsoleHUD/"
local function readFile(name) local h = io.open(DIR .. name, "r"); if not h then return nil end; local t = h:read("a"); h:close(); return t end
local function attr(name, a) local t = readFile(name); return t and t:match("%f[%w]" .. a .. '="([^"]*)"') end
local function check(cond, msg)
  if cond then realPrint("[TEST] OK      " .. msg) else failed = failed + 1; realPrint("[TEST] FEHLER  " .. msg) end
end
local function run(n) for _ = 1, n do CraftConsoleHud:update(100) end end

-- ---------- Ablauf ----------
dofile(MOD)
CraftConsoleHud.ROADS_POINTS_PER_FRAME = 4   -- 0.7.5: Straßennetz über mehrere Bilder verteilt (Prüfung unten)
CraftConsoleHud.INPUT_AFTER_MS = 5000         -- 0.7.6: Aktionen des Spiels früher schreiben (Prüfung unten)
CraftConsoleHud:loadMap("Testkarte")
if SCEN == "planlive" then
  tractor.rootNode.wx, tractor.rootNode.wz = 100, 150          -- mitten auf dem eigenen Feld 34
  run(40)
  local plan = readFile("craftConsolePlan.xml") or ""
  check(plan:find('<field id="34"[^>]*live="true"') ~= nil, "Planer: auf Feld 34 -> live")
  tractor.rootNode.wx, tractor.rootNode.wz = 100, -250         -- vom Feld runter (Hofstelle)
  run(30)
  plan = readFile("craftConsolePlan.xml") or ""
  check(plan:find('live="true"', 1, true) == nil, "Planer: Feld verlassen -> kein live mehr")
  tractor.rootNode.wx, tractor.rootNode.wz = 100, 150
  run(30)
  onFoot = true                                                -- auf dem Feld aussteigen
  run(30)
  plan = readFile("craftConsolePlan.xml") or ""
  check(plan:find('live="true"', 1, true) == nil, "Planer: ausgestiegen -> kein live mehr")
  onFoot = false
end
-- 0.5.2 (Durchsicht B6): Lebenszeichen von ControlHub. Bleibt settings#alive 45 s gleich, geht die Mod in den
-- Sparmodus (2/s); zählt ControlHub wieder hoch, ist sie nach spätestens 2 s zurück.
if SCEN == "ohnehub" then
  local function settings(alive)
    local h = io.open(DIR .. "craftConsoleSettings.xml", "w")
    h:write('<settings rate="10" clients="1" plan="1" alive="' .. alive .. '"/>'); h:close()
  end
  settings(7)
  run(30)
  check(CraftConsoleHud.writeIntervalMs == 100, "mit Lebenszeichen: 10/s")
  run(470)   -- 47 s ohne neues Lebenszeichen
  check(CraftConsoleHud.hubGone == true and CraftConsoleHud.writeIntervalMs == 500, "ohne Lebenszeichen: Sparmodus 2/s")
  settings(8)
  run(25)
  check(CraftConsoleHud.hubGone == false and CraftConsoleHud.writeIntervalMs == 100, "Lebenszeichen wieder da: 10/s")
  check((attr("craftConsoleHud.xml", "session") or "") ~= "", "Sitzungskennung in der HUD-Datei")
end
run(110)   -- 11 s Spielzeit (Karte kommt nach 3 s)
if SCEN == "kursweg" then
  tractor.spec_aiAutomaticSteering.steeringFieldCourse = nil
  tractor.spec_aiAutomaticSteering.lastActiveSteeringFieldCourse = nil
  run(5)
  check(attr("craftConsoleCourse.xml", "boundary") == "", "Kurs weg -> leere Kursdatei")
end
-- 0.7.9: Version wie in modDesc.xml, Server-Merker, Abschalten nur auf dem gemieteten Server
local function modDescVersion()
  local h = io.open(MOD:gsub("[^/]+$", "") .. "modDesc.xml", "r"); if not h then return nil end
  local t = h:read("a"); h:close(); return t:match("<version>([^<]+)</version>")
end
if SCEN == "dedi" then
  check(CraftConsoleHud.disabled == true and readFile("craftConsoleHud.xml") == nil, "dedizierter Server: Mod aus, keine Dateien")
else
  check(CraftConsoleHud.disabled ~= true, "Mod läuft (" .. (SCEN == "" and "Einzelspiel" or SCEN) .. ")")
  check(attr("craftConsoleHud.xml", "mv") ~= nil and attr("craftConsoleHud.xml", "mv") == modDescVersion(),
    "Version der Mod (hud#mv) wie in modDesc.xml: " .. tostring(attr("craftConsoleHud.xml", "mv")) .. " / " .. tostring(modDescVersion()))
  check(attr("craftConsoleMap.xml", "server") == (SCEN == "gast" and "false" or "true"), "Karte: map#server " .. tostring(attr("craftConsoleMap.xml", "server")))
end
if SCEN ~= "dedi" then
  check(attr("craftConsoleHud.xml", "money") == "123456", "Kontostand abgerundet geschrieben (123456.78 -> 123456)")
  check(attr("craftConsoleHud.xml", "envHour") == "14", "Uhrzeit kommt (auch zu Fuß)")
  check(attr("craftConsoleHud.xml", "envSunOn") == "true", "Tageslicht kommt (auch zu Fuß)")
  check(attr("craftConsoleCourse.xml", "boundary") ~= nil, "Kursdatei geschrieben (auch zu Fuß, leer)")
  check(attr("craftConsoleHud.xml", "seq") ~= nil and attr("craftConsoleHud.xml", "format") == "3", "Lebenszeichen seq + format")
  check(attr("craftConsoleMap.xml", "myFarm") == "1", "Karte mit eigenem Hof")
  check(attr("craftConsoleMap.xml", "session") ~= nil and attr("craftConsoleMap.xml", "session") == attr("craftConsoleHud.xml", "session"),
    "Karte mit Sitzungskennung der HUD-Datei (0.7.3)")
  check(#modErrors == 0, "keine Fehlermeldung der Mod" .. (#modErrors > 0 and (": " .. modErrors[1]) or ""))
end
if SCEN == "zufuss" then
  check(attr("craftConsoleHud.xml", "inVehicle") == "false", "zu Fuß: inVehicle=false")
  check(attr("craftConsoleHud.xml", "fill") == "-1", "zu Fuß: Füllstand -1 (unbekannt)")
  check(attr("craftConsoleCourse.xml", "boundary") == "", "zu Fuß: leere Kursdatei statt alter Kurs")
elseif SCEN == "" then
  check(attr("craftConsoleHud.xml", "fill") == "50", "im Fahrzeug: Füllstand der Sämaschine 50 %")
  check(attr("craftConsoleCourse.xml", "segMeta") == "1,100,0,1", "im Fahrzeug: Kurs geschrieben")
end
-- 0.6.0.0 (23.10.2026): neue Werte
if SCEN == "" then
  run(60)   -- Straßennetz kommt 15 s nach dem Laden
  check((attr("craftConsoleHud.xml", "areas") or ""):find("^SOWINGMACHINE:") ~= nil, "Arbeitsbereich mit Namen der Art (SOWINGMACHINE)")
  check(attr("craftConsoleHud.xml", "vid") == "vehicle0123abcdef", "feste Fahrzeug-Kennung (vid)")
  check(attr("craftConsoleHud.xml", "warn") == "Motor ist aus  ", "Warnung des Spiels (warn), ohne „>“ (0.7.3)")
  check(attr("craftConsoleHud.xml", "note") == "Feld 34 fertig", "letzte Seitenmeldung (note)")
  check((readFile("craftConsoleHud.xml") or ""):find('tip="1"', 1, true) ~= nil, "Abladestelle erreicht (unit tip=1)")
  check(attr("craftConsoleRoads.xml", "count") == "2", "Straßennetz: 2 Linien")
  local akt = readFile("craftConsoleInputActions.xml") or ""
  check(attr("craftConsoleInputActions.xml", "count") == "4" and akt:find('k="displayNamePositive" v="Springen  Leertaste "', 1, true) ~= nil
    and akt:find('Tabelle(2)', 1, true) ~= nil, "Aktionen des Spiels mit Feldern (0.7.6)")
  local texte = {}
  for k, t in akt:gmatch('<categoryText key="([^"]*)" text="([^"]*)"') do texte[#texte + 1] = k .. "=" .. t end
  check(table.concat(texte, ";") == "inputCategory_PLAYER_MOVEMENT=Zu Fuß – Bewegung;inputCategory_VEHICLE_LIGHTS=Fahrzeug – Beleuchtung",
    "Texte der Abschnitte (0.7.7), fehlender Text ausgelassen: " .. table.concat(texte, ";"))
  local strassen = readFile("craftConsoleRoads.xml") or ""
  local punkte = 0
  for p in strassen:gmatch('p="([^"]*)"') do for _ in p:gmatch("[^|]+") do punkte = punkte + 1 end end
  check(punkte == 20 and CraftConsoleHud.roadsJob == nil, "Straßennetz über mehrere Bilder verteilt, vollständig (0.7.5): " .. punkte .. " Punkte")
  local plan = readFile("craftConsolePlan.xml") or ""
  check(plan:find('<field id="38"[^>]*growth="3"[^>]*growthMax="6"') ~= nil, "Planer: Wachstumsstufe 3 von 6 (Feld 38)")
  check(attr("craftConsolePlan.xml", "session") ~= nil and attr("craftConsolePlan.xml", "session") == attr("craftConsoleHud.xml", "session"),
    "Planer mit Sitzungskennung der HUD-Datei (0.7.9)")
  -- 0.7.4: interner Name je Feld, Früchte des Spiels in der Karte
  check(plan:find('<field id="38"[^>]*fruit="Weizen"[^>]*fruitKey="WHEAT"') ~= nil, "Planer: interner Name der Frucht (fruitKey, 0.7.4)")
  local karte = readFile("craftConsoleMap.xml") or ""
  local fr = {}
  for k, t in karte:gmatch('<fruit key="([^"]*)" title="([^"]*)"') do fr[#fr + 1] = k .. "=" .. t end
  check(table.concat(fr, ",") == "WHEAT=Weizen,CANOLA=CANOLA,OILSEEDRADISH=Ölrettich", "Früchte des Spiels in der Karte (0.7.4): " .. table.concat(fr, ","))
  check(#modErrors == 0, "keine Fehlermeldung der Mod (0.6)" .. (#modErrors > 0 and (": " .. modErrors[1]) or ""))
  -- 0.7: Teilbreiten je Gerät; Bereich der ausgeschalteten Teilbreite fehlt (nur ein Bereich)
  check(attr("craftConsoleHud.xml", "sec") == "1;0;1;2;2;2;L:1:1.50,L:0:3.00,R:1:-1.50,R:1:-3.00", "Teilbreiten (unit sec)")
  check(not (attr("craftConsoleHud.xml", "areas") or ""):find("|", 1, true), "Bereich der ausgeschalteten Teilbreite weggelassen")
  -- 0.7.2: Precision-Farming-Düsen je PF-Teilbreite, von links nach rechts
  check(attr("craftConsoleHud.xml", "pf") == "1:1.50:0.50:0:2,0:0.50:-0.50:2:2", "Precision-Farming-Düsen (unit pf)")
  -- 0.7.1: ccProbeDeep findet Schlüssel mit Punkt im Namen und Zahlen-Schlüssel
  local seen = {}
  local before = print
  print = function(...) local s = table.concat({ ... }, " "); seen[#seen + 1] = s; before(...) end
  CraftConsoleHud:consoleProbeDeep("spec_FS25_precisionFarming.extendedSprayerEffects.sprayerEffectsBySection.0")
  CraftConsoleHud:consoleProbeDeep("spec_variableWorkWidth.sections")
  print = before
  local all = table.concat(seen, "\n")
  check(all:find("nozzleTestActive = true", 1, true) ~= nil, "ccProbeDeep: Pfad mit Punkt im Spezialisierungsnamen und Zahl")
  check(all:find("widthAbs = 1.5", 1, true) ~= nil, "ccProbeDeep: gewöhnlicher Pfad geht weiter")
end
if CraftConsoleHud.consoleDumpMore and SCEN ~= "dedi" then print(CraftConsoleHud:consoleDumpMore()) end
if CraftConsoleHud.consoleProbeAttach and SCEN ~= "dedi" then print(CraftConsoleHud:consoleProbeAttach()) end
if failed > 0 then realPrint(("[TEST] %d Prüfung(en) fehlgeschlagen"):format(failed)); os.exit(1) end
