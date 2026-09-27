import React, { useState } from 'react';
import {
  X,
  Award,
  BookOpen,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Copy,
  Check,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Terminal,
  Zap,
  Layers,
  Inbox,
  Globe,
  RotateCcw,
} from 'lucide-react';

interface EngineeringQuizModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartAiDrill: (prompt: string) => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

interface Question {
  id: number;
  category: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  keyTakeaway: string;
}

const QUIZ_QUESTIONS: Question[] = [
  {
    id: 1,
    category: 'Security & BYOK Architecture',
    question:
      'Why does Harness store provider API keys strictly in the browser, and what is the security contract of the server.ts backend?',
    options: [
      'Keys are saved in a server-side SQLite database with AES-256 encryption.',
      'The server is completely stateless and zero-retention; keys pass through transient memory for SMTP/Tavily only when needed and are never logged or stored.',
      'Keys are sent to a cloud key vault and cached in Redis for 24 hours.',
      'Keys are hashed with SHA-256 and verified against an authentication server on each request.',
    ],
    correctIndex: 1,
    explanation:
      'Harness uses a Bring-Your-Own-Key (BYOK) architecture. Keys for OpenAI, Gemini, and Anthropic are called directly or proxied through memory without persistence. The server stores zero secrets, has no database, and strips sensitive credentials from all server logs.',
    keyTakeaway:
      'Stateless proxying prevents liability: zero persistent credentials on server disks or databases.',
  },
  {
    id: 2,
    category: 'CORS & Proxy Infrastructure',
    question:
      'Why do direct browser fetch() calls to xAI Grok (api.x.ai) fail, and how does the Express backend solve it without introducing SSRF?',
    options: [
      'Grok requires WebSocket connections which standard fetch() cannot handle.',
      'xAI does not send Access-Control-Allow-Origin: * headers for browser web origins; the backend /api/proxy relays requests with an allowlist restricted only to trusted LLM endpoints.',
      'Browsers automatically block all requests containing bearer authorization headers.',
      'xAI API uses HTTP/3 QUIC which node-fetch cannot negotiate.',
    ],
    correctIndex: 1,
    explanation:
      'api.x.ai strictly enforces CORS policy that blocks arbitrary browser origins. The frontend delegates the request to the local /api/proxy endpoint, which validates that the destination hostname is in an explicit allowlist (api.openai.com, api.x.ai, etc.) before relaying the request.',
    keyTakeaway:
      'Never open an unconstrained open proxy; always enforce an allowlist of target hostnames to prevent Server-Side Request Forgery (SSRF).',
  },
  {
    id: 3,
    category: 'Model Grading Matrix (Low / Medium / High)',
    question:
      'How does Harness classify models into Low, Medium, and High tiers, and what engineering trade-off does this represent?',
    options: [
      'By file size of the weights (under 7B = Low, 70B = Medium, 405B = High).',
      'By cost, latency, and reasoning capability: Low = sub-second distilled models (4o-mini, 2.5-flash); Medium = balanced frontier multimodal (4o, 2.5-pro, 3.5-sonnet); High = deep multi-step reasoning models (o1, o3-mini, grok-3).',
      'By context window limit (32k = Low, 128k = Medium, 1M = High).',
      'By the release year of the model architecture.',
    ],
    correctIndex: 1,
    explanation:
      'Model grading maps directly to latency, cost, and reasoning depth. "Low" tier models optimize for fast throughput (<500ms TTFT) and low token pricing. "High" models employ hidden thought/reasoning chains suitable for math, logic, and intricate coding, with higher latency.',
    keyTakeaway:
      'Match model tier to intent: routing summaries or chat to Low saves 90% cost; High should be reserved for complex logic and architectural design.',
  },
  {
    id: 4,
    category: 'Gmail Protocol & RFC 3501 / SASL',
    question:
      'Why does Gmail reject a user\'s normal Google account password when connecting to imap.gmail.com:993, and what is required?',
    options: [
      'Google discontinued IMAP protocol support in 2024.',
      'Google enforces OAuth2 or 16-character dedicated App Passwords under 2-Step Verification for plain SASL authentication; normal passwords are blocked by Google security policy.',
      'IMAP port 993 only accepts public/private PGP key pairs.',
      'Google requires the sender email to end with @googlemail.com.',
    ],
    correctIndex: 1,
    explanation:
      'Standard Google passwords are intentionally blocked on legacy IMAP/SMTP basic auth endpoints to prevent credential leakage. Google requires users to enable 2-Step Verification and generate a dedicated 16-character App Password that bypasses interactive web 2FA.',
    keyTakeaway:
      'Always sanitize App Passwords (strip spaces, hyphens, and non-ASCII characters) and validate the exact 16-character length before attempting IMAP handshake.',
  },
  {
    id: 5,
    category: 'IMAP Performance & Fetch Strategies',
    question:
      'When listing emails from an inbox with 50,000+ messages, why does Harness use sequence ranges (e.g. start:*) instead of UID SEARCH queries when no search term is entered?',
    options: [
      'UID search is deprecated in the IMAP4rev1 specification.',
      'Sequence fetching accesses pre-indexed message sequence numbers directly from mailbox metadata in O(1) without requiring the IMAP server to scan and sort message headers across 50,000 emails.',
      'Google IMAP server limits search queries to a maximum of 100 messages per user.',
      'Sequence numbers contain the message body directly in the packet.',
    ],
    correctIndex: 1,
    explanation:
      'In IMAP (RFC 3501), mailbox.exists provides the total message count instantly. Fetching a sequence range like (total - 20):* reads the newest 20 messages with minimal server computation, avoiding the high latency of full inbox UID scanning.',
    keyTakeaway:
      'Always prefer bounded sequence number ranges for recent items; reserve UID SEARCH for explicit text queries.',
  },
  {
    id: 6,
    category: 'Client-Side Document Parsing & Privacy',
    question:
      'How does Harness parse PDF and DOCX files without uploading them to third-party APIs or backend storage?',
    options: [
      'By converting files to images using the browser Canvas and running OCR.',
      'Using in-browser client-side libraries: pdfjs-dist for PDF text extraction via canvas/worker and mammoth for DOCX XML AST decoding directly in browser memory.',
      'By sending binary files to an AWS Textract endpoint.',
      'By reading raw ASCII bytes from the File object using FileReader.',
    ],
    correctIndex: 1,
    explanation:
      'To preserve privacy and prevent cloud storage costs, all file parsing occurs client-side in the browser execution thread using pdfjs-dist and mammoth. Text is extracted, chunked, and stored only in active chat memory.',
    keyTakeaway:
      'In-browser parsing gives zero-data-retention guarantees to enterprise users and eliminates server file processing infrastructure.',
  },
  {
    id: 7,
    category: 'Token Budgeting & Context Windows',
    question:
      'How does the trimHistory algorithm ensure prompt payloads do not exceed model context limits while preserving conversation context?',
    options: [
      'It truncates the characters of all messages equally by 50%.',
      'It calculates character-to-token heuristics (~4 chars/token), locks the system prompt and the latest user turn, and trims older turns chronologically from the middle/beginning until within budget.',
      'It discards all user messages and retains only assistant responses.',
      'It compresses messages using GZIP before sending to the model API.',
    ],
    correctIndex: 1,
    explanation:
      'trimHistory uses the standard heuristic (ceil(length / 4)) to estimate tokens. It always reserves budget for the system prompt (which contains document/email context) and guarantees the latest user turn is never dropped, dropping older chat history first.',
    keyTakeaway:
      'A sliding window that prioritizes the system prompt and latest user prompt prevents abrupt context cutoff errors.',
  },
  {
    id: 8,
    category: 'Grounding & Multi-Tier Search Fallbacks',
    question:
      'What is the search fallback cascade in Harness when Web Search is toggled on, and how are failures communicated?',
    options: [
      'Google Search -> Bing Search -> DuckDuckGo.',
      'Tavily API (Relayed via server) -> Gemini Google Grounding (if Gemini key available) -> Wikipedia API (free, open endpoint), displaying an Amber degradation note if downgraded.',
      'Brave Search -> SerpApi -> Yahoo Search.',
      'Direct HTTP scraping of Google search results.',
    ],
    correctIndex: 1,
    explanation:
      'Harness prioritizes high-fidelity AI web search through Tavily (1,000 free queries). If no Tavily key exists, it falls back to Google Grounding via Gemini 2.5 Flash, and finally to Wikipedia. If an engine fails, an Amber indicator informs the user of the fallback.',
    keyTakeaway:
      'Graceful degradation with transparent UI signaling ensures the application never crashes when external search APIs are throttled or unconfigured.',
  },
  {
    id: 9,
    category: 'RFC 2822 Email Threading',
    question:
      'When the LLM drafts an email reply and the user sends it via SMTP, which headers are required to preserve thread grouping in the recipient’s email client?',
    options: [
      'X-Thread-ID and Conversation-Index only.',
      'In-Reply-To (referencing the original Message-ID) and References (the accumulated chain of prior Message-IDs).',
      'Subject header prefixed with "RE: " is the only requirement under SMTP standards.',
      'SMTP protocol automatically threads all messages sharing the same subject line.',
    ],
    correctIndex: 1,
    explanation:
      'Under RFC 2822 / RFC 5322, email clients group threads using the In-Reply-To and References headers containing unique Message-IDs (<...>), not solely by the subject line.',
    keyTakeaway:
      'Always capture messageId and references during IMAP fetch so replies maintain proper client threading.',
  },
  {
    id: 10,
    category: 'Resilience & Storage Boundaries',
    question:
      'Why does the safe storage wrapper (store.get/store.set) wrap all localStorage calls in try/catch blocks?',
    options: [
      'localStorage has a 1-second timeout in modern browsers.',
      'Browsers in private/incognito mode or inside sandboxed iframes (like AI Studio preview) frequently throw SecurityError or QuotaExceededError when accessing window.localStorage.',
      'localStorage data is encrypted by default and requires asynchronous decryption.',
      'To prevent memory leaks when storing binary array buffers.',
    ],
    correctIndex: 1,
    explanation:
      'Sandboxed iframes and privacy modes in Safari/Chrome restrict or deny access to localStorage. Calling localStorage directly without defensive wrappers causes catastrophic app white-screens.',
    keyTakeaway:
      'Defensive storage wrappers with in-memory fallbacks are mandatory for web applications running inside embedded iframe environments.',
  },
];

