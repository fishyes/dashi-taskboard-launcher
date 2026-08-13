@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is required to run Dashi Launcher CLI. 1>&2
  exit /b 2
)
node "%~dp0dashi-launcher-cli.mjs" %*
exit /b %errorlevel%
