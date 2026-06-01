"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// packages/agent/src/index.ts
var import_config = require("dotenv/config");

// packages/agent/src/agent.ts
var import_ws = __toESM(require("ws"));
var import_ssh2 = require("ssh2");
var import_child_process3 = require("child_process");
var net = __toESM(require("net"));
var import_promises = __toESM(require("fs/promises"));
var import_path = __toESM(require("path"));

// packages/agent/src/system/info.ts
var import_os = __toESM(require("os"));
async function getDeviceInfo() {
  const platform = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux";
  const networkInterfaces = import_os.default.networkInterfaces();
  let ipLocal = "127.0.0.1";
  for (const [, ifaces] of Object.entries(networkInterfaces)) {
    if (!ifaces) continue;
    for (const iface of ifaces) {
      if (!iface.internal && iface.family === "IPv4") {
        ipLocal = iface.address;
        break;
      }
    }
    if (ipLocal !== "127.0.0.1") break;
  }
  return {
    id: "",
    name: process.env.DEVICE_NAME || import_os.default.hostname(),
    hostname: import_os.default.hostname(),
    platform,
    arch: import_os.default.arch(),
    osVersion: `${import_os.default.type()} ${import_os.default.release()}`,
    ipLocal,
    agentVersion: "1.0.0"
  };
}

