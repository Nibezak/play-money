UPDATE "Balance"
SET "total" = ROUND("total", 2)
WHERE "assetType" = 'CURRENCY';

ALTER TABLE "Balance"
ADD CONSTRAINT "Balance_currency_two_decimal_places"
CHECK ("assetType" <> 'CURRENCY' OR "total" = ROUND("total", 2));
