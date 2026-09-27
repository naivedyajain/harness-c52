import React, { useState } from 'react';
import {
  Plus,
  MessageSquare,
  Trash2,
  Edit2,
  Check,
  X,
  Download,
  AlertTriangle,
  PanelLeftClose,
} from 'lucide-react';
import { Chat } from '../types';

interface SidebarProps {
  chats: Chat[];
  activeChatId: string;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onRenameChat: (id: string, newTitle: string) => void;
  onDeleteChat: (id: string) => void;
  onClearAllChats: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onRenameChat,
  onDeleteChat,
  onClearAllChats,
  isOpen,
  onClose,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Group chats by date: Today, Previous 7 days, Older
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const SEVEN_DAYS = 7 * ONE_DAY;

  const todayChats: Chat[] = [];
  const weekChats: Chat[] = [];
  const olderChats: Chat[] = [];

  chats.forEach((chat) => {
    const diff = now - chat.updatedAt;
    if (diff < ONE_DAY) {
      todayChats.push(chat);
    } else if (diff < SEVEN_DAYS) {
      weekChats.push(chat);
    } else {
      olderChats.push(chat);
    }
  });

  const startRename = (chat: Chat, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(chat.id);
    setEditTitle(chat.title);
  };

  const handleRenameSubmit = (id: string) => {
    const trimmed = editTitle.trim();
    onRenameChat(id, trimmed || 'New chat');
    setEditingId(null);
  };

  const exportCurrentChat = () => {
    const current = chats.find((c) => c.id === activeChatId);
    if (!current) return;

    let md = `# ${current.title}\n\n`;
    current.messages.forEach((msg) => {
      const heading = msg.role === 'user' ? '### You' : `### ${msg.model || 'Assistant'}`;
      md += `${heading}\n\n${msg.content}\n\n`;
    });

    const safeTitle = current.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `harness-${safeTitle || 'chat'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderGroup = (title: string, groupChats: Chat[]) => {
    if (groupChats.length === 0) return null;

    return (
      <div className="space-y-1">
        <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
          {title}
        </div>
        {groupChats.map((chat) => {
          const isActive = chat.id === activeChatId;
          const isEditing = chat.id === editingId;

          return (
            <div
              key={chat.id}
              onClick={() => onSelectChat(chat.id)}
              className={`group relative flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
                isActive
                  ? 'bg-slate-200/70 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2.5 truncate flex-1 min-w-0 mr-1">
                <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-70" />
                {isEditing ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleRenameSubmit(chat.id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 flex-1"
                  >
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="w-full bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-indigo-400 text-xs text-slate-800 dark:text-slate-100 focus:outline-none"
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="p-0.5 hover:text-emerald-500 text-slate-400"
                      aria-label="Save title"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="p-0.5 hover:text-rose-500 text-slate-400"
                      aria-label="Cancel rename"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </form>
                ) : (
                  <span className="truncate">{chat.title}</span>
                )}
              </div>

              {!isEditing && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => startRename(chat, e)}
                    className="p-1 hover:text-indigo-600 dark:hover:text-indigo-400 text-slate-400 transition-colors"
                    aria-label="Rename chat"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingId(chat.id);
                    }}
                    className="p-1 hover:text-rose-600 dark:hover:text-rose-400 text-slate-400 transition-colors"
                    aria-label="Delete chat"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-30 md:hidden"
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-[260px] bg-slate-50/90 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-transform duration-200 ease-in-out shrink-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:hidden'
        }`}
      >
        {/* Top Header */}
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <button
            onClick={() => {
              onNewChat();
              if (window.innerWidth < 768) onClose();
            }}
            className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-all shadow-xs cursor-pointer group"
          >
            <Plus className="w-4 h-4 text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform" />
            New chat
          </button>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition-colors md:flex hidden cursor-pointer"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {/* Chats List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          {renderGroup('Today', todayChats)}
          {renderGroup('Previous 7 days', weekChats)}
          {renderGroup('Older', olderChats)}
          {chats.length === 0 && (
            <div className="text-center py-8 text-xs text-slate-400">No chats yet</div>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-1 bg-white/40 dark:bg-slate-900/40">
          <button
            onClick={exportCurrentChat}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export active chat (.md)
          </button>

          <button
            onClick={() => setShowClearConfirm(true)}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear all chats
          </button>
        </div>

        {/* Single Chat Delete Confirm Modal */}
        {deletingId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl">
              <div className="flex items-center gap-3 mb-3 text-rose-600 dark:text-rose-400">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h4 className="font-semibold text-sm text-slate-900 dark:text-white">
                  Delete this chat?
                </h4>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-5 leading-relaxed">
                This will permanently delete this conversation and its message history.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setDeletingId(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onDeleteChat(deletingId);
                    setDeletingId(null);
                  }}
                  className="px-3.5 py-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-lg transition-colors cursor-pointer"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Clear All Chats Confirm Modal */}
        {showClearConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl">
              <div className="flex items-center gap-3 mb-3 text-rose-600 dark:text-rose-400">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h4 className="font-semibold text-sm text-slate-900 dark:text-white">
                  Clear all chats?
                </h4>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-5 leading-relaxed">
                Are you sure you want to delete all saved conversations? This cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onClearAllChats();
                    setShowClearConfirm(false);
                  }}
                  className="px-3.5 py-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-lg transition-colors cursor-pointer"
                >
                  Clear all
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
};
