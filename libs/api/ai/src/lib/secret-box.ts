import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

/**
 * AES-256-GCM for the users' API keys. The key comes from AI_KEYS_SECRET
 * (32 bytes, base64) or is derived from JWT_SECRET; a value that no longer
 * decrypts (rotated secret) reads as "no key".
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(secret: string, dedicated?: string) {
    const raw = dedicated ? Buffer.from(dedicated, 'base64') : null;
    this.key =
      raw && raw.length === 32
        ? raw
        : Buffer.from(
            hkdfSync('sha256', secret, 'all-in-one', 'ai-api-keys', 32),
          );
  }

  seal(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return ['v1', iv, cipher.getAuthTag(), data]
      .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
      .join('.');
  }

  open(sealed: string | null | undefined): string | null {
    if (!sealed) return null;
    try {
      const [version, iv, tag, data] = sealed.split('.');
      if (version !== 'v1') return null;
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key,
        Buffer.from(iv, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(data, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      return null;
    }
  }
}
