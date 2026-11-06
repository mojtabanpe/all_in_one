import { ConfigService } from '@nestjs/config';
import { AuthService } from '@all-in-one/api/auth';
import { registerSchema } from '@all-in-one/shared/schemas';

describe('Server-side signup acquisition boundaries', () => {
  const input = {
    email: 'test@example.invalid',
    password: 'test-password',
    acquisition: {
      visitorId: '019a59e3-4070-7000-8000-000000000001',
      language: 'en' as const,
    },
  };
  it('rejects extra/private fields and client-provided completed event names in attribution', () => {
    expect(registerSchema.safeParse(input).success).toBe(true);
    for (const acquisition of [
      { ...input.acquisition, name: 'signup_completed' },
      { ...input.acquisition, email: 'private@example.invalid' },
    ]) {
      expect(registerSchema.safeParse({ ...input, acquisition }).success).toBe(
        false,
      );
    }
  });

  it('keeps successful account creation successful when analytics storage fails', async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ id: 'created-user', email: input.email });
    const createMany = vi
      .fn()
      .mockRejectedValue(new Error('database unavailable'));
    const auth = new AuthService(
      {
        user: { findUnique: vi.fn().mockResolvedValue(null), create },
        growthEvent: { createMany },
      } as never,
      {} as never,
      {} as never,
      new ConfigService({
        REQUIRE_EMAIL_VERIFICATION: 'false',
        GROWTH_ANALYTICS_ENABLED: 'true',
      }),
    );
    expect((await auth.register(input)).id).toBe('created-user');
    const event = createMany.mock.calls[0][0].data[0];
    expect(Object.keys(event).sort()).toEqual([
      'day',
      'language',
      'name',
      'visitorId',
    ]);
    expect(event.name).toBe('signup_completed');
  });
});
