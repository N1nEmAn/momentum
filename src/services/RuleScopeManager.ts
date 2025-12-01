/**
 * 规则作用域管理服务
 * 处理链专属规则和全局规则的管理
 */

import { ExceptionRule, ExceptionRuleType } from '../types';
import { exceptionRuleManager } from './ExceptionRuleManager';
import { exceptionRuleStorage } from './ExceptionRuleStorage';

export class RuleScopeManager {
  /**
   * 获取指定链的可用规则（链专属 + 全局）
   */
  async getAvailableRules(chainId: string, actionType: ExceptionRuleType): Promise<ExceptionRule[]> {
    try {
      // 获取所有规则
      const allRules = await exceptionRuleManager.getAllRules();
      
      // 筛选出可用的规则：匹配动作类型 + (全局规则 + 该链的专属规则)
      const availableRules = allRules.filter(rule => 
        rule.type === actionType && (
          rule.scope === 'global' || 
          (rule.scope === 'chain' && rule.chainId === chainId)
        )
      );
      
      // 按优先级排序：链专属规则优先，然后是全局规则
      return availableRules.sort((a, b) => {
        if (a.scope === 'chain' && b.scope === 'global') return -1;
        if (a.scope === 'global' && b.scope === 'chain') return 1;
        
        // 同类型规则按使用频率排序
        return b.usageCount - a.usageCount;
      });
    } catch (error) {
      console.error('获取可用规则失败:', error);
      return [];
    }
  }

  /**
   * 创建链专属规则
   */
  async createChainRule(chainId: string, name: string, type: ExceptionRuleType, description?: string): Promise<ExceptionRule> {
    try {
      const result = await exceptionRuleManager.createRule(name, type, description);
      
      // 更新规则为链专属（使用存储层直接更新）
      const updatedRule = await exceptionRuleStorage.updateRule(result.rule.id, {
        chainId,
        scope: 'chain'
      });
      
      return updatedRule;
    } catch (error) {
      console.error('创建链专属规则失败:', error);
      throw error;
    }
  }

  /**
   * 创建全局规则
   */
  async createGlobalRule(name: string, type: ExceptionRuleType, description?: string): Promise<ExceptionRule> {
    try {
      const result = await exceptionRuleManager.createRule(name, type, description);
      
      // 规则默认就是全局的，直接返回
      return result.rule;
    } catch (error) {
      console.error('创建全局规则失败:', error);
      throw error;
    }
  }

  /**
   * 规则作用域转换
   */
  async convertRuleScope(ruleId: string, newScope: 'chain' | 'global', chainId?: string): Promise<void> {
    try {
      const updates: Partial<ExceptionRule> = {
        scope: newScope
      };
      
      if (newScope === 'chain' && chainId) {
        updates.chainId = chainId;
      } else if (newScope === 'global') {
        updates.chainId = undefined;
      }
      
      await exceptionRuleStorage.updateRule(ruleId, updates);
    } catch (error) {
      console.error('转换规则作用域失败:', error);
      throw error;
    }
  }

  /**
   * 获取链的专属规则数量
   */
  async getChainRuleCount(chainId: string): Promise<number> {
    try {
      const allRules = await exceptionRuleManager.getAllRules();
      return allRules.filter(rule => rule.scope === 'chain' && rule.chainId === chainId).length;
    } catch (error) {
      console.error('获取链规则数量失败:', error);
      return 0;
    }
  }

  /**
   * 获取全局规则数量
   */
  async getGlobalRuleCount(): Promise<number> {
    try {
      const allRules = await exceptionRuleManager.getAllRules();
      return allRules.filter(rule => rule.scope === 'global').length;
    } catch (error) {
      console.error('获取全局规则数量失败:', error);
      return 0;
    }
  }

  /**
   * 检查规则名称在指定作用域内是否重复
   */
  async checkRuleNameDuplication(name: string, scope: 'chain' | 'global', chainId?: string): Promise<boolean> {
    try {
      const allRules = await exceptionRuleManager.getAllRules();
      
      if (scope === 'global') {
        // 检查全局规则中是否有重复
        return allRules.some(rule => 
          rule.scope === 'global' && 
          rule.name.toLowerCase() === name.toLowerCase()
        );
      } else if (scope === 'chain' && chainId) {
        // 检查指定链的规则中是否有重复
        return allRules.some(rule => 
          rule.scope === 'chain' && 
          rule.chainId === chainId && 
          rule.name.toLowerCase() === name.toLowerCase()
        );
      }
      
      return false;
    } catch (error) {
      console.error('检查规则名称重复失败:', error);
      return false;
    }
  }

  /**
   * 获取规则的作用域信息
   */
  getRuleScopeInfo(rule: ExceptionRule): { scope: string; description: string } {
    if (rule.scope === 'global') {
      return {
        scope: '全局',
        description: '可在所有任务中使用'
      };
    } else {
      return {
        scope: '链专属',
        description: '仅在当前任务中使用'
      };
    }
  }
}

// 导出单例实例
export const ruleScopeManager = new RuleScopeManager();