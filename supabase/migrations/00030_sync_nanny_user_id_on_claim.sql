-- Always set household_nannies.user_id when a nanny claims or already has membership

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
      AND u.id = auth.uid()
      AND (hn.user_id IS NULL OR hn.user_id = auth.uid());
    RETURN v_household_id;
  END IF;

  IF p_claim_token IS NOT NULL AND length(trim(p_claim_token)) > 0 THEN
    SELECT * INTO v_nanny
    FROM household_nannies
    WHERE claim_token = p_claim_token
      AND user_id = auth.uid()
      AND claimed_at IS NOT NULL
      AND deactivated_at IS NULL;

    IF v_nanny.id IS NOT NULL THEN
      RETURN v_nanny.household_id;
    END IF;
  END IF;

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
  UPDATE pto_balances SET nanny_user_id = auth.uid()
  WHERE household_nanny_id = v_nanny.id
    AND (nanny_user_id IS NULL OR nanny_user_id = auth.uid());

  UPDATE household_invites SET accepted_at = now()
  WHERE household_id = v_nanny.household_id
    AND lower(email) = lower(v_nanny.email)
    AND accepted_at IS NULL;

  RETURN v_nanny.household_id;
END;
$$;

UPDATE household_nannies hn
SET
  user_id = hm.user_id,
  claimed_at = COALESCE(hn.claimed_at, hm.created_at, now()),
  updated_at = now()
FROM household_members hm
JOIN auth.users u ON u.id = hm.user_id
WHERE hn.household_id = hm.household_id
  AND hm.role = 'nanny'
  AND hm.status = 'active'
  AND hn.deactivated_at IS NULL
  AND lower(hn.email) = lower(u.email)
  AND (hn.user_id IS NULL OR hn.user_id IS DISTINCT FROM hm.user_id);
