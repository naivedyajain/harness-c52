import { ProviderId, Settings, AICouncilSession, CouncilMember, CouncilRound } from '../types';
import { chat } from './providers';

export interface CouncilSessionArgs {
  prompt: string;
  context?: string;
  settings: Settings;
  serverGeminiKey?: string | null;
  onProgress?: (session: AICouncilSession) => void;
  signal?: AbortSignal;
}

const DEFAULT_MODELS: Record<ProviderId, string> = {
  xai: 'grok-4',
  gemini: 'gemini-3.8-flash',
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-20241022',
};

/**
 * Discover all eligible council members across configured company keys
 */
export function getEligibleCouncilMembers(
  settings: Settings,
  serverGeminiKey?: string | null
): { member: CouncilMember; apiKey: string }[] {
  const list: { member: CouncilMember; apiKey: string }[] = [];
  const keys = settings.keys;
  const effectiveGeminiKey = (keys.gemini?.value || serverGeminiKey || '').trim();
  const xaiKey = (keys.xai?.value || '').trim();
  const openaiKey = (keys.openai?.value || '').trim();
  const anthropicKey = (keys.anthropic?.value || '').trim();

  // 1. xAI Grok (Grok 4 series)
  if (xaiKey.length > 0) {
    const model =
      (keys.xai?.models || []).find((m) => m === 'grok-4' || m.includes('grok-4')) ||
      (keys.xai?.models || []).find((m) => m.includes('grok-3') || m.includes('grok-2')) ||
      DEFAULT_MODELS.xai;
    list.push({
      member: {
        provider: 'xai',
        model,
        displayName: model.includes('4') ? 'Grok 4' : 'Grok',
        company: 'xAI',
      },
      apiKey: xaiKey,
    });
  }

  // 2. Google DeepMind Gemini (Gemini 3 series)
  if (effectiveGeminiKey.length > 0) {
    const model =
      (keys.gemini?.models || []).find((m) => m.includes('3.8') || m.includes('gemini-3')) ||
      (keys.gemini?.models || []).find((m) => m.includes('2.5-pro') || m.includes('2.5-flash')) ||
      DEFAULT_MODELS.gemini;
    list.push({
      member: {
        provider: 'gemini',
        model,
        displayName: model.includes('3') ? 'Gemini 3.8 Flash' : 'Gemini 2.5 Pro',
        company: 'Google DeepMind',
      },
      apiKey: effectiveGeminiKey,
    });
  }

  // 3. OpenAI GPT-4o
  if (openaiKey.length > 0) {
    const model =
      (keys.openai?.models || []).find((m) => m.startsWith('gpt-4o') || m === 'gpt-4o') ||
      DEFAULT_MODELS.openai;
    list.push({
      member: {
        provider: 'openai',
        model,
        displayName: 'GPT-4o',
        company: 'OpenAI',
      },
      apiKey: openaiKey,
    });
  }

  // 4. Anthropic Claude
  if (anthropicKey.length > 0) {
    const model =
      (keys.anthropic?.models || []).find((m) => m.includes('sonnet') || m.includes('claude-3')) ||
      DEFAULT_MODELS.anthropic;
    list.push({
      member: {
        provider: 'anthropic',
        model,
        displayName: 'Claude 3.5 Sonnet',
        company: 'Anthropic',
      },
      apiKey: anthropicKey,
    });
  }

  // If user has both xAI Grok and Google Gemini (primary council setup), add a 3rd member for a 3-way debate:
  if (list.length === 2 && xaiKey.length > 0 && effectiveGeminiKey.length > 0) {
    const miniModel =
      (keys.xai?.models || []).find((m) => m.includes('mini')) || 'grok-4-mini';
    list.push({
      member: {
        provider: 'xai',
        model: miniModel,
        displayName: 'Grok 4 Mini',
        company: 'xAI (Fast & Precise)',
      },
      apiKey: xaiKey,
    });
  } else if (list.length === 1 && xaiKey.length > 0) {
    // If user only has xAI configured: supplement with Grok 4 architectures
    list.push({
      member: {
        provider: 'xai',
        model: (keys.xai?.models || []).find((m) => m.includes('mini')) || 'grok-4-mini',
        displayName: 'Grok 4 Mini',
        company: 'xAI (Precision & Speed)',
      },
      apiKey: xaiKey,
    });
    list.push({
      member: {
        provider: 'xai',
        model: 'grok-4',
        displayName: 'Grok 4 Adversarial',
        company: 'xAI (Critical Stance)',
      },
      apiKey: xaiKey,
    });
  } else if (list.length === 1 && effectiveGeminiKey.length > 0) {
    // If only Gemini is configured: supplement with Gemini 3 architectures
    list.push({
      member: {
        provider: 'gemini',
        model: 'gemini-3-pro',
        displayName: 'Gemini 3 Pro',
        company: 'Google (Deep Reasoning)',
      },
      apiKey: effectiveGeminiKey,
    });
    list.push({
      member: {
        provider: 'gemini',
        model: 'gemini-3-flash',
        displayName: 'Gemini 3 Flash',
        company: 'Google (Speed & Directness)',
      },
      apiKey: effectiveGeminiKey,
    });
  }

  return list;
}

