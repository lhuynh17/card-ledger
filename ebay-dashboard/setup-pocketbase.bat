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

echo This installer will prepare market values and business finance records.
echo It adds missing fields and collections without deleting existing records.
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
