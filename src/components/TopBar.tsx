import React from 'react';
import { PanelLeft, Sun, Moon, Settings as SettingsIcon, Award } from 'lucide-react';
import { ModelPicker } from './ModelPicker';
import { ProviderId, KeyState } from '../types';

interface TopBarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  currentProvider: ProviderId | null;
  currentModel: string | null;
  keys: Record<ProviderId, KeyState>;
  onSelectModel: (provider: ProviderId, model: string) => void;
  onOpenSettings: (tab?: 'keys' | 'gmail' | 'preferences') => void;
  onOpenQuiz: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  isModelPickerOpen?: boolean;
  onCloseModelPicker?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  sidebarOpen,
  onToggleSidebar,
  currentProvider,
  currentModel,
  keys,
  onSelectModel,
  onOpenSettings,
  onOpenQuiz,
  theme,
  onToggleTheme,
  isModelPickerOpen,
  onCloseModelPicker,
}) => {
  return (
    <header className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-4 flex items-center justify-between shrink-0 z-20">
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <PanelLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="font-semibold text-base tracking-tight text-slate-900 dark:text-white">
            Harness
          </span>
          <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40">
            BYOK
          </span>
        </div>

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block" />

        <ModelPicker
          currentProvider={currentProvider}
          currentModel={currentModel}
          keys={keys}
          onSelectModel={onSelectModel}
          onOpenSettings={onOpenSettings}
          isOpenExternal={isModelPickerOpen}
          onCloseExternal={onCloseModelPicker}
        />
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        {/* Meeting Quiz Prep Button */}
        <button
          onClick={onOpenQuiz}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800/60 transition-colors cursor-pointer"
          title="Engineering Architecture Meeting Quiz & Cheat Sheet"
        >
          <Award className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span className="hidden sm:inline">Engineering Quiz</span>
        </button>

        <button
          onClick={onToggleTheme}
          className="p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <button
          onClick={() => onOpenSettings()}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label="Settings"
        >
          <SettingsIcon className="w-4 h-4" />
          <span className="hidden sm:inline text-xs font-medium">Settings</span>
        </button>
      </div>
    </header>
  );
};

