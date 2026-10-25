# Fremdkomponenten und ihre Lizenzen (ControlHub)

ControlHub nutzt die folgenden Pakete von Dritten. Ihre Lizenzen gelten **zusätzlich** zur Projektlizenz
(PolyForm Noncommercial 1.0.0, s. `LICENSE`) und bleiben unberührt.

Die Pakete sind **nicht** im Programm-Paket enthalten: `start-server.bat` lädt sie beim ersten Start mit
`npm install` aus dem npm-Verzeichnis (Versionen laut `package-lock.json`). Die Oberfläche bündelt keine fremden
Bibliotheken und lädt nichts aus dem Internet; den Socket.IO-Client liefert das Paket `socket.io` selbst aus.

## Direkt genutzt

| Paket | Zweck | Lizenz |
|---|---|---|
| `express` | Webserver für die Oberfläche und die Programmschnittstelle | MIT |
| `socket.io` | Live-Verbindung zu Tablets und Browsern | MIT |
| `serialport`, `@serialport/parser-readline` | USB-Verbindung zum Controller | MIT |
| Node.js | Laufzeitumgebung (wird von `start-server.bat` bei Bedarf installiert, nicht mitgeliefert) | MIT u. a. |

## Alle installierten Pakete (Stand 23.10.2026, 104 Pakete: 101× MIT, 2× ISC, 1× BSD-3-Clause)

| Paket | Version | Lizenz |
|---|---|---|
| `@serialport/binding-mock` | 10.2.2 | MIT |
| `@serialport/bindings-cpp` | 12.0.1 | MIT |
| `@serialport/bindings-interface` | 1.2.2 | MIT |
| `@serialport/parser-byte-length` | 12.0.0 | MIT |
| `@serialport/parser-cctalk` | 12.0.0 | MIT |
| `@serialport/parser-delimiter` | 11.0.0 | MIT |
| `@serialport/parser-delimiter` | 12.0.0 | MIT |
| `@serialport/parser-inter-byte-timeout` | 12.0.0 | MIT |
| `@serialport/parser-packet-length` | 12.0.0 | MIT |
| `@serialport/parser-readline` | 11.0.0 | MIT |
| `@serialport/parser-readline` | 12.0.0 | MIT |
| `@serialport/parser-ready` | 12.0.0 | MIT |
| `@serialport/parser-regex` | 12.0.0 | MIT |
| `@serialport/parser-slip-encoder` | 12.0.0 | MIT |
| `@serialport/parser-spacepacket` | 12.0.0 | MIT |
| `@serialport/stream` | 12.0.0 | MIT |
| `@socket.io/component-emitter` | 3.1.2 | MIT |
| `@types/cors` | 2.8.19 | MIT |
| `@types/node` | 25.1.0 | MIT |
| `@types/ws` | 8.18.1 | MIT |
| `accepts` | 1.3.8 | MIT |
| `array-flatten` | 1.1.1 | MIT |
| `base64id` | 2.0.0 | MIT |
| `body-parser` | 1.20.6 | MIT |
| `bytes` | 3.1.2 | MIT |
| `call-bind-apply-helpers` | 1.0.2 | MIT |
| `call-bound` | 1.0.4 | MIT |
| `content-disposition` | 0.5.4 | MIT |
| `content-type` | 1.0.5 | MIT |
| `cookie` | 0.7.2 | MIT |
| `cookie-signature` | 1.0.7 | MIT |
| `cors` | 2.8.6 | MIT |
| `debug` | 2.6.9 | MIT |
| `debug` | 4.3.4 | MIT |
| `debug` | 4.4.3 | MIT |
| `depd` | 2.0.0 | MIT |
| `destroy` | 1.2.0 | MIT |
| `dunder-proto` | 1.0.1 | MIT |
| `ee-first` | 1.1.1 | MIT |
| `encodeurl` | 2.0.0 | MIT |
| `engine.io` | 6.6.9 | MIT |
| `engine.io-parser` | 5.2.3 | MIT |
| `es-define-property` | 1.0.1 | MIT |
| `es-errors` | 1.3.0 | MIT |
| `es-object-atoms` | 1.1.2 | MIT |
| `escape-html` | 1.0.3 | MIT |
| `etag` | 1.8.1 | MIT |
| `express` | 4.22.2 | MIT |
| `finalhandler` | 1.3.2 | MIT |
| `forwarded` | 0.2.0 | MIT |
| `fresh` | 0.5.2 | MIT |
| `function-bind` | 1.1.2 | MIT |
| `get-intrinsic` | 1.3.0 | MIT |
| `get-proto` | 1.0.1 | MIT |
| `gopd` | 1.2.0 | MIT |
| `has-symbols` | 1.1.0 | MIT |
| `hasown` | 2.0.2 | MIT |
| `http-errors` | 2.0.1 | MIT |
| `iconv-lite` | 0.4.24 | MIT |
| `inherits` | 2.0.4 | ISC |
| `ipaddr.js` | 1.9.1 | MIT |
| `math-intrinsics` | 1.1.0 | MIT |
| `media-typer` | 0.3.0 | MIT |
| `merge-descriptors` | 1.0.3 | MIT |
| `methods` | 1.1.2 | MIT |
| `mime` | 1.6.0 | MIT |
| `mime-db` | 1.52.0 | MIT |
| `mime-types` | 2.1.35 | MIT |
| `ms` | 2.0.0 | MIT |
| `ms` | 2.1.2 | MIT |
| `ms` | 2.1.3 | MIT |
| `negotiator` | 0.6.3 | MIT |
| `node-addon-api` | 7.0.0 | MIT |
| `node-gyp-build` | 4.6.0 | MIT |
| `object-assign` | 4.1.1 | MIT |
| `object-inspect` | 1.13.4 | MIT |
| `on-finished` | 2.4.1 | MIT |
| `parseurl` | 1.3.3 | MIT |
| `path-to-regexp` | 0.1.13 | MIT |
| `proxy-addr` | 2.0.7 | MIT |
| `qs` | 6.15.3 | BSD-3-Clause |
| `range-parser` | 1.2.1 | MIT |
| `raw-body` | 2.5.3 | MIT |
| `safe-buffer` | 5.2.1 | MIT |
| `safer-buffer` | 2.1.2 | MIT |
| `send` | 0.19.2 | MIT |
| `serialport` | 12.0.0 | MIT |
| `serve-static` | 1.16.3 | MIT |
| `setprototypeof` | 1.2.0 | ISC |
| `side-channel` | 1.1.1 | MIT |
| `side-channel-list` | 1.0.1 | MIT |
| `side-channel-map` | 1.0.1 | MIT |
| `side-channel-weakmap` | 1.0.2 | MIT |
| `socket.io` | 4.8.3 | MIT |
| `socket.io-adapter` | 2.5.8 | MIT |
| `socket.io-parser` | 4.2.7 | MIT |
| `statuses` | 2.0.2 | MIT |
| `toidentifier` | 1.0.1 | MIT |
| `type-is` | 1.6.18 | MIT |
| `undici-types` | 7.16.0 | MIT |
| `unpipe` | 1.0.0 | MIT |
| `utils-merge` | 1.0.1 | MIT |
| `vary` | 1.1.2 | MIT |
| `ws` | 8.21.3 | MIT |

> Erzeugt aus `npm ls --omit=dev --all` und den `package.json` der Pakete. Vor jeder Veröffentlichung neu erzeugen,
> wenn sich `package-lock.json` geändert hat.
