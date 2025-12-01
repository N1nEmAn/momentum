/*
  为 chains 表增加 is_durationless 列，表示无时长任务（手动结束）。
*/
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chains' AND column_name = 'is_durationless'
  ) THEN
    ALTER TABLE chains ADD COLUMN is_durationless boolean NOT NULL DEFAULT false;
  END IF;
END $$;

COMMENT ON COLUMN chains.is_durationless IS '无时长任务开关，true 表示不倒计时，由用户手动结束';
