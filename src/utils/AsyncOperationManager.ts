/**
 * 异步操作管理器
 * 优化耗时操作，提供乐观更新和错误恢复
 */

interface AsyncOperation<T = any> {
  id: string;
  operation: () => Promise<T>;
  timeout?: number;
  retryCount?: number;
  onSuccess?: (result: T) => void;
  onError?: (error: Error) => void;
  onRetry?: (attempt: number) => void;
}

interface OptimisticUpdate<T = any> {
  id: string;
  operation: () => Promise<T>;
  optimisticValue: T;
  updateUI: (value: T) => void;
  rollback: () => void;
  timeout?: number;
  retryCount?: number;
}

interface OperationState<T = any> {
  id: string;
  status: 'pending' | 'success' | 'error' | 'cancelled';
  result?: T;
  error?: Error;
  attempts: number;
  startTime: number;
}

export class AsyncOperationManager {
  private operations = new Map<string, OperationState>();
  private operationQueue: AsyncOperation[] = [];
  private pendingOperations = new Map<string, Promise<any>>();
  private isProcessing = false;
  private maxConcurrent = 3;
  private defaultTimeout = 5000;
  private defaultRetryCount = 2;

  /**
   * 执行单个异步操作
   */
  async executeOperation<T>(operation: AsyncOperation<T>): Promise<T> {
    const operationState: OperationState<T> = {
      id: operation.id,
      status: 'pending',
      attempts: 0,
      startTime: Date.now()
    };

    this.operations.set(operation.id, operationState);

    try {
      const result = await this.executeWithRetry(operation);
      operationState.status = 'success';
      operationState.result = result;
      
      operation.onSuccess?.(result);
      return result;
    } catch (error) {
      operationState.status = 'error';
      operationState.error = error as Error;
      
      operation.onError?.(error as Error);
      throw error;
    } finally {
      // 清理完成的操作
      setTimeout(() => {
        this.operations.delete(operation.id);
      }, 30000); // 30秒后清理
    }
  }

  /**
   * 批量执行操作
   */
  async executeBatch<T>(operations: AsyncOperation<T>[]): Promise<T[]> {
    const promises = operations.map(op => this.executeOperation(op));
    return Promise.all(promises);
  }

  /**
   * 添加操作到队列
   */
  queueOperation<T>(operation: AsyncOperation<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const wrappedOperation: AsyncOperation<T> = {
        ...operation,
        onSuccess: (result) => {
          operation.onSuccess?.(result);
          resolve(result);
        },
        onError: (error) => {
          operation.onError?.(error);
          reject(error);
        }
      };

      this.operationQueue.push(wrappedOperation);
      this.processQueue();
    });
  }

  /**
   * 取消操作
   */
  cancelOperation(id: string): boolean {
    const operationState = this.operations.get(id);
    if (operationState && operationState.status === 'pending') {
      operationState.status = 'cancelled';
      this.operations.delete(id);
      return true;
    }
    return false;
  }

  /**
   * 获取操作状态
   */
  getOperationStatus(id: string): OperationState | undefined {
    return this.operations.get(id);
  }

  /**
   * 获取所有进行中的操作
   */
  getPendingOperations(): OperationState[] {
    return Array.from(this.operations.values()).filter(
      op => op.status === 'pending'
    );
  }

  /**
   * 清理所有操作
   */
  clearAll(): void {
    this.operations.clear();
    this.operationQueue = [];
  }

  /**
   * 带重试的执行
   */
  private async executeWithRetry<T>(operation: AsyncOperation<T>): Promise<T> {
    const maxRetries = operation.retryCount ?? this.defaultRetryCount;
    const timeout = operation.timeout ?? this.defaultTimeout;
    
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const operationState = this.operations.get(operation.id);
        if (operationState) {
          operationState.attempts = attempt + 1;
        }

        // 执行操作，带超时控制
        const result = await this.executeWithTimeout(operation.operation, timeout);
        return result;
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < maxRetries) {
          operation.onRetry?.(attempt + 1);
          
          // 指数退避延迟
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          await this.delay(delay);
        }
      }
    }

    throw lastError!;
  }

  /**
   * 带超时的执行
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`操作超时 (${timeout}ms)`));
      }, timeout);

      operation()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * 处理操作队列
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.operationQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.operationQueue.length > 0) {
        const batch = this.operationQueue.splice(0, this.maxConcurrent);
        await Promise.allSettled(
          batch.map(operation => this.executeOperation(operation))
        );
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 乐观更新
   */
  async optimisticUpdate<T>(update: OptimisticUpdate<T>): Promise<T> {
    // 立即更新UI
    update.updateUI(update.optimisticValue);

    try {
      // 检查是否已有相同操作在进行
      if (this.pendingOperations.has(update.id)) {
        return this.pendingOperations.get(update.id) as Promise<T>;
      }

      // 执行实际操作
      const promise = this.executeOperation({
        id: update.id,
        operation: update.operation,
        timeout: update.timeout,
        retryCount: update.retryCount
      });

      this.pendingOperations.set(update.id, promise);

      const result = await promise;
      
      // 确认更新UI
      update.updateUI(result);
      return result;
    } catch (error) {
      // 回滚UI
      update.rollback();
      throw error;
    } finally {
      this.pendingOperations.delete(update.id);
    }
  }

  /**
   * 防重复执行
   */
  async executeOnce<T>(
    key: string,
    operation: () => Promise<T>
  ): Promise<T> {
    if (this.pendingOperations.has(key)) {
      return this.pendingOperations.get(key) as Promise<T>;
    }

    const promise = operation();
    this.pendingOperations.set(key, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      this.pendingOperations.delete(key);
    }
  }

  /**
   * 队列化操作（防抖）
   */
  private debounceTimers = new Map<string, NodeJS.Timeout>();

  debounceOperation<T>(
    key: string,
    operation: () => Promise<T>,
    delay: number = 300
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      // 清除之前的定时器
      const existingTimer = this.debounceTimers.get(key);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // 设置新的定时器
      const timer = setTimeout(async () => {
        try {
          const result = await this.executeOnce(key, operation);
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.debounceTimers.delete(key);
        }
      }, delay);

      this.debounceTimers.set(key, timer);
    });
  }

  /**
   * 批量乐观更新
   */
  async batchOptimisticUpdate<T>(updates: OptimisticUpdate<T>[]): Promise<T[]> {
    // 立即更新所有UI
    updates.forEach(update => {
      update.updateUI(update.optimisticValue);
    });

    const promises = updates.map(async (update) => {
      try {
        const result = await this.executeOperation({
          id: update.id,
          operation: update.operation,
          timeout: update.timeout,
          retryCount: update.retryCount
        });
        
        // 确认更新
        update.updateUI(result);
        return result;
      } catch (error) {
        // 回滚
        update.rollback();
        throw error;
      }
    });

    return Promise.all(promises);
  }

  /**
   * 获取操作统计
   */
  getOperationStats(): {
    totalOperations: number;
    pendingOperations: number;
    successfulOperations: number;
    failedOperations: number;
    averageExecutionTime: number;
  } {
    const operations = Array.from(this.operations.values());
    const successful = operations.filter(op => op.status === 'success');
    const failed = operations.filter(op => op.status === 'error');
    
    const totalExecutionTime = successful.reduce((sum, op) => {
      return sum + (Date.now() - op.startTime);
    }, 0);
    
    return {
      totalOperations: operations.length,
      pendingOperations: this.pendingOperations.size,
      successfulOperations: successful.length,
      failedOperations: failed.length,
      averageExecutionTime: successful.length > 0 ? totalExecutionTime / successful.length : 0
    };
  }

  /**
   * 清理过期操作
   */
  cleanupExpiredOperations(maxAge: number = 300000): void { // 5分钟
    const now = Date.now();
    for (const [id, operation] of this.operations.entries()) {
      if (now - operation.startTime > maxAge) {
        this.operations.delete(id);
      }
    }
  }

  /**
   * 延迟工具函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 单例实例
export const asyncOperationManager = new AsyncOperationManager();

// React Hook
export const useAsyncOperation = () => {
  const executeOperation = <T>(operation: AsyncOperation<T>) => {
    return asyncOperationManager.executeOperation(operation);
  };

  const queueOperation = <T>(operation: AsyncOperation<T>) => {
    return asyncOperationManager.queueOperation(operation);
  };

  const optimisticUpdate = <T>(update: OptimisticUpdate<T>) => {
    return asyncOperationManager.optimisticUpdate(update);
  };

  const executeOnce = <T>(key: string, operation: () => Promise<T>) => {
    return asyncOperationManager.executeOnce(key, operation);
  };

  const debounceOperation = <T>(
    key: string,
    operation: () => Promise<T>,
    delay?: number
  ) => {
    return asyncOperationManager.debounceOperation(key, operation, delay);
  };

  const cancelOperation = (id: string) => {
    return asyncOperationManager.cancelOperation(id);
  };

  const getOperationStatus = (id: string) => {
    return asyncOperationManager.getOperationStatus(id);
  };

  return {
    executeOperation,
    queueOperation,
    optimisticUpdate,
    executeOnce,
    debounceOperation,
    cancelOperation,
    getOperationStatus,
    getPendingOperations: () => asyncOperationManager.getPendingOperations(),
    getOperationStats: () => asyncOperationManager.getOperationStats()
  };
};