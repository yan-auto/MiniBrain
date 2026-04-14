import type { SearchResult, SearchOptions } from '../types/index.js';
import type { BrainEngine } from '../engine/interface.js';
import { logger } from '../utils/logger.js';

export async function searchKeyword(
  engine: BrainEngine,
  query: string,
  options?: SearchOptions
): Promise<SearchResult[]> {
  try {
    return await engine.searchKeyword(query, options);
  } catch (e) {
    logger.warn(`Keyword search failed: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}
