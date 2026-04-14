import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { logger } from '../utils/logger.js';

export interface MarkdownFile {
  slug: string;
  title: string;
  content: string;
  frontmatter: Record<string, unknown>;
  rawContent: string;
}

export function parseMarkdownFile(filePath: string): MarkdownFile {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = matter(content);
  
  // 从文件路径提取slug
  const basename = path.basename(filePath, path.extname(filePath));
  const slug = basename.toLowerCase().replace(/\s+/g, '-');

  return {
    slug,
    title: (parsed.data.title as string) || parsed.data.name || basename,
    content: parsed.content,
    frontmatter: parsed.data,
    rawContent: content,
  };
}

export function parseMarkdownDir(dirPath: string): MarkdownFile[] {
  const files: MarkdownFile[] = [];
  
  if (!fs.existsSync(dirPath)) {
    logger.warn(`Directory not found: ${dirPath}`);
    return files;
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.isFile() && /\.(md|markdown)$/i.test(entry.name)) {
      try {
        const file = parseMarkdownFile(path.join(dirPath, entry.name));
        files.push(file);
      } catch (e) {
        logger.warn(`Failed to parse ${entry.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return files;
}

export function chunkContent(content: string, maxChunkSize = 500): string[] {
  // 简单分块 - 按段落分割
  const paragraphs = content.split(/\n\n+/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const para of paragraphs) {
    if ((currentChunk + para).length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = para;
    } else {
      currentChunk += '\n\n' + para;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [content];
}
