import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import { UploadedDoc } from '../types';

// Configure pdfjs worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const STOPWORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
  'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
  'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
  'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
  'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
  'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take',
  'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other',
  'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also',
  'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way',
  'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us',
]);

// Helper to chunk text (~1,500 chars with ~200 chars overlap)
export function chunkText(
  fullText: string,
  isPdf: boolean
): { id: string; text: string; page?: number }[] {
  const chunks: { id: string; text: string; page?: number }[] = [];
  const chunkSize = 1500;
  const overlap = 200;

  if (fullText.length <= chunkSize) {
    let page: number | undefined;
    if (isPdf) {
      const match = fullText.match(/\[Page\s+(\d+)\]/);
      if (match) page = parseInt(match[1], 10);
    }
    chunks.push({ id: 'c-0', text: fullText.trim(), page });
    return chunks;
  }

  let startIndex = 0;
  let chunkIdx = 0;

  while (startIndex < fullText.length) {
    let endIndex = startIndex + chunkSize;
    if (endIndex >= fullText.length) {
      endIndex = fullText.length;
    } else {
      // Find nearest paragraph or sentence end
      const windowStr = fullText.slice(Math.max(startIndex + 1000, startIndex), Math.min(endIndex + 300, fullText.length));
      const doubleNewline = windowStr.lastIndexOf('\n\n');
      const singleNewline = windowStr.lastIndexOf('\n');
      const period = windowStr.lastIndexOf('. ');

      let breakOffset = -1;
      if (doubleNewline !== -1) {
        breakOffset = doubleNewline + 2;
      } else if (period !== -1) {
        breakOffset = period + 2;
      } else if (singleNewline !== -1) {
        breakOffset = singleNewline + 1;
      }

      if (breakOffset !== -1) {
        const potentialEnd = Math.max(startIndex + 1000, startIndex) + breakOffset;
        if (potentialEnd > startIndex + 800 && potentialEnd <= endIndex + 300) {
          endIndex = potentialEnd;
        }
      }
    }

    const chunkContent = fullText.slice(startIndex, endIndex).trim();
    if (chunkContent) {
      let page: number | undefined;
      if (isPdf) {
        // Find latest [Page N] marker in the text up to this chunk
        const preSlice = fullText.slice(0, endIndex);
        const matches = [...preSlice.matchAll(/\[Page\s+(\d+)\]/g)];
        if (matches.length > 0) {
          page = parseInt(matches[matches.length - 1][1], 10);
        }
      }

      chunks.push({
        id: `c-${chunkIdx++}`,
        text: chunkContent,
        page,
      });
    }

    if (endIndex >= fullText.length) break;
    startIndex = Math.max(startIndex + 1, endIndex - overlap);
  }

  return chunks;
}

export async function parseDocument(file: File): Promise<Omit<UploadedDoc, 'id' | 'include'>> {
  const fileName = file.name;
  const lowerName = fileName.toLowerCase();

  if (file.size > 25 * 1024 * 1024) {
    return {
      name: fileName,
      status: 'error',
      error: 'Too large (max 25 MB)',
      text: '',
      words: 0,
      chunks: [],
    };
  }

  if (lowerName.endsWith('.doc')) {
    return {
      name: fileName,
      status: 'error',
      error: "Old .doc format isn't supported — save as .docx or PDF.",
      text: '',
      words: 0,
      chunks: [],
    };
  }

  const validExts = ['.pdf', '.docx', '.txt', '.md', '.csv'];
  if (!validExts.some((ext) => lowerName.endsWith(ext))) {
    return {
      name: fileName,
      status: 'error',
      error: 'Unsupported file type.',
      text: '',
      words: 0,
      chunks: [],
    };
  }

  try {
    let extractedText = '';
    let pagesCount: number | undefined = undefined;

    if (lowerName.endsWith('.pdf')) {
      const arrayBuffer = await file.arrayBuffer();
      let pdf: any;
      try {
        pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      } catch (pdfErr: any) {
        if (pdfErr && (pdfErr.name === 'PasswordException' || String(pdfErr).includes('Password'))) {
          return {
            name: fileName,
            status: 'error',
            error: 'This PDF is password-protected.',
            text: '',
            words: 0,
            chunks: [],
          };
        }
        throw pdfErr;
      }

      pagesCount = pdf.numPages;
      const textParts: string[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str || '')
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        textParts.push(`[Page ${i}] ${pageText}`);
      }

      extractedText = textParts.join('\n\n');

      // Check for scanned PDF
      const totalChars = extractedText.replace(/\[Page \d+\]/g, '').trim().length;
      if (pagesCount && pagesCount > 0 && totalChars / pagesCount < 20) {
        return {
          name: fileName,
          status: 'error',
          error: 'No text found — this looks like a scanned PDF.',
          text: '',
          pages: pagesCount,
          words: 0,
          chunks: [],
        };
      }
    } else if (lowerName.endsWith('.docx')) {
      const arrayBuffer = await file.arrayBuffer();
      const res = await mammoth.extractRawText({ arrayBuffer });
      extractedText = res.value || '';
    } else {
      // txt, md, csv
      extractedText = await file.text();
    }

    extractedText = extractedText.trim();
    const words = extractedText ? extractedText.split(/\s+/).filter(Boolean).length : 0;
    const isPdf = lowerName.endsWith('.pdf');
    const chunks = chunkText(extractedText, isPdf);

    return {
      name: fileName,
      status: 'ready',
      text: extractedText,
      pages: pagesCount,
      words,
      chunks,
    };
  } catch (err: any) {
    return {
      name: fileName,
      status: 'error',
      error: "Couldn't read this file.",
      text: '',
      words: 0,
      chunks: [],
    };
  }
}

