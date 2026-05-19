-- Fix ambiguous nanny_user_id variable in add_nanny_by_email
CREATE OR REPLACE FUNCTION add_nanny_by_email(
  p_household_id UUID,
  p_email TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nanny_user_id UUID;
  normalized_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT is_parent_role(p_household_id) THEN
    RAISE EXCEPTION 'Only parents can add nannies';
  END IF;

  normalized_email := lower(trim(p_email));
  IF normalized_email = '' OR position('@' in normalized_email) = 0 THEN
    RAISE EXCEPTION 'A valid email is required';
  END IF;

  SELECT id INTO v_nanny_user_id
  FROM auth.users
  WHERE lower(email) = normalized_email;

  IF v_nanny_user_id IS NULL THEN
    RAISE EXCEPTION 'No account exists for this email. Use “Send invite link” instead.';
  END IF;

  IF v_nanny_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot add yourself as the nanny';
  END IF;

  INSERT INTO household_members (household_id, user_id, role, status)
  VALUES (p_household_id, v_nanny_user_id, 'nanny', 'active')
  ON CONFLICT (household_id, user_id) DO UPDATE
    SET role = 'nanny', status = 'active';

  INSERT INTO pto_balances (household_id, nanny_user_id)
  VALUES (p_household_id, v_nanny_user_id)
  ON CONFLICT (household_id, nanny_user_id) DO NOTHING;

  UPDATE household_invites
  SET accepted_at = now()
  WHERE household_id = p_household_id
    AND lower(email) = normalized_email
    AND accepted_at IS NULL;

  RETURN v_nanny_user_id;
END;
$$;
