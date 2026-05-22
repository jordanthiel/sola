-- Deactivated nannies retain read access to their own payroll history (not schedule/family data)

CREATE OR REPLACE FUNCTION is_my_claimed_nanny_profile(p_household_nanny_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM household_nannies hn
    WHERE hn.id = p_household_nanny_id
      AND hn.user_id = auth.uid()
      AND hn.claimed_at IS NOT NULL
  );
$$;

-- Claimed nanny profiles (including deactivated) can still list their households
CREATE OR REPLACE FUNCTION list_my_households()
RETURNS TABLE (
  id UUID,
  name TEXT,
  timezone TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  member_role member_role
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    h.id,
    h.name,
    h.timezone,
    h.created_by,
    h.created_at,
    h.updated_at,
    hm.role AS member_role
  FROM households h
  INNER JOIN household_members hm
    ON hm.household_id = h.id
   AND hm.user_id = auth.uid()
   AND hm.status = 'active'
  UNION
  SELECT
    h.id,
    h.name,
    h.timezone,
    h.created_by,
    h.created_at,
    h.updated_at,
    'owner'::member_role AS member_role
  FROM households h
  WHERE h.created_by = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM household_members hm
      WHERE hm.household_id = h.id
        AND hm.user_id = auth.uid()
        AND hm.status = 'active'
    )
  UNION
  SELECT
    h.id,
    h.name,
    h.timezone,
    h.created_by,
    h.created_at,
    h.updated_at,
    'nanny'::member_role AS member_role
  FROM households h
  INNER JOIN household_nannies hn
    ON hn.household_id = h.id
   AND hn.user_id = auth.uid()
   AND hn.claimed_at IS NOT NULL
  WHERE NOT EXISTS (
    SELECT 1 FROM household_members hm2
    WHERE hm2.household_id = h.id
      AND hm2.user_id = auth.uid()
      AND hm2.status = 'active'
  );
$$;

DROP POLICY IF EXISTS households_select_claimed_nanny ON households;
CREATE POLICY households_select_claimed_nanny ON households FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM household_nannies hn
      WHERE hn.household_id = households.id
        AND hn.user_id = auth.uid()
        AND hn.claimed_at IS NOT NULL
    )
  );

-- Keep nanny account kind when only deactivated claimed profiles remain
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
    SELECT 1 FROM household_members hm
    WHERE hm.user_id = p_user_id AND hm.status = 'active' AND hm.role IN ('owner', 'parent')
  ) THEN
    UPDATE profiles SET account_kind = 'family', updated_at = now()
    WHERE id = p_user_id AND account_kind IS DISTINCT FROM 'family';
    RETURN 'family'::account_kind;
  END IF;

  IF EXISTS (
    SELECT 1 FROM households h
    WHERE h.created_by = p_user_id
      AND NOT EXISTS (
        SELECT 1 FROM household_members hm
        WHERE hm.household_id = h.id AND hm.user_id = p_user_id AND hm.status = 'active'
      )
  ) THEN
    UPDATE profiles SET account_kind = 'family', updated_at = now()
    WHERE id = p_user_id AND account_kind IS DISTINCT FROM 'family';
    RETURN 'family'::account_kind;
  END IF;

  IF EXISTS (
    SELECT 1 FROM household_nannies hn
    WHERE hn.user_id = p_user_id
      AND hn.claimed_at IS NOT NULL
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

  RETURN COALESCE(v_kind, 'unset'::account_kind);
END;
$$;

-- Payroll read policies for claimed nannies (including deactivated)
CREATE POLICY es_nanny_own_select ON employment_settings FOR SELECT
  USING (is_my_claimed_nanny_profile(household_nanny_id));

CREATE POLICY pa_nanny_own_select ON payment_advances FOR SELECT
  USING (is_my_claimed_nanny_profile(household_nanny_id));

CREATE POLICY pli_nanny_own_select ON payroll_line_items FOR SELECT
  USING (is_my_claimed_nanny_profile(household_nanny_id));

CREATE POLICY ppc_nanny_own_select ON pay_period_closes FOR SELECT
  USING (is_my_claimed_nanny_profile(household_nanny_id));

CREATE POLICY te_nanny_own_select ON time_entries FOR SELECT
  USING (is_my_claimed_nanny_profile(household_nanny_id));

CREATE POLICY ar_nanny_own_select ON advance_repayments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM payment_advances pa
      WHERE pa.id = advance_repayments.payment_advance_id
        AND is_my_claimed_nanny_profile(pa.household_nanny_id)
    )
  );
