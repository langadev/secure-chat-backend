/*
  Warnings:

  - You are about to drop the column `isAdmin` on the `ChatParticipant` table. All the data in the column will be lost.
  - You are about to drop the column `isTyping` on the `ChatParticipant` table. All the data in the column will be lost.
  - You are about to drop the column `lastReadAt` on the `ChatParticipant` table. All the data in the column will be lost.
  - You are about to drop the column `tokenHash` on the `RefreshToken` table. All the data in the column will be lost.
  - You are about to drop the column `privateKey` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `publicKey` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[token]` on the table `RefreshToken` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'FILE';

-- AlterTable
ALTER TABLE "ChatParticipant" DROP COLUMN "isAdmin",
DROP COLUMN "isTyping",
DROP COLUMN "lastReadAt";

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "iv" TEXT;

-- AlterTable
ALTER TABLE "RefreshToken" DROP COLUMN "tokenHash",
ADD COLUMN     "token" TEXT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "privateKey",
DROP COLUMN "publicKey",
ADD COLUMN     "publicKeyPem" TEXT;

-- CreateTable
CREATE TABLE "ChatKey" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "encAesKeyB64" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatKey_userId_idx" ON "ChatKey"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatKey_chatId_userId_key" ON "ChatKey"("chatId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- AddForeignKey
ALTER TABLE "ChatKey" ADD CONSTRAINT "ChatKey_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatKey" ADD CONSTRAINT "ChatKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
