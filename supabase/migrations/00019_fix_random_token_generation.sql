-- gen_random_bytes requires pgcrypto; gen_random_uuid is built into Postgres 13+

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION generate_secure_token()
RETURNS TEXT
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

ALTER TABLE household_invites
  ALTER COLUMN token SET DEFAULT generate_secure_token();

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

  v_token := generate_secure_token();

  UPDATE household_nannies
  SET
    claim_token = v_token,
    claim_token_expires_at = now() + interval '30 days',
    updated_at = now()
  WHERE id = p_household_nanny_id;

  RETURN v_token;
END;
$$;
