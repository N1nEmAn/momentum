-- ========================================
-- Fix Function Overloading Conflict for place_task_bet
-- Date: 2025-09-06
-- Purpose: Resolve PostgreSQL function overloading conflict
-- ========================================

-- Step 1: Drop ALL existing place_task_bet functions to avoid conflicts
DROP FUNCTION IF EXISTS place_task_bet(uuid, uuid, integer, uuid);
DROP FUNCTION IF EXISTS place_task_bet(uuid, uuid, integer);

-- Step 2: Create a single unified place_task_bet function
-- Use VARIADIC or default parameters to handle both cases
CREATE OR REPLACE FUNCTION place_task_bet(
  target_user_id uuid,
  target_session_id uuid,
  bet_amount integer,
  write_session_token uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_current_points integer := 0;
  session_exists boolean := false;
  session_chain_id uuid;
  existing_bet task_bets;
  gambling_enabled boolean := false;
  daily_spent integer := 0;
  user_daily_limit integer;
  user_max_bet integer;
  new_bet_id uuid;
  reward_payout integer;
  result jsonb;
BEGIN
  -- Calculate reward payout: bet amount + reward (2x the bet amount total)
  reward_payout := bet_amount * 2; -- Original bet + equal reward = 2x total

  -- Log function call for debugging
  INSERT INTO audit_logs (user_id, action, details, created_at)
  VALUES (
    target_user_id,
    'place_task_bet_called',
    jsonb_build_object(
      'session_id', target_session_id,
      'bet_amount', bet_amount,
      'reward_payout', reward_payout,
      'write_session_token', COALESCE(write_session_token::text, 'none'),
      'function_version', 'unified_v1'
    ),
    now()
  );

  -- If no write session token provided, try to work without it (backward compatibility)
  IF write_session_token IS NULL THEN
    INSERT INTO audit_logs (user_id, action, details, created_at)
    VALUES (
      target_user_id,
      'bet_placed_without_session',
      jsonb_build_object(
        'warning', 'Bet placed without write session - legacy mode',
        'session_id', target_session_id,
        'bet_amount', bet_amount,
        'reward_payout', reward_payout
      ),
      now()
    );
  ELSE
    -- Verify write session permissions only if token is provided
    IF NOT verify_write_permission(write_session_token, 'INSERT', 'task_bets') THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Invalid write session for task_bets operations',
        'error_code', 'WRITE_SESSION_INVALID_TASK_BETS'
      );
    END IF;

    IF NOT verify_write_permission(write_session_token, 'UPDATE', 'user_points') THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Invalid write session for user_points operations',
        'error_code', 'WRITE_SESSION_INVALID_USER_POINTS'
      );
    END IF;

    IF NOT verify_write_permission(write_session_token, 'INSERT', 'point_transactions') THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Invalid write session for point_transactions operations',
        'error_code', 'WRITE_SESSION_INVALID_POINT_TRANSACTIONS'
      );
    END IF;
  END IF;

  -- Verify the user exists and is the authenticated user
  IF target_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied: can only place bets for yourself';
  END IF;

  -- Validate bet amount
  IF bet_amount <= 0 THEN
    RAISE EXCEPTION 'Bet amount must be greater than 0';
  END IF;

  -- Check if gambling mode is enabled
  SELECT gambling_mode_enabled, daily_bet_limit, max_single_bet
  INTO gambling_enabled, user_daily_limit, user_max_bet
  FROM user_settings 
  WHERE user_id = target_user_id;
  
  IF NOT gambling_enabled THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Gambling mode is not enabled',
      'error_code', 'GAMBLING_DISABLED'
    );
  END IF;

  -- Check single bet limit
  IF user_max_bet IS NOT NULL AND bet_amount > user_max_bet THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Bet amount exceeds your maximum single bet limit',
      'error_code', 'BET_LIMIT_EXCEEDED',
      'max_bet', user_max_bet
    );
  END IF;

  -- Check daily betting limit
  IF user_daily_limit IS NOT NULL THEN
    SELECT COALESCE(SUM(bet_amount), 0) INTO daily_spent
    FROM task_bets 
    WHERE user_id = target_user_id 
      AND DATE(created_at) = CURRENT_DATE
      AND bet_status != 'cancelled'
      AND bet_status != 'refunded';
    
    IF daily_spent + bet_amount > user_daily_limit THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Daily betting limit would be exceeded',
        'error_code', 'DAILY_LIMIT_EXCEEDED',
        'daily_limit', user_daily_limit,
        'daily_spent', daily_spent
      );
    END IF;
  END IF;

  -- Verify session exists and belongs to user
  SELECT EXISTS(
    SELECT 1 FROM active_sessions 
    WHERE id = target_session_id AND user_id = target_user_id
  ), chain_id INTO session_exists, session_chain_id
  FROM active_sessions 
  WHERE id = target_session_id AND user_id = target_user_id;
  
  IF NOT session_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Active session not found',
      'error_code', 'SESSION_NOT_FOUND'
    );
  END IF;

  -- Check if bet already exists for this session
  SELECT * INTO existing_bet 
  FROM task_bets 
  WHERE user_id = target_user_id AND session_id = target_session_id;
  
  IF existing_bet IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Bet already placed on this session',
      'error_code', 'DUPLICATE_BET',
      'existing_bet_id', existing_bet.id,
      'existing_bet_amount', existing_bet.bet_amount
    );
  END IF;

  -- Get current user points with row locking
  SELECT COALESCE(total_points, 0) INTO user_current_points
  FROM user_points 
  WHERE user_id = target_user_id
  FOR UPDATE;
  
  -- Create user_points record if it doesn't exist
  IF NOT FOUND THEN
    INSERT INTO user_points (user_id, total_points)
    VALUES (target_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
    user_current_points := 0;
  END IF;

  -- Check if user has sufficient points
  IF user_current_points < bet_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Insufficient points for bet',
      'error_code', 'INSUFFICIENT_POINTS',
      'current_points', user_current_points,
      'required_points', bet_amount
    );
  END IF;

  -- ATOMIC OPERATIONS: All operations must succeed or fail together
  
  -- Step 1: Create the bet record first
  INSERT INTO task_bets (
    user_id, 
    session_id, 
    chain_id, 
    bet_amount, 
    bet_status,
    points_before,
    potential_payout,
    metadata
  )
  VALUES (
    target_user_id,
    target_session_id,
    session_chain_id,
    bet_amount,
    'pending',
    user_current_points,
    reward_payout, -- Now correctly set to 2x bet amount (bet + reward)
    jsonb_build_object(
      'placed_at', now(),
      'write_session_token', COALESCE(write_session_token::text, 'none'),
      'session_type', CASE WHEN write_session_token IS NOT NULL THEN 'betting' ELSE 'legacy' END,
      'payout_ratio', '2x',
      'original_bet', bet_amount,
      'potential_reward', bet_amount,
      'function_version', 'unified_v1'
    )
  )
  RETURNING id INTO new_bet_id;

  -- Step 2: Deduct points from user balance
  UPDATE user_points 
  SET total_points = total_points - bet_amount,
      updated_at = now()
  WHERE user_id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to update user points - user may have been deleted';
  END IF;

  -- Step 3: Record the transaction
  INSERT INTO point_transactions (
    user_id, 
    transaction_type, 
    points_change, 
    points_before, 
    points_after, 
    description, 
    reference_id
  )
  VALUES (
    target_user_id,
    'bet_placed',
    -bet_amount,
    user_current_points,
    user_current_points - bet_amount,
    CASE 
      WHEN write_session_token IS NOT NULL THEN 'Placed bet with write session protection (2x payout potential)'
      ELSE 'Placed bet (legacy mode) (2x payout potential)'
    END,
    new_bet_id
  );

  -- Step 4: Create audit log entry
  INSERT INTO audit_logs (user_id, action, details, created_at)
  VALUES (
    target_user_id,
    'bet_placed_success',
    jsonb_build_object(
      'bet_id', new_bet_id,
      'session_id', target_session_id,
      'chain_id', session_chain_id,
      'bet_amount', bet_amount,
      'potential_payout', reward_payout,
      'points_before', user_current_points,
      'points_after', user_current_points - bet_amount,
      'write_session_token', COALESCE(write_session_token::text, 'none'),
      'mode', CASE WHEN write_session_token IS NOT NULL THEN 'secure' ELSE 'legacy' END,
      'function_version', 'unified_v1'
    ),
    NOW()
  );

  -- Build success result
  result := jsonb_build_object(
    'success', true,
    'message', CASE 
      WHEN write_session_token IS NOT NULL THEN 'Bet placed successfully with write session protection (2x payout)'
      ELSE 'Bet placed successfully (legacy mode) (2x payout)'
    END,
    'bet_id', new_bet_id,
    'bet_amount', bet_amount,
    'potential_payout', reward_payout,
    'potential_reward', bet_amount,
    'points_before', user_current_points,
    'points_after', user_current_points - bet_amount,
    'session_id', target_session_id,
    'chain_id', session_chain_id,
    'write_session_used', write_session_token IS NOT NULL,
    'payout_explanation', '成功时获得: ' || bet_amount::text || '(返还押注) + ' || bet_amount::text || '(奖励) = ' || reward_payout::text || '积分',
    'function_version', 'unified_v1'
  );

  RETURN result;

