import postgres from 'postgres';
import type { BrainEngine, EngineConfig } from './interface.js';
import type { Page, Chunk, Tag, Link, TimelineEntry, HealthReport, SearchOptions, SearchResult } from '../types/index.js';
import { BrainError, ErrorCode } from '../types/index.js';
import { logger } from '../utils/logger.js';

export class PostgresEngine implements BrainEngine {
  private sql: ReturnType<typeof postgres>;
  private connected = false;

  constructor(private config: EngineConfig) {
    this.sql = postgres(config.connectionString, {
      max: config.maxConnections || 10,
      ssl: config.ssl ? 'require' : false,
    });
  }

  async connect(): Promise<void> {
    try {
      await this.sql`SELECT 1`;
      this.connected = true;
      logger.info('PostgreSQL engine connected');
    } catch (e) {
      throw new BrainError(
        `Failed to connect: ${e instanceof Error ? e.message : String(e)}`,
        ErrorCode.DB_ERROR,
        true
      );
    }
  }

  async disconnect(): Promise<void> {
    await this.sql.end();
    this.connected = false;
    logger.info('PostgreSQL engine disconnected');
  }

  async getSchemaVersion(): Promise<number | null> {
    try {
      const result = await this.sql`SELECT version FROM schema_version LIMIT 1`;
      return result[0]?.version ?? null;
    } catch {
      return null;
    }
  }

  async runMigration(sql: string, version: number): Promise<void> {
    await this.sql.unsafe(sql);
    await this.sql`INSERT INTO schema_version (version) VALUES (${version}) ON CONFLICT DO NOTHING`;
    logger.info(`Migration ${version} applied`);
  }

  // 页面操作
  async putPage(slug: string, page: Partial<Page>): Promise<Page> {
    const now = new Date();
    const result = await this.sql`
      INSERT INTO pages (slug, title, type, compiled_truth, timeline, frontmatter, raw_content, updated_at)
      VALUES (
        ${slug},
        ${page.title || ''},
        ${page.type || 'note'},
        ${page.compiled_truth || ''},
        ${page.timeline || ''},
        ${JSON.stringify(page.frontmatter || {})},
        ${page.raw_content || ''},
        ${now}
      )
      ON CONFLICT (slug) DO UPDATE SET
        title = EXCLUDED.title,
        type = EXCLUDED.type,
        compiled_truth = EXCLUDED.compiled_truth,
        timeline = EXCLUDED.timeline,
        frontmatter = EXCLUDED.frontmatter,
        raw_content = EXCLUDED.raw_content,
        updated_at = EXCLUDED.updated_at,
        version = pages.version + 1
      RETURNING *
    `;
    return this.mapPage(result[0]);
  }

  async getPage(slug: string): Promise<Page | null> {
    const result = await this.sql`SELECT * FROM pages WHERE slug = ${slug}`;
    return result[0] ? this.mapPage(result[0]) : null;
  }

  async deletePage(slug: string): Promise<void> {
    await this.sql`DELETE FROM pages WHERE slug = ${slug}`;
  }

  async listPages(options?: { type?: string; limit?: number; offset?: number }): Promise<Page[]> {
    let query = this.sql`SELECT * FROM pages`;
    if (options?.type) {
      query = this.sql`SELECT * FROM pages WHERE type = ${options.type}`;
    }
    query = this.sql`${query} ORDER BY updated_at DESC`;
    if (options?.limit) {
      query = this.sql`${query} LIMIT ${options.limit}`;
    }
    if (options?.offset) {
      query = this.sql`${query} OFFSET ${options.offset}`;
    }
    const result = await query;
    return result.map(this.mapPage);
  }

