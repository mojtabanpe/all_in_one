import { aiCostUsd, DEFAULT_AI_PRICES } from './ai';

describe('aiCostUsd', () => {
  const prices = {
    ...DEFAULT_AI_PRICES,
    chatInput: 0.15,
    chatOutput: 0.6,
    tts: 15,
    stt: 0.006,
  };
  it('prices chat input and output tokens apart', () => {
    expect(aiCostUsd(prices, 'chat', 1_000_000, 250_000)).toBeCloseTo(0.2625);
    // Output can never exceed the total.
    expect(aiCostUsd(prices, 'chat', 100, 500)).toBeCloseTo(0.00006);
  });
  it('prices speech by characters and transcription by recording', () => {
    expect(aiCostUsd(prices, 'tts', 2_000_000)).toBeCloseTo(30);
    expect(aiCostUsd(prices, 'stt', 10)).toBeCloseTo(0.06);
  });
  it('is zero until prices are set', () => {
    expect(aiCostUsd(DEFAULT_AI_PRICES, 'chat', 1_000_000, 10)).toBe(0);
  });
});
