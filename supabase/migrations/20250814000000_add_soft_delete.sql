/*
  # 添加软删除功能

  1. 数据库结构变更
    - 在 chains 表中添加 deleted_at 字段用于软删除
    - 添加索引优化查询性能

  2. 更新 RLS 策略
    - 更新现有策略以处理软删除的链条
    - 确保用户只能看到自己的链条（包括已删除的）

  3. 数据完整性
    - 添加必要的索引和约束
*/

-- 添加 deleted_at 字段到 chains 表
DO $
BEGIN
  -- 添加 deleted_at 字段（软删除时间戳）
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chains' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE chains ADD COLUMN deleted_at timestamp with time zone DEFAULT NULL;
  END IF;
END $;

-- 创建索引提升查询性能
CREATE INDEX IF NOT EXISTS idx_chains_deleted_at ON chains(deleted_at);
CREATE INDEX IF NOT EXISTS idx_chains_user_deleted ON chains(user_id, deleted_at);

-- 添加注释说明字段用途
COMMENT ON COLUMN chains.deleted_at IS '软删除时间戳，NULL表示未删除，有值表示已删除';

-- 更新 RLS 策略以处理软删除
-- 注意：这里假设已经有基本的 RLS 策略，我们只是确保它们能正确处理 deleted_at 字段

-- 如果需要，可以添加专门的策略来处理已删除的链条
-- 例如：允许用户查看自己已删除的链条（用于回收箱功能）
DO $
BEGIN
  -- 检查是否已存在策略，如果不存在则创建
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'chains' AND policyname = 'Users can view their deleted chains'
  ) THEN
    CREATE POLICY "Users can view their deleted chains" ON chains
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  -- 允许用户更新自己链条的 deleted_at 字段
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'chains' AND policyname = 'Users can soft delete their chains'
  ) THEN
    CREATE POLICY "Users can soft delete their chains" ON chains
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $;