@echo off
setlocal
title Set Up Slab Ledger Market Collector
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

echo Installing the Slab Ledger collector components...
%SLAB_PYTHON% -m pip install -r requirements.txt
if errorlevel 1 goto :failed

echo.
echo Installing the standard Chromium browser used for rendered sold results...
%SLAB_PYTHON% -m playwright install chromium
if errorlevel 1 goto :failed

echo.
echo Setup completed successfully.
echo You can now double-click run.bat.
pause
exit /b 0

:failed
echo.
echo Setup did not finish. Check the message above, then run this file again.
pause
exit /b 1
