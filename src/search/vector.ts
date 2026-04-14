import type { SearchResult, SearchOptions } from '../types/index.js';
import type { BrainEngine } from '../engine/interface.js';
import type { EmbeddingProvider } from '../embedding/provider.js';
import { logger } from '../utils/logger.js';

export async function searchVector(
  engine: BrainEngine,
  embedding: number[],
  options?: SearchOptions
): Promise<SearchResult[]> {
  try {
    return await engine.searchVector(embedding, options);
  } catch (e) {
    logger.warn(`Vector search failed: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}
