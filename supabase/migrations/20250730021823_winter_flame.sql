/*
  # Momentum CTDP Application Database Schema

  1. New Tables
    - `chains`
      - `id` (uuid, primary key)
      - `name` (text, chain name)
      - `trigger` (text, sacred seat trigger action)
      - `duration` (integer, task duration in minutes)
      - `description` (text, task description)
      - `current_streak` (integer, current main chain streak)
      - `auxiliary_streak` (integer, current auxiliary chain streak)
      - `total_completions` (integer, total successful completions)
      - `total_failures` (integer, total failures)
      - `auxiliary_failures` (integer, auxiliary chain failures)
      - `exceptions` (jsonb, array of exception rules)
      - `auxiliary_exceptions` (jsonb, array of auxiliary exception rules)
      - `auxiliary_signal` (text, booking signal)
      - `auxiliary_duration` (integer, booking duration in minutes)
      - `auxiliary_completion_trigger` (text, auxiliary completion condition)
      - `created_at` (timestamptz, creation time)
      - `last_completed_at` (timestamptz, last completion time)
      - `user_id` (uuid, foreign key to auth.users)

    - `scheduled_sessions`
      - `id` (uuid, primary key)
      - `chain_id` (uuid, foreign key to chains)
      - `scheduled_at` (timestamptz, when session was scheduled)
      - `expires_at` (timestamptz, when session expires)
      - `auxiliary_signal` (text, the signal used for booking)
      - `user_id` (uuid, foreign key to auth.users)

    - `active_sessions`
      - `id` (uuid, primary key)
      - `chain_id` (uuid, foreign key to chains)
      - `started_at` (timestamptz, session start time)
      - `duration` (integer, session duration in minutes)
      - `is_paused` (boolean, whether session is paused)
      - `paused_at` (timestamptz, when session was paused)
      - `total_paused_time` (integer, total paused time in milliseconds)
      - `user_id` (uuid, foreign key to auth.users)

    - `completion_history`
      - `id` (uuid, primary key)
      - `chain_id` (uuid, foreign key to chains)
      - `completed_at` (timestamptz, completion time)
      - `duration` (integer, session duration in minutes)
      - `was_successful` (boolean, whether session was successful)
      - `reason_for_failure` (text, failure reason if applicable)
      - `user_id` (uuid, foreign key to auth.users)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their own data
    - Ensure data isolation between users

  3. Indexes
    - Add indexes for frequently queried columns
    - Optimize for user-specific queries
*/

-- Create chains table
CREATE TABLE IF NOT EXISTS chains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trigger text NOT NULL,
  duration integer NOT NULL DEFAULT 45,
  description text NOT NULL,
  current_streak integer NOT NULL DEFAULT 0,
  auxiliary_streak integer NOT NULL DEFAULT 0,
  total_completions integer NOT NULL DEFAULT 0,
  total_failures integer NOT NULL DEFAULT 0,
  auxiliary_failures integer NOT NULL DEFAULT 0,
  exceptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  auxiliary_exceptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  auxiliary_signal text NOT NULL,
  auxiliary_duration integer NOT NULL DEFAULT 15,
  auxiliary_completion_trigger text NOT NULL,
  created_at timestamptz DEFAULT now(),
  last_completed_at timestamptz,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL
);

-- Create scheduled_sessions table
CREATE TABLE IF NOT EXISTS scheduled_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id uuid REFERENCES chains(id) ON DELETE CASCADE NOT NULL,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  auxiliary_signal text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL
);

-- Create active_sessions table
CREATE TABLE IF NOT EXISTS active_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id uuid REFERENCES chains(id) ON DELETE CASCADE NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  duration integer NOT NULL,
  is_paused boolean NOT NULL DEFAULT false,
  paused_at timestamptz,
  total_paused_time integer NOT NULL DEFAULT 0,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL
);

-- Create completion_history table
CREATE TABLE IF NOT EXISTS completion_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id uuid REFERENCES chains(id) ON DELETE CASCADE NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  duration integer NOT NULL,
  was_successful boolean NOT NULL,
  reason_for_failure text,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL
);

-- Enable Row Level Security
ALTER TABLE chains ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE completion_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for chains
CREATE POLICY "Users can manage their own chains"
  ON chains
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create RLS policies for scheduled_sessions
CREATE POLICY "Users can manage their own scheduled sessions"
  ON scheduled_sessions
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create RLS policies for active_sessions
CREATE POLICY "Users can manage their own active sessions"
  ON active_sessions
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create RLS policies for completion_history
CREATE POLICY "Users can manage their own completion history"
  ON completion_history
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_chains_user_id ON chains(user_id);
CREATE INDEX IF NOT EXISTS idx_chains_created_at ON chains(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scheduled_sessions_user_id ON scheduled_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_sessions_expires_at ON scheduled_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_active_sessions_user_id ON active_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_completion_history_user_id ON completion_history(user_id);
CREATE INDEX IF NOT EXISTS idx_completion_history_chain_id ON completion_history(chain_id);
CREATE INDEX IF NOT EXISTS idx_completion_history_completed_at ON completion_history(completed_at DESC);