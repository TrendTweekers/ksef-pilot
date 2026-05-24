import crypto from "node:crypto";
import { env } from "../config/env.js";

const algorithm = "aes-256-gcm";
const key = Buffer.from(env.ENCRYPTION_KEY, "base64");

if (key.length !== 32) {
  throw new Error("ENCRYPTION_KEY must be a base64-encoded 32-byte key. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"");
}

export function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, ciphertext].map((part) => part.toString("base64")).join(":");
}

export function decryptSecret(value: string) {
  const [iv, authTag, ciphertext] = value.split(":").map((part) => Buffer.from(part, "base64"));
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
