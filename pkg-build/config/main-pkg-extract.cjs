const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const os = require("os");

const isPkgBinary = typeof process.pkg !== "undefined";

// 禁用 respawn
process.env.OPENCLAW_SOURCE_COMPILE_CACHE_RESPAWNED = "1";
process.env.OPENCLAW_PACKAGED_COMPILE_CACHE_RESPAWNED = "1";

function getProjectRoot() {
  return path.join(__dirname, "..", "..");
}

const projectRoot = getProjectRoot();
// 检测分卷 tar（claw-part-*.tar），兼容单卷 cache.tar
function discoverCacheParts() {
  const parts = [];
  const clawDir = path.join(projectRoot, ".pkg-cache", "claw");
  try {
    for (const f of fs.readdirSync(clawDir)) {
      if (/^claw-part-(.+?)\.tar$/.test(f)) {
        parts.push(path.join(clawDir, f));
      }
    }
    parts.sort();
  } catch (e) {}
  if (parts.length > 0) return parts;
  // 兼容旧路径
  const legacyDir = path.join(projectRoot, ".pkg-cache");
  const legacy = path.join(legacyDir, "cache.tar");
  if (fs.existsSync(legacy)) return [legacy];
  console.error("[pkg] Missing .pkg-cache/claw/claw-part-*.tar or cache.tar");
  process.exit(1);
}
const cacheTarParts = discoverCacheParts();
console.error(`[pkg] Found ${cacheTarParts.length} cache part(s):`, cacheTarParts.map(p => path.basename(p)));

// 解析参数
let cacheDir = null;
let configPath = null;
let stateDir = null;
const userArgs = [];
const rawArgs = process.argv.slice(2);

for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i] === "--pkg-cache-dir") {
    cacheDir = rawArgs[i + 1];
    i++;
  } else if (rawArgs[i].startsWith("--pkg-cache-dir=")) {
    cacheDir = rawArgs[i].split("=")[1];
  } else if (rawArgs[i] === "--config") {
    configPath = rawArgs[i + 1];
    i++;
  } else if (rawArgs[i].startsWith("--config=")) {
    configPath = rawArgs[i].split("=")[1];
  } else if (rawArgs[i] === "--state-dir") {
    stateDir = rawArgs[i + 1];
    i++;
  } else if (rawArgs[i].startsWith("--state-dir=")) {
    stateDir = rawArgs[i].split("=")[1];
  } else {
    userArgs.push(rawArgs[i]);
  }
}

const execDir = path.dirname(process.execPath);
if (!cacheDir) {
  if (isPkgBinary) {
    cacheDir = path.join(execDir, "claw-pkg-cache");
  } else {
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-pkg-"));
  }
}

if (!configPath) {
  configPath = path.join(execDir, "openclaw.json");
}

if (!stateDir) {
  stateDir = path.join(execDir, ".openclaw-state");
}

const openclawDest = path.join(cacheDir, "node_modules", "openclaw");

// 读取二进制内 snapshot 的 version.json
const versionSnapshotPath = path.join(projectRoot, ".pkg-cache", "claw", "version.json");
let snapshotVersion = null;
try {
  const raw = fs.readFileSync(versionSnapshotPath, "utf-8");
  snapshotVersion = JSON.parse(raw);
} catch (e) {
  console.error("[pkg] version.json not found in snapshot, falling back to binary mtime");
}

// 检查缓存是否可用
let useCache = false;
if (isPkgBinary && snapshotVersion) {
  const versionFile = path.join(cacheDir, "version.json");

  if (
    fs.existsSync(versionFile) &&
    fs.existsSync(path.join(openclawDest, "openclaw.mjs"))
  ) {
    try {
      const cachedVersion = JSON.parse(fs.readFileSync(versionFile, "utf-8"));
      if (cachedVersion.hash === snapshotVersion.hash) {
        useCache = true;
        console.error("[pkg] Using cached runtime (hash match):", cacheDir);
      } else {
        console.error("[pkg] Cache hash mismatch, will rebuild");
        console.error("[pkg]   Cached:", cachedVersion.hash.substring(0, 16) + "...");
        console.error("[pkg]   Snapshot:", snapshotVersion.hash.substring(0, 16) + "...");
      }
    } catch (e) {
      console.error("[pkg] Invalid cache version.json, will rebuild");
    }
  }
} else if (isPkgBinary) {
  // fallback: 用 binary mtime 作为版本号
  const binaryStat = fs.statSync(process.execPath);
  const cacheVersion = String(binaryStat.mtimeMs);
  const versionFile = path.join(cacheDir, ".version");
  if (
    fs.existsSync(versionFile) &&
    fs.existsSync(path.join(openclawDest, "openclaw.mjs"))
  ) {
    const cachedVersion = fs.readFileSync(versionFile, "utf-8").trim();
    if (cachedVersion === cacheVersion) {
      useCache = true;
      console.error("[pkg] Using cached runtime (mtime fallback):", cacheDir);
    }
  }
}

(async function main() {
  if (!useCache) {
    if (fs.existsSync(cacheDir) && isPkgBinary) {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    }
    fs.mkdirSync(cacheDir, { recursive: true });

    console.error("[pkg] Extracting to:", cacheDir);
    const startTime = Date.now();

    try {
      const isWin = process.platform === "win32";

      // Windows: npm tar 直读 snapshot，串行解压避免并发锁竞争
      // macOS/Linux: system tar（外部进程无法读 snapshot，需 tmp 复制）
      if (isWin) {
        console.error("[pkg] Using npm-tar for", cacheTarParts.length, "part(s)");
        const tar = require("tar");
        // 并发解压：dist part 和 deps part 路径不重叠，无锁竞争
        await Promise.all(cacheTarParts.map(src => tar.x({ cwd: cacheDir, file: src, preserveOwner: false, onwarn: () => {} })));
      } else {
        console.error("[pkg] Using system-tar for", cacheTarParts.length, "part(s)");
        const tmpTars = [];
        for (const src of cacheTarParts) {
          const tmp = path.join(os.tmpdir(), `openclaw-${path.basename(src)}`);
          fs.copyFileSync(src, tmp);
          tmpTars.push(tmp);
        }
        for (const t of tmpTars) {
          await new Promise((resolve, reject) => {
            // tar 是未压缩的，用 -xf（不是 -xzf）
            const child = spawn("tar", ["-xf", t, "-C", cacheDir], { stdio: "inherit" });
            child.on("exit", (code) => {
              if (code === 0) resolve();
              else reject(new Error(`tar exited with code ${code}`));
            });
            child.on("error", reject);
          });
        }
        for (const t of tmpTars) try { fs.unlinkSync(t); } catch (e) {}
      }

      if (snapshotVersion) {
        fs.writeFileSync(path.join(cacheDir, "version.json"), JSON.stringify(snapshotVersion, null, 2));
      } else if (isPkgBinary) {
        const binaryStat = fs.statSync(process.execPath);
        fs.writeFileSync(path.join(cacheDir, ".version"), String(binaryStat.mtimeMs));
      }

      console.error("[pkg] Extraction complete in", Date.now() - startTime, "ms");
    } catch (err) {
      console.error("[pkg] Extraction failed:", err);
      process.exit(1);
    }
  }

  // 更新环境变量
  process.env.OPENCLAW_CONFIG_PATH = configPath;
  process.env.OPENCLAW_STATE_DIR = stateDir;

  const openclawPath = path.join(openclawDest, "openclaw.mjs");
  const args = [openclawPath, ...userArgs];

  // 找到系统 Node.js
  function findSystemNode() {
    if (process.platform === "win32") {
      const pf = process.env.ProgramFiles || "C:\\Program Files";
      const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
      const localAppData = process.env.LOCALAPPDATA || "";
      const candidates = [
        path.join(pf, "nodejs", "node.exe"),
        path.join(pf86, "nodejs", "node.exe"),
      ];
      if (localAppData) {
        candidates.push(path.join(localAppData, "Microsoft", "WinGet", "Packages", "OpenJS.NodeJS_Microsoft.Winget.Source_8wekyb3d8bbwe", "node.exe"));
      }
      for (const c of candidates) {
        if (fs.existsSync(c)) return c;
      }
      // 通过 where 查找
      try {
        const result = spawnSync("where", ["node"], { encoding: "utf8" });
        if (result.status === 0) {
          const lines = result.stdout.trim().split(/\r?\n/);
          for (const line of lines) {
            const p = line.trim();
            if (p && fs.existsSync(p)) return p;
          }
        }
      } catch (e) {}
      return "node";
    }
    const candidates = [
      "/usr/local/bin/node",
      "/opt/homebrew/bin/node",
      "/usr/bin/node",
      "/bin/node",
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    try {
      const result = spawnSync("which", ["node"], { encoding: "utf8" });
      if (result.status === 0) {
        const p = result.stdout.trim();
        if (p && fs.existsSync(p)) return p;
      }
    } catch (e) {}
    return "node";
  }

  const nodePath = findSystemNode();
  console.error("[pkg] Using node:", nodePath);
  console.error("[pkg] Spawning with args:", args);
  console.error("[pkg] CWD:", process.cwd());

  // 验证入口文件存在
  if (!fs.existsSync(openclawPath)) {
    console.error("[pkg] FATAL: openclaw.mjs not found:", openclawPath);
    process.exit(1);
  }

  const spawnStart = Date.now();
  const child = spawn(nodePath, args, {
    stdio: ["inherit", "pipe", "pipe"],
    env: process.env,
  });

  let stdoutBuf = "";
  let stderrBuf = "";

  child.stdout.on("data", (d) => {
    stdoutBuf += d;
    process.stdout.write(d);
  });

  child.stderr.on("data", (d) => {
    stderrBuf += d;
    process.stderr.write(d);
  });

  child.on("error", (err) => {
    console.error("[pkg] Failed to spawn node:", err);
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    const elapsed = Date.now() - spawnStart;
    if (elapsed < 3000) {
      console.error(`[pkg] WARNING: Child exited very quickly (${elapsed}ms). This usually means openclaw.mjs crashed on startup.`);
    }
    if (signal) {
      console.error("[pkg] Child exited with signal:", signal);
      process.exit(1);
    }
    console.error("[pkg] Child exited with code:", code);
    process.exit(code ?? 0);
  });
})();
