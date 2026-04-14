import { PostgresEngine } from './postgres-engine.js';
import { PGliteEngine } from './pglite-engine.js';
import type { BrainEngine, EngineConfig } from './interface.js';
import { logger } from '../utils/logger.js';

export function createEngine(config: EngineConfig): BrainEngine {
  switch (config.type) {
    case 'postgres':
      return new PostgresEngine(config);
    case 'pglite':
      return new PGliteEngine({ dataDir: config.connectionString || './brain.db' });
    default:
      logger.warn(`Unknown engine type '${config.type}', defaulting to postgres`);
      return new PostgresEngine(config);
  }
}
