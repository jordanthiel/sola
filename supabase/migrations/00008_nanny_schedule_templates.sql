-- Weekly default schedule per nanny (day_of_week: 0=Sunday .. 6=Saturday, local household times)

CREATE TABLE nanny_schedule_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  household_nanny_id UUID NOT NULL REFERENCES household_nannies(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, household_nanny_id, day_of_week)
);

CREATE INDEX idx_schedule_templates_nanny ON nanny_schedule_templates(household_nanny_id);

ALTER TABLE nanny_schedule_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY nst_select ON nanny_schedule_templates FOR SELECT USING (is_household_member(household_id));
CREATE POLICY nst_parent ON nanny_schedule_templates FOR ALL USING (is_parent_role(household_id));

-- Materialize template into schedule_blocks for upcoming weeks (skips days that already have a shift)
CREATE OR REPLACE FUNCTION ensure_schedule_from_templates(
  p_household_id UUID,
  p_household_nanny_id UUID,
  p_weeks INTEGER DEFAULT 8
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_day DATE;
  v_dow INTEGER;
  v_tpl nanny_schedule_templates%ROWTYPE;
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_tz TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT is_parent_role(p_household_id) THEN
    RAISE EXCEPTION 'Only parents can sync schedules';
  END IF;

  SELECT timezone INTO v_tz FROM households WHERE id = p_household_id;
  v_tz := COALESCE(v_tz, 'America/New_York');

  FOR v_day IN
    SELECT d::date
    FROM generate_series(CURRENT_DATE, CURRENT_DATE + (p_weeks * 7 - 1), '1 day'::interval) AS d
  LOOP
    v_dow := EXTRACT(DOW FROM v_day)::INTEGER;

    SELECT * INTO v_tpl
    FROM nanny_schedule_templates
    WHERE household_id = p_household_id
      AND household_nanny_id = p_household_nanny_id
      AND day_of_week = v_dow
      AND enabled = true;

    IF v_tpl.id IS NULL THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM schedule_blocks sb
      WHERE sb.household_id = p_household_id
        AND sb.household_nanny_id = p_household_nanny_id
        AND sb.status = 'scheduled'
        AND (sb.starts_at AT TIME ZONE v_tz)::date = v_day
    ) THEN
      CONTINUE;
    END IF;

    v_start := (v_day + v_tpl.start_time) AT TIME ZONE v_tz;
    v_end := (v_day + v_tpl.end_time) AT TIME ZONE v_tz;
    IF v_tpl.end_time <= v_tpl.start_time THEN
      v_end := ((v_day + 1) + v_tpl.end_time) AT TIME ZONE v_tz;
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
      v_start,
      v_end,
      v_tpl.notes,
      'scheduled'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION ensure_schedule_from_templates(UUID, UUID, INTEGER) TO authenticated;

-- Seed Mon–Fri 9:00–17:00 when a nanny profile is created
CREATE OR REPLACE FUNCTION seed_nanny_schedule_templates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO nanny_schedule_templates (household_id, household_nanny_id, day_of_week, start_time, end_time, enabled)
  SELECT
    NEW.household_id,
    NEW.id,
    d,
    '09:00'::TIME,
    '17:00'::TIME,
    d BETWEEN 1 AND 5
  FROM generate_series(0, 6) AS d
  ON CONFLICT (household_id, household_nanny_id, day_of_week) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seed_nanny_schedule_templates
  AFTER INSERT ON household_nannies
  FOR EACH ROW
  EXECUTE FUNCTION seed_nanny_schedule_templates();

-- Backfill existing nannies
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
