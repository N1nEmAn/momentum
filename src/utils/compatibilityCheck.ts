/**
 * 兼容性检查工具
 * 确保新的计时功能与现有系统兼容
 */

export interface CompatibilityResult {
  isCompatible: boolean;
  version: string;
  features: {
    forwardTimer: boolean;
    taskTimeStats: boolean;
    dataIntegrity: boolean;
    browserSupport: boolean;
  };
  warnings: string[];
  recommendations: string[];
}

export class CompatibilityChecker {
  private readonly CURRENT_VERSION = '1.1.0';
  private readonly MIN_SUPPORTED_VERSION = '1.0.0';

  /**
   * 执行完整的兼容性检查
   */
  async checkCompatibility(): Promise<CompatibilityResult> {
    const result: CompatibilityResult = {
      isCompatible: true,
      version: this.CURRENT_VERSION,
      features: {
        forwardTimer: false,
        taskTimeStats: false,
        dataIntegrity: false,
        browserSupport: false,
      },
      warnings: [],
      recommendations: [],
    };

    // 检查浏览器支持
    result.features.browserSupport = this.checkBrowserSupport(result);
    
    // 检查正向计时器功能
    result.features.forwardTimer = this.checkForwardTimerSupport(result);
    
    // 检查任务用时统计功能
    result.features.taskTimeStats = this.checkTaskTimeStatsSupport(result);
    
    // 检查数据完整性
    result.features.dataIntegrity = await this.checkDataIntegrity(result);

    // 计算总体兼容性
    result.isCompatible = Object.values(result.features).every(feature => feature);

    // 生成建议
    this.generateRecommendations(result);

    return result;
  }

  /**
   * 检查浏览器支持
   */
  private checkBrowserSupport(result: CompatibilityResult): boolean {
    let isSupported = true;

    // 检查必需的API
    const requiredAPIs = [
      { name: 'localStorage', check: () => typeof Storage !== 'undefined' },
      { name: 'performance.now', check: () => typeof performance !== 'undefined' && typeof performance.now === 'function' },
      { name: 'JSON', check: () => typeof JSON !== 'undefined' },
      { name: 'Map', check: () => typeof Map !== 'undefined' },
      { name: 'Set', check: () => typeof Set !== 'undefined' },
    ];

    requiredAPIs.forEach(api => {
      if (!api.check()) {
        result.warnings.push(`浏览器不支持 ${api.name} API`);
        isSupported = false;
      }
    });

    // 检查可选的API
    const optionalAPIs = [
      { name: 'visibilitychange事件', check: () => typeof document !== 'undefined' && 'visibilityState' in document },
      { name: 'navigator.hardwareConcurrency', check: () => typeof navigator !== 'undefined' && 'hardwareConcurrency' in navigator },
      { name: 'performance.memory', check: () => typeof performance !== 'undefined' && 'memory' in performance },
    ];

    optionalAPIs.forEach(api => {
      if (!api.check()) {
        result.warnings.push(`浏览器不支持 ${api.name}，某些功能可能受限`);
      }
    });

    return isSupported;
  }

  /**
   * 检查正向计时器功能支持
   */
  private checkForwardTimerSupport(result: CompatibilityResult): boolean {
    try {
      // 检查是否能创建计时器管理器
      const { ForwardTimerManager } = require('../utils/forwardTimer');
      const testManager = new ForwardTimerManager();
      
      // 测试基本功能
      const testSessionId = 'compatibility-test';
      testManager.startTimer(testSessionId);
      const hasTimer = testManager.hasTimer(testSessionId);
      testManager.clearTimer(testSessionId);
      testManager.destroy();

      if (!hasTimer) {
        result.warnings.push('正向计时器基本功能测试失败');
        return false;
      }

      return true;
    } catch (error) {
      result.warnings.push(`正向计时器功能检查失败: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * 检查任务用时统计功能支持
   */
  private checkTaskTimeStatsSupport(result: CompatibilityResult): boolean {
    try {
      // 检查存储功能
      const { storage } = require('../utils/storage');
      
      // 测试基本的统计功能
      const testStats = storage.getTaskTimeStats();
      const testChainId = 'compatibility-test-chain';
      const testTime = storage.getLastCompletionTime(testChainId);

      // 这些调用不应该抛出错误
      return true;
    } catch (error) {
      result.warnings.push(`任务用时统计功能检查失败: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * 检查数据完整性
   */
  private async checkDataIntegrity(result: CompatibilityResult): Promise<boolean> {
    try {
      const { dataMigrationManager } = await import('./dataMigration');
      const validation = await dataMigrationManager.validateDataIntegrity();
      
      if (!validation.isValid) {
        result.warnings.push('数据完整性检查发现问题:');
        result.warnings.push(...validation.issues);
        return false;
      }

      return true;
    } catch (error) {
      result.warnings.push(`数据完整性检查失败: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * 生成建议
   */
  private generateRecommendations(result: CompatibilityResult): void {
    if (!result.features.browserSupport) {
      result.recommendations.push('建议升级到现代浏览器以获得最佳体验');
    }

    if (!result.features.forwardTimer) {
      result.recommendations.push('正向计时功能不可用，无时长任务将使用备用计时方式');
    }

    if (!result.features.taskTimeStats) {
      result.recommendations.push('任务用时统计功能不可用，历史记录可能不显示详细用时信息');
    }

    if (!result.features.dataIntegrity) {
      result.recommendations.push('建议运行数据迁移工具修复数据问题');
    }

    if (result.warnings.length > 3) {
      result.recommendations.push('检测到多个兼容性问题，建议联系技术支持');
    }
  }

  /**
   * 生成兼容性报告
   */
  generateReport(result: CompatibilityResult): string {
    const report = `
=== 兼容性检查报告 ===
检查时间: ${new Date().toLocaleString()}
系统版本: ${result.version}
总体兼容性: ${result.isCompatible ? '✅ 兼容' : '❌ 不兼容'}

功能支持状态:
- 浏览器支持: ${result.features.browserSupport ? '✅' : '❌'}
- 正向计时器: ${result.features.forwardTimer ? '✅' : '❌'}
- 用时统计: ${result.features.taskTimeStats ? '✅' : '❌'}
- 数据完整性: ${result.features.dataIntegrity ? '✅' : '❌'}

${result.warnings.length > 0 ? `
警告信息:
${result.warnings.map((warning, index) => `${index + 1}. ${warning}`).join('\n')}
` : '无警告'}

${result.recommendations.length > 0 ? `
建议:
${result.recommendations.map((rec, index) => `${index + 1}. ${rec}`).join('\n')}
` : '无特殊建议'}

检查完成。
`;

    return report;
  }
}

// 创建全局兼容性检查器实例
export const compatibilityChecker = new CompatibilityChecker();

/**
 * 执行兼容性检查的便捷函数
 */
export async function checkTimerCompatibility(): Promise<string> {
  const result = await compatibilityChecker.checkCompatibility();
  return compatibilityChecker.generateReport(result);
}

// 在开发环境中暴露到全局对象，方便调试
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).checkTimerCompatibility = checkTimerCompatibility;
  (window as any).compatibilityChecker = compatibilityChecker;
}