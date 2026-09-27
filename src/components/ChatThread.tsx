import React, { useRef, useEffect, useState } from 'react';
import { ChatMessage, Settings, UploadedDoc, EmailItem } from '../types';
import { Message } from './Message';
import { PROVIDER_CONFIG } from './ModelPicker';
import { FileUp, Loader2 } from 'lucide-react';

interface ChatThreadProps {
  messages: ChatMessage[];
  isLoading: boolean;
  isSearchingWeb: boolean;
  currentProvider: string | null;
  currentModel: string | null;
  settings: Settings;
  onRetry: () => void;
  onOpenSettings: (tab?: 'keys' | 'gmail' | 'preferences') => void;
  onFollowUp: (instruction: string) => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onDropFiles: (files: FileList | File[]) => void;
  attachedEmails?: EmailItem[];
  onEvaluateJudge?: (messageId: string) => void;
  evaluatingJudgeId?: string | null;
}

export const ChatThread: React.FC<ChatThreadProps> = ({
  messages,
  isLoading,
  isSearchingWeb,
  currentProvider,
  currentModel,
  settings,
  onRetry,
  onOpenSettings,
  onFollowUp,
  onToast,
  onDropFiles,
  attachedEmails,
  onEvaluateJudge,
  evaluatingJudgeId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [userHasScrolledUp, setUserHasScrolledUp] = useState(false);

  // Track if user scrolled up
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 60;
    setUserHasScrolledUp(!isAtBottom);
  };

  // Auto-scroll when new messages arrive if user hasn't scrolled up
  useEffect(() => {
    if (!userHasScrolledUp) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, isSearchingWeb, userHasScrolledUp]);

  // Drag and drop handlers for whole chat area
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onDropFiles(e.dataTransfer.files);
    }
  };

  const pConfig = currentProvider ? PROVIDER_CONFIG[currentProvider as keyof typeof PROVIDER_CONFIG] : null;

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex-1 overflow-y-auto px-4 py-6 relative"
    >
      {/* Drag Over Overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-indigo-50/90 dark:bg-slate-900/90 border-2 border-dashed border-indigo-500 rounded-3xl m-4 z-30 flex flex-col items-center justify-center pointer-events-none backdrop-blur-xs">
          <FileUp className="w-12 h-12 text-indigo-600 dark:text-indigo-400 mb-3 animate-bounce" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Drop documents here to attach
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Accepts PDF, DOCX, TXT, MD, CSV (max 25 MB each)
          </p>
        </div>
      )}

      <div className="max-w-[760px] mx-auto min-h-full flex flex-col justify-end">
        {/* Messages */}
        <div className="space-y-4">
          {messages.map((message) => (
            <Message
              key={message.id}
              message={message}
              settings={settings}
              onRetry={onRetry}
              onOpenSettings={onOpenSettings}
              onFollowUp={onFollowUp}
              onToast={onToast}
              attachedEmails={attachedEmails}
              onEvaluateJudge={onEvaluateJudge}
              isEvaluatingJudge={evaluatingJudgeId === message.id}
            />
          ))}

          {/* Thinking / Searching Indicator */}
          {isLoading && (
            <div className="my-4 space-y-1.5 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                {pConfig ? (
                  <span className={`w-2 h-2 rounded-full ${pConfig.dotColor}`} />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                )}
                <span className="font-mono text-slate-600 dark:text-slate-300">
                  {currentModel || 'Model'}
                </span>

                {isSearchingWeb ? (
                  <span className="inline-flex items-center gap-1.5 text-sky-600 dark:text-sky-400 font-medium">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Searching the web…
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    thinking
                    <span className="flex gap-1 ml-0.5">
                      <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce" />
                    </span>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div ref={bottomRef} className="h-4" />
      </div>
    </div>
  );
};
