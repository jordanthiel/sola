-- Fix gusto_companies_public: the old view filtered with is_parent_role() inside the
-- view definition, which returns no rows for service-role (edge function) callers.

DROP VIEW IF EXISTS gusto_companies_public;

CREATE VIEW gusto_companies_public
WITH (security_invoker = true) AS
SELECT
  id,
  household_id,
  company_uuid,
  onboarding_status,
  terms_accepted_at,
  approved_at,
  onboarding_steps,
  created_at,
  updated_at
FROM gusto_companies;

CREATE POLICY gusto_companies_parent_read ON gusto_companies
  FOR SELECT
  USING (is_parent_role(household_id));

GRANT SELECT (
  id,
  household_id,
  company_uuid,
  onboarding_status,
  terms_accepted_at,
  approved_at,
  onboarding_steps,
  payroll_admin_email,
  created_at,
  updated_at
) ON gusto_companies TO authenticated;

GRANT SELECT ON gusto_companies_public TO authenticated;
