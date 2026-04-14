# MiniBrain Remote

> Cross-model memory connector — remote MCP server edition.

English | [简体中文](./README.zh.md)

[![npm version](https://img.shields.io/badge/version-0.2.0-blue.svg)](https://github.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 🎯 Positioning

**MiniBrain Remote is a cross-model memory connector delivered as a remote MCP server.**

Its goal is simple: your memory should stay with you, not with a single model or client.

When you switch from Claude to GPT (or any other MCP-compatible client), context continuity should still hold.

```
Claude ──MCP──► MiniBrain Remote ◄──MCP── GPT-4
                    │  (HTTP/SSE)
                    ▼
               VPS Server
```

---

## 🧩 The Problem It Solves

Today, most AI workflows suffer from four recurring issues:

1. **Memory fragmentation** — each AI client stores context in isolation.
2. **Model lock-in** — once memory lives in one stack, switching tools loses history.
3. **Context reset costs** — users repeatedly re-explain the same background.
4. **Inconsistent retrieval quality** — pure keyword or pure vector search alone misses intent.

The result is wasted time, unstable output quality, and weak long-term collaboration between human and AI.

## 🔍 Why Traditional Approaches Fall Short

Classic knowledge-base tools are usually built for documents, not for **shared AI memory across model boundaries**.

They often provide storage, but not a protocol-native interface that every MCP client can consume consistently.

MiniBrain Remote focuses on this exact gap: a protocol-first memory layer for multi-model AI systems.

## ⚙️ How MiniBrain Remote Solves It

MiniBrain Remote works as a layered pipeline:

1. **Standardized access (MCP Native)**  
   Memory operations are exposed through MCP tools, so multiple AI clients can read/write the same memory with a consistent contract.

2. **Durable storage with deployment flexibility**  
   Use **PGlite** for local-first setups and **PostgreSQL** for production-style environments.

3. **Hybrid retrieval for higher recall quality**  
   Combine vector search, keyword search, and **RRF fusion** to reduce blind spots from any single retrieval method.

4. **Secure remote connectivity**  
   Serve memory via HTTP/SSE with API key authentication, enabling cross-device and remote agent access.

## ✅ What You Get in Practice

- Keep long-term context when switching models.
- Let multiple agents share one memory layer.
- Reduce repetitive prompting and onboarding overhead.
- Build memory-enabled AI products on a protocol-aligned foundation.

---

## ✨ Features

| Feature | Description |
|------|------|
| **MCP Native** | Fully aligned with the Model Context Protocol |
| **Remote Transport** | HTTP/SSE access across devices |
| **Multi-model Support** | OpenAI / Alibaba Cloud / MiniMax / Baidu / Zhipu |
| **Unified Memory** | Shared memory across AI systems, seamless model switching |
| **Hybrid Search** | Vector + keyword + RRF fusion |
| **Local-first** | Embedded PGlite, no separate DB process required |
| **API Key Auth** | Protects memory access |

---

## 🚀 Quick Start

### Install

```bash
git clone https://github.com/yan-auto/MiniBrain.git
cd MiniBrain
npm install
npm run build
```

### Start Remote Server

```bash
# Basic
./dist/cli.js serve-remote --port 3000 --host 0.0.0.0

# With API key (recommended)
./dist/cli.js serve-remote --port 3000 --host 0.0.0.0 --api-key your-secret-key

# Local only
./dist/cli.js serve-remote --port 3000
```

### Connect to Server

#### Claude Desktop

Add this to `claude_desktop_config.json`:

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

#### Other MCP Clients

Connect directly via HTTP:

```bash
# Health check
curl http://localhost:3000/health

# MCP endpoint (requires Bearer auth)
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-key" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}'
```

---

## 🏗️ Architecture

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

### Endpoints

| Endpoint | Method | Description |
|------|------|------|
| `/health` | GET | Health check |
| `/mcp` | POST | MCP JSON-RPC request |

### MCP Tools

| Tool | Description |
|------|------|
| `query` | Natural language query |
| `get_page` | Get a page |
| `put_page` | Create/update a page |
| `list_pages` | List pages |
| `delete_page` | Delete a page |

---

## 🔒 Security

### API Key Authentication

```bash
# Set API key at startup
./dist/cli.js serve-remote --api-key your-secret-key

# Send in client requests
curl -H "Authorization: Bearer your-secret-key" http://localhost:3000/mcp
```

### Network Security Recommendations

1. **Expose only required ports** - open only port 3000 in firewall
2. **Use HTTPS** - use Nginx/Caddy reverse proxy in production
3. **Rotate keys regularly** - suggested monthly rotation

---

## 🚢 Deployment

### VPS Deployment

```bash
# 1. Install Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Clone project
git clone https://github.com/yan-auto/MiniBrain.git
cd MiniBrain
npm install
npm run build

# 3. Configure systemd service
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

# 4. Start service
sudo systemctl daemon-reload
sudo systemctl enable minibrain
sudo systemctl start minibrain
```

### HTTPS Config (Nginx)

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

## 📦 CLI Commands

```bash
# Initialize
minibrain init

# Start local MCP server (stdio)
minibrain serve

# Start remote MCP server (HTTP)
minibrain serve-remote --port 3000 --host 0.0.0.0 --api-key secret

# Page operations
minibrain put <slug> --title "Title" --content "Content"
minibrain get <slug>
minibrain list
minibrain delete <slug>

# Search
minibrain query "query text"
minibrain search "keyword"

# Health check
minibrain doctor
```

---

## 🤝 贡献
## 🤝 Contributing

Issues and PRs are welcome.

---

## 📄 License

MIT

---

*Remember everything. Switch models without losing memory.*
