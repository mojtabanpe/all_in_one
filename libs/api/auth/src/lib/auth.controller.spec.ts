import { HttpAdapterHost } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PhoneService } from './phone.service';

/** The display-name route both apps use on the account page (a phone-only account starts without one). */
describe('AuthController.updateProfile', () => {
  const dbUser = {
    id: '0199f1f0-6a8e-7c3b-9a52-3f0c2b1e4d5a',
    email: null,
    phone: '+989121234567',
    passwordHash: null,
    name: 'مجتبی',
    role: 'CUSTOMER' as const,
    createdAt: new Date('2026-11-08T10:00:00.000Z'),
  };
  const updateProfile = vi.fn().mockResolvedValue(dbUser);
  const controller = new AuthController(
    { updateProfile } as unknown as AuthService,
    {} as HttpAdapterHost,
    {} as ConfigService,
    {} as PhoneService,
  );

  it('saves the name for the signed-in account and answers without secrets', async () => {
    const user = await controller.updateProfile({ id: dbUser.id } as never, {
      name: '  مجتبی  ',
    });
    expect(updateProfile).toHaveBeenCalledWith(dbUser.id, '  مجتبی  ');
    expect(user).toEqual({
      id: dbUser.id,
      email: null,
      phone: '+989121234567',
      hasPassword: false,
      name: 'مجتبی',
      role: 'CUSTOMER',
      createdAt: '2026-11-08T10:00:00.000Z',
    });
    expect(user).not.toHaveProperty('passwordHash');
  });
});
