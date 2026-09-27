import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Copy,
  Check,
  RotateCw,
  Settings as SettingsIcon,
  AlertCircle,
  FileText,
  ExternalLink,
  Globe,
  Mail,
} from 'lucide-react';
import { ChatMessage, Settings } from '../types';
import { PROVIDER_CONFIG } from './ModelPicker';
import { DraftCard } from './DraftCard';

interface MessageProps {
  message: ChatMessage;
  settings: Settings;
  onRetry: () => void;
  onOpenSettings: (tab?: 'keys' | 'gmail' | 'preferences') => void;
  onFollowUp: (instruction: string) => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  attachedEmails?: { fromEmail: string; source: 'paste' | 'gmail'; messageId?: string; references?: string }[];
}

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url.slice(0, 30);
  }
}

export const Message: React.FC<MessageProps> = ({
  message,
  settings,
  onRetry,
  onOpenSettings,
  onFollowUp,
  onToast,
  attachedEmails,
}) => {
  const [copied, setCopied] = useState(false);

  const isUser = message.role === 'user';
  const provider = message.provider;
  const pConfig = provider ? PROVIDER_CONFIG[provider] : null;

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      onToast('Copied', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onToast('Failed to copy', 'error');
    }
  };

  if (isUser) {
    return (
      <div className="flex justify-end my-4">
        <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 bg-indigo-600 text-white shadow-xs font-sans text-sm leading-relaxed whitespace-pre-wrap selection:bg-indigo-400 selection:text-white">
          {message.content}
        </div>
      </div>
    );
  }

  // Error Card
  if (message.error) {
    const isKeyError =
      message.error.title.toLowerCase().includes('key') ||
      message.error.detail.toLowerCase().includes('settings') ||
      message.error.title.toLowerCase().includes('credit');

    return (
      <div className="my-4 max-w-full">
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 shadow-xs space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 mt-0.5">
              <AlertCircle className="w-4 h-4" />
            </div>
            <div className="space-y-1 flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-rose-900 dark:text-rose-200">
                {message.error.title}
              </h4>
              <p className="text-xs text-rose-700 dark:text-rose-300 leading-relaxed">
                {message.error.detail}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1 border-t border-rose-200/60 dark:border-rose-900/40">
            {message.error.canRetry && (
              <button
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium transition-colors cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" />
                Retry
              </button>
            )}

            {isKeyError && (
              <button
                onClick={() => onOpenSettings('keys')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-800 text-xs font-medium transition-colors cursor-pointer"
              >
                <SettingsIcon className="w-3.5 h-3.5" />
                Open Settings
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Stopped message
  if (message.content === 'Stopped.') {
    return (
      <div className="my-3 flex items-center gap-2 text-xs text-slate-400 italic">
        <span className="w-2 h-2 rounded-full bg-slate-400" />
        Stopped.
      </div>
    );
  }

  // Find source email if this message is a draft
  const sourceEmail = attachedEmails && attachedEmails.length > 0 ? attachedEmails[0] : undefined;

  return (
    <div className="my-5 group max-w-full space-y-2">
      {/* Header Info */}
      <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          {pConfig ? (
            <span className={`w-2.5 h-2.5 rounded-full ${pConfig.dotColor} shrink-0`} />
          ) : (
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0" />
          )}
          <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
            {message.model || 'Assistant'}
          </span>
          {message.usage && (
            <span className="text-[11px] text-slate-400">
              ({message.usage.input} in · {message.usage.output} out)
            </span>
          )}
        </div>

        <button
          onClick={handleCopyMessage}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all cursor-pointer"
          aria-label="Copy message"
          title="Copy message"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Draft Card if message has email draft */}
      {message.draft ? (
        <DraftCard
          draft={message.draft}
          sourceEmail={sourceEmail}
          settings={settings}
          onFollowUp={onFollowUp}
          onToast={onToast}
        />
      ) : (
        /* Markdown Output */
        <div className="prose prose-sm dark:prose-invert max-w-none text-slate-800 dark:text-slate-200 leading-relaxed font-sans">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 dark:text-indigo-400 underline hover:text-indigo-700 inline-flex items-center gap-0.5"
                >
                  {children}
                  <ExternalLink className="w-3 h-3 inline ml-0.5" />
                </a>
              ),
              pre: ({ children }) => (
                <div className="relative group/code my-3">
                  <pre className="overflow-x-auto p-3.5 rounded-xl bg-slate-900 text-slate-100 text-xs font-mono border border-slate-800">
                    {children}
                  </pre>
                </div>
              ),
              code: ({ inline, className, children, ...props }: any) => {
                const [copiedCode, setCopiedCode] = useState(false);
                const codeString = String(children).replace(/\n$/, '');

                if (inline) {
                  return (
                    <code
                      className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-mono text-[13px]"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                }

                const handleCopyCode = async () => {
                  try {
                    await navigator.clipboard.writeText(codeString);
                    setCopiedCode(true);
                    onToast('Copied', 'success');
                    setTimeout(() => setCopiedCode(false), 2000);
                  } catch {
                    onToast('Failed to copy', 'error');
                  }
                };

                return (
                  <div className="relative">
                    <button
                      onClick={handleCopyCode}
                      className="absolute right-2 top-2 p-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                      title="Copy code"
                      aria-label="Copy code"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <code className="block font-mono text-xs" {...props}>
                      {children}
                    </code>
                  </div>
                );
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      )}

      {/* Used Docs line */}
      {message.usedDocs && message.usedDocs.length > 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 pt-1">
          <FileText className="w-3 h-3 text-slate-400 shrink-0" />
          <span>Used: {message.usedDocs.join(', ')}</span>
        </div>
      )}

      {/* Used Emails line */}
      {message.usedEmails && message.usedEmails.length > 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 pt-1">
          <Mail className="w-3 h-3 shrink-0" />
          <span>Referenced Gmail: {message.usedEmails.join(' · ')}</span>
        </div>
      )}

      {/* Web Search Sources */}
      {message.sources && message.sources.length > 0 && (
        <div className="pt-2 flex flex-wrap gap-1.5 items-center">
          <span className="text-[11px] text-slate-400 mr-1 flex items-center gap-1">
            <Globe className="w-3 h-3" /> Sources:
          </span>
          {message.sources.map((src, i) => (
            <a
              key={i}
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
              title={src.title || src.url}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 text-[11px] transition-colors border border-slate-200 dark:border-slate-700/60"
            >
              <span>{extractDomain(src.url)}</span>
              <ExternalLink className="w-2.5 h-2.5 text-slate-400" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
};
