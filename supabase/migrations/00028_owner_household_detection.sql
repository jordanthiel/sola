-- Prefer family (owner/parent) over nanny when resolving account kind.
-- Include households created_by user even if membership row is missing.

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

  RETURN COALESCE(v_kind, 'unset'::account_kind);
END;
$$;

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
   AND hn.deactivated_at IS NULL
  WHERE NOT EXISTS (
    SELECT 1 FROM household_members hm2
    WHERE hm2.household_id = h.id
      AND hm2.user_id = auth.uid()
      AND hm2.status = 'active'
  );
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
  ORDER BY
    CASE lh.member_role
      WHEN 'owner' THEN 0
      WHEN 'parent' THEN 1
      ELSE 2
    END,
    h.name
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT v_kind, NULL::UUID, NULL::TEXT, NULL::member_role, false;
  END IF;
END;
$$;

-- Correct owners mis-tagged as nanny when they have an active owner membership
UPDATE profiles p
SET account_kind = 'family', updated_at = now()
WHERE account_kind = 'nanny'
  AND EXISTS (
    SELECT 1 FROM household_members hm
    WHERE hm.user_id = p.id AND hm.status = 'active' AND hm.role IN ('owner', 'parent')
  );
