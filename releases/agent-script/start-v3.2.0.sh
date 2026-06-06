#!/bin/bash
# AiRemote Agent v3.2.0 — Script Edition
# يتطلب Node.js 18+

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

if [ -z "$SERVER_URL" ]; then
  echo ""
  echo " ERROR: SERVER_URL is not set"
  echo " Example:"
  echo "   SERVER_URL=wss://your-server.replit.app/ws DEVICE_TOKEN=your-token ./start-v3.2.0.sh"
  exit 1
fi

if [ -z "$DEVICE_TOKEN" ]; then
  echo ""
  echo " ERROR: DEVICE_TOKEN is not set"
  echo " Open the dashboard, click your device, then copy the token."
  exit 1
fi

node agent-v3.2.0.js
