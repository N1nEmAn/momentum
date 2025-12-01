/**
 * 智能规则建议系统
 * 基于使用模式、上下文和机器学习提供个性化规则推荐
 */

import { ExceptionRule, ExceptionRuleType, SessionContext, RuleUsageRecord } from '../types';
import { exceptionRuleManager } from './ExceptionRuleManager';
import { ruleScopeManager } from './RuleScopeManager';
import { exceptionRuleCache } from '../utils/exceptionRuleCache';

export interface RuleSuggestion {
  rule: ExceptionRule;
  confidence: number; // 0-1
  reason: string;
  category: 'contextual' | 'frequent' | 'recent' | 'similar' | 'pattern' | 'time_based';
  metadata?: {
    usagePattern?: string;
    timeContext?: string;
    similarityScore?: number;
  };
}

export interface UsagePattern {
  timeOfDay: { [hour: number]: number };
  dayOfWeek: { [day: number]: number };
  sessionDuration: { [range: string]: number };
  commonReasons: Array<{ reason: string; frequency: number }>;
}

export interface ContextualFactors {
  currentTime: Date;
  sessionDuration: number;
  recentActivity: string[];
  userPreferences: {
    preferredRuleTypes: ExceptionRuleType[];
    frequentlyUsedRules: string[];
  };
}

export class IntelligentRuleSuggestion {
  private readonly SUGGESTION_CACHE_TTL = 2 * 60 * 1000; // 2 minutes
  private readonly PATTERN_ANALYSIS_WINDOW = 30; // days
  private readonly MIN_CONFIDENCE_THRESHOLD = 0.3;

  /**
   * 获取智能规则建议
   */
  async getSuggestions(
    chainId: string,
    actionType: ExceptionRuleType,
    context?: Partial<ContextualFactors>
  ): Promise<RuleSuggestion[]> {
    try {
      const cacheKey = `intelligent_suggestions_${chainId}_${actionType}_${Date.now() - (Date.now() % 60000)}`;
      
      // 尝试从缓存获取
      let suggestions = exceptionRuleCache.get<RuleSuggestion[]>(cacheKey);
      if (suggestions) {
        return suggestions;
      }

      // 获取可用规则
      const availableRules = await ruleScopeManager.getAvailableRules(chainId, actionType);
      if (availableRules.length === 0) {
        return [];
      }

      // 构建上下文因素
      const contextualFactors = await this.buildContextualFactors(chainId, context);
      
      // 生成各类建议
      const allSuggestions: RuleSuggestion[] = [];
      
      // 1. 基于上下文的建议
      allSuggestions.push(...await this.getContextualSuggestions(availableRules, contextualFactors));
      
      // 2. 基于使用频率的建议
      allSuggestions.push(...await this.getFrequencyBasedSuggestions(availableRules));
      
      // 3. 基于最近使用的建议
      allSuggestions.push(...await this.getRecentUsageSuggestions(availableRules));
      
      // 4. 基于相似模式的建议
      allSuggestions.push(...await this.getPatternBasedSuggestions(availableRules, chainId));
      
      // 5. 基于时间的建议
      allSuggestions.push(...await this.getTimeBasedSuggestions(availableRules, contextualFactors.currentTime));

      // 去重、排序和过滤
      suggestions = this.processAndRankSuggestions(allSuggestions);
      
      // 缓存结果
      exceptionRuleCache.set(cacheKey, suggestions, this.SUGGESTION_CACHE_TTL);
      
      return suggestions;
    } catch (error) {
      console.error('获取智能建议失败:', error);
      return [];
    }
  }

  /**
   * 分析用户使用模式
   */
  async analyzeUsagePatterns(chainId: string): Promise<UsagePattern> {
    try {
      const cacheKey = `usage_patterns_${chainId}`;
      let patterns = exceptionRuleCache.get<UsagePattern>(cacheKey);
      
      if (patterns) {
        return patterns;
      }

      // 获取使用记录
      const usageRecords = await this.getRecentUsageRecords(chainId);
      
      patterns = {
        timeOfDay: this.analyzeTimeOfDayPattern(usageRecords),
        dayOfWeek: this.analyzeDayOfWeekPattern(usageRecords),
        sessionDuration: this.analyzeSessionDurationPattern(usageRecords),
        commonReasons: this.analyzeCommonReasons(usageRecords)
      };

      // 缓存模式分析结果
      exceptionRuleCache.set(cacheKey, patterns, 10 * 60 * 1000); // 10分钟缓存
      
      return patterns;
    } catch (error) {
      console.error('分析使用模式失败:', error);
      return {
        timeOfDay: {},
        dayOfWeek: {},
        sessionDuration: {},
        commonReasons: []
      };
    }
  }

