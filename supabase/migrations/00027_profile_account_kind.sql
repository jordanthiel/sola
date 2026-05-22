-- Account-level role: family (parent/guardian) vs nanny vs not yet set

CREATE TYPE account_kind AS ENUM ('unset', 'family', 'nanny');

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS account_kind account_kind NOT NULL DEFAULT 'unset';

COMMENT ON COLUMN profiles.account_kind IS
  'Whether this login is for a family (parent) or a nanny. Set at signup, claim, or household creation.';

-- Backfill existing users
UPDATE profiles p
SET account_kind = 'nanny'
WHERE account_kind = 'unset'
  AND (
    EXISTS (
      SELECT 1 FROM household_members hm
      WHERE hm.user_id = p.id AND hm.status = 'active' AND hm.role = 'nanny'
    )
    OR EXISTS (
      SELECT 1 FROM household_nannies hn
      WHERE hn.user_id = p.id AND hn.claimed_at IS NOT NULL AND hn.deactivated_at IS NULL
    )
  );

UPDATE profiles p
SET account_kind = 'family'
WHERE account_kind = 'unset'
  AND EXISTS (
    SELECT 1 FROM household_members hm
    WHERE hm.user_id = p.id AND hm.status = 'active' AND hm.role IN ('owner', 'parent')
  );

CREATE OR REPLACE FUNCTION resolve_user_account_kind(p_user_id UUID)
RETURNS account_kind
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind account_kind;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 'unset'::account_kind;
  END IF;

  SELECT account_kind INTO v_kind FROM profiles WHERE id = p_user_id;

  IF EXISTS (
    SELECT 1 FROM household_nannies hn
    WHERE hn.user_id = p_user_id
      AND hn.claimed_at IS NOT NULL
      AND hn.deactivated_at IS NULL
  ) THEN
    UPDATE profiles SET account_kind = 'nanny', updated_at = now()
    WHERE id = p_user_id AND account_kind IS DISTINCT FROM 'nanny';
    RETURN 'nanny'::account_kind;
  END IF;

  IF EXISTS (
    SELECT 1 FROM household_members hm
    WHERE hm.user_id = p_user_id AND hm.status = 'active' AND hm.role = 'nanny'
  ) THEN
    UPDATE profiles SET account_kind = 'nanny', updated_at = now()
    WHERE id = p_user_id AND account_kind IS DISTINCT FROM 'nanny';
    RETURN 'nanny'::account_kind;
  END IF;

  IF EXISTS (
    SELECT 1 FROM household_members hm
    WHERE hm.user_id = p_user_id AND hm.status = 'active' AND hm.role IN ('owner', 'parent')
  ) THEN
    UPDATE profiles SET account_kind = 'family', updated_at = now()
    WHERE id = p_user_id AND account_kind IS DISTINCT FROM 'family';
    RETURN 'family'::account_kind;
  END IF;

  RETURN COALESCE(v_kind, 'unset'::account_kind);
END;
$$;

