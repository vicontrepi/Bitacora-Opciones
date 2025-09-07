@echo off
setlocal
set PORT=8000
cd /d "%~dp0"
echo Sirviendo carpeta en http://localhost:%PORT%/
where py >nul 2>nul && (set PY=py) || (set PY=python)
start "" "http://localhost:%PORT%/index.html"
%PY% -m http.server %PORT%
