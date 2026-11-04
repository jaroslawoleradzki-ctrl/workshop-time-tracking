-- CreateEnum
CREATE TYPE "AccountingCategory" AS ENUM ('ORDER_WORK', 'ABSENCE', 'OFF_ORDER_WORK');

-- AlterTable
ALTER TABLE "work_time_types" ADD COLUMN     "accounting_category" "AccountingCategory";

-- Legacy rows remain NULL. Explicit categories must agree with compatibility flags.
ALTER TABLE "work_time_types" ADD CONSTRAINT "work_time_types_accounting_flags_check"
CHECK ("accounting_category" IS NULL OR
 ("accounting_category" = 'ORDER_WORK' AND "requires_order" AND NOT "is_absence") OR
 ("accounting_category" = 'ABSENCE' AND NOT "requires_order" AND "is_absence") OR
 ("accounting_category" = 'OFF_ORDER_WORK' AND NOT "requires_order" AND NOT "is_absence"));

-- Approved correction of the dictionary only; never rewrite work_time_reports.
-- Do not create OK if the installation does not use it.
UPDATE "work_time_types"
SET "accounting_category" = 'ABSENCE', "is_absence" = true, "requires_order" = false
WHERE "code" = 'OK';