CREATE OR REPLACE FUNCTION get_my_session_context()
RETURNS TABLE (
  account_kind account_kind,
  household_id UUID,
  household_name TEXT,
  member_role member_role,
  has_household_access BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_kind account_kind;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  v_kind := resolve_user_account_kind(v_uid);

  RETURN QUERY
  SELECT
    v_kind,
    h.id,
    h.name,
    lh.member_role,
    true
  FROM list_my_households() lh
  INNER JOIN households h ON h.id = lh.id
  ORDER BY lh.member_role = 'nanny' DESC, h.name
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT v_kind, NULL::UUID, NULL::TEXT, NULL::member_role, false;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION resolve_user_account_kind(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_session_context() TO authenticated;

-- Signup: read account_kind from auth metadata
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind account_kind := 'unset';
  v_meta TEXT;
BEGIN
  v_meta := NEW.raw_user_meta_data->>'account_kind';
  IF v_meta IN ('family', 'nanny') THEN
    v_kind := v_meta::account_kind;
  END IF;

  INSERT INTO public.profiles (id, display_name, account_kind)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    v_kind
  )
  ON CONFLICT (id) DO UPDATE
    SET
      display_name = COALESCE(EXCLUDED.display_name, profiles.display_name),
      account_kind = CASE
        WHEN profiles.account_kind = 'unset' AND EXCLUDED.account_kind <> 'unset'
          THEN EXCLUDED.account_kind
        ELSE profiles.account_kind
      END,
      updated_at = now();
  RETURN NEW;
END;
$$;

-- Creating a household marks this login as family
CREATE OR REPLACE FUNCTION create_household_with_owner(
  p_name TEXT,
  p_timezone TEXT DEFAULT 'America/New_York'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hid UUID;
  existing_household UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE profiles SET account_kind = 'family', updated_at = now() WHERE id = auth.uid();

  SELECT hm.household_id INTO existing_household
  FROM household_members hm
  WHERE hm.user_id = auth.uid()
    AND hm.status = 'active'
    AND hm.role IN ('owner'::member_role, 'parent'::member_role)
  ORDER BY hm.created_at
  LIMIT 1;

  IF existing_household IS NOT NULL THEN
    UPDATE households
    SET name = p_name, timezone = p_timezone, updated_at = now()
    WHERE id = existing_household;
    RETURN existing_household;
  END IF;

  SELECT h.id INTO hid
  FROM households h
  WHERE h.created_by = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM household_members hm
      WHERE hm.household_id = h.id AND hm.user_id = auth.uid()
    )
  ORDER BY h.created_at DESC
  LIMIT 1;

  IF hid IS NOT NULL THEN
    UPDATE households SET name = p_name, timezone = p_timezone, updated_at = now() WHERE id = hid;
    INSERT INTO household_members (household_id, user_id, role, status)
    VALUES (hid, auth.uid(), 'owner', 'active')
    ON CONFLICT (household_id, user_id) DO UPDATE SET role = 'owner', status = 'active';
    RETURN hid;
  END IF;

  INSERT INTO households (name, timezone, created_by)
  VALUES (p_name, p_timezone, auth.uid())
  RETURNING id INTO hid;

  INSERT INTO household_members (household_id, user_id, role, status)
  VALUES (hid, auth.uid(), 'owner'::member_role, 'active');

  RETURN hid;
END;
$$;

-- Claiming marks this login as nanny
CREATE OR REPLACE FUNCTION claim_nanny_profile(p_claim_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nanny household_nannies%ROWTYPE;
  v_user_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE profiles SET account_kind = 'nanny', updated_at = now() WHERE id = auth.uid();

  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();

  SELECT * INTO v_nanny
  FROM household_nannies
  WHERE user_id = auth.uid()
    AND claimed_at IS NOT NULL
    AND deactivated_at IS NULL
  ORDER BY claimed_at DESC
  LIMIT 1;

  IF v_nanny.id IS NOT NULL THEN
    RETURN v_nanny.household_id;
  END IF;

  SELECT * INTO v_nanny
  FROM household_nannies
  WHERE claim_token = p_claim_token
    AND claimed_at IS NULL
    AND deactivated_at IS NULL
    AND (claim_token_expires_at IS NULL OR claim_token_expires_at > now());

  IF v_nanny.id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired claim link';
  END IF;

  IF lower(v_nanny.email) <> lower(v_user_email) THEN
    RAISE EXCEPTION 'Sign in with the email on file for this nanny profile (%)', v_nanny.email;
  END IF;

  UPDATE household_nannies
  SET
    user_id = auth.uid(),
    claimed_at = now(),
    claim_token = NULL,
    claim_token_expires_at = NULL,
    updated_at = now()
  WHERE id = v_nanny.id;

  INSERT INTO household_members (household_id, user_id, role, status)
  VALUES (v_nanny.household_id, auth.uid(), 'nanny', 'active')
  ON CONFLICT (household_id, user_id) DO UPDATE
    SET role = 'nanny', status = 'active';

  UPDATE employment_settings SET nanny_user_id = auth.uid() WHERE household_nanny_id = v_nanny.id;
  UPDATE schedule_blocks SET nanny_user_id = auth.uid() WHERE household_nanny_id = v_nanny.id;
  UPDATE time_entries SET nanny_user_id = auth.uid() WHERE household_nanny_id = v_nanny.id;
  UPDATE overtime_adjustments SET nanny_user_id = auth.uid() WHERE household_nanny_id = v_nanny.id;
  UPDATE payment_advances SET nanny_user_id = auth.uid() WHERE household_nanny_id = v_nanny.id;
  UPDATE time_off_requests SET nanny_user_id = auth.uid() WHERE household_nanny_id = v_nanny.id;
  UPDATE pto_balances SET nanny_user_id = auth.uid() WHERE household_nanny_id = v_nanny.id;

  UPDATE household_invites SET accepted_at = now()
  WHERE household_id = v_nanny.household_id
    AND lower(email) = lower(v_nanny.email)
    AND accepted_at IS NULL;

  RETURN v_nanny.household_id;
END;
$$;

-- Parent/guardian invites mark family; nanny member invites mark nanny
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

  UPDATE profiles
  SET
    account_kind = CASE WHEN inv.role = 'nanny' THEN 'nanny' ELSE 'family' END::account_kind,
    updated_at = now()
  WHERE id = auth.uid();

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
