import { EmailItem } from '../types';
import { SearchResult } from './search';

export interface BuildContextArgs {
  systemPrompt: string;
  searchResult?: SearchResult;
  docContext?: string;
  emails?: EmailItem[];
}

export function buildSystemPrompt(args: BuildContextArgs): string {
  const parts: string[] = [];

  // 1. The chat's system prompt
  if (args.systemPrompt.trim()) {
    parts.push(args.systemPrompt.trim());
  }

  // 2. Today's date
  const todayStr = new Date().toISOString().slice(0, 10);
  parts.push(`Today's date is ${todayStr}.`);

  // 3. If web search ran
  if (args.searchResult && args.searchResult.brief.trim()) {
    let searchBlock = `## Web search results\n${args.searchResult.brief.trim()}`;
    if (args.searchResult.sources && args.searchResult.sources.length > 0) {
      searchBlock += '\n\nSources:';
      args.searchResult.sources.forEach((s, idx) => {
        searchBlock += `\n[${idx + 1}] ${s.title} — ${s.url}`;
      });
    }

    if (args.searchResult.engineUsed === 'wikipedia') {
      searchBlock += '\n\nThese are Wikipedia summaries and may not cover very recent news.';
    }

    searchBlock += '\n\nUse these results for current facts. Cite sources as [1], [2].';
    parts.push(searchBlock);
  }

  // 4. If documents are included
  if (args.docContext && args.docContext.trim()) {
    parts.push(
      `## Documents\nAnswer from these documents when relevant and cite like [name p.N].\n\n${args.docContext.trim()}`
    );
  }

  // 5. If emails are attached
  if (args.emails && args.emails.length > 0) {
    let emailBlock = '## Emails';
    args.emails.forEach((em, idx) => {
      emailBlock += `\n\n--- Email ${idx + 1} ---\nFrom: ${em.from}\nSubject: ${em.subject}\nDate: ${em.date}\n${em.body}`;
    });
    parts.push(emailBlock);
  }

  return parts.join('\n\n');
}
