import { Agent, run } from '@openai/agents';
import { z } from 'zod';
import { CountryCode, isCountryCode, resolveCountry } from './countries';
import { metered } from '../usage/usage';

// The rule-based resolver knows the big places; anything else ("Kitchener",
// "Lyon", "Tanta", "Deutschland") is a question for a model, which knows the
// whole world. Answers are cached: a place's country doesn't change.
// ponytail: in-memory cache, per process.
const cache = new Map<string, CountryCode | null>();

const answerSchema = z.object({
  places: z.array(
    z.object({
      place: z.string(),
      country: z
        .string()
        .nullable()
        .describe('ISO 3166-1 alpha-2 code, uppercase; null if unsure'),
    }),
  ),
});

const INSTRUCTIONS = `You map places to countries. For each input place (a city, region or country, in any language or spelling) return the ISO 3166-1 alpha-2 code of the country it is in. Return null when the text is not a real place ("Remote", "Anywhere", "Worldwide") or is genuinely ambiguous. Never guess.`;

export type PlaceAsker = (
  model: string,
  places: string[],
) => Promise<{ place: string; country: string | null }[]>;

const askModel: PlaceAsker = async (model, places) => {
  const agent = new Agent({
    name: 'Country Resolver',
    instructions: INSTRUCTIONS,
    model,
    outputType: answerSchema,
  });
  const result = metered(
    'discovery.country',
    model,
    await run(agent, JSON.stringify(places)),
  );
  return result.finalOutput?.places ?? [];
};

// Country of each place: rules first, model for the rest. Never throws; a
// place nobody can place is simply missing from the result.
export async function resolvePlaces(
  places: string[],
  model: string,
  ask: PlaceAsker = askModel,
  timeoutMs = 10_000,
): Promise<Map<string, CountryCode>> {
  const out = new Map<string, CountryCode>();
  const unknown: string[] = [];
  for (const place of new Set(places.map((p) => p.trim()).filter(Boolean))) {
    const known = resolveCountry(place) ?? cache.get(place.toLowerCase());
    if (known) out.set(place, known);
    else if (!cache.has(place.toLowerCase())) unknown.push(place);
  }
  if (!unknown.length) return out;
  try {
    const answers = await Promise.race([
      ask(model, unknown),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('country lookup timed out')),
          timeoutMs,
        ),
      ),
    ]);
    for (const place of unknown) {
      const raw = answers.find((a) => a.place === place)?.country ?? null;
      const code = raw && isCountryCode(raw) ? raw.toUpperCase() : null;
      cache.set(place.toLowerCase(), code);
      if (code) out.set(place, code);
    }
  } catch {
    // Model down or slow: search on with what the rules resolved.
  }
  return out;
}