// packages/agent/src/system/stats.ts
var import_os2 = __toESM(require("os"));
var import_fs = __toESM(require("fs"));
var import_child_process = require("child_process");
var lastNetworkBytes = { rx: 0, tx: 0, time: Date.now() };
var networkInitialized = false;
async function getDeviceStats() {
  const cpuPercent = await getCpuUsage();
  const memInfo = getMemoryInfo();
  const diskInfo = getDiskInfo();
  const networkInfo = getNetworkInfo();
  return {
    cpuPercent,
    ramPercent: memInfo.percent,
    ramUsedMb: memInfo.usedMb,
    ramTotalMb: memInfo.totalMb,
    diskPercent: diskInfo.percent,
    diskUsedGb: diskInfo.usedGb,
    diskTotalGb: diskInfo.totalGb,
    networkUpKbps: networkInfo.upKbps,
    networkDownKbps: networkInfo.downKbps,
    uptime: Math.floor(import_os2.default.uptime())
  };
}
function getCpuUsage() {
  return new Promise((resolve) => {
    const cpus1 = import_os2.default.cpus();
    setTimeout(() => {
      const cpus2 = import_os2.default.cpus();
      let totalIdle = 0;
      let totalTick = 0;
      for (let i = 0; i < cpus1.length; i++) {
        const cpu1 = cpus1[i];
        const cpu2 = cpus2[i];
        const idle = cpu2.times.idle - cpu1.times.idle;
        const total = cpu2.times.user - cpu1.times.user + (cpu2.times.nice - cpu1.times.nice) + (cpu2.times.sys - cpu1.times.sys) + (cpu2.times.irq - cpu1.times.irq) + idle;
        totalIdle += idle;
        totalTick += total;
      }
      const percent = totalTick === 0 ? 0 : Math.round((1 - totalIdle / totalTick) * 100);
      resolve(Math.min(100, Math.max(0, percent)));
    }, 100);
  });
}
function getMemoryInfo() {
  const totalMb = Math.round(import_os2.default.totalmem() / 1024 / 1024);
  const freeMb = Math.round(import_os2.default.freemem() / 1024 / 1024);
  const usedMb = totalMb - freeMb;
  const percent = Math.round(usedMb / totalMb * 100);
  return { totalMb, usedMb, freeMb, percent };
}
function getDiskInfo() {
  try {
    if (process.platform === "win32") {
      const out = (0, import_child_process.execSync)(
        `wmic logicaldisk where "DeviceID='C:'" get Size,FreeSpace /value`,
        { timeout: 5e3, stdio: ["pipe", "pipe", "ignore"] }
      ).toString();
      const freeMatch = out.match(/FreeSpace=(\d+)/);
      const sizeMatch = out.match(/Size=(\d+)/);
      if (freeMatch && sizeMatch) {
        const total = parseInt(sizeMatch[1]);
        const free = parseInt(freeMatch[1]);
        const used = total - free;
        return {
          totalGb: Math.round(total / 1073741824 * 10) / 10,
          usedGb: Math.round(used / 1073741824 * 10) / 10,
          percent: Math.round(used / total * 100)
        };
      }
    } else {
      const out = (0, import_child_process.execSync)("df -k /", { timeout: 5e3, stdio: ["pipe", "pipe", "ignore"] }).toString();
      const lines = out.trim().split("\n");
      const dataLine = lines.find((l, i) => i > 0 && /\d+/.test(l));
      if (dataLine) {
        const parts = dataLine.trim().split(/\s+/);
        const totalKb = parseInt(parts[1]);
        const usedKb = parseInt(parts[2]);
        const pctStr = parts[4]?.replace("%", "");
        const percent = pctStr ? parseInt(pctStr) : Math.round(usedKb / totalKb * 100);
        return {
          totalGb: Math.round(totalKb / 1048576 * 10) / 10,
          usedGb: Math.round(usedKb / 1048576 * 10) / 10,
          percent: isNaN(percent) ? 0 : percent
        };
      }
    }
  } catch {
  }
  return { percent: 0, usedGb: 0, totalGb: 0 };
}
function readRawNetworkBytes() {
  try {
    if (process.platform === "linux") {
      const content = import_fs.default.readFileSync("/proc/net/dev", "utf8");
      const lines = content.trim().split("\n").slice(2);
      let rx = 0, tx = 0;
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const colonPos = trimmed.indexOf(":");
        if (colonPos === -1) continue;
        const iface = trimmed.slice(0, colonPos).trim();
        if (iface === "lo") continue;
        const nums = trimmed.slice(colonPos + 1).trim().split(/\s+/).map(Number);
        rx += nums[0] || 0;
        tx += nums[8] || 0;
      }
      return { rx, tx };
    }
    if (process.platform === "darwin") {
      const out = (0, import_child_process.execSync)("netstat -ib", { timeout: 3e3, stdio: ["pipe", "pipe", "ignore"] }).toString();
      const lines = out.trim().split("\n").slice(1);
      let rx = 0, tx = 0;
      const seen = /* @__PURE__ */ new Set();
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const iface = parts[0];
        if (iface.startsWith("lo") || seen.has(iface)) continue;
        seen.add(iface);
        rx += parseInt(parts[6]) || 0;
        tx += parseInt(parts[9]) || 0;
      }
      return { rx, tx };
    }
    if (process.platform === "win32") {
      try {
        const out = (0, import_child_process.execSync)("netstat -e", { timeout: 3e3, stdio: ["pipe", "pipe", "ignore"] }).toString();
        const bytesLine = out.split("\n").find((l) => /^\s*bytes\s+\d/i.test(l));
        if (bytesLine) {
          const parts = bytesLine.trim().split(/\s+/);
          const rx2 = parseInt(parts[1]) || 0;
          const tx2 = parseInt(parts[2]) || 0;
          if (rx2 > 0 || tx2 > 0) return { rx: rx2, tx: tx2 };
        }
      } catch {
      }
      const psOut = (0, import_child_process.execSync)(
        'powershell -NoProfile -Command "$a=Get-CimInstance Win32_PerfRawData_Tcpip_NetworkInterface;$a|ForEach-Object{$_.BytesReceivedPersec,$_.BytesSentPersec}"',
        { timeout: 5e3, stdio: ["pipe", "pipe", "ignore"] }
      ).toString().trim();
      const nums = psOut.split(/\s+/).map((n) => parseInt(n.replace(/[^\d]/g, "")) || 0);
      let rx = 0, tx = 0;
      for (let i = 0; i + 1 < nums.length; i += 2) {
        rx += nums[i];
        tx += nums[i + 1];
      }
      if (rx > 0 || tx > 0) return { rx, tx };
    }
  } catch {
  }
  return { rx: 0, tx: 0 };
}
function getNetworkInfo() {
  const now = Date.now();
  const bytes = readRawNetworkBytes();
  if (!networkInitialized) {
    networkInitialized = true;
    lastNetworkBytes = { rx: bytes.rx, tx: bytes.tx, time: now };
    return { downKbps: 0, upKbps: 0 };
  }
  const elapsed = (now - lastNetworkBytes.time) / 1e3;
  let downKbps = 0;
  let upKbps = 0;
  if (elapsed > 0 && bytes.rx >= lastNetworkBytes.rx && bytes.tx >= lastNetworkBytes.tx) {
    const rxDiff = bytes.rx - lastNetworkBytes.rx;
    const txDiff = bytes.tx - lastNetworkBytes.tx;
    downKbps = Math.max(0, Math.round(rxDiff / elapsed / 1024 * 100) / 100);
    upKbps = Math.max(0, Math.round(txDiff / elapsed / 1024 * 100) / 100);
  }
  lastNetworkBytes = { rx: bytes.rx, tx: bytes.tx, time: now };
  return { downKbps, upKbps };
}