  // 分块操作
  async upsertChunks(pageId: string, chunks: Partial<Chunk>[]): Promise<void> {
    for (const chunk of chunks) {
      const embeddingStr = chunk.embedding ? `[${chunk.embedding.join(',')}]` : null;
      await this.sql`
        INSERT INTO content_chunks (page_id, chunk_text, embedding, embedding_model, position)
        VALUES (${pageId}, ${chunk.chunk_text}, ${embeddingStr}::vector, ${chunk.embedding_model || null}, ${chunk.position || 0})
        ON CONFLICT (page_id, position) DO UPDATE SET
          chunk_text = EXCLUDED.chunk_text,
          embedding = COALESCE(EXCLUDED.embedding, content_chunks.embedding),
          embedding_model = COALESCE(EXCLUDED.embedding_model, content_chunks.embedding_model)
      `;
    }
  }

  async getChunksByPage(pageId: string): Promise<Chunk[]> {
    const result = await this.sql`SELECT * FROM content_chunks WHERE page_id = ${pageId} ORDER BY position`;
    return result.map(this.mapChunk);
  }

  // 搜索 - 关键词
  async searchKeyword(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const limit = options?.limit || 10;
    const offset = options?.offset || 0;

    const result = await this.sql`
      SELECT 
        p.slug, p.title, p.type,
        ts_rank(p.search_vector, websearch_to_tsquery('chinese', ${query})) as rank,
        ts_headline('chinese', COALESCE(p.raw_content, ''), websearch_to_tsquery('chinese', ${query})) as chunk_text
      FROM pages p
      WHERE p.search_vector @@ websearch_to_tsquery('chinese', ${query})
      ORDER BY rank DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    return result.map(row => ({
      slug: row.slug,
      title: row.title,
      chunk_text: row.chunk_text,
      score: Number(row.rank),
      stale: false,
      page_type: row.type,
    }));
  }

  // 搜索 - 向量
  async searchVector(embedding: number[], options?: SearchOptions): Promise<SearchResult[]> {
    const limit = options?.limit || 10;
    const offset = options?.offset || 0;
    const vecStr = `[${embedding.join(',')}]`;

    const result = await this.sql`
      SELECT 
        p.slug, p.title, p.type,
        1 - (cc.embedding <=> ${vecStr}::vector) as score,
        cc.chunk_text
      FROM content_chunks cc
      JOIN pages p ON p.id = cc.page_id
      WHERE cc.embedding IS NOT NULL
      ORDER BY cc.embedding <=> ${vecStr}::vector
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    return result.map(row => ({
      slug: row.slug,
      title: row.title,
      chunk_text: row.chunk_text,
      score: Number(row.score),
      stale: false,
      page_type: row.type,
    }));
  }

  // 标签
  async addTag(pageId: string, tagName: string): Promise<Tag> {
    let tag = await this.sql`SELECT * FROM tags WHERE name = ${tagName}` as any[];
    if (!tag[0]) {
      tag = await this.sql`INSERT INTO tags (name) VALUES (${tagName}) RETURNING *`;
    }
    await this.sql`INSERT INTO page_tags (page_id, tag_id) VALUES (${pageId}, ${tag[0].id}) ON CONFLICT DO NOTHING`;
    return { id: tag[0].id, name: tag[0].name, color: tag[0].color };
  }

  async removeTag(pageId: string, tagId: string): Promise<void> {
    await this.sql`DELETE FROM page_tags WHERE page_id = ${pageId} AND tag_id = ${tagId}`;
  }

  async getTagsByPage(pageId: string): Promise<Tag[]> {
    const result = await this.sql`
      SELECT t.* FROM tags t
      JOIN page_tags pt ON pt.tag_id = t.id
      WHERE pt.page_id = ${pageId}
    `;
    return result.map(row => ({ id: row.id, name: row.name, color: row.color }));
  }

  // 链接
  async addLink(fromPageId: string, toPageId: string, context?: string): Promise<Link> {
    const result = await this.sql`
      INSERT INTO links (from_page_id, to_page_id, context)
      VALUES (${fromPageId}, ${toPageId}, ${context || null})
      ON CONFLICT (from_page_id, to_page_id) DO UPDATE SET context = EXCLUDED.context
      RETURNING *
    `;
    return this.mapLink(result[0]);
  }

