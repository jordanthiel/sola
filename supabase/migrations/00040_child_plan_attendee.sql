-- Who is taking the child to a planned activity (parent, nanny, etc.)

ALTER TABLE child_activities
  ADD COLUMN IF NOT EXISTS attendee_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attendee_household_nanny_id UUID REFERENCES household_nannies(id) ON DELETE SET NULL;

ALTER TABLE recurring_child_plans
  ADD COLUMN IF NOT EXISTS attendee_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attendee_household_nanny_id UUID REFERENCES household_nannies(id) ON DELETE SET NULL;

ALTER TABLE child_activities
  DROP CONSTRAINT IF EXISTS child_activities_attendee_exclusive;

ALTER TABLE child_activities
  ADD CONSTRAINT child_activities_attendee_exclusive CHECK (
    attendee_user_id IS NULL OR attendee_household_nanny_id IS NULL
  );

ALTER TABLE recurring_child_plans
  DROP CONSTRAINT IF EXISTS recurring_child_plans_attendee_exclusive;

ALTER TABLE recurring_child_plans
  ADD CONSTRAINT recurring_child_plans_attendee_exclusive CHECK (
    attendee_user_id IS NULL OR attendee_household_nanny_id IS NULL
  );

CREATE OR REPLACE FUNCTION generate_recurring_child_plans(
  p_household_id UUID,
  p_through_date DATE DEFAULT (CURRENT_DATE + interval '56 days')::date
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan recurring_child_plans%ROWTYPE;
  v_d DATE;
  v_start TIMESTAMPTZ;
  v_group UUID;
  v_child UUID;
  v_count INTEGER := 0;
  v_from DATE;
  v_through DATE;
BEGIN
  IF NOT is_household_member(p_household_id) THEN
    RAISE EXCEPTION 'Not a household member';
  END IF;

  FOR v_plan IN
    SELECT * FROM recurring_child_plans
    WHERE household_id = p_household_id AND enabled = true
  LOOP
    v_from := COALESCE(v_plan.last_generated_through, CURRENT_DATE - 1) + 1;
    IF v_plan.repeat_starts_on IS NOT NULL AND v_from < v_plan.repeat_starts_on THEN
      v_from := v_plan.repeat_starts_on;
    END IF;
    IF v_from < CURRENT_DATE THEN
      v_from := CURRENT_DATE;
    END IF;

    v_through := p_through_date;
    IF v_plan.repeat_ends_on IS NOT NULL AND v_through > v_plan.repeat_ends_on THEN
      v_through := v_plan.repeat_ends_on;
    END IF;

    IF v_from > v_through THEN
      CONTINUE;
    END IF;

    v_d := v_from;
    WHILE v_d <= v_through LOOP
      IF EXTRACT(DOW FROM v_d)::int = v_plan.day_of_week THEN
        v_start := (v_d::text || ' ' || v_plan.start_time::text)::timestamptz;

        IF NOT EXISTS (
          SELECT 1 FROM child_activities ca
          WHERE ca.recurring_plan_id = v_plan.id
            AND ca.occurred_at::date = v_d
        ) THEN
          v_group := gen_random_uuid();
          FOREACH v_child IN ARRAY v_plan.child_ids LOOP
            INSERT INTO child_activities (
              household_id, child_id, logged_by, activity_type, title,
              description, occurred_at, duration_minutes, recurring_plan_id, plan_group_id,
              attendee_user_id, attendee_household_nanny_id
            ) VALUES (
              v_plan.household_id,
              v_child,
              COALESCE(v_plan.created_by, auth.uid()),
              v_plan.activity_type,
              v_plan.title,
              v_plan.description,
              v_start,
              v_plan.duration_minutes,
              v_plan.id,
              CASE WHEN array_length(v_plan.child_ids, 1) > 1 THEN v_group ELSE NULL END,
              v_plan.attendee_user_id,
              v_plan.attendee_household_nanny_id
            );
            INSERT INTO child_activity_children (activity_id, child_id)
            SELECT ca.id, v_child
            FROM child_activities ca
            WHERE ca.recurring_plan_id = v_plan.id AND ca.occurred_at::date = v_d AND ca.child_id = v_child
            ON CONFLICT DO NOTHING;
            v_count := v_count + 1;
          END LOOP;
        END IF;
      END IF;
      v_d := v_d + 1;
    END LOOP;

    UPDATE recurring_child_plans
    SET last_generated_through = v_through, updated_at = now()
    WHERE id = v_plan.id;
  END LOOP;

  RETURN v_count;
END;
$$;
