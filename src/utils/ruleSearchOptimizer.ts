/**
 * 规则搜索优化器
 * 提供智能搜索、建议和性能优化功能
 */

import { ExceptionRule, ExceptionRuleType } from '../types';

export interface SearchResult {
  rule: ExceptionRule;
  score: number;
  matchType: 'exact' | 'prefix' | 'contains' | 'fuzzy';
  highlightRanges: Array<{ start: number; end: number }>;
}

export interface SearchSuggestion {
  text: string;
  type: 'recent' | 'popular' | 'similar';
  score: number;
}

export class RuleSearchOptimizer {
  private searchHistory: string[] = [];
  private popularSearches: Map<string, number> = new Map();
  private searchCache: Map<string, SearchResult[]> = new Map();
  private searchIndex: Map<string, ExceptionRule[]> = new Map();
  private debounceTimer: NodeJS.Timeout | null = null;
  private readonly CACHE_SIZE = 100;
  private readonly HISTORY_SIZE = 50;
  private readonly DEBOUNCE_DELAY = 200;

  /**
   * 更新搜索索引
   */
  updateIndex(rules: ExceptionRule[]): void {
    this.searchIndex.clear();
    this.searchCache.clear(); // 清除缓存以确保数据一致性
    
    rules.forEach(rule => {
      const keys = [
        String(rule.name || '').toLowerCase(),
        this.getPinyin(String(rule.name || '')),
        this.getFirstLetters(String(rule.name || '')),
        ...(rule.description ? [String(rule.description).toLowerCase()] : [])
      ];
      
      keys.forEach(key => {
        if (!this.searchIndex.has(key)) {
          this.searchIndex.set(key, []);
        }
        this.searchIndex.get(key)!.push(rule);
      });
    });
  }

