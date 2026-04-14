export interface LLMProvider {
  readonly name: string;
  readonly apiKeyEnv: string;
  complete(prompt: string): Promise<string>;
}

export function hasLLMCredentials(): boolean {
  return !!(process.env.MINIMAX_API_KEY || process.env.OPENAI_API_KEY || process.env.DASHSCOPE_API_KEY);
}
