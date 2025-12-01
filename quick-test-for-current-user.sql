-- 🚀 快速测试 - 为当前用户创建已删除链条
-- 基于你的调试输出，使用可能的当前用户ID

-- 为用户 49fe7e35-2ae7-450b-9df6-c233b38f781c 创建测试链条
INSERT INTO chains (
    id,
    name,
    user_id,
    type,
    sort_order,
    trigger,
    duration,
    description,
    current_streak,
    auxiliary_streak,
    total_completions,
    total_failures,
    auxiliary_failures,
    exceptions,
    auxiliary_exceptions,
    auxiliary_signal,
    deleted_at,
    created_at
) VALUES (
    gen_random_uuid(),
    '🗑️ 回收箱测试链条',
    '49fe7e35-2ae7-450b-9df6-c233b38f781c',
    'unit',
    extract(epoch from now()),
    '测试触发器',
    25,
    '回收箱功能测试链条',
    0,
    0,
    0,
    0,
    0,
    '[]'::jsonb,
    '[]'::jsonb,
    'none',
    now() - interval '1 minute',   -- 1分钟前删除
    now() - interval '30 minutes'  -- 30分钟前创建
);

-- 验证结果
SELECT 
    id,
    name,
    deleted_at,
    user_id,
    CASE 
        WHEN deleted_at IS NULL THEN '✅ 活跃'
        ELSE '🗑️ 已删除'
    END as status,
    ROUND(EXTRACT(EPOCH FROM (NOW() - deleted_at))/60, 1) as minutes_since_deleted
FROM chains 
WHERE user_id = '49fe7e35-2ae7-450b-9df6-c233b38f781c'
ORDER BY 
    CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END,
    COALESCE(deleted_at, created_at) DESC;