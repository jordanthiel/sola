-- Let claimed nannies read their own profile row (household_id) even if membership sync lags
CREATE POLICY hn_nanny_own ON household_nannies FOR SELECT
  USING (user_id = auth.uid());
