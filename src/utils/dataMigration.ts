/**
 * 数据迁移工具
 * 用于处理任务计时功能的数据迁移和兼容性
 */

import { storage } from './storage';
import { CompletionHistory, Chain, TaskTimeStats } from '../types';

export interface MigrationResult {
  success: boolean;
  migratedRecords: number;
  errors: string[];
  details: {
    completionHistoryMigrated: number;
    taskTimeStatsCreated: number;
    chainsUpdated: number;
  };
}

export class DataMigrationManager {
  /**
   * 执行完整的数据迁移
   */
  async migrateAll(): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: true,
      migratedRecords: 0,
      errors: [],
      details: {
        completionHistoryMigrated: 0,
        taskTimeStatsCreated: 0,
        chainsUpdated: 0,
      }
    };

    try {
      // 1. 迁移完成历史记录
      const historyResult = await this.migrateCompletionHistory();
      result.details.completionHistoryMigrated = historyResult.migratedCount;
      result.migratedRecords += historyResult.migratedCount;
      result.errors.push(...historyResult.errors);

      // 2. 创建任务用时统计
      const statsResult = await this.createTaskTimeStats();
      result.details.taskTimeStatsCreated = statsResult.createdCount;
      result.errors.push(...statsResult.errors);

      // 3. 更新链条数据结构（如果需要）
      const chainsResult = await this.updateChainStructure();
      result.details.chainsUpdated = chainsResult.updatedCount;
      result.errors.push(...chainsResult.errors);

      // 4. 清理无效数据
      await this.cleanupInvalidData();

      result.success = result.errors.length === 0;
    } catch (error) {
      result.success = false;
      result.errors.push(`迁移过程中发生错误: ${error instanceof Error ? error.message : String(error)}`);
    }

    return result;
  }

  /**
   * 迁移完成历史记录，添加用时相关字段
   */
  private async migrateCompletionHistory(): Promise<{ migratedCount: number; errors: string[] }> {
    const errors: string[] = [];
    let migratedCount = 0;

    try {
      const history = storage.getCompletionHistory();
      const chains = storage.getChains();
      let hasChanges = false;

      const updatedHistory = history.map((record, index) => {
        try {
          // 检查是否需要迁移
          if (record.actualDuration !== undefined && record.isForwardTimed !== undefined) {
            return record; // 已经迁移过
          }

          const chain = chains.find(c => c.id === record.chainId);
          
          // 为记录添加用时相关字段
          const migratedRecord: CompletionHistory = {
            ...record,
            actualDuration: record.duration, // 使用原计划时长作为实际用时
            isForwardTimed: chain?.isDurationless || false // 根据链条设置判断
          };

          hasChanges = true;
          migratedCount++;
          return migratedRecord;
        } catch (error) {
          errors.push(`迁移历史记录 ${index} 时出错: ${error instanceof Error ? error.message : String(error)}`);
          return record; // 返回原记录
        }
      });

      if (hasChanges) {
        storage.saveCompletionHistory(updatedHistory);
      }
    } catch (error) {
      errors.push(`迁移完成历史记录时出错: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { migratedCount, errors };
  }

  /**
   * 基于现有历史记录创建任务用时统计
   */
  private async createTaskTimeStats(): Promise<{ createdCount: number; errors: string[] }> {
    const errors: string[] = [];
    let createdCount = 0;

    try {
      const history = storage.getCompletionHistory();
      const existingStats = storage.getTaskTimeStats();
      const statsMap = new Map<string, TaskTimeStats>();

      // 将现有统计数据加载到Map中
      existingStats.forEach(stat => {
        statsMap.set(stat.chainId, stat);
      });

      // 处理历史记录
      history.forEach((record, index) => {
        try {
          if (!record.wasSuccessful || !record.actualDuration) {
            return; // 只处理成功完成且有用时数据的记录
          }

          const chainId = record.chainId;
          const duration = record.actualDuration;

          if (statsMap.has(chainId)) {
            // 更新现有统计（但不重复计算已处理的记录）
            return;
          }

          // 计算该链条的所有成功记录
          const chainRecords = history.filter(h => 
            h.chainId === chainId && 
            h.wasSuccessful && 
            h.actualDuration !== undefined
          );

          if (chainRecords.length === 0) return;

          const totalTime = chainRecords.reduce((sum, r) => sum + (r.actualDuration || 0), 0);
          const totalCompletions = chainRecords.length;
          const lastRecord = chainRecords.sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())[0];

          const stats: TaskTimeStats = {
            chainId,
            lastCompletionTime: lastRecord.actualDuration || 0,
            averageCompletionTime: Math.round(totalTime / totalCompletions),
            totalCompletions,
            totalTime
          };

          statsMap.set(chainId, stats);
          createdCount++;
        } catch (error) {
          errors.push(`处理历史记录 ${index} 时出错: ${error instanceof Error ? error.message : String(error)}`);
        }
      });

      // 保存更新后的统计数据
      if (createdCount > 0) {
        storage.saveTaskTimeStats(Array.from(statsMap.values()));
      }
    } catch (error) {
      errors.push(`创建任务用时统计时出错: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { createdCount, errors };
  }

  /**
   * 更新链条数据结构（如果需要）
   */
  private async updateChainStructure(): Promise<{ updatedCount: number; errors: string[] }> {
    const errors: string[] = [];
    let updatedCount = 0;

    try {
      const chains = storage.getChains();
      let hasChanges = false;

      const updatedChains = chains.map((chain, index) => {
        try {
          // 检查是否需要添加新字段或修复数据
          let needsUpdate = false;
          const updatedChain = { ...chain };

          // 确保所有必需字段存在
          if (updatedChain.auxiliaryStreak === undefined) {
            updatedChain.auxiliaryStreak = 0;
            needsUpdate = true;
          }

          if (updatedChain.auxiliaryFailures === undefined) {
            updatedChain.auxiliaryFailures = 0;
            needsUpdate = true;
          }

          if (updatedChain.auxiliaryExceptions === undefined) {
            updatedChain.auxiliaryExceptions = [];
            needsUpdate = true;
          }

          // 修复无效的父子关系
          if (updatedChain.parentId === updatedChain.id) {
            updatedChain.parentId = undefined;
            needsUpdate = true;
          }

          if (needsUpdate) {
            hasChanges = true;
            updatedCount++;
          }

          return updatedChain;
        } catch (error) {
          errors.push(`更新链条 ${index} 时出错: ${error instanceof Error ? error.message : String(error)}`);
          return chain; // 返回原链条
        }
      });

      if (hasChanges) {
        storage.saveChains(updatedChains);
      }
    } catch (error) {
      errors.push(`更新链条结构时出错: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { updatedCount, errors };
  }

  /**
   * 清理无效数据
   */
  private async cleanupInvalidData(): Promise<void> {
    try {
      // 清理过期的计时器持久化数据
      const keys = Object.keys(localStorage);
      const timerKeys = keys.filter(key => key.startsWith('momentum_timer_'));
      const now = Date.now();

      timerKeys.forEach(key => {
        try {
          const dataStr = localStorage.getItem(key);
          if (dataStr) {
            const data = JSON.parse(dataStr);
            // 清理超过24小时的数据
            if (now - data.timestamp > 24 * 60 * 60 * 1000) {
              localStorage.removeItem(key);
            }
          }
        } catch {
          // 如果解析失败，直接删除
          localStorage.removeItem(key);
        }
      });

      // 清理孤立的任务用时统计（对应的链条已被删除）
      const chains = storage.getChains();
      const stats = storage.getTaskTimeStats();
      const validChainIds = new Set(chains.map(c => c.id));
      
      const validStats = stats.filter(stat => validChainIds.has(stat.chainId));
      
      if (validStats.length !== stats.length) {
        storage.saveTaskTimeStats(validStats);
      }
    } catch (error) {
      console.warn('清理无效数据时出错:', error);
    }
  }

  /**
   * 验证数据完整性
   */
  async validateDataIntegrity(): Promise<{ isValid: boolean; issues: string[] }> {
    const issues: string[] = [];

    try {
      // 验证链条数据
      const chains = storage.getChains();
      chains.forEach((chain, index) => {
        if (!chain.id) {
          issues.push(`链条 ${index} 缺少ID`);
        }
        if (!chain.name) {
          issues.push(`链条 ${chain.id} 缺少名称`);
        }
        if (chain.parentId === chain.id) {
          issues.push(`链条 ${chain.id} 存在循环引用`);
        }
      });

      // 验证历史记录
      const history = storage.getCompletionHistory();
      history.forEach((record, index) => {
        if (!record.chainId) {
          issues.push(`历史记录 ${index} 缺少链条ID`);
        }
        if (!record.completedAt) {
          issues.push(`历史记录 ${index} 缺少完成时间`);
        }
        if (record.duration < 0) {
          issues.push(`历史记录 ${index} 时长为负数`);
        }
      });

      // 验证用时统计
      const stats = storage.getTaskTimeStats();
      stats.forEach((stat, index) => {
        if (!stat.chainId) {
          issues.push(`用时统计 ${index} 缺少链条ID`);
        }
        if (stat.totalCompletions < 0) {
          issues.push(`用时统计 ${stat.chainId} 完成次数为负数`);
        }
        if (stat.totalTime < 0) {
          issues.push(`用时统计 ${stat.chainId} 总时间为负数`);
        }
      });
    } catch (error) {
      issues.push(`验证数据完整性时出错: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  /**
   * 生成迁移报告
   */
  generateMigrationReport(result: MigrationResult): string {
    const report = `
=== 数据迁移报告 ===
迁移时间: ${new Date().toLocaleString()}
迁移状态: ${result.success ? '✅ 成功' : '❌ 失败'}
总迁移记录数: ${result.migratedRecords}

详细信息:
- 完成历史记录迁移: ${result.details.completionHistoryMigrated} 条
- 任务用时统计创建: ${result.details.taskTimeStatsCreated} 条
- 链条数据更新: ${result.details.chainsUpdated} 条

${result.errors.length > 0 ? `
错误信息:
${result.errors.map((error, index) => `${index + 1}. ${error}`).join('\n')}
` : '无错误'}

迁移完成。
`;

    return report;
  }
}

// 创建全局迁移管理器实例
export const dataMigrationManager = new DataMigrationManager();

/**
 * 执行数据迁移的便捷函数
 */
export async function migrateTimerData(): Promise<string> {
  const result = await dataMigrationManager.migrateAll();
  return dataMigrationManager.generateMigrationReport(result);
}

// 在开发环境中暴露到全局对象，方便调试
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).migrateTimerData = migrateTimerData;
  (window as any).dataMigrationManager = dataMigrationManager;
}