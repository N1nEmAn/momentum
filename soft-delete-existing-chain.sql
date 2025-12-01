-- 🗑️ 软删除现有链条来测试回收箱功能
-- 使用你的用户ID: 49fe7e35-2ae7-450b-9df6-c233b38f781c

-- 1. 查看当前用户的所有活跃链条
SELECT 
    id,
    name,
    deleted_at,
    created_at,
    CASE 
        WHEN deleted_at IS NULL THEN '✅ 活跃'
        ELSE '🗑️ 已删除'
    END as status
FROM chains 
WHERE user_id = '49fe7e35-2ae7-450b-9df6-c233b38f781c'
ORDER BY created_at DESC;

-- 2. 软删除第一个活跃链条（如果存在）
-- 注意：这会将你的一个现有链条移到回收箱
UPDATE chains 
SET deleted_at = NOW()
WHERE user_id = '49fe7e35-2ae7-450b-9df6-c233b38f781c'
  AND deleted_at IS NULL
  AND id = (
    SELECT id 
    FROM chains 
    WHERE user_id = '49fe7e35-2ae7-450b-9df6-c233b38f781c' 
      AND deleted_at IS NULL 
    ORDER BY created_at DESC 
    LIMIT 1
  );

-- 3. 验证软删除结果
SELECT 
    id,
    name,
    deleted_at,
    created_at,
    CASE 
        WHEN deleted_at IS NULL THEN '✅ 活跃'
        ELSE '🗑️ 已删除'
    END as status,
    CASE 
        WHEN deleted_at IS NOT NULL THEN 
            ROUND(EXTRACT(EPOCH FROM (NOW() - deleted_at))/60, 1) 
        ELSE NULL 
    END as minutes_since_deleted
FROM chains 
WHERE user_id = '49fe7e35-2ae7-450b-9df6-c233b38f781c'
ORDER BY 
    CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END,
    COALESCE(deleted_at, created_at) DESC;