-- Fix: creators could not read household row after insert (before membership exists)
DROP POLICY IF EXISTS households_select ON households;
CREATE POLICY households_select ON households FOR SELECT USING (
  is_household_member(id) OR created_by = auth.uid()
);

-- Atomic household + owner membership (avoids RLS chicken-and-egg on onboarding)
CREATE OR REPLACE FUNCTION create_household_with_owner(
  p_name TEXT,
  p_timezone TEXT DEFAULT 'America/New_York'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hid UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO households (name, timezone, created_by)
  VALUES (p_name, p_timezone, auth.uid())
  RETURNING id INTO hid;

  INSERT INTO household_members (household_id, user_id, role, status)
  VALUES (hid, auth.uid(), 'owner', 'active')
  ON CONFLICT (household_id, user_id) DO UPDATE
    SET role = 'owner', status = 'active';

  RETURN hid;
END;
$$;

GRANT EXECUTE ON FUNCTION create_household_with_owner(TEXT, TEXT) TO authenticated;
