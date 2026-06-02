#!/bin/bash
# AiRemote Agent v1.6.0 — Script Edition
# يتطلب Node.js 18+

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

if [ -z "$DEVICE_TOKEN" ]; then
  echo ""
  echo " ERROR: يجب تعيين DEVICE_TOKEN"
  echo " افتح لوحة التحكم، انقر على الجهاز، ثم شغّل:"
  echo "   DEVICE_TOKEN=توكن-جهازك ./start.sh"
  exit 1
fi

node agent-v1.6.0.js
