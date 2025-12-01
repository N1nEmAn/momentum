# 应用数据库迁移

为了使回收箱功能正常工作，你需要在 Supabase 数据库中应用最新的迁移。

## 方法1: 使用 Supabase CLI（推荐）

如果你已经安装了 Supabase CLI：

```bash
# 应用所有待处理的迁移
supabase db push

# 或者只应用特定的迁移
supabase migration up
```

## 方法2: 手动在 Supabase Dashboard 中执行

1. 打开你的 Supabase 项目 Dashboard
2. 进入 "SQL Editor" 
3. 复制并执行以下 SQL 代码：

```sql
-- 添加软删除字段
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
DO $
BEGIN
  -- 允许用户查看自己已删除的链条（用于回收箱功能）
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
```

## 验证迁移是否成功

执行以下查询来验证 `deleted_at` 字段是否已添加：

```sql
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'chains' AND column_name = 'deleted_at';
```

如果返回结果显示 `deleted_at` 字段存在，说明迁移成功。

## 注意事项

- 应用迁移后，现有的链条会继续正常显示（因为它们的 `deleted_at` 字段为 NULL）
- 新的删除操作会使用软删除功能
- 回收箱功能将完全可用
- 自动清理功能会在30天后永久删除回收箱中的链条

## 如果遇到问题

如果在应用迁移时遇到权限问题，请确保：
1. 你有数据库的管理员权限
2. 在 Supabase Dashboard 的 SQL Editor 中执行，而不是通过应用程序

应用迁移后，重新加载应用程序，所有功能应该都能正常工作。