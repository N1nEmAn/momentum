/*
  # 添加任务群时间限定功能

  1. 数据库结构变更
    - 在 chains 表中添加时间限定相关字段
    - 添加 time_limit_hours 字段设置时间限制（小时）
    - 添加 time_limit_exceptions 字段存储例外规则
    - 添加 group_started_at 字段记录任务群开始时间
    - 添加 group_expires_at 字段记录任务群过期时间

  2. 索引优化
    - 为 group_expires_at 添加索引以便快速查询过期任务群

  3. 数据完整性
    - 确保只有 group 类型的任务才有时间限定功能
    - 添加必要的约束条件
*/

-- 添加新字段到 chains 表
DO $$
BEGIN
  -- 添加 time_limit_hours 字段（时间限制，小时）
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chains' AND column_name = 'time_limit_hours'
  ) THEN
    ALTER TABLE chains ADD COLUMN time_limit_hours integer DEFAULT NULL;
  END IF;

  -- 添加 time_limit_exceptions 字段（例外规则）
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chains' AND column_name = 'time_limit_exceptions'
  ) THEN
    ALTER TABLE chains ADD COLUMN time_limit_exceptions jsonb DEFAULT '[]'::jsonb;
  END IF;

  -- 添加 group_started_at 字段（任务群开始时间）
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chains' AND column_name = 'group_started_at'
  ) THEN
    ALTER TABLE chains ADD COLUMN group_started_at timestamp with time zone DEFAULT NULL;
  END IF;

  -- 添加 group_expires_at 字段（任务群过期时间）
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chains' AND column_name = 'group_expires_at'
  ) THEN
    ALTER TABLE chains ADD COLUMN group_expires_at timestamp with time zone DEFAULT NULL;
  END IF;
END $$;

-- 创建索引提升查询性能
CREATE INDEX IF NOT EXISTS idx_chains_group_expires_at ON chains(group_expires_at);
CREATE INDEX IF NOT EXISTS idx_chains_type_group_started ON chains("type", group_started_at);

-- 添加约束确保数据完整性
DO $$
BEGIN
  -- 确保只有 group 类型的任务才有时间限定
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'chains_time_limit_check'
  ) THEN
    ALTER TABLE chains ADD CONSTRAINT chains_time_limit_check 
    CHECK (
      ("type" = 'group' AND time_limit_hours IS NOT NULL) OR 
      ("type" != 'group' AND time_limit_hours IS NULL)
    );
  END IF;

  -- 确保时间限制为正数
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'chains_time_limit_hours_check'
  ) THEN
    ALTER TABLE chains ADD CONSTRAINT chains_time_limit_hours_check 
    CHECK (time_limit_hours IS NULL OR time_limit_hours > 0);
  END IF;
END $$;

-- 添加注释说明字段用途
COMMENT ON COLUMN chains.time_limit_hours IS '任务群时间限制（小时），仅在 type=group 时有效';
COMMENT ON COLUMN chains.time_limit_exceptions IS '时间限制例外规则，JSON 数组格式';
COMMENT ON COLUMN chains.group_started_at IS '任务群开始时间，用于计算是否超时';
COMMENT ON COLUMN chains.group_expires_at IS '任务群过期时间，自动计算得出';
