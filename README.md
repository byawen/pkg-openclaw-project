# 快速开始指南

## 🚀 启动 OpenClaw Gateway

### 方式 1: 使用 npm 脚本（推荐）
```bash
npm run dev
# 或
npm start
```

### 方式 2: 直接运行 Node.js
```bash
node main.js

# 指定配置文件和缓存目录
node main.js --config openclaw.json --state-dir .openclaw-state --pkg-cache-dir /path/to/cache
```

### 方式 3: 使用二进制文件
```bash
# macOS arm64
./dist-pkg/openclaw-macos-arm64 gateway run

# macOS x64
./dist-pkg/openclaw-macos-x64 gateway run

# Windows x64
.\dist-pkg\openclaw-win-x64.exe gateway run
```

## 📦 构建二进制文件

### 安装 OpenClaw 依赖
OpenClaw 依赖隔离在 `claw/` 目录下，构建前需先安装：
```bash
pnpm run install:claw
```

### 构建所有平台
```bash
pnpm run build:pkg
```

### 构建单个平台
```bash
npm run build:pkg:macos-arm64
npm run build:pkg:macos-x64
npm run build:pkg:win-x64
```

## 🔍 常用命令

### 查看帮助
```bash
./dist-pkg/openclaw-macos-arm64 --help
```

### 查看版本
```bash
./dist-pkg/openclaw-macos-arm64 --version
```

### 启用开发模式
```bash
./dist-pkg/openclaw-macos-arm64 --dev gateway run
```

### 设置日志级别
```bash
./dist-pkg/openclaw-macos-arm64 --log-level debug gateway run
```

### 指定缓存目录
```bash
# 二进制直接启动
./dist-pkg/openclaw-macos-arm64 gateway run --pkg-cache-dir=/path/to/cache

# 通过 main.js 启动
node main.js --pkg-cache-dir=/path/to/cache
```

## 🔄 缓存机制

二进制首次运行时会将 OpenClaw 运行时解压到缓存目录（默认 `dist-pkg/openclaw-pkg-cache`）。

- 通过 `version.json` 中的 hash 值判断缓存是否有效
- 当二进制内容更新、hash 变化时，自动删除旧缓存并重新解压
- 相同源代码多次打包 hash 一致，缓存可复用
- 多卷 tar 并行解压，Windows/macOS 均支持

## 📊 Gateway 信息

启动成功后，Gateway 会输出：

```
✅ OpenClaw Gateway started successfully
📝 Config: /path/to/openclaw.json
📂 State: /path/to/.openclaw-state

💡 Press Ctrl+C to stop the gateway
```

### 访问 Gateway

- **Gateway API**: http://127.0.0.1:19002
- **Browser Control**: http://127.0.0.1:19004
- **日志文件**: /tmp/openclaw/openclaw-YYYY-MM-DD.log

## 🛑 停止 Gateway

按 `Ctrl+C` 停止 Gateway

## 📁 重要文件

| 文件 | 说明 |
|------|------|
| `main.js` | 开发启动脚本 |
| `openclaw.json` | Gateway 配置文件 |
| `.openclaw-state/` | Gateway 状态目录 |
| `dist-pkg/` | 二进制文件输出目录 |
| `claw/` | OpenClaw 独立依赖目录（含 `package.json` 和 `node_modules`） |
| `.pkg-cache/claw/` | 分卷 tar 和 `version.json` 缓存 |
| `version.json` | 记录 OpenClaw 源码 hash，用于运行时缓存校验 |

## ⚙️ 配置

编辑 `openclaw.json` 来配置 Gateway：

```json
{
  "gateway": {
    "mode": "local",
    "port": 19002,
    "auth": {
      "mode": "token",
      "token": "your-token-here"
    }
  }
}
```

## 🐛 故障排除

### Gateway 启动失败
1. 检查 `openclaw.json` 是否存在
2. 检查 `.openclaw-state/` 目录权限
3. 查看日志文件：`/tmp/openclaw/openclaw-*.log`

### 端口被占用
修改 `openclaw.json` 中的 `gateway.port` 值

### 找不到配置文件
确保 `openclaw.json` 在项目根目录

## 📞 更多帮助

```bash
./dist-pkg/openclaw-macos-arm64 gateway --help
./dist-pkg/openclaw-macos-arm64 --help
```
