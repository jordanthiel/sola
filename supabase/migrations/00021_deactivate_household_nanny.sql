-- Deactivate nannies: revoke access, exclude from payroll, keep historical records

ALTER TYPE member_status ADD VALUE IF NOT EXISTS 'inactive';

ALTER TABLE household_nannies
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_household_nannies_active
  ON household_nannies(household_id)
  WHERE deactivated_at IS NULL;

ALTER TABLE household_nannies
  DROP CONSTRAINT IF EXISTS household_nannies_household_id_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS household_nannies_household_email_active_key
  ON household_nannies(household_id, email)
  WHERE deactivated_at IS NULL;

-- Only block duplicate emails among active nanny profiles
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
    WHERE household_id = p_household_id
      AND lower(email) = v_email
      AND deactivated_at IS NULL
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
  WHERE id = p_household_nanny_id
    AND deactivated_at IS NULL;

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
      AND deactivated_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Cannot change email for a deactivated nanny';
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
      AND deactivated_at IS NULL
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

CREATE OR REPLACE FUNCTION deactivate_household_nanny(p_household_nanny_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household_id UUID;
  v_user_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT household_id, user_id
  INTO v_household_id, v_user_id
  FROM household_nannies
  WHERE id = p_household_nanny_id;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'Nanny not found';
  END IF;

  IF NOT is_parent_role(v_household_id) THEN
    RAISE EXCEPTION 'Only parents can deactivate nannies';
  END IF;

  IF EXISTS (
    SELECT 1 FROM household_nannies
    WHERE id = p_household_nanny_id AND deactivated_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'This nanny is already deactivated';
  END IF;

  UPDATE household_nannies
  SET
    deactivated_at = now(),
    deactivated_by = auth.uid(),
    claim_token = NULL,
    claim_token_expires_at = NULL,
    claim_invite_sent_at = NULL,
    claim_invite_sent_by = NULL,
    updated_at = now()
  WHERE id = p_household_nanny_id;

  IF v_user_id IS NOT NULL THEN
    UPDATE household_members
    SET status = 'inactive'
    WHERE household_id = v_household_id
      AND user_id = v_user_id
      AND role = 'nanny';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION deactivate_household_nanny(UUID) TO authenticated;

-- Nannies cannot edit shifts after deactivation (policy only checked household_nannies link)
DROP POLICY IF EXISTS sb_nanny_update ON schedule_blocks;
CREATE POLICY sb_nanny_update ON schedule_blocks
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM household_nannies hn
      WHERE hn.id = schedule_blocks.household_nanny_id
        AND hn.user_id = auth.uid()
        AND hn.household_id = schedule_blocks.household_id
        AND hn.deactivated_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM household_nannies hn
      WHERE hn.id = schedule_blocks.household_nanny_id
        AND hn.user_id = auth.uid()
        AND hn.household_id = schedule_blocks.household_id
        AND hn.deactivated_at IS NULL
    )
  );

-- report_shift_late: same guard
CREATE OR REPLACE FUNCTION report_shift_late(
  p_schedule_block_id UUID,
  p_actual_ends_at TIMESTAMPTZ,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row schedule_blocks%ROWTYPE;
  v_is_parent BOOLEAN;
  v_is_nanny BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_row FROM schedule_blocks WHERE id = p_schedule_block_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Shift not found';
  END IF;

  v_is_parent := is_parent_role(v_row.household_id);
  v_is_nanny := EXISTS (
    SELECT 1 FROM household_nannies hn
    WHERE hn.id = v_row.household_nanny_id
      AND hn.user_id = auth.uid()
      AND hn.deactivated_at IS NULL
  );

  IF NOT v_is_parent AND NOT v_is_nanny THEN
    RAISE EXCEPTION 'Not allowed to update this shift';
  END IF;

  IF p_actual_ends_at < v_row.ends_at THEN
    RAISE EXCEPTION 'Actual end must be at or after scheduled end';
  END IF;

  UPDATE schedule_blocks
  SET
    actual_ends_at = p_actual_ends_at,
    actual_notes = p_notes,
    updated_at = now()
  WHERE id = p_schedule_block_id;

  RETURN p_schedule_block_id;
END;
$$;

-- Do not notify deactivated nannies
CREATE OR REPLACE FUNCTION create_household_notification(
  p_household_id UUID,
  p_category notification_category,
  p_title TEXT,
  p_body TEXT DEFAULT NULL,
  p_link TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_exclude_user_id UUID DEFAULT NULL,
  p_target_user_ids UUID[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_prefs notification_preferences%ROWTYPE;
  v_cats JSONB;
  v_cat_key TEXT;
BEGIN
  v_cat_key := p_category::text;

  FOR v_user_id IN
    SELECT DISTINCT hm.user_id
    FROM household_members hm
    WHERE hm.household_id = p_household_id
      AND hm.status = 'active'
      AND (p_exclude_user_id IS NULL OR hm.user_id <> p_exclude_user_id)
      AND (p_target_user_ids IS NULL OR hm.user_id = ANY(p_target_user_ids))
    UNION
    SELECT DISTINCT hn.user_id
    FROM household_nannies hn
    WHERE hn.household_id = p_household_id
      AND hn.user_id IS NOT NULL
      AND hn.deactivated_at IS NULL
      AND (p_exclude_user_id IS NULL OR hn.user_id <> p_exclude_user_id)
      AND (p_target_user_ids IS NULL OR hn.user_id = ANY(p_target_user_ids))
  LOOP
    SELECT * INTO v_prefs
    FROM notification_preferences
    WHERE user_id = v_user_id AND household_id = p_household_id;

    IF NOT FOUND THEN
      INSERT INTO notification_preferences (user_id, household_id)
      VALUES (v_user_id, p_household_id)
      ON CONFLICT DO NOTHING;
      v_prefs.in_app_enabled := true;
      v_prefs.categories := '{"schedule":true,"time_off":true,"payroll":true,"feed":true,"incidents":true,"plans":true,"invites":true,"general":true}'::jsonb;
    END IF;

    IF NOT v_prefs.in_app_enabled THEN
      CONTINUE;
    END IF;

    v_cats := COALESCE(v_prefs.categories, '{}'::jsonb);
    IF v_cats ? v_cat_key AND (v_cats->>v_cat_key)::boolean = false THEN
      CONTINUE;
    END IF;

    INSERT INTO notifications (household_id, user_id, category, title, body, link, metadata)
    VALUES (p_household_id, v_user_id, p_category, p_title, p_body, p_link, p_metadata);
  END LOOP;
END;
$$;
