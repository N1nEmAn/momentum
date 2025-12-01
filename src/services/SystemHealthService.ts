/**
 * 系统健康检查服务
 * 监控和报告例外规则系统的整体健康状态
 */

import { dataIntegrityChecker } from './DataIntegrityChecker';
import { ruleStateManager } from './RuleStateManager';
import { enhancedRuleValidationService } from './EnhancedRuleValidationService';
import { errorClassificationService } from './ErrorClassificationService';
import { exceptionRuleStorage } from './ExceptionRuleStorage';

export interface SystemHealthReport {
  status: 'healthy' | 'warning' | 'critical';
  score: number; // 0-100
  timestamp: Date;
  components: ComponentHealth[];
  recommendations: string[];
  summary: string;
}

export interface ComponentHealth {
  name: string;
  status: 'healthy' | 'warning' | 'critical';
  score: number;
  issues: string[];
  metrics?: any;
}

export class SystemHealthService {
  /**
   * 执行完整的系统健康检查
   */
  async performHealthCheck(): Promise<SystemHealthReport> {
    const components: ComponentHealth[] = [];
    
    // 检查各个组件
    components.push(await this.checkDataIntegrity());
    components.push(await this.checkRuleStates());
    components.push(await this.checkValidationService());
    components.push(await this.checkErrorHandling());
    components.push(await this.checkStorage());

    // 计算整体健康分数
    const totalScore = components.reduce((sum, comp) => sum + comp.score, 0);
    const averageScore = totalScore / components.length;

    // 确定整体状态
    let status: 'healthy' | 'warning' | 'critical';
    if (averageScore >= 80) {
      status = 'healthy';
    } else if (averageScore >= 60) {
      status = 'warning';
    } else {
      status = 'critical';
    }

    // 生成建议
    const recommendations = this.generateRecommendations(components);
    const summary = this.generateSummary(status, averageScore, components);

    return {
      status,
      score: Math.round(averageScore),
      timestamp: new Date(),
      components,
      recommendations,
      summary
    };
  }

  /**
   * 检查数据完整性
   */
  private async checkDataIntegrity(): Promise<ComponentHealth> {
    try {
      const report = await dataIntegrityChecker.checkRuleDataIntegrity();
      const issues: string[] = [];
      let score = 100;

      if (report.summary.criticalIssues > 0) {
        issues.push(`${report.summary.criticalIssues} 个严重问题`);
        score -= report.summary.criticalIssues * 20;
      }

      if (report.summary.warningIssues > 0) {
        issues.push(`${report.summary.warningIssues} 个警告问题`);
        score -= report.summary.warningIssues * 5;
      }

      score = Math.max(0, score);

      return {
        name: '数据完整性',
        status: score >= 80 ? 'healthy' : score >= 60 ? 'warning' : 'critical',
        score,
        issues,
        metrics: {
          totalIssues: report.summary.totalIssues,
          criticalIssues: report.summary.criticalIssues,
          autoFixableIssues: report.summary.autoFixableIssues
        }
      };

    } catch (error) {
      return {
        name: '数据完整性',
        status: 'critical',
        score: 0,
        issues: ['数据完整性检查失败']
      };
    }
  }

  /**
   * 检查规则状态管理
   */
  private async checkRuleStates(): Promise<ComponentHealth> {
    try {
      const states = ruleStateManager.getAllStates();
      const issues: string[] = [];
      let score = 100;

      // 检查待处理创建数量
      if (states.pendingCreations.size > 10) {
        issues.push(`过多待处理创建: ${states.pendingCreations.size}`);
        score -= 20;
      }

      // 检查错误状态
      const errorStates = Array.from(states.states.values()).filter(s => s.status === 'error');
      if (errorStates.length > 0) {
        issues.push(`${errorStates.length} 个规则处于错误状态`);
        score -= errorStates.length * 10;
      }

      score = Math.max(0, score);

      return {
        name: '规则状态管理',
        status: score >= 80 ? 'healthy' : score >= 60 ? 'warning' : 'critical',
        score,
        issues,
        metrics: {
          totalStates: states.states.size,
          pendingCreations: states.pendingCreations.size,
          idMappings: states.idMappings.size,
          errorStates: errorStates.length
        }
      };

    } catch (error) {
      return {
        name: '规则状态管理',
        status: 'critical',
        score: 0,
        issues: ['规则状态检查失败']
      };
    }
  }

  /**
   * 检查验证服务
   */
  private async checkValidationService(): Promise<ComponentHealth> {
    try {
      // 获取所有规则进行验证测试
      const rules = await exceptionRuleStorage.getRules();
      const sampleRules = rules.slice(0, 10); // 测试前10个规则
      
      const issues: string[] = [];
      let score = 100;

      if (sampleRules.length > 0) {
        const report = await enhancedRuleValidationService.validateRulesIntegrity(sampleRules);
        
        if (report.invalidRules.length > 0) {
          issues.push(`${report.invalidRules.length} 个规则验证失败`);
          score -= (report.invalidRules.length / sampleRules.length) * 50;
        }
      }

      score = Math.max(0, score);

      return {
        name: '验证服务',
        status: score >= 80 ? 'healthy' : score >= 60 ? 'warning' : 'critical',
        score,
        issues,
        metrics: {
          testedRules: sampleRules.length,
          totalRules: rules.length
        }
      };

    } catch (error) {
      return {
        name: '验证服务',
        status: 'critical',
        score: 0,
        issues: ['验证服务检查失败']
      };
    }
  }

