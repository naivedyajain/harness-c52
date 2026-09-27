import { fetchJson } from '../http';
import { AppError } from '../errors';

export async function chatGemini(args: {
  apiKey: string;
  model: string;
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens: number;
  signal?: AbortSignal;
}): Promise<{ text: string; usage?: { input: number; output: number } }> {
  const { apiKey, model, system, messages, maxTokens, signal } = args;

  const cleanModel = model.replace(/^models\//, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cleanModel)}:generateContent`;

  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const payload: any = {
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens,
    },
  };

  if (system.trim()) {
    payload.systemInstruction = {
      parts: [{ text: system.trim() }],
    };
  }

  let data: any;
  try {
    data = await fetchJson<any>(
      url,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': apiKey.trim(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      { timeoutMs: 120000, provider: 'Google Gemini', signal }
    );
  } catch (err: any) {
    if (cleanModel.includes('gemini-3') && (err?.status === 404 || err?.message?.includes('not found'))) {
      const fallbackModel = cleanModel.includes('pro') ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
      const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(fallbackModel)}:generateContent`;
      data = await fetchJson<any>(
        fallbackUrl,
        {
          method: 'POST',
          headers: {
            'x-goog-api-key': apiKey.trim(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
        { timeoutMs: 120000, provider: 'Google Gemini', signal }
      );
    } else {
      throw err;
    }
  }

  if (data.promptFeedback && data.promptFeedback.blockReason) {
    throw new AppError('blocked', data.promptFeedback.blockReason);
  }

  const candidate = data.candidates && data.candidates[0];
  if (!candidate) {
    throw new AppError('bad_response', 'Gemini returned no response candidates');
  }

  if (candidate.finishReason === 'SAFETY') {
    throw new AppError('blocked', 'Safety filter was triggered.');
  }

  const parts = candidate.content?.parts || [];
  let text = parts
    .filter((p: any) => !p.thought && typeof p.text === 'string')
    .map((p: any) => p.text)
    .join('');

  if (!text) {
    throw new AppError('bad_response', 'Empty reply from Gemini');
  }

  if (candidate.finishReason === 'MAX_TOKENS') {
    text += '\n\n_(Reply cut off at the length limit — raise "Max reply length" in Settings.)_';
  }

  const usage = data.usageMetadata
    ? {
        input: data.usageMetadata.promptTokenCount ?? 0,
        output: data.usageMetadata.candidatesTokenCount ?? 0,
      }
    : undefined;

  return { text, usage };
}

export async function listGeminiModels(apiKey: string): Promise<string[]> {
  const data = await fetchJson<any>(
    'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
    {
      method: 'GET',
      headers: {
        'x-goog-api-key': apiKey.trim(),
      },
    },
    { timeoutMs: 30000, provider: 'Google Gemini' }
  );

  const rawModels: any[] = data.models || [];
  const excludedKeywords = ['embedding', 'tts', 'image', 'audio', 'live'];

  const filtered = rawModels
    .filter((m) => {
      const name = (m.name || '').toLowerCase();
      const methods = m.supportedGenerationMethods || [];
      if (!name.includes('gemini')) return false;
      if (!methods.includes('generateContent')) return false;
      return !excludedKeywords.some((kw) => name.includes(kw));
    })
    .map((m) => (m.name || '').replace(/^models\//, ''));

  return filtered.sort((a, b) => a.localeCompare(b));
}
