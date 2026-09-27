export type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'xai';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  provider?: ProviderId;
  model?: string;
  usage?: { input: number; output: number };
  sources?: { title: string; url: string }[]; // web search sources
  usedDocs?: string[]; // doc names used
  usedEmails?: string[]; // email subjects/senders used
  error?: { title: string; detail: string; canRetry: boolean };
  draft?: { to: string; subject: string; body: string }; // email draft card
  createdAt: number;
}

export interface Chat {
  id: string;
  title: string; // first 40 chars of first user message, else "New chat"
  messages: ChatMessage[];
  provider: ProviderId | null;
  model: string | null;
  systemPrompt: string;
  webSearch: boolean;
  gmailAccess?: boolean; // Let LLM access Gmail inbox for this chat
  createdAt: number;
  updatedAt: number;
}

export interface UploadedDoc {
  id: string;
  name: string;
  status: 'reading' | 'ready' | 'error';
  error?: string;
  text: string; // full extracted text
  pages?: number;
  words: number;
  chunks: { id: string; text: string; page?: number }[];
  include: boolean;
}

export interface EmailItem {
  id: string;
  from: string; // full From header
  fromEmail: string; // just the address
  subject: string;
  date: string;
  body: string; // plain text, max 20,000 chars
  source: 'paste' | 'gmail';
  uid?: number;
  messageId?: string;
  references?: string;
}

export interface KeyState {
  value: string;
  status: 'unset' | 'checking' | 'ok' | 'failed';
  message?: string;
  models: string[];
}

export interface Settings {
  keys: Record<ProviderId, KeyState>;
  rememberKeys: boolean; // default true
  keepChats: boolean; // default true
  tavily: { value: string; status: 'unset' | 'checking' | 'ok' | 'failed'; message?: string };
  gmail: { email: string; appPassword: string; status: 'unset' | 'checking' | 'ok' | 'failed'; message?: string; demoInboxEnabled?: boolean };
  searchModel: string; // gemini model used for backup web search (default gemini-2.5-flash)
  maxOutputTokens: number; // default 4096
  theme: 'light' | 'dark'; // default: follow system on first load
}
