# ControlHub

**Belegung, Kachelseiten und Spieldaten für die CraftConsole und eigene Controller im Landwirtschafts-Simulator 25.**

ControlHub läuft auf deinem Windows-PC, die Bedienung geht im Browser, auch auf Tablet und Handy im selben WLAN.

> **Offene Beta:** ControlHub ist gut nutzbar, aber noch nicht die finale Version. Fehler und Wünsche bitte im
> [Discord](https://discord.gg/bGshvCPxDC) melden. Kleine Fehler behebe ich mit Updates.

## Was ControlHub kann

- **Tasten frei belegen:** Jede Taste und Achse deines Controllers bekommt eine Funktion aus dem Spiel, eine Tastenkombination oder ein Makro. Die Funktionen liest ControlHub aus deiner Tastenbelegung im Spiel, auch für Mods. Profile wechseln je nach Fahrzeug oder Gerät.
- **Kachelseiten mit Spieldaten:** Cockpit, Karte mit Feldern, Geräte, Werte, Steuerungsübersicht und mehr, frei angeordnet. Dafür gibt es einen Kachel-Editor am PC.
- **GPS und Vorgewende:** Spurführung, Makros am Vorgewende und eine Teilbreiten-Automatik.
- **Arbeitsplaner:** deine Felder, die Fruchtfolge und was als Nächstes ansteht.
- **Controller:** die CraftConsole-Armlehne, der CraftLink (ein Raspberry Pi Pico mit eigenen Tastern) und eigene Controller.

## Download

Alles für ControlHub liegt unter **[Releases](https://github.com/HendrikKleinwaechter/ControlHub/releases/latest)**:

| Datei | Was ist das? |
|---|---|
| `ControlHub-<Version>.zip` | das Programm, darin im Ordner `Mod` auch die Mod für die Spieldaten |
| `FS25_CraftConsoleHUD.zip` | die Mod noch einmal einzeln (Dateiname nicht ändern, nicht entpacken) |
| `ControlHub-Handbuch.pdf` | das Handbuch |

Die Firmware für die Controller hat je ein eigenes Repo:

- [CraftConsole-Firmware](https://github.com/HendrikKleinwaechter/CraftConsole-Firmware): für die CraftConsole-Armlehne
- [CraftLink-Firmware](https://github.com/HendrikKleinwaechter/CraftLink-Firmware): ein Raspberry Pi Pico als kleiner Controller für ControlHub, ohne Armlehne

## Installation (Windows)

1. `ControlHub-<Version>.zip` entpacken, z. B. nach `Dokumente\ControlHub`.
2. Im Ordner `ControlHub` die Datei `start-server.bat` doppelklicken. Beim ersten Start installiert sie Node.js, falls es fehlt, und lädt die nötigen Pakete. Dafür braucht der PC Internet.
3. Im Browser `http://localhost:3000` öffnen. Ein Assistent führt durch die Einrichtung. Fürs Tablet steht die Adresse im schwarzen Fenster.
4. Die Mod: im Einrichtungs-Assistenten auf **„Mod installieren“** drücken, oder `FS25_CraftConsoleHUD.zip` aus dem Ordner `Mod` unverändert nach `Dokumente\My Games\FarmingSimulator2025\mods` kopieren. Im Spiel beim Laden des Spielstands aktivieren. Im Mehrspieler muss sie beim Gastgeber bzw. auf dem Server liegen.

**Update:** ControlHub beenden, die neue Version entpacken und die Dateien über die alten kopieren. Deine Daten liegen
getrennt in `%APPDATA%\ControlHub` und bleiben erhalten. Ob es eine neue Version gibt, zeigt
Einstellungen → Allgemein → „Nach Updates suchen“.

Alles Weitere steht im Handbuch.

## Datenschutz

ControlHub läuft nur auf deinem PC und in deinem WLAN. Er schickt keine Daten ins Internet. Die einzige Ausnahme:
Wenn du auf „Nach Updates suchen“ drückst, fragt er hier bei GitHub nach der neuesten Version.

## Quellcode

ControlHub ist **quelloffen**. In diesem Repo liegen das Programm (`server/`, `public/`, `vorgaben/`, Tests in `test/`)
und die Mod (`FS25-Mod/`, die fertige `FS25_CraftConsoleHUD.zip` liegt dort mit).

```bash
npm install
npm test
npm start      # http://localhost:3000
```

## Lizenz

- **ControlHub und die Mod:** [PolyForm Noncommercial 1.0.0](LICENSE). Nutzen, ändern und weitergeben ist für nicht-kommerzielle Zwecke erlaubt. Videos und Streams sind ausdrücklich auch mit Einnahmen erlaubt, siehe [NOTICE](NOTICE).
- **Firmware** (CraftConsole, CraftLink, in eigenen Repos): MIT.
- **Fremdkomponenten:** siehe [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md).

„ControlCraft“, „CraftConsole“ und „ControlHub“ sind Namen von Hendrik Kleinwächter.
ControlHub ist kein offizielles Produkt von GIANTS Software. „Farming Simulator“ und „Landwirtschafts-Simulator“
sind Marken von GIANTS Software.
