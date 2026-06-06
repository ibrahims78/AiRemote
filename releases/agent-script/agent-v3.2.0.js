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

// src/index.ts
var import_config = require("dotenv/config");

// src/agent.ts
var import_ws = __toESM(require("ws"));
var import_child_process5 = require("child_process");
var import_promises2 = __toESM(require("fs/promises"));
var import_path2 = __toESM(require("path"));

// src/system/info.ts
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

// src/system/stats.ts
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

// src/system/executor.ts
var import_child_process2 = require("child_process");
var import_util = require("util");
var execAsync = (0, import_util.promisify)(import_child_process2.exec);
var BLOCKED_PATTERNS = [
  // Recursive delete of root or home
  { re: /rm\s+-[rRf]{1,3}\s+\/(\s|$)/, reason: "rm -rf / blocked" },
  { re: /rm\s+-[rRf]{1,3}\s+~\/(\s|$)/, reason: "rm -rf ~/ blocked" },
  { re: /rm\s+-[rRf]{1,3}\s+\.\s*$/, reason: "rm -rf . blocked" },
  // Low-level disk format / wipe
  { re: /\bmkfs\b/, reason: "mkfs blocked" },
  { re: /\bdd\b.*\bof=\/dev\/(sd[a-z]|hd[a-z]|nvme[0-9])/i, reason: "dd to disk blocked" },
  { re: />\s*\/dev\/(sd[a-z]|hd[a-z]|nvme[0-9])/i, reason: "redirect to disk blocked" },
  // Partition table destruction
  { re: /\bfdisk\b.*\/dev\//, reason: "fdisk blocked" },
  { re: /\bparted\b.*\/dev\/.*(rm|mklabel)/, reason: "parted destructive op blocked" },
  { re: /\bshred\b.*\/dev\//, reason: "shred on device blocked" },
  // Windows destructive format
  { re: /\bformat\s+[a-z]:\s*\/[qyp]/i, reason: "Windows format blocked" },
  // Immediate shutdown / halt
  { re: /\bshutdown\s+(-h\s+now|\/s\s*\/t\s*0)/i, reason: "immediate shutdown blocked" },
  { re: /\b(halt|poweroff)\b/, reason: "halt/poweroff blocked" },
  // Fork bomb
  { re: /:\(\)\s*\{.*\|.*&\s*\}/, reason: "fork bomb blocked" },
  // Overwrite critical Linux files
  {
    re: />\s*\/(etc\/(passwd|shadow|hosts|sudoers|crontab)|boot\/)/,
    reason: "overwrite of critical file blocked"
  },
  // Remote code execution via pipe (curl/wget | sh/bash)
  { re: /\b(curl|wget)\b.+\|\s*(ba)?sh\b/i, reason: "curl/wget pipe to shell blocked" },
  { re: /\b(curl|wget)\b.+\|\s*bash\b/i, reason: "curl pipe to bash blocked" },
  // Windows registry destruction
  {
    re: /\breg\s+(delete|add)\s+HKLM\\(SYSTEM|SOFTWARE|SECURITY|SAM)/i,
    reason: "Windows registry destruction blocked"
  },
  // Wipe Windows system files
  { re: /\bdel\s+\/[sfq]+\s+%WINDIR%/i, reason: "Windows system dir wipe blocked" },
  { re: /\brd\s+\/s\s+\/q\s+%WINDIR%/i, reason: "Windows system dir remove blocked" },
  // chmod 777 on root or system dirs
  { re: /chmod\s+-R\s+[0-7]*7+\s+\/(\s|$)/, reason: "chmod 777 on / blocked" },
  { re: /chmod\s+-R\s+[0-7]*7+\s+\/etc\b/, reason: "chmod on /etc blocked" }
];
async function executeCommand(command) {
  const trimmed = command.trim();
  for (const { re, reason } of BLOCKED_PATTERNS) {
    if (re.test(trimmed)) {
      console.warn(`[executor] BLOCKED: ${reason} \u2014 "${trimmed.slice(0, 80)}"`);
      return {
        stdout: "",
        stderr: `Command blocked by security policy: ${reason}`,
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

// src/system/screenCapture.ts
var import_child_process3 = require("child_process");
var import_util2 = require("util");
var import_promises = __toESM(require("fs/promises"));
var import_path = __toESM(require("path"));
var import_os3 = __toESM(require("os"));
var execAsync2 = (0, import_util2.promisify)(import_child_process3.exec);
var execFileAsync = (0, import_util2.promisify)(import_child_process3.execFile);
var PLATFORM = process.platform;
var _captureSeq = 0;
function makeTmpFrame() {
  return import_path.default.join(import_os3.default.tmpdir(), `airemote_frame_${process.pid}_${++_captureSeq}.jpg`);
}
var detectedBackend = null;
function withTimeout(p, ms, label) {
  return Promise.race([
    p,
    new Promise(
      (_, reject) => setTimeout(() => reject(new Error(`[screen] ${label} timed out after ${ms}ms`)), ms)
    )
  ]);
}
async function tryStartXvfb() {
  try {
    await execAsync2("which Xvfb");
  } catch {
    console.warn("[screen] Xvfb not found \u2014 headless capture unavailable (install Xvfb)");
    return false;
  }
  const display = ":99";
  try {
    await execAsync2(`DISPLAY=${display} xdpyinfo 2>/dev/null`);
    process.env.DISPLAY = display;
    console.log(`[screen] Reusing existing Xvfb at ${display}`);
    return true;
  } catch {
  }
  try {
    const xvfb = (0, import_child_process3.spawn)("Xvfb", [
      display,
      "-screen",
      "0",
      "1920x1080x24",
      "-ac",
      "+extension",
      "GLX",
      "+extension",
      "RANDR"
    ], { detached: true, stdio: "ignore" });
    xvfb.unref();
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 250));
      try {
        await execAsync2(`DISPLAY=${display} xdpyinfo 2>/dev/null`);
        process.env.DISPLAY = display;
        console.log(`[screen] Started Xvfb at ${display} (ready in ${(i + 1) * 250}ms)`);
        return true;
      } catch {
      }
    }
    console.warn("[screen] Xvfb started but did not become ready within 2s");
  } catch (err) {
    console.warn("[screen] Failed to start Xvfb:", err.message);
  }
  return false;
}
async function detectBackend() {
  if (detectedBackend !== null) return detectedBackend;
  if (PLATFORM === "darwin") {
    detectedBackend = "screencapture";
    return detectedBackend;
  }
  if (PLATFORM === "win32") {
    detectedBackend = "powershell";
    return detectedBackend;
  }
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    const started = await tryStartXvfb();
    if (!started) {
      console.warn("[screen] No display found and Xvfb unavailable \u2014 screen capture disabled");
      detectedBackend = "none";
      return detectedBackend;
    }
  }
  const tools = [
    { cmd: "scrot", backend: "scrot" },
    { cmd: "import", backend: "import" },
    { cmd: "xwd", backend: "xwd" }
  ];
  for (const { cmd, backend } of tools) {
    try {
      await execAsync2(`which ${cmd}`);
      detectedBackend = backend;
      console.log(`[screen] backend: ${backend}`);
      return detectedBackend;
    } catch {
    }
  }
  detectedBackend = "none";
  return detectedBackend;
}
var PS_LOOP_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$prevThumb = $null
while($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line -or $line -eq 'EXIT') { exit 0 }
    try {
        $p = $line -split [char]124
        $quality=[int]$p[0]; $maxW=[int]$p[1]
        $monX=[int]$p[2]; $monY=[int]$p[3]; $monW=[int]$p[4]; $monH=[int]$p[5]
        if ($monW -gt 0) {
            $bounds = New-Object System.Drawing.Rectangle($monX,$monY,$monW,$monH)
        } else {
            $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        }
        $bmp = New-Object System.Drawing.Bitmap($bounds.Width,$bounds.Height)
        $g   = [System.Drawing.Graphics]::FromImage($bmp)
        $g.CopyFromScreen($bounds.Location,[System.Drawing.Point]::Empty,$bounds.Size)
        $g.Dispose()
        $newW  = [Math]::Min($bounds.Width,$maxW)
        $ratio = if ($bounds.Width -gt 0) { $newW/$bounds.Width } else { 1 }
        $newH  = [Math]::Max(1,[int]($bounds.Height*$ratio))
        $thumb = New-Object System.Drawing.Bitmap($newW,$newH)
        $tg    = [System.Drawing.Graphics]::FromImage($thumb)
        $tg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::Bilinear
        $tg.DrawImage($bmp,0,0,$newW,$newH)
        $tg.Dispose(); $bmp.Dispose()
        $enc    = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object {$_.MimeType -eq 'image/jpeg'}
        $params = New-Object System.Drawing.Imaging.EncoderParameters(1)
        $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality,[long]$quality)
        $isDelta = $false
        if ($null -ne $prevThumb -and $prevThumb.Width -eq $newW -and $prevThumb.Height -eq $newH) {
            $gx = 8; $gy = 8
            $cw = [Math]::Max(1,[int]($newW/$gx))
            $ch = [Math]::Max(1,[int]($newH/$gy))
            $minGx = $gx; $maxGx = -1; $minGy = $gy; $maxGy = -1
            $changed = 0
            for ($iy = 0; $iy -lt $gy; $iy++) {
                for ($ix = 0; $ix -lt $gx; $ix++) {
                    $px = [Math]::Min($newW-1,$ix*$cw+[int]($cw/2))
                    $py = [Math]::Min($newH-1,$iy*$ch+[int]($ch/2))
                    $c1 = $thumb.GetPixel($px,$py)
                    $c2 = $prevThumb.GetPixel($px,$py)
                    $d  = [Math]::Abs($c1.R-$c2.R)+[Math]::Abs($c1.G-$c2.G)+[Math]::Abs($c1.B-$c2.B)
                    if ($d -gt 20) {
                        $changed++
                        if ($ix -lt $minGx) { $minGx = $ix }
                        if ($ix -gt $maxGx) { $maxGx = $ix }
                        if ($iy -lt $minGy) { $minGy = $iy }
                        if ($iy -gt $maxGy) { $maxGy = $iy }
                    }
                }
            }
            $total = $gx * $gy
            if ($changed -gt 0 -and $changed -lt [int]($total * 0.6)) {
                $pad = 1
                $dx  = [Math]::Max(0,($minGx-$pad)*$cw)
                $dy  = [Math]::Max(0,($minGy-$pad)*$ch)
                $dw  = [Math]::Min($newW-$dx,($maxGx-$minGx+2+$pad*2)*$cw)
                $dh  = [Math]::Min($newH-$dy,($maxGy-$minGy+2+$pad*2)*$ch)
                $crop = New-Object System.Drawing.Bitmap($dw,$dh)
                $cg   = [System.Drawing.Graphics]::FromImage($crop)
                $srcR = New-Object System.Drawing.Rectangle($dx,$dy,$dw,$dh)
                $dstR = New-Object System.Drawing.Rectangle(0,0,$dw,$dh)
                $cg.DrawImage($thumb,$dstR,$srcR,[System.Drawing.GraphicsUnit]::Pixel)
                $cg.Dispose()
                $ms = New-Object System.IO.MemoryStream
                $crop.Save($ms,$enc,$params)
                $crop.Dispose()
                $b64 = [Convert]::ToBase64String($ms.ToArray())
                $ms.Dispose()
                $isDelta = $true
                Write-Output "DELTA:$newW,$newH,$dx,$dy,$dw,$dh\`:$b64"
            }
        }
        if (-not $isDelta) {
            $ms = New-Object System.IO.MemoryStream
            $thumb.Save($ms,$enc,$params)
            $b64 = [Convert]::ToBase64String($ms.ToArray())
            $ms.Dispose()
            Write-Output "OK:$b64"
        }
        if ($null -ne $prevThumb) { $prevThumb.Dispose() }
        $prevThumb = $thumb
    } catch {
        if ($null -ne $thumb) { try { $thumb.Dispose() } catch {} }
        Write-Output "ERR:$($_.Exception.Message)"
    }
    [Console]::Out.Flush()
}
`.trim();
var psState = null;
function ensurePsProcess() {
  if (psState && psState.proc.exitCode === null) return psState;
  const proc = (0, import_child_process3.spawn)("powershell.exe", [
    "-NonInteractive",
    "-NoProfile",
    "-WindowStyle",
    "Hidden",
    "-Command",
    PS_LOOP_SCRIPT
  ], { stdio: ["pipe", "pipe", "ignore"] });
  const state = { proc, buf: "", resolve: null };
  psState = state;
  proc.stdout?.on("data", (chunk) => {
    state.buf += chunk.toString();
    const lines = state.buf.split("\n");
    state.buf = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (state.resolve) {
        const r = state.resolve;
        state.resolve = null;
        r(line);
      }
    }
  });
  proc.on("close", () => {
    if (psState === state) psState = null;
    if (state.resolve) {
      const r = state.resolve;
      state.resolve = null;
      r("ERR:process_died");
    }
  });
  proc.on("error", () => {
    if (psState === state) psState = null;
    if (state.resolve) {
      const r = state.resolve;
      state.resolve = null;
      r("ERR:process_error");
    }
  });
  return state;
}
function captureWithPersistentPs(quality, maxWidth, monX, monY, monW, monH) {
  return new Promise((resolve, reject) => {
    let state;
    try {
      state = ensurePsProcess();
    } catch (e) {
      reject(e);
      return;
    }
    const cmd = `${quality}|${maxWidth}|${monX}|${monY}|${monW}|${monH}
