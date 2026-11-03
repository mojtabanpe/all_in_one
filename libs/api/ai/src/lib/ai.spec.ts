import { deepgramBase, elevenBase, endpointFor } from './ai-settings.service';
import { isRetryable, retryDelay, transcriptOf } from './ai-gateway.service';
import { isPrivateAddress } from './net-guard';
import { SecretBox } from './secret-box';

describe('api-ai', () => {
  it('seals and opens keys, and a rotated secret reads as no key', () => {
    const box = new SecretBox('a'.repeat(40));
    const sealed = box.seal('sk-test-123');
    expect(sealed).not.toContain('sk-test');
    expect(box.open(sealed)).toBe('sk-test-123');
    expect(new SecretBox('b'.repeat(40)).open(sealed)).toBeNull();
    expect(box.open(null)).toBeNull();
  });

  it('accepts a base url or the full endpoint', () => {
    expect(endpointFor('chat', 'https://api.example.com/v1/')).toBe(
      'https://api.example.com/v1/chat/completions',
    );
    expect(endpointFor('chat', 'https://x.io/v1/chat/completions')).toBe(
      'https://x.io/v1/chat/completions',
    );
    expect(endpointFor('tts', 'https://x.io/v1')).toBe(
      'https://x.io/v1/audio/speech',
    );
    expect(endpointFor('stt', 'https://x.io/v1')).toBe(
      'https://x.io/v1/audio/transcriptions',
    );
  });

  it.each([
    ['127.0.0.1', true],
    ['10.0.0.8', true],
    ['169.254.169.254', true],
    ['::1', true],
    ['::ffff:10.0.0.1', true],
    ['8.8.8.8', false],
    ['2606:4700::1111', false],
  ])('treats %s as private: %s', (address, expected) => {
    expect(isPrivateAddress(address)).toBe(expected);
  });
});

describe('elevenBase', () => {
  it('defaults to api.elevenlabs.io and drops /v1', () => {
    expect(elevenBase('')).toBe('https://api.elevenlabs.io');
    expect(elevenBase('https://x.io/v1/')).toBe('https://x.io');
  });
});

describe('deepgram', () => {
  it('defaults to api.deepgram.com', () => {
    expect(deepgramBase(null)).toBe('https://api.deepgram.com');
  });
  it('reads OpenAI and Deepgram transcripts', () => {
    expect(transcriptOf({ text: ' hi ' })).toBe('hi');
    expect(
      transcriptOf({
        results: { channels: [{ alternatives: [{ transcript: 'hello' }] }] },
      }),
    ).toBe('hello');
    expect(transcriptOf({})).toBe('');
  });
});

describe('speech retry', () => {
  it('retries rate limits and server errors only', () => {
    expect([429, 500, 503, 408].every(isRetryable)).toBe(true);
    expect([400, 401, 404].some(isRetryable)).toBe(false);
  });
  it('waits longer each time, or as the service asks (capped)', () => {
    expect(retryDelay(1)).toBe(600);
    expect(retryDelay(2)).toBe(1200);
    expect(retryDelay(1, '2')).toBe(2000);
    expect(retryDelay(1, '60')).toBe(4000);
  });
});
