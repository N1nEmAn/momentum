-- 测试软删除功能
-- 在 Supabase Dashboard 的 SQL Editor 中执行此脚本来测试回收箱功能

-- 1. 查看当前用户的所有链条
SELECT 
    'Current chains' as test_step,
    id,
    name,
    type,
    deleted_at,
    CASE 
        WHEN deleted_at IS NULL THEN 'Active'
        ELSE 'Deleted'
    END as status
FROM chains 
WHERE user_id = auth.uid()
ORDER BY created_at DESC;

-- 2. 如果你想手动测试软删除，可以执行以下命令
-- （替换 'your-chain-id' 为实际的链条ID）
/*
UPDATE chains 
SET deleted_at = NOW() 
WHERE id = 'your-chain-id' AND user_id = auth.uid();
*/

-- 3. 查看已删除的链条
SELECT 
    'Deleted chains' as test_step,
    id,
    name,
    type,
    deleted_at,
    EXTRACT(EPOCH FROM (NOW() - deleted_at))/86400 as days_since_deleted
FROM chains 
WHERE user_id = auth.uid() 
    AND deleted_at IS NOT NULL
ORDER BY deleted_at DESC;

-- 4. 查看活跃的链条
SELECT 
    'Active chains' as test_step,
    id,
    name,
    type,
    created_at
FROM chains 
WHERE user_id = auth.uid() 
    AND deleted_at IS NULL
ORDER BY created_at DESC;

-- 5. 统计信息
SELECT 
    'Statistics' as test_step,
    COUNT(*) as total_chains,
    COUNT(CASE WHEN deleted_at IS NULL THEN 1 END) as active_chains,
    COUNT(CASE WHEN deleted_at IS NOT NULL THEN 1 END) as deleted_chains
FROM chains 
WHERE user_id = auth.uid();