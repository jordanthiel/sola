-- Fix invite RLS and add RPCs for invite + direct nanny add

DROP POLICY IF EXISTS invites_select ON household_invites;
DROP POLICY IF EXISTS invites_insert ON household_invites;
DROP POLICY IF EXISTS invites_update ON household_invites;

CREATE POLICY invites_select ON household_invites FOR SELECT USING (
  is_parent_role(household_id)
  OR is_household_member(household_id)
);

CREATE POLICY invites_insert ON household_invites FOR INSERT WITH CHECK (
  is_parent_role(household_id)
);

CREATE POLICY invites_update ON household_invites FOR UPDATE USING (
  is_parent_role(household_id)
);

CREATE POLICY invites_delete ON household_invites FOR DELETE USING (
  is_parent_role(household_id)
);

-- Allow parents to add nanny members directly (in addition to RPC)
DROP POLICY IF EXISTS hm_insert ON household_members;
CREATE POLICY hm_insert ON household_members FOR INSERT WITH CHECK (
  is_parent_role(household_id)
  OR (user_id = auth.uid() AND role IN ('owner'::member_role, 'parent'::member_role))
);

-- Create invite link (bypasses insert+select RLS edge cases)
CREATE OR REPLACE FUNCTION create_nanny_invite(
  p_household_id UUID,
  p_email TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_token TEXT;
  normalized_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT is_parent_role(p_household_id) THEN
    RAISE EXCEPTION 'Only parents can invite nannies';
  END IF;

  normalized_email := lower(trim(p_email));
  IF normalized_email = '' OR position('@' in normalized_email) = 0 THEN
    RAISE EXCEPTION 'A valid email is required';
  END IF;

  -- Already a member?
  IF EXISTS (
    SELECT 1
    FROM household_members hm
    JOIN auth.users u ON u.id = hm.user_id
    WHERE hm.household_id = p_household_id
      AND hm.status = 'active'
      AND lower(u.email) = normalized_email
  ) THEN
    RAISE EXCEPTION 'This person is already a member of your household';
  END IF;

  INSERT INTO household_invites (household_id, email, role, invited_by)
  VALUES (p_household_id, normalized_email, 'nanny', auth.uid())
  RETURNING token INTO invite_token;

  RETURN invite_token;
END;
$$;

-- Add nanny who already has an account
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

  -- Clear pending invites for this email
  UPDATE household_invites
  SET accepted_at = now()
  WHERE household_id = p_household_id
    AND lower(email) = normalized_email
    AND accepted_at IS NULL;

  RETURN v_nanny_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_nanny_invite(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION add_nanny_by_email(UUID, TEXT) TO authenticated;
