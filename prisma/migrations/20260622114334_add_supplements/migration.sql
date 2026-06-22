-- CreateTable
CREATE TABLE "public"."Supplement" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Supplement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Supplement_restaurantId_idx" ON "public"."Supplement"("restaurantId");

-- AddForeignKey
ALTER TABLE "public"."Supplement" ADD CONSTRAINT "Supplement_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "public"."Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
