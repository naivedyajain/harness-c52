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
 * Determine the best available judge model from a DIFFERENT provider
 */
export function selectJudgeCandidate(
  originalProvider: ProviderId,
  settings: Settings,
  serverGeminiKey?: string | null
): { provider: ProviderId; model: string; apiKey: string } | null {
  const keys = settings.keys;
  const hasServerGemini = Boolean(serverGeminiKey && serverGeminiKey.trim());
  const effectiveGeminiKey = keys.gemini?.value || serverGeminiKey || '';

  // Priority 1: Claude 3.5 Sonnet (renowned for calibration and reasoning)
  if (originalProvider !== 'anthropic' && keys.anthropic?.value && keys.anthropic.status === 'ok') {
    const model = (keys.anthropic.models || []).find((m) => m.includes('sonnet')) || 'claude-3-5-sonnet-20241022';
    return { provider: 'anthropic', model, apiKey: keys.anthropic.value };
  }

  // Priority 2: Gemini 2.5 Pro / Flash
  if (originalProvider !== 'gemini' && (effectiveGeminiKey || keys.gemini?.status === 'ok')) {
    const model = (keys.gemini?.models || []).find((m) => m.includes('2.5-pro')) || 'gemini-2.5-pro';
    return { provider: 'gemini', model, apiKey: effectiveGeminiKey };
  }

  // Priority 3: OpenAI GPT-4o
  if (originalProvider !== 'openai' && keys.openai?.value && keys.openai.status === 'ok') {
    const model = (keys.openai.models || []).find((m) => m === 'gpt-4o' || m.startsWith('gpt-4o')) || 'gpt-4o';
    return { provider: 'openai', model, apiKey: keys.openai.value };
  }

  // Priority 4: xAI Grok-2 / Grok-3
  if (originalProvider !== 'xai' && keys.xai?.value && keys.xai.status === 'ok') {
    const model = (keys.xai.models || []).find((m) => m.includes('grok-2') || m.includes('grok-3')) || 'grok-2';
    return { provider: 'xai', model, apiKey: keys.xai.value };
  }

  // Fallback: If only 1 provider is available, use a different high-tier model from that same provider
  if (originalProvider === 'openai' && keys.openai?.value) {
    return { provider: 'openai', model: 'gpt-4o', apiKey: keys.openai.value };
  }
  if (originalProvider === 'gemini' && effectiveGeminiKey) {
    return { provider: 'gemini', model: 'gemini-2.5-pro', apiKey: effectiveGeminiKey };
  }
  if (originalProvider === 'anthropic' && keys.anthropic?.value) {
    return { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', apiKey: keys.anthropic.value };
  }
  if (originalProvider === 'xai' && keys.xai?.value) {
    return { provider: 'xai', model: 'grok-2', apiKey: keys.xai.value };
  }

  // Server Gemini fallback if anything else fails
  if (effectiveGeminiKey) {
    return { provider: 'gemini', model: 'gemini-2.5-pro', apiKey: effectiveGeminiKey };
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
        ? settings.keys.gemini?.value || serverGeminiKey || ''
        : settings.keys[preferredJudgeProvider]?.value || '';
    if (key) {
      judge = { provider: preferredJudgeProvider, model: preferredJudgeModel, apiKey: key };
    }
  }

  if (!judge) {
    judge = selectJudgeCandidate(originalProvider, settings, serverGeminiKey);
  }

  if (!judge || !judge.apiKey) {
    throw new Error('No judge model configured. Add an API key for another provider to evaluate responses.');
  }

  const systemInstruction = `You are an expert impartial AI Judge and benchmark evaluator.
Your role is to rigorously evaluate an answer provided by an AI assistant (${originalProvider} / ${originalModel}) to a user's prompt.
You must be strictly objective, factual, and critical. Check for hallucinations, omissions, correctness, and reasoning quality.

Output your evaluation in STRICT JSON ONLY. Do not include markdown code block backticks if possible, or wrap cleanly in \`\`\`json.
JSON schema to strictly follow:
{
  "overallScore": <integer 0-100>,
  "accuracyScore": <integer 0-100>,
  "completenessScore": <integer 0-100>,
  "reasoningScore": <integer 0-100>,
  "verdict": <string: exactly one of "Exceptional" (90-100), "Accurate" (80-89), "Minor Inaccuracies" (60-79), "Flawed / Hallucination" (0-59)>,
  "critique": <string: 2-3 concise sentences evaluating accuracy, potential hallucinations, or missed nuances>,
  "strengths": [<string 1-3 bullet points highlighting what the model got right>],
  "weaknesses": [<string 1-3 bullet points highlighting errors, omissions, or caveats>]
}`;

  let userContent = `### USER PROMPT:\n${prompt}\n\n`;
  if (context && context.trim()) {
    userContent += `### ATTACHED CONTEXT (Docs / Search / Emails):\n${context.slice(0, 4000)}\n\n`;
  }
  userContent += `### ASSISTANT RESPONSE TO EVALUATE (${originalModel}):\n${response}\n\n`;
  userContent += `Evaluate this response rigorously according to factual accuracy, completeness, and reasoning. Return the JSON evaluation now.`;

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

  // Parse JSON from raw output
  let parsed: any = null;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    // Attempt extracting json block
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[1]);
      } catch {}
    }

    if (!parsed) {
      const braceMatch = rawText.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        try {
          parsed = JSON.parse(braceMatch[0]);
        } catch {}
      }
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Judge returned an unparseable response format.');
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
    : ['Directly addresses user intent'];

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
