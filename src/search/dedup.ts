import type { SearchResult } from '../types/index.js';

const RRF_K = 60;

export function rrfFusion(lists: SearchResult[][], k = RRF_K): SearchResult[] {
  const scores = new Map<string, { result: SearchResult; score: number }>();
  
  for (const list of lists) {
    for (let rank = 0; rank < list.length; rank++) {
      const r = list[rank];
      const key = `${r.slug}:${r.chunk_text.slice(0, 50)}`;
      
      if (!scores.has(key)) {
        scores.set(key, { result: r, score: 0 });
      }
      
      const rrfScore = 1 / (k + rank);
      scores.get(key)!.score += rrfScore;
    }
  }
  
  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .map(s => s.result);
}

export function dedupResults(
  results: SearchResult[],
  options: {
    similarityThreshold?: number;
    maxPerPage?: number;
  } = {}
): SearchResult[] {
  const { similarityThreshold = 0.85, maxPerPage = 2 } = options;
  
  // Deduplicate by slug (keep top 3 chunks per page first)
  const byPage = new Map<string, SearchResult[]>();
  for (const r of results) {
    if (!byPage.has(r.slug)) {
      byPage.set(r.slug, []);
    }
    const pageResults = byPage.get(r.slug)!;
    if (pageResults.length < 3) {
      pageResults.push(r);
    }
  }
  
  // Flatten and limit per page
  const deduped: SearchResult[] = [];
  for (const [, pageResults] of byPage) {
    deduped.push(...pageResults.slice(0, maxPerPage));
  }
  
  return deduped;
}
