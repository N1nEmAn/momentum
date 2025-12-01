/**
 * 用户反馈处理器
 * 提供用户友好的错误信息显示和操作反馈
 */

import { 
  ExceptionRuleError, 
  ExceptionRuleException 
} from '../types';
import { errorRecoveryManager, RecoveryAction } from './ErrorRecoveryManager';

export interface FeedbackMessage {
  id: string;
  type: 'error' | 'warning' | 'info' | 'success' | 'loading';
  title: string;
  message: string;
  actions?: FeedbackAction[];
  persistent?: boolean;
  autoHide?: boolean;
  duration?: number;
  timestamp: Date;
}

export interface FeedbackAction {
  id: string;
  label: string;
  type: 'primary' | 'secondary' | 'danger';
  handler: () => void | Promise<void>;
}

export interface ProgressInfo {
  operation: string;
  progress?: number;
  message?: string;
  isIndeterminate?: boolean;
}

export class UserFeedbackHandler {
  private messages = new Map<string, FeedbackMessage>();
  private messageListeners: Array<(messages: FeedbackMessage[]) => void> = [];
  private progressListeners: Array<(progress: ProgressInfo | null) => void> = [];
  private currentProgress: ProgressInfo | null = null;
  private messageIdCounter = 0;

  /**
   * 显示用户友好的错误信息
   */
  showErrorMessage(error: ExceptionRuleException, context?: any): string {
    const messageId = this.generateMessageId();
    const userFriendlyMessage = this.getUserFriendlyMessage(error);
    const recoveryActions = errorRecoveryManager.getRecoveryOptions(error);

    const feedbackMessage: FeedbackMessage = {
      id: messageId,
      type: 'error',
      title: this.getErrorTitle(error.type),
      message: userFriendlyMessage,
      actions: this.convertRecoveryActionsToFeedbackActions(recoveryActions),
      persistent: true,
      timestamp: new Date()
    };

    this.addMessage(feedbackMessage);
    return messageId;
  }

  /**
   * 显示警告信息
   */
  showWarning(title: string, message: string, actions?: FeedbackAction[]): string {
    const messageId = this.generateMessageId();
    
    const feedbackMessage: FeedbackMessage = {
      id: messageId,
      type: 'warning',
      title,
      message,
      actions,
      autoHide: true,
      duration: 8000,
      timestamp: new Date()
    };

    this.addMessage(feedbackMessage);
    return messageId;
  }

  /**
   * 显示信息提示
   */
  showInfo(title: string, message: string, autoHide: boolean = true): string {
    const messageId = this.generateMessageId();
    
    const feedbackMessage: FeedbackMessage = {
      id: messageId,
      type: 'info',
      title,
      message,
      autoHide,
      duration: autoHide ? 5000 : undefined,
      timestamp: new Date()
    };

    this.addMessage(feedbackMessage);
    return messageId;
  }

  /**
   * 显示成功信息
   */
  showSuccess(title: string, message: string, autoHide: boolean = true): string {
    const messageId = this.generateMessageId();
    
    const feedbackMessage: FeedbackMessage = {
      id: messageId,
      type: 'success',
      title,
      message,
      autoHide,
      duration: autoHide ? 3000 : undefined,
      timestamp: new Date()
    };

    this.addMessage(feedbackMessage);
    return messageId;
  }

  /**
   * 显示恢复选项
   */
  async showRecoveryOptions(options: RecoveryAction[]): Promise<RecoveryAction | null> {
    return new Promise((resolve) => {
      const messageId = this.generateMessageId();
      
      const actions: FeedbackAction[] = options.map(option => ({
        id: option.id,
        label: option.label,
        type: option.type,
        handler: async () => {
          this.removeMessage(messageId);
          resolve(option);
        }
      }));

      // 添加取消选项
      actions.push({
        id: 'cancel',
        label: '取消',
        type: 'secondary',
        handler: () => {
          this.removeMessage(messageId);
          resolve(null);
        }
      });

      const feedbackMessage: FeedbackMessage = {
        id: messageId,
        type: 'warning',
        title: '选择恢复操作',
        message: '请选择如何处理这个问题：',
        actions,
        persistent: true,
        timestamp: new Date()
      };

      this.addMessage(feedbackMessage);
    });
  }

  /**
   * 显示操作进度
   */
  showProgress(operation: string, progress?: number, message?: string): void {
    this.currentProgress = {
      operation,
      progress,
      message,
      isIndeterminate: progress === undefined
    };

    this.notifyProgressListeners();
  }

  /**
   * 隐藏进度指示器
   */
  hideProgress(): void {
    this.currentProgress = null;
    this.notifyProgressListeners();
  }

