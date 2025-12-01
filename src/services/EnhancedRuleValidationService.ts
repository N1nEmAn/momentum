/**
 * 增强的规则验证服务
 * 提供更强大的规则验证、预验证和批量验证功能
 */

import { 
  ExceptionRule, 
  ExceptionRuleType, 
  ExceptionRuleError, 
  ExceptionRuleException 
} from '../types';
import { exceptionRuleStorage } from './ExceptionRuleStorage';

export interface RuleValidationResult {
  isValid: boolean;
  errorType?: ExceptionRuleError;
  errorMessage?: string;
  suggestedActions?: ValidationAction[];
  debugInfo?: any;
}

export interface ValidationAction {
  type: 'retry' | 'create_new' | 'use_existing' | 'fix_data';
  label: string;
  description: string;
  handler: () => Promise<void>;
}

export interface ValidationReport {
  totalRules: number;
  validRules: number;
  invalidRules: ValidationIssue[];
  summary: string;
}

export interface ValidationIssue {
  ruleId: string;
  ruleName: string;
  issue: string;
  severity: 'critical' | 'warning' | 'info';
  fixable: boolean;
}

export type ActionType = 'pause' | 'early_completion';

export class EnhancedRuleValidationService {
  private validationCache = new Map<string, { result: RuleValidationResult; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

  /**
   * 修复规则类型验证逻辑
   */
  validateRuleTypeForAction(rule: ExceptionRule, actionType: ActionType): RuleValidationResult {
    try {
      // 基础验证
      if (!rule) {
        return {
          isValid: false,
          errorType: ExceptionRuleError.RULE_NOT_FOUND,
          errorMessage: '规则对象为空',
          debugInfo: { rule, actionType }
        };
      }

      if (!rule.type) {
        return {
          isValid: false,
          errorType: ExceptionRuleError.INVALID_RULE_TYPE,
          errorMessage: `规则 "${rule.name}" 缺少类型定义`,
          suggestedActions: [{
            type: 'fix_data',
            label: '修复规则类型',
            description: '为规则设置正确的类型',
            handler: async () => {
              // 这里可以实现自动修复逻辑
            }
          }],
          debugInfo: { rule, actionType }
        };
      }

      // 类型匹配验证
      const isValidType = this.isValidRuleType(rule.type);
      if (!isValidType) {
        return {
          isValid: false,
          errorType: ExceptionRuleError.INVALID_RULE_TYPE,
          errorMessage: `规则 "${rule.name}" 的类型 "${rule.type}" 无效`,
          debugInfo: { rule, actionType, validTypes: Object.values(ExceptionRuleType) }
        };
      }

      // 操作类型验证
      const isValidAction = this.isValidActionType(actionType);
      if (!isValidAction) {
        return {
          isValid: false,
          errorType: ExceptionRuleError.VALIDATION_ERROR,
          errorMessage: `操作类型 "${actionType}" 无效`,
          debugInfo: { rule, actionType, validActions: ['pause', 'early_completion'] }
        };
      }

      // 匹配验证
      const matches = this.checkTypeActionMatch(rule.type, actionType);
      if (!matches) {
        const ruleTypeName = this.getRuleTypeDisplayName(rule.type);
        const actionName = this.getActionTypeDisplayName(actionType);
        
        return {
          isValid: false,
          errorType: ExceptionRuleError.RULE_TYPE_MISMATCH,
          errorMessage: `规则 "${rule.name}" 是${ruleTypeName}类型，不能用于${actionName}操作`,
          suggestedActions: this.getSuggestedActionsForMismatch(rule, actionType),
          debugInfo: { rule, actionType, ruleTypeName, actionName }
        };
      }

      return {
        isValid: true,
        debugInfo: { rule, actionType, match: true }
      };

    } catch (error) {
      return {
        isValid: false,
        errorType: ExceptionRuleError.VALIDATION_ERROR,
        errorMessage: `验证过程中发生错误: ${error instanceof Error ? error.message : '未知错误'}`,
        debugInfo: { rule, actionType, error }
      };
    }
  }

  /**
   * 预验证规则可用性
   */
  async preValidateRuleUsage(ruleId: string, actionType: ActionType): Promise<RuleValidationResult> {
    const cacheKey = `${ruleId}_${actionType}`;
    
    // 检查缓存
    const cached = this.validationCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.result;
    }

    try {
      // 获取规则
      const rule = await exceptionRuleStorage.getRuleById(ruleId);
      
      if (!rule) {
        const result: RuleValidationResult = {
          isValid: false,
          errorType: ExceptionRuleError.RULE_NOT_FOUND,
          errorMessage: `规则 ID ${ruleId} 不存在`,
          suggestedActions: [{
            type: 'create_new',
            label: '创建新规则',
            description: '创建一个新的规则来替代缺失的规则',
            handler: async () => {
              // 创建新规则的逻辑
            }
          }],
          debugInfo: { ruleId, actionType }
        };
        
        this.validationCache.set(cacheKey, { result, timestamp: Date.now() });
        return result;
      }

      // 检查规则是否激活
      if (!rule.isActive) {
        const result: RuleValidationResult = {
          isValid: false,
          errorType: ExceptionRuleError.RULE_NOT_FOUND,
          errorMessage: `规则 "${rule.name}" 已被删除或停用`,
          suggestedActions: [{
            type: 'use_existing',
            label: '选择其他规则',
            description: '选择一个激活的规则',
            handler: async () => {
              // 显示规则选择界面
            }
          }],
          debugInfo: { rule, actionType }
        };
        
        this.validationCache.set(cacheKey, { result, timestamp: Date.now() });
        return result;
      }

      // 验证类型匹配
      const typeValidation = this.validateRuleTypeForAction(rule, actionType);
      
      // 缓存结果
      this.validationCache.set(cacheKey, { result: typeValidation, timestamp: Date.now() });
      
      return typeValidation;

    } catch (error) {
      const result: RuleValidationResult = {
        isValid: false,
        errorType: ExceptionRuleError.STORAGE_ERROR,
        errorMessage: `预验证失败: ${error instanceof Error ? error.message : '未知错误'}`,
        debugInfo: { ruleId, actionType, error }
      };
      
      return result;
    }
  }

