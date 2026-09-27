import { Chat, Settings } from '../types';

export const store = {
  get<T>(key: string, fallback: T): T {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return fallback;
      const v = localStorage.getItem(key);
      return v ? (JSON.parse(v) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): boolean {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return false;
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  remove(key: string): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      localStorage.removeItem(key);
    } catch {
      // Ignored if storage throws
    }
  },
};

export const STORAGE_KEYS = {
  SETTINGS: 'harness.settings.v1',
  CHATS: 'harness.chats.v1',
  ACTIVE_CHAT: 'harness.activeChat.v1',
};

export function saveSettingsToStorage(settings: Settings): boolean {
  if (!settings.rememberKeys) {
    // Blank all keys and passwords before saving
    const sanitized: Settings = {
      ...settings,
      keys: {
        openai: { ...settings.keys.openai, value: '' },
        anthropic: { ...settings.keys.anthropic, value: '' },
        gemini: { ...settings.keys.gemini, value: '' },
        xai: { ...settings.keys.xai, value: '' },
      },
      tavily: { ...settings.tavily, value: '' },
      gmail: { ...settings.gmail, appPassword: '' },
    };
    return store.set(STORAGE_KEYS.SETTINGS, sanitized);
  }
  return store.set(STORAGE_KEYS.SETTINGS, settings);
}

export function saveChatsToStorage(
  chats: Chat[],
  keepChats: boolean,
  onStorageFull?: () => void
): boolean {
  if (!keepChats) {
    store.remove(STORAGE_KEYS.CHATS);
    return true;
  }

  // Keep last 50 chats
  let targetChats = chats.slice(0, 50);
  let success = store.set(STORAGE_KEYS.CHATS, targetChats);

  if (success) return true;

  // Quota exceeded: drop oldest chats and retry up to 10 times
  let retryCount = 0;
  while (!success && retryCount < 10 && targetChats.length > 1) {
    targetChats = targetChats.slice(0, targetChats.length - 1);
    success = store.set(STORAGE_KEYS.CHATS, targetChats);
    retryCount++;
  }

  if (!success && onStorageFull) {
    onStorageFull();
  }

  return success;
}
