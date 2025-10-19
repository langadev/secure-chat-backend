// ex: src/lib/crypto/session.ts (client)
import { deriveSessionKeyDevFallback } from "./messageCrypto.js";

export function getDevSessionKey(chatId: string, memberIds: string[]) {
  const shared = `dev:${chatId}|${[...memberIds].sort().join(",")}`;
  return deriveSessionKeyDevFallback({ sharedStringSecret: shared, chatId });
}
