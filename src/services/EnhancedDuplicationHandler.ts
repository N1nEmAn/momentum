/**
 * 增强的重复规则处理服务
 * 提供实时重复检测、用户友好的处理选项和智能建议
 */

import { 
  ExceptionRule, 
  ExceptionRuleType, 
  ExceptionRuleError, 
  ExceptionRuleException 
} from '../types';
import { exceptionRuleStorage } from './ExceptionRuleStorage';

export interface DuplicationCheckResult {
  hasConflict: boolean;
  conflictType: 'exact' | 'similar' | 'none';
  existingRules: ExceptionRule[];
  suggestions: DuplicationSuggestion[];
  canProceed: boolean;
}

export interface DuplicationSuggestion {
  type: 'use_existing' | 'modify_name' | 'create_anyway' | 'merge_rules';
  title: string;
  description: string;
  rule?: ExceptionRule;
  suggestedName?: string;
  handler: () => Promise<ExceptionRule | null>;
}

export interface RealTimeDuplicationCheck {
  isChecking: boolean;
  hasConflict: boolean;
  conflictMessage?: string;
  suggestions: DuplicationSuggestion[];
}

export class EnhancedDuplicationHandler {
  private checkCache = new Map<string, { result: DuplicationCheckResult; timestamp: number }>();
  private readonly CACHE_TTL = 2 * 60 * 1000; // 2分钟缓存

  /**
   * 实时重复检测（用于用户输入时）
   */
  async checkDuplicationRealTime(name: string, excludeId?: string): Promise<RealTimeDuplicationCheck> {
    if (!name || name.trim().length === 0) {
      return {
        isChecking: false,
        hasConflict: false,
        suggestions: []
      };
    }

    try {
      const result = await this.checkDuplication(name.trim(), excludeId);
      
      return {
        isChecking: false,
        hasConflict: result.hasConflict,
        conflictMessage: result.hasConflict ? this.getConflictMessage(result) : undefined,
        suggestions: result.suggestions
      };
    } catch (error) {
      return {
        isChecking: false,
        hasConflict: false,
        suggestions: [{
          type: 'create_anyway',
          title: '继续创建',
          description: '检查失败，但可以尝试创建',
          handler: async () => null
        }]
      };
    }
  }

  /**
   * 完整的重复检查
   */
  async checkDuplication(name: string, excludeId?: string): Promise<DuplicationCheckResult> {
    const cacheKey = `${name}_${excludeId || 'new'}`;
    
    // 检查缓存
    const cached = this.checkCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.result;
    }

