import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getMasterKey(): Buffer {
  const secret = process.env["WEBHOOK_SECRETS_KEY"] || process.env["AUTH_SECRET"] || "test_webhook_secrets_key_not_sec_";
  return Buffer.alloc(32, secret, "utf8");
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getMasterKey(), iv);
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted}`;
}

export function decryptSecret(secretRef: string): string | null {
  if (secretRef.startsWith("env:")) {
    const envName = secretRef.slice("env:".length);
    const value = process.env[envName];
    return value === undefined || value === "" ? null : value;
  }

  if (!secretRef.startsWith("enc:")) {
    return secretRef;
  }

  try {
    const parts = secretRef.slice("enc:".length).split(":");
    if (parts.length !== 3) {
      return null;
    }
    const ivBase64 = parts[0];
    const tagBase64 = parts[1];
    const ciphertextBase64 = parts[2];
    if (ivBase64 === undefined || tagBase64 === undefined || ciphertextBase64 === undefined) {
      return null;
    }
    const iv = Buffer.from(ivBase64, "base64");
    const tag = Buffer.from(tagBase64, "base64");
    const decipher = createDecipheriv(ALGORITHM, getMasterKey(), iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(ciphertextBase64, "base64", "utf8") as string;
    decrypted += decipher.final("utf8") as string;
    return decrypted;
  } catch (error) {
    return null;
  }
}
