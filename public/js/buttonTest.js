/**
 * Tasten-Test (23.08.2026, Hendriks Wunsch): automatisierter Soll/Ist-Abgleich der physischen
 * Tastennummern, statt Live-Diagnose manuell mitzuschreiben (s. Firmware/CraftConsolePro_Pico/
 * Tastennummern-Abgleich.md für den Hintergrund). Pro Zeile "Testen" klicken, am Gerät die gemeinte
 * Taste drücken -- das Tool erkennt automatisch, welche Nummer ankam (über dasselbe 'state-update'-
 * Ereignis + Warte-Flag-Muster wie CraftSlotLayerToolbar.onStateUpdate() in moduleFlow.js), vergleicht
 * mit dem Soll-Wert und listet am Ende nur die Abweichungen für ein per Klick kopierbares Protokoll.
 *
 * Rein clientseitig, keine neue Server-Route -- nutzt nur das schon vorhandene 'state-update'-Event.
 * Die Soll-Liste hier spiegelt Hendriks NEU geplante Zielnummerierung (23.08.2026, noch nicht in der
 * Firmware umgesetzt) -- muss beim nächsten Nummerierungs-Update mit der .md-Datei synchron gehalten
 * werden, ist aber bewusst NICHT von dort eingelesen (keine Datei-Lese-Route für Doku-Markdown nötig).
 *
 * Socket.IO über die gemeinsame Verbindung window.hubSocket (seit 23.10.2026, B4) statt window.app.socket (gleicher Grund wie liveDiagnostics.js/
 * dashboardMap.js -- dieses Skript lädt synchron vor app.js' DOMContentLoaded-Handler).
 */

// range(26,41) -> [26,27,...,41], generische Tasten "Taste 1".."Taste N" ab startLabel=1
function buttonTestRange(from, to, labelPrefix, startLabel = 1) {
  const entries = [];
  for (let n = from; n <= to; n++) entries.push({ soll: n, label: `${labelPrefix} ${startLabel + (n - from)}` });
  return entries;
}

// Ein CraftSlot-Block: Grip(16) + Hebel-Achsen-Tasten(4) + Thumbstick-Achsen-Tasten(4) + Aux(5) = 29,
// beide CraftSlots bewusst identisch aufgebaut (Hendriks Wunsch 24.08.2026: Thumbstick-Tasten
// nachträglich ergänzt, Rest rutscht auf -- Directus UND Mortis/Polaris bekommen dasselbe Schema,
// unabhängig davon, ob der jeweilige Griff aktuell schon einen verkabelten Thumbstick hat).
function craftSlotBlock(start, griffName) {
  const grip = buttonTestRange(start, start + 15, 'Grip');
  const hebelStart = start + 16;
  const hebel = [
    { soll: hebelStart, label: 'Hebel vor (als Taste)' },
    { soll: hebelStart + 1, label: 'Hebel zurück (als Taste)' },
    { soll: hebelStart + 2, label: 'Hebel links (als Taste)' },
    { soll: hebelStart + 3, label: 'Hebel rechts (als Taste)' }
  ];
  const thumbStart = hebelStart + 4;
  const thumb = [
    { soll: thumbStart, label: 'Thumbstick links (als Taste)' },
    { soll: thumbStart + 1, label: 'Thumbstick rechts (als Taste)' },
    { soll: thumbStart + 2, label: 'Thumbstick hoch (als Taste)' },
    { soll: thumbStart + 3, label: 'Thumbstick runter (als Taste)' }
  ];
  const aux = buttonTestRange(thumbStart + 4, thumbStart + 8, 'Aux');
  return { module: `CraftSlot ${start === 1 ? '1 (Directus-Griff)' : '2 (Polaris/Mortis-Griff)'}`, entries: [...grip, ...hebel, ...thumb, ...aux] };
}

const BUTTON_TEST_PLAN = [
  craftSlotBlock(1),
  { module: 'CraftPad 1', entries: buttonTestRange(30, 45, 'Taste') },
  {
    module: 'Fingertip-Modul',
    entries: [46, 48, 50, 52].flatMap((n, i) => [
      { soll: n, label: `Fingertip ${i + 1} vor` },
      { soll: n + 1, label: `Fingertip ${i + 1} zurück` }
    ])
  },
  { module: 'CraftPad 2', entries: buttonTestRange(54, 69, 'Taste') },
  {
    module: 'CraftDeck',
    entries: [
      // 3-Stellungs-Zündschloss (25.08.2026, Hendriks Klarstellung -- war vorher 70/71 nur
      // Impuls/Taste eines einzelnen Eingangs): genau eine der drei ist immer aktiv.
      { soll: 70, label: 'Zündschloss Nullstellung' },
      { soll: 71, label: 'Zündschloss Eingang 1 (D1)' },
      { soll: 72, label: 'Zündschloss Eingang 2 (D2)' },
      ...buttonTestRange(73, 82, 'Gateron-Taste'),
      ...[83, 84, 85].map(n => ({ soll: n, label: '(reserviert, noch unbelegt)' }))
    ]
  },
  craftSlotBlock(86)
];

