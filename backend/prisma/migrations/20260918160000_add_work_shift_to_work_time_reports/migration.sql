-- CreateEnum
CREATE TYPE "WorkShift" AS ENUM ('FIRST', 'SECOND');

-- AlterTable
ALTER TABLE "work_time_reports" ADD COLUMN "work_shift" "WorkShift";
