import React, { useState } from 'react';
import {
  X,
  Mail,
  Send,
  ListChecks,
  FileText,
  Search,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { EmailItem, Settings } from '../types';
import { listGmail, getGmailMessage, getDemoInbox, DEMO_INBOX_EMAILS } from '../lib/gmail';

interface EmailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onOpenSettings: (tab?: 'keys' | 'gmail' | 'preferences') => void;
  onAddEmailItem: (email: EmailItem, autoPrompt?: string, isDraft?: boolean) => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const EmailDrawer: React.FC<EmailDrawerProps> = ({
  isOpen,
  onClose,
  settings,
  onOpenSettings,
  onAddEmailItem,
  onToast,
}) => {
  const [tab, setTab] = useState<'paste' | 'gmail'>('paste');

  // Paste mode state
  const [pastedText, setPastedText] = useState('');
  const [whatToSay, setWhatToSay] = useState('');

  // Gmail mode state
  const [gmailQuery, setGmailQuery] = useState('');
  const [gmailEmails, setGmailEmails] = useState<any[]>([]);
  const [selectedUids, setSelectedUids] = useState<number[]>([]);
  const [isLoadingGmail, setIsLoadingGmail] = useState(false);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);

  if (!isOpen) return null;

  const isGmailConnected = settings.gmail.status === 'ok';

  // Helper to detect From and Subject in pasted text
  const parsePastedEmail = (text: string) => {
    let from = 'Pasted email';
    let fromEmail = '';
    let subject = 'Email reply';

    const lines = text.split('\n').slice(0, 15);
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^from:\s*/i.test(trimmed)) {
        from = trimmed.replace(/^from:\s*/i, '');
        const matchEmail = from.match(/<([^>]+)>/);
        if (matchEmail) fromEmail = matchEmail[1];
        else if (from.includes('@')) fromEmail = from;
      } else if (/^subject:\s*/i.test(trimmed)) {
        subject = trimmed.replace(/^subject:\s*/i, '');
      }
    }

    return { from, fromEmail, subject };
  };

  const handlePasteAction = (action: 'draft' | 'summarise' | 'actions') => {
    if (!pastedText.trim()) return;

    const { from, fromEmail, subject } = parsePastedEmail(pastedText);
    const item: EmailItem = {
      id: `paste-${Date.now()}`,
      from,
      fromEmail,
      subject,
      date: new Date().toISOString(),
      body: pastedText.trim().slice(0, 20000),
      source: 'paste',
    };

    let prompt = '';
    let isDraft = false;

    if (action === 'draft') {
      isDraft = true;
      prompt = 'Draft a reply to the attached email.';
      if (whatToSay.trim()) {
        prompt += ` The reply should say: ${whatToSay.trim()}`;
      }
      prompt += ' Output only the email body.';
    } else if (action === 'summarise') {
      prompt = 'Summarise the attached email in 3–5 bullet points.';
    } else {
      prompt = 'List the action items and deadlines in the attached email as a checklist.';
    }

    onAddEmailItem(item, prompt, isDraft);
    setPastedText('');
    setWhatToSay('');
    onClose();
  };

  const loadDemoEmails = () => {
    setIsDemoMode(true);
    const demos = getDemoInbox(gmailQuery).map((e) => ({
      uid: e.uid,
      from: e.from,
      fromEmail: e.fromEmail,
      subject: e.subject,
      date: e.date,
      snippet: e.body.slice(0, 120),
    }));
    setGmailEmails(demos);
    setSelectedUids([]);
  };

  const handleFetchGmail = async () => {
    if (isDemoMode || !isGmailConnected) {
      loadDemoEmails();
      return;
    }

    setIsLoadingGmail(true);
    setGmailError(null);

    const res = await listGmail(
      settings.gmail.email,
      settings.gmail.appPassword,
      gmailQuery,
      20
    );

    setIsLoadingGmail(false);

    if (res.error) {
      setGmailError(res.error.message);
    } else {
      setGmailEmails(res.items || []);
      setSelectedUids([]);
    }
  };

  const handleToggleSelectUid = (uid: number) => {
    if (selectedUids.includes(uid)) {
      setSelectedUids(selectedUids.filter((u) => u !== uid));
    } else {
      if (selectedUids.length >= 5) {
        onToast('Select up to 5 emails at a time', 'info');
        return;
      }
      setSelectedUids([...selectedUids, uid]);
    }
  };

  const handleGmailAction = async (isDraft: boolean) => {
    if (selectedUids.length === 0) return;

    setIsLoadingGmail(true);
    const itemsToAdd: EmailItem[] = [];

    if (isDemoMode || !isGmailConnected) {
      // Find from demo items
      for (const uid of selectedUids) {
        const found = DEMO_INBOX_EMAILS.find((e) => e.uid === uid);
        if (found) {
          itemsToAdd.push(found);
        }
      }
    } else {
      // Fetch details for each selected UID (max 5)
      for (const uid of selectedUids.slice(0, 5)) {
        const res = await getGmailMessage(
          settings.gmail.email,
          settings.gmail.appPassword,
          uid
        );
        if (res.item) {
          itemsToAdd.push(res.item);
        }
      }
    }

    setIsLoadingGmail(false);

    if (itemsToAdd.length === 0) {
      onToast('Could not load selected emails', 'error');
      return;
    }

    // Attach items
    itemsToAdd.forEach((item, index) => {
      const isFirst = index === 0;
      let prompt = '';
      if (isFirst) {
        prompt = isDraft
          ? 'Draft a reply to the attached email. Output only the email body.'
          : 'Summarise the attached email in 3–5 bullet points.';
      }
      onAddEmailItem(item, isFirst ? prompt : undefined, isDraft && isFirst);
    });

    onClose();
  };

  return (
    <>
      {/* Mobile backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40 md:hidden"
      />

      <aside className="fixed inset-y-0 right-0 z-50 w-full sm:w-[380px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white">
              Email Assistant
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Segmented Control */}
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50">
          <div className="flex p-0.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-xs font-medium">
            <button
              onClick={() => setTab('paste')}
              className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
                tab === 'paste'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Paste email
            </button>
            <button
              onClick={() => {
                setTab('gmail');
                if (isGmailConnected && gmailEmails.length === 0) {
                  handleFetchGmail();
                }
              }}
              className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
                tab === 'gmail'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              My Gmail
            </button>
          </div>
        </div>

        {/* Tab 1: Paste Email Mode */}
        {tab === 'paste' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Paste the email you received
              </label>
              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                rows={7}
                placeholder="Paste sender, subject, and email body here…"
                className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans leading-relaxed resize-y"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                What do you want to say? <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                type="text"
                value={whatToSay}
                onChange={(e) => setWhatToSay(e.target.value)}
                placeholder="e.g. Confirm Tuesday at 2pm, thank them"
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Action buttons */}
            <div className="space-y-2 pt-2">
              <button
                onClick={() => handlePasteAction('draft')}
                disabled={!pastedText.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors shadow-xs cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                Draft reply
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handlePasteAction('summarise')}
                  disabled={!pastedText.trim()}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 text-slate-700 dark:text-slate-300 text-xs font-medium transition-colors cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  Summarise
                </button>
                <button
                  onClick={() => handlePasteAction('actions')}
                  disabled={!pastedText.trim()}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 text-slate-700 dark:text-slate-300 text-xs font-medium transition-colors cursor-pointer"
                >
                  <ListChecks className="w-3.5 h-3.5 text-slate-400" />
                  Action items
                </button>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 text-center pt-2">
              Paste works with zero setup and never touches a mail server.
            </p>
          </div>
        )}

        {/* Tab 2: My Gmail Mode */}
        {tab === 'gmail' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {!isGmailConnected && !isDemoMode ? (
              /* Connect Gmail Prompt */
              <div className="p-6 text-center space-y-4 my-auto">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
                  <Mail className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Connect your Gmail
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed max-w-xs mx-auto">
                    Connect Gmail using an App Password to search your inbox, draft replies, and reply directly.
                  </p>
                </div>
                <div className="flex flex-col gap-2 pt-2">
                  <button
                    onClick={() => {
                      onClose();
                      onOpenSettings('gmail');
                    }}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors shadow-xs cursor-pointer"
                  >
                    Set up in Settings
                  </button>
                  <button
                    type="button"
                    onClick={loadDemoEmails}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-medium transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                    Explore with Demo Inbox
                  </button>
                </div>
              </div>
            ) : (
              /* Inbox view */
              <div className="flex-1 flex flex-col overflow-hidden">
                {isDemoMode && (
                  <div className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/60 border-b border-indigo-100 dark:border-indigo-900 text-[11px] text-indigo-700 dark:text-indigo-300 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-indigo-500" />
                      Showing Demo Engineering Inbox
                    </span>
                    <button
                      onClick={() => setIsDemoMode(false)}
                      className="text-[10px] underline hover:text-indigo-900 cursor-pointer"
                    >
                      Exit Demo
                    </button>
                  </div>
                )}
                {/* Search input */}
                <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 bg-white dark:bg-slate-900">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleFetchGmail();
                    }}
                    className="flex-1 relative"
                  >
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={gmailQuery}
                      onChange={(e) => setGmailQuery(e.target.value)}
                      placeholder="Search Gmail (e.g. from:boss newer_than:7d)"
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </form>
                  <button
                    onClick={handleFetchGmail}
                    disabled={isLoadingGmail}
                    className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Refresh inbox"
                  >
                    <RotateCw className={`w-4 h-4 ${isLoadingGmail ? 'animate-spin text-indigo-500' : ''}`} />
                  </button>
                </div>

                {/* Email List */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {isLoadingGmail && gmailEmails.length === 0 && (
                    <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                      Loading emails…
                    </div>
                  )}

                  {gmailError && (
                    <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50 m-2 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>{gmailError}</div>
                    </div>
                  )}

                  {!isLoadingGmail && gmailEmails.length === 0 && !gmailError && (
                    <div className="p-8 text-center text-xs text-slate-400">
                      No emails match.
                    </div>
                  )}

                  {gmailEmails.map((msg) => {
                    const isSelected = selectedUids.includes(msg.uid);
                    return (
                      <div
                        key={msg.uid}
                        onClick={() => handleToggleSelectUid(msg.uid)}
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800'
                            : 'bg-white dark:bg-slate-850 border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="mt-1 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className="font-semibold text-slate-900 dark:text-white truncate">
                              {msg.from}
                            </span>
                            <span className="text-[10px] text-slate-400 shrink-0">
                              {new Date(msg.date).toLocaleDateString([], {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          </div>
                          <div className="font-medium text-slate-700 dark:text-slate-300 truncate">
                            {msg.subject || '(no subject)'}
                          </div>
                          {msg.snippet && (
                            <div className="text-[11px] text-slate-500 truncate mt-0.5">
                              {msg.snippet}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Sticky Footer */}
                {gmailEmails.length > 0 && (
                  <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500 font-medium">
                      {selectedUids.length} selected
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleGmailAction(false)}
                        disabled={selectedUids.length === 0 || isLoadingGmail}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 text-slate-700 dark:text-slate-300 text-xs font-medium cursor-pointer"
                      >
                        Add to chat
                      </button>
                      <button
                        onClick={() => handleGmailAction(true)}
                        disabled={selectedUids.length === 0 || isLoadingGmail}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-medium cursor-pointer transition-colors"
                      >
                        Draft reply
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </aside>
    </>
  );
};
