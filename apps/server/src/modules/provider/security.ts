import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_SALT = 'contrix-provider-registry-salt';
const PROVIDER_SECRET_ENV_KEY = 'CONTRIX_PROVIDER_SECRET';

function resolveSecretSource(): string {
  const secret = process.env[PROVIDER_SECRET_ENV_KEY]?.trim();
  if (!secret) {
    throw new Error(
      `[provider-security] Missing required environment variable ${PROVIDER_SECRET_ENV_KEY}. ` +
        'Set a strong secret before starting Contrix.'
    );
  }

  return secret;
}

const ENCRYPTION_KEY = scryptSync(resolveSecretSource(), ENCRYPTION_SALT, 32);

export function encryptApiKey(apiKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, ENCRYPTION_KEY, iv);

  const encrypted = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}.${authTag.toString('base64')}.${encrypted.toString('base64')}`;
}

export function decryptApiKey(encryptedValue: string): string {
  const parts = encryptedValue.split('.');

  if (parts.length !== 3) {
    throw new Error('Encrypted API key has invalid format');
  }

  const ivPart = parts[0];
  const tagPart = parts[1];
  const payloadPart = parts[2];

  if (!ivPart || !tagPart || !payloadPart) {
    throw new Error('Encrypted API key has invalid format');
  }

  const iv = Buffer.from(ivPart, 'base64');
  const authTag = Buffer.from(tagPart, 'base64');
  const payload = Buffer.from(payloadPart, 'base64');

  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);

  return decrypted.toString('utf8');
}

export function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  const visibleChars = 6;
  const mask = '******';

  if (!trimmed) {
    return 'not-set';
  }

  // Do not expose the full secret for short keys.
  if (trimmed.length <= visibleChars * 2) {
    if (trimmed.length === 1) {
      return `${trimmed}${mask}`;
    }

    return `${trimmed.slice(0, 1)}${mask}${trimmed.slice(-1)}`;
  }

  return `${trimmed.slice(0, visibleChars)}${mask}${trimmed.slice(-visibleChars)}`;
}