`;
    const timer = setTimeout(() => {
      if (state.resolve) {
        state.resolve = null;
      }
      reject(new Error("[screen] persistent PS timed out"));
    }, 6e3);
    state.resolve = (line) => {
      clearTimeout(timer);
      if (line.startsWith("OK:")) {
        const data = Buffer.from(line.slice(3), "base64");
        resolve({ isDelta: false, data });
      } else if (line.startsWith("DELTA:")) {
        const colonIdx = line.lastIndexOf(":");
        const meta = line.slice(6, colonIdx).split(",").map(Number);
        if (meta.length === 6 && meta.every((n) => !isNaN(n))) {
          const data = Buffer.from(line.slice(colonIdx + 1), "base64");
          resolve({ isDelta: true, data, fullW: meta[0], fullH: meta[1], x: meta[2], y: meta[3], w: meta[4], h: meta[5] });
        } else {
          reject(new Error(`[screen] PS: malformed DELTA line`));
        }
      } else if (line.startsWith("ERR:")) {
        reject(new Error(`[screen] PS: ${line.slice(4)}`));
      } else {
        reject(new Error(`[screen] PS: unexpected line: ${line.slice(0, 60)}`));
      }
    };
    state.proc.stdin?.write(cmd, (err) => {
      if (err) {
        clearTimeout(timer);
        if (state.resolve) {
          state.resolve = null;
        }
        reject(err);
      }
    });
  });
}
async function captureWithSingleShotPs(quality, maxWidth, monX, monY, monW, monH, outFile) {
  const boundsCode = monW > 0 ? `$bounds = New-Object System.Drawing.Rectangle(${monX}, ${monY}, ${monW}, ${monH})` : `$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds`;
  const ps = `
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
${boundsCode}
$bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$g.Dispose()
$newW = [Math]::Min($bounds.Width, ${maxWidth})
$ratio = if ($bounds.Width -gt 0) { $newW / $bounds.Width } else { 1 }
$newH = [Math]::Max(1, [int]($bounds.Height * $ratio))
$thumb = New-Object System.Drawing.Bitmap($newW, $newH)
$tg = [System.Drawing.Graphics]::FromImage($thumb)
$tg.DrawImage($bmp, 0, 0, $newW, $newH)
$tg.Dispose(); $bmp.Dispose()
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object {$_.MimeType -eq 'image/jpeg'}
$params = New-Object System.Drawing.Imaging.EncoderParameters(1)
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]${quality})
$thumb.Save("${outFile}", $enc, $params)
$thumb.Dispose()
`.trim();
  await withTimeout(
    execFileAsync("powershell.exe", [
      "-NonInteractive",
      "-NoProfile",
      "-WindowStyle",
      "Hidden",
      "-Command",
      ps
    ]),
    1e4,
    "powershell-single"
  );
}
var DEFAULT_OPTIONS = { quality: 65, maxWidth: 1280, monitorId: 0 };
async function captureScreen(opts = {}) {
  const { quality, maxWidth, monitorId = 0, monitors } = { ...DEFAULT_OPTIONS, ...opts };
  const backend = await detectBackend();
  if (backend === "none") return null;
  const mon = monitors?.find((m) => m.id === monitorId);
  const hasMultiMon = monitors && monitors.length > 1 && mon;
  try {
    let jpegBuf;
    switch (backend) {
      case "scrot": {
        const tmpFile = makeTmpFrame();
        const envX = { ...process.env, DISPLAY: process.env.DISPLAY || ":0" };
        const cmd = hasMultiMon ? `scrot --quality ${quality} --silent -a ${mon.x},${mon.y},${mon.width},${mon.height} "${tmpFile}"` : `scrot --quality ${quality} --silent "${tmpFile}"`;
        await withTimeout(execAsync2(cmd, { env: envX }), 5e3, "scrot");
        try {
          await withTimeout(
            execAsync2(`convert "${tmpFile}" -resize ${maxWidth}x\\> -quality ${quality} "${tmpFile}"`, { env: envX }),
            3e3,
            "convert"
          );
        } catch {
        }
        jpegBuf = await import_promises.default.readFile(tmpFile);
        try {
          await import_promises.default.unlink(tmpFile);
        } catch {
        }
        break;
      }
      case "import": {
        const tmpFile = makeTmpFrame();
        const envX = { ...process.env, DISPLAY: process.env.DISPLAY || ":0" };
        const cropArg = hasMultiMon ? `-crop ${mon.width}x${mon.height}+${mon.x}+${mon.y} +repage` : "";
        await withTimeout(
          execAsync2(`import -window root ${cropArg} -resize ${maxWidth}x -quality ${quality} "${tmpFile}"`, { env: envX }),
          5e3,
          "import"
        );
        jpegBuf = await import_promises.default.readFile(tmpFile);
        try {
          await import_promises.default.unlink(tmpFile);
        } catch {
        }
        break;
      }
      case "xwd": {
        const { stdout } = await withTimeout(
          execAsync2(
            `xwd -root -silent | convert xwd:- -resize ${maxWidth}x -quality ${quality} jpg:-`,
            { maxBuffer: 20 * 1024 * 1024, env: { ...process.env, DISPLAY: process.env.DISPLAY || ":0" } }
          ),
          8e3,
          "xwd"
        );
        jpegBuf = Buffer.from(stdout, "binary");
        break;
      }
      case "screencapture": {
        const tmpFile = makeTmpFrame();
        const displayArg = hasMultiMon ? `-D ${monitorId + 1}` : "";
        await withTimeout(execAsync2(`screencapture -x ${displayArg} -t jpg "${tmpFile}"`), 5e3, "screencapture");
        let raw = await import_promises.default.readFile(tmpFile);
        try {
          await withTimeout(
            execAsync2(`convert "${tmpFile}" -resize ${maxWidth}x -quality ${quality} "${tmpFile}"`),
            3e3,
            "convert"
          );
          raw = await import_promises.default.readFile(tmpFile);
        } catch {
        }
        jpegBuf = raw;
        try {
          await import_promises.default.unlink(tmpFile);
        } catch {
        }
        break;
      }
      case "powershell": {
        const monX = hasMultiMon ? mon.x : 0;
        const monY = hasMultiMon ? mon.y : 0;
        const monW = hasMultiMon ? mon.width : 0;
        const monH = hasMultiMon ? mon.height : 0;
        let psResult;
        try {
          psResult = await captureWithPersistentPs(quality, maxWidth, monX, monY, monW, monH);
        } catch (persistErr) {
          console.warn("[screen] Persistent PS failed, falling back to single-shot:", persistErr.message);
          if (psState) {
            try {
              psState.proc.kill();
            } catch {
            }
            psState = null;
          }
          const tmpFile = makeTmpFrame();
          await captureWithSingleShotPs(quality, maxWidth, monX, monY, monW, monH, tmpFile);
          const buf = await import_promises.default.readFile(tmpFile);
          try {
            await import_promises.default.unlink(tmpFile);
          } catch {
          }
          const dims2 = parseJpegDimensions(buf);
          return { data: buf, width: dims2.width, height: dims2.height };
        }
        if (psResult.isDelta) {
          return {
            data: psResult.data,
            width: psResult.fullW,
            height: psResult.fullH,
            deltaRegion: { x: psResult.x, y: psResult.y, w: psResult.w, h: psResult.h }
          };
        }
        const dims = parseJpegDimensions(psResult.data);
        return { data: psResult.data, width: dims.width, height: dims.height };
      }
      default:
        return null;
    }
    const { width, height } = parseJpegDimensions(jpegBuf);
    return { data: jpegBuf, width, height };
  } catch (err) {
    console.error(`[screen] Capture failed (${backend}):`, err.message);
    return null;
  }
}
function parseJpegDimensions(buf) {
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 255) break;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker === 192 || marker === 193 || marker === 194) {
      const height = buf.readUInt16BE(i + 5);
      const width = buf.readUInt16BE(i + 7);
      return { width, height };
    }
    i += 2 + len;
  }
  return { width: 1280, height: 720 };
}
process.on("exit", () => {
  if (psState) {
    try {
      psState.proc.stdin?.write("EXIT\n");
    } catch {
    }
    try {
      psState.proc.kill();
    } catch {
    }
    psState = null;
  }
});
var _ffmpegAvailable = null;
async function isFfmpegAvailable() {
  if (_ffmpegAvailable !== null) return _ffmpegAvailable;
  if (PLATFORM !== "win32") {
    _ffmpegAvailable = false;
    return false;
  }
  try {
    await withTimeout(execAsync2("ffmpeg -version"), 4e3, "ffmpeg-detect");
    _ffmpegAvailable = true;
    console.log("[screen] \u2705 ffmpeg detected \u2014 switching to gdigrab capture (15\u201330 fps)");
  } catch {
    _ffmpegAvailable = false;
    console.log("[screen] \u26A0\uFE0F  ffmpeg not found on PATH \u2014 using PowerShell GDI+ capture (~1 fps)");
    console.log("[screen]    Install ffmpeg for real-time streaming: https://www.gyan.dev/ffmpeg/builds/");
  }
  return _ffmpegAvailable;
}
function qualityToFfmpegQ(quality) {
  return Math.max(2, Math.min(15, Math.round((100 - quality) / 5)));
}
function extractJpegFrames(buf) {
  const frames = [];
  let frameStart = 0;
  let i = 0;
  while (i < buf.length - 1) {
    if (buf[i] === 255 && buf[i + 1] === 217) {
      const frameEnd = i + 2;
      const frame = buf.slice(frameStart, frameEnd);
      if (frame.length >= 4 && frame[0] === 255 && frame[1] === 216) {
        frames.push(Buffer.from(frame));
      }
      frameStart = frameEnd;
      i = frameEnd;
    } else {
      i++;
    }
  }
  return { frames, remainder: buf.slice(frameStart) };
}
function startFfmpegCaptureLoop(opts) {
  let stopped = false;
  let proc = null;
  let remainder = Buffer.alloc(0);
  const q = qualityToFfmpegQ(opts.quality);
  const hasMonitor = !!(opts.monitorW && opts.monitorH);
  function buildArgs() {
    const args = ["-loglevel", "error"];
    if (hasMonitor) {
      args.push(
        "-f",
        "gdigrab",
        "-framerate",
        String(Math.min(opts.fps, 30)),
        "-offset_x",
        String(opts.monitorX ?? 0),
        "-offset_y",
        String(opts.monitorY ?? 0),
        "-video_size",
        `${opts.monitorW}x${opts.monitorH}`,
        "-i",
        "desktop"
      );
    } else {
      args.push(
        "-f",
        "gdigrab",
        "-framerate",
        String(Math.min(opts.fps, 30)),
        "-i",
        "desktop"
      );
    }
    args.push(
      "-vf",
      `scale=${opts.maxWidth}:-2:flags=bilinear`,
      "-c:v",
      "mjpeg",
      "-q:v",
      String(q),
      "-f",
      "image2pipe",
      "-flush_packets",
      "1",
      "pipe:1"
    );
    return args;
  }
  function start() {
    if (stopped) return;
    const args = buildArgs();
    proc = (0, import_child_process3.spawn)("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    remainder = Buffer.alloc(0);
    proc.stdout?.on("data", (chunk) => {
      if (stopped) return;
      const combined = Buffer.concat([remainder, chunk]);
      const { frames, remainder: rem } = extractJpegFrames(combined);
      remainder = rem;
      for (const jpeg of frames) {
        const dims = parseJpegDimensions(jpeg);
        opts.onFrame(jpeg, dims.width, dims.height);
      }
    });
    let stderrBuf = "";
    proc.stderr?.on("data", (chunk) => {
      stderrBuf += chunk.toString();
      const lines = stderrBuf.split("\n");
      stderrBuf = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (t && !t.startsWith("frame=") && !t.startsWith("size=")) {
          console.warn("[ffmpeg]", t);
        }
      }
    });
    proc.on("close", (code) => {
      proc = null;
      if (!stopped) {
        console.warn(`[screen] ffmpeg exited (code=${code ?? "null"}), restarting in 2 s \u2026`);
        setTimeout(start, 2e3);
      }
    });
    proc.on("error", (err) => {
      proc = null;
      if (!stopped) opts.onError?.(err);
    });
    console.log(`[screen] ffmpeg started: fps=${Math.min(opts.fps, 30)} q=${q} maxW=${opts.maxWidth}${hasMonitor ? ` mon=${opts.monitorX},${opts.monitorY} ${opts.monitorW}x${opts.monitorH}` : ""}`);
  }
  start();
  return () => {
    stopped = true;
    if (proc) {
      try {
        proc.kill("SIGTERM");
      } catch {
      }
      proc = null;
    }
  };
}

// src/system/inputControl.ts
var import_child_process4 = require("child_process");
var import_util3 = require("util");
var execAsync3 = (0, import_util3.promisify)(import_child_process4.exec);
var execFileAsync2 = (0, import_util3.promisify)(import_child_process4.execFile);
var PLATFORM2 = process.platform;
var _winPs = null;
var _winPsReady = false;
function ensureWinPs() {
  if (PLATFORM2 !== "win32") return;
  if (_winPs && !_winPs.killed && _winPsReady) return;
  _winPsReady = false;
  _winPs = (0, import_child_process4.spawn)("powershell.exe", ["-NoProfile", "-NonInteractive", "-NoLogo", "-Command", "-"], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true
  });
  const init = `
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public class WinIC{
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f,int x,int y,int d,IntPtr e);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk,byte sc,uint flags,IntPtr extra);
  public const uint LD=2,LU=4,RD=8,RU=16,MD=32,MU=64,WH=2048,KEYUP=2;
}
'@ -Language CSharp
Add-Type -AssemblyName System.Windows.Forms
Write-Host 'WINIC_READY'
`;
  _winPs.stdin.write(init + "\n");
  _winPs.stdout.on("data", (d) => {
    if (d.toString().includes("WINIC_READY")) _winPsReady = true;
  });
  _winPs.stderr.on("data", () => {
  });
  _winPs.on("exit", () => {
    _winPs = null;
    _winPsReady = false;
  });
}
function sendWinCmd(cmd) {
  ensureWinPs();
  if (_winPs && !_winPs.killed && _winPsReady) {
    try {
      _winPs.stdin.write(cmd + "\n");
    } catch {
    }
    return;
  }
  const deadline = Date.now() + 5e3;
  const poll = setInterval(() => {
    if (_winPsReady && _winPs && !_winPs.killed) {
      clearInterval(poll);
      try {
        _winPs.stdin.write(cmd + "\n");
      } catch {
      }
    } else if (Date.now() > deadline) {
      clearInterval(poll);
    }
  }, 80);
}
var WIN_VK = {
  "backspace": 8,
  "tab": 9,
  "enter": 13,
  "return": 13,
  "shift": 16,
  "control": 17,
  "ctrl": 17,
  "alt": 18,
  "pause": 19,
  "capslock": 20,
  "escape": 27,
  "esc": 27,
  " ": 32,
  "space": 32,
  "pageup": 33,
  "pagedown": 34,
  "end": 35,
  "home": 36,
  "arrowleft": 37,
  "arrowup": 38,
  "arrowright": 39,
  "arrowdown": 40,
  "insert": 45,
  "delete": 46,
  "0": 48,
  "1": 49,
  "2": 50,
  "3": 51,
  "4": 52,
  "5": 53,
  "6": 54,
  "7": 55,
  "8": 56,
  "9": 57,
  "a": 65,
  "b": 66,
  "c": 67,
  "d": 68,
  "e": 69,
  "f": 70,
  "g": 71,
  "h": 72,
  "i": 73,
  "j": 74,
  "k": 75,
  "l": 76,
  "m": 77,
  "n": 78,
  "o": 79,
  "p": 80,
  "q": 81,
  "r": 82,
  "s": 83,
  "t": 84,
  "u": 85,
  "v": 86,
  "w": 87,
  "x": 88,
  "y": 89,
  "z": 90,
  "meta": 91,
  "win": 91,
  "contextmenu": 93,
  "f1": 112,
  "f2": 113,
  "f3": 114,
  "f4": 115,
  "f5": 116,
  "f6": 117,
  "f7": 118,
  "f8": 119,
  "f9": 120,
  "f10": 121,
  "f11": 122,
  "f12": 123,
  "numlock": 144,
  "scrolllock": 145,
  "printscreen": 44,
  ";": 186,
  "=": 187,
  ",": 188,
  "-": 189,
  ".": 190,
  "/": 191,
  "`": 192,
  "[": 219,
  "\\": 220,
  "]": 221,
  "'": 222
};
var _hasXdotool = null;
var _hasCliclick = null;
async function hasXdotool() {
  if (_hasXdotool !== null) return _hasXdotool;
  try {
    await execAsync3("which xdotool");
    _hasXdotool = true;
  } catch {
    _hasXdotool = false;
  }
  return _hasXdotool;
}
async function hasCliclick() {
  if (_hasCliclick !== null) return _hasCliclick;
  try {
    await execAsync3("which cliclick");
    _hasCliclick = true;
  } catch {
    _hasCliclick = false;
  }
  return _hasCliclick;
}
var _screenW = 1920;
var _screenH = 1080;
function setScreenResolution(w, h) {
  _screenW = w;
  _screenH = h;
}
function toAbsX(relX) {
  return Math.round(relX * _screenW);
}
function toAbsY(relY) {
  return Math.round(relY * _screenH);
}
var XDOTOOL_BUTTON = { 0: 1, 1: 2, 2: 3 };
async function controlMouse(evt) {
  const ax = toAbsX(evt.x);
  const ay = toAbsY(evt.y);
  const btn = evt.button ?? 0;
  if (PLATFORM2 === "linux") {
    await controlMouseLinux(evt, ax, ay, btn);
  } else if (PLATFORM2 === "win32") {
    await controlMouseWindows(evt, ax, ay, btn);
  } else if (PLATFORM2 === "darwin") {
    await controlMouseMac(evt, ax, ay, btn);
  }
}
async function controlMouseLinux(evt, ax, ay, btn) {
  const xb = XDOTOOL_BUTTON[btn] ?? 1;
  const display = process.env.DISPLAY || ":0";
  const env = { ...process.env, DISPLAY: display };
  try {
    switch (evt.type) {
      case "move":
        await execAsync3(`xdotool mousemove ${ax} ${ay}`, { env, timeout: 1e3 });
        break;
      case "down":
        await execAsync3(`xdotool mousemove ${ax} ${ay} mousedown ${xb}`, { env, timeout: 1e3 });
        break;
      case "up":
        await execAsync3(`xdotool mousemove ${ax} ${ay} mouseup ${xb}`, { env, timeout: 1e3 });
        break;
      case "click":
        await execAsync3(`xdotool mousemove ${ax} ${ay} click ${xb}`, { env, timeout: 1e3 });
        break;
      case "dblclick":
        await execAsync3(`xdotool mousemove ${ax} ${ay} click --repeat 2 ${xb}`, { env, timeout: 1e3 });
        break;
      case "scroll": {
        const dir = (evt.deltaY ?? 0) > 0 ? 5 : 4;
        await execAsync3(`xdotool mousemove ${ax} ${ay} click ${dir}`, { env, timeout: 1e3 });
        break;
      }
    }
  } catch (err) {
    const available = await hasXdotool();
    if (!available) {
      console.warn("[input] xdotool not available. Install with: sudo apt install xdotool");
    } else {
      console.error("[input] xdotool error:", err.message);
    }
  }
}
async function controlMouseWindows(evt, ax, ay, btn) {
  switch (evt.type) {
    case "move":
      sendWinCmd(`[WinIC]::SetCursorPos(${ax},${ay})`);
      break;
    case "click": {
      const ld = btn === 2 ? "[WinIC]::RD" : btn === 1 ? "[WinIC]::MD" : "[WinIC]::LD";
      const lu = btn === 2 ? "[WinIC]::RU" : btn === 1 ? "[WinIC]::MU" : "[WinIC]::LU";
      sendWinCmd(`[WinIC]::SetCursorPos(${ax},${ay});[WinIC]::mouse_event(${ld},0,0,0,[IntPtr]::Zero);[WinIC]::mouse_event(${lu},0,0,0,[IntPtr]::Zero)`);
      break;
    }
    case "dblclick":
      sendWinCmd(`[WinIC]::SetCursorPos(${ax},${ay});[WinIC]::mouse_event([WinIC]::LD,0,0,0,[IntPtr]::Zero);[WinIC]::mouse_event([WinIC]::LU,0,0,0,[IntPtr]::Zero);Start-Sleep -Milliseconds 40;[WinIC]::mouse_event([WinIC]::LD,0,0,0,[IntPtr]::Zero);[WinIC]::mouse_event([WinIC]::LU,0,0,0,[IntPtr]::Zero)`);
      break;
    case "down": {
      const df = btn === 2 ? "[WinIC]::RD" : btn === 1 ? "[WinIC]::MD" : "[WinIC]::LD";
      sendWinCmd(`[WinIC]::SetCursorPos(${ax},${ay});[WinIC]::mouse_event(${df},0,0,0,[IntPtr]::Zero)`);
      break;
    }
    case "up": {
      const uf = btn === 2 ? "[WinIC]::RU" : btn === 1 ? "[WinIC]::MU" : "[WinIC]::LU";
      sendWinCmd(`[WinIC]::SetCursorPos(${ax},${ay});[WinIC]::mouse_event(${uf},0,0,0,[IntPtr]::Zero)`);
      break;
    }
    case "scroll": {
      const wd = (evt.deltaY ?? 0) > 0 ? -120 : 120;
      sendWinCmd(`[WinIC]::SetCursorPos(${ax},${ay});[WinIC]::mouse_event([WinIC]::WH,0,0,${wd},[IntPtr]::Zero)`);
      break;
    }
  }
}
async function controlMouseMac(evt, ax, ay, btn) {
  const available = await hasCliclick();
  if (available) {
    try {
      switch (evt.type) {
        case "move":
          await execAsync3(`cliclick m:${ax},${ay}`, { timeout: 1e3 });
          break;
        case "click":
          await execAsync3(`cliclick ${btn === 2 ? "rc" : "c"}:${ax},${ay}`, { timeout: 1e3 });
          break;
        case "dblclick":
          await execAsync3(`cliclick dc:${ax},${ay}`, { timeout: 1e3 });
          break;
        case "down":
          await execAsync3(`cliclick dd:${ax},${ay}`, { timeout: 1e3 });
          break;
        case "up":
          await execAsync3(`cliclick du:${ax},${ay}`, { timeout: 1e3 });
          break;
        case "scroll": {
          const scrollDir = (evt.deltaY ?? 0) > 0 ? "-3" : "3";
          await execAsync3(`cliclick m:${ax},${ay}`, { timeout: 1e3 });
          await execAsync3(`osascript -e 'tell application "System Events" to scroll ${scrollDir}'`, { timeout: 1e3 });
          break;
        }
      }
    } catch (err) {
      console.error("[input] cliclick error:", err.message);
    }
  } else {
    const script = `tell application "System Events" to set the mouse location to {${ax}, ${ay}}`;
    try {
      await execAsync3(`osascript -e '${script}'`, { timeout: 2e3 });
    } catch (err) {
      console.error("[input] osascript error:", err.message);
    }
  }
}
var XDOTOOL_KEY_MAP = {
  "enter": "Return",
  "return": "Return",
  "escape": "Escape",
  "esc": "Escape",
  "tab": "Tab",
  "space": "space",
  "backspace": "BackSpace",
  "delete": "Delete",
  "insert": "Insert",
  "home": "Home",
  "end": "End",
  "pageup": "Page_Up",
  "pagedown": "Page_Down",
  "arrowup": "Up",
  "up": "Up",
  "arrowdown": "Down",
  "down": "Down",
  "arrowleft": "Left",
  "left": "Left",
  "arrowright": "Right",
  "right": "Right",
  "f1": "F1",
  "f2": "F2",
  "f3": "F3",
  "f4": "F4",
  "f5": "F5",
  "f6": "F6",
  "f7": "F7",
  "f8": "F8",
  "f9": "F9",
  "f10": "F10",
  "f11": "F11",
  "f12": "F12",
  "ctrl": "ctrl",
  "control": "ctrl",
  "alt": "alt",
  "shift": "shift",
  "meta": "super",
  "win": "super",
  "capslock": "Caps_Lock",
  "numlock": "Num_Lock",
  "printscreen": "Print"
};
var PS_KEY_MAP = {
  "enter": "{ENTER}",
  "return": "{ENTER}",
  "escape": "{ESC}",
  "esc": "{ESC}",
  "tab": "{TAB}",
  "space": " ",
  "backspace": "{BACKSPACE}",
  "delete": "{DELETE}",
  "insert": "{INSERT}",
  "home": "{HOME}",
  "end": "{END}",
  "pageup": "{PGUP}",
  "pagedown": "{PGDN}",
  "arrowup": "{UP}",
  "up": "{UP}",
  "arrowdown": "{DOWN}",
  "down": "{DOWN}",
  "arrowleft": "{LEFT}",
  "left": "{LEFT}",
  "arrowright": "{RIGHT}",
  "right": "{RIGHT}",
  "f1": "{F1}",
  "f2": "{F2}",
  "f3": "{F3}",
  "f4": "{F4}",
  "f5": "{F5}",
  "f6": "{F6}",
  "f7": "{F7}",
  "f8": "{F8}",
  "f9": "{F9}",
  "f10": "{F10}",
  "f11": "{F11}",
  "f12": "{F12}",
  "capslock": "{CAPSLOCK}"
};
function buildXdotoolKeyCombo(key, mods) {
  const base = XDOTOOL_KEY_MAP[key.toLowerCase()] ?? key.toLowerCase();
  const modParts = [];
  if (mods.includes("ctrl")) modParts.push("ctrl");
  if (mods.includes("alt")) modParts.push("alt");
  if (mods.includes("shift")) modParts.push("shift");
  if (mods.includes("meta")) modParts.push("super");
  return modParts.length > 0 ? `${modParts.join("+")}+${base}` : base;
}
function buildPsKeyCombo(key, mods) {
  const base = PS_KEY_MAP[key.toLowerCase()] ?? key;
  let combo = "";
  if (mods.includes("ctrl")) combo += "^";
  if (mods.includes("alt")) combo += "%";
  if (mods.includes("shift")) combo += "+";
  combo += base;
  return combo;
}
async function controlKeyboard(evt) {
  const mods = evt.modifiers ?? [];
  if (PLATFORM2 === "linux") {
    await controlKeyboardLinux(evt, mods);
  } else if (PLATFORM2 === "win32") {
    await controlKeyboardWindows(evt, mods);
  } else if (PLATFORM2 === "darwin") {
    await controlKeyboardMac(evt, mods);
  }
}
async function controlKeyboardLinux(evt, mods) {
  const display = process.env.DISPLAY || ":0";
  const env = { ...process.env, DISPLAY: display };
  const keyCombo = buildXdotoolKeyCombo(evt.key, mods);
  try {
    switch (evt.type) {
      case "press":
        await execAsync3(`xdotool key ${keyCombo}`, { env, timeout: 1e3 });
        break;
      case "down":
        await execAsync3(`xdotool keydown ${keyCombo}`, { env, timeout: 1e3 });
        break;
      case "up":
        await execAsync3(`xdotool keyup ${keyCombo}`, { env, timeout: 1e3 });
        break;
    }
  } catch (err) {
    console.error("[input] xdotool key error:", err.message);
  }
}
async function controlKeyboardWindows(evt, mods) {
  const keyLower = evt.key.toLowerCase();
  if (evt.type === "press") {
    const keyCombo = buildPsKeyCombo(evt.key, mods);
    const escaped = keyCombo.replace(/'/g, "''");
    sendWinCmd(`[System.Windows.Forms.SendKeys]::SendWait('${escaped}')`);
    return;
  }
  const vk = WIN_VK[keyLower] ?? (evt.key.length === 1 ? evt.key.toUpperCase().charCodeAt(0) : null);
  if (!vk) return;
  const kflag = evt.type === "up" ? "[WinIC]::KEYUP" : "0";
  const modVks = [];
  if (mods.includes("ctrl")) modVks.push(17);
  if (mods.includes("alt")) modVks.push(18);
  if (mods.includes("shift")) modVks.push(16);
  if (mods.includes("meta")) modVks.push(91);
  const cmds = [];
  if (evt.type === "down") {
    modVks.forEach((mv) => cmds.push(`[WinIC]::keybd_event(${mv},0,0,[IntPtr]::Zero)`));
    cmds.push(`[WinIC]::keybd_event(${vk},0,0,[IntPtr]::Zero)`);
  } else {
    cmds.push(`[WinIC]::keybd_event(${vk},0,${kflag},[IntPtr]::Zero)`);
    modVks.reverse().forEach((mv) => cmds.push(`[WinIC]::keybd_event(${mv},0,[WinIC]::KEYUP,[IntPtr]::Zero)`));
  }
  sendWinCmd(cmds.join(";"));
}
async function controlKeyboardMac(evt, mods) {
  if (evt.type !== "press") return;
  const keyName = XDOTOOL_KEY_MAP[evt.key.toLowerCase()] ?? evt.key;
  let script = "";
  if (mods.length > 0) {
    const modUsing = mods.map((m) => {
      if (m === "ctrl") return "control down";
      if (m === "alt") return "option down";
      if (m === "shift") return "shift down";
      if (m === "meta") return "command down";
      return m;
    });
    script = `tell application "System Events" to keystroke "${keyName}" using {${modUsing.join(", ")}}`;
  } else {
    script = `tell application "System Events" to keystroke "${keyName}"`;
  }
  try {
    await execAsync3(`osascript -e '${script}'`, { timeout: 2e3 });
  } catch (err) {
    console.error("[input] osascript key error:", err.message);
  }
}
async function readClipboard() {
  try {
    if (PLATFORM2 === "linux") {
      const display = process.env.DISPLAY || ":0";
      const env = { ...process.env, DISPLAY: display };
      try {
        const { stdout } = await execAsync3("xclip -selection clipboard -o", { env, timeout: 3e3 });
        return stdout;
      } catch {
        const { stdout } = await execAsync3("xsel --clipboard --output", { env, timeout: 3e3 });
        return stdout;
      }
    } else if (PLATFORM2 === "win32") {
      const ps = `Get-Clipboard`;
      const { stdout } = await execAsync3(
        `powershell.exe -NonInteractive -NoProfile -Command "${ps}"`,
        { timeout: 3e3 }
      );
      return stdout.trim();
    } else if (PLATFORM2 === "darwin") {
      const { stdout } = await execAsync3("pbpaste", { timeout: 3e3 });
      return stdout;
    }
  } catch (err) {
    console.error("[clipboard] read error:", err.message);
  }
  return "";
}
async function writeClipboard(text) {
  try {
    const buf = Buffer.from(text, "utf8");
    if (PLATFORM2 === "linux") {
      const display = process.env.DISPLAY || ":0";
      const env = { ...process.env, DISPLAY: display };
      await new Promise((resolve) => {
        const proc = (0, import_child_process4.spawn)("xclip", ["-selection", "clipboard"], { env });
        proc.stdin.write(buf);
        proc.stdin.end();
        proc.on("close", () => resolve());
        proc.on("error", () => {
          const proc2 = (0, import_child_process4.spawn)("xsel", ["--clipboard", "--input"], { env });
          proc2.stdin.write(buf);
          proc2.stdin.end();
          proc2.on("close", () => resolve());
          proc2.on("error", () => resolve());
        });
      });
    } else if (PLATFORM2 === "darwin") {
      await new Promise((resolve) => {
        const proc = (0, import_child_process4.spawn)("pbcopy", []);
        proc.stdin.write(buf);
        proc.stdin.end();
        proc.on("close", () => resolve());
        proc.on("error", () => resolve());
      });
    } else if (PLATFORM2 === "win32") {
      const b64 = buf.toString("base64");
      const ps = `$t=[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64}'));Set-Clipboard -Value $t`;
      await execFileAsync2("powershell.exe", ["-NonInteractive", "-NoProfile", "-Command", ps], { timeout: 3e3 });
    }
  } catch (err) {
    console.error("[clipboard] write error:", err.message);
  }
}
async function enablePrivacyMode() {
  try {
    if (PLATFORM2 === "linux") {
      const display = process.env.DISPLAY || ":0";
      const env = { ...process.env, DISPLAY: display };
      try {
        await execAsync3(`xrandr --output $(xrandr | grep " connected" | head -1 | cut -d" " -f1) --brightness 0`, { env, timeout: 3e3 });
      } catch {
        await execAsync3("xset dpms force off", { env, timeout: 2e3 });
      }
    } else if (PLATFORM2 === "win32") {
      const ps = `
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public class WinAPI {
  [DllImport("user32.dll")] public static extern bool LockWorkStation();
}
"@
[WinAPI]::LockWorkStation()
`;
      await execFileAsync2("powershell.exe", ["-NonInteractive", "-NoProfile", "-WindowStyle", "Hidden", "-Command", ps], { timeout: 3e3 });
    } else if (PLATFORM2 === "darwin") {
      await execAsync3(`osascript -e 'tell application "System Events" to sleep'`, { timeout: 3e3 });
    }
    console.log("[privacy] Privacy mode ENABLED");
  } catch (err) {
    console.error("[privacy] enable error:", err.message);
  }
}
async function disablePrivacyMode() {
  try {
    if (PLATFORM2 === "linux") {
      const display = process.env.DISPLAY || ":0";
      const env = { ...process.env, DISPLAY: display };
      try {
        await execAsync3(`xrandr --output $(xrandr | grep " connected" | head -1 | cut -d" " -f1) --brightness 1`, { env, timeout: 3e3 });
      } catch {
        await execAsync3("xset dpms force on", { env, timeout: 2e3 });
      }
    } else if (PLATFORM2 === "win32") {
    } else if (PLATFORM2 === "darwin") {
      await execAsync3(`caffeinate -u -t 1`, { timeout: 3e3 });
    }
    console.log("[privacy] Privacy mode DISABLED");
  } catch (err) {
    console.error("[privacy] disable error:", err.message);
  }
}
async function listMonitors() {
  try {
    if (PLATFORM2 === "linux") {
      return await listMonitorsLinux();
    } else if (PLATFORM2 === "win32") {
      return await listMonitorsWindows();
    } else if (PLATFORM2 === "darwin") {
      return await listMonitorsMac();
    }
  } catch (err) {
    console.error("[monitors] list error:", err.message);
  }
  return [{ id: 0, x: 0, y: 0, width: _screenW, height: _screenH, primary: true, name: "Primary" }];
}
async function listMonitorsLinux() {
  const display = process.env.DISPLAY || ":0";
  const env = { ...process.env, DISPLAY: display };
  const { stdout } = await execAsync3("xrandr --query", { env, timeout: 5e3 });
  const monitors = [];
  let id = 0;
  const lines = stdout.split("\n");
  for (const line of lines) {
    const m = line.match(/^(\S+)\s+connected\s+(?:primary\s+)?(\d+)x(\d+)\+(\d+)\+(\d+)/);
    if (m) {
      monitors.push({
        id: id++,
        name: m[1],
        width: parseInt(m[2]),
        height: parseInt(m[3]),
        x: parseInt(m[4]),
        y: parseInt(m[5]),
        primary: line.includes(" primary ")
      });
    }
  }
  return monitors.length > 0 ? monitors : [{ id: 0, x: 0, y: 0, width: _screenW, height: _screenH, primary: true, name: "Primary" }];
}
async function listMonitorsWindows() {
  const ps = `
Add-Type -AssemblyName System.Windows.Forms
$screens = [System.Windows.Forms.Screen]::AllScreens
$result = $screens | ForEach-Object {
  "$($_.Bounds.X),$($_.Bounds.Y),$($_.Bounds.Width),$($_.Bounds.Height),$($_.Primary),$($_.DeviceName)"
}
$result -join "|"
`;
  const { stdout } = await execFileAsync2("powershell.exe", ["-NonInteractive", "-NoProfile", "-Command", ps], { timeout: 5e3 });
  const monitors = [];
  stdout.trim().split("|").forEach((part, idx) => {
    const [x, y, w, h, primary, name] = part.split(",");
    monitors.push({
      id: idx,
      x: parseInt(x),
      y: parseInt(y),
      width: parseInt(w),
      height: parseInt(h),
      primary: primary?.toLowerCase() === "true",
      name: name?.replace("\\\\.\\", "").trim() || `Monitor ${idx + 1}`
    });
  });
  return monitors.length > 0 ? monitors : [{ id: 0, x: 0, y: 0, width: _screenW, height: _screenH, primary: true, name: "Primary" }];
}
async function listMonitorsMac() {
  try {
    const script = `
system_profiler SPDisplaysDataType | grep Resolution
`;
    const { stdout } = await execAsync3(script, { timeout: 5e3 });
    const monitors = [];
    let id = 0;
    const lines = stdout.split("\n").filter((l) => l.includes("Resolution"));
    for (const line of lines) {
      const m = line.match(/(\d+)\s*x\s*(\d+)/);
      if (m) {
        monitors.push({
          id: id++,
          x: 0,
          y: 0,
          width: parseInt(m[1]),
          height: parseInt(m[2]),
          primary: id === 1,
          name: `Display ${id}`
        });
      }
    }
    return monitors.length > 0 ? monitors : [{ id: 0, x: 0, y: 0, width: _screenW, height: _screenH, primary: true, name: "Primary" }];
  } catch {
    return [{ id: 0, x: 0, y: 0, width: _screenW, height: _screenH, primary: true, name: "Primary" }];
  }
}
async function isControlAvailable() {
  if (PLATFORM2 === "linux") return await hasXdotool();
  if (PLATFORM2 === "win32") return true;
  if (PLATFORM2 === "darwin") return true;
  return false;
}

// src/agent.ts
var AGENT_VERSION = "3.1.0";
var HEARTBEAT_INTERVAL = 4e3;
var RECONNECT_BASE_DELAY = 2e3;
var RECONNECT_MAX_DELAY = 3e4;
var CONSENT_TIMEOUT_SEC = parseInt(process.env.AGENT_CONSENT_TIMEOUT || "30", 10);
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
    this.ptyProcs = /* @__PURE__ */ new Map();
    this.screenTimers = /* @__PURE__ */ new Map();
    this.screenSeq = /* @__PURE__ */ new Map();
    this.screenMonitorId = /* @__PURE__ */ new Map();
    this.ffmpegCleanups = /* @__PURE__ */ new Map();
    this.controlAvailable = false;
    this.cachedMonitors = [];
    this.privacyMode = false;
    this.dockerAvailable = false;
    this.writeChunkBuffers = /* @__PURE__ */ new Map();
  }
  start() {
    this.running = true;
    this.connect();
  }
  stop() {
    this.running = false;
    this.clearTimers();
    for (const [, p] of this.ptyProcs) {
      try {
        p.proc.kill();
      } catch {
      }
    }
    this.ptyProcs.clear();
    for (const [sessionId] of this.screenTimers) {
      this.stopScreenCapture(sessionId);
    }
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
    const shell = process.platform === "win32" ? "powershell" : process.env.SHELL || "/bin/bash";
    this.controlAvailable = await isControlAvailable();
    try {
      this.cachedMonitors = await listMonitors();
    } catch {
      this.cachedMonitors = [];
    }
    const primary = this.cachedMonitors.find((m) => m.primary) ?? this.cachedMonitors[0];
    if (primary) setScreenResolution(primary.width, primary.height);
    this.dockerAvailable = await this.detectDocker();
    console.log(`\u{1F433} Docker available: ${this.dockerAvailable}`);
    const payload = {
      token: this.token,
      info: { ...info, agentVersion: AGENT_VERSION },
      stats,
      tunnelLayer: "relay",
      capabilities: {
        pty: true,
        sshAvailable: false,
        shell,
        screenControl: this.controlAvailable,
        clipboard: true,
        multiMonitor: this.cachedMonitors.length > 1,
        monitors: this.cachedMonitors,
        docker: this.dockerAvailable
      },
      sshInfo: { available: false, port: 22 }
    };
    this.send({ type: "agent:register", payload, timestamp: Date.now() });
    this.startHeartbeat();
  }
  // ── T005: Docker detection ────────────────────────────────────────────────
  detectDocker() {
    return new Promise((resolve) => {
      const proc = (0, import_child_process5.spawn)("docker", ["--version"], {
        stdio: "ignore",
        shell: process.platform === "win32",
        windowsHide: true
      });
      const timer = setTimeout(() => {
        try {
          proc.kill();
        } catch {
        }
        resolve(false);
      }, 3e3);
      proc.on("close", (code) => {
        clearTimeout(timer);
        resolve(code === 0);
      });
      proc.on("error", () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
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
        // ── T003: PTY resize — Windows-aware ────────────────────────────────
        case "server:pty_resize": {
          const p = message.payload;
          const pty = this.ptyProcs.get(p.sessionId);
          if (pty) {
            pty.rows = p.rows;
            pty.cols = p.cols;
            if (process.platform !== "win32") {
              try {
                pty.proc.kill("SIGWINCH");
              } catch {
              }
            } else {
              const hint = `\x1B[8;${p.rows};${p.cols}t`;
              this.send({
                type: "agent:pty_data",
                payload: { sessionId: p.sessionId, data: Buffer.from(hint).toString("base64") },
                timestamp: Date.now()
              });
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
        // ── T002: Chunked write (multi-message protocol) ─────────────────────
        case "server:fs_write_chunk": {
          const p = message.payload;
          this.handleWriteChunk(p);
          break;
        }
        case "server:screen_start": {
          const p = message.payload;
          this.handleScreenStart(p);
          break;
        }
        case "server:screen_stop": {
          const p = message.payload;
          this.stopScreenCapture(p.sessionId);
          break;
        }
        // ── Remote Control ─────────────────────────────────────────────────
        case "server:screen_mouse": {
          const p = message.payload;
          if (this.controlAvailable) {
            controlMouse({
              type: p.type,
              x: p.x,
              y: p.y,
              button: p.button,
              deltaY: p.deltaY
            }).catch((err) => console.error("[agent] mouse error:", err.message));
          }
          break;
        }
        case "server:screen_key": {
          const p = message.payload;
          if (this.controlAvailable) {
            controlKeyboard({
              type: p.type,
              key: p.key,
              modifiers: p.modifiers
            }).catch((err) => console.error("[agent] key error:", err.message));
          }
          break;
        }
        case "server:screen_clipboard_read": {
          const p = message.payload;
          readClipboard().then((text) => {
            this.send({
              type: "agent:screen_clipboard",
              payload: { sessionId: p.sessionId, text },
              timestamp: Date.now()
            });
          }).catch((err) => console.error("[agent] clipboard read error:", err.message));
          break;
        }
        case "server:screen_clipboard_write": {
          const p = message.payload;
          writeClipboard(p.text).catch((err) => console.error("[agent] clipboard write error:", err.message));
          break;
        }
        case "server:screen_get_monitors": {
          const p = message.payload;
          listMonitors().then((monitors) => {
            this.cachedMonitors = monitors;
            this.send({
              type: "agent:screen_monitors",
              payload: { sessionId: p.sessionId, monitors },
              timestamp: Date.now()
            });
          }).catch((err) => console.error("[agent] monitors error:", err.message));
          break;
        }
        case "server:screen_set_monitor": {
          const p = message.payload;
          this.screenMonitorId.set(p.sessionId, p.monitorId);
          const mon = this.cachedMonitors.find((m) => m.id === p.monitorId);
          if (mon) setScreenResolution(mon.width, mon.height);
          console.log(`[agent] Monitor set to ${p.monitorId} for session ${p.sessionId}`);
          break;
        }
        case "server:screen_privacy": {
          const p = message.payload;
          if (p.enable) {
            this.privacyMode = true;
            enablePrivacyMode().catch((err) => console.error("[agent] privacy enable error:", err.message));
          } else {
            this.privacyMode = false;
            disablePrivacyMode().catch((err) => console.error("[agent] privacy disable error:", err.message));
          }
          break;
        }
        // ── T006: In-session text chat ───────────────────────────────────────
        case "server:screen_chat": {
          const p = message.payload;
          console.log(`\u{1F4AC} [chat] ${p.sender}: ${p.text}`);
          break;
        }
        // ── T004: Consent dialog with AGENT_UNATTENDED env support ────────────
        case "server:screen_control_request": {
          const p = message.payload;
          const unattended = process.env.AGENT_UNATTENDED === "true" || process.env.AGENT_UNATTENDED === "1";
          if (unattended) {
            console.log(`\u{1F510} Control request from "${p.requesterName}" \u2014 auto-granting (AGENT_UNATTENDED=true)`);
            this.send({
              type: "agent:screen_control_granted",
              payload: { sessionId: p.sessionId, requestId: p.requestId },
              timestamp: Date.now()
            });
          } else {
            console.warn(`\u26A0\uFE0F  Control request from "${p.requesterName}"`);
            console.warn(`   Headless agent has no consent dialog.`);
            console.warn(`   Auto-granting in ${CONSENT_TIMEOUT_SEC}s \u2014 set AGENT_UNATTENDED=true to skip the delay.`);
            const { sessionId, requestId } = p;
            setTimeout(() => {
              console.log(`\u{1F510} Auto-granting control to "${p.requesterName}" after timeout`);
              this.send({
                type: "agent:screen_control_granted",
                payload: { sessionId, requestId },
                timestamp: Date.now()
              });
            }, CONSENT_TIMEOUT_SEC * 1e3);
          }
          break;
        }
        case "server:error": {
          const p = message.payload;
          console.error(`\u274C Server error: ${p.message}`);
          break;
        }
        case "server:ping": {
          this.send({ type: "agent:pong", payload: {}, timestamp: Date.now() });
          break;
        }
      }
    } catch (err) {
      console.error("Failed to parse message:", err);
    }
  }
  // ── T002: Chunked write handler ───────────────────────────────────────────
  handleWriteChunk(p) {
    let accum = this.writeChunkBuffers.get(p.opId);
    if (!accum) {
      accum = { chunks: /* @__PURE__ */ new Map(), total: p.total, path: p.path };
      this.writeChunkBuffers.set(p.opId, accum);
    }
    accum.chunks.set(p.seq, Buffer.from(p.data, "base64"));
    if (p.isLast) {
      this.writeChunkBuffers.delete(p.opId);
      const osPath = this.toOsPath(accum.path);
      const parts = [];
      for (let i = 0; i < accum.total; i++) {
        const chunk = accum.chunks.get(i);
        if (chunk) parts.push(chunk);
      }
      const fileData = Buffer.concat(parts);
      const dir = import_path2.default.dirname(osPath);
      import_promises2.default.mkdir(dir, { recursive: true }).then(() => import_promises2.default.writeFile(osPath, fileData)).then(() => {
        console.log(`\u2705 Chunked write done: ${accum.path} (${fileData.length} bytes)`);
        this.send({
          type: "agent:fs_result",
          payload: { opId: p.opId, data: { ok: true, size: fileData.length } },
          timestamp: Date.now()
        });
      }).catch((err) => {
        console.error(`\u274C Chunked write failed: ${err.message}`);
        this.send({
          type: "agent:fs_result",
          payload: { opId: p.opId, error: err.message },
          timestamp: Date.now()
        });
      });
    }
  }
  // ── PTY (Direct Shell) ────────────────────────────────────────────────────
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
        proc = (0, import_child_process5.spawn)("script", scriptArgs, {
          env: { ...env, SHELL: cmd },
          stdio: ["pipe", "pipe", "pipe"],
          shell: false
        });
      } else {
        proc = (0, import_child_process5.spawn)(cmd, args, {
          env,
          stdio: ["pipe", "pipe", "pipe"],
          shell: false,
          windowsHide: false
        });
      }
      this.ptyProcs.set(sessionId, { proc, sessionId, rows, cols, shell: shellHint });
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
  // ── File System (via Agent) ───────────────────────────────────────────────
  async handleFsRequest(p) {
    const { opId, op } = p;
    console.log(`\u{1F4C2} FS request: op=${op} path=${p.path}`);
    const OVERALL_TIMEOUT_MS = 8e3;
    const READDIR_TIMEOUT_MS = 5e3;
    const STAT_TIMEOUT_MS = 2e3;
    const withTimeout2 = (promise, ms, label) => Promise.race([
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
            const entries = await withTimeout2(
              import_promises2.default.readdir(osPath, { withFileTypes: true }),
              READDIR_TIMEOUT_MS,
              `readdir(${osPath})`
            );
            const settled = await Promise.allSettled(entries.map(async (e) => {
              const fullPath = import_path2.default.join(osPath, e.name);
              const webPath = (p.path === "/" ? "" : p.path) + "/" + e.name;
              let size = 0, modified = (/* @__PURE__ */ new Date()).toISOString(), permissions = "---";
              let isDir = e.isDirectory();
              try {
                const stat = await withTimeout2(
                  import_promises2.default.lstat(fullPath),
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
            const buf = await withTimeout2(import_promises2.default.readFile(osPath), OVERALL_TIMEOUT_MS, `readFile(${osPath})`);
            return buf.toString("base64");
          }
          case "read_chunked": {
            const CHUNK = 512 * 1024;
            const buf = await withTimeout2(import_promises2.default.readFile(osPath), 12e4, `readFile_c(${osPath})`);
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
          // ── T002: Incremental write_chunk via fs_request (small-file path) ──
          case "write_chunk": {
            let accum = this.writeChunkBuffers.get(opId);
            if (!accum) {
              accum = { chunks: /* @__PURE__ */ new Map(), total: p.total ?? 1, path: p.path };
              this.writeChunkBuffers.set(opId, accum);
            }
            accum.chunks.set(p.seq ?? 0, Buffer.from(p.data || "", "base64"));
            if (p.isLast) {
              this.writeChunkBuffers.delete(opId);
              const parts = [];
              for (let i = 0; i < accum.total; i++) {
                const c = accum.chunks.get(i);
                if (c) parts.push(c);
              }
              const fileData = Buffer.concat(parts);
              const dir = import_path2.default.dirname(osPath);
              await import_promises2.default.mkdir(dir, { recursive: true });
              await withTimeout2(import_promises2.default.writeFile(osPath, fileData), 6e4, `writeChunked(${osPath})`);
              console.log(`\u2705 write_chunk done: ${p.path} (${fileData.length} bytes)`);
              return { ok: true, size: fileData.length };
            }
            return "__write_chunk_pending__";
          }
          case "write": {
            const dir = import_path2.default.dirname(osPath);
            await import_promises2.default.mkdir(dir, { recursive: true });
            await withTimeout2(
              import_promises2.default.writeFile(osPath, Buffer.from(p.data || "", "base64")),
              OVERALL_TIMEOUT_MS,
              `writeFile(${osPath})`
            );
            return { ok: true };
          }
          case "delete": {
            await withTimeout2(
              import_promises2.default.rm(osPath, { recursive: true, force: true }),
              OVERALL_TIMEOUT_MS,
              `rm(${osPath})`
            );
            return { ok: true };
          }
          case "rename": {
            const newOsPath = this.toOsPath(p.newPath || "");
            await withTimeout2(import_promises2.default.rename(osPath, newOsPath), OVERALL_TIMEOUT_MS, `rename`);
            return { ok: true };
          }
          case "mkdir": {
            await withTimeout2(import_promises2.default.mkdir(osPath, { recursive: true }), OVERALL_TIMEOUT_MS, `mkdir(${osPath})`);
            return { ok: true };
          }
          default:
            throw new Error(`Unknown operation: ${op}`);
        }
      };
      result = await withTimeout2(
        doOp(),
        op === "read_chunked" ? 125e3 : op === "write_chunk" ? 65e3 : OVERALL_TIMEOUT_MS + 1e3,
        `fs:${op}`
      );
      if (result === "__chunked__" || result === "__write_chunk_pending__") return;
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
          import_promises2.default.access(drivePath),
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
  // ── Screen Capture ────────────────────────────────────────────────────────
  // Clears the capture timer without notifying the server — used when restarting
  // capture for quality/monitor changes on the same session.
  clearScreenTimer(sessionId) {
    const timer = this.screenTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.screenTimers.delete(sessionId);
      this.screenSeq.delete(sessionId);
    }
    const stopFfmpeg = this.ffmpegCleanups.get(sessionId);
    if (stopFfmpeg) {
      stopFfmpeg();
      this.ffmpegCleanups.delete(sessionId);
    }
  }
  /**
   * Send a raw binary frame directly over the WebSocket.
   * Packet layout (matches server agentHandler.ts):
   *   [0x01][sessionId:36B UTF-8][width:4B BE][height:4B BE][seq:4B BE][flags:1B][JPEG...]
   * This avoids base64 encoding, saving ~33% bandwidth vs the JSON path.
   */
  sendBinaryFrame(sessionId, jpeg, width, height, seq, flags = 0) {
    if (this.ws?.readyState !== import_ws.default.OPEN) return;
    const hdr = Buffer.allocUnsafe(50);
    hdr[0] = 1;
    const sid = Buffer.from(sessionId.slice(0, 36).padEnd(36, "\0"), "utf8");
    sid.copy(hdr, 1);
    hdr.writeUInt32BE(width, 37);
    hdr.writeUInt32BE(height, 41);
    hdr.writeUInt32BE(seq, 45);
    hdr[49] = flags;
    try {
      this.ws.send(Buffer.concat([hdr, jpeg]));
    } catch {
    }
  }
  handleScreenStart(p) {
    const { sessionId, fps, quality, maxWidth = 1280, monitorId = 0 } = p;
    this.clearScreenTimer(sessionId);
    this.screenMonitorId.set(sessionId, monitorId);
    const mon = this.cachedMonitors.find((m) => m.id === monitorId);
    if (mon) setScreenResolution(mon.width, mon.height);
    const clampedFps = Math.min(fps, 30);
    isFfmpegAvailable().then((ffmpegOk) => {
      if (!this.screenTimers.has(sessionId) && !this.ffmpegCleanups.has(sessionId)) {
        if (!ffmpegOk) {
        } else {
          return;
        }
      }
      if (ffmpegOk) {
        let seq2 = 0;
        const currentMon = this.cachedMonitors.find((m) => m.id === (this.screenMonitorId.get(sessionId) ?? monitorId));
        const stopFfmpeg = startFfmpegCaptureLoop({
          fps: clampedFps,
          quality,
          maxWidth,
          ...currentMon ? { monitorX: currentMon.x, monitorY: currentMon.y, monitorW: currentMon.width, monitorH: currentMon.height } : {},
          onFrame: (jpeg, width, height) => {
            if (!this.screenTimers.has(sessionId)) return;
            if (this.ws?.readyState !== import_ws.default.OPEN) return;
            this.sendBinaryFrame(sessionId, jpeg, width, height, seq2++);
          },
          onError: (err) => console.error("[screen] ffmpeg error:", err.message)
        });
        this.ffmpegCleanups.set(sessionId, stopFfmpeg);
        const sentinel = setInterval(() => {
        }, 2147483647);
        this.screenTimers.set(sessionId, sentinel);
        this.screenSeq.set(sessionId, 0);
        console.log(`\u{1F5A5}\uFE0F  Screen capture started (ffmpeg/binary): sessionId=${sessionId} fps=${clampedFps} quality=${quality} maxWidth=${maxWidth}`);
        return;
      }
      const intervalMs = Math.max(100, Math.round(1e3 / clampedFps));
      let seq = 0;
      let capturing = false;
      const capture = async () => {
        if (!this.screenTimers.has(sessionId)) return;
        if (this.ws?.readyState !== import_ws.default.OPEN) return;
        if (capturing) return;
        capturing = true;
        const currentMonitorId = this.screenMonitorId.get(sessionId) ?? monitorId;
        try {
          const frame = await captureScreen({
            quality,
            maxWidth,
            monitorId: currentMonitorId,
            monitors: this.cachedMonitors.length > 0 ? this.cachedMonitors : void 0
          });
          if (!frame) {
            this.send({
              type: "agent:screen_unavailable",
              payload: { sessionId, message: "No screen capture tool available (Linux: install scrot or imagemagick; ensure DISPLAY is set)" },
              timestamp: Date.now()
            });
            this.stopScreenCapture(sessionId);
            return;
          }
          this.send({
            type: "agent:screen_frame",
            payload: {
              sessionId,
              data: frame.data.toString("base64"),
              width: frame.width,
              height: frame.height,
              seq: seq++,
              keyframe: !frame.deltaRegion,
              quality,
              deltaRegion: frame.deltaRegion
            },
            timestamp: Date.now()
          });
        } catch (err) {
          console.error("[screen] Capture error:", err.message);
          this.send({
            type: "agent:screen_error",
            payload: { sessionId, message: err.message },
            timestamp: Date.now()
          });
          this.stopScreenCapture(sessionId);
        } finally {
          capturing = false;
        }
      };
      capture();
      const timer = setInterval(capture, intervalMs);
      this.screenTimers.set(sessionId, timer);
      this.screenSeq.set(sessionId, 0);
      console.log(`\u{1F5A5}\uFE0F  Screen capture started (PowerShell): sessionId=${sessionId} fps=${clampedFps} quality=${quality} interval=${intervalMs}ms`);
    }).catch((err) => console.error("[screen] handleScreenStart error:", err));
  }
  stopScreenCapture(sessionId) {
    const hadTimer = this.screenTimers.has(sessionId);
    this.clearScreenTimer(sessionId);
    this.screenMonitorId.delete(sessionId);
    if (hadTimer) {
      this.send({
        type: "agent:screen_closed",
        payload: { sessionId },
        timestamp: Date.now()
      });
      console.log(`\u{1F5A5}\uFE0F  Screen capture stopped: sessionId=${sessionId}`);
    }
  }
  // ── Helpers ───────────────────────────────────────────────────────────────
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
          capabilities: {
            pty: true,
            sshAvailable: false,
            screenControl: this.controlAvailable,
            clipboard: true,
            multiMonitor: this.cachedMonitors.length > 1,
            monitors: this.cachedMonitors,
            docker: this.dockerAvailable
          }
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

// src/index.ts
console.log("");
console.log("\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557");
console.log(`\u2551      AiRemote Agent  v${AGENT_VERSION}              \u2551`);
console.log("\u2551      Self-Hosted Remote Access           \u2551");
console.log("\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D");
console.log("");
var serverUrl = process.env.SERVER_URL || "ws://localhost:3001/ws";
var deviceToken = process.env.DEVICE_TOKEN || "";
if (!deviceToken) {
  console.error("\u274C DEVICE_TOKEN is required. Set it in .env file.");
  process.exit(1);
}
console.log(`\u{1F4E1} Server : ${serverUrl}`);
console.log(`\u{1F511} Token  : ${deviceToken.slice(0, 8)}...`);
console.log("");
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
