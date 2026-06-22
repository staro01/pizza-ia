-- AlterTable
ALTER TABLE "public"."Restaurant" ADD COLUMN     "address" TEXT,
ADD COLUMN     "allergensInfo" TEXT,
ADD COLUMN     "currentPromos" TEXT,
ADD COLUMN     "deliveryEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "deliveryFee" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "deliveryMinimum" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "estimatedPrepTime" INTEGER DEFAULT 20,
ADD COLUMN     "openingHours" JSONB,
ADD COLUMN     "paymentMethods" TEXT DEFAULT 'CB, espèces',
ADD COLUMN     "vacationMessage" TEXT DEFAULT 'Le restaurant est actuellement fermé. Merci de rappeler.',
ADD COLUMN     "vacationMode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "welcomeMessage" TEXT;

-- CreateTable
CREATE TABLE "public"."MenuItem" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "sizePrices" JSONB,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MenuItem_restaurantId_idx" ON "public"."MenuItem"("restaurantId");

-- AddForeignKey
ALTER TABLE "public"."MenuItem" ADD CONSTRAINT "MenuItem_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "public"."Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
