import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID as nodeRandomUUID,
} from 'node:crypto';

/**
 * expo-crypto, implemented with Node's crypto.
 *
 * Real AES-256-GCM, not a stand-in: the vault's guarantees — a tampered file
 * fails to open, the wrong key fails to open, additional data must match —
 * are properties of GCM itself, and a fake that merely stored plaintext would
 * let tests pass that the device would fail. The combined layout matches
 * expo-crypto's: IV, then ciphertext, then the 16-byte tag.
 */

export const CryptoDigestAlgorithm = {
  SHA1: 'SHA-1',
  SHA256: 'SHA-256',
  SHA384: 'SHA-384',
  SHA512: 'SHA-512',
} as const;

export const CryptoEncoding = { HEX: 'hex', BASE64: 'base64' } as const;

export const AESKeySize = { AES128: 128, AES192: 192, AES256: 256 } as const;

export async function digestStringAsync(
  algorithm: string,
  data: string,
  options?: { encoding?: string }
): Promise<string> {
  const name = algorithm.replace('-', '').toLowerCase();
  return createHash(name)
    .update(data, 'utf8')
    .digest(options?.encoding === 'base64' ? 'base64' : 'hex');
}

export async function getRandomBytesAsync(count: number): Promise<Uint8Array> {
  return new Uint8Array(randomBytes(count));
}

export function randomUUID(): string {
  return nodeRandomUUID();
}

export class AESEncryptionKey {
  private constructor(readonly bytes: Buffer) {}

  static async generate(size: number = AESKeySize.AES256): Promise<AESEncryptionKey> {
    return new AESEncryptionKey(randomBytes(size / 8));
  }

  static async import(encoded: string, encoding: 'base64' | 'hex'): Promise<AESEncryptionKey> {
    const bytes = Buffer.from(encoded, encoding);
    if (![16, 24, 32].includes(bytes.length)) throw new Error('Invalid AES key length.');
    return new AESEncryptionKey(bytes);
  }

  async encoded(encoding: 'base64' | 'hex'): Promise<string> {
    return this.bytes.toString(encoding);
  }
}

export class AESSealedData {
  constructor(
    readonly iv: Uint8Array,
    readonly ciphertext: Uint8Array,
    readonly tag: Uint8Array
  ) {}

  static fromCombined(
    combined: Uint8Array,
    config: { ivLength?: number; tagLength?: number } = {}
  ): AESSealedData {
    const ivLength = config.ivLength ?? 12;
    const tagLength = config.tagLength ?? 16;
    if (combined.length < ivLength + tagLength) throw new Error('Sealed data too short.');
    return new AESSealedData(
      combined.slice(0, ivLength),
      combined.slice(ivLength, combined.length - tagLength),
      combined.slice(combined.length - tagLength)
    );
  }

  async combined(_encoding: 'bytes' = 'bytes'): Promise<Uint8Array> {
    const out = new Uint8Array(this.iv.length + this.ciphertext.length + this.tag.length);
    out.set(this.iv, 0);
    out.set(this.ciphertext, this.iv.length);
    out.set(this.tag, this.iv.length + this.ciphertext.length);
    return out;
  }
}

function algorithmFor(key: AESEncryptionKey): 'aes-128-gcm' | 'aes-192-gcm' | 'aes-256-gcm' {
  return `aes-${key.bytes.length * 8}-gcm` as 'aes-256-gcm';
}

export async function aesEncryptAsync(
  plaintext: Uint8Array,
  key: AESEncryptionKey,
  options: { additionalData?: Uint8Array } = {}
): Promise<AESSealedData> {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithmFor(key), key.bytes, iv);
  if (options.additionalData) cipher.setAAD(options.additionalData);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return new AESSealedData(new Uint8Array(iv), new Uint8Array(ciphertext), new Uint8Array(cipher.getAuthTag()));
}

export async function aesDecryptAsync(
  sealed: AESSealedData,
  key: AESEncryptionKey,
  options: { output?: 'bytes' | 'base64'; additionalData?: Uint8Array } = {}
): Promise<Uint8Array> {
  const decipher = createDecipheriv(algorithmFor(key), key.bytes, sealed.iv);
  if (options.additionalData) decipher.setAAD(options.additionalData);
  decipher.setAuthTag(sealed.tag);
  // Throws on a failed tag check — a tampered file, the wrong key, or the
  // wrong additional data — exactly as the native implementation rejects.
  return new Uint8Array(Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]));
}
