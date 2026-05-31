@echo off
:: AiRemote Agent v1.4.0 — Script Edition
:: يتطلب Node.js 18+

if not exist node_modules (
  echo Installing dependencies...
  npm install
)

node agent-v1.4.0.js
pause
