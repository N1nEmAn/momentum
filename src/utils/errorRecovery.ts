/**
 * 错误恢复工具
 * 提供自动重试、错误恢复和用户友好的错误处理
 */

import { ExceptionRuleError, ExceptionRuleException } from '../types';

interface RetryOptions {
  maxAttempts?: number;
  delay?: number;
  backoffMultiplier?: number;
  maxDelay?: number;
  shouldRetry?: (error: any, attempt: number) => boolean;
  onRetry?: (error: any, attempt: number) => void;
}

interface ErrorRecoveryAction {
  label: string;
  action: () => Promise<void> | void;
  primary?: boolean;
}

interface ErrorInfo {
  error: any;
  context: string;
  timestamp: number;
  userAgent: string;
  url: string;
  userId?: string;
}

export class ErrorRecoveryManager {
  private static readonly MAX_ERROR_HISTORY = 50;
  private static readonly ERROR_HISTORY_KEY = 'momentum_error_history';
  
  private errorHistory: ErrorInfo[] = [];

  constructor() {
    this.loadErrorHistory();
  }

  /**
   * 带重试的异步操作执行
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      maxAttempts = 3,
      delay = 1000,
      backoffMultiplier = 2,
      maxDelay = 10000,
      shouldRetry = this.defaultShouldRetry,
      onRetry
    } = options;

    let lastError: any;
    let currentDelay = delay;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        // 检查是否应该重试
        if (attempt === maxAttempts || !shouldRetry(error, attempt)) {
          throw error;
        }

        // 通知重试回调
        onRetry?.(error, attempt);

        // 等待后重试
        await this.delay(currentDelay);
        currentDelay = Math.min(currentDelay * backoffMultiplier, maxDelay);
      }
    }

    throw lastError;
  }

  /**
   * 处理和记录错误
   */
  handleError(error: any, context: string): {
    userMessage: string;
    technicalMessage: string;
    recoveryActions: ErrorRecoveryAction[];
    shouldReport: boolean;
  } {
    // 记录错误
    this.recordError(error, context);

    // 分析错误类型
    if (error instanceof ExceptionRuleException) {
      return this.handleExceptionRuleError(error);
    }

    if (error instanceof TypeError && error.message.includes('fetch')) {
      return this.handleNetworkError(error);
    }

    if (error.name === 'QuotaExceededError') {
      return this.handleStorageError(error);
    }

    // 默认错误处理
    return this.handleGenericError(error);
  }

  /**
   * 获取用户友好的错误消息
   */
  getUserFriendlyMessage(error: any): string {
    if (error instanceof ExceptionRuleException) {
      switch (error.type) {
        case ExceptionRuleError.DUPLICATE_RULE_NAME:
          return '规则名称已存在，请使用不同的名称';
        case ExceptionRuleError.RULE_NOT_FOUND:
          return '找不到指定的规则，可能已被删除';
        case ExceptionRuleError.RULE_TYPE_MISMATCH:
          return '规则类型不匹配当前操作';
        case ExceptionRuleError.STORAGE_ERROR:
          return '数据保存失败，请检查存储空间';
        case ExceptionRuleError.VALIDATION_ERROR:
          return '输入的数据格式不正确';
        default:
          return '操作失败，请稍后重试';
      }
    }

    if (error.message?.includes('fetch') || error.message?.includes('network')) {
      return '网络连接失败，请检查网络设置';
    }

    if (error.name === 'QuotaExceededError') {
      return '存储空间不足，请清理浏览器数据';
    }

    return '发生未知错误，请稍后重试';
  }

  /**
   * 获取错误恢复建议
   */
  getRecoveryActions(error: any, context: string): ErrorRecoveryAction[] {
    const actions: ErrorRecoveryAction[] = [];

    if (error instanceof ExceptionRuleException) {
      switch (error.type) {
        case ExceptionRuleError.DUPLICATE_RULE_NAME:
          actions.push({
            label: '使用建议的名称',
            action: () => {
              // 这里应该触发使用建议名称的逻辑
            },
            primary: true
          });
          break;

        case ExceptionRuleError.RULE_NOT_FOUND:
          actions.push({
            label: '刷新规则列表',
            action: async () => {
              // 刷新规则列表
              window.location.reload();
            },
            primary: true
          });
          break;

        case ExceptionRuleError.STORAGE_ERROR:
          actions.push({
            label: '清理存储空间',
            action: async () => {
              await this.clearStorageSpace();
            }
          });
          break;
      }
    }

    // 通用恢复操作
    actions.push({
      label: '重试操作',
      action: () => {
        // 这里应该重新执行失败的操作
      },
      primary: actions.length === 0
    });

    actions.push({
      label: '刷新页面',
      action: () => {
        window.location.reload();
      }
    });

    return actions;
  }

  /**
   * 自动恢复尝试
   */
  async attemptAutoRecovery(error: any, context: string): Promise<boolean> {
    try {
      if (error instanceof ExceptionRuleException) {
        switch (error.type) {
          case ExceptionRuleError.STORAGE_ERROR:
            // 尝试清理存储空间
            await this.clearStorageSpace();
            return true;

          case ExceptionRuleError.RULE_NOT_FOUND:
            // 尝试刷新缓存
            if (typeof window !== 'undefined' && 'caches' in window) {
              await caches.delete('momentum-cache');
            }
            return true;
        }
      }

      // 网络错误的自动恢复
      if (error.message?.includes('fetch')) {
        // 等待一段时间后重试
        await this.delay(2000);
        return true;
      }

      return false;
    } catch (recoveryError) {
      console.warn('自动恢复失败:', recoveryError);
      return false;
    }
  }

  /**
   * 获取错误历史
   */
  getErrorHistory(): ErrorInfo[] {
    return [...this.errorHistory].reverse();
  }

