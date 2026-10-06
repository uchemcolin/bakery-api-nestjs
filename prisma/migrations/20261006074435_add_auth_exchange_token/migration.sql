/*
  Warnings:

  - Added the required column `token` to the `AuthExchangeCode` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AuthExchangeCode" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "codeHash" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_AuthExchangeCode" ("codeHash", "createdAt", "expiresAt", "id", "usedAt", "userId") SELECT "codeHash", "createdAt", "expiresAt", "id", "usedAt", "userId" FROM "AuthExchangeCode";
DROP TABLE "AuthExchangeCode";
ALTER TABLE "new_AuthExchangeCode" RENAME TO "AuthExchangeCode";
CREATE UNIQUE INDEX "AuthExchangeCode_codeHash_key" ON "AuthExchangeCode"("codeHash");
CREATE INDEX "AuthExchangeCode_userId_idx" ON "AuthExchangeCode"("userId");
CREATE INDEX "AuthExchangeCode_expiresAt_idx" ON "AuthExchangeCode"("expiresAt");
CREATE INDEX "AuthExchangeCode_usedAt_idx" ON "AuthExchangeCode"("usedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
