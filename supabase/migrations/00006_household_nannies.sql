-- Household nannies: parent-managed profiles, claimable later by the nanny

CREATE TABLE household_nannies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  notes TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  claim_token TEXT UNIQUE,
  claim_token_expires_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, email)
);

CREATE INDEX idx_household_nannies_household ON household_nannies(household_id);
CREATE INDEX idx_household_nannies_user ON household_nannies(user_id);
CREATE INDEX idx_household_nannies_claim_token ON household_nannies(claim_token);

ALTER TABLE employment_settings ADD COLUMN household_nanny_id UUID REFERENCES household_nannies(id) ON DELETE CASCADE;
ALTER TABLE schedule_blocks ADD COLUMN household_nanny_id UUID REFERENCES household_nannies(id) ON DELETE CASCADE;
ALTER TABLE time_entries ADD COLUMN household_nanny_id UUID REFERENCES household_nannies(id) ON DELETE CASCADE;
ALTER TABLE overtime_adjustments ADD COLUMN household_nanny_id UUID REFERENCES household_nannies(id) ON DELETE CASCADE;
ALTER TABLE payment_advances ADD COLUMN household_nanny_id UUID REFERENCES household_nannies(id) ON DELETE CASCADE;
ALTER TABLE time_off_requests ADD COLUMN household_nanny_id UUID REFERENCES household_nannies(id) ON DELETE CASCADE;
ALTER TABLE pto_balances ADD COLUMN household_nanny_id UUID REFERENCES household_nannies(id) ON DELETE CASCADE;

-- Backfill from existing nanny members (if any)
INSERT INTO household_nannies (household_id, first_name, last_name, email, user_id, claimed_at)
SELECT
  hm.household_id,
  COALESCE(NULLIF(split_part(COALESCE(p.display_name, 'Nanny'), ' ', 1), ''), 'Nanny'),
  COALESCE(
    NULLIF(
      trim(substring(COALESCE(p.display_name, 'Nanny') from position(' ' in COALESCE(p.display_name, 'Nanny') || ' ') + 1)),
      ''
    ),
    ''
  ),
  lower(u.email),
  hm.user_id,
  now()
FROM household_members hm
JOIN auth.users u ON u.id = hm.user_id
LEFT JOIN profiles p ON p.id = hm.user_id
WHERE hm.role = 'nanny' AND hm.status = 'active'
ON CONFLICT (household_id, email) DO UPDATE
  SET user_id = EXCLUDED.user_id,
      claimed_at = COALESCE(household_nannies.claimed_at, EXCLUDED.claimed_at);

UPDATE employment_settings es
SET household_nanny_id = hn.id
FROM household_nannies hn
WHERE es.household_id = hn.household_id
  AND es.nanny_user_id = hn.user_id
  AND es.household_nanny_id IS NULL;

UPDATE schedule_blocks sb
SET household_nanny_id = hn.id
FROM household_nannies hn
WHERE sb.household_id = hn.household_id
  AND sb.nanny_user_id = hn.user_id
  AND sb.household_nanny_id IS NULL;

UPDATE time_entries te
SET household_nanny_id = hn.id
FROM household_nannies hn
WHERE te.household_id = hn.household_id
  AND te.nanny_user_id = hn.user_id
  AND te.household_nanny_id IS NULL;

UPDATE overtime_adjustments oa
SET household_nanny_id = hn.id
FROM household_nannies hn
WHERE oa.household_id = hn.household_id
  AND oa.nanny_user_id = hn.user_id
  AND oa.household_nanny_id IS NULL;

UPDATE payment_advances pa
SET household_nanny_id = hn.id
FROM household_nannies hn
WHERE pa.household_id = hn.household_id
  AND pa.nanny_user_id = hn.user_id
  AND pa.household_nanny_id IS NULL;

UPDATE time_off_requests tor
SET household_nanny_id = hn.id
FROM household_nannies hn
WHERE tor.household_id = hn.household_id
  AND tor.nanny_user_id = hn.user_id
  AND tor.household_nanny_id IS NULL;

