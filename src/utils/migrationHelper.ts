import { supabase } from '../lib/supabase';
import { logger } from './logger';
import { schemaChecker } from './schemaChecker';

interface MigrationResult {
  success: boolean;
  error?: string;
  appliedMigrations: string[];
  skippedMigrations: string[];
}

export class MigrationHelper {
  /**
   * Check if a specific migration has been applied by checking for expected columns/tables
   */
  async isMigrationApplied(migrationId: string): Promise<boolean> {
    try {
      switch (migrationId) {
        case '20250730021823_winter_flame':
          // Check if basic tables exist
          const { data: chainsTable } = await supabase
            .from('information_schema.tables')
            .select('table_name')
            .eq('table_name', 'chains')
            .eq('table_schema', 'public');
          return (chainsTable?.length || 0) > 0;

        case '20250801160754_peaceful_palace':
        case '20250801161456_fading_sunset':
          // Check if parent_id and type columns exist
          const { data: hierarchyColumns } = await supabase
            .from('information_schema.columns')
            .select('column_name')
            .eq('table_name', 'chains')
            .in('column_name', ['parent_id', 'type']);
          return (hierarchyColumns?.length || 0) >= 2;

        case '20250808000000_add_group_time_limit':
          // Check if time limit columns exist
          const { data: timeLimitColumns } = await supabase
            .from('information_schema.columns')
            .select('column_name')
            .eq('table_name', 'chains')
            .in('column_name', ['time_limit_hours', 'group_started_at', 'group_expires_at']);
          return (timeLimitColumns?.length || 0) >= 3;

        case '20250808001000_add_durationless_flag':
          // Check if is_durationless column exists
          const { data: durationlessColumn } = await supabase
            .from('information_schema.columns')
            .select('column_name')
            .eq('table_name', 'chains')
            .eq('column_name', 'is_durationless');
          return (durationlessColumn?.length || 0) > 0;

        case '20250810000000_add_rsip_tables':
          // Check if RSIP tables exist
          const { data: rsipTables } = await supabase
            .from('information_schema.tables')
            .select('table_name')
            .eq('table_schema', 'public')
            .in('table_name', ['rsip_nodes', 'rsip_meta']);
          return (rsipTables?.length || 0) >= 2;

        default:
          return false;
      }
    } catch (error) {
      logger.error('MIGRATION', `检查迁移 ${migrationId} 状态失败`, { error });
      return false;
    }
  }

  /**
   * Get the status of all migrations
   */
  async getMigrationStatus(): Promise<Record<string, boolean>> {
    const migrations = [
      '20250730021823_winter_flame',
      '20250801160754_peaceful_palace',
      '20250801161456_fading_sunset',
      '20250808000000_add_group_time_limit',
      '20250808001000_add_durationless_flag',
      '20250810000000_add_rsip_tables'
    ];

    const status: Record<string, boolean> = {};

    for (const migration of migrations) {
      status[migration] = await this.isMigrationApplied(migration);
    }

    return status;
  }

  /**
   * Generate SQL commands to apply missing migrations
   */
  async generateMigrationSQL(): Promise<string> {
    const status = await this.getMigrationStatus();
    const schemaStatus = await schemaChecker.getSchemaStatus();

    let sql = '-- 自动生成的迁移SQL\n';
    sql += `-- 生成时间: ${new Date().toISOString()}\n\n`;

    if (!status['20250730021823_winter_flame']) {
      sql += '-- 基础表结构迁移\n';
      sql += '-- 来源: 20250730021823_winter_flame.sql\n\n';
      sql += this.getBasicTableSQL() + '\n\n';
    }

    if (!status['20250801160754_peaceful_palace']) {
      sql += '-- 任务群功能支持迁移\n';
      sql += '-- 来源: 20250801160754_peaceful_palace.sql\n\n';
      sql += this.getHierarchySQL() + '\n\n';
    }

    if (!status['20250808000000_add_group_time_limit']) {
      sql += '-- 任务群时间限制功能迁移\n';
      sql += '-- 来源: 20250808000000_add_group_time_limit.sql\n\n';
      sql += this.getTimeLimitSQL() + '\n\n';
    }

    if (!status['20250808001000_add_durationless_flag']) {
      sql += '-- 无时长任务功能迁移\n';
      sql += '-- 来源: 20250808001000_add_durationless_flag.sql\n\n';
      sql += this.getDurationlessSQL() + '\n\n';
    }

    if (!status['20250810000000_add_rsip_tables']) {
      sql += '-- RSIP功能表迁移\n';
      sql += '-- 来源: 20250810000000_add_rsip_tables.sql\n\n';
      sql += this.getRSIPSQL() + '\n\n';
    }

    return sql;
  }

