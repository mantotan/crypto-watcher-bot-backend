import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * AES-256-GCM Encryption/Decryption Utility
 * Used for encrypting sensitive data like TOTP secrets and trading account API keys
 *
 * SECURITY NOTE:
 * - TOTP secrets MUST be ENCRYPTED (reversible) - we need to decrypt them to verify codes
 * - Backup codes MUST be HASHED (one-way) - never encrypted
 * - Uses AES-256-GCM for authenticated encryption
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Get encryption key from environment variable
 * @throws Error if ENCRYPTION_KEY is not set
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;

  if (!key) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is not set. ' +
      'Generate one using: openssl rand -hex 32'
    );
  }

  // Convert hex string to buffer (32 bytes = 256 bits)
  const keyBuffer = Buffer.from(key, 'hex');

  if (keyBuffer.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must be 32 bytes (64 hex characters). Current length: ${keyBuffer.length} bytes. ` +
      'Generate a new one using: openssl rand -hex 32'
    );
  }

  return keyBuffer;
}

/**
 * Encrypt a string using AES-256-GCM
 * Returns format: iv:authTag:encryptedData (all hex-encoded)
 *
 * @param plaintext - The string to encrypt
 * @returns Encrypted string in format "iv:authTag:encryptedData"
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Return in format: iv:authTag:encryptedData (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a string encrypted with AES-256-GCM
 * Expects format: iv:authTag:encryptedData (all hex-encoded)
 *
 * @param encryptedData - The encrypted string in format "iv:authTag:encryptedData"
 * @returns Decrypted plaintext string
 * @throws Error if decryption fails or data is tampered
 */
export function decrypt(encryptedData: string): string {
  const key = getEncryptionKey();

  // Split the encrypted data into components
  const parts = encryptedData.split(':');

  if (parts.length !== 3) {
    throw new Error(
      'Invalid encrypted data format. Expected format: iv:authTag:encryptedData'
    );
  }

  const [ivHex, authTagHex, encrypted] = parts;

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length. Expected ${IV_LENGTH} bytes, got ${iv.length}`);
  }

  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`Invalid auth tag length. Expected ${AUTH_TAG_LENGTH} bytes, got ${authTag.length}`);
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  try {
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    throw new Error(
      'Decryption failed. Data may be corrupted or tampered with. ' +
      (error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

/**
 * Test encryption/decryption functionality
 * Useful for verifying ENCRYPTION_KEY is correctly configured
 *
 * @returns true if encryption/decryption works correctly
 * @throws Error if test fails
 */
export function testEncryption(): boolean {
  const testString = 'test-encryption-' + Date.now();
  const encrypted = encrypt(testString);
  const decrypted = decrypt(encrypted);

  if (testString !== decrypted) {
    throw new Error('Encryption test failed: decrypted value does not match original');
  }

  return true;
}
