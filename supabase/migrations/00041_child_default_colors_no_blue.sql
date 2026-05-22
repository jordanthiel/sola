-- Default child colors skip blue (reserved for nanny shifts on the calendar)

CREATE OR REPLACE FUNCTION assign_child_color_key()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_palette TEXT[] := ARRAY['green', 'orange', 'purple', 'rose', 'teal', 'amber', 'indigo'];
  v_count INTEGER;
BEGIN
  IF NEW.color_key IS NOT NULL AND btrim(NEW.color_key) <> '' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_count
  FROM children
  WHERE household_id = NEW.household_id;

  NEW.color_key := v_palette[1 + (v_count % array_length(v_palette, 1))];
  RETURN NEW;
END;
$$;
