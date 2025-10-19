import crypto from "node:crypto";

/**
 * -----------------------------------------------------------
 *  messageCrypto.ts
 *  - HKDF(SHA-256) -> AES-256-GCM session key
 *  - Encrypt/Decrypt payload (iv.ciphertext.tag base64-url)
 *  - RSA-SHA256 sign/verify (PEM)
 * -----------------------------------------------------------
 */

export type SessionKey = Buffer; // 32 bytes
export type Base64Url = string;

/** Base64url helpers (compacto para guardar em Message.text) */
const b64u = {
  enc: (buf: Buffer) =>
    buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""),
  dec: (s: string) =>
    Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4), "base64"),
};

/** HKDF (RFC 5869) */
export function hkdfSha256(ikm: Buffer, salt: Buffer, info: Buffer, length = 32): Buffer {
  const prk = crypto.createHmac("sha256", salt).update(ikm).digest();
  let t = Buffer.alloc(0);
  let okm = Buffer.alloc(0);
  let i = 0;
  while (okm.length < length) {
    i++;
    t = crypto.createHmac("sha256", prk).update(Buffer.concat([t, info, Buffer.from([i])])).digest();
    okm = Buffer.concat([okm, t]);
  }
  return okm.subarray(0, length);
}

/** Deriva chave de sessão AES-256 a partir de um segredo partilhado (ex.: ECDH/DH) */
export function deriveSessionKeyFromSharedSecret(params: {
  sharedSecret: Buffer;             // vindo de DH/ECDH (NUNCA guardar)
  chatId: string;
  memberIds: string[];              // ordena p/ estabilidade
}): SessionKey {
  const { sharedSecret, chatId } = params;
  const members = [...params.memberIds].sort().join(",");
  const salt = crypto.createHash("sha256").update(`chat:${chatId}|${members}`).digest();
  const info = Buffer.from("msg-session-key-v1");
  return hkdfSha256(sharedSecret, salt, info, 32);
}

/** ⚠️ DEV ONLY: fallback para gerar a mesma chave dos dois lados sem DH (para testes) */
export function deriveSessionKeyDevFallback(params: {
  sharedStringSecret: string;       // ex.: chatId + sorted(userIds) + buildSecret
  chatId?: string;
}): SessionKey {
  const { sharedStringSecret, chatId } = params;
  const ikm = crypto.createHash("sha256").update(sharedStringSecret).digest();
  const salt = crypto.createHash("sha256").update(`dev-salt:${chatId ?? ""}`).digest();
  const info = Buffer.from("dev-session-key-v1");
  return hkdfSha256(ikm, salt, info, 32);
}

/** Hash SHA-256 (hex) para integrity extra/opcional */
export function sha256Hex(data: Buffer | string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/** Assina (RSA-SHA256) um payload já cifrado (string compacta) */
export function signPayloadRS256(privateKeyPem: string, compactPayload: string): Base64Url {
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(compactPayload);
  signer.end();
  const sig = signer.sign(privateKeyPem); // Buffer
  return b64u.enc(sig);
}

/** Verifica assinatura (RSA-SHA256) do payload compactado */
export function verifyPayloadRS256(publicKeyPem: string, compactPayload: string, signatureB64u: Base64Url): boolean {
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(compactPayload);
  verifier.end();
  const sig = b64u.dec(signatureB64u);
  return verifier.verify(publicKeyPem, sig);
}

/**
 * Cifra mensagem com AES-256-GCM.
 * Retorna string compacta:  base64url(iv).base64url(ciphertext).base64url(tag)
 * Esta string compacta cabe em Message.text.
 */
export function encryptAesGcm(plaintext: string, sessionKey: SessionKey): {
  compact: string;       // -> guarda isto no Message.text
  iv: Base64Url;
  tag: Base64Url;
  ciphertext: Base64Url;
} {
  if (sessionKey.length !== 32) throw new Error("Invalid session key length (need 32 bytes)");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", sessionKey, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();
  const ivB64 = b64u.enc(iv);
  const ctB64 = b64u.enc(ct);
  const tagB64 = b64u.enc(tag);
  return {
    compact: `${ivB64}.${ctB64}.${tagB64}`,
    iv: ivB64,
    tag: tagB64,
    ciphertext: ctB64,
  };
}

/** Decifra mensagem AES-256-GCM a partir da string compacta (iv.ct.tag) */
export function decryptAesGcm(compact: string, sessionKey: SessionKey): string {
  if (sessionKey.length !== 32) throw new Error("Invalid session key length (need 32 bytes)");
  const [ivB64, ctB64, tagB64] = compact.split(".");
  if (!ivB64 || !ctB64 || !tagB64) throw new Error("Invalid compact payload format");
  const iv = b64u.dec(ivB64);
  const ct = b64u.dec(ctB64);
  const tag = b64u.dec(tagB64);
  const decipher = crypto.createDecipheriv("aes-256-gcm", sessionKey, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/**
 * Empacota tudo p/ guardar em Prisma.Message:
 * - text:   payload compactado (iv.ct.tag)
 * - sha256: hash do payload compactado (integridade adicional)
 * - signature: assinatura RSA do compact payload (não repúdio)
 */
export function sealMessage(params: {
  plaintext: string;
  sessionKey: SessionKey;
  senderPrivateKeyPem: string;
}) {
  const { plaintext, sessionKey, senderPrivateKeyPem } = params;
  const enc = encryptAesGcm(plaintext, sessionKey);
  const payloadHash = sha256Hex(enc.compact);
  const signature = signPayloadRS256(senderPrivateKeyPem, enc.compact);
  return {
    text: enc.compact,     // grava em Message.text
    sha256: payloadHash,   // grava em Message.sha256
    signature,             // grava em Message.signature
  };
}

/** Abre e valida uma mensagem vinda da BD */
export function openMessage(params: {
  compactText: string;              // Message.text
  sessionKey: SessionKey;
  authorPublicKeyPem: string;
  expectedSha256?: string | null;   // Message.sha256 (opcional, valida se existir)
  signatureB64u?: string | null;    // Message.signature (opcional, valida se existir)
}): { plaintext: string; ok: boolean; reason?: string } {
  const { compactText, sessionKey, authorPublicKeyPem, expectedSha256, signatureB64u } = params;

  if (expectedSha256) {
    const actual = sha256Hex(compactText);
    if (actual !== expectedSha256) {
      return { plaintext: "", ok: false, reason: "SHA256_MISMATCH" };
    }
  }

  if (signatureB64u) {
    const valid = verifyPayloadRS256(authorPublicKeyPem, compactText, signatureB64u);
    if (!valid) return { plaintext: "", ok: false, reason: "BAD_SIGNATURE" };
  }

  const plaintext = decryptAesGcm(compactText, sessionKey);
  return { plaintext, ok: true };
}
