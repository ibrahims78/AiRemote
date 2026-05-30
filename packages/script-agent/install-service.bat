@echo off
:: Install AiRemote Agent as Windows Startup (Task Scheduler)
title AiRemote Agent - Install as Service
echo.
echo  Installing AiRemote Agent as Windows Startup Task...
echo.

set SCRIPT_DIR=%~dp0
set NODE_PATH=

:: Find node.exe
for /f "tokens=*" %%i in ('where node 2^>nul') do set NODE_PATH=%%i

if "%NODE_PATH%"=="" (
    echo  ERROR: Node.js not found. Install from https://nodejs.org first.
    pause
    exit /b 1
)

:: Create scheduled task
schtasks /create /tn "AiRemote Agent" /tr "\"%NODE_PATH%\" \"%SCRIPT_DIR%airemote-agent.js\"" /sc onlogon /ru "%USERNAME%" /f >nul 2>&1

if errorlevel 1 (
    echo  Failed. Try running as Administrator.
) else (
    echo  SUCCESS! Agent will start automatically on login.
    echo  To remove: schtasks /delete /tn "AiRemote Agent" /f
)
echo.
pause