// Keyword retrieval across included documents
export function retrieveRelevantDocContext(
  docs: UploadedDoc[],
  query: string
): { formattedContext: string; usedDocNames: string[] } {
  const readyIncluded = docs.filter((d) => d.status === 'ready' && d.include && d.text);
  if (readyIncluded.length === 0) {
    return { formattedContext: '', usedDocNames: [] };
  }

  const totalChars = readyIncluded.reduce((acc, d) => acc + d.text.length, 0);

  // If <= 200,000 chars, send full text
  if (totalChars <= 200000) {
    const parts = readyIncluded.map((d) => {
      return `--- ${d.name} ---\n${d.text}`;
    });
    return {
      formattedContext: parts.join('\n\n'),
      usedDocNames: readyIncluded.map((d) => d.name),
    };
  }

  // Large docs: Keyword retrieval
  // Query words: lowercase, split non-letters/digits, drop words < 3 chars and stopwords
  const queryWords = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));

  const allChunks: {
    docName: string;
    chunkId: string;
    text: string;
    page?: number;
    docIndex: number;
    chunkIndex: number;
  }[] = [];

  readyIncluded.forEach((doc, dIdx) => {
    doc.chunks.forEach((c, cIdx) => {
      allChunks.push({
        docName: doc.name,
        chunkId: c.id,
        text: c.text,
        page: c.page,
        docIndex: dIdx,
        chunkIndex: cIdx,
      });
    });
  });

  const N = allChunks.length;
  // Compute Document Frequency (DF) for each query word
  const dfMap: Record<string, number> = {};
  for (const word of queryWords) {
    let count = 0;
    for (const chunk of allChunks) {
      if (chunk.text.toLowerCase().includes(word)) {
        count++;
      }
    }
    dfMap[word] = count;
  }

  // Score each chunk
  const scoredChunks = allChunks.map((chunk, index) => {
    const chunkLower = chunk.text.toLowerCase();
    let score = 0;
    for (const word of queryWords) {
      const df = dfMap[word] || 0;
      if (df > 0) {
        // Term frequency: count of occurrences
        const matches = chunkLower.split(word).length - 1;
        if (matches > 0) {
          const idf = Math.log(1 + N / df);
          score += matches * idf;
        }
      }
    }
    return { ...chunk, score, originalIndex: index };
  });

  scoredChunks.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.originalIndex - b.originalIndex;
  });

  const maxScore = scoredChunks.length > 0 ? scoredChunks[0].score : 0;
  let selectedChunks: typeof allChunks = [];

  if (maxScore === 0) {
    // Fall back to first 3 chunks of each included doc
    readyIncluded.forEach((doc) => {
      const top3 = doc.chunks.slice(0, 3);
      top3.forEach((c, cIdx) => {
        selectedChunks.push({
          docName: doc.name,
          chunkId: c.id,
          text: c.text,
          page: c.page,
          docIndex: 0,
          chunkIndex: cIdx,
        });
      });
    });
  } else {
    // Top 10 chunks by score
    selectedChunks = scoredChunks.slice(0, 10);
  }

  // Keep total <= 200,000 chars
  let currentChars = 0;
  const finalChunks: typeof allChunks = [];
  const usedDocs = new Set<string>();

  for (const chunk of selectedChunks) {
    if (currentChars + chunk.text.length > 200000) break;
    finalChunks.push(chunk);
    currentChars += chunk.text.length;
    usedDocs.add(chunk.docName);
  }

  const formattedParts = finalChunks.map((c) => {
    const pageLabel = c.page ? ` (page ${c.page})` : '';
    return `--- ${c.docName}${pageLabel} ---\n${c.text}`;
  });

  return {
    formattedContext: formattedParts.join('\n\n'),
    usedDocNames: Array.from(usedDocs),
  };
}