  private getBasicTableSQL(): string {
    return `
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

-- Create other tables...
-- (继续添加其他表的创建语句)
`;
  }

  private getHierarchySQL(): string {
    return `
-- Add hierarchy support to chains table
DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chains' AND column_name = 'parent_id'
  ) THEN
    ALTER TABLE chains ADD COLUMN parent_id uuid REFERENCES chains(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chains' AND column_name = 'type'
  ) THEN
    ALTER TABLE chains ADD COLUMN "type" text NOT NULL DEFAULT 'unit';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chains' AND column_name = 'sort_order'
  ) THEN
    ALTER TABLE chains ADD COLUMN sort_order integer NOT NULL DEFAULT 0;
  END IF;
END $;
`;
  }

  private getTimeLimitSQL(): string {
    return `
-- Add time limit support to chains table
DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chains' AND column_name = 'time_limit_hours'
  ) THEN
    ALTER TABLE chains ADD COLUMN time_limit_hours integer DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chains' AND column_name = 'time_limit_exceptions'
  ) THEN
    ALTER TABLE chains ADD COLUMN time_limit_exceptions jsonb DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chains' AND column_name = 'group_started_at'
  ) THEN
    ALTER TABLE chains ADD COLUMN group_started_at timestamp with time zone DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chains' AND column_name = 'group_expires_at'
  ) THEN
    ALTER TABLE chains ADD COLUMN group_expires_at timestamp with time zone DEFAULT NULL;
  END IF;
END $;
`;
  }

  private getDurationlessSQL(): string {
    return `
-- Add durationless flag to chains table
DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chains' AND column_name = 'is_durationless'
  ) THEN
    ALTER TABLE chains ADD COLUMN is_durationless boolean NOT NULL DEFAULT false;
  END IF;
END $;
`;
  }

  private getRSIPSQL(): string {
    return `
-- Create RSIP tables
CREATE TABLE IF NOT EXISTS public.rsip_nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.rsip_nodes(id) on delete cascade,
  title text not null,
  rule text not null,
  sort_order integer not null default 0,
  use_timer boolean not null default false,
  timer_minutes integer,
  created_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS public.rsip_meta (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_added_at timestamptz,
  allow_multiple_per_day boolean not null default false
);

-- Enable RLS
ALTER TABLE IF EXISTS public.rsip_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rsip_meta ENABLE ROW LEVEL SECURITY;
`;
  }

  /**
   * Generate a comprehensive migration report
   */
  async generateMigrationReport(): Promise<string> {
    const migrationStatus = await this.getMigrationStatus();
    const schemaStatus = await schemaChecker.getSchemaStatus();

    let report = '# 数据库迁移状态报告\n\n';
    report += `生成时间: ${new Date().toISOString()}\n`;
    report += `总体状态: ${schemaStatus.migrationStatus}\n\n`;

    report += '## 迁移文件状态\n\n';
    Object.entries(migrationStatus).forEach(([migration, applied]) => {
      const status = applied ? '✅ 已应用' : '❌ 未应用';
      report += `- ${migration}: ${status}\n`;
    });

    report += '\n## 建议的操作\n\n';
    if (schemaStatus.recommendations.length > 0) {
      schemaStatus.recommendations.forEach((rec, index) => {
        report += `${index + 1}. ${rec}\n`;
      });
    } else {
      report += '所有迁移已正确应用，无需额外操作。\n';
    }

    const unappliedMigrations = Object.entries(migrationStatus)
      .filter(([_, applied]) => !applied)
      .map(([migration, _]) => migration);

    if (unappliedMigrations.length > 0) {
      report += '\n## 如何应用缺失的迁移\n\n';
      report += '1. 在 Supabase Dashboard 中打开 SQL Editor\n';
      report += '2. 运行以下 SQL 命令来应用缺失的迁移:\n\n';
      report += '```sql\n';
      report += await this.generateMigrationSQL();
      report += '```\n\n';
      report += '3. 刷新应用程序以验证迁移是否成功\n';
    }

    return report;
  }
}

export const migrationHelper = new MigrationHelper();