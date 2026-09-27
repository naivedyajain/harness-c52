/**
 * Harness - Full-Stack Server (server.ts)
 * Express server running on port 3000.
 * In dev: mounts Vite middlewares for full React SPA + HMR.
 * In prod: serves dist/ static files.
 * Handles Gmail IMAP/SMTP, Tavily search, and CORS relay for OpenAI / Grok.
 */

import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Rate limiting: 60 requests per minute per IP for /api/*
const rateLimitMap = new Map<string, { startTime: number; count: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 60;

function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip =
    (req.headers['x-forwarded-for'] as string) ||
    req.socket.remoteAddress ||
    'unknown';
  const now = Date.now();
  let record = rateLimitMap.get(ip);
  if (!record || now - record.startTime > RATE_LIMIT_WINDOW) {
    record = { startTime: now, count: 0 };
    rateLimitMap.set(ip, record);
  }
  record.count += 1;
  if (record.count > RATE_LIMIT_MAX) {
    return res.status(429).json({
      error: { code: 'RATE_LIMIT', message: 'Too many requests — wait a minute.' },
    });
  }
  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now - record.startTime > RATE_LIMIT_WINDOW) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

app.use(express.json({ limit: '4mb' }));
app.use('/api', rateLimiter);

// Map Gmail / IMAP / SMTP errors to friendly responses with diagnostic
function mapMailError(err: any) {
  const msg = (err && (err.message || String(err))) || '';
  const code = (err && err.code) || '';
  const responseMsg = (err && err.response) || '';
  const fullDetail = [code, msg, responseMsg].filter(Boolean).join(' | ');
  const diagnostic = `⚠️ Gmail Diagnostic: ${fullDetail || 'Unknown error'}`;

  console.error('[Gmail Error]', diagnostic);

  if (
    code === 'authenticationFailed' ||
    msg.includes('Invalid credentials') ||
    msg.includes('535') ||
    msg.includes('Username and Password not accepted') ||
    msg.includes('AUTHENTICATIONFAILED') ||
    responseMsg.includes('AUTHENTICATIONFAILED') ||
    responseMsg.includes('535')
  ) {
    return {
      status: 401,
      code: 'AUTH',
      message:
        'Gmail rejected the login. Use a 16-letter App Password (not your normal password), and make sure 2-Step Verification is on.',
      diagnostic,
    };
  }

  if (
    msg.toLowerCase().includes('imap is disabled') ||
    msg.toLowerCase().includes('imap is turned off') ||
    responseMsg.toLowerCase().includes('imap is disabled')
  ) {
    return {
      status: 403,
      code: 'IMAP_OFF',
      message:
        'IMAP is turned off. In Gmail → Settings → Forwarding and POP/IMAP, enable IMAP.',
      diagnostic,
    };
  }

  if (
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    msg.toLowerCase().includes('timeout') ||
    msg.toLowerCase().includes('timed out')
  ) {
    return {
      status: 504,
      code: 'TIMEOUT',
      message: "Couldn't reach Gmail. Try again in a moment.",
      diagnostic,
    };
  }

  return {
    status: 500,
    code: 'UNKNOWN',
    message: `Gmail error: ${msg.slice(0, 150)}`,
    diagnostic,
  };
}

// Strips all whitespace, tabs, and invisible \xa0 non-breaking spaces
function sanitizeAppPassword(pass: string): string {
  if (typeof pass !== 'string') return '';
  return pass.replace(/[^A-Za-z0-9]/g, '');
}

function createImapClient(email: string, appPassword: string) {
  const cleanPass = sanitizeAppPassword(appPassword);
  console.log(`[IMAP Client] Initializing for ${email}, cleaned password length: ${cleanPass.length}`);
  return new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: email.trim(),
      pass: cleanPass,
    },
    logger: false,
    connectionTimeout: 20000,
  });
}

function stripHtml(html: string) {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// 1. Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// 2. Tavily Search Relay
app.post('/api/search', async (req, res) => {
  const { apiKey, query, maxResults = 5 } = req.body || {};

  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return res
      .status(400)
      .json({ error: { code: 'BAD_INPUT', message: 'Tavily API key is required.' } });
  }
  if (!query || typeof query !== 'string' || !query.trim()) {
    return res
      .status(400)
      .json({ error: { code: 'BAD_INPUT', message: 'Search query is required.' } });
  }

  const cleanQuery = query.trim().slice(0, 400);
  const cleanKey = apiKey.trim();
  const limit = Math.min(Math.max(1, Number(maxResults) || 5), 10);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const payload = {
      query: cleanQuery,
      search_depth: 'basic',
      max_results: limit,
      include_answer: true,
    };

    let response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cleanKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (response.status === 401) {
      response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...payload, api_key: cleanKey }),
        signal: controller.signal,
      });
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      let errMsg = '';
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.message || errJson.error || errText;
      } catch {
        errMsg = errText;
      }

      if (response.status === 401) {
        return res
          .status(401)
          .json({ error: { code: 'AUTH', message: 'Tavily rejected the key' } });
      }
      if (
        response.status === 429 ||
        response.status === 432 ||
        response.status === 433 ||
        errMsg.toLowerCase().includes('limit') ||
        errMsg.toLowerCase().includes('credit')
      ) {
        return res.status(429).json({
          error: {
            code: 'RATE_LIMIT',
            message: 'Tavily free credits used up for this month',
          },
        });
      }

      return res.status(response.status).json({
        error: {
          code: 'UNKNOWN',
          message: errMsg.slice(0, 150) || 'Tavily search failed',
        },
      });
    }

    const data: any = await response.json();
    const results = (data.results || []).map((r: any) => ({
      title: r.title || 'Untitled',
      url: r.url || '',
      content: (r.content || '').slice(0, 1200),
    }));

    res.json({
      answer: data.answer || '',
      results,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return res
        .status(504)
        .json({ error: { code: 'TIMEOUT', message: 'Tavily search timed out' } });
    }
    res.status(500).json({
      error: { code: 'UNKNOWN', message: 'Could not connect to Tavily search' },
    });
  }
});

// 3. Test Gmail connection
app.post('/api/mail/test', async (req, res) => {
  const { email, appPassword } = req.body || {};
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res
      .status(400)
      .json({ error: { code: 'BAD_INPUT', message: 'Valid Gmail address is required.' } });
  }
  const cleanPass = sanitizeAppPassword(appPassword);
  console.log(`[Gmail Test] User: ${email}, cleaned password length: ${cleanPass.length}`);

  if (!cleanPass) {
    return res
      .status(400)
      .json({ error: { code: 'BAD_INPUT', message: 'App password is required.' } });
  }

  if (cleanPass.length !== 16) {
    return res.status(400).json({
      error: {
        code: 'BAD_INPUT',
        message: `App Password must be exactly 16 letters (currently ${cleanPass.length}). Check for missing characters or regular password.`,
        diagnostic: `⚠️ Gmail Diagnostic: Cleaned password length is ${cleanPass.length} (expected 16).`,
      },
    });
  }

  const client = createImapClient(email, cleanPass);
  try {
    console.log('[Gmail Test] Connecting to imap.gmail.com:993...');
    await client.connect();
    console.log('[Gmail Test] Connected. Opening INBOX read-only...');
    const mailbox = await client.mailboxOpen('INBOX', { readOnly: true });
    const total = mailbox.exists || 0;
    console.log(`[Gmail Test] Successfully opened INBOX. Total messages: ${total}`);
    await client.logout();
    res.json({ ok: true, email, totalMessages: total });
  } catch (err) {
    try {
      await client.logout();
    } catch {
      try {
        client.close();
      } catch {}
    }
    const mapped = mapMailError(err);
    res.status(mapped.status).json({
      error: {
        code: mapped.code,
        message: mapped.message,
        diagnostic: mapped.diagnostic,
      },
    });
  }
});

// 4. List emails
app.post('/api/mail/list', async (req, res) => {
  const { email, appPassword, query = '', limit = 20 } = req.body || {};
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res
      .status(400)
      .json({ error: { code: 'BAD_INPUT', message: 'Valid Gmail address is required.' } });
  }
  const cleanPass = sanitizeAppPassword(appPassword);
  if (!cleanPass) {
    return res
      .status(400)
      .json({ error: { code: 'BAD_INPUT', message: 'App password is required.' } });
  }

  const maxLimit = Math.min(Math.max(1, Number(limit) || 20), 50);
  const client = createImapClient(email, cleanPass);

  try {
    console.log('[Gmail List] Connecting...');
    await client.connect();
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    try {
      let uids: number[] = [];
      const cleanQ = typeof query === 'string' ? query.trim() : '';
      const items: any[] = [];

      if (!cleanQ) {
        // Fast sequence fetch: avoids search latency on huge inboxes
        const total = client.mailbox ? client.mailbox.exists : 0;
        console.log(`[Gmail List] Total messages in INBOX: ${total}`);
        if (total === 0) {
          return res.json({ items: [] });
        }

        const start = Math.max(1, total - maxLimit + 1);
        const seqRange = `${start}:*`;
        console.log(`[Gmail List] Fetching sequence range ${seqRange}...`);

        for await (const msg of client.fetch(seqRange, {
          uid: true,
          envelope: true,
          internalDate: true,
          bodyParts: ['1'],
        })) {
          const env = msg.envelope || {};
          const fromObj = (env.from && env.from[0]) || {};
          const fromName = fromObj.name
            ? `${fromObj.name} <${fromObj.address}>`
            : fromObj.address || '';
          const fromEmail = fromObj.address || '';
          const subject = env.subject || '(no subject)';
          const date = new Date(msg.internalDate || env.date || Date.now()).toISOString();

          let snippet = '';
          if (msg.bodyParts) {
            const part = msg.bodyParts.get('1');
            if (part) {
              snippet = part.toString('utf8').slice(0, 200).replace(/\s+/g, ' ').trim();
            }
          }

          items.push({
            uid: msg.uid,
            from: fromName || fromEmail || 'Unknown',
            fromEmail,
            subject,
            date,
            snippet,
          });
        }
      } else {
        console.log(`[Gmail List] Searching for query: ${cleanQ}...`);
        try {
          uids = (await client.search({ gmraw: cleanQ }, { uid: true })) as number[];
        } catch {
          uids = (await client.search(
            { or: [{ subject: cleanQ }, { from: cleanQ }, { body: cleanQ }] },
            { uid: true }
          )) as number[];
        }

        if (!uids || uids.length === 0) {
          return res.json({ items: [] });
        }

        const targetUids = uids.slice(-maxLimit);

        for await (const msg of client.fetch(targetUids, {
          uid: true,
          envelope: true,
          internalDate: true,
          bodyParts: ['1'],
        })) {
          const env = msg.envelope || {};
          const fromObj = (env.from && env.from[0]) || {};
          const fromName = fromObj.name
            ? `${fromObj.name} <${fromObj.address}>`
            : fromObj.address || '';
          const fromEmail = fromObj.address || '';
          const subject = env.subject || '(no subject)';
          const date = new Date(msg.internalDate || env.date || Date.now()).toISOString();

          let snippet = '';
          if (msg.bodyParts) {
            const part = msg.bodyParts.get('1');
            if (part) {
              snippet = part.toString('utf8').slice(0, 200).replace(/\s+/g, ' ').trim();
            }
          }

          items.push({
            uid: msg.uid,
            from: fromName || fromEmail || 'Unknown',
            fromEmail,
            subject,
            date,
            snippet,
          });
        }
      }

      items.reverse();
      console.log(`[Gmail List] Returning ${items.length} items.`);
      res.json({ items });
    } finally {
      lock.release();
      await client.logout();
    }
  } catch (err) {
    try {
      await client.logout();
    } catch {
      try {
        client.close();
      } catch {}
    }
    const mapped = mapMailError(err);
    res.status(mapped.status).json({
      error: {
        code: mapped.code,
        message: mapped.message,
        diagnostic: mapped.diagnostic,
      },
    });
  }
});

// 4b. Direct Gmail Query for LLM Assistant in Chat
app.post('/api/mail/query', async (req, res) => {
  const { email, appPassword, query = '', maxResults = 5 } = req.body || {};
  if (!email || !appPassword) {
    return res.status(400).json({ error: { code: 'BAD_INPUT', message: 'Email and App Password required' } });
  }

  const cleanPass = sanitizeAppPassword(appPassword);
  if (!cleanPass) {
    return res.status(400).json({ error: { code: 'BAD_INPUT', message: 'Invalid App Password' } });
  }

  const client = createImapClient(email, cleanPass);
  const limit = Math.min(Math.max(1, Number(maxResults) || 5), 10);

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    try {
      let targetUids: number[] = [];
      const cleanQ = typeof query === 'string' ? query.trim() : '';

      if (cleanQ) {
        try {
          const found = (await client.search({ gmraw: cleanQ }, { uid: true })) as number[];
          if (found && found.length > 0) {
            targetUids = found.slice(-limit).reverse();
          }
        } catch {
          const fallback = (await client.search(
            { or: [{ subject: cleanQ }, { from: cleanQ }, { body: cleanQ }] },
            { uid: true }
          )) as number[];
          if (fallback && fallback.length > 0) {
            targetUids = fallback.slice(-limit).reverse();
          }
        }
      }

      // If no query or no query matches, fetch latest messages
      if (targetUids.length === 0) {
        const total = client.mailbox ? client.mailbox.exists : 0;
        if (total > 0) {
          const start = Math.max(1, total - limit + 1);
          const uidsFound: number[] = [];
          for await (const msg of client.fetch(`${start}:*`, { uid: true })) {
            uidsFound.push(msg.uid);
          }
          targetUids = uidsFound.slice(-limit).reverse();
        }
      }

      const detailedEmails: any[] = [];

      for (const uid of targetUids) {
        try {
          const downloaded = await client.download(uid, undefined, { uid: true });
          if (downloaded && downloaded.content) {
            const parsed = await simpleParser(downloaded.content);
            let bodyText = parsed.text || (parsed.html ? stripHtml(parsed.html) : '');
            bodyText = bodyText.replace(/\n\s*\n\s*\n+/g, '\n\n').slice(0, 1500).trim();

            const fromObj = parsed.from && parsed.from.value && parsed.from.value[0];
            const fromText = (parsed.from && parsed.from.text) || (fromObj && fromObj.name) || (fromObj && fromObj.address) || 'Unknown';
            const fromEmail = (fromObj && fromObj.address) || '';

            detailedEmails.push({
              uid,
              from: fromText,
              fromEmail,
              subject: parsed.subject || '(no subject)',
              date: new Date(parsed.date || Date.now()).toISOString(),
              body: bodyText,
              messageId: parsed.messageId || '',
              references: Array.isArray(parsed.references) ? parsed.references.join(' ') : (parsed.references || ''),
            });
          }
        } catch (downloadErr) {
          console.warn(`[Gmail Query] Could not download message ${uid}:`, downloadErr);
        }
      }

      res.json({ emails: detailedEmails });
    } finally {
      lock.release();
      await client.logout();
    }
  } catch (err) {
    try {
      await client.logout();
    } catch {
      try {
        client.close();
      } catch {}
    }
    const mapped = mapMailError(err);
    res.status(mapped.status).json({ error: mapped });
  }
});

// 5. Get email by UID
app.post('/api/mail/get', async (req, res) => {
  const { email, appPassword, uid } = req.body || {};
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res
      .status(400)
      .json({ error: { code: 'BAD_INPUT', message: 'Valid Gmail address is required.' } });
  }
  const cleanPass = sanitizeAppPassword(appPassword);
  if (!cleanPass) {
    return res
      .status(400)
      .json({ error: { code: 'BAD_INPUT', message: 'App password is required.' } });
  }

  const numUid = Number(uid);
  if (!numUid || numUid <= 0 || !Number.isInteger(numUid)) {
    return res
      .status(400)
      .json({ error: { code: 'BAD_INPUT', message: 'Valid positive integer UID is required.' } });
  }

  const client = createImapClient(email, cleanPass);
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    try {
      const msg = await client.download(numUid, undefined, { uid: true });
      if (!msg || !msg.content) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'That email no longer exists. Refresh the list.' },
        });
      }

      const parsed = await simpleParser(msg.content);
      let bodyText = parsed.text || '';
      if (!bodyText && parsed.html) {
        bodyText = stripHtml(parsed.html);
      }

      bodyText = bodyText.replace(/\n\s*\n\s*\n+/g, '\n\n').slice(0, 20000);

      const fromObj = parsed.from && parsed.from.value && parsed.from.value[0];
      const fromEmail = (fromObj && fromObj.address) || '';
      const fromText = (parsed.from && parsed.from.text) || fromEmail || 'Unknown';

      const references = Array.isArray(parsed.references)
        ? parsed.references.join(' ')
        : typeof parsed.references === 'string'
        ? parsed.references
        : '';

      res.json({
        uid: numUid,
        from: fromText,
        fromEmail,
        subject: parsed.subject || '(no subject)',
        date: new Date(parsed.date || Date.now()).toISOString(),
        messageId: parsed.messageId || '',
        references,
        body: bodyText,
      });
    } finally {
      lock.release();
      await client.logout();
    }
  } catch (err) {
    try {
      await client.logout();
    } catch {
      try {
        client.close();
      } catch {}
    }
    const mapped = mapMailError(err);
    res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
  }
});

// 6. Send email via SMTP
app.post('/api/mail/send', async (req, res) => {
  const { email, appPassword, to, subject, body, inReplyTo, references } = req.body || {};

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res
      .status(400)
      .json({ error: { code: 'BAD_INPUT', message: 'Valid sender email address is required.' } });
  }
  const cleanPass = sanitizeAppPassword(appPassword);
  if (!cleanPass) {
    return res
      .status(400)
      .json({ error: { code: 'BAD_INPUT', message: 'App password is required.' } });
  }
  if (!to || typeof to !== 'string' || !to.includes('@')) {
    return res
      .status(400)
      .json({ error: { code: 'BAD_INPUT', message: 'Valid recipient email address is required.' } });
  }
  if (!body || typeof body !== 'string' || !body.trim()) {
    return res
      .status(400)
      .json({ error: { code: 'BAD_INPUT', message: 'Email body cannot be empty.' } });
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: email,
      pass: cleanPass,
    },
  });

  try {
    const mailOptions: any = {
      from: email,
      to: to.trim(),
      subject: subject || 'No subject',
      text: body,
    };

    if (inReplyTo) {
      mailOptions.inReplyTo = inReplyTo;
    }
    if (references) {
      mailOptions.references = references;
    }

    await transporter.sendMail(mailOptions);
    res.json({ ok: true });
  } catch (err) {
    const mapped = mapMailError(err);
    res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
  }
});

// 7. Transparent Proxy Relay for OpenAI and Grok (resolves browser CORS blocks)
app.post('/api/proxy', async (req, res) => {
  const { url, method = 'POST', headers = {}, body } = req.body || {};

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Target URL is required' });
  }

  // Allow only legitimate LLM API endpoints to prevent SSRF
  const allowedHosts = ['api.openai.com', 'api.x.ai', 'api.anthropic.com', 'generativelanguage.googleapis.com'];
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  if (parsedUrl.protocol !== 'https:' || !allowedHosts.includes(parsedUrl.hostname)) {
    return res.status(403).json({ error: 'Host not permitted by proxy' });
  }

  try {
    const fetchHeaders: Record<string, string> = {};
    if (headers && typeof headers === 'object') {
      for (const [k, v] of Object.entries(headers)) {
        if (typeof v === 'string') {
          fetchHeaders[k] = v;
        }
      }
    }

    const init: RequestInit = {
      method,
      headers: fetchHeaders,
    };

    if (method !== 'GET' && method !== 'HEAD' && body !== undefined) {
      if (!fetchHeaders['content-type'] && !fetchHeaders['Content-Type']) {
        fetchHeaders['Content-Type'] = 'application/json';
      }
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const upstream = await fetch(url, init);
    const contentType = upstream.headers.get('content-type') || 'application/json';
    const textData = await upstream.text();

    res.status(upstream.status).type(contentType).send(textData);
  } catch (err: any) {
    res.status(500).json({
      error: { code: 'PROXY_ERROR', message: `Proxy failed: ${err.message || String(err)}` },
    });
  }
});

// 8. Provider configuration helper (e.g. injected GEMINI_API_KEY from environment)
app.get('/api/config/providers', (_req, res) => {
  const geminiEnv = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';
  res.json({
    hasServerGemini: Boolean(geminiEnv),
    geminiApiKey: geminiEnv || undefined,
  });
});

// Express error handling
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({
    error: { code: 'SERVER_ERROR', message: 'Internal server error occurred.' },
  });
});

process.on('unhandledRejection', (reason) => {
  const msg = reason && (reason as any).message ? (reason as any).message : String(reason);
  console.error('[Unhandled Rejection]', msg.slice(0, 100));
});

process.on('uncaughtException', (err) => {
  const msg = err && err.message ? err.message : String(err);
  console.error('[Uncaught Exception]', msg.slice(0, 100));
});

// Start server and attach Vite middlewares in dev mode
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    const indexPath = path.join(distPath, 'index.html');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(200).send(`<!DOCTYPE html><html><head><title>Harness</title></head><body><h1>Harness starting...</h1><p>Build output not found. Please ensure Build Command is set to <code>npm run build</code> or <code>bun run build</code> in Render settings.</p></body></html>`);
      }
    });
  }

  app.listen(port, () => {
    console.log(`Harness server running on port ${port}`);
  });
}

startServer();
