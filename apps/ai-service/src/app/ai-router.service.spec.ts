import { BadGatewayException } from '@nestjs/common';
import { loadAiRouterConfig } from './ai-router.config';
import { AiRouterService } from './ai-router.service';

const okJson = (content: string) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { role: 'assistant', content } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

describe('AiRouterService', () => {
  it('routes only to DeepSeek when AI_SELF_HOSTED_ENABLED is false (default)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('upstream down', { status: 503 }));
    const config = loadAiRouterConfig({
      AI_DEEPSEEK_URL: 'https://api.deepseek.com/v1',
      AI_DEEPSEEK_MODEL: 'deepseek-chat',
      AI_DEEPSEEK_KEY: 'ds-key',
      AI_SELF_HOSTED_URL: 'http://127.0.0.1:8085/v1',
      AI_SELF_HOSTED_MODEL: 'poshtetgarm-qwen2.5-1.5b',
    });
    expect(config.selfHostedEnabled).toBe(false);

    const service = new AiRouterService(config, fetchMock as never);
    const result = await service.chatCompletions({
      model: 'ignored',
      messages: [{ role: 'user', content: 'سلام' }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.deepseek.com/v1/chat/completions',
    );
    expect(result.status).toBe(503);
    expect(result.provider).toBe('deepseek');
    expect(result.fellBack).toBe(false);
  });

  it('falls back to self-hosted llama-server when flag is enabled in fallback mode and DeepSeek fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(okJson('{"in_scope": true}'));

    const config = loadAiRouterConfig({
      AI_SELF_HOSTED_ENABLED: 'true',
      AI_SELF_HOSTED_MODE: 'fallback',
      AI_DEEPSEEK_URL: 'https://api.deepseek.com/v1',
      AI_DEEPSEEK_MODEL: 'deepseek-chat',
      AI_DEEPSEEK_KEY: 'ds-key',
      AI_SELF_HOSTED_URL: 'http://127.0.0.1:8085/v1',
      AI_SELF_HOSTED_MODEL: 'poshtetgarm-qwen2.5-1.5b',
    });

    const service = new AiRouterService(config, fetchMock as never);
    const result = await service.chatCompletions({
      messages: [{ role: 'user', content: 'سلام' }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.deepseek.com/v1/chat/completions',
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      'http://127.0.0.1:8085/v1/chat/completions',
    );
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(secondBody.model).toBe('poshtetgarm-qwen2.5-1.5b');
    expect(result.status).toBe(200);
    expect(result.provider).toBe('self-hosted');
    expect(result.fellBack).toBe(true);
  });

  it('does not fall back on 400 bad request errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('bad input', { status: 400 }));
    const config = loadAiRouterConfig({
      AI_SELF_HOSTED_ENABLED: 'true',
      AI_SELF_HOSTED_MODE: 'fallback',
      AI_DEEPSEEK_KEY: 'ds-key',
    });

    const service = new AiRouterService(config, fetchMock as never);
    const result = await service.chatCompletions({
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(400);
    expect(result.provider).toBe('deepseek');
    expect(result.fellBack).toBe(false);
  });

  it('routes directly to self-hosted when AI_SELF_HOSTED_MODE=primary', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(okJson('پاسخ لوکال'));
    const config = loadAiRouterConfig({
      AI_SELF_HOSTED_ENABLED: 'true',
      AI_SELF_HOSTED_MODE: 'primary',
      AI_DEEPSEEK_KEY: 'ds-key',
      AI_SELF_HOSTED_URL: 'http://127.0.0.1:8085/v1',
      AI_SELF_HOSTED_MODEL: 'poshtetgarm-qwen2.5-1.5b',
    });

    const service = new AiRouterService(config, fetchMock as never);
    const result = await service.chatCompletions({
      messages: [{ role: 'user', content: 'تست' }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://127.0.0.1:8085/v1/chat/completions',
    );
    expect(result.provider).toBe('self-hosted');
    expect(result.fellBack).toBe(false);
  });

  it('falls back to self-hosted when DeepSeek throws a network error', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(okJson('ok'));
    const config = loadAiRouterConfig({
      AI_SELF_HOSTED_ENABLED: 'true',
      AI_SELF_HOSTED_MODE: 'fallback',
      AI_DEEPSEEK_KEY: 'ds-key',
    });

    const service = new AiRouterService(config, fetchMock as never);
    const result = await service.chatCompletions({
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result.provider).toBe('self-hosted');
    expect(result.fellBack).toBe(true);
  });

  it('throws BadGatewayException when both providers fail with network errors', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('ds down'))
      .mockRejectedValueOnce(new Error('local down'));
    const config = loadAiRouterConfig({
      AI_SELF_HOSTED_ENABLED: 'true',
      AI_SELF_HOSTED_MODE: 'fallback',
      AI_DEEPSEEK_KEY: 'ds-key',
    });

    const service = new AiRouterService(config, fetchMock as never);
    await expect(
      service.chatCompletions({
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('enforces Bearer token when AI_SERVICE_TOKEN is set', () => {
    const config = loadAiRouterConfig({
      AI_SERVICE_TOKEN: 'super-secret-token',
    });
    const service = new AiRouterService(config);

    expect(service.isAuthorized(undefined)).toBe(false);
    expect(service.isAuthorized('Bearer wrong')).toBe(false);
    expect(service.isAuthorized('Bearer super-secret-token')).toBe(true);
  });
});
