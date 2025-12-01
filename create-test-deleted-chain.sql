-- 🧪 为当前用户创建测试已删除链条
-- 请将 YOUR_USER_ID 替换为你在控制台中看到的实际用户ID

-- 1. 首先创建一个活跃链条
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
    auxiliary_duration,
    auxiliary_completion_trigger,
    is_durationless,
    time_limit_hours,
    time_limit_exceptions,
    group_started_at,
    group_expires_at,
    deleted_at,
    created_at,
    last_completed_at
) VALUES (
    gen_random_uuid(),
    '测试回收箱功能',
    'YOUR_USER_ID',  -- 🚨 请替换为你的实际用户ID
    'unit',
    extract(epoch from now()),
    '每天',
    30,
    '这是一个测试链条，用于验证回收箱功能',
    0,
    0,
    0,
    0,
    0,
    '[]'::jsonb,
    '[]'::jsonb,
    'none',
    null,
    null,
    false,
    null,
    '[]'::jsonb,
    null,
    null,
    now() - interval '5 minutes',  -- 5分钟前删除
    now() - interval '1 hour',     -- 1小时前创建
    null
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
    END as status
FROM chains 
WHERE user_id = 'YOUR_USER_ID'  -- 🚨 请替换为你的实际用户ID
ORDER BY created_at DESC;