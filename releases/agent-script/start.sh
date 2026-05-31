#!/bin/bash
# AiRemote Agent v1.4.0 — Script Edition
# يتطلب Node.js 18+

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

node agent-v1.4.0.js
