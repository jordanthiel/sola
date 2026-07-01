-- Email used when creating the Gusto company (must match accept_terms_of_service)

ALTER TABLE gusto_companies
  ADD COLUMN IF NOT EXISTS payroll_admin_email TEXT;

COMMENT ON COLUMN gusto_companies.payroll_admin_email IS
  'Payroll admin email from partner_managed_companies; required for accept_terms_of_service';

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
  payroll_admin_email,
  created_at,
  updated_at
FROM gusto_companies;

GRANT SELECT (payroll_admin_email) ON gusto_companies TO authenticated;

GRANT SELECT ON gusto_companies_public TO authenticated;
