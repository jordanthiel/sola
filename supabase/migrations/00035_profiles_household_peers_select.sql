-- Household members can read profiles of other active members in the same household
-- (needed for member lists, feed authors, mentions, etc.)

CREATE POLICY profiles_select_household_peers ON profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM household_members viewer
      INNER JOIN household_members peer
        ON viewer.household_id = peer.household_id
      WHERE viewer.user_id = auth.uid()
        AND peer.user_id = profiles.id
        AND viewer.status = 'active'
        AND peer.status = 'active'
    )
  );
