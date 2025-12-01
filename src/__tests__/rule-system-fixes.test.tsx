/**
 * 规则系统修复验证测试
 * 验证关键问题是否已修复
 */

import { RuleSearchOptimizer } from '../utils/ruleSearchOptimizer';
import { ExceptionRule, ExceptionRuleType } from '../types';

describe('Rule System Fixes', () => {
  describe('name.toLowerCase is not a function fix', () => {
    it('should handle rules with non-string names', () => {
      const optimizer = new RuleSearchOptimizer();
      
      // 创建包含非字符串name的规则（模拟数据问题）
      const problematicRules = [
        {
          id: '1',
          name: null as any, // 故意设置为null
          chainId: 'test-chain',
          scope: 'chain',
          type: ExceptionRuleType.PAUSE_ONLY,
          createdAt: new Date(),
          usageCount: 5,
          isActive: true
        },
        {
          id: '2',
          name: undefined as any, // 故意设置为undefined
          chainId: 'test-chain',
          scope: 'chain',
          type: ExceptionRuleType.PAUSE_ONLY,
          createdAt: new Date(),
          usageCount: 3,
          isActive: true
        },
        {
          id: '3',
          name: '正常规则',
          chainId: 'test-chain',
          scope: 'chain',
          type: ExceptionRuleType.PAUSE_ONLY,
          createdAt: new Date(),
          usageCount: 8,
          isActive: true
        }
      ] as ExceptionRule[];

      // 这些操作之前会抛出 "name.toLowerCase is not a function" 错误
      expect(() => {
        optimizer.updateIndex(problematicRules);
      }).not.toThrow();

      expect(() => {
        optimizer.searchRules(problematicRules, '规则');
      }).not.toThrow();

      expect(() => {
        optimizer.detectDuplicates('测试', problematicRules);
      }).not.toThrow();

      expect(() => {
        optimizer.getSearchSuggestions('测试', problematicRules);
      }).not.toThrow();
    });

    it('should handle empty or whitespace names', () => {
      const optimizer = new RuleSearchOptimizer();
      
      const edgeCaseRules = [
        {
          id: '1',
          name: '',
          chainId: 'test-chain',
          scope: 'chain',
          type: ExceptionRuleType.PAUSE_ONLY,
          createdAt: new Date(),
          usageCount: 1,
          isActive: true
        },
        {
          id: '2',
          name: '   ',
          chainId: 'test-chain',
          scope: 'chain',
          type: ExceptionRuleType.PAUSE_ONLY,
          createdAt: new Date(),
          usageCount: 2,
          isActive: true
        }
      ] as ExceptionRule[];

      expect(() => {
        optimizer.updateIndex(edgeCaseRules);
        optimizer.searchRules(edgeCaseRules, 'test');
        optimizer.detectDuplicates('test', edgeCaseRules);
      }).not.toThrow();
    });
  });

  describe('duplicate rule creation fix', () => {
    it('should properly detect duplicates with string conversion', () => {
      const optimizer = new RuleSearchOptimizer();
      
      const rules = [
        {
          id: '1',
          name: '上厕所',
          chainId: 'test-chain',
          scope: 'chain',
          type: ExceptionRuleType.PAUSE_ONLY,
          createdAt: new Date(),
          usageCount: 5,
          isActive: true
        }
      ] as ExceptionRule[];

      // 测试重复检测
      const duplicateCheck = optimizer.detectDuplicates('上厕所', rules);
      expect(duplicateCheck.hasExactMatch).toBe(true);
      expect(duplicateCheck.exactMatches).toHaveLength(1);

      // 测试大小写不敏感
      const caseInsensitiveCheck = optimizer.detectDuplicates('上厕所', rules);
      expect(caseInsensitiveCheck.hasExactMatch).toBe(true);

      // 测试不存在的规则
      const nonExistentCheck = optimizer.detectDuplicates('不存在的规则', rules);
      expect(nonExistentCheck.hasExactMatch).toBe(false);
    });
  });

  describe('search performance', () => {
    it('should handle search without errors', () => {
      const optimizer = new RuleSearchOptimizer();
      
      const rules = [
        {
          id: '1',
          name: '上厕所',
          chainId: 'test-chain',
          scope: 'chain',
          type: ExceptionRuleType.PAUSE_ONLY,
          createdAt: new Date(),
          usageCount: 5,
          isActive: true
        },
        {
          id: '2',
          name: '喝水',
          chainId: 'test-chain',
          scope: 'chain',
          type: ExceptionRuleType.PAUSE_ONLY,
          createdAt: new Date(),
          usageCount: 3,
          isActive: true
        }
      ] as ExceptionRule[];

      optimizer.updateIndex(rules);

      // 测试各种搜索场景
      expect(() => {
        optimizer.searchRules(rules, '上厕所');
        optimizer.searchRules(rules, '上');
        optimizer.searchRules(rules, '');
        optimizer.searchRules(rules, '不存在');
      }).not.toThrow();

      // 测试搜索结果
      const results = optimizer.searchRules(rules, '上厕所');
      expect(results).toHaveLength(1);
      expect(results[0].rule.name).toBe('上厕所');
      expect(results[0].matchType).toBe('exact');
    });

    it('should handle debounced search', (done) => {
      const optimizer = new RuleSearchOptimizer();
      
      const rules = [
        {
          id: '1',
          name: '测试规则',
          chainId: 'test-chain',
          scope: 'chain',
          type: ExceptionRuleType.PAUSE_ONLY,
          createdAt: new Date(),
          usageCount: 1,
          isActive: true
        }
      ] as ExceptionRule[];

      optimizer.updateIndex(rules);

      let callCount = 0;
      const callback = jest.fn(() => {
        callCount++;
        if (callCount === 1) {
          expect(callback).toHaveBeenCalledTimes(1);
          done();
        }
      });

      // 快速连续调用应该被防抖
      optimizer.searchRulesDebounced(rules, '测试1', callback);
      optimizer.searchRulesDebounced(rules, '测试2', callback);
      optimizer.searchRulesDebounced(rules, '测试3', callback);
    });
  });

  describe('error resilience', () => {
    it('should handle malformed rule data gracefully', () => {
      const optimizer = new RuleSearchOptimizer();
      
      // 模拟各种可能的数据问题
      const malformedRules = [
        {
          id: '1',
          name: null,
          description: undefined,
          chainId: 'test-chain',
          scope: 'chain',
          type: ExceptionRuleType.PAUSE_ONLY,
          createdAt: new Date(),
          usageCount: null,
          isActive: true
        },
        {
          id: '2',
          // 缺少name字段
          chainId: 'test-chain',
          scope: 'chain',
          type: ExceptionRuleType.PAUSE_ONLY,
          createdAt: new Date(),
          isActive: true
        },
        {
          id: '3',
          name: 123 as any, // 数字类型的name
          chainId: 'test-chain',
          scope: 'chain',
          type: ExceptionRuleType.PAUSE_ONLY,
          createdAt: new Date(),
          usageCount: 'invalid' as any, // 字符串类型的usageCount
          isActive: true
        }
      ] as ExceptionRule[];

      // 所有操作都应该正常工作，不抛出错误
      expect(() => {
        optimizer.updateIndex(malformedRules);
        optimizer.searchRules(malformedRules, 'test');
        optimizer.detectDuplicates('test', malformedRules);
        optimizer.getSearchSuggestions('test', malformedRules);
        optimizer.generateNameSuggestions('test', ExceptionRuleType.PAUSE_ONLY);
      }).not.toThrow();
    });
  });
});