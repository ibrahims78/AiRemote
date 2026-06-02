@echo off
:: AiRemote Agent v1.6.0 — Script Edition
:: يتطلب Node.js 18+

if not exist node_modules (
  echo Installing dependencies...
  npm install
)

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

node agent-v1.6.0.js
pause
