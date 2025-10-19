import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import bcrypt from "bcryptjs";

/** Gera e guarda par de chaves RSA (a privada cifrada com password) */
export async function initUserKeys(userId: string, password: string) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 4096,
    publicKeyEncoding: { type: "pkcs1", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  // Cifra a chave privada localmente com AES derivado da password
  const key = crypto.pbkdf2Sync(password, "salt-rsa", 310000, 32, "sha256");
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let enc = cipher.update(privateKey, "utf8", "base64");
  enc += cipher.final("base64");

  await prisma.user.update({
    where: { id: userId },
    data: { publicKeyPem: publicKey },
  });

  return { publicKey, encryptedPrivateKey: enc, iv: iv.toString("base64") };
}

/** Retorna a chave pública de um utilizador */
export async function getUserPublicKey(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { publicKeyPem: true },
  });
  return user?.publicKeyPem ?? null;
}
