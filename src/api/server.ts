import http from 'node:http';
import { URL } from 'node:url';
import { loadConfig } from '../config/index.js';
import { createEngine } from '../engine/factory.js';
import { logger } from '../utils/logger.js';

export interface ApiServerConfig {
  port: number;
  host: string;
  apiKey?: string;
}

interface ApiRoute {
  method: string;
  path: RegExp;
  handler: (req: http.IncomingMessage, res: http.ServerResponse, match: RegExpMatchArray) => Promise<void>;
}

async function parseBody(req: http.IncomingMessage): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : null);
      } catch {
        resolve(null);
      }
    });
  });
}

function sendJson(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendError(res: http.ServerResponse, status: number, message: string) {
  sendJson(res, status, { error: message });
}

function getConnectionString() {
  const config = loadConfig();
  return config.engine === 'postgres'
    ? (process.env.DATABASE_URL || '')
    : `${config.dataDir}/brain.db`;
}

function createRoutes(config: ApiServerConfig): ApiRoute[] {
  return [
    {
      method: 'GET',
      path: /^\/health$/,
      handler: async (_req, res) => {
        sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
      },
    },
    {
      method: 'GET',
      path: /^\/api\/memories$/,
      handler: async (_req, res) => {
        const engine = createEngine({
          type: loadConfig().engine,
          connectionString: getConnectionString(),
        });
        await engine.connect();
        const pages = await engine.listPages({ limit: 100 });
        await engine.disconnect();
        sendJson(res, 200, { memories: pages });
      },
    },
    {
      method: 'POST',
      path: /^\/api\/memories$/,
      handler: async (req, res) => {
        const body = await parseBody(req);
        if (!body || !body.content) {
          return sendError(res, 400, 'Missing required field: content');
        }

        const engine = createEngine({
          type: loadConfig().engine,
          connectionString: getConnectionString(),
        });

        await engine.connect();
        const slug = `memory-${Date.now()}`;
        const page = await engine.putPage(slug, {
          title: String(body.title || 'Untitled'),
          raw_content: String(body.content),
          type: String(body.type || 'note'),
        });
        await engine.disconnect();

        sendJson(res, 201, { memory: page });
      },
    },
    {
      method: 'GET',
      path: /^\/api\/search$/,
      handler: async (req, res) => {
        const url = new URL(req.url || '', `http://${config.host}:${config.port}`);
        const query = url.searchParams.get('q') || url.searchParams.get('query');

        if (!query) {
          return sendError(res, 400, 'Missing required query parameter: q or query');
        }

        const engine = createEngine({
          type: loadConfig().engine,
          connectionString: getConnectionString(),
        });

        await engine.connect();
        const results = await engine.searchKeyword(query, { limit: 10 });
        await engine.disconnect();

        sendJson(res, 200, { results });
      },
    },
    {
      method: 'GET',
      path: /^\/api\/memories\/(.+)$/, 
      handler: async (_req, res, match) => {
        const slug = match[1];

        const engine = createEngine({
          type: loadConfig().engine,
          connectionString: getConnectionString(),
        });

        await engine.connect();
        const page = await engine.getPage(slug);
        await engine.disconnect();

        if (!page) {
          return sendError(res, 404, `Memory not found: ${slug}`);
        }

        sendJson(res, 200, { memory: page });
      },
    },
    {
      method: 'DELETE',
      path: /^\/api\/memories\/(.+)$/, 
      handler: async (_req, res, match) => {
        const slug = match[1];

        const engine = createEngine({
          type: loadConfig().engine,
          connectionString: getConnectionString(),
        });

        await engine.connect();
        await engine.deletePage(slug);
        await engine.disconnect();

        sendJson(res, 200, { deleted: slug });
      },
    },
  ];
}

function authenticate(req: http.IncomingMessage, config: ApiServerConfig): boolean {
  if (!config.apiKey) return true;

  const auth = req.headers.authorization;
  if (!auth) return false;

  return auth === `Bearer ${config.apiKey}`;
}

export async function startApiServer(config: ApiServerConfig): Promise<http.Server> {
  const routes = createRoutes(config);

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (!authenticate(req, config)) {
      return sendError(res, 401, 'Unauthorized');
    }

    const url = req.url || '/';
    const method = req.method || 'GET';

    for (const route of routes) {
      if (route.method !== method) continue;
      const match = url.match(route.path);
      if (match) {
        try {
          await route.handler(req, res, match);
        } catch (e) {
          logger.error(`API error: ${e}`);
          sendError(res, 500, 'Internal server error');
        }
        return;
      }
    }

    sendError(res, 404, 'Not found');
  });

  return new Promise((resolve) => {
    server.listen(config.port, config.host, () => {
      logger.info(`MiniBrain API Server running on http://${config.host}:${config.port}`);
      logger.info(`Health: http://${config.host}:${config.port}/health`);
      logger.info(`Memories: http://${config.host}:${config.port}/api/memories`);
      logger.info(`Search: http://${config.host}:${config.port}/api/search?q=...`);
      resolve(server);
    });
  });
}