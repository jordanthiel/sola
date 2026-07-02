-- Overnight and vacation pay settings

ALTER TYPE time_off_type ADD VALUE IF NOT EXISTS 'vacation';

ALTER TABLE employment_settings
  ADD COLUMN IF NOT EXISTS overnight_rate_cents INTEGER,
  ADD COLUMN IF NOT EXISTS overnight_start_time TIME NOT NULL DEFAULT '22:00',
  ADD COLUMN IF NOT EXISTS overnight_end_time TIME NOT NULL DEFAULT '06:00',
  ADD COLUMN IF NOT EXISTS vacation_daily_rate_cents INTEGER;

ALTER TABLE employment_settings
  ADD CONSTRAINT employment_settings_overnight_rate_nonneg
  CHECK (overnight_rate_cents IS NULL OR overnight_rate_cents >= 0);

ALTER TABLE employment_settings
  ADD CONSTRAINT employment_settings_vacation_rate_nonneg
  CHECK (vacation_daily_rate_cents IS NULL OR vacation_daily_rate_cents >= 0);

COMMENT ON COLUMN employment_settings.overnight_rate_cents IS
  'Optional hourly rate used for overnight hours.';
COMMENT ON COLUMN employment_settings.overnight_start_time IS
  'Household-local start time for the overnight pay window.';
COMMENT ON COLUMN employment_settings.overnight_end_time IS
  'Household-local end time for the overnight pay window; values before the start time cross midnight.';
COMMENT ON COLUMN employment_settings.vacation_daily_rate_cents IS
  'Default daily rate for family vacation days where the nanny joins.';

ALTER TABLE schedule_blocks
  ADD COLUMN IF NOT EXISTS is_overnight BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS overnight_rate_cents INTEGER,
  ADD COLUMN IF NOT EXISTS overnight_start_time TIME,
  ADD COLUMN IF NOT EXISTS overnight_end_time TIME;

ALTER TABLE schedule_blocks
  ADD CONSTRAINT schedule_blocks_overnight_rate_nonneg
  CHECK (overnight_rate_cents IS NULL OR overnight_rate_cents >= 0);

COMMENT ON COLUMN schedule_blocks.is_overnight IS
  'Marks the shift as an overnight stay for calendar display and optional rate overrides.';
COMMENT ON COLUMN schedule_blocks.overnight_rate_cents IS
  'Optional shift-specific overnight hourly rate.';
COMMENT ON COLUMN schedule_blocks.overnight_start_time IS
  'Optional shift-specific start time for the overnight pay window.';
COMMENT ON COLUMN schedule_blocks.overnight_end_time IS
  'Optional shift-specific end time for the overnight pay window.';

ALTER TABLE time_off_requests
  ADD COLUMN IF NOT EXISTS nanny_joins_vacation BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vacation_daily_rate_cents INTEGER;

ALTER TABLE time_off_requests
  ADD CONSTRAINT time_off_requests_vacation_rate_nonneg
  CHECK (vacation_daily_rate_cents IS NULL OR vacation_daily_rate_cents >= 0);

COMMENT ON COLUMN time_off_requests.nanny_joins_vacation IS
  'For vacation calendar days, whether the nanny is joining the family and should be paid.';
COMMENT ON COLUMN time_off_requests.vacation_daily_rate_cents IS
  'Optional daily rate override for vacation days where the nanny joins.';

DROP FUNCTION IF EXISTS upsert_schedule_day(UUID, UUID, DATE, TIMESTAMPTZ, TIMESTAMPTZ, TEXT);

-- Parent: set or change times and optional overnight pay overrides for a specific calendar day.
CREATE OR REPLACE FUNCTION upsert_schedule_day(
  p_household_id UUID,
  p_household_nanny_id UUID,
  p_work_date DATE,
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ,
  p_notes TEXT DEFAULT NULL,
  p_is_overnight BOOLEAN DEFAULT false,
  p_overnight_rate_cents INTEGER DEFAULT NULL,
  p_overnight_start_time TIME DEFAULT NULL,
  p_overnight_end_time TIME DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_tz TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT is_parent_role(p_household_id) THEN
    RAISE EXCEPTION 'Only parents can change scheduled times';
  END IF;
  IF p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'End time must be after start time';
  END IF;
  IF p_overnight_rate_cents IS NOT NULL AND p_overnight_rate_cents < 0 THEN
    RAISE EXCEPTION 'Overnight rate must be zero or greater';
  END IF;

  SELECT timezone INTO v_tz FROM households WHERE id = p_household_id;
  v_tz := COALESCE(v_tz, 'America/New_York');

  SELECT id INTO v_id
  FROM schedule_blocks
  WHERE household_id = p_household_id
    AND household_nanny_id = p_household_nanny_id
    AND status = 'scheduled'
    AND (starts_at AT TIME ZONE v_tz)::date = p_work_date
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE schedule_blocks
    SET
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      notes = COALESCE(p_notes, notes),
      is_overnight = COALESCE(p_is_overnight, false),
      overnight_rate_cents = p_overnight_rate_cents,
      overnight_start_time = p_overnight_start_time,
      overnight_end_time = p_overnight_end_time,
      actual_ends_at = NULL,
      actual_notes = NULL,
      updated_at = now()
    WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO schedule_blocks (
    household_id,
    household_nanny_id,
    starts_at,
    ends_at,
    notes,
    status,
    is_overnight,
    overnight_rate_cents,
    overnight_start_time,
    overnight_end_time
  )
  VALUES (
    p_household_id,
    p_household_nanny_id,
    p_starts_at,
    p_ends_at,
    p_notes,
    'scheduled',
    COALESCE(p_is_overnight, false),
    p_overnight_rate_cents,
    p_overnight_start_time,
    p_overnight_end_time
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_schedule_day(
  UUID,
  UUID,
  DATE,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  TEXT,
  BOOLEAN,
  INTEGER,
  TIME,
  TIME
) TO authenticated;
