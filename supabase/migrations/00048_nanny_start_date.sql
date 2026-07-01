-- Employment start date: pay and earnings count from this day onward

ALTER TABLE household_nannies
  ADD COLUMN IF NOT EXISTS start_date DATE;

UPDATE household_nannies
SET start_date = created_at::date
WHERE start_date IS NULL;

ALTER TABLE household_nannies
  ALTER COLUMN start_date SET NOT NULL,
  ALTER COLUMN start_date SET DEFAULT CURRENT_DATE;

CREATE OR REPLACE FUNCTION create_household_nanny(
  p_household_id UUID,
  p_first_name TEXT,
  p_last_name TEXT,
  p_email TEXT,
  p_phone TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_start_date DATE DEFAULT CURRENT_DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT is_parent_role(p_household_id) THEN
    RAISE EXCEPTION 'Only parents can add nannies';
  END IF;

  v_email := lower(trim(p_email));
  IF v_email = '' OR position('@' in v_email) = 0 THEN
    RAISE EXCEPTION 'A valid email is required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM household_nannies
    WHERE household_id = p_household_id
      AND lower(email) = v_email
      AND deactivated_at IS NULL
  ) THEN
    RAISE EXCEPTION 'A nanny with this email already exists in your household';
  END IF;

  INSERT INTO household_nannies (
    household_id,
    first_name,
    last_name,
    email,
    phone,
    notes,
    start_date
  )
  VALUES (
    p_household_id,
    trim(p_first_name),
    trim(p_last_name),
    v_email,
    NULLIF(trim(p_phone), ''),
    NULLIF(trim(p_notes), ''),
    COALESCE(p_start_date, CURRENT_DATE)
  )
  RETURNING id INTO v_id;

  IF NOT EXISTS (
    SELECT 1 FROM pto_balances
    WHERE household_id = p_household_id AND household_nanny_id = v_id
  ) THEN
    INSERT INTO pto_balances (household_id, household_nanny_id)
    VALUES (p_household_id, v_id);
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_household_nanny(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, DATE) TO authenticated;
