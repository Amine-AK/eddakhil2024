-- AlterTable
ALTER TABLE "EntryEvent" ADD COLUMN     "idempotencyKey" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "EntryEvent_idempotencyKey_key" ON "EntryEvent"("idempotencyKey");

