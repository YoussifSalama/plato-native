import { llmCost, voiceCost } from './pricing';

it('prices text runs and splits voice audio from text', () => {
  // gpt-4.1-mini: 1M in x $0.40 + 1M out x $1.60
  expect(llmCost('gpt-4.1-mini', 1_000_000, 1_000_000)).toBeCloseTo(2.0);
  expect(llmCost('unknown-model', 10, 10)).toBeNull();
  // 100k audio in (20k cached), 50k audio out, 10k text in, 5k text out, mini rates
  const c = voiceCost('gpt-realtime-mini', {
    audioInputTokens: 100_000,
    audioOutputTokens: 50_000,
    textInputTokens: 10_000,
    textOutputTokens: 5_000,
    cachedInputTokens: 20_000,
  });
  // 80k*10 + 20k*0.3 + 50k*20 + 10k*0.6 + 5k*2.4 = 800000+6000+1000000+6000+12000 -> /1e6
  expect(c).toBeCloseTo(1.824, 3);
});
