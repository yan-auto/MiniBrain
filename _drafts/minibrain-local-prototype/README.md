# MiniBrain

> **跨模型记忆连接器** — AI 时代的记忆标准化协议

[![npm version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://github.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 🎯 核心定位

**MiniBrain 是一个 MCP 协议实现的跨模型记忆层。**

换模型不丢记忆。不同 AI 共享同一份上下文。

```
Claude ──MCP──► MiniBrain ◄──MCP── GPT-4
                    │
                    ▼
              统一记忆层
                    │
                    ▼
              MiniMax ──MCP──► 任意模型...
```

---

## ✨ 特性

| 特性 | 说明 |
|------|------|
| **MCP Native** | 严格遵循 Model Context Protocol，stdio 直连 |
| **多模型支持** | OpenAI / 阿里云 / MiniMax / 百度 / 智谱... |
| **统一记忆** | 所有 AI 共享同一份记忆，切换模型无缝衔接 |
| **混合搜索** | 向量 + 关键词 + RRF 融合 |
| **本地优先** | PGlite 嵌入式，无需数据库进程 |
| **中文优化** | 专为中文语义检索调优 |

---

## 🚀 快速开始

### 安装

```bash
git clone https://github.com/your-name/minibrain.git
cd minibrain
npm install
npm run build
```

### 配置

```bash
# 设置 API Key
export DASHSCOPE_API_KEY=sk-xxxxxxxxxxxx

# 或者 MiniMax
export MINIMAX_API_KEY=sk-xxxxxxxxxxxx
```

### CLI 使用

```bash
# 初始化
./dist/cli.js init

# 添加记忆
./dist/cli.js put my-note --title "我的笔记" --content "这是笔记内容"

# 搜索
./dist/cli.js query "查找相关内容"

# 健康检查
./dist/cli.js doctor
```

### MCP 服务（连接 AI）

```bash
# 启动 MCP 服务器
./dist/cli.js serve

# AI 通过 stdio 连接，获取统一记忆
```

---

## 🏗️ 架构

```
┌─────────────────────────────────────┐
│          MiniBrain                   │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────┐  ┌─────────────────┐ │
│  │   CLI   │  │   MCP Server    │ │
│  └────┬────┘  └────────┬────────┘ │
│       │                    │          │
│       └─────────┬──────────┘          │
│                 ▼                     │
│        ┌────────────────┐           │
│        │  Operations    │            │
│        │   (命令层)     │            │
│        └────────┬────────┘            │
│                 │                     │
│  ┌─────────────┼─────────────────┐  │
│  ▼             ▼                   ▼  │
│ ┌────────┐ ┌────────┐ ┌────────────┐ │
│ │ Vector │ │Keyword │ │  Hybrid    │ │
│ │ Search │ │ Search │ │  (RRF)    │ │
│ └────┬───┘ └────┬───┘ └──────┬────┘ │
│      │          │              │        │
│      └──────────┴──────────────┘        │
│                   │                     │
│       ┌───────────┴───────────┐       │
│       ▼                       ▼        │
│  ┌─────────────────┐  ┌────────────┐  │
│  │ Embedding Layer │  │   LLM      │  │
│  │ (DashScope/    │  │  Provider  │  │
│  │  OpenAI/MiniMax│  │            │  │
│  └────────┬───────┘  └──────┬─────┘  │
│           │                   │         │
│  ┌────────┴─────────────────┴──────┐  │
│  │      BrainEngine              │  │
│  │  Postgres / PGlite           │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

---

## 🌏 Embedding 模型支持

| Provider | 模型 | 维度 | 状态 |
|----------|------|------|------|
| **DashScope** (阿里云) | text-embedding-v3 | 1536 | ✅ 默认 |
| **OpenAI** | text-embedding-3-small | 1536 | ✅ |
| **MiniMax** | embo-01 | 1024 | ✅ |
| **百度** | ERNIE | 384 | 🔜 |
| **智谱** | embedding-3 | 1024 | 🔜 |
| **Cohere** | embed-multilingual-v3 | 1024 | 🔜 |

---

## 📖 使用场景

### 场景 1: AI 模型切换

```bash
# 今天是 GPT-4，明天是 Claude
# 记忆不丢失，因为记忆不在模型里，在 MiniBrain 里

minibrain put "用户偏好" --content "Frank 喜欢简洁的回复风格"
# 明天问 Claude: query "用户的回复风格偏好是什么？"
# → 答案一致，因为用的是同一个记忆层
```

### 场景 2: 多 AI 协作

```bash
# AI-1 (Claude) 记笔记
minibrain put "会议记录" --content "讨论了项目方向..."

# AI-2 (GPT-4) 查笔记
minibrain query "项目方向是什么？"
# → 答案一致
```

### 场景 3: 个人知识库

```bash
# 构建个人知识库
minibrain import ~/notes
minibrain embed

# AI 随时查询
minibrain query "我上周学了什么？"
```

---

## 🔧 配置

### 环境变量

```bash
# Embedding Provider
DASHSCOPE_API_KEY=sk-xxx      # 阿里云 [默认]
OPENAI_API_KEY=sk-xxx          # OpenAI
MINIMAX_API_KEY=sk-xxx         # MiniMax

# LLM Provider (查询扩展)
LLM_PROVIDER=minimax

# MCP 服务
minibrain serve  # 启动 stdio 服务
```

### 配置文件

```json
// ~/.minibrain/config.json
{
  "version": 1,
  "engine": "postgres",
  "embedding": {
    "provider": "dashscope",
    "dimensions": 1536
  }
}
```

---

## 📦 API

### CLI

```bash
minibrain init              # 初始化
minibrain put <slug>       # 添加/更新页面
minibrain get <slug>       # 获取页面
minibrain delete <slug>     # 删除页面
minibrain list             # 列出页面
minibrain query <query>     # 混合搜索
minibrain search <query>    # 关键词搜索
minibrain embed            # 重建向量
minibrain doctor           # 健康检查
minibrain serve            # MCP 服务
```

### MCP Tools

```json
{
  "tools": [
    { "name": "query", "description": "自然语言查询" },
    { "name": "get_page", "description": "获取页面" },
    { "name": "put_page", "description": "创建/更新页面" },
    { "name": "list_pages", "description": "列出页面" },
    { "name": "delete_page", "description": "删除页面" }
  ]
}
```

---

## 🤝 贡献

欢迎提交 Issue 和 PR！

---

## 📄 License

MIT

---

*让 AI 记住一切，切换模型不丢记忆。*
