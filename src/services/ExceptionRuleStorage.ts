/**
 * 例外规则存储服务
 * 处理例外规则和使用记录的本地存储操作
 */

import {
  ExceptionRule,
  RuleUsageRecord,
  ExceptionRuleStorage,
  ExceptionRuleError,
  ExceptionRuleException,
  ExceptionRuleType
} from '../types';

export class ExceptionRuleStorageService {
  private static readonly STORAGE_KEY = 'momentum_exception_rules';
  private static readonly USAGE_RECORDS_KEY = 'momentum_rule_usage_records';

  /**
   * 获取所有例外规则
   */
  async getRules(): Promise<ExceptionRule[]> {
    try {
      const data = localStorage.getItem(ExceptionRuleStorageService.STORAGE_KEY);
      if (!data) return [];
      
      const rules = JSON.parse(data) as ExceptionRule[];
      return rules.map(rule => ({
        ...rule,
        createdAt: new Date(rule.createdAt),
        lastUsedAt: rule.lastUsedAt ? new Date(rule.lastUsedAt) : undefined
      }));
    } catch (error) {
      throw new ExceptionRuleException(
        ExceptionRuleError.STORAGE_ERROR,
        '获取例外规则失败',
        error
      );
    }
  }

  /**
   * 根据ID获取例外规则
   */
  async getRuleById(id: string): Promise<ExceptionRule | null> {
    const rules = await this.getRules();
    return rules.find(rule => rule.id === id) || null;
  }

  /**
   * 根据类型获取例外规则
   */
  async getRulesByType(type: ExceptionRuleType): Promise<ExceptionRule[]> {
    const rules = await this.getRules();
    return rules.filter(rule => rule.type === type && rule.isActive);
  }

  /**
   * 创建新的例外规则
   */
  async createRule(rule: Omit<ExceptionRule, 'id' | 'createdAt' | 'usageCount' | 'isActive'>): Promise<ExceptionRule> {
    try {
      // 验证规则数据（创建模式）
      this.validateRule(rule, true);
      
      // 验证规则名称唯一性（链专属规则只检查同链内的重复，全局规则检查所有规则）
      const existingRules = await this.getRules();
      const isDuplicate = existingRules.some(r => {
        if (r.name !== rule.name || !r.isActive) return false;
        
        // 如果是链专属规则，只检查同链内的重复
        if (rule.chainId && r.chainId) {
          return r.chainId === rule.chainId;
        }
        
        // 如果是全局规则，检查所有全局规则
        if (rule.scope === 'global' && r.scope === 'global') {
          return true;
        }
        
        return false;
      });
      
      if (isDuplicate) {
        const scopeText = rule.chainId ? '此链中' : '全局';
        throw new ExceptionRuleException(
          ExceptionRuleError.DUPLICATE_RULE_NAME,
          `规则名称 "${rule.name}" 在${scopeText}已存在`
        );
      }

      const newRule: ExceptionRule = {
        ...rule,
        id: this.generateId(),
        createdAt: new Date(),
        usageCount: 0,
        isActive: true
      };

      const rules = [...existingRules, newRule];
      await this.saveRules(rules);
      
      return newRule;
    } catch (error) {
      if (error instanceof ExceptionRuleException) {
        throw error;
      }
      throw new ExceptionRuleException(
        ExceptionRuleError.STORAGE_ERROR,
        '创建例外规则失败',
        error
      );
    }
  }

  /**
   * 更新例外规则
   */
  async updateRule(id: string, updates: Partial<ExceptionRule>): Promise<ExceptionRule> {
    try {
      const rules = await this.getRules();
      const ruleIndex = rules.findIndex(rule => rule.id === id);
      
      if (ruleIndex === -1) {
        throw new ExceptionRuleException(
          ExceptionRuleError.RULE_NOT_FOUND,
          `规则 ID ${id} 不存在`
        );
      }

      // 如果更新名称，检查唯一性
      if (updates.name && updates.name !== rules[ruleIndex].name) {
        if (rules.some(r => r.name === updates.name && r.id !== id && r.isActive)) {
          throw new ExceptionRuleException(
            ExceptionRuleError.DUPLICATE_RULE_NAME,
            `规则名称 "${updates.name}" 已存在`
          );
        }
      }

      const updatedRule = { ...rules[ruleIndex], ...updates };
      rules[ruleIndex] = updatedRule;
      
      await this.saveRules(rules);
      return updatedRule;
    } catch (error) {
      if (error instanceof ExceptionRuleException) {
        throw error;
      }
      throw new ExceptionRuleException(
        ExceptionRuleError.STORAGE_ERROR,
        '更新例外规则失败',
        error
      );
    }
  }

