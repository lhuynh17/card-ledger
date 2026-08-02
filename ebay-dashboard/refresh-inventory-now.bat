@echo off
setlocal
title Slab Ledger One-Time Market Refresh
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
    set "SLAB_PYTHON=py -3"
) else (
    set "SLAB_PYTHON=python"
)

echo.
echo Starting one safe refresh of every current inventory card.
echo Existing values remain unchanged when a result is empty, uncertain, or incorrect.
echo The collector will return to its normal 2:00 AM schedule when this pass finishes.
echo.
echo Keep this window and Chrome open. Press Ctrl+C only if you need to stop.
%SLAB_PYTHON% scraper.py --watch --refresh-all-now
if errorlevel 1 (
    echo.
    echo The refresh stopped unexpectedly. Existing data was preserved.
    pause
)
