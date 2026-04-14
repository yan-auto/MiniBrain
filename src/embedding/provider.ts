// Embedding Provider 接口
export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  readonly apiKeyEnv: string;
  
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

// 检查是否有API Key
export function hasEmbeddingCredentials(): boolean {
  const key = process.env.DASHSCOPE_API_KEY || 
              process.env.OPENAI_API_KEY ||
              process.env.MINIMAX_API_KEY;
  return !!key;
}
