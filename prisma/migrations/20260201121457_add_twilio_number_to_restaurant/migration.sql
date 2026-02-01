/*
  Warnings:

  - A unique constraint covering the columns `[twilioNumber]` on the table `Restaurant` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."Restaurant" ADD COLUMN     "twilioNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_twilioNumber_key" ON "public"."Restaurant"("twilioNumber");
