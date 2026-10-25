-- Ergänzung zur nachgebauten Spielumgebung (spielumgebung-mock.lua lädt diese Datei automatisch):
-- Felder, Höfe, Mitspieler, Helfer -- für Karte (Paket D) und Planer/Aufträge (Paket E).
local function node(x, z) return { wx = x, wz = z } end
function localDirectionToWorld(node, x, y, z) return 0, 0, 1 end

local farms = {
  { farmId = 1, name = "Hof Kleinwächter", getColor = function() return { 0.29, 0.61, 0.18 } end },
  { farmId = 2, name = "Nachbarhof", getColor = function() return { 0.2, 0.4, 0.9 } end },
}
g_farmManager = {
  getFarms = function() return farms end,
  getFarmByUserId = function(_, uid) return farms[uid == 7 and 2 or 1] end,
}
local function makeField(id, farmlandId, x0, z0, w, h, area)
  return {
    getId = function() return id end,
    getFarmland = function() return { id = farmlandId } end,
    getAreaHa = function() return area end,
    polygonPoints = { node(x0, z0), node(x0 + w, z0), node(x0 + w, z0 + h), node(x0, z0 + h) },
  }
end
local FIELDS = {
  makeField(34, 12, 0, 0, 200, 300, 6.0),     -- eigenes Feld (Farmland 12 gehört Hof 1)
  makeField(35, 13, 250, 0, 150, 300, 4.5),   -- Nachbarhof (Farmland 13 -> Hof 2)
  makeField(36, 14, 0, 350, 400, 200, 8.0),   -- frei
}
g_fieldManager = { getFields = function() return FIELDS end }
local ownerOf = { [12] = 1, [13] = 2 }
g_farmlandManager.getFarmlandOwner = function(_, id) return ownerOf[id] or 0 end

-- Mitspieler: einer zu Fuß (Hof fehlt -> über Nutzer), einer im Mähdrescher; dazu ein Helfer
local combine = { rootNode = node(300, 120), getFullName = function() return "Claas Lexion 8900" end, getLastSpeed = function() return 6.5 end }
local helperTractor = { rootNode = node(120, 400), getFullName = function() return "John Deere 8R" end, getLastSpeed = function() return 11 end,
  getIsAIActive = function() return true end, getOwnerFarmId = function() return 1 end,
  spec_aiJobVehicle = { job = { getHelperName = function() return "Helfer Jonas" end } } }
helperTractor.rootVehicle = helperTractor
g_currentMission.userManager = { getUserByUserId = function(_, uid) return { getNickname = function() return ({ [7] = "Mia", [8] = "Basti" })[uid] or "?" end } end }
g_currentMission.playerSystem = { players = {
  { userId = 7, farmId = 0, rootNode = node(260, 40), getCurrentVehicle = function() return nil end },
  { userId = 8, farmId = 1, rootNode = node(0, 0), getCurrentVehicle = function() return combine end },
  g_localPlayer,
} }
g_currentMission.vehicleSystem = { vehicles = { helperTractor } }
g_currentMission.missionInfo = { map = { title = "Testkarte" } }

-- ---------- Arbeitsplaner + Aufträge (Paket E) ----------
table.insert(FIELDS, makeField(37, 15, 450, 0, 150, 200, 3.0))   -- zweites eigenes Feld, vorbereitet
ownerOf[15] = 1
FruitType = { UNKNOWN = 0, WHEAT = 2 }
FieldGroundType = { PLOWED = 1, CULTIVATED = 2, SEEDBED = 3 }
FieldDensityMap = { SPRAY_LEVEL = 1 }
local wheat = { name = "WHEAT", fillType = { title = "Weizen" }, witheredState = 9, cutStates = { [10] = true },
  minHarvestingGrowthState = 6, maxHarvestingGrowthState = 7, regrows = false }
-- 0.7.4: Liste der Früchte (Felder fruitTypes, name, fillType.title); Raps ohne Anzeigenamen → interner Name
g_fruitTypeManager = { getFruitTypeByIndex = function(_, i) return i == 2 and wheat or nil end,
  fruitTypes = { wheat, { name = "CANOLA", fillType = {} }, { name = "OILSEEDRADISH", fillType = { title = "Ölrettich" } }, "kaputt" } }
