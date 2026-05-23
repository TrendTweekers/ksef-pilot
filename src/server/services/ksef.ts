import { decryptSecret } from "./crypto.js";

export async function testKsefToken(encryptedToken: string) {
  const token = decryptSecret(encryptedToken);

  return {
    connected: token.trim().length > 0,
    checkedAt: new Date().toISOString()
  };
}
