/*
  # 添加任务群功能支持

  1. 数据库结构变更
    - 在 chains 表中添加层级关系支持
    - 添加 parent_id 字段支持父子关系
    - 添加 type 字段区分单元类型和兵种
    - 添加 sort_order 字段支持排序

  2. 索引优化
    - 为 parent_id 添加索引提升查询性能
    - 为 type 和 sort_order 添加复合索引

  3. 数据完整性
    - 确保现有数据兼容性
    - 添加必要的约束条件
*/

-- 添加新字段到 chains 表
DO $$
BEGIN
  -- 添加 parent_id 字段（自引用外键）
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chains' AND column_name = 'parent_id'
  ) THEN
    ALTER TABLE chains ADD COLUMN parent_id uuid REFERENCES chains(id) ON DELETE SET NULL;
  END IF;

  -- 添加 type 字段（任务类型/兵种）
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chains' AND column_name = 'type'
  ) THEN
    ALTER TABLE chains ADD COLUMN "type" text NOT NULL DEFAULT 'unit';
  END IF;

  -- 添加 sort_order 字段（排序）
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chains' AND column_name = 'sort_order'
  ) THEN
    ALTER TABLE chains ADD COLUMN sort_order integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 创建索引提升查询性能
CREATE INDEX IF NOT EXISTS idx_chains_parent_id ON chains(parent_id);
CREATE INDEX IF NOT EXISTS idx_chains_type ON chains("type");
CREATE INDEX IF NOT EXISTS idx_chains_parent_sort ON chains(parent_id, sort_order);

-- 添加类型约束确保数据完整性
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'chains_type_check'
  ) THEN
    ALTER TABLE chains ADD CONSTRAINT chains_type_check 
    CHECK ("type" IN ('unit', 'group', 'assault', 'recon', 'command', 'special_ops', 'engineering', 'quartermaster'));
  END IF;
END $$;

-- 确保现有数据的兼容性（所有现有链默认为 unit 类型）
UPDATE chains SET "type" = 'unit' WHERE "type" IS NULL;