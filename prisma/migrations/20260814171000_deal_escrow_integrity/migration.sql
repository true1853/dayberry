-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "businessKey" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Deal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "myLotId" TEXT,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT NOT NULL DEFAULT 'created',
    "status" TEXT NOT NULL DEFAULT 'active',
    "initiatorConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "partnerConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "disputedAt" DATETIME,
    "disputeById" TEXT,
    "disputeNote" TEXT NOT NULL DEFAULT '',
    "createCommandKey" TEXT,
    "escrowTransactionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Deal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Deal_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Deal_myLotId_fkey" FOREIGN KEY ("myLotId") REFERENCES "Lot" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Deal_escrowTransactionId_fkey" FOREIGN KEY ("escrowTransactionId") REFERENCES "Transaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Deal" ("createdAt", "credits", "disputeById", "disputeNote", "disputedAt", "id", "initiatorConfirmed", "lotId", "myLotId", "partnerConfirmed", "stage", "status", "updatedAt", "userId") SELECT "createdAt", "credits", "disputeById", "disputeNote", "disputedAt", "id", "initiatorConfirmed", "lotId", "myLotId", "partnerConfirmed", "stage", "status", "updatedAt", "userId" FROM "Deal";
DROP TABLE "Deal";
ALTER TABLE "new_Deal" RENAME TO "Deal";
CREATE UNIQUE INDEX "Deal_createCommandKey_key" ON "Deal"("createCommandKey");
CREATE UNIQUE INDEX "Deal_escrowTransactionId_key" ON "Deal"("escrowTransactionId");
CREATE INDEX "Deal_status_idx" ON "Deal"("status");
CREATE INDEX "Deal_userId_idx" ON "Deal"("userId");
CREATE INDEX "Deal_lotId_idx" ON "Deal"("lotId");
CREATE INDEX "Deal_createdAt_idx" ON "Deal"("createdAt");
CREATE INDEX "Deal_disputedAt_idx" ON "Deal"("disputedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_businessKey_key" ON "Transaction"("businessKey");
