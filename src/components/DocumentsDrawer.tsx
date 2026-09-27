import React, { useRef } from 'react';
import { X, Upload, FileText, Trash2, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { UploadedDoc } from '../types';

interface DocumentsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  docs: UploadedDoc[];
  onUploadFiles: (files: FileList | File[]) => void;
  onToggleInclude: (id: string) => void;
  onDeleteDoc: (id: string) => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const DocumentsDrawer: React.FC<DocumentsDrawerProps> = ({
  isOpen,
  onClose,
  docs,
  onUploadFiles,
  onToggleInclude,
  onDeleteDoc,
  onToast,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      if (docs.length + e.target.files.length > 10) {
        onToast('Max 10 documents per chat', 'error');
      }
      onUploadFiles(e.target.files);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (docs.length + e.dataTransfer.files.length > 10) {
        onToast('Max 10 documents per chat', 'error');
      }
      onUploadFiles(e.dataTransfer.files);
    }
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
          <div>
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white">
              Documents
            </h3>
            <p className="text-xs text-slate-500">
              {docs.length} of 10 documents attached
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-400 rounded-2xl p-6 text-center cursor-pointer transition-colors bg-slate-50/50 dark:bg-slate-850/50 group"
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.md,.csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
              <Upload className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Click to browse or drop files here
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              PDF, DOCX, TXT, MD, CSV (max 25 MB)
            </p>
          </div>

          {/* Document List */}
          <div className="space-y-2">
            {docs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 shadow-xs"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-slate-500" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                      {doc.name}
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                      {doc.status === 'reading' ? (
                        <span className="flex items-center gap-1 text-indigo-500">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Reading…
                        </span>
                      ) : doc.status === 'error' ? (
                        <span className="text-rose-500 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {doc.error || 'Failed to read'}
                        </span>
                      ) : (
                        <span>
                          {doc.pages ? `${doc.pages} pages · ` : ''}
                          {doc.words.toLocaleString()} words
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right controls */}
                <div className="flex items-center gap-2">
                  {doc.status === 'ready' && (
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={doc.include}
                        onChange={() => onToggleInclude(doc.id)}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-600"></div>
                    </label>
                  )}

                  <button
                    onClick={() => onDeleteDoc(doc.id)}
                    className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                    aria-label={`Delete ${doc.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {docs.length === 0 && (
              <p className="text-center text-xs text-slate-400 py-6">
                No documents uploaded yet.
              </p>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
