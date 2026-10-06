/*
  Warnings:

  - You are about to drop the `AccessToken` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "AccessToken";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "PersonalAccessToken" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "abilities" TEXT,
    "expiresAt" DATETIME,
    "revokedAt" DATETIME,
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PersonalAccessToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuthExchangeCode" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "codeHash" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "PersonalAccessToken_tokenHash_key" ON "PersonalAccessToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PersonalAccessToken_userId_idx" ON "PersonalAccessToken"("userId");

-- CreateIndex
CREATE INDEX "PersonalAccessToken_expiresAt_idx" ON "PersonalAccessToken"("expiresAt");

-- CreateIndex
CREATE INDEX "PersonalAccessToken_revokedAt_idx" ON "PersonalAccessToken"("revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthExchangeCode_codeHash_key" ON "AuthExchangeCode"("codeHash");

-- CreateIndex
CREATE INDEX "AuthExchangeCode_userId_idx" ON "AuthExchangeCode"("userId");

-- CreateIndex
CREATE INDEX "AuthExchangeCode_expiresAt_idx" ON "AuthExchangeCode"("expiresAt");

-- CreateIndex
CREATE INDEX "AuthExchangeCode_usedAt_idx" ON "AuthExchangeCode"("usedAt");