    try {
      const allRules = await exceptionRuleStorage.getRules();
      const activeRules = allRules.filter(rule => 
        rule.isActive && (!excludeId || rule.id !== excludeId)
      );

      // 检查完全匹配
      const exactMatches = activeRules.filter(rule => 
        rule.name.toLowerCase() === name.toLowerCase()
      );

      // 检查相似匹配
      const similarMatches = activeRules.filter(rule => 
        rule.name.toLowerCase() !== name.toLowerCase() &&
        this.calculateSimilarity(rule.name, name) > 0.7
      );

      let conflictType: 'exact' | 'similar' | 'none' = 'none';
      let existingRules: ExceptionRule[] = [];
      
      if (exactMatches.length > 0) {
        conflictType = 'exact';
        existingRules = exactMatches;
      } else if (similarMatches.length > 0) {
        conflictType = 'similar';
        existingRules = similarMatches;
      }

      const result: DuplicationCheckResult = {
        hasConflict: conflictType !== 'none',
        conflictType,
        existingRules,
        suggestions: this.generateSuggestions(name, conflictType, existingRules),
        canProceed: conflictType !== 'exact'
      };

      // 缓存结果
      this.checkCache.set(cacheKey, { result, timestamp: Date.now() });
      
      return result;

    } catch (error) {
      throw new ExceptionRuleException(
        ExceptionRuleError.STORAGE_ERROR,
        `重复检查失败: ${error instanceof Error ? error.message : '未知错误'}`,
        error
      );
    }
  }

  /**
   * 处理重复规则创建请求
   */
  async handleDuplicateCreation(
    name: string,
    type: ExceptionRuleType,
    description?: string,
    userChoice?: 'use_existing' | 'modify_name' | 'create_anyway'
  ): Promise<{
    rule: ExceptionRule;
    action: string;
    warnings: string[];
  }> {
    const checkResult = await this.checkDuplication(name);
    
    if (!checkResult.hasConflict) {
      // 没有冲突，直接创建
      const rule = await exceptionRuleStorage.createRule({
        name: name.trim(),
        type,
        description: description?.trim(),
        scope: 'global',
        chainId: undefined,
        isArchived: false
      });
      
      return {
        rule,
        action: 'created_new',
        warnings: []
      };
    }

    // 有冲突，根据用户选择处理
    switch (userChoice) {
      case 'use_existing':
        return this.handleUseExisting(checkResult.existingRules, type);
      
      case 'modify_name':
        return this.handleModifyName(name, type, description);
      
      case 'create_anyway':
        if (checkResult.conflictType === 'exact') {
          throw new ExceptionRuleException(
            ExceptionRuleError.DUPLICATE_RULE_NAME,
            `不能创建重复名称的规则: "${name}"`
          );
        }
        return this.handleCreateAnyway(name, type, description, checkResult);
      
      default:
        // 没有用户选择，抛出异常让用户决定
        throw new ExceptionRuleException(
          ExceptionRuleError.DUPLICATE_RULE_NAME,
          this.getConflictMessage(checkResult),
          { 
            checkResult,
            suggestions: checkResult.suggestions
          }
        );
    }
  }

  /**
   * 生成智能的名称建议
   */
  generateNameSuggestions(baseName: string, existingNames: string[]): string[] {
    const suggestions: string[] = [];
    const baseNameLower = baseName.toLowerCase();
    
    // 数字后缀建议
    for (let i = 2; i <= 5; i++) {
      const suggestion = `${baseName} ${i}`;
      if (!existingNames.some(name => name.toLowerCase() === suggestion.toLowerCase())) {
        suggestions.push(suggestion);
      }
    }
    
    // 描述性后缀建议
    const descriptiveSuffixes = ['新', '备用', '临时', '特殊'];
    for (const suffix of descriptiveSuffixes) {
      const suggestion = `${baseName}(${suffix})`;
      if (!existingNames.some(name => name.toLowerCase() === suggestion.toLowerCase())) {
        suggestions.push(suggestion);
      }
    }
    
    // 时间戳后缀（作为最后选择）
    const timestamp = new Date().toLocaleDateString('zh-CN', { 
      month: '2-digit', 
      day: '2-digit' 
    }).replace(/\//g, '');
    const timestampSuggestion = `${baseName}_${timestamp}`;
    if (!existingNames.some(name => name.toLowerCase() === timestampSuggestion.toLowerCase())) {
      suggestions.push(timestampSuggestion);
    }
    
    return suggestions.slice(0, 3); // 返回最多3个建议
  }

  /**
   * 计算字符串相似度
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    
    if (s1 === s2) return 1;
    
    // 使用简单的编辑距离算法
    const matrix: number[][] = [];
    const len1 = s1.length;
    const len2 = s2.length;
    
    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        if (s1[i - 1] === s2[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j - 1] + 1
          );
        }
      }
    }
    
    const maxLen = Math.max(len1, len2);
    return maxLen === 0 ? 1 : (maxLen - matrix[len1][len2]) / maxLen;
  }

  /**
   * 生成处理建议
   */
  private generateSuggestions(
    name: string, 
    conflictType: 'exact' | 'similar' | 'none', 
    existingRules: ExceptionRule[]
  ): DuplicationSuggestion[] {
    const suggestions: DuplicationSuggestion[] = [];

    if (conflictType === 'exact') {
      // 完全匹配的情况
      const existingRule = existingRules[0];
      
      suggestions.push({
        type: 'use_existing',
        title: '使用现有规则',
        description: `使用已存在的规则 "${existingRule.name}"`,
        rule: existingRule,
        handler: async () => existingRule
      });

      const nameSuggestions = this.generateNameSuggestions(
        name, 
        existingRules.map(r => r.name)
      );
      
      nameSuggestions.forEach(suggestedName => {
        suggestions.push({
          type: 'modify_name',
          title: '修改名称',
          description: `使用建议的名称 "${suggestedName}"`,
          suggestedName,
          handler: async () => null // 需要重新创建
        });
      });

    } else if (conflictType === 'similar') {
      // 相似匹配的情况
      suggestions.push({
        type: 'create_anyway',
        title: '继续创建',
        description: '名称相似但不完全相同，可以继续创建',
        handler: async () => null
      });

      if (existingRules.length > 0) {
        const mostSimilar = existingRules[0];
        suggestions.push({
          type: 'use_existing',
          title: '使用相似规则',
          description: `考虑使用相似的规则 "${mostSimilar.name}"`,
          rule: mostSimilar,
          handler: async () => mostSimilar
        });
      }
    }

    return suggestions;
  }

  /**
   * 获取冲突消息
   */
  private getConflictMessage(result: DuplicationCheckResult): string {
    if (result.conflictType === 'exact') {
      return `规则名称 "${result.existingRules[0].name}" 已存在`;
    } else if (result.conflictType === 'similar') {
      const similarNames = result.existingRules.map(r => r.name).join('", "');
      return `发现相似的规则名称: "${similarNames}"`;
    }
    return '没有发现冲突';
  }

  /**
   * 处理使用现有规则
   */
  private async handleUseExisting(
    existingRules: ExceptionRule[], 
    requestedType: ExceptionRuleType
  ): Promise<{
    rule: ExceptionRule;
    action: string;
    warnings: string[];
  }> {
    // 查找类型匹配的规则
    const matchingRule = existingRules.find(rule => rule.type === requestedType);
    
    if (matchingRule) {
      return {
        rule: matchingRule,
        action: 'used_existing',
        warnings: []
      };
    }
    
    // 如果没有类型匹配的规则，使用第一个并警告
    const rule = existingRules[0];
    const warnings = [`使用的规则类型 (${rule.type}) 与请求的类型 (${requestedType}) 不匹配`];
    
    return {
      rule,
      action: 'used_existing_different_type',
      warnings
    };
  }

  /**
   * 处理修改名称
   */
  private async handleModifyName(
    baseName: string,
    type: ExceptionRuleType,
    description?: string
  ): Promise<{
    rule: ExceptionRule;
    action: string;
    warnings: string[];
  }> {
    const allRules = await exceptionRuleStorage.getRules();
    const existingNames = allRules.map(r => r.name);
    const suggestions = this.generateNameSuggestions(baseName, existingNames);
    
    if (suggestions.length === 0) {
      throw new ExceptionRuleException(
        ExceptionRuleError.DUPLICATE_RULE_NAME,
        '无法生成可用的名称建议'
      );
    }
    
    // 使用第一个建议
    const newName = suggestions[0];
    const rule = await exceptionRuleStorage.createRule({
      name: newName,
      type,
      description,
      scope: 'global',
      chainId: undefined,
      isArchived: false
    });
    
    return {
      rule,
      action: 'created_with_modified_name',
      warnings: [`名称已修改为 "${newName}"`]
    };
  }

  /**
   * 处理强制创建
   */
  private async handleCreateAnyway(
    name: string,
    type: ExceptionRuleType,
    description: string | undefined,
    checkResult: DuplicationCheckResult
  ): Promise<{
    rule: ExceptionRule;
    action: string;
    warnings: string[];
  }> {
    const rule = await exceptionRuleStorage.createRule({
      name: name.trim(),
      type,
      description: description?.trim(),
      scope: 'global',
      chainId: undefined,
      isArchived: false
    });
    
    const warnings: string[] = [];
    if (checkResult.conflictType === 'similar') {
      const similarNames = checkResult.existingRules.map(r => r.name).join('", "');
      warnings.push(`注意：存在相似的规则名称 "${similarNames}"`);
    }
    
    return {
      rule,
      action: 'created_despite_similarity',
      warnings
    };
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.checkCache.clear();
  }

  /**
   * 清理过期缓存
   */
  cleanupExpiredCache(): void {
    const now = Date.now();
    for (const [key, value] of this.checkCache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.checkCache.delete(key);
      }
    }
  }
}

// 创建全局实例
export const enhancedDuplicationHandler = new EnhancedDuplicationHandler();