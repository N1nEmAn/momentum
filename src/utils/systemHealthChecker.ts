/**
 * 系统健康检查器
 * 全面检查例外规则系统的健康状态和性能
 */

import { exceptionRuleManager } from '../services/ExceptionRuleManager';
import { exceptionRuleCache } from './exceptionRuleCache';
import { performanceMonitor } from './performanceMonitor';
import { errorRecoveryManager } from './errorRecovery';

interface HealthCheckResult {
  component: string;
  status: 'healthy' | 'warning' | 'critical';
  message: string;
  details?: any;
  timestamp: number;
}

interface SystemHealthReport {
  overallStatus: 'healthy' | 'warning' | 'critical';
  timestamp: number;
  checks: HealthCheckResult[];
  summary: {
    totalChecks: number;
    healthyChecks: number;
    warningChecks: number;
    criticalChecks: number;
  };
  recommendations: string[];
  nextCheckTime: number;
}

interface HealthCheckConfig {
  enabled: boolean;
  interval: number; // 检查间隔（毫秒）
  timeout: number;  // 超时时间（毫秒）
  retries: number;  // 重试次数
}

export class SystemHealthChecker {
  private static instance: SystemHealthChecker;
  private isRunning = false;
  private checkInterval: number | null = null;
  private lastReport: SystemHealthReport | null = null;
  
  private config: Record<string, HealthCheckConfig> = {
    storage: { enabled: true, interval: 60000, timeout: 5000, retries: 2 },
    cache: { enabled: true, interval: 30000, timeout: 2000, retries: 1 },
    performance: { enabled: true, interval: 120000, timeout: 3000, retries: 1 },
    memory: { enabled: true, interval: 45000, timeout: 1000, retries: 0 },
    errors: { enabled: true, interval: 90000, timeout: 2000, retries: 1 },
    rules: { enabled: true, interval: 180000, timeout: 10000, retries: 2 }
  };

  constructor() {
    this.setupHealthChecks();
  }

  static getInstance(): SystemHealthChecker {
    if (!SystemHealthChecker.instance) {
      SystemHealthChecker.instance = new SystemHealthChecker();
    }
    return SystemHealthChecker.instance;
  }

  /**
   * 开始健康检查
   */
  startHealthChecks(interval: number = 60000): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.runHealthCheck(); // 立即执行一次

    this.checkInterval = setInterval(() => {
      this.runHealthCheck();
    }, interval);
  }

  /**
   * 停止健康检查
   */
  stopHealthChecks(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * 执行完整的健康检查
   */
  async runHealthCheck(): Promise<SystemHealthReport> {
    const checks: HealthCheckResult[] = [];
    const timestamp = Date.now();

    // 并行执行所有健康检查
    const checkPromises = [
      this.checkStorageHealth(),
      this.checkCacheHealth(),
      this.checkPerformanceHealth(),
      this.checkMemoryHealth(),
      this.checkErrorHealth(),
      this.checkRulesHealth()
    ];

    const results = await Promise.allSettled(checkPromises);
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        checks.push(result.value);
      } else {
        const componentNames = ['storage', 'cache', 'performance', 'memory', 'errors', 'rules'];
        checks.push({
          component: componentNames[index],
          status: 'critical',
          message: `健康检查失败: ${result.reason}`,
          timestamp
        });
      }
    });

    // 计算总体状态
    const criticalCount = checks.filter(c => c.status === 'critical').length;
    const warningCount = checks.filter(c => c.status === 'warning').length;
    const healthyCount = checks.filter(c => c.status === 'healthy').length;

    let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (criticalCount > 0) {
      overallStatus = 'critical';
    } else if (warningCount > 0) {
      overallStatus = 'warning';
    }

    // 生成建议
    const recommendations = this.generateRecommendations(checks);

    const report: SystemHealthReport = {
      overallStatus,
      timestamp,
      checks,
      summary: {
        totalChecks: checks.length,
        healthyChecks: healthyCount,
        warningChecks: warningCount,
        criticalChecks: criticalCount
      },
      recommendations,
      nextCheckTime: timestamp + 60000 // 下次检查时间
    };

    this.lastReport = report;
    return report;
  }

  /**
   * 获取最新的健康报告
   */
  getLastReport(): SystemHealthReport | null {
    return this.lastReport;
  }

  /**
   * 检查特定组件的健康状态
   */
  async checkComponentHealth(component: string): Promise<HealthCheckResult> {
    const timestamp = Date.now();

    switch (component) {
      case 'storage':
        return await this.checkStorageHealth();
      case 'cache':
        return await this.checkCacheHealth();
      case 'performance':
        return await this.checkPerformanceHealth();
      case 'memory':
        return await this.checkMemoryHealth();
      case 'errors':
        return await this.checkErrorHealth();
      case 'rules':
        return await this.checkRulesHealth();
      default:
        return {
          component,
          status: 'critical',
          message: '未知组件',
          timestamp
        };
    }
  }

  /**
   * 更新健康检查配置
   */
  updateConfig(component: string, config: Partial<HealthCheckConfig>): void {
    if (this.config[component]) {
      this.config[component] = { ...this.config[component], ...config };
    }
  }

  /**
   * 检查存储健康状态
   */
  private async checkStorageHealth(): Promise<HealthCheckResult> {
    const timestamp = Date.now();
    
    try {
      // 测试存储读写
      const testKey = 'health_check_test';
      const testValue = { timestamp, test: true };
      
      localStorage.setItem(testKey, JSON.stringify(testValue));
      const retrieved = localStorage.getItem(testKey);
      localStorage.removeItem(testKey);
      
      if (!retrieved || JSON.parse(retrieved).timestamp !== timestamp) {
        return {
          component: 'storage',
          status: 'critical',
          message: '存储读写测试失败',
          timestamp
        };
      }

      // 检查存储使用情况
      const storageUsage = this.getStorageUsage();
      if (storageUsage.percentage > 90) {
        return {
          component: 'storage',
          status: 'critical',
          message: `存储空间不足 (${storageUsage.percentage}% 已使用)`,
          details: storageUsage,
          timestamp
        };
      } else if (storageUsage.percentage > 75) {
        return {
          component: 'storage',
          status: 'warning',
          message: `存储空间使用较高 (${storageUsage.percentage}% 已使用)`,
          details: storageUsage,
          timestamp
        };
      }

      return {
        component: 'storage',
        status: 'healthy',
        message: `存储正常 (${storageUsage.percentage}% 已使用)`,
        details: storageUsage,
        timestamp
      };
    } catch (error) {
      return {
        component: 'storage',
        status: 'critical',
        message: `存储检查失败: ${error instanceof Error ? error.message : '未知错误'}`,
        timestamp
      };
    }
  }

  /**
   * 检查缓存健康状态
   */
  private async checkCacheHealth(): Promise<HealthCheckResult> {
    const timestamp = Date.now();
    
    try {
      const cacheStats = exceptionRuleCache.getCacheStats();
      
      if (cacheStats.hitRate < 50 && cacheStats.hits + cacheStats.misses > 10) {
        return {
          component: 'cache',
          status: 'warning',
          message: `缓存命中率较低 (${cacheStats.hitRate}%)`,
          details: cacheStats,
          timestamp
        };
      }

      if (cacheStats.size > 200) {
        return {
          component: 'cache',
          status: 'warning',
          message: `缓存大小较大 (${cacheStats.size} 项)`,
          details: cacheStats,
          timestamp
        };
      }

      return {
        component: 'cache',
        status: 'healthy',
        message: `缓存正常 (命中率: ${cacheStats.hitRate}%, 大小: ${cacheStats.size})`,
        details: cacheStats,
        timestamp
      };
    } catch (error) {
      return {
        component: 'cache',
        status: 'critical',
        message: `缓存检查失败: ${error instanceof Error ? error.message : '未知错误'}`,
        timestamp
      };
    }
  }

  /**
   * 检查性能健康状态
   */
  private async checkPerformanceHealth(): Promise<HealthCheckResult> {
    const timestamp = Date.now();
    
    try {
      const performanceReport = performanceMonitor.getPerformanceReport();
      const { averageResponseTime, userSatisfactionScore } = performanceReport.summary;

      if (averageResponseTime > 1000) {
        return {
          component: 'performance',
          status: 'critical',
          message: `响应时间过慢 (${averageResponseTime.toFixed(0)}ms)`,
          details: performanceReport.summary,
          timestamp
        };
      } else if (averageResponseTime > 500) {
        return {
          component: 'performance',
          status: 'warning',
          message: `响应时间较慢 (${averageResponseTime.toFixed(0)}ms)`,
          details: performanceReport.summary,
          timestamp
        };
      }

      if (userSatisfactionScore < 60) {
        return {
          component: 'performance',
          status: 'warning',
          message: `用户满意度较低 (${userSatisfactionScore}分)`,
          details: performanceReport.summary,
          timestamp
        };
      }

      return {
        component: 'performance',
        status: 'healthy',
        message: `性能正常 (响应时间: ${averageResponseTime.toFixed(0)}ms, 满意度: ${userSatisfactionScore}分)`,
        details: performanceReport.summary,
        timestamp
      };
    } catch (error) {
      return {
        component: 'performance',
        status: 'critical',
        message: `性能检查失败: ${error instanceof Error ? error.message : '未知错误'}`,
        timestamp
      };
    }
  }

  /**
   * 检查内存健康状态
   */
  private async checkMemoryHealth(): Promise<HealthCheckResult> {
    const timestamp = Date.now();
    
    try {
      if (typeof (performance as any).memory === 'undefined') {
        return {
          component: 'memory',
          status: 'warning',
          message: '内存信息不可用',
          timestamp
        };
      }

      const memory = (performance as any).memory;
      const usedMB = Math.round(memory.usedJSHeapSize / 1024 / 1024);
      const limitMB = Math.round(memory.jsHeapSizeLimit / 1024 / 1024);
      const usagePercentage = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;

      if (usagePercentage > 90) {
        return {
          component: 'memory',
          status: 'critical',
          message: `内存使用过高 (${usedMB}MB / ${limitMB}MB, ${usagePercentage.toFixed(1)}%)`,
          details: { usedMB, limitMB, usagePercentage },
          timestamp
        };
      } else if (usagePercentage > 75) {
        return {
          component: 'memory',
          status: 'warning',
          message: `内存使用较高 (${usedMB}MB / ${limitMB}MB, ${usagePercentage.toFixed(1)}%)`,
          details: { usedMB, limitMB, usagePercentage },
          timestamp
        };
      }

      return {
        component: 'memory',
        status: 'healthy',
        message: `内存使用正常 (${usedMB}MB / ${limitMB}MB, ${usagePercentage.toFixed(1)}%)`,
        details: { usedMB, limitMB, usagePercentage },
        timestamp
      };
    } catch (error) {
      return {
        component: 'memory',
        status: 'critical',
        message: `内存检查失败: ${error instanceof Error ? error.message : '未知错误'}`,
        timestamp
      };
    }
  }

  /**
   * 检查错误健康状态
   */
  private async checkErrorHealth(): Promise<HealthCheckResult> {
    const timestamp = Date.now();
    
    try {
      const errorHistory = errorRecoveryManager.getErrorHistory();
      const recentErrors = errorHistory.filter(e => 
        timestamp - e.timestamp < 300000 // 最近5分钟
      );

      if (recentErrors.length > 10) {
        return {
          component: 'errors',
          status: 'critical',
          message: `最近5分钟内发生了${recentErrors.length}个错误`,
          details: { recentErrorCount: recentErrors.length, totalErrors: errorHistory.length },
          timestamp
        };
      } else if (recentErrors.length > 3) {
        return {
          component: 'errors',
          status: 'warning',
          message: `最近5分钟内发生了${recentErrors.length}个错误`,
          details: { recentErrorCount: recentErrors.length, totalErrors: errorHistory.length },
          timestamp
        };
      }

      return {
        component: 'errors',
        status: 'healthy',
        message: `错误状态正常 (最近5分钟: ${recentErrors.length}个错误)`,
        details: { recentErrorCount: recentErrors.length, totalErrors: errorHistory.length },
        timestamp
      };
    } catch (error) {
      return {
        component: 'errors',
        status: 'critical',
        message: `错误检查失败: ${error instanceof Error ? error.message : '未知错误'}`,
        timestamp
      };
    }
  }

  /**
   * 检查规则系统健康状态
   */
  private async checkRulesHealth(): Promise<HealthCheckResult> {
    const timestamp = Date.now();
    
    try {
      const systemHealth = await exceptionRuleManager.getSystemHealth();
      
      if (systemHealth.status === 'error') {
        return {
          component: 'rules',
          status: 'critical',
          message: '规则系统状态异常',
          details: systemHealth,
          timestamp
        };
      } else if (systemHealth.status === 'warning') {
        return {
          component: 'rules',
          status: 'warning',
          message: `规则系统有警告: ${systemHealth.issues.join(', ')}`,
          details: systemHealth,
          timestamp
        };
      }

      return {
        component: 'rules',
        status: 'healthy',
        message: `规则系统正常 (${systemHealth.activeRules}个活跃规则, ${systemHealth.totalUsageRecords}条使用记录)`,
        details: systemHealth,
        timestamp
      };
    } catch (error) {
      return {
        component: 'rules',
        status: 'critical',
        message: `规则系统检查失败: ${error instanceof Error ? error.message : '未知错误'}`,
        timestamp
      };
    }
  }

  /**
   * 获取存储使用情况
   */
  private getStorageUsage(): { used: number; available: number; percentage: number } {
    try {
      let used = 0;
      for (const key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          used += localStorage[key].length + key.length;
        }
      }

      // 估算可用空间（大多数浏览器限制为5-10MB）
      const estimated = 5 * 1024 * 1024; // 5MB
      const percentage = Math.round((used / estimated) * 100);

      return {
        used,
        available: estimated - used,
        percentage: Math.min(percentage, 100)
      };
    } catch (error) {
      return { used: 0, available: 0, percentage: 0 };
    }
  }

  /**
   * 生成健康建议
   */
  private generateRecommendations(checks: HealthCheckResult[]): string[] {
    const recommendations: string[] = [];

    checks.forEach(check => {
      switch (check.component) {
        case 'storage':
          if (check.status === 'critical' || check.status === 'warning') {
            recommendations.push('清理浏览器存储空间或删除不必要的数据');
          }
          break;

        case 'cache':
          if (check.status === 'warning' && check.message.includes('命中率')) {
            recommendations.push('优化缓存策略或增加缓存预热');
          }
          if (check.status === 'warning' && check.message.includes('大小')) {
            recommendations.push('清理过期缓存或减少缓存项数量');
          }
          break;

        case 'performance':
          if (check.status === 'critical' || check.status === 'warning') {
            recommendations.push('优化代码性能或检查网络连接');
          }
          break;

        case 'memory':
          if (check.status === 'critical' || check.status === 'warning') {
            recommendations.push('释放未使用的内存或重启应用');
          }
          break;

        case 'errors':
          if (check.status === 'critical' || check.status === 'warning') {
            recommendations.push('检查错误日志并修复常见问题');
          }
          break;

        case 'rules':
          if (check.status === 'critical' || check.status === 'warning') {
            recommendations.push('检查规则系统配置或重新初始化');
          }
          break;
      }
    });

    if (recommendations.length === 0) {
      recommendations.push('系统运行良好，继续保持');
    }

    return [...new Set(recommendations)]; // 去重
  }

  /**
   * 设置健康检查
   */
  private setupHealthChecks(): void {
    // 在页面卸载前停止健康检查
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.stopHealthChecks();
      });
    }
  }
}

/**
 * React Hook for system health monitoring
 */
export function useSystemHealth() {
  const [healthReport, setHealthReport] = React.useState<SystemHealthReport | null>(null);
  const [isChecking, setIsChecking] = React.useState(false);

  const checker = SystemHealthChecker.getInstance();

  const runHealthCheck = React.useCallback(async () => {
    setIsChecking(true);
    try {
      const report = await checker.runHealthCheck();
      setHealthReport(report);
    } catch (error) {
      console.error('健康检查失败:', error);
    } finally {
      setIsChecking(false);
    }
  }, [checker]);

  React.useEffect(() => {
    checker.startHealthChecks();
    runHealthCheck(); // 立即执行一次

    return () => {
      checker.stopHealthChecks();
    };
  }, [checker, runHealthCheck]);

  return {
    healthReport,
    isChecking,
    runHealthCheck,
    getLastReport: () => checker.getLastReport()
  };
}

// 创建全局实例
export const systemHealthChecker = SystemHealthChecker.getInstance();