export async function runAICouncilSession(args: CouncilSessionArgs): Promise<AICouncilSession> {
  const { prompt, context, settings, serverGeminiKey, onProgress, signal } = args;

  const eligible = getEligibleCouncilMembers(settings, serverGeminiKey);
  if (eligible.length === 0) {
    throw new Error('Please enter your xAI Grok or Google Gemini API key in Settings to convene the AI Council.');
  }

  const session: AICouncilSession = {
    status: 'debating',
    currentStage: 'Convening AI Council across models...',
    participants: eligible.map((e) => e.member),
    rounds: [],
  };

  onProgress?.({ ...session, rounds: [...session.rounds] });

  // -------------------------------------------------------------
  // ROUND 1: Initial Independent Perspectives
  // -------------------------------------------------------------
  session.currentStage = 'Round 1: Collecting Independent Model Proposals...';
  onProgress?.({ ...session, rounds: [...session.rounds] });

  const round1: CouncilRound = {
    roundNumber: 1,
    title: 'Initial Independent Proposals',
    description: 'Each AI model analyzes the problem independently from its unique principles and strengths.',
    contributions: [],
  };

  const round1Promises = eligible.map(async ({ member, apiKey }) => {
    const systemPrompt = `You are representing ${member.company} (${member.displayName}) in an elite AI Council.
Analyze the user's query thoroughly. Present your strongest arguments, technical evidence, architecture, or solutions based on ${member.company}'s highest standards.
Be decisive, articulate, and clear.`;

    let userContent = `### USER QUERY TO DEBATE:\n${prompt}\n\n`;
    if (context && context.trim()) {
      userContent += `### CONTEXT / DOCUMENTS:\n${context.slice(0, 3000)}\n\n`;
    }
    userContent += `Deliver your initial proposal and perspective.`;

    try {
      const res = await chat({
        provider: member.provider,
        apiKey,
        model: member.model,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
        maxTokens: 1024,
        signal,
      });

      return {
        provider: member.provider,
        model: member.model,
        company: member.company,
        content: res.text.trim(),
      };
    } catch (err: any) {
      return {
        provider: member.provider,
        model: member.model,
        company: member.company,
        content: `*(Unable to retrieve response from ${member.displayName}: ${err.message || 'Connection error'})*`,
      };
    }
  });

  round1.contributions = await Promise.all(round1Promises);
  session.rounds.push(round1);
  session.currentStage = 'Round 2: Cross-Examination Debate & Rebuttals...';
  onProgress?.({ ...session, rounds: [...session.rounds] });

  // -------------------------------------------------------------
  // ROUND 2: Cross-Examination Debate & Critique
  // -------------------------------------------------------------
  const round2: CouncilRound = {
    roundNumber: 2,
    title: 'Cross-Examination & Rebuttal',
    description: 'Models review and debate their peers’ proposals, pointing out flaws, edge cases, and synergies.',
    contributions: [],
  };

  const peerSummaryText = round1.contributions
    .map((c) => `--- [${c.company} / ${c.model}] ---\n${c.content}`)
    .join('\n\n');

  const round2Promises = eligible.map(async ({ member, apiKey }) => {
    const systemPrompt = `You are representing ${member.company} (${member.displayName}) in the AI Council Debate.
You have just read the proposals presented by your peer models.
Your goal in this round is to debate rigorously:
1. Identify any flaws, blindspots, or over-simplifications in your peers' arguments.
2. Note where you agree or where their ideas complement yours.
3. Defend or refine your recommendation to reach an optimal conclusion.
Keep your critique sharp, respectful, and intellectually honest.`;

    const userContent = `### ORIGINAL USER QUERY:\n${prompt}\n\n### PEER MODELS' INITIAL PROPOSALS:\n${peerSummaryText}\n\nProvide your cross-examination and rebuttal now.`;

    try {
      const res = await chat({
        provider: member.provider,
        apiKey,
        model: member.model,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
        maxTokens: 1024,
        signal,
      });

      return {
        provider: member.provider,
        model: member.model,
        company: member.company,
        content: res.text.trim(),
      };
    } catch (err: any) {
      return {
        provider: member.provider,
        model: member.model,
        company: member.company,
        content: `*(Rebuttal skipped: ${err.message || 'Error'})*`,
      };
    }
  });

  round2.contributions = await Promise.all(round2Promises);
  session.rounds.push(round2);
  session.currentStage = 'Synthesizing Council Consensus & Final Verdict...';
  onProgress?.({ ...session, rounds: [...session.rounds] });

  // -------------------------------------------------------------
  // ROUND 3: Consensus & Final Verdict Synthesis
  // -------------------------------------------------------------
  const leadMember = eligible[0]; // Lead synthesizer
  const fullDebateHistory =
    `### USER QUERY:\n${prompt}\n\n` +
    `### ROUND 1: INITIAL PROPOSALS:\n${round1.contributions.map((c) => `[${c.company}]:\n${c.content}`).join('\n\n')}\n\n` +
    `### ROUND 2: REBUTTALS & CRITIQUE:\n${round2.contributions.map((c) => `[${c.company}]:\n${c.content}`).join('\n\n')}`;

  const moderatorSystemPrompt = `You are the Presiding Moderator of the AI Council representing ${eligible.map((e) => e.member.company).join(', ')}.
Your duty is to synthesize the complete debate into an authoritative, unified consensus verdict.
Output your synthesis in STRICT JSON format:
{
  "verdict": "<Short 1-sentence bottom-line verdict>",
  "synthesis": "<2-3 comprehensive paragraphs explaining the synthesized solution combining the best ideas of all models>",
  "agreements": [<string: 2-4 points on which all models unanimously agreed>],
  "disagreements": [<string: 2-3 points where models had differing trade-offs or approaches>],
  "actionItems": [<string: 2-4 concrete next steps or recommendations for the user>]
}`;

  try {
    const consensusRes = await chat({
      provider: leadMember.member.provider,
      apiKey: leadMember.apiKey,
      model: leadMember.member.model,
      system: moderatorSystemPrompt,
      messages: [{ role: 'user', content: fullDebateHistory }],
      maxTokens: 1500,
      signal,
    });

    const rawSynthesis = consensusRes.text.trim();
    let parsed: any = null;

    try {
      parsed = JSON.parse(rawSynthesis);
    } catch {
      const codeMatch = rawSynthesis.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (codeMatch) {
        try {
          parsed = JSON.parse(codeMatch[1].trim());
        } catch {}
      }
      if (!parsed) {
        const firstBrace = rawSynthesis.indexOf('{');
        const lastBrace = rawSynthesis.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          try {
            parsed = JSON.parse(rawSynthesis.substring(firstBrace, lastBrace + 1));
          } catch {}
        }
      }
    }

    if (parsed && typeof parsed === 'object') {
      session.consensus = {
        verdict: parsed.verdict || 'Unanimous Council Agreement',
        synthesis: parsed.synthesis || rawSynthesis,
        agreements: Array.isArray(parsed.agreements) ? parsed.agreements : ['Core objective and problem alignment'],
        disagreements: Array.isArray(parsed.disagreements) ? parsed.disagreements : ['Implementation sequencing and complexity trade-offs'],
        actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : ['Implement synthesized architecture'],
      };
    } else {
      session.consensus = {
        verdict: 'Council Consensus Formed',
        synthesis: rawSynthesis,
        agreements: ['Models agreed on the primary solution trajectory'],
        disagreements: ['Minor variations in toolchain selection'],
        actionItems: ['Review round 1 & 2 debate points for nuanced trade-offs'],
      };
    }
  } catch (synthErr: any) {
    session.consensus = {
      verdict: 'Debate Completed',
      synthesis: 'The council completed multi-model debate. Review the contributions from each model in the tabs above.',
      agreements: ['Debate concluded across council members'],
      disagreements: [],
      actionItems: [],
    };
  }

  session.status = 'done';
  session.currentStage = 'Consensus Reached';
  session.completedAt = Date.now();
  onProgress?.({ ...session, rounds: [...session.rounds] });

  return session;
}