  /**
   * 删除例外规则（软删除）
   */
  async deleteRule(id: string): Promise<void> {
    try {
      const rules = await this.getRules();
      const ruleIndex = rules.findIndex(rule => rule.id === id);
      
      if (ruleIndex === -1) {
        throw new ExceptionRuleException(
          ExceptionRuleError.RULE_NOT_FOUND,
          `规则 ID ${id} 不存在`
        );
      }

      // 软删除：设置为非活跃状态
      rules[ruleIndex].isActive = false;
      await this.saveRules(rules);
    } catch (error) {
      if (error instanceof ExceptionRuleException) {
        throw error;
      }
      throw new ExceptionRuleException(
        ExceptionRuleError.STORAGE_ERROR,
        '删除例外规则失败',
        error
      );
    }
  }

  /**
   * 获取所有使用记录
   */
  async getAllUsageRecords(): Promise<RuleUsageRecord[]> {
    return this.getUsageRecords();
  }

  /**
   * 获取指定链的使用记录
   */
  async getUsageRecordsByChain(chainId: string): Promise<RuleUsageRecord[]> {
    try {
      const allRecords = await this.getUsageRecords();
      return allRecords.filter(record => record.chainId === chainId);
    } catch (error) {
      throw new ExceptionRuleException(
        ExceptionRuleError.STORAGE_ERROR,
        '获取链使用记录失败',
        error
      );
    }
  }

  /**
   * 删除使用记录
   */
  async deleteUsageRecord(recordId: string): Promise<void> {
    try {
      const records = await this.getUsageRecords();
      const filteredRecords = records.filter(record => record.id !== recordId);
      
      localStorage.setItem(
        ExceptionRuleStorageService.USAGE_RECORDS_KEY,
        JSON.stringify(filteredRecords)
      );
    } catch (error) {
      throw new ExceptionRuleException(
        ExceptionRuleError.STORAGE_ERROR,
        '删除使用记录失败',
        error
      );
    }
  }

  /**
   * 获取所有使用记录
   */
  async getUsageRecords(): Promise<RuleUsageRecord[]> {
    try {
      const data = localStorage.getItem(ExceptionRuleStorageService.USAGE_RECORDS_KEY);
      if (!data) return [];
      
      const records = JSON.parse(data) as RuleUsageRecord[];
      return records.map(record => ({
        ...record,
        usedAt: new Date(record.usedAt)
      }));
    } catch (error) {
      throw new ExceptionRuleException(
        ExceptionRuleError.STORAGE_ERROR,
        '获取使用记录失败',
        error
      );
    }
  }

  /**
   * 创建使用记录
   */
  async createUsageRecord(record: Omit<RuleUsageRecord, 'id' | 'usedAt'>): Promise<RuleUsageRecord> {
    try {
      const newRecord: RuleUsageRecord = {
        ...record,
        id: this.generateId(),
        usedAt: new Date()
      };

      const records = await this.getUsageRecords();
      records.push(newRecord);
      
      await this.saveUsageRecords(records);
      
      // 更新规则的使用统计
      await this.updateRuleUsageStats(record.ruleId);
      
      return newRecord;
    } catch (error) {
      throw new ExceptionRuleException(
        ExceptionRuleError.STORAGE_ERROR,
        '创建使用记录失败',
        error
      );
    }
  }

  /**
   * 根据规则ID获取使用记录
   */
  async getUsageRecordsByRuleId(ruleId: string, limit?: number): Promise<RuleUsageRecord[]> {
    const records = await this.getUsageRecords();
    const filtered = records
      .filter(record => record.ruleId === ruleId)
      .sort((a, b) => b.usedAt.getTime() - a.usedAt.getTime());
    
    return limit ? filtered.slice(0, limit) : filtered;
  }

  /**
   * 根据会话ID获取使用记录
   */
  async getUsageRecordsBySessionId(sessionId: string): Promise<RuleUsageRecord[]> {
    const records = await this.getUsageRecords();
    return records.filter(record => record.sessionId === sessionId);
  }

