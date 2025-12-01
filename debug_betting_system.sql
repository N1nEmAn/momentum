-- ========================================
-- Debug Script for Betting System
-- Date: 2025-09-06  
-- Purpose: Debug current betting system state
-- ========================================

-- Check current functions in database
SELECT 
  proname as function_name,
  pronargs as argument_count,
  proargnames as argument_names,
  oidvectortypes(proargtypes) as argument_types
FROM pg_proc 
WHERE proname = 'place_task_bet'
ORDER BY pronargs;

-- Check current user points for the user
SELECT 
  user_id,
  total_points,
  updated_at,
  created_at
FROM user_points 
WHERE user_id = '08313192-a8fe-4694-a4f8-fdf0a198abe9';

-- Check recent task bets for today
SELECT 
  id,
  user_id,
  session_id,
  bet_amount,
  bet_status,
  potential_payout,
  actual_payout,
  points_before,
  points_after,
  created_at,
  settled_at,
  metadata
FROM task_bets 
WHERE user_id = '08313192-a8fe-4694-a4f8-fdf0a198abe9'
  AND DATE(created_at) = CURRENT_DATE
ORDER BY created_at DESC;

-- Check recent point transactions for today
SELECT 
  id,
  user_id,
  transaction_type,
  points_change,
  points_before,
  points_after,
  description,
  reference_id,
  created_at
FROM point_transactions 
WHERE user_id = '08313192-a8fe-4694-a4f8-fdf0a198abe9'
  AND DATE(created_at) = CURRENT_DATE
ORDER BY created_at DESC;

-- Check recent audit logs for betting
SELECT 
  id,
  user_id,
  action,
  details,
  created_at
FROM audit_logs 
WHERE user_id = '08313192-a8fe-4694-a4f8-fdf0a198abe9'
  AND action LIKE '%bet%'
  AND DATE(created_at) = CURRENT_DATE
ORDER BY created_at DESC
LIMIT 10;

-- Check active sessions for the user
SELECT 
  id,
  user_id,
  chain_id,
  started_at,
  duration,
  is_paused
FROM active_sessions 
WHERE user_id = '08313192-a8fe-4694-a4f8-fdf0a198abe9'
ORDER BY started_at DESC
LIMIT 5;

-- Check user settings
SELECT 
  user_id,
  gambling_mode_enabled,
  daily_bet_limit,
  max_single_bet,
  settings_data,
  created_at,
  updated_at
FROM user_settings 
WHERE user_id = '08313192-a8fe-4694-a4f8-fdf0a198abe9';

-- Try calling the function to see if it works
SELECT place_task_bet(
  '08313192-a8fe-4694-a4f8-fdf0a198abe9'::uuid,
  'test-session-id'::uuid,
  1,
  NULL::uuid
) as test_result;

-- Summary report
SELECT 
  'Summary Report' as section,
  jsonb_build_object(
    'current_time', now(),
    'user_id', '08313192-a8fe-4694-a4f8-fdf0a198abe9',
    'functions_named_place_task_bet', (
      SELECT COUNT(*) FROM pg_proc WHERE proname = 'place_task_bet'
    ),
    'user_points', (
      SELECT total_points FROM user_points 
      WHERE user_id = '08313192-a8fe-4694-a4f8-fdf0a198abe9'
    ),
    'todays_bets_count', (
      SELECT COUNT(*) FROM task_bets 
      WHERE user_id = '08313192-a8fe-4694-a4f8-fdf0a198abe9'
        AND DATE(created_at) = CURRENT_DATE
    ),
    'todays_bet_amount', (
      SELECT COALESCE(SUM(bet_amount), 0) FROM task_bets 
      WHERE user_id = '08313192-a8fe-4694-a4f8-fdf0a198abe9'
        AND DATE(created_at) = CURRENT_DATE
        AND bet_status NOT IN ('cancelled', 'refunded')
    ),
    'gambling_enabled', (
      SELECT gambling_mode_enabled FROM user_settings 
      WHERE user_id = '08313192-a8fe-4694-a4f8-fdf0a198abe9'
    )
  ) as debug_info;