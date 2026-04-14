# MiniBrain Remote

> 跨模型记忆连接器 - 远程 MCP 服务器版本

[English](./README.md) | 简体中文

[![npm version](https://img.shields.io/badge/version-0.2.0-blue.svg)](https://github.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 🎯 核心定位

**MiniBrain Remote 是支持远程连接的 MCP 服务器版本。**

换模型不丢记忆，不同 AI 共享同一份上下文。

```
Claude ──MCP──► MiniBrain Remote ◄──MCP── GPT-4
                    │  (HTTP/SSE)
                    ▼
              VPS 服务器
```

---

## ✨ 特性

| 特性 | 说明 |
|------|------|
| **MCP Native** | 严格遵循 Model Context Protocol |
| **远程传输** | 支持 HTTP/SSE 传输，跨设备访问 |
| **多模型支持** | OpenAI / 阿里云 / MiniMax / 百度 / 智谱... |
| **统一记忆** | 所有 AI 共享同一份记忆，切换模型无缝衔接 |
| **混合搜索** | 向量 + 关键词 + RRF 融合 |
| **本地优先** | PGlite 嵌入式，无需数据库进程 |
| **API Key 认证** | 保护你的记忆不被他人访问 |

---

## 🚀 快速开始

### 安装

```bash
git clone https://github.com/yan-auto/MiniBrain.git
cd MiniBrain
npm install
npm run build
```

### 启动远程服务器

```bash
# 基本用法
./dist/cli.js serve-remote --port 3000 --host 0.0.0.0

# 带 API Key (推荐)
./dist/cli.js serve-remote --port 3000 --host 0.0.0.0 --api-key your-secret-key

# 只监听本地
./dist/cli.js serve-remote --port 3000
```

### 连接到服务器

#### Claude Desktop

在 `claude_desktop_config.json` 中添加：

```json
{
  "mcpServers": {
    "minibrain-remote": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-client-cli", "http://your-vps:3000/mcp"],
      "env": {
        "API_KEY": "your-secret-key"
      }
    }
  }
}
```

#### 其他 MCP 客户端

使用 HTTP 请求直接连接：

```bash
# 健康检查
curl http://localhost:3000/health

# MCP 端点 (需要 Bearer 认证)
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-key" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}'
```

---

## 🏗️ 架构

```
┌─────────────────────────────────────┐
│         MiniBrain Remote             │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────┐  ┌─────────────────┐  │
│  │   CLI   │  │  HTTP/SSE       │  │
│  │  serve  │  │  MCP Server    │  │
│  │-remote  │  │  (port 3000)   │  │
│  └─────────┘  └────────┬────────┘  │
│       │                  │           │
│       └────────┬─────────┘          │
│                 ▼                   │
│        ┌────────────────┐          │
│        │  Operations    │           │
│        │   (命令层)     │           │
│        └────────┬────────┘          │
│                 │                    │
│       ┌─────────┴─────────┐        │
│       ▼                   ▼         │
│  ┌──────────┐      ┌──────────┐   │
│  │ Vector   │      │ Keyword  │    │
│  │ Search   │      │ Search   │    │
│  └────┬─────┘      └────┬─────┘    │
│       │                  │           │
│       └────────┬─────────┘           │
│                 ▼                    │
│        ┌────────────────┐          │
│        │  Engine        │           │
│        │  (PGlite)     │           │
│        └────────────────┘          │
└─────────────────────────────────────┘
```

---

## 📡 API

### 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/mcp` | POST | MCP JSON-RPC 请求 |

### MCP 工具

| 工具 | 说明 |
|------|------|
| `query` | 自然语言查询 |
| `get_page` | 获取页面 |
| `put_page` | 创建/更新页面 |
| `list_pages` | 列出页面 |
| `delete_page` | 删除页面 |

---

## 🔒 安全

### API Key 认证

```bash
# 启动时指定 API Key
./dist/cli.js serve-remote --api-key your-secret-key

# 客户端请求时携带
curl -H "Authorization: Bearer your-secret-key" http://localhost:3000/mcp
```

### 网络安全建议

1. **只暴露必要端口** - VPS 防火墙只开放 3000 端口
2. **使用 HTTPS** - 生产环境建议用 Nginx/Caddy 反向代理
3. **定期更换 Key** - 建议每月更换一次 API Key

---

## 🚢 部署

### VPS 部署

```bash
# 1. 安装 Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. 克隆项目
git clone https://github.com/yan-auto/MiniBrain.git
cd MiniBrain
npm install
npm run build

# 3. 配置 systemd 服务
sudo tee /etc/systemd/system/minibrain.service > /dev/null <<EOF
[Unit]
Description=MiniBrain Remote MCP Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/minibrain-remote
ExecStart=/opt/minibrain-remote/dist/cli.js serve-remote --port 3000 --host 0.0.0.0 --api-key YOUR_SECRET_KEY
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# 4. 启动服务
sudo systemctl daemon-reload
sudo systemctl enable minibrain
sudo systemctl start minibrain
```

### HTTPS 配置 (Nginx)

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

---

## 📦 CLI 命令

```bash
# 初始化
minibrain init

# 启动本地 MCP 服务器 (stdio)
minibrain serve

# 启动远程 MCP 服务器 (HTTP)
minibrain serve-remote --port 3000 --host 0.0.0.0 --api-key secret

# 页面操作
minibrain put <slug> --title "标题" --content "内容"
minibrain get <slug>
minibrain list
minibrain delete <slug>

# 搜索
minibrain query "查询内容"
minibrain search "关键词"

# 健康检查
minibrain doctor
```

---

## 🤝 贡献

欢迎提交 Issue 和 PR！

---

## 📄 License

MIT

---

*让 AI 记住一切，切换模型不丢记忆。*