  /**
   * 预测规则使用概率
   */
  async predictRuleUsage(
    rule: ExceptionRule,
    context: ContextualFactors
  ): Promise<{ probability: number; factors: string[] }> {
    try {
      let probability = 0;
      const factors: string[] = [];

      // 基于历史使用频率
      const usageFrequency = (rule.usageCount || 0) / 100; // 标准化到0-1
      probability += Math.min(usageFrequency, 0.4);
      if (usageFrequency > 0.1) {
        factors.push(`历史使用${rule.usageCount}次`);
      }

      // 基于最近使用
      if (rule.lastUsedAt) {
        const daysSinceLastUse = (context.currentTime.getTime() - rule.lastUsedAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceLastUse <= 1) {
          probability += 0.3;
          factors.push('最近24小时内使用过');
        } else if (daysSinceLastUse <= 7) {
          probability += 0.2;
          factors.push('最近一周内使用过');
        }
      }

      // 基于时间上下文
      const timeScore = await this.calculateTimeContextScore(rule, context.currentTime);
      probability += timeScore * 0.2;
      if (timeScore > 0.5) {
        factors.push('符合时间使用模式');
      }

      // 基于规则作用域
      if (rule.scope === 'chain') {
        probability += 0.1;
        factors.push('任务专属规则');
      }

      // 基于用户偏好
      if (context.userPreferences.frequentlyUsedRules.includes(rule.id)) {
        probability += 0.2;
        factors.push('用户偏好规则');
      }

      return {
        probability: Math.min(probability, 1),
        factors
      };
    } catch (error) {
      console.error('预测规则使用概率失败:', error);
      return { probability: 0, factors: [] };
    }
  }

  /**
   * 获取规则推荐解释
   */
  getRecommendationExplanation(suggestion: RuleSuggestion): string {
    const explanations = {
      contextual: '基于当前上下文推荐',
      frequent: `因为使用频率高(${suggestion.rule.usageCount}次)`,
      recent: '因为最近使用过',
      similar: '基于相似使用模式推荐',
      pattern: '符合您的使用习惯',
      time_based: '基于时间使用模式推荐'
    };

    let explanation = explanations[suggestion.category] || '智能推荐';
    
    if (suggestion.metadata?.timeContext) {
      explanation += ` (${suggestion.metadata.timeContext})`;
    }
    
    if (suggestion.metadata?.similarityScore && suggestion.metadata.similarityScore > 0.8) {
      explanation += ' (高度匹配)';
    }

    return explanation;
  }

  /**
   * 构建上下文因素
   */
  private async buildContextualFactors(
    chainId: string,
    context?: Partial<ContextualFactors>
  ): Promise<ContextualFactors> {
    const defaultFactors: ContextualFactors = {
      currentTime: new Date(),
      sessionDuration: 0,
      recentActivity: [],
      userPreferences: {
        preferredRuleTypes: [ExceptionRuleType.PAUSE_ONLY],
        frequentlyUsedRules: []
      }
    };

    // 获取用户偏好
    try {
      const recentRules = await exceptionRuleManager.getAllRules();
      const frequentRules = recentRules
        .filter(rule => (rule.usageCount || 0) > 3)
        .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
        .slice(0, 5)
        .map(rule => rule.id);
      
      defaultFactors.userPreferences.frequentlyUsedRules = frequentRules;
    } catch (error) {
      console.error('获取用户偏好失败:', error);
    }

    return { ...defaultFactors, ...context };
  }

  /**
   * 获取基于上下文的建议
   */
  private async getContextualSuggestions(
    rules: ExceptionRule[],
    context: ContextualFactors
  ): Promise<RuleSuggestion[]> {
    const suggestions: RuleSuggestion[] = [];
    const currentHour = context.currentTime.getHours();

    // 基于时间的上下文建议
    const timeContextRules = this.getTimeContextRules(currentHour);
    
    for (const rule of rules) {
      const ruleName = rule.name.toLowerCase();
      let confidence = 0;
      let reason = '';
      let timeContext = '';

      // 检查是否匹配时间上下文
      for (const [pattern, contextInfo] of Object.entries(timeContextRules)) {
        if (ruleName.includes(pattern)) {
          confidence = contextInfo.confidence;
          reason = contextInfo.reason;
          timeContext = contextInfo.timeContext;
          break;
        }
      }

      if (confidence > this.MIN_CONFIDENCE_THRESHOLD) {
        suggestions.push({
          rule,
          confidence,
          reason,
          category: 'contextual',
          metadata: { timeContext }
        });
      }
    }

    return suggestions;
  }

