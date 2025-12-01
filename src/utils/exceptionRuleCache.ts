/**
 * 例外规则缓存管理器
 * 提供规则数据的缓存和预加载功能，提升性能
 */

import { ExceptionRule, ExceptionRuleType, RuleUsageRecord } from '../types';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

export interface CacheStats {
  totalEntries: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  memoryUsage: number; // Estimated in bytes
}

export class ExceptionRuleCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private subscribers = new Set<(chainId: string, rules: ExceptionRule[]) => void>();
  private hitCount = 0;
  private missCount = 0;
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 1000;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // 启动定期清理
    this.startCleanupInterval();
  }

  /**
   * 获取链专属规则（移除全局规则支持）
   */
  getChainRules(chainId: string): ExceptionRule[] | null {
    const cacheKey = `chain_rules_${chainId}`;
    return this.get<ExceptionRule[]>(cacheKey);
  }

  /**
   * 缓存链专属规则
   */
  setChainRules(chainId: string, rules: ExceptionRule[], ttl?: number): void {
    const cacheKey = `chain_rules_${chainId}`;
    
    // 过滤确保只有链专属规则
    const chainSpecificRules = rules.filter(rule => 
      rule.chainId === chainId && rule.scope === 'chain'
    );
    
    this.set(cacheKey, chainSpecificRules, ttl);
    
    // 通知订阅者
    this.notifySubscribers(chainId, chainSpecificRules);
  }

  /**
   * 获取缓存的规则列表（已废弃，使用 getChainRules）
   * @deprecated 使用 getChainRules 替代
   */
  getRules(key: string = 'all_rules'): ExceptionRule[] | null {
    console.warn('getRules is deprecated, use getChainRules instead');
    return this.get<ExceptionRule[]>(key);
  }

  /**
   * 缓存规则列表（已废弃，使用 setChainRules）
   * @deprecated 使用 setChainRules 替代
   */
  setRules(rules: ExceptionRule[], key: string = 'all_rules', ttl?: number): void {
    console.warn('setRules is deprecated, use setChainRules instead');
    this.set(key, rules, ttl);
  }

  /**
   * 获取缓存的规则详情
   */
  getRule(ruleId: string): ExceptionRule | null {
    return this.get<ExceptionRule>(`rule_${ruleId}`);
  }

  /**
   * 缓存规则详情
   */
  setRule(rule: ExceptionRule, ttl?: number): void {
    this.set(`rule_${rule.id}`, rule, ttl);
  }

  /**
   * 获取缓存的使用记录
   */
  getUsageRecords(key: string): RuleUsageRecord[] | null {
    return this.get<RuleUsageRecord[]>(`usage_${key}`);
  }

  /**
   * 缓存使用记录
   */
  setUsageRecords(records: RuleUsageRecord[], key: string, ttl?: number): void {
    this.set(`usage_${key}`, records, ttl);
  }

  /**
   * 获取缓存的搜索结果
   */
  getSearchResults(query: string, actionType?: ExceptionRuleType): ExceptionRule[] | null {
    const key = `search_${query}_${actionType || 'all'}`;
    return this.get<ExceptionRule[]>(key);
  }

  /**
   * 缓存搜索结果
   */
  setSearchResults(query: string, results: ExceptionRule[], actionType?: ExceptionRuleType, ttl?: number): void {
    const key = `search_${query}_${actionType || 'all'}`;
    this.set(key, results, ttl || 2 * 60 * 1000); // 搜索结果缓存2分钟
  }

  /**
   * 获取缓存的统计数据
   */
  getStats(key: string): any | null {
    return this.get(`stats_${key}`);
  }

  /**
   * 缓存统计数据
   */
  setStats(key: string, stats: any, ttl?: number): void {
    this.set(`stats_${key}`, stats, ttl || 10 * 60 * 1000); // 统计数据缓存10分钟
  }

  /**
   * 通用获取方法
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.missCount++;
      return null;
    }

    // 检查是否过期
    if (Date.now() > entry.timestamp + entry.ttl) {
      this.cache.delete(key);
      this.missCount++;
      return null;
    }

    this.hitCount++;
    return entry.data as T;
  }

  /**
   * 通用设置方法
   */
  set<T>(key: string, data: T, ttl?: number): void {
    // 检查缓存大小限制
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.evictOldest();
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.DEFAULT_TTL
    };

    this.cache.set(key, entry);
  }

  /**
   * 删除特定缓存项
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * 清除所有缓存
   */
  clear(): void {
    this.cache.clear();
    this.hitCount = 0;
    this.missCount = 0;
  }

  /**
   * 清除过期缓存
   */
  clearExpired(): number {
    const now = Date.now();
    let clearedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.timestamp + entry.ttl) {
        this.cache.delete(key);
        clearedCount++;
      }
    }

    return clearedCount;
  }

  /**
   * 预加载常用数据
   */
  async preloadCommonData(loadFunction: () => Promise<ExceptionRule[]>): Promise<void> {
    try {
      // 检查是否已有缓存
      if (this.getRules()) {
        return;
      }

      // 加载并缓存数据
      const rules = await loadFunction();
      this.setRules(rules);

      // 预加载每个规则的详情
      for (const rule of rules.slice(0, 20)) { // 只预加载前20个最常用的
        this.setRule(rule);
      }
    } catch (error) {
      console.error('预加载数据失败:', error);
    }
  }

  /**
   * 批量预加载规则详情
   */
  preloadRuleDetails(rules: ExceptionRule[]): void {
    for (const rule of rules) {
      this.setRule(rule);
    }
  }

  /**
   * 无效化相关缓存
   */
  invalidateRelated(ruleId: string): void {
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (
        key.includes(ruleId) ||
        key.startsWith('all_rules') ||
        key.startsWith('search_') ||
        key.startsWith('stats_')
      ) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * 无效化搜索缓存
   */
  invalidateSearchCache(): void {
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (key.startsWith('search_')) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): CacheStats {
    const totalRequests = this.hitCount + this.missCount;
    const hitRate = totalRequests > 0 ? this.hitCount / totalRequests : 0;
    
    // 估算内存使用量
    let memoryUsage = 0;
    for (const entry of this.cache.values()) {
      memoryUsage += this.estimateSize(entry.data);
    }

    return {
      totalEntries: this.cache.size,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate: Math.round(hitRate * 100) / 100,
      memoryUsage
    };
  }

  /**
   * 获取缓存键列表
   */
  getKeys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * 检查缓存是否存在且未过期
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() > entry.timestamp + entry.ttl) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * 获取缓存项的剩余TTL
   */
  getTTL(key: string): number {
    const entry = this.cache.get(key);
    if (!entry) return -1;
    
    const remaining = entry.timestamp + entry.ttl - Date.now();
    return Math.max(0, remaining);
  }

  /**
   * 更新缓存项的TTL
   */
  updateTTL(key: string, newTTL: number): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    entry.ttl = newTTL;
    entry.timestamp = Date.now(); // 重置时间戳
    return true;
  }

  /**
   * 驱逐最旧的缓存项
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * 启动定期清理
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.clearExpired();
    }, 60 * 1000); // 每分钟清理一次
  }

  /**
   * 停止定期清理
   */
  stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * 估算对象大小（简化版本）
   */
  private estimateSize(obj: any): number {
    const jsonString = JSON.stringify(obj);
    return jsonString.length * 2; // 假设每个字符占用2字节
  }

  /**
   * 订阅缓存更新
   */
  subscribe(callback: (chainId: string, rules: ExceptionRule[]) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * 通知订阅者
   */
  private notifySubscribers(chainId: string, rules: ExceptionRule[]): void {
    this.subscribers.forEach(callback => {
      try {
        callback(chainId, rules);
      } catch (error) {
        console.error('Subscriber notification failed:', error);
      }
    });
  }

  /**
   * 更新链规则缓存
   */
  updateChainRules(chainId: string, rules: ExceptionRule[]): void {
    this.setChainRules(chainId, rules);
    
    // 同时更新相关的搜索缓存
    this.invalidateChainSearchCache(chainId);
  }

  /**
   * 添加规则到链缓存
   */
  addRuleToChain(chainId: string, rule: ExceptionRule): void {
    const existingRules = this.getChainRules(chainId) || [];
    
    // 确保规则是链专属的
    if (rule.chainId !== chainId || rule.scope !== 'chain') {
      console.warn('Attempting to add non-chain-specific rule to chain cache');
      return;
    }
    
    const updatedRules = [...existingRules, rule];
    this.setChainRules(chainId, updatedRules);
  }

  /**
   * 从链缓存中移除规则
   */
  removeRuleFromChain(chainId: string, ruleId: string): void {
    const existingRules = this.getChainRules(chainId) || [];
    const updatedRules = existingRules.filter(rule => rule.id !== ruleId);
    this.setChainRules(chainId, updatedRules);
  }

  /**
   * 更新链中的特定规则
   */
  updateRuleInChain(chainId: string, updatedRule: ExceptionRule): void {
    const existingRules = this.getChainRules(chainId) || [];
    const ruleIndex = existingRules.findIndex(rule => rule.id === updatedRule.id);
    
    if (ruleIndex !== -1) {
      existingRules[ruleIndex] = updatedRule;
      this.setChainRules(chainId, existingRules);
    }
  }

  /**
   * 清除链相关的所有缓存
   */
  clearChainCache(chainId: string): void {
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (key.includes(chainId)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * 无效化链的搜索缓存
   */
  private invalidateChainSearchCache(chainId: string): void {
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (key.startsWith('search_') && key.includes(chainId)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * 获取链专属搜索结果
   */
  getChainSearchResults(chainId: string, query: string, actionType?: ExceptionRuleType): ExceptionRule[] | null {
    const key = `search_${chainId}_${query}_${actionType || 'all'}`;
    return this.get<ExceptionRule[]>(key);
  }

  /**
   * 缓存链专属搜索结果
   */
  setChainSearchResults(
    chainId: string, 
    query: string, 
    results: ExceptionRule[], 
    actionType?: ExceptionRuleType, 
    ttl?: number
  ): void {
    const key = `search_${chainId}_${query}_${actionType || 'all'}`;
    
    // 确保结果只包含链专属规则
    const chainSpecificResults = results.filter(rule => 
      rule.chainId === chainId && rule.scope === 'chain'
    );
    
    this.set(key, chainSpecificResults, ttl || 2 * 60 * 1000);
  }

  /**
   * 预加载链的常用数据
   */
  async preloadChainData(
    chainId: string, 
    loadFunction: (chainId: string) => Promise<ExceptionRule[]>
  ): Promise<void> {
    try {
      // 检查是否已有缓存
      if (this.getChainRules(chainId)) {
        return;
      }

      // 加载并缓存数据
      const rules = await loadFunction(chainId);
      this.setChainRules(chainId, rules);

      // 预加载每个规则的详情
      for (const rule of rules) {
        this.setRule(rule);
      }
    } catch (error) {
      console.error(`预加载链 ${chainId} 数据失败:`, error);
    }
  }

  /**
   * 获取链缓存统计
   */
  getChainCacheStats(chainId: string): {
    rulesCount: number;
    cacheHit: boolean;
    lastUpdated: number | null;
  } {
    const cacheKey = `chain_rules_${chainId}`;
    const entry = this.cache.get(cacheKey);
    
    return {
      rulesCount: entry?.data?.length || 0,
      cacheHit: !!entry,
      lastUpdated: entry?.timestamp || null
    };
  }

  /**
   * 销毁缓存管理器
   */
  destroy(): void {
    this.stopCleanupInterval();
    this.clear();
    this.subscribers.clear();
  }
}

// 导出单例实例
export const exceptionRuleCache = new ExceptionRuleCache();