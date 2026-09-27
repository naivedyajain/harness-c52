import { ProviderId } from '../../types';
import { chatOpenAI, listOpenAIModels } from './openai';
import { chatAnthropic, listAnthropicModels } from './anthropic';
import { chatGemini, listGeminiModels } from './gemini';
import { chatXAI, listXAIModels } from './xai';

export interface ChatArgs {
  provider: ProviderId;
  apiKey: string;
  model: string;
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens: number;
  signal?: AbortSignal;
}

export function cleanMessages(
  rawMessages: { role: 'user' | 'assistant'; content: string }[]
): { role: 'user' | 'assistant'; content: string }[] {
  // 1. Drop messages with empty content, and "Stopped." placeholders
  const filtered = rawMessages.filter(
    (m) => m && m.content && m.content.trim() !== '' && m.content.trim() !== 'Stopped.'
  );

  if (filtered.length === 0) {
    return [];
  }

  // 2. Merge consecutive messages with the same role (join with \n\n)
  const merged: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const msg of filtered) {
    if (merged.length > 0 && merged[merged.length - 1].role === msg.role) {
      merged[merged.length - 1].content += `\n\n${msg.content.trim()}`;
    } else {
      merged.push({ role: msg.role, content: msg.content.trim() });
    }
  }

  // 3. Make sure first message is user (drop leading assistant messages)
  while (merged.length > 0 && merged[0].role !== 'user') {
    merged.shift();
  }

  // 4. Make sure last message is user (drop trailing assistant messages)
  while (merged.length > 0 && merged[merged.length - 1].role !== 'user') {
    merged.pop();
  }

  return merged;
}

export async function chat(
  args: ChatArgs
): Promise<{ text: string; usage?: { input: number; output: number } }> {
  const cleaned = cleanMessages(args.messages);
  if (cleaned.length === 0) {
    throw new Error('No valid user messages to send.');
  }

  const dispatchArgs = {
    ...args,
    messages: cleaned,
  };

  switch (args.provider) {
    case 'openai':
      return chatOpenAI(dispatchArgs);
    case 'anthropic':
      return chatAnthropic(dispatchArgs);
    case 'gemini':
      return chatGemini(dispatchArgs);
    case 'xai':
      return chatXAI(dispatchArgs);
    default:
      throw new Error(`Unsupported provider: ${args.provider}`);
  }
}

export async function listModels(provider: ProviderId, apiKey: string): Promise<string[]> {
  if (!apiKey || !apiKey.trim()) {
    return [];
  }

  switch (provider) {
    case 'openai':
      return listOpenAIModels(apiKey);
    case 'anthropic':
      return listAnthropicModels(apiKey);
    case 'gemini':
      return listGeminiModels(apiKey);
    case 'xai':
      return listXAIModels(apiKey);
    default:
      return [];
  }
}

export const CURATED_MODELS: Record<ProviderId, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'o3-mini', 'o1', 'gpt-4-turbo'],
  gemini: [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-2.0-flash-thinking-exp',
  ],
  anthropic: [
    'claude-3-5-haiku',
    'claude-3-5-sonnet-20241022',
    'claude-3-7-sonnet',
    'claude-3-opus-20240229',
  ],
  xai: ['grok-2-mini', 'grok-2', 'grok-3', 'grok-beta'],
};

