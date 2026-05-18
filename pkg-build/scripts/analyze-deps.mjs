#!/usr/bin/env node
import { readdirSync, lstatSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, "../..");
const NM_DIR = path.join(PROJECT_ROOT, "node_modules", "openclaw", "node_modules");

// 可安全删除的文件类型/模式（候选）
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
  "scripts", "tools", "build", "scripts",
  "src", "source", "lib", "esm", "cjs", "umd",
  "ts", "typescript", "flow",
  "coverage", ".nyc_output",
  ".github", ".gitignore",
  "CHANGELOG", "HISTORY", "LICENSE", "AUTHORS", "CONTRIBUTORS",
]);

const CANDIDATE_FILES = [
  /^\.git/,
  /^\.eslint/,
  /^\.prettier/,
  /^\.editorconfig/,
  /^\.travis\.yml/,
  /^\.github/,
  /^CHANGELOG/i,
  /^HISTORY/i,
  /^AUTHORS/i,
  /^CONTRIBUTORS/i,
  /^LICENSE/i,
  /^\.DS_Store/,
  /^tsconfig/,
  /^rollup\.config/,
  /^webpack\.config/,
  /^vite\.config/,
  /^babel\.config/,
  /^jest\.config/,
  /^\.babelrc/,
  /^Makefile/,
  /^Gruntfile/,
  /^gulpfile/,
];

const pkgStats = [];

function walk(dir, pkgName, results) {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = lstatSync(fullPath);
    if (stat.isDirectory()) {
      if (CANDIDATE_DIRS.has(entry.toLowerCase())) {
        results.candidateDirs.push(path.relative(path.join(NM_DIR, pkgName), fullPath));
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
      for (const pattern of CANDIDATE_FILES) {
        if (pattern.test(entry)) {
          results.candidateFiles.push(path.relative(path.join(NM_DIR, pkgName), fullPath));
          results.candidateSize += stat.size;
          break;
        }
      }
    }
  }
}

for (const pkgName of readdirSync(NM_DIR)) {
  const pkgDir = path.join(NM_DIR, pkgName);
  const stat = lstatSync(pkgDir);
  if (!stat.isDirectory()) continue;

  const results = {
    name: pkgName,
    totalFiles: 0,
    totalSize: 0,
    candidateSize: 0,
    candidateExts: {},
    candidateDirs: [],
    candidateFiles: [],
  };
  walk(pkgDir, pkgName, results);
  pkgStats.push(results);
}

// 按总文件数排序
pkgStats.sort((a, b) => b.totalFiles - a.totalFiles);

console.log("=== 文件数 Top 20 依赖包 ===");
console.log(`名次 | 包名 | 总文件数 | 总大小(MB) | 候选可删大小(MB) | 候选占比`);
let grandTotal = 0, grandCandidate = 0;
for (let i = 0; i < Math.min(20, pkgStats.length); i++) {
  const p = pkgStats[i];
  grandTotal += p.totalSize;
  grandCandidate += p.candidateSize;
  console.log(
    `${String(i+1).padStart(2)}   | ${p.name.padEnd(30)} | ${String(p.totalFiles).padStart(6)} | ` +
    `${(p.totalSize / 1024 / 1024).toFixed(1).padStart(6)} | ` +
    `${(p.candidateSize / 1024 / 1024).toFixed(1).padStart(6)} | ` +
    `${((p.candidateSize / p.totalSize * 100) || 0).toFixed(0).padStart(3)}%`
  );
}

// 全局统计
for (const p of pkgStats.slice(20)) {
  grandTotal += p.totalSize;
  grandCandidate += p.candidateSize;
}
console.log(`\n全局: 总包数=${pkgStats.length}, 总文件数=${pkgStats.reduce((s,p)=>s+p.totalFiles,0)}, 总大小=${(grandTotal/1024/1024).toFixed(1)}MB, 候选可删=${(grandCandidate/1024/1024).toFixed(1)}MB (${(grandCandidate/grandTotal*100).toFixed(1)}%)`);

// 按候选大小排序，显示详情
console.log("\n=== 候选可删大小 Top 10 包 ===");
const byCandidate = [...pkgStats].sort((a, b) => b.candidateSize - a.candidateSize);
for (let i = 0; i < Math.min(10, byCandidate.length); i++) {
  const p = byCandidate[i];
  console.log(`\n--- ${p.name} (${p.totalFiles} files, ${(p.totalSize/1024/1024).toFixed(1)}MB) ---`);
  if (Object.keys(p.candidateExts).length > 0) {
    console.log("  文件扩展名:", Object.entries(p.candidateExts).map(([k,v])=>`${k}=${v}`).join(", "));
  }
  if (p.candidateDirs.length > 0) {
    console.log("  候选目录:", p.candidateDirs.slice(0, 5).join(", ") + (p.candidateDirs.length > 5 ? `...(+${p.candidateDirs.length-5})` : ""));
  }
  if (p.candidateFiles.length > 0) {
    console.log("  候选文件:", p.candidateFiles.slice(0, 5).join(", ") + (p.candidateFiles.length > 5 ? `...(+${p.candidateFiles.length-5})` : ""));
  }
}

// 按扩展名全局统计
console.log("\n=== 全局候选文件扩展名统计 ===");
const globalExts = {};
for (const p of pkgStats) {
  for (const [ext, count] of Object.entries(p.candidateExts)) {
    globalExts[ext] = (globalExts[ext] || 0) + count;
  }
}
const sortedExts = Object.entries(globalExts).sort((a,b) => b[1]-a[1]);
for (const [ext, count] of sortedExts.slice(0, 15)) {
  console.log(`  ${ext.padEnd(8)}: ${String(count).padStart(5)} files`);
}
