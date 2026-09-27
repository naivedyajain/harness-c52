import React, { useState } from 'react';
import {
  Users,
  Award,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  MessageSquare,
  Sparkles,
  Copy,
  Check,
  Loader2,
  Scale,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AICouncilSession, ProviderId } from '../types';

interface AICouncilCardProps {
  council: AICouncilSession;
  onToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const PROVIDER_THEME: Record<
  ProviderId,
  { bg: string; text: string; border: string; dot: string }
> = {
  gemini: {
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-800',
    dot: 'bg-blue-500',
  },
  openai: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-800',
    dot: 'bg-emerald-600',
  },
  anthropic: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-800 dark:text-amber-200',
    border: 'border-amber-200 dark:border-amber-800',
    dot: 'bg-amber-600',
  },
  xai: {
    bg: 'bg-purple-50 dark:bg-purple-950/40',
    text: 'text-purple-700 dark:text-purple-300',
    border: 'border-purple-200 dark:border-purple-800',
    dot: 'bg-purple-500',
  },
};

export const AICouncilCard: React.FC<AICouncilCardProps> = ({ council, onToast }) => {
  const round1 = council.rounds.find((r) => r.roundNumber === 1);
  const round2 = council.rounds.find((r) => r.roundNumber === 2);
  const consensus = council.consensus;

  // Start on available tab: consensus if done, round1 if round1 ready, else consensus
  const [activeTab, setActiveTab] = useState<'consensus' | 'round2' | 'round1'>(
    consensus ? 'consensus' : round1 && round1.contributions.length > 0 ? 'round1' : 'consensus'
  );
  const [selectedModelIdx, setSelectedModelIdx] = useState<number>(0);
  const [copied, setCopied] = useState(false);

  // Switch to consensus automatically when consensus is finalized
  React.useEffect(() => {
    if (consensus) {
      setActiveTab('consensus');
    }
  }, [Boolean(consensus)]);

  const isDebating = council.status === 'debating';
  const participants = council.participants || [];

  const handleCopyTranscript = () => {
    let transcript = `# AI COUNCIL DEBATE TRANSCRIPT\n\n`;
    transcript += `Participants: ${participants.map((p) => `${p.company} (${p.model})`).join(', ')}\n\n`;

    if (consensus) {
      transcript += `## FINAL CONSENSUS VERDICT\n${consensus.verdict}\n\n${consensus.synthesis}\n\n`;
      transcript += `### Points of Agreement:\n${consensus.agreements.map((a) => `- ${a}`).join('\n')}\n\n`;
      transcript += `### Dissenting Points / Trade-offs:\n${consensus.disagreements.map((d) => `- ${d}`).join('\n')}\n\n`;
    }

    if (round2) {
      transcript += `## ROUND 2: CROSS-EXAMINATION DEBATE\n`;
      round2.contributions.forEach((c) => {
        transcript += `### ${c.company} (${c.model})\n${c.content}\n\n`;
      });
    }

    if (round1) {
      transcript += `## ROUND 1: INITIAL PROPOSALS\n`;
      round1.contributions.forEach((c) => {
        transcript += `### ${c.company} (${c.model})\n${c.content}\n\n`;
      });
    }

    navigator.clipboard.writeText(transcript);
    setCopied(true);
    onToast?.('Council debate transcript copied to clipboard', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-4 rounded-2xl border border-indigo-200/90 dark:border-indigo-900/60 bg-gradient-to-b from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-950 shadow-md overflow-hidden font-sans">
      {/* Council Header */}
      <div className="px-5 py-4 bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-white/10 backdrop-blur-xs border border-white/10 text-indigo-300">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
                AI Council Chamber
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-indigo-500/20 text-indigo-200 border border-indigo-400/30">
                Multi-Model Debate
              </span>
            </div>
            <p className="text-xs text-slate-300">
              {isDebating ? (
                <span className="flex items-center gap-1.5 text-amber-300">
                  <Loader2 className="w-3 h-3 animate-spin" /> {council.currentStage}
                </span>
              ) : (
                'Cross-model debate and consensus completed across leading AI labs'
              )}
            </p>
          </div>
        </div>

        {/* Participating Model Badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          {participants.map((p, idx) => {
            const theme = PROVIDER_THEME[p.provider];
            return (
              <div
                key={idx}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-white/10 border border-white/10 text-white backdrop-blur-xs"
                title={`${p.company} using ${p.model}`}
              >
                <span className={`w-2 h-2 rounded-full ${theme.dot}`} />
                <span>{p.company}</span>
              </div>
            );
          })}

          {!isDebating && (
            <button
              onClick={handleCopyTranscript}
              type="button"
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 transition-colors ml-1 cursor-pointer"
              title="Copy debate transcript"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar while debating */}
      {isDebating && (
        <div className="w-full h-1 bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 animate-pulse w-full" />
        </div>
      )}

      {/* Tab Selectors */}
      <div className="flex items-center border-b border-slate-200 dark:border-slate-800 px-4 bg-slate-50/50 dark:bg-slate-900/40 text-xs">
        <button
          onClick={() => setActiveTab('consensus')}
          className={`px-3 py-2.5 font-semibold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'consensus'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          <span>Council Consensus & Verdict</span>
          {consensus && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('round2')}
          disabled={!round2}
          className={`px-3 py-2.5 font-semibold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'round2'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Round 2: Cross-Examination Debate</span>
          {round2 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {round2.contributions.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('round1')}
          disabled={!round1}
          className={`px-3 py-2.5 font-semibold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'round1'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Round 1: Initial Proposals</span>
          {round1 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {round1.contributions.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab 1: CONSENSUS */}
      {activeTab === 'consensus' && (
        <div className="p-5 space-y-4">
          {consensus ? (
            <>
              {/* Verdict Highlight Banner */}
              <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/80 shadow-2xs">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-indigo-600 text-white shrink-0 mt-0.5">
                    <Award className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-600 dark:text-indigo-400">
                      Council Bottom-Line Verdict
                    </span>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                      {consensus.verdict}
                    </h4>
                  </div>
                </div>
              </div>

              {/* Synthesis Text */}
              <div className="prose prose-slate dark:prose-invert max-w-none text-xs leading-relaxed font-sans">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {consensus.synthesis}
                </ReactMarkdown>
              </div>

              {/* Agreements & Disagreements Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                {/* Unanimous Agreements */}
                <div className="p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 space-y-2">
                  <h5 className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Unanimous Council Agreements
                  </h5>
                  <ul className="space-y-1.5 pl-1">
                    {consensus.agreements.map((item, idx) => (
                      <li key={idx} className="text-xs text-slate-700 dark:text-slate-300 flex items-start gap-1.5 leading-snug">
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Disagreements & Nuanced Trade-offs */}
                <div className="p-3.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 space-y-2">
                  <h5 className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    Debated Trade-Offs & Counter-Arguments
                  </h5>
                  <ul className="space-y-1.5 pl-1">
                    {consensus.disagreements.map((item, idx) => (
                      <li key={idx} className="text-xs text-slate-700 dark:text-slate-300 flex items-start gap-1.5 leading-snug">
                        <span className="text-amber-600 dark:text-amber-400 font-bold">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Action Items */}
              {consensus.actionItems && consensus.actionItems.length > 0 && (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-2">
                  <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <ArrowRight className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    Council Action Items & Execution Plan
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {consensus.actionItems.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2"
                      >
                        <span className="w-4 h-4 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : council.status === 'failed' ? (
            <div className="py-8 px-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-center space-y-2">
              <AlertTriangle className="w-8 h-8 text-rose-600 dark:text-rose-400 mx-auto" />
              <h4 className="text-sm font-bold text-rose-900 dark:text-rose-200">
                Council Debate Could Not Be Completed
              </h4>
              <p className="text-xs text-rose-700 dark:text-rose-300 max-w-md mx-auto leading-relaxed">
                {council.error || 'Please add your API key (xAI Grok or Google Gemini) in Settings to convene the AI Council.'}
              </p>
            </div>
          ) : (
            <div className="py-8 text-center space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600 mx-auto" />
              <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                {council.currentStage || 'Debate is actively underway in the Council Chamber...'}
              </p>
              {round1 && round1.contributions.length > 0 && (
                <button
                  onClick={() => setActiveTab('round1')}
                  type="button"
                  className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer block mx-auto"
                >
                  View {round1.contributions.length} initial proposals while debate continues &rarr;
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: ROUND 2 CROSS-EXAMINATION DEBATE */}
      {activeTab === 'round2' && round2 && (
        <div className="p-5 space-y-4">
          <div className="p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 text-xs text-slate-600 dark:text-slate-300">
            <strong>Round 2 Protocol:</strong> In this stage, each model reviews the initial proposals of all peer models, identifies flaws or blind spots, highlights agreements, and presents rebuttals.
          </div>

          {/* Model Sub-Tabs */}
          <div className="flex flex-wrap gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-2">
            {round2.contributions.map((c, idx) => {
              const theme = PROVIDER_THEME[c.provider];
              const isSelected = selectedModelIdx === idx;
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedModelIdx(idx)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    isSelected
                      ? `${theme.bg} ${theme.text} border ${theme.border} font-bold shadow-2xs`
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${theme.dot}`} />
                  <span>{c.company}</span>
                </button>
              );
            })}
          </div>

          {/* Selected Model Rebuttal Content */}
          {round2.contributions[selectedModelIdx] && (
            <div className="p-4 rounded-xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {round2.contributions[selectedModelIdx].company}’s Rebuttal & Cross-Examination
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  Model: {round2.contributions[selectedModelIdx].model}
                </span>
              </div>
              <div className="prose prose-slate dark:prose-invert max-w-none text-xs leading-relaxed font-sans">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {round2.contributions[selectedModelIdx].content}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: ROUND 1 INITIAL PROPOSALS */}
      {activeTab === 'round1' && round1 && (
        <div className="p-5 space-y-4">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
            <strong>Round 1 Protocol:</strong> Each model evaluated the user query in isolation according to its own architecture and principles before seeing any other model’s output.
          </div>

          {/* Model Sub-Tabs */}
          <div className="flex flex-wrap gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-2">
            {round1.contributions.map((c, idx) => {
              const theme = PROVIDER_THEME[c.provider];
              const isSelected = selectedModelIdx === idx;
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedModelIdx(idx)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    isSelected
                      ? `${theme.bg} ${theme.text} border ${theme.border} font-bold shadow-2xs`
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${theme.dot}`} />
                  <span>{c.company}</span>
                </button>
              );
            })}
          </div>

          {/* Selected Model Proposal Content */}
          {round1.contributions[selectedModelIdx] && (
            <div className="p-4 rounded-xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {round1.contributions[selectedModelIdx].company}’s Independent Stance
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  Model: {round1.contributions[selectedModelIdx].model}
                </span>
              </div>
              <div className="prose prose-slate dark:prose-invert max-w-none text-xs leading-relaxed font-sans">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {round1.contributions[selectedModelIdx].content}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
