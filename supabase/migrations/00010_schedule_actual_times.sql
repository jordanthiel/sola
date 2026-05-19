-- Actual end times (nanny reports late) and nanny schedule updates

ALTER TABLE schedule_blocks
  ADD COLUMN actual_ends_at TIMESTAMPTZ,
  ADD COLUMN actual_notes TEXT,
  ADD COLUMN break_minutes INTEGER NOT NULL DEFAULT 0;

ALTER TABLE schedule_blocks
  ADD CONSTRAINT schedule_blocks_actual_after_scheduled
  CHECK (actual_ends_at IS NULL OR actual_ends_at >= ends_at);

ALTER TABLE schedule_blocks
  ADD CONSTRAINT schedule_blocks_break_nonneg
  CHECK (break_minutes >= 0);

-- Nannies can update their own shifts (e.g. report working late)
CREATE POLICY sb_nanny_update ON schedule_blocks
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM household_nannies hn
      WHERE hn.id = schedule_blocks.household_nanny_id
        AND hn.user_id = auth.uid()
        AND hn.household_id = schedule_blocks.household_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM household_nannies hn
      WHERE hn.id = schedule_blocks.household_nanny_id
        AND hn.user_id = auth.uid()
        AND hn.household_id = schedule_blocks.household_id
    )
  );

-- Parent: set or change times for a specific calendar day
CREATE OR REPLACE FUNCTION upsert_schedule_day(
  p_household_id UUID,
  p_household_nanny_id UUID,
  p_work_date DATE,
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ,
  p_notes TEXT DEFAULT NULL
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
    status
  )
  VALUES (
    p_household_id,
    p_household_nanny_id,
    p_starts_at,
    p_ends_at,
    p_notes,
    'scheduled'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Nanny (or parent): record working past scheduled end
CREATE OR REPLACE FUNCTION report_shift_late(
  p_schedule_block_id UUID,
  p_actual_ends_at TIMESTAMPTZ,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row schedule_blocks%ROWTYPE;
  v_is_parent BOOLEAN;
  v_is_nanny BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_row FROM schedule_blocks WHERE id = p_schedule_block_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Shift not found';
  END IF;

  v_is_parent := is_parent_role(v_row.household_id);
  v_is_nanny := EXISTS (
    SELECT 1 FROM household_nannies hn
    WHERE hn.id = v_row.household_nanny_id
      AND hn.user_id = auth.uid()
  );

  IF NOT v_is_parent AND NOT v_is_nanny THEN
    RAISE EXCEPTION 'Not allowed to update this shift';
  END IF;

  IF p_actual_ends_at < v_row.ends_at THEN
    RAISE EXCEPTION 'Actual end must be at or after scheduled end';
  END IF;

  UPDATE schedule_blocks
  SET
    actual_ends_at = p_actual_ends_at,
    actual_notes = p_notes,
    updated_at = now()
  WHERE id = p_schedule_block_id;

  RETURN p_schedule_block_id;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_schedule_day(UUID, UUID, DATE, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION report_shift_late(UUID, TIMESTAMPTZ, TEXT) TO authenticated;
