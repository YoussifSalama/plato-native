// USD per 1M tokens. Estimates for planning, not an invoice: check OpenAI's
// pricing page before relying on them (sources in MEASURED_COSTS.md).
const M = 1_000_000;

interface Price {
  in: number;
  out: number;
}
const TEXT: Record<string, Price> = {
  'gpt-4o': { in: 2.5, out: 10 },
  'gpt-4.1': { in: 2, out: 8 },
  'gpt-4.1-mini': { in: 0.4, out: 1.6 },
  'gpt-4.1-nano': { in: 0.1, out: 0.4 },
};

// OpenAI's hosted web search tool bills per call, on top of tokens.
// ponytail: the gpt-4o / gpt-4.1 rate as remembered ($25 per 1k calls); check OpenAI's pricing page.
export const WEB_SEARCH_USD_PER_CALL = 0.025;

export function llmCost(model: string | undefined, inTok = 0, outTok = 0) {
  const p = model && TEXT[model];
  return p ? (inTok * p.in + outTok * p.out) / M : null;
}

// Realtime voice bills audio and text tokens at different rates.
// ponytail: gpt-realtime-mini rates are taken from the gpt-4o-mini-realtime page; adjust here when OpenAI's page differs.
const VOICE: Record<
  string,
  {
    audioIn: number;
    audioOut: number;
    cachedAudioIn: number;
    textIn: number;
    textOut: number;
  }
> = {
  'gpt-realtime-mini': {
    audioIn: 10,
    audioOut: 20,
    cachedAudioIn: 0.3,
    textIn: 0.6,
    textOut: 2.4,
  },
  'gpt-realtime': {
    audioIn: 32,
    audioOut: 64,
    cachedAudioIn: 0.4,
    textIn: 4,
    textOut: 16,
  },
};

export interface VoiceUsage {
  audioInputTokens: number;
  audioOutputTokens: number;
  textInputTokens: number;
  textOutputTokens: number;
  cachedInputTokens: number;
}

export function voiceCost(model: string, u: VoiceUsage) {
  const p = VOICE[model] ?? VOICE['gpt-realtime-mini'];
  // Cached tokens are a subset of the input; bill them at the cached rate.
  const cached = Math.min(u.cachedInputTokens, u.audioInputTokens);
  return (
    ((u.audioInputTokens - cached) * p.audioIn +
      cached * p.cachedAudioIn +
      u.audioOutputTokens * p.audioOut +
      u.textInputTokens * p.textIn +
      u.textOutputTokens * p.textOut) /
    M
  );
}
