import { fetchJson } from './http';
import { Settings } from '../types';

export interface SearchResult {
  brief: string;
  sources: { title: string; url: string }[];
  note?: string; // Amber note if an engine failed or was downgraded
  engineUsed: 'tavily' | 'gemini' | 'wikipedia' | 'none';
}

export function getFirstSearchEngineName(settings: Settings): { name: string; label: string } {
  if (settings.tavily.value && settings.tavily.status === 'ok') {
    return { name: 'tavily', label: 'Web search (Tavily)' };
  }
  if (settings.keys.gemini.value && settings.keys.gemini.status === 'ok') {
    return { name: 'gemini', label: 'Web search (Google via Gemini)' };
  }
  return {
    name: 'wikipedia',
    label: 'Web search (Wikipedia only — add a free Tavily key for full search)',
  };
}

// 1. Tavily Search via server
async function searchTavily(
  query: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<{ brief: string; sources: { title: string; url: string }[] }> {
  const data = await fetchJson<{
    answer?: string;
    results?: { title: string; url: string; content: string }[];
    error?: { code: string; message: string };
  }>(
    '/api/search',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: apiKey.trim(),
        query: query.slice(0, 400),
        maxResults: 5,
      }),
    },
    { timeoutMs: 30000, signal, provider: 'Tavily' }
  );

  if (data.error) {
    throw new Error(data.error.message || 'Tavily search failed');
  }

  const results = data.results || [];
  if (!data.answer && results.length === 0) {
    throw new Error('Zero results returned by Tavily');
  }

  let brief = '';
  if (data.answer) {
    brief += `${data.answer}\n\n`;
  }
  for (const r of results) {
    brief += `### ${r.title}\n${(r.content || '').slice(0, 1200)}\n\n`;
  }

  const sources = results.slice(0, 5).map((r) => ({
    title: r.title,
    url: r.url,
  }));

  return { brief: brief.trim(), sources };
}

