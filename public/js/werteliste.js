/**
 * Werteliste (Umsetzungsplan Paket J, Mockup Bild 5): alle Spielwerte für Anzeigen im Bedienpanel, die
 * Werte-Kachel, Tasten mit Zustand und Bedingungen („nur auslösen, wenn …“).
 *
 * Läuft an zwei Stellen mit genau derselben Liste: im Browser als normales Skript (window.Werteliste)
 * und im Server per `import '../public/js/werteliste.js'` (globalThis.Werteliste, s. server/conditions.js).
 * Deshalb hier kein import/export und kein DOM.
 *
 * Ein Wert: { id, cat, sub, name, kind: 'num'|'bool'|'text', unit, dec, get(d), range(d), fixed, noRange }
 * An/aus-Werte (bool) tragen ja/nein: wie die beiden Zustände heißen (z. B. gesenkt/angehoben), s. W.zustand(), und
 * meist wer: worum es geht, für den Satz einer Bedingung (W.satz(), „Gerät hinten 1 angehoben“)
 *   d      = Daten eines 'telemetry-update' (Rohfelder des Spiels + d.base + d.hub, s. server/index.js)
 *   get    → Wert oder null (unbekannt / gerade nicht vorhanden, z. B. kein Gerät hinten)
 *   range  → [min, max] für Balken und Tacho; passt sich an Fahrzeug/Gerät an. fixed = immer gleich.
 *   noRange: Zahl ohne sinnvollen Bereich (Kontostand) -- nur als Zahl darstellbar.
 *
 * Feste Plätze bei Geräten: „hinten 1“ ist immer das erste Gerät hinten in der Kette (side + depth),
 * egal welches. „Alle zusammen“ zählt die Füllstände aller Einheiten zusammen.
 * Für später (ETS2/ATS): eine eigene Liste je Spiel in LISTS, möglichst aus d.base.
 * d.gps kommt vom Server (gpsEngine.js, Paket I): Vorgewende/Feldrand voraus, Zustand, Hauptschalter.
 */
