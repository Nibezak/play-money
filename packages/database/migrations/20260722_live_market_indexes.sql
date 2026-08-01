CREATE INDEX IF NOT EXISTS "Market_eventId_idx"
  ON "Market" ("eventId");

CREATE INDEX IF NOT EXISTS "Market_closeDate_resolvedAt_canceledAt_idx"
  ON "Market" ("closeDate", "resolvedAt", "canceledAt");

CREATE INDEX IF NOT EXISTS "MarketOption_marketId_createdAt_idx"
  ON "MarketOption" ("marketId", "createdAt");

CREATE INDEX IF NOT EXISTS "Transaction_marketId_type_isReverse_createdAt_idx"
  ON "Transaction" ("marketId", "type", "isReverse", "createdAt");

CREATE INDEX IF NOT EXISTS "Transaction_initiatorId_createdAt_idx"
  ON "Transaction" ("initiatorId", "createdAt");

CREATE INDEX IF NOT EXISTS "TransactionEntry_transactionId_idx"
  ON "TransactionEntry" ("transactionId");

CREATE INDEX IF NOT EXISTS "TransactionEntry_toAccountId_assetType_assetId_idx"
  ON "TransactionEntry" ("toAccountId", "assetType", "assetId");

CREATE INDEX IF NOT EXISTS "TransactionEntry_fromAccountId_assetType_assetId_idx"
  ON "TransactionEntry" ("fromAccountId", "assetType", "assetId");

CREATE INDEX IF NOT EXISTS "MarketOptionPosition_marketId_accountId_idx"
  ON "MarketOptionPosition" ("marketId", "accountId");