UPDATE pto_balances pb
SET household_nanny_id = hn.id
FROM household_nannies hn
WHERE pb.household_id = hn.household_id
  AND pb.nanny_user_id = hn.user_id
  AND pb.household_nanny_id IS NULL;

-- Sync helper: keep nanny_user_id in sync when claimed (for transition)
CREATE OR REPLACE FUNCTION sync_household_nanny_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.household_nanny_id IS NOT NULL AND NEW.nanny_user_id IS NULL THEN
    SELECT user_id INTO NEW.nanny_user_id
    FROM household_nannies
    WHERE id = NEW.household_nanny_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_employment_settings_sync_nanny
  BEFORE INSERT OR UPDATE ON employment_settings
  FOR EACH ROW EXECUTE FUNCTION sync_household_nanny_user_id();

CREATE TRIGGER trg_schedule_blocks_sync_nanny
  BEFORE INSERT OR UPDATE ON schedule_blocks
  FOR EACH ROW EXECUTE FUNCTION sync_household_nanny_user_id();

CREATE TRIGGER trg_time_entries_sync_nanny
  BEFORE INSERT OR UPDATE ON time_entries
  FOR EACH ROW EXECUTE FUNCTION sync_household_nanny_user_id();

CREATE TRIGGER trg_overtime_adjustments_sync_nanny
  BEFORE INSERT OR UPDATE ON overtime_adjustments
  FOR EACH ROW EXECUTE FUNCTION sync_household_nanny_user_id();

CREATE TRIGGER trg_payment_advances_sync_nanny
  BEFORE INSERT OR UPDATE ON payment_advances
  FOR EACH ROW EXECUTE FUNCTION sync_household_nanny_user_id();

CREATE TRIGGER trg_time_off_requests_sync_nanny
  BEFORE INSERT OR UPDATE ON time_off_requests
  FOR EACH ROW EXECUTE FUNCTION sync_household_nanny_user_id();

CREATE TRIGGER trg_pto_balances_sync_nanny
  BEFORE INSERT OR UPDATE ON pto_balances
  FOR EACH ROW EXECUTE FUNCTION sync_household_nanny_user_id();

-- Allow records before nanny claims their account
ALTER TABLE employment_settings ALTER COLUMN nanny_user_id DROP NOT NULL;
ALTER TABLE schedule_blocks ALTER COLUMN nanny_user_id DROP NOT NULL;
ALTER TABLE time_entries ALTER COLUMN nanny_user_id DROP NOT NULL;
ALTER TABLE overtime_adjustments ALTER COLUMN nanny_user_id DROP NOT NULL;
ALTER TABLE payment_advances ALTER COLUMN nanny_user_id DROP NOT NULL;
ALTER TABLE time_off_requests ALTER COLUMN nanny_user_id DROP NOT NULL;
ALTER TABLE pto_balances ALTER COLUMN nanny_user_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pto_balances_household_nanny_key
  ON pto_balances(household_id, household_nanny_id)
  WHERE household_nanny_id IS NOT NULL;

-- RLS
ALTER TABLE household_nannies ENABLE ROW LEVEL SECURITY;

CREATE POLICY hn_select ON household_nannies FOR SELECT USING (is_household_member(household_id));
CREATE POLICY hn_parent ON household_nannies FOR ALL USING (is_parent_role(household_id));

