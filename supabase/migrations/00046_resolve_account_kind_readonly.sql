-- resolve_user_account_kind was STABLE but performed UPDATEs, which breaks
-- get_my_session_context (Postgres: "UPDATE is not allowed in a non-volatile function").

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
    RETURN 'family'::account_kind;
  END IF;

  IF EXISTS (
    SELECT 1 FROM household_nannies hn
    WHERE hn.user_id = p_user_id
      AND hn.claimed_at IS NOT NULL
  ) THEN
    RETURN 'nanny'::account_kind;
  END IF;

  IF EXISTS (
    SELECT 1 FROM household_members hm
    WHERE hm.user_id = p_user_id AND hm.status = 'active' AND hm.role = 'nanny'
  ) THEN
    RETURN 'nanny'::account_kind;
  END IF;

  RETURN COALESCE(v_kind, 'unset'::account_kind);
END;
$$;

-- Optional: persist account_kind corrections (call from app on login/signup, not from STABLE RPCs).
CREATE OR REPLACE FUNCTION sync_user_account_kind(p_user_id UUID)
RETURNS account_kind
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resolved account_kind;
BEGIN
  v_resolved := resolve_user_account_kind(p_user_id);

  IF v_resolved IN ('family', 'nanny') THEN
    UPDATE profiles
    SET account_kind = v_resolved, updated_at = now()
    WHERE id = p_user_id AND account_kind IS DISTINCT FROM v_resolved;
  END IF;

  RETURN v_resolved;
END;
$$;

GRANT EXECUTE ON FUNCTION sync_user_account_kind(UUID) TO authenticated;
