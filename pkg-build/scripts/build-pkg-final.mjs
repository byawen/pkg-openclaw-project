#!/usr/bin/env node
import { execSync } from "child_process";
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync, readdirSync, statSync, lstatSync, cpSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, "../..");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "dist-pkg");
const LOCAL_CACHE = path.join(PROJECT_ROOT, ".pkg-cache");
const CLAW_DIR = path.join(PROJECT_ROOT, "claw");
const CLAW_CACHE = path.join(PROJECT_ROOT, ".pkg-cache", "claw");

const ALL_TARGETS = [
  { name: "macos-x64", pkg: "node22-macos-x64", output: "openclaw-macos-x64" },
  { name: "macos-arm64", pkg: "node22-macos-arm64", output: "openclaw-macos-arm64" },
  { name: "win-x64", pkg: "node22-win-x64", output: "openclaw-win-x64.exe" },
];

// 解析 --target 参数，支持独立平台打包
const targetArgIndex = process.argv.indexOf("--target");
const requestedTarget = targetArgIndex !== -1 ? process.argv[targetArgIndex + 1] : null;
const TARGETS = requestedTarget
  ? ALL_TARGETS.filter((t) => t.name === requestedTarget)
  : ALL_TARGETS;

if (TARGETS.length === 0) {
  console.error(`Unknown target: "${requestedTarget}". Available: ${ALL_TARGETS.map((t) => t.name).join(", ")}`);
  process.exit(1);
}

if (requestedTarget) {
  console.log(`Single-target build mode: ${requestedTarget}\n`);
}

if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
if (!existsSync(LOCAL_CACHE)) mkdirSync(LOCAL_CACHE, { recursive: true });
// 清空旧 claw tar 包
if (existsSync(CLAW_CACHE)) {
  for (const f of readdirSync(CLAW_CACHE)) {
    if (f.startsWith("claw-part-")) {
      rmSync(path.join(CLAW_CACHE, f), { force: true });
    }
  }
} else {
  mkdirSync(CLAW_CACHE, { recursive: true });
}

// 组装完整缓存目录并打包为 cache.tar（运行时只需一次解压）
const STAGING = path.join(PROJECT_ROOT, "pkg-build", "_cache_staging");
const OPENCLAW_DEST = path.join(STAGING, "node_modules", "openclaw");

if (existsSync(STAGING)) rmSync(STAGING, { recursive: true, force: true });
mkdirSync(OPENCLAW_DEST, { recursive: true });

console.log("Staging cache directory from claw/node_modules/openclaw...");

// 1. 从 claw/node_modules/openclaw 复制完整内容
const srcDir = path.join(CLAW_DIR, "node_modules", "openclaw");
if (existsSync(srcDir)) {
  cpSync(srcDir, OPENCLAW_DEST, { recursive: true, force: true, dereference: true });
} else {
  console.error("ERROR: claw/node_modules/openclaw not found. Run 'cd claw && pnpm install' first.");
  process.exit(1);
}

// 2. 递归复制 openclaw 的所有依赖（从 claw/node_modules 复制）
const openclawNodeModules = path.join(OPENCLAW_DEST, "node_modules");
mkdirSync(openclawNodeModules, { recursive: true });

const copiedDeps = new Set();
function copyDepTree(depName) {
  if (copiedDeps.has(depName)) return;
  copiedDeps.add(depName);

  const depSrc = path.join(CLAW_DIR, "node_modules", depName);
  const depDest = path.join(openclawNodeModules, depName);
  if (!existsSync(depSrc)) return;

  cpSync(depSrc, depDest, { recursive: true, force: true, dereference: true });

  // 递归复制该依赖的子依赖
  const depPkgJsonPath = path.join(depSrc, "package.json");
  if (existsSync(depPkgJsonPath)) {
    try {
      const depPkgJson = JSON.parse(readFileSync(depPkgJsonPath, "utf-8"));
      if (depPkgJson.dependencies) {
        for (const subDep of Object.keys(depPkgJson.dependencies)) {
          copyDepTree(subDep);
        }
      }
    } catch (e) {}
  }
}

const openclawPkgJsonPath = path.join(srcDir, "package.json");
if (existsSync(openclawPkgJsonPath)) {
  const openclawPkgJson = JSON.parse(readFileSync(openclawPkgJsonPath, "utf-8"));
  if (openclawPkgJson.dependencies) {
    for (const depName of Object.keys(openclawPkgJson.dependencies)) {
      copyDepTree(depName);
    }
  }
}

