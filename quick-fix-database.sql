-- 一键修复数据库架构 - 添加回收箱功能所需的字段
-- 请在 Supabase Dashboard 的 SQL Editor 中执行此脚本

-- 1. 添加 deleted_at 字段（软删除功能）
ALTER TABLE chains ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone DEFAULT NULL;

-- 2. 添加其他缺失的字段（如果不存在）
ALTER TABLE chains ADD COLUMN IF NOT EXISTS is_durationless boolean DEFAULT false;
ALTER TABLE chains ADD COLUMN IF NOT EXISTS time_limit_hours integer DEFAULT NULL;
ALTER TABLE chains ADD COLUMN IF NOT EXISTS time_limit_exceptions jsonb DEFAULT '[]'::jsonb;
ALTER TABLE chains ADD COLUMN IF NOT EXISTS group_started_at timestamp with time zone DEFAULT NULL;
ALTER TABLE chains ADD COLUMN IF NOT EXISTS group_expires_at timestamp with time zone DEFAULT NULL;

-- 3. 创建索引提升查询性能
CREATE INDEX IF NOT EXISTS idx_chains_deleted_at ON chains(deleted_at);
CREATE INDEX IF NOT EXISTS idx_chains_user_deleted ON chains(user_id, deleted_at);

-- 4. 添加字段注释
COMMENT ON COLUMN chains.deleted_at IS '软删除时间戳，NULL表示未删除，有值表示已删除';
COMMENT ON COLUMN chains.is_durationless IS '是否为无时长任务（手动结束）';
COMMENT ON COLUMN chains.time_limit_hours IS '任务群时间限制（小时）';
COMMENT ON COLUMN chains.time_limit_exceptions IS '时间限制例外规则';
COMMENT ON COLUMN chains.group_started_at IS '任务群开始时间';
COMMENT ON COLUMN chains.group_expires_at IS '任务群过期时间';

-- 5. 验证字段是否添加成功
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'chains' 
    AND column_name IN ('deleted_at', 'is_durationless', 'time_limit_hours', 'time_limit_exceptions', 'group_started_at', 'group_expires_at')
ORDER BY column_name;