  /**
   * 批量验证规则完整性
   */
  async validateRulesIntegrity(rules?: ExceptionRule[]): Promise<ValidationReport> {
    try {
      const rulesToValidate = rules || await exceptionRuleStorage.getRules();
      const issues: ValidationIssue[] = [];
      let validCount = 0;

      for (const rule of rulesToValidate) {
        const ruleIssues = this.validateSingleRuleIntegrity(rule);
        if (ruleIssues.length === 0) {
          validCount++;
        } else {
          issues.push(...ruleIssues);
        }
      }

      const summary = `验证了 ${rulesToValidate.length} 个规则，${validCount} 个有效，${issues.length} 个问题`;

      return {
        totalRules: rulesToValidate.length,
        validRules: validCount,
        invalidRules: issues,
        summary
      };

    } catch (error) {
      throw new ExceptionRuleException(
        ExceptionRuleError.VALIDATION_ERROR,
        `批量验证失败: ${error instanceof Error ? error.message : '未知错误'}`,
        error
      );
    }
  }

  /**
   * 验证单个规则的完整性
   */
  private validateSingleRuleIntegrity(rule: ExceptionRule): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // 检查必需字段
    if (!rule.id) {
      issues.push({
        ruleId: rule.id || 'unknown',
        ruleName: rule.name || 'unnamed',
        issue: '缺少规则ID',
        severity: 'critical',
        fixable: true
      });
    }

    if (!rule.name || rule.name.trim().length === 0) {
      issues.push({
        ruleId: rule.id,
        ruleName: rule.name || 'unnamed',
        issue: '规则名称为空',
        severity: 'critical',
        fixable: false
      });
    }

