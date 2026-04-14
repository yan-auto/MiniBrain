// 错误代码
export enum ErrorCode {
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION = 'VALIDATION',
  DB_ERROR = 'DB_ERROR',
  EMBEDDING_ERROR = 'EMBEDDING_ERROR',
  CONFIG_ERROR = 'CONFIG_ERROR',
  INTERNAL = 'INTERNAL',
}

// 可恢复错误
export const RETRYABLE_ERRORS = new Set([
  ErrorCode.EMBEDDING_ERROR,
  ErrorCode.DB_ERROR,
]);

// BrainError
export class BrainError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public retryable: boolean = RETRYABLE_ERRORS.has(code),
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'BrainError';
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      retryable: this.retryable,
      ...this.details,
    };
  }
}

// 便捷错误构造
export class NotFoundError extends BrainError {
  constructor(resource: string, id: string) {
    super(`${resource} '${id}' not found`, ErrorCode.NOT_FOUND, false);
  }
}

export class ValidationError extends BrainError {
  constructor(message: string, field?: string) {
    super(message, ErrorCode.VALIDATION, false, { field });
  }
}

// 搜索结果
export interface SearchResult {
  slug: string;
  title: string;
  chunk_text: string;
  score: number;
  stale: boolean;
  page_type?: string;
}

// 页面
export interface Page {
  id: string;
  slug: string;
  title: string;
  type: string;
  compiled_truth?: string;
  timeline?: string;
  frontmatter: Record<string, unknown>;
  raw_content?: string;
  created_at: Date;
  updated_at: Date;
  version: number;
}

// 分块
export interface Chunk {
  id: string;
  page_id: string;
  chunk_text: string;
  embedding?: number[];
  embedding_model?: string;
  position: number;
  created_at: Date;
}

// 标签
export interface Tag {
  id: string;
  name: string;
  color: string;
}

// 链接
export interface Link {
  id: string;
  from_page_id: string;
  to_page_id: string;
  context?: string;
  created_at: Date;
}

// 时间线
export interface TimelineEntry {
  id: string;
  page_id: string;
  date?: Date;
  summary: string;
  detail?: string;
  created_at: Date;
}

// 健康检查报告
export interface HealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    engine: { ok: boolean; message: string };
    embedding: { ok: boolean; message: string };
    storage: { ok: boolean; message: string };
  };
  metrics: {
    totalPages: number;
    totalChunks: number;
    embedCoverage: number;
    staleChunks: number;
    orphanPages: number;
    deadLinks: number;
  };
  issues: string[];
}

// 配置
export interface BrainConfig {
  version: number;
  dataDir: string;
  engine: 'postgres' | 'pglite';
  embedding: {
    provider: string;
    model: string;
    dimensions: number;
  };
  llm: {
    provider: string;
    model: string;
  };
  search: {
    defaultLimit: number;
    rrfK: number;
    dedup: {
      similarityThreshold: number;
      maxPerPage: number;
    };
  };
  sync: {
    autoEmbed: boolean;
    embedInterval: number;
  };
}

// 搜索选项
export interface SearchOptions {
  limit?: number;
  offset?: number;
  type?: string;
}
