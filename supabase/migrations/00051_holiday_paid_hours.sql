-- Paid holiday hours and explicit holiday-worked shifts

ALTER TABLE schedule_blocks
  ADD COLUMN IF NOT EXISTS holiday_worked BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN schedule_blocks.holiday_worked IS
  'When true, this shift represents hours the nanny actually worked on a paid holiday.';

DROP FUNCTION IF EXISTS upsert_schedule_day(
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
);

-- Parent: set or change times and optional overnight/holiday-work overrides for a calendar day.
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
  p_overnight_end_time TIME DEFAULT NULL,
  p_holiday_worked BOOLEAN DEFAULT false
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
      holiday_worked = COALESCE(p_holiday_worked, false),
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
    overnight_end_time,
    holiday_worked
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
    p_overnight_end_time,
    COALESCE(p_holiday_worked, false)
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
  TIME,
  BOOLEAN
) TO authenticated;
