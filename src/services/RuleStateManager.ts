/**
 * 规则状态管理器
 * 跟踪规则状态，解决乐观更新和ID管理问题
 */

import { 
  ExceptionRule, 
  ExceptionRuleType,
  ExceptionRuleError, 
  ExceptionRuleException 
} from '../types';
import { exceptionRuleStorage } from './ExceptionRuleStorage';

export interface RuleState {
  id: string;
  status: 'active' | 'creating' | 'updating' | 'deleting' | 'error' | 'pending';
  lastValidated?: Date;
  validationErrors?: string[];
  temporaryId?: string; // 用于跟踪乐观更新的临时ID
  realId?: string; // 实际存储的ID
  createdAt: Date;
  updatedAt: Date;
}

export interface PendingRuleCreation {
  temporaryId: string;
  name: string;
  type: ExceptionRuleType;
  description?: string;
  createdAt: Date;
  promise: Promise<ExceptionRule>;
}

export interface IdMapping {
  temporaryId: string;
  realId: string;
  mappedAt: Date;
}

export class RuleStateManager {
  private states = new Map<string, RuleState>();
  private pendingCreations = new Map<string, PendingRuleCreation>();
  private idMappings = new Map<string, IdMapping>();
  private idCounter = 0;

  /**
   * 生成临时ID
   */
  generateTemporaryId(): string {
    this.idCounter++;
    return `temp_${Date.now()}_${this.idCounter}`;
  }

