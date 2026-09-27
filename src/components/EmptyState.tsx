import React from 'react';
import { Key, Sparkles, CheckCircle2, Circle, MessageSquare, ArrowRight } from 'lucide-react';
import { KeyState, ProviderId } from '../types';

interface EmptyStateProps {
  keys: Record<ProviderId, KeyState>;
  currentModel: string | null;
  onOpenSettings: (tab?: 'keys' | 'gmail' | 'preferences') => void;
  onOpenModelPicker: () => void;
  onOpenQuiz?: () => void;
  onSamplePrompt?: (prompt: string) => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  keys,
  currentModel,
  onOpenSettings,
  onOpenModelPicker,
  onOpenQuiz,
  onSamplePrompt,
}) => {
  const hasAnyKey = Object.values(keys).some((k) => k.status === 'ok');
  const hasModel = Boolean(currentModel);

  const step1Done = hasAnyKey;
  const step2Done = hasAnyKey && hasModel;
  const step3Done = false; // completed when user sends first question

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto my-auto animate-in fade-in duration-300">
      <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-5 shadow-xs">
        <Sparkles className="w-6 h-6" />
      </div>

      <h2 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight mb-2">
        Welcome to Harness
      </h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
        A private AI workspace connecting directly to your favorite models. Your keys stay in your browser.
      </p>

      {/* 3-Step Setup Card */}
      <div className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs text-left space-y-4 mb-6">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
          Get started in 3 steps
        </h3>

        {/* Step 1 */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {step1Done ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            ) : (
              <Circle className="w-5 h-5 text-slate-300 dark:text-slate-600 shrink-0" />
            )}
            <div>
              <div
                className={`text-xs font-semibold ${
                  step1Done
                    ? 'text-slate-900 dark:text-slate-100'
                    : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                1. Add an API key
              </div>
              <div className="text-[11px] text-slate-500">
                OpenAI or free Google Gemini key
              </div>
            </div>
          </div>

          {!step1Done ? (
            <button
              onClick={() => onOpenSettings('keys')}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors shadow-xs cursor-pointer"
            >
              Open Settings
            </button>
          ) : (
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
              Ready
            </span>
          )}
        </div>

        <div className="h-px bg-slate-100 dark:bg-slate-800" />

        {/* Step 2 */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {step2Done ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            ) : (
              <Circle className="w-5 h-5 text-slate-300 dark:text-slate-600 shrink-0" />
            )}
            <div>
              <div
                className={`text-xs font-semibold ${
                  step2Done
                    ? 'text-slate-900 dark:text-slate-100'
                    : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                2. Pick a model
              </div>
              <div className="text-[11px] text-slate-500">
                {currentModel ? currentModel : 'Select from available chat models'}
              </div>
            </div>
          </div>

          {step1Done && !step2Done && (
            <button
              onClick={onOpenModelPicker}
              className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium transition-colors cursor-pointer"
            >
              Choose
            </button>
          )}
        </div>

        <div className="h-px bg-slate-100 dark:bg-slate-800" />

        {/* Step 3 */}
        <div className="flex items-center gap-3">
          <Circle className="w-5 h-5 text-slate-300 dark:text-slate-600 shrink-0" />
          <div>
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              3. Ask your first question
            </div>
            <div className="text-[11px] text-slate-500">
              Attach documents, search the web, or draft emails
            </div>
          </div>
        </div>
      </div>

      {/* If keys are set, show prompt suggestions */}
      {step2Done && onSamplePrompt && (
        <div className="w-full space-y-2">
          <div className="text-[11px] font-semibold text-slate-400 text-left px-1">
            Try an example:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
            <button
              onClick={() =>
                onSamplePrompt(
                  'Convene the AI Council to debate: What are the biggest architecture trade-offs between a monolithic backend vs event-driven microservices for a high-traffic AI platform?'
                )
              }
              className="p-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800/60 bg-gradient-to-r from-indigo-50/70 to-purple-50/70 dark:from-indigo-950/40 dark:to-purple-950/40 hover:from-indigo-100 hover:to-purple-100 text-xs text-indigo-950 dark:text-indigo-200 transition-colors cursor-pointer flex items-center justify-between"
            >
              <span className="truncate font-medium">🏛️ AI Council: Architecture Debate</span>
              <ArrowRight className="w-3 h-3 text-indigo-500 shrink-0 ml-1" />
            </button>
            <button
              onClick={() =>
                onSamplePrompt(
                  'I have a meeting quiz with engineering. Please drill me on this system: ask me a challenging technical question about CORS proxying, IMAP sequence fetching vs UID search, model tier grading (Low/Medium/High), and zero-retention BYOK security!'
                )
              }
              className="p-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-xs text-indigo-900 dark:text-indigo-200 transition-colors cursor-pointer flex items-center justify-between"
            >
              <span className="truncate font-medium">🎓 Engineering Meeting Quiz Drill</span>
              <ArrowRight className="w-3 h-3 text-indigo-500 shrink-0 ml-1" />
            </button>
            <button
              onClick={() =>
                onSamplePrompt(
                  'Please check my Gmail inbox and summarize any recent engineering or project updates, then list any action items.'
                )
              }
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800/80 text-xs text-slate-700 dark:text-slate-300 transition-colors cursor-pointer flex items-center justify-between"
            >
              <span className="truncate">📬 Access Gmail & summarize inbox</span>
              <ArrowRight className="w-3 h-3 text-slate-400 shrink-0 ml-1" />
            </button>
            <button
              onClick={() =>
                onSamplePrompt(
                  'Compare OpenAI GPT-4o, Claude 3.5 Sonnet, and Gemini 2.5 Pro across reasoning benchmarks, latency, and context window limits.'
                )
              }
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800/80 text-xs text-slate-700 dark:text-slate-300 transition-colors cursor-pointer flex items-center justify-between"
            >
              <span className="truncate">⚖️ Compare frontier reasoning models</span>
              <ArrowRight className="w-3 h-3 text-slate-400 shrink-0 ml-1" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
