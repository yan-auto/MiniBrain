import type { SearchResult, SearchOptions } from '../types/index.js';
import type { BrainEngine } from '../engine/interface.js';
import type { EmbeddingProvider } from '../embedding/provider.js';
import { searchKeyword } from './keyword.js';
import { searchVector } from './vector.js';
import { rrfFusion, dedupResults } from './dedup.js';
import { hasEmbeddingCredentials } from '../embedding/provider.js';
import { logger } from '../utils/logger.js';

export async function hybridSearch(
  engine: BrainEngine,
  embeddingProvider: EmbeddingProvider,
  query: string,
  options?: SearchOptions
): Promise<SearchResult[]> {
  // 1. Always do keyword search (no API key needed)
  const keywordResults = await searchKeyword(engine, query, options);
  
  // 2. If no embedding credentials, return keyword-only results
  if (!hasEmbeddingCredentials()) {
    logger.warn('No embedding credentials, using keyword-only search');
    return dedupResults(keywordResults, options);
  }
  
  // 3. Try embedding search
  try {
    const embedding = await embeddingProvider.embed(query);
    const vectorResults = await searchVector(engine, embedding, options);
    
    // 4. RRF fusion
    const fused = rrfFusion([keywordResults, vectorResults]);
    
    // 5. Deduplicate
    return dedupResults(fused, options);
  } catch (e) {
    logger.warn(`Embedding search failed, falling back to keyword: ${e instanceof Error ? e.message : String(e)}`);
    return dedupResults(keywordResults, options);
  }
}
