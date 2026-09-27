import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowUp,
  Square,
  Paperclip,
  Mail,
  Globe,
  X,
  FileText,
  SlidersHorizontal,
  HelpCircle,
  Inbox,
} from 'lucide-react';
import { UploadedDoc, EmailItem, Settings } from '../types';
import { getFirstSearchEngineName } from '../lib/search';

interface InputBarProps {
  input: string;
  setInput: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  isLoading: boolean;
  webSearch: boolean;
  onToggleWebSearch: () => void;
  gmailAccess?: boolean;
  onToggleGmailAccess?: () => void;
  docs: UploadedDoc[];
  onRemoveDoc: (id: string) => void;
  emails: EmailItem[];
  onRemoveEmail: (id: string) => void;
  systemPrompt: string;
  onChangeSystemPrompt: (prompt: string) => void;
  onOpenDocsDrawer: () => void;
  onOpenEmailDrawer: () => void;
  guardError: string | null;
  onClearGuardError: () => void;
  isKeyConfigured: boolean;
  settings: Settings;
  onOpenSettings: (tab?: 'keys' | 'gmail' | 'preferences') => void;
}

export const SYSTEM_PROMPT_PRESETS = [
  {
    name: 'General',
    prompt: 'You are a helpful, accurate assistant. Be concise. If you are not sure, say so.',
  },
  {
    name: 'Email assistant',
    prompt:
      'You help write clear, polite, brief emails. Match the tone of the email being replied to. Output only the email body unless asked otherwise.',
  },
  {
    name: 'Document analyst',
    prompt:
      'Answer only from the provided documents. Quote page numbers like [Report.pdf p.4]. If the answer is not in the documents, say so.',
  },
];

