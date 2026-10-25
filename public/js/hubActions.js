/**
 * ControlHub-Aktionen (Umsetzungsplan Paket J, erledigt die V2-Idee „Profil-Hotkeys“): Profil laden und
 * Kachelseite wechseln. Sie wirken nur in ControlHub, nicht im Spiel.
 *
 * In der Aktionsauswahl (actionPicker.js) stehen sie als Gruppe „ControlHub-Steuerung“ (mit Untergruppen Kachelseiten,
 * Profile, GPS & Zähler), genau wie Makros als
 * „Makros“ eingemischt werden; in der Funktionsliste als feste Gruppe zum Ansehen (app.js, 23.10.2026). Gespeichert wird eine Zeichenkette wie bei Makros ("macro:<id>"):
 *   hub:profile:<Profilname> · hub:tiles:next · hub:tiles:prev · hub:tiles:show:<Seiten-ID> · hub:strecke:reset · hub:gps:ton
 *   · hub:gps:automatik (Vorgewendeautomatik an/aus, 24.10.2026)
 * Ausgeführt im Server (mappingEngine.js runHubItems() → index.js runHubAction()); die Tablets wechseln
 * die Kachelseite auf das Ereignis 'tiles-command' (tiles.js).
 * Seit 24.10.2026 auch die Vorgewendeautomatik an/aus (Hendrik); den Vorgewende-Ton an/aus schon
 * (Test 23.10.2026, Anmerkung 15: Armlehnen-Tasten sollen auch Dinge in ControlHub einstellen).
 */
(function () {
  const GROUP = 'ControlHub-Steuerung';   // gleicher Name in der Tastenauswahl und in der Funktionsliste (app.js FN_HUB)

  function pageName(id) {
    return window.tilePages?.pages?.find(p => p.id === id)?.name || null;
  }

  const hubActions = {
    GROUP,
    isHub: id => typeof id === 'string' && id.startsWith('hub:'),

    // Untergruppe in „ControlHub-Steuerung“ (24.10.2026, Hendrik: Unterkategorien machen die Tastenbelegung bei den
    // ControlHub-eigenen Funktionen übersichtlicher)
    untergruppe(id) {
      const cmd = String(id).slice(4);
      if (cmd.startsWith('tiles:')) return 'Kachelseiten';
      if (cmd.startsWith('profile:')) return 'Profile';
      return 'GPS & Zähler';
    },

    // Anzeigename für eine gespeicherte Belegung (Modulansicht, Bedienpanel, Profil-Import)
    label(id) {
      if (!hubActions.isHub(id)) return null;
      const cmd = id.slice(4);
      if (cmd === 'tiles:next') return '⌂ Nächste Kachelseite';
      if (cmd === 'tiles:prev') return '⌂ Vorherige Kachelseite';
      if (cmd.startsWith('tiles:show:')) {
        const name = pageName(cmd.slice('tiles:show:'.length));
        return name ? `⌂ Kachelseite „${name}“` : '⌂ Kachelseite zeigen';
      }
      if (cmd.startsWith('profile:')) return `⇄ Profil „${profilAnzeige(cmd.slice('profile:'.length))}“ laden`;
      if (cmd === 'strecke:reset') return '↺ Streckenzähler zurücksetzen';
      if (cmd === 'gps:ton') return '🔔 Vorgewende-Ton an/aus';
      if (cmd === 'gps:automatik') return '⏯ Vorgewendeautomatik an/aus';
      return 'ControlHub-Aktion';
    },

    // Pseudo-Funktionen für die Aktionsauswahl (Format wie /api/functions)
    async pseudoFunctions() {
      const [p, k] = await Promise.all([
        fetch('/api/profiles').then(r => r.json()).catch(() => ({})),
        fetch('/api/kacheln').then(r => r.json()).catch(() => ({}))
      ]);
      const pages = k.config?.pages || [];
      const ids = [
        'hub:tiles:next', 'hub:tiles:prev', 'hub:strecke:reset', 'hub:gps:ton', 'hub:gps:automatik',
        ...pages.map(pg => `hub:tiles:show:${pg.id}`),
        ...(p.profiles || []).map(pr => `hub:profile:${pr.name}`)
      ];
      return ids.map(id => {
        const show = id.startsWith('hub:tiles:show:') ? pages.find(pg => `hub:tiles:show:${pg.id}` === id) : null;
        return {
          id,
          name: show ? `⌂ Kachelseite „${show.name}“ zeigen` : hubActions.label(id),
          categories: [`${GROUP}${window.FunctionGroups.UG}${hubActions.untergruppe(id)}`],
          actions: [{ type: 'hub' }]
        };
      });
    }
  };

  window.hubActions = hubActions;
})();
