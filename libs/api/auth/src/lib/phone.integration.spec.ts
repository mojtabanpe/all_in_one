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
import { AuthService } from './auth.service';
import type { JwtService } from '@nestjs/jwt';
import type { MailService } from './mail.service';

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
      expect(await verifyPassword('new-password-2', after.passwordHash!)).toBe(
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

    describe('SMS sign-in (directive 119)', () => {
      const auth = () =>
        new AuthService(
          prisma,
          {} as JwtService,
          {} as MailService,
          new ConfigService({ GROWTH_ANALYTICS_ENABLED: 'false' }),
        );
      const signIn = async (phone: string, code: string) => {
        const confirmed = await phones().verifyLogin(phone, code);
        const result = await auth().signInByPhone(confirmed);
        ids.push(result.user.id);
        return result;
      };

      it('creates a phone-only account with a right code, once, and signs it in later', async () => {
        const phone = number();
        await phones().requestLogin('0' + phone.slice(3));
        expect(sent.at(-1)).toMatchObject({
          template: 'LOGIN_CODE',
          to: phone,
        });
        const code = lastCode();
        await expect(
          phones().verifyLogin(phone, code === '000000' ? '111111' : '000000'),
        ).rejects.toMatchObject({ status: 400 });
        const first = await signIn(phone, code);
        expect(first.created).toBe(true);
        expect(first.user).toMatchObject({
          email: null,
          passwordHash: null,
          phone,
          role: 'CUSTOMER',
        });
        expect(first.user.phoneVerifiedAt).toBeInstanceOf(Date);
        // A used code does not work again.
        await expect(phones().verifyLogin(phone, code)).rejects.toMatchObject({
          status: 400,
        });
        await prisma.smsLoginCode.update({
          where: { phone },
          data: { sentAt: new Date(Date.now() - RESEND_AFTER_MS) },
        });
        await phones().requestLogin(phone);
        const again = await signIn(phone, lastCode());
        expect(again).toMatchObject({ created: false });
        expect(again.user.id).toBe(first.user.id);
      });

      it('signs in to the email account that confirmed the number', async () => {
        const user = await account();
        const phone = number();
        await prisma.user.update({
          where: { id: user.id },
          data: { phone, phoneVerifiedAt: new Date() },
        });
        await phones().requestLogin(phone);
        const result = await signIn(phone, lastCode());
        expect(result.created).toBe(false);
        expect(result.user.id).toBe(user.id);
      });

      it('makes one account when two right codes race for a new number', async () => {
        const phone = number();
        const results = await Promise.all([
          auth().signInByPhone(phone),
          auth().signInByPhone(phone),
        ]);
        results.forEach(({ user }) => ids.push(user.id));
        expect(new Set(results.map(({ user }) => user.id)).size).toBe(1);
        expect(results.filter(({ created }) => created)).toHaveLength(1);
      });

      it('limits codes per number and tries, and needs SMS on', async () => {
        const phone = number();
        await phones().requestLogin(phone);
        await expect(phones().requestLogin(phone)).rejects.toMatchObject({
          status: 429,
        });
        const code = lastCode();
        const wrong = code === '000000' ? '111111' : '000000';
        for (let i = 0; i < MAX_ATTEMPTS; i++)
          await expect(
            phones().verifyLogin(phone, wrong),
          ).rejects.toMatchObject({ status: 400 });
        // Too many wrong guesses: even the right code is refused.
        await expect(phones().verifyLogin(phone, code)).rejects.toMatchObject({
          status: 400,
        });
        await prisma.smsLoginCode.update({
          where: { phone },
          data: {
            sends: DAILY_SENDS,
            sentAt: new Date(Date.now() - RESEND_AFTER_MS),
          },
        });
        await expect(phones().requestLogin(phone)).rejects.toMatchObject({
          status: 429,
        });
        // A failed SMS leaves no working code.
        const other = number();
        sms.send.mockRejectedValueOnce(new Error('down'));
        await expect(phones().requestLogin(other)).rejects.toThrow('down');
        await expect(
          phones().verifyLogin(other, '123456'),
        ).rejects.toMatchObject({ status: 400 });
        sms.enabled = false;
        await expect(phones().requestLogin(number())).rejects.toMatchObject({
          status: 503,
        });
        await expect(
          phones().requestLogin('not a phone'),
        ).rejects.toMatchObject({ status: 503 });
      });
    });
  },
);
