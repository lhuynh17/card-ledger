@echo off
setlocal
title Slab Ledger Single Alt Test
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
    set "SLAB_PYTHON=py -3"
) else (
    set "SLAB_PYTHON=python"
)

echo.
echo This runs exactly one immediate Alt certification-number lookup.
echo No other inventory cards will be searched during this test.
echo Existing market values remain unchanged if the result is missing or uncertain.
echo.
set /p "SLAB_TEST_CERT=Enter an active-inventory PSA cert number, or press Enter to test the first card: "
echo.
echo Keep this window and normal Chrome open.
%SLAB_PYTHON% scraper.py --test-alt-once --test-cert "%SLAB_TEST_CERT%"
if errorlevel 1 (
    echo.
    echo The single Alt test stopped unexpectedly. Existing data was preserved.
    pause
)
