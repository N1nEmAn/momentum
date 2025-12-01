/**
 * 错误恢复管理器
 * 提供智能的错误恢复策略和用户友好的错误处理
 */

import { 
  ExceptionRule, 
  ExceptionRuleType,
  ExceptionRuleError, 
  ExceptionRuleException 
} from '../types';
import { exceptionRuleStorage } from './ExceptionRuleStorage';
import { ruleStateManager } from './RuleStateManager';
import { dataIntegrityChecker } from './DataIntegrityChecker';
import { enhancedDuplicationHandler } from './EnhancedDuplicationHandler';

export interface RecoveryStrategy {
  errorType: ExceptionRuleError;
  strategy: 'auto_fix' | 'user_choice' | 'fallback' | 'reset';
  priority: number;
  handler: (error: ExceptionRuleException, context: any) => Promise<RecoveryResult>;
}

export interface RecoveryResult {
  success: boolean;
  message: string;
  actions?: RecoveryAction[];
  recoveredData?: any;
  requiresUserAction?: boolean;
}

export interface RecoveryAction {
  id: string;
  label: string;
  description: string;
  type: 'primary' | 'secondary' | 'danger';
  handler: () => Promise<RecoveryResult>;
}

export interface RecoveryContext {
  errorType: ExceptionRuleError;
  originalOperation: string;
  operationData: any;
  timestamp: Date;
  retryCount: number;
}

export class ErrorRecoveryManager {
  private strategies = new Map<ExceptionRuleError, RecoveryStrategy[]>();
  private recoveryHistory: Array<{
    error: ExceptionRuleException;
    context: RecoveryContext;
    result: RecoveryResult;
    timestamp: Date;
  }> = [];

  constructor() {
    this.initializeDefaultStrategies();
  }

