import { fetchJson } from '../http';
import { AppError } from '../errors';

export async function chatOpenAI(args: {
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

  const data = await fetchJson<any>(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    { timeoutMs: 120000, provider: 'OpenAI', signal }
  );

  const choice = data.choices && data.choices[0];
  const text = choice && choice.message && choice.message.content;

  if (text === null || text === undefined || text === '') {
    throw new AppError('bad_response', 'Empty reply from OpenAI');
  }

  const usage = data.usage
    ? {
        input: data.usage.prompt_tokens ?? 0,
        output: data.usage.completion_tokens ?? 0,
      }
    : undefined;

  return { text, usage };
}

export async function listOpenAIModels(apiKey: string): Promise<string[]> {
  try {
    const data = await fetchJson<any>(
      'https://api.openai.com/v1/models',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
        },
      },
      { timeoutMs: 30000, provider: 'OpenAI' }
    );

    const list: string[] = (data.data || []).map((m: any) => m.id);
    const excludedKeywords = [
      'audio',
      'realtime',
      'tts',
      'transcribe',
      'image',
      'embedding',
      'search',
      'instruct',
      'moderation',
      'dall-e',
      'whisper',
      'codex',
    ];

    const filtered = list.filter((id) => {
      const lower = id.toLowerCase();
      const isChatPrefix =
        lower.startsWith('gpt-') ||
        lower.startsWith('o1') ||
        lower.startsWith('o3') ||
        lower.startsWith('o4') ||
        lower.startsWith('chatgpt-');
      if (!isChatPrefix) return false;
      return !excludedKeywords.some((kw) => lower.includes(kw));
    });

    if (filtered.length > 0) {
      return filtered.sort((a, b) => a.localeCompare(b));
    }
    return ['gpt-4o-mini', 'gpt-4o', 'o3-mini', 'o1', 'gpt-4-turbo'];
  } catch (err: any) {
    // If the key is scoped (e.g. project-restricted without models:read scope) or rate-limited on list,
    // don't reject the key if it's not a 401 invalid key. Return standard models!
    if (err?.status === 403 || err?.status === 404 || err?.status === 429) {
      return ['gpt-4o-mini', 'gpt-4o', 'o3-mini', 'o1', 'gpt-4-turbo'];
    }
    throw err;
  }
}
