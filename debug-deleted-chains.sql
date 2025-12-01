-- 调试已删除链条的查询
-- 在 Supabase Dashboard 的 SQL Editor 中执行此脚本

-- 1. 查看特定用户的所有链条（包括已删除的）
SELECT 
    'All chains for user' as debug_step,
    id,
    name,
    type,
    deleted_at,
    created_at,
    CASE 
        WHEN deleted_at IS NULL THEN 'Active'
        ELSE 'Deleted'
    END as status
FROM chains 
WHERE user_id = '49fe7e35-2ae7-450b-9df6-c233b38f781c'  -- 替换为你的用户ID
ORDER BY created_at DESC;

-- 2. 专门查看已删除的链条
SELECT 
    'Deleted chains only' as debug_step,
    id,
    name,
    type,
    deleted_at,
    EXTRACT(EPOCH FROM (NOW() - deleted_at))/60 as minutes_since_deleted
FROM chains 
WHERE user_id = '49fe7e35-2ae7-450b-9df6-c233b38f781c'  -- 替换为你的用户ID
    AND deleted_at IS NOT NULL
ORDER BY deleted_at DESC;

-- 3. 统计信息
SELECT 
    'Statistics' as debug_step,
    COUNT(*) as total_chains,
    COUNT(CASE WHEN deleted_at IS NULL THEN 1 END) as active_chains,
    COUNT(CASE WHEN deleted_at IS NOT NULL THEN 1 END) as deleted_chains,
    MAX(deleted_at) as latest_deletion
FROM chains 
WHERE user_id = '49fe7e35-2ae7-450b-9df6-c233b38f781c';  -- 替换为你的用户ID

-- 4. 查看最近的删除操作
SELECT 
    'Recent deletions' as debug_step,
    id,
    name,
    deleted_at,
    EXTRACT(EPOCH FROM (NOW() - deleted_at))/60 as minutes_ago
FROM chains 
WHERE user_id = '49fe7e35-2ae7-450b-9df6-c233b38f781c'  -- 替换为你的用户ID
    AND deleted_at IS NOT NULL
    AND deleted_at > NOW() - INTERVAL '1 hour'
ORDER BY deleted_at DESC;