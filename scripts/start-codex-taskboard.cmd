@echo off
setlocal
chcp 65001 >nul
title Codex 任務面板啟動器

set "DASHI_LAUNCHER=%~dp0dashi-launcher.cmd"
if not exist "%DASHI_LAUNCHER%" (
  echo 找不到 Codex Pro Max Launcher CLI：
  echo %DASHI_LAUNCHER%
  echo.
  echo 請重新安裝 Codex Pro Max 後再試一次。
  pause
  exit /b 2
)

call "%DASHI_LAUNCHER%" inject
set "DASHI_RESULT=%ERRORLEVEL%"
if not "%DASHI_RESULT%"=="0" (
  echo.
  echo 啟動失敗，請保留上方訊息以便診斷。
  pause
)

exit /b %DASHI_RESULT%
