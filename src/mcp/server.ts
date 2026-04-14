import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createEngine } from '../engine/factory.js';
import { loadConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { BrainError, ErrorCode } from '../types/index.js';
import { operations, buildContext } from '../operations/index.js';
import { createEmbeddingProvider } from '../embedding/index.js';

const VERSION = '0.1.0';

// 创建 MCP 服务器
const server = new Server(
  { name: 'minibrain', version: VERSION },
  { capabilities: { tools: {} } }
);

// 从 operations 生成 MCP 工具定义
function generateTools() {
  return operations.map(op => ({
    name: op.name,
    description: op.description,
    inputSchema: {
      type: 'object' as const,
      properties: Object.fromEntries(
        Object.entries(op.params).map(([k, v]: [string, any]) => [
          k,
          {
            type: v.type,
            description: v.description || '',
            ...(v.default !== undefined ? { default: v.default } : {}),
          }
        ])
      ),
      required: Object.entries(op.params)
        .filter(([, v]: [string, any]) => v.required)
        .map(([k]) => k),
    },
  }));
}

// 工具列表
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: generateTools(),
}));

// 工具调用
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: params } = request.params;
  const op = operations.find(o => o.name === name);

  if (!op) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
      isError: true,
    };
  }

  const config = loadConfig();
  const engine = createEngine({
    type: config.engine,
    connectionString: config.engine === 'postgres'
      ? process.env.DATABASE_URL
      : `${config.dataDir}/brain.db`,
  });

  try {
    await engine.connect();
    const ctx = buildContext(engine, createEmbeddingProvider());
    const result = await op.handler(ctx, params || {});
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (e) {
    const error = e instanceof BrainError
      ? e.toJSON()
      : { error: String(e), code: ErrorCode.INTERNAL };
    return {
      content: [{ type: 'text', text: JSON.stringify(error) }],
      isError: true,
    };
  } finally {
    await engine.disconnect();
  }
});

// 启动服务器
export async function startServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('MiniBrain MCP Server started');
}
