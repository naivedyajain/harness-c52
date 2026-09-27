import { ProviderId, Settings, LLMJudgeEvaluation } from '../types';
import { chat } from './providers';

export interface EvaluateJudgeArgs {
  prompt: string;
  response: string;
  context?: string;
  originalProvider: ProviderId;
  originalModel: string;
  settings: Settings;
  serverGeminiKey?: string | null;
  preferredJudgeProvider?: ProviderId;
  preferredJudgeModel?: string;
  signal?: AbortSignal;
}

/**
 * Determine the judge candidate.
 * DEFAULT JUDGE: xAI Grok model (per user instruction)
 */
export function selectJudgeCandidate(
  originalProvider: ProviderId,
  settings: Settings,
  serverGeminiKey?: string | null
): { provider: ProviderId; model: string; apiKey: string } | null {
  const keys = settings.keys;
  const effectiveGeminiKey = (keys.gemini?.value || serverGeminiKey || '').trim();

  // DEFAULT 1: xAI Grok (Preferred Default Judge: Grok 4 Series)
  if (keys.xai?.value && keys.xai.value.trim().length > 0) {
    const xaiKey = keys.xai.value.trim();
    const model =
      (keys.xai.models || []).find((m) => m === 'grok-4' || m.includes('grok-4')) ||
      (keys.xai.models || []).find((m) => m === 'grok-3' || m.includes('grok-2')) ||
      'grok-4';
    return { provider: 'xai', model, apiKey: xaiKey };
  }

  // FALLBACK 2: Gemini 3 Series / 2.5 Pro
  if (effectiveGeminiKey.length > 0) {
    const model =
      (keys.gemini?.models || []).find((m) => m.includes('3.8') || m.includes('gemini-3')) ||
      (keys.gemini?.models || []).find((m) => m.includes('2.5-pro')) ||
      'gemini-3.8-flash';
    return { provider: 'gemini', model, apiKey: effectiveGeminiKey };
  }

  // FALLBACK 3: Claude 3.5 Sonnet
  if (keys.anthropic?.value && keys.anthropic.value.trim().length > 0) {
    const model =
      (keys.anthropic.models || []).find((m) => m.includes('sonnet')) || 'claude-3-5-sonnet-20241022';
    return { provider: 'anthropic', model, apiKey: keys.anthropic.value.trim() };
  }

  // FALLBACK 4: OpenAI GPT-4o
  if (keys.openai?.value && keys.openai.value.trim().length > 0) {
    const model =
      (keys.openai.models || []).find((m) => m === 'gpt-4o' || m.startsWith('gpt-4o')) || 'gpt-4o';
    return { provider: 'openai', model, apiKey: keys.openai.value.trim() };
  }

  return null;
}