(function (root) {
  const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const pos = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);   // FS25: -1 = unbekannt
  const f2 = d => d.format >= 2;
  const pct = (level, cap) => (level != null && cap > 0 ? Math.round((level / cap) * 100) : null);
  const pf = d => d.pfWorkWidth >= 0 || d.pfIsWorking === true;   // Gerät mit Precision-Farming-Daten
  // Zu Fuß gibt es keine Fahrzeugwerte (23.10.2026): unbekannt statt Ersatzwerte wie 0 %, „aus“ oder „neutral“.
  // Nur ausdrücklich false zählt (ältere Testdaten ohne inVehicle bleiben gültig).
  const onFoot = d => d.inVehicle === false;

  const SEASONS = ['Frühling', 'Sommer', 'Herbst', 'Winter'];
  const WEATHER = { sun: 'Sonnig', partially_cloudy: 'Teils bewölkt', cloudy: 'Bewölkt', rain: 'Regen', snow: 'Schnee', hail: 'Hagel', thunder: 'Gewitter', twister: 'Tornado', fog: 'Nebel' };
  const DIRS = { F: 'vorwärts', R: 'rückwärts', N: 'neutral' };
  const TURN = { off: 'aus', left: 'links', right: 'rechts', hazard: 'Warnblinker' };

  // Bereiche wie beim Cockpit-Tacho (telemetry.js scaleFor): 10 % Luft, auf runde Werte
  const speedRange = d => { const v = d.base?.maxSpeedKmh; return [0, v > 0 ? Math.max(20, Math.ceil((v * 1.1) / 10) * 10) : 60]; };
  const rpmRange = d => { const n = d.base?.maxRpm; return [0, n > 0 ? Math.ceil((n * 1.1) / 100) * 100 : 2500]; };

  // Geräte auf festen Plätzen; einmal je Datenpaket ausgerechnet
  const slotCache = new WeakMap();
  function slots(d) {
    let s = slotCache.get(d);
    if (s) return s;
    const units = Array.isArray(d.units) ? d.units : [];
    const byDepth = (a, b) => (a.depth || 0) - (b.depth || 0);
    const front = units.filter(u => u.side === 'front').sort(byDepth);
    const rear = units.filter(u => u.side === 'rear').sort(byDepth);
    let level = 0, cap = 0;
    for (const u of units) for (const f of u.fills || []) if (f.capacity > 0) { level += f.level || 0; cap += f.capacity; }
    s = { f: front[0] || null, r1: rear[0] || null, r2: rear[1] || null, total: cap > 0 ? { level, capacity: cap } : null };
    slotCache.set(d, s);
    return s;
  }
  // Im Spiel gewähltes Gerät (Mod ab 0.5: unit#selected) und seine Zustände; die Mod schickt gesenkt/an zusätzlich
  // direkt (hud#impLow/impOn: 1/0, -1 = kann es nicht) -- das gilt zuerst, die Gerätekette ist der Rückweg
  const selUnit = d => (Array.isArray(d.units) ? d.units.find(u => u.selected) : null) || null;
  const selFlag = (d, hudKey, unitKey) => {
    if (d.available === false || onFoot(d)) return null;
    const h = d[hudKey];
    if (h === 1 || h === 0) return h === 1;
    const u = selUnit(d);
    return u && typeof u[unitKey] === 'boolean' ? u[unitKey] : null;
  };
  // Hauptfüllung eines Geräts: die erste mit Fassungsvermögen (Sämaschine: Saatgut vor Dünger)
  const mainFill = u => (u?.fills || []).find(f => f.capacity > 0) || null;

  function unitValues(slot, label, sub) {
    const u = d => slots(d)[slot];
    const fill = d => mainFill(u(d));
    const flag = key => d => { const x = u(d); return x && typeof x[key] === 'boolean' ? x[key] : null; };
    return [
      { id: `${slot}_name`, sub, name: `Gerät ${label}`, kind: 'text', get: d => u(d)?.name || null },
      // typeOf: Füllgut, das eine Füllstand-Anzeige mit anzeigt (Test 23.10.2026, Anmerkung 17)
      { id: `${slot}_fill`, sub, name: `Füllstand ${label}`, kind: 'num', unit: 'l', get: d => fill(d)?.level ?? null, range: d => (fill(d) ? [0, fill(d).capacity] : null), typeOf: d => fill(d)?.name || null },
      { id: `${slot}_fill_pct`, sub, name: `Füllstand ${label} in %`, kind: 'num', unit: '%', get: d => { const f = fill(d); return f ? pct(f.level, f.capacity) : null; }, range: () => [0, 100], fixed: true, typeOf: d => fill(d)?.name || null },
      { id: `${slot}_type`, sub, name: `Füllgut ${label}`, kind: 'text', get: d => fill(d)?.name || null },
      { id: `${slot}_low`, sub, name: `Gerät ${label} gesenkt/angehoben`, wer: `Gerät ${label}`, kind: 'bool', ja: 'gesenkt', nein: 'angehoben', get: flag('lowered') },
      { id: `${slot}_on`, sub, name: `Gerät ${label} ein-/ausgeschaltet`, wer: `Gerät ${label}`, kind: 'bool', ja: 'eingeschaltet', nein: 'ausgeschaltet', get: flag('on') },
      { id: `${slot}_unfolded`, sub, name: `Gerät ${label} aus-/eingeklappt`, wer: `Gerät ${label}`, kind: 'bool', ja: 'ausgeklappt', nein: 'eingeklappt', get: flag('unfolded') },
      // Mod 0.6: Abladestelle erreicht (Anhänger, Überladen) bzw. lädt gerade ab
      { id: `${slot}_tip`, sub, name: `Gerät ${label} an der Abladestelle`, kind: 'bool', ja: 'ja', nein: 'nein', get: d => { const x = u(d); return x && !onFoot(d) ? (x.tip || 0) >= 1 : null; } },
      { id: `${slot}_tipping`, sub, name: `Gerät ${label} lädt ab`, kind: 'bool', ja: 'ja', nein: 'nein', get: d => { const x = u(d); return x && !onFoot(d) ? x.tip === 2 : null; } }
    ];
  }

  const FS25 = [
    // ---- Fahrzeug
    ['Fahrzeug', 'Fahren', [
      { id: 'speed', name: 'Geschwindigkeit', kind: 'num', unit: 'km/h', get: d => (onFoot(d) ? null : d.base?.speedKmh ?? pos(d.speed)), range: speedRange },
      { id: 'cruise', name: 'Tempomat-Geschwindigkeit', kind: 'num', unit: 'km/h', get: d => d.base?.cruise?.speedKmh ?? null, range: speedRange },
      { id: 'cruise_on', name: 'Tempomat an/aus', wer: 'Tempomat', kind: 'bool', ja: 'an', nein: 'aus', get: d => d.base?.cruise?.active ?? null },
      { id: 'gear', name: 'Gang', kind: 'text', get: d => d.base?.gear || null },
      { id: 'dir', name: 'Fahrtrichtung', kind: 'text', get: d => (onFoot(d) ? null : DIRS[d.base?.direction || d.dir] || null) },
      { id: 'handbrake', name: 'Handbremse angezogen/gelöst', wer: 'Handbremse', kind: 'bool', ja: 'angezogen', nein: 'gelöst', get: d => d.base?.handbrake ?? null },
      { id: 'ai', name: 'Helfer fährt', kind: 'bool', ja: 'ja', nein: 'nein', get: d => d.base?.aiActive ?? null },
      { id: 'slip', name: 'Schlupf', kind: 'num', unit: '%', get: d => (pos(d.slip) != null ? Math.round(d.slip * 100) : null), range: () => [0, 100], fixed: true }
    ]],
    ['Fahrzeug', 'Motor', [
      { id: 'rpm', name: 'Drehzahl', kind: 'num', unit: 'U/min', get: d => d.base?.rpm ?? null, range: rpmRange },
      { id: 'motor_temp', name: 'Motortemperatur', kind: 'num', unit: '°C', get: d => d.base?.motorTempC ?? null, range: () => [20, 120], fixed: true },
      { id: 'motor_on', name: 'Motor an/aus', wer: 'Motor', kind: 'bool', ja: 'läuft', nein: 'aus', get: d => d.base?.motorOn ?? null },
      { id: 'hours', name: 'Betriebsstunden', kind: 'num', unit: 'h', dec: 1, noRange: true, get: d => pos(d.hours) },
      { id: 'damage', name: 'Schaden', kind: 'num', unit: '%', get: d => pos(d.damage), range: () => [0, 100], fixed: true },
      { id: 'dirt', name: 'Schmutz', kind: 'num', unit: '%', get: d => pos(d.dirt), range: () => [0, 100], fixed: true }
    ]],
    ['Fahrzeug', 'Tank', [
      { id: 'fuel', name: 'Diesel', kind: 'num', unit: 'l', get: d => d.base?.fuel?.level ?? null, range: d => (d.base?.fuel?.capacity > 0 ? [0, d.base.fuel.capacity] : null) },
      { id: 'fuel_pct', name: 'Diesel in %', kind: 'num', unit: '%', get: d => d.base?.fuel?.percent ?? null, range: () => [0, 100], fixed: true },
      { id: 'adblue', name: 'AdBlue', kind: 'num', unit: 'l', get: d => d.base?.adblue?.level ?? null, range: d => (d.base?.adblue?.capacity > 0 ? [0, d.base.adblue.capacity] : null) },
      { id: 'adblue_pct', name: 'AdBlue in %', kind: 'num', unit: '%', get: d => d.base?.adblue?.percent ?? null, range: () => [0, 100], fixed: true }
    ]],
    ['Fahrzeug', 'Licht und Leuchten', [
      { id: 'light_low', name: 'Abblendlicht an/aus', wer: 'Abblendlicht', kind: 'bool', ja: 'an', nein: 'aus', get: d => d.base?.lights?.on ?? null },
      { id: 'light_high', name: 'Fernlicht an/aus', wer: 'Fernlicht', kind: 'bool', ja: 'an', nein: 'aus', get: d => d.base?.lights?.high ?? null },
      { id: 'beacon', name: 'Rundumleuchte an/aus', wer: 'Rundumleuchte', kind: 'bool', ja: 'an', nein: 'aus', get: d => d.base?.lights?.beacon ?? null },
      { id: 'work_front', name: 'Arbeitslicht vorne an/aus', wer: 'Arbeitslicht vorne', kind: 'bool', ja: 'an', nein: 'aus', get: d => d.base?.lights?.workFront ?? null },
      { id: 'work_back', name: 'Arbeitslicht hinten an/aus', wer: 'Arbeitslicht hinten', kind: 'bool', ja: 'an', nein: 'aus', get: d => d.base?.lights?.workBack ?? null },
      { id: 'blinker', name: 'Blinker', kind: 'text', get: d => TURN[d.base?.lights?.turn] || null },
      // je Richtung als an/aus, damit eine Taste leuchten kann (Kachel „Beleuchtung“, 24.10.2026)
      ...[['blinker_links', 'Blinker links', 'left'], ['blinker_rechts', 'Blinker rechts', 'right'], ['warnblinker', 'Warnblinker', 'hazard']].map(([id, wer, t]) =>
        ({ id, name: `${wer} an/aus`, wer, kind: 'bool', ja: 'an', nein: 'aus', get: d => (d.base?.lights?.turn == null ? null : d.base.lights.turn === t) }))
    ]],
    // ---- Anbaugeräte und Anhänger
    ['Anbaugeräte und Anhänger', 'Gerät vorne', unitValues('f', 'vorne', 'Gerät vorne')],
    ['Anbaugeräte und Anhänger', 'Gerät hinten 1', unitValues('r1', 'hinten 1', 'Gerät hinten 1')],
    ['Anbaugeräte und Anhänger', 'Gerät hinten 2', unitValues('r2', 'hinten 2', 'Gerät hinten 2')],
    ['Anbaugeräte und Anhänger', 'Alle zusammen', [
      { id: 'all_fill', name: 'Füllstand alle zusammen', kind: 'num', unit: 'l', get: d => slots(d).total?.level ?? null, range: d => (slots(d).total ? [0, slots(d).total.capacity] : null) },
      { id: 'all_fill_pct', name: 'Füllstand alle zusammen in %', kind: 'num', unit: '%', get: d => { const t = slots(d).total; return t ? pct(t.level, t.capacity) : null; }, range: () => [0, 100], fixed: true }
    ]],
    ['Anbaugeräte und Anhänger', 'Gewähltes Gerät', [
      // Gesenkt/eingeschaltet des im Spiel gewählten Geräts (Hendrik 23.10.2026: Bedingung „nur wenn das gewählte Gerät
      // gesenkt ist“): Mod hud#impLow/impOn = getIsLowered()/getIsTurnedOn() des gewählten Geräts, -1 = kann es nicht
      { id: 'sel_name', name: 'Gewähltes Gerät', kind: 'text', get: d => (d.available !== false && !onFoot(d) ? selUnit(d)?.name || d.imp || null : null) },
      { id: 'sel_low', name: 'Gewähltes Gerät gesenkt/angehoben', wer: 'gewähltes Gerät', kind: 'bool', ja: 'gesenkt', nein: 'angehoben', get: d => selFlag(d, 'impLow', 'lowered') },
      { id: 'sel_on', name: 'Gewähltes Gerät ein-/ausgeschaltet', wer: 'gewähltes Gerät', kind: 'bool', ja: 'eingeschaltet', nein: 'ausgeschaltet', get: d => selFlag(d, 'impOn', 'on') },
      { id: 'sel_unfolded', name: 'Gewähltes Gerät aus-/eingeklappt', wer: 'gewähltes Gerät', kind: 'bool', ja: 'ausgeklappt', nein: 'eingeklappt', get: d => { const u = selUnit(d); return d.available !== false && !onFoot(d) && u && typeof u.unfolded === 'boolean' ? u.unfolded : null; } },
      // fill -1 = kein Gerät/keine Ladung (Mod ab 0.5.1), zu Fuß ohnehin unbekannt
      { id: 'sel_fill', name: 'Füllstand gewähltes Gerät', kind: 'num', unit: '%', get: d => (d.available !== false && !onFoot(d) ? pos(d.fill) : null), range: () => [0, 100], fixed: true, typeOf: d => d.filltype || null },
      { id: 'sel_type', name: 'Füllgut gewähltes Gerät', kind: 'text', get: d => d.filltype || null },
      { id: 'work_width', name: 'Arbeitsbreite', kind: 'num', unit: 'm', dec: 1, noRange: true, get: d => (d.workWidth > 0 ? d.workWidth : null) }
    ]],
    // ---- Feld und GPS
    ['Anbaugeräte und Anhänger', 'Abladen', [
      // Mod 0.6 (Anmerkung 18): irgendein Gerät der Kombi (oder das Fahrzeug selbst) steht an einer Abladestelle
      { id: 'tip_ok', name: 'An einer Abladestelle', kind: 'bool', ja: 'ja', nein: 'nein', get: d => (d.available !== false && !onFoot(d) && Array.isArray(d.units) ? d.units.some(x => (x.tip || 0) >= 1) : null) },
      { id: 'tip_on', name: 'Lädt gerade ab', kind: 'bool', ja: 'ja', nein: 'nein', get: d => (d.available !== false && !onFoot(d) && Array.isArray(d.units) ? d.units.some(x => x.tip === 2) : null) }
    ]],
    ['Wetter und Zeit', 'Meldungen des Spiels', [
      // Mod 0.6 (Anmerkung 18): blinkende Warnung (z. B. „Motor ist aus“) und die letzte Seitenmeldung
      { id: 'game_warn', name: 'Warnung im Spiel', kind: 'text', get: d => (d.available !== false ? d.warn || null : null) },
      { id: 'game_note', name: 'Letzte Meldung im Spiel', kind: 'text', get: d => (d.available !== false ? d.note || null : null) }
    ]],
    ['Feld und GPS', 'Feld', [
      // 255 = kein (kaufbares) Flurstück an dieser Stelle (im Spiel geprüft)
      { id: 'farmland', name: 'Flurstück', kind: 'num', noRange: true, get: d => (d.farmlandId > 0 && d.farmlandId !== 255 ? d.farmlandId : null) }
    ]],
    ['Feld und GPS', 'GPS', [
      // Paket I (server/gpsEngine.js): ab dem Auslösepunkt bzw. der vordersten Ecke des Arbeitsbalkens
      { id: 'headland_dist', name: 'Vorgewende in', kind: 'num', unit: 'm', get: d => d.gps?.headlandAheadM ?? null, range: () => [0, 50], fixed: true },
      { id: 'edge_dist', name: 'Feldrand in', kind: 'num', unit: 'm', get: d => d.gps?.fieldEdgeAheadM ?? null, range: () => [0, 100], fixed: true },
      { id: 'gps_state', name: 'Arbeitsfläche/Vorgewende', kind: 'text', get: d => (d.gps ? ({ work: 'Arbeitsfläche', headland: 'Vorgewende', outside: 'außerhalb' }[d.gps.state] || null) : null) },
      { id: 'gps_armed', name: 'Vorgewende-Aktionen an/aus', wer: 'Vorgewende-Aktionen', kind: 'bool', ja: 'an', nein: 'aus', get: d => d.gps?.armed ?? null },   // Ausfahrt oder Einfahrt löst eine Aktion aus (seit 23.10.2026 je Richtung; seit 24.10. nur mit Vorgewendeautomatik)
      { id: 'gps_automatik', name: 'Vorgewendeautomatik an/aus', wer: 'Vorgewendeautomatik', kind: 'bool', ja: 'an', nein: 'aus', get: d => (d.gps ? d.gps.automatik !== false : null) },
      { id: 'gps_device', name: 'GPS-Gerät', kind: 'text', get: d => d.gps?.device || null },
      // Teilbreiten des ersten Geräts mit Teilbreiten (Mod 0.7, Anmerkung 28; public/js/teilbreiten.js); mit Precision Farming nach den Düsen (Mod 0.7.2)
      { id: 'tb_text', name: 'Teilbreiten an', kind: 'text', get: d => { const u = Array.isArray(d.units) ? d.units.find(x => x.sections || x.pfSek) : null; return u ? globalThis.Teilbreiten?.textGeraet(u) || null : null; } },
      { id: 'tb_auto', name: 'Teilbreiten-Automatik an/aus', wer: 'Teilbreiten-Automatik', kind: 'bool', ja: 'an', nein: 'aus', get: d => (Array.isArray(d.units) && d.units.some(x => x.sections) ? !!d.teilbreiten?.auto : null) },
      { id: 'steer_on', name: 'Spurführung lenkt', kind: 'bool', ja: 'ja', nein: 'nein', get: d => (d.available !== false && d.format != null && !onFoot(d) ? !!d.steerOn : null) },
      { id: 'turn_dist', name: 'Wende in (Spurführung)', kind: 'num', unit: 'm', get: d => d.base?.turn?.distanceM ?? null, range: () => [0, 100], fixed: true }
    ]],
    // Precision Farming (frühere eigene Seite, seit dem Mockup „Navigation und Seiten“ nur noch als Werte):
    // nur mit einem Gerät, das PF-Daten meldet (Arbeitsbereich/Sprüher), sonst unbekannt
    ['Feld und GPS', 'Precision Farming', [
      { id: 'pf_on', name: 'PF: Ausbringung aktiv', kind: 'bool', ja: 'ja', nein: 'nein', get: d => (pf(d) ? !!d.pfIsWorking : null) },
      { id: 'pf_width', name: 'PF: Arbeitsbreite', kind: 'num', unit: 'm', dec: 1, noRange: true, get: d => (pf(d) ? pos(d.pfWorkWidth) : null) },
      { id: 'pf_sections', name: 'PF: Teilbreiten', kind: 'num', noRange: true, get: d => (pf(d) ? pos(d.pfNumSubSections) : null) },
      { id: 'pf_usage', name: 'PF: Ausbringmenge pro Minute', kind: 'num', unit: '/min', dec: 1, noRange: true, get: d => (pf(d) ? pos(d.pfUsagePerMin) : null) },
      { id: 'pf_fill', name: 'PF: Füllstand', kind: 'num', unit: '%', get: d => (pf(d) ? pos(d.pfFillLevel) : null), range: () => [0, 100], fixed: true },
      { id: 'pf_n', name: 'PF: Stickstoff Ist', kind: 'num', dec: 1, get: d => (pf(d) ? pos(d.pfNitrogen) : null), range: d => (d.pfNitrogenTarget > 0 ? [0, Math.ceil(d.pfNitrogenTarget * 1.5)] : null) },
      { id: 'pf_n_target', name: 'PF: Stickstoff Soll', kind: 'num', dec: 1, noRange: true, get: d => (pf(d) ? pos(d.pfNitrogenTarget) : null) },
      { id: 'pf_ph', name: 'PF: pH-Wert Ist', kind: 'num', dec: 1, get: d => (pf(d) ? pos(d.pfPh) : null), range: () => [4, 9], fixed: true },
      { id: 'pf_ph_target', name: 'PF: pH-Wert Soll', kind: 'num', dec: 1, noRange: true, get: d => (pf(d) ? pos(d.pfPhTarget) : null) }
    ]],
    // ---- Arbeitsplaner (Hendrik 22.10.2026 abends; d.planner kommt vom Server, s. server/index.js plannerContext()).
    // Gemessen wird nur, solange ein Tablet den Planer oder einen dieser Werte zeigt -- sonst unbekannt.
    ['Arbeitsplaner', 'Feld in Arbeit', [
      { id: 'plan_live', name: 'Auf eigenem Feld', kind: 'bool', ja: 'ja', nein: 'nein', get: d => (d.planner ? !!d.planner.live : null) },
      { id: 'plan_live_field', name: 'Feld in Arbeit', kind: 'num', noRange: true, get: d => d.planner?.live?.id ?? null },
      { id: 'plan_live_fruit', name: 'Frucht (Feld in Arbeit)', kind: 'text', get: d => d.planner?.live?.fruit || null },
      { id: 'plan_live_task', name: 'Arbeit (Feld in Arbeit)', kind: 'text', get: d => d.planner?.live?.task || null },
      { id: 'plan_live_done', name: 'Erledigt (Feld in Arbeit)', kind: 'num', unit: '%', get: d => d.planner?.live?.done ?? null, range: () => [0, 100], fixed: true },
      { id: 'plan_live_open', name: 'Offen (Feld in Arbeit)', kind: 'num', unit: 'ha', dec: 2, noRange: true, get: d => d.planner?.live?.openHa ?? null },
      { id: 'plan_live_next', name: 'Danach (Feld in Arbeit)', kind: 'text', get: d => (d.planner?.live ? d.planner.live.next || 'nichts' : null) }
    ]],
    ['Arbeitsplaner', 'Übersicht', [
      { id: 'plan_next', name: 'Als Nächstes', kind: 'text', get: d => (d.planner ? d.planner.next || 'nichts zu tun' : null) },
      { id: 'plan_open_fields', name: 'Felder mit offener Arbeit', kind: 'num', noRange: true, get: d => d.planner?.openFields ?? null },
      { id: 'plan_open_area', name: 'Fläche mit offener Arbeit', kind: 'num', unit: 'ha', dec: 2, noRange: true, get: d => d.planner?.openArea ?? null },
      { id: 'plan_fields', name: 'Eigene Felder', kind: 'num', noRange: true, get: d => d.planner?.fields ?? null },
      { id: 'plan_area', name: 'Eigene Fläche', kind: 'num', unit: 'ha', dec: 2, noRange: true, get: d => d.planner?.area ?? null }
    ]],
    // ---- Wetter und Zeit
    ['Wetter und Zeit', 'Zeit', [
      { id: 'clock', name: 'Spielzeit', kind: 'text', get: d => { const t = d.base?.gameTime; return t ? `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}` : null; } },
      { id: 'season', name: 'Jahreszeit', kind: 'text', get: d => SEASONS[d.envSeason] || null },
      // envSunOn gilt nur, wenn die Mod die Uhrzeit geliefert hat (bis Mod 0.5.0 zu Fuß nicht: dann stand dort „Nacht“)
      { id: 'daylight', name: 'Tag oder Nacht', wer: '', kind: 'bool', ja: 'Tag', nein: 'Nacht', get: d => (typeof d.envSunOn === 'boolean' && !(d.envHour < 0) ? d.envSunOn : null) },
      { id: 'day', name: 'Tag im Monat', kind: 'num', noRange: true, get: d => (d.dayInPeriod > 0 ? d.dayInPeriod : null) }
    ]],
    ['Wetter und Zeit', 'Wetter', [
      { id: 'weather', name: 'Wetter', kind: 'text', get: d => { const w = d.base?.weather?.type; return w ? (WEATHER[w] || w) : null; } },
      { id: 'air_temp', name: 'Außentemperatur', kind: 'num', unit: '°C', get: d => num(d.base?.weather?.temperatureC), range: () => [-10, 40], fixed: true }
    ]],
    // ---- Wirtschaft
    ['Wirtschaft', 'Konto', [
      { id: 'money', name: 'Kontostand', kind: 'num', unit: '€', noRange: true, get: d => d.base?.money ?? null }
    ]],
    // ---- ControlHub (d.hub kommt vom Server, s. server/index.js hubContext())
    ['ControlHub', 'Steuerung', [
      { id: 'profile', name: 'Aktives Profil', kind: 'text', get: d => d.hub?.profile || null },
      { id: 'macro', name: 'Laufendes Makro', kind: 'text', get: d => (d.hub ? (d.hub.macro || 'kein Makro') : null) },
      { id: 'macro_on', name: 'Makro läuft', kind: 'bool', ja: 'ja', nein: 'nein', get: d => (d.hub ? !!d.hub.macro : null) },
      { id: 'layer1', name: 'Ebene CraftSlot 1', kind: 'num', noRange: true, get: d => d.hub?.layers?.craftslot1 ?? null },
      { id: 'layer2', name: 'Ebene CraftSlot 2', kind: 'num', noRange: true, get: d => d.hub?.layers?.craftslot2 ?? null },
      // Streckenzähler (Server, s. index.js countTrip()); zurücksetzen mit der ControlHub-Aktion „Streckenzähler zurücksetzen“
      { id: 'trip_km', name: 'Strecke (Streckenzähler)', kind: 'num', unit: 'km', dec: 2, noRange: true, get: d => d.hub?.tripKm ?? null }
    ]]
  ];

  function build(groups) {
    const list = [];
    for (const [cat, sub, items] of groups) for (const v of items) list.push({ unit: '', dec: 0, ...v, cat, sub: v.sub || sub });
    return list;
  }
  const LISTS = { fs25: build(FS25) };
  const BY_ID = {};
  for (const [game, list] of Object.entries(LISTS)) BY_ID[game] = Object.fromEntries(list.map(v => [v.id, v]));

  // Frühere Werte-Kachel (tiles.js VALUES, bis Paket H) → neue IDs; gespeicherte Auswahlen bleiben erhalten
  const OLD_IDS = {
    tempo: 'speed', drehzahl: 'rpm', gang: 'gear', tank: 'fuel_pct', adblue: 'adblue_pct', temperatur: 'motor_temp',
    wende: 'turn_dist', tempomat: 'cruise', fuellstand: 'sel_fill', schlupf: 'slip', arbeitsbreite: 'work_width',
    uhrzeit: 'clock', geld: 'money'
  };

  const W = {
    list: game => LISTS[game] || [],
    get: (game, id) => BY_ID[game]?.[OLD_IDS[id] || id] || null,
    has: game => !!LISTS[game],
    migrateId: id => OLD_IDS[id] || id,

    // Aktueller Wert; null = unbekannt (keine Spieldaten, Wert gibt es gerade nicht)
    value(def, d) {
      if (!def || !d || d.available === false) return null;
      try { const v = def.get(d); return v === undefined ? null : v; } catch { return null; }
    },

    // Bereich für Balken/Tacho: von Hand (manual = [min, max]) oder aus dem Spiel; Notlösung 0–100
    range(def, d, manual) {
      if (Array.isArray(manual) && manual.length === 2 && manual[1] > manual[0]) return manual;
      let r = null;
      if (def?.range && d && d.available !== false) { try { r = def.range(d); } catch { r = null; } }
      return r && r[1] > r[0] ? r : [0, 100];
    },

    // Welche Darstellungen zu einem Wert passen (erste = Vorschlag)
    displayTypes(def) {
      if (!def) return ['zahl'];
      if (def.kind === 'bool') return ['leuchte', 'text'];
      if (def.kind === 'text') return ['text'];
      return def.noRange ? ['zahl'] : ['zahl', 'balken', 'tacho'];
    },

    // Zustand eines an/aus-Werts in eigenen Worten (Hendrik 24.10.2026: „Gerät gesenkt an/aus … versteht man als normaler
    // Mensch nicht“): ja/nein am Wert, z. B. gesenkt/angehoben; ohne Angabe an/aus
    zustand(def, v) { return v ? (def?.ja || 'an') : (def?.nein || 'aus'); },
    // Bedingung als kurzer Satz: mit wer „Gerät hinten 1 angehoben“, „Motor läuft“, „Nacht“; sonst „Helfer fährt: nein“
    satz(def, v) { return typeof def?.wer === 'string' ? `${def.wer} ${W.zustand(def, v)}`.trim() : `${def?.name || '?'}: ${W.zustand(def, v)}`; },

    format(def, v, dec) {
      if (v === null || v === undefined) return '–';
      if (def?.kind === 'bool') return W.zustand(def, v);
      if (typeof v !== 'number') return String(v);
      const n = dec ?? def?.dec ?? 0;
      return v.toLocaleString('de-DE', { minimumFractionDigits: n, maximumFractionDigits: n });
    },

    // Suche über Name, Kategorie und Unterkategorie (ohne Groß/klein)
    search(game, q) {
      const s = String(q || '').trim().toLowerCase();
      if (!s) return [];
      return W.list(game).filter(v => `${v.name} ${v.cat} ${v.sub}`.toLowerCase().includes(s));
    },

    // Baum für die Auswahl: [{ cat, subs: [{ sub, values: [...] }] }] in Listenreihenfolge
    tree(game) {
      const cats = [];
      for (const v of W.list(game)) {
        let c = cats.find(x => x.cat === v.cat);
        if (!c) cats.push(c = { cat: v.cat, subs: [] });
        let s = c.subs.find(x => x.sub === v.sub);
        if (!s) c.subs.push(s = { sub: v.sub, values: [] });
        s.values.push(v);
      }
      return cats;
    }
  };

  root.Werteliste = W;
})(globalThis);
