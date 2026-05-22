-- Allow parents to correct the email on a nanny profile that has not claimed yet

CREATE OR REPLACE FUNCTION update_unclaimed_nanny_email(
  p_household_nanny_id UUID,
  p_email TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household_id UUID;
  v_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT household_id INTO v_household_id
  FROM household_nannies
  WHERE id = p_household_nanny_id;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'Nanny not found';
  END IF;

  IF NOT is_parent_role(v_household_id) THEN
    RAISE EXCEPTION 'Only parents can update nanny emails';
  END IF;

  IF EXISTS (
    SELECT 1 FROM household_nannies
    WHERE id = p_household_nanny_id
      AND (claimed_at IS NOT NULL OR user_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Cannot change email after the nanny has joined';
  END IF;

  v_email := lower(trim(p_email));
  IF v_email = '' OR position('@' in v_email) = 0 THEN
    RAISE EXCEPTION 'A valid email is required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM household_nannies
    WHERE household_id = v_household_id
      AND lower(email) = v_email
      AND id <> p_household_nanny_id
  ) THEN
    RAISE EXCEPTION 'A nanny with this email already exists in your household';
  END IF;

  UPDATE household_nannies
  SET
    email = v_email,
    claim_token = NULL,
    claim_token_expires_at = NULL,
    claim_invite_sent_at = NULL,
    claim_invite_sent_by = NULL,
    updated_at = now()
  WHERE id = p_household_nanny_id;
END;
$$;

GRANT EXECUTE ON FUNCTION update_unclaimed_nanny_email(UUID, TEXT) TO authenticated;