console.log(`Copied ${copiedDeps.size} dependencies into cache.`);

// 4a. 删除各包内部的嵌套 node_modules（依赖已扁平化到顶层，嵌套的是冗余重复）
function removeNestedNodeModules(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = lstatSync(fullPath);
    if (!stat.isDirectory()) continue;
    if (entry === "node_modules") {
      rmSync(fullPath, { recursive: true, force: true });
    } else if (entry !== ".bin") {
      removeNestedNodeModules(fullPath);
    }
  }
}
removeNestedNodeModules(openclawNodeModules);
console.log("Removed nested node_modules directories.");

// ===== 分析各包文件统计（prune 前）=====
(function analyzeStaging() {
  const CANDIDATE_EXTS = new Set([
    ".map", ".d.ts", ".d.cts", ".d.mts", ".d.ts.map",
    ".md", ".markdown", ".txt", ".rst",
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp",
    ".css", ".scss", ".less", ".sass",
    ".html", ".htm",
    ".yml", ".yaml",
  ]);
  const CANDIDATE_DIRS = new Set([
    "test", "tests", "__tests__", "__mocks__",
    "docs", "doc", "documentation",
    "examples", "example", "demos", "demo",
    "benchmark", "benchmarks", "perf",
    "scripts", "tools",
    "src", "source",
    "coverage", ".nyc_output",
    ".github",
    "CHANGELOG", "HISTORY", "AUTHORS", "CONTRIBUTORS",
  ]);
  const CANDIDATE_FILE_PATTERNS = [
    /^\.git/, /^\.eslint/, /^\.prettier/, /^\.editorconfig/,
    /^\.travis\.yml/, /^CHANGELOG/i, /^HISTORY/i,
    /^AUTHORS/i, /^CONTRIBUTORS/i, /^\.DS_Store/,
    /^tsconfig/, /^rollup\.config/, /^webpack\.config/, /^vite\.config/,
    /^babel\.config/, /^jest\.config/, /^\.babelrc/,
    /^Makefile/, /^Gruntfile/, /^gulpfile/,
  ];
  const pkgStats = [];
  function walk(dir, pkgName, results) {
    for (const entry of readdirSync(dir)) {
      const fullPath = path.join(dir, entry);
      const stat = lstatSync(fullPath);
      if (stat.isDirectory()) {
        if (CANDIDATE_DIRS.has(entry.toLowerCase())) {
          results.candidateDirs.push(path.relative(results.root, fullPath));
        }
        walk(fullPath, pkgName, results);
      } else if (stat.isFile()) {
        results.totalFiles++;
        results.totalSize += stat.size;
        const ext = path.extname(entry).toLowerCase();
        if (CANDIDATE_EXTS.has(ext)) {
          results.candidateExts[ext] = (results.candidateExts[ext] || 0) + 1;
          results.candidateSize += stat.size;
        }
        for (const pattern of CANDIDATE_FILE_PATTERNS) {
          if (pattern.test(entry)) {
            results.candidateFiles.push(path.relative(results.root, fullPath));
            results.candidateSize += stat.size;
            break;
          }
        }
      }
    }
  }
  const nmDir = path.join(STAGING, "node_modules", "openclaw", "node_modules");
  if (existsSync(nmDir)) {
    for (const pkgName of readdirSync(nmDir)) {
      const pkgDir = path.join(nmDir, pkgName);
      const s = lstatSync(pkgDir);
      if (!s.isDirectory()) continue;
      const results = { name: pkgName, totalFiles: 0, totalSize: 0, candidateSize: 0, candidateExts: {}, candidateDirs: [], candidateFiles: [], root: pkgDir };
      walk(pkgDir, pkgName, results);
      pkgStats.push(results);
    }
    pkgStats.sort((a, b) => b.totalFiles - a.totalFiles);
    console.log("\n=== 文件数 Top 20 依赖包（prune 前） ===");
    console.log(`#    包名                          | 总文件 | 总大小 | 可删大小 | 占比 | 备注`);
    let grandTotal = 0, grandCandidate = 0;
    for (let i = 0; i < Math.min(20, pkgStats.length); i++) {
      const p = pkgStats[i];
      grandTotal += p.totalSize;
      grandCandidate += p.candidateSize;
      const notes = [];
      if (Object.keys(p.candidateExts).some(e => e === ".map")) notes.push("sourcemap");
      if (p.candidateDirs.length > 0) notes.push("dirs:" + p.candidateDirs.slice(0, 2).join(","));
      if (p.candidateFiles.length > 0) notes.push("files:" + p.candidateFiles.slice(0, 2).join(","));
      console.log(
        `${String(i+1).padStart(2)}   ${p.name.padEnd(30)} | ${String(p.totalFiles).padStart(5)} | ` +
        `${(p.totalSize/1024/1024).toFixed(1).padStart(5)}M | ${(p.candidateSize/1024/1024).toFixed(1).padStart(5)}M | ` +
        `${((p.candidateSize/p.totalSize*100)||0).toFixed(0).padStart(3)}% | ${notes.slice(0,2).join("; ")}`
      );
    }
    for (const p of pkgStats.slice(20)) { grandTotal += p.totalSize; grandCandidate += p.candidateSize; }
    console.log(`\n全局: 包数=${pkgStats.length} 总文件=${pkgStats.reduce((s,p)=>s+p.totalFiles,0)} 总大小=${(grandTotal/1024/1024).toFixed(0)}MB 可删=${(grandCandidate/1024/1024).toFixed(0)}MB(${((grandCandidate/grandTotal*100)||0).toFixed(1)}%)\n`);
    // 可删大小 Top 10 详情（表格形式）
    console.log("\n=== 可删大小 Top 10 详情 ===");
    console.log(`#    包名                          | 总文件 | 总大小 | 可删大小 | 占比 | 备注`);
    const byCandidate = [...pkgStats].sort((a, b) => b.candidateSize - a.candidateSize);
    for (let i = 0; i < Math.min(10, byCandidate.length); i++) {
      const p = byCandidate[i];
      if (p.candidateSize === 0) continue;
      const notes = [];
      if (Object.keys(p.candidateExts).some(e => e === ".map")) notes.push("sourcemap");
      if (p.candidateDirs.length > 0) notes.push("dirs:" + p.candidateDirs.slice(0, 2).join(","));
      if (p.candidateFiles.length > 0) notes.push("files:" + p.candidateFiles.slice(0, 2).join(","));
      console.log(
        `${String(i+1).padStart(2)}   ${p.name.padEnd(30)} | ${String(p.totalFiles).padStart(5)} | ` +
        `${(p.totalSize/1024/1024).toFixed(1).padStart(5)}M | ${(p.candidateSize/1024/1024).toFixed(1).padStart(5)}M | ` +
        `${((p.candidateSize/p.totalSize*100)||0).toFixed(0).padStart(3)}% | ${notes.slice(0,2).join("; ")}`
      );
    }
    console.log("\n")
  }
})();
// ==========================

