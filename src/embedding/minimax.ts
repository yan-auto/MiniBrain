import type { EmbeddingProvider } from './provider.js';

export class MiniMaxProvider implements EmbeddingProvider {
  readonly name = 'minimax';
  readonly dimensions = 1024;
  readonly apiKeyEnv = 'MINIMAX_API_KEY';
  
  async embed(text: string): Promise<number[]> {
    const apiKey = process.env[this.apiKeyEnv];
    if (!apiKey) {
      throw new Error(`Missing ${this.apiKeyEnv}`);
    }
    
    const response = await fetch('https://api.minimax.chat/v1/text/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'embo-01',
        texts: [{ text }],
      }),
    });
    
    if (!response.ok) {
      throw new Error(`MiniMax API error: ${response.status}`);
    }
    
    const data = await response.json() as any;
    return data.data[0].embedding;
  }
  
  async embedBatch(texts: string[]): Promise<number[][]> {
    const apiKey = process.env[this.apiKeyEnv];
    if (!apiKey) {
      throw new Error(`Missing ${this.apiKeyEnv}`);
    }
    
    const response = await fetch('https://api.minimax.chat/v1/text/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'embo-01',
        texts: texts.map(text => ({ text })),
      }),
    });
    
    if (!response.ok) {
      throw new Error(`MiniMax API error: ${response.status}`);
    }
    
    const data = await response.json() as any;
    return data.data.map((item: any) => item.embedding);
  }
}
