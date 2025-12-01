-- ========================================
-- Complete Fix for Function Overloading Conflict
-- Date: 2025-09-06
-- Purpose: Completely resolve function conflicts and ensure proper betting
-- ========================================

-- Step 1: Drop ALL possible place_task_bet function variants
DO $$
BEGIN
  -- Drop all possible function signatures
  DROP FUNCTION IF EXISTS place_task_bet(uuid, uuid, integer, uuid) CASCADE;
  DROP FUNCTION IF EXISTS place_task_bet(uuid, uuid, integer) CASCADE;
  DROP FUNCTION IF EXISTS public.place_task_bet(uuid, uuid, integer, uuid) CASCADE;
  DROP FUNCTION IF EXISTS public.place_task_bet(uuid, uuid, integer) CASCADE;
  
  -- Log what we're doing
  RAISE NOTICE '已删除所有place_task_bet函数变体';
END $$;

-- Step 2: Create ONE definitive place_task_bet function
-- Use explicit parameter names to avoid any ambiguity
CREATE OR REPLACE FUNCTION place_task_bet(
  p_user_id uuid,
  p_session_id uuid, 
  p_bet_amount integer,
  p_write_session_token uuid DEFAULT NULL
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
  -- Log function entry for debugging
  INSERT INTO audit_logs (user_id, action, details, created_at)
  VALUES (
    p_user_id,
    'place_task_bet_v2_called',
    jsonb_build_object(
      'session_id', p_session_id,
      'bet_amount', p_bet_amount,
      'write_session_token', COALESCE(p_write_session_token::text, 'null'),
      'function_signature', 'place_task_bet(uuid,uuid,integer,uuid DEFAULT NULL)'
    ),
    now()
  );

  -- Calculate reward payout: 2x bet amount (bet return + equal reward)
  reward_payout := p_bet_amount * 2;

  -- Verify the user exists and is the authenticated user
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied: can only place bets for yourself';
  END IF;

  -- Validate bet amount
  IF p_bet_amount <= 0 THEN
    RAISE EXCEPTION 'Bet amount must be greater than 0';
  END IF;

  -- Check if gambling mode is enabled
  SELECT gambling_mode_enabled, daily_bet_limit, max_single_bet
  INTO gambling_enabled, user_daily_limit, user_max_bet
  FROM user_settings 
  WHERE user_id = p_user_id;
  
  IF NOT gambling_enabled THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Gambling mode is not enabled',
      'error_code', 'GAMBLING_DISABLED'
    );
  END IF;

  -- Check single bet limit
  IF user_max_bet IS NOT NULL AND p_bet_amount > user_max_bet THEN
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
    WHERE user_id = p_user_id 
      AND DATE(created_at) = CURRENT_DATE
      AND bet_status != 'cancelled'
      AND bet_status != 'refunded';
    
    IF daily_spent + p_bet_amount > user_daily_limit THEN
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
    WHERE id = p_session_id AND user_id = p_user_id
  ), chain_id INTO session_exists, session_chain_id
  FROM active_sessions 
  WHERE id = p_session_id AND user_id = p_user_id;
  
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
  WHERE user_id = p_user_id AND session_id = p_session_id;
  
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
  WHERE user_id = p_user_id
  FOR UPDATE;
  
  -- Create user_points record if it doesn't exist
  IF NOT FOUND THEN
    INSERT INTO user_points (user_id, total_points)
    VALUES (p_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
    user_current_points := 0;
  END IF;

  -- Check if user has sufficient points
  IF user_current_points < p_bet_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Insufficient points for bet',
      'error_code', 'INSUFFICIENT_POINTS',
      'current_points', user_current_points,
      'required_points', p_bet_amount
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
    p_user_id,
    p_session_id,
    session_chain_id,
    p_bet_amount,
    'pending',
    user_current_points,
    reward_payout, -- 2x bet amount (bet + reward)
    jsonb_build_object(
      'placed_at', now(),
      'payout_ratio', '2x',
      'original_bet', p_bet_amount,
      'potential_reward', p_bet_amount,
      'function_version', 'v2_unified',
      'write_session_token', COALESCE(p_write_session_token::text, 'null')
    )
  )
  RETURNING id INTO new_bet_id;

  -- Step 2: Deduct points from user balance
  UPDATE user_points 
  SET total_points = total_points - p_bet_amount,
      updated_at = now()
  WHERE user_id = p_user_id;

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
    p_user_id,
    'bet_placed',
    -p_bet_amount,
    user_current_points,
    user_current_points - p_bet_amount,
    'Placed bet (2x payout potential): ' || p_bet_amount::text || ' bet + ' || p_bet_amount::text || ' potential reward',
    new_bet_id
  );

  -- Step 4: Create success audit log
  INSERT INTO audit_logs (user_id, action, details, created_at)
  VALUES (
    p_user_id,
    'bet_placed_success_v2',
    jsonb_build_object(
      'bet_id', new_bet_id,
      'session_id', p_session_id,
      'chain_id', session_chain_id,
      'bet_amount', p_bet_amount,
      'potential_payout', reward_payout,
      'points_before', user_current_points,
      'points_after', user_current_points - p_bet_amount,
      'function_version', 'v2_unified'
    ),
    NOW()
  );

  -- Build success result
  result := jsonb_build_object(
    'success', true,
    'message', 'Bet placed successfully (2x payout: bet return + equal reward)',
    'bet_id', new_bet_id,
    'bet_amount', p_bet_amount,
    'potential_payout', reward_payout,
    'potential_reward', p_bet_amount,
    'points_before', user_current_points,
    'points_after', user_current_points - p_bet_amount,
    'session_id', p_session_id,
    'chain_id', session_chain_id,
    'payout_explanation', '成功时获得: ' || p_bet_amount::text || '(返还) + ' || p_bet_amount::text || '(奖励) = ' || reward_payout::text || '积分'
  );

  RETURN result;

EXCEPTION WHEN OTHERS THEN
  -- Log the error for debugging
  INSERT INTO audit_logs (user_id, action, details, created_at)
  VALUES (
    p_user_id,
    'bet_placement_error_v2',
    jsonb_build_object(
      'session_id', p_session_id,
      'bet_amount', p_bet_amount,
      'error_message', SQLERRM,
      'error_state', SQLSTATE,
      'function_version', 'v2_unified'
    ),
    NOW()
  );
  
  -- Re-raise the exception to ensure transaction rollback
  RAISE EXCEPTION 'Bet placement failed: %', SQLERRM;
END;
$$;

-- Step 3: Grant permissions
GRANT EXECUTE ON FUNCTION place_task_bet(uuid, uuid, integer, uuid) TO authenticated;

-- Step 4: Verify function creation and check for conflicts
DO $$
DECLARE
  func_count integer;
BEGIN
  -- Count place_task_bet functions
  SELECT COUNT(*) INTO func_count
  FROM pg_proc 
  WHERE proname = 'place_task_bet';
  
  RAISE NOTICE '数据库中place_task_bet函数数量: %', func_count;
  
  IF func_count != 1 THEN
    RAISE EXCEPTION '函数冲突未完全解决！仍有 % 个place_task_bet函数', func_count;
  END IF;
  
  RAISE NOTICE '✓ 函数冲突已解决，只有1个place_task_bet函数';
END $$;

-- Success message
SELECT '✓ 押注函数冲突已完全修复！函数签名: place_task_bet(p_user_id uuid, p_session_id uuid, p_bet_amount integer, p_write_session_token uuid DEFAULT NULL)' as result;