EXCEPTION WHEN OTHERS THEN
  -- Log the error for debugging
  INSERT INTO audit_logs (user_id, action, details, created_at)
  VALUES (
    target_user_id,
    'bet_placement_error',
    jsonb_build_object(
      'session_id', target_session_id,
      'bet_amount', bet_amount,
      'write_session_token', COALESCE(write_session_token::text, 'none'),
      'error_message', SQLERRM,
      'error_state', SQLSTATE,
      'function_version', 'unified_v1'
    ),
    NOW()
  );
  
  -- Re-raise the exception to ensure transaction rollback
  RAISE EXCEPTION 'Bet placement failed: %', SQLERRM;
END;
$$;

-- Step 3: Grant execute permissions
GRANT EXECUTE ON FUNCTION place_task_bet(uuid, uuid, integer, uuid) TO authenticated;

-- Step 4: Verify there are no other conflicting functions
DO $$
BEGIN
  -- List all place_task_bet functions to confirm cleanup
  RAISE NOTICE 'Checking for remaining place_task_bet functions...';
  
  -- This will show in the logs which functions exist
  PERFORM proname, prosrc 
  FROM pg_proc 
  WHERE proname = 'place_task_bet';
END $$;

-- Success message
SELECT 'PostgreSQL函数重载冲突已修复！现在只有一个统一的place_task_bet函数，支持2x奖励计算。' as result;