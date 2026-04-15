# MiniBrain

> Cross-model memory connector — one product with two deployment modes.

English | [简体中文](./README.zh.md)

[![npm version](https://img.shields.io/badge/version-0.2.0-blue.svg)](https://github.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 🎯 Positioning

**MiniBrain is a cross-model memory connector delivered through MCP.**

Its goal is simple: your memory should stay with you, not with a single model or client.

When you switch from Claude to GPT (or any other MCP-compatible client), context continuity should still hold.

## 🧭 One Product, Two Modes

MiniBrain is one product with one memory core, available in two deployment modes:

- **Local Mode (PC single-machine)**: run via stdio for personal workflows.
- **Remote Mode (network-enabled)**: run via HTTP/SSE for multi-device or multi-agent collaboration.

Both modes share the same memory model, retrieval logic, and MCP tool interface.  
The difference is the transport layer, not the product itself.

| If you need... | Choose... |
|---|---|
| Fast personal use on one computer | **Local Mode (`serve`)** |
| Shared memory across devices or teammates | **Remote Mode (`serve-remote`)** |
| Lowest setup complexity | **Local Mode** |
| Public endpoint / API-key protected access | **Remote Mode** |

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

### Local Mode (Single Machine)

For personal workflows on one computer:

```bash
# Initialize (auto-runs schema migrations)
./dist/cli.js init

# Start local MCP server (stdio)
./dist/cli.js serve

# Add to Claude Desktop config
# Edit: ~/.claude/config.json or %APPDATA%\Claude\claude_desktop_config.json
{
  "mcpServers": {
    "minibrain": {
      "command": "node",
      "args": ["/path/to/minibrain/dist/cli.js", "serve"]
    }
  }
}
```

### Remote Mode (Network-Enabled)

For multi-device, multi-agent, or API access:

```bash
# Basic MCP-only
./dist/cli.js serve-remote --port 3000 --host 0.0.0.0

# With REST API layer (NEW: dual-interface support)
./dist/cli.js serve-remote --port 3000 --host 0.0.0.0 --api

# With API key authentication
./dist/cli.js serve-remote --port 3000 --host 0.0.0.0 --api-key your-secret-key --api

# Local development
./dist/cli.js serve-remote --port 3000 --host 127.0.0.1 --api
```

When `--api` is enabled:
- **MCP Server**: `http://127.0.0.1:3000/mcp` (for Claude, GPT, etc.)
- **REST API**: `http://127.0.0.1:3001/...` (for HTTP clients, custom integrations)

### Connect to Server

#### Claude Desktop (MCP Mode)

Add this to `claude_desktop_config.json`:

**Local mode (stdio):**
```json
{
  "mcpServers": {
    "minibrain": {
      "command": "node",
      "args": ["/path/to/dist/cli.js", "serve"]
    }
  }
}
```

**Remote mode (HTTP):**
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

#### REST API Clients

If started with `--api` flag, use HTTP directly (port 3001 by default):

```bash
# Health check
curl http://127.0.0.1:3001/health

# List memories
curl http://127.0.0.1:3001/api/memories

# Search
curl "http://127.0.0.1:3001/api/search?q=keyword"

# Create memory
curl -X POST http://127.0.0.1:3001/api/memories \
  -H "Content-Type: application/json" \
  -d '{"title":"Note","content":"Content","type":"note"}'
```

#### Other MCP Clients

Connect via HTTP/SSE:

```bash
# MCP endpoint (requires Bearer auth if apikey is set)
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

### MCP Endpoints (All Modes)

| Endpoint | Method | Description |
|------|------|------|
| `/health` | GET | Health check |
| `/mcp` | POST | MCP JSON-RPC request (streaming) |

### MCP Tools

| Tool | Description |
|------|------|
| `query` | Natural language query with vector + keyword hybrid search |
| `get_page` | Get a single page by slug |
| `put_page` | Create/update a page (auto-generates embeddings) |
| `list_pages` | List all pages |
| `delete_page` | Delete a page |
| `embed` | Backfill missing vector embeddings (one-time operation) |

### REST API Endpoints (Remote Mode with `--api`)

When started with `--api` flag, MiniBrain exposes a REST layer on `port + 1` (default: 3001):

#### Health Check
```bash
GET /health
# Response: {"status":"ok","timestamp":"2026-04-15T12:09:10.794Z"}
```

#### List All Memories
```bash
GET /api/memories
# Response: [{"slug":"...","title":"...","content":"...","type":"note","createdAt":"..."}]
```

#### Search Memories
```bash
GET /api/search?q=keyword
# Response: [{"slug":"...","title":"...","score":0.95}]
```

#### Get Single Memory
```bash
GET /api/memories/:slug
# Response: {"slug":"...","title":"...","content":"...","type":"note"}
```

#### Create Memory
```bash
POST /api/memories
Content-Type: application/json

{"title":"My Note","content":"Content here","type":"note"}
# Response: {"slug":"my-note","title":"My Note",...}
```

#### Delete Memory
```bash
DELETE /api/memories/:slug
# Response: {"success":true}
```

**Example cURL calls:**
```bash
# Search
curl "http://127.0.0.1:3001/api/search?q=本地"

# Create memory
curl -X POST http://127.0.0.1:3001/api/memories \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","content":"This is a test","type":"note"}'

# Get specific memory
curl http://127.0.0.1:3001/api/memories/test
```

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
# Initialize (auto-runs schema migrations for local setup)
minibrain init

# Local mode: Start stdio MCP server
minibrain serve

# Remote mode: Start HTTP/SSE MCP server + optional REST API
minibrain serve-remote --port 3000 --host 0.0.0.0
minibrain serve-remote --port 3000 --host 0.0.0.0 --api              # Enable REST API layer
minibrain serve-remote --port 3000 --host 0.0.0.0 --api-key secret   # With auth

# Page operations
minibrain put <slug> --title "Title" --content "Content"
minibrain get <slug>
minibrain list
minibrain delete <slug>

# Search & embedding
minibrain query "query text"          # Hybrid keyword + vector search
minibrain search "keyword"             # Keyword search only
minibrain embed                        # Backfill missing vector embeddings (runs once
 after put operations)

# Health check & diagnostics
minibrain doctor                       # Show page count, chunk count, vector coverage
```

---

## 🤝 Contributing

Issues and PRs are welcome.

---

## 📄 License

MIT

---

*Remember everything. Switch models without losing memory.*
