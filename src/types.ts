export type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'xai';

export interface LLMJudgeEvaluation {
  status: 'evaluating' | 'done' | 'failed';
  overallScore?: number; // 0-100
  accuracyScore?: number; // 0-100
  completenessScore?: number; // 0-100
  reasoningScore?: number; // 0-100
  verdict?: 'Exceptional' | 'Accurate' | 'Minor Inaccuracies' | 'Flawed / Hallucination';
  critique?: string;
  strengths?: string[];
  weaknesses?: string[];
  judgeModel: string;
  judgeProvider: ProviderId;
  evaluatedAt: number;
  error?: string;
}

export interface CouncilMember {
  provider: ProviderId;
  model: string;
  displayName: string;
  company: string;
}

export interface CouncilRoundContribution {
  provider: ProviderId;
  model: string;
  company: string;
  content: string;
}

export interface CouncilRound {
  roundNumber: number;
  title: string;
  description: string;
  contributions: CouncilRoundContribution[];
}

export interface AICouncilSession {
  status: 'debating' | 'done' | 'failed';
  currentStage: string;
  participants: CouncilMember[];
  rounds: CouncilRound[];
  consensus?: {
    synthesis: string;
    agreements: string[];
    disagreements: string[];
    verdict: string;
    actionItems?: string[];
  };
  error?: string;
  completedAt?: number;
}

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
  judge?: LLMJudgeEvaluation; // LLM as a Judge evaluation
  council?: AICouncilSession; // AI Council debate session
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
  autoJudge?: boolean; // Automatically run LLM judge on responses
  councilMode?: boolean; // Convene multi-model AI council on next send
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
  autoJudge?: boolean; // default false (evaluates every response with another model)
  theme: 'light' | 'dark'; // default: follow system on first load
}
