import type { EmbeddingProvider } from './provider.js';

export class DashScopeProvider implements EmbeddingProvider {
  readonly name = 'dashscope';
  readonly dimensions = 1536;
  readonly apiKeyEnv = 'DASHSCOPE_API_KEY';

  private getModel(): string {
    return process.env.EMBEDDING_MODEL || 'text-embedding-v3';
  }

  private getBaseUrl(): string | undefined {
    return process.env.EMBEDDING_BASE_URL?.replace(/\/$/, '');
  }

  private extractEmbeddings(data: any): number[][] {
    // OpenAI-compatible shape: { data: [{ embedding: [...] }] }
    if (Array.isArray(data?.data)) {
      const arr = data.data
        .map((item: any) => item?.embedding)
        .filter((v: unknown) => Array.isArray(v));
      if (arr.length > 0) return arr;
    }

    // DashScope native fallback shapes
    if (Array.isArray(data?.output?.embeddings)) {
      const arr = data.output.embeddings
        .map((item: any) => item?.embedding || item?.vector)
        .filter((v: unknown) => Array.isArray(v));
      if (arr.length > 0) return arr;
    }

    throw new Error('DashScope response missing embeddings');
  }

  private async requestEmbeddings(texts: string[]): Promise<number[][]> {
    const apiKey = process.env[this.apiKeyEnv];
    if (!apiKey) {
      throw new Error(`Missing ${this.apiKeyEnv}`);
    }

    const model = this.getModel();
    const baseUrl = this.getBaseUrl();

    const requestUrl = baseUrl
      ? `${baseUrl}/embeddings`
      : 'https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding';

    const body = baseUrl
      ? { model, input: texts.length === 1 ? texts[0] : texts }
      : { model, input: texts.length === 1 ? texts[0] : texts };

    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`DashScope API error: ${response.status}${errorText ? ` - ${errorText}` : ''}`);
    }

    const data = await response.json() as any;
    return this.extractEmbeddings(data);
  }
  
  async embed(text: string): Promise<number[]> {
    const vectors = await this.requestEmbeddings([text]);
    return vectors[0];
  }
  
  async embedBatch(texts: string[]): Promise<number[][]> {
    return this.requestEmbeddings(texts);
  }
}