g_currentMission.missionInfo.limeRequired = true
g_currentMission.missionInfo.weedsEnabled = true
g_currentMission.fieldGroundSystem = { getMaxValue = function() return 2 end }
FieldState = { new = function()
  local st = { isValid = true }
  function st:update(x, z)
    -- Feld 34 (x < 200): Weizen, zur Hälfte erntereif, zur Hälfte noch wachsend; Feld 37 (x >= 450): Saatbett
    if x < 200 then
      self.fruitTypeIndex, self.growthState = 2, (z < 150 and 6 or 4)
      self.groundType, self.sprayLevel, self.limeLevel, self.weedState = 0, 1, 1, (z > 250 and 1 or 0)
    elseif x >= 650 then   -- 0.6: Feld 38, Weizen in Wachstumsstufe 3 (erntereif ab 6)
      self.fruitTypeIndex, self.growthState = 2, 3
      self.groundType, self.sprayLevel, self.limeLevel, self.weedState = 0, 1, 1, 0
    else
      self.fruitTypeIndex, self.growthState = 0, 0
      self.groundType, self.sprayLevel, self.limeLevel, self.weedState = FieldGroundType.SEEDBED, 0, 0, 0
    end
  end
  return st
end }
AbstractMission = { STATUS_STOPPED = 0, STATUS_RUNNING = 1, STATUS_FINISHED = 2 }
g_missionManager = { missions = {
  { type = { name = "harvestMission" }, getTitle = function() return "Ernte Feld 35" end, farmId = 1, field = FIELDS[2],
    reward = 12500, getCompletion = function() return 0.4 end, status = 1 },
  { type = { name = "fertilizeMission" }, getTitle = function() return "Düngen Feld 36" end, farmId = 0, field = FIELDS[3],
    reward = 3200, status = 0 },
} }
-- Einstellungsdatei: ein Tablet zeigt den Planer (plan="1")
do
  local d = arg[2] .. "/modSettings/FS25_CraftConsoleHUD/"
  os.execute('mkdir -p "' .. d .. '"')
  local h = io.open(d .. "craftConsoleSettings.xml", "w"); h:write('<settings rate="10" clients="1" plan="1"/>'); h:close()
end

