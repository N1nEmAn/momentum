-- 🧪 简单的测试链条创建脚本
-- 请将 YOUR_USER_ID 替换为你在控制台中看到的实际用户ID

-- 1. 创建一个最简单的已删除链条
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
    '测试回收箱链条',
    'YOUR_USER_ID',  -- 🚨 请替换为你的实际用户ID
    'unit',
    extract(epoch from now()),
    '每天测试',
    30,
    '这是一个测试回收箱功能的链条',
    0,
    0,
    0,
    0,
    0,
    '[]'::jsonb,
    '[]'::jsonb,
    'none',
    now() - interval '2 minutes',  -- 2分钟前删除
    now() - interval '1 hour'      -- 1小时前创建
);

-- 2. 验证创建成功
SELECT 
    id,
    name,
    deleted_at,
    user_id,
    CASE 
        WHEN deleted_at IS NULL THEN '活跃'
        ELSE '已删除'
    END as status,
    EXTRACT(EPOCH FROM (NOW() - deleted_at))/60 as minutes_since_deleted
FROM chains 
WHERE user_id = 'YOUR_USER_ID'  -- 🚨 请替换为你的实际用户ID
ORDER BY created_at DESC;