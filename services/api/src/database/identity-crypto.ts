import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Standard AES-256-GCM and HMAC-SHA256. Keys are injected, never generated/stored in DB.
 * One active key version in M2.1; rotation requires dual-lookup/backfill review, not a config flip. */
export class IdentityCrypto {
  private readonly encryptionKey: Buffer;
  private readonly lookupKey: Buffer;
  constructor(readonly keyId: string, encryptionKey: Buffer, lookupKey: Buffer) {
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(keyId) || encryptionKey.length !== 32 || lookupKey.length !== 32
      || timingSafeEqual(encryptionKey, lookupKey)) throw new Error('Invalid identity key configuration');
    this.encryptionKey = Buffer.from(encryptionKey);
    this.lookupKey = Buffer.from(lookupKey);
  }
  lookup(value: string, purpose: string): string {
    return createHmac('sha256', this.lookupKey).update(JSON.stringify(['v1', this.keyId, purpose, value])).digest('hex');
  }
  encrypt(value: string, purpose: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    cipher.setAAD(Buffer.from(JSON.stringify(['v1', this.keyId, purpose])));
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return ['v1', this.keyId, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
  }
  decrypt(envelope: string, purpose: string): string {
    try {
      const [version, kid, iv, tag, data, extra] = envelope.split('.');
      if (version !== 'v1' || kid !== this.keyId || !iv || !tag || !data || extra !== undefined) throw new Error();
      if (Buffer.from(iv, 'base64url').length !== 12 || Buffer.from(tag, 'base64url').length !== 16) throw new Error();
      const cipher = createDecipheriv('aes-256-gcm', this.encryptionKey, Buffer.from(iv, 'base64url'));
      cipher.setAAD(Buffer.from(JSON.stringify(['v1', this.keyId, purpose])));
      cipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([cipher.update(Buffer.from(data, 'base64url')), cipher.final()]).toString('utf8');
    } catch { throw new Error('Invalid encrypted identity'); }
  }
}