  /**
   * 清除错误历史
   */
  clearErrorHistory(): void {
    this.errorHistory = [];
    this.saveErrorHistory();
  }

  /**
   * 导出错误报告
   */
  exportErrorReport(): string {
    const report = {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      errors: this.errorHistory,
      summary: {
        totalErrors: this.errorHistory.length,
        recentErrors: this.errorHistory.filter(e => 
          Date.now() - e.timestamp < 24 * 60 * 60 * 1000
        ).length,
        commonErrors: this.getCommonErrors()
      }
    };

    return JSON.stringify(report, null, 2);
  }

  /**
   * 默认重试判断逻辑
   */
  private defaultShouldRetry = (error: any, attempt: number): boolean => {
    // 不重试的错误类型
    if (error instanceof ExceptionRuleException) {
      switch (error.type) {
        case ExceptionRuleError.DUPLICATE_RULE_NAME:
        case ExceptionRuleError.VALIDATION_ERROR:
        case ExceptionRuleError.RULE_TYPE_MISMATCH:
          return false; // 这些错误重试无意义
        default:
          return true;
      }
    }

    // 网络错误可以重试
    if (error.message?.includes('fetch') || error.message?.includes('network')) {
      return true;
    }

    // 存储错误可以重试一次
    if (error.name === 'QuotaExceededError') {
      return attempt === 1;
    }

    // 其他错误默认重试
    return true;
  };

  /**
   * 处理例外规则错误
   */
  private handleExceptionRuleError(error: ExceptionRuleException) {
    return {
      userMessage: this.getUserFriendlyMessage(error),
      technicalMessage: `${error.type}: ${error.message}`,
      recoveryActions: this.getRecoveryActions(error, 'exception_rule'),
      shouldReport: error.type === ExceptionRuleError.STORAGE_ERROR
    };
  }

  /**
   * 处理网络错误
   */
  private handleNetworkError(error: Error) {
    return {
      userMessage: '网络连接失败，请检查网络设置后重试',
      technicalMessage: error.message,
      recoveryActions: [
        {
          label: '重试连接',
          action: () => window.location.reload(),
          primary: true
        },
        {
          label: '检查网络设置',
          action: () => {
            // 打开网络设置指导
          }
        }
      ],
      shouldReport: false
    };
  }

  /**
   * 处理存储错误
   */
  private handleStorageError(error: Error) {
    return {
      userMessage: '存储空间不足，请清理浏览器数据后重试',
      technicalMessage: error.message,
      recoveryActions: [
        {
          label: '清理存储空间',
          action: async () => {
            await this.clearStorageSpace();
          },
          primary: true
        },
        {
          label: '查看存储使用情况',
          action: () => {
            // 显示存储使用情况
          }
        }
      ],
      shouldReport: true
    };
  }

  /**
   * 处理通用错误
   */
  private handleGenericError(error: Error) {
    return {
      userMessage: '发生未知错误，请稍后重试',
      technicalMessage: error.message || error.toString(),
      recoveryActions: [
        {
          label: '重试操作',
          action: () => window.location.reload(),
          primary: true
        },
        {
          label: '报告问题',
          action: () => {
            // 打开问题报告界面
          }
        }
      ],
      shouldReport: true
    };
  }

  /**
   * 记录错误
   */
  private recordError(error: any, context: string): void {
    const errorInfo: ErrorInfo = {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        type: error.type || 'unknown'
      },
      context,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    this.errorHistory.push(errorInfo);

    // 限制历史记录数量
    if (this.errorHistory.length > ErrorRecoveryManager.MAX_ERROR_HISTORY) {
      this.errorHistory.shift();
    }

    this.saveErrorHistory();
  }

  /**
   * 清理存储空间
   */
  private async clearStorageSpace(): Promise<void> {
    try {
      // 清理过期的缓存数据
      const keys = Object.keys(localStorage);
      const expiredKeys = keys.filter(key => {
        try {
          const data = localStorage.getItem(key);
          if (data) {
            const parsed = JSON.parse(data);
            if (parsed.timestamp && Date.now() - parsed.timestamp > 30 * 24 * 60 * 60 * 1000) {
              return true; // 30天前的数据
            }
          }
        } catch {
          return true; // 无法解析的数据
        }
        return false;
      });

      for (const key of expiredKeys) {
        localStorage.removeItem(key);
      }

      // 清理浏览器缓存
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      }
    } catch (error) {
      console.warn('清理存储空间失败:', error);
    }
  }

  /**
   * 获取常见错误统计
   */
  private getCommonErrors(): Array<{ type: string; count: number }> {
    const errorCounts = new Map<string, number>();

    for (const errorInfo of this.errorHistory) {
      const errorType = errorInfo.error.type || errorInfo.error.name || 'unknown';
      errorCounts.set(errorType, (errorCounts.get(errorType) || 0) + 1);
    }

    return Array.from(errorCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 加载错误历史
   */
  private loadErrorHistory(): void {
    try {
      const data = localStorage.getItem(ErrorRecoveryManager.ERROR_HISTORY_KEY);
      if (data) {
        this.errorHistory = JSON.parse(data);
      }
    } catch (error) {
      console.warn('加载错误历史失败:', error);
      this.errorHistory = [];
    }
  }

  /**
   * 保存错误历史
   */
  private saveErrorHistory(): void {
    try {
      localStorage.setItem(
        ErrorRecoveryManager.ERROR_HISTORY_KEY,
        JSON.stringify(this.errorHistory)
      );
    } catch (error) {
      console.warn('保存错误历史失败:', error);
    }
  }
}

// 创建全局实例
export const errorRecoveryManager = new ErrorRecoveryManager();