-- Backfill default weekly schedule for nannies created before templates existed
INSERT INTO nanny_schedule_templates (household_id, household_nanny_id, day_of_week, start_time, end_time, enabled)
SELECT
  hn.household_id,
  hn.id,
  d,
  '09:00'::TIME,
  '17:00'::TIME,
  d BETWEEN 1 AND 5
FROM household_nannies hn
CROSS JOIN generate_series(0, 6) AS d
ON CONFLICT (household_id, household_nanny_id, day_of_week) DO NOTHING;
