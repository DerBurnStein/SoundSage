import crypto from 'crypto';
import { KeyManagementServiceClient } from '@google-cloud/kms';

const kmsKeyName = process.env.GCP_KMS_KEY_NAME;
const kmsClient = kmsKeyName ? new KeyManagementServiceClient() : null;

const localKey = crypto.createHash('sha256').update(process.env.TOKEN_ENCRYPTION_SECRET || 'dev-secret-change-me').digest();

function localEncrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', localKey, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `local:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

function localDecrypt(payload) {
  const [, ivB64, tagB64, dataB64] = payload.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', localKey, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const out = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return out.toString('utf8');
}

export async function encryptToken(plaintext) {
  if (kmsClient && kmsKeyName) {
    const [res] = await kmsClient.encrypt({ name: kmsKeyName, plaintext: Buffer.from(plaintext) });
    return `gcpkms:${Buffer.from(res.ciphertext).toString('base64')}`;
  }
  return localEncrypt(plaintext);
}

export async function decryptToken(payload) {
  if (payload.startsWith('gcpkms:') && kmsClient && kmsKeyName) {
    const ciphertext = Buffer.from(payload.replace('gcpkms:', ''), 'base64');
    const [res] = await kmsClient.decrypt({ name: kmsKeyName, ciphertext });
    return Buffer.from(res.plaintext).toString('utf8');
  }
  return localDecrypt(payload);
}
