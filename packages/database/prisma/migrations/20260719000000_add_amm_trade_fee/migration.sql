INSERT INTO "Setting" ("group", "key", "value", "createdAt", "updatedAt")
VALUES ('fees', 'amm_trade_fee_bps', '100', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("group", "key") DO NOTHING;
