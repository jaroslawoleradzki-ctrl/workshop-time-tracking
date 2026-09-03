CREATE TABLE "company_calendar_days" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "is_working_day" BOOLEAN NOT NULL,
    "reason" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_calendar_days_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_calendar_days_date_key" ON "company_calendar_days"("date");
