ALTER TABLE employment_settings
  ADD COLUMN IF NOT EXISTS auto_record_advance_repayments BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN employment_settings.auto_record_advance_repayments IS
  'When true, closing a pay period records suggested advance repayments for that period automatically.';
