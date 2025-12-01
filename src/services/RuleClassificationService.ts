/**
 * 规则分类管理服务
 * 处理例外规则的分类、筛选和类型验证
 */

import { ExceptionRule, ExceptionRuleType, ExceptionRuleError, ExceptionRuleException, EnhancedExceptionRuleException } from '../types';
import { exceptionRuleStorage } from './ExceptionRuleStorage';
import { enhancedRuleValidationService } from './EnhancedRuleValidationService';

export class RuleClassificationService {
  /**
   * 根据类型获取规则
   */
  async getRulesByType(type: ExceptionRuleType): Promise<ExceptionRule[]> {
    return await exceptionRuleStorage.getRulesByType(type);
  }

  /**
   * 获取所有规则并按类型分组
   */
  async getRulesGroupedByType(): Promise<Record<ExceptionRuleType, ExceptionRule[]>> {
    const allRules = await exceptionRuleStorage.getRules();
    const activeRules = allRules.filter(rule => rule.isActive);
    
    const grouped: Record<ExceptionRuleType, ExceptionRule[]> = {
      [ExceptionRuleType.PAUSE_ONLY]: [],
      [ExceptionRuleType.EARLY_COMPLETION_ONLY]: []
    };
    
    for (const rule of activeRules) {
      grouped[rule.type].push(rule);
    }
    
    // 按使用频率和最近使用时间排序
    for (const type in grouped) {
      grouped[type as ExceptionRuleType].sort((a, b) => {
        // 首先按使用次数排序
        if (a.usageCount !== b.usageCount) {
          return b.usageCount - a.usageCount;
        }
        
        // 然后按最近使用时间排序
        if (a.lastUsedAt && b.lastUsedAt) {
          return b.lastUsedAt.getTime() - a.lastUsedAt.getTime();
        }
        
        if (a.lastUsedAt && !b.lastUsedAt) return -1;
        if (!a.lastUsedAt && b.lastUsedAt) return 1;
        
        // 最后按创建时间排序
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
    }
    
    return grouped;
  }

  /**
   * 验证规则类型是否匹配指定操作
   */
  validateRuleTypeForAction(rule: ExceptionRule, actionType: 'pause' | 'early_completion'): boolean {
    // 添加调试日志
    console.log(`验证规则类型匹配: 规则="${rule.name}", 规则类型="${rule.type}", 操作类型="${actionType}"`);
    
    // 确保规则类型有效
    if (!rule.type) {
      console.error(`规则 "${rule.name}" 缺少类型定义`);
      return false;
    }
    
    switch (actionType) {
      case 'pause':
        const pauseMatch = rule.type === ExceptionRuleType.PAUSE_ONLY;
        console.log(`暂停操作匹配结果: ${pauseMatch}`);
        return pauseMatch;
      case 'early_completion':
        const completionMatch = rule.type === ExceptionRuleType.EARLY_COMPLETION_ONLY;
        console.log(`提前完成操作匹配结果: ${completionMatch}`);
        return completionMatch;
      default:
        console.error(`未知的操作类型: ${actionType}`);
        return false;
    }
  }

  /**
   * 获取适用于指定操作的规则
   */
  async getRulesForAction(actionType: 'pause' | 'early_completion'): Promise<ExceptionRule[]> {
    const targetType = actionType === 'pause' 
      ? ExceptionRuleType.PAUSE_ONLY 
      : ExceptionRuleType.EARLY_COMPLETION_ONLY;
    
    return await this.getRulesByType(targetType);
  }

  /**
   * 验证规则是否可以用于指定操作，如果不可以则抛出异常（增强版本）
   */
  async validateRuleForAction(ruleId: string, actionType: 'pause' | 'early_completion'): Promise<void> {
    try {
      // 首先获取规则
      const rule = await exceptionRuleStorage.getRuleById(ruleId);
      
      if (!rule) {
        throw EnhancedExceptionRuleException.createUserFriendly(
          ExceptionRuleError.RULE_NOT_FOUND,
          '找不到指定的规则，可能已被删除',
          `规则 ID ${ruleId} 不存在`,
          { ruleId, actionType }
        ).addSuggestedAction('创建新规则').addSuggestedAction('选择其他规则');
      }
      
      if (!rule.isActive) {
        throw EnhancedExceptionRuleException.createUserFriendly(
          ExceptionRuleError.RULE_NOT_FOUND,
          '规则已被删除或停用',
          `规则 "${rule.name}" 已被删除`,
          { rule, actionType }
        ).addSuggestedAction('选择其他规则').addSuggestedAction('恢复规则');
      }

      // 检查规则类型是否存在
      if (!rule.type) {
        // 尝试自动修复
        const fixResult = await this.fixRuleTypeIssues(ruleId);
        if (fixResult.fixed) {
          console.log('已自动修复规则类型问题:', fixResult.actions);
          // 重新获取规则
          const fixedRule = await exceptionRuleStorage.getRuleById(ruleId);
          if (fixedRule && fixedRule.type) {
            rule.type = fixedRule.type;
          }
        } else {
          throw EnhancedExceptionRuleException.createUserFriendly(
            ExceptionRuleError.INVALID_RULE_TYPE,
            '规则类型缺失，无法使用',
            `规则 "${rule.name}" 缺少类型定义`,
            { rule, actionType }
          ).addSuggestedAction('修复规则类型').addSuggestedAction('选择其他规则');
        }
      }
      
      // 类型匹配验证
      const isValidForAction = this.validateRuleTypeForAction(rule, actionType);
      
      if (!isValidForAction) {
        const actionName = actionType === 'pause' ? '暂停' : '提前完成';
        const typeName = rule.type === ExceptionRuleType.PAUSE_ONLY ? '暂停' : '提前完成';
        
        throw EnhancedExceptionRuleException.createUserFriendly(
          ExceptionRuleError.RULE_TYPE_MISMATCH,
          `规则类型与操作不匹配`,
          `规则 "${rule.name}" 是${typeName}类型，不能用于${actionName}操作`,
          { rule, actionType, expectedType: actionName, actualType: typeName }
        ).addSuggestedAction(`创建${actionName}类型的规则`).addSuggestedAction(`选择${actionName}类型的规则`);
      }

      console.log(`规则验证通过: ${ruleId} 可用于 ${actionType} 操作`);

    } catch (error) {
      if (error instanceof EnhancedExceptionRuleException) {
        throw error;
      }

      // 处理其他错误
      throw EnhancedExceptionRuleException.createUserFriendly(
        ExceptionRuleError.VALIDATION_ERROR,
        '规则验证过程中发生错误',
        error instanceof Error ? error.message : '未知错误',
        { ruleId, actionType, error }
      ).addSuggestedAction('重试操作').addSuggestedAction('选择其他规则');
    }
  }

  /**
   * 修复规则类型问题
   */
  async fixRuleTypeIssues(ruleId: string): Promise<{
    fixed: boolean;
    issues: string[];
    actions: string[];
  }> {
    try {
      const rule = await exceptionRuleStorage.getRuleById(ruleId);
      const issues: string[] = [];
      const actions: string[] = [];
      let fixed = false;

      if (!rule) {
        return {
          fixed: false,
          issues: ['规则不存在'],
          actions: ['创建新规则']
        };
      }

      // 检查规则类型
      if (!rule.type) {
        issues.push('规则缺少类型定义');
        // 自动修复：设置默认类型
        rule.type = ExceptionRuleType.PAUSE_ONLY;
        await exceptionRuleStorage.updateRule(ruleId, { type: rule.type });
        actions.push('已设置默认类型为暂停');
        fixed = true;
      } else if (!Object.values(ExceptionRuleType).includes(rule.type)) {
        issues.push(`规则类型无效: ${rule.type}`);
        // 自动修复：设置为有效类型
        rule.type = ExceptionRuleType.PAUSE_ONLY;
        await exceptionRuleStorage.updateRule(ruleId, { type: rule.type });
        actions.push('已修复为有效的规则类型');
        fixed = true;
      }

      // 检查其他必需字段
      if (!rule.name || rule.name.trim().length === 0) {
        issues.push('规则名称为空');
        actions.push('需要设置规则名称');
      }

      if (!rule.createdAt) {
        issues.push('缺少创建时间');
        rule.createdAt = new Date();
        await exceptionRuleStorage.updateRule(ruleId, { createdAt: rule.createdAt });
        actions.push('已设置创建时间');
        fixed = true;
      }

      if (typeof rule.usageCount !== 'number' || rule.usageCount < 0) {
        issues.push('使用计数无效');
        rule.usageCount = 0;
        await exceptionRuleStorage.updateRule(ruleId, { usageCount: rule.usageCount });
        actions.push('已重置使用计数');
        fixed = true;
      }

      return { fixed, issues, actions };

    } catch (error) {
      return {
        fixed: false,
        issues: ['修复过程中发生错误'],
        actions: ['需要手动检查规则数据']
      };
    }
  }

  /**
   * 建议规则类型转换
   */
  async suggestRuleTypeChange(ruleId: string, desiredAction: 'pause' | 'early_completion'): Promise<string> {
    const rule = await exceptionRuleStorage.getRuleById(ruleId);
    
    if (!rule) {
      return '规则不存在，无法提供建议';
    }
    
    const currentTypeName = rule.type === ExceptionRuleType.PAUSE_ONLY ? '暂停' : '提前完成';
    const desiredTypeName = desiredAction === 'pause' ? '暂停' : '提前完成';
    
    if (this.validateRuleTypeForAction(rule, desiredAction)) {
      return '规则类型已经匹配，无需更改';
    }
    
    return `规则 "${rule.name}" 当前只能用于${currentTypeName}操作。如需用于${desiredTypeName}操作，请创建新规则或修改现有规则类型。`;
  }

  /**
   * 获取规则类型统计信息
   */
  async getRuleTypeStats(): Promise<{
    total: number;
    pauseOnly: number;
    earlyCompletionOnly: number;
    mostUsedType: ExceptionRuleType | null;
    leastUsedType: ExceptionRuleType | null;
  }> {
    const grouped = await this.getRulesGroupedByType();
    
    const pauseCount = grouped[ExceptionRuleType.PAUSE_ONLY].length;
    const completionCount = grouped[ExceptionRuleType.EARLY_COMPLETION_ONLY].length;
    const total = pauseCount + completionCount;
    
    let mostUsedType: ExceptionRuleType | null = null;
    let leastUsedType: ExceptionRuleType | null = null;
    
    if (total > 0) {
      if (pauseCount > completionCount) {
        mostUsedType = ExceptionRuleType.PAUSE_ONLY;
        leastUsedType = ExceptionRuleType.EARLY_COMPLETION_ONLY;
      } else if (completionCount > pauseCount) {
        mostUsedType = ExceptionRuleType.EARLY_COMPLETION_ONLY;
        leastUsedType = ExceptionRuleType.PAUSE_ONLY;
      } else {
        // 数量相等时，比较使用频率
        const pauseUsage = grouped[ExceptionRuleType.PAUSE_ONLY].reduce((sum, rule) => sum + rule.usageCount, 0);
        const completionUsage = grouped[ExceptionRuleType.EARLY_COMPLETION_ONLY].reduce((sum, rule) => sum + rule.usageCount, 0);
        
        if (pauseUsage > completionUsage) {
          mostUsedType = ExceptionRuleType.PAUSE_ONLY;
          leastUsedType = ExceptionRuleType.EARLY_COMPLETION_ONLY;
        } else if (completionUsage > pauseUsage) {
          mostUsedType = ExceptionRuleType.EARLY_COMPLETION_ONLY;
          leastUsedType = ExceptionRuleType.PAUSE_ONLY;
        }
      }
    }
    
    return {
      total,
      pauseOnly: pauseCount,
      earlyCompletionOnly: completionCount,
      mostUsedType,
      leastUsedType
    };
  }

  /**
   * 获取推荐的规则类型（基于用户使用习惯）
   */
  async getRecommendedRuleType(basedOnUsage: boolean = true): Promise<ExceptionRuleType> {
    if (!basedOnUsage) {
      // 默认推荐暂停类型（更常用）
      return ExceptionRuleType.PAUSE_ONLY;
    }
    
    const stats = await this.getRuleTypeStats();
    
    // 如果有明显的偏好，推荐最常用的类型
    if (stats.mostUsedType) {
      return stats.mostUsedType;
    }
    
    // 否则推荐暂停类型
    return ExceptionRuleType.PAUSE_ONLY;
  }

  /**
   * 搜索规则（支持按名称和类型筛选）
   */
  async searchRules(query: string, type?: ExceptionRuleType): Promise<ExceptionRule[]> {
    let rules: ExceptionRule[];
    
    if (type) {
      rules = await this.getRulesByType(type);
    } else {
      const allRules = await exceptionRuleStorage.getRules();
      rules = allRules.filter(rule => rule.isActive);
    }
    
    if (!query.trim()) {
      return rules;
    }
    
    const normalizedQuery = query.toLowerCase().trim();
    
    return rules.filter(rule => {
      const nameMatch = rule.name.toLowerCase().includes(normalizedQuery);
      const descriptionMatch = rule.description?.toLowerCase().includes(normalizedQuery) || false;
      
      return nameMatch || descriptionMatch;
    }).sort((a, b) => {
      // 优先显示名称匹配的结果
      const aNameMatch = a.name.toLowerCase().includes(normalizedQuery);
      const bNameMatch = b.name.toLowerCase().includes(normalizedQuery);
      
      if (aNameMatch && !bNameMatch) return -1;
      if (!aNameMatch && bNameMatch) return 1;
      
      // 然后按使用频率排序
      return b.usageCount - a.usageCount;
    });
  }

  /**
   * 获取规则类型的显示名称
   */
  getRuleTypeDisplayName(type: ExceptionRuleType): string {
    switch (type) {
      case ExceptionRuleType.PAUSE_ONLY:
        return '仅暂停';
      case ExceptionRuleType.EARLY_COMPLETION_ONLY:
        return '仅提前完成';
      default:
        return '未知类型';
    }
  }

  /**
   * 获取操作类型的显示名称
   */
  getActionTypeDisplayName(actionType: 'pause' | 'early_completion'): string {
    switch (actionType) {
      case 'pause':
        return '暂停计时';
      case 'early_completion':
        return '提前完成';
      default:
        return '未知操作';
    }
  }

  /**
   * 检查规则类型是否有效
   */
  isValidRuleType(type: string): type is ExceptionRuleType {
    return Object.values(ExceptionRuleType).includes(type as ExceptionRuleType);
  }

  /**
   * 检查操作类型是否有效
   */
  isValidActionType(actionType: string): actionType is 'pause' | 'early_completion' {
    return actionType === 'pause' || actionType === 'early_completion';
  }

  /**
   * 获取规则使用建议
   */
  async getRuleUsageSuggestions(actionType: 'pause' | 'early_completion'): Promise<{
    mostUsed: ExceptionRule[];
    recentlyUsed: ExceptionRule[];
    suggested: ExceptionRule[];
  }> {
    const rules = await this.getRulesForAction(actionType);
    
    // 最常用的规则（按使用次数排序）
    const mostUsed = [...rules]
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 3);
    
    // 最近使用的规则
    const recentlyUsed = [...rules]
      .filter(rule => rule.lastUsedAt)
      .sort((a, b) => (b.lastUsedAt?.getTime() || 0) - (a.lastUsedAt?.getTime() || 0))
      .slice(0, 3);
    
    // 建议的规则（综合考虑使用频率和最近使用时间）
    const suggested = [...rules]
      .sort((a, b) => {
        const aScore = this.calculateRuleScore(a);
        const bScore = this.calculateRuleScore(b);
        return bScore - aScore;
      })
      .slice(0, 5);
    
    return {
      mostUsed,
      recentlyUsed,
      suggested
    };
  }

  /**
   * 计算规则推荐分数
   */
  private calculateRuleScore(rule: ExceptionRule): number {
    let score = 0;
    
    // 使用频率权重 (40%)
    score += rule.usageCount * 0.4;
    
    // 最近使用时间权重 (30%)
    if (rule.lastUsedAt) {
      const daysSinceLastUse = (Date.now() - rule.lastUsedAt.getTime()) / (1000 * 60 * 60 * 24);
      score += Math.max(0, 30 - daysSinceLastUse) * 0.3;
    }
    
    // 规则创建时间权重 (20%) - 较新的规则得分稍高
    const daysSinceCreation = (Date.now() - rule.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    score += Math.max(0, 365 - daysSinceCreation) / 365 * 20 * 0.2;
    
    // 规则名称长度权重 (10%) - 较短的名称得分稍高（更简洁）
    const nameLength = rule.name.length;
    score += Math.max(0, 50 - nameLength) / 50 * 10 * 0.1;
    
    return score;
  }
}

// 创建全局实例
export const ruleClassificationService = new RuleClassificationService();