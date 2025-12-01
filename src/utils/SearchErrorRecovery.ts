/**
 * 搜索错误恢复机制
 * 处理搜索异常和提供降级方案
 */

import { ExceptionRule } from '../types';
import { SearchResult } from './ruleSearchOptimizer';

export interface SearchErrorRecoveryOptions {
  maxRetries?: number;
  retryDelay?: number;
  fallbackEnabled?: boolean;
}

export class SearchErrorRecovery {
  private retryCount = 0;
  private readonly maxRetries: number;
  private readonly retryDelay: number;
  private readonly fallbackEnabled: boolean;
  private fallbackCache = new Map<string, SearchResult[]>();

  constructor(options: SearchErrorRecoveryOptions = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.fallbackEnabled = options.fallbackEnabled !== false;
  }

  /**
   * 处理搜索错误
   */
  async handleSearchError(
    error: Error, 
    query: string, 
    rules: ExceptionRule[],
    originalSearchFn: (query: string, rules: ExceptionRule[]) => Promise<SearchResult[]>
  ): Promise<SearchResult[]> {
    console.warn(`Search error for query "${query}":`, error);

    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      
      // 指数退避重试
      const delay = this.retryDelay * Math.pow(2, this.retryCount - 1);
      await this.delay(delay);
      
      try {
        const results = await originalSearchFn(query, rules);
        this.retryCount = 0; // 重置重试计数
        return results;
      } catch (retryError) {
        return this.handleSearchError(retryError as Error, query, rules, originalSearchFn);
      }
    }

    // 达到最大重试次数，使用降级方案
    return this.getFallbackResults(query, rules);
  }

  /**
   * 获取降级搜索结果
   */
  private getFallbackResults(query: string, rules: ExceptionRule[]): SearchResult[] {
    if (!this.fallbackEnabled) {
      return [];
    }

    // 检查缓存
    const cacheKey = `${query}_${rules.length}`;
    if (this.fallbackCache.has(cacheKey)) {
      return this.fallbackCache.get(cacheKey)!;
    }

    // 简单的字符串匹配降级方案
    const results = this.performSimpleSearch(query, rules);
    
    // 缓存结果
    this.fallbackCache.set(cacheKey, results);
    
    return results;
  }

  /**
   * 简单搜索实现（降级方案）
   */
  private performSimpleSearch(query: string, rules: ExceptionRule[]): SearchResult[] {
    if (!query.trim()) {
      return rules.map(rule => ({
        rule,
        score: rule.usageCount || 0,
        matchType: 'exact' as const,
        highlightRanges: []
      })).sort((a, b) => b.score - a.score);
    }

    const normalizedQuery = query.toLowerCase();
    const results: SearchResult[] = [];

    for (const rule of rules) {
      const name = rule.name.toLowerCase();
      let score = 0;
      let matchType: SearchResult['matchType'] = 'fuzzy';
      const highlightRanges: Array<{ start: number; end: number }> = [];

      // 精确匹配
      if (name === normalizedQuery) {
        score = 1000;
        matchType = 'exact';
        highlightRanges.push({ start: 0, end: rule.name.length });
      }
      // 前缀匹配
      else if (name.startsWith(normalizedQuery)) {
        score = 800;
        matchType = 'prefix';
        highlightRanges.push({ start: 0, end: query.length });
      }
      // 包含匹配
      else if (name.includes(normalizedQuery)) {
        score = 600;
        matchType = 'contains';
        const index = name.indexOf(normalizedQuery);
        highlightRanges.push({ start: index, end: index + query.length });
      }

      if (score > 0) {
        // 基于使用频率的加权
        const usageBonus = Math.min((rule.usageCount || 0) * 10, 200);
        score += usageBonus;

        results.push({
          rule,
          score,
          matchType,
          highlightRanges
        });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    this.fallbackCache.clear();
  }

  /**
   * 重置重试计数
   */
  reset(): void {
    this.retryCount = 0;
  }

  /**
   * 获取错误统计
   */
  getErrorStats(): {
    retryCount: number;
    maxRetries: number;
    cacheSize: number;
  } {
    return {
      retryCount: this.retryCount,
      maxRetries: this.maxRetries,
      cacheSize: this.fallbackCache.size
    };
  }

  /**
   * 延迟工具函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 布局错误恢复机制
 */
export class LayoutErrorRecovery {
  private errorCount = 0;
  private readonly maxErrors = 5;

  /**
   * 从布局错误中恢复
   */
  recoverFromLayoutError(container?: HTMLElement): void {
    this.errorCount++;
    
    if (this.errorCount > this.maxErrors) {
      console.error('Too many layout errors, stopping recovery attempts');
      return;
    }

    try {
      const target = container || document.body;
      
      // 重置所有动态样式
      this.resetDynamicStyles(target);
      
      // 强制重新计算布局
      this.forceLayoutRecalculation();
      
      // 修复常见布局问题
      this.fixCommonLayoutIssues(target);
      
    } catch (error) {
      console.error('Layout recovery failed:', error);
    }
  }

  /**
   * 重置动态样式
   */
  private resetDynamicStyles(container: HTMLElement): void {
    const items = container.querySelectorAll('.rule-item, [data-rule-item]');
    items.forEach(item => {
      const element = item as HTMLElement;
      element.style.minHeight = '60px';
      element.style.height = 'auto';
      element.style.boxSizing = 'border-box';
    });

    const lists = container.querySelectorAll('.rule-list, [data-rule-list]');
    lists.forEach(list => {
      const element = list as HTMLElement;
      element.style.maxHeight = '400px';
      element.style.overflowY = 'auto';
    });
  }

  /**
   * 强制重新计算布局
   */
  private forceLayoutRecalculation(): void {
    requestAnimationFrame(() => {
      // 触发重排
      document.body.offsetHeight;
      
      // 触发重绘
      window.dispatchEvent(new Event('resize'));
    });
  }

  /**
   * 修复常见布局问题
   */
  private fixCommonLayoutIssues(container: HTMLElement): void {
    // 修复滚动容器
    const scrollContainers = container.querySelectorAll('[data-scroll-container]');
    scrollContainers.forEach(scrollContainer => {
      const element = scrollContainer as HTMLElement;
      element.style.overflowY = 'auto';
      element.style.overscrollBehavior = 'contain';
    });

    // 修复弹出层
    const popovers = container.querySelectorAll('[data-popover], .popover');
    popovers.forEach(popover => {
      const element = popover as HTMLElement;
      element.style.position = 'absolute';
      element.style.zIndex = '9999';
    });
  }

  /**
   * 重置错误计数
   */
  reset(): void {
    this.errorCount = 0;
  }

  /**
   * 获取错误统计
   */
  getErrorStats(): {
    errorCount: number;
    maxErrors: number;
  } {
    return {
      errorCount: this.errorCount,
      maxErrors: this.maxErrors
    };
  }
}

// 导出单例实例
export const searchErrorRecovery = new SearchErrorRecovery();
export const layoutErrorRecovery = new LayoutErrorRecovery();