// 2. Gemini Grounding Search
async function searchGemini(
  query: string,
  apiKey: string,
  searchModel: string,
  signal?: AbortSignal
): Promise<{ brief: string; sources: { title: string; url: string }[] }> {
  const modelToUse = (searchModel || 'gemini-2.5-flash').replace(/^models\//, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelToUse)}:generateContent`;
  const todayStr = new Date().toISOString().slice(0, 10);

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Today is ${todayStr}. Search the web and write a factual brief (max 400 words) with key facts, numbers and dates that help answer: ${query}. Mention which source each fact comes from.`,
          },
        ],
      },
    ],
    tools: [{ google_search: {} }],
  };

  const data = await fetchJson<any>(
    url,
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey.trim(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    { timeoutMs: 60000, signal, provider: 'Gemini (web search)' }
  );

  const candidate = data.candidates && data.candidates[0];
  if (!candidate) {
    throw new Error('No candidate returned by Gemini web search');
  }

  const parts = candidate.content?.parts || [];
  const brief = parts
    .filter((p: any) => !p.thought && typeof p.text === 'string')
    .map((p: any) => p.text)
    .join('');

  if (!brief.trim()) {
    throw new Error('Empty brief returned by Gemini search');
  }

  const sources: { title: string; url: string }[] = [];
  const groundingChunks = candidate.groundingMetadata?.groundingChunks || [];
  const seenTitles = new Set<string>();

  for (const chunk of groundingChunks) {
    if (chunk.web && chunk.web.uri) {
      const title = chunk.web.title || chunk.web.uri;
      if (!seenTitles.has(title) && sources.length < 8) {
        seenTitles.add(title);
        sources.push({ title, url: chunk.web.uri });
      }
    }
  }

  return { brief: brief.trim(), sources };
}

// 3. Wikipedia Search API
async function searchWikipedia(
  query: string,
  signal?: AbortSignal
): Promise<{ brief: string; sources: { title: string; url: string }[] }> {
  // Step 1: Search Wikipedia for top 3 articles
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    query
  )}&srlimit=3&format=json&origin=*`;

  const searchData = await fetchJson<any>(
    searchUrl,
    { method: 'GET' },
    { timeoutMs: 20000, signal, provider: 'Wikipedia' }
  );

  const searchList = searchData.query?.search || [];
  if (searchList.length === 0) {
    return { brief: '', sources: [] };
  }

  const titles: string[] = searchList.map((item: any) => item.title);
  const titlesParam = titles.map((t) => encodeURIComponent(t)).join('|');

  // Step 2: Fetch intros
  const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&titles=${titlesParam}&format=json&origin=*`;

  const extractData = await fetchJson<any>(
    extractUrl,
    { method: 'GET' },
    { timeoutMs: 20000, signal, provider: 'Wikipedia' }
  );

  const pages = extractData.query?.pages || {};
  let brief = '';
  const sources: { title: string; url: string }[] = [];

  for (const pageId of Object.keys(pages)) {
    const page = pages[pageId];
    if (page && page.title && page.extract) {
      const pageTitle = page.title;
      brief += `### ${pageTitle}\n${page.extract.slice(0, 1500)}\n\n`;
      sources.push({
        title: pageTitle,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle.replace(/ /g, '_'))}`,
      });
    }
  }

  return { brief: brief.trim(), sources };
}

// Main Web Search Dispatcher
export async function performWebSearch(
  query: string,
  settings: Settings,
  signal?: AbortSignal
): Promise<SearchResult> {
  const notes: string[] = [];

  const hasTavily = Boolean(settings.tavily.value && settings.tavily.status === 'ok');
  const hasGemini = Boolean(settings.keys.gemini.value && settings.keys.gemini.status === 'ok');

  // Try Engine 1: Tavily
  if (hasTavily) {
    try {
      const res = await searchTavily(query, settings.tavily.value, signal);
      return {
        brief: res.brief,
        sources: res.sources,
        engineUsed: 'tavily',
      };
    } catch (err: any) {
      const errMsg = (err.message || '').toLowerCase();
      let failReason = 'service unavailable';
      if (errMsg.includes('credit') || errMsg.includes('rate') || errMsg.includes('limit')) {
        failReason = 'monthly free credits used up';
      } else if (errMsg.includes('key') || errMsg.includes('auth')) {
        failReason = 'key rejected';
      }

      if (hasGemini) {
        notes.push(`Tavily unavailable (${failReason}); used Google via Gemini instead.`);
      } else {
        notes.push(`Tavily unavailable (${failReason}); used Wikipedia instead.`);
      }
    }
  }

  // Try Engine 2: Gemini Search Grounding
  if (hasGemini) {
    try {
      const res = await searchGemini(
        query,
        settings.keys.gemini.value,
        settings.searchModel,
        signal
      );
      return {
        brief: res.brief,
        sources: res.sources,
        note: notes.length > 0 ? notes.join(' ') : undefined,
        engineUsed: 'gemini',
      };
    } catch (err: any) {
      const errMsg = (err.message || '').toLowerCase();
      if (
        errMsg.includes('google_search') ||
        errMsg.includes('grounding') ||
        errMsg.includes('tool') ||
        errMsg.includes('not supported')
      ) {
        notes.push(
          "This Gemini model can't search on the free tier — set Web search model to gemini-2.5-flash in Settings."
        );
      } else {
        notes.push('Google search via Gemini unavailable; used Wikipedia instead.');
      }
    }
  }

  // Try Engine 3: Wikipedia
  try {
    const res = await searchWikipedia(query, signal);
    if (!res.brief) {
      return {
        brief: '',
        sources: [],
        note: 'Web search found nothing.',
        engineUsed: 'none',
      };
    }
    return {
      brief: res.brief,
      sources: res.sources,
      note: notes.length > 0 ? notes.join(' ') : undefined,
      engineUsed: 'wikipedia',
    };
  } catch (err: any) {
    notes.push('Web search failed; answered without it.');
    return {
      brief: '',
      sources: [],
      note: notes.join(' '),
      engineUsed: 'none',
    };
  }
}
