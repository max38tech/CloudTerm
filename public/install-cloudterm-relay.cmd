@echo off
title CloudTerm SSH Relay Installer
echo Installing and starting CloudTerm SSH Relay...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12; $script = try { irm 'https://cloudterm.fyi/install.ps1' } catch { irm 'https://raw.githubusercontent.com/max38tech/CloudTerm/main/public/install.ps1' }; iex ($script.TrimStart([char]0xFEFF))"
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo Installation failed. Press any key to close...
  pause >nul
)