// packages/agent/src/system/executor.ts
var import_child_process2 = require("child_process");
var import_util = require("util");
var execAsync = (0, import_util.promisify)(import_child_process2.exec);
var BLOCKED_PATTERNS = [
  // Recursive delete of root or critical paths
  /rm\s+(-[rRf]{1,3}\s+)+\/(\s|$)/,
  /rm\s+(-[rRf]{1,3}\s+)+~\/(\s|$)/,
  // Low-level disk format/wipe
  /\bmkfs\b/,
  /\bdd\b.*\bof=\/dev\/(sd[a-z]|hd[a-z]|nvme[0-9])/i,
  />\s*\/dev\/(sd[a-z]|hd[a-z]|nvme[0-9])/i,
  // Disk partition table destruction
  /\bfdisk\b.*\/dev\//,
  /\bparted\b.*\/dev\/.*(rm|mklabel)/,
  // Windows destructive format
  /\bformat\s+[a-z]:\s*\/[qyp]/i,
  // Immediate power-off/shutdown (without delay)
  /\bshutdown\s+(-h\s+now|\/s\s*\/t\s*0)/i,
  /\b(halt|poweroff)\b/,
  // Fork bomb patterns
  /:\(\)\s*\{.*\|.*&\s*\}/,
  // Overwrite critical Linux files
  />\s*\/(etc\/(passwd|shadow|hosts|sudoers)|boot\/)/
];
async function executeCommand(command) {
  const trimmed = command.trim();
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        stdout: "",
        stderr: `Command blocked by security policy`,
        exitCode: 1,
        duration: 0
      };
    }
  }
  const start = Date.now();
  try {
    const { stdout, stderr } = await execAsync(trimmed, {
      timeout: 3e4,
      maxBuffer: 1024 * 1024 * 5,
      shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash"
    });
    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: 0,
      duration: Date.now() - start
    };
  } catch (err) {
    const error = err;
    return {
      stdout: error.stdout?.trim() || "",
      stderr: error.stderr?.trim() || error.message,
      exitCode: typeof error.code === "number" ? error.code : 1,
      duration: Date.now() - start
    };
  }
}

