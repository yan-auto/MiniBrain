-- MiniBrain PGlite Schema v1 (with vector support)
-- Simplified for PGlite compatibility

CREATE TABLE IF NOT EXISTS pages (
  id             TEXT PRIMARY KEY,
  slug           TEXT UNIQUE NOT NULL,
  title          TEXT,
  type           TEXT DEFAULT 'note',
  compiled_truth TEXT,
  timeline       TEXT,
  frontmatter    TEXT DEFAULT '{}',
  raw_content    TEXT,
  created_at     TEXT DEFAULT (CURRENT_TIMESTAMP),
  updated_at     TEXT DEFAULT (CURRENT_TIMESTAMP),
  version        INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS content_chunks (
  id              TEXT PRIMARY KEY,
  page_id         TEXT NOT NULL,
  chunk_text      TEXT NOT NULL,
  embedding       TEXT,
  embedding_model TEXT,
  position        INTEGER DEFAULT 0,
  created_at      TEXT DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS links (
  id          TEXT PRIMARY KEY,
  from_page_id TEXT NOT NULL,
  to_page_id   TEXT NOT NULL,
  context     TEXT,
  created_at  TEXT DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE(from_page_id, to_page_id)
);

CREATE TABLE IF NOT EXISTS tags (
  id    TEXT PRIMARY KEY,
  name  TEXT UNIQUE NOT NULL,
  color TEXT DEFAULT '#666'
);

CREATE TABLE IF NOT EXISTS page_tags (
  page_id TEXT NOT NULL,
  tag_id  TEXT NOT NULL,
  PRIMARY KEY(page_id, tag_id)
);

CREATE TABLE IF NOT EXISTS timeline_entries (
  id         TEXT PRIMARY KEY,
  page_id    TEXT NOT NULL,
  date       TEXT,
  summary    TEXT NOT NULL,
  detail     TEXT,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS page_versions (
  id         TEXT PRIMARY KEY,
  page_id    TEXT NOT NULL,
  version    INTEGER,
  content    TEXT,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS config (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS schema_version (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_pages_slug ON pages(slug);
CREATE INDEX IF NOT EXISTS idx_pages_type ON pages(type);
CREATE INDEX IF NOT EXISTS idx_pages_updated ON pages(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chunks_page ON content_chunks(page_id);
CREATE INDEX IF NOT EXISTS idx_links_from ON links(from_page_id);
CREATE INDEX IF NOT EXISTS idx_links_to ON links(to_page_id);
CREATE INDEX IF NOT EXISTS idx_timeline_page ON timeline_entries(page_id);
