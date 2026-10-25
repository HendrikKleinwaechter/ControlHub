/**
 * Routen: Version und „Nach Updates suchen“ (23.10.2026, Update-Weg).
 *
 * ControlHub geht NIE von selbst ins Internet (Hendrik 23.10.2026): Nur wenn jemand in Einstellungen → Allgemein
 * auf „Nach Updates suchen“ drückt, fragt der Server einmal bei GitHub nach der neuesten veröffentlichten Version
 * (Releases des Repos aus package.json „controlhub.updateRepo“). Heruntergeladen oder installiert wird nichts --
 * die Oberfläche zeigt nur, ob es etwas Neues gibt, was neu ist und wo es liegt.
 */
import { VERSION, UPDATE_REPO, DATA_DIR } from '../paths.js';
import { neuerAls } from '../datenOrdner.js';

export function registerUpdateRoutes(app) {
  app.get('/api/version', (req, res) => {
    res.json({ success: true, version: VERSION, datenOrdner: DATA_DIR, updateSeite: UPDATE_REPO ? `https://github.com/${UPDATE_REPO}/releases` : null });
  });

  // POST statt GET: Browser und Vorschauen rufen POST nie von selbst auf
  app.post('/api/update/pruefen', async (req, res) => {
    if (!UPDATE_REPO) return res.json({ success: false, error: 'In dieser Version ist keine Update-Quelle eingetragen.' });
    let antwort;
    try {
      antwort = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
        headers: { 'User-Agent': `ControlHub/${VERSION}`, Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(10000)
      });
    } catch {
      return res.json({ success: false, error: 'GitHub ist nicht erreichbar – bitte die Internetverbindung des PCs prüfen.' });
    }
    if (antwort.status === 404) return res.json({ success: true, stand: 'keine', version: VERSION });
    if (!antwort.ok) return res.json({ success: false, error: `GitHub hat nicht wie erwartet geantwortet (Fehler ${antwort.status}). Später noch einmal versuchen.` });
    try {
      const d = await antwort.json();
      const neueste = String(d.tag_name || '').replace(/^v/i, '');
      res.json({
        success: true,
        version: VERSION,
        neueste,
        stand: neuerAls(neueste, VERSION) ? 'neu' : 'aktuell',
        name: String(d.name || ''),
        datum: d.published_at || null,
        url: typeof d.html_url === 'string' && d.html_url.startsWith('https://github.com/') ? d.html_url : null,
        hinweise: String(d.body || '').slice(0, 3000)
      });
    } catch {
      res.json({ success: false, error: 'Die Antwort von GitHub ließ sich nicht lesen.' });
    }
  });
}
