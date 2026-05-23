import crypto from "node:crypto";
import { env } from "../config/env.js";

const algorithm = "aes-256-gcm";

function encryptionKey() {
  const raw = Buffer.from(env.ENCRYPTION_KEY, "base64");

  if (raw.length === 32) {
    return raw;
  }

  return crypto.createHash("sha256").update(env.ENCRYPTION_KEY).digest();
}

export function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, ciphertext].map((part) => part.toString("base64")).join(":");
}

export function decryptSecret(value: string) {
  const [iv, authTag, ciphertext] = value.split(":").map((part) => Buffer.from(part, "base64"));
  const decipher = crypto.createDecipheriv(algorithm, encryptionKey(), iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
