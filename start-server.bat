@echo off
title ControlHub
color 0A

echo.
echo   ========================================
echo      CONTROLHUB
echo   ========================================
echo.

cd /d "%~dp0"

where node >nul 2>nul
if %ERRORLEVEL% EQU 0 goto :startserver

echo   Node.js wurde nicht gefunden -- wird automatisch installiert.
echo   Das kann ein paar Minuten dauern, bitte warten...
echo.

where winget >nul 2>nul
if %ERRORLEVEL% NEQ 0 goto :nonode_manual

winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
if %ERRORLEVEL% NEQ 0 goto :nonode_manual

echo.
echo   Node.js wurde installiert. Aktualisiere die Systemeinstellungen fuer dieses Fenster...
rem winget schreibt die PATH-Aenderung nur in die Registry -- ein bereits laufendes Fenster (wie
rem dieses hier) bekaeme sie sonst erst nach Neustart/Abmelden mit. PowerShell liest Machine- UND
rem User-PATH sauber aus der Registry, statt das fehleranfaellig per "reg query" zu parsen.
for /f "delims=" %%P in ('powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')"') do set "PATH=%%P"

where node >nul 2>nul
if %ERRORLEVEL% EQU 0 goto :startserver

echo.
echo   Node.js ist installiert, aber dieses Fenster hat die Aenderung noch nicht uebernommen.
echo   Bitte dieses Fenster schliessen und start-server.bat noch einmal per Doppelklick starten.
echo.
pause
exit /b 0

:startserver
if not exist "node_modules" (
    echo   Erste Ausfuehrung: installiere Abhaengigkeiten, das dauert einen Moment...
    echo.
    call npm install
    echo.
)

echo   Server wird gestartet...
echo.
node server/index.js

echo.
echo   Server wurde beendet.
pause
exit /b 0

:nonode_manual
color 0C
echo   FEHLER: Node.js konnte nicht automatisch installiert werden.
echo.
echo   Bitte installiere Node.js manuell von:
echo   https://nodejs.org/
echo.
pause
exit /b 1
