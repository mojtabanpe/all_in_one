import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@all-in-one/api/db';
import {
  DAILY_SENDS,
  MAX_ATTEMPTS,
  PhoneService,
  RESEND_AFTER_MS,
} from './phone.service';
import { hashPassword, verifyPassword } from './password';
import type { SmsService } from './sms.service';

describe.skipIf(process.env['GROWTH_DB_INTEGRATION'] !== '1')(
  'Phone codes (PostgreSQL)',
  () => {
    let prisma: PrismaService;
    const ids: string[] = [];
    /** A unique test number per run, so reruns never collide. */
    const number = () =>
      `+989${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
    const sent: { template: string; to: string; code?: string }[] = [];
    const sms = {
      enabled: true,
      send: vi.fn(
        async (template: string, to: string, params: { code?: string }) => {
          sent.push({ template, to, code: params.code });
        },
      ),
      notify: vi.fn(),
    };
    const phones = () => new PhoneService(prisma, sms as unknown as SmsService);
    const lastCode = () => sent.at(-1)?.code as string;
    const account = async () => {
      const user = await prisma.user.create({
        data: {
          email: `phone-${randomUUID()}@example.invalid`,
          passwordHash: await hashPassword('old-password-1'),
        },
      });
      ids.push(user.id);
      return user;
    };

    beforeAll(() => {
      const url = process.env['DATABASE_URL'];
      if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
        throw new Error('A local database is required');
      prisma = new PrismaService(new ConfigService({ DATABASE_URL: url }));
    });
    afterAll(async () => {
      if (!prisma) return;
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
      await prisma.$disconnect();
    });
    beforeEach(() => {
      sms.enabled = true;
      sms.send.mockClear();
      sms.notify.mockClear();
    });

    it('confirms a number with its code once, and keeps a number on one account', async () => {
      const user = await account();
      const phone = number();
      const local = '0' + phone.slice(3);
      const state = await phones().start(user.id, local);
      expect(state).toEqual({ enabled: true, phone: null, pending: phone });
      expect(sent.at(-1)).toMatchObject({ template: 'AUTH_CODE', to: phone });
      const code = lastCode();
      expect(code).toMatch(/^\d{6}$/);
      const wrong = code === '000000' ? '111111' : '000000';
      await expect(phones().confirm(user.id, wrong)).rejects.toMatchObject({
        status: 400,
      });
      expect(await phones().confirm(user.id, code)).toEqual({
        enabled: true,
        phone,
        pending: null,
      });
      // A used code does not work again.
      await expect(phones().confirm(user.id, code)).rejects.toMatchObject({
        status: 400,
      });
      const other = await account();
      await expect(phones().start(other.id, phone)).rejects.toMatchObject({
        status: 409,
      });
      await expect(phones().start(user.id, phone)).rejects.toMatchObject({
        status: 400,
      });
      expect((await phones().remove(user.id)).phone).toBeNull();
    });

    it('waits a minute between codes, caps them per day and locks a code after wrong guesses', async () => {
      const user = await account();
      const phone = number();
      const t0 = new Date();
      await phones().start(user.id, phone, t0);
      await expect(
        phones().start(user.id, phone, new Date(t0.getTime() + 10_000)),
      ).rejects.toMatchObject({ status: 429 });
      let at = t0.getTime();
      for (let i = 2; i <= DAILY_SENDS; i++) {
        at += RESEND_AFTER_MS;
        await phones().start(user.id, phone, new Date(at));
      }
      at += RESEND_AFTER_MS;
      await expect(
        phones().start(user.id, phone, new Date(at)),
      ).rejects.toMatchObject({ status: 429 });
      // The next day's window opens again.
      const nextDay = new Date(t0.getTime() + 86_400_000 + 1);
      await phones().start(user.id, phone, nextDay);
      const code = lastCode();
      const wrong = code === '000000' ? '111111' : '000000';
      for (let i = 0; i < MAX_ATTEMPTS; i++)
        await expect(
          phones().confirm(user.id, wrong, nextDay),
        ).rejects.toMatchObject({ status: 400 });
      await expect(
        phones().confirm(user.id, code, nextDay),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('does not accept a code whose SMS failed', async () => {
      const user = await account();
      sms.send.mockImplementationOnce(async (template, to, params) => {
        sent.push({ template, to, code: params.code });
        throw new Error('down');
      });
      await expect(phones().start(user.id, number())).rejects.toThrow('down');
      await expect(phones().confirm(user.id, lastCode())).rejects.toMatchObject(
        { status: 400 },
      );
    });

    it('resets the password by SMS for a confirmed number only, without revealing accounts', async () => {
      const user = await account();
      const phone = number();
      await phones().start(user.id, phone);
      await phones().confirm(user.id, lastCode());
      sms.send.mockClear();
      // Unknown number: same answer, nothing sent.
      await expect(phones().requestReset(number())).resolves.toBeUndefined();
      expect(sms.send).not.toHaveBeenCalled();
      await phones().requestReset(phone);
      expect(sent.at(-1)).toMatchObject({
        template: 'PASSWORD_RESET',
        to: phone,
      });
      const code = lastCode();
      // A cooldown is swallowed too, so the answer stays the same.
      await expect(phones().requestReset(phone)).resolves.toBeUndefined();
      await expect(
        phones().reset(
          phone,
          code === '000000' ? '111111' : '000000',
          'new-password-2',
        ),
      ).rejects.toMatchObject({ status: 400 });
      const before = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      await phones().reset(phone, code, 'new-password-2');
      const after = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(await verifyPassword('new-password-2', after.passwordHash)).toBe(
        true,
      );
      expect(after.sessionVersion).toBe(before.sessionVersion + 1);
      expect(sms.notify).toHaveBeenCalledWith('PASSWORD_CHANGED', phone, {});
      await expect(
        phones().reset(phone, code, 'another-password-3'),
      ).rejects.toMatchObject({ status: 400 });
      // A verify code cannot reset a password.
      await expect(phones().requestReset('not a phone')).rejects.toMatchObject({
        status: 400,
      });
      sms.enabled = false;
      await expect(phones().requestReset(phone)).rejects.toMatchObject({
        status: 503,
      });
    });
  },
);
