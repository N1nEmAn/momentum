import { ExceptionRuleCache } from '../exceptionRuleCache';
import { ExceptionRule, ExceptionRuleType } from '../../types';

describe('ExceptionRuleCache', () => {
  let cache: ExceptionRuleCache;
  let mockRules: ExceptionRule[];

  beforeEach(() => {
    cache = new ExceptionRuleCache();
    mockRules = [
      {
        id: '1',
        name: '上厕所',
        chainId: 'chain1',
        scope: 'chain',
        type: ExceptionRuleType.PAUSE_ONLY,
        createdAt: new Date(),
        usageCount: 5,
        isActive: true
      },
      {
        id: '2',
        name: '喝水',
        chainId: 'chain1',
        scope: 'chain',
        type: ExceptionRuleType.PAUSE_ONLY,
        createdAt: new Date(),
        usageCount: 3,
        isActive: true
      },
      {
        id: '3',
        name: '接电话',
        chainId: 'chain2',
        scope: 'chain',
        type: ExceptionRuleType.PAUSE_ONLY,
        createdAt: new Date(),
        usageCount: 8,
        isActive: true
      }
    ];
  });

  afterEach(() => {
    cache.destroy();
  });

  describe('chain-specific rules', () => {
    it('should cache and retrieve chain rules', () => {
      const chain1Rules = mockRules.filter(r => r.chainId === 'chain1');
      cache.setChainRules('chain1', chain1Rules);

      const retrieved = cache.getChainRules('chain1');
      expect(retrieved).toHaveLength(2);
      expect(retrieved?.every(r => r.chainId === 'chain1')).toBe(true);
    });

    it('should filter out non-chain-specific rules', () => {
      const mixedRules = [
        ...mockRules,
        {
          id: '4',
          name: 'Global Rule',
          chainId: null,
          scope: 'global',
          type: ExceptionRuleType.PAUSE_ONLY,
          createdAt: new Date(),
          usageCount: 1,
          isActive: true
        } as any
      ];

      cache.setChainRules('chain1', mixedRules);
      const retrieved = cache.getChainRules('chain1');
      
      expect(retrieved?.every(r => r.chainId === 'chain1' && r.scope === 'chain')).toBe(true);
      expect(retrieved?.find(r => r.name === 'Global Rule')).toBeUndefined();
    });

    it('should return null for non-existent chain', () => {
      const retrieved = cache.getChainRules('nonexistent');
      expect(retrieved).toBeNull();
    });
  });

  describe('cache subscription', () => {
    it('should notify subscribers when rules are updated', () => {
      const subscriber = jest.fn();
      const unsubscribe = cache.subscribe(subscriber);

      const chain1Rules = mockRules.filter(r => r.chainId === 'chain1');
      cache.setChainRules('chain1', chain1Rules);

      expect(subscriber).toHaveBeenCalledWith('chain1', chain1Rules);

      unsubscribe();
      cache.setChainRules('chain1', []);
      expect(subscriber).toHaveBeenCalledTimes(1);
    });

    it('should handle subscriber errors gracefully', () => {
      const errorSubscriber = jest.fn(() => {
        throw new Error('Subscriber error');
      });
      const normalSubscriber = jest.fn();

      cache.subscribe(errorSubscriber);
      cache.subscribe(normalSubscriber);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const chain1Rules = mockRules.filter(r => r.chainId === 'chain1');
      cache.setChainRules('chain1', chain1Rules);

      expect(errorSubscriber).toHaveBeenCalled();
      expect(normalSubscriber).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('Subscriber notification failed:', expect.any(Error));

      consoleSpy.mockRestore();
    });
  });

  describe('rule management', () => {
    beforeEach(() => {
      const chain1Rules = mockRules.filter(r => r.chainId === 'chain1');
      cache.setChainRules('chain1', chain1Rules);
    });

    it('should add rule to chain', () => {
      const newRule: ExceptionRule = {
        id: '4',
        name: '开会',
        chainId: 'chain1',
        scope: 'chain',
        type: ExceptionRuleType.PAUSE_ONLY,
        createdAt: new Date(),
        usageCount: 0,
        isActive: true
      };

      cache.addRuleToChain('chain1', newRule);
      const rules = cache.getChainRules('chain1');
      
      expect(rules).toHaveLength(3);
      expect(rules?.find(r => r.id === '4')).toBeDefined();
    });

    it('should not add non-chain-specific rule', () => {
      const globalRule = {
        id: '5',
        name: 'Global Rule',
        chainId: 'chain2',
        scope: 'global',
        type: ExceptionRuleType.PAUSE_ONLY,
        createdAt: new Date(),
        usageCount: 0,
        isActive: true
      } as any;

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      cache.addRuleToChain('chain1', globalRule);
      const rules = cache.getChainRules('chain1');
      
      expect(rules).toHaveLength(2); // Should remain unchanged
      expect(consoleSpy).toHaveBeenCalledWith('Attempting to add non-chain-specific rule to chain cache');
      
      consoleSpy.mockRestore();
    });

    it('should remove rule from chain', () => {
      cache.removeRuleFromChain('chain1', '1');
      const rules = cache.getChainRules('chain1');
      
      expect(rules).toHaveLength(1);
      expect(rules?.find(r => r.id === '1')).toBeUndefined();
    });

    it('should update rule in chain', () => {
      const updatedRule: ExceptionRule = {
        ...mockRules[0],
        name: '上厕所 (更新)',
        usageCount: 10
      };

      cache.updateRuleInChain('chain1', updatedRule);
      const rules = cache.getChainRules('chain1');
      const rule = rules?.find(r => r.id === '1');
      
      expect(rule?.name).toBe('上厕所 (更新)');
      expect(rule?.usageCount).toBe(10);
    });
  });

  describe('search caching', () => {
    beforeEach(() => {
      const chain1Rules = mockRules.filter(r => r.chainId === 'chain1');
      cache.setChainRules('chain1', chain1Rules);
    });

    it('should cache and retrieve chain search results', () => {
      const searchResults = [mockRules[0]];
      cache.setChainSearchResults('chain1', '上厕所', searchResults);

      const retrieved = cache.getChainSearchResults('chain1', '上厕所');
      expect(retrieved).toEqual(searchResults);
    });

    it('should filter search results to chain-specific only', () => {
      const mixedResults = [
        mockRules[0], // chain1 rule
        mockRules[2], // chain2 rule
        {
          id: '6',
          name: 'Global Rule',
          chainId: null,
          scope: 'global',
          type: ExceptionRuleType.PAUSE_ONLY,
          createdAt: new Date(),
          usageCount: 1,
          isActive: true
        } as any
      ];

      cache.setChainSearchResults('chain1', 'test', mixedResults);
      const retrieved = cache.getChainSearchResults('chain1', 'test');
      
      expect(retrieved).toHaveLength(1);
      expect(retrieved?.[0].chainId).toBe('chain1');
    });

    it('should invalidate search cache when rules are updated', () => {
      cache.setChainSearchResults('chain1', 'test', [mockRules[0]]);
      expect(cache.getChainSearchResults('chain1', 'test')).toBeDefined();

      cache.updateChainRules('chain1', []);
      expect(cache.getChainSearchResults('chain1', 'test')).toBeNull();
    });
  });

  describe('cache management', () => {
    it('should clear chain-specific cache', () => {
      cache.setChainRules('chain1', mockRules.filter(r => r.chainId === 'chain1'));
      cache.setChainSearchResults('chain1', 'test', [mockRules[0]]);
      
      expect(cache.getChainRules('chain1')).toBeDefined();
      expect(cache.getChainSearchResults('chain1', 'test')).toBeDefined();

      cache.clearChainCache('chain1');
      
      expect(cache.getChainRules('chain1')).toBeNull();
      expect(cache.getChainSearchResults('chain1', 'test')).toBeNull();
    });

    it('should provide chain cache statistics', () => {
      const chain1Rules = mockRules.filter(r => r.chainId === 'chain1');
      cache.setChainRules('chain1', chain1Rules);

      const stats = cache.getChainCacheStats('chain1');
      expect(stats.rulesCount).toBe(2);
      expect(stats.cacheHit).toBe(true);
      expect(stats.lastUpdated).toBeGreaterThan(0);
    });

    it('should return empty stats for non-cached chain', () => {
      const stats = cache.getChainCacheStats('nonexistent');
      expect(stats.rulesCount).toBe(0);
      expect(stats.cacheHit).toBe(false);
      expect(stats.lastUpdated).toBeNull();
    });
  });

  describe('preloading', () => {
    it('should preload chain data', async () => {
      const loadFunction = jest.fn().mockResolvedValue(mockRules.filter(r => r.chainId === 'chain1'));

      await cache.preloadChainData('chain1', loadFunction);

      expect(loadFunction).toHaveBeenCalledWith('chain1');
      expect(cache.getChainRules('chain1')).toHaveLength(2);
    });

    it('should not reload if data already cached', async () => {
      const chain1Rules = mockRules.filter(r => r.chainId === 'chain1');
      cache.setChainRules('chain1', chain1Rules);

      const loadFunction = jest.fn();
      await cache.preloadChainData('chain1', loadFunction);

      expect(loadFunction).not.toHaveBeenCalled();
    });

    it('should handle preload errors gracefully', async () => {
      const loadFunction = jest.fn().mockRejectedValue(new Error('Load failed'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await cache.preloadChainData('chain1', loadFunction);

      expect(consoleSpy).toHaveBeenCalledWith('预加载链 chain1 数据失败:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('deprecated methods', () => {
    it('should warn when using deprecated getRules', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      cache.getRules();
      
      expect(consoleSpy).toHaveBeenCalledWith('getRules is deprecated, use getChainRules instead');
      consoleSpy.mockRestore();
    });

    it('should warn when using deprecated setRules', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      cache.setRules(mockRules);
      
      expect(consoleSpy).toHaveBeenCalledWith('setRules is deprecated, use setChainRules instead');
      consoleSpy.mockRestore();
    });
  });

  describe('TTL and expiration', () => {
    it('should respect custom TTL for chain rules', () => {
      const chain1Rules = mockRules.filter(r => r.chainId === 'chain1');
      cache.setChainRules('chain1', chain1Rules, 100); // 100ms TTL

      expect(cache.getChainRules('chain1')).toBeDefined();

      // Wait for expiration
      return new Promise(resolve => {
        setTimeout(() => {
          expect(cache.getChainRules('chain1')).toBeNull();
          resolve(undefined);
        }, 150);
      });
    });
  });
});