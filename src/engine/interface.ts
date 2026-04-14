import type { Page, Chunk, Tag, Link, TimelineEntry, HealthReport, SearchOptions, SearchResult } from '../types/index.js';

// Engine配置
export interface EngineConfig {
  type: 'postgres' | string;
  connectionString: string;
  maxConnections?: number;
  ssl?: boolean;
}

// Engine接口
export interface BrainEngine {
  // 连接管理
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  
  // Schema
  getSchemaVersion(): Promise<number | null>;
  runMigration(sql: string, version: number): Promise<void>;
  
  // 页面操作
  putPage(slug: string, page: Partial<Page>): Promise<Page>;
  getPage(slug: string): Promise<Page | null>;
  deletePage(slug: string): Promise<void>;
  listPages(options?: { type?: string; limit?: number; offset?: number }): Promise<Page[]>;
  
  // 分块操作
  upsertChunks(pageId: string, chunks: Partial<Chunk>[]): Promise<void>;
  getChunksByPage(pageId: string): Promise<Chunk[]>;
  
  // 搜索
  searchKeyword(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  searchVector(embedding: number[], options?: SearchOptions): Promise<SearchResult[]>;
  
  // 标签
  addTag(pageId: string, tagName: string): Promise<Tag>;
  removeTag(pageId: string, tagId: string): Promise<void>;
  getTagsByPage(pageId: string): Promise<Tag[]>;
  
  // 链接
  addLink(fromPageId: string, toPageId: string, context?: string): Promise<Link>;
  removeLink(linkId: string): Promise<void>;
  getLinksByPage(pageId: string): Promise<Link[]>;
  
  // 时间线
  addTimelineEntry(pageId: string, entry: Partial<TimelineEntry>): Promise<TimelineEntry>;
  getTimelineByPage(pageId: string): Promise<TimelineEntry[]>;
  
  // 健康检查
  getHealth(): Promise<HealthReport>;
  
  // 原始查询
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
}
