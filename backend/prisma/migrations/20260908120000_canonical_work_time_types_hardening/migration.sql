-- Hardening of WKU work time type: ensure requires_order = false and is_absence = true.
-- Preserves existing custom name and is_system ownership.
-- Does NOT take over custom types or insert ambiguous codes without authorization.

INSERT INTO "work_time_types" ("code", "name", "requires_order", "is_absence", "is_system", "created_at", "updated_at")
VALUES ('WKU', 'WKU', false, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
    "requires_order" = false,
    "is_absence" = true,
    "updated_at" = CASE
        WHEN "work_time_types"."requires_order" != false OR "work_time_types"."is_absence" != true
        THEN CURRENT_TIMESTAMP
        ELSE "work_time_types"."updated_at"
    END;
