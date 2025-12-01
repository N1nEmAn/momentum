/**
 * 数据完整性检查器
 * 检查和修复例外规则系统的数据完整性问题
 */

import { 
  ExceptionRule, 
  ExceptionRuleType, 
  RuleUsageRecord,
  ExceptionRuleError, 
  ExceptionRuleException 
} from '../types';
import { exceptionRuleStorage } from './ExceptionRuleStorage';

export interface IntegrityIssue {
  type: 'missing_id' | 'duplicate_name' | 'invalid_type' | 'orphaned_record' | 'missing_created_at' | 'invalid_usage_count';
  severity: 'critical' | 'warning' | 'info';
  description: string;
  affectedItems: string[];
  autoFixable: boolean;
  fixAction?: () => Promise<void>;
  details?: any;
}

export interface IntegrityReport {
  issues: IntegrityIssue[];
  summary: {
    totalIssues: number;
    criticalIssues: number;
    warningIssues: number;
    infoIssues: number;
    autoFixableIssues: number;
  };
  recommendations: string[];
}

export interface FixResult {
  issueType: string;
  success: boolean;
  message: string;
  details?: any;
}

export class DataIntegrityChecker {
  private fixHistory: FixResult[] = [];

  /**
   * 检查规则数据完整性
   */
  async checkRuleDataIntegrity(): Promise<IntegrityReport> {
    try {
      const issues: IntegrityIssue[] = [];
      const rules = await exceptionRuleStorage.getRules();
      const usageRecords = await exceptionRuleStorage.getUsageRecords();

      // 检查规则完整性
      const ruleIssues = await this.checkRulesIntegrity(rules);
      issues.push(...ruleIssues);

      // 检查使用记录完整性
      const recordIssues = await this.checkUsageRecordsIntegrity(usageRecords, rules);
      issues.push(...recordIssues);

      // 检查数据一致性
      const consistencyIssues = await this.checkDataConsistency(rules, usageRecords);
      issues.push(...consistencyIssues);

      const summary = this.generateSummary(issues);
      const recommendations = this.generateRecommendations(issues);

      return {
        issues,
        summary,
        recommendations
      };

    } catch (error) {
      throw new ExceptionRuleException(
        ExceptionRuleError.STORAGE_ERROR,
        `数据完整性检查失败: ${error instanceof Error ? error.message : '未知错误'}`,
        error
      );
    }
  }

  /**
   * 自动修复可修复的问题
   */
  async autoFixIssues(issues: IntegrityIssue[]): Promise<FixResult[]> {
    const results: FixResult[] = [];
    const autoFixableIssues = issues.filter(issue => issue.autoFixable);

    for (const issue of autoFixableIssues) {
      try {
        if (issue.fixAction) {
          await issue.fixAction();
          
          const result: FixResult = {
            issueType: issue.type,
            success: true,
            message: `已修复: ${issue.description}`,
            details: issue.details
          };
          
          results.push(result);
          this.fixHistory.push(result);
        }
      } catch (error) {
        const result: FixResult = {
          issueType: issue.type,
          success: false,
          message: `修复失败: ${error instanceof Error ? error.message : '未知错误'}`,
          details: { issue, error }
        };
        
        results.push(result);
        this.fixHistory.push(result);
      }
    }

    return results;
  }

  /**
   * 验证规则ID的唯一性和有效性
   */
  validateRuleIds(rules: ExceptionRule[]): IntegrityIssue[] {
    const issues: IntegrityIssue[] = [];
    const seenIds = new Set<string>();
    const duplicateIds: string[] = [];

    for (const rule of rules) {
      // 检查ID是否存在
      if (!rule.id) {
        issues.push({
          type: 'missing_id',
          severity: 'critical',
          description: `规则 "${rule.name || 'unnamed'}" 缺少ID`,
          affectedItems: [rule.name || 'unnamed'],
          autoFixable: true,
          fixAction: async () => {
            // 生成新的ID
            rule.id = this.generateUniqueId();
            await this.updateRuleInStorage(rule);
          },
          details: { rule }
        });
        continue;
      }

      // 检查ID重复
      if (seenIds.has(rule.id)) {
        duplicateIds.push(rule.id);
      } else {
        seenIds.add(rule.id);
      }

      // 检查ID格式
      if (!this.isValidId(rule.id)) {
        issues.push({
          type: 'missing_id',
          severity: 'warning',
          description: `规则 "${rule.name}" 的ID格式无效: ${rule.id}`,
          affectedItems: [rule.name],
          autoFixable: true,
          fixAction: async () => {
            const oldId = rule.id;
            rule.id = this.generateUniqueId();
            await this.updateRuleInStorage(rule);
            await this.updateUsageRecordsRuleId(oldId, rule.id);
          },
          details: { rule, oldId: rule.id }
        });
      }
    }

    // 处理重复ID
    for (const duplicateId of duplicateIds) {
      const duplicateRules = rules.filter(r => r.id === duplicateId);
      issues.push({
        type: 'missing_id',
        severity: 'critical',
        description: `发现重复的规则ID: ${duplicateId}`,
        affectedItems: duplicateRules.map(r => r.name),
        autoFixable: true,
        fixAction: async () => {
          // 保留第一个，为其他的生成新ID
          for (let i = 1; i < duplicateRules.length; i++) {
            const rule = duplicateRules[i];
            const oldId = rule.id;
            rule.id = this.generateUniqueId();
            await this.updateRuleInStorage(rule);
            await this.updateUsageRecordsRuleId(oldId, rule.id);
          }
        },
        details: { duplicateId, rules: duplicateRules }
      });
    }

    return issues;
  }

