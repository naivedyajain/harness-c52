import { AppError } from './errors';

export interface FetchOptions {
  timeoutMs?: number;
  provider?: string;
  signal?: AbortSignal;
}

export async function fetchJson<T = any>(
  url: string,
  init?: RequestInit,
  options?: FetchOptions
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? 120000;
  const controller = new AbortController();

  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort('timeout');
  }, timeoutMs);

  // If an external signal was passed, propagate its abort
  const externalSignal = options?.signal;
  let onExternalAbort: (() => void) | undefined;
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeoutId);
      throw new AppError('cancelled', 'Request cancelled');
    }
    onExternalAbort = () => {
      controller.abort('user_cancelled');
    };
    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    const isDirectProxyNeeded =
      url.includes('api.x.ai') ||
      url.includes('api.openai.com') ||
      url.includes('api.anthropic.com');
    let response: Response;

    if (isDirectProxyNeeded) {
      let bodyPayload: any = undefined;
      if (init?.body) {
        try {
          bodyPayload = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
        } catch {
          bodyPayload = init.body;
        }
      }

      const headersRecord: Record<string, string> = {};
      if (init?.headers) {
        if (typeof (init.headers as any).forEach === 'function') {
          (init.headers as any).forEach((value: string, key: string) => {
            headersRecord[key] = value;
          });
        } else if (Array.isArray(init.headers)) {
          for (const [k, v] of init.headers) {
            headersRecord[k] = v;
          }
        } else if (typeof init.headers === 'object') {
          Object.assign(headersRecord, init.headers);
        }
      }

      response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          method: init?.method || 'GET',
          headers: headersRecord,
          body: bodyPayload,
        }),
        signal: controller.signal,
      });
    } else {
      try {
        response = await fetch(url, {
          ...init,
          signal: controller.signal,
        });
      } catch (fetchErr: any) {
        // If browser CORS error on other endpoints, fallback to /api/proxy
        const isCORSBlockable =
          url.includes('api.openai.com') ||
          url.includes('api.anthropic.com') ||
          url.includes('api.x.ai');

        if (
          isCORSBlockable &&
          (fetchErr instanceof TypeError ||
            fetchErr?.name === 'TypeError' ||
            (fetchErr?.message && fetchErr.message.toLowerCase().includes('failed to fetch')))
        ) {
          try {
            let bodyPayload: any = undefined;
            if (init?.body) {
              try {
                bodyPayload = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
              } catch {
                bodyPayload = init.body;
              }
            }

            const headersRecord: Record<string, string> = {};
            if (init?.headers) {
              if (typeof (init.headers as any).forEach === 'function') {
                (init.headers as any).forEach((value: string, key: string) => {
                  headersRecord[key] = value;
                });
              } else if (Array.isArray(init.headers)) {
                for (const [k, v] of init.headers) {
                  headersRecord[k] = v;
                }
              } else if (typeof init.headers === 'object') {
                Object.assign(headersRecord, init.headers);
              }
            }

            response = await fetch('/api/proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                url,
                method: init?.method || 'GET',
                headers: headersRecord,
                body: bodyPayload,
              }),
              signal: controller.signal,
            });
          } catch {
            throw fetchErr;
          }
        } else {
          throw fetchErr;
        }
      }
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      let bodyText = '';
      try {
        bodyText = await response.text();
      } catch {
        bodyText = '';
      }

      let providerMsg = '';
      if (bodyText) {
        try {
          const parsed = JSON.parse(bodyText);
          if (parsed.error) {
            if (typeof parsed.error === 'string') {
              providerMsg = parsed.error;
            } else if (typeof parsed.error === 'object') {
              providerMsg =
                parsed.error.message ||
                parsed.error.status ||
                JSON.stringify(parsed.error);
            }
          } else if (parsed.message) {
            providerMsg = parsed.message;
          }
        } catch {
          providerMsg = bodyText;
        }
      }

      if (!providerMsg) {
        providerMsg = response.statusText || `HTTP ${response.status}`;
      }

      throw new AppError('http', providerMsg, response.status, providerMsg);
    }

    // 2xx response: parse JSON
    const text = await response.text();
    if (!text.trim()) {
      return {} as T;
    }
    try {
      return JSON.parse(text) as T;
    } catch (parseErr) {
      throw new AppError(
        'bad_response',
        'Invalid JSON response from server',
        response.status,
        text.slice(0, 300)
      );
    }
  } catch (err: any) {
    clearTimeout(timeoutId);

    if (err instanceof AppError) {
      throw err;
    }

    if (timedOut || controller.signal.aborted) {
      if (externalSignal?.aborted || controller.signal.reason === 'user_cancelled') {
        throw new AppError('cancelled', 'Request was stopped.');
      }
      throw new AppError('timeout', `Request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }

    if (err && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
      if (externalSignal?.aborted) {
        throw new AppError('cancelled', 'Request was stopped.');
      }
      throw new AppError('timeout', 'Request timed out');
    }

    if (err instanceof TypeError) {
      throw new AppError('network', err.message || 'Network error / CORS blocked');
    }

    throw new AppError('other', err?.message || 'Unknown network error');
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal && onExternalAbort) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}