  /**
   * 验证规则数据
   */
  validateRule(rule: Partial<ExceptionRule>, isCreating: boolean = false): void {
    console.log('🔧 ExceptionRuleStorage.validateRule 调用:', { rule, isCreating });
    
    if (!rule.name || rule.name.trim().length === 0) {
      throw new ExceptionRuleException(
        ExceptionRuleError.VALIDATION_ERROR,
        '规则名称不能为空'
      );
    }

    if (rule.name.length > 100) {
      throw new ExceptionRuleException(
        ExceptionRuleError.VALIDATION_ERROR,
        '规则名称不能超过100个字符'
      );
    }

    // 创建规则时，类型是必需的
    if (isCreating && !rule.type) {
      console.error('❌ 规则类型验证失败:', { rule, isCreating, typeValue: rule.type, typeOf: typeof rule.type });
      throw new ExceptionRuleException(
        ExceptionRuleError.VALIDATION_ERROR,
        `规则类型不能为空。接收到的类型: ${rule.type} (${typeof rule.type})`
      );
    }

    if (rule.type && !Object.values(ExceptionRuleType).includes(rule.type)) {
      throw new ExceptionRuleException(
        ExceptionRuleError.INVALID_RULE_TYPE,
        `无效的规则类型: ${rule.type}`
      );
    }

    if (rule.description && rule.description.length > 500) {
      throw new ExceptionRuleException(
        ExceptionRuleError.VALIDATION_ERROR,
        '规则描述不能超过500个字符'
      );
    }
  }

  /**
   * 清理过期数据
   */
  async cleanupExpiredData(): Promise<void> {
    try {
      const records = await this.getUsageRecords();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      // 保留最近30天的使用记录
      const validRecords = records.filter(record => record.usedAt > thirtyDaysAgo);
      
      if (validRecords.length !== records.length) {
        await this.saveUsageRecords(validRecords);
      }
    } catch (error) {
      console.warn('清理过期数据失败:', error);
    }
  }

  /**
   * 导出数据
   */
  async exportData(): Promise<ExceptionRuleStorage> {
    const rules = await this.getRules();
    const usageRecords = await this.getUsageRecords();
    
    return {
      rules: rules.filter(rule => rule.isActive),
      usageRecords,
      lastSyncAt: new Date()
    };
  }

  /**
   * 导入数据
   */
  async importData(data: ExceptionRuleStorage, mergeStrategy: 'replace' | 'merge' = 'merge'): Promise<void> {
    try {
      if (mergeStrategy === 'replace') {
        await this.saveRules(data.rules);
        await this.saveUsageRecords(data.usageRecords);
      } else {
        // 合并策略：保留现有数据，添加新数据
        const existingRules = await this.getRules();
        const existingRecords = await this.getUsageRecords();
        
        // 合并规则（避免重复名称）
        const mergedRules = [...existingRules];
        for (const newRule of data.rules) {
          if (!mergedRules.some(r => r.name === newRule.name && r.isActive)) {
            mergedRules.push({ ...newRule, id: this.generateId() });
          }
        }
        
        // 合并使用记录
        const mergedRecords = [...existingRecords, ...data.usageRecords.map(r => ({ ...r, id: this.generateId() }))];
        
        await this.saveRules(mergedRules);
        await this.saveUsageRecords(mergedRecords);
      }
    } catch (error) {
      throw new ExceptionRuleException(
        ExceptionRuleError.STORAGE_ERROR,
        '导入数据失败',
        error
      );
    }
  }

  /**
   * 保存规则到存储
   */
  private async saveRules(rules: ExceptionRule[]): Promise<void> {
    try {
      localStorage.setItem(ExceptionRuleStorageService.STORAGE_KEY, JSON.stringify(rules));
    } catch (error) {
      throw new ExceptionRuleException(
        ExceptionRuleError.STORAGE_ERROR,
        '保存规则失败',
        error
      );
    }
  }

  /**
   * 保存使用记录到存储
   */
  private async saveUsageRecords(records: RuleUsageRecord[]): Promise<void> {
    try {
      localStorage.setItem(ExceptionRuleStorageService.USAGE_RECORDS_KEY, JSON.stringify(records));
    } catch (error) {
      throw new ExceptionRuleException(
        ExceptionRuleError.STORAGE_ERROR,
        '保存使用记录失败',
        error
      );
    }
  }

  /**
   * 更新规则使用统计
   */
  private async updateRuleUsageStats(ruleId: string): Promise<void> {
    try {
      const rules = await this.getRules();
      const ruleIndex = rules.findIndex(rule => rule.id === ruleId);
      
      if (ruleIndex !== -1) {
        rules[ruleIndex].usageCount += 1;
        rules[ruleIndex].lastUsedAt = new Date();
        await this.saveRules(rules);
      }
    } catch (error) {
      console.warn('更新规则使用统计失败:', error);
    }
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// 创建全局实例
export const exceptionRuleStorage = new ExceptionRuleStorageService();