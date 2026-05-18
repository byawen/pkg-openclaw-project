import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 解析启动参数
let configPath = null;
let stateDir = null;
let cacheDir = null;
const remainingArgs = [];

for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === "--config" && process.argv[i + 1]) {
    configPath = process.argv[i + 1];
    i++;
  } else if (arg.startsWith("--config=")) {
    configPath = arg.split("=")[1];
  } else if (arg === "--state-dir" && process.argv[i + 1]) {
    stateDir = process.argv[i + 1];
    i++;
  } else if (arg.startsWith("--state-dir=")) {
    stateDir = arg.split("=")[1];
  } else if (arg === "--pkg-cache-dir" && process.argv[i + 1]) {
    cacheDir = process.argv[i + 1];
    i++;
  } else if (arg.startsWith("--pkg-cache-dir=")) {
    cacheDir = arg.split("=")[1];
  } else {
    remainingArgs.push(arg);
  }
}

// 默认使用项目目录
if (!configPath) {
  configPath = path.join(__dirname, "openclaw.json");
}
if (!stateDir) {
  stateDir = path.join(__dirname, ".openclaw-state");
}

let execPath = process.execPath;
let execArgs = [];

// 只使用 dist-pkg 编译产物
const platMap = { darwin: "macos", linux: "linux", win32: "win" };
const archMap = { arm64: "arm64", x64: "x64" };
const platformTag = `${platMap[process.platform] ?? process.platform}-${archMap[process.arch] ?? process.arch}`;
const binaryName = process.platform === "win32" ? "openclaw-win-x64.exe" : `openclaw-${platformTag}`;
const binaryPath = path.join(__dirname, "dist-pkg", binaryName);

if (existsSync(binaryPath)) {
  execPath = binaryPath;
  const forwardedArgs = [];
  if (configPath) forwardedArgs.push(`--config=${configPath}`);
  if (stateDir) forwardedArgs.push(`--state-dir=${stateDir}`);
  if (cacheDir) forwardedArgs.push(`--pkg-cache-dir=${cacheDir}`);
  execArgs = ["gateway", "run", ...forwardedArgs, ...remainingArgs];
  console.log(`Using pkg binary: ${binaryPath}`);
} else {
  console.error(`Error: dist-pkg binary not found: ${binaryPath}`);
  console.error("Run 'pnpm run build:pkg' first.");
  process.exit(1);
}

let child;

const env = { ...process.env };

console.log(`Using OpenClaw path: ${execPath}`);
console.log(`Config path: ${configPath}`);
console.log(`State dir: ${stateDir}`);
console.log("");

console.log(`Executing: ${execPath} ${execArgs.join(" ")}`);
console.log("");

child = spawn(execPath, execArgs, {
  stdio: "inherit",
  env,
});

let shuttingDown = false;
let hasStarted = false;

const stopChild = (signal = "SIGTERM") => {
  if (shuttingDown || child.killed) {
    return;
  }

  shuttingDown = true;

  try {
    child.kill(signal);
  } catch {
    // Ignore kill errors during shutdown.
  }
};

console.log(`Starting OpenClaw with config=${configPath}`);

// 添加启动成功提示
const startupTimer = setTimeout(() => {
  if (!child.killed && !hasStarted) {
    hasStarted = true;
    console.log("\n✅ OpenClaw Gateway started successfully");
    console.log(`📝 Config: ${configPath}`);
    console.log(`📂 State: ${stateDir}`);
    console.log("\n💡 Press Ctrl+C to stop the gateway\n");
  }
}, 3000);

child.on("exit", (code, signal) => {
  clearTimeout(startupTimer);
  shuttingDown = true;

  if (!hasStarted) {
    console.error(`\n❌ OpenClaw Gateway exited with code ${code}`);
    if (signal) {
      console.error(`Signal: ${signal}`);
    }
  }

  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on("error", (error) => {
  clearTimeout(startupTimer);
  console.error("Failed to start OpenClaw:", error);
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"]) {
  process.on(signal, () => {
    stopChild(signal);
  });
}

process.on("exit", () => {
  stopChild();
});

process.on("uncaughtException", (error) => {
  console.error(error);
  stopChild();
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error(reason);
  stopChild();
  process.exit(1);
});
