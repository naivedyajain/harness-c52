import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Trash2,
  Key,
  Mail,
  Sliders,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { Settings, ProviderId, KeyState } from '../types';
import { listModels } from '../lib/providers';
import { friendly } from '../lib/errors';
import { testGmail, cleanAppPassword } from '../lib/gmail';
import { fetchJson } from '../lib/http';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onUpdateSettings: (newSettings: Settings) => void;
  initialTab?: 'keys' | 'gmail' | 'preferences';
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  initialTab = 'keys',
  onToast,
}) => {
  const [tab, setTab] = useState<'keys' | 'gmail' | 'preferences'>(initialTab);
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [showMoreProviders, setShowMoreProviders] = useState(false);
  const [showGmailHelp, setShowGmailHelp] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [hasServerGemini, setHasServerGemini] = useState(false);
  const [serverGeminiKey, setServerGeminiKey] = useState<string | null>(null);

  // Debounce timers for auto-testing keys
  const debounceTimers = useRef<Record<string, any>>({});

  useEffect(() => {
    fetch('/api/config/providers')
      .then((res) => res.json())
      .then((data) => {
        if (data.hasServerGemini && data.geminiApiKey) {
          setHasServerGemini(true);
          setServerGeminiKey(data.geminiApiKey);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab, isOpen]);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Clean pasted key: trim and remove surrounding quotes
  const sanitizeKey = (key: string) => {
    return key.trim().replace(/^["']|["']$/g, '').trim();
  };

  const toggleShowKey = (id: string) => {
    setShowKey((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Test provider model list
  const testProviderKey = async (provider: ProviderId, keyValue: string) => {
    const cleanKey = sanitizeKey(keyValue);
    if (!cleanKey) {
      const updated: Settings = {
        ...settings,
        keys: {
          ...settings.keys,
          [provider]: {
            value: '',
            status: 'unset',
            models: [],
          },
        },
      };
      onUpdateSettings(updated);
      return;
    }

    // Set checking status
    const checkingSettings: Settings = {
      ...settings,
      keys: {
        ...settings.keys,
        [provider]: {
          ...settings.keys[provider],
          value: cleanKey,
          status: 'checking',
          message: undefined,
        },
      },
    };
    onUpdateSettings(checkingSettings);

    try {
      const models = await listModels(provider, cleanKey);
      const isOk = true;
      const message =
        models.length === 0
          ? 'Working · no chat models found — type a model name manually'
          : `Working · ${models.length} models`;

      const okSettings: Settings = {
        ...settings,
        keys: {
          ...settings.keys,
          [provider]: {
            value: cleanKey,
            status: 'ok',
            message,
            models,
          },
        },
      };
      onUpdateSettings(okSettings);
    } catch (err) {
      const friendlyErr = friendly(
        err,
        provider === 'gemini'
          ? 'Google Gemini'
          : provider === 'openai'
          ? 'OpenAI'
          : provider === 'anthropic'
          ? 'Anthropic'
          : 'xAI'
      );
      const failSettings: Settings = {
        ...settings,
        keys: {
          ...settings.keys,
          [provider]: {
            ...settings.keys[provider],
            value: cleanKey,
            status: 'failed',
            message: `Failed: ${friendlyErr.title}`,
          },
        },
      };
      onUpdateSettings(failSettings);
    }
  };

  // Handle provider key input change
  const handleKeyChange = (provider: ProviderId, rawVal: string) => {
    const cleanVal = sanitizeKey(rawVal);
    const newSettings: Settings = {
      ...settings,
      keys: {
        ...settings.keys,
        [provider]: {
          ...settings.keys[provider],
          value: cleanVal,
          status: cleanVal ? 'checking' : 'unset',
          message: undefined,
        },
      },
    };
    onUpdateSettings(newSettings);

    // Auto-test debounced 800ms
    if (debounceTimers.current[provider]) {
      clearTimeout(debounceTimers.current[provider]);
    }
    if (cleanVal) {
      debounceTimers.current[provider] = setTimeout(() => {
        testProviderKey(provider, cleanVal);
      }, 800);
    }
  };

  // Test Tavily key (manual click only — never debounced to save credits)
  const testTavilyKey = async () => {
    const cleanKey = sanitizeKey(settings.tavily.value);
    if (!cleanKey) return;

    onUpdateSettings({
      ...settings,
      tavily: { ...settings.tavily, status: 'checking', message: undefined },
    });

    try {
      const res = await fetchJson<{
        answer?: string;
        results?: any[];
        error?: { code: string; message: string };
      }>(
        '/api/search',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: cleanKey, query: 'test', maxResults: 1 }),
        },
        { timeoutMs: 30000, provider: 'Tavily' }
      );

      if (res.error) {
        onUpdateSettings({
          ...settings,
          tavily: {
            ...settings.tavily,
            status: 'failed',
            message: `Failed: ${res.error.message || 'Error'}`,
          },
        });
      } else {
        onUpdateSettings({
          ...settings,
          tavily: {
            ...settings.tavily,
            status: 'ok',
            message: 'Working',
          },
        });
        onToast('Tavily search connected', 'success');
      }
    } catch (err: any) {
      onUpdateSettings({
        ...settings,
        tavily: {
          ...settings.tavily,
          status: 'failed',
          message: `Failed: ${err.rawMessage || err.message || 'Failed to reach server'}`,
        },
      });
    }
  };

  // Test Gmail connection
  const handleTestGmail = async () => {
    const cleanPass = cleanAppPassword(settings.gmail.appPassword);
    const cleanEmail = settings.gmail.email.trim();

    if (!cleanEmail || !cleanPass) return;

    if (cleanPass.length !== 16) {
      onUpdateSettings({
        ...settings,
        gmail: {
          ...settings.gmail,
          status: 'failed',
          message: `App Password must be 16 letters (currently ${cleanPass.length})`,
        },
      });
      return;
    }

    onUpdateSettings({
      ...settings,
      gmail: { ...settings.gmail, status: 'checking', message: undefined },
    });

    const res = await testGmail(cleanEmail, cleanPass);
    if (res.ok) {
      const msg = res.totalMessages !== undefined
        ? `Connected · ${cleanEmail} (${res.totalMessages} emails)`
        : `Connected · ${cleanEmail}`;
      onUpdateSettings({
        ...settings,
        gmail: {
          ...settings.gmail,
          status: 'ok',
          message: msg,
        },
      });
      onToast('Gmail connected successfully', 'success');
    } else {
      const diag = res.error?.diagnostic || res.error?.message || 'Connection error';
      onUpdateSettings({
        ...settings,
        gmail: {
          ...settings.gmail,
          status: 'failed',
          message: `Failed: ${res.error?.message || 'Connection error'}`,
        },
      });
      console.error(diag);
    }
  };

  const handleClearAllKeys = () => {
    const cleared: Settings = {
      ...settings,
      keys: {
        openai: { value: '', status: 'unset', models: [] },
        gemini: { value: '', status: 'unset', models: [] },
        anthropic: { value: '', status: 'unset', models: [] },
        xai: { value: '', status: 'unset', models: [] },
      },
      tavily: { value: '', status: 'unset' },
      gmail: { email: '', appPassword: '', status: 'unset' },
    };
    onUpdateSettings(cleared);
    setShowClearConfirm(false);
    onToast('All keys cleared', 'info');
  };

  // Check prefix warnings
  const getKeyPrefixWarning = (provider: ProviderId, val: string): string | null => {
    if (!val) return null;
    const v = val.toLowerCase();
    if (provider === 'openai' && !v.startsWith('sk-')) {
      return "This doesn't look like an OpenAI key";
    }
    if (provider === 'gemini' && !val.startsWith('AIza')) {
      return "This doesn't look like a Google Gemini key";
    }
    if (provider === 'anthropic' && !v.startsWith('sk-ant-')) {
      return "This doesn't look like an Anthropic key";
    }
    if (provider === 'xai' && !v.startsWith('xai-')) {
      return "This doesn't look like an xAI key";
    }
    return null;
  };

  const renderStatusPill = (status: KeyState['status'], message?: string) => {
    switch (status) {
      case 'checking':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
            <Loader2 className="w-3 h-3 animate-spin" />
            Checking…
          </span>
        );
      case 'ok':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3 h-3" />
            {message || 'Working'}
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 max-w-[200px] truncate" title={message}>
            <AlertCircle className="w-3 h-3 shrink-0" />
            <span className="truncate">{message || 'Failed'}</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
            Not set
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-base text-slate-900 dark:text-white">
              Settings
            </h3>
            <p className="text-xs text-slate-500">
              Keys and preferences remain strictly private in this browser.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="px-5 pt-3 border-b border-slate-200 dark:border-slate-800 flex gap-4 text-xs font-semibold">
          <button
            onClick={() => setTab('keys')}
            className={`pb-2.5 flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              tab === 'keys'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            API keys
          </button>
          <button
            onClick={() => setTab('gmail')}
            className={`pb-2.5 flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              tab === 'gmail'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            Gmail
          </button>
          <button
            onClick={() => setTab('preferences')}
            className={`pb-2.5 flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              tab === 'preferences'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Preferences
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* TAB 1: API KEYS */}
          {tab === 'keys' && (
            <div className="space-y-4">
              {/* Studio Key Auto-Detect Banner */}
              {hasServerGemini && settings.keys.gemini.status !== 'ok' && (
                <div className="p-3.5 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      Studio Gemini Key Available
                    </div>
                    <p className="text-[11px] text-indigo-700 dark:text-indigo-300">
                      An active Gemini API key is detected from your Studio environment.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (serverGeminiKey) {
                        testProviderKey('gemini', serverGeminiKey);
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shrink-0 cursor-pointer shadow-xs"
                  >
                    Activate Gemini
                  </button>
                </div>
              )}

              {/* OpenAI Row */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#10A37F]" />
                    OpenAI API key
                  </label>
                  {renderStatusPill(settings.keys.openai.status, settings.keys.openai.message)}
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showKey['openai'] ? 'text' : 'password'}
                      value={settings.keys.openai.value}
                      onChange={(e) => handleKeyChange('openai', e.target.value)}
                      placeholder="sk-…"
                      className="w-full text-xs font-mono px-3 py-2 pr-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => toggleShowKey('openai')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showKey['openai'] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <button
                    onClick={() => testProviderKey('openai', settings.keys.openai.value)}
                    disabled={!settings.keys.openai.value || settings.keys.openai.status === 'checking'}
                    className="px-3 py-2 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    Test
                  </button>
                </div>
                {getKeyPrefixWarning('openai', settings.keys.openai.value) ? (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    {getKeyPrefixWarning('openai', settings.keys.openai.value)}
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    Keys must start with <span className="font-mono">sk-</span>. Ensure billing credits are active at{' '}
                    <a
                      href="https://platform.openai.com/billing"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-indigo-600 dark:text-indigo-400"
                    >
                      platform.openai.com
                    </a>.
                  </p>
                )}
              </div>

              {/* Gemini Row */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#4285F4]" />
                    Google Gemini key (free)
                  </label>
                  {renderStatusPill(settings.keys.gemini.status, settings.keys.gemini.message)}
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showKey['gemini'] ? 'text' : 'password'}
                      value={settings.keys.gemini.value}
                      onChange={(e) => handleKeyChange('gemini', e.target.value)}
                      placeholder="AIza…"
                      className="w-full text-xs font-mono px-3 py-2 pr-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => toggleShowKey('gemini')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showKey['gemini'] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <button
                    onClick={() => testProviderKey('gemini', settings.keys.gemini.value)}
                    disabled={!settings.keys.gemini.value || settings.keys.gemini.status === 'checking'}
                    className="px-3 py-2 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    Test
                  </button>
                </div>
                {getKeyPrefixWarning('gemini', settings.keys.gemini.value) && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    {getKeyPrefixWarning('gemini', settings.keys.gemini.value)}
                  </p>
                )}
                <p className="text-[11px] text-slate-400">
                  Free keys available from{' '}
                  <a
                    href="https://aistudio.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 dark:text-indigo-400 underline inline-flex items-center gap-0.5"
                  >
                    aistudio.google.com <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </p>
              </div>

              {/* Tavily Row (Web search) */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Tavily key (web search)
                  </label>
                  {renderStatusPill(settings.tavily.status, settings.tavily.message)}
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showKey['tavily'] ? 'text' : 'password'}
                      value={settings.tavily.value}
                      onChange={(e) => {
                        const clean = sanitizeKey(e.target.value);
                        onUpdateSettings({
                          ...settings,
                          tavily: { value: clean, status: clean ? 'unset' : 'unset' },
                        });
                      }}
                      placeholder="tvly-…"
                      className="w-full text-xs font-mono px-3 py-2 pr-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => toggleShowKey('tavily')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showKey['tavily'] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <button
                    onClick={testTavilyKey}
                    disabled={!settings.tavily.value || settings.tavily.status === 'checking'}
                    className="px-3 py-2 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    Test
                  </button>
                </div>
                {settings.tavily.value && !settings.tavily.value.toLowerCase().startsWith('tvly-') && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    This doesn't look like a Tavily key
                  </p>
                )}
                <p className="text-[11px] text-slate-400">
                  Free: 1,000 searches/month at tavily.com. No card needed. (Test uses 1 credit).
                </p>
              </div>

              {/* More providers collapsible (Anthropic & xAI) */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => setShowMoreProviders(!showMoreProviders)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                >
                  {showMoreProviders ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  More providers (Anthropic, xAI Grok)
                </button>

                {showMoreProviders && (
                  <div className="mt-3 space-y-4 pl-2 border-l-2 border-slate-100 dark:border-slate-800">
                    {/* Anthropic */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-[#D97757]" />
                          Anthropic API key
                        </label>
                        {renderStatusPill(settings.keys.anthropic.status, settings.keys.anthropic.message)}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <input
                            type={showKey['anthropic'] ? 'text' : 'password'}
                            value={settings.keys.anthropic.value}
                            onChange={(e) => handleKeyChange('anthropic', e.target.value)}
                            placeholder="sk-ant-…"
                            className="w-full text-xs font-mono px-3 py-2 pr-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={() => toggleShowKey('anthropic')}
                            className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          >
                            {showKey['anthropic'] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <button
                          onClick={() => testProviderKey('anthropic', settings.keys.anthropic.value)}
                          disabled={!settings.keys.anthropic.value || settings.keys.anthropic.status === 'checking'}
                          className="px-3 py-2 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-colors disabled:opacity-40 cursor-pointer"
                        >
                          Test
                        </button>
                      </div>
                      {getKeyPrefixWarning('anthropic', settings.keys.anthropic.value) && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400">
                          {getKeyPrefixWarning('anthropic', settings.keys.anthropic.value)}
                        </p>
                      )}
                    </div>

                    {/* xAI Grok */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-[#111827] dark:bg-[#F3F4F6]" />
                          xAI Grok key
                        </label>
                        {renderStatusPill(settings.keys.xai.status, settings.keys.xai.message)}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <input
                            type={showKey['xai'] ? 'text' : 'password'}
                            value={settings.keys.xai.value}
                            onChange={(e) => handleKeyChange('xai', e.target.value)}
                            placeholder="xai-…"
                            className="w-full text-xs font-mono px-3 py-2 pr-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={() => toggleShowKey('xai')}
                            className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          >
                            {showKey['xai'] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <button
                          onClick={() => testProviderKey('xai', settings.keys.xai.value)}
                          disabled={!settings.keys.xai.value || settings.keys.xai.status === 'checking'}
                          className="px-3 py-2 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-colors disabled:opacity-40 cursor-pointer"
                        >
                          Test
                        </button>
                      </div>
                      {getKeyPrefixWarning('xai', settings.keys.xai.value) && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400">
                          {getKeyPrefixWarning('xai', settings.keys.xai.value)}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Remember keys option */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.rememberKeys}
                    onChange={(e) =>
                      onUpdateSettings({ ...settings, rememberKeys: e.target.checked })
                    }
                    className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                      Remember keys on this device
                    </span>
                    <p className="text-[11px] text-slate-400">
                      Turn off on shared computers.
                    </p>
                  </div>
                </label>
              </div>

              {/* Clear all keys */}
              <div className="pt-2 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(true)}
                  className="inline-flex items-center gap-1.5 text-xs text-rose-600 hover:text-rose-700 font-medium transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear all keys
                </button>
              </div>

              {/* Privacy note */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 leading-relaxed">
                Your keys stay in this browser. Model keys go straight to the provider. The Tavily key and Gmail App Password pass through this app's server for each request and are never stored there.
              </div>
            </div>
          )}

          {/* TAB 2: GMAIL */}
          {tab === 'gmail' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Gmail IMAP & SMTP Connection
                </h4>
                {renderStatusPill(settings.gmail.status, settings.gmail.message)}
              </div>

              {/* Demo / Sample Inbox Mode Toggle */}
              <div className="p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <div>
                      <div className="text-xs font-semibold text-indigo-900 dark:text-indigo-200">
                        Demo / Sample Engineering Inbox
                      </div>
                      <p className="text-[11px] text-indigo-700 dark:text-indigo-300">
                        Test email reading, summarizing, and reply drafting immediately without personal credentials.
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(settings.gmail.demoInboxEnabled)}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        gmail: { ...settings.gmail, demoInboxEnabled: e.target.checked },
                      })
                    }
                    className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer h-4 w-4"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Gmail address
                </label>
                <input
                  type="email"
                  value={settings.gmail.email}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      gmail: { ...settings.gmail, email: e.target.value.trim() },
                    })
                  }
                  placeholder="yourname@gmail.com"
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    App Password (16 characters)
                  </label>
                  {settings.gmail.appPassword && (
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-md font-semibold ${
                        cleanAppPassword(settings.gmail.appPassword).length === 16
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                      }`}
                    >
                      {cleanAppPassword(settings.gmail.appPassword).length}/16 chars
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showKey['gmail'] ? 'text' : 'password'}
                    value={settings.gmail.appPassword}
                    onChange={(e) => {
                      const clean = cleanAppPassword(e.target.value);
                      onUpdateSettings({
                        ...settings,
                        gmail: { ...settings.gmail, appPassword: clean },
                      });
                    }}
                    placeholder="abcd efgh ijkl mnop"
                    className="w-full text-xs font-mono px-3 py-2 pr-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowKey('gmail')}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showKey['gmail'] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* 16-letter check hint */}
                {settings.gmail.appPassword &&
                  cleanAppPassword(settings.gmail.appPassword).length !== 16 && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      Cleaned password is {cleanAppPassword(settings.gmail.appPassword).length} letters. Gmail App Passwords must be exactly 16 letters (e.g. from Google Security → App passwords).
                    </p>
                  )}
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={handleTestGmail}
                  disabled={
                    !settings.gmail.email ||
                    !settings.gmail.appPassword ||
                    settings.gmail.status === 'checking'
                  }
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-xs font-medium transition-colors cursor-pointer"
                >
                  {settings.gmail.status === 'checking' ? 'Connecting…' : 'Test connection'}
                </button>

                {settings.gmail.email && (
                  <button
                    onClick={() =>
                      onUpdateSettings({
                        ...settings,
                        gmail: { email: '', appPassword: '', status: 'unset' },
                      })
                    }
                    className="text-xs text-rose-500 hover:underline cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>

              {/* Instructions Collapsible */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => setShowGmailHelp(!showGmailHelp)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  {showGmailHelp ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  How to get an App Password (2 min)
                </button>

                {showGmailHelp && (
                  <div className="mt-2 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-2 leading-relaxed">
                    <ol className="list-decimal pl-4 space-y-1.5">
                      <li>
                        Go to <span className="font-semibold">myaccount.google.com</span> &rarr; <span className="font-semibold">Security</span>.
                      </li>
                      <li>
                        Turn on <span className="font-semibold">2-Step Verification</span> (App Passwords only appear when 2FA is active).
                      </li>
                      <li>
                        Open{' '}
                        <a
                          href="https://myaccount.google.com/apppasswords"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400 underline inline-flex items-center gap-0.5"
                        >
                          myaccount.google.com/apppasswords <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </li>
                      <li>
                        Type an app name like "Harness" &rarr; <span className="font-semibold">Create</span>.
                      </li>
                      <li>
                        Copy the 16-letter password and paste it here. Your normal Google password will not work on IMAP.
                      </li>
                    </ol>
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 pt-1">
                      Note: Work/school Google Workspace domains often restrict App Passwords. Use a personal Gmail account or the Demo Inbox above.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: PREFERENCES */}
          {tab === 'preferences' && (
            <div className="space-y-4">
              {/* Web search uses */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Web search model (Gemini grounding)
                </label>
                {settings.keys.gemini.status !== 'ok' ? (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-xs text-slate-500">
                    No Gemini key — web search uses Wikipedia only. Add a free key from aistudio.google.com for full search.
                  </div>
                ) : (
                  <>
                    <select
                      value={settings.searchModel}
                      onChange={(e) =>
                        onUpdateSettings({ ...settings, searchModel: e.target.value })
                      }
                      className="w-full text-xs font-mono px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="gemini-2.5-flash">gemini-2.5-flash (Recommended, free search)</option>
                      {settings.keys.gemini.models
                        .filter((m) => m !== 'gemini-2.5-flash')
                        .map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                    </select>
                    <p className="text-[11px] text-slate-400">
                      Free: about 500 web searches a day with Gemini 2.5 Flash. Pick a 3.x model only if your Gemini key has billing on.
                    </p>
                  </>
                )}
              </div>

              {/* Max output tokens */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Max reply length (tokens)
                </label>
                <input
                  type="number"
                  min={256}
                  max={64000}
                  value={settings.maxOutputTokens}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      maxOutputTokens: Math.max(256, Math.min(64000, Number(e.target.value) || 4096)),
                    })
                  }
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                />
                <p className="text-[11px] text-slate-400">
                  Default 4096. Controls the response cutoff limit.
                </p>
              </div>

              {/* Keep chats toggle */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                      Keep chats after refresh
                    </span>
                    <p className="text-[11px] text-slate-400">
                      Stores recent conversation history in this browser.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.keepChats}
                    onChange={(e) =>
                      onUpdateSettings({ ...settings, keepChats: e.target.checked })
                    }
                    className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                </label>
              </div>

              {/* Theme toggle */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 block mb-1.5">
                  Theme
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => onUpdateSettings({ ...settings, theme: 'light' })}
                    className={`flex-1 py-1.5 px-3 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                      settings.theme === 'light'
                        ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-semibold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Light
                  </button>
                  <button
                    onClick={() => onUpdateSettings({ ...settings, theme: 'dark' })}
                    className={`flex-1 py-1.5 px-3 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                      settings.theme === 'dark'
                        ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-semibold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Dark
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer — ONE "Done" button only */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs transition-colors shadow-xs cursor-pointer"
          >
            Done
          </button>
        </div>

        {/* Clear All Keys Confirmation Modal */}
        {showClearConfirm && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-3">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h4 className="font-semibold text-sm text-slate-900 dark:text-white">
                  Clear all keys?
                </h4>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                This will remove all stored API keys, Tavily keys, and Gmail credentials from this browser.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearAllKeys}
                  className="px-3.5 py-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-lg transition-colors cursor-pointer"
                >
                  Clear all
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
