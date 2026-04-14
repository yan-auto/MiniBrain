import { EmbeddingProvider, hasEmbeddingCredentials } from './provider.js';
import { DashScopeProvider } from './dashscope.js';
import { OpenAIProvider } from './openai.js';
import { MiniMaxProvider } from './minimax.js';
import { logger } from '../utils/logger.js';

export { EmbeddingProvider, hasEmbeddingCredentials } from './provider.js';

const providers: Record<string, () => EmbeddingProvider> = {
  dashscope: () => new DashScopeProvider(),
  openai: () => new OpenAIProvider(),
  minimax: () => new MiniMaxProvider(),
};

export function createEmbeddingProvider(): EmbeddingProvider {
  const selected = process.env.EMBEDDING_PROVIDER || 'dashscope';
  const factory = providers[selected.toLowerCase()];
  
  if (!factory) {
    logger.warn(`Unknown provider '${selected}', using dashscope (default)`);
    return new DashScopeProvider();
  }
  
  return factory();
}

export function listProviders(): { name: string; dimensions: number; apiKey: string }[] {
  return [
    { name: 'dashscope (阿里云) [默认]', dimensions: 1536, apiKey: 'DASHSCOPE_API_KEY' },
    { name: 'openai', dimensions: 1536, apiKey: 'OPENAI_API_KEY' },
    { name: 'minimax', dimensions: 1024, apiKey: 'MINIMAX_API_KEY' },
  ];
}