-- ---------- Erkundung für GPS-Menü und Planer (ccProbeAttach, 0.4.3) ----------
-- Traktor bei (100 | -250), Blick nach +z; Mähwerk 6 m davor, Sämaschine 6 m dahinter und 1,5 m seitlich,
-- leicht verdreht (Nachlauf). Arbeitsbereich-Knoten als Zahlen wie im Spiel, Lage über NODES.
do
  local tr = g_localPlayer.getCurrentVehicle()
  if tr ~= nil then
    tr.rootNode = node(100, -250)
    local impls = tr.spec_attacherJoints.attachedImplements
    local mower, seeder = impls[1].object, impls[2].object
    mower.rootNode = node(100, -244)
    seeder.rootNode = node(101.5, -256)
    seeder.rootNode.fwdX, seeder.rootNode.fwdZ = 0.1736, 0.9848          -- 10 Grad verdreht
    tr.spec_attacherJoints.attacherJoints[1].jointType = 1
    tr.spec_attacherJoints.attacherJoints[2].jointType = 3
    impls[2].inputJointDescIndex = 1
    seeder.spec_attachable = { inputAttacherJoints = { { jointType = 3, allowsLowering = true } } }
    seeder.spec_workArea = { workAreas = { { type = 5, start = 9001, width = 9002, height = 9003,
      subSectionData = { { isValid = true, isUncovered = false }, { isValid = true, isUncovered = true } } },
      -- 0.7: zweiter Bereich gehört zu einer ausgeschalteten Teilbreite → darf nicht in areas stehen
      { type = 5, start = 9004, width = 9005, height = 9006, sectionIndex = 2 } } }
    -- 0.7: Teilbreiten (GDN VariableWorkWidth): links 1 von 2 an, rechts 2 von 2
    seeder.spec_variableWorkWidth = { hasSections = true, isActive = true, hasCenter = false,
      leftSide = 1, leftSideMax = 2, rightSide = 2, rightSideMax = 2,
      sections = { { isLeft = true, isActive = true, widthAbs = 1.5 }, { isLeft = true, isActive = false, widthAbs = 3.0 },
        { isLeft = false, isActive = true, widthAbs = -1.5 }, { isLeft = false, isActive = true, widthAbs = -3.0 } } }
    -- 0.7.1: Spezialisierung aus einer Mod -- der Schlüssel enthält selbst einen Punkt (wie Precision Farming)
    -- 0.7.2: Düsen je PF-Teilbreite (wie Hendriks Probe): Mitte an, linke Teilbreite 1 von PF abgeschaltet
    seeder["spec_FS25_precisionFarming.extendedSprayerEffects"] = { individualNozzleControl = false,
      sprayerEffectsBySection = {
        [0] = { { nozzleTestActive = true, xOffset = 0.25, isActive = true, state = 2 }, { xOffset = -0.25, isActive = true, state = 2 } },
        [1] = { { xOffset = 1.25, isActive = false, state = 0 }, { xOffset = 0.75, isActive = false, state = 0 },
          -- 0.7.3: ungültige Lagen zählen nicht (NaN, unendlich)
          { xOffset = 0/0, isActive = true, state = 2 }, { xOffset = math.huge, isActive = true, state = 2 } } } }
  end
  -- 0.6: Art der Arbeitsbereiche als Name, feste Fahrzeug-Kennung, Abladestelle erreicht, Meldungen, Straßen, Wachstum
  g_workAreaTypeManager = { workAreaTypes = { [5] = { name = "SOWINGMACHINE", index = 5 }, [7] = { name = "COMBINECHOPPER", index = 7 } } }
  Dischargeable = { DISCHARGE_STATE_OFF = 0, DISCHARGE_STATE_OBJECT = 1, DISCHARGE_STATE_GROUND = 2 }
  if tr ~= nil then
    tr.uniqueId = "vehicle0123abcdef"
    tr.spec_attacherJoints.attachedImplements[1].object.spec_dischargeable = { currentDischargeState = 0, currentDischargeNode = { dischargeObject = {} } }
  end
  -- 0.7.3: „<“/„>“ in Meldungen werden entfernt (ControlHub liest <hud …> nur bis zum ersten „>“)
  g_currentMission.hud = { warningDisplay = { warnings = { { text = "Motor ist aus >" } } },
    sideNotifications = { notificationQueue = { { text = "Alt" }, { text = "Feld 34 fertig" } } } }
  g_currentMission.aiSystem = { roadSplines = { 501, 502 } }
  function getSplineLength(s) return s == 501 and 100 or 40 end
  function getSplinePosition(s, t) return t * (s == 501 and 100 or 40), 0, (s == 501 and 0 or 50) end
  table.insert(FIELDS, makeField(38, 16, 650, 0, 150, 200, 3.0))   -- eigenes Feld, Weizen wächst
  ownerOf[16] = 1
  local NODES = { [9001] = node(98.5, -258), [9002] = node(104.5, -258), [9003] = node(98.5, -259),
    [9004] = node(104.5, -258), [9005] = node(107.5, -258), [9006] = node(104.5, -259) }
  local baseGWT = getWorldTranslation
  function getWorldTranslation(n)
    if type(n) == "number" then local p = NODES[n] or {}; return p.wx or 0, 0, p.wz or 0 end
    return baseGWT(n)
  end
  function localDirectionToWorld(n, x, y, z) return (type(n) == "table" and n.fwdX) or 0, 0, (type(n) == "table" and n.fwdZ) or 1 end
  AttacherJoints = { jointTypeNameToInt = { implement = 1, trailer = 2, trailerLow = 3, cultivator = 4 } }
  g_currentMission.missionInfo.savegameIndex = 3
  g_currentMission.missionInfo.savegameDirectory = "C:/Users/Test/Documents/My Games/FarmingSimulator2025/savegame3"
  g_currentMission.missionInfo.map.id = "MapUS"
  g_currentMission.missionInfo.mapId = "MapUS"                 -- so liefert es das Spiel (Log 22.10.: mapId = MapEU)
  g_currentMission.missionInfo.savegameName = "Testspielstand"
  g_currentMission.missionDynamicInfo = { isMultiplayer = false, serverName = "", password = "darf-nicht-ins-log" }
end

-- 0.7.6: Aktionen des Spiels (Steuerung) -- Felder wie in der Datei aus dem Spiel (24.10.2026)
g_inputBinding = { actions = {
    { name = "TOGGLE_LIGHTS", displayCategory = "$l10n_inputCategory_VEHICLE_LIGHTS", displayNamePositive = "Licht ein/aus", axisType = "HALF", bindings = { 1, 2 } },
    { name = "JUMP", displayCategory = "$l10n_inputCategory_PLAYER_MOVEMENT", displayNamePositive = "Springen <Leertaste>", axisType = "HALF" },
    { name = "PACK_GRAB", displayCategory = "Beispiel Pack", displayNamePositive = "Greifen" },
    { name = "DEBUG_X", displayCategory = "$l10n_inputCategory_DEBUG_PC", displayNamePositive = "Debug" },
    "kaputt" } }
-- 0.7.7: Texte der Abschnitte -- einer als Feld (texts), einer nur über getText, einer fehlt („Missing …“ wie im Spiel)
g_i18n = { texts = { inputCategory_VEHICLE_LIGHTS = "Fahrzeug – Beleuchtung" },
  getText = function(self, key)
    if key == "inputCategory_PLAYER_MOVEMENT" then return "Zu Fuß – Bewegung" end
    return "Missing '" .. tostring(key) .. "' in l10n_de.xml"
  end }
