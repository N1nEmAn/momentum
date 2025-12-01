/**
 * 规则重复检测服务测试
 */

import { RuleDuplicationDetector } from '../RuleDuplicationDetector';
import { ExceptionRuleStorageService } from '../ExceptionRuleStorage';
import { ExceptionRuleType } from '../../types';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

describe('RuleDuplicationDetector', () => {
  let detector: RuleDuplicationDetector;
  let storage: ExceptionRuleStorageService;

  beforeEach(() => {
    detector = new RuleDuplicationDetector();
    storage = new ExceptionRuleStorageService();
    localStorage.clear();
  });

  describe('精确重复检测', () => {
    test('应该检测到精确重复的规则名称', async () => {
      await storage.createRule({
        name: '上厕所',
        type: ExceptionRuleType.PAUSE_ONLY
      });

      const duplicates = await detector.checkDuplication('上厕所');
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].name).toBe('上厕所');
    });

    test('应该忽略大小写和空格差异', async () => {
      await storage.createRule({
        name: '上厕所',
        type: ExceptionRuleType.PAUSE_ONLY
      });

      const duplicates1 = await detector.checkDuplication('上 厕 所');
      const duplicates2 = await detector.checkDuplication('  上厕所  ');
      
      expect(duplicates1).toHaveLength(1);
      expect(duplicates2).toHaveLength(1);
    });

    test('应该排除指定的规则ID', async () => {
      const rule = await storage.createRule({
        name: '上厕所',
        type: ExceptionRuleType.PAUSE_ONLY
      });

      const duplicates = await detector.checkDuplication('上厕所', rule.id);
      expect(duplicates).toHaveLength(0);
    });

    test('应该忽略非活跃规则', async () => {
      const rule = await storage.createRule({
        name: '上厕所',
        type: ExceptionRuleType.PAUSE_ONLY
      });

      await storage.deleteRule(rule.id); // 软删除

      const duplicates = await detector.checkDuplication('上厕所');
      expect(duplicates).toHaveLength(0);
    });
  });

  describe('相似规则检测', () => {
    test('应该找到相似的规则', async () => {
      await storage.createRule({
        name: '上厕所',
        type: ExceptionRuleType.PAUSE_ONLY
      });

      const similarRules = await detector.findSimilarRules('去厕所', 0.7);
      expect(similarRules.length).toBeGreaterThan(0);
    });

    test('应该按相似度排序', async () => {
      await storage.createRule({
        name: '上厕所',
        type: ExceptionRuleType.PAUSE_ONLY
      });
      await storage.createRule({
        name: '去厕所',
        type: ExceptionRuleType.PAUSE_ONLY
      });
      await storage.createRule({
        name: '厕所',
        type: ExceptionRuleType.PAUSE_ONLY
      });

      const similarRules = await detector.findSimilarRules('上厕所间', 0.5);
      expect(similarRules.length).toBeGreaterThan(0);
      
      // 验证是否按相似度排序（这里我们不能直接访问相似度，但可以验证顺序合理性）
      expect(similarRules[0].name).toBe('上厕所'); // 最相似的应该在前面
    });

    test('应该排除完全相同的规则', async () => {
      await storage.createRule({
        name: '上厕所',
        type: ExceptionRuleType.PAUSE_ONLY
      });

      const similarRules = await detector.findSimilarRules('上厕所', 0.8);
      expect(similarRules).toHaveLength(0); // 完全相同的应该被排除
    });
  });

  describe('规则建议', () => {
    test('应该建议精确匹配的现有规则', async () => {
      const rule = await storage.createRule({
        name: '上厕所',
        type: ExceptionRuleType.PAUSE_ONLY
      });

      const suggestion = await detector.suggestExistingRule('上厕所');
      expect(suggestion).not.toBeNull();
      expect(suggestion!.id).toBe(rule.id);
    });

    test('应该建议高相似度的现有规则', async () => {
      await storage.createRule({
        name: '上厕所',
        type: ExceptionRuleType.PAUSE_ONLY
      });

      const suggestion = await detector.suggestExistingRule('去厕所');
      expect(suggestion).not.toBeNull();
      expect(suggestion!.name).toBe('上厕所');
    });

    test('没有相似规则时应该返回null', async () => {
      await storage.createRule({
        name: '上厕所',
        type: ExceptionRuleType.PAUSE_ONLY
      });

      const suggestion = await detector.suggestExistingRule('完全不同的规则');
      expect(suggestion).toBeNull();
    });
  });

  describe('重复检测报告', () => {
    test('应该生成完整的重复检测报告', async () => {
      await storage.createRule({
        name: '上厕所',
        type: ExceptionRuleType.PAUSE_ONLY
      });
      await storage.createRule({
        name: '去厕所',
        type: ExceptionRuleType.PAUSE_ONLY
      });

      const report = await detector.getDuplicationReport('上厕所');
      
      expect(report.hasExactMatch).toBe(true);
      expect(report.exactMatches).toHaveLength(1);
      expect(report.hasSimilarRules).toBe(true);
      expect(report.similarRules.length).toBeGreaterThan(0);
      expect(report.suggestion).not.toBeNull();
    });

    test('没有重复时应该返回空报告', async () => {
      const report = await detector.getDuplicationReport('独特的规则名称');
      
      expect(report.hasExactMatch).toBe(false);
      expect(report.exactMatches).toHaveLength(0);
      expect(report.hasSimilarRules).toBe(false);
      expect(report.similarRules).toHaveLength(0);
      expect(report.suggestion).toBeNull();
    });
  });

  describe('批量重复检测', () => {
    test('应该批量检测多个规则名称', async () => {
      await storage.createRule({
        name: '上厕所',
        type: ExceptionRuleType.PAUSE_ONLY
      });
      await storage.createRule({
        name: '喝水',
        type: ExceptionRuleType.PAUSE_ONLY
      });

      const results = await detector.batchCheckDuplication(['上厕所', '喝水', '新规则']);
      
      expect(results.size).toBe(2);
      expect(results.has('上厕所')).toBe(true);
      expect(results.has('喝水')).toBe(true);
      expect(results.has('新规则')).toBe(false);
    });
  });

  describe('常见模式检测', () => {
    test('应该识别常见的规则模式', () => {
      expect(detector.isCommonPattern('上厕所')).toBe(true);
      expect(detector.isCommonPattern('喝水')).toBe(true);
      expect(detector.isCommonPattern('休息')).toBe(true);
      expect(detector.isCommonPattern('接电话')).toBe(true);
      expect(detector.isCommonPattern('查看消息')).toBe(true);
      
      expect(detector.isCommonPattern('非常特殊的规则')).toBe(false);
    });

    test('应该忽略大小写和空格', () => {
      expect(detector.isCommonPattern('上 厕 所')).toBe(true);
      expect(detector.isCommonPattern('  喝水  ')).toBe(true);
    });
  });

  describe('名称建议生成', () => {
    test('应该生成数字后缀建议', () => {
      const suggestions = detector.generateNameSuggestions('上厕所', ['上厕所']);
      
      expect(suggestions).toContain('上厕所 2');
      expect(suggestions).toContain('上厕所 3');
    });

    test('应该生成描述性后缀建议', () => {
      const suggestions = detector.generateNameSuggestions('上厕所', ['上厕所']);
      
      expect(suggestions.some(s => s.includes('(紧急)'))).toBe(true);
      expect(suggestions.some(s => s.includes('(短暂)'))).toBe(true);
    });

    test('应该生成时间相关前缀建议', () => {
      const suggestions = detector.generateNameSuggestions('上厕所', ['上厕所']);
      
      expect(suggestions.some(s => s.startsWith('快速'))).toBe(true);
      expect(suggestions.some(s => s.startsWith('5分钟'))).toBe(true);
    });

    test('应该避免与现有名称冲突', () => {
      const existingNames = ['上厕所', '上厕所 2', '上厕所(紧急)', '快速上厕所'];
      const suggestions = detector.generateNameSuggestions('上厕所', existingNames);
      
      // 所有建议都不应该与现有名称冲突
      for (const suggestion of suggestions) {
        expect(existingNames).not.toContain(suggestion);
      }
    });

    test('应该限制建议数量', () => {
      const suggestions = detector.generateNameSuggestions('上厕所', []);
      expect(suggestions.length).toBeLessThanOrEqual(5);
    });
  });

  describe('字符串相似度计算', () => {
    test('相同字符串应该返回1.0', () => {
      const detector = new RuleDuplicationDetector();
      // 通过反射访问私有方法进行测试
      const similarity = (detector as any).calculateSimilarity('test', 'test');
      expect(similarity).toBe(1.0);
    });

    test('完全不同的字符串应该返回较低相似度', () => {
      const detector = new RuleDuplicationDetector();
      const similarity = (detector as any).calculateSimilarity('abc', 'xyz');
      expect(similarity).toBeLessThan(0.5);
    });

    test('部分相似的字符串应该返回中等相似度', () => {
      const detector = new RuleDuplicationDetector();
      const similarity = (detector as any).calculateSimilarity('上厕所', '去厕所');
      expect(similarity).toBeGreaterThan(0.5);
      expect(similarity).toBeLessThan(1.0);
    });
  });
});