export const EngineeringQuizModal: React.FC<EngineeringQuizModalProps> = ({
  isOpen,
  onClose,
  onStartAiDrill,
  onToast,
}) => {
  const [activeTab, setActiveTab] = useState<'quiz' | 'guide'>('quiz');
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [showResults, setShowResults] = useState(false);
  const [copiedGuide, setCopiedGuide] = useState(false);

  if (!isOpen) return null;

  const handleSelectOption = (questionId: number, optionIndex: number) => {
    setUserAnswers((prev) => ({
      ...prev,
      [questionId]: optionIndex,
    }));
  };

  const answeredCount = Object.keys(userAnswers).length;
  const correctCount = QUIZ_QUESTIONS.filter(
    (q) => userAnswers[q.id] === q.correctIndex
  ).length;

  const handleResetQuiz = () => {
    setUserAnswers({});
    setShowResults(false);
    onToast('Quiz reset', 'info');
  };

  const getScoreGrade = () => {
    const score = correctCount;
    if (score === 10) return { title: 'Principal Architect (10/10)', color: 'text-purple-600', badge: 'bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300' };
    if (score >= 8) return { title: 'Staff Engineer (8-9/10)', color: 'text-indigo-600', badge: 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300' };
    if (score >= 6) return { title: 'Senior Software Engineer (6-7/10)', color: 'text-emerald-600', badge: 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300' };
    return { title: 'Engineering Candidate (<6/10)', color: 'text-amber-600', badge: 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300' };
  };

  const handleCopyStudyGuide = () => {
    const guideText = `
# Harness Engineering Architecture & Meeting Prep Guide

## 1. Core Architecture & Philosophy
- **BYOK (Bring Your Own Key)**: Zero credentials stored on server or database.
- **Client-Side Heavy**: Parsing of PDF, DOCX, CSV happens entirely in-browser using pdfjs-dist and mammoth.
- **Stateless Backend**: Express server.ts relays IMAP/SMTP and acts as an SSRF-hardened CORS proxy for LLM APIs (OpenAI, xAI Grok, Anthropic, Gemini).

## 2. Model Tier Grading Matrix
- **Low**: Fast & Lightweight (gpt-4o-mini, gemini-2.5-flash, claude-3-5-haiku, grok-2-mini). Best for summaries, email drafting, low latency (<500ms).
- **Medium**: Balanced Frontier (gpt-4o, gemini-2.5-pro, claude-3-5-sonnet, grok-2). General-purpose coding, synthesis, multi-turn chat.
- **High**: Frontier Reasoning (o1, o3-mini, grok-3, claude-3-7-sonnet). Deep multi-step reasoning, architectural designs, complex mathematical logic.

## 3. Email & Gmail Protocol Details
- **RFC 3501 (IMAP)**: Gmail requires a 16-character App Password (under 2FA). Standard passwords fail with AUTHENTICATIONFAILED.
- **Sequence Fetching**: In large inboxes, uses (total - limit):* sequence numbers instead of UID search for O(1) fetch latency.
- **RFC 2822 / 5322 Threading**: Drafts and replies pass In-Reply-To and References headers with messageId to keep threads grouped in Gmail.

## 4. Search & Grounding Cascade
- **Tier 1**: Tavily Search (AI-optimized, 1,000 free queries, relay via server).
- **Tier 2**: Google Gemini Grounding (gemini-2.5-flash web search).
- **Tier 3**: Wikipedia Open API (free open knowledge fallback).
- **Amber Alerts**: UI notifies user if search downgraded or failed.

## 5. Security & Browser Sandboxing
- **CORS Handling**: Direct browser calls to api.x.ai fail due to lack of CORS headers; /api/proxy securely forwards requests.
- **SSRF Prevention**: /api/proxy enforces a strict domain allowlist.
- **Storage Resilience**: Safe wrapper guards all localStorage access against SecurityError in sandboxed iframes.
`.trim();

    navigator.clipboard.writeText(guideText);
    setCopiedGuide(true);
    setTimeout(() => setCopiedGuide(false), 2500);
    onToast('Study guide copied to clipboard!', 'success');
  };

  const handleLaunchAiInterview = () => {
    const drillPrompt =
      'Please act as an engineering tech lead conducting a technical meeting quiz on the Harness multi-model BYOK system architecture. Quiz me on CORS proxying, IMAP sequence fetching vs UID search, model tier grading (Low, Medium, High), and zero-storage security. Ask me the first question and evaluate my answer with technical depth!';
    onClose();
    onStartAiDrill(drillPrompt);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-4xl w-full shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white">
                  Engineering Architecture Quiz & Prep
                </h3>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                  Meeting Prep
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                10-question technical deep-dive on Harness architecture, protocols, CORS, IMAP, and model tiers.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close quiz modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs & Actions */}
        <div className="px-5 pt-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
          <div className="flex gap-4 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('quiz')}
              className={`pb-2.5 flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                activeTab === 'quiz'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              Interactive Quiz ({answeredCount}/{QUIZ_QUESTIONS.length})
            </button>
            <button
              onClick={() => setActiveTab('guide')}
              className={`pb-2.5 flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                activeTab === 'guide'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              Meeting Cheat Sheet
            </button>
          </div>

          <div className="flex items-center gap-2 pb-2">
            <button
              onClick={handleLaunchAiInterview}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-xs font-semibold transition-colors cursor-pointer border border-indigo-200 dark:border-indigo-800"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              Drill Me with AI &rarr;
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {activeTab === 'quiz' ? (
            <div className="space-y-6">
              {/* Score Summary Banner */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Progress: {answeredCount} of {QUIZ_QUESTIONS.length} answered
                    </span>
                    {answeredCount === QUIZ_QUESTIONS.length && (
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${getScoreGrade().badge}`}>
                        {getScoreGrade().title}
                      </span>
                    )}
                  </div>
                  <div className="w-48 sm:w-64 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 dark:bg-indigo-400 transition-all duration-300"
                      style={{ width: `${(answeredCount / QUIZ_QUESTIONS.length) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowResults(!showResults)}
                    className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                  >
                    {showResults ? 'Hide Explanations' : 'Review Explanations'}
                  </button>
                  <button
                    onClick={handleResetQuiz}
                    className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
                    title="Reset quiz"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Questions List */}
              <div className="space-y-6">
                {QUIZ_QUESTIONS.map((q, idx) => {
                  const selected = userAnswers[q.id];
                  const isAnswered = selected !== undefined;
                  const isCorrect = selected === q.correctIndex;

                  return (
                    <div
                      key={q.id}
                      className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 space-y-3.5 shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded-md">
                              Q{idx + 1} · {q.category}
                            </span>
                            {isAnswered && (
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                                  isCorrect
                                    ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                                }`}
                              >
                                {isCorrect ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                {isCorrect ? 'Correct' : 'Needs review'}
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                            {q.question}
                          </h4>
                        </div>
                      </div>

                      {/* Options */}
                      <div className="grid grid-cols-1 gap-2 pt-1">
                        {q.options.map((opt, optIdx) => {
                          const isOptionSelected = selected === optIdx;
                          const showCorrectness = isAnswered || showResults;
                          const isThisOptionCorrect = optIdx === q.correctIndex;

                          let optionStyle =
                            'border-slate-200 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300';

                          if (showCorrectness) {
                            if (isThisOptionCorrect) {
                              optionStyle =
                                'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 font-medium ring-1 ring-emerald-500/30';
                            } else if (isOptionSelected && !isThisOptionCorrect) {
                              optionStyle =
                                'border-rose-400 bg-rose-50/80 dark:bg-rose-950/60 text-rose-900 dark:text-rose-200';
                            }
                          } else if (isOptionSelected) {
                            optionStyle =
                              'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/50 text-indigo-900 dark:text-indigo-200 font-semibold';
                          }

                          return (
                            <button
                              key={optIdx}
                              onClick={() => handleSelectOption(q.id, optIdx)}
                              className={`p-3 rounded-xl border text-left text-xs transition-all cursor-pointer flex items-start gap-2.5 ${optionStyle}`}
                            >
                              <span className="w-5 h-5 rounded-full border border-slate-300 dark:border-slate-600 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                                {String.fromCharCode(65 + optIdx)}
                              </span>
                              <span className="flex-1 leading-relaxed">{opt}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Explanation Box (Visible if answered or reviewed) */}
                      {(isAnswered || showResults) && (
                        <div className="mt-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 text-xs space-y-1.5">
                          <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                            <HelpCircle className="w-3.5 h-3.5 text-indigo-500" />
                            Technical Rationale:
                          </div>
                          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                            {q.explanation}
                          </p>
                          <div className="pt-1 text-[11px] text-indigo-700 dark:text-indigo-300 font-medium">
                            💡 Key Takeaway: {q.keyTakeaway}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Tab 2: Meeting Cheat Sheet & Study Guide */
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800">
                <div>
                  <h4 className="text-sm font-bold text-indigo-900 dark:text-indigo-200">
                    Engineering Architecture Cheat Sheet
                  </h4>
                  <p className="text-xs text-indigo-700 dark:text-indigo-300">
                    High-level architectural talking points and protocol specifications for your engineering meeting.
                  </p>
                </div>
                <button
                  onClick={handleCopyStudyGuide}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors cursor-pointer shadow-xs shrink-0"
                >
                  {copiedGuide ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedGuide ? 'Copied' : 'Copy Cheat Sheet'}
                </button>
              </div>

              {/* Grid of Key Architecture Areas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. BYOK & Zero Storage */}
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    1. Zero-Retention BYOK Contract
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    User keys (OpenAI, Gemini, Anthropic, xAI) reside in client memory and localStorage. The backend server acts as a transient pass-through proxy with zero database, zero persistent disk caching, and zero secrets logging.
                  </p>
                </div>

                {/* 2. CORS & Proxy */}
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    <Terminal className="w-4 h-4 text-indigo-500" />
                    2. CORS & Proxy Isolation
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Direct browser calls to api.x.ai fail due to cross-origin headers. The /api/proxy route runs with strict target-host allowlisting to mitigate SSRF while facilitating cross-origin API calls seamlessly.
                  </p>
                </div>

                {/* 3. Model Tiers */}
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    <Layers className="w-4 h-4 text-purple-500" />
                    3. Model Tiering (Low / Med / High)
                  </div>
                  <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1 list-disc pl-4">
                    <li><strong className="text-emerald-600">Low:</strong> Sub-second latency, cheap token costs (4o-mini, 2.5-flash).</li>
                    <li><strong className="text-sky-600">Medium:</strong> General-purpose frontier multimodal (4o, 2.5-pro, 3.5-sonnet).</li>
                    <li><strong className="text-purple-600">High:</strong> Multi-step chain-of-thought reasoning (o1, o3-mini, grok-3).</li>
                  </ul>
                </div>

                {/* 4. Gmail IMAP / SMTP */}
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    <Inbox className="w-4 h-4 text-sky-500" />
                    4. Gmail IMAP & Threading
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    RFC 3501 IMAP connection requires 16-letter App Passwords under Google 2FA. Newest messages fetch in O(1) via sequence bounds. SMTP replies preserve RFC 2822 In-Reply-To and References headers for client threading.
                  </p>
                </div>

                {/* 5. In-Browser RAG */}
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    <Zap className="w-4 h-4 text-amber-500" />
                    5. Client-Side Document RAG
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    PDF and DOCX extraction executes 100% in-browser using pdfjs-dist and mammoth. Text is split into 400-word chunks and retrieved by keyword density into the system prompt.
                  </p>
                </div>

                {/* 6. Grounding Fallback */}
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    <Globe className="w-4 h-4 text-teal-500" />
                    6. Search Degradation Ladder
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Tavily AI search &rarr; Gemini 2.5 Flash Google Grounding &rarr; Wikipedia API open endpoint. Amber warning notices inform the user if an engine was throttled or failed.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {answeredCount} of {QUIZ_QUESTIONS.length} questions completed
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors shadow-xs cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
