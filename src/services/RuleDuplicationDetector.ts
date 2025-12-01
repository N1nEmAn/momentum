/**
 * 规则重复检测服务
 * 检测重复规则名称和提供相似规则建议
 */

import { ExceptionRule } from '../types';
import { exceptionRuleStorage } from './ExceptionRuleStorage';

export class RuleDuplicationDetector {
  /**
   * 检测精确重复的规则名称
   */
  async checkDuplication(name: string, excludeId?: string): Promise<ExceptionRule[]> {
    const rules = await exceptionRuleStorage.getRules();
    const normalizedName = this.normalizeName(name);
    
    return rules.filter(rule => 
      rule.isActive &&
      rule.id !== excludeId &&
      this.normalizeName(rule.name) === normalizedName
    );
  }

  /**
   * 查找相似的规则名称
   */
  async findSimilarRules(name: string, threshold: number = 0.8): Promise<ExceptionRule[]> {
    const rules = await exceptionRuleStorage.getRules();
    const normalizedName = this.normalizeName(name);
    
    const similarRules: Array<{ rule: ExceptionRule; similarity: number }> = [];
    
    for (const rule of rules) {
      if (!rule.isActive) continue;
      
      const normalizedRuleName = this.normalizeName(rule.name);
      const similarity = this.calculateSimilarity(normalizedName, normalizedRuleName);
      
      if (similarity >= threshold && similarity < 1.0) { // 排除完全相同的
        similarRules.push({ rule, similarity });
      }
    }
    
    // 按相似度降序排列
    return similarRules
      .sort((a, b) => b.similarity - a.similarity)
      .map(item => item.rule);
  }

  /**
   * 建议使用现有规则
   */
  async suggestExistingRule(name: string): Promise<ExceptionRule | null> {
    // 首先检查精确匹配
    const exactMatches = await this.checkDuplication(name);
    if (exactMatches.length > 0) {
      return exactMatches[0];
    }
    
    // 然后查找高相似度的规则
    const similarRules = await this.findSimilarRules(name, 0.9);
    if (similarRules.length > 0) {
      return similarRules[0];
    }
    
    return null;
  }

  /**
   * 获取重复检测报告
   */
  async getDuplicationReport(name: string, excludeId?: string): Promise<{
    hasExactMatch: boolean;
    exactMatches: ExceptionRule[];
    hasSimilarRules: boolean;
    similarRules: Array<{ rule: ExceptionRule; similarity: number }>;
    suggestion: ExceptionRule | null;
  }> {
    const exactMatches = await this.checkDuplication(name, excludeId);
    const similarRulesData = await this.findSimilarRulesWithSimilarity(name, 0.7);
    const suggestion = await this.suggestExistingRule(name);
    
    return {
      hasExactMatch: exactMatches.length > 0,
      exactMatches,
      hasSimilarRules: similarRulesData.length > 0,
      similarRules: similarRulesData,
      suggestion
    };
  }

  /**
   * 批量检测重复规则
   */
  async batchCheckDuplication(names: string[]): Promise<Map<string, ExceptionRule[]>> {
    const results = new Map<string, ExceptionRule[]>();
    
    for (const name of names) {
      const duplicates = await this.checkDuplication(name);
      if (duplicates.length > 0) {
        results.set(name, duplicates);
      }
    }
    
    return results;
  }

  /**
   * 查找相似规则并返回相似度
   */
  private async findSimilarRulesWithSimilarity(name: string, threshold: number = 0.8): Promise<Array<{ rule: ExceptionRule; similarity: number }>> {
    const rules = await exceptionRuleStorage.getRules();
    const normalizedName = this.normalizeName(name);
    
    const similarRules: Array<{ rule: ExceptionRule; similarity: number }> = [];
    
    for (const rule of rules) {
      if (!rule.isActive) continue;
      
      const normalizedRuleName = this.normalizeName(rule.name);
      const similarity = this.calculateSimilarity(normalizedName, normalizedRuleName);
      
      if (similarity >= threshold && similarity < 1.0) {
        similarRules.push({ rule, similarity });
      }
    }
    
    return similarRules.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * 规范化规则名称
   * 移除多余空格、转换为小写、移除标点符号
   */
  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ') // 多个空格替换为单个空格
      .replace(/[^\w\s\u4e00-\u9fff]/g, '') // 移除标点符号，保留中文字符
      .replace(/\s/g, ''); // 移除所有空格
  }

  /**
   * 计算两个字符串的相似度
   * 使用 Levenshtein 距离算法
   */
  private calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    if (str1.length === 0 || str2.length === 0) return 0.0;
    
    const distance = this.levenshteinDistance(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);
    
    return 1 - (distance / maxLength);
  }

  /**
   * 计算 Levenshtein 距离
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    
    // 初始化矩阵
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    // 填充矩阵
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // 替换
            matrix[i][j - 1] + 1,     // 插入
            matrix[i - 1][j] + 1      // 删除
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * 检查是否为常见的规则模式
   */
  isCommonPattern(name: string): boolean {
    const normalizedName = this.normalizeName(name);
    const commonPatterns = [
      '上厕所', '喝水', '休息', '接电话', '查看消息', '吃东西',
      '伸懒腰', '眼睛休息', '起身活动', '整理桌面', '记录想法'
    ];
    
    return commonPatterns.some(pattern => 
      this.normalizeName(pattern) === normalizedName ||
      normalizedName.includes(this.normalizeName(pattern))
    );
  }

  /**
   * 生成规则名称建议
   */
  generateNameSuggestions(baseName: string, existingNames: string[]): string[] {
    const suggestions: string[] = [];
    const normalizedBase = this.normalizeName(baseName);
    const normalizedExisting = existingNames.map(name => this.normalizeName(name));
    
    // 添加数字后缀
    for (let i = 2; i <= 10; i++) {
      const suggestion = `${baseName} ${i}`;
      if (!normalizedExisting.includes(this.normalizeName(suggestion))) {
        suggestions.push(suggestion);
      }
    }
    
    // 添加描述性后缀
    const suffixes = ['(紧急)', '(短暂)', '(必要)', '(临时)', '(重要)'];
    for (const suffix of suffixes) {
      const suggestion = `${baseName}${suffix}`;
      if (!normalizedExisting.includes(this.normalizeName(suggestion))) {
        suggestions.push(suggestion);
      }
    }
    
    // 添加时间相关后缀
    const timeRelated = ['快速', '5分钟', '短时间', '临时'];
    for (const prefix of timeRelated) {
      const suggestion = `${prefix}${baseName}`;
      if (!normalizedExisting.includes(this.normalizeName(suggestion))) {
        suggestions.push(suggestion);
      }
    }
    
    return suggestions.slice(0, 5); // 返回最多5个建议
  }
}

// 创建全局实例
export const ruleDuplicationDetector = new RuleDuplicationDetector();