  async removeLink(linkId: string): Promise<void> {
    await this.sql`DELETE FROM links WHERE id = ${linkId}`;
  }

  async getLinksByPage(pageId: string): Promise<Link[]> {
    const result = await this.sql`SELECT * FROM links WHERE from_page_id = ${pageId}`;
    return result.map(this.mapLink);
  }

  // 时间线
  async addTimelineEntry(pageId: string, entry: Partial<TimelineEntry>): Promise<TimelineEntry> {
    const result = await this.sql`
      INSERT INTO timeline_entries (page_id, date, summary, detail)
      VALUES (${pageId}, ${entry.date || null}, ${entry.summary}, ${entry.detail || null})
      RETURNING *
    `;
    return this.mapTimeline(result[0]);
  }

  async getTimelineByPage(pageId: string): Promise<TimelineEntry[]> {
    const result = await this.sql`SELECT * FROM timeline_entries WHERE page_id = ${pageId} ORDER BY date DESC`;
    return result.map(this.mapTimeline);
  }

  // 健康检查
  async getHealth(): Promise<HealthReport> {
    const metrics = {
      totalPages: 0,
      totalChunks: 0,
      embedCoverage: 0,
      staleChunks: 0,
      orphanPages: 0,
      deadLinks: 0,
    };

    try {
      const pageCount = await this.sql`SELECT COUNT(*) as count FROM pages`;
      metrics.totalPages = Number(pageCount[0]?.count || 0);

      const chunkCount = await this.sql`SELECT COUNT(*) as count FROM content_chunks`;
      metrics.totalChunks = Number(chunkCount[0]?.count || 0);

      const embedCount = await this.sql`SELECT COUNT(*) as count FROM content_chunks WHERE embedding IS NOT NULL`;
      metrics.embedCoverage = metrics.totalChunks > 0 
        ? Number(embedCount[0]?.count || 0) / metrics.totalChunks * 100 
        : 0;

      const staleCount = await this.sql`SELECT COUNT(*) as count FROM content_chunks WHERE embedding IS NULL`;
      metrics.staleChunks = Number(staleCount[0]?.count || 0);
    } catch {
      // ignore
    }

    return {
      status: metrics.staleChunks > 0 ? 'degraded' : 'healthy',
      checks: {
        engine: { ok: this.connected, message: this.connected ? 'Connected' : 'Disconnected' },
        embedding: { ok: metrics.embedCoverage > 0, message: `${metrics.embedCoverage.toFixed(1)}% coverage` },
        storage: { ok: true, message: 'OK' },
      },
      metrics,
      issues: [],
    };
  }

  async query<T>(sqlStr: string, params?: unknown[]): Promise<T[]> {
    return this.sql.unsafe(sqlStr, params) as Promise<T[]>;
  }

  // 映射函数
  private mapPage(row: any): Page {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      type: row.type,
      compiled_truth: row.compiled_truth,
      timeline: row.timeline,
      frontmatter: typeof row.frontmatter === 'string' ? JSON.parse(row.frontmatter) : row.frontmatter,
      raw_content: row.raw_content,
      created_at: row.created_at,
      updated_at: row.updated_at,
      version: row.version,
    };
  }

  private mapChunk(row: any): Chunk {
    return {
      id: row.id,
      page_id: row.page_id,
      chunk_text: row.chunk_text,
      embedding: row.embedding ? Array.from(row.embedding) : undefined,
      embedding_model: row.embedding_model,
      position: row.position,
      created_at: row.created_at,
    };
  }

  private mapLink(row: any): Link {
    return {
      id: row.id,
      from_page_id: row.from_page_id,
      to_page_id: row.to_page_id,
      context: row.context,
      created_at: row.created_at,
    };
  }

  private mapTimeline(row: any): TimelineEntry {
    return {
      id: row.id,
      page_id: row.page_id,
      date: row.date,
      summary: row.summary,
      detail: row.detail,
      created_at: row.created_at,
    };
  }
}