// 4. 清理符号链接和 .bin 目录（Windows tar 无法处理符号链接）
function cleanSymlinks(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = lstatSync(fullPath);
    if (stat.isSymbolicLink()) {
      rmSync(fullPath);
    } else if (stat.isDirectory()) {
      if (entry === ".bin") {
        rmSync(fullPath, { recursive: true, force: true });
      } else {
        cleanSymlinks(fullPath);
      }
    }
  }
}
cleanSymlinks(STAGING);
console.log("Cleaned symlinks and .bin directories.");

// 5. 排除运行时不需要的文件（tests, docs, source maps, type declarations 等）
const EXCLUDE_DIRS = new Set([
  "test", "tests", "testing", "__tests__", "__mocks__", "__fixtures__",
  "docs", "doc", "documentation", "examples", "example",
  "benchmark", "benchmarks", "perf", "coverage", ".nyc_output",
  "types", ".github", ".circleci", ".travis", "man", "html",
  "jest", "mocha", "karma", "ava", "tap", "build",
]);
const EXCLUDE_EXTS = new Set([
  // 文档 / 文本
  ".md", ".markdown", ".txt", ".rst", ".adoc",
  // TypeScript / source maps / 测试
  ".d.ts", ".d.mts", ".d.cts", ".map", ".ts", ".tsx",
  ".test.js", ".spec.js", ".test.ts", ".spec.ts",
  ".test.mjs", ".spec.mjs", ".test.cjs", ".spec.cjs",
  // 图片
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp", ".bmp", ".tiff",
  // 样式 / 字体
  ".css", ".scss", ".sass", ".less", ".styl", ".pcss",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  // 模板 / 其他源码
  ".pug", ".jade", ".hbs", ".handlebars", ".ejs", ".njk", ".mustache",
  ".coffee", ".litcoffee", ".vue", ".svelte",
  // 脚本
  ".sh", ".bash", ".zsh", ".fish", ".bat", ".cmd", ".ps1", ".vbs",
  // 数据 / 配置
  ".sql", ".csv", ".log", ".pid", ".lock",
  ".yml", ".yaml", ".toml", ".ini", ".conf", ".properties",
  ".flow", ".graphql", ".gql", ".proto",
  // 压缩包
  ".tgz", ".zip", ".rar", ".7z",
]);
const EXCLUDE_NAME_PATTERNS = [
  // 构建配置
  /^gulpfile/, /^Gruntfile/, /^vite\.config/, /^babel\.config/, /^\.babelrc/,
  /^postcss\.config/, /^tailwind\.config/, /^vitest\.config/, /^playwright\.config/,
  /^cypress\.config/, /^karma\.conf/, /^protractor\.conf/,
  /^\.browserslistrc$/, /^\.eslintcache$/, /^\.stylelintrc/, /^\.stylelintignore$/,
  /^\.nvmrc$/, /^\.node-version$/, /^\.npmignore$/, /^\.gitmodules$/, /^\.mailmap$/,
  /^\.flowconfig$/, /^\.tern-project$/, /^\.editorconfig$/, /^\.gitattributes$/,
  // CI / 部署
  /^appveyor\.yml$/, /^\.travis\.yml$/, /^\.zuul\.yml$/, /^\.drone\.yml$/, /^azure-pipelines\.yml$/,
  // 锁文件
  /^yarn\.lock$/, /^package-lock\.json$/, /^pnpm-lock\.yaml$/, /^shrinkwrap\.yaml$/,
  // 其他配置
  /^\.gitignore$/, /^\.eslintrc/, /^\.prettierrc/, /^jest\.config/, /^tsconfig\.json$/,
  /^rollup\.config/, /^webpack\.config/, /^babel\.config/,
  // 文档
  /^CODE_OF_CONDUCT/, /^CONTRIBUTING/, /^FUNDING/, /^SUPPORT/, /^SECURITY/,
  /^CHANGELOG/, /^CHANGES/, /^HISTORY/, /^NEWS/, /^RELEASES/, /^NOTES/,
  /^TODO/, /^FAQ/, /^GUIDE/, /^MANUAL/, /^TUTORIAL/, /^INSTALL/,
  // 许可 / 作者
  /^LICENSE/, /^LICENCE/, /^COPYING/, /^UNLICENSE/, /^PATENTS/, /^CITATION/,
  /^AUTHORS/, /^CONTRIBUTORS/, /^README/,
];
const OPENCLAW_WEB_ASSET_EXTS = new Set([
  ".css", ".scss", ".sass", ".less", ".styl", ".pcss",
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp", ".bmp", ".tiff",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".webmanifest", ".html", ".htm", ".txt",
]);
function shouldExclude(name, inOpenclaw) {
  // openclaw 内保留 .md、.map、类型声明文件、Web UI 静态资源
  if (inOpenclaw) {
    if (path.extname(name) === ".md") return false;
    if (name.endsWith(".map")) return false;
    if (name.endsWith(".d.ts") || name.endsWith(".d.mts") || name.endsWith(".d.cts")) return false;
    if (OPENCLAW_WEB_ASSET_EXTS.has(path.extname(name))) return false;
  }
  for (const pat of EXCLUDE_NAME_PATTERNS) {
    if (pat.test(name)) return true;
  }
  const ext = path.extname(name);
  if (EXCLUDE_EXTS.has(ext)) return true;
  if (name.endsWith(".d.ts") || name.endsWith(".d.mts") || name.endsWith(".d.cts")) return true;
  if (name.endsWith(".map")) return true;
  return false;
}
function pruneDir(dir) {
  const relToStaging = path.relative(STAGING, dir);
  // 只保护 openclaw 自身（不含其 node_modules 下的依赖包）
  const inOpenclaw =
    relToStaging === "node_modules" + path.sep + "openclaw" ||
    (relToStaging.startsWith("node_modules" + path.sep + "openclaw" + path.sep) &&
     !relToStaging.startsWith("node_modules" + path.sep + "openclaw" + path.sep + "node_modules" + path.sep));

  // openclaw 自身不做任何目录裁剪，只删文件级排除项（.map, .d.ts）
  if (inOpenclaw) {
    for (const entry of readdirSync(dir)) {
      const fullPath = path.join(dir, entry);
      const stat = lstatSync(fullPath);
      if (stat.isDirectory()) {
        pruneDir(fullPath);
      } else if (shouldExclude(entry, true)) {
        rmSync(fullPath);
      }
    }
    return;
  }

  // 依赖包极度保守：只删明确是开发/测试/CI 的目录
  const safeDevDirs = new Set(["test", "tests", "testing", "__tests__", "__mocks__", "__fixtures__", "benchmark", "benchmarks", "perf", "coverage", ".nyc_output", ".github", ".circleci", ".travis"]);

  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = lstatSync(fullPath);
    if (stat.isDirectory()) {
      if (safeDevDirs.has(entry) || entry === ".bin") {
        rmSync(fullPath, { recursive: true, force: true });
      } else {
        pruneDir(fullPath);
      }
    } else if (shouldExclude(entry, false)) {
      rmSync(fullPath);
    }
  }
}
pruneDir(STAGING);
console.log("Pruned non-essential files.");

