/**
 * 链删除处理器
 * 处理链删除时的规则清理逻辑，确保数据一致性
 */

import { ExceptionRule, ExceptionRuleError, ExceptionRuleException } from '../types';
import { exceptionRuleManager } from './ExceptionRuleManager';
import { exceptionRuleStorage } from './ExceptionRuleStorage';

export class ChainDeletionHandler {
  /**
   * 链移动到回收站时的处理
   * 暂时保留规则但标记为不可用
   */
  async moveChainToRecycleBin(chainId: string): Promise<{
    affectedRules: ExceptionRule[];
    archivedCount: number;
  }> {
    try {
      // 获取该链的所有专属规则
      const allRules = await exceptionRuleManager.getAllRules();
      const chainRules = allRules.filter((rule: ExceptionRule) => 
        rule.scope === 'chain' && 
        rule.chainId === chainId && 
        rule.isActive
      );

      const affectedRules: ExceptionRule[] = [];

      // 将链专属规则标记为归档状态
      for (const rule of chainRules) {
        const updatedResult = await exceptionRuleStorage.updateRule(rule.id, {
          isArchived: true,
          isActive: false // 暂时设为不活跃，但保留数据
        });
        affectedRules.push(updatedResult);
      }

      // 记录删除时间用于后续清理
      await this.recordChainDeletionTime(chainId);

      return {
        affectedRules,
        archivedCount: affectedRules.length
      };
    } catch (error) {
      console.error('移动链到回收站时处理规则失败:', error);
      throw new ExceptionRuleException(
        ExceptionRuleError.STORAGE_ERROR,
        '处理链删除失败',
        error
      );
    }
  }

  /**
   * 链从回收站恢复时的处理
   * 重新激活相关的例外规则
   */
  async restoreChainFromRecycleBin(chainId: string): Promise<{
    restoredRules: ExceptionRule[];
    restoredCount: number;
  }> {
    try {
      // 获取该链的所有归档规则
      const allRules = await exceptionRuleManager.getAllRules();
      const archivedChainRules = allRules.filter((rule: ExceptionRule) => 
        rule.scope === 'chain' && 
        rule.chainId === chainId && 
        rule.isArchived === true
      );

      const restoredRules: ExceptionRule[] = [];

      // 重新激活链专属规则
      for (const rule of archivedChainRules) {
        const updatedRule = await exceptionRuleStorage.updateRule(rule.id, {
          isArchived: false,
          isActive: true
        });
        restoredRules.push(updatedRule);
      }

      // 清除删除时间记录
      await this.clearChainDeletionTime(chainId);

      return {
        restoredRules,
        restoredCount: restoredRules.length
      };
    } catch (error) {
      console.error('从回收站恢复链时处理规则失败:', error);
      throw new ExceptionRuleException(
        ExceptionRuleError.STORAGE_ERROR,
        '恢复链规则失败',
        error
      );
    }
  }

  /**
   * 永久删除链时的处理
   * 删除所有链专属规则和相关的使用记录
   */
  async permanentlyDeleteChain(chainId: string): Promise<{
    deletedRules: string[];
    deletedUsageRecords: number;
  }> {
    try {
      // 获取该链的所有规则（包括归档的）
      const allRules = await exceptionRuleManager.getAllRules();
      const chainRules = allRules.filter((rule: ExceptionRule) => 
        rule.scope === 'chain' && 
        rule.chainId === chainId
      );

      const deletedRuleIds: string[] = [];

      // 删除所有链专属规则
      for (const rule of chainRules) {
        await exceptionRuleManager.deleteRule(rule.id);
        deletedRuleIds.push(rule.id);
      }

      // 删除相关的使用记录
      const deletedUsageRecords = await this.deleteChainUsageRecords(chainId);

      // 清除删除时间记录
      await this.clearChainDeletionTime(chainId);

      return {
        deletedRules: deletedRuleIds,
        deletedUsageRecords
      };
    } catch (error) {
      console.error('永久删除链时处理规则失败:', error);
      throw new ExceptionRuleException(
        ExceptionRuleError.STORAGE_ERROR,
        '永久删除链规则失败',
        error
      );
    }
  }

