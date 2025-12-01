/**
 * 计时器配置和性能优化设置
 */

export interface TimerConfig {
  // 更新频率（毫秒）
  updateInterval: number;
  
  // 持久化设置
  persistenceEnabled: boolean;
  persistenceThrottle: number; // 持久化节流时间（毫秒）
  
  // 清理设置
  autoCleanupEnabled: boolean;
  cleanupInterval: number; // 自动清理间隔（毫秒）
  maxStorageAge: number; // 最大存储时间（毫秒）
  
  // 性能设置
  maxConcurrentTimers: number;
  memoryOptimizationEnabled: boolean;
  
  // 精度设置
  highPrecisionMode: boolean;
  timeSyncInterval: number; // 时间同步间隔（毫秒）
}

export const DEFAULT_TIMER_CONFIG: TimerConfig = {
  updateInterval: 1000, // 1秒更新一次
  persistenceEnabled: true,
  persistenceThrottle: 5000, // 5秒节流
  autoCleanupEnabled: true,
  cleanupInterval: 60000, // 1分钟清理一次
  maxStorageAge: 24 * 60 * 60 * 1000, // 24小时
  maxConcurrentTimers: 10,
  memoryOptimizationEnabled: true,
  highPrecisionMode: false,
  timeSyncInterval: 30000, // 30秒同步一次
};

export const PERFORMANCE_TIMER_CONFIG: TimerConfig = {
  ...DEFAULT_TIMER_CONFIG,
  updateInterval: 500, // 更频繁的更新
  persistenceThrottle: 2000, // 更频繁的持久化
  highPrecisionMode: true,
  timeSyncInterval: 10000, // 更频繁的时间同步
};

export const BATTERY_SAVER_CONFIG: TimerConfig = {
  ...DEFAULT_TIMER_CONFIG,
  updateInterval: 2000, // 较少的更新频率
  persistenceThrottle: 10000, // 较少的持久化
  autoCleanupEnabled: false, // 禁用自动清理
  memoryOptimizationEnabled: true,
  highPrecisionMode: false,
};

/**
 * 根据设备性能和用户偏好选择配置
 */
export function getOptimalTimerConfig(): TimerConfig {
  // 检测设备性能
  const isHighPerformanceDevice = () => {
    if (typeof navigator === 'undefined') return false;
    
    // 检查硬件并发数
    const cores = navigator.hardwareConcurrency || 1;
    if (cores >= 4) return true;
    
    // 检查内存（如果可用）
    const memory = (navigator as any).deviceMemory;
    if (memory && memory >= 4) return true;
    
    return false;
  };

  // 检测电池状态（如果可用）
  const isBatterySaverMode = async (): Promise<boolean> => {
    try {
      if ('getBattery' in navigator) {
        const battery = await (navigator as any).getBattery();
        return battery.level < 0.2; // 电量低于20%
      }
    } catch {
      // 忽略错误
    }
    return false;
  };

  // 检测页面可见性API支持
  const supportsVisibilityAPI = typeof document !== 'undefined' && 'visibilityState' in document;

  // 基础配置
  let config = { ...DEFAULT_TIMER_CONFIG };

  // 高性能设备优化
  if (isHighPerformanceDevice()) {
    config = {
      ...config,
      maxConcurrentTimers: 20,
      updateInterval: 500,
      persistenceThrottle: 3000,
    };
  }

  // 如果不支持页面可见性API，增加持久化频率
  if (!supportsVisibilityAPI) {
    config.persistenceThrottle = Math.min(config.persistenceThrottle, 3000);
  }

  return config;
}

/**
 * 性能监控指标
 */
export interface PerformanceMetrics {
  activeTimers: number;
  memoryUsage: number;
  updateLatency: number;
  persistenceLatency: number;
  errorCount: number;
  lastCleanup: Date;
}

/**
 * 性能监控器
 */
export class TimerPerformanceMonitor {
  private metrics: PerformanceMetrics = {
    activeTimers: 0,
    memoryUsage: 0,
    updateLatency: 0,
    persistenceLatency: 0,
    errorCount: 0,
    lastCleanup: new Date(),
  };

  private updateLatencies: number[] = [];
  private persistenceLatencies: number[] = [];

  updateMetrics(update: Partial<PerformanceMetrics>): void {
    this.metrics = { ...this.metrics, ...update };
  }

  recordUpdateLatency(latency: number): void {
    this.updateLatencies.push(latency);
    if (this.updateLatencies.length > 100) {
      this.updateLatencies.shift();
    }
    this.metrics.updateLatency = this.updateLatencies.reduce((a, b) => a + b, 0) / this.updateLatencies.length;
  }

  recordPersistenceLatency(latency: number): void {
    this.persistenceLatencies.push(latency);
    if (this.persistenceLatencies.length > 50) {
      this.persistenceLatencies.shift();
    }
    this.metrics.persistenceLatency = this.persistenceLatencies.reduce((a, b) => a + b, 0) / this.persistenceLatencies.length;
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  getHealthScore(): number {
    let score = 100;
    
    // 延迟惩罚
    if (this.metrics.updateLatency > 50) score -= 20;
    if (this.metrics.persistenceLatency > 200) score -= 15;
    
    // 错误惩罚
    score -= Math.min(this.metrics.errorCount * 5, 30);
    
    // 内存使用惩罚
    if (this.metrics.memoryUsage > 50 * 1024 * 1024) score -= 10; // 50MB
    
    return Math.max(0, score);
  }

  shouldOptimize(): boolean {
    return this.getHealthScore() < 70;
  }

  getOptimizationSuggestions(): string[] {
    const suggestions: string[] = [];
    
    if (this.metrics.updateLatency > 50) {
      suggestions.push('考虑增加更新间隔以减少延迟');
    }
    
    if (this.metrics.persistenceLatency > 200) {
      suggestions.push('考虑增加持久化节流时间');
    }
    
    if (this.metrics.errorCount > 5) {
      suggestions.push('检查错误日志并修复问题');
    }
    
    if (this.metrics.memoryUsage > 50 * 1024 * 1024) {
      suggestions.push('启用内存优化模式');
    }
    
    if (this.metrics.activeTimers > 10) {
      suggestions.push('考虑限制并发计时器数量');
    }
    
    return suggestions;
  }
}

// 全局性能监控器实例
export const timerPerformanceMonitor = new TimerPerformanceMonitor();