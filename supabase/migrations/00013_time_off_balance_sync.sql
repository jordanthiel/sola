-- Keep pto_balances.used in sync when time off is approved or reversed

CREATE OR REPLACE FUNCTION ensure_pto_balance(p_household_id UUID, p_household_nanny_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO pto_balances (household_id, household_nanny_id)
  SELECT p_household_id, p_household_nanny_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM pto_balances
    WHERE household_id = p_household_id
      AND household_nanny_id = p_household_nanny_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION adjust_pto_used(
  p_household_id UUID,
  p_household_nanny_id UUID,
  p_type time_off_type,
  p_hours NUMERIC
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_type NOT IN ('sick', 'pto') OR p_hours = 0 THEN
    RETURN;
  END IF;

  PERFORM ensure_pto_balance(p_household_id, p_household_nanny_id);

  IF p_type = 'sick' THEN
    UPDATE pto_balances
    SET
      sick_hours_used = GREATEST(0, sick_hours_used + p_hours),
      updated_at = now()
    WHERE household_id = p_household_id
      AND household_nanny_id = p_household_nanny_id;
  ELSE
    UPDATE pto_balances
    SET
      pto_hours_used = GREATEST(0, pto_hours_used + p_hours),
      updated_at = now()
    WHERE household_id = p_household_id
      AND household_nanny_id = p_household_nanny_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION sync_time_off_pto_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household_id UUID;
  v_nanny_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'approved'
      AND OLD.type IN ('sick', 'pto')
      AND OLD.household_nanny_id IS NOT NULL
    THEN
      PERFORM adjust_pto_used(
        OLD.household_id,
        OLD.household_nanny_id,
        OLD.type,
        -OLD.hours
      );
    END IF;
    RETURN OLD;
  END IF;

  v_household_id := NEW.household_id;
  v_nanny_id := NEW.household_nanny_id;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'approved'
      AND NEW.type IN ('sick', 'pto')
      AND v_nanny_id IS NOT NULL
    THEN
      PERFORM adjust_pto_used(v_household_id, v_nanny_id, NEW.type, NEW.hours);
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: reverse previous approved usage, then apply new state
  IF OLD.status = 'approved'
    AND OLD.type IN ('sick', 'pto')
    AND OLD.household_nanny_id IS NOT NULL
  THEN
    PERFORM adjust_pto_used(
      OLD.household_id,
      OLD.household_nanny_id,
      OLD.type,
      -OLD.hours
    );
  END IF;

  IF NEW.status = 'approved'
    AND NEW.type IN ('sick', 'pto')
    AND v_nanny_id IS NOT NULL
  THEN
    PERFORM adjust_pto_used(v_household_id, v_nanny_id, NEW.type, NEW.hours);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_time_off_pto_balance ON time_off_requests;

CREATE TRIGGER trg_sync_time_off_pto_balance
  AFTER INSERT OR UPDATE OR DELETE ON time_off_requests
  FOR EACH ROW
  EXECUTE FUNCTION sync_time_off_pto_balance();

-- Backfill used hours from already-approved requests
WITH approved AS (
  SELECT
    household_id,
    household_nanny_id,
    type,
    SUM(hours)::NUMERIC(6, 2) AS total_hours
  FROM time_off_requests
  WHERE status = 'approved'
    AND type IN ('sick', 'pto')
    AND household_nanny_id IS NOT NULL
  GROUP BY household_id, household_nanny_id, type
)
UPDATE pto_balances pb
SET
  sick_hours_used = COALESCE(s.total_hours, 0),
  updated_at = now()
FROM approved s
WHERE pb.household_id = s.household_id
  AND pb.household_nanny_id = s.household_nanny_id
  AND s.type = 'sick';

WITH approved AS (
  SELECT
    household_id,
    household_nanny_id,
    type,
    SUM(hours)::NUMERIC(6, 2) AS total_hours
  FROM time_off_requests
  WHERE status = 'approved'
    AND type IN ('sick', 'pto')
    AND household_nanny_id IS NOT NULL
  GROUP BY household_id, household_nanny_id, type
)
UPDATE pto_balances pb
SET
  pto_hours_used = COALESCE(s.total_hours, 0),
  updated_at = now()
FROM approved s
WHERE pb.household_id = s.household_id
  AND pb.household_nanny_id = s.household_nanny_id
  AND s.type = 'pto';
