import { fetchJson } from './http';
import { EmailItem } from '../types';

export interface MailError {
  code: string;
  message: string;
  diagnostic?: string;
  isServerDown?: boolean;
}

export function cleanAppPassword(pw: string): string {
  if (typeof pw !== 'string') return '';
  return pw.replace(/[^A-Za-z0-9]/g, '');
}

export function parseMailError(err: any): MailError {
  if (err?.rawMessage && typeof err.rawMessage === 'string') {
    try {
      const parsed = JSON.parse(err.rawMessage);
      if (parsed.error) {
        return {
          code: parsed.error.code || 'UNKNOWN',
          message: parsed.error.message || 'Gmail operation failed.',
          diagnostic: parsed.error.diagnostic,
        };
      }
    } catch {}
  }

  // Network error or HTML response (server not running)
  if (
    err?.kind === 'network' ||
    (err?.kind === 'http' && (err?.status === 404 || err?.status === 502 || err?.status === 503)) ||
    (err?.rawMessage && err.rawMessage.includes('<!DOCTYPE'))
  ) {
    return {
      code: 'SERVER_DOWN',
      message:
        "The app server isn't running here. Gmail and Tavily work on the deployed site; chat, documents, Gemini search and Wikipedia still work.",
      isServerDown: true,
    };
  }

  return {
    code: 'UNKNOWN',
    message: err?.message || 'An error occurred while contacting Gmail.',
  };
}

export async function testGmail(
  email: string,
  appPassword: string
): Promise<{ ok: boolean; email?: string; totalMessages?: number; error?: MailError }> {
  try {
    const res = await fetchJson<{ ok: boolean; email?: string; totalMessages?: number }>(
      '/api/mail/test',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          appPassword: cleanAppPassword(appPassword),
        }),
      },
      { timeoutMs: 45000, provider: 'Gmail' }
    );
    return { ok: true, email: res.email, totalMessages: res.totalMessages };
  } catch (err: any) {
    return { ok: false, error: parseMailError(err) };
  }
}

export async function listGmail(
  email: string,
  appPassword: string,
  query: string = '',
  limit: number = 20
): Promise<{ items: any[]; error?: MailError }> {
  try {
    const res = await fetchJson<{ items: any[] }>(
      '/api/mail/list',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          appPassword: cleanAppPassword(appPassword),
          query: query.trim(),
          limit,
        }),
      },
      { timeoutMs: 45000, provider: 'Gmail' }
    );
    return { items: res.items || [] };
  } catch (err: any) {
    return { items: [], error: parseMailError(err) };
  }
}

export async function getGmailMessage(
  email: string,
  appPassword: string,
  uid: number
): Promise<{ item?: EmailItem; error?: MailError }> {
  try {
    const res = await fetchJson<any>(
      '/api/mail/get',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          appPassword: cleanAppPassword(appPassword),
          uid,
        }),
      },
      { timeoutMs: 45000, provider: 'Gmail' }
    );

    const item: EmailItem = {
      id: `gmail-${res.uid}`,
      from: res.from || 'Unknown',
      fromEmail: res.fromEmail || '',
      subject: res.subject || '(no subject)',
      date: res.date || new Date().toISOString(),
      body: res.body || '',
      source: 'gmail',
      uid: res.uid,
      messageId: res.messageId,
      references: res.references,
    };

    return { item };
  } catch (err: any) {
    return { error: parseMailError(err) };
  }
}

export async function queryGmailInbox(
  email: string,
  appPassword: string,
  query: string = '',
  maxResults: number = 5
): Promise<{ emails: EmailItem[]; error?: MailError }> {
  try {
    const res = await fetchJson<{ emails: any[] }>(
      '/api/mail/query',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          appPassword: cleanAppPassword(appPassword),
          query: query.trim(),
          maxResults,
        }),
      },
      { timeoutMs: 45000, provider: 'Gmail' }
    );

    const items: EmailItem[] = (res.emails || []).map((e) => ({
      id: `gmail-${e.uid}`,
      from: e.from,
      fromEmail: e.fromEmail,
      subject: e.subject,
      date: e.date,
      body: e.body,
      source: 'gmail',
      uid: e.uid,
      messageId: e.messageId,
      references: e.references,
    }));

    return { emails: items };
  } catch (err: any) {
    return { emails: [], error: parseMailError(err) };
  }
}

export const DEMO_INBOX_EMAILS: EmailItem[] = [
  {
    id: 'demo-1',
    from: 'Sarah Chen <sarah.chen@engineering.internal>',
    fromEmail: 'sarah.chen@engineering.internal',
    subject: 'Engineering Architecture Review: Harness BYOK & Multi-Model Proxy',
    date: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    body: `Hi Team,\n\nFor our upcoming engineering sync, please review the architecture for Harness:\n\n1. Zero-storage BYOK: all model keys remain in client memory and localStorage, never on server disks.\n2. CORS Proxy Relay: Express server.ts relays requests to api.x.ai and api.openai.com with a strict host allowlist to prevent SSRF.\n3. Gmail Integration: RFC 3501 IMAP sequence fetching (start:*) to avoid O(N) UID search latency on 50k+ inboxes.\n4. Model Tiering: Low (fast/lightweight), Medium (balanced frontier), High (deep reasoning).\n\nLet me know your thoughts before our meeting!\n\nBest,\nSarah Chen\nLead Architect`,
    source: 'gmail',
    uid: 9001,
    messageId: '<arch-review-sprint42@engineering.internal>',
  },
  {
    id: 'demo-2',
    from: 'Marcus Vance <marcus.v@engineering.internal>',
    fromEmail: 'marcus.v@engineering.internal',
    subject: 'Meeting Quiz Preparation: System Architecture & Protocols',
    date: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    body: `Hey,\n\nI have prepared the technical quiz questions for our engineering meeting.\n\nTopics covered:\n- RFC 3501 IMAP basic auth and why standard Google passwords are rejected\n- Why 16-letter App Passwords under Google 2-Step Verification work\n- Sliding-window context trimming and token heuristics (~4 chars/token)\n- Grounding cascade: Tavily -> Gemini Google Grounding -> Wikipedia\n\nBe ready to answer questions during the sync!\n\nCheers,\nMarcus`,
    source: 'gmail',
    uid: 9002,
    messageId: '<quiz-prep-meeting@engineering.internal>',
  },
  {
    id: 'demo-3',
    from: 'Elena Rostova <elena.r@product.internal>',
    fromEmail: 'elena.r@product.internal',
    subject: 'Customer Feedback: Model Grading (Low, Medium, High)',
    date: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
    body: `Hi,\n\nUsers love the new model dropdown grading tags (Low, Medium, High)! They find it much easier to select gpt-4o-mini or gemini-2.5-flash for everyday fast answers, and o1 or grok-3 for complex coding and architectural analysis.\n\nCould we also ensure the LLM has seamless real-time access to user Gmail messages when drafting responses?\n\nThanks,\nElena`,
    source: 'gmail',
    uid: 9003,
    messageId: '<customer-feedback-tiers@product.internal>',
  },
  {
    id: 'demo-4',
    from: 'DevOps Alerts <alerts@infrastructure.internal>',
    fromEmail: 'alerts@infrastructure.internal',
    subject: 'Resolved: Upstream API Proxy Latency Normalization',
    date: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
    body: `Automated Notification:\n\nAll proxy relay endpoints (/api/proxy) to OpenAI, Anthropic, and xAI Grok are operating with p99 latency <180ms.\n\nNo active throttles or rate limit events recorded in the last 6 hours. All health checks passing.`,
    source: 'gmail',
    uid: 9004,
    messageId: '<infra-alert-resolved-991@infrastructure.internal>',
  },
];

export function getDemoInbox(query: string = '', limit: number = 5): EmailItem[] {
  const q = query.toLowerCase().trim();
  if (!q) {
    return DEMO_INBOX_EMAILS.slice(0, limit);
  }
  const filtered = DEMO_INBOX_EMAILS.filter(
    (e) =>
      e.subject.toLowerCase().includes(q) ||
      e.body.toLowerCase().includes(q) ||
      e.from.toLowerCase().includes(q)
  );
  return (filtered.length > 0 ? filtered : DEMO_INBOX_EMAILS).slice(0, limit);
}


export async function sendGmailMessage(args: {
  email: string;
  appPassword: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}): Promise<{ ok: boolean; error?: MailError }> {
  try {
    await fetchJson<{ ok: boolean }>(
      '/api/mail/send',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: args.email.trim(),
          appPassword: cleanAppPassword(args.appPassword),
          to: args.to.trim(),
          subject: args.subject.trim(),
          body: args.body,
          inReplyTo: args.inReplyTo,
          references: args.references,
        }),
      },
      { timeoutMs: 45000, provider: 'Gmail' }
    );
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: parseMailError(err) };
  }
}
