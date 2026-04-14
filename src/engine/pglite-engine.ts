import { PGlite } from '@electric-sql/pglite';
import type { BrainEngine } from './interface.js';
import type { Page, Chunk, Tag, Link, TimelineEntry, HealthReport, SearchOptions, SearchResult } from '../types/index.js';
import { InMemoryVectorStore } from '../search/vector-store.js';
import { logger } from '../utils/logger.js';

export class PGliteEngine implements BrainEngine {
  private db: PGlite | null = null;
  private dataDir: string;
  private connected = false;
  private vectorStore: InMemoryVectorStore;

  constructor(private config: { dataDir: string }) {
    this.dataDir = config.dataDir;
    this.vectorStore = new InMemoryVectorStore(config.dataDir);
  }

  async connect(): Promise<void> {
    try {
      this.db = new PGlite(this.dataDir);
      await this.db.waitReady;
      this.connected = true;
      
      // Load vector index from disk
      await this.vectorStore.load();
      logger.info(`PGlite engine connected, vectors loaded: ${this.vectorStore.size}`);
    } catch (e) {
      throw new Error(`Failed to connect: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      // Save vector index to disk before closing
      await this.vectorStore.save();
      await this.db.close();
      this.db = null;
      this.connected = false;
      logger.info('PGlite engine disconnected');
    }
  }

  async getSchemaVersion(): Promise<number | null> {
    try {
      const result = await this.db!.query('SELECT version FROM schema_version LIMIT 1');
      return result.rows[0]?.version ?? null;
    } catch {
      return null;
    }
  }

  async runMigration(sql: string, version: number): Promise<void> {
    // PGlite doesn't support multiple SQL statements in one query
    const statements = sql.split(';').filter(s => s.trim() && !s.trim().startsWith('--'));
    for (const stmt of statements) {
      try {
        await this.db!.query(stmt);
      } catch {
        // Ignore errors for IF NOT EXISTS etc
      }
    }
    try {
      await this.db!.query(`INSERT INTO schema_version (version) VALUES (${version})`);
    } catch {
      // Already exists
    }
    logger.info(`Migration ${version} applied`);
  }

  // Generate simple ID
  private generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  // 页面操作
  async putPage(slug: string, page: Partial<Page>): Promise<Page> {
    const now = new Date().toISOString();
    const id = this.generateId();
    
    const result = await this.db!.query(
      `INSERT INTO pages (id, slug, title, type, compiled_truth, timeline, frontmatter, raw_content, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (slug) DO UPDATE SET
         title = EXCLUDED.title, type = EXCLUDED.type,
         compiled_truth = EXCLUDED.compiled_truth, timeline = EXCLUDED.timeline,
         frontmatter = EXCLUDED.frontmatter, raw_content = EXCLUDED.raw_content,
         updated_at = EXCLUDED.updated_at, version = pages.version + 1
       RETURNING *`,
      [id, slug, page.title || '', page.type || 'note', page.compiled_truth || '',
       page.timeline || '', JSON.stringify(page.frontmatter || {}), page.raw_content || '', now]
    );
    return this.mapPage(result.rows[0]);
  }

  async getPage(slug: string): Promise<Page | null> {
    const result = await this.db!.query('SELECT * FROM pages WHERE slug = $1', [slug]);
    return result.rows[0] ? this.mapPage(result.rows[0]) : null;
  }

  async deletePage(slug: string): Promise<void> {
    // Get page ID first
    const page = await this.db!.query('SELECT id FROM pages WHERE slug = $1', [slug]);
    if (page.rows[0]) {
      // Delete chunks from vector store
      const chunks = await this.db!.query('SELECT id FROM content_chunks WHERE page_id = $1', [page.rows[0].id]);
      for (const chunk of chunks.rows) {
        // Vector store doesn't have a direct remove, but we can rebuild on next load
      }
    }
    await this.db!.query('DELETE FROM pages WHERE slug = $1', [slug]);
  }

  async listPages(options?: { type?: string; limit?: number; offset?: number }): Promise<Page[]> {
    let sql = 'SELECT * FROM pages';
    const params: unknown[] = [];
    if (options?.type) {
      sql += ' WHERE type = $1';
      params.push(options.type);
    }
    sql += ' ORDER BY updated_at DESC';
    if (options?.limit) {
      sql += ` LIMIT ${options.limit}`;
    }
    const result = await this.db!.query(sql, params);
    return result.rows.map(this.mapPage.bind(this));
  }

  // 分块操作 - 支持向量
  async upsertChunks(pageId: string, chunks: Partial<Chunk>[]): Promise<void> {
    for (const chunk of chunks) {
      const id = chunk.id || this.generateId();
      
      // Store in PGlite with embedding as JSON string
      await this.db!.query(
        `INSERT INTO content_chunks (id, page_id, chunk_text, embedding, embedding_model, position)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           chunk_text = EXCLUDED.chunk_text`,
        [id, pageId, chunk.chunk_text || '',
         chunk.embedding ? JSON.stringify(chunk.embedding) : null,
         chunk.embedding_model || null, chunk.position || 0]
      );
      
      // Add to vector store if embedding exists
      if (chunk.embedding) {
        this.vectorStore.add(id, chunk.embedding, {
          page_id: pageId,
          chunk_text: chunk.chunk_text,
        });
      }
    }
  }

  async getChunksByPage(pageId: string): Promise<Chunk[]> {
    const result = await this.db!.query(
      'SELECT * FROM content_chunks WHERE page_id = $1 ORDER BY position',
      [pageId]
    );
    return result.rows.map(this.mapChunk.bind(this));
  }

  // 关键词搜索
  async searchKeyword(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const limit = options?.limit || 10;
    const result = await this.db!.query(
      `SELECT slug, title, raw_content, type FROM pages 
       WHERE title LIKE $1 OR raw_content LIKE $1
       LIMIT ${limit}`,
      [`%${query}%`]
    );
    return result.rows.map(row => ({
      slug: row.slug,
      title: row.title,
      chunk_text: row.raw_content || '',
      score: 1,
      stale: false,
      page_type: row.type,
    }));
  }

  // 向量搜索 - 使用内存向量存储
  async searchVector(embedding: number[], options?: SearchOptions): Promise<SearchResult[]> {
    const limit = options?.limit || 10;
    
    // Search in-memory vector store
    const results = this.vectorStore.search(embedding, limit);
    
    if (results.length === 0) {
      return [];
    }
    
    // Enrich with page info from database
    const searchResults: SearchResult[] = [];
    
    for (const result of results) {
      const chunkId = result.id;
      const chunkResult = await this.db!.query(
        `SELECT c.chunk_text, c.page_id, p.slug, p.title, p.type 
         FROM content_chunks c 
         JOIN pages p ON p.id = c.page_id 
         WHERE c.id = $1`,
        [chunkId]
      );
      
      if (chunkResult.rows[0]) {
        const row = chunkResult.rows[0];
        searchResults.push({
          slug: row.slug,
          title: row.title,
          chunk_text: row.chunk_text,
          score: result.score,
          stale: false,
          page_type: row.type,
        });
      }
    }
    
    return searchResults;
  }

  // 标签
  async addTag(pageId: string, tagName: string): Promise<Tag> {
    const tagId = this.generateId();
    try {
      await this.db!.query('INSERT INTO tags (id, name) VALUES ($1, $2)', [tagId, tagName]);
    } catch {
      // Already exists
    }
    const tag = await this.db!.query('SELECT * FROM tags WHERE name = $1', [tagName]);
    await this.db!.query(
      'INSERT INTO page_tags (page_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [pageId, tag.rows[0].id]
    );
    return { id: tag.rows[0].id, name: tag.rows[0].name, color: tag.rows[0].color || '#666' };
  }

  async removeTag(pageId: string, tagId: string): Promise<void> {
    await this.db!.query('DELETE FROM page_tags WHERE page_id = $1 AND tag_id = $2', [pageId, tagId]);
  }

  async getTagsByPage(pageId: string): Promise<Tag[]> {
    const result = await this.db!.query(
      'SELECT t.* FROM tags t JOIN page_tags pt ON pt.tag_id = t.id WHERE pt.page_id = $1',
      [pageId]
    );
    return result.rows.map(row => ({ id: row.id, name: row.name, color: row.color || '#666' }));
  }

  // 链接
  async addLink(fromPageId: string, toPageId: string, context?: string): Promise<Link> {
    const id = this.generateId();
    const result = await this.db!.query(
      `INSERT INTO links (id, from_page_id, to_page_id, context)
       VALUES ($1, $2, $3, $4) ON CONFLICT (from_page_id, to_page_id) DO UPDATE SET context = EXCLUDED.context
       RETURNING *`,
      [id, fromPageId, toPageId, context || null]
    );
    return this.mapLink(result.rows[0]);
  }

  async removeLink(linkId: string): Promise<void> {
    await this.db!.query('DELETE FROM links WHERE id = $1', [linkId]);
  }

  async getLinksByPage(pageId: string): Promise<Link[]> {
    const result = await this.db!.query('SELECT * FROM links WHERE from_page_id = $1', [pageId]);
    return result.rows.map(this.mapLink.bind(this));
  }

  // 时间线
  async addTimelineEntry(pageId: string, entry: Partial<TimelineEntry>): Promise<TimelineEntry> {
    const id = this.generateId();
    const result = await this.db!.query(
      'INSERT INTO timeline_entries (id, page_id, date, summary, detail) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [id, pageId, entry.date || null, entry.summary, entry.detail || null]
    );
    return this.mapTimeline(result.rows[0]);
  }

  async getTimelineByPage(pageId: string): Promise<TimelineEntry[]> {
    const result = await this.db!.query(
      'SELECT * FROM timeline_entries WHERE page_id = $1 ORDER BY date DESC',
      [pageId]
    );
    return result.rows.map(this.mapTimeline.bind(this));
  }

  // 健康检查
  async getHealth(): Promise<HealthReport> {
    const metrics = { totalPages: 0, totalChunks: 0, embedCoverage: 0, staleChunks: 0, orphanPages: 0, deadLinks: 0 };
    try {
      const pc = await this.db!.query('SELECT COUNT(*) as c FROM pages');
      metrics.totalPages = Number(pc.rows[0]?.c || 0);
      
      const cc = await this.db!.query('SELECT COUNT(*) as c FROM content_chunks');
      metrics.totalChunks = Number(cc.rows[0]?.c || 0);
      
      // Calculate embed coverage
      const ec = await this.db!.query('SELECT COUNT(*) as c FROM content_chunks WHERE embedding IS NOT NULL');
      const embedded = Number(ec.rows[0]?.c || 0);
      metrics.embedCoverage = metrics.totalChunks > 0 ? (embedded / metrics.totalChunks) * 100 : 0;
      
      // Vector store size
      const vectorCount = this.vectorStore.size;
      
      logger.info(`Health: ${metrics.totalPages} pages, ${metrics.totalChunks} chunks, ${vectorCount} vectors`);
    } catch (e) {
      logger.error(`Health check error: ${e}`);
    }
    
    return {
      status: 'healthy',
      checks: {
        engine: { ok: this.connected, message: this.connected ? 'Connected' : 'Disconnected' },
        embedding: { ok: true, message: `Vector store: ${this.vectorStore.size} vectors` },
        storage: { ok: true, message: 'OK' },
      },
      metrics,
      issues: [],
    };
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    const result = await this.db!.query(sql, params);
    return result.rows as T[];
  }

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
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      version: row.version,
    };
  }

  private mapChunk(row: any): Chunk {
    return {
      id: row.id,
      page_id: row.page_id,
      chunk_text: row.chunk_text,
      embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
      embedding_model: row.embedding_model,
      position: row.position,
      created_at: new Date(row.created_at),
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