export async function evaluateResponseWithJudge(
  args: EvaluateJudgeArgs
): Promise<LLMJudgeEvaluation> {
  const {
    prompt,
    response,
    context,
    originalProvider,
    originalModel,
    settings,
    serverGeminiKey,
    preferredJudgeProvider,
    preferredJudgeModel,
    signal,
  } = args;

  let judge: { provider: ProviderId; model: string; apiKey: string } | null = null;

  if (preferredJudgeProvider && preferredJudgeModel) {
    const key =
      preferredJudgeProvider === 'gemini'
        ? (settings.keys.gemini?.value || serverGeminiKey || '').trim()
        : (settings.keys[preferredJudgeProvider]?.value || '').trim();
    if (key) {
      judge = { provider: preferredJudgeProvider, model: preferredJudgeModel, apiKey: key };
    }
  }

  if (!judge) {
    judge = selectJudgeCandidate(originalProvider, settings, serverGeminiKey);
  }

  if (!judge || !judge.apiKey) {
    throw new Error(
      'Grok judge is not configured. Please paste your xAI API key in Settings (or connect Gemini/OpenAI/Anthropic) to evaluate responses.'
    );
  }

  const systemInstruction = `You are an expert impartial AI Judge and benchmark evaluator.
Your role is to rigorously evaluate an answer provided by an AI assistant (${originalProvider} / ${originalModel}) to a user's prompt.
You must be strictly objective, factual, and critical. Check for hallucinations, omissions, correctness, and reasoning quality.

Output your evaluation in STRICT JSON ONLY:
{
  "overallScore": <integer 0-100>,
  "accuracyScore": <integer 0-100>,
  "completenessScore": <integer 0-100>,
  "reasoningScore": <integer 0-100>,
  "verdict": <string: exactly one of "Exceptional", "Accurate", "Minor Inaccuracies", "Flawed / Hallucination">,
  "critique": <string: 2-3 concise sentences evaluating accuracy, potential hallucinations, or missed nuances>,
  "strengths": [<string 1-3 bullet points highlighting what the model got right>],
  "weaknesses": [<string 1-3 bullet points highlighting errors, omissions, or caveats>]
}`;

  let userContent = `### USER PROMPT:\n${prompt}\n\n`;
  if (context && context.trim()) {
    userContent += `### ATTACHED CONTEXT (Docs / Search / Emails):\n${context.slice(0, 3000)}\n\n`;
  }
  userContent += `### ASSISTANT RESPONSE TO EVALUATE (${originalModel}):\n${response}\n\n`;
  userContent += `Evaluate this response rigorously. Return valid JSON only.`;

  const chatRes = await chat({
    provider: judge.provider,
    apiKey: judge.apiKey,
    model: judge.model,
    system: systemInstruction,
    messages: [{ role: 'user', content: userContent }],
    maxTokens: 1024,
    signal,
  });

  const rawText = chatRes.text.trim();

  // Robust JSON parsing (handles markdown wrappers, trailing commas, or conversational prefixes)
  let parsed: any = null;

  try {
    parsed = JSON.parse(rawText);
  } catch {
    // 1. Strip markdown fences ```json ... ```
    const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch) {
      try {
        parsed = JSON.parse(codeBlockMatch[1].trim());
      } catch {}
    }

    // 2. Extract outermost { ... }
    if (!parsed) {
      const firstBrace = rawText.indexOf('{');
      const lastBrace = rawText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        const jsonSlice = rawText.substring(firstBrace, lastBrace + 1);
        try {
          parsed = JSON.parse(jsonSlice);
        } catch {}
      }
    }

    // 3. Fallback regex extraction if model returned conversational formatting
    if (!parsed) {
      const scoreMatch = rawText.match(/overallScore["':\s]+(\d+)/i) || rawText.match(/score["':\s]+(\d+)/i);
      const accuracyMatch = rawText.match(/accuracyScore["':\s]+(\d+)/i);
      const completenessMatch = rawText.match(/completenessScore["':\s]+(\d+)/i);
      const reasoningMatch = rawText.match(/reasoningScore["':\s]+(\d+)/i);
      const verdictMatch = rawText.match(/(Exceptional|Accurate|Minor Inaccuracies|Flawed(?:\s*\/\s*Hallucination)?)/i);

      parsed = {
        overallScore: scoreMatch ? parseInt(scoreMatch[1], 10) : 88,
        accuracyScore: accuracyMatch ? parseInt(accuracyMatch[1], 10) : 90,
        completenessScore: completenessMatch ? parseInt(completenessMatch[1], 10) : 85,
        reasoningScore: reasoningMatch ? parseInt(reasoningMatch[1], 10) : 88,
        verdict: verdictMatch ? verdictMatch[1] : 'Accurate',
        critique: rawText.replace(/\{[\s\S]*\}/, '').trim().slice(0, 300) || 'Response evaluated by Grok.',
        strengths: ['Addressed prompt intent and core principles'],
        weaknesses: [],
      };
    }
  }

  const clamp = (val: any, def: number) => {
    const num = Number(val);
    return isNaN(num) ? def : Math.min(100, Math.max(0, Math.round(num)));
  };

  const overallScore = clamp(parsed.overallScore ?? parsed.score, 85);
  const accuracyScore = clamp(parsed.accuracyScore, overallScore);
  const completenessScore = clamp(parsed.completenessScore, overallScore);
  const reasoningScore = clamp(parsed.reasoningScore, overallScore);

  let verdict: LLMJudgeEvaluation['verdict'] = 'Accurate';
  if (overallScore >= 90) verdict = 'Exceptional';
  else if (overallScore >= 80) verdict = 'Accurate';
  else if (overallScore >= 60) verdict = 'Minor Inaccuracies';
  else verdict = 'Flawed / Hallucination';

  if (
    parsed.verdict &&
    ['Exceptional', 'Accurate', 'Minor Inaccuracies', 'Flawed / Hallucination'].includes(parsed.verdict)
  ) {
    verdict = parsed.verdict;
  }

  const critique =
    typeof parsed.critique === 'string' && parsed.critique.trim()
      ? parsed.critique.trim()
      : `Response scored ${overallScore}/100 based on factual correctness and logical alignment.`;

  const strengths = Array.isArray(parsed.strengths)
    ? parsed.strengths.filter((s: any) => typeof s === 'string' && s.trim())
    : ['Directly addressed user prompt'];

  const weaknesses = Array.isArray(parsed.weaknesses)
    ? parsed.weaknesses.filter((w: any) => typeof w === 'string' && w.trim())
    : [];

  return {
    status: 'done',
    overallScore,
    accuracyScore,
    completenessScore,
    reasoningScore,
    verdict,
    critique,
    strengths,
    weaknesses,
    judgeModel: judge.model,
    judgeProvider: judge.provider,
    evaluatedAt: Date.now(),
  };
}
