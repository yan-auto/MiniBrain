/**
 * MiniBrain Remote MCP Server
 * Supports HTTP/SSE transport for remote AI connections
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
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
import http from 'node:http';

const VERSION = '0.2.0';

export interface RemoteServerConfig {
  port: number;
  host: string;
  apiKey?: string;
}

function createServer() {
  return new Server(
    { name: 'minibrain-remote', version: VERSION },
    { capabilities: { tools: {} } }
  );
}

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

async function handleToolCall(params: { name: string; arguments?: Record<string, unknown> }) {
  const { name, arguments: args } = params;
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
    const result = await op.handler(ctx, args || {});
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
}

// Create MCP server instance
const server = createServer();

// Set up request handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: generateTools(),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  return handleToolCall({
    name: request.params.name,
    arguments: request.params.arguments,
  });
});

/**
 * Start the remote MCP server with HTTP/SSE transport
 */
export async function startRemoteServer(config: RemoteServerConfig): Promise<http.Server> {
  const { port, host, apiKey } = config;

  // Create HTTP server
  const serverInstance = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, MCP-Session-ID');

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // API Key authentication
    if (apiKey) {
      const authHeader = req.headers.authorization;
      if (!authHeader || authHeader !== `Bearer ${apiKey}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
    }

    // Health check endpoint
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', version: VERSION }));
      return;
    }

    // MCP endpoint
    if (req.url === '/mcp' || req.url?.startsWith('/mcp/')) {
      try {
        // Parse body for POST requests
        let body: unknown = undefined;
        if (req.method === 'POST') {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }
          const rawBody = Buffer.concat(chunks).toString();
          if (rawBody) {
            try {
              body = JSON.parse(rawBody);
            } catch {
              // Ignore parse errors
            }
          }
        }

        // Create transport for this request
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined, // Stateless mode
        });

        // Handle the request
        await transport.handleRequest(req, res, body);
      } catch (e) {
        logger.error(`HTTP handling error: ${e}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
      return;
    }

    // Not found
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  return new Promise((resolve) => {
    serverInstance.listen(port, host, () => {
      logger.info(`MiniBrain Remote MCP Server running on http://${host}:${port}`);
      logger.info(`MCP endpoint: http://${host}:${port}/mcp`);
      logger.info(`Health check: http://${host}:${port}/health`);
      if (apiKey) {
        logger.info('API Key authentication: enabled');
      }
      resolve(serverInstance);
    });
  });
}
