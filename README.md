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

### 构建所有平台
```bash
npm run build:pkg
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