  /**
   * 批量清理过期的归档规则
   * 清理超过指定天数的归档规则
   */
  async cleanupExpiredArchivedRules(daysThreshold: number = 30): Promise<{
    cleanedRules: string[];
    cleanedCount: number;
  }> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysThreshold);

      const deletionRecords = await this.getChainDeletionRecords();
      const expiredChainIds = deletionRecords
        .filter(record => record.deletedAt < cutoffDate)
        .map(record => record.chainId);

      const cleanedRuleIds: string[] = [];

      // 清理过期的归档规则
      for (const chainId of expiredChainIds) {
        const result = await this.permanentlyDeleteChain(chainId);
        cleanedRuleIds.push(...result.deletedRules);
      }

      return {
        cleanedRules: cleanedRuleIds,
        cleanedCount: cleanedRuleIds.length
      };
    } catch (error) {
      console.error('清理过期归档规则失败:', error);
      throw new ExceptionRuleException(
        ExceptionRuleError.STORAGE_ERROR,
        '清理过期规则失败',
        error
      );
    }
  }

  /**
   * 获取链删除影响的规则统计
   */
  async getChainDeletionImpact(chainId: string): Promise<{
    chainRuleCount: number;
    usageRecordCount: number;
    lastUsedDate?: Date;
  }> {
    try {
      const allRules = await exceptionRuleManager.getAllRules();
      const chainRules = allRules.filter((rule: ExceptionRule) => 
        rule.scope === 'chain' && 
        rule.chainId === chainId
      );

      const usageRecords = await exceptionRuleStorage.getUsageRecordsByChain(chainId);
      
      const lastUsedDate = chainRules
        .map((rule: ExceptionRule) => rule.lastUsedAt)
        .filter((date: Date | undefined) => date)
        .sort((a: Date, b: Date) => b.getTime() - a.getTime())[0];

      return {
        chainRuleCount: chainRules.length,
        usageRecordCount: usageRecords.length,
        lastUsedDate
      };
    } catch (error) {
      console.error('获取链删除影响统计失败:', error);
      return {
        chainRuleCount: 0,
        usageRecordCount: 0
      };
    }
  }

  /**
   * 记录链删除时间
   */
  private async recordChainDeletionTime(chainId: string): Promise<void> {
    try {
      const deletionRecords = await this.getChainDeletionRecords();
      const newRecord = {
        chainId,
        deletedAt: new Date()
      };
      
      const updatedRecords = [
        ...deletionRecords.filter(r => r.chainId !== chainId),
        newRecord
      ];
      
      localStorage.setItem('chain_deletion_records', JSON.stringify(updatedRecords));
    } catch (error) {
      console.error('记录链删除时间失败:', error);
    }
  }

  /**
   * 清除链删除时间记录
   */
  private async clearChainDeletionTime(chainId: string): Promise<void> {
    try {
      const deletionRecords = await this.getChainDeletionRecords();
      const updatedRecords = deletionRecords.filter(r => r.chainId !== chainId);
      localStorage.setItem('chain_deletion_records', JSON.stringify(updatedRecords));
    } catch (error) {
      console.error('清除链删除时间记录失败:', error);
    }
  }

  /**
   * 获取链删除记录
   */
  private async getChainDeletionRecords(): Promise<Array<{ chainId: string; deletedAt: Date }>> {
    try {
      const recordsStr = localStorage.getItem('chain_deletion_records');
      if (!recordsStr) return [];
      
      const records = JSON.parse(recordsStr);
      return records.map((r: any) => ({
        chainId: r.chainId,
        deletedAt: new Date(r.deletedAt)
      }));
    } catch (error) {
      console.error('获取链删除记录失败:', error);
      return [];
    }
  }

  /**
   * 删除链的使用记录
   */
  private async deleteChainUsageRecords(chainId: string): Promise<number> {
    try {
      const allRecords = await exceptionRuleStorage.getAllUsageRecords();
      const chainRecords = allRecords.filter(record => record.chainId === chainId);
      
      // 删除使用记录
      for (const record of chainRecords) {
        await exceptionRuleStorage.deleteUsageRecord(record.id);
      }
      
      return chainRecords.length;
    } catch (error) {
      console.error('删除链使用记录失败:', error);
      return 0;
    }
  }
}

// 导出单例实例
export const chainDeletionHandler = new ChainDeletionHandler();