class ButtonTestTool {
  constructor() {
    this.container = document.getElementById('tab-button-test');
    // soll -> { status: 'ok'|'mismatch'|'not-detected'|'not-installed', ist: number|null }
    this.results = {};
    this.armed = null; // soll-Nummer, die gerade auf einen Tastendruck wartet, oder null
    // Modul-für-Modul (Hendriks Wunsch 24.08.2026, statt alle 6 Karten gleichzeitig anzuzeigen) --
    // das Ergebnis-Protokoll bleibt trotzdem EIN globales this.results über alle Module hinweg.
    this.currentModule = BUTTON_TEST_PLAN[0].module;
    this.render();

    this.socket = window.hubSocket;   // gemeinsame Verbindung der Seite (hubSocket.js, B4)
    this.socket.on('state-update', (data) => this.onStateUpdate(data));
  }

  selectModule(name) {
    this.armed = null; // ein Wechsel des Moduls bricht ein laufendes Warten sinnvollerweise ab
    this.currentModule = name;
    this.render();
  }

  render() {
    const allEntries = BUTTON_TEST_PLAN.flatMap(g => g.entries);
    const total = allEntries.length;
    const tested = Object.keys(this.results).length;
    const problems = Object.values(this.results).filter(r => r.status === 'mismatch' || r.status === 'not-detected').length;
    const notInstalled = Object.values(this.results).filter(r => r.status === 'not-installed').length;

    const moduleTabs = BUTTON_TEST_PLAN.map(group => {
      const groupTested = group.entries.filter(e => this.results[e.soll]).length;
      const done = groupTested === group.entries.length;
      const active = group.module === this.currentModule;
      return `<button type="button"
        class="button-test-module-tab ${active ? 'active' : ''} ${done ? 'button-test-module-tab--done' : ''}"
        onclick="window.buttonTest.selectModule('${group.module.replace(/'/g, "\\'")}')">
        ${done ? '✓ ' : ''}${group.module} (${groupTested}/${group.entries.length})
      </button>`;
    }).join('');

    const currentGroup = BUTTON_TEST_PLAN.find(g => g.module === this.currentModule);
    const rows = currentGroup.entries.map(e => this.renderRow(e)).join('');

    this.container.innerHTML = `
      <section class="card">
        <p style="color: var(--text-dim); margin-top: 0;">
          Soll/Ist-Abgleich der physischen Tastennummern (Hendriks neu geplante Zielnummerierung,
          23.08.2026 – noch nicht in der Firmware umgesetzt, Abweichungen sind bei diesem Durchlauf
          also normal). Modul auswählen, dann pro Taste "Testen" + am Gerät drücken – oder bei
          Bedarf direkt "Nicht erkannt"/"Nicht verbaut" setzen.
        </p>
        <div class="button-group" style="justify-content: space-between; align-items: center;">
          <p style="margin: 0; font-weight: 600;">
            Getestet: ${tested} / ${total} &nbsp;·&nbsp; Abweichungen: ${problems} &nbsp;·&nbsp; Nicht verbaut: ${notInstalled}
          </p>
          <div class="button-group">
            <button class="btn-secondary" onclick="window.buttonTest.reset()">Alles zurücksetzen</button>
            <button class="btn-primary" onclick="window.buttonTest.copyProtocol()">Protokoll kopieren</button>
          </div>
        </div>
        <div class="button-test-module-tabs">${moduleTabs}</div>
      </section>
      <section class="card">
        <h3 style="margin-top: 0;">${this.currentModule}</h3>
        <div class="button-test-list">${rows}</div>
      </section>
    `;
  }

  renderRow(entry) {
    const result = this.results[entry.soll];
    const isArmed = this.armed === entry.soll;
    let statusHtml, actionsHtml;

    if (isArmed) {
      statusHtml = `<span class="button-test-status button-test-status--waiting">Warte auf Tastendruck …</span>`;
      actionsHtml = `<button class="btn-secondary btn-small" onclick="window.buttonTest.cancelArm()">Abbrechen</button>`;
    } else {
      const extraHtml = result?.extra ? ` <span class="button-test-status button-test-status--mismatch" title="Mehrere Tasten im selben Moment als gedrückt erkannt – vermutlich Kontaktprellen beim Tastenwechsel, nicht zwangsläufig eine falsche Verkabelung">⚠ gleichzeitig: ${result.extra.join(', ')}</span>` : '';
      if (!result) statusHtml = `<span class="button-test-status button-test-status--pending">offen</span>`;
      else if (result.status === 'ok') statusHtml = `<span class="button-test-status button-test-status--ok">✓ stimmt</span>${extraHtml}`;
      else if (result.status === 'mismatch') statusHtml = `<span class="button-test-status button-test-status--mismatch">✗ Ist: ${result.ist}</span>${extraHtml}`;
      else if (result.status === 'not-detected') statusHtml = `<span class="button-test-status button-test-status--mismatch">⚠ nicht erkannt</span>`;
      else statusHtml = `<span class="button-test-status button-test-status--skipped">– nicht verbaut</span>`;

      actionsHtml = `
        <div class="button-group">
          <button class="btn-secondary btn-small" onclick="window.buttonTest.testRow(${entry.soll})">Testen</button>
          <button class="btn-secondary btn-small" onclick="window.buttonTest.markResult(${entry.soll}, 'not-detected')">Nicht erkannt</button>
          <button class="btn-secondary btn-small" onclick="window.buttonTest.markResult(${entry.soll}, 'not-installed')">Nicht verbaut</button>
        </div>
      `;
    }

    return `
      <div class="button-test-row">
        <span class="button-test-soll">${entry.soll}</span>
        <span class="button-test-label">${entry.label}</span>
        ${statusHtml}
        ${actionsHtml}
      </div>
    `;
  }

  testRow(soll) {
    this.armed = soll;
    this.render();
  }

  cancelArm() {
    this.armed = null;
    this.render();
  }

  // Für "Nicht erkannt"/"Nicht verbaut" -- keine Taste zu drücken nötig, Ergebnis steht sofort fest.
  markResult(soll, status) {
    this.results[soll] = { status, ist: null };
    this.armed = null;
    this.advanceWithinModule(soll);
  }

  onStateUpdate(data) {
    if (this.armed == null) return;
    const buttonDownIds = data.events?.buttonDown || [];
    if (buttonDownIds.length === 0) return;

    const soll = this.armed;
    const allIst = buttonDownIds.map(id => id + 1); // 0-basiert -> menschlich 1-basiert
    const ist = allIst[0];
    // Mehrere Tasten im selben Frame "unten" (25.08.2026, Hendriks Bedienteil-rechts-Befund: in sich
    // widersprüchliche Ergebnisse trotz sauberem, langsamem Testen -- Verdacht Kontaktprellen der
    // Gateron-Switches beim Loslassen der vorherigen Taste überlappt mit dem Druck der nächsten) --
    // bisher wurde stillschweigend nur buttonDownIds[0] genommen, das kann bei einer Überlappung die
    // FALSCHE der beiden Tasten sein. Jetzt sichtbar machen statt zu verschlucken.
    const result = { status: ist === soll ? 'ok' : 'mismatch', ist };
    if (allIst.length > 1) result.extra = allIst;
    this.results[soll] = result;
    this.advanceWithinModule(soll);
  }

  // Komfort: direkt weiter zur nächsten noch offenen Taste IM SELBEN MODUL (Hendriks Wunsch: Modul für
  // Modul durchgehen, nicht quer über alle 106 springen). Ist das Modul fertig, bleibt nichts mehr
  // scharf geschaltet -- Hendrik wählt dann selbst das nächste Modul. Jederzeit lässt sich trotzdem
  // gezielt eine andere Zeile per "Testen" anwählen, das überschreibt dieses Auto-Weiterschalten.
  advanceWithinModule(soll) {
    const group = BUTTON_TEST_PLAN.find(g => g.entries.some(e => e.soll === soll));
    const idx = group.entries.findIndex(e => e.soll === soll);
    const next = group.entries.slice(idx + 1).find(e => !this.results[e.soll]);
    this.armed = next ? next.soll : null;
    this.render();
  }

  reset() {
    this.results = {};
    this.armed = null;
    this.render();
  }

  copyProtocol() {
    const lines = [];
    const allEntries = BUTTON_TEST_PLAN.flatMap(g => g.entries);
    const total = allEntries.length;
    const tested = Object.keys(this.results).length;
    const notInstalledCount = Object.values(this.results).filter(r => r.status === 'not-installed').length;

    const problemGroups = BUTTON_TEST_PLAN
      .map(group => ({
        module: group.module,
        problems: group.entries
          .map(e => ({ entry: e, result: this.results[e.soll] }))
          .filter(({ result }) => result && (result.status === 'mismatch' || result.status === 'not-detected'))
      }))
      .filter(g => g.problems.length > 0);
    const problemCount = problemGroups.reduce((s, g) => s + g.problems.length, 0);

    lines.push(`Tasten-Test-Protokoll (${new Date().toLocaleDateString('de-DE')})`);
    lines.push(`Getestet: ${tested} / ${total}, Abweichungen: ${problemCount}, Nicht verbaut: ${notInstalledCount}`);
    lines.push('');
    if (problemGroups.length === 0) {
      lines.push('Keine Abweichungen.');
    } else {
      for (const g of problemGroups) {
        lines.push(`${g.module}:`);
        for (const { entry, result } of g.problems) {
          let detail = result.status === 'not-detected' ? 'nicht erkannt' : `Ist ${result.ist}`;
          if (result.extra) detail += ` [gleichzeitig erkannt: ${result.extra.join(', ')} – vermutlich Kontaktprellen]`;
          lines.push(`  Soll ${entry.soll} (${entry.label}) -> ${detail}`);
        }
      }
    }
    const text = lines.join('\n');

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => window.showToast('Protokoll kopiert'))
        .catch(() => uiShowText('Kopieren fehlgeschlagen – bitte manuell markieren und kopieren:', text, { title: 'Protokoll' }));
    } else {
      uiShowText('Bitte manuell markieren und kopieren:', text, { title: 'Protokoll' });
    }
  }
}

window.buttonTest = new ButtonTestTool();