  /**
   * 检查重复规则名称
   */
  checkDuplicateNames(rules: ExceptionRule[]): IntegrityIssue[] {
    const issues: IntegrityIssue[] = [];
    const nameGroups = new Map<string, ExceptionRule[]>();

    // 按名称分组
    for (const rule of rules.filter(r => r.isActive)) {
      const normalizedName = rule.name.toLowerCase().trim();
      if (!nameGroups.has(normalizedName)) {
        nameGroups.set(normalizedName, []);
      }
      nameGroups.get(normalizedName)!.push(rule);
    }

    // 检查重复
    for (const [name, rulesWithSameName] of nameGroups) {
      if (rulesWithSameName.length > 1) {
        issues.push({
          type: 'duplicate_name',
          severity: 'warning',
          description: `发现重复的规则名称: "${rulesWithSameName[0].name}"`,
          affectedItems: rulesWithSameName.map(r => r.id),
          autoFixable: true,
          fixAction: async () => {
            // 为除第一个外的规则重命名
            for (let i = 1; i < rulesWithSameName.length; i++) {
              const rule = rulesWithSameName[i];
              rule.name = `${rule.name} (${i + 1})`;
              await this.updateRuleInStorage(rule);
            }
          },
          details: { originalName: name, rules: rulesWithSameName }
        });
      }
    }

    return issues;
  }

  /**
   * 检查规则完整性
   */
  private async checkRulesIntegrity(rules: ExceptionRule[]): Promise<IntegrityIssue[]> {
    const issues: IntegrityIssue[] = [];

    // 检查ID问题
    issues.push(...this.validateRuleIds(rules));

    // 检查重复名称
    issues.push(...this.checkDuplicateNames(rules));

    // 检查其他字段
    for (const rule of rules) {
      // 检查名称
      if (!rule.name || rule.name.trim().length === 0) {
        issues.push({
          type: 'invalid_type',
          severity: 'critical',
          description: `规则 ID ${rule.id} 缺少名称`,
          affectedItems: [rule.id],
          autoFixable: false,
          details: { rule }
        });
      }

      // 检查类型
      if (!rule.type) {
        issues.push({
          type: 'invalid_type',
          severity: 'critical',
          description: `规则 "${rule.name}" 缺少类型`,
          affectedItems: [rule.id],
          autoFixable: true,
          fixAction: async () => {
            // 默认设置为暂停类型
            rule.type = ExceptionRuleType.PAUSE_ONLY;
            await this.updateRuleInStorage(rule);
          },
          details: { rule }
        });
      } else if (!Object.values(ExceptionRuleType).includes(rule.type)) {
        issues.push({
          type: 'invalid_type',
          severity: 'critical',
          description: `规则 "${rule.name}" 的类型无效: ${rule.type}`,
          affectedItems: [rule.id],
          autoFixable: true,
          fixAction: async () => {
            rule.type = ExceptionRuleType.PAUSE_ONLY;
            await this.updateRuleInStorage(rule);
          },
          details: { rule, invalidType: rule.type }
        });
      }

      // 检查创建时间
      if (!rule.createdAt) {
        issues.push({
          type: 'missing_created_at',
          severity: 'warning',
          description: `规则 "${rule.name}" 缺少创建时间`,
          affectedItems: [rule.id],
          autoFixable: true,
          fixAction: async () => {
            rule.createdAt = new Date();
            await this.updateRuleInStorage(rule);
          },
          details: { rule }
        });
      }

      // 检查使用计数
      if (typeof rule.usageCount !== 'number' || rule.usageCount < 0) {
        issues.push({
          type: 'invalid_usage_count',
          severity: 'warning',
          description: `规则 "${rule.name}" 的使用计数无效: ${rule.usageCount}`,
          affectedItems: [rule.id],
          autoFixable: true,
          fixAction: async () => {
            rule.usageCount = 0;
            await this.updateRuleInStorage(rule);
          },
          details: { rule, invalidCount: rule.usageCount }
        });
      }
    }

    return issues;
  }

  /**
   * 检查使用记录完整性
   */
  private async checkUsageRecordsIntegrity(
    records: RuleUsageRecord[], 
    rules: ExceptionRule[]
  ): Promise<IntegrityIssue[]> {
    const issues: IntegrityIssue[] = [];
    const ruleIds = new Set(rules.map(r => r.id));

    for (const record of records) {
      // 检查孤立记录
      if (!ruleIds.has(record.ruleId)) {
        issues.push({
          type: 'orphaned_record',
          severity: 'warning',
          description: `使用记录引用了不存在的规则ID: ${record.ruleId}`,
          affectedItems: [record.id],
          autoFixable: true,
          fixAction: async () => {
            await this.removeUsageRecord(record.id);
          },
          details: { record }
        });
      }

      // 检查记录字段完整性
      if (!record.usedAt) {
        issues.push({
          type: 'missing_created_at',
          severity: 'warning',
          description: `使用记录 ${record.id} 缺少使用时间`,
          affectedItems: [record.id],
          autoFixable: true,
          fixAction: async () => {
            record.usedAt = new Date();
            await this.updateUsageRecord(record);
          },
          details: { record }
        });
      }
    }

    return issues;
  }

