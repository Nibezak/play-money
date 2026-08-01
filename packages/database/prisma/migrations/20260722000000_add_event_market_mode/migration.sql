ALTER TABLE "Event"
ADD COLUMN "marketMode" TEXT NOT NULL DEFAULT 'binary';

UPDATE "Event" AS event
SET "marketMode" = creation."marketMode"
FROM "EventCreation" AS creation
WHERE creation.slug = event.slug
  AND creation."marketMode" IS NOT NULL;

UPDATE "Event" AS event
SET "marketMode" = 'multi_unique'
WHERE event."marketMode" = 'binary'
  AND (
    SELECT COUNT(*)
    FROM "Market" AS market
    WHERE market."eventId" = event.id
  ) > 1;
