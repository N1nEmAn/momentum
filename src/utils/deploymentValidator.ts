/**
 * 部署验证工具
 * 在部署前验证所有修复是否正常工作
 */

import { systemHealthService } from '../services/SystemHealthService';
import { exceptionRuleManager } from '../services/ExceptionRuleManager';
import { dataIntegrityChecker } from '../services/DataIntegrityChecker';
import { enhancedRuleValidationService } from '../services/EnhancedRuleValidationService';
import { ExceptionRuleType, EnhancedExceptionRuleException } from '../types';

export interface ValidationResult {
  passed: boolean;
  score: number;
  tests: TestResult[];
  summary: string;
  recommendations: string[];
}

export interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: any;
}

export class DeploymentValidator {
  /**
   * 运行完整的部署验证
   */
  async runFullValidation(): Promise<ValidationResult> {
    console.log('开始部署验证...');
    
    const tests: TestResult[] = [];
    const startTime = Date.now();

    // 运行各项测试
    tests.push(await this.testSystemHealth());
    tests.push(await this.testRuleCreation());
    tests.push(await this.testRuleValidation());
    tests.push(await this.testErrorHandling());
    tests.push(await this.testDataIntegrity());
    tests.push(await this.testDuplicationHandling());
    tests.push(await this.testStateManagement());

    const totalDuration = Date.now() - startTime;
    const passedTests = tests.filter(t => t.passed).length;
    const score = Math.round((passedTests / tests.length) * 100);
    const passed = score >= 80; // 80%以上通过率才算成功

    const summary = this.generateSummary(passed, score, tests, totalDuration);
    const recommendations = this.generateRecommendations(tests);

    console.log(`部署验证完成: ${passed ? '通过' : '失败'} (${score}%)`);

    return {
      passed,
      score,
      tests,
      summary,
      recommendations
    };
  }

  /**
   * 测试系统健康状态
   */
  private async testSystemHealth(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const healthReport = await systemHealthService.performHealthCheck();
      const duration = Date.now() - startTime;

      const passed = healthReport.status !== 'critical' && healthReport.score >= 70;

      return {
        name: '系统健康检查',
        passed,
        duration,
        details: {
          status: healthReport.status,
          score: healthReport.score,
          componentCount: healthReport.components.length
        }
      };

    } catch (error) {
      return {
        name: '系统健康检查',
        passed: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 测试规则创建功能
   */
  private async testRuleCreation(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      // 测试创建规则
      const testRuleName = `测试规则_${Date.now()}`;
      const result = await exceptionRuleManager.createRule(
        testRuleName,
        ExceptionRuleType.PAUSE_ONLY,
        '部署验证测试规则'
      );

      const duration = Date.now() - startTime;

      // 验证创建结果
      const passed = result.rule && result.rule.name === testRuleName;

      // 清理测试数据
      if (result.rule) {
        try {
          await exceptionRuleManager.deleteRule(result.rule.id);
        } catch {
          // 忽略清理错误
        }
      }

      return {
        name: '规则创建测试',
        passed,
        duration,
        details: {
          ruleId: result.rule?.id,
          warnings: result.warnings
        }
      };

    } catch (error) {
      return {
        name: '规则创建测试',
        passed: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 测试规则验证功能
   */
  private async testRuleValidation(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      // 创建测试规则
      const testRule = await exceptionRuleManager.createRule(
        `验证测试规则_${Date.now()}`,
        ExceptionRuleType.EARLY_COMPLETION_ONLY,
        '验证功能测试'
      );

      // 测试验证功能
      const validationResult = await enhancedRuleValidationService.preValidateRuleUsage(
        testRule.rule.id,
        'early_completion'
      );

      const duration = Date.now() - startTime;
      const passed = validationResult.isValid;

      // 清理测试数据
      try {
        await exceptionRuleManager.deleteRule(testRule.rule.id);
      } catch {
        // 忽略清理错误
      }

      return {
        name: '规则验证测试',
        passed,
        duration,
        details: {
          validationResult
        }
      };

    } catch (error) {
      return {
        name: '规则验证测试',
        passed: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 测试错误处理功能
   */
  private async testErrorHandling(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      // 故意触发一个错误
      let errorCaught = false;
      let errorType = '';

      try {
        await exceptionRuleManager.useRule(
          'non_existent_rule_id',
          {
            sessionId: 'test',
            chainId: 'test',
            chainName: 'test',
            startedAt: new Date(),
            elapsedTime: 0,
            isDurationless: false
          },
          'pause'
        );
      } catch (error) {
        errorCaught = true;
        if (error instanceof EnhancedExceptionRuleException) {
          errorType = 'enhanced';
        } else {
          errorType = 'standard';
        }
      }

      const duration = Date.now() - startTime;
      const passed = errorCaught && errorType === 'enhanced';

      return {
        name: '错误处理测试',
        passed,
        duration,
        details: {
          errorCaught,
          errorType
        }
      };

    } catch (error) {
      return {
        name: '错误处理测试',
        passed: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 测试数据完整性功能
   */
  private async testDataIntegrity(): TestResult {
    const startTime = Date.now();
    
    try {
      const report = await dataIntegrityChecker.checkRuleDataIntegrity();
      const duration = Date.now() - startTime;

      // 如果有严重问题，测试失败
      const passed = report.summary.criticalIssues === 0;

      return {
        name: '数据完整性测试',
        passed,
        duration,
        details: {
          totalIssues: report.summary.totalIssues,
          criticalIssues: report.summary.criticalIssues,
          autoFixableIssues: report.summary.autoFixableIssues
        }
      };

    } catch (error) {
      return {
        name: '数据完整性测试',
        passed: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 测试重复处理功能
   */
  private async testDuplicationHandling(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const testName = `重复测试规则_${Date.now()}`;
      
      // 创建第一个规则
      const firstRule = await exceptionRuleManager.createRule(
        testName,
        ExceptionRuleType.PAUSE_ONLY
      );

      // 尝试创建重复规则
      let duplicateError = false;
      try {
        await exceptionRuleManager.createRule(
          testName,
          ExceptionRuleType.PAUSE_ONLY
        );
      } catch (error) {
        duplicateError = true;
      }

      const duration = Date.now() - startTime;
      const passed = duplicateError; // 应该捕获到重复错误

      // 清理测试数据
      try {
        await exceptionRuleManager.deleteRule(firstRule.rule.id);
      } catch {
        // 忽略清理错误
      }

      return {
        name: '重复处理测试',
        passed,
        duration,
        details: {
          duplicateErrorCaught: duplicateError
        }
      };

    } catch (error) {
      return {
        name: '重复处理测试',
        passed: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 测试状态管理功能
   */
  private async testStateManagement(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      // 测试乐观创建
      const optimisticResult = exceptionRuleManager.createRuleOptimistic(
        `状态测试规则_${Date.now()}`,
        ExceptionRuleType.PAUSE_ONLY,
        '状态管理测试'
      );

      // 等待创建完成
      const finalRule = await optimisticResult.promise;
      
      const duration = Date.now() - startTime;
      const passed = finalRule && finalRule.id && !finalRule.id.startsWith('temp_');

      // 清理测试数据
      try {
        await exceptionRuleManager.deleteRule(finalRule.id);
      } catch {
        // 忽略清理错误
      }

      return {
        name: '状态管理测试',
        passed,
        duration,
        details: {
          temporaryId: optimisticResult.temporaryId,
          finalId: finalRule?.id
        }
      };

    } catch (error) {
      return {
        name: '状态管理测试',
        passed: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 生成验证摘要
   */
  private generateSummary(
    passed: boolean,
    score: number,
    tests: TestResult[],
    totalDuration: number
  ): string {
    const passedCount = tests.filter(t => t.passed).length;
    const failedCount = tests.length - passedCount;
    
    let summary = `部署验证${passed ? '通过' : '失败'}！\n`;
    summary += `总分: ${score}/100\n`;
    summary += `测试结果: ${passedCount} 通过, ${failedCount} 失败\n`;
    summary += `总耗时: ${totalDuration}ms\n`;

    if (!passed) {
      const failedTests = tests.filter(t => !t.passed);
      summary += `\n失败的测试:\n`;
      failedTests.forEach(test => {
        summary += `- ${test.name}: ${test.error || '测试失败'}\n`;
      });
    }

    return summary;
  }

  /**
   * 生成建议
   */
  private generateRecommendations(tests: TestResult[]): string[] {
    const recommendations: string[] = [];
    const failedTests = tests.filter(t => !t.passed);

    if (failedTests.length === 0) {
      recommendations.push('所有测试通过，系统可以安全部署');
      return recommendations;
    }

    failedTests.forEach(test => {
      switch (test.name) {
        case '系统健康检查':
          recommendations.push('修复系统健康问题后再部署');
          break;
        case '规则创建测试':
          recommendations.push('检查规则创建功能的实现');
          break;
        case '规则验证测试':
          recommendations.push('修复规则验证逻辑');
          break;
        case '错误处理测试':
          recommendations.push('确保错误处理机制正常工作');
          break;
        case '数据完整性测试':
          recommendations.push('运行数据修复工具');
          break;
        case '重复处理测试':
          recommendations.push('检查重复规则检测逻辑');
          break;
        case '状态管理测试':
          recommendations.push('修复规则状态管理问题');
          break;
      }
    });

    if (failedTests.length > tests.length / 2) {
      recommendations.push('失败测试过多，建议推迟部署');
    }

    return recommendations;
  }

  /**
   * 快速验证（仅关键功能）
   */
  async runQuickValidation(): Promise<{
    passed: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    try {
      // 快速健康检查
      const health = await systemHealthService.quickHealthCheck();
      if (health.status === 'critical') {
        issues.push('系统健康状态严重');
      }

      // 快速功能测试
      const testName = `快速测试_${Date.now()}`;
      try {
        const rule = await exceptionRuleManager.createRule(testName, ExceptionRuleType.PAUSE_ONLY);
        await exceptionRuleManager.deleteRule(rule.rule.id);
      } catch (error) {
        issues.push('基本功能测试失败');
      }

    } catch (error) {
      issues.push('验证过程失败');
    }

    return {
      passed: issues.length === 0,
      issues
    };
  }
}

// 创建全局实例
export const deploymentValidator = new DeploymentValidator();