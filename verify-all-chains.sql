-- 🔍 验证数据库中的所有链条
-- 这个查询会显示所有链条，包括已删除的

-- 1. 检查所有链条（包括已删除的）
SELECT 
    id,
    name,
    deleted_at,
    CASE 
        WHEN deleted_at IS NULL THEN '活跃'
        ELSE '已删除'
    END as status,
    created_at,
    user_id
FROM chains 
ORDER BY 
    CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END,  -- 活跃链条在前
    COALESCE(deleted_at, created_at) DESC;           -- 按删除时间或创建时间排序

-- 2. 统计信息
SELECT 
    COUNT(*) as total_chains,
    COUNT(CASE WHEN deleted_at IS NULL THEN 1 END) as active_chains,
    COUNT(CASE WHEN deleted_at IS NOT NULL THEN 1 END) as deleted_chains
FROM chains;

-- 3. 检查是否有 deleted_at 列
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'chains' 
AND column_name IN ('deleted_at', 'id', 'name', 'user_id')
ORDER BY column_name;

-- 4. 如果有已删除的链条，显示详细信息
SELECT 
    id,
    name,
    deleted_at,
    created_at,
    user_id,
    EXTRACT(EPOCH FROM (NOW() - deleted_at))/60 as minutes_since_deleted
FROM chains 
WHERE deleted_at IS NOT NULL
ORDER BY deleted_at DESC;