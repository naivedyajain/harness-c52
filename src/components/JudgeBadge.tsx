import React, { useState } from 'react';
import {
  Scale,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Loader2,
  Award,
  Sparkles,
} from 'lucide-react';
import { LLMJudgeEvaluation, ProviderId } from '../types';

interface JudgeBadgeProps {
  evaluation?: LLMJudgeEvaluation;
  onEvaluate: () => void;
  isLoading?: boolean;
}

const PROVIDER_NAMES: Record<ProviderId, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI GPT',
  anthropic: 'Anthropic Claude',
  xai: 'xAI Grok',
};

export const JudgeBadge: React.FC<JudgeBadgeProps> = ({
  evaluation,
  onEvaluate,
  isLoading = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // If not evaluated yet
  if (!evaluation && !isLoading) {
    return (
      <div className="pt-2">
        <button
          onClick={onEvaluate}
          type="button"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 dark:hover:bg-purple-900/60 transition-colors border border-purple-200 dark:border-purple-800/80 cursor-pointer shadow-2xs"
          title="Use xAI Grok to evaluate response accuracy, completeness, and hallucination check"
        >
          <Scale className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
          <span>Evaluate with Grok Judge</span>
        </button>
      </div>
    );
  }

  // If currently evaluating
  if (isLoading || evaluation?.status === 'evaluating') {
    return (
      <div className="pt-2">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600 dark:text-purple-400" />
          <span>xAI Grok evaluating response accuracy...</span>
        </div>
      </div>
    );
  }

  if (!evaluation || evaluation.status === 'failed') {
    return (
      <div className="pt-2">
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900">
          <span>Judge evaluation failed: {evaluation?.error || 'Could not reach model'}</span>
          <button
            onClick={onEvaluate}
            className="hover:underline flex items-center gap-1 font-medium cursor-pointer"
          >
            <RotateCw className="w-3 h-3" /> Retry
          </button>
        </div>
      </div>
    );
  }

  const score = evaluation.overallScore ?? 85;
  const accuracy = evaluation.accuracyScore ?? score;
  const completeness = evaluation.completenessScore ?? score;
  const reasoning = evaluation.reasoningScore ?? score;

  // Grade styling
  let scoreBadgeColor = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
  let scoreBarColor = 'bg-emerald-500';

  if (score < 60) {
    scoreBadgeColor = 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800';
    scoreBarColor = 'bg-rose-500';
  } else if (score < 80) {
    scoreBadgeColor = 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    scoreBarColor = 'bg-amber-500';
  } else if (score >= 90) {
    scoreBadgeColor = 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800';
    scoreBarColor = 'bg-indigo-500';
  }

  const judgeProviderLabel = PROVIDER_NAMES[evaluation.judgeProvider] || evaluation.judgeProvider;

  return (
    <div className="pt-3">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 shadow-2xs overflow-hidden">
        {/* Header Bar */}
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center justify-between px-3 py-2 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-slate-100/70 dark:hover:bg-slate-800/70 cursor-pointer transition-colors select-none"
        >
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
              <Scale className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Judge Score:
                </span>
                <span
                  className={`px-1.5 py-0.2 rounded-md font-mono text-xs font-bold border ${scoreBadgeColor}`}
                >
                  {score}/100
                </span>
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  ({evaluation.verdict})
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-[11px] text-slate-400 font-sans">
              Evaluated by {judgeProviderLabel}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEvaluate();
              }}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded cursor-pointer transition-colors"
              title="Re-evaluate response"
            >
              <RotateCw className="w-3 h-3" />
            </button>
            <div className="text-slate-400">
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </div>
        </div>

        {/* Expanded Details */}
        {isExpanded && (
          <div className="p-3.5 space-y-3 border-t border-slate-200/60 dark:border-slate-800/60 text-xs">
            {/* Score Breakdown Bars */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Factual Accuracy</span>
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                    {accuracy}%
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${scoreBarColor} rounded-full transition-all duration-500`}
                    style={{ width: `${accuracy}%` }}
                  />
                </div>
              </div>

              <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Completeness</span>
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                    {completeness}%
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-500"
                    style={{ width: `${completeness}%` }}
                  />
                </div>
              </div>

              <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Logical Reasoning</span>
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                    {reasoning}%
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all duration-500"
                    style={{ width: `${reasoning}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Critique paragraph */}
            {evaluation.critique && (
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1">
                  Judge Assessment ({evaluation.judgeModel})
                </span>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-sans">
                  {evaluation.critique}
                </p>
              </div>
            )}

            {/* Strengths & Weaknesses */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {evaluation.strengths && evaluation.strengths.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Key Strengths
                  </span>
                  <ul className="space-y-1 pl-1">
                    {evaluation.strengths.map((str, idx) => (
                      <li key={idx} className="text-[11px] text-slate-600 dark:text-slate-400 flex items-start gap-1.5 leading-snug">
                        <span className="text-emerald-500 font-bold">•</span>
                        <span>{str}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {evaluation.weaknesses && evaluation.weaknesses.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Areas to Note / Flaws
                  </span>
                  <ul className="space-y-1 pl-1">
                    {evaluation.weaknesses.map((weak, idx) => (
                      <li key={idx} className="text-[11px] text-slate-600 dark:text-slate-400 flex items-start gap-1.5 leading-snug">
                        <span className="text-amber-500 font-bold">•</span>
                        <span>{weak}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
