/*
  Warnings:

  - A unique constraint covering the columns `[clientOrderId]` on the table `Order` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."Conversation" ADD COLUMN     "messages" JSONB,
ADD COLUMN     "transcript" TEXT;

-- AlterTable
ALTER TABLE "public"."Order" ADD COLUMN     "clientOrderId" TEXT,
ADD COLUMN     "extras" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "product" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "size" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'confirmed',
ADD COLUMN     "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'takeaway';

-- CreateIndex
CREATE UNIQUE INDEX "Order_clientOrderId_key" ON "public"."Order"("clientOrderId");
