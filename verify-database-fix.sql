-- 验证数据库修复是否成功
-- 在 Supabase Dashboard 的 SQL Editor 中执行此查询

-- 1. 检查所有必需的字段是否存在
SELECT 
    'chains 表字段检查' as check_type,
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'chains' 
    AND column_name IN (
        'deleted_at', 
        'is_durationless', 
        'time_limit_hours', 
        'time_limit_exceptions', 
        'group_started_at', 
        'group_expires_at'
    )
ORDER BY column_name;

-- 2. 检查索引是否创建成功
SELECT 
    'chains 表索引检查' as check_type,
    indexname as index_name,
    indexdef as index_definition
FROM pg_indexes 
WHERE tablename = 'chains' 
    AND indexname IN (
        'idx_chains_deleted_at',
        'idx_chains_user_deleted'
    );

-- 3. 统计当前数据
SELECT 
    'chains 表数据统计' as check_type,
    COUNT(*) as total_chains,
    COUNT(CASE WHEN deleted_at IS NULL THEN 1 END) as active_chains,
    COUNT(CASE WHEN deleted_at IS NOT NULL THEN 1 END) as deleted_chains
FROM chains;

-- 4. 检查 RLS 策略
SELECT 
    'RLS 策略检查' as check_type,
    policyname as policy_name,
    cmd as command_type,
    qual as policy_condition
FROM pg_policies 
WHERE tablename = 'chains'
ORDER BY policyname;