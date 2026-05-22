-- Allow reading profiles of anyone in the same household (members and claimed nannies),
-- including nanny-only access via household_nannies (see list_my_households).

CREATE POLICY profiles_select_household_coworkers ON profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM household_members viewer
      WHERE viewer.user_id = auth.uid()
        AND viewer.status = 'active'
        AND (
          EXISTS (
            SELECT 1
            FROM household_members peer
            WHERE peer.household_id = viewer.household_id
              AND peer.user_id = profiles.id
              AND peer.status = 'active'
          )
          OR EXISTS (
            SELECT 1
            FROM household_nannies hn
            WHERE hn.household_id = viewer.household_id
              AND hn.user_id = profiles.id
              AND hn.deactivated_at IS NULL
          )
        )
    )
    OR EXISTS (
      SELECT 1
      FROM household_nannies viewer
      WHERE viewer.user_id = auth.uid()
        AND viewer.claimed_at IS NOT NULL
        AND viewer.deactivated_at IS NULL
        AND (
          EXISTS (
            SELECT 1
            FROM household_members peer
            WHERE peer.household_id = viewer.household_id
              AND peer.user_id = profiles.id
              AND peer.status = 'active'
          )
          OR EXISTS (
            SELECT 1
            FROM household_nannies hn
            WHERE hn.household_id = viewer.household_id
              AND hn.user_id = profiles.id
              AND hn.deactivated_at IS NULL
          )
        )
    )
  );
