/**
 * 加载状态管理器
 * 提供统一的加载状态管理和用户体验优化
 */

interface LoadingState {
  isLoading: boolean;
  message?: string;
  progress?: number;
  startTime: number;
  estimatedDuration?: number;
}

interface LoadingOptions {
  message?: string;
  estimatedDuration?: number;
  showProgress?: boolean;
  minDisplayTime?: number; // 最小显示时间，避免闪烁
}

type LoadingCallback = (state: LoadingState) => void;

export class LoadingStateManager {
  private states = new Map<string, LoadingState>();
  private callbacks = new Map<string, Set<LoadingCallback>>();
  private timers = new Map<string, number>();

  /**
   * 开始加载状态
   */
  start(key: string, options: LoadingOptions = {}): void {
    const state: LoadingState = {
      isLoading: true,
      message: options.message,
      progress: options.showProgress ? 0 : undefined,
      startTime: Date.now(),
      estimatedDuration: options.estimatedDuration
    };

    this.states.set(key, state);
    this.notifyCallbacks(key, state);

    // 如果有预估时间，设置进度更新
    if (options.estimatedDuration && options.showProgress) {
      this.startProgressUpdates(key, options.estimatedDuration);
    }
  }

  /**
   * 更新加载状态
   */
  update(key: string, updates: Partial<Pick<LoadingState, 'message' | 'progress'>>): void {
    const state = this.states.get(key);
    if (!state || !state.isLoading) return;

    const updatedState = { ...state, ...updates };
    this.states.set(key, updatedState);
    this.notifyCallbacks(key, updatedState);
  }

  /**
   * 设置进度
   */
  setProgress(key: string, progress: number, message?: string): void {
    this.update(key, { 
      progress: Math.max(0, Math.min(100, progress)),
      message: message || this.states.get(key)?.message
    });
  }

  /**
   * 完成加载状态
   */
  finish(key: string, options: { minDisplayTime?: number } = {}): void {
    const state = this.states.get(key);
    if (!state) return;

    const elapsed = Date.now() - state.startTime;
    const minTime = options.minDisplayTime || 300; // 默认最小显示300ms

    if (elapsed < minTime) {
      // 延迟完成，避免闪烁
      setTimeout(() => {
        this.completeLoading(key);
      }, minTime - elapsed);
    } else {
      this.completeLoading(key);
    }
  }

  /**
   * 取消加载状态
   */
  cancel(key: string): void {
    this.completeLoading(key);
  }

  /**
   * 获取加载状态
   */
  getState(key: string): LoadingState | null {
    return this.states.get(key) || null;
  }

  /**
   * 检查是否正在加载
   */
  isLoading(key: string): boolean {
    const state = this.states.get(key);
    return state ? state.isLoading : false;
  }

  /**
   * 获取所有加载状态
   */
  getAllStates(): Map<string, LoadingState> {
    return new Map(this.states);
  }

  /**
   * 订阅加载状态变化
   */
  subscribe(key: string, callback: LoadingCallback): () => void {
    if (!this.callbacks.has(key)) {
      this.callbacks.set(key, new Set());
    }
    
    this.callbacks.get(key)!.add(callback);

    // 如果已有状态，立即通知
    const currentState = this.states.get(key);
    if (currentState) {
      callback(currentState);
    }

    // 返回取消订阅函数
    return () => {
      const callbacks = this.callbacks.get(key);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.callbacks.delete(key);
        }
      }
    };
  }

  /**
   * 包装异步操作
   */
  async wrap<T>(
    key: string, 
    operation: () => Promise<T>, 
    options: LoadingOptions = {}
  ): Promise<T> {
    try {
      this.start(key, options);
      const result = await operation();
      this.finish(key, { minDisplayTime: options.minDisplayTime });
      return result;
    } catch (error) {
      this.cancel(key);
      throw error;
    }
  }

  /**
   * 批量操作的加载状态管理
   */
  async batchWrap<T>(
    key: string,
    operations: Array<() => Promise<T>>,
    options: LoadingOptions & { 
      onProgress?: (completed: number, total: number) => void;
    } = {}
  ): Promise<T[]> {
    const total = operations.length;
    const results: T[] = [];
    
    try {
      this.start(key, { ...options, showProgress: true });
      
      for (let i = 0; i < operations.length; i++) {
        const result = await operations[i]();
        results.push(result);
        
        const progress = ((i + 1) / total) * 100;
        this.setProgress(key, progress);
        
        options.onProgress?.(i + 1, total);
      }
      
      this.finish(key, { minDisplayTime: options.minDisplayTime });
      return results;
    } catch (error) {
      this.cancel(key);
      throw error;
    }
  }

  /**
   * 清理所有状态
   */
  clear(): void {
    // 清理所有定时器
    for (const timerId of this.timers.values()) {
      clearInterval(timerId);
    }
    
    this.states.clear();
    this.callbacks.clear();
    this.timers.clear();
  }

  /**
   * 完成加载状态的内部方法
   */
  private completeLoading(key: string): void {
    const state = this.states.get(key);
    if (!state) return;

    // 清理定时器
    const timerId = this.timers.get(key);
    if (timerId) {
      clearInterval(timerId);
      this.timers.delete(key);
    }

    // 更新状态为完成
    const completedState: LoadingState = {
      ...state,
      isLoading: false,
      progress: 100
    };

    this.notifyCallbacks(key, completedState);

    // 延迟清理状态，让回调有时间处理
    setTimeout(() => {
      this.states.delete(key);
      this.callbacks.delete(key);
    }, 100);
  }

  /**
   * 通知所有回调
   */
  private notifyCallbacks(key: string, state: LoadingState): void {
    const callbacks = this.callbacks.get(key);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(state);
        } catch (error) {
          console.warn('加载状态回调执行失败:', error);
        }
      });
    }
  }

  /**
   * 开始进度更新
   */
  private startProgressUpdates(key: string, estimatedDuration: number): void {
    const updateInterval = Math.max(100, estimatedDuration / 100); // 至少100ms间隔
    let elapsed = 0;

    const timerId = setInterval(() => {
      elapsed += updateInterval;
      const progress = Math.min(95, (elapsed / estimatedDuration) * 100); // 最多到95%，避免超过100%
      
      const state = this.states.get(key);
      if (!state || !state.isLoading) {
        clearInterval(timerId);
        this.timers.delete(key);
        return;
      }

      this.setProgress(key, progress);
    }, updateInterval);

    this.timers.set(key, timerId);
  }
}

/**
 * 加载状态装饰器
 */
export function withLoading(key: string, options: LoadingOptions = {}) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const manager = loadingStateManager;
      return await manager.wrap(key, () => method.apply(this, args), options);
    };

    return descriptor;
  };
}

/**
 * React Hook for loading state
 */
export function useLoadingState(key: string) {
  const [state, setState] = React.useState<LoadingState | null>(
    loadingStateManager.getState(key)
  );

  React.useEffect(() => {
    const unsubscribe = loadingStateManager.subscribe(key, setState);
    return unsubscribe;
  }, [key]);

  return {
    isLoading: state?.isLoading || false,
    message: state?.message,
    progress: state?.progress,
    startTime: state?.startTime,
    estimatedDuration: state?.estimatedDuration
  };
}

// 创建全局实例
export const loadingStateManager = new LoadingStateManager();

// 清理函数，在应用卸载时调用
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    loadingStateManager.clear();
  });
}