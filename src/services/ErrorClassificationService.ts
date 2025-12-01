/**
 * 错误分类服务
 * 对错误进行分类、优先级排序和智能处理建议
 */

import { 
  ExceptionRuleError, 
  ExceptionRuleException,
  EnhancedExceptionRuleException
} from '../types';

export interface ErrorClassification {
  category: 'user_error' | 'system_error' | 'data_error' | 'network_error';
  severity: 'low' | 'medium' | 'high' | 'critical';
  priority: number;
  recoverable: boolean;
  userFriendly: boolean;
  requiresImmedateAction: boolean;
}

export interface ErrorPattern {
  type: ExceptionRuleError;
  keywords: string[];
  classification: ErrorClassification;
  commonCauses: string[];
  recommendedActions: string[];
}

export interface ErrorAnalysis {
  error: ExceptionRuleException;
  classification: ErrorClassification;
  pattern?: ErrorPattern;
  confidence: number;
  recommendations: string[];
  relatedErrors: ExceptionRuleException[];
}

export class ErrorClassificationService {
  private errorPatterns: Map<ExceptionRuleError, ErrorPattern> = new Map();
  private errorHistory: ExceptionRuleException[] = [];
  private readonly MAX_HISTORY_SIZE = 100;

  constructor() {
    this.initializeErrorPatterns();
  }

  /**
   * 分析错误
   */
  analyzeError(error: ExceptionRuleException): ErrorAnalysis {
    const pattern = this.errorPatterns.get(error.type);
    const classification = this.classifyError(error);
    const confidence = this.calculateConfidence(error, pattern);
    const recommendations = this.generateRecommendations(error, pattern);
    const relatedErrors = this.findRelatedErrors(error);

    // 记录错误历史
    this.recordError(error);

    return {
      error,
      classification,
      pattern,
      confidence,
      recommendations,
      relatedErrors
    };
  }

  /**
   * 对错误进行分类
   */
  classifyError(error: ExceptionRuleException): ErrorClassification {
    const pattern = this.errorPatterns.get(error.type);
    
    if (pattern) {
      return pattern.classification;
    }

    // 默认分类逻辑
    return this.getDefaultClassification(error.type);
  }

  /**
   * 批量分析错误
   */
  analyzeErrors(errors: ExceptionRuleException[]): {
    analyses: ErrorAnalysis[];
    summary: {
      totalErrors: number;
      criticalErrors: number;
      recoverableErrors: number;
      mostCommonType: ExceptionRuleError | null;
      prioritizedErrors: ErrorAnalysis[];
    };
  } {
    const analyses = errors.map(error => this.analyzeError(error));
    
    // 统计信息
    const criticalErrors = analyses.filter(a => a.classification.severity === 'critical').length;
    const recoverableErrors = analyses.filter(a => a.classification.recoverable).length;
    
    // 找出最常见的错误类型
    const typeCount = new Map<ExceptionRuleError, number>();
    analyses.forEach(a => {
      const count = typeCount.get(a.error.type) || 0;
      typeCount.set(a.error.type, count + 1);
    });
    
    let mostCommonType: ExceptionRuleError | null = null;
    let maxCount = 0;
    for (const [type, count] of typeCount) {
      if (count > maxCount) {
        maxCount = count;
        mostCommonType = type;
      }
    }

    // 按优先级排序
    const prioritizedErrors = [...analyses].sort((a, b) => 
      b.classification.priority - a.classification.priority
    );

    return {
      analyses,
      summary: {
        totalErrors: errors.length,
        criticalErrors,
        recoverableErrors,
        mostCommonType,
        prioritizedErrors
      }
    };
  }

  /**
   * 创建增强的错误实例
   */
  createEnhancedError(
    type: ExceptionRuleError,
    message: string,
    context?: any
  ): EnhancedExceptionRuleException {
    const classification = this.getDefaultClassification(type);
    const pattern = this.errorPatterns.get(type);
    
    return new EnhancedExceptionRuleException(
      type,
      message,
      context,
      classification.recoverable,
      pattern?.recommendedActions || [],
      classification.severity,
      this.generateUserFriendlyMessage(type, message),
      { originalMessage: message }
    );
  }

  /**
   * 获取错误趋势分析
   */
  getErrorTrends(): {
    recentErrors: ExceptionRuleException[];
    errorFrequency: Map<ExceptionRuleError, number>;
    timeDistribution: Map<string, number>;
    severityDistribution: Map<string, number>;
  } {
    const recentErrors = this.errorHistory.slice(-20);
    const errorFrequency = new Map<ExceptionRuleError, number>();
    const timeDistribution = new Map<string, number>();
    const severityDistribution = new Map<string, number>();

    for (const error of this.errorHistory) {
      // 错误频率
      const count = errorFrequency.get(error.type) || 0;
      errorFrequency.set(error.type, count + 1);

      // 时间分布（按小时）
      const hour = new Date().getHours().toString();
      const timeCount = timeDistribution.get(hour) || 0;
      timeDistribution.set(hour, timeCount + 1);

      // 严重程度分布
      const classification = this.classifyError(error);
      const severityCount = severityDistribution.get(classification.severity) || 0;
      severityDistribution.set(classification.severity, severityCount + 1);
    }

    return {
      recentErrors,
      errorFrequency,
      timeDistribution,
      severityDistribution
    };
  }

  /**
   * 初始化错误模式
   */
  private initializeErrorPatterns(): void {
    // 规则不存在
    this.errorPatterns.set(ExceptionRuleError.RULE_NOT_FOUND, {
      type: ExceptionRuleError.RULE_NOT_FOUND,
      keywords: ['不存在', 'ID', '缺失'],
      classification: {
        category: 'data_error',
        severity: 'medium',
        priority: 70,
        recoverable: true,
        userFriendly: true,
        requiresImmedateAction: false
      },
      commonCauses: [
        '规则被意外删除',
        '数据同步问题',
        '临时规则创建失败',
        '缓存不一致'
      ],
      recommendedActions: [
        '创建新规则',
        '选择现有规则',
        '检查数据完整性',
        '刷新规则列表'
      ]
    });

    // 重复规则名称
    this.errorPatterns.set(ExceptionRuleError.DUPLICATE_RULE_NAME, {
      type: ExceptionRuleError.DUPLICATE_RULE_NAME,
      keywords: ['重复', '已存在', '名称'],
      classification: {
        category: 'user_error',
        severity: 'low',
        priority: 30,
        recoverable: true,
        userFriendly: true,
        requiresImmedateAction: false
      },
      commonCauses: [
        '用户输入了已存在的规则名称',
        '规则同步导致重复',
        '导入数据包含重复项'
      ],
      recommendedActions: [
        '使用现有规则',
        '修改规则名称',
        '合并重复规则'
      ]
    });

    // 规则类型不匹配
    this.errorPatterns.set(ExceptionRuleError.RULE_TYPE_MISMATCH, {
      type: ExceptionRuleError.RULE_TYPE_MISMATCH,
      keywords: ['类型', '不匹配', '操作'],
      classification: {
        category: 'user_error',
        severity: 'medium',
        priority: 50,
        recoverable: true,
        userFriendly: true,
        requiresImmedateAction: false
      },
      commonCauses: [
        '选择了错误类型的规则',
        '规则类型设置错误',
        '操作类型识别错误'
      ],
      recommendedActions: [
        '选择正确类型的规则',
        '创建匹配类型的规则',
        '修改规则类型'
      ]
    });

    // 存储错误
    this.errorPatterns.set(ExceptionRuleError.STORAGE_ERROR, {
      type: ExceptionRuleError.STORAGE_ERROR,
      keywords: ['存储', '保存', '数据库'],
      classification: {
        category: 'system_error',
        severity: 'high',
        priority: 80,
        recoverable: true,
        userFriendly: false,
        requiresImmedateAction: true
      },
      commonCauses: [
        '磁盘空间不足',
        '数据库连接问题',
        '权限不足',
        '数据损坏'
      ],
      recommendedActions: [
        '检查存储空间',
        '重试操作',
        '检查数据完整性',
        '联系技术支持'
      ]
    });

    // 数据完整性错误
    this.errorPatterns.set(ExceptionRuleError.DATA_INTEGRITY_ERROR, {
      type: ExceptionRuleError.DATA_INTEGRITY_ERROR,
      keywords: ['完整性', '数据', '损坏'],
      classification: {
        category: 'data_error',
        severity: 'high',
        priority: 85,
        recoverable: true,
        userFriendly: false,
        requiresImmedateAction: true
      },
      commonCauses: [
        '数据文件损坏',
        '并发修改冲突',
        '系统异常关闭',
        '版本不兼容'
      ],
      recommendedActions: [
        '运行数据修复',
        '从备份恢复',
        '重建数据索引',
        '联系技术支持'
      ]
    });

    // 网络错误
    this.errorPatterns.set(ExceptionRuleError.NETWORK_ERROR, {
      type: ExceptionRuleError.NETWORK_ERROR,
      keywords: ['网络', '连接', '超时'],
      classification: {
        category: 'network_error',
        severity: 'medium',
        priority: 60,
        recoverable: true,
        userFriendly: true,
        requiresImmedateAction: false
      },
      commonCauses: [
        '网络连接不稳定',
        '服务器响应超时',
        '防火墙阻止',
        'DNS解析问题'
      ],
      recommendedActions: [
        '检查网络连接',
        '重试操作',
        '切换网络',
        '联系网络管理员'
      ]
    });
  }

