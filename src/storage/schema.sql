-- MiniBrain Schema v1
-- 这个文件是PostgreSQL和PGlite共用的唯一源

-- 核心内容表
CREATE TABLE IF NOT EXISTS pages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           TEXT UNIQUE NOT NULL,
  title          TEXT,
  type           TEXT DEFAULT 'note',
  compiled_truth TEXT,
  timeline       TEXT,
  frontmatter    JSONB DEFAULT '{}',
  raw_content    TEXT,
  search_vector  tsvector,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  version        INTEGER DEFAULT 1
);

-- 分块表 (向量存储)
CREATE TABLE IF NOT EXISTS content_chunks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id         UUID REFERENCES pages(id) ON DELETE CASCADE,
  chunk_text      TEXT NOT NULL,
  embedding       vector(1536),
  embedding_model TEXT,
  position        INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 链接表
CREATE TABLE IF NOT EXISTS links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
  to_page_id   UUID REFERENCES pages(id) ON DELETE CASCADE,
  context     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(from_page_id, to_page_id)
);

-- 标签表
CREATE TABLE IF NOT EXISTS tags (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name  TEXT UNIQUE NOT NULL,
  color TEXT DEFAULT '#666'
);

CREATE TABLE IF NOT EXISTS page_tags (
  page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
  tag_id  UUID REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY(page_id, tag_id)
);

-- 时间线表
CREATE TABLE IF NOT EXISTS timeline_entries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id    UUID REFERENCES pages(id) ON DELETE CASCADE,
  date       DATE,
  summary    TEXT NOT NULL,
  detail     TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 版本历史
CREATE TABLE IF NOT EXISTS page_versions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id    UUID REFERENCES pages(id) ON DELETE CASCADE,
  version    INTEGER,
  content    JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 配置表
CREATE TABLE IF NOT EXISTS config (
  key        TEXT PRIMARY KEY,
  value      JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Schema版本表
CREATE TABLE IF NOT EXISTS schema_version (
  version    INTEGER PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_pages_slug ON pages(slug);
CREATE INDEX IF NOT EXISTS idx_pages_type ON pages(type);
CREATE INDEX IF NOT EXISTS idx_pages_updated ON pages(updated_at DESC);

-- 向量索引 (HNSW) - 只在pgvector支持时创建
DO $$
BEGIN
  IF current_setting('server_version_num')::integer >= 160000 THEN
    CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON content_chunks 
      USING hnsw (embedding vector_cosine_ops);
  END IF;
EXCEPTION WHEN undefined_function THEN
  -- pgvector not available
END $$;

-- 全文索引 (中文分词)
CREATE INDEX IF NOT EXISTS idx_pages_search ON pages USING gin (search_vector);

-- 其他索引
CREATE INDEX IF NOT EXISTS idx_links_from ON links(from_page_id);
CREATE INDEX IF NOT EXISTS idx_links_to ON links(to_page_id);
CREATE INDEX IF NOT EXISTS idx_timeline_page ON timeline_entries(page_id);

-- ========== 触发器 ==========

-- 更新全文索引
CREATE OR REPLACE FUNCTION update_page_search_vector()
RETURNS TRIGGER AS $$
DECLARE
  timeline_text TEXT;
  content_text TEXT;
BEGIN
  SELECT string_agg(summary || ' ' || COALESCE(detail, ''), ' ')
  INTO timeline_text
  FROM timeline_entries WHERE page_id = NEW.id;

  content_text := COALESCE(NEW.raw_content, '');

  NEW.search_vector :=
    setweight(to_tsvector('chinese', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('chinese', COALESCE(NEW.compiled_truth, '')), 'B') ||
    setweight(to_tsvector('chinese', COALESCE(content_text, '')), 'B') ||
    setweight(to_tsvector('chinese', COALESCE(timeline_text, '')), 'C');

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_page_search_vector ON pages;
CREATE TRIGGER trg_page_search_vector
  BEFORE INSERT OR UPDATE ON pages
  FOR EACH ROW EXECUTE FUNCTION update_page_search_vector();

-- 时间线变更时更新页面
CREATE OR REPLACE FUNCTION update_page_from_timeline()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE pages SET updated_at = NOW() WHERE id = NEW.page_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_timeline_update_page ON timeline_entries;
CREATE TRIGGER trg_timeline_update_page
  AFTER INSERT OR UPDATE OR DELETE ON timeline_entries
  FOR EACH ROW EXECUTE FUNCTION update_page_from_timeline();

-- 插入初始schema版本
INSERT INTO schema_version (version) VALUES (1) ON CONFLICT DO NOTHING;
