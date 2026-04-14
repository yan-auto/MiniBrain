#!/usr/bin/env node

import { createEngine } from './engine/factory.js';
import { loadConfig, saveConfig, getConfigDir } from './config/index.js';
import { logger } from './utils/logger.js';
import { BrainError, ErrorCode } from './types/index.js';
import { operations, buildContext } from './operations/index.js';
import { createEmbeddingProvider } from './embedding/index.js';
import { startServer } from './mcp/server.js';
import { startRemoteServer } from './mcp/server-remote.js';
import fs from 'fs';
import path from 'path';

function showHelp() {
  console.log(`
MiniBrain Remote CLI - 跨模型记忆连接器 (远程服务版)

用法: minibrain <命令> [选项]

命令:
  init                    初始化数据库
  serve                   启动本地MCP服务器 (stdio)
  serve-remote            启动远程MCP服务器 (HTTP)
  
  doctor                  健康检查

  put <slug> [options]   添加/更新页面
  get <slug>             获取页面
  delete <slug>          删除页面
  list                    列出所有页面

  search <query>          关键词搜索
  query <query>           混合搜索 (自然语言)

  embed [--stale]         重建向量索引

  config get <key>       读取配置
  config set <key> <val>  设置配置
  config list             列出所有配置

  help                    显示帮助

远程服务选项:
  --port <端口>          HTTP端口 (默认: 3000)
  --host <地址>          监听地址 (默认: 127.0.0.1)
  --api-key <密钥>       API密钥 (可选，推荐设置)

示例:
  minibrain init
  minibrain serve-remote --port 3000 --host 0.0.0.0 --api-key mysecretkey
  minibrain serve-remote --port 8080
  minibrain put my-note --title "My Note" --content "Hello"
  minibrain query "如何配置定时任务"
  minibrain doctor
`);
}

// 初始化
async function init() {
  const configDir = getConfigDir();
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  const config = loadConfig();
  saveConfig(config);
  logger.info(`Initialized at ${configDir}`);
}

// 健康检查
async function doctor() {
  const config = loadConfig();
  const engine = createEngine({
    type: config.engine,
    connectionString: config.engine === 'postgres' 
      ? process.env.DATABASE_URL 
      : path.join(config.dataDir, 'brain.db'),
  });
  try {
    await engine.connect();
    const report = await engine.getHealth();
    console.log(`Status: ${report.status}`);
    console.log(`  Engine: ${report.checks.engine.ok ? '✓' : '✗'} ${report.checks.engine.message}`);
    console.log(`  Embedding: ${report.checks.embedding.ok ? '✓' : '✗'} ${report.checks.embedding.message}`);
    console.log(`  Storage: ${report.checks.storage.ok ? '✓' : '✗'} ${report.checks.storage.message}`);
    console.log(`\nMetrics:`);
    console.log(`  Pages: ${report.metrics.totalPages}`);
    console.log(`  Chunks: ${report.metrics.totalChunks}`);
    console.log(`  Embed Coverage: ${report.metrics.embedCoverage.toFixed(1)}%`);
    if (report.issues.length > 0) {
      console.log(`\nIssues:`);
      for (const issue of report.issues) {
        console.log(`  - ${issue}`);
      }
    }
  } finally {
    await engine.disconnect();
  }
}

// 启动远程服务器
async function serveRemote(args: string[]) {
  let port = 3000;
  let host = '127.0.0.1';
  let apiKey: string | undefined;

  // Parse args
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--port':
        port = parseInt(args[++i], 10);
        break;
      case '--host':
        host = args[++i];
        break;
      case '--api-key':
        apiKey = args[++i];
        break;
    }
  }

  console.log(`Starting MiniBrain Remote MCP Server...`);
  console.log(`Port: ${port}`);
  console.log(`Host: ${host}`);
  console.log(`API Key: ${apiKey ? 'enabled' : 'disabled'}`);

  await startRemoteServer({ port, host, apiKey });

  // Keep the process running
  console.log('\nServer is running. Press Ctrl+C to stop.');
}

// 运行命令
async function runCommand(command: string, args: string[]) {
  const config = loadConfig();
  const engine = createEngine({
    type: config.engine,
    connectionString: config.engine === 'postgres' 
      ? process.env.DATABASE_URL 
      : path.join(config.dataDir, 'brain.db'),
  });
  
  try {
    await engine.connect();
    const ctx = buildContext(engine, createEmbeddingProvider());
    
    // 根据命令找到对应操作
    const op = operations.find(o => o.cliHints?.name === command);
    if (!op) {
      throw new BrainError(`Unknown command: ${command}`, ErrorCode.VALIDATION);
    }
    
    // 解析参数（简单实现）
    const params = parseParams(op, args);
    const result = await op.handler(ctx, params);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await engine.disconnect();
  }
}

// 简单参数解析
function parseParams(op: any, args: string[]): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const paramKeys = Object.keys(op.params);
  
  for (let i = 0; i < paramKeys.length && i < args.length; i++) {
    const key = paramKeys[i];
    const paramDef = op.params[key];
    const value = args[i];
    
    if (paramDef.type === 'number') {
      params[key] = parseInt(value, 10);
    } else {
      params[key] = value;
    }
  }
  
  return params;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  try {
    switch (command) {
      case 'init':
        await init();
        break;
      case 'serve':
        await startServer();
        break;
      case 'serve-remote':
        await serveRemote(args.slice(1));
        break;
      case 'doctor':
        await doctor();
        break;
      case 'help':
        showHelp();
        break;
      default:
        await runCommand(command, args.slice(1));
    }
  } catch (e) {
    if (e instanceof BrainError) {
      logger.error(`${e.code}: ${e.message}`);
      process.exit(1);
    } else {
      logger.error(String(e));
      process.exit(1);
    }
  }
}

main();