    if (!rule.type) {
      issues.push({
        ruleId: rule.id,
        ruleName: rule.name,
        issue: '缺少规则类型',
        severity: 'critical',
        fixable: true
      });
    } else if (!this.isValidRuleType(rule.type)) {
      issues.push({
        ruleId: rule.id,
        ruleName: rule.name,
        issue: `无效的规则类型: ${rule.type}`,
        severity: 'critical',
        fixable: true
      });
    }

    // 检查创建时间
    if (!rule.createdAt) {
      issues.push({
        ruleId: rule.id,
        ruleName: rule.name,
        issue: '缺少创建时间',
        severity: 'warning',
        fixable: true
      });
    }

    // 检查使用计数
    if (typeof rule.usageCount !== 'number' || rule.usageCount < 0) {
      issues.push({
        ruleId: rule.id,
        ruleName: rule.name,
        issue: '使用计数无效',
        severity: 'warning',
        fixable: true
      });
    }

    return issues;
  }

  /**
   * 检查规则类型和操作类型是否匹配
   */
  private checkTypeActionMatch(ruleType: ExceptionRuleType, actionType: ActionType): boolean {
    switch (actionType) {
      case 'pause':
        return ruleType === ExceptionRuleType.PAUSE_ONLY;
      case 'early_completion':
        return ruleType === ExceptionRuleType.EARLY_COMPLETION_ONLY;
      default:
        return false;
    }
  }

  /**
   * 获取类型不匹配时的建议操作
   */
  private getSuggestedActionsForMismatch(rule: ExceptionRule, actionType: ActionType): ValidationAction[] {
    const correctType = actionType === 'pause' 
      ? ExceptionRuleType.PAUSE_ONLY 
      : ExceptionRuleType.EARLY_COMPLETION_ONLY;
    
    const actionName = this.getActionTypeDisplayName(actionType);

    return [
      {
        type: 'create_new',
        label: `创建${actionName}规则`,
        description: `创建一个新的${actionName}类型规则`,
        handler: async () => {
          // 创建新规则的逻辑
        }
      },
      {
        type: 'use_existing',
        label: `选择${actionName}规则`,
        description: `从现有的${actionName}规则中选择`,
        handler: async () => {
          // 显示匹配类型的规则列表
        }
      }
    ];
  }

  /**
   * 检查规则类型是否有效
   */
  private isValidRuleType(type: string): type is ExceptionRuleType {
    return Object.values(ExceptionRuleType).includes(type as ExceptionRuleType);
  }

  /**
   * 检查操作类型是否有效
   */
  private isValidActionType(actionType: string): actionType is ActionType {
    return actionType === 'pause' || actionType === 'early_completion';
  }

  /**
   * 获取规则类型的显示名称
   */
  private getRuleTypeDisplayName(type: ExceptionRuleType): string {
    switch (type) {
      case ExceptionRuleType.PAUSE_ONLY:
        return '暂停';
      case ExceptionRuleType.EARLY_COMPLETION_ONLY:
        return '提前完成';
      default:
        return '未知类型';
    }
  }

  /**
   * 获取操作类型的显示名称
   */
  private getActionTypeDisplayName(actionType: ActionType): string {
    switch (actionType) {
      case 'pause':
        return '暂停';
      case 'early_completion':
        return '提前完成';
      default:
        return '未知操作';
    }
  }

  /**
   * 清除验证缓存
   */
  clearValidationCache(): void {
    this.validationCache.clear();
  }

  /**
   * 清除过期的缓存条目
   */
  cleanupExpiredCache(): void {
    const now = Date.now();
    for (const [key, value] of this.validationCache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.validationCache.delete(key);
      }
    }
  }
}

// 创建全局实例
export const enhancedRuleValidationService = new EnhancedRuleValidationService();