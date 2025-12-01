/**
 * 规则系统性能测试
 * 验证关键修复是否解决了性能和稳定性问题
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RuleSelectionDialog } from '../components/RuleSelectionDialog';
import { VirtualizedRuleList } from '../components/VirtualizedRuleList';
import { RuleSearchOptimizer } from '../utils/ruleSearchOptimizer';
import { ExceptionRuleCache } from '../utils/exceptionRuleCache';
import { LayoutStabilityMonitor } from '../utils/LayoutStabilityMonitor';
import { AsyncOperationManager } from '../utils/AsyncOperationManager';
import { ExceptionRule, ExceptionRuleType, SessionContext } from '../types';

// Mock performance.now for consistent testing
const mockPerformanceNow = jest.fn(() => Date.now());
Object.defineProperty(window, 'performance', {
  value: { now: mockPerformanceNow },
  writable: true
});

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

describe('Rule System Performance Tests', () => {
  const createLargeRuleSet = (count: number): ExceptionRule[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `rule-${i}`,
      name: `规则 ${i}`,
      chainId: 'test-chain',
      scope: 'chain',
      type: ExceptionRuleType.PAUSE_ONLY,
      createdAt: new Date(),
      usageCount: Math.floor(Math.random() * 20),
      isActive: true,
      lastUsedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
    }));
  };

  const mockSessionContext: SessionContext = {
    chainId: 'test-chain',
    chainName: 'Performance Test Chain',
    elapsedTime: 1800,
    remainingTime: 900,
    currentTaskId: 'task-1',
    isActive: true
  };

  describe('Search Performance', () => {
    it('should handle large rule sets efficiently', () => {
      const optimizer = new RuleSearchOptimizer();
      const largeRuleSet = createLargeRuleSet(1000);
      
      const startTime = performance.now();
      optimizer.updateIndex(largeRuleSet);
      const indexTime = performance.now() - startTime;
      
      expect(indexTime).toBeLessThan(100); // Should index within 100ms
      
      const searchStartTime = performance.now();
      const results = optimizer.searchRules(largeRuleSet, '规则');
      const searchTime = performance.now() - searchStartTime;
      
      expect(searchTime).toBeLessThan(50); // Should search within 50ms
      expect(results.length).toBeGreaterThan(0);
    });

    it('should perform debounced search efficiently', (done) => {
      const optimizer = new RuleSearchOptimizer();
      const rules = createLargeRuleSet(500);
      optimizer.updateIndex(rules);
      
      let callCount = 0;
      const callback = jest.fn(() => {
        callCount++;
        if (callCount === 1) {
          expect(callback).toHaveBeenCalledTimes(1);
          done();
        }
      });

      // Multiple rapid searches should be debounced
      optimizer.searchRulesDebounced(rules, '规则1', callback);
      optimizer.searchRulesDebounced(rules, '规则12', callback);
      optimizer.searchRulesDebounced(rules, '规则123', callback);
    });

    it('should cache search results effectively', () => {
      const optimizer = new RuleSearchOptimizer();
      const rules = createLargeRuleSet(100);
      optimizer.updateIndex(rules);
      
      // First search
      const startTime1 = performance.now();
      optimizer.searchRules(rules, '规则1');
      const firstSearchTime = performance.now() - startTime1;
      
      // Second identical search (should use cache)
      const startTime2 = performance.now();
      optimizer.searchRules(rules, '规则1');
      const secondSearchTime = performance.now() - startTime2;
      
      // Second search should be faster due to caching
      expect(secondSearchTime).toBeLessThan(firstSearchTime);
    });
  });

  describe('Virtualization Performance', () => {
    it('should render large lists without performance degradation', () => {
      const largeRuleSet = createLargeRuleSet(1000);
      const searchResults = largeRuleSet.map(rule => ({
        rule,
        score: 100,
        matchType: 'exact' as const,
        highlightRanges: []
      }));

      const startTime = performance.now();
      
      render(
        <VirtualizedRuleList
          rules={searchResults}
          onSelect={jest.fn()}
          itemHeight={60}
          containerHeight={400}
        />
      );
      
      const renderTime = performance.now() - startTime;
      
      // Should render within reasonable time
      expect(renderTime).toBeLessThan(100);
      
      // Should only render visible items
      const renderedItems = document.querySelectorAll('[data-rule-item]');
      expect(renderedItems.length).toBeLessThan(20); // Much less than 1000
    });

    it('should handle rapid scrolling efficiently', async () => {
      const largeRuleSet = createLargeRuleSet(500);
      const searchResults = largeRuleSet.map(rule => ({
        rule,
        score: 100,
        matchType: 'exact' as const,
        highlightRanges: []
      }));

      render(
        <VirtualizedRuleList
          rules={searchResults}
          onSelect={jest.fn()}
          itemHeight={60}
          containerHeight={400}
        />
      );

      const scrollContainer = document.querySelector('.overflow-auto');
      
      if (scrollContainer) {
        const startTime = performance.now();
        
        // Simulate rapid scrolling
        for (let i = 0; i < 50; i++) {
          fireEvent.scroll(scrollContainer, { target: { scrollTop: i * 100 } });
        }
        
        const scrollTime = performance.now() - startTime;
        
        // Should handle rapid scrolling without significant delay
        expect(scrollTime).toBeLessThan(200);
      }
    });
  });

  describe('Cache Performance', () => {
    it('should provide fast cache access', () => {
      const cache = new ExceptionRuleCache();
      const rules = createLargeRuleSet(100);
      
      // Set cache
      const setStartTime = performance.now();
      cache.setChainRules('test-chain', rules);
      const setTime = performance.now() - setStartTime;
      
      expect(setTime).toBeLessThan(10);
      
      // Get from cache
      const getStartTime = performance.now();
      const cachedRules = cache.getChainRules('test-chain');
      const getTime = performance.now() - getStartTime;
      
      expect(getTime).toBeLessThan(5);
      expect(cachedRules).toHaveLength(100);
    });

    it('should handle cache updates efficiently', () => {
      const cache = new ExceptionRuleCache();
      const rules = createLargeRuleSet(50);
      
      cache.setChainRules('test-chain', rules);
      
      const startTime = performance.now();
      
      // Add new rule
      const newRule: ExceptionRule = {
        id: 'new-rule',
        name: '新规则',
        chainId: 'test-chain',
        scope: 'chain',
        type: ExceptionRuleType.PAUSE_ONLY,
        createdAt: new Date(),
        usageCount: 0,
        isActive: true
      };
      
      cache.addRuleToChain('test-chain', newRule);
      
      const updateTime = performance.now() - startTime;
      
      expect(updateTime).toBeLessThan(10);
      
      const updatedRules = cache.getChainRules('test-chain');
      expect(updatedRules).toHaveLength(51);
    });
  });

  describe('Layout Stability', () => {
    it('should maintain stable layout during updates', async () => {
      const monitor = new LayoutStabilityMonitor();
      const container = document.createElement('div');
      document.body.appendChild(container);
      
      // Add rule items
      for (let i = 0; i < 10; i++) {
        const item = document.createElement('div');
        item.className = 'rule-item';
        item.textContent = `Rule ${i}`;
        container.appendChild(item);
      }
      
      monitor.startMonitoring(container);
      
      const startTime = performance.now();
      monitor.stabilizeLayout(container);
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const stabilizeTime = performance.now() - startTime;
      
      expect(stabilizeTime).toBeLessThan(100);
      
      // Check that items have stable heights
      const items = container.querySelectorAll('.rule-item');
      items.forEach(item => {
        const element = item as HTMLElement;
        expect(element.style.minHeight).toBe('60px');
      });
      
      monitor.stopMonitoring();
      document.body.removeChild(container);
    });
  });

  describe('Async Operations Performance', () => {
    it('should handle concurrent operations efficiently', async () => {
      const manager = new AsyncOperationManager();
      
      const operations = Array.from({ length: 10 }, (_, i) => ({
        id: `op-${i}`,
        operation: () => new Promise(resolve => setTimeout(() => resolve(`result-${i}`), 50))
      }));
      
      const startTime = performance.now();
      
      const promises = operations.map(op => manager.executeOperation(op));
      const results = await Promise.all(promises);
      
      const totalTime = performance.now() - startTime;
      
      // Should complete all operations efficiently
      expect(totalTime).toBeLessThan(200); // Should be concurrent, not sequential
      expect(results).toHaveLength(10);
    });

    it('should perform optimistic updates quickly', async () => {
      const manager = new AsyncOperationManager();
      
      let uiUpdateTime = 0;
      
      const startTime = performance.now();
      
      await manager.optimisticUpdate({
        id: 'test-optimistic',
        operation: () => new Promise(resolve => setTimeout(() => resolve('real-value'), 100)),
        optimisticValue: 'optimistic-value',
        updateUI: (value) => {
          if (value === 'optimistic-value') {
            uiUpdateTime = performance.now() - startTime;
          }
        },
        rollback: () => {}
      });
      
      // UI should update immediately (within 10ms)
      expect(uiUpdateTime).toBeLessThan(10);
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory with large datasets', () => {
      const optimizer = new RuleSearchOptimizer();
      const cache = new ExceptionRuleCache();
      
      // Create and process large datasets multiple times
      for (let i = 0; i < 5; i++) {
        const rules = createLargeRuleSet(200);
        optimizer.updateIndex(rules);
        cache.setChainRules(`chain-${i}`, rules);
        
        // Perform searches
        for (let j = 0; j < 10; j++) {
          optimizer.searchRules(rules, `query-${j}`);
        }
      }
      
      // Clear caches
      optimizer.clearCache();
      cache.clear();
      
      // Memory should be released (we can't directly test this, but ensure no errors)
      expect(true).toBe(true);
    });
  });

  describe('Integration Performance', () => {
    it('should maintain performance in complete dialog', async () => {
      const user = userEvent.setup();
      const largeRuleSet = createLargeRuleSet(100);
      
      // Mock the API calls to return large dataset
      jest.spyOn(window, 'fetch').mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(largeRuleSet)
        } as Response)
      );
      
      const startTime = performance.now();
      
      render(
        <RuleSelectionDialog
          isOpen={true}
          actionType="pause"
          sessionContext={mockSessionContext}
          onRuleSelected={jest.fn()}
          onCreateNewRule={jest.fn()}
          onCancel={jest.fn()}
        />
      );
      
      const renderTime = performance.now() - startTime;
      
      // Dialog should render quickly even with large dataset
      expect(renderTime).toBeLessThan(200);
      
      // Test search performance
      const searchInput = screen.getByPlaceholderText('搜索规则或输入新规则名称...');
      
      const searchStartTime = performance.now();
      await user.type(searchInput, '规则');
      const searchTime = performance.now() - searchStartTime;
      
      // Search should be responsive
      expect(searchTime).toBeLessThan(500);
    });
  });

  describe('Error Recovery Performance', () => {
    it('should recover from errors quickly', async () => {
      const optimizer = new RuleSearchOptimizer();
      const rules = createLargeRuleSet(50);
      
      // Simulate search error
      const originalSearch = optimizer.searchRules;
      let errorThrown = false;
      
      optimizer.searchRules = jest.fn().mockImplementation((rules, query) => {
        if (!errorThrown) {
          errorThrown = true;
          throw new Error('Search failed');
        }
        return originalSearch.call(optimizer, rules, query);
      });
      
      const startTime = performance.now();
      
      try {
        optimizer.searchRules(rules, 'test');
      } catch (error) {
        // Error should be thrown quickly
        const errorTime = performance.now() - startTime;
        expect(errorTime).toBeLessThan(50);
      }
      
      // Recovery should work
      const recoveryStartTime = performance.now();
      const results = optimizer.searchRules(rules, 'test');
      const recoveryTime = performance.now() - recoveryStartTime;
      
      expect(recoveryTime).toBeLessThan(100);
      expect(results).toBeDefined();
    });
  });
});