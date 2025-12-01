/**
 * 例外规则数据迁移服务
 * 处理从旧的 Chain.exceptions 格式迁移到新的例外规则系统
 */

import { Chain, ExceptionRule, ExceptionRuleType } from '../types';
import { exceptionRuleManager } from './ExceptionRuleManager';
import { storage } from '../utils/storage';

export interface MigrationResult {
  totalChains: number;
  migratedRules: number;
  skippedRules: number;
  errors: Array<{ chainId: string; chainName: string; error: string }>;
  createdRules: ExceptionRule[];
  migrationTime: Date;
}

export interface MigrationProgress {
  currentChain: number;
  totalChains: number;
  currentChainName: string;
  phase: 'analyzing' | 'migrating' | 'cleanup' | 'complete';
  message: string;
}

export class ExceptionRuleMigrationService {
  private static readonly MIGRATION_KEY = 'momentum_exception_rules_migration';
  private static readonly MIGRATION_VERSION = '1.0.0';

  /**
   * 检查是否需要迁移
   */
  async needsMigration(): Promise<boolean> {
    try {
      // 检查是否已经迁移过
      const migrationInfo = this.getMigrationInfo();
      if (migrationInfo && migrationInfo.version === ExceptionRuleMigrationService.MIGRATION_VERSION) {
        return false;
      }

      // 检查是否有旧格式的数据
      const chains = await this.getLegacyChains();
      const chainsWithExceptions = chains.filter(chain => 
        chain.exceptions && chain.exceptions.length > 0
      );

      return chainsWithExceptions.length > 0;
    } catch (error) {
      console.error('检查迁移需求失败:', error);
      return false;
    }
  }

  /**
   * 执行迁移
   */
  async migrate(
    onProgress?: (progress: MigrationProgress) => void
  ): Promise<MigrationResult> {
    const startTime = new Date();
    const result: MigrationResult = {
      totalChains: 0,
      migratedRules: 0,
      skippedRules: 0,
      errors: [],
      createdRules: [],
      migrationTime: startTime
    };

    try {
      onProgress?.({
        currentChain: 0,
        totalChains: 0,
        currentChainName: '',
        phase: 'analyzing',
        message: '分析现有数据...'
      });

      // 获取所有链条
      const chains = await this.getLegacyChains();
      const chainsWithExceptions = chains.filter(chain => 
        chain.exceptions && chain.exceptions.length > 0
      );

      result.totalChains = chainsWithExceptions.length;

      if (result.totalChains === 0) {
        onProgress?.({
          currentChain: 0,
          totalChains: 0,
          currentChainName: '',
          phase: 'complete',
          message: '没有需要迁移的数据'
        });
        return result;
      }

      onProgress?.({
        currentChain: 0,
        totalChains: result.totalChains,
        currentChainName: '',
        phase: 'migrating',
        message: `开始迁移 ${result.totalChains} 个链条的例外规则...`
      });

      // 收集所有唯一的例外规则
      const uniqueRules = new Set<string>();
      for (const chain of chainsWithExceptions) {
        chain.exceptions.forEach(exception => {
          if (exception.trim()) {
            uniqueRules.add(exception.trim());
          }
        });
      }

      // 创建新的例外规则
      let currentChainIndex = 0;
      for (const ruleName of uniqueRules) {
        currentChainIndex++;
        
        onProgress?.({
          currentChain: currentChainIndex,
          totalChains: uniqueRules.size,
          currentChainName: ruleName,
          phase: 'migrating',
          message: `创建规则: ${ruleName}`
        });

        try {
          // 默认创建为暂停类型的规则
          const createResult = await exceptionRuleManager.createRule(
            ruleName,
            ExceptionRuleType.PAUSE_ONLY,
            '从旧系统迁移的规则'
          );

          result.createdRules.push(createResult.rule);
          result.migratedRules++;

        } catch (error) {
          console.warn(`创建规则 "${ruleName}" 失败:`, error);
          result.skippedRules++;
          result.errors.push({
            chainId: 'migration',
            chainName: ruleName,
            error: error instanceof Error ? error.message : '未知错误'
          });
        }
      }

      // 清理阶段
      onProgress?.({
        currentChain: result.totalChains,
        totalChains: result.totalChains,
        currentChainName: '',
        phase: 'cleanup',
        message: '完成迁移，保存迁移信息...'
      });

      // 保存迁移信息
      this.saveMigrationInfo({
        version: ExceptionRuleMigrationService.MIGRATION_VERSION,
        migratedAt: startTime,
        totalRules: result.migratedRules,
        skippedRules: result.skippedRules,
        errors: result.errors.length
      });

      onProgress?.({
        currentChain: result.totalChains,
        totalChains: result.totalChains,
        currentChainName: '',
        phase: 'complete',
        message: `迁移完成！创建了 ${result.migratedRules} 个规则`
      });

      return result;

    } catch (error) {
      console.error('迁移过程中发生错误:', error);
      result.errors.push({
        chainId: 'system',
        chainName: 'Migration System',
        error: error instanceof Error ? error.message : '系统错误'
      });
      return result;
    }
  }

  /**
   * 获取迁移建议
   */
  async getMigrationSuggestions(): Promise<{
    totalRules: number;
    uniqueRules: string[];
    duplicateRules: Array<{ rule: string; count: number; chains: string[] }>;
    recommendations: string[];
  }> {
    try {
      const chains = await this.getLegacyChains();
      const chainsWithExceptions = chains.filter(chain => 
        chain.exceptions && chain.exceptions.length > 0
      );

      // 统计规则使用情况
      const ruleUsage = new Map<string, { count: number; chains: string[] }>();
      let totalRules = 0;

      for (const chain of chainsWithExceptions) {
        for (const exception of chain.exceptions) {
          const ruleName = exception.trim();
          if (ruleName) {
            totalRules++;
            const existing = ruleUsage.get(ruleName);
            if (existing) {
              existing.count++;
              existing.chains.push(chain.name);
            } else {
              ruleUsage.set(ruleName, { count: 1, chains: [chain.name] });
            }
          }
        }
      }

      const uniqueRules = Array.from(ruleUsage.keys());
      const duplicateRules = Array.from(ruleUsage.entries())
        .filter(([_, usage]) => usage.count > 1)
        .map(([rule, usage]) => ({ rule, count: usage.count, chains: usage.chains }))
        .sort((a, b) => b.count - a.count);

      // 生成建议
      const recommendations: string[] = [];
      
      if (duplicateRules.length > 0) {
        recommendations.push(`发现 ${duplicateRules.length} 个重复使用的规则，迁移后将合并为单个规则`);
      }
      
      if (uniqueRules.length > 20) {
        recommendations.push('规则数量较多，建议迁移后进行整理和分类');
      }
      
      const commonPatterns = uniqueRules.filter(rule => 
        ['上厕所', '喝水', '休息', '接电话', '查看消息'].some(pattern => 
          rule.includes(pattern)
        )
      );
      
      if (commonPatterns.length > 0) {
        recommendations.push(`发现 ${commonPatterns.length} 个常见模式的规则，建议统一命名规范`);
      }

      if (recommendations.length === 0) {
        recommendations.push('数据结构良好，可以直接进行迁移');
      }

      return {
        totalRules,
        uniqueRules,
        duplicateRules,
        recommendations
      };

    } catch (error) {
      console.error('获取迁移建议失败:', error);
      return {
        totalRules: 0,
        uniqueRules: [],
        duplicateRules: [],
        recommendations: ['获取迁移建议失败，请检查数据完整性']
      };
    }
  }

  /**
   * 回滚迁移（如果需要）
   */
  async rollback(): Promise<{
    success: boolean;
    message: string;
    deletedRules: number;
  }> {
    try {
      const migrationInfo = this.getMigrationInfo();
      if (!migrationInfo) {
        return {
          success: false,
          message: '没有找到迁移记录',
          deletedRules: 0
        };
      }

      // 获取所有规则
      const allRules = await exceptionRuleManager.getAllRules();
      const migratedRules = allRules.filter(rule => 
        rule.description === '从旧系统迁移的规则'
      );

      // 删除迁移的规则
      let deletedCount = 0;
      for (const rule of migratedRules) {
        try {
          await exceptionRuleManager.deleteRule(rule.id);
          deletedCount++;
        } catch (error) {
          console.warn(`删除规则 ${rule.name} 失败:`, error);
        }
      }

      // 清除迁移信息
      this.clearMigrationInfo();

      return {
        success: true,
        message: `成功回滚迁移，删除了 ${deletedCount} 个规则`,
        deletedRules: deletedCount
      };

    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '回滚失败',
        deletedRules: 0
      };
    }
  }

  /**
   * 验证迁移结果
   */
  async validateMigration(): Promise<{
    isValid: boolean;
    issues: string[];
    statistics: {
      totalRules: number;
      migratedRules: number;
      activeRules: number;
    };
  }> {
    try {
      const issues: string[] = [];
      
      // 检查迁移信息
      const migrationInfo = this.getMigrationInfo();
      if (!migrationInfo) {
        issues.push('缺少迁移记录');
      }

      // 检查规则数据
      const allRules = await exceptionRuleManager.getAllRules();
      const migratedRules = allRules.filter(rule => 
        rule.description === '从旧系统迁移的规则'
      );
      const activeRules = allRules.filter(rule => rule.isActive);

      // 检查数据一致性
      if (migrationInfo && migratedRules.length !== migrationInfo.totalRules) {
        issues.push(`迁移规则数量不匹配：期望 ${migrationInfo.totalRules}，实际 ${migratedRules.length}`);
      }

      // 检查规则完整性
      for (const rule of migratedRules) {
        if (!rule.name || !rule.type) {
          issues.push(`规则 ${rule.id} 数据不完整`);
        }
      }

      return {
        isValid: issues.length === 0,
        issues,
        statistics: {
          totalRules: allRules.length,
          migratedRules: migratedRules.length,
          activeRules: activeRules.length
        }
      };

    } catch (error) {
      return {
        isValid: false,
        issues: ['验证过程中发生错误: ' + (error instanceof Error ? error.message : '未知错误')],
        statistics: {
          totalRules: 0,
          migratedRules: 0,
          activeRules: 0
        }
      };
    }
  }

  /**
   * 获取旧格式的链条数据
   */
  private async getLegacyChains(): Promise<Chain[]> {
    try {
      // 这里应该调用实际的存储服务来获取链条数据
      // 由于我们没有直接访问存储的方法，这里返回空数组
      // 在实际实现中，应该调用 storage.getChains() 或类似方法
      return [];
    } catch (error) {
      console.error('获取旧链条数据失败:', error);
      return [];
    }
  }

  /**
   * 获取迁移信息
   */
  private getMigrationInfo(): {
    version: string;
    migratedAt: Date;
    totalRules: number;
    skippedRules: number;
    errors: number;
  } | null {
    try {
      const data = localStorage.getItem(ExceptionRuleMigrationService.MIGRATION_KEY);
      if (!data) return null;
      
      const parsed = JSON.parse(data);
      return {
        ...parsed,
        migratedAt: new Date(parsed.migratedAt)
      };
    } catch (error) {
      console.error('获取迁移信息失败:', error);
      return null;
    }
  }

  /**
   * 保存迁移信息
   */
  private saveMigrationInfo(info: {
    version: string;
    migratedAt: Date;
    totalRules: number;
    skippedRules: number;
    errors: number;
  }): void {
    try {
      localStorage.setItem(
        ExceptionRuleMigrationService.MIGRATION_KEY,
        JSON.stringify(info)
      );
    } catch (error) {
      console.error('保存迁移信息失败:', error);
    }
  }

  /**
   * 清除迁移信息
   */
  private clearMigrationInfo(): void {
    try {
      localStorage.removeItem(ExceptionRuleMigrationService.MIGRATION_KEY);
    } catch (error) {
      console.error('清除迁移信息失败:', error);
    }
  }

  /**
   * 创建迁移报告
   */
  async generateMigrationReport(): Promise<string> {
    try {
      const migrationInfo = this.getMigrationInfo();
      const validation = await this.validateMigration();
      const suggestions = await this.getMigrationSuggestions();

      const report = {
        title: '例外规则迁移报告',
        generatedAt: new Date().toISOString(),
        migrationInfo,
        validation,
        suggestions,
        summary: {
          migrationCompleted: !!migrationInfo,
          validationPassed: validation.isValid,
          totalIssues: validation.issues.length,
          recommendations: suggestions.recommendations.length
        }
      };

      return JSON.stringify(report, null, 2);
    } catch (error) {
      return JSON.stringify({
        title: '例外规则迁移报告',
        generatedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : '生成报告失败'
      }, null, 2);
    }
  }
}

// 创建全局实例
export const exceptionRuleMigration = new ExceptionRuleMigrationService();