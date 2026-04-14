import type { LLMProvider } from './provider.js';

export class MiniMaxLLMProvider implements LLMProvider {
  readonly name = 'minimax';
  readonly apiKeyEnv = 'MINIMAX_API_KEY';

  async complete(prompt: string): Promise<string> {
    const apiKey = process.env[this.apiKeyEnv];
    if (!apiKey) throw new Error(`Missing ${this.apiKeyEnv}`);

    const response = await fetch('https://api.minimax.chat/v1/text/complete', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'MiniMax-Text-01',
        prompt,
        max_tokens: 256,
      }),
    });

    if (!response.ok) throw new Error(`MiniMax API error: ${response.status}`);
    const data = await response.json() as any;
    return data.data.choices[0].text;
  }
}