  /**
   * 检查错误处理
   */
  private async checkErrorHandling(): Promise<ComponentHealth> {
    try {
      const errorStats = errorClassificationService.getErrorStatistics();
      const errorTrends = errorClassificationService.getErrorTrends();
      
      const issues: string[] = [];
      let score = 100;

      // 检查错误频率
      if (errorStats.totalErrors > 100) {
        issues.push(`错误数量过多: ${errorStats.totalErrors}`);
        score -= 20;
      }

      // 检查严重错误
      const criticalErrors = errorStats.errorsBySeverity.get('critical') || 0;
      if (criticalErrors > 0) {
        issues.push(`${criticalErrors} 个严重错误`);
        score -= criticalErrors * 15;
      }

      score = Math.max(0, score);

      return {
        name: '错误处理',
        status: score >= 80 ? 'healthy' : score >= 60 ? 'warning' : 'critical',
        score,
        issues,
        metrics: {
          totalErrors: errorStats.totalErrors,
          criticalErrors,
          recentErrors: errorTrends.recentErrors.length
        }
      };

    } catch (error) {
      return {
        name: '错误处理',
        status: 'critical',
        score: 0,
        issues: ['错误处理检查失败']
      };
    }
  }

  /**
   * 检查存储系统
   */
  private async checkStorage(): Promise<ComponentHealth> {
    try {
      const rules = await exceptionRuleStorage.getRules();
      const usageRecords = await exceptionRuleStorage.getUsageRecords();
      
      const issues: string[] = [];
      let score = 100;

      // 检查数据量
      if (rules.length === 0) {
        issues.push('没有规则数据');
        score -= 30;
      }

      // 检查活跃规则比例
      const activeRules = rules.filter(r => r.isActive);
      const activeRatio = activeRules.length / rules.length;
      if (activeRatio < 0.5) {
        issues.push('活跃规则比例过低');
        score -= 20;
      }

      score = Math.max(0, score);

      return {
        name: '存储系统',
        status: score >= 80 ? 'healthy' : score >= 60 ? 'warning' : 'critical',
        score,
        issues,
        metrics: {
          totalRules: rules.length,
          activeRules: activeRules.length,
          usageRecords: usageRecords.length,
          activeRatio: Math.round(activeRatio * 100)
        }
      };

    } catch (error) {
      return {
        name: '存储系统',
        status: 'critical',
        score: 0,
        issues: ['存储系统检查失败']
      };
    }
  }

  /**
   * 生成建议
   */
  private generateRecommendations(components: ComponentHealth[]): string[] {
    const recommendations: string[] = [];

    for (const component of components) {
      if (component.status === 'critical') {
        recommendations.push(`紧急修复 ${component.name} 组件`);
      } else if (component.status === 'warning') {
        recommendations.push(`关注 ${component.name} 组件的问题`);
      }

      // 具体建议
      if (component.name === '数据完整性' && component.issues.length > 0) {
        recommendations.push('运行数据修复工具');
      }

      if (component.name === '规则状态管理' && component.metrics?.errorStates > 0) {
        recommendations.push('清理错误状态的规则');
      }

      if (component.name === '错误处理' && component.metrics?.criticalErrors > 0) {
        recommendations.push('检查并解决严重错误');
      }
    }

    // 通用建议
    const criticalComponents = components.filter(c => c.status === 'critical');
    if (criticalComponents.length > 0) {
      recommendations.push('考虑重启系统或联系技术支持');
    }

    return [...new Set(recommendations)]; // 去重
  }

  /**
   * 生成摘要
   */
  private generateSummary(
    status: 'healthy' | 'warning' | 'critical',
    score: number,
    components: ComponentHealth[]
  ): string {
    const healthyCount = components.filter(c => c.status === 'healthy').length;
    const warningCount = components.filter(c => c.status === 'warning').length;
    const criticalCount = components.filter(c => c.status === 'critical').length;

    let summary = `系统健康分数: ${score}/100。`;

    if (status === 'healthy') {
      summary += ` 系统运行良好，${healthyCount} 个组件正常运行。`;
    } else if (status === 'warning') {
      summary += ` 系统存在一些问题，${warningCount} 个组件需要关注。`;
    } else {
      summary += ` 系统存在严重问题，${criticalCount} 个组件需要紧急修复。`;
    }

    return summary;
  }

  /**
   * 快速健康检查
   */
  async quickHealthCheck(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    score: number;
    issues: string[];
  }> {
    const issues: string[] = [];
    let score = 100;

    try {
      // 快速检查存储
      const rules = await exceptionRuleStorage.getRules();
      if (rules.length === 0) {
        issues.push('没有规则数据');
        score -= 30;
      }

      // 快速检查状态管理
      const states = ruleStateManager.getAllStates();
      const errorStates = Array.from(states.states.values()).filter(s => s.status === 'error');
      if (errorStates.length > 0) {
        issues.push(`${errorStates.length} 个规则处于错误状态`);
        score -= 20;
      }

      // 快速检查错误统计
      const errorStats = errorClassificationService.getErrorStatistics();
      const criticalErrors = errorStats.errorsBySeverity.get('critical') || 0;
      if (criticalErrors > 0) {
        issues.push(`${criticalErrors} 个严重错误`);
        score -= 25;
      }

    } catch (error) {
      issues.push('系统检查失败');
      score = 0;
    }

    score = Math.max(0, score);
    
    let status: 'healthy' | 'warning' | 'critical';
    if (score >= 80) {
      status = 'healthy';
    } else if (score >= 60) {
      status = 'warning';
    } else {
      status = 'critical';
    }

    return { status, score, issues };
  }
}

// 创建全局实例
export const systemHealthService = new SystemHealthService();