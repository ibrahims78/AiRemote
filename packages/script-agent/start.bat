@echo off
title AiRemote Agent
echo.
echo  *** AiRemote Agent - Script Mode ***
echo.

:: Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Node.js is not installed!
    echo  Download from: https://nodejs.org  (LTS version)
    pause
    exit /b 1
)

:: Install ws if needed
if not exist node_modules\ws (
    echo  Installing dependencies...
    npm install ws --save 2>nul
)

echo  Starting agent...
echo  Press Ctrl+C to stop
echo.
node airemote-agent.js
pause
