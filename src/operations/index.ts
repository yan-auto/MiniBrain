import type { BrainEngine } from '../engine/interface.js';
import type { EmbeddingProvider } from '../embedding/provider.js';
import type { SearchResult } from '../types/index.js';

function splitIntoChunks(text: string, chunkSize = 500, overlap = 80): string[] {
  const normalized = (text || '').trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(start + chunkSize, normalized.length);
    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end === normalized.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

async function upsertPageEmbeddings(
  ctx: OperationContext,
  page: { id: string; raw_content?: string },
  provider: EmbeddingProvider
): Promise<number> {
  const chunks = splitIntoChunks(page.raw_content || '');
  if (chunks.length === 0) return 0;

  const vectors = await provider.embedBatch(chunks);
  await ctx.engine.upsertChunks(
    page.id,
    chunks.map((chunk, index) => ({
      id: `${page.id}-${index}`,
      chunk_text: chunk,
      embedding: vectors[index],
      embedding_model: provider.name,
      position: index,
    }))
  );
  return chunks.length;
}

// 操作上下文
export interface OperationContext {
  engine: BrainEngine;
  embedding?: EmbeddingProvider;
  logger: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
  dryRun?: boolean;
}

// 参数定义
export interface ParamDefinition {
  type: string;
  required?: boolean;
  description?: string;
  default?: unknown;
}

// 操作定义
export interface Operation {
  name: string;
  description: string;
  params: Record<string, ParamDefinition>;
  cliHints?: {
    name?: string;
    positional?: string;
    hidden?: boolean;
  };
  handler: (ctx: OperationContext, params: unknown) => Promise<unknown>;
}

// 辅助函数：构建操作上下文
export function buildContext(engine: BrainEngine, embedding?: EmbeddingProvider): OperationContext {
  return {
    engine,
    embedding,
    logger: {
      info: (msg) => console.error(`[info] ${msg}`),
      warn: (msg) => console.error(`[warn] ${msg}`),
      error: (msg) => console.error(`[error] ${msg}`),
    },
    dryRun: false,
  };
}

// 搜索操作
export const queryOperation: Operation = {
  name: 'query',
  description: '用自然语言查询知识库',
  params: {
    query: { type: 'string', required: true, description: '查询内容' },
    limit: { type: 'number', description: '返回数量', default: 10 },
  },
  cliHints: { name: 'query' },
  handler: async (ctx, params) => {
    const { query, limit = 10 } = params as { query: string; limit?: number };
    const { hybridSearch } = await import('../search/hybrid.js');
    const { createEmbeddingProvider } = await import('../embedding/index.js');
    const provider = ctx.embedding || createEmbeddingProvider();
    const results = await hybridSearch(ctx.engine, provider, query, { limit });
    return { results };
  },
};

// 搜索（关键词）
export const searchOperation: Operation = {
  name: 'search',
  description: '关键词搜索',
  params: {
    query: { type: 'string', required: true, description: '查询内容' },
    limit: { type: 'number', description: '返回数量', default: 10 },
  },
  cliHints: { name: 'search' },
  handler: async (ctx, params) => {
    const { query, limit = 10 } = params as { query: string; limit?: number };
    const results = await ctx.engine.searchKeyword(query, { limit });
    return { results };
  },
};

// 获取页面
export const getPageOperation: Operation = {
  name: 'get_page',
  description: '获取页面',
  params: {
    slug: { type: 'string', required: true, description: '页面slug' },
  },
  cliHints: { name: 'get' },
  handler: async (ctx, params) => {
    const { slug } = params as { slug: string };
    const page = await ctx.engine.getPage(slug);
    if (!page) {
      return { error: `Page '${slug}' not found` };
    }
    return { page };
  },
};

// 创建/更新页面
export const putPageOperation: Operation = {
  name: 'put_page',
  description: '创建或更新页面',
  params: {
    slug: { type: 'string', required: true, description: '页面slug' },
    title: { type: 'string', required: true, description: '页面标题' },
    content: { type: 'string', required: true, description: 'Markdown内容' },
    type: { type: 'string', description: '页面类型', default: 'note' },
  },
  cliHints: { name: 'put' },
  handler: async (ctx, params) => {
    const { slug, title, content, type = 'note' } = params as { 
      slug: string; 
      title: string; 
      content: string;
      type?: string;
    };
    const page = await ctx.engine.putPage(slug, { title, raw_content: content, type });

    // Auto-generate embeddings after page write (best effort)
    try {
      const { createEmbeddingProvider } = await import('../embedding/index.js');
      const provider = ctx.embedding || createEmbeddingProvider();
      const embeddedChunks = await upsertPageEmbeddings(ctx, page, provider);
      return { page, embeddedChunks };
    } catch (e) {
      ctx.logger.warn(`Embedding skipped for '${slug}': ${e instanceof Error ? e.message : String(e)}`);
      return { page, embeddedChunks: 0 };
    }
  },
};

// 重建向量索引（回填）
export const embedOperation: Operation = {
  name: 'embed',
  description: '重建向量索引',
  params: {
    stale: { type: 'boolean', description: '仅回填缺失向量（当前实现会全量覆盖）', default: false },
  },
  cliHints: { name: 'embed' },
  handler: async (ctx) => {
    const { createEmbeddingProvider } = await import('../embedding/index.js');
    const provider = ctx.embedding || createEmbeddingProvider();
    const pages = await ctx.engine.listPages({ limit: 1000 });

    let embeddedPages = 0;
    let embeddedChunks = 0;

    for (const page of pages) {
      const count = await upsertPageEmbeddings(ctx, page, provider);
      if (count > 0) {
        embeddedPages += 1;
        embeddedChunks += count;
      }
    }

    return {
      totalPages: pages.length,
      embeddedPages,
      embeddedChunks,
      provider: provider.name,
    };
  },
};

// 删除页面
export const deletePageOperation: Operation = {
  name: 'delete_page',
  description: '删除页面',
  params: {
    slug: { type: 'string', required: true, description: '页面slug' },
  },
  cliHints: { name: 'delete' },
  handler: async (ctx, params) => {
    const { slug } = params as { slug: string };
    await ctx.engine.deletePage(slug);
    return { success: true };
  },
};

// 列出页面
export const listPagesOperation: Operation = {
  name: 'list_pages',
  description: '列出页面',
  params: {
    limit: { type: 'number', description: '返回数量', default: 20 },
    type: { type: 'string', description: '按类型过滤' },
  },
  cliHints: { name: 'list' },
  handler: async (ctx, params) => {
    const { limit = 20, type } = params as { limit?: number; type?: string };
    const pages = await ctx.engine.listPages({ limit, type });
    return { pages };
  },
};

// 健康检查
export const doctorOperation: Operation = {
  name: 'doctor',
  description: '健康检查',
  params: {},
  cliHints: { name: 'doctor' },
  handler: async (ctx) => {
    const report = await ctx.engine.getHealth();
    return report;
  },
};

// 操作注册表
export const operations: Operation[] = [
  queryOperation,
  searchOperation,
  embedOperation,
  getPageOperation,
  putPageOperation,
  deletePageOperation,
  listPagesOperation,
  doctorOperation,
];

// 导出所有操作
export * from './index.js';
