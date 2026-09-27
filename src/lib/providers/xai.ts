import { fetchJson } from '../http';
import { AppError } from '../errors';

export async function chatXAI(args: {
  apiKey: string;
  model: string;
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  signal?: AbortSignal;
}): Promise<{ text: string; usage?: { input: number; output: number } }> {
  const { apiKey, model, system, messages, signal } = args;

  const formattedMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];
  if (system.trim()) {
    formattedMessages.push({ role: 'system', content: system.trim() });
  }
  for (const m of messages) {
    formattedMessages.push({ role: m.role, content: m.content });
  }

  const payload: any = {
    model,
    messages: formattedMessages,
  };

  let data: any;
  try {
    data = await fetchJson<any>(
      'https://api.x.ai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      { timeoutMs: 120000, provider: 'xAI Grok', signal }
    );
  } catch (err: any) {
    // If specific grok-4 alias is not active on this account, fallback to grok-2/grok-beta
    if (model.includes('grok-4') && (err?.status === 404 || err?.message?.includes('not found') || err?.message?.includes('model'))) {
      payload.model = model.includes('mini') ? 'grok-2-mini' : 'grok-2';
      data = await fetchJson<any>(
        'https://api.x.ai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey.trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
        { timeoutMs: 120000, provider: 'xAI Grok', signal }
      );
    } else {
      throw err;
    }
  }

  const choice = data.choices && data.choices[0];
  const text = choice && choice.message && choice.message.content;

  if (text === null || text === undefined || text === '') {
    throw new AppError('bad_response', 'Empty reply from xAI');
  }

  const usage = data.usage
    ? {
        input: data.usage.prompt_tokens ?? 0,
        output: data.usage.completion_tokens ?? 0,
      }
    : undefined;

  return { text, usage };
}

export async function listXAIModels(apiKey: string): Promise<string[]> {
  try {
    const data = await fetchJson<any>(
      'https://api.x.ai/v1/models',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
        },
      },
      { timeoutMs: 30000, provider: 'xAI Grok' }
    );

    const list: string[] = (data.data || []).map((m: any) => m.id);
    const excludedKeywords = ['image', 'vision-beta', 'imagine'];

    const filtered = list.filter((id) => {
      const lower = id.toLowerCase();
      if (!lower.includes('grok')) return false;
      return !excludedKeywords.some((kw) => lower.includes(kw));
    });

    if (filtered.length > 0) {
      // Ensure grok-4 series is recognized if present or prepend
      return filtered.sort((a, b) => a.localeCompare(b));
    }
    return ['grok-4', 'grok-4-mini', 'grok-3', 'grok-2', 'grok-2-mini', 'grok-beta'];
  } catch (err: any) {
    if (err?.status === 403 || err?.status === 404 || err?.status === 429) {
      return ['grok-4', 'grok-4-mini', 'grok-3', 'grok-2', 'grok-2-mini', 'grok-beta'];
    }
    throw err;
  }
}
