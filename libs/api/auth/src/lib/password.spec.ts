import { hash as bcryptHash } from 'bcryptjs';
import { hashPassword, isLegacyHash, verifyPassword } from './password';

describe('password hashing', () => {
  it('verifies the right password and rejects others', async () => {
    const stored = await hashPassword('secret-pass-1');
    expect(stored).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
    await expect(verifyPassword('secret-pass-1', stored)).resolves.toBe(true);
    await expect(verifyPassword('secret-pass-2', stored)).resolves.toBe(false);
  });

  it('uses a fresh salt every time', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('rejects malformed stored hashes', async () => {
    await expect(verifyPassword('x', 'not-a-hash')).resolves.toBe(false);
  });

  it('verifies bcrypt hashes imported from Recall', async () => {
    const stored = await bcryptHash('recall-pass', 4);
    expect(isLegacyHash(stored)).toBe(true);
    expect(isLegacyHash(await hashPassword('x'))).toBe(false);
    await expect(verifyPassword('recall-pass', stored)).resolves.toBe(true);
    await expect(verifyPassword('wrong', stored)).resolves.toBe(false);
  });
});
