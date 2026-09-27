import React, { useState } from 'react';
import { Mail, Copy, ExternalLink, Send, Sparkles, Check, AlertCircle } from 'lucide-react';
import { sendGmailMessage } from '../lib/gmail';
import { Settings } from '../types';

interface DraftCardProps {
  draft: {
    to: string;
    subject: string;
    body: string;
  };
  sourceEmail?: {
    fromEmail: string;
    source: 'paste' | 'gmail';
    messageId?: string;
    references?: string;
  };
  settings: Settings;
  onFollowUp: (instruction: string) => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const DraftCard: React.FC<DraftCardProps> = ({
  draft,
  sourceEmail,
  settings,
  onFollowUp,
  onToast,
}) => {
  const [editedBody, setEditedBody] = useState(draft.body);
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sentTime, setSentTime] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const isFromGmail = sourceEmail?.source === 'gmail';
  const targetEmail = sourceEmail?.fromEmail || draft.to || '';

  const cleanSubject = draft.subject.toLowerCase().startsWith('re:')
    ? draft.subject
    : `Re: ${draft.subject || 'Email'}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(editedBody);
      onToast('Copied', 'success');
    } catch {
      onToast('Failed to copy', 'error');
    }
  };

  const handleOpenInGmail = () => {
    const baseUrl = 'https://mail.google.com/mail/?view=cm&fs=1';
    const toParam = `&to=${encodeURIComponent(targetEmail)}`;
    const suParam = `&su=${encodeURIComponent(cleanSubject)}`;
    const bodyParam = `&body=${encodeURIComponent(editedBody)}`;

    const fullUrl = `${baseUrl}${toParam}${suParam}${bodyParam}`;

    if (fullUrl.length > 7000) {
      const shortUrl = `${baseUrl}${toParam}${suParam}`;
      navigator.clipboard.writeText(editedBody);
      onToast('Draft copied — paste it into Gmail.', 'info');
      window.open(shortUrl, '_blank', 'noopener,noreferrer');
    } else {
      window.open(fullUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleConfirmSend = async () => {
    if (!targetEmail) {
      setSendError('No recipient email address found.');
      setShowSendConfirm(false);
      return;
    }
    if (isSending || sentTime) return;

    setIsSending(true);
    setSendError(null);

    const refString = [sourceEmail?.references, sourceEmail?.messageId]
      .filter(Boolean)
      .join(' ')
      .trim();

    const res = await sendGmailMessage({
      email: settings.gmail.email,
      appPassword: settings.gmail.appPassword,
      to: targetEmail,
      subject: cleanSubject,
      body: editedBody,
      inReplyTo: sourceEmail?.messageId,
      references: refString || undefined,
    });

    setIsSending(false);
    setShowSendConfirm(false);

    if (res.ok) {
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setSentTime(timeStr);
      onToast('Sent', 'success');
    } else {
      setSendError(res.error?.message || 'Failed to send email.');
    }
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 my-2 shadow-xs space-y-3">
      {/* Card Header */}
      <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-2.5">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
          <Mail className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span>Email Draft</span>
          {targetEmail && (
            <span className="text-slate-400 font-normal">
              &rarr; {targetEmail}
            </span>
          )}
        </div>

        {sentTime ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <Check className="w-3 h-3" />
            Sent · {sentTime}
          </span>
        ) : (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onFollowUp('Rewrite the draft to be shorter')}
              className="px-2 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
            >
              Shorter
            </button>
            <button
              onClick={() => onFollowUp('Rewrite the draft to be more formal')}
              className="px-2 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
            >
              More formal
            </button>
          </div>
        )}
      </div>

      {/* Editable Body */}
      <div className="relative">
        <textarea
          value={editedBody}
          onChange={(e) => setEditedBody(e.target.value)}
          disabled={Boolean(sentTime)}
          rows={Math.min(14, Math.max(4, editedBody.split('\n').length + 1))}
          className="w-full text-xs font-sans p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 leading-relaxed focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-80 resize-y"
          placeholder="Draft content..."
        />
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2">
          {/* Send button (only if source is gmail) */}
          {isFromGmail && (
            <button
              onClick={() => setShowSendConfirm(true)}
              disabled={Boolean(sentTime) || isSending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium transition-colors shadow-xs cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              {isSending ? 'Sending…' : 'Send'}
            </button>
          )}

          <button
            onClick={handleOpenInGmail}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium transition-colors cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            Open in Gmail
          </button>

          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 text-xs font-medium transition-colors cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            Copy
          </button>
        </div>

        <span className="text-[11px] text-slate-400 italic">
          {isFromGmail
            ? 'Nothing is sent unless you press Send and confirm.'
            : 'Harness never sends email. You send it from Gmail.'}
        </span>
      </div>

      {sendError && (
        <div className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 pt-1">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{sendError}</span>
        </div>
      )}

      {/* Send Confirmation Dialog */}
      {showSendConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-indigo-600 dark:text-indigo-400">
              <Mail className="w-5 h-5 shrink-0" />
              <h4 className="font-semibold text-sm text-slate-900 dark:text-white">
                Confirm Sending Email
              </h4>
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-400 space-y-2 leading-relaxed bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
              <p>
                Send this reply to <strong className="text-slate-800 dark:text-slate-200">{targetEmail}</strong> from{' '}
                <strong className="text-slate-800 dark:text-slate-200">{settings.gmail.email}</strong>?
              </p>
              <p className="text-[11px] text-slate-500">
                Subject: <span className="italic">{cleanSubject}</span>
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowSendConfirm(false)}
                className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSend}
                disabled={isSending}
                className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Send className="w-3 h-3" />
                {isSending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