  /**
   * 获取基于频率的建议
   */
  private async getFrequencyBasedSuggestions(rules: ExceptionRule[]): Promise<RuleSuggestion[]> {
    return rules
      .filter(rule => (rule.usageCount || 0) > 0)
      .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
      .slice(0, 3)
      .map(rule => ({
        rule,
        confidence: Math.min((rule.usageCount || 0) / 10, 0.9),
        reason: `使用了${rule.usageCount}次`,
        category: 'frequent' as const
      }));
  }

  /**
   * 获取基于最近使用的建议
   */
  private async getRecentUsageSuggestions(rules: ExceptionRule[]): Promise<RuleSuggestion[]> {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    return rules
      .filter(rule => rule.lastUsedAt && rule.lastUsedAt > oneDayAgo)
      .sort((a, b) => {
        const timeA = a.lastUsedAt ? a.lastUsedAt.getTime() : 0;
        const timeB = b.lastUsedAt ? b.lastUsedAt.getTime() : 0;
        return timeB - timeA;
      })
      .slice(0, 2)
      .map(rule => ({
        rule,
        confidence: 0.7,
        reason: '最近使用过',
        category: 'recent' as const
      }));
  }

  /**
   * 获取基于模式的建议
   */
  private async getPatternBasedSuggestions(
    rules: ExceptionRule[],
    chainId: string
  ): Promise<RuleSuggestion[]> {
    try {
      const patterns = await this.analyzeUsagePatterns(chainId);
      const suggestions: RuleSuggestion[] = [];

      // 基于常见原因的建议
      for (const commonReason of patterns.commonReasons.slice(0, 3)) {
        const matchingRule = rules.find(rule => 
          rule.name.toLowerCase().includes(commonReason.reason.toLowerCase())
        );
        
        if (matchingRule) {
          suggestions.push({
            rule: matchingRule,
            confidence: Math.min(commonReason.frequency / 10, 0.8),
            reason: `常用原因: ${commonReason.reason}`,
            category: 'pattern',
            metadata: { usagePattern: commonReason.reason }
          });
        }
      }

      return suggestions;
    } catch (error) {
      console.error('获取模式建议失败:', error);
      return [];
    }
  }

  /**
   * 获取基于时间的建议
   */
  private async getTimeBasedSuggestions(
    rules: ExceptionRule[],
    currentTime: Date
  ): Promise<RuleSuggestion[]> {
    const suggestions: RuleSuggestion[] = [];
    const hour = currentTime.getHours();
    const dayOfWeek = currentTime.getDay();

    // 基于时间的规则推荐逻辑
    const timeBasedRules = this.getTimeBasedRuleRecommendations(hour, dayOfWeek);
    
    for (const rule of rules) {
      const ruleName = rule.name.toLowerCase();
      
      for (const timeRule of timeBasedRules) {
        if (ruleName.includes(timeRule.keyword)) {
          suggestions.push({
            rule,
            confidence: timeRule.confidence,
            reason: timeRule.reason,
            category: 'time_based',
            metadata: { timeContext: timeRule.timeContext }
          });
          break;
        }
      }
    }

    return suggestions;
  }

  /**
   * 处理和排序建议
   */
  private processAndRankSuggestions(suggestions: RuleSuggestion[]): RuleSuggestion[] {
    // 去重
    const uniqueSuggestions = new Map<string, RuleSuggestion>();
    
    for (const suggestion of suggestions) {
      const existing = uniqueSuggestions.get(suggestion.rule.id);
      if (!existing || suggestion.confidence > existing.confidence) {
        uniqueSuggestions.set(suggestion.rule.id, suggestion);
      }
    }

    // 排序和过滤
    return Array.from(uniqueSuggestions.values())
      .filter(suggestion => suggestion.confidence >= this.MIN_CONFIDENCE_THRESHOLD)
      .sort((a, b) => {
        // 首先按置信度排序
        if (b.confidence !== a.confidence) {
          return b.confidence - a.confidence;
        }
        // 然后按使用频率排序
        return (b.rule.usageCount || 0) - (a.rule.usageCount || 0);
      })
      .slice(0, 5); // 最多返回5个建议
  }

