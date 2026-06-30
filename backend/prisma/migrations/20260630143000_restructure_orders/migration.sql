-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('OPEN', 'SUSPENDED', 'CLOSED');

-- Rename Columns Safely
ALTER TABLE orders RENAME COLUMN product_number TO product_code;
ALTER TABLE orders RENAME COLUMN estimated_hours TO planned_hours;
ALTER TABLE orders RENAME COLUMN closed_at TO completion_date;

-- Add New Columns
ALTER TABLE orders ADD COLUMN quantity DECIMAL(10, 2);
ALTER TABLE orders ADD COLUMN quantity_unit VARCHAR(20) NOT NULL DEFAULT 'szt.';
ALTER TABLE orders ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;

-- Migrate Existing Status Values
UPDATE orders SET status = 'OPEN' WHERE status = 'open';
UPDATE orders SET status = 'SUSPENDED' WHERE status = 'suspended';
UPDATE orders SET status = 'CLOSED' WHERE status = 'closed';
UPDATE orders SET status = 'OPEN' WHERE status NOT IN ('open', 'suspended', 'closed') OR status IS NULL;

-- Drop old default and convert Status Column to Enum
ALTER TABLE orders ALTER COLUMN status DROP DEFAULT;
ALTER TABLE orders ALTER COLUMN status TYPE "OrderStatus" USING status::"OrderStatus";
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'OPEN';

-- Make product_code and accounting_account nullable
ALTER TABLE orders ALTER COLUMN product_code DROP NOT NULL;
ALTER TABLE orders ALTER COLUMN accounting_account DROP NOT NULL;