  /**
   * 防抖搜索规则
   */
  searchRulesDebounced(
    rules: ExceptionRule[], 
    query: string, 
    callback: (results: SearchResult[]) => void
  ): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    this.debounceTimer = setTimeout(() => {
      const results = this.searchRules(rules, query);
      callback(results);
    }, this.DEBOUNCE_DELAY);
  }

  /**
   * 智能搜索规则
   */
  searchRules(rules: ExceptionRule[], query: string): SearchResult[] {
    if (!query.trim()) {
      return rules.map(rule => ({
        rule,
        score: rule.usageCount || 0,
        matchType: 'exact' as const,
        highlightRanges: []
      })).sort((a, b) => b.score - a.score);
    }

    const normalizedQuery = query.toLowerCase().trim();
    
    // 检查缓存
    const cacheKey = `${normalizedQuery}_${rules.length}`;
    if (this.searchCache.has(cacheKey)) {
      return this.searchCache.get(cacheKey)!;
    }

    const results: SearchResult[] = [];

    for (const rule of rules) {
      const searchResult = this.scoreRule(rule, normalizedQuery);
      if (searchResult.score > 0) {
        results.push(searchResult);
      }
    }

    // 按分数排序
    results.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      // 分数相同时，按使用频率排序
      return (b.rule.usageCount || 0) - (a.rule.usageCount || 0);
    });

    // 缓存结果
    this.cacheSearchResult(cacheKey, results);

    // 记录搜索历史
    this.recordSearch(query);

    return results;
  }

  /**
   * 获取搜索建议
   */
  getSearchSuggestions(query: string, rules: ExceptionRule[]): SearchSuggestion[] {
    const suggestions: SearchSuggestion[] = [];
    const normalizedQuery = query.toLowerCase().trim();

    if (!normalizedQuery) {
      // 没有查询时，返回历史和热门搜索
      suggestions.push(...this.getHistorySuggestions());
      suggestions.push(...this.getPopularSuggestions());
      return suggestions.slice(0, 5);
    }

    // 基于当前查询的建议
    suggestions.push(...this.getSimilarSuggestions(normalizedQuery, rules));
    suggestions.push(...this.getCompletionSuggestions(normalizedQuery, rules));

    return suggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  /**
   * 检测重复规则名称
   */
  detectDuplicates(name: string, existingRules: ExceptionRule[]): {
    hasExactMatch: boolean;
    exactMatches: ExceptionRule[];
    similarRules: ExceptionRule[];
  } {
    const normalizedName = name.toLowerCase().trim();
    const exactMatches: ExceptionRule[] = [];
    const similarRules: ExceptionRule[] = [];

    for (const rule of existingRules) {
      // 确保rule.name是字符串
      const ruleName = String(rule.name || '').toLowerCase();
      
      if (ruleName === normalizedName) {
        exactMatches.push(rule);
      } else if (this.calculateSimilarity(ruleName, normalizedName) > 0.7) {
        similarRules.push(rule);
      }
    }

    return {
      hasExactMatch: exactMatches.length > 0,
      exactMatches,
      similarRules
    };
  }

  /**
   * 生成智能规则名称建议
   */
  generateNameSuggestions(partialName: string, actionType: ExceptionRuleType): string[] {
    const suggestions: string[] = [];
    const normalized = partialName.toLowerCase().trim();

    // 基于动作类型的常见模式
    const patterns = this.getCommonPatterns(actionType);
    
    for (const pattern of patterns) {
      if (pattern.toLowerCase().includes(normalized) || 
          normalized.includes(pattern.toLowerCase())) {
        suggestions.push(pattern);
      }
    }

    // 基于部分输入的补全建议
    const completions = this.getCompletionPatterns(normalized);
    suggestions.push(...completions);

    return [...new Set(suggestions)].slice(0, 3);
  }

  /**
   * 清理搜索缓存
   */
  clearCache(): void {
    this.searchCache.clear();
  }

  /**
   * 获取搜索统计
   */
  getSearchStats(): {
    cacheSize: number;
    historySize: number;
    popularSearches: Array<{ query: string; count: number }>;
  } {
    return {
      cacheSize: this.searchCache.size,
      historySize: this.searchHistory.length,
      popularSearches: Array.from(this.popularSearches.entries())
        .map(([query, count]) => ({ query, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
    };
  }

  /**
   * 为规则评分
   */
  private scoreRule(rule: ExceptionRule, query: string): SearchResult {
    const name = String(rule.name || '').toLowerCase();
    const description = String(rule.description || '').toLowerCase();
    
    let score = 0;
    let matchType: SearchResult['matchType'] = 'fuzzy';
    const highlightRanges: Array<{ start: number; end: number }> = [];

    // 精确匹配
    if (name === query) {
      score = 1000;
      matchType = 'exact';
      highlightRanges.push({ start: 0, end: rule.name.length });
    }
    // 前缀匹配
    else if (name.startsWith(query)) {
      score = 800;
      matchType = 'prefix';
      highlightRanges.push({ start: 0, end: query.length });
    }
    // 包含匹配
    else if (name.includes(query)) {
      score = 600;
      matchType = 'contains';
      const index = name.indexOf(query);
      highlightRanges.push({ start: index, end: index + query.length });
    }
    // 描述匹配
    else if (description.includes(query)) {
      score = 400;
      matchType = 'contains';
    }
    // 模糊匹配
    else {
      const similarity = this.calculateSimilarity(name, query);
      if (similarity > 0.3) {
        score = Math.floor(similarity * 300);
        matchType = 'fuzzy';
      }
    }

    // 基于使用频率的加权
    if (score > 0) {
      const usageBonus = Math.min((rule.usageCount || 0) * 10, 200);
      score += usageBonus;

      // 最近使用的加权
      if (rule.lastUsedAt) {
        const daysSinceLastUse = (Date.now() - rule.lastUsedAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceLastUse < 7) {
          score += 50;
        }
      }
    }

    return {
      rule,
      score,
      matchType,
      highlightRanges
    };
  }

  /**
   * 计算字符串相似度
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * 计算编辑距离
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * 缓存搜索结果
   */
  private cacheSearchResult(key: string, results: SearchResult[]): void {
    if (this.searchCache.size >= this.CACHE_SIZE) {
      // 删除最旧的缓存项
      const firstKey = this.searchCache.keys().next().value;
      this.searchCache.delete(firstKey);
    }
    this.searchCache.set(key, results);
  }

  /**
   * 记录搜索历史
   */
  private recordSearch(query: string): void {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

    // 更新搜索历史
    this.searchHistory = this.searchHistory.filter(q => q !== trimmedQuery);
    this.searchHistory.unshift(trimmedQuery);
    
    if (this.searchHistory.length > this.HISTORY_SIZE) {
      this.searchHistory = this.searchHistory.slice(0, this.HISTORY_SIZE);
    }

    // 更新热门搜索
    const currentCount = this.popularSearches.get(trimmedQuery) || 0;
    this.popularSearches.set(trimmedQuery, currentCount + 1);
  }

  /**
   * 获取历史搜索建议
   */
  private getHistorySuggestions(): SearchSuggestion[] {
    return this.searchHistory.slice(0, 3).map((query, index) => ({
      text: query,
      type: 'recent' as const,
      score: 100 - index * 10
    }));
  }

  /**
   * 获取热门搜索建议
   */
  private getPopularSuggestions(): SearchSuggestion[] {
    return Array.from(this.popularSearches.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([query, count]) => ({
        text: query,
        type: 'popular' as const,
        score: Math.min(count * 10, 100)
      }));
  }

  /**
   * 获取相似搜索建议
   */
  private getSimilarSuggestions(query: string, rules: ExceptionRule[]): SearchSuggestion[] {
    const suggestions: SearchSuggestion[] = [];
    
    for (const rule of rules) {
      const similarity = this.calculateSimilarity(String(rule.name || '').toLowerCase(), query);
      if (similarity > 0.5 && similarity < 0.9) {
        suggestions.push({
          text: String(rule.name || ''),
          type: 'similar',
          score: Math.floor(similarity * 100)
        });
      }
    }
    
    return suggestions.slice(0, 2);
  }

  /**
   * 获取补全建议
   */
  private getCompletionSuggestions(query: string, rules: ExceptionRule[]): SearchSuggestion[] {
    const suggestions: SearchSuggestion[] = [];
    
    for (const rule of rules) {
      const name = String(rule.name || '').toLowerCase();
      if (name.startsWith(query) && name !== query) {
        suggestions.push({
          text: String(rule.name || ''),
          type: 'similar',
          score: 80 + (rule.usageCount || 0)
        });
      }
    }
    
    return suggestions.slice(0, 2);
  }

  /**
   * 获取常见模式
   */
  private getCommonPatterns(actionType: ExceptionRuleType): string[] {
    const pausePatterns = [
      '上厕所', '喝水', '接电话', '休息', '吃饭', '开会',
      '紧急事务', '家庭事务', '健康问题', '技术故障'
    ];
    
    const completionPatterns = [
      '任务完成', '提前结束', '目标达成', '紧急情况',
      '优先级变更', '资源不足', '外部依赖', '计划调整'
    ];
    
    return actionType === ExceptionRuleType.PAUSE_ONLY ? pausePatterns : completionPatterns;
  }

  /**
   * 获取补全模式
   */
  private getCompletionPatterns(partial: string): string[] {
    const patterns: Record<string, string[]> = {
      '上': ['上厕所', '上班', '上课'],
      '喝': ['喝水', '喝茶', '喝咖啡'],
      '接': ['接电话', '接客户', '接孩子'],
      '开': ['开会', '开车', '开发'],
      '紧': ['紧急事务', '紧急电话', '紧急会议'],
      '家': ['家庭事务', '家人电话', '家里有事'],
      '技': ['技术故障', '技术支持', '技术讨论'],
      '任': ['任务完成', '任务调整', '任务优先级'],
      '提': ['提前结束', '提前完成', '提前离开'],
      '目': ['目标达成', '目标调整', '目标变更']
    };
    
    return patterns[partial] || [];
  }

  /**
   * 获取拼音 (简化版本)
   */
  private getPinyin(text: string): string {
    // 简化的拼音转换，实际项目中可以使用专门的拼音库
    const pinyinMap: Record<string, string> = {
      '上': 'shang', '厕': 'ce', '所': 'suo',
      '喝': 'he', '水': 'shui', '茶': 'cha',
      '接': 'jie', '电': 'dian', '话': 'hua',
      '开': 'kai', '会': 'hui', '车': 'che',
      '紧': 'jin', '急': 'ji', '事': 'shi', '务': 'wu',
      '家': 'jia', '庭': 'ting', '人': 'ren',
      '技': 'ji', '术': 'shu', '故': 'gu', '障': 'zhang',
      '任': 'ren', '务': 'wu', '完': 'wan', '成': 'cheng',
      '提': 'ti', '前': 'qian', '结': 'jie', '束': 'shu',
      '目': 'mu', '标': 'biao', '达': 'da'
    };
    
    return text.split('').map(char => pinyinMap[char] || char).join('');
  }

  /**
   * 获取首字母
   */
  private getFirstLetters(text: string): string {
    const firstLetterMap: Record<string, string> = {
      '上': 's', '厕': 'c', '所': 's',
      '喝': 'h', '水': 's', '茶': 'c',
      '接': 'j', '电': 'd', '话': 'h',
      '开': 'k', '会': 'h', '车': 'c',
      '紧': 'j', '急': 'j', '事': 's', '务': 'w',
      '家': 'j', '庭': 't', '人': 'r',
      '技': 'j', '术': 's', '故': 'g', '障': 'z',
      '任': 'r', '务': 'w', '完': 'w', '成': 'c',
      '提': 't', '前': 'q', '结': 'j', '束': 's',
      '目': 'm', '标': 'b', '达': 'd'
    };
    
    return text.split('').map(char => firstLetterMap[char] || char.toLowerCase()).join('');
  }
}

// 导出单例实例
export const ruleSearchOptimizer = new RuleSearchOptimizer();