-- CreateTable
CREATE TABLE "Setting" (
    "id" SERIAL NOT NULL,
    "group" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllowedMarketCreator" (
    "walletAddress" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllowedMarketCreator_pkey" PRIMARY KEY ("walletAddress")
);

-- CreateIndex
CREATE INDEX "AllowedMarketCreator_sourceType_idx" ON "AllowedMarketCreator"("sourceType");

-- CreateIndex
CREATE INDEX "AllowedMarketCreator_sourceUrl_idx" ON "AllowedMarketCreator"("sourceUrl");
-- CreateIndex
CREATE UNIQUE INDEX "Setting_group_key_key" ON "Setting"("group", "key");
