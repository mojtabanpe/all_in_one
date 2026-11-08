import { aiCostUsd, DEFAULT_AI_PRICES } from './ai';

describe('aiCostUsd', () => {
  const prices = {
    ...DEFAULT_AI_PRICES,
    chatInput: 0.15,
    chatCached: 0.0375,
    chatOutput: 0.6,
    tts: 15,
    stt: 0.006,
  };
  it('prices chat input and output tokens apart', () => {
    expect(aiCostUsd(prices, 'chat', 1_000_000, 250_000)).toBeCloseTo(0.2625);
    // Output can never exceed the total.
    expect(aiCostUsd(prices, 'chat', 100, 500)).toBeCloseTo(0.00006);
  });
  it('prices prompt-cache hits at the cached input rate', () => {
    // 800k input of which 600k cached, 200k output: 0.2M × 0.15 + 0.6M × 0.0375 + 0.2M × 0.6.
    expect(aiCostUsd(prices, 'chat', 1_000_000, 200_000, 600_000)).toBeCloseTo(
      0.1725,
    );
    // Cached tokens never exceed the input part.
    expect(
      aiCostUsd(prices, 'chat', 1_000_000, 200_000, 5_000_000),
    ).toBeCloseTo(aiCostUsd(prices, 'chat', 1_000_000, 200_000, 800_000));
  });
  it('prices an assistant day as DeepSeek bills it, mostly cache hits', () => {
    // Production, 2026-11-08: 9 assistant messages, 341,528 tokens, 2,510 output; assume 95% of input cached.
    const input = 341_528 - 2_510;
    const cached = Math.round(input * 0.95);
    const missOnly = aiCostUsd(DEFAULT_AI_PRICES, 'chat', 341_528, 2_510);
    const withCache = aiCostUsd(
      DEFAULT_AI_PRICES,
      'chat',
      341_528,
      2_510,
      cached,
    );
    expect(missOnly).toBeCloseTo(0.1047, 4);
    expect(withCache).toBeCloseTo(
      ((input - cached) * 0.3 + cached * 0.006 + 2_510 * 1.2) / 1_000_000,
    );
    expect(withCache).toBeLessThan(missOnly / 5);
  });
  it('prices speech by characters and transcription by recording', () => {
    expect(aiCostUsd(prices, 'tts', 2_000_000)).toBeCloseTo(30);
    expect(aiCostUsd(prices, 'stt', 10)).toBeCloseTo(0.06);
  });
  it('is zero for a free service', () => {
    const free = { ...prices, chatInput: 0, chatCached: 0, chatOutput: 0 };
    expect(aiCostUsd(free, 'chat', 1_000_000, 10, 500_000)).toBe(0);
  });
  it('starts from the DeepSeek and Deepgram prices', () => {
    // 900k input + 100k output tokens at $0.30 / $1.20 per million.
    expect(
      aiCostUsd(DEFAULT_AI_PRICES, 'chat', 1_000_000, 100_000),
    ).toBeCloseTo(0.39);
    expect(aiCostUsd(DEFAULT_AI_PRICES, 'tts', 1_000)).toBeCloseTo(0.03);
    expect(aiCostUsd(DEFAULT_AI_PRICES, 'stt', 100)).toBeCloseTo(0.43);
  });
});