// 5b. 大包激进 prune（这些包文件极多但大量是非必要文件）
function deepPruneLargePkgs(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = lstatSync(fullPath);
    if (!stat.isDirectory()) continue;

    // @aws-sdk：只删除文档，dist-es/dist-types 是发布产物， @smithy：只删除文档
    if (entry.startsWith("@aws-") || entry === "@smithy") {
      for (const sub of readdirSync(fullPath)) {
        const subPath = path.join(fullPath, sub);
        if (!lstatSync(subPath).isDirectory()) continue;
        for (const f of readdirSync(subPath)) {
          const fp = path.join(subPath, f);
          if (f === "README.md" || f === "CHANGELOG.md" || f === "LICENSE" || f === "LICENSE.txt") {
            rmSync(fp);
          }
        }
      }
      continue;
    }
   
    // playwright-core：删除 browsers JSON、trace viewer、非 en locales
    if (entry === "playwright-core") {
      for (const sub of readdirSync(fullPath)) {
        const fp = path.join(fullPath, sub);
        if (sub === "lib" && lstatSync(fp).isDirectory()) {
          // 删除 trace  viewer 和 screenshot 对比相关
          for (const f of readdirSync(fp)) {
            if (f === "trace") rmSync(path.join(fp, f), { recursive: true, force: true });
          }
        }
        if (sub === "browsers.json") rmSync(fp);
      }
      continue;
    }
    // pdfjs-dist：删除 build/ 里非 min 版本
    if (entry === "pdfjs-dist") {
      const buildDir = path.join(fullPath, "build");
      if (existsSync(buildDir) && lstatSync(buildDir).isDirectory()) {
        for (const f of readdirSync(buildDir)) {
          if (f.endsWith(".js") && !f.includes(".min.")) {
            rmSync(path.join(buildDir, f));
          }
        }
      }
      continue;
    }
    // highlight.js：删除 styles/ 里大部分，只保留常用几个
    if (entry === "highlight.js") {
      const stylesDir = path.join(fullPath, "styles");
      if (existsSync(stylesDir) && lstatSync(stylesDir).isDirectory()) {
        const keep = new Set(["default.css", "github.css", "monokai.css", "atom-one-dark.css"]);
        for (const f of readdirSync(stylesDir)) {
          if (!keep.has(f)) rmSync(path.join(stylesDir, f));
        }
      }
      continue;
    }
    // openai：src/ 是 TS 源码，运行时走 lib/
    if (entry === "openai") {
      const srcDir = path.join(fullPath, "src");
      if (existsSync(srcDir)) rmSync(srcDir, { recursive: true, force: true });
      continue;
    }
    // zod：src/ 是 TS 源码
    if (entry === "zod") {
      const srcDir = path.join(fullPath, "src");
      if (existsSync(srcDir)) rmSync(srcDir, { recursive: true, force: true });
      continue;
    }
    // @anthropic-ai：sdk/src/ 和 vertex-sdk/src/ 是 TS 源码
    if (entry === "@anthropic-ai") {
      for (const sub of ["sdk", "vertex-sdk"]) {
        const srcDir = path.join(fullPath, sub, "src");
        if (existsSync(srcDir)) rmSync(srcDir, { recursive: true, force: true });
      }
      continue;
    }
    // @mistralai：packages/*/src/ 是 TS 源码
    if (entry === "@mistralai") {
      const pkgDir = path.join(fullPath, "packages");
      if (existsSync(pkgDir) && lstatSync(pkgDir).isDirectory()) {
        for (const sub of readdirSync(pkgDir)) {
          const srcDir = path.join(pkgDir, sub, "src");
          if (existsSync(srcDir)) rmSync(srcDir, { recursive: true, force: true });
        }
      }
      continue;
    }
    // protobufjs / bottleneck / undici：src/ 和 scripts/ 是源码/构建脚本
    if (entry === "protobufjs" || entry === "bottleneck" || entry === "undici") {
      for (const d of ["src", "scripts"]) {
        const dPath = path.join(fullPath, d);
        if (existsSync(dPath)) rmSync(dPath, { recursive: true, force: true });
      }
      continue;
    }

    deepPruneLargePkgs(fullPath);
  }
}
deepPruneLargePkgs(openclawNodeModules);
console.log("Deep-pruned large packages.");

