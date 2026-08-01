ALTER TABLE "Market"
  ADD COLUMN IF NOT EXISTS "volume" DECIMAL(20,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "MarketVolumeBucket" (
  "id" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "bucketStart" TIMESTAMP(3) NOT NULL,
  "volume" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketVolumeBucket_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarketVolumeBucket_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "MarketVolumeBucket_marketId_bucketStart_key"
  ON "MarketVolumeBucket"("marketId", "bucketStart");
CREATE INDEX IF NOT EXISTS "MarketVolumeBucket_bucketStart_marketId_idx"
  ON "MarketVolumeBucket"("bucketStart", "marketId");

INSERT INTO "MarketVolumeBucket" ("id", "marketId", "bucketStart", "volume", "updatedAt")
SELECT
  md5(t."marketId" || ':' || date_trunc('hour', t."createdAt")::text),
  t."marketId",
  date_trunc('hour', t."createdAt"),
  ROUND(COALESCE(SUM(te.amount), 0), 2),
  CURRENT_TIMESTAMP
FROM "Transaction" t
JOIN "TransactionEntry" te ON te."transactionId" = t.id
JOIN "Account" destination ON destination.id = te."toAccountId"
WHERE t."marketId" IS NOT NULL
  AND t.type = 'TRADE_BUY'
  AND t."isReverse" IS NULL
  AND te."assetType" = 'CURRENCY'
  AND te."assetId" = 'PRIMARY'
  AND destination.type = 'MARKET_CLEARING'
GROUP BY t."marketId", date_trunc('hour', t."createdAt")
ON CONFLICT ("marketId", "bucketStart") DO UPDATE
SET "volume" = EXCLUDED."volume", "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "Market" m
SET "volume" = totals.volume
FROM (
  SELECT "marketId", ROUND(SUM(volume), 2) AS volume
  FROM "MarketVolumeBucket"
  GROUP BY "marketId"
) totals
WHERE totals."marketId" = m.id;
