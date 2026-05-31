@echo off
:: AiRemote Agent v1.4.0 — Script Edition
:: يتطلب Node.js 18+

if not exist node_modules (
  echo Installing dependencies...
  npm install
)

:: SERVER_URL: عنوان خادم AiRemote
:: DEVICE_TOKEN: التوكن الخاص بجهازك (من لوحة التحكم)
set SERVER_URL=wss://3001-%REPLIT_DEV_DOMAIN%/ws

if "%DEVICE_TOKEN%"=="" (
  echo.
  echo  ERROR: يجب تعيين DEVICE_TOKEN
  echo  افتح لوحة التحكم، انقر على الجهاز، ثم انسخ التوكن
  echo  ثم شغّل:
  echo    set DEVICE_TOKEN=توكن-جهازك
  echo    start.bat
  echo.
  pause
  exit /b 1
)

node agent-v1.4.0.js
pause
