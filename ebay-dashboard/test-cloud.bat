@echo off
setlocal
title Test Slab Ledger PocketBase Connection
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
    set "SLAB_PYTHON=py -3"
) else (
    set "SLAB_PYTHON=python"
)

%SLAB_PYTHON% scraper.py --test-cloud
echo.
if errorlevel 1 (
    echo The cloud test failed. Check collector.env and make sure Tailscale is connected.
) else (
    echo The cloud connection is ready.
)
pause
