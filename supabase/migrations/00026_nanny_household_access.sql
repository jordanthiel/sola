-- Nannies could not read their own membership (RLS subquery on household_members) or household row

CREATE POLICY hm_select_own ON household_members FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY households_select_claimed_nanny ON households FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM household_nannies hn
      WHERE hn.household_id = households.id
        AND hn.user_id = auth.uid()
        AND hn.claimed_at IS NOT NULL
        AND hn.deactivated_at IS NULL
    )
  );

-- Reliable household list for the signed-in user (members + claimed nanny profiles)
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

GRANT EXECUTE ON FUNCTION list_my_households() TO authenticated;
