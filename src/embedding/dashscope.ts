import type { EmbeddingProvider } from './provider.js';

export class DashScopeProvider implements EmbeddingProvider {
  readonly name = 'dashscope';
  readonly dimensions = 1536;
  readonly apiKeyEnv = 'DASHSCOPE_API_KEY';
  
  async embed(text: string): Promise<number[]> {
    const apiKey = process.env[this.apiKeyEnv];
    if (!apiKey) {
      throw new Error(`Missing ${this.apiKeyEnv}`);
    }
    
    const response = await fetch(
      'https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: text,
          model: 'text-embedding-v3',
        }),
      }
    );
    
    if (!response.ok) {
      throw new Error(`DashScope API error: ${response.status}`);
    }
    
    const data = await response.json() as any;
    return data.data[0].embedding;
  }
  
  async embedBatch(texts: string[]): Promise<number[][]> {
    const apiKey = process.env[this.apiKeyEnv];
    if (!apiKey) {
      throw new Error(`Missing ${this.apiKeyEnv}`);
    }
    
    const response = await fetch(
      'https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: texts,
          model: 'text-embedding-v3',
        }),
      }
    );
    
    if (!response.ok) {
      throw new Error(`DashScope API error: ${response.status}`);
    }
    
    const data = await response.json() as any;
    return data.data.map((item: any) => item.embedding);
  }
}