// 5c. 计算 openclaw 自身文件 hash（不含 node_modules），生成 version.json
function computeOpenclawHash(dir) {
  const hash = createHash("sha256");
  const files = [];
  function walk(d) {
    for (const entry of readdirSync(d)) {
      if (entry === "node_modules") continue;
      const fullPath = path.join(d, entry);
      const stat = lstatSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else {
        files.push({ fullPath, relPath: path.relative(dir, fullPath) });
      }
    }
  }
  walk(dir);
  files.sort((a, b) => a.relPath.localeCompare(b.relPath));
  for (const f of files) {
    hash.update(f.relPath + "\n");
    hash.update(readFileSync(f.fullPath));
    hash.update("\n");
  }
  return hash.digest("hex");
}
const openclawHash = computeOpenclawHash(OPENCLAW_DEST);
const versionData = { hash: openclawHash, builtAt: new Date().toISOString() };
const versionJsonPath = path.join(CLAW_CACHE, "version.json");
writeFileSync(versionJsonPath, JSON.stringify(versionData, null, 2));
console.log(`version.json written: hash=${openclawHash.substring(0, 16)}...`);

// 6. 分卷打包：openclaw 拆 main+dist 两个 part，deps 按体积贪心均衡分 4 组
const nmDir = path.join(STAGING, "node_modules", "openclaw", "node_modules");