  /**
   * 生成真实ID
   */
  generateRealId(): string {
    return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 跟踪规则状态
   */
  trackRuleState(ruleId: string, status: RuleState['status'], temporaryId?: string): void {
    const now = new Date();
    const existingState = this.states.get(ruleId);

    const state: RuleState = {
      id: ruleId,
      status,
      temporaryId,
      createdAt: existingState?.createdAt || now,
      updatedAt: now,
      lastValidated: existingState?.lastValidated,
      validationErrors: existingState?.validationErrors,
      realId: existingState?.realId
    };

    this.states.set(ruleId, state);

    // 如果是临时ID，也要跟踪
    if (temporaryId) {
      this.states.set(temporaryId, state);
    }

    console.log(`规则状态更新: ${ruleId} -> ${status}`, { temporaryId, state });
  }

  /**
   * 获取规则状态
   */
  getRuleState(ruleId: string): RuleState | undefined {
    return this.states.get(ruleId);
  }

  /**
   * 开始乐观规则创建
   */
  startOptimisticCreation(
    name: string, 
    type: ExceptionRuleType, 
    description?: string
  ): { temporaryRule: ExceptionRule; temporaryId: string } {
    const temporaryId = this.generateTemporaryId();
    const now = new Date();

    // 创建临时规则对象
    const temporaryRule: ExceptionRule = {
      id: temporaryId,
      name,
      type,
      description,
      scope: 'global',
      chainId: undefined,
      createdAt: now,
      lastUsedAt: undefined,
      usageCount: 0,
      isActive: true,
      isArchived: false
    };

    // 跟踪状态
    this.trackRuleState(temporaryId, 'creating');

    // 开始实际创建
    const creationPromise = this.performActualCreation(temporaryRule);
    
    const pendingCreation: PendingRuleCreation = {
      temporaryId,
      name,
      type,
      description,
      createdAt: now,
      promise: creationPromise
    };

    this.pendingCreations.set(temporaryId, pendingCreation);

    // 处理创建结果
    creationPromise
      .then(realRule => {
        this.handleCreationSuccess(temporaryId, realRule);
      })
      .catch(error => {
        this.handleCreationError(temporaryId, error);
      });

    return { temporaryRule, temporaryId };
  }

  /**
   * 等待规则创建完成
   */
  async waitForRuleCreation(temporaryId: string): Promise<ExceptionRule> {
    const pending = this.pendingCreations.get(temporaryId);
    if (!pending) {
      throw new ExceptionRuleException(
        ExceptionRuleError.RULE_NOT_FOUND,
        `临时规则 ${temporaryId} 不存在`
      );
    }

    try {
      const realRule = await pending.promise;
      return realRule;
    } catch (error) {
      throw new ExceptionRuleException(
        ExceptionRuleError.STORAGE_ERROR,
        `规则创建失败: ${error instanceof Error ? error.message : '未知错误'}`,
        error
      );
    }
  }

  /**
   * 获取真实规则ID
   */
  getRealRuleId(temporaryId: string): string | null {
    // 首先检查ID映射
    const mapping = this.idMappings.get(temporaryId);
    if (mapping) {
      return mapping.realId;
    }

    // 检查规则状态
    const state = this.states.get(temporaryId);
    if (state?.realId) {
      return state.realId;
    }

    // 如果不是临时ID，直接返回
    if (!temporaryId.startsWith('temp_')) {
      return temporaryId;
    }

    return null;
  }

  /**
   * 检查规则是否存在（包括临时规则）
   */
  async ruleExists(ruleId: string): Promise<boolean> {
    // 检查是否是临时规则
    if (this.pendingCreations.has(ruleId)) {
      return true;
    }

    // 检查真实规则
    const realId = this.getRealRuleId(ruleId);
    if (realId && realId !== ruleId) {
      const rule = await exceptionRuleStorage.getRuleById(realId);
      return rule !== null;
    }

    // 直接检查存储
    const rule = await exceptionRuleStorage.getRuleById(ruleId);
    return rule !== null;
  }

  /**
   * 获取规则（包括临时规则）
   */
  async getRule(ruleId: string): Promise<ExceptionRule | null> {
    // 检查是否是临时规则
    const pending = this.pendingCreations.get(ruleId);
    if (pending) {
      try {
        // 等待创建完成
        return await pending.promise;
      } catch (error) {
        console.error('获取临时规则失败:', error);
        return null;
      }
    }

    // 检查真实规则
    const realId = this.getRealRuleId(ruleId);
    if (realId && realId !== ruleId) {
      return await exceptionRuleStorage.getRuleById(realId);
    }

    // 直接从存储获取
    return await exceptionRuleStorage.getRuleById(ruleId);
  }

  /**
   * 验证规则ID的有效性
   */
  async validateRuleId(ruleId: string): Promise<{
    isValid: boolean;
    isTemporary: boolean;
    realId?: string;
    error?: string;
  }> {
    try {
      // 检查是否是临时ID
      const isTemporary = ruleId.startsWith('temp_');
      
      if (isTemporary) {
        const pending = this.pendingCreations.get(ruleId);
        if (pending) {
          return {
            isValid: true,
            isTemporary: true,
            realId: undefined // 还在创建中
          };
        }

        const realId = this.getRealRuleId(ruleId);
        if (realId) {
          return {
            isValid: true,
            isTemporary: true,
            realId
          };
        }

        return {
          isValid: false,
          isTemporary: true,
          error: '临时规则不存在或已过期'
        };
      }

      // 检查真实ID
      const rule = await exceptionRuleStorage.getRuleById(ruleId);
      return {
        isValid: rule !== null,
        isTemporary: false,
        realId: ruleId,
        error: rule ? undefined : '规则不存在'
      };

    } catch (error) {
      return {
        isValid: false,
        isTemporary: false,
        error: error instanceof Error ? error.message : '验证失败'
      };
    }
  }

  /**
   * 执行实际的规则创建
   */
  private async performActualCreation(temporaryRule: ExceptionRule): Promise<ExceptionRule> {
    try {
      // 生成真实ID
      const realId = this.generateRealId();
      
      // 创建真实规则
      const realRule = await exceptionRuleStorage.createRule({
        name: temporaryRule.name,
        type: temporaryRule.type,
        description: temporaryRule.description,
        scope: temporaryRule.scope,
        chainId: temporaryRule.chainId,
        isArchived: temporaryRule.isArchived || false
      });

      // 确保使用生成的真实ID
      if (realRule.id !== realId) {
        realRule.id = realId;
      }

      return realRule;

    } catch (error) {
      throw new ExceptionRuleException(
        ExceptionRuleError.STORAGE_ERROR,
        `创建规则失败: ${error instanceof Error ? error.message : '未知错误'}`,
        error
      );
    }
  }

  /**
   * 处理创建成功
   */
  private handleCreationSuccess(temporaryId: string, realRule: ExceptionRule): void {
    console.log(`规则创建成功: ${temporaryId} -> ${realRule.id}`);

    // 创建ID映射
    const mapping: IdMapping = {
      temporaryId,
      realId: realRule.id,
      mappedAt: new Date()
    };
    this.idMappings.set(temporaryId, mapping);

    // 更新状态
    this.trackRuleState(realRule.id, 'active');
    this.trackRuleState(temporaryId, 'active', temporaryId);

    // 更新状态中的真实ID
    const state = this.states.get(temporaryId);
    if (state) {
      state.realId = realRule.id;
      state.status = 'active';
      this.states.set(temporaryId, state);
      this.states.set(realRule.id, state);
    }

    // 清理待处理创建
    this.pendingCreations.delete(temporaryId);
  }

  /**
   * 处理创建错误
   */
  private handleCreationError(temporaryId: string, error: any): void {
    console.error(`规则创建失败: ${temporaryId}`, error);

    // 更新状态
    this.trackRuleState(temporaryId, 'error');

    // 添加错误信息
    const state = this.states.get(temporaryId);
    if (state) {
      state.validationErrors = [error instanceof Error ? error.message : '创建失败'];
      this.states.set(temporaryId, state);
    }

    // 清理待处理创建
    this.pendingCreations.delete(temporaryId);
  }

  /**
   * 清理过期状态
   */
  cleanupExpiredStates(): void {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10分钟

    // 清理过期的状态
    for (const [id, state] of this.states.entries()) {
      if (now - state.updatedAt.getTime() > maxAge) {
        this.states.delete(id);
      }
    }

    // 清理过期的ID映射
    for (const [tempId, mapping] of this.idMappings.entries()) {
      if (now - mapping.mappedAt.getTime() > maxAge) {
        this.idMappings.delete(tempId);
      }
    }

    // 清理过期的待处理创建
    for (const [tempId, pending] of this.pendingCreations.entries()) {
      if (now - pending.createdAt.getTime() > maxAge) {
        this.pendingCreations.delete(tempId);
      }
    }
  }

  /**
   * 获取所有状态（用于调试）
   */
  getAllStates(): {
    states: Map<string, RuleState>;
    pendingCreations: Map<string, PendingRuleCreation>;
    idMappings: Map<string, IdMapping>;
  } {
    return {
      states: new Map(this.states),
      pendingCreations: new Map(this.pendingCreations),
      idMappings: new Map(this.idMappings)
    };
  }

  /**
   * 清除所有状态
   */
  clearAllStates(): void {
    this.states.clear();
    this.pendingCreations.clear();
    this.idMappings.clear();
    this.idCounter = 0;
  }

  /**
   * 同步规则状态
   */
  async syncRuleStates(): Promise<void> {
    try {
      const allRules = await exceptionRuleStorage.getRules();
      
      // 更新现有规则的状态
      for (const rule of allRules) {
        this.trackRuleState(rule.id, 'active');
      }

      // 清理不存在的规则状态
      const existingIds = new Set(allRules.map(r => r.id));
      for (const [id, state] of this.states.entries()) {
        if (!id.startsWith('temp_') && !existingIds.has(id)) {
          this.states.delete(id);
        }
      }

    } catch (error) {
      console.error('同步规则状态失败:', error);
    }
  }
}

// 创建全局实例
export const ruleStateManager = new RuleStateManager();

// 定期清理过期状态
setInterval(() => {
  ruleStateManager.cleanupExpiredStates();
}, 5 * 60 * 1000); // 每5分钟清理一次