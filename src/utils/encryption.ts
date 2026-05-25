/**
 * Encryption helpers for sensitive data and file-level encryption.
 *
 * Uses AES-256-GCM for authenticated encryption. The encryption key is derived
 * from DEXTER_ENCRYPTION_KEY which must be set explicitly for security.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

export function getEncryptionKey(): string {
  const envKey = process.env.DEXTER_ENCRYPTION_KEY;
  if (envKey && envKey.length >= 32) {
    return envKey;
  }
  throw new Error('DEXTER_ENCRYPTION_KEY must be set and at least 32 characters');
}

function deriveKey(key: string): Buffer {
  return createHash('sha256').update(key).digest();
}

export function encryptValue(plaintext: string, key?: string): string {
  const k = deriveKey(key ?? getEncryptionKey());
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, k, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `enc:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptValue(ciphertext: string, key?: string): string {
  if (!ciphertext.startsWith('enc:')) {
    return ciphertext;
  }
  const parts = ciphertext.split(':');
  if (parts.length !== 4) {
    return ciphertext;
  }
  const k = deriveKey(key ?? getEncryptionKey());
  const iv = Buffer.from(parts[1]!, 'hex');
  const authTag = Buffer.from(parts[2]!, 'hex');
  const encrypted = Buffer.from(parts[3]!, 'hex');
  const decipher = createDecipheriv(ALGORITHM, k, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
