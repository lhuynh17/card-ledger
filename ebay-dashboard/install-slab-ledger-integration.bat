@echo off
setlocal
title Install Slab Ledger Market Integration
cd /d "%~dp0"

echo This adds the local eBay market panel to your existing Slab Ledger.
echo Your current index.html will be backed up before it is changed.
echo.
set /p "SLAB_TARGET=Paste the full path to your Slab Ledger folder: "
set "SLAB_TARGET=%SLAB_TARGET:"=%"

if not exist "%SLAB_TARGET%\index.html" (
    echo.
    echo No index.html was found in:
    echo %SLAB_TARGET%
    echo.
    echo Nothing was changed.
    pause
    exit /b 1
)

if not exist "%SLAB_TARGET%\index.before-market-integration.html" (
    copy "%SLAB_TARGET%\index.html" "%SLAB_TARGET%\index.before-market-integration.html" >nul
    if errorlevel 1 (
        echo Could not create the safety backup. Nothing was changed.
        pause
        exit /b 1
    )
)

copy /Y "%~dp0slab-ledger-market.js" "%SLAB_TARGET%\slab-ledger-market.js" >nul
if errorlevel 1 (
    echo Could not copy the market integration. Nothing was added to index.html.
    pause
    exit /b 1
)

powershell -NoProfile -Command "$path=Join-Path $env:SLAB_TARGET 'index.html'; $html=[IO.File]::ReadAllText($path); if($html -notmatch 'slab-ledger-market\.js'){ if($html -notmatch '</body>'){ throw 'Closing body tag was not found.' }; $tag='  <script src=\"slab-ledger-market.js\"></script>'+[Environment]::NewLine; $html=$html.Replace('</body>',$tag+'</body>'); [IO.File]::WriteAllText($path,$html,(New-Object Text.UTF8Encoding($false))) }"
if errorlevel 1 (
    echo.
    echo The integration could not be added. Restore index.html from:
    echo index.before-market-integration.html
    pause
    exit /b 1
)

echo.
echo Installation complete.
echo.
echo 1. Start ebay-dashboard\run.bat and keep it open.
echo 2. Open or refresh Slab Ledger.
echo 3. Click an active inventory card outside its buttons and links.
echo.
echo Backup: %SLAB_TARGET%\index.before-market-integration.html
pause
