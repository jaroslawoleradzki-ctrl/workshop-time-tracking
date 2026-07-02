-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "hours_per_unit" DECIMAL(10,2),
ADD COLUMN     "order_date" TIMESTAMP(3),
ADD COLUMN     "planned_shipment_date" TIMESTAMP(3);

-- Set order_date to created_at
UPDATE "orders" SET "order_date" = "created_at";

-- Calculate hours_per_unit: hoursPerUnit = plannedHours / quantity
-- Fallback logic: if quantity is NULL or <= 0, we fallback to planned_hours. If planned_hours is also null/<=0, we use 0.00.
UPDATE "orders" SET "hours_per_unit" = COALESCE(
  CASE
    WHEN "quantity" IS NULL OR "quantity" <= 0 THEN "planned_hours"
    ELSE "planned_hours" / "quantity"
  END,
  0.00
);

-- Set columns to NOT NULL
ALTER TABLE "orders" ALTER COLUMN "hours_per_unit" SET NOT NULL;
ALTER TABLE "orders" ALTER COLUMN "order_date" SET NOT NULL;
