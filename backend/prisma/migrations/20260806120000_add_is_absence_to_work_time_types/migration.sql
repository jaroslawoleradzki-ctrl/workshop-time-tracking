-- Add an explicit, independent absence classification to work time types.
ALTER TABLE "work_time_types"
ADD COLUMN "is_absence" BOOLEAN NOT NULL DEFAULT false;

-- Deterministically classify only the standard absence codes known by the application.
UPDATE "work_time_types"
SET "is_absence" = true
WHERE "code" IN ('UW', 'UOK', 'UŻ', 'L4');
