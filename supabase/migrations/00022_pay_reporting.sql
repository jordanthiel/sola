-- How pay is split between reported (on the books) vs informal (under the table)

CREATE TYPE pay_reporting_mode AS ENUM (
  'all_over',
  'all_under',
  'split',
  'regular_over_ot_under'
);

ALTER TABLE employment_settings
  ADD COLUMN IF NOT EXISTS pay_reporting_mode pay_reporting_mode NOT NULL DEFAULT 'all_over',
  ADD COLUMN IF NOT EXISTS over_table_percent NUMERIC(5,2) NOT NULL DEFAULT 100
    CHECK (over_table_percent >= 0 AND over_table_percent <= 100);

COMMENT ON COLUMN employment_settings.pay_reporting_mode IS
  'How gross pay is allocated: all on books, all cash, percent split, or regular on books / OT off books';
COMMENT ON COLUMN employment_settings.over_table_percent IS
  'When pay_reporting_mode is split: percent of each pay component reported on the books (0–100)';