  /**
   * 获取默认分类
   */
  private getDefaultClassification(type: ExceptionRuleError): ErrorClassification {
    switch (type) {
      case ExceptionRuleError.RULE_NOT_FOUND:
      case ExceptionRuleError.DATA_INTEGRITY_ERROR:
      case ExceptionRuleError.RULE_STATE_INCONSISTENT:
        return {
          category: 'data_error',
          severity: 'medium',
          priority: 60,
          recoverable: true,
          userFriendly: true,
          requiresImmedateAction: false
        };

      case ExceptionRuleError.DUPLICATE_RULE_NAME:
      case ExceptionRuleError.VALIDATION_ERROR:
      case ExceptionRuleError.RULE_TYPE_MISMATCH:
        return {
          category: 'user_error',
          severity: 'low',
          priority: 30,
          recoverable: true,
          userFriendly: true,
          requiresImmedateAction: false
        };

      case ExceptionRuleError.STORAGE_ERROR:
      case ExceptionRuleError.OPERATION_TIMEOUT:
      case ExceptionRuleError.CONCURRENT_MODIFICATION:
        return {
          category: 'system_error',
          severity: 'high',
          priority: 80,
          recoverable: true,
          userFriendly: false,
          requiresImmedateAction: true
        };

      case ExceptionRuleError.NETWORK_ERROR:
        return {
          category: 'network_error',
          severity: 'medium',
          priority: 50,
          recoverable: true,
          userFriendly: true,
          requiresImmedateAction: false
        };

      default:
        return {
          category: 'system_error',
          severity: 'medium',
          priority: 50,
          recoverable: true,
          userFriendly: false,
          requiresImmedateAction: false
        };
    }
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(error: ExceptionRuleException, pattern?: ErrorPattern): number {
    if (!pattern) return 0.5;

    let confidence = 0.7; // 基础置信度

    // 检查关键词匹配
    const message = error.message.toLowerCase();
    const matchedKeywords = pattern.keywords.filter(keyword => 
      message.includes(keyword.toLowerCase())
    );
    
    confidence += (matchedKeywords.length / pattern.keywords.length) * 0.3;

    return Math.min(confidence, 1.0);
  }

  /**
   * 生成建议
   */
  private generateRecommendations(error: ExceptionRuleException, pattern?: ErrorPattern): string[] {
    const recommendations: string[] = [];

    if (pattern) {
      recommendations.push(...pattern.recommendedActions);
    }

    // 基于错误类型的通用建议
    const classification = this.classifyError(error);
    
    if (classification.severity === 'critical') {
      recommendations.unshift('立即联系技术支持');
    }

    if (classification.recoverable) {
      recommendations.push('尝试重新执行操作');
    }

    return [...new Set(recommendations)]; // 去重
  }

  /**
   * 查找相关错误
   */
  private findRelatedErrors(error: ExceptionRuleException): ExceptionRuleException[] {
    return this.errorHistory
      .filter(e => 
        e.type === error.type || 
        e.message.includes(error.message.split(' ')[0])
      )
      .slice(-5); // 最近5个相关错误
  }

  /**
   * 记录错误
   */
  private recordError(error: ExceptionRuleException): void {
    this.errorHistory.push(error);
    
    // 限制历史记录大小
    if (this.errorHistory.length > this.MAX_HISTORY_SIZE) {
      this.errorHistory = this.errorHistory.slice(-this.MAX_HISTORY_SIZE);
    }
  }

  /**
   * 生成用户友好的消息
   */
  private generateUserFriendlyMessage(type: ExceptionRuleError, message: string): string {
    const pattern = this.errorPatterns.get(type);
    
    if (pattern && pattern.classification.userFriendly) {
      switch (type) {
        case ExceptionRuleError.RULE_NOT_FOUND:
          return '找不到指定的规则，可能已被删除或移动';
        case ExceptionRuleError.DUPLICATE_RULE_NAME:
          return '规则名称已存在，请选择不同的名称';
        case ExceptionRuleError.RULE_TYPE_MISMATCH:
          return '所选规则类型与当前操作不匹配';
        case ExceptionRuleError.VALIDATION_ERROR:
          return '输入的信息不符合要求，请检查后重试';
        case ExceptionRuleError.NETWORK_ERROR:
          return '网络连接出现问题，请检查网络后重试';
        default:
          return message;
      }
    }
    
    return message;
  }

  /**
   * 清除错误历史
   */
  clearErrorHistory(): void {
    this.errorHistory = [];
  }

  /**
   * 获取错误统计
   */
  getErrorStatistics(): {
    totalErrors: number;
    errorsByType: Map<ExceptionRuleError, number>;
    errorsBySeverity: Map<string, number>;
    errorsByCategory: Map<string, number>;
  } {
    const errorsByType = new Map<ExceptionRuleError, number>();
    const errorsBySeverity = new Map<string, number>();
    const errorsByCategory = new Map<string, number>();

    for (const error of this.errorHistory) {
      // 按类型统计
      const typeCount = errorsByType.get(error.type) || 0;
      errorsByType.set(error.type, typeCount + 1);

      // 按严重程度统计
      const classification = this.classifyError(error);
      const severityCount = errorsBySeverity.get(classification.severity) || 0;
      errorsBySeverity.set(classification.severity, severityCount + 1);

      // 按分类统计
      const categoryCount = errorsByCategory.get(classification.category) || 0;
      errorsByCategory.set(classification.category, categoryCount + 1);
    }

    return {
      totalErrors: this.errorHistory.length,
      errorsByType,
      errorsBySeverity,
      errorsByCategory
    };
  }
}

// 创建全局实例
export const errorClassificationService = new ErrorClassificationService();