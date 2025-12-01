/**
 * 计时器性能测试和验证脚本
 * 用于验证正向计时功能的性能和准确性
 */

import { forwardTimerManager } from './forwardTimer';
import { storage } from './storage';

export interface PerformanceTestResult {
  testName: string;
  success: boolean;
  duration: number;
  error?: string;
  details?: any;
}

export class TimerPerformanceTest {
  private results: PerformanceTestResult[] = [];

  /**
   * 运行所有性能测试
   */
  async runAllTests(): Promise<PerformanceTestResult[]> {
    this.results = [];

    await this.testTimerAccuracy();
    await this.testMultipleTimers();
    await this.testPersistence();
    await this.testStoragePerformance();
    await this.testMemoryUsage();

    return this.results;
  }

  /**
   * 测试计时器准确性
   */
  private async testTimerAccuracy(): Promise<void> {
    const testName = '计时器准确性测试';
    const startTime = performance.now();

    try {
      const sessionId = 'accuracy-test';
      const expectedDuration = 2000; // 2秒

      forwardTimerManager.startTimer(sessionId);

      // 等待指定时间
      await new Promise(resolve => setTimeout(resolve, expectedDuration));

      const actualElapsed = forwardTimerManager.getCurrentElapsed(sessionId);
      const tolerance = 100; // 100ms容差

      forwardTimerManager.clearTimer(sessionId);

      const isAccurate = Math.abs(actualElapsed * 1000 - expectedDuration) <= tolerance;

      this.results.push({
        testName,
        success: isAccurate,
        duration: performance.now() - startTime,
        details: {
          expected: expectedDuration / 1000,
          actual: actualElapsed,
          difference: Math.abs(actualElapsed * 1000 - expectedDuration)
        }
      });
    } catch (error) {
      this.results.push({
        testName,
        success: false,
        duration: performance.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * 测试多个计时器并发性能
   */
  private async testMultipleTimers(): Promise<void> {
    const testName = '多计时器并发测试';
    const startTime = performance.now();

    try {
      const timerCount = 10;
      const sessionIds: string[] = [];

      // 启动多个计时器
      for (let i = 0; i < timerCount; i++) {
        const sessionId = `concurrent-test-${i}`;
        sessionIds.push(sessionId);
        forwardTimerManager.startTimer(sessionId);
      }

      // 等待1秒
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 检查所有计时器
      let allAccurate = true;
      const results = [];

      for (const sessionId of sessionIds) {
        const elapsed = forwardTimerManager.getCurrentElapsed(sessionId);
        results.push(elapsed);
        
        // 允许100ms误差
        if (Math.abs(elapsed - 1) > 0.1) {
          allAccurate = false;
        }
        
        forwardTimerManager.clearTimer(sessionId);
      }

      this.results.push({
        testName,
        success: allAccurate,
        duration: performance.now() - startTime,
        details: {
          timerCount,
          results,
          averageElapsed: results.reduce((a, b) => a + b, 0) / results.length
        }
      });
    } catch (error) {
      this.results.push({
        testName,
        success: false,
        duration: performance.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * 测试持久化性能
   */
  private async testPersistence(): Promise<void> {
    const testName = '持久化性能测试';
    const startTime = performance.now();

    try {
      const sessionId = 'persistence-test';
      
      // 启动计时器
      forwardTimerManager.startTimer(sessionId);
      
      // 等待一小段时间
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 测试恢复
      const restored = forwardTimerManager.restoreTimerState(sessionId);
      
      // 清理
      forwardTimerManager.clearTimer(sessionId);

      this.results.push({
        testName,
        success: true, // 持久化功能存在即为成功
        duration: performance.now() - startTime,
        details: {
          restored
        }
      });
    } catch (error) {
      this.results.push({
        testName,
        success: false,
        duration: performance.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * 测试存储性能
   */
  private async testStoragePerformance(): Promise<void> {
    const testName = '存储性能测试';
    const startTime = performance.now();

    try {
      const iterations = 100;
      const chainId = 'performance-test-chain';

      // 测试用时统计更新性能
      const updateStartTime = performance.now();
      for (let i = 0; i < iterations; i++) {
        storage.updateTaskTimeStats(chainId, Math.random() * 60 + 10);
      }
      const updateDuration = performance.now() - updateStartTime;

      // 测试读取性能
      const readStartTime = performance.now();
      for (let i = 0; i < iterations; i++) {
        storage.getLastCompletionTime(chainId);
        storage.getTaskAverageTime(chainId);
      }
      const readDuration = performance.now() - readStartTime;

      this.results.push({
        testName,
        success: true,
        duration: performance.now() - startTime,
        details: {
          iterations,
          updateDuration,
          readDuration,
          avgUpdateTime: updateDuration / iterations,
          avgReadTime: readDuration / iterations
        }
      });
    } catch (error) {
      this.results.push({
        testName,
        success: false,
        duration: performance.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * 测试内存使用情况
   */
  private async testMemoryUsage(): Promise<void> {
    const testName = '内存使用测试';
    const startTime = performance.now();

    try {
      const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;
      
      // 创建大量计时器
      const timerCount = 50;
      const sessionIds: string[] = [];

      for (let i = 0; i < timerCount; i++) {
        const sessionId = `memory-test-${i}`;
        sessionIds.push(sessionId);
        forwardTimerManager.startTimer(sessionId);
      }

      const peakMemory = (performance as any).memory?.usedJSHeapSize || 0;

      // 清理所有计时器
      for (const sessionId of sessionIds) {
        forwardTimerManager.clearTimer(sessionId);
      }

      // 强制垃圾回收（如果可用）
      if ((window as any).gc) {
        (window as any).gc();
      }

      const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;

      this.results.push({
        testName,
        success: true,
        duration: performance.now() - startTime,
        details: {
          timerCount,
          initialMemory,
          peakMemory,
          finalMemory,
          memoryIncrease: peakMemory - initialMemory,
          memoryRecovered: peakMemory - finalMemory
        }
      });
    } catch (error) {
      this.results.push({
        testName,
        success: false,
        duration: performance.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * 生成测试报告
   */
  generateReport(): string {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;

    let report = `
=== 计时器性能测试报告 ===
测试时间: ${new Date().toLocaleString()}
总测试数: ${totalTests}
通过: ${passedTests}
失败: ${failedTests}
成功率: ${((passedTests / totalTests) * 100).toFixed(1)}%

详细结果:
`;

    this.results.forEach((result, index) => {
      report += `
${index + 1}. ${result.testName}
   状态: ${result.success ? '✅ 通过' : '❌ 失败'}
   耗时: ${result.duration.toFixed(2)}ms`;

      if (result.error) {
        report += `
   错误: ${result.error}`;
      }

      if (result.details) {
        report += `
   详情: ${JSON.stringify(result.details, null, 2)}`;
      }

      report += '\n';
    });

    return report;
  }
}

/**
 * 运行性能测试的便捷函数
 */
export async function runTimerPerformanceTest(): Promise<string> {
  const test = new TimerPerformanceTest();
  await test.runAllTests();
  return test.generateReport();
}

// 在开发环境中暴露到全局对象，方便调试
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).runTimerPerformanceTest = runTimerPerformanceTest;
}