  /**
   * 获取时间上下文规则
   */
  private getTimeContextRules(hour: number): Record<string, { confidence: number; reason: string; timeContext: string }> {
    if (hour >= 9 && hour <= 11) {
      return {
        '上厕所': { confidence: 0.7, reason: '上午常见需求', timeContext: '上午时段' },
        '喝水': { confidence: 0.6, reason: '补充水分', timeContext: '上午时段' },
        '接电话': { confidence: 0.5, reason: '工作时间', timeContext: '工作时间' }
      };
    } else if (hour >= 14 && hour <= 16) {
      return {
        '休息': { confidence: 0.6, reason: '下午休息时间', timeContext: '下午时段' },
        '喝茶': { confidence: 0.5, reason: '下午茶时间', timeContext: '下午茶时间' },
        '上厕所': { confidence: 0.5, reason: '下午常见需求', timeContext: '下午时段' }
      };
    } else if (hour >= 18 && hour <= 20) {
      return {
        '吃饭': { confidence: 0.8, reason: '晚餐时间', timeContext: '晚餐时间' },
        '家庭事务': { confidence: 0.6, reason: '下班时间', timeContext: '下班时间' }
      };
    }
    return {};
  }

  /**
   * 获取基于时间的规则推荐
   */
  private getTimeBasedRuleRecommendations(hour: number, dayOfWeek: number) {
    const recommendations = [];

    // 工作日逻辑
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      if (hour >= 9 && hour <= 17) {
        recommendations.push(
          { keyword: '会议', confidence: 0.6, reason: '工作时间常见', timeContext: '工作时间' },
          { keyword: '电话', confidence: 0.5, reason: '工作沟通', timeContext: '工作时间' }
        );
      }
    }

    // 午餐时间
    if (hour >= 11 && hour <= 13) {
      recommendations.push(
        { keyword: '吃饭', confidence: 0.8, reason: '午餐时间', timeContext: '午餐时间' },
        { keyword: '休息', confidence: 0.6, reason: '午休时间', timeContext: '午休时间' }
      );
    }

    return recommendations;
  }

  /**
   * 获取最近使用记录
   */
  private async getRecentUsageRecords(chainId: string): Promise<RuleUsageRecord[]> {
    try {
      // 这里应该从实际的存储中获取使用记录
      // 目前返回模拟数据
      return [];
    } catch (error) {
      console.error('获取使用记录失败:', error);
      return [];
    }
  }

  /**
   * 分析时间使用模式
   */
  private analyzeTimeOfDayPattern(records: RuleUsageRecord[]): { [hour: number]: number } {
    const pattern: { [hour: number]: number } = {};
    
    for (const record of records) {
      const hour = record.usedAt.getHours();
      pattern[hour] = (pattern[hour] || 0) + 1;
    }
    
    return pattern;
  }

  /**
   * 分析星期使用模式
   */
  private analyzeDayOfWeekPattern(records: RuleUsageRecord[]): { [day: number]: number } {
    const pattern: { [day: number]: number } = {};
    
    for (const record of records) {
      const day = record.usedAt.getDay();
      pattern[day] = (pattern[day] || 0) + 1;
    }
    
    return pattern;
  }

  /**
   * 分析会话时长模式
   */
  private analyzeSessionDurationPattern(records: RuleUsageRecord[]): { [range: string]: number } {
    // 简化实现
    return {
      'short': 0.3,
      'medium': 0.5,
      'long': 0.2
    };
  }

  /**
   * 分析常见原因
   */
  private analyzeCommonReasons(records: RuleUsageRecord[]): Array<{ reason: string; frequency: number }> {
    // 简化实现，返回常见的中断原因
    return [
      { reason: '上厕所', frequency: 8 },
      { reason: '喝水', frequency: 6 },
      { reason: '接电话', frequency: 4 },
      { reason: '休息', frequency: 5 }
    ];
  }

  /**
   * 计算时间上下文分数
   */
  private async calculateTimeContextScore(rule: ExceptionRule, currentTime: Date): Promise<number> {
    // 简化实现
    const hour = currentTime.getHours();
    const ruleName = rule.name.toLowerCase();
    
    if ((hour >= 11 && hour <= 13) && ruleName.includes('吃饭')) {
      return 0.9;
    }
    
    if ((hour >= 14 && hour <= 16) && ruleName.includes('休息')) {
      return 0.7;
    }
    
    return 0.3;
  }
}

// 导出单例实例
export const intelligentRuleSuggestion = new IntelligentRuleSuggestion();