import { envSchema } from './env';

describe('envSchema SMTP_PROXY_URL validation', () => {
  const baseEnv = {
    DATABASE_URL: 'postgresql://app:app@localhost:5432/all_in_one',
    JWT_SECRET: 'x'.repeat(32),
  };

  it('allows unset, empty string, http:// and https:// URLs', () => {
    expect(envSchema.safeParse(baseEnv).success).toBe(true);
    expect(
      envSchema.safeParse({ ...baseEnv, SMTP_PROXY_URL: '' }).success,
    ).toBe(true);
    expect(
      envSchema.safeParse({
        ...baseEnv,
        SMTP_PROXY_URL: 'http://127.0.0.1:7890',
      }).success,
    ).toBe(true);
    expect(
      envSchema.safeParse({
        ...baseEnv,
        SMTP_PROXY_URL: 'https://proxy.example.com:8443',
      }).success,
    ).toBe(true);
  });

  it('rejects socks and scheme-less proxy values clearly', () => {
    const socks = envSchema.safeParse({
      ...baseEnv,
      SMTP_PROXY_URL: 'socks5://127.0.0.1:7891',
    });
    expect(socks.success).toBe(false);

    const schemeless = envSchema.safeParse({
      ...baseEnv,
      SMTP_PROXY_URL: '127.0.0.1:7890',
    });
    expect(schemeless.success).toBe(false);
  });
});