// packages/agent/src/agent.ts
var AGENT_VERSION = "1.5.0";
var HEARTBEAT_INTERVAL = 4e3;
var RECONNECT_BASE_DELAY = 2e3;
var RECONNECT_MAX_DELAY = 3e4;
var AgentService = class {
  constructor(serverUrl2, token) {
    this.serverUrl = serverUrl2;
    this.token = token;
    this.ws = null;
    this.deviceId = null;
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
    this.reconnectDelay = RECONNECT_BASE_DELAY;
    this.running = false;
    this.sshTunnels = /* @__PURE__ */ new Map();
    this.ptyProcs = /* @__PURE__ */ new Map();
    this.sshDetected = false;
  }
  start() {
    this.running = true;
    this.connect();
    console.log(`\u{1F680} AiRemote Agent v${AGENT_VERSION} starting...`);
    console.log(`\u{1F4E1} Server: ${this.serverUrl}`);
  }
  stop() {
    this.running = false;
    this.clearTimers();
    for (const [, tunnel] of this.sshTunnels) {
      try {
        tunnel.stream?.end();
      } catch {
      }
      try {
        tunnel.client.end();
      } catch {
      }
    }
    this.sshTunnels.clear();
    for (const [, p] of this.ptyProcs) {
      try {
        p.proc.kill();
      } catch {
      }
    }
    this.ptyProcs.clear();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    console.log("\u{1F6D1} Agent stopped");
  }
  connect() {
    if (!this.running) return;
    console.log(`\u{1F50C} Connecting to ${this.serverUrl}...`);
    this.ws = new import_ws.default(this.serverUrl);
    this.ws.on("open", () => this.onOpen());
    this.ws.on("message", (data) => this.onMessage(data));
    this.ws.on("close", () => this.onClose());
    this.ws.on("error", (err) => this.onError(err));
  }
  async onOpen() {
    console.log("\u2705 Connected to server");
    this.reconnectDelay = RECONNECT_BASE_DELAY;
    const info = await getDeviceInfo();
    const stats = await getDeviceStats();
    const sshAvailable = await this.checkSshAvailable("127.0.0.1", 22);
    this.sshDetected = sshAvailable;
    const shell = process.platform === "win32" ? "powershell" : process.env.SHELL || "/bin/bash";
    const payload = {
      token: this.token,
      info: { ...info, agentVersion: AGENT_VERSION },
      stats,
      tunnelLayer: "relay",
      capabilities: { pty: true, sshAvailable, shell },
      sshInfo: { available: sshAvailable, port: 22 }
    };
    this.send({ type: "agent:register", payload, timestamp: Date.now() });
    this.startHeartbeat();
  }
  onMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      switch (message.type) {
        case "server:registered": {
          const p = message.payload;
          this.deviceId = p.deviceId;
          console.log(`\u2705 Registered as device: ${this.deviceId}`);
          break;
        }
        case "server:command": {
          const p = message.payload;
          this.handleCommand(p);
          break;
        }
        case "server:ssh_open": {
          const p = message.payload;
          this.handleSshOpen(p);
          break;
        }
        case "server:ssh_data": {
          const p = message.payload;
          const tunnel = this.sshTunnels.get(p.sessionId);
          if (tunnel?.stream) tunnel.stream.write(Buffer.from(p.data, "base64"));
          break;
        }
        case "server:ssh_resize": {
          const p = message.payload;
          const tunnel = this.sshTunnels.get(p.sessionId);
          if (tunnel?.stream) {
            tunnel.stream.setWindow(p.rows, p.cols);
          }
          break;
        }
        case "server:ssh_close": {
          const p = message.payload;
          this.closeSshTunnel(p.sessionId);
          break;
        }
        case "server:pty_open": {
          const p = message.payload;
          this.handlePtyOpen(p);
          break;
        }
        case "server:pty_data": {
          const p = message.payload;
          const pty = this.ptyProcs.get(p.sessionId);
          if (pty?.proc.stdin?.writable) {
            pty.proc.stdin.write(Buffer.from(p.data, "base64"));
          }
          break;
        }
        case "server:pty_resize": {
          const p = message.payload;
          const pty = this.ptyProcs.get(p.sessionId);
          if (pty && process.platform !== "win32") {
            try {
              pty.proc.kill("SIGWINCH");
            } catch {
            }
          }
          break;
        }
        case "server:pty_close": {
          const p = message.payload;
          this.closePty(p.sessionId);
          break;
        }
        case "server:fs_request": {
          const p = message.payload;
          this.handleFsRequest(p);
          break;
        }
        case "server:error": {
          const p = message.payload;
          console.error(`\u274C Server error: ${p.message}`);
          break;
        }
      }
    } catch (err) {
      console.error("Failed to parse message:", err);
    }
  }
  // ── PTY (Direct Shell) ───────────────────────────────────────────────────
  handlePtyOpen(p) {
    const { sessionId, rows = 24, cols = 80, shell: shellHint = "auto" } = p;
    console.log(`\u{1F5A5}\uFE0F  PTY request (session ${sessionId}, shell=${shellHint})`);
    const { cmd, args } = this.resolveShell(shellHint);
    const env = {
      ...process.env,
      TERM: "xterm-256color",
      COLUMNS: String(cols),
      LINES: String(rows),
      COLORTERM: "truecolor"
    };
    try {
      let proc;
      if (process.platform !== "win32") {
        const shellCmd = args.length > 0 ? `${cmd} ${args.join(" ")}` : cmd;
        const scriptArgs = process.platform === "darwin" ? ["-q", "/dev/null", cmd, ...args] : ["-q", "-c", shellCmd, "/dev/null"];
        proc = (0, import_child_process3.spawn)("script", scriptArgs, {
          env: { ...env, SHELL: cmd },
          stdio: ["pipe", "pipe", "pipe"],
          shell: false
        });
      } else {
        proc = (0, import_child_process3.spawn)(cmd, args, {
          env,
          stdio: ["pipe", "pipe", "pipe"],
          shell: false,
          windowsHide: false
        });
      }
      this.ptyProcs.set(sessionId, { proc, sessionId });
      this.send({
        type: "agent:pty_opened",
        payload: { sessionId },
        timestamp: Date.now()
      });
      proc.stdout?.on("data", (data) => {
        this.send({
          type: "agent:pty_data",
          payload: { sessionId, data: data.toString("base64") },
          timestamp: Date.now()
        });
      });
      proc.stderr?.on("data", (data) => {
        this.send({
          type: "agent:pty_data",
          payload: { sessionId, data: data.toString("base64") },
          timestamp: Date.now()
        });
      });
      proc.on("close", () => {
        this.send({
          type: "agent:pty_closed",
          payload: { sessionId },
          timestamp: Date.now()
        });
        this.ptyProcs.delete(sessionId);
        console.log(`\u{1F5A5}\uFE0F  PTY closed: session ${sessionId}`);
      });
      proc.on("error", (err) => {
        this.send({
          type: "agent:pty_error",
          payload: { sessionId, message: err.message },
          timestamp: Date.now()
        });
        this.ptyProcs.delete(sessionId);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.send({
        type: "agent:pty_error",
        payload: { sessionId, message: `Failed to spawn shell: ${msg}` },
        timestamp: Date.now()
      });
    }
  }
  resolveShell(hint) {
    if (process.platform === "win32") {
      if (hint === "cmd") return { cmd: "cmd.exe", args: [] };
      return { cmd: "powershell.exe", args: ["-NoLogo", "-NoProfile"] };
    }
    if (hint === "bash") return { cmd: "/bin/bash", args: ["--login"] };
    if (hint === "sh") return { cmd: "/bin/sh", args: [] };
    if (hint === "zsh") return { cmd: "/bin/zsh", args: ["--login"] };
    const shell = process.env.SHELL || "/bin/bash";
    return { cmd: shell, args: ["--login"] };
  }
  closePty(sessionId) {
    const pty = this.ptyProcs.get(sessionId);
    if (pty) {
      try {
        pty.proc.kill();
      } catch {
      }
      this.ptyProcs.delete(sessionId);
    }
  }
  // ── SSH Tunnel ────────────────────────────────────────────────────────────
  handleSshOpen(p) {
    const { sessionId, host, port, username, password, privateKey, rows, cols } = p;
    console.log(`\u{1F512} SSH tunnel: ${username}@${host}:${port} (${sessionId})`);
    const client = new import_ssh2.Client();
    client.on("ready", () => {
      client.shell(
        { term: "xterm-256color", rows: rows || 24, cols: cols || 80 },
        (err, stream) => {
          if (err) {
            this.send({ type: "agent:ssh_error", payload: { sessionId, message: err.message }, timestamp: Date.now() });
            client.end();
            return;
          }
          this.sshTunnels.set(sessionId, { client, stream });
          this.send({ type: "agent:ssh_opened", payload: { sessionId }, timestamp: Date.now() });
          stream.on("data", (data) => {
            this.send({ type: "agent:ssh_data", payload: { sessionId, data: data.toString("base64") }, timestamp: Date.now() });
          });
          stream.stderr.on("data", (data) => {
            this.send({ type: "agent:ssh_data", payload: { sessionId, data: data.toString("base64") }, timestamp: Date.now() });
          });
          stream.on("close", () => {
            this.send({ type: "agent:ssh_closed", payload: { sessionId }, timestamp: Date.now() });
            this.sshTunnels.delete(sessionId);
            client.end();
          });
        }
      );
    });
    client.on("error", (err) => {
      this.send({ type: "agent:ssh_error", payload: { sessionId, message: err.message }, timestamp: Date.now() });
      this.sshTunnels.delete(sessionId);
    });
    const abortTimer = setTimeout(() => {
      if (!this.sshTunnels.has(sessionId)) {
        try {
          client.end();
        } catch {
        }
        this.send({ type: "agent:ssh_error", payload: { sessionId, message: `Connection timed out after 15s` }, timestamp: Date.now() });
      }
    }, 15e3);
    client.once("ready", () => clearTimeout(abortTimer));
    client.once("error", () => clearTimeout(abortTimer));
    const connectConfig = {
      host,
      port,
      username,
      readyTimeout: 12e3,
      keepaliveInterval: 5e3,
      keepaliveCountMax: 3
    };
    if (privateKey) connectConfig.privateKey = Buffer.from(privateKey, "base64");
    else if (password) connectConfig.password = password;
    client.connect(connectConfig);
  }
  // ── File System (via Agent) ───────────────────────────────────────────────
  async handleFsRequest(p) {
    const { opId, op } = p;
    console.log(`\u{1F4C2} FS request: op=${op} path=${p.path}`);
    const OVERALL_TIMEOUT_MS = 8e3;
    const READDIR_TIMEOUT_MS = 5e3;
    const STAT_TIMEOUT_MS = 2e3;
    const withTimeout = (promise, ms, label) => Promise.race([
      promise,
      new Promise(
        (_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
      )
    ]);
    try {
      let result;
      const osPath = this.toOsPath(p.path);
      const doOp = async () => {
        switch (op) {
          case "list": {
            if (p.path === "/" && process.platform === "win32") {
              return this.listWindowsDrives();
            }
            const entries = await withTimeout(
              import_promises.default.readdir(osPath, { withFileTypes: true }),
              READDIR_TIMEOUT_MS,
              `readdir(${osPath})`
            );
            const settled = await Promise.allSettled(entries.map(async (e) => {
              const fullPath = import_path.default.join(osPath, e.name);
              const webPath = (p.path === "/" ? "" : p.path) + "/" + e.name;
              let size = 0, modified = (/* @__PURE__ */ new Date()).toISOString(), permissions = "---";
              let isDir = e.isDirectory();
              try {
                const stat = await withTimeout(
                  import_promises.default.lstat(fullPath),
                  STAT_TIMEOUT_MS,
                  `lstat(${fullPath})`
                );
                size = stat.size;
                modified = stat.mtime.toISOString();
                permissions = (Number(stat.mode) & 511).toString(8);
                isDir = isDir || stat.isDirectory();
              } catch {
              }
              return { name: e.name, path: webPath, isDirectory: isDir, size, modified, permissions };
            }));
            return settled.filter((r) => r.status === "fulfilled").map((r) => r.value);
          }
          case "read": {
            const buf = await withTimeout(import_promises.default.readFile(osPath), OVERALL_TIMEOUT_MS, `readFile(${osPath})`);
            return buf.toString("base64");
          }
          case "read_chunked": {
            const CHUNK = 512 * 1024;
            const buf = await withTimeout(import_promises.default.readFile(osPath), 12e4, `readFile_c(${osPath})`);
            const n = Math.ceil(buf.length / CHUNK) || 1;
            for (let i = 0; i < n; i++) {
              this.send({
                type: "agent:fs_chunk",
                payload: {
                  opId,
                  seq: i,
                  data: buf.subarray(i * CHUNK, (i + 1) * CHUNK).toString("base64"),
                  done: i === n - 1,
                  total: n
                },
                timestamp: Date.now()
              });
              await new Promise((r) => setImmediate(r));
            }
            console.log(`\u2705 FS chunked: path=${p.path} chunks=${n}`);
            return "__chunked__";
          }
          case "write": {
            const dir = import_path.default.dirname(osPath);
            await import_promises.default.mkdir(dir, { recursive: true });
            await withTimeout(
              import_promises.default.writeFile(osPath, Buffer.from(p.data || "", "base64")),
              OVERALL_TIMEOUT_MS,
              `writeFile(${osPath})`
            );
            return { ok: true };
          }
          case "delete": {
            await withTimeout(
              import_promises.default.rm(osPath, { recursive: true, force: true }),
              OVERALL_TIMEOUT_MS,
              `rm(${osPath})`
            );
            return { ok: true };
          }
          case "rename": {
            const newOsPath = this.toOsPath(p.newPath || "");
            await withTimeout(import_promises.default.rename(osPath, newOsPath), OVERALL_TIMEOUT_MS, `rename`);
            return { ok: true };
          }
          case "mkdir": {
            await withTimeout(import_promises.default.mkdir(osPath, { recursive: true }), OVERALL_TIMEOUT_MS, `mkdir(${osPath})`);
            return { ok: true };
          }
          default:
            throw new Error(`\u0639\u0645\u0644\u064A\u0629 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641\u0629: ${op}`);
        }
      };
      result = await withTimeout(doOp(), op === "read_chunked" ? 125e3 : OVERALL_TIMEOUT_MS + 1e3, `fs:${op}`);
      if (result === "__chunked__") return;
      console.log(`\u2705 FS result: op=${op} path=${p.path}`);
      this.send({
        type: "agent:fs_result",
        payload: { opId, data: result },
        timestamp: Date.now()
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\u274C FS error: op=${op} path=${p.path} \u2014 ${msg}`);
      this.send({
        type: "agent:fs_result",
        payload: { opId, error: msg },
        timestamp: Date.now()
      });
    }
  }
  toOsPath(webPath) {
    if (process.platform !== "win32") return webPath;
    if (webPath === "/") return "/";
    const m = webPath.match(/^\/([A-Za-z]:[\\/].*)$/);
    if (m) return m[1].replace(/\//g, "\\");
    const drive = webPath.match(/^\/([A-Za-z]:)$/);
    if (drive) return drive[1] + "\\";
    return webPath;
  }
  async listWindowsDrives() {
    const checkDrive = async (letter) => {
      const drivePath = letter + ":\\";
      try {
        await Promise.race([
          import_promises.default.access(drivePath),
          new Promise(
            (_, reject) => setTimeout(() => reject(new Error("timeout")), 1500)
          )
        ]);
        return {
          name: letter + ":",
          path: "/" + letter + ":",
          isDirectory: true,
          size: 0,
          modified: (/* @__PURE__ */ new Date()).toISOString(),
          permissions: "755"
        };
      } catch {
        return null;
      }
    };
    const results = await Promise.all(
      "CDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(checkDrive)
    );
    return results.filter(Boolean);
  }
  closeSshTunnel(sessionId) {
    const tunnel = this.sshTunnels.get(sessionId);
    if (tunnel) {
      try {
        tunnel.stream?.end();
      } catch {
      }
      try {
        tunnel.client.end();
      } catch {
      }
      this.sshTunnels.delete(sessionId);
    }
  }
  // ── Helpers ───────────────────────────────────────────────────────────────
  checkSshAvailable(host, port) {
    return new Promise((resolve) => {
      const sock = new net.Socket();
      sock.setTimeout(3e3);
      sock.connect(port, host, () => {
        sock.destroy();
        resolve(true);
      });
      sock.on("error", () => {
        sock.destroy();
        resolve(false);
      });
      sock.on("timeout", () => {
        sock.destroy();
        resolve(false);
      });
    });
  }
  onClose() {
    console.log("\u{1F4F4} Disconnected from server");
    this.clearTimers();
    this.scheduleReconnect();
  }
  onError(err) {
    console.error(`\u{1F534} WebSocket error: ${err.message}`);
  }
  async handleCommand(payload) {
    if (payload.type !== "shell" || !payload.command) return;
    console.log(`\u25B6\uFE0F  Executing: ${payload.command}`);
    const result = await executeCommand(payload.command);
    this.send({
      type: "agent:command_result",
      payload: {
        commandId: payload.commandId,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        duration: result.duration
      },
      timestamp: Date.now()
    });
  }
  async startHeartbeat() {
    this.heartbeatTimer = setInterval(async () => {
      if (!this.deviceId || this.ws?.readyState !== import_ws.default.OPEN) return;
      const stats = await getDeviceStats();
      this.send({
        type: "agent:heartbeat",
        payload: {
          deviceId: this.deviceId,
          stats,
          tunnelLayer: "relay",
          timestamp: Date.now(),
          capabilities: { pty: true, sshAvailable: this.sshDetected }
        },
        timestamp: Date.now()
      });
    }, HEARTBEAT_INTERVAL);
  }
  scheduleReconnect() {
    if (!this.running) return;
    console.log(`\u{1F504} Reconnecting in ${this.reconnectDelay / 1e3}s...`);
    this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, RECONNECT_MAX_DELAY);
  }
  clearTimers() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
  send(message) {
    if (this.ws?.readyState === import_ws.default.OPEN) this.ws.send(JSON.stringify(message));
  }
};

// packages/agent/src/index.ts
var serverUrl = process.env.SERVER_URL || "ws://localhost:3001/ws";
var deviceToken = process.env.DEVICE_TOKEN || "";
if (!deviceToken) {
  console.error("\u274C DEVICE_TOKEN is required. Set it in .env file.");
  process.exit(1);
}
var agent = new AgentService(serverUrl, deviceToken);
agent.start();
process.on("SIGTERM", () => {
  agent.stop();
  process.exit(0);
});
process.on("SIGINT", () => {
  agent.stop();
  process.exit(0);
});