// openclaw main part（代码 + 配置 + 文档）
const mainEntries = [
  "node_modules/openclaw/openclaw.mjs",
  "node_modules/openclaw/package.json",
  "node_modules/openclaw/scripts",
  "node_modules/openclaw/patches",
  "node_modules/openclaw/skills",
  "node_modules/openclaw/docs",
];
const mainPart = path.join(CLAW_CACHE, "claw-part-openclaw-main.tar");
console.log("Packing claw-part-openclaw-main.tar (openclaw main)...");
execSync(`tar -cf ${mainPart} ${mainEntries.map(e => `"${e}"`).join(" ")}`, {
  cwd: STAGING,
  stdio: "inherit",
});

// openclaw dist part（Web UI 构建产物，体积最大）
const distEntries = ["node_modules/openclaw/dist"];
const distPart = path.join(CLAW_CACHE, "claw-part-openclaw-dist.tar");
console.log("Packing claw-part-openclaw-dist.tar (openclaw dist)...");
execSync(`tar -cf ${distPart} ${distEntries.map(e => `"${e}"`).join(" ")}`, {
  cwd: STAGING,
  stdio: "inherit",
});

// deps 按体积贪心均衡分成 4 组
function getDirSize(dir) {
  let size = 0;
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = lstatSync(fullPath);
    if (stat.isDirectory()) {
      size += getDirSize(fullPath);
    } else {
      size += stat.size;
    }
  }
  return size;
}
const pkgList = [];
for (const pkgName of readdirSync(nmDir)) {
  const pkgPath = path.join(nmDir, pkgName);
  if (lstatSync(pkgPath).isDirectory()) {
    pkgList.push({
      name: pkgName,
      path: `node_modules/openclaw/node_modules/${pkgName}`,
      size: getDirSize(pkgPath),
    });
  }
}
pkgList.sort((a, b) => b.size - a.size); // 从大到小

const groups = [
  { key: "a", pkgs: [], total: 0 },
  { key: "h", pkgs: [], total: 0 },
  { key: "o", pkgs: [], total: 0 },
  { key: "v", pkgs: [], total: 0 },
];
for (const pkg of pkgList) {
  // 放到当前总大小最小的组
  const minGroup = groups.reduce((min, g) => (g.total < min.total ? g : min), groups[0]);
  minGroup.pkgs.push(pkg.path);
  minGroup.total += pkg.size;
}

