@echo off
:: AiRemote Agent v3.2.0 — Script Edition
:: يتطلب Node.js 18+

title AiRemote Agent v3.2.0

if not exist node_modules (
  echo.
  echo  Installing dependencies, please wait...
  echo.
  npm install
  if errorlevel 1 (
    echo.
    echo  ERROR: npm install failed. Make sure Node.js 18+ is installed.
    echo  Download: https://nodejs.org/
    pause
    exit /b 1
  )
)

if "%SERVER_URL%"=="" (
  echo.
  echo  ERROR: SERVER_URL is not set
  echo.
  echo  Example:
  echo    set SERVER_URL=wss://your-server.replit.app/ws
  echo    set DEVICE_TOKEN=your-device-token
  echo    start-v3.2.0.bat
  echo.
  echo  Or create a .env file with:
  echo    SERVER_URL=wss://your-server.replit.app/ws
  echo    DEVICE_TOKEN=your-device-token
  echo.
  pause
  exit /b 1
)

if "%DEVICE_TOKEN%"=="" (
  echo.
  echo  ERROR: DEVICE_TOKEN is not set
  echo  Open the dashboard, click your device, then copy the token.
  echo.
  pause
  exit /b 1
)

echo.
echo  AiRemote Agent v3.2.0 starting...
echo  Server: %SERVER_URL%
echo.
echo  ========================================================
echo   Real-time screen streaming (15-30 fps) requires ffmpeg
echo   If not installed: https://www.gyan.dev/ffmpeg/builds/
echo   Download ffmpeg-release-essentials.zip, extract, and
echo   add the bin\ folder to your system PATH, then restart.
echo  ========================================================
echo.

node agent-v3.2.0.js
pause
