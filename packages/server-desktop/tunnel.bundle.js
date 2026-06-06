"use strict";

// tunnel.js
var { spawn } = require("child_process");
var path = require("path");
var fs = require("fs");
var EventEmitter = require("events");
var emitter = new EventEmitter();
var proc = null;
var _url = null;
var _running = false;
function getCloudflaredPath() {
  if (process.resourcesPath) {
    const packed = path.join(process.resourcesPath, "cloudflared.exe");
    if (fs.existsSync(packed)) return packed;
  }
  const dev = path.join(__dirname, "bin", "cloudflared.exe");
  if (fs.existsSync(dev)) return dev;
  return "cloudflared";
}
function startTunnel(port, logger) {
  if (_running) return;
  _running = true;
  _url = null;
  const bin = getCloudflaredPath();
  const args = ["tunnel", "--url", `http://localhost:${port}`, "--no-autoupdate"];
  logger?.info("tunnel", `Starting Cloudflare Tunnel on port ${port}...`);
  logger?.info("tunnel", `Using: ${bin}`);
  proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
  const onData = (chunk) => {
    const text = chunk.toString();
    const match = text.match(/https:\/\/[a-z0-9\-]+\.trycloudflare\.com/i);
    if (match && !_url) {
      _url = match[0].replace("https://", "wss://");
      logger?.info("tunnel", `\u2705 Tunnel active: ${_url}`);
      emitter.emit("url", _url);
    }
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (t && !t.includes("INF") && !t.includes("level=info")) continue;
      if (t.includes("error") || t.includes("ERR")) {
        logger?.warn("tunnel", t);
      }
    }
  };
  proc.stdout?.on("data", onData);
  proc.stderr?.on("data", onData);
  proc.on("close", (code) => {
    _running = false;
    _url = null;
    proc = null;
    logger?.warn("tunnel", `Cloudflare Tunnel stopped (code=${code})`);
    emitter.emit("stopped", code);
  });
  proc.on("error", (err) => {
    _running = false;
    _url = null;
    logger?.error("tunnel", `Failed to start: ${err.message}`);
    emitter.emit("error", err);
  });
}
function stopTunnel(logger) {
  if (!proc) return;
  logger?.info("tunnel", "Stopping Cloudflare Tunnel...");
  try {
    proc.kill("SIGTERM");
  } catch {
  }
  setTimeout(() => {
    try {
      proc?.kill("SIGKILL");
    } catch {
    }
  }, 3e3);
  _running = false;
  _url = null;
  proc = null;
}
function getUrl() {
  return _url;
}
function isRunning() {
  return _running;
}
module.exports = { startTunnel, stopTunnel, getUrl, isRunning, emitter };