for (const g of groups) {
  const partTar = path.join(CLAW_CACHE, `claw-part-${g.key}.tar`);
  const sizeMb = (g.total / 1024 / 1024).toFixed(1);
  console.log(`Packing ${path.basename(partTar)} (${g.pkgs.length} deps, ~${sizeMb} MB)...`);
  execSync(`tar -cf ${partTar} ${g.pkgs.map(e => `"${e}"`).join(" ")}`, {
    cwd: STAGING,
    stdio: "inherit",
  });
}
// ===== 分析各包文件统计 =====
(function analyzeStaging() {
  const CANDIDATE_EXTS = new Set([
    ".map", ".d.ts", ".d.cts", ".d.mts", ".d.ts.map",
    ".md", ".markdown", ".txt", ".rst",
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp",
    ".css", ".scss", ".less", ".sass",
    ".html", ".htm",
    ".yml", ".yaml",
  ]);
  const CANDIDATE_DIRS = new Set([
    "test", "tests", "__tests__", "__mocks__",
    "docs", "doc", "documentation",
    "examples", "example", "demos", "demo",
    "benchmark", "benchmarks", "perf",
    "scripts", "tools", "build",
    "src", "source", "lib", "esm", "cjs", "umd",
    "ts", "typescript", "flow",
    "coverage", ".nyc_output",
    ".github", ".gitignore",
    "CHANGELOG", "HISTORY", "LICENSE", "AUTHORS", "CONTRIBUTORS",
  ]);
  const CANDIDATE_FILE_PATTERNS = [
    /^\.git/, /^\.eslint/, /^\.prettier/, /^\.editorconfig/,
    /^\.travis\.yml/, /^\.github/, /^CHANGELOG/i, /^HISTORY/i,
    /^AUTHORS/i, /^CONTRIBUTORS/i, /^LICENSE/i, /^\.DS_Store/,
    /^tsconfig/, /^rollup\.config/, /^webpack\.config/, /^vite\.config/,
    /^babel\.config/, /^jest\.config/, /^\.babelrc/,
    /^Makefile/, /^Gruntfile/, /^gulpfile/,
  ];
  const pkgStats = [];
  function walk(dir, pkgName, results) {
    for (const entry of readdirSync(dir)) {
      const fullPath = path.join(dir, entry);
      const stat = lstatSync(fullPath);
      if (stat.isDirectory()) {
        if (CANDIDATE_DIRS.has(entry.toLowerCase())) {
          results.candidateDirs.push(path.relative(results.root, fullPath));
        }
        walk(fullPath, pkgName, results);
      } else if (stat.isFile()) {
        results.totalFiles++;
        results.totalSize += stat.size;
        const ext = path.extname(entry).toLowerCase();
        if (CANDIDATE_EXTS.has(ext)) {
          results.candidateExts[ext] = (results.candidateExts[ext] || 0) + 1;
          results.candidateSize += stat.size;
        }
        for (const pattern of CANDIDATE_FILE_PATTERNS) {
          if (pattern.test(entry)) {
            results.candidateFiles.push(path.relative(results.root, fullPath));
            results.candidateSize += stat.size;
            break;
          }
        }
      }
    }
  }
  const nmDir = path.join(STAGING, "node_modules", "openclaw", "node_modules");
  if (existsSync(nmDir)) {
    for (const pkgName of readdirSync(nmDir)) {
      const pkgDir = path.join(nmDir, pkgName);
      const s = lstatSync(pkgDir);
      if (!s.isDirectory()) continue;
      const results = { name: pkgName, totalFiles: 0, totalSize: 0, candidateSize: 0, candidateExts: {}, candidateDirs: [], candidateFiles: [], root: pkgDir };
      walk(pkgDir, pkgName, results);
      pkgStats.push(results);
    }
    pkgStats.sort((a, b) => b.totalFiles - a.totalFiles);
    console.log("\n=== 文件数 Top 20 依赖包 ===");
    console.log(`#    包名                          | 总文件 | 总大小 | 可删大小 | 占比 | 备注`);
    let grandTotal = 0, grandCandidate = 0;
    for (let i = 0; i < Math.min(20, pkgStats.length); i++) {
      const p = pkgStats[i];
      grandTotal += p.totalSize;
      grandCandidate += p.candidateSize;
      const notes = [];
      if (Object.keys(p.candidateExts).some(e => e === ".map")) notes.push("sourcemap");
      if (p.candidateDirs.length > 0) notes.push("dirs:" + p.candidateDirs.slice(0, 3).join(","));
      console.log(
        `${String(i+1).padStart(2)}   ${p.name.padEnd(30)} | ${String(p.totalFiles).padStart(5)} | ` +
        `${(p.totalSize/1024/1024).toFixed(1).padStart(5)}M | ${(p.candidateSize/1024/1024).toFixed(1).padStart(5)}M | ` +
        `${((p.candidateSize/p.totalSize*100)||0).toFixed(0).padStart(3)}% | ${notes.slice(0,2).join("; ")}`
      );
    }
    for (const p of pkgStats.slice(20)) { grandTotal += p.totalSize; grandCandidate += p.candidateSize; }
    console.log(`\n全局: 包数=${pkgStats.length} 总文件=${pkgStats.reduce((s,p)=>s+p.totalFiles,0)} 总大小=${(grandTotal/1024/1024).toFixed(0)}MB 可删=${(grandCandidate/1024/1024).toFixed(0)}MB(${((grandCandidate/grandTotal*100)||0).toFixed(1)}%)\n`);
  }
})();
// ==========================