  /**
   * 更新进度
   */
  updateProgress(progress: number, message?: string): void {
    if (this.currentProgress) {
      this.currentProgress.progress = progress;
      if (message) {
        this.currentProgress.message = message;
      }
      this.notifyProgressListeners();
    }
  }

  /**
   * 清除指定消息
   */
  removeMessage(messageId: string): void {
    if (this.messages.has(messageId)) {
      this.messages.delete(messageId);
      this.notifyMessageListeners();
    }
  }

  /**
   * 清除所有消息
   */
  clearMessages(): void {
    this.messages.clear();
    this.notifyMessageListeners();
  }

  /**
   * 清除指定类型的消息
   */
  clearMessagesByType(type: FeedbackMessage['type']): void {
    for (const [id, message] of this.messages.entries()) {
      if (message.type === type) {
        this.messages.delete(id);
      }
    }
    this.notifyMessageListeners();
  }

  /**
   * 获取所有消息
   */
  getAllMessages(): FeedbackMessage[] {
    return Array.from(this.messages.values()).sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );
  }

  /**
   * 订阅消息变化
   */
  onMessagesChange(listener: (messages: FeedbackMessage[]) => void): () => void {
    this.messageListeners.push(listener);
    
    // 立即调用一次
    listener(this.getAllMessages());
    
    // 返回取消订阅函数
    return () => {
      const index = this.messageListeners.indexOf(listener);
      if (index > -1) {
        this.messageListeners.splice(index, 1);
      }
    };
  }

  /**
   * 订阅进度变化
   */
  onProgressChange(listener: (progress: ProgressInfo | null) => void): () => void {
    this.progressListeners.push(listener);
    
    // 立即调用一次
    listener(this.currentProgress);
    
    // 返回取消订阅函数
    return () => {
      const index = this.progressListeners.indexOf(listener);
      if (index > -1) {
        this.progressListeners.splice(index, 1);
      }
    };
  }

  /**
   * 获取用户友好的错误信息
   */
  private getUserFriendlyMessage(error: ExceptionRuleException): string {
    switch (error.type) {
      case ExceptionRuleError.RULE_NOT_FOUND:
        return this.formatRuleNotFoundMessage(error);
      
      case ExceptionRuleError.DUPLICATE_RULE_NAME:
        return this.formatDuplicateNameMessage(error);
      
      case ExceptionRuleError.RULE_TYPE_MISMATCH:
        return this.formatTypeMismatchMessage(error);
      
      case ExceptionRuleError.INVALID_RULE_TYPE:
        return '规则类型无效，请检查规则设置';
      
      case ExceptionRuleError.VALIDATION_ERROR:
        return `输入验证失败：${error.message}`;
      
      case ExceptionRuleError.STORAGE_ERROR:
        return '数据保存失败，请检查网络连接或重试';
      
      default:
        return error.message || '发生了未知错误';
    }
  }

  /**
   * 格式化规则不存在的错误信息
   */
  private formatRuleNotFoundMessage(error: ExceptionRuleException): string {
    const message = error.message;
    
    if (message.includes('ID')) {
      return '所选的规则不存在，可能已被删除。请选择其他规则或创建新规则。';
    }
    
    return '规则不存在或已被删除，请选择其他规则或创建新规则。';
  }

  /**
   * 格式化重复名称的错误信息
   */
  private formatDuplicateNameMessage(error: ExceptionRuleException): string {
    const existingRules = error.details?.existingRules || [];
    
    if (existingRules.length > 0) {
      return `规则名称已存在。您可以使用现有规则或为新规则选择不同的名称。`;
    }
    
    return '规则名称已存在，请选择不同的名称或使用现有规则。';
  }

  /**
   * 格式化类型不匹配的错误信息
   */
  private formatTypeMismatchMessage(error: ExceptionRuleException): string {
    const message = error.message;
    
    // 提取规则类型和操作类型
    const ruleTypeMatch = message.match(/是(\w+)类型/);
    const actionTypeMatch = message.match(/不能用于(\w+)操作/);
    
    if (ruleTypeMatch && actionTypeMatch) {
      const ruleType = ruleTypeMatch[1];
      const actionType = actionTypeMatch[1];
      
      return `所选规则是${ruleType}类型，不能用于${actionType}操作。请选择${actionType}类型的规则或创建新的${actionType}规则。`;
    }
    
    return '规则类型与当前操作不匹配，请选择正确类型的规则。';
  }

  /**
   * 获取错误标题
   */
  private getErrorTitle(errorType: ExceptionRuleError): string {
    switch (errorType) {
      case ExceptionRuleError.RULE_NOT_FOUND:
        return '规则不存在';
      case ExceptionRuleError.DUPLICATE_RULE_NAME:
        return '规则名称重复';
      case ExceptionRuleError.RULE_TYPE_MISMATCH:
        return '规则类型不匹配';
      case ExceptionRuleError.INVALID_RULE_TYPE:
        return '规则类型无效';
      case ExceptionRuleError.VALIDATION_ERROR:
        return '输入验证失败';
      case ExceptionRuleError.STORAGE_ERROR:
        return '数据保存失败';
      default:
        return '操作失败';
    }
  }

  /**
   * 转换恢复操作为反馈操作
   */
  private convertRecoveryActionsToFeedbackActions(recoveryActions: RecoveryAction[]): FeedbackAction[] {
    return recoveryActions.map(action => ({
      id: action.id,
      label: action.label,
      type: action.type,
      handler: async () => {
        try {
          this.showProgress(action.description);
          const result = await action.handler();
          this.hideProgress();
          
          if (result.success) {
            this.showSuccess('操作成功', result.message);
          } else {
            this.showWarning('操作未完成', result.message);
          }
        } catch (error) {
          this.hideProgress();
          this.showErrorMessage(
            error instanceof ExceptionRuleException 
              ? error 
              : new ExceptionRuleException(
                  ExceptionRuleError.STORAGE_ERROR,
                  error instanceof Error ? error.message : '操作失败'
                )
          );
        }
      }
    }));
  }

  /**
   * 生成消息ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${++this.messageIdCounter}`;
  }

  /**
   * 添加消息
   */
  private addMessage(message: FeedbackMessage): void {
    this.messages.set(message.id, message);
    
    // 设置自动隐藏
    if (message.autoHide && message.duration) {
      setTimeout(() => {
        this.removeMessage(message.id);
      }, message.duration);
    }
    
    this.notifyMessageListeners();
  }

  /**
   * 通知消息监听器
   */
  private notifyMessageListeners(): void {
    const messages = this.getAllMessages();
    this.messageListeners.forEach(listener => {
      try {
        listener(messages);
      } catch (error) {
        console.error('消息监听器错误:', error);
      }
    });
  }

  /**
   * 通知进度监听器
   */
  private notifyProgressListeners(): void {
    this.progressListeners.forEach(listener => {
      try {
        listener(this.currentProgress);
      } catch (error) {
        console.error('进度监听器错误:', error);
      }
    });
  }

  /**
   * 显示确认对话框
   */
  async showConfirmation(
    title: string, 
    message: string, 
    confirmLabel: string = '确认',
    cancelLabel: string = '取消'
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const messageId = this.generateMessageId();
      
      const actions: FeedbackAction[] = [
        {
          id: 'confirm',
          label: confirmLabel,
          type: 'primary',
          handler: () => {
            this.removeMessage(messageId);
            resolve(true);
          }
        },
        {
          id: 'cancel',
          label: cancelLabel,
          type: 'secondary',
          handler: () => {
            this.removeMessage(messageId);
            resolve(false);
          }
        }
      ];

      const feedbackMessage: FeedbackMessage = {
        id: messageId,
        type: 'warning',
        title,
        message,
        actions,
        persistent: true,
        timestamp: new Date()
      };

      this.addMessage(feedbackMessage);
    });
  }

  /**
   * 批量操作反馈
   */
  showBatchOperationFeedback(
    operation: string,
    total: number,
    success: number,
    failed: number,
    errors?: string[]
  ): string {
    const title = `${operation}完成`;
    let message = `总计 ${total} 项，成功 ${success} 项`;
    
    if (failed > 0) {
      message += `，失败 ${failed} 项`;
    }

    const actions: FeedbackAction[] = [];
    
    if (errors && errors.length > 0) {
      actions.push({
        id: 'show_errors',
        label: '查看错误详情',
        type: 'secondary',
        handler: () => {
          this.showInfo('错误详情', errors.join('\n'), false);
        }
      });
    }

    const messageType: FeedbackMessage['type'] = failed > 0 ? 'warning' : 'success';
    
    return this.addMessageAndReturn({
      id: this.generateMessageId(),
      type: messageType,
      title,
      message,
      actions: actions.length > 0 ? actions : undefined,
      autoHide: true,
      duration: 8000,
      timestamp: new Date()
    });
  }

  /**
   * 添加消息并返回ID
   */
  private addMessageAndReturn(message: FeedbackMessage): string {
    this.addMessage(message);
    return message.id;
  }
}

// 创建全局实例
export const userFeedbackHandler = new UserFeedbackHandler();