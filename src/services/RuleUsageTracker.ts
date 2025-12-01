/**
 * 规则使用统计跟踪器
 * 记录和分析例外规则的使用情况
 */

import { 
  RuleUsageRecord, 
  SessionContext, 
  RuleUsageStats, 
  OverallUsageStats,
  ExceptionRule,
  PauseOptions,
  ExceptionRuleError,
  ExceptionRuleException
} from '../types';
import { exceptionRuleStorage } from './ExceptionRuleStorage';

export class RuleUsageTracker {
  /**
   * 记录规则使用
   */
  async recordUsage(
    ruleId: string, 
    sessionContext: SessionContext, 
    actionType: 'pause' | 'early_completion',
    pauseOptions?: PauseOptions
  ): Promise<RuleUsageRecord> {
    try {
      // 验证规则是否存在
      const rule = await exceptionRuleStorage.getRuleById(ruleId);
      if (!rule || !rule.isActive) {
        throw new ExceptionRuleException(
          ExceptionRuleError.RULE_NOT_FOUND,
          `规则 ID ${ruleId} 不存在或已被删除`
        );
      }

      // 创建使用记录
      const record = await exceptionRuleStorage.createUsageRecord({
        ruleId,
        chainId: sessionContext.chainId,
        sessionId: sessionContext.sessionId,
        actionType,
        taskElapsedTime: sessionContext.elapsedTime,
        taskRemainingTime: sessionContext.remainingTime,
        pauseDuration: pauseOptions?.duration,
        autoResume: pauseOptions?.autoResume,
        ruleScope: rule.scope
      });

      return record;
    } catch (error) {
      if (error instanceof ExceptionRuleException) {
        throw error;
      }
      throw new ExceptionRuleException(
        ExceptionRuleError.STORAGE_ERROR,
        '记录规则使用失败',
        error
      );
    }
  }

  /**
   * 获取规则使用统计
   */
  async getRuleUsageStats(ruleId: string): Promise<RuleUsageStats> {
    try {
      const rule = await exceptionRuleStorage.getRuleById(ruleId);
      if (!rule) {
        throw new ExceptionRuleException(
          ExceptionRuleError.RULE_NOT_FOUND,
          `规则 ID ${ruleId} 不存在`
        );
      }

      const records = await exceptionRuleStorage.getUsageRecordsByRuleId(ruleId);
      
      const pauseUsage = records.filter(r => r.actionType === 'pause').length;
      const earlyCompletionUsage = records.filter(r => r.actionType === 'early_completion').length;
      const totalUsage = records.length;

      // 计算平均任务已用时间
      const averageTaskElapsedTime = totalUsage > 0 
        ? records.reduce((sum, r) => sum + r.taskElapsedTime, 0) / totalUsage
        : 0;

      // 统计最常用的任务链
      const chainUsage = new Map<string, { chainName: string; count: number }>();
      for (const record of records) {
        const existing = chainUsage.get(record.chainId);
        if (existing) {
          existing.count++;
        } else {
          chainUsage.set(record.chainId, { 
            chainName: record.chainId, // 这里应该从实际的链数据获取名称
            count: 1 
          });
        }
      }

      const mostUsedWithChains = Array.from(chainUsage.entries())
        .map(([chainId, data]) => ({ chainId, chainName: data.chainName, count: data.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return {
        ruleId,
        totalUsage,
        pauseUsage,
        earlyCompletionUsage,
        lastUsedAt: rule.lastUsedAt,
        averageTaskElapsedTime,
        mostUsedWithChains
      };
    } catch (error) {
      if (error instanceof ExceptionRuleException) {
        throw error;
      }
      throw new ExceptionRuleException(
        ExceptionRuleError.STORAGE_ERROR,
        '获取规则使用统计失败',
        error
      );
    }
  }

  /**
   * 获取整体使用统计
   */
  async getOverallUsageStats(): Promise<OverallUsageStats> {
    try {
      const allRules = await exceptionRuleStorage.getRules();
      const activeRules = allRules.filter(rule => rule.isActive);
      const allRecords = await exceptionRuleStorage.getUsageRecords();

      const totalRules = activeRules.length;
      const totalUsage = allRecords.length;
      const pauseUsage = allRecords.filter(r => r.actionType === 'pause').length;
      const earlyCompletionUsage = allRecords.filter(r => r.actionType === 'early_completion').length;

      // 统计最常用的规则
      const ruleUsageCount = new Map<string, { ruleName: string; count: number }>();
      for (const record of allRecords) {
        const rule = activeRules.find(r => r.id === record.ruleId);
        if (rule) {
          const existing = ruleUsageCount.get(record.ruleId);
          if (existing) {
            existing.count++;
          } else {
            ruleUsageCount.set(record.ruleId, { 
              ruleName: rule.name, 
              count: 1 
            });
          }
        }
      }

      const mostUsedRules = Array.from(ruleUsageCount.entries())
        .map(([ruleId, data]) => ({ ruleId, ruleName: data.ruleName, count: data.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        totalRules,
        activeRules: totalRules,
        totalUsage,
        pauseUsage,
        earlyCompletionUsage,
        mostUsedRules
      };
    } catch (error) {
      throw new ExceptionRuleException(
        ExceptionRuleError.STORAGE_ERROR,
        '获取整体使用统计失败',
        error
      );
    }
  }

  /**
   * 获取规则使用历史
   */
  async getRuleUsageHistory(ruleId: string, limit?: number): Promise<RuleUsageRecord[]> {
    try {
      return await exceptionRuleStorage.getUsageRecordsByRuleId(ruleId, limit);
    } catch (error) {
      throw new ExceptionRuleException(
        ExceptionRuleError.STORAGE_ERROR,
        '获取规则使用历史失败',
        error
      );
    }
  }

  /**
   * 获取会话使用历史
   */
  async getSessionUsageHistory(sessionId: string): Promise<RuleUsageRecord[]> {
    try {
      return await exceptionRuleStorage.getUsageRecordsBySessionId(sessionId);
    } catch (error) {
      throw new ExceptionRuleException(
        ExceptionRuleError.STORAGE_ERROR,
        '获取会话使用历史失败',
        error
      );
    }
  }

  /**
   * 获取时间范围内的使用统计
   */
  async getUsageStatsInTimeRange(
    startDate: Date, 
    endDate: Date
  ): Promise<{
    totalUsage: number;
    pauseUsage: number;
    earlyCompletionUsage: number;
    dailyUsage: Array<{ date: string; count: number }>;
    topRules: Array<{ ruleId: string; ruleName: string; count: number }>;
  }> {
    try {
      const allRecords = await exceptionRuleStorage.getUsageRecords();
      const filteredRecords = allRecords.filter(record => 
        record.usedAt >= startDate && record.usedAt <= endDate
      );

      const totalUsage = filteredRecords.length;
      const pauseUsage = filteredRecords.filter(r => r.actionType === 'pause').length;
      const earlyCompletionUsage = filteredRecords.filter(r => r.actionType === 'early_completion').length;

      // 按日期统计使用量
      const dailyUsageMap = new Map<string, number>();
      for (const record of filteredRecords) {
        const dateKey = record.usedAt.toISOString().split('T')[0];
        dailyUsageMap.set(dateKey, (dailyUsageMap.get(dateKey) || 0) + 1);
      }

      const dailyUsage = Array.from(dailyUsageMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // 统计热门规则
      const ruleUsageMap = new Map<string, number>();
      for (const record of filteredRecords) {
        ruleUsageMap.set(record.ruleId, (ruleUsageMap.get(record.ruleId) || 0) + 1);
      }

      const allRules = await exceptionRuleStorage.getRules();
      const topRules = Array.from(ruleUsageMap.entries())
        .map(([ruleId, count]) => {
          const rule = allRules.find(r => r.id === ruleId);
          return { ruleId, ruleName: rule?.name || '未知规则', count };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return {
        totalUsage,
        pauseUsage,
        earlyCompletionUsage,
        dailyUsage,
        topRules
      };
    } catch (error) {
      throw new ExceptionRuleException(
        ExceptionRuleError.STORAGE_ERROR,
        '获取时间范围使用统计失败',
        error
      );
    }
  }

  /**
   * 获取规则使用趋势
   */
  async getRuleUsageTrend(ruleId: string, days: number = 30): Promise<{
    trend: Array<{ date: string; count: number }>;
    totalUsage: number;
    averageDailyUsage: number;
    peakUsageDate: string | null;
  }> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const records = await exceptionRuleStorage.getUsageRecordsByRuleId(ruleId);
      const filteredRecords = records.filter(record => 
        record.usedAt >= startDate && record.usedAt <= endDate
      );

      // 按日期统计
      const dailyUsageMap = new Map<string, number>();
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateKey = d.toISOString().split('T')[0];
        dailyUsageMap.set(dateKey, 0);
      }

      for (const record of filteredRecords) {
        const dateKey = record.usedAt.toISOString().split('T')[0];
        dailyUsageMap.set(dateKey, (dailyUsageMap.get(dateKey) || 0) + 1);
      }

      const trend = Array.from(dailyUsageMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const totalUsage = filteredRecords.length;
      const averageDailyUsage = totalUsage / days;
      
      // 找到使用量最高的日期
      const peakUsage = Math.max(...trend.map(t => t.count));
      const peakUsageDate = peakUsage > 0 
        ? trend.find(t => t.count === peakUsage)?.date || null
        : null;

      return {
        trend,
        totalUsage,
        averageDailyUsage,
        peakUsageDate
      };
    } catch (error) {
      throw new ExceptionRuleException(
        ExceptionRuleError.STORAGE_ERROR,
        '获取规则使用趋势失败',
        error
      );
    }
  }

  /**
   * 获取规则效率分析
   */
  async getRuleEfficiencyAnalysis(ruleId: string): Promise<{
    averageTaskProgress: number; // 平均任务进度（已用时间/总时间）
    usagePatterns: {
      earlyUsage: number; // 任务早期使用次数（<25%进度）
      midUsage: number;   // 任务中期使用次数（25%-75%进度）
      lateUsage: number;  // 任务后期使用次数（>75%进度）
    };
    recommendations: string[];
  }> {
    try {
      const records = await exceptionRuleStorage.getUsageRecordsByRuleId(ruleId);
      const recordsWithProgress = records.filter(r => r.taskRemainingTime !== undefined);

      if (recordsWithProgress.length === 0) {
        return {
          averageTaskProgress: 0,
          usagePatterns: { earlyUsage: 0, midUsage: 0, lateUsage: 0 },
          recommendations: ['暂无足够数据进行分析']
        };
      }

      // 计算任务进度
      const progressData = recordsWithProgress.map(record => {
        const totalTime = record.taskElapsedTime + (record.taskRemainingTime || 0);
        const progress = totalTime > 0 ? record.taskElapsedTime / totalTime : 0;
        return progress;
      });

      const averageTaskProgress = progressData.reduce((sum, p) => sum + p, 0) / progressData.length;

      // 分析使用模式
      const earlyUsage = progressData.filter(p => p < 0.25).length;
      const midUsage = progressData.filter(p => p >= 0.25 && p <= 0.75).length;
      const lateUsage = progressData.filter(p => p > 0.75).length;

      // 生成建议
      const recommendations: string[] = [];
      
      if (earlyUsage > midUsage + lateUsage) {
        recommendations.push('该规则主要在任务早期使用，可能表示任务规划需要改进');
      }
      
      if (lateUsage > earlyUsage + midUsage) {
        recommendations.push('该规则主要在任务后期使用，建议检查任务时间估算是否合理');
      }
      
      if (averageTaskProgress < 0.3) {
        recommendations.push('规则使用时任务进度较低，建议优化任务启动流程');
      }
      
      if (averageTaskProgress > 0.8) {
        recommendations.push('规则使用时任务接近完成，可能存在时间压力问题');
      }

      if (recommendations.length === 0) {
        recommendations.push('规则使用模式正常，无特殊建议');
      }

      return {
        averageTaskProgress,
        usagePatterns: { earlyUsage, midUsage, lateUsage },
        recommendations
      };
    } catch (error) {
      throw new ExceptionRuleException(
        ExceptionRuleError.STORAGE_ERROR,
        '获取规则效率分析失败',
        error
      );
    }
  }

  /**
   * 清理过期的使用记录
   */
  async cleanupExpiredRecords(retentionDays: number = 90): Promise<number> {
    try {
      const allRecords = await exceptionRuleStorage.getUsageRecords();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const validRecords = allRecords.filter(record => record.usedAt > cutoffDate);
      const removedCount = allRecords.length - validRecords.length;

      if (removedCount > 0) {
        // 这里需要实现保存过滤后记录的方法
        // 由于当前存储服务没有直接的批量更新方法，这里先返回计数
        console.log(`将清理 ${removedCount} 条过期记录`);
      }

      return removedCount;
    } catch (error) {
      throw new ExceptionRuleException(
        ExceptionRuleError.STORAGE_ERROR,
        '清理过期记录失败',
        error
      );
    }
  }

  /**
   * 导出使用统计数据
   */
  async exportUsageData(format: 'json' | 'csv' = 'json'): Promise<string> {
    try {
      const overallStats = await this.getOverallUsageStats();
      const allRules = await exceptionRuleStorage.getRules();
      const allRecords = await exceptionRuleStorage.getUsageRecords();

      const exportData = {
        exportedAt: new Date().toISOString(),
        overallStats,
        rules: allRules.filter(r => r.isActive),
        usageRecords: allRecords,
        summary: {
          totalRules: allRules.filter(r => r.isActive).length,
          totalRecords: allRecords.length,
          dateRange: {
            earliest: allRecords.length > 0 
              ? Math.min(...allRecords.map(r => r.usedAt.getTime()))
              : null,
            latest: allRecords.length > 0 
              ? Math.max(...allRecords.map(r => r.usedAt.getTime()))
              : null
          }
        }
      };

      if (format === 'json') {
        return JSON.stringify(exportData, null, 2);
      } else {
        // 简单的CSV格式导出
        const csvLines = [
          'Date,Rule Name,Action Type,Task Elapsed Time,Task Remaining Time,Chain ID',
          ...allRecords.map(record => {
            const rule = allRules.find(r => r.id === record.ruleId);
            return [
              record.usedAt.toISOString(),
              rule?.name || 'Unknown',
              record.actionType,
              record.taskElapsedTime,
              record.taskRemainingTime || '',
              record.chainId
            ].join(',');
          })
        ];
        return csvLines.join('\n');
      }
    } catch (error) {
      throw new ExceptionRuleException(
        ExceptionRuleError.STORAGE_ERROR,
        '导出使用数据失败',
        error
      );
    }
  }
}

// 创建全局实例
export const ruleUsageTracker = new RuleUsageTracker();