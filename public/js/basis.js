/**
 * Gemeinsame Kleinigkeiten, die mehrere Skripte brauchen -- als ERSTES App-Skript geladen (index.html).
 * Standen bis 24.10.2026 in steuerungsmenues.js, das erst spät lädt: Kam eine Antwort des Servers, bevor alle Skripte
 * geladen waren (in der Live-Demo immer, am Tablet über langsames WLAN möglich), zeichneten armlehnenSetup.js bzw.
 * axisAssignment.js zu früh und brachen mit „SM_BUTTON_COLORS / escapeHtml is not defined“ ab.
 */

// Anzeigename eines Profils (Hendrik 24.10.2026): das Grundprofil „default“ heißt in der Oberfläche „Gamepad-Modus“ --
// jede Taste ist eine Gamepad-Taste, die Achsen gehen durch, belegt wird im Spiel (wie ohne ControlHub). Intern, in
// Sicherungen, Kachelseiten und im Auto-Wechsel bleibt der Name „default“.
const PROFIL_STANDARD = 'default';
const PROFIL_STANDARD_NAME = 'Gamepad-Modus';
function profilAnzeige(name) {
  return name === PROFIL_STANDARD ? PROFIL_STANDARD_NAME : name;
}
// Der Gamepad-Modus ist schreibgeschützt (Hendrik 24.10.2026: „… kann nicht verändert werden. Das dient ja nur zum Zweck,
// dass man die Fallback-Belegung auch mit dem ControlHub nutzen kann“). Wer ihn ändern will, bekommt statt des Editors
// diesen Hinweis; „Als eigenes Profil kopieren“ legt eine Kopie an und schaltet gleich auf sie um.
function profilGeschuetzt(name) {
  return name === PROFIL_STANDARD;
}
async function gamepadModusHinweis() {
  const wahl = await uiChoice(`Der ${PROFIL_STANDARD_NAME} ist schreibgeschützt. Jede Taste und jede Achse geht wie bei einem Gamepad ans Spiel, belegt wird im Spiel – genau wie an der Armlehne ohne ControlHub.\n\nFür eine eigene Belegung kopierst du ihn als eigenes Profil oder aktivierst ein anderes.`,
    [{ label: 'Als eigenes Profil kopieren', value: 'kopie' }], { title: PROFIL_STANDARD_NAME, cancel: 'Schließen' });
  if (wahl === 'kopie') await window.app?.duplicateProfile(PROFIL_STANDARD, { aktivieren: true });
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');   // auch in '…'-Attributen sicher (23.10.2026)
}

// Vorlagen für die optionale Tasten-Hintergrundfarbe -- 9 statt der ca. 6 genannten Farben, da Hendrik
// alle neun einzeln aufgezählt hat ("Rot orange gelb grün blau lila weiß grau schwarz").
const SM_BUTTON_COLORS = [
  { id: 'red', hex: '#e53935', label: 'Rot' },
  { id: 'orange', hex: '#fb8c00', label: 'Orange' },
  { id: 'yellow', hex: '#fdd835', label: 'Gelb' },
  { id: 'green', hex: '#43a047', label: 'Grün' },
  { id: 'blue', hex: '#1e88e5', label: 'Blau' },
  { id: 'purple', hex: '#8e24aa', label: 'Lila' },
  { id: 'white', hex: '#f5f5f5', label: 'Weiß' },
  { id: 'gray', hex: '#9e9e9e', label: 'Grau' },
  { id: 'black', hex: '#212121', label: 'Schwarz' }
];

// Datei herunterladen (Ordner Downloads) -- ein Ablauf für alle Exporte (Durchsicht B9, 24.10.2026: stand vorher in
// neun Varianten in den Skripten). name ohne Endung; Zeichen, die Windows im Dateinamen nicht erlaubt, werden zu „-“.
function downloadJson(data, name) {
  const datei = String(name || 'ControlHub').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').trim().slice(0, 120) || 'ControlHub';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = datei + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// JSON-Datei wählen und lesen -- Gegenstück zu downloadJson. @returns {Promise<any|null>} null = abgebrochen
function pickJsonFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      try { resolve(JSON.parse(await file.text())); } catch (e) { reject(new Error('Die Datei ist kein gültiges JSON (' + e.message + ')')); }
    };
    input.click();
  });
}
