import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, Plus, Key, Check, Info } from 'lucide-react';
import { ProviderId, KeyState } from '../types';
import { CURATED_MODELS } from '../lib/providers';

interface ModelPickerProps {
  currentProvider: ProviderId | null;
  currentModel: string | null;
  keys: Record<ProviderId, KeyState>;
  onSelectModel: (provider: ProviderId, model: string) => void;
  onOpenSettings: (tab?: 'keys' | 'gmail' | 'preferences') => void;
  isOpenExternal?: boolean;
  onCloseExternal?: () => void;
}

export type ModelTier = 'low' | 'medium' | 'high';

export function getModelTier(modelId: string): ModelTier {
  const m = modelId.toLowerCase();

  // High (reasoning / deep thinking / frontier apex)
  if (
    m.startsWith('o1') ||
    m.startsWith('o3') ||
    m.startsWith('o4') ||
    m.includes('thinking') ||
    m.includes('reason') ||
    m.includes('3-7-sonnet') ||
    m.includes('claude-3-opus') ||
    m.includes('grok-3') ||
    m.includes('max')
  ) {
    return 'high';
  }

  // Low (fast / lightweight / budget / low latency)
  if (
    m.includes('mini') ||
    m.includes('flash') ||
    m.includes('lite') ||
    m.includes('8b') ||
    m.includes('haiku') ||
    m.includes('3.5') ||
    m.includes('small') ||
    m.includes('nano') ||
    m.includes('instant') ||
    m.includes('instruct')
  ) {
    return 'low';
  }

  // Medium (standard balanced frontier: gpt-4o, gemini-2.5-pro, claude-3-5-sonnet, grok-2)
  return 'medium';
}

export const TIER_CONFIG: Record<
  ModelTier,
  { label: string; bg: string; text: string; border: string; desc: string; explanation: string }
> = {
  low: {
    label: 'Low',
    bg: 'bg-emerald-50 dark:bg-emerald-950/60',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-800',
    desc: 'Fast / Lightweight',
    explanation: 'Fast response times, cost-efficient, great for summaries, extraction, and routine queries.',
  },
  medium: {
    label: 'Medium',
    bg: 'bg-sky-50 dark:bg-sky-950/60',
    text: 'text-sky-700 dark:text-sky-300',
    border: 'border-sky-200 dark:border-sky-800',
    desc: 'Balanced Frontier',
    explanation: 'General-purpose workhorse for programming, deep context, synthesis, and creative tasks.',
  },
  high: {
    label: 'High',
    bg: 'bg-purple-50 dark:bg-purple-950/60',
    text: 'text-purple-700 dark:text-purple-300',
    border: 'border-purple-200 dark:border-purple-800',
    desc: 'Reasoning / Powerful',
    explanation: 'Complex multi-step reasoning, mathematical proofs, architectural logic, and deep analysis.',
  },
};

export const PROVIDER_CONFIG: Record<
  ProviderId,
  { name: string; dotColor: string; lightDot: string }
> = {
  openai: { name: 'OpenAI', dotColor: 'bg-[#10A37F]', lightDot: '#10A37F' },
  gemini: { name: 'Google Gemini', dotColor: 'bg-[#4285F4]', lightDot: '#4285F4' },
  anthropic: { name: 'Anthropic', dotColor: 'bg-[#D97757]', lightDot: '#D97757' },
  xai: { name: 'xAI Grok', dotColor: 'bg-[#111827] dark:bg-[#F3F4F6]', lightDot: '#111827' },
};