export const InputBar: React.FC<InputBarProps> = ({
  input,
  setInput,
  onSend,
  onStop,
  isLoading,
  webSearch,
  onToggleWebSearch,
  gmailAccess,
  onToggleGmailAccess,
  docs,
  onRemoveDoc,
  emails,
  onRemoveEmail,
  systemPrompt,
  onChangeSystemPrompt,
  onOpenDocsDrawer,
  onOpenEmailDrawer,
  guardError,
  onClearGuardError,
  isKeyConfigured,
  settings,
  onOpenSettings,
}) => {
  const [showSystemPromptPopover, setShowSystemPromptPopover] = useState(false);
  const [tempSystemPrompt, setTempSystemPrompt] = useState(systemPrompt);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 180)}px`;
    }
  }, [input]);

  // Sync temp system prompt
  useEffect(() => {
    setTempSystemPrompt(systemPrompt);
  }, [systemPrompt]);

  // Click outside system prompt popover
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowSystemPromptPopover(false);
      }
    };
    if (showSystemPromptPopover) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSystemPromptPopover]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (guardError) onClearGuardError();

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading) {
        onSend();
      }
    }
  };

  const readyIncludedDocs = docs.filter((d) => d.status === 'ready' && d.include);
  const searchEngine = getFirstSearchEngineName(settings);

  return (
    <div className="w-full max-w-[760px] mx-auto px-4 pb-4 shrink-0">
      {/* Guard Message Banner */}
      {guardError && (
        <div className="mb-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between animate-in fade-in slide-in-from-bottom-1">
          <span>{guardError}</span>
          <button
            onClick={onClearGuardError}
            className="p-1 hover:bg-amber-100 dark:hover:bg-amber-900/60 rounded-md transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Top Chip Bar (System prompt button + attached chips) */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2 relative">
        {/* System Prompt Button */}
        <div className="relative" ref={popoverRef}>
          <button
            onClick={() => setShowSystemPromptPopover(!showSystemPromptPopover)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-medium text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="w-3 h-3" />
            <span>System prompt</span>
          </button>

          {/* System Prompt Popover */}
          {showSystemPromptPopover && (
            <div className="absolute bottom-full left-0 mb-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-2xl z-50 space-y-3 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  System Prompt
                </span>
                <span className="text-[10px] text-slate-400">Applies to this chat</span>
              </div>

              {/* Presets */}
              <div className="flex gap-1.5 flex-wrap">
                {SYSTEM_PROMPT_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => {
                      setTempSystemPrompt(preset.prompt);
                      onChangeSystemPrompt(preset.prompt);
                    }}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors cursor-pointer ${
                      tempSystemPrompt === preset.prompt
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>

              <textarea
                value={tempSystemPrompt}
                onChange={(e) => setTempSystemPrompt(e.target.value)}
                rows={4}
                className="w-full text-xs p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans resize-y"
                placeholder="Custom system instructions..."
              />

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowSystemPromptPopover(false)}
                  className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    onChangeSystemPrompt(tempSystemPrompt);
                    setShowSystemPromptPopover(false);
                  }}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium cursor-pointer"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Web Search Chip */}
        {webSearch && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 text-[11px] font-medium text-sky-700 dark:text-sky-300">
            <Globe className="w-3 h-3 text-sky-500" />
            <span>Web search on</span>
            <button
              onClick={onToggleWebSearch}
              className="p-0.5 hover:bg-sky-100 dark:hover:bg-sky-900 rounded-md transition-colors"
              aria-label="Turn off web search"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        )}

        {/* Gmail Access Chip */}
        {gmailAccess && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
            <Inbox className="w-3 h-3 text-emerald-500" />
            <span>Gmail access on</span>
            {onToggleGmailAccess && (
              <button
                onClick={onToggleGmailAccess}
                className="p-0.5 hover:bg-emerald-100 dark:hover:bg-emerald-900 rounded-md transition-colors"
                aria-label="Turn off Gmail access"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        )}

        {/* Ready Document Chips */}
        {readyIncludedDocs.map((doc) => (
          <span
            key={doc.id}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-[11px] font-medium text-indigo-700 dark:text-indigo-300 max-w-[200px]"
          >
            <FileText className="w-3 h-3 text-indigo-500 shrink-0" />
            <span className="truncate">{doc.name}</span>
            <button
              onClick={() => onRemoveDoc(doc.id)}
              className="p-0.5 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded-md transition-colors"
              aria-label={`Remove ${doc.name}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}

        {/* Attached Email Chips */}
        {emails.map((email) => (
          <span
            key={email.id}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 max-w-[200px]"
          >
            <Mail className="w-3 h-3 text-emerald-500 shrink-0" />
            <span className="truncate">{email.subject || email.from || 'Attached email'}</span>
            <button
              onClick={() => onRemoveEmail(email.id)}
              className="p-0.5 hover:bg-emerald-100 dark:hover:bg-emerald-900 rounded-md transition-colors"
              aria-label="Remove attached email"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>

      {/* Main Input Box */}
      <div className="relative flex flex-col rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-md focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!isKeyConfigured || isLoading}
          placeholder={
            !isKeyConfigured
              ? 'Add an API key in Settings to start…'
              : 'Ask a question, or analyze attached docs & emails…'
          }
          rows={1}
          className="w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none max-h-48 leading-relaxed font-sans"
        />

        {/* Toolbar under textarea */}
        <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
          {/* Action Icons */}
          <div className="flex items-center gap-1">
            {/* Paperclip / Documents */}
            <button
              onClick={onOpenDocsDrawer}
              className="relative p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Attach documents (PDF, DOCX, TXT, CSV)"
              aria-label="Attach documents"
            >
              <Paperclip className="w-4 h-4" />
              {readyIncludedDocs.length > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-indigo-600" />
              )}
            </button>

            {/* Email */}
            <button
              onClick={onOpenEmailDrawer}
              className="relative p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Email (Paste or Gmail inbox)"
              aria-label="Email assistant"
            >
              <Mail className="w-4 h-4" />
              {emails.length > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-600" />
              )}
            </button>

            {/* Web Search Globe */}
            <button
              onClick={onToggleWebSearch}
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                webSearch
                  ? 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/60'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title={searchEngine.label}
              aria-label="Toggle web search"
            >
              <Globe className="w-4 h-4" />
            </button>

            {/* Gmail Access Toggle (LLM reads inbox in real-time) */}
            <button
              onClick={() => {
                if (onToggleGmailAccess) {
                  onToggleGmailAccess();
                }
              }}
              className={`relative flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                gmailAccess
                  ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title={
                gmailAccess
                  ? settings.gmail.status === 'ok'
                    ? `Gmail Connected (${settings.gmail.email}) — LLM searches & reads inbox`
                    : 'Gmail Demo Inbox Active — LLM reads simulated inbox'
                  : settings.gmail.status === 'ok'
                  ? 'Click to enable Gmail inbox access for the LLM'
                  : 'Click to enable Gmail access (uses demo inbox or configure credentials)'
              }
              aria-label="Toggle Gmail inbox access for LLM"
            >
              <Inbox className="w-3.5 h-3.5 shrink-0" />
              <span className="text-xs">
                {gmailAccess ? 'Gmail Active' : 'Gmail'}
              </span>
              {gmailAccess && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </button>
          </div>

          {/* Send / Stop Button */}
          <div>
            {isLoading ? (
              <button
                onClick={onStop}
                className="flex items-center justify-center w-8 h-8 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white transition-all shadow-xs cursor-pointer"
                title="Stop generation"
                aria-label="Stop generation"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            ) : (
              <button
                onClick={onSend}
                disabled={!isKeyConfigured || (!input.trim() && emails.length === 0)}
                className="flex items-center justify-center w-8 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-all shadow-xs cursor-pointer"
                title="Send message"
                aria-label="Send message"
              >
                <ArrowUp className="w-4 h-4 stroke-[2.5]" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
