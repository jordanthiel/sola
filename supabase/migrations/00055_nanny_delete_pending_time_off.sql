-- Let nannies cancel their own pending time off requests.
-- Parents already have full access via tor_parent.

DROP POLICY IF EXISTS tor_nanny_delete ON time_off_requests;

CREATE POLICY tor_nanny_delete ON time_off_requests FOR DELETE USING (
  status = 'pending'
  AND (
    nanny_user_id = auth.uid()
    OR is_my_claimed_nanny_profile(household_nanny_id)
  )
);
