-- Track when parents send nanny claim invites by email

ALTER TABLE household_nannies
  ADD COLUMN IF NOT EXISTS claim_invite_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claim_invite_sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION create_nanny_claim_link(p_household_nanny_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household_id UUID;
  v_token TEXT;
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
    RAISE EXCEPTION 'Only parents can send nanny invites';
  END IF;

  v_token := public.gen_hex_token(32);

  UPDATE household_nannies
  SET
    claim_token = v_token,
    claim_token_expires_at = now() + interval '30 days',
    updated_at = now()
  WHERE id = p_household_nanny_id;

  RETURN v_token;
END;
$$;

-- Call after the invite email is delivered successfully
CREATE OR REPLACE FUNCTION record_nanny_claim_invite_sent(p_household_nanny_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household_id UUID;
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
    RAISE EXCEPTION 'Only parents can record nanny invites';
  END IF;

  UPDATE household_nannies
  SET
    claim_invite_sent_at = now(),
    claim_invite_sent_by = auth.uid(),
    updated_at = now()
  WHERE id = p_household_nanny_id
    AND claimed_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION record_nanny_claim_invite_sent(UUID) TO authenticated;
