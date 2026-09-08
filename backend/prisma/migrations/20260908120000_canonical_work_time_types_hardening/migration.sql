-- Hardening of canonical WorkTimeTypes: ensure standard types have correct requires_order, is_absence, and is_system flags.

INSERT INTO "work_time_types" ("code", "name", "requires_order", "is_absence", "is_system", "created_at", "updated_at")
VALUES
    ('G', 'Standardowe godziny pracy', true, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('NDR', 'Nadgodziny', true, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('NS', 'Nadgodziny sobota/niedziela', true, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('UW', 'Urlop wypoczynkowy', false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('UOK', 'Urlop okolicznościowy', false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('UŻ', 'Urlop na żądanie', false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('L4', 'Zwolnienie chorobowe', false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('WKU', 'Wojsko', false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('NN', 'Nieobecność nieusprawiedliwiona', false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('NU', 'Nieobecność usprawiedliwiona', false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('NUN', 'Nieobecność usprawiedliwiona niepłatna', false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('NUP', 'Nieobecność usprawiedliwiona płatna', false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('UB', 'Urlop bezpłatny', false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('UO', 'Urlop ojcowski', false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('UPP', 'Urlop płatny pozostały', false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('OP', 'Opieka nad dzieckiem (art. 188 KP)', false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
    "requires_order" = EXCLUDED."requires_order",
    "is_absence" = EXCLUDED."is_absence",
    "is_system" = EXCLUDED."is_system",
    "updated_at" = CURRENT_TIMESTAMP;