-- Parent creates nanny profile (no auth account required)
CREATE OR REPLACE FUNCTION create_household_nanny(
  p_household_id UUID,
  p_first_name TEXT,
  p_last_name TEXT,
  p_email TEXT,
  p_phone TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
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
    WHERE household_id = p_household_id AND lower(email) = v_email
  ) THEN
    RAISE EXCEPTION 'A nanny with this email already exists in your household';
  END IF;

  INSERT INTO household_nannies (household_id, first_name, last_name, email, phone, notes)
  VALUES (
    p_household_id,
    trim(p_first_name),
    trim(p_last_name),
    v_email,
    NULLIF(trim(p_phone), ''),
    NULLIF(trim(p_notes), '')
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

-- Generate claim link for an unclaimed nanny profile
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
    RAISE EXCEPTION 'Only parents can create claim links';
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

-- Nanny claims their profile after signing up / signing in
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

  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();

  SELECT * INTO v_nanny
  FROM household_nannies
  WHERE claim_token = p_claim_token
    AND claimed_at IS NULL
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

  UPDATE employment_settings SET nanny_user_id = auth.uid()
  WHERE household_nanny_id = v_nanny.id;

  UPDATE schedule_blocks SET nanny_user_id = auth.uid()
  WHERE household_nanny_id = v_nanny.id;

  UPDATE time_entries SET nanny_user_id = auth.uid()
  WHERE household_nanny_id = v_nanny.id;

  UPDATE overtime_adjustments SET nanny_user_id = auth.uid()
  WHERE household_nanny_id = v_nanny.id;

  UPDATE payment_advances SET nanny_user_id = auth.uid()
  WHERE household_nanny_id = v_nanny.id;

  UPDATE time_off_requests SET nanny_user_id = auth.uid()
  WHERE household_nanny_id = v_nanny.id;

  UPDATE pto_balances SET nanny_user_id = auth.uid()
  WHERE household_nanny_id = v_nanny.id;

  UPDATE household_invites SET accepted_at = now()
  WHERE household_id = v_nanny.household_id
    AND lower(email) = lower(v_nanny.email)
    AND accepted_at IS NULL;

  RETURN v_nanny.household_id;
END;
$$;

-- Link existing account immediately (optional shortcut)
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
  v_household_nanny_id UUID;
  v_email TEXT;
  v_profile profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT is_parent_role(p_household_id) THEN
    RAISE EXCEPTION 'Only parents can add nannies';
  END IF;

  v_email := lower(trim(p_email));

  SELECT id INTO v_nanny_user_id FROM auth.users WHERE lower(email) = v_email;
  IF v_nanny_user_id IS NULL THEN
    RAISE EXCEPTION 'No account exists for this email. Add them as a nanny first, then send a claim link.';
  END IF;

  IF v_nanny_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot add yourself as the nanny';
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = v_nanny_user_id;

  SELECT id INTO v_household_nanny_id
  FROM household_nannies
  WHERE household_id = p_household_id AND lower(email) = v_email;

  IF v_household_nanny_id IS NULL THEN
    INSERT INTO household_nannies (
      household_id, first_name, last_name, email, user_id, claimed_at
    )
    VALUES (
      p_household_id,
      COALESCE(NULLIF(split_part(COALESCE(v_profile.display_name, 'Nanny'), ' ', 1), ''), 'Nanny'),
      COALESCE(
        NULLIF(trim(substring(COALESCE(v_profile.display_name, 'Nanny') from position(' ' in COALESCE(v_profile.display_name, 'Nanny') || ' ') + 1)), ''),
        ''
      ),
      v_email,
      v_nanny_user_id,
      now()
    )
    RETURNING id INTO v_household_nanny_id;
  ELSE
    UPDATE household_nannies
    SET user_id = v_nanny_user_id, claimed_at = now(), updated_at = now()
    WHERE id = v_household_nanny_id;
  END IF;

  INSERT INTO household_members (household_id, user_id, role, status)
  VALUES (p_household_id, v_nanny_user_id, 'nanny', 'active')
  ON CONFLICT (household_id, user_id) DO UPDATE SET role = 'nanny', status = 'active';

  INSERT INTO pto_balances (household_id, household_nanny_id, nanny_user_id)
  VALUES (p_household_id, v_household_nanny_id, v_nanny_user_id)
  ON CONFLICT (household_id, nanny_user_id) DO UPDATE
    SET household_nanny_id = EXCLUDED.household_nanny_id;

  RETURN v_household_nanny_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_household_nanny(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_nanny_claim_link(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION claim_nanny_profile(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION add_nanny_by_email(UUID, TEXT) TO authenticated;
