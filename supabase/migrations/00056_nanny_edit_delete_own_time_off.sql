-- Let nannies edit and delete their own time off at any status.
-- Parents already have full access via tor_parent.

DROP POLICY IF EXISTS tor_nanny_update ON time_off_requests;
DROP POLICY IF EXISTS tor_nanny_delete ON time_off_requests;

CREATE POLICY tor_nanny_update ON time_off_requests FOR UPDATE
  USING (
    nanny_user_id = auth.uid()
    OR is_my_claimed_nanny_profile(household_nanny_id)
  )
  WITH CHECK (
    nanny_user_id = auth.uid()
    OR is_my_claimed_nanny_profile(household_nanny_id)
  );

CREATE POLICY tor_nanny_delete ON time_off_requests FOR DELETE
  USING (
    nanny_user_id = auth.uid()
    OR is_my_claimed_nanny_profile(household_nanny_id)
  );
