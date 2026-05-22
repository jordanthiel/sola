-- Idempotent claim: no 409 when membership / pto / employment rows already exist

CREATE OR REPLACE FUNCTION sync_nanny_child_records(p_household_nanny_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household_id UUID;
BEGIN
  SELECT household_id INTO v_household_id
  FROM household_nannies
  WHERE id = p_household_nanny_id;

  IF v_household_id IS NULL THEN
    RETURN;
  END IF;

  -- Drop orphan pto row for this profile if household already has a balance for this user
  DELETE FROM pto_balances pb
  WHERE pb.household_nanny_id = p_household_nanny_id
    AND (pb.nanny_user_id IS NULL OR pb.nanny_user_id = p_user_id)
    AND EXISTS (
      SELECT 1 FROM pto_balances ex
      WHERE ex.household_id = v_household_id
        AND ex.nanny_user_id = p_user_id
        AND ex.id <> pb.id
    );

  UPDATE employment_settings SET nanny_user_id = p_user_id
  WHERE household_nanny_id = p_household_nanny_id
    AND (nanny_user_id IS NULL OR nanny_user_id = p_user_id);

  UPDATE schedule_blocks SET nanny_user_id = p_user_id
  WHERE household_nanny_id = p_household_nanny_id
    AND (nanny_user_id IS NULL OR nanny_user_id = p_user_id);

  UPDATE time_entries SET nanny_user_id = p_user_id
  WHERE household_nanny_id = p_household_nanny_id
    AND (nanny_user_id IS NULL OR nanny_user_id = p_user_id);

  UPDATE overtime_adjustments SET nanny_user_id = p_user_id
  WHERE household_nanny_id = p_household_nanny_id
    AND (nanny_user_id IS NULL OR nanny_user_id = p_user_id);

  UPDATE payment_advances SET nanny_user_id = p_user_id
  WHERE household_nanny_id = p_household_nanny_id
    AND (nanny_user_id IS NULL OR nanny_user_id = p_user_id);

  UPDATE time_off_requests SET nanny_user_id = p_user_id
  WHERE household_nanny_id = p_household_nanny_id
    AND (nanny_user_id IS NULL OR nanny_user_id = p_user_id);

  UPDATE pto_balances SET nanny_user_id = p_user_id
  WHERE household_nanny_id = p_household_nanny_id
    AND (nanny_user_id IS NULL OR nanny_user_id = p_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION claim_nanny_profile(p_claim_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nanny household_nannies%ROWTYPE;
  v_user_email TEXT;
  v_household_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_claim_token IS NULL OR length(trim(p_claim_token)) = 0 THEN
    RAISE EXCEPTION 'Invalid or expired claim link';
  END IF;

  UPDATE profiles SET account_kind = 'nanny', updated_at = now() WHERE id = auth.uid();

  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();

  -- Already linked on household_nannies
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

  -- Nanny membership without profile sync
  SELECT hm.household_id INTO v_household_id
  FROM household_members hm
  WHERE hm.user_id = auth.uid()
    AND hm.status = 'active'
    AND hm.role = 'nanny'
  ORDER BY hm.created_at DESC
  LIMIT 1;

  IF v_household_id IS NOT NULL THEN
    UPDATE household_nannies hn
    SET
      user_id = auth.uid(),
      claimed_at = COALESCE(hn.claimed_at, now()),
      claim_token = NULL,
      claim_token_expires_at = NULL,
      updated_at = now()
    FROM auth.users u
    WHERE hn.household_id = v_household_id
      AND hn.deactivated_at IS NULL
      AND lower(hn.email) = lower(u.email)
      AND u.id = auth.uid();
    RETURN v_household_id;
  END IF;

  -- Resolve invite row by token (any claim state)
  SELECT * INTO v_nanny
  FROM household_nannies
  WHERE claim_token = p_claim_token
    AND deactivated_at IS NULL;

  IF v_nanny.id IS NULL THEN
    -- Re-open after claim: token cleared but same email already linked
    SELECT * INTO v_nanny
    FROM household_nannies
    WHERE lower(email) = lower(v_user_email)
      AND user_id = auth.uid()
      AND claimed_at IS NOT NULL
      AND deactivated_at IS NULL
    ORDER BY claimed_at DESC
    LIMIT 1;

    IF v_nanny.id IS NOT NULL THEN
      RETURN v_nanny.household_id;
    END IF;

    RAISE EXCEPTION 'Invalid or expired claim link';
  END IF;

  IF lower(v_nanny.email) <> lower(v_user_email) THEN
    RAISE EXCEPTION 'Sign in with the email on file for this nanny profile (%)', v_nanny.email;
  END IF;

  IF v_nanny.user_id IS NOT NULL AND v_nanny.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'This invite has already been claimed by another account';
  END IF;

  -- Link profile + membership (idempotent)
  UPDATE household_nannies
  SET
    user_id = auth.uid(),
    claimed_at = COALESCE(claimed_at, now()),
    claim_token = NULL,
    claim_token_expires_at = NULL,
    updated_at = now()
  WHERE id = v_nanny.id;

  INSERT INTO household_members (household_id, user_id, role, status)
  VALUES (v_nanny.household_id, auth.uid(), 'nanny', 'active')
  ON CONFLICT (household_id, user_id) DO UPDATE
    SET role = 'nanny', status = 'active';

  PERFORM sync_nanny_child_records(v_nanny.id, auth.uid());

  UPDATE household_invites SET accepted_at = now()
  WHERE household_id = v_nanny.household_id
    AND lower(email) = lower(v_nanny.email)
    AND accepted_at IS NULL;

  RETURN v_nanny.household_id;
END;
$$;

GRANT EXECUTE ON FUNCTION sync_nanny_child_records(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION claim_nanny_profile(TEXT) TO authenticated;
