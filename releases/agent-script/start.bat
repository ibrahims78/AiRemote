@echo off
:: AiRemote Agent v3.2.0 — Script Edition
:: يتطلب Node.js 18+

title AiRemote Agent v3.2.0

if not exist node_modules (
  echo Installing dependencies...
  npm install
  if errorlevel 1 ( echo ERROR: npm install failed && pause && exit /b 1 )
)

echo.
echo  ===================================================================
echo   REAL-TIME STREAMING (15-30 fps) requires ffmpeg on PATH
echo   Download: https://www.gyan.dev/ffmpeg/builds/
echo   (ffmpeg-release-essentials.zip) - extract and add bin\ to PATH
echo   Without ffmpeg: PowerShell fallback runs at ~1 fps
echo  ===================================================================
echo.

:: SERVER_URL: عنوان خادم AiRemote (wss://your-server.replit.app/ws)
:: DEVICE_TOKEN: التوكن الخاص بجهازك (من Dashboard > Devices > Copy Token)

if "%SERVER_URL%"=="" (
  echo.
  echo  ERROR: يجب تعيين SERVER_URL
  echo  مثال:
  echo    set SERVER_URL=wss://your-server.replit.app/ws
  echo    start.bat
  echo.
  pause
  exit /b 1
)

if "%DEVICE_TOKEN%"=="" (
  echo.
  echo  ERROR: يجب تعيين DEVICE_TOKEN
  echo  افتح لوحة التحكم، انقر على الجهاز، ثم انسخ التوكن
  echo  مثال:
  echo    set DEVICE_TOKEN=your-device-token
  echo    start.bat
  echo.
  pause
  exit /b 1
)

node agent-v3.2.0.js
pause