  /**
   * 注册恢复策略
   */
  registerRecoveryStrategy(strategy: RecoveryStrategy): void {
    if (!this.strategies.has(strategy.errorType)) {
      this.strategies.set(strategy.errorType, []);
    }
    
    const strategies = this.strategies.get(strategy.errorType)!;
    strategies.push(strategy);
    
    // 按优先级排序
    strategies.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 尝试错误恢复
   */
  async attemptRecovery(
    error: ExceptionRuleException, 
    context: any,
    originalOperation?: string
  ): Promise<RecoveryResult> {
    const recoveryContext: RecoveryContext = {
      errorType: error.type,
      originalOperation: originalOperation || 'unknown',
      operationData: context,
      timestamp: new Date(),
      retryCount: 0
    };

    console.log('开始错误恢复:', { error: error.message, type: error.type, context });

    try {
      const strategies = this.strategies.get(error.type) || [];
      
      if (strategies.length === 0) {
        return this.handleUnknownError(error, recoveryContext);
      }

      // 尝试每个策略
      for (const strategy of strategies) {
        try {
          const result = await strategy.handler(error, recoveryContext);
          
          // 记录恢复历史
          this.recoveryHistory.push({
            error,
            context: recoveryContext,
            result,
            timestamp: new Date()
          });

          if (result.success) {
            console.log('错误恢复成功:', result.message);
            return result;
          }

          // 如果需要用户操作，返回结果
          if (result.requiresUserAction) {
            return result;
          }

        } catch (strategyError) {
          console.error('恢复策略执行失败:', strategyError);
          continue;
        }
      }

      // 所有策略都失败了
      return this.handleRecoveryFailure(error, recoveryContext);

    } catch (recoveryError) {
      console.error('错误恢复过程失败:', recoveryError);
      return {
        success: false,
        message: '错误恢复过程失败',
        actions: [{
          id: 'manual_intervention',
          label: '手动处理',
          description: '需要手动解决此问题',
          type: 'danger',
          handler: async () => ({ success: false, message: '需要手动处理' })
        }]
      };
    }
  }

  /**
   * 提供用户选择的恢复选项
   */
  getRecoveryOptions(error: ExceptionRuleException): RecoveryAction[] {
    const actions: RecoveryAction[] = [];

    switch (error.type) {
      case ExceptionRuleError.RULE_NOT_FOUND:
        actions.push(
          {
            id: 'create_new_rule',
            label: '创建新规则',
            description: '创建一个新的规则来替代缺失的规则',
            type: 'primary',
            handler: async () => this.handleCreateNewRule(error)
          },
          {
            id: 'select_existing_rule',
            label: '选择现有规则',
            description: '从现有规则中选择一个',
            type: 'secondary',
            handler: async () => this.handleSelectExistingRule(error)
          }
        );
        break;

      case ExceptionRuleError.DUPLICATE_RULE_NAME:
        actions.push(
          {
            id: 'use_existing_rule',
            label: '使用现有规则',
            description: '使用已存在的同名规则',
            type: 'primary',
            handler: async () => this.handleUseExistingRule(error)
          },
          {
            id: 'rename_rule',
            label: '重命名规则',
            description: '为新规则生成一个不同的名称',
            type: 'secondary',
            handler: async () => this.handleRenameRule(error)
          }
        );
        break;

      case ExceptionRuleError.RULE_TYPE_MISMATCH:
        actions.push(
          {
            id: 'create_correct_type',
            label: '创建正确类型的规则',
            description: '创建一个类型匹配的新规则',
            type: 'primary',
            handler: async () => this.handleCreateCorrectType(error)
          },
          {
            id: 'select_matching_rule',
            label: '选择匹配的规则',
            description: '选择一个类型匹配的现有规则',
            type: 'secondary',
            handler: async () => this.handleSelectMatchingRule(error)
          }
        );
        break;

      case ExceptionRuleError.STORAGE_ERROR:
        actions.push(
          {
            id: 'retry_operation',
            label: '重试操作',
            description: '重新尝试执行操作',
            type: 'primary',
            handler: async () => this.handleRetryOperation(error)
          },
          {
            id: 'check_data_integrity',
            label: '检查数据完整性',
            description: '运行数据完整性检查和修复',
            type: 'secondary',
            handler: async () => this.handleDataIntegrityCheck(error)
          }
        );
        break;

      default:
        actions.push({
          id: 'generic_recovery',
          label: '尝试通用恢复',
          description: '执行通用的错误恢复流程',
          type: 'secondary',
          handler: async () => this.handleGenericRecovery(error)
        });
    }

    return actions;
  }

  /**
   * 初始化默认恢复策略
   */
  private initializeDefaultStrategies(): void {
    // 规则不存在的恢复策略
    this.registerRecoveryStrategy({
      errorType: ExceptionRuleError.RULE_NOT_FOUND,
      strategy: 'auto_fix',
      priority: 100,
      handler: async (error, context) => {
        // 尝试从临时规则中恢复
        const ruleId = this.extractRuleIdFromError(error);
        if (ruleId?.startsWith('temp_')) {
          try {
            const rule = await ruleStateManager.waitForRuleCreation(ruleId);
            return {
              success: true,
              message: '从临时规则恢复成功',
              recoveredData: rule
            };
          } catch {
            // 继续其他策略
          }
        }

        return {
          success: false,
          message: '无法自动恢复缺失的规则',
          requiresUserAction: true,
          actions: this.getRecoveryOptions(error)
        };
      }
    });

    // 重复规则名称的恢复策略
    this.registerRecoveryStrategy({
      errorType: ExceptionRuleError.DUPLICATE_RULE_NAME,
      strategy: 'user_choice',
      priority: 100,
      handler: async (error, context) => {
        return {
          success: false,
          message: '发现重复的规则名称',
          requiresUserAction: true,
          actions: this.getRecoveryOptions(error)
        };
      }
    });

    // 规则类型不匹配的恢复策略
    this.registerRecoveryStrategy({
      errorType: ExceptionRuleError.RULE_TYPE_MISMATCH,
      strategy: 'user_choice',
      priority: 100,
      handler: async (error, context) => {
        return {
          success: false,
          message: '规则类型与操作不匹配',
          requiresUserAction: true,
          actions: this.getRecoveryOptions(error)
        };
      }
    });

    // 存储错误的恢复策略
    this.registerRecoveryStrategy({
      errorType: ExceptionRuleError.STORAGE_ERROR,
      strategy: 'auto_fix',
      priority: 100,
      handler: async (error, context) => {
        // 尝试数据完整性检查
        try {
          const report = await dataIntegrityChecker.checkRuleDataIntegrity();
          const autoFixableIssues = report.issues.filter(issue => issue.autoFixable);
          
          if (autoFixableIssues.length > 0) {
            const fixResults = await dataIntegrityChecker.autoFixIssues(autoFixableIssues);
            const successCount = fixResults.filter(r => r.success).length;
            
            if (successCount > 0) {
              return {
                success: true,
                message: `已自动修复 ${successCount} 个数据问题`
              };
            }
          }
        } catch {
          // 继续其他策略
        }

        return {
          success: false,
          message: '存储错误需要手动处理',
          requiresUserAction: true,
          actions: this.getRecoveryOptions(error)
        };
      }
    });

    // 验证错误的恢复策略
    this.registerRecoveryStrategy({
      errorType: ExceptionRuleError.VALIDATION_ERROR,
      strategy: 'auto_fix',
      priority: 100,
      handler: async (error, context) => {
        return {
          success: false,
          message: '验证错误需要用户确认',
          requiresUserAction: true,
          actions: [{
            id: 'fix_validation',
            label: '修复验证问题',
            description: '尝试修复数据验证问题',
            type: 'primary',
            handler: async () => this.handleValidationFix(error)
          }]
        };
      }
    });
  }

  /**
   * 处理未知错误
   */
  private async handleUnknownError(
    error: ExceptionRuleException, 
    context: RecoveryContext
  ): Promise<RecoveryResult> {
    return {
      success: false,
      message: `未知错误类型: ${error.type}`,
      actions: [{
        id: 'generic_recovery',
        label: '通用恢复',
        description: '尝试通用的错误恢复方法',
        type: 'secondary',
        handler: async () => this.handleGenericRecovery(error)
      }]
    };
  }

  /**
   * 处理恢复失败
   */
  private async handleRecoveryFailure(
    error: ExceptionRuleException, 
    context: RecoveryContext
  ): Promise<RecoveryResult> {
    return {
      success: false,
      message: '所有自动恢复策略都失败了',
      actions: [
        {
          id: 'manual_intervention',
          label: '手动处理',
          description: '需要手动解决此问题',
          type: 'danger',
          handler: async () => ({ success: false, message: '需要手动处理' })
        },
        {
          id: 'reset_system',
          label: '重置系统',
          description: '重置规则系统到初始状态',
          type: 'danger',
          handler: async () => this.handleSystemReset(error)
        }
      ]
    };
  }

  /**
   * 恢复操作处理器
   */
  private async handleCreateNewRule(error: ExceptionRuleException): Promise<RecoveryResult> {
    // 这里应该触发创建新规则的UI流程
    return {
      success: false,
      message: '请创建新规则',
      requiresUserAction: true
    };
  }

  private async handleSelectExistingRule(error: ExceptionRuleException): Promise<RecoveryResult> {
    // 这里应该显示现有规则选择界面
    return {
      success: false,
      message: '请选择现有规则',
      requiresUserAction: true
    };
  }

  private async handleUseExistingRule(error: ExceptionRuleException): Promise<RecoveryResult> {
    try {
      const existingRules = error.details?.existingRules || [];
      if (existingRules.length > 0) {
        return {
          success: true,
          message: '使用现有规则',
          recoveredData: existingRules[0]
        };
      }
    } catch {
      // 继续
    }

    return {
      success: false,
      message: '无法找到可用的现有规则'
    };
  }

  private async handleRenameRule(error: ExceptionRuleException): Promise<RecoveryResult> {
    try {
      const ruleName = this.extractRuleNameFromError(error);
      if (ruleName) {
        const suggestions = enhancedDuplicationHandler.generateNameSuggestions(
          ruleName, 
          []
        );
        
        if (suggestions.length > 0) {
          return {
            success: true,
            message: `建议使用名称: ${suggestions[0]}`,
            recoveredData: { suggestedName: suggestions[0] }
          };
        }
      }
    } catch {
      // 继续
    }

    return {
      success: false,
      message: '无法生成新的规则名称'
    };
  }

  private async handleCreateCorrectType(error: ExceptionRuleException): Promise<RecoveryResult> {
    return {
      success: false,
      message: '请创建正确类型的规则',
      requiresUserAction: true
    };
  }

  private async handleSelectMatchingRule(error: ExceptionRuleException): Promise<RecoveryResult> {
    return {
      success: false,
      message: '请选择类型匹配的规则',
      requiresUserAction: true
    };
  }

  private async handleRetryOperation(error: ExceptionRuleException): Promise<RecoveryResult> {
    // 简单的重试逻辑
    return {
      success: false,
      message: '请重试操作',
      requiresUserAction: true
    };
  }

  private async handleDataIntegrityCheck(error: ExceptionRuleException): Promise<RecoveryResult> {
    try {
      const report = await dataIntegrityChecker.checkRuleDataIntegrity();
      
      if (report.issues.length === 0) {
        return {
          success: true,
          message: '数据完整性检查通过'
        };
      }

      const autoFixableCount = report.issues.filter(i => i.autoFixable).length;
      return {
        success: false,
        message: `发现 ${report.issues.length} 个问题，其中 ${autoFixableCount} 个可自动修复`,
        actions: [{
          id: 'auto_fix_issues',
          label: '自动修复',
          description: '自动修复可修复的问题',
          type: 'primary',
          handler: async () => {
            const fixResults = await dataIntegrityChecker.autoFixIssues(
              report.issues.filter(i => i.autoFixable)
            );
            const successCount = fixResults.filter(r => r.success).length;
            return {
              success: successCount > 0,
              message: `已修复 ${successCount} 个问题`
            };
          }
        }]
      };

    } catch (checkError) {
      return {
        success: false,
        message: '数据完整性检查失败'
      };
    }
  }

  private async handleGenericRecovery(error: ExceptionRuleException): Promise<RecoveryResult> {
    // 通用恢复逻辑
    try {
      // 尝试同步规则状态
      await ruleStateManager.syncRuleStates();
      
      return {
        success: true,
        message: '已同步规则状态'
      };
    } catch {
      return {
        success: false,
        message: '通用恢复失败'
      };
    }
  }

  private async handleValidationFix(error: ExceptionRuleException): Promise<RecoveryResult> {
    return {
      success: false,
      message: '验证修复需要用户输入',
      requiresUserAction: true
    };
  }

  private async handleSystemReset(error: ExceptionRuleException): Promise<RecoveryResult> {
    return {
      success: false,
      message: '系统重置是危险操作，需要用户确认',
      requiresUserAction: true
    };
  }

  /**
   * 辅助方法
   */
  private extractRuleIdFromError(error: ExceptionRuleException): string | null {
    const message = error.message;
    const match = message.match(/规则 ID (\w+)/);
    return match ? match[1] : null;
  }

  private extractRuleNameFromError(error: ExceptionRuleException): string | null {
    const message = error.message;
    const match = message.match(/规则名称 "([^"]+)"/);
    return match ? match[1] : null;
  }

  /**
   * 获取恢复历史
   */
  getRecoveryHistory(): typeof this.recoveryHistory {
    return [...this.recoveryHistory];
  }

  /**
   * 清除恢复历史
   */
  clearRecoveryHistory(): void {
    this.recoveryHistory = [];
  }
}

// 创建全局实例
export const errorRecoveryManager = new ErrorRecoveryManager();