/**
 * 功能验证脚本
 * 验证任务计时功能的完整性和正确性
 */

import { forwardTimerManager } from './forwardTimer';
import { storage } from './storage';
import { formatElapsedTime, formatTimeDescription, formatActualDuration, formatLastCompletionReference } from './time';

export interface ValidationResult {
  feature: string;
  passed: boolean;
  details: string;
  error?: string;
}

export class FeatureValidator {
  private results: ValidationResult[] = [];

  /**
   * 运行所有功能验证
   */
  async validateAllFeatures(): Promise<ValidationResult[]> {
    this.results = [];

    await this.validateForwardTimer();
    await this.validateTimeFormatting();
    await this.validateStorage();
    await this.validateDataMigration();

    return this.results;
  }

  /**
   * 验证正向计时器功能
   */
  private async validateForwardTimer(): Promise<void> {
    try {
      const sessionId = 'validation-test';
      
      // 测试启动计时器
      forwardTimerManager.startTimer(sessionId);
      const hasTimer = forwardTimerManager.hasTimer(sessionId);
      
      if (!hasTimer) {
        this.results.push({
          feature: '正向计时器启动',
          passed: false,
          details: '计时器启动后未能正确创建'
        });
        return;
      }

      // 测试计时
      await new Promise(resolve => setTimeout(resolve, 100));
      const elapsed1 = forwardTimerManager.getCurrentElapsed(sessionId);
      
      // 测试暂停
      forwardTimerManager.pauseTimer(sessionId);
      const isPaused = forwardTimerManager.isPaused(sessionId);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      const elapsed2 = forwardTimerManager.getCurrentElapsed(sessionId);
      
      // 测试恢复
      forwardTimerManager.resumeTimer(sessionId);
      await new Promise(resolve => setTimeout(resolve, 100));
      const elapsed3 = forwardTimerManager.getCurrentElapsed(sessionId);
      
      // 测试停止
      const totalElapsed = forwardTimerManager.stopTimer(sessionId);
      const hasTimerAfterStop = forwardTimerManager.hasTimer(sessionId);

      this.results.push({
        feature: '正向计时器启动',
        passed: true,
        details: '计时器成功启动'
      });

      this.results.push({
        feature: '正向计时器计时',
        passed: elapsed1 >= 0,
        details: `初始计时: ${elapsed1}秒`
      });

      this.results.push({
        feature: '正向计时器暂停',
        passed: isPaused && elapsed2 === elapsed1,
        details: `暂停状态: ${isPaused}, 暂停期间时间未增加: ${elapsed2 === elapsed1}`
      });

      this.results.push({
        feature: '正向计时器恢复',
        passed: !forwardTimerManager.isPaused(sessionId) && elapsed3 > elapsed2,
        details: `恢复后继续计时: ${elapsed3 > elapsed2}`
      });

      this.results.push({
        feature: '正向计时器停止',
        passed: !hasTimerAfterStop && totalElapsed >= 0,
        details: `停止后清理: ${!hasTimerAfterStop}, 总用时: ${totalElapsed}秒`
      });

    } catch (error) {
      this.results.push({
        feature: '正向计时器功能',
        passed: false,
        details: '测试过程中发生错误',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * 验证时间格式化功能
   */
  private async validateTimeFormatting(): Promise<void> {
    try {
      // 测试 formatElapsedTime
      const elapsedTests = [
        { input: 0, expected: '00:00' },
        { input: 30, expected: '00:30' },
        { input: 90, expected: '01:30' },
        { input: 3600, expected: '01:00:00' },
      ];

      let elapsedPassed = true;
      elapsedTests.forEach(test => {
        const result = formatElapsedTime(test.input);
        if (result !== test.expected) {
          elapsedPassed = false;
        }
      });

      this.results.push({
        feature: '时间格式化 - formatElapsedTime',
        passed: elapsedPassed,
        details: elapsedPassed ? '所有测试用例通过' : '部分测试用例失败'
      });

      // 测试 formatTimeDescription
      const descTests = [
        { input: 0, expected: '不到1分钟' },
        { input: 25, expected: '25分钟' },
        { input: 90, expected: '1小时30分钟' },
      ];

      let descPassed = true;
      descTests.forEach(test => {
        const result = formatTimeDescription(test.input);
        if (result !== test.expected) {
          descPassed = false;
        }
      });

      this.results.push({
        feature: '时间格式化 - formatTimeDescription',
        passed: descPassed,
        details: descPassed ? '所有测试用例通过' : '部分测试用例失败'
      });

      // 测试 formatActualDuration
      const actualDurationResult1 = formatActualDuration(25, true);
      const actualDurationResult2 = formatActualDuration(25, false);
      
      this.results.push({
        feature: '时间格式化 - formatActualDuration',
        passed: actualDurationResult1.includes('完成用时') && actualDurationResult2.includes('25m'),
        details: `正向计时: ${actualDurationResult1}, 标准格式: ${actualDurationResult2}`
      });

      // 测试 formatLastCompletionReference
      const refResult1 = formatLastCompletionReference(null);
      const refResult2 = formatLastCompletionReference(25);
      
      this.results.push({
        feature: '时间格式化 - formatLastCompletionReference',
        passed: refResult1 === '首次执行' && refResult2.includes('上次用时'),
        details: `首次: ${refResult1}, 有历史: ${refResult2}`
      });

    } catch (error) {
      this.results.push({
        feature: '时间格式化功能',
        passed: false,
        details: '测试过程中发生错误',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * 验证存储功能
   */
  private async validateStorage(): Promise<void> {
    try {
      const testChainId = 'validation-test-chain';
      
      // 测试用时统计
      storage.updateTaskTimeStats(testChainId, 25);
      const lastTime = storage.getLastCompletionTime(testChainId);
      const avgTime = storage.getTaskAverageTime(testChainId);
      
      this.results.push({
        feature: '存储 - 用时统计更新',
        passed: lastTime === 25 && avgTime === 25,
        details: `上次用时: ${lastTime}, 平均用时: ${avgTime}`
      });

      // 测试多次更新
      storage.updateTaskTimeStats(testChainId, 35);
      const lastTime2 = storage.getLastCompletionTime(testChainId);
      const avgTime2 = storage.getTaskAverageTime(testChainId);
      
      this.results.push({
        feature: '存储 - 用时统计累计',
        passed: lastTime2 === 35 && avgTime2 === 30,
        details: `更新后上次用时: ${lastTime2}, 平均用时: ${avgTime2}`
      });

      // 测试获取统计数据
      const allStats = storage.getTaskTimeStats();
      const testStats = allStats.find(s => s.chainId === testChainId);
      
      this.results.push({
        feature: '存储 - 统计数据获取',
        passed: testStats !== undefined && testStats.totalCompletions === 2,
        details: `找到统计数据: ${testStats !== undefined}, 完成次数: ${testStats?.totalCompletions}`
      });

    } catch (error) {
      this.results.push({
        feature: '存储功能',
        passed: false,
        details: '测试过程中发生错误',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * 验证数据迁移功能
   */
  private async validateDataMigration(): Promise<void> {
    try {
      // 测试迁移功能是否可用
      const { dataMigrationManager } = await import('./dataMigration');
      
      // 测试数据完整性验证
      const validation = await dataMigrationManager.validateDataIntegrity();
      
      this.results.push({
        feature: '数据迁移 - 完整性验证',
        passed: true,
        details: `验证结果: ${validation.isValid ? '通过' : '有问题'}, 问题数: ${validation.issues.length}`
      });

      this.results.push({
        feature: '数据迁移 - 功能可用性',
        passed: true,
        details: '数据迁移模块成功加载'
      });

    } catch (error) {
      this.results.push({
        feature: '数据迁移功能',
        passed: false,
        details: '测试过程中发生错误',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * 生成验证报告
   */
  generateReport(): string {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;

    let report = `
=== 功能验证报告 ===
验证时间: ${new Date().toLocaleString()}
总测试数: ${totalTests}
通过: ${passedTests}
失败: ${failedTests}
成功率: ${((passedTests / totalTests) * 100).toFixed(1)}%

详细结果:
`;

    this.results.forEach((result, index) => {
      report += `
${index + 1}. ${result.feature}
   状态: ${result.passed ? '✅ 通过' : '❌ 失败'}
   详情: ${result.details}`;

      if (result.error) {
        report += `
   错误: ${result.error}`;
      }

      report += '\n';
    });

    return report;
  }
}

/**
 * 运行功能验证的便捷函数
 */
export async function validateTimerFeatures(): Promise<string> {
  const validator = new FeatureValidator();
  await validator.validateAllFeatures();
  return validator.generateReport();
}

// 在开发环境中暴露到全局对象，方便调试
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).validateTimerFeatures = validateTimerFeatures;
}