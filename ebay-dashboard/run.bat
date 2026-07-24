@echo off
setlocal
title Slab Ledger Market Collector
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
    set "SLAB_PYTHON=py -3"
) else (
    where python >nul 2>nul
    if errorlevel 1 (
        echo Python was not found.
        echo Install Python 3, then run this file again.
        pause
        exit /b 1
    )
    set "SLAB_PYTHON=python"
)

if not exist "data.json" (
    copy "data.example.json" "data.json" >nul
)

%SLAB_PYTHON% -c "import requests, bs4, playwright" >nul 2>nul
if errorlevel 1 (
    echo Required collector components are not installed.
    echo Double-click setup-windows.bat once, then run this file again.
    echo.
    pause
    exit /b 1
)

if not exist "collector.env" (
    echo PocketBase cloud configuration was not found.
    echo Copy collector.env.example to collector.env and fill in your account details.
    echo.
    echo The collector can still run locally, but phone inventory will not synchronize.
    echo.
    pause
)

echo.
echo Starting the Slab Ledger market bridge at http://localhost:8000 ...
echo.
echo Schedule:
echo   - One unique inventory search every 12-20 minutes
echo   - Each search cached for 22 hours
echo   - Collection active from 7:00 AM to 11:00 PM
echo   - Maximum 72 requests per rolling 24 hours
echo   - Automatic extended cooldown after a block response
echo   - Standard persistent Chromium; no stealth or challenge bypass
echo.
echo Keep this window open. Press Ctrl+C to stop the collector.
%SLAB_PYTHON% scraper.py --watch
if errorlevel 1 (
    echo.
    echo The collector stopped unexpectedly. Existing data.json was preserved.
    pause
)
