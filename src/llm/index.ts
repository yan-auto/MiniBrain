import { MiniMaxLLMProvider } from './minimax.js';
import { hasLLMCredentials, type LLMProvider } from './provider.js';
import { logger } from '../utils/logger.js';

export { hasLLMCredentials, type LLMProvider } from './provider.js';

export function createLLMProvider(): LLMProvider {
  const selected = process.env.LLM_PROVIDER || 'minimax';
  
  switch (selected.toLowerCase()) {
    case 'minimax':
      return new MiniMaxLLMProvider();
    default:
      logger.warn(`Unknown LLM provider '${selected}', using minimax`);
      return new MiniMaxLLMProvider();
  }
}
