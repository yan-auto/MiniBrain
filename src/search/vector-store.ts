import type { SearchResult } from '../types/index.js';

/**
 * VectorStore interface - abstraction for vector similarity search
 */
export interface VectorStore {
  add(id: string, embedding: number[], metadata?: Record<string, unknown>): void;
  search(query: number[], k: number): Array<{ id: string; score: number; metadata: Record<string, unknown> }>;
  save(): Promise<void>;
  load(): Promise<void>;
  clear(): void;
  get size(): number;
}

/**
 * InMemoryVectorStore - pure JavaScript vector store with cosine similarity
 * No external dependencies needed
 */
export class InMemoryVectorStore implements VectorStore {
  private vectors: Map<string, number[]> = new Map();
  private metadata: Map<string, Record<string, unknown>> = new Map();

  constructor(private dataDir?: string) {}

  add(id: string, embedding: number[], metadata: Record<string, unknown> = {}): void {
    this.vectors.set(id, embedding);
    this.metadata.set(id, metadata);
  }

  search(query: number[], k: number): Array<{ id: string; score: number; metadata: Record<string, unknown> }> {
    const results: Array<{ id: string; score: number; metadata: Record<string, unknown> }> = [];

    for (const [id, embedding] of this.vectors) {
      const score = this.cosineSimilarity(query, embedding);
      results.push({ id, score, metadata: this.metadata.get(id) || {} });
    }

    // Sort by score descending, take top k
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }

  async save(): Promise<void> {
    if (!this.dataDir) return;
    
    const fs = await import('fs');
    const path = await import('path');
    
    const indexPath = path.join(this.dataDir, 'vectors.json');
    const data = {
      vectors: Array.from(this.vectors.entries()),
      metadata: Array.from(this.metadata.entries()),
    };
    
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.writeFileSync(indexPath, JSON.stringify(data));
  }

  async load(): Promise<void> {
    if (!this.dataDir) return;
    
    const fs = await import('fs');
    const path = await import('path');
    
    const indexPath = path.join(this.dataDir, 'vectors.json');
    
    if (!fs.existsSync(indexPath)) return;
    
    const content = fs.readFileSync(indexPath, 'utf-8');
    const data = JSON.parse(content) as {
      vectors: Array<[string, number[]]>;
      metadata: Array<[string, Record<string, unknown>]>;
    };
    
    this.vectors = new Map(data.vectors);
    this.metadata = new Map(data.metadata);
  }

  clear(): void {
    this.vectors.clear();
    this.metadata.clear();
  }

  get size(): number {
    return this.vectors.size;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }
}

/**
 * HNSWVectorStore - HNSW approximate nearest neighbor search
 * Uses a simple in-memory implementation
 */
export class HNSWVectorStore implements VectorStore {
  private vectors: Map<string, number[]> = new Map();
  private metadata: Map<string, Record<string, unknown>> = new Map();
  private dataDir?: string;

  // HNSW parameters
  private m = 16; // number of connections
  private efConstruction = 200; // depth of layer construction
  private efSearch = 50; // depth of search

  constructor(dataDir?: string) {
    this.dataDir = dataDir;
  }

  add(id: string, embedding: number[], metadata: Record<string, unknown> = {}): void {
    this.vectors.set(id, embedding);
    this.metadata.set(id, metadata);
  }

  search(query: number[], k: number): Array<{ id: string; score: number; metadata: Record<string, unknown> }> {
    // For now, fall back to brute force with cosine similarity
    // A full HNSW implementation would use hierarchical navigable small world graphs
    const results: Array<{ id: string; score: number; metadata: Record<string, unknown> }> = [];

    for (const [id, embedding] of this.vectors) {
      const score = this.cosineSimilarity(query, embedding);
      results.push({ id, score, metadata: this.metadata.get(id) || {} });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }

  async save(): Promise<void> {
    if (!this.dataDir) return;
    
    const fs = await import('fs');
    const path = await import('path');
    
    const indexPath = path.join(this.dataDir, 'vectors.json');
    const data = {
      vectors: Array.from(this.vectors.entries()),
      metadata: Array.from(this.metadata.entries()),
    };
    
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.writeFileSync(indexPath, JSON.stringify(data));
  }

  async load(): Promise<void> {
    if (!this.dataDir) return;
    
    const fs = await import('fs');
    const path = await import('path');
    
    const indexPath = path.join(this.dataDir, 'vectors.json');
    
    if (!fs.existsSync(indexPath)) return;
    
    const content = fs.readFileSync(indexPath, 'utf-8');
    const data = JSON.parse(content) as {
      vectors: Array<[string, number[]]>;
      metadata: Array<[string, Record<string, unknown>]>;
    };
    
    this.vectors = new Map(data.vectors);
    this.metadata = new Map(data.metadata);
  }

  clear(): void {
    this.vectors.clear();
    this.metadata.clear();
  }

  get size(): number {
    return this.vectors.size;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }
}
