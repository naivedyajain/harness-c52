import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Chat,
  ChatMessage,
  Settings,
  UploadedDoc,
  EmailItem,
  ProviderId,
  LLMJudgeEvaluation,
  AICouncilSession,
} from './types';
import {
  store,
  STORAGE_KEYS,
  saveSettingsToStorage,
  saveChatsToStorage,
} from './lib/storage';
import { friendly } from './lib/errors';
import { chat, listModels } from './lib/providers';
import { evaluateResponseWithJudge } from './lib/judge';
import { runAICouncilSession } from './lib/council';
import { performWebSearch, SearchResult } from './lib/search';
import { parseDocument, retrieveRelevantDocContext } from './lib/docs';
import { queryGmailInbox, getDemoInbox } from './lib/gmail';
import { buildSystemPrompt } from './lib/context';
import { trimHistory } from './lib/tokens';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { ChatThread } from './components/ChatThread';
import { InputBar, SYSTEM_PROMPT_PRESETS } from './components/InputBar';
import { EmptyState } from './components/EmptyState';
import { SettingsModal } from './components/SettingsModal';
import { DocumentsDrawer } from './components/DocumentsDrawer';
import { EmailDrawer } from './components/EmailDrawer';
import { EngineeringQuizModal } from './components/EngineeringQuizModal';
import { Toast, ToastMessage } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';

// Helper to get system theme preference
function getSystemTheme(): 'light' | 'dark' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

const DEFAULT_SETTINGS: Settings = {
  keys: {
    openai: { value: '', status: 'unset', models: [] },
    gemini: { value: '', status: 'unset', models: [] },
    anthropic: { value: '', status: 'unset', models: [] },
    xai: { value: '', status: 'unset', models: [] },
  },
  rememberKeys: true,
  keepChats: true,
  tavily: { value: '', status: 'unset' },
  gmail: { email: '', appPassword: '', status: 'unset' },
  searchModel: 'gemini-2.5-flash',
  maxOutputTokens: 4096,
  theme: getSystemTheme(),
};

function createInitialChat(defaultProvider: ProviderId | null, defaultModel: string | null): Chat {
  return {
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: 'New chat',
    messages: [],
    provider: defaultProvider,
    model: defaultModel,
    systemPrompt: SYSTEM_PROMPT_PRESETS[0].prompt,
    webSearch: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function AppContent() {
  // 1. Settings state
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = store.get<Settings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      keys: {
        ...DEFAULT_SETTINGS.keys,
        ...(saved.keys || {}),
      },
    };
  });

  // Remembered default model for new chats
  const [defaultModelConfig, setDefaultModelConfig] = useState<{
    provider: ProviderId | null;
    model: string | null;
  }>({
    provider: null,
    model: null,
  });

  // 2. Chats state
  const [chats, setChats] = useState<Chat[]>(() => {
    const saved = store.get<Chat[]>(STORAGE_KEYS.CHATS, []);
    if (saved && saved.length > 0) {
      return saved;
    }
    return [createInitialChat(null, null)];
  });

  // 3. Active Chat ID
  const [activeChatId, setActiveChatId] = useState<string>(() => {
    const savedId = store.get<string>(STORAGE_KEYS.ACTIVE_CHAT, '');
    const exists = chats.some((c) => c.id === savedId);
    return exists ? savedId : chats[0]?.id || '';
  });

  // 4. Memory-only attachments per chat (not saved to storage as per spec)
  const [docsPerChat, setDocsPerChat] = useState<Record<string, UploadedDoc[]>>({});
  const [emailsPerChat, setEmailsPerChat] = useState<Record<string, EmailItem[]>>({});

  // 5. Input & Generation State
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSearchingWeb, setIsSearchingWeb] = useState(false);
  const [guardError, setGuardError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 6. UI Modals & Drawers
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [docsDrawerOpen, setDocsDrawerOpen] = useState(false);
  const [emailDrawerOpen, setEmailDrawerOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'keys' | 'gmail' | 'preferences'>('keys');
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [quizModalOpen, setQuizModalOpen] = useState(false);
  const [serverGeminiKey, setServerGeminiKey] = useState<string | null>(null);
  const [evaluatingJudgeId, setEvaluatingJudgeId] = useState<string | null>(null);

  // 7. Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Synchronize theme with DOM
  useEffect(() => {
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings.theme]);

  // Save settings when changed
  useEffect(() => {
    saveSettingsToStorage(settings);
  }, [settings]);

  // Save chats when changed
  useEffect(() => {
    saveChatsToStorage(chats, settings.keepChats, () => {
      addToast("Browser storage is full — older chats won't be saved.", 'error');
    });
  }, [chats, settings.keepChats]);

  // Save active chat ID
  useEffect(() => {
    if (activeChatId) {
      store.set(STORAGE_KEYS.ACTIVE_CHAT, activeChatId);
    }
  }, [activeChatId]);

  // On initial mount: test configured keys and check server-injected Gemini Studio key
  useEffect(() => {
    // 1. Check if server provides a pre-configured Gemini key from Studio environment
    fetch('/api/config/providers')
      .then((res) => res.json())
      .then((data) => {
        if (data.hasServerGemini && data.geminiApiKey) {
          setServerGeminiKey(data.geminiApiKey);
          setSettings((prev) => {
            if (!prev.keys.gemini.value) {
              return {
                ...prev,
                keys: {
                  ...prev.keys,
                  gemini: {
                    value: data.geminiApiKey,
                    status: 'ok',
                    message: 'Connected (Studio Key)',
                    models:
                      prev.keys.gemini.models.length > 0
                        ? prev.keys.gemini.models
                        : ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash'],
                  },
                },
              };
            }
            return prev;
          });

          setDefaultModelConfig((cur) => {
            if (!cur.model) {
              return { provider: 'gemini', model: 'gemini-2.5-flash' };
            }
            return cur;
          });
        }
      })
      .catch(() => {});

    // 2. Test user keys in background
    const providers: ProviderId[] = ['openai', 'gemini', 'anthropic', 'xai'];
    providers.forEach(async (p) => {
      const keyVal = settings.keys[p]?.value;
      if (keyVal && keyVal.trim()) {
        try {
          const models = await listModels(p, keyVal.trim());
          setSettings((prev) => ({
            ...prev,
            keys: {
              ...prev.keys,
              [p]: {
                ...prev.keys[p],
                status: 'ok',
                message:
                  models.length === 0
                    ? 'Working · no chat models found'
                    : `Working · ${models.length} models`,
                models,
              },
            },
          }));

          // If no default model set, pick first available working model
          setDefaultModelConfig((cur) => {
            if (!cur.model && models.length > 0) {
              const preferred =
                p === 'openai'
                  ? models.find((m) => m.includes('gpt-4o') || m.includes('gpt-4')) || models[0]
                  : p === 'gemini'
                  ? models.find((m) => m.includes('2.5-flash')) || models[0]
                  : models[0];
              return { provider: p, model: preferred };
            }
            return cur;
          });
        } catch (err) {
          const friendlyErr = friendly(err, p);
          setSettings((prev) => ({
            ...prev,
            keys: {
              ...prev.keys,
              [p]: {
                ...prev.keys[p],
                status: 'failed',
                message: `Failed: ${friendlyErr.title}`,
              },
            },
          }));
        }
      }
    });
  }, []);

  // Get active chat
  const activeChat = useMemo(() => {
    const chat = chats.find((c) => c.id === activeChatId);
    if (chat) return chat;
    return chats[0] || createInitialChat(null, null);
  }, [chats, activeChatId]);

  // Effective model & provider for active chat
  const currentProvider = activeChat?.provider || defaultModelConfig.provider;
  const currentModel = activeChat?.model || defaultModelConfig.model;

  // Active chat docs & emails
  const activeDocs = docsPerChat[activeChat.id] || [];
  const activeEmails = emailsPerChat[activeChat.id] || [];

  const isKeyConfigured = Object.values(settings.keys).some((k) => k.status === 'ok');

  // Switch Model on active chat and remember for future chats
  const handleSelectModel = (provider: ProviderId, model: string) => {
    setDefaultModelConfig({ provider, model });
    setChats((prev) =>
      prev.map((c) =>
        c.id === activeChat.id ? { ...c, provider, model, updatedAt: Date.now() } : c
      )
    );
  };

  // Create new chat
  const handleNewChat = () => {
    const newChat = createInitialChat(defaultModelConfig.provider, defaultModelConfig.model);
    setChats((prev) => [newChat, ...prev]);
    setActiveChatId(newChat.id);
  };

  // Switch active chat
  const handleSelectChat = (id: string) => {
    setActiveChatId(id);
    setGuardError(null);
  };

  // Rename chat
  const handleRenameChat = (id: string, newTitle: string) => {
    setChats((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: newTitle, updatedAt: Date.now() } : c))
    );
  };

  // Delete chat
  const handleDeleteChat = (id: string) => {
    const remaining = chats.filter((c) => c.id !== id);
    if (remaining.length === 0) {
      const brandNew = createInitialChat(defaultModelConfig.provider, defaultModelConfig.model);
      setChats([brandNew]);
      setActiveChatId(brandNew.id);
    } else {
      setChats(remaining);
      if (activeChatId === id) {
        setActiveChatId(remaining[0].id);
      }
    }
  };

  // Clear all chats
  const handleClearAllChats = () => {
    const brandNew = createInitialChat(defaultModelConfig.provider, defaultModelConfig.model);
    setChats([brandNew]);
    setActiveChatId(brandNew.id);
    setDocsPerChat({});
    setEmailsPerChat({});
    addToast('All chats cleared', 'info');
  };

  // Toggle web search on active chat
  const handleToggleWebSearch = () => {
    setChats((prev) =>
      prev.map((c) =>
        c.id === activeChat.id ? { ...c, webSearch: !c.webSearch, updatedAt: Date.now() } : c
      )
    );
  };

  // Toggle real-time Gmail inbox access for active chat
  const handleToggleGmailAccess = () => {
    const nextVal = !activeChat.gmailAccess;
    setChats((prev) =>
      prev.map((c) =>
        c.id === activeChat.id ? { ...c, gmailAccess: nextVal, updatedAt: Date.now() } : c
      )
    );
    if (nextVal) {
      if (settings.gmail.status === 'ok') {
        addToast(`Gmail access active (${settings.gmail.email})`, 'success');
      } else {
        addToast(
          'Gmail access active (using engineering sample inbox — connect your account in Settings for live emails)',
          'info'
        );
      }
    } else {
      addToast('Gmail access disabled for this chat', 'info');
    }
  };

  // Toggle Auto-Judge on responses
  const handleToggleAutoJudge = () => {
    const nextVal = !settings.autoJudge;
    setSettings((prev) => ({ ...prev, autoJudge: nextVal }));
    addToast(
      nextVal
        ? 'Auto-Judge enabled: Answers will be independently evaluated by a peer model'
        : 'Auto-Judge disabled',
      'info'
    );
  };

  // Toggle AI Council multi-model debate
  const handleToggleCouncilMode = () => {
    const nextVal = !activeChat.councilMode;
    setChats((prev) =>
      prev.map((c) =>
        c.id === activeChat.id ? { ...c, councilMode: nextVal, updatedAt: Date.now() } : c
      )
    );
    addToast(
      nextVal
        ? 'AI Council Mode ON: Models from Google, OpenAI, Claude & Grok will debate'
        : 'AI Council Mode disabled',
      'info'
    );
  };

  // Evaluate an existing assistant response using an opposing judge model
  const handleEvaluateJudge = async (messageId: string) => {
    const msg = activeChat.messages.find((m) => m.id === messageId);
    if (!msg || msg.role !== 'assistant') return;

    const msgIdx = activeChat.messages.findIndex((m) => m.id === messageId);
    const userPromptMsg = activeChat.messages
      .slice(0, msgIdx)
      .reverse()
      .find((m) => m.role === 'user');
    const userPrompt = userPromptMsg?.content || 'Evaluate this assistant response.';

    setEvaluatingJudgeId(messageId);
    try {
      const evaluation = await evaluateResponseWithJudge({
        prompt: userPrompt,
        response: msg.content,
        originalProvider: msg.provider || 'gemini',
        originalModel: msg.model || 'gemini-2.5-flash',
        settings,
        serverGeminiKey,
      });

      setChats((prev) =>
        prev.map((c) =>
          c.id === activeChat.id
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === messageId ? { ...m, judge: evaluation } : m
                ),
              }
            : c
        )
      );
      addToast(
        `Grok Judge score: ${evaluation.overallScore}/100 (${evaluation.verdict}) by ${evaluation.judgeModel}`,
        'success'
      );
    } catch (err: any) {
      addToast(`Judge evaluation failed: ${err.message || 'Error'}`, 'error');
      setChats((prev) =>
        prev.map((c) =>
          c.id === activeChat.id
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === messageId
                    ? {
                        ...m,
                        judge: {
                          status: 'failed',
                          error: err.message || 'Evaluation failed',
                          judgeModel: 'grok-2',
                          judgeProvider: 'xai',
                          evaluatedAt: Date.now(),
                        },
                      }
                    : m
                ),
              }
            : c
        )
      );
    } finally {
      setEvaluatingJudgeId(null);
    }
  };

  // Change system prompt on active chat
  const handleChangeSystemPrompt = (prompt: string) => {
    setChats((prev) =>
      prev.map((c) =>
        c.id === activeChat.id ? { ...c, systemPrompt: prompt, updatedAt: Date.now() } : c
      )
    );
  };

  // Handle uploaded files for documents
  const handleUploadFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const existing = docsPerChat[activeChat.id] || [];

    for (const file of fileArray) {
      if (existing.length >= 10) {
        addToast('Max 10 documents per chat', 'error');
        break;
      }

      const tempId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const placeholder: UploadedDoc = {
        id: tempId,
        name: file.name,
        status: 'reading',
        text: '',
        words: 0,
        chunks: [],
        include: true,
      };

      setDocsPerChat((prev) => ({
        ...prev,
        [activeChat.id]: [...(prev[activeChat.id] || []), placeholder],
      }));

      // Parse document
      const result = await parseDocument(file);

      setDocsPerChat((prev) => {
        const currentList = prev[activeChat.id] || [];
        return {
          ...prev,
          [activeChat.id]: currentList.map((d) =>
            d.id === tempId ? { ...d, ...result } : d
          ),
        };
      });
    }
  };

  const handleToggleIncludeDoc = (id: string) => {
    setDocsPerChat((prev) => {
      const list = prev[activeChat.id] || [];
      return {
        ...prev,
        [activeChat.id]: list.map((d) => (d.id === id ? { ...d, include: !d.include } : d)),
      };
    });
  };

  const handleDeleteDoc = (id: string) => {
    setDocsPerChat((prev) => {
      const list = prev[activeChat.id] || [];
      return {
        ...prev,
        [activeChat.id]: list.filter((d) => d.id !== id),
      };
    });
  };

  // Handle attaching email from EmailDrawer
  const handleAddEmailItem = (
    email: EmailItem,
    autoPrompt?: string,
    isDraftAction?: boolean
  ) => {
    setEmailsPerChat((prev) => ({
      ...prev,
      [activeChat.id]: [...(prev[activeChat.id] || []), email],
    }));

    if (autoPrompt) {
      handleSendMessage(autoPrompt, isDraftAction);
    }
  };

  const handleRemoveEmailItem = (id: string) => {
    setEmailsPerChat((prev) => {
      const list = prev[activeChat.id] || [];
      return {
        ...prev,
        [activeChat.id]: list.filter((e) => e.id !== id),
      };
    });
  };

  // Stop running generation
  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort('user_cancelled');
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setIsSearchingWeb(false);
  };

  // Main Send Message Handler (Step 5)
  const handleSendMessage = async (customPrompt?: string, isDraftMode?: boolean) => {
    const messageContent = (customPrompt !== undefined ? customPrompt : input).trim();

    // Guard 1: Empty input and no emails attached
    if (!messageContent && activeEmails.length === 0) {
      return;
    }

    // AI Council Mode: Convene multi-model debate across company models
    if (activeChat.councilMode) {
      if (customPrompt === undefined) {
        setInput('');
      }
      setGuardError(null);

      const userMsg: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: 'user',
        content: messageContent,
        createdAt: Date.now(),
      };

      const councilMsgId = `council-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const initialCouncilSession: AICouncilSession = {
        status: 'debating',
        currentStage: 'Convening Council across Google, OpenAI, Anthropic & xAI...',
        participants: [],
        rounds: [],
      };

      const councilAssistantMsg: ChatMessage = {
        id: councilMsgId,
        role: 'assistant',
        content: 'AI Council chamber is in session...',
        council: initialCouncilSession,
        createdAt: Date.now() + 1,
      };

      const updatedMessages = [...activeChat.messages, userMsg, councilAssistantMsg];
      let updatedTitle = activeChat.title;
      if (updatedTitle === 'New chat') {
        updatedTitle = `Council: ${messageContent.slice(0, 30).replace(/\n/g, ' ')}`;
      }

      setChats((prev) =>
        prev.map((c) =>
          c.id === activeChat.id
            ? {
                ...c,
                title: updatedTitle,
                messages: updatedMessages,
                updatedAt: Date.now(),
              }
            : c
        )
      );

      setIsLoading(true);
      abortControllerRef.current = new AbortController();
      const currentSignal = abortControllerRef.current.signal;

      // Extract doc context if any
      const { formattedContext: docContext } = retrieveRelevantDocContext(
        activeDocs,
        messageContent
      );

      try {
        const finalSession = await runAICouncilSession({
          prompt: messageContent,
          context: docContext,
          settings,
          serverGeminiKey,
          signal: currentSignal,
          onProgress: (progressSession) => {
            setChats((prev) =>
              prev.map((c) =>
                c.id === activeChat.id
                  ? {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === councilMsgId
                          ? { ...m, council: { ...progressSession, rounds: [...progressSession.rounds] } }
                          : m
                      ),
                    }
                  : c
              )
            );
          },
        });

        setChats((prev) =>
          prev.map((c) =>
            c.id === activeChat.id
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === councilMsgId
                      ? {
                          ...m,
                          content:
                            finalSession.consensus?.verdict ||
                            'Council debate concluded & consensus reached.',
                          council: finalSession,
                        }
                      : m
                  ),
                }
              : c
          )
        );
        addToast('AI Council debate concluded & consensus reached!', 'success');
      } catch (councilErr: any) {
        if (!currentSignal.aborted) {
          addToast(`AI Council error: ${councilErr.message || 'Error'}`, 'error');
          setChats((prev) =>
            prev.map((c) =>
              c.id === activeChat.id
                ? {
                    ...c,
                    messages: c.messages.map((m) =>
                      m.id === councilMsgId
                        ? {
                            ...m,
                            content: `Council debate failed: ${councilErr.message || 'Error'}`,
                            council: {
                              status: 'failed',
                              currentStage: 'Failed',
                              participants: [],
                              rounds: [],
                              error: councilErr.message,
                            },
                          }
                        : m
                    ),
                  }
                : c
            )
          );
        }
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
      return;
    }

    // Guard 2: No model chosen
    if (!currentProvider || !currentModel) {
      setGuardError('Choose a model first.');
      setIsModelPickerOpen(true);
      return;
    }

    // Guard 3: Provider has no working key
    const providerKey = settings.keys[currentProvider]?.value;
    if (!providerKey || settings.keys[currentProvider]?.status !== 'ok') {
      const pName =
        currentProvider === 'gemini'
          ? 'Google Gemini'
          : currentProvider === 'openai'
          ? 'OpenAI'
          : currentProvider === 'anthropic'
          ? 'Anthropic'
          : 'xAI';
      setGuardError(`Add your ${pName} key in Settings.`);
      return;
    }

    // Guard 4: Any doc still reading
    if (activeDocs.some((d) => d.status === 'reading')) {
      setGuardError('Wait for documents to finish loading.');
      return;
    }

    // Clear input & guard errors
    if (customPrompt === undefined) {
      setInput('');
    }
    setGuardError(null);

    // 1. Create and append User Message
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      content: messageContent,
      createdAt: Date.now(),
    };

    const updatedMessages = [...activeChat.messages, userMsg];

    // Update chat title if still "New chat"
    let updatedTitle = activeChat.title;
    if (updatedTitle === 'New chat') {
      updatedTitle = messageContent.slice(0, 40).replace(/\n/g, ' ') || 'New chat';
    }

    setChats((prev) =>
      prev.map((c) =>
        c.id === activeChat.id
          ? {
              ...c,
              title: updatedTitle,
              messages: updatedMessages,
              updatedAt: Date.now(),
            }
          : c
      )
    );

    // 2. Start loading
    setIsLoading(true);
    abortControllerRef.current = new AbortController();
    const currentSignal = abortControllerRef.current.signal;

    let searchResult: SearchResult | undefined = undefined;
    let webSearchAmberNote: string | undefined = undefined;

    // 3. Web search if enabled
    if (activeChat.webSearch) {
      setIsSearchingWeb(true);
      try {
        searchResult = await performWebSearch(messageContent, settings, currentSignal);
        if (searchResult.note) {
          webSearchAmberNote = searchResult.note;
        }
      } catch (searchErr) {
        webSearchAmberNote = 'Web search failed; answered without it.';
      } finally {
        setIsSearchingWeb(false);
      }
    }

    // 4. Retrieve document context
    const { formattedContext: docContext, usedDocNames } = retrieveRelevantDocContext(
      activeDocs,
      messageContent
    );

    // 4b. Live Gmail inbox query if activeChat.gmailAccess is enabled or if prompt asks for emails
    let dynamicEmails: EmailItem[] = [...activeEmails];
    const isEmailIntent =
      Boolean(activeChat.gmailAccess) ||
      /\b(email|emails|gmail|inbox|unread|draft|reply|mail|messages|in-box)\b/i.test(messageContent);

    if (isEmailIntent && dynamicEmails.length === 0) {
      if (settings.gmail.status === 'ok') {
        try {
          const mailRes = await queryGmailInbox(
            settings.gmail.email,
            settings.gmail.appPassword,
            messageContent.length > 50 ? '' : messageContent,
            5
          );
          if (mailRes.emails && mailRes.emails.length > 0) {
            dynamicEmails = mailRes.emails;
          }
        } catch (mailErr) {
          console.warn('Could not query Gmail:', mailErr);
        }
      } else {
        // Fallback to preloaded realistic inbox items if user hasn't configured credentials yet
        dynamicEmails = getDemoInbox(messageContent, 4);
      }
    }

    // 5. Build system prompt
    const fullSystemPrompt = buildSystemPrompt({
      systemPrompt: activeChat.systemPrompt,
      searchResult,
      docContext,
      emails: dynamicEmails,
    });

    // 6. Trim history
    const historyToTrim = updatedMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const { messages: trimmedHistory, wasTrimmed } = trimHistory(
      fullSystemPrompt,
      historyToTrim,
      100000
    );

    try {
      // 7. Call provider
      const response = await chat({
        provider: currentProvider,
        apiKey: providerKey,
        model: currentModel,
        system: fullSystemPrompt,
        messages: trimmedHistory,
        maxTokens: settings.maxOutputTokens,
        signal: currentSignal,
      });

      let responseText = response.text;

      // Append amber note from web search if any
      if (webSearchAmberNote) {
        responseText = `${responseText}\n\n_(${webSearchAmberNote})_`;
      }
      if (wasTrimmed) {
        responseText = `${responseText}\n\n_(Older messages were left out to fit the model's limit.)_`;
      }

      // Check if this response is an email draft
      let draftData: { to: string; subject: string; body: string } | undefined = undefined;
      const isDraftIntent =
        isDraftMode ||
        messageContent.toLowerCase().includes('draft a reply') ||
        messageContent.toLowerCase().includes('rewrite the draft');

      if (isDraftIntent && (dynamicEmails.length > 0 || messageContent.toLowerCase().includes('draft'))) {
        const primaryEmail = dynamicEmails[0];
        draftData = {
          to: primaryEmail?.fromEmail || '',
          subject: primaryEmail?.subject || 'Email reply',
          body: responseText.replace(/_\(.*?\)_/g, '').trim(),
        };
      }

      const usedEmailSubjects = dynamicEmails.map((e) => e.subject || e.from);
      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: 'assistant',
        content: responseText,
        provider: currentProvider,
        model: currentModel,
        usage: response.usage,
        sources: searchResult?.sources,
        usedDocs: usedDocNames.length > 0 ? usedDocNames : undefined,
        usedEmails: usedEmailSubjects.length > 0 ? usedEmailSubjects : undefined,
        draft: draftData,
        createdAt: Date.now(),
      };

      setChats((prev) =>
        prev.map((c) =>
          c.id === activeChat.id
            ? {
                ...c,
                messages: [...c.messages, assistantMsg],
                updatedAt: Date.now(),
              }
            : c
        )
      );

      // Trigger Auto-Judge evaluation in background if enabled
      if (settings.autoJudge) {
        evaluateResponseWithJudge({
          prompt: messageContent,
          response: responseText,
          context: [docContext, webSearchAmberNote].filter(Boolean).join('\n\n'),
          originalProvider: currentProvider,
          originalModel: currentModel,
          settings,
          serverGeminiKey,
        })
          .then((evaluation) => {
            setChats((prev) =>
              prev.map((c) =>
                c.id === activeChat.id
                  ? {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === assistantMsg.id ? { ...m, judge: evaluation } : m
                      ),
                    }
                  : c
              )
            );
          })
          .catch((judgeErr) => {
            console.warn('Auto-judge evaluation error:', judgeErr);
          });
      }
    } catch (err: any) {
      if (currentSignal.aborted || err?.kind === 'cancelled') {
        const stoppedMsg: ChatMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: 'assistant',
          content: 'Stopped.',
          createdAt: Date.now(),
        };
        setChats((prev) =>
          prev.map((c) =>
            c.id === activeChat.id
              ? {
                  ...c,
                  messages: [...c.messages, stoppedMsg],
                  updatedAt: Date.now(),
                }
              : c
          )
        );
      } else {
        const friendlyErr = friendly(
          err,
          currentProvider === 'gemini'
            ? 'Google Gemini'
            : currentProvider === 'openai'
            ? 'OpenAI'
            : currentProvider === 'anthropic'
            ? 'Anthropic'
            : 'xAI'
        );

        const errorMsg: ChatMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: 'assistant',
          content: '',
          error: {
            title: friendlyErr.title,
            detail: friendlyErr.detail,
            canRetry: friendlyErr.canRetry,
          },
          createdAt: Date.now(),
        };

        setChats((prev) =>
          prev.map((c) =>
            c.id === activeChat.id
              ? {
                  ...c,
                  messages: [...c.messages, errorMsg],
                  updatedAt: Date.now(),
                }
              : c
          )
        );
      }
    } finally {
      setIsLoading(false);
      setIsSearchingWeb(false);
      abortControllerRef.current = null;
    }
  };

  // Retry last failed user message
  const handleRetry = () => {
    // Remove trailing error message and find last user message
    const msgs = activeChat.messages;
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg && lastMsg.error) {
      const withoutError = msgs.slice(0, msgs.length - 1);
      const lastUserMsg = [...withoutError].reverse().find((m) => m.role === 'user');
      if (lastUserMsg) {
        // Pop user message from state and resend it
        const withoutUserMsg = withoutError.slice(0, withoutError.lastIndexOf(lastUserMsg));
        setChats((prev) =>
          prev.map((c) =>
            c.id === activeChat.id ? { ...c, messages: withoutUserMsg } : c
          )
        );
        handleSendMessage(lastUserMsg.content);
      }
    }
  };

  const handleFollowUp = (instruction: string) => {
    handleSendMessage(instruction, true);
  };

  const handleOpenSettingsModal = (tab: 'keys' | 'gmail' | 'preferences' = 'keys') => {
    setSettingsInitialTab(tab);
    setSettingsModalOpen(true);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans selection:bg-indigo-500/20">
      {/* Sidebar */}
      <Sidebar
        chats={chats}
        activeChatId={activeChat.id}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
        onRenameChat={handleRenameChat}
        onDeleteChat={handleDeleteChat}
        onClearAllChats={handleClearAllChats}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
        <TopBar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          currentProvider={currentProvider}
          currentModel={currentModel}
          keys={settings.keys}
          onSelectModel={handleSelectModel}
          onOpenSettings={handleOpenSettingsModal}
          onOpenQuiz={() => setQuizModalOpen(true)}
          theme={settings.theme}
          onToggleTheme={() =>
            setSettings((prev) => ({
              ...prev,
              theme: prev.theme === 'dark' ? 'light' : 'dark',
            }))
          }
          isModelPickerOpen={isModelPickerOpen}
          onCloseModelPicker={() => setIsModelPickerOpen(false)}
          councilActive={Boolean(activeChat.councilMode)}
          onToggleCouncil={handleToggleCouncilMode}
        />

        {/* Content area: Thread or Empty State */}
        {activeChat.messages.length === 0 ? (
          <EmptyState
            keys={settings.keys}
            currentModel={currentModel}
            onOpenSettings={handleOpenSettingsModal}
            onOpenModelPicker={() => setIsModelPickerOpen(true)}
            onOpenQuiz={() => setQuizModalOpen(true)}
            onSamplePrompt={(prompt) => handleSendMessage(prompt)}
          />
        ) : (
          <ChatThread
            messages={activeChat.messages}
            isLoading={isLoading}
            isSearchingWeb={isSearchingWeb}
            currentProvider={currentProvider}
            currentModel={currentModel}
            settings={settings}
            onRetry={handleRetry}
            onOpenSettings={handleOpenSettingsModal}
            onFollowUp={handleFollowUp}
            onToast={addToast}
            onDropFiles={handleUploadFiles}
            attachedEmails={activeEmails}
            onEvaluateJudge={handleEvaluateJudge}
            evaluatingJudgeId={evaluatingJudgeId}
          />
        )}

        {/* Pinned Input Bar */}
        <InputBar
          input={input}
          setInput={setInput}
          onSend={() => handleSendMessage()}
          onStop={handleStop}
          isLoading={isLoading}
          webSearch={activeChat.webSearch}
          onToggleWebSearch={handleToggleWebSearch}
          gmailAccess={Boolean(activeChat.gmailAccess)}
          onToggleGmailAccess={handleToggleGmailAccess}
          autoJudge={Boolean(settings.autoJudge)}
          onToggleAutoJudge={handleToggleAutoJudge}
          councilMode={Boolean(activeChat.councilMode)}
          onToggleCouncilMode={handleToggleCouncilMode}
          docs={activeDocs}
          onRemoveDoc={handleDeleteDoc}
          emails={activeEmails}
          onRemoveEmail={handleRemoveEmailItem}
          systemPrompt={activeChat.systemPrompt}
          onChangeSystemPrompt={handleChangeSystemPrompt}
          onOpenDocsDrawer={() => setDocsDrawerOpen(true)}
          onOpenEmailDrawer={() => setEmailDrawerOpen(true)}
          guardError={guardError}
          onClearGuardError={() => setGuardError(null)}
          isKeyConfigured={isKeyConfigured}
          settings={settings}
          onOpenSettings={handleOpenSettingsModal}
        />
      </div>

      {/* Drawers and Modals */}
      <DocumentsDrawer
        isOpen={docsDrawerOpen}
        onClose={() => setDocsDrawerOpen(false)}
        docs={activeDocs}
        onUploadFiles={handleUploadFiles}
        onToggleInclude={handleToggleIncludeDoc}
        onDeleteDoc={handleDeleteDoc}
        onToast={addToast}
      />

      <EmailDrawer
        isOpen={emailDrawerOpen}
        onClose={() => setEmailDrawerOpen(false)}
        settings={settings}
        onOpenSettings={handleOpenSettingsModal}
        onAddEmailItem={handleAddEmailItem}
        onToast={addToast}
      />

      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        settings={settings}
        onUpdateSettings={setSettings}
        initialTab={settingsInitialTab}
        onToast={addToast}
      />

      <EngineeringQuizModal
        isOpen={quizModalOpen}
        onClose={() => setQuizModalOpen(false)}
        onStartAiDrill={(drillPrompt) => {
          handleSendMessage(drillPrompt);
        }}
        onToast={addToast}
      />

      {/* Toast notifications */}
      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
