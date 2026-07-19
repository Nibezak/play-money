ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_externalId_key" ON "Transaction"("externalId") WHERE "externalId" IS NOT NULL;

ALTER TABLE "TransactionEntry"
  ADD CONSTRAINT "TransactionEntry_amount_positive" CHECK ("amount" > 0);

CREATE TABLE IF NOT EXISTS "LedgerIntegrityIssue" (
  id text PRIMARY KEY, "issueType" text NOT NULL, severity text NOT NULL, "accountId" text,
  "transactionEntryId" text, details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'OPEN', "createdAt" timestamptz NOT NULL DEFAULT now(), "resolvedAt" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "LedgerIntegrityIssue_entry_key" ON "LedgerIntegrityIssue"("issueType", "transactionEntryId") WHERE "transactionEntryId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "LedgerIntegrityIssue_account_key" ON "LedgerIntegrityIssue"("issueType", "accountId") WHERE "accountId" IS NOT NULL;

INSERT INTO "LedgerIntegrityIssue"(id, "issueType", severity, "transactionEntryId", details)
SELECT 'self_' || e.id, 'SELF_TRANSFER', 'MEDIUM', e.id, jsonb_build_object('amount', e.amount, 'assetType', e."assetType", 'transactionId', e."transactionId")
FROM "TransactionEntry" e WHERE e."fromAccountId" = e."toAccountId" ON CONFLICT DO NOTHING;

INSERT INTO "LedgerIntegrityIssue"(id, "issueType", severity, "accountId", details)
SELECT 'negative_' || b.id, 'NEGATIVE_USER_CURRENCY_BALANCE', 'CRITICAL', b."accountId", jsonb_build_object('balanceId', b.id, 'total', b.total)
FROM "Balance" b JOIN "Account" a ON a.id = b."accountId"
WHERE b.total < 0 AND b."assetType" = 'CURRENCY' AND a.type = 'USER' ON CONFLICT DO NOTHING;

UPDATE "User" u SET settings = CASE WHEN jsonb_typeof(COALESCE(u.settings, '{}'::jsonb)) = 'object' THEN COALESCE(u.settings, '{}'::jsonb) ELSE '{}'::jsonb END
  || '{"tradingBlocked":true,"risk_hold":true,"ledgerIntegrityReview":true}'::jsonb
WHERE EXISTS (SELECT 1 FROM "Account" a JOIN "Balance" b ON b."accountId" = a.id WHERE a."userId" = u.id AND a.type = 'USER' AND b."assetType" = 'CURRENCY' AND b.total < 0);

CREATE OR REPLACE FUNCTION protect_user_currency_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE account_type "AccountType";
BEGIN
  SELECT type INTO account_type FROM "Account" WHERE id = NEW."accountId";
  IF NEW."assetType" = 'CURRENCY' AND account_type = 'USER' AND NEW.total < 0
     AND (TG_OP = 'INSERT' OR OLD.total >= 0 OR NEW.total < OLD.total) THEN
    RAISE EXCEPTION 'user currency balance cannot be debited below zero';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_user_currency_balance_trigger ON "Balance";
CREATE TRIGGER protect_user_currency_balance_trigger BEFORE INSERT OR UPDATE OF total ON "Balance" FOR EACH ROW EXECUTE FUNCTION protect_user_currency_balance();
