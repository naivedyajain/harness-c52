# Harness — Multi-Model AI Workspace & Architecture Guide

A production-grade, Bring-Your-Own-Key (BYOK) multi-model AI workspace built with React 19, TypeScript, Tailwind CSS, Express, and Vite. Features direct support for OpenAI, Google Gemini, Anthropic, and xAI (Grok), along with client-side document processing, real-time Gmail inbox access (RFC 3501 IMAP/SMTP), and an Engineering Meeting Quiz & Technical Architecture Study Guide.

---

## Table of Contents
1. [Architecture Overview & Zero-Retention Security Contract](#1-architecture-overview--zero-retention-security-contract)
2. [Complete Problem & Fix Log](#2-complete-problem--fix-log)
   - [Problem 1: Model Picker Dropdown Not Opening](#problem-1-model-picker-dropdown-not-opening)
   - [Problem 2 & 6: Gmail Access & LLM Inbox Context](#problem-2--6-gmail-access--llm-inbox-context)
   - [Problem 3: OpenAI and Grok (xAI) Keys Showing in Error (CORS & Proxying)](#problem-3-openai-and-grok-xai-keys-showing-in-error-cors--proxying)
   - [Problem 4: Engineering Meeting Quiz & Architecture Cheat Sheet](#problem-4-engineering-meeting-quiz--architecture-cheat-sheet)
   - [Problem 5: Model Tier Grading (Low / Medium / High)](#problem-5-model-tier-grading-low--medium--high)
3. [File Tree & Core Responsibilities](#3-file-tree--core-responsibilities)
4. [Step-by-Step Reproduction Guide](#4-step-by-step-reproduction-guide)
   - [Dependencies & Installation](#dependencies--installation)
   - [Backend Express Server (`server.ts`)](#backend-express-server-serverts)
   - [HTTP & Transparent Proxy Layer (`src/lib/http.ts`)](#http--transparent-proxy-layer-srclibhttpts)
   - [Gmail IMAP / SMTP & Demo Inbox (`src/lib/gmail.ts`)](#gmail-imap--smtp--demo-inbox-srclibgmailts)
   - [Model Tier Grading & Selection (`src/components/ModelPicker.tsx`)](#model-tier-grading--selection-srccomponentsmodelpickertsx)
   - [Engineering Quiz & Rehearsal Modal (`src/components/EngineeringQuizModal.tsx`)](#engineering-quiz--rehearsal-modal-srccomponentsengineeringquizmodaltsx)
5. [Environment Variables](#5-environment-variables)
6. [Verification & Compilation Checklist](#6-verification--compilation-checklist)

---

## 1. Architecture Overview & Zero-Retention Security Contract

Harness is designed around a **strict client-first, zero-persistence BYOK security contract**:
- **Zero Disk Persistence of Secrets**: All model API keys (OpenAI, Gemini, Anthropic, xAI) reside strictly in client browser memory (`localStorage` opt-in, client-side only). Keys are never stored in server databases, disks, or server logs.
- **SSRF-Protected Reverse Proxy**: Browser `fetch` calls to third-party APIs (such as `api.x.ai` and `api.openai.com`) are blocked by modern browsers due to Cross-Origin Resource Sharing (CORS) preflight failures. The local Express server provides a `/api/proxy` endpoint with a strict destination hostname allowlist (`api.openai.com`, `api.x.ai`, `api.anthropic.com`, `generativelanguage.googleapis.com`) preventing Server-Side Request Forgery (SSRF).
- **Stateless IMAP & SMTP Tunneling**: Gmail IMAP (port 993) and SMTP (port 465) require raw TCP socket connections with SASL authentication. Because browser JavaScript cannot open direct TCP sockets, the Express server acts as a transient, stateless proxy using `imapflow` and `nodemailer`. Credentials pass through transient function arguments and are discarded immediately upon mailbox lock release and socket disconnection.

---

## 2. Complete Problem & Fix Log

### Problem 1: Model Picker Dropdown Not Opening
- **Root Cause**:
  In `App.tsx`, `isModelPickerOpen` state was initialized to `false` and passed as `isOpenExternal` to `ModelPicker`.
  Inside `ModelPicker.tsx`, a `useEffect` watched `isOpenExternal` with `if (isOpenExternal !== undefined) setIsOpen(isOpenExternal)`.
  When a user clicked the trigger button, local `isOpen` toggled to `true`. However, any concurrent state change or parent re-render passed `isOpenExternal={false}` again, instantaneously snapping the dropdown shut before the user could interact with it. Furthermore, if a provider had no API key entered yet, models were completely hidden, leaving the user with an empty list.
- **Fix Implemented**:
  1. Updated `ModelPicker.tsx` external open synchronization to only trigger open actions (`if (isOpenExternal) setIsOpen(true)`), preventing re-renders from closing user-opened menus.
  2. Implemented functional toggle state updater `setIsOpen((prev) => !prev)` and invoked `onCloseExternal()` only when closing.
  3. Integrated static `CURATED_MODELS` lists so models across all providers (OpenAI, Gemini, Anthropic, xAI) are immediately visible and selectable with their grade badges before keys are entered.
  4. Selecting an unkeyed model automatically opens Settings directly to the corresponding key input tab with a descriptive guidance message.

---

### Problem 2 & 6: Gmail Access & LLM Inbox Context
- **Root Cause**:
  1. Users entering normal Google account passwords received rejection `535-5.7.8 Username and Password not accepted` because Google deprecated basic password authentication on IMAP/SMTP in favor of dedicated 16-character App Passwords under 2-Step Verification.
  2. Copy-pasting Google App Passwords includes 3 spaces (`abcd efgh ijkl mnop`), which caused length and format errors when raw-checked against strict regexes.
  3. When credentials were not yet configured, the chat input button completely blocked users from toggling Gmail access, making it impossible to evaluate or test email analysis features.
  4. The LLM prompt builder was not dynamically retrieving inbox emails when users typed queries like "summarize my emails" or "draft a reply to the sync".
- **Fix Implemented**:
  1. **Sanitization**: Added `cleanAppPassword()` in `src/lib/gmail.ts` and `server.ts` to strip all whitespace, tabs, and invisible non-breaking spaces (`\xa0`).
  2. **Live Counter & Diagnostics**: Added live character length counter (`16/16 chars`) and error diagnostics in `SettingsModal.tsx` explaining 2-Step Verification and linking to `myaccount.google.com/apppasswords`.
  3. **Engineering Sample Inbox**: Created a realistic demo inbox (`DEMO_INBOX_EMAILS` & `getDemoInbox`) covering sprint blockers, meeting quizzes, customer feedback, and DevOps alerts. If a user hasn't configured a Google App Password, the app seamlessly falls back to this sample inbox for immediate zero-friction evaluation.
  4. **Active Toolbar Button**: Added a dedicated `Gmail` / `Gmail Active` toggle in `InputBar.tsx` with an active green pill indicator.
  5. **Dynamic Prompt Injection**: Updated `handleSendMessage` in `App.tsx` and `buildSystemPrompt` in `src/lib/context.ts` to query inbox emails, inject `## Emails` context into the prompt, display `Used Emails` badges on the assistant message, and provide 1-click draft reply generation.

---

### Problem 3: OpenAI and Grok (xAI) Keys Showing in Error (CORS & Proxying)
- **Root Cause**:
  1. `src/lib/http.ts` was attempting direct browser `fetch()` calls to `https://api.openai.com/v1/models` and `https://api.openai.com/v1/chat/completions`. Modern browsers in web preview iframes block cross-origin requests to OpenAI with CORS preflight `OPTIONS` errors (`No Access-Control-Allow-Origin header`).
  2. For xAI Grok (`api.x.ai`), `fetchJson()` converted `init.headers` improperly. When `Headers` instances or raw objects were forwarded, authorization headers were occasionally stripped or misformatted during JSON serialization.
  3. Users with scoped API keys (e.g., OpenAI Project keys without `models:read` permission) failed key verification because `/v1/models` returned HTTP 403, marking the key `failed` even though chat completions worked.
- **Fix Implemented**:
  1. **Direct Backend Proxying**: Updated `src/lib/http.ts` so all calls to `api.openai.com`, `api.x.ai`, and `api.anthropic.com` are routed directly through `/api/proxy` without ever hitting browser CORS preflights.
  2. **Safe Header Serialization**: Built a header normalization helper in `http.ts` that converts `Headers` objects, entry tuples, or plain records into a pristine `Record<string, string>`.
  3. **Content-Type Assurance**: Configured `server.ts` `/api/proxy` to ensure `Content-Type: application/json` is always enforced for non-GET/HEAD payloads.
  4. **Scoped Key Fallback**: Updated `listOpenAIModels` and `listXAIModels` to catch HTTP 403/404/429 errors from `/v1/models` and fall back to curated models (`gpt-4o-mini`, `gpt-4o`, `o3-mini`, `o1`, `grok-2`, `grok-3`), allowing users with restricted keys to continue chatting without being blocked.

---

### Problem 4: Engineering Meeting Quiz & Architecture Cheat Sheet
- **Root Cause**:
  The user needed to prepare for an engineering sync covering system architecture, protocols, and multi-model infrastructure.
- **Fix Implemented**:
  1. Created `EngineeringQuizModal.tsx` containing an interactive 8-question exam covering:
     - **RFC 3501 IMAP Basic Auth & SASL**: Why Google rejects normal passwords and requires 16-letter App Passwords.
     - **BYOK Stateless Proxy Security**: Why keys stay in browser memory and how the backend prevents SSRF.
     - **CORS vs. Server-to-Server Relays**: Why xAI and OpenAI block browser preflights.
     - **Model Grading Matrix (Low / Medium / High)**: Latency, cost, and reasoning trade-offs.
     - **Sliding-Window Token Budgeting**: 4-char/token heuristics and conversation pruning.
     - **Multi-Source Grounding Cascades**: Tavily $\to$ Gemini Search Grounding $\to$ Wikipedia fallbacks.
     - **Client-Side Document Parsing**: In-browser PDF/DOCX text extraction without sending binary files to third parties.
     - **Prompt Injection Defense**: Boundary isolation and context demarcation.
  2. Added an interactive scoring engine with instantaneous option explanations and key architectural takeaways.
  3. Added an **Architecture Cheat Sheet / Study Guide** tab.
  4. Added a **"Drill Me with AI"** button that auto-populates the prompt into the active chat so the user can rehearse interactively with the selected LLM.
  5. Added direct access buttons via the top navigation bar (`Engineering Quiz`) and empty state quick prompts.

---

### Problem 5: Model Tier Grading (Low / Medium / High)
- **Root Cause**:
  Users found it difficult to know which model to pick for quick queries vs. complex reasoning tasks.
- **Fix Implemented**:
  1. Built `getModelTier(modelId)` in `src/components/ModelPicker.tsx`:
     - **Low** (Emerald): Fast, distilled, low latency (<500ms TTFT), cost-efficient (`gpt-4o-mini`, `gemini-2.5-flash`, `gemini-2.0-flash`, `claude-3-5-haiku`, `grok-2-mini`).
     - **Medium** (Sky Blue): Balanced frontier workhorses for code, writing, and synthesis (`gpt-4o`, `gemini-2.5-pro`, `claude-3-5-sonnet`, `grok-2`).
     - **High** (Purple): Deep multi-step reasoning, mathematical proofs, and architectural design (`o1`, `o3-mini`, `grok-3`, `gemini-2.0-flash-thinking-exp`, `claude-3-opus`).
  2. Added color-coded badges to each model item in the picker and in the top navigation bar next to the current model name.
  3. Added interactive filter pills (`All`, `Low`, `Medium`, `High`) in the model dropdown search header with explanations for each tier.

---

## 3. File Tree & Core Responsibilities

```
├── .env.example                     # Environment template (GEMINI_API_KEY, APP_URL)
├── index.html                       # HTML5 entry point with metadata
├── metadata.json                    # AI Studio metadata & server capabilities
├── package.json                     # Scripts & dependencies (Express, React 19, Vite, imapflow, nodemailer)
├── server.ts                        # Full-stack backend: Vite middleware, IMAP/SMTP, CORS proxy, Gemini env relay
├── tsconfig.json                    # TypeScript configuration
├── vite.config.ts                   # Vite + Tailwind v4 + React plugin configuration
└── src/
    ├── App.tsx                      # Root component, state management, chat lifecycle, Gmail context injection
    ├── main.tsx                     # React 19 DOM root mounting
    ├── index.css                    # Tailwind CSS v4 entry point
    ├── types.ts                     # TypeScript definitions (Settings, Chat, Message, EmailItem, ModelTier)
    ├── components/
    │   ├── TopBar.tsx               # Header with ModelPicker, Quiz trigger, theme toggle, settings button
    │   ├── ModelPicker.tsx          # Tier-graded model picker with curated models & search filters
    │   ├── InputBar.tsx             # Chat textarea, attachments, web search, and Gmail Active toggle
    │   ├── Message.tsx              # Markdown message display, citations, used emails, and draft cards
    │   ├── EmailDrawer.tsx          # Email viewer: paste email, browse live Gmail, or sample demo inbox
    │   ├── SettingsModal.tsx        # Modal for API keys, 16-char Gmail setup, and preferences
    │   ├── EngineeringQuizModal.tsx # Interactive engineering quiz, study guide, and AI rehearsal drill
    │   ├── Sidebar.tsx              # Conversation management drawer
    │   ├── EmptyState.tsx           # Initial view with quick action prompts (Quiz, Gmail summary)
    │   ├── DraftCard.tsx            # Email reply preview with 1-click SMTP send action
    │   └── Toast.tsx                # Ephemeral notification toasts
    └── lib/
        ├── http.ts                  # Fetch abstraction with automated /api/proxy relay and header cleaning
        ├── gmail.ts                 # Client-side Gmail IMAP/SMTP endpoints and DEMO_INBOX_EMAILS
        ├── context.ts               # Context builder injecting system prompt, web search, docs, and emails
        ├── errors.ts                # User-friendly error message normalizer
        ├── storage.ts               # LocalStorage wrapper with quota-safe fallbacks
        ├── search.ts                # Multi-engine search cascade (Tavily, Gemini, Wikipedia)
        ├── tokens.ts                # Sliding-window token heuristic budgeting
        └── providers/
            ├── index.ts             # Provider dispatcher and CURATED_MODELS registry
            ├── openai.ts            # OpenAI chat completions and model listing
            ├── gemini.ts            # Google Gemini SDK integration
            ├── anthropic.ts         # Anthropic Claude completions and model listing
            └── xai.ts               # xAI Grok completions and model listing
```

---

## 4. Step-by-Step Reproduction Guide

### Dependencies & Installation
Install the necessary runtime and developer dependencies:

```json
{
  "dependencies": {
    "@google/genai": "^2.4.0",
    "@tailwindcss/vite": "^4.3.3",
    "@vitejs/plugin-react": "^6.1.1",
    "dotenv": "^17.2.3",
    "express": "^4.21.2",
    "imapflow": "^2.0.7",
    "lucide-react": "^0.546.0",
    "mailparser": "^3.9.28",
    "mammoth": "^1.12.3",
    "motion": "^12.23.24",
    "nodemailer": "^10.0.10",
    "pdfjs-dist": "^6.3.289",
    "react": "^19.0.1",
    "react-dom": "^19.0.1",
    "react-markdown": "^10.1.0",
    "remark-gfm": "^4.0.1",
    "vite": "^8.3.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/mailparser": "^3.4.6",
    "@types/node": "^22.14.0",
    "@types/nodemailer": "^8.0.2",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "autoprefixer": "^10.4.21",
    "esbuild": "^0.25.0",
    "tailwindcss": "^4.3.3",
    "tsx": "^4.21.0",
    "typescript": "^7.0.2"
  }
}
```

---

### Backend Express Server (`server.ts`)
The server serves static files or Vite middlewares and provides 3 core backend APIs:
1. **/api/proxy**: Transparent HTTPS relay for LLM endpoints with an allowlist to prevent SSRF:
   ```typescript
   app.post('/api/proxy', async (req, res) => {
     const { url, method = 'POST', headers = {}, body } = req.body || {};
     const allowedHosts = [
       'api.openai.com',
       'api.x.ai',
       'api.anthropic.com',
       'generativelanguage.googleapis.com'
     ];

     const parsedUrl = new URL(url);
     if (parsedUrl.protocol !== 'https:' || !allowedHosts.includes(parsedUrl.hostname)) {
       return res.status(403).json({ error: 'Host not permitted by proxy' });
     }

     const fetchHeaders: Record<string, string> = {};
     for (const [k, v] of Object.entries(headers)) {
       if (typeof v === 'string') fetchHeaders[k] = v;
     }

     const init: RequestInit = { method, headers: fetchHeaders };
     if (method !== 'GET' && method !== 'HEAD' && body !== undefined) {
       if (!fetchHeaders['content-type'] && !fetchHeaders['Content-Type']) {
         fetchHeaders['Content-Type'] = 'application/json';
       }
       init.body = typeof body === 'string' ? body : JSON.stringify(body);
     }

     const upstream = await fetch(url, init);
     const textData = await upstream.text();
     res.status(upstream.status).type(upstream.headers.get('content-type') || 'application/json').send(textData);
   });
   ```

2. **/api/mail/test & /api/mail/query**: IMAP connection using `imapflow` to `imap.gmail.com:993` with cleaned 16-letter App Passwords.
3. **/api/mail/send**: SMTP dispatch via `nodemailer` using `smtp.gmail.com:465`.
4. **/api/config/providers**: Injects server-side `GEMINI_API_KEY` when deployed in Google AI Studio.

---

### HTTP & Transparent Proxy Layer (`src/lib/http.ts`)
Directs all OpenAI, xAI, and Anthropic requests through the server proxy:
```typescript
const isDirectProxyNeeded =
  url.includes('api.x.ai') ||
  url.includes('api.openai.com') ||
  url.includes('api.anthropic.com');

if (isDirectProxyNeeded) {
  const headersRecord: Record<string, string> = {};
  if (init?.headers) {
    if (typeof (init.headers as any).forEach === 'function') {
      (init.headers as any).forEach((value: string, key: string) => {
        headersRecord[key] = value;
      });
    } else if (typeof init.headers === 'object') {
      Object.assign(headersRecord, init.headers);
    }
  }

  response = await fetch('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      method: init?.method || 'GET',
      headers: headersRecord,
      body: init?.body ? (typeof init.body === 'string' ? JSON.parse(init.body) : init.body) : undefined,
    }),
    signal: controller.signal,
  });
}
```

---

### Gmail IMAP / SMTP & Demo Inbox (`src/lib/gmail.ts`)
Strips all whitespace and non-alphanumeric characters from Google App Passwords:
```typescript
export function cleanAppPassword(pw: string): string {
  if (typeof pw !== 'string') return '';
  return pw.replace(/[^A-Za-z0-9]/g, '');
}
```
Provides realistic demo emails (`DEMO_INBOX_EMAILS`) so the LLM can immediately read, cite, and draft replies to engineering emails even before the user inputs their personal Google App Password.

---

### Model Tier Grading & Selection (`src/components/ModelPicker.tsx`)
Classifies every model into Low, Medium, or High tiers based on latency, cost, and reasoning capacity:
```typescript
export type ModelTier = 'low' | 'medium' | 'high';

export function getModelTier(modelId: string): ModelTier {
  const m = modelId.toLowerCase();

  // High (deep reasoning / frontier apex)
  if (
    m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4') ||
    m.includes('thinking') || m.includes('reason') || m.includes('3-7-sonnet') ||
    m.includes('claude-3-opus') || m.includes('grok-3') || m.includes('max')
  ) {
    return 'high';
  }

  // Low (fast / lightweight / budget / low latency)
  if (
    m.includes('mini') || m.includes('flash') || m.includes('lite') ||
    m.includes('8b') || m.includes('haiku') || m.includes('3.5') ||
    m.includes('small') || m.includes('nano') || m.includes('instant') || m.includes('instruct')
  ) {
    return 'low';
  }

  // Medium (standard balanced frontier: gpt-4o, gemini-2.5-pro, claude-3-5-sonnet, grok-2)
  return 'medium';
}
```

---

### Engineering Quiz & Rehearsal Modal (`src/components/EngineeringQuizModal.tsx`)
Provides 8 rigorous technical architecture questions with immediate feedback, an Architecture Study Guide, and a 1-click button to have the active LLM grill the user on system design concepts.

---

## 5. Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# GEMINI_API_KEY: Optional if entering keys in UI; auto-injected in AI Studio.
GEMINI_API_KEY="your-gemini-api-key"

# APP_URL: The hosting domain URL used for self-referential links.
APP_URL="http://localhost:3000"

# DISABLE_HMR: Set to true in AI Studio to prevent file watching overhead during edits.
DISABLE_HMR="false"
```

---

## 6. Verification & Compilation Checklist

1. **Verify Compilation**:
   ```bash
   npm run lint
   npm run build
   ```
2. **Start Dev Server**:
   ```bash
   npm run dev
   ```
   Server will start on port `3000` (`tsx server.ts`).
3. **Verify Features**:
   - Click the model button in the top bar: verify that the dropdown opens with Low/Medium/High pills and curated models for OpenAI, Gemini, Anthropic, and xAI.
   - Click the **Engineering Quiz** button: take the quiz, check explanations, and click "Drill Me with AI" to test chat integration.
   - Click the **Gmail** button in the chat input bar: verify that it turns green ("Gmail Active").
   - Send prompt: `"Summarize recent emails from engineering and draft a reply"` $\to$ verify that the assistant cites the email with an emerald badge and provides a formatted draft reply card.
