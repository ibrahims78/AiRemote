#!/bin/bash
# AiRemote Agent v3.0.0 — Script Edition
# يتطلب Node.js 18+

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

if [ -z "$SERVER_URL" ]; then
  echo ""
  echo " ERROR: يجب تعيين SERVER_URL"
  echo " مثال:"
  echo "   SERVER_URL=wss://your-server.replit.app/ws DEVICE_TOKEN=توكن-جهازك ./start.sh"
  exit 1
fi

if [ -z "$DEVICE_TOKEN" ]; then
  echo ""
  echo " ERROR: يجب تعيين DEVICE_TOKEN"
  echo " افتح لوحة التحكم، انقر على الجهاز، ثم شغّل:"
  echo "   DEVICE_TOKEN=توكن-جهازك ./start.sh"
  exit 1
fi

node agent-v3.0.0.js
