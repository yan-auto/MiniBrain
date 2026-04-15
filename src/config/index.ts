import fs from 'fs';
import path from 'path';
import { BrainConfig, BrainError, ErrorCode } from '../types/index.js';
import { logger } from '../utils/logger.js';

const SCHEMA_VERSION = 1;

function getHomeDir(): string {
  return process.env.USERPROFILE || process.env.HOME || '~';
}

function expandHomeDir(inputPath: string): string {
  if (inputPath === '~') {
    return getHomeDir();
  }
  if (inputPath.startsWith('~/') || inputPath.startsWith('~\\')) {
    return path.join(getHomeDir(), inputPath.slice(2));
  }
  return inputPath;
}

const DEFAULT_CONFIG: BrainConfig = {
  version: SCHEMA_VERSION,
  dataDir: path.join(getHomeDir(), '.minibrain', 'data'),
  engine: 'pglite',
  embedding: {
    provider: 'dashscope',
    model: 'text-embedding-v3',
    dimensions: 1536,
  },
  llm: {
    provider: 'minimax',
    model: 'MiniMax-Text-01',
  },
  search: {
    defaultLimit: 10,
    rrfK: 60,
    dedup: {
      similarityThreshold: 0.85,
      maxPerPage: 2,
    },
  },
  sync: {
    autoEmbed: true,
    embedInterval: 15,
  },
};

export function getConfigDir(): string {
  const configured = process.env.MINIBRAIN_DIR || path.join(getHomeDir(), '.minibrain');
  return expandHomeDir(configured);
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), 'config.json');
}

export function loadConfig(): BrainConfig {
  const configPath = getConfigPath();

  // 如果配置文件不存在，返回默认配置
  if (!fs.existsSync(configPath)) {
    logger.warn(`Config file not found at ${configPath}, using defaults`);
    return DEFAULT_CONFIG;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);

    // 验证配置
    validateConfig(config);

    // 合并默认配置
    return mergeConfig(DEFAULT_CONFIG, config);
  } catch (e) {
    if (e instanceof BrainError) throw e;
    throw new BrainError(
      `Failed to load config: ${e instanceof Error ? e.message : String(e)}`,
      ErrorCode.CONFIG_ERROR
    );
  }
}

function validateConfig(config: unknown): asserts config is BrainConfig {
  if (typeof config !== 'object' || config === null) {
    throw new BrainError('Config must be an object', ErrorCode.CONFIG_ERROR);
  }

  const c = config as Record<string, unknown>;

  if (!c.embedding || typeof c.embedding !== 'object') {
    throw new BrainError('embedding.provider is required', ErrorCode.CONFIG_ERROR);
  }

  const emb = c.embedding as Record<string, unknown>;
  if (!emb.provider || typeof emb.provider !== 'string') {
    throw new BrainError('embedding.provider is required', ErrorCode.CONFIG_ERROR);
  }

  // 验证provider是有效的
  const validProviders = ['baidu', 'cohere', 'dashscope', 'huggingface', 'minimax', 'mistral', 'openai', 'vertex', 'zhipu'];
  if (!validProviders.includes(emb.provider as string)) {
    throw new BrainError(
      `Unknown embedding provider: ${emb.provider}. Valid: ${validProviders.join(', ')}`,
      ErrorCode.CONFIG_ERROR
    );
  }
}

function mergeConfig(defaults: BrainConfig, config: Partial<BrainConfig>): BrainConfig {
  const resolvedDataDir = config.dataDir
    ? expandHomeDir(config.dataDir)
    : defaults.dataDir;

  return {
    ...defaults,
    ...config,
    dataDir: resolvedDataDir,
    embedding: {
      ...defaults.embedding,
      ...(config.embedding || {}),
    },
    llm: {
      ...defaults.llm,
      ...(config.llm || {}),
    },
    search: {
      ...defaults.search,
      ...(config.search || {}),
      dedup: {
        ...defaults.search.dedup,
        ...(config.search?.dedup || {}),
      },
    },
    sync: {
      ...defaults.sync,
      ...(config.sync || {}),
    },
  };
}

export function saveConfig(config: BrainConfig): void {
  const configPath = getConfigPath();
  const configDir = getConfigDir();

  // 确保目录存在
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export function getSchemaVersion(): number {
  return SCHEMA_VERSION;
}
