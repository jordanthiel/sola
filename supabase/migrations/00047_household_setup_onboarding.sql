-- Track household setup wizard completion (nanny, schedule, events, tour)

ALTER TABLE households
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- Existing households are treated as already set up
UPDATE households
SET onboarding_completed_at = created_at
WHERE onboarding_completed_at IS NULL;

CREATE OR REPLACE FUNCTION complete_household_onboarding(p_household_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT is_parent_role(p_household_id) THEN
    RAISE EXCEPTION 'Only household parents can complete onboarding';
  END IF;

  UPDATE households
  SET onboarding_completed_at = now(), updated_at = now()
  WHERE id = p_household_id;
END;
$$;

GRANT EXECUTE ON FUNCTION complete_household_onboarding(UUID) TO authenticated;

-- Return type changed: must drop before recreate (PostgreSQL 42P13).
-- get_my_session_context() calls list_my_households(), so drop it first.
DROP FUNCTION IF EXISTS get_my_session_context();
DROP FUNCTION IF EXISTS list_my_households();

CREATE FUNCTION list_my_households()
RETURNS TABLE (
  id UUID,
  name TEXT,
  timezone TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  onboarding_completed_at TIMESTAMPTZ,
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
    h.onboarding_completed_at,
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
    h.onboarding_completed_at,
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
    h.onboarding_completed_at,
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

GRANT EXECUTE ON FUNCTION list_my_households() TO authenticated;

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

GRANT EXECUTE ON FUNCTION get_my_session_context() TO authenticated;
