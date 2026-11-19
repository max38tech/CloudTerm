@echo off
setlocal EnableDelayedExpansion
title CloudTerm SSH Relay Installer

set "REPO=max38tech/CloudTerm"
set "INSTALL_DIR=%LOCALAPPDATA%\CloudTerm"
set "BIN_PATH=%INSTALL_DIR%\cloudterm-relay.exe"
if "%CLOUDTERM_RELAY_ADDR%"=="" (
  set "ADDR=127.0.0.1:8022"
) else (
  set "ADDR=%CLOUDTERM_RELAY_ADDR%"
)
set "HEALTH_URL=http://%ADDR%/health"

echo ==^> CloudTerm SSH Relay Installer

curl.exe -fsS --max-time 2 "%HEALTH_URL%" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
  echo [OK] cloudterm-relay is already running at %ADDR%
  exit /b 0
)

set "ARCH=amd64"
if /I "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "ARCH=arm64"
if /I "%PROCESSOR_ARCHITEW6432%"=="ARM64" set "ARCH=arm64"
set "RELEASE_URL=https://github.com/%REPO%/releases/latest/download/cloudterm-relay-windows-%ARCH%.exe"

if not exist "%INSTALL_DIR%" (
  mkdir "%INSTALL_DIR%"
  if errorlevel 1 (
    echo ERROR: Could not create %INSTALL_DIR%
    goto :fail
  )
)

if not exist "%BIN_PATH%" (
  echo ==^> Downloading cloudterm-relay ^(windows/%ARCH%^)...
  curl.exe -fSL --retry 2 -o "%BIN_PATH%" "%RELEASE_URL%"
  if errorlevel 1 (
    del /f /q "%BIN_PATH%" >nul 2>&1
    echo ERROR: Failed to download %RELEASE_URL%
    goto :fail
  )
  echo [OK] Installed prebuilt binary to %BIN_PATH%
) else (
  echo [OK] Found existing binary at %BIN_PATH%
)

reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "CloudTermRelay" /t REG_SZ /d "\"%BIN_PATH%\" -addr %ADDR%" /f >nul 2>&1
if %ERRORLEVEL% EQU 0 (
  echo [OK] Registered auto-start on Windows login
)

echo ==^> Starting CloudTerm SSH Relay...
start "CloudTerm SSH Relay" /MIN "%BIN_PATH%" -addr %ADDR%

for /L %%i in (1,1,10) do (
  ping -n 2 127.0.0.1 >nul
  curl.exe -fsS --max-time 1 "%HEALTH_URL%" >nul 2>&1
  if !ERRORLEVEL! EQU 0 (
    echo [OK] CloudTerm SSH Relay is online at ws://%ADDR%
    exit /b 0
  )
)

echo WARNING: Relay started, but %HEALTH_URL% did not respond yet.

:fail
echo.
echo Installation failed. Press any key to close...
pause >nul
exit /b 1
