export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function trimHistory(
  systemPrompt: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  maxBudget: number = 100000
): { messages: { role: 'user' | 'assistant'; content: string }[]; wasTrimmed: boolean } {
  const systemTokens = estimateTokens(systemPrompt);
  let availableBudget = maxBudget - systemTokens;

  if (messages.length <= 1) {
    return { messages, wasTrimmed: false };
  }

  // Calculate tokens for all messages
  const messageTokens = messages.map((m) => estimateTokens(m.content));
  let totalTokens = messageTokens.reduce((a, b) => a + b, 0);

  if (totalTokens <= availableBudget) {
    return { messages, wasTrimmed: false };
  }

  // Over budget: drop oldest messages, but keep at least the last user message
  const trimmed = [...messages];
  let wasTrimmed = false;

  while (trimmed.length > 1 && totalTokens > availableBudget) {
    const dropped = trimmed.shift();
    if (dropped) {
      totalTokens -= estimateTokens(dropped.content);
      wasTrimmed = true;
    }
  }

  return { messages: trimmed, wasTrimmed };
}
