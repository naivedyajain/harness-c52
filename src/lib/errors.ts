export type AppErrorKind =
  | 'network'
  | 'timeout'
  | 'cancelled'
  | 'http'
  | 'bad_response'
  | 'blocked'
  | 'other';

export class AppError extends Error {
  kind: AppErrorKind;
  status?: number;
  rawMessage?: string;

  constructor(kind: AppErrorKind, message?: string, status?: number, rawMessage?: string) {
    super(message || kind);
    this.name = 'AppError';
    this.kind = kind;
    this.status = status;
    this.rawMessage = rawMessage || message;
  }
}

export interface FriendlyError {
  title: string;
  detail: string;
  canRetry: boolean;
  raw?: string;
  isCancelled?: boolean;
}

export function friendly(err: unknown, providerName: string = 'Provider'): FriendlyError {
  if (err instanceof AppError && err.kind === 'cancelled') {
    return {
      title: 'Stopped',
      detail: '',
      canRetry: false,
      isCancelled: true,
    };
  }

  let title = `Unexpected response from ${providerName}`;
  let detail = 'Something went wrong while connecting to the model.';
  let canRetry = true;
  let raw = '';

  if (err instanceof AppError) {
    raw = err.rawMessage ? err.rawMessage.slice(0, 300) : '';

    if (err.kind === 'timeout') {
      title = `${providerName} took too long`;
      detail = 'No answer in 2 minutes. Retry, or try a smaller question.';
      canRetry = true;
    } else if (err.kind === 'network') {
      if (providerName.toLowerCase().includes('xai')) {
        title = 'Could not reach xAI from the browser';
        detail = 'Check your internet. If it works, xAI may be blocking browser calls — use another provider for now.';
      } else {
        title = `Could not reach ${providerName}`;
        detail = `Check your internet. If it works, this provider may block calls from browsers — try another provider.`;
      }
      canRetry = true;
    } else if (err.kind === 'blocked') {
      title = `${providerName} blocked this request`;
      detail = err.message || 'Safety block was triggered.';
      canRetry = false;
    } else if (err.kind === 'http') {
      const status = err.status || 0;
      const lowerRaw = (err.rawMessage || '').toLowerCase();

      if (status === 400) {
        title = `${providerName} could not process the request`;
        detail = err.rawMessage || 'Invalid request parameters.';
        if (lowerRaw.includes('model') || lowerRaw.includes('engine')) {
          detail += ' Try another model.';
        }
        canRetry = true;
      } else if (status === 401 || status === 403) {
        title = `${providerName} rejected the key`;
        detail = 'Check the key in Settings. It may be wrong, expired, or missing permissions.';
        canRetry = false;
      } else if (status === 402) {
        title = `${providerName}: no credit left`;
        detail = `Add billing or credit in your ${providerName} account.`;
        canRetry = false;
      } else if (status === 404) {
        title = 'Model not found';
        detail = "This model isn't available to your key. Pick another model.";
        canRetry = false;
      } else if (status === 413) {
        title = 'Too much text';
        detail = 'Remove a document or start a new chat.';
        canRetry = false;
      } else if (status === 429) {
        title = `${providerName} rate limit or quota reached`;
        detail = 'Wait a minute and retry, or switch model/provider.';
        canRetry = true;
      } else if (status >= 500 && status <= 599) {
        title = `${providerName} is having problems`;
        detail = 'Their server returned an error. Retry in a moment.';
        canRetry = true;
      } else {
        title = `Unexpected response from ${providerName} (${status})`;
        detail = (err.rawMessage || err.message).slice(0, 200);
        canRetry = true;
      }
    } else if (err.kind === 'bad_response') {
      title = `Unexpected response from ${providerName}`;
      detail = (err.rawMessage || err.message).slice(0, 200);
      canRetry = true;
    }
  } else if (err instanceof Error) {
    raw = err.message.slice(0, 300);
    title = `Unexpected error from ${providerName}`;
    detail = err.message.slice(0, 200);
    canRetry = true;
  }

  return { title, detail, canRetry, raw: raw || undefined };
}
