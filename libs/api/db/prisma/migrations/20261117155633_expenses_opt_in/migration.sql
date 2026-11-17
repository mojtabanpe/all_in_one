-- AlterTable
ALTER TABLE "users" ALTER COLUMN "enabledApplets" SET DEFAULT ARRAY['planner', 'english', 'health']::TEXT[];

-- Expenses becomes an opt-in experiment for every account (directive 160). Customers never had a way to choose it,
-- so the 'expenses' they carry came only from the old column default: take it out. Admins keep their choice.
UPDATE "users"
SET "enabledApplets" = array_remove("enabledApplets", 'expenses')
WHERE "role" = 'CUSTOMER' AND 'expenses' = ANY("enabledApplets");
