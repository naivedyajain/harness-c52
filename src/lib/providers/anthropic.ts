import { fetchJson } from '../http';
import { AppError } from '../errors';

export async function chatAnthropic(args: {
  apiKey: string;
  model: string;
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens: number;
  signal?: AbortSignal;
}): Promise<{ text: string; usage?: { input: number; output: number } }> {
  const { apiKey, model, system, messages, maxTokens, signal } = args;

  const headers = {
    'x-api-key': apiKey.trim(),
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
    'Content-Type': 'application/json',
  };

  const buildBody = (tokens: number) => {
    const body: any = {
      model,
      max_tokens: tokens,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    };
    if (system.trim()) {
      body.system = system.trim();
    }
    return body;
  };

  let data: any;
  try {
    data = await fetchJson<any>(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers,
        body: JSON.stringify(buildBody(maxTokens)),
      },
      { timeoutMs: 120000, provider: 'Anthropic', signal }
    );
  } catch (err: any) {
    if (
      err instanceof AppError &&
      err.status === 400 &&
      err.rawMessage &&
      err.rawMessage.toLowerCase().includes('max_tokens') &&
      maxTokens !== 4096
    ) {
      // Retry once with 4096 tokens
      data = await fetchJson<any>(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers,
          body: JSON.stringify(buildBody(4096)),
        },
        { timeoutMs: 120000, provider: 'Anthropic', signal }
      );
    } else {
      throw err;
    }
  }

  const contentItems = data.content || [];
  let text = contentItems
    .filter((c: any) => c.type === 'text')
    .map((c: any) => c.text)
    .join('');

  if (!text) {
    throw new AppError('bad_response', 'Empty reply from Anthropic');
  }

  if (data.stop_reason === 'max_tokens') {
    text += '\n\n_(Reply cut off at the length limit — raise "Max reply length" in Settings.)_';
  }

  const usage = data.usage
    ? {
        input: data.usage.input_tokens ?? 0,
        output: data.usage.output_tokens ?? 0,
      }
    : undefined;

  return { text, usage };
}

export async function listAnthropicModels(apiKey: string): Promise<string[]> {
  const data = await fetchJson<any>(
    'https://api.anthropic.com/v1/models?limit=100',
    {
      method: 'GET',
      headers: {
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    },
    { timeoutMs: 30000, provider: 'Anthropic' }
  );

  const list: string[] = (data.data || []).map((m: any) => m.id);
  return list.sort((a, b) => a.localeCompare(b));
}