  /**
   * 检查数据一致性
   */
  private async checkDataConsistency(
    rules: ExceptionRule[], 
    records: RuleUsageRecord[]
  ): Promise<IntegrityIssue[]> {
    const issues: IntegrityIssue[] = [];

    // 检查使用计数一致性
    const usageCountMap = new Map<string, number>();
    for (const record of records) {
      const count = usageCountMap.get(record.ruleId) || 0;
      usageCountMap.set(record.ruleId, count + 1);
    }

    for (const rule of rules) {
      const actualCount = usageCountMap.get(rule.id) || 0;
      if (rule.usageCount !== actualCount) {
        issues.push({
          type: 'invalid_usage_count',
          severity: 'info',
          description: `规则 "${rule.name}" 的使用计数不一致，记录显示 ${actualCount}，但规则显示 ${rule.usageCount}`,
          affectedItems: [rule.id],
          autoFixable: true,
          fixAction: async () => {
            rule.usageCount = actualCount;
            await this.updateRuleInStorage(rule);
          },
          details: { rule, actualCount, recordedCount: rule.usageCount }
        });
      }
    }

    return issues;
  }

  /**
   * 生成摘要
   */
  private generateSummary(issues: IntegrityIssue[]): IntegrityReport['summary'] {
    const summary = {
      totalIssues: issues.length,
      criticalIssues: 0,
      warningIssues: 0,
      infoIssues: 0,
      autoFixableIssues: 0
    };

    for (const issue of issues) {
      switch (issue.severity) {
        case 'critical':
          summary.criticalIssues++;
          break;
        case 'warning':
          summary.warningIssues++;
          break;
        case 'info':
          summary.infoIssues++;
          break;
      }

      if (issue.autoFixable) {
        summary.autoFixableIssues++;
      }
    }

    return summary;
  }

  /**
   * 生成建议
   */
  private generateRecommendations(issues: IntegrityIssue[]): string[] {
    const recommendations: string[] = [];

    const criticalIssues = issues.filter(i => i.severity === 'critical');
    if (criticalIssues.length > 0) {
      recommendations.push(`发现 ${criticalIssues.length} 个严重问题，建议立即修复`);
    }

    const autoFixableIssues = issues.filter(i => i.autoFixable);
    if (autoFixableIssues.length > 0) {
      recommendations.push(`有 ${autoFixableIssues.length} 个问题可以自动修复`);
    }

    const duplicateNames = issues.filter(i => i.type === 'duplicate_name');
    if (duplicateNames.length > 0) {
      recommendations.push('建议为重复的规则名称添加区分标识');
    }

    const orphanedRecords = issues.filter(i => i.type === 'orphaned_record');
    if (orphanedRecords.length > 0) {
      recommendations.push('建议清理孤立的使用记录');
    }

    if (issues.length === 0) {
      recommendations.push('数据完整性良好，无需修复');
    }

    return recommendations;
  }

  /**
   * 辅助方法
   */
  private generateUniqueId(): string {
    return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private isValidId(id: string): boolean {
    return typeof id === 'string' && id.length > 0 && !id.includes(' ');
  }

  private async updateRuleInStorage(rule: ExceptionRule): Promise<void> {
    await exceptionRuleStorage.updateRule(rule.id, rule);
  }

  private async updateUsageRecordsRuleId(oldId: string, newId: string): Promise<void> {
    const records = await exceptionRuleStorage.getUsageRecords();
    const updatedRecords = records.map(record => 
      record.ruleId === oldId ? { ...record, ruleId: newId } : record
    );
    
    // 这里需要实现批量更新使用记录的方法
    // 暂时使用简单的方式
    for (const record of updatedRecords.filter(r => r.ruleId === newId)) {
      await this.updateUsageRecord(record);
    }
  }

  private async removeUsageRecord(recordId: string): Promise<void> {
    // 实现删除使用记录的逻辑
    const records = await exceptionRuleStorage.getUsageRecords();
    const filteredRecords = records.filter(r => r.id !== recordId);
    // 需要实现保存过滤后记录的方法
  }

  private async updateUsageRecord(record: RuleUsageRecord): Promise<void> {
    // 实现更新使用记录的逻辑
    // 这里需要扩展 exceptionRuleStorage 的功能
  }

  /**
   * 获取修复历史
   */
  getFixHistory(): FixResult[] {
    return [...this.fixHistory];
  }

  /**
   * 清除修复历史
   */
  clearFixHistory(): void {
    this.fixHistory = [];
  }
}

// 创建全局实例
export const dataIntegrityChecker = new DataIntegrityChecker();