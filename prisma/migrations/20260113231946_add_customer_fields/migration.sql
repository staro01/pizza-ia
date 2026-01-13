-- AlterTable
ALTER TABLE "public"."Order" ADD COLUMN     "address" TEXT,
ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "phone" TEXT,
ALTER COLUMN "status" SET DEFAULT 'draft';
