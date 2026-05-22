-- Invite parents / family members to a household

CREATE OR REPLACE FUNCTION create_household_member_invite(
  p_household_id UUID,
  p_email TEXT,
  p_role member_role DEFAULT 'parent'
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
    RAISE EXCEPTION 'Only parents can invite household members';
  END IF;

  IF p_role <> 'parent' THEN
    RAISE EXCEPTION 'Only parent role can be invited. Use nanny claim links for nannies.';
  END IF;

  normalized_email := lower(trim(p_email));
  IF normalized_email = '' OR position('@' in normalized_email) = 0 THEN
    RAISE EXCEPTION 'A valid email is required';
  END IF;

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
  VALUES (p_household_id, normalized_email, p_role, auth.uid())
  RETURNING token INTO invite_token;

  RETURN invite_token;
END;
$$;

GRANT EXECUTE ON FUNCTION create_household_member_invite(UUID, TEXT, member_role) TO authenticated;

-- Only create PTO balance rows when a nanny accepts an invite
CREATE OR REPLACE FUNCTION accept_household_invite(invite_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv household_invites%ROWTYPE;
  user_email TEXT;
BEGIN
  SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();
  SELECT * INTO inv FROM household_invites
  WHERE token = invite_token
    AND accepted_at IS NULL
    AND expires_at > now();

  IF inv.id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invite';
  END IF;

  IF lower(inv.email) <> lower(user_email) THEN
    RAISE EXCEPTION 'Invite email does not match your account';
  END IF;

  INSERT INTO household_members (household_id, user_id, role, status)
  VALUES (inv.household_id, auth.uid(), inv.role, 'active')
  ON CONFLICT (household_id, user_id) DO UPDATE SET role = inv.role, status = 'active';

  UPDATE household_invites SET accepted_at = now() WHERE id = inv.id;

  IF inv.role = 'nanny' THEN
    INSERT INTO pto_balances (household_id, nanny_user_id)
    VALUES (inv.household_id, auth.uid())
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN inv.household_id;
END;
$$;
