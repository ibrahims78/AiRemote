AiRemote Agent — Script Version
================================
Size: ~1 MB  |  Requires: Node.js 18+ (https://nodejs.org)

QUICK START
-----------
1. Edit config.json — set your serverUrl and token
2. Double-click start.bat

INSTALL AS WINDOWS SERVICE (auto-start on login)
-------------------------------------------------
Run install-service.bat (as Administrator)

CLI USAGE
---------
node airemote-agent.js --server wss://your-server/ws --token YOUR_TOKEN

REMOVE SERVICE
--------------
schtasks /delete /tn "AiRemote Agent" /f
