@echo off
title CloudTerm SSH Relay Installer
echo Installing and starting CloudTerm SSH Relay...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { irm 'https://cloudterm.fyi/install.ps1' | iex } catch { irm 'https://raw.githubusercontent.com/max38tech/CloudTerm/main/public/install.ps1' | iex }"
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo Installation failed. Press any key to close...
  pause >nul
)
