@echo off
setlocal
title Install Slab Ledger Collector Startup
cd /d "%~dp0"

echo This makes the collector start when you sign in to Windows.
echo The browser remains visible so a normal eBay check can be completed.
echo Windows must stay signed in; locking the screen is fine.
echo.

set "SLAB_RUNNER=%~dp0run.bat"
schtasks /Create /F /SC ONLOGON /TN "Slab Ledger Market Collector" /TR "\"%SLAB_RUNNER%\""
if errorlevel 1 (
    echo.
    echo Windows could not create the startup task.
    echo Right-click this file, choose Run as administrator, and try again.
    pause
    exit /b 1
)

echo.
echo Startup installed. The collector will start at your next Windows sign-in.
echo To start it now, double-click run.bat.
pause
