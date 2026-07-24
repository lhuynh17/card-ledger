@echo off
setlocal
title Set Up Slab Ledger Market Collection
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
    set "SLAB_PYTHON=py -3"
) else (
    set "SLAB_PYTHON=python"
)

echo This one-time installer will create the market_values collection.
echo It will not delete or replace any existing PocketBase collection.
echo Your PocketBase superuser password will not be saved.
echo.
%SLAB_PYTHON% setup_pocketbase.py
echo.
if errorlevel 1 (
    echo PocketBase setup did not complete. No existing collection was deleted.
) else (
    echo PocketBase schema is ready.
)
pause