export const ModelPicker: React.FC<ModelPickerProps> = ({
  currentProvider,
  currentModel,
  keys,
  onSelectModel,
  onOpenSettings,
  isOpenExternal,
  onCloseExternal,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<'all' | ModelTier>('all');
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customProvider, setCustomProvider] = useState<ProviderId>('openai');
  const [customModelId, setCustomModelId] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync external open request: open when explicitly requested
  useEffect(() => {
    if (isOpenExternal) {
      setIsOpen(true);
    }
  }, [isOpenExternal]);

  const handleToggle = () => {
    setIsOpen((prev) => {
      const next = !prev;
      if (!next && onCloseExternal) {
        onCloseExternal();
      }
      return next;
    });
  };

  const handleClose = () => {
    setIsOpen(false);
    if (onCloseExternal) onCloseExternal();
    setIsCustomMode(false);
    setSearch('');
    setTierFilter('all');
  };

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        handleClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const currentModelTier = currentModel ? getModelTier(currentModel) : null;
  const providersOrder: ProviderId[] = ['openai', 'gemini', 'anthropic', 'xai'];

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customModelId.trim()) {
      onSelectModel(customProvider, customModelId.trim());
      handleClose();
    }
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={handleToggle}
        type="button"
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/70 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors shadow-xs cursor-pointer select-none"
        aria-label="Choose a model"
        aria-expanded={isOpen}
      >
        {currentProvider ? (
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${PROVIDER_CONFIG[currentProvider]?.dotColor}`}
          />
        ) : (
          <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-slate-300 dark:bg-slate-600" />
        )}

        <span className="truncate max-w-[130px] sm:max-w-[180px] font-mono text-xs font-semibold">
          {currentModel || 'Choose a model'}
        </span>

        {currentModelTier && (
          <span
            className={`px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wider ${TIER_CONFIG[currentModelTier].bg} ${TIER_CONFIG[currentModelTier].text} border ${TIER_CONFIG[currentModelTier].border}`}
            title={TIER_CONFIG[currentModelTier].desc}
          >
            {TIER_CONFIG[currentModelTier].label}
          </span>
        )}

        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 mt-2 w-84 sm:w-96 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl z-50 overflow-hidden flex flex-col max-h-[520px] animate-in fade-in zoom-in-95">
          {/* Search Bar & Tier Filter */}
          <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 space-y-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search models (e.g. 4o, flash, o1, grok)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                autoFocus
              />
            </div>

            {/* Tier Filter Pills */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mr-1">
                  Grade:
                </span>
                <button
                  onClick={() => setTierFilter('all')}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors cursor-pointer ${
                    tierFilter === 'all'
                      ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 font-semibold shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  All
                </button>
                {(['low', 'medium', 'high'] as ModelTier[]).map((tier) => {
                  const conf = TIER_CONFIG[tier];
                  const isActive = tierFilter === tier;
                  return (
                    <button
                      key={tier}
                      onClick={() => setTierFilter(tier)}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors cursor-pointer border ${
                        isActive
                          ? `${conf.bg} ${conf.text} ${conf.border} font-bold shadow-xs`
                          : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                      title={conf.desc}
                    >
                      {conf.label}
                    </button>
                  );
                })}
              </div>

              <span className="text-[10px] text-slate-400 hidden sm:inline">
                Click any model to select
              </span>
            </div>

            {/* Active Tier Legend Helper */}
            {tierFilter !== 'all' && (
              <div className="p-2 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-[10px] text-slate-600 dark:text-slate-300 flex items-start gap-1.5">
                <Info className="w-3 h-3 text-indigo-500 shrink-0 mt-0.5" />
                <span>
                  <strong className="capitalize">{TIER_CONFIG[tierFilter].label} Tier: </strong>
                  {TIER_CONFIG[tierFilter].explanation}
                </span>
              </div>
            )}
          </div>

          {/* Model Groups */}
          <div className="overflow-y-auto flex-1 p-2 space-y-3">
            {providersOrder.map((providerId) => {
              const pInfo = PROVIDER_CONFIG[providerId];
              const keyState = keys[providerId] || { value: '', status: 'unset', models: [] };
              const isWorking = keyState.status === 'ok';

              // Combine curated fallback models with any dynamically fetched models
              const rawModels = Array.from(
                new Set([...(CURATED_MODELS[providerId] || []), ...(keyState.models || [])])
              );

              const filteredModels = rawModels.filter((m) => {
                const matchesSearch = m.toLowerCase().includes(search.toLowerCase());
                if (!matchesSearch) return false;
                if (tierFilter !== 'all') {
                  return getModelTier(m) === tierFilter;
                }
                return true;
              });

              if (filteredModels.length === 0 && search) return null;

              return (
                <div key={providerId} className="space-y-1">
                  <div className="flex items-center justify-between px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${pInfo.dotColor}`} />
                      {pInfo.name}
                    </span>

                    <div className="flex items-center gap-2">
                      {!isWorking && (
                        <button
                          onClick={() => {
                            handleClose();
                            onOpenSettings('keys');
                          }}
                          className="text-[10px] font-normal text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5"
                        >
                          <Key className="w-2.5 h-2.5" />
                          Key needed
                        </button>
                      )}
                      <span className="text-[10px] text-slate-400 font-normal">
                        {filteredModels.length} {filteredModels.length === 1 ? 'model' : 'models'}
                      </span>
                    </div>
                  </div>

                  {filteredModels.length === 0 ? (
                    <div className="px-3 py-1.5 text-xs text-slate-400 italic">
                      No models in this grade filter
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {filteredModels.map((model) => {
                        const isSelected =
                          currentProvider === providerId && currentModel === model;
                        const tier = getModelTier(model);
                        const tierConf = TIER_CONFIG[tier];

                        return (
                          <button
                            key={model}
                            onClick={() => {
                              onSelectModel(providerId, model);
                              handleClose();
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all text-left cursor-pointer group ${
                              isSelected
                                ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-semibold ring-1 ring-indigo-500/20'
                                : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                  isSelected ? 'bg-indigo-600' : 'bg-transparent group-hover:bg-slate-300'
                                }`}
                              />
                              <span className="truncate font-mono text-xs">{model}</span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wider border ${tierConf.bg} ${tierConf.text} ${tierConf.border}`}
                                title={tierConf.desc}
                              >
                                {tierConf.label}
                              </span>

                              {isSelected && (
                                <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 ml-0.5" />
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bottom Custom Model ID & Settings Helper */}
          <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80">
            {!isCustomMode ? (
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => setIsCustomMode(true)}
                  className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Custom model ID…
                </button>

                <button
                  onClick={() => {
                    handleClose();
                    onOpenSettings('keys');
                  }}
                  className="flex items-center gap-1 text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  <Key className="w-3 h-3" />
                  API Keys Settings &rarr;
                </button>
              </div>
            ) : (
              <form onSubmit={handleCustomSubmit} className="space-y-2">
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Custom model ID
                </div>
                <div className="flex gap-2">
                  <select
                    value={customProvider}
                    onChange={(e) => setCustomProvider(e.target.value as ProviderId)}
                    className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="gemini">Gemini</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="xai">xAI</option>
                  </select>
                  <input
                    type="text"
                    placeholder="e.g. gpt-4.5-preview"
                    value={customModelId}
                    onChange={(e) => setCustomModelId(e.target.value)}
                    className="flex-1 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-slate-700 dark:text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    autoFocus
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsCustomMode(false)}
                    className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!customModelId.trim()}
                    className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium cursor-pointer transition-colors"
                  >
                    Set Model
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