rmSync(STAGING, { recursive: true, force: true });
console.log("Cache parts created.\n");

const rootPkgJsonPath = path.join(PROJECT_ROOT, "package.json");
const pkgJsonBackup = path.join(PROJECT_ROOT, "package.json.build-backup");

// 备份并修改 package.json（删除 dependencies 防止 pkg 打包整个 node_modules）
const originalPkgJson = readFileSync(rootPkgJsonPath, "utf-8");
writeFileSync(pkgJsonBackup, originalPkgJson);

const pkgJson = JSON.parse(originalPkgJson);
// 保留 tar 用于 Windows 解压，删除其他依赖减小二进制
const tarVer = pkgJson.dependencies?.tar;
pkgJson.dependencies = tarVer ? { tar: tarVer } : undefined;
// 更新 assets：分卷 tar（pkg 支持 glob）
const baseAssets = new Set(pkgJson.pkg.assets);
baseAssets.add(".pkg-cache/claw/claw-part-*.tar"); // 分卷
baseAssets.add(".pkg-cache/claw/version.json"); // 版本文件
pkgJson.pkg.assets = Array.from(baseAssets);
// 清理 devDependencies 中的 7zip-bin
if (pkgJson.devDependencies && pkgJson.devDependencies["7zip-bin"]) {
  delete pkgJson.devDependencies["7zip-bin"];
}
// 清理 devDependencies 中的 esbuild
if (pkgJson.devDependencies && pkgJson.devDependencies["esbuild"]) {
  delete pkgJson.devDependencies["esbuild"];
}
// 清理 devDependencies 中的 @yao-pkg/pkg
if (pkgJson.devDependencies && pkgJson.devDependencies["@yao-pkg/pkg"]) {
  delete pkgJson.devDependencies["@yao-pkg/pkg"];
}
writeFileSync(rootPkgJsonPath, JSON.stringify(pkgJson, null, 2));

console.log("Building OpenClaw binaries...\n");

let hasError = false;
for (const target of TARGETS) {
  console.log(`Building for ${target.name}...`);
  try {
    const outputPath = path.join(OUTPUT_DIR, target.output);
    const command = `pkg -c package.json pkg-build/config/main-pkg-extract.cjs --target ${target.pkg} --output ${outputPath} --fallback-to-source`;
    console.log(`  ${command}`);

    execSync(command, {
      stdio: "inherit",
      cwd: PROJECT_ROOT,
      timeout: 600000,
      env: { ...process.env, PKG_CACHE_PATH: LOCAL_CACHE },
    });

    if (existsSync(outputPath)) {
      const stats = readFileSync(outputPath).length;
      const sizeInMB = (stats / 1024 / 1024).toFixed(1);
      console.log(`  Built: ${target.output} (${sizeInMB}MB)\n`);
    }
  } catch (error) {
    console.error(`  Failed: ${target.name}`);
    hasError = true;
    break;
  }
}

// 恢复 package.json
writeFileSync(rootPkgJsonPath, originalPkgJson);
rmSync(pkgJsonBackup);

if (hasError) {
  console.error("\nBuild failed!");
  process.exit(1);
}

console.log("\nBuild complete!");
console.log(`Output: ${OUTPUT_DIR}`);
