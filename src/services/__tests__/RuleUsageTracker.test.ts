/**
 * 规则使用统计跟踪器测试
 */

import { RuleUsageTracker } from '../RuleUsageTracker';
import { ExceptionRuleStorageService } from '../ExceptionRuleStorage';
import { ExceptionRuleType, SessionContext, ExceptionRuleException } from '../../types';

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

describe('RuleUsageTracker', () => {
  let tracker: RuleUsageTracker;
  let storage: ExceptionRuleStorageService;

  beforeEach(() => {
    tracker = new RuleUsageTracker();
    storage = new ExceptionRuleStorageService();
    localStorage.clear();
  });

  const createMockSessionContext = (overrides: Partial<SessionContext> = {}): SessionContext => ({
    sessionId: 'session_1',
    chainId: 'chain_1',
    chainName: '测试任务',
    startedAt: new Date(),
    elapsedTime: 300, // 5分钟
    remainingTime: 600, // 10分钟
    isDurationless: false,
    ...overrides
  });

  describe('记录规则使用', () => {
    test('应该能够记录规则使用', async () => {
      const rule = await storage.createRule({
        name: '测试规则',
        type: ExceptionRuleType.PAUSE_ONLY
      });

      const sessionContext = createMockSessionContext();
      const record = await tracker.recordUsage(rule.id, sessionContext, 'pause');

      expect(record.ruleId).toBe(rule.id);
      expect(record.chainId).toBe(sessionContext.chainId);
      expect(record.sessionId).toBe(sessionContext.sessionId);
      expect(record.actionType).toBe('pause');
      expect(record.taskElapsedTime).toBe(300);
      expect(record.taskRemainingTime).toBe(600);
      expect(record.usedAt).toBeInstanceOf(Date);
    });

    test('记录不存在的规则使用应该抛出异常', async () => {
      const sessionContext = createMockSessionContext();
      
      await expect(tracker.recordUsage('non_existent_id', sessionContext, 'pause'))
        .rejects.toThrow(ExceptionRuleException);
    });

    test('记录已删除规则的使用应该抛出异常', async () => {
      const rule = await storage.createRule({
        name: '待删除规则',
        type: ExceptionRuleType.PAUSE_ONLY
      });

      await storage.deleteRule(rule.id);
      const sessionContext = createMockSessionContext();

      await expect(tracker.recordUsage(rule.id, sessionContext, 'pause'))
        .rejects.toThrow(ExceptionRuleException);
    });
  });

  describe('获取规则使用统计', () => {
    test('应该能够获取规则使用统计', async () => {
      const rule = await storage.createRule({
        name: '测试规则',
        type: ExceptionRuleType.PAUSE_ONLY
      });

      // 创建多个使用记录
      const sessionContext1 = createMockSessionContext({ sessionId: 'session_1', elapsedTime: 300 });
      const sessionContext2 = createMockSessionContext({ sessionId: 'session_2', elapsedTime: 450 });
      
      await tracker.recordUsage(rule.id, sessionContext1, 'pause');
      await tracker.recordUsage(rule.id, sessionContext2, 'pause');

      const stats = await tracker.getRuleUsageStats(rule.id);

      expect(stats.ruleId).toBe(rule.id);
      expect(stats.totalUsage).toBe(2);
      expect(stats.pauseUsage).toBe(2);
      expect(stats.earlyCompletionUsage).toBe(0);
      expect(stats.averageTaskElapsedTime).toBe(375); // (300 + 450) / 2
      expect(stats.lastUsedAt).toBeInstanceOf(Date);
    });

    test('没有使用记录的规则应该返回零统计', async () => {
      const rule = await storage.createRule({
        name: '未使用规则',
        type: ExceptionRuleType.PAUSE_ONLY
      });

      const stats = await tracker.getRuleUsageStats(rule.id);

      expect(stats.totalUsage).toBe(0);
      expect(stats.pauseUsage).toBe(0);
      expect(stats.earlyCompletionUsage).toBe(0);
      expect(stats.averageTaskElapsedTime).toBe(0);
    });

    test('获取不存在规则的统计应该抛出异常', async () => {
      await expect(tracker.getRuleUsageStats('non_existent_id'))
        .rejects.toThrow(ExceptionRuleException);
    });
  });

  describe('获取整体使用统计', () => {
    test('应该能够获取整体使用统计', async () => {
      const rule1 = await storage.createRule({
        name: '暂停规则',
        type: ExceptionRuleType.PAUSE_ONLY
      });
      const rule2 = await storage.createRule({
        name: '完成规则',
        type: ExceptionRuleType.EARLY_COMPLETION_ONLY
      });

      const sessionContext = createMockSessionContext();
      await tracker.recordUsage(rule1.id, sessionContext, 'pause');
      await tracker.recordUsage(rule1.id, sessionContext, 'pause');
      await tracker.recordUsage(rule2.id, sessionContext, 'early_completion');

      const stats = await tracker.getOverallUsageStats();

      expect(stats.totalRules).toBe(2);
      expect(stats.activeRules).toBe(2);
      expect(stats.totalUsage).toBe(3);
      expect(stats.pauseUsage).toBe(2);
      expect(stats.earlyCompletionUsage).toBe(1);
      expect(stats.mostUsedRules).toHaveLength(2);
      expect(stats.mostUsedRules[0].count).toBe(2); // rule1 使用了2次
      expect(stats.mostUsedRules[1].count).toBe(1); // rule2 使用了1次
    });

    test('没有规则时应该返回空统计', async () => {
      const stats = await tracker.getOverallUsageStats();

      expect(stats.totalRules).toBe(0);
      expect(stats.activeRules).toBe(0);
      expect(stats.totalUsage).toBe(0);
      expect(stats.pauseUsage).toBe(0);
      expect(stats.earlyCompletionUsage).toBe(0);
      expect(stats.mostUsedRules).toHaveLength(0);
    });
  });

  describe('获取使用历史', () => {
    test('应该能够获取规则使用历史', async () => {
      const rule = await storage.createRule({
        name: '测试规则',
        type: ExceptionRuleType.PAUSE_ONLY
      });

      const sessionContext1 = createMockSessionContext({ sessionId: 'session_1' });
      const sessionContext2 = createMockSessionContext({ sessionId: 'session_2' });
      
      await tracker.recordUsage(rule.id, sessionContext1, 'pause');
      await tracker.recordUsage(rule.id, sessionContext2, 'pause');

      const history = await tracker.getRuleUsageHistory(rule.id);

      expect(history).toHaveLength(2);
      expect(history[0].sessionId).toBe('session_2'); // 最新的在前
      expect(history[1].sessionId).toBe('session_1');
    });

    test('应该能够限制历史记录数量', async () => {
      const rule = await storage.createRule({
        name: '测试规则',
        type: ExceptionRuleType.PAUSE_ONLY
      });

      // 创建3条记录
      for (let i = 0; i < 3; i++) {
        const sessionContext = createMockSessionContext({ sessionId: `session_${i}` });
        await tracker.recordUsage(rule.id, sessionContext, 'pause');
      }

      const history = await tracker.getRuleUsageHistory(rule.id, 2);
      expect(history).toHaveLength(2);
    });

    test('应该能够获取会话使用历史', async () => {
      const rule1 = await storage.createRule({
        name: '规则1',
        type: ExceptionRuleType.PAUSE_ONLY
      });
      const rule2 = await storage.createRule({
        name: '规则2',
        type: ExceptionRuleType.EARLY_COMPLETION_ONLY
      });

      const sessionContext = createMockSessionContext({ sessionId: 'target_session' });
      await tracker.recordUsage(rule1.id, sessionContext, 'pause');
      await tracker.recordUsage(rule2.id, sessionContext, 'early_completion');

      // 创建其他会话的记录
      const otherSessionContext = createMockSessionContext({ sessionId: 'other_session' });
      await tracker.recordUsage(rule1.id, otherSessionContext, 'pause');

      const sessionHistory = await tracker.getSessionUsageHistory('target_session');

      expect(sessionHistory).toHaveLength(2);
      expect(sessionHistory.every(r => r.sessionId === 'target_session')).toBe(true);
    });
  });

  describe('时间范围统计', () => {
    test('应该能够获取时间范围内的使用统计', async () => {
      const rule = await storage.createRule({
        name: '测试规则',
        type: ExceptionRuleType.PAUSE_ONLY
      });

      const sessionContext = createMockSessionContext();
      await tracker.recordUsage(rule.id, sessionContext, 'pause');

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7); // 过去7天

      const stats = await tracker.getUsageStatsInTimeRange(startDate, endDate);

      expect(stats.totalUsage).toBe(1);
      expect(stats.pauseUsage).toBe(1);
      expect(stats.earlyCompletionUsage).toBe(0);
      expect(stats.dailyUsage.length).toBeGreaterThan(0);
      expect(stats.topRules).toHaveLength(1);
      expect(stats.topRules[0].ruleName).toBe('测试规则');
    });

    test('时间范围外的记录应该被排除', async () => {
      const rule = await storage.createRule({
        name: '测试规则',
        type: ExceptionRuleType.PAUSE_ONLY
      });

      const sessionContext = createMockSessionContext();
      await tracker.recordUsage(rule.id, sessionContext, 'pause');

      // 查询未来的时间范围
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 1);
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 7);

      const stats = await tracker.getUsageStatsInTimeRange(startDate, endDate);

      expect(stats.totalUsage).toBe(0);
      expect(stats.pauseUsage).toBe(0);
      expect(stats.earlyCompletionUsage).toBe(0);
    });
  });

  describe('使用趋势分析', () => {
    test('应该能够获取规则使用趋势', async () => {
      const rule = await storage.createRule({
        name: '测试规则',
        type: ExceptionRuleType.PAUSE_ONLY
      });

      const sessionContext = createMockSessionContext();
      await tracker.recordUsage(rule.id, sessionContext, 'pause');

      const trend = await tracker.getRuleUsageTrend(rule.id, 7);

      expect(trend.totalUsage).toBe(1);
      expect(trend.averageDailyUsage).toBeCloseTo(1/7, 2);
      expect(trend.trend).toHaveLength(8); // 7天 + 今天
      expect(trend.peakUsageDate).toBeTruthy();
    });

    test('没有使用记录的规则应该返回空趋势', async () => {
      const rule = await storage.createRule({
        name: '未使用规则',
        type: ExceptionRuleType.PAUSE_ONLY
      });

      const trend = await tracker.getRuleUsageTrend(rule.id, 7);

      expect(trend.totalUsage).toBe(0);
      expect(trend.averageDailyUsage).toBe(0);
      expect(trend.peakUsageDate).toBeNull();
    });
  });

  describe('效率分析', () => {
    test('应该能够分析规则使用效率', async () => {
      const rule = await storage.createRule({
        name: '测试规则',
        type: ExceptionRuleType.PAUSE_ONLY
      });

      // 创建不同进度的使用记录
      const earlyContext = createMockSessionContext({ 
        elapsedTime: 100, 
        remainingTime: 800 // 进度 11%
      });
      const midContext = createMockSessionContext({ 
        elapsedTime: 400, 
        remainingTime: 600 // 进度 40%
      });
      const lateContext = createMockSessionContext({ 
        elapsedTime: 800, 
        remainingTime: 200 // 进度 80%
      });

      await tracker.recordUsage(rule.id, earlyContext, 'pause');
      await tracker.recordUsage(rule.id, midContext, 'pause');
      await tracker.recordUsage(rule.id, lateContext, 'pause');

      const analysis = await tracker.getRuleEfficiencyAnalysis(rule.id);

      expect(analysis.averageTaskProgress).toBeCloseTo(0.44, 2); // (0.11 + 0.4 + 0.8) / 3
      expect(analysis.usagePatterns.earlyUsage).toBe(1);
      expect(analysis.usagePatterns.midUsage).toBe(1);
      expect(analysis.usagePatterns.lateUsage).toBe(1);
      expect(analysis.recommendations).toHaveLength(1);
      expect(analysis.recommendations[0]).toContain('正常');
    });

    test('没有进度数据时应该返回默认分析', async () => {
      const rule = await storage.createRule({
        name: '测试规则',
        type: ExceptionRuleType.PAUSE_ONLY
      });

      const analysis = await tracker.getRuleEfficiencyAnalysis(rule.id);

      expect(analysis.averageTaskProgress).toBe(0);
      expect(analysis.usagePatterns.earlyUsage).toBe(0);
      expect(analysis.usagePatterns.midUsage).toBe(0);
      expect(analysis.usagePatterns.lateUsage).toBe(0);
      expect(analysis.recommendations).toContain('暂无足够数据进行分析');
    });
  });

  describe('数据导出', () => {
    test('应该能够导出JSON格式的使用数据', async () => {
      const rule = await storage.createRule({
        name: '测试规则',
        type: ExceptionRuleType.PAUSE_ONLY
      });

      const sessionContext = createMockSessionContext();
      await tracker.recordUsage(rule.id, sessionContext, 'pause');

      const exportedData = await tracker.exportUsageData('json');
      const parsedData = JSON.parse(exportedData);

      expect(parsedData.exportedAt).toBeTruthy();
      expect(parsedData.overallStats).toBeTruthy();
      expect(parsedData.rules).toHaveLength(1);
      expect(parsedData.usageRecords).toHaveLength(1);
      expect(parsedData.summary.totalRules).toBe(1);
      expect(parsedData.summary.totalRecords).toBe(1);
    });

    test('应该能够导出CSV格式的使用数据', async () => {
      const rule = await storage.createRule({
        name: '测试规则',
        type: ExceptionRuleType.PAUSE_ONLY
      });

      const sessionContext = createMockSessionContext();
      await tracker.recordUsage(rule.id, sessionContext, 'pause');

      const exportedData = await tracker.exportUsageData('csv');
      const lines = exportedData.split('\n');

      expect(lines[0]).toContain('Date,Rule Name,Action Type'); // CSV 头部
      expect(lines[1]).toContain('测试规则'); // 数据行
      expect(lines[1]).toContain('pause');
    });
  });

  describe('数据清理', () => {
    test('应该能够计算需要清理的过期记录数量', async () => {
      const rule = await storage.createRule({
        name: '测试规则',
        type: ExceptionRuleType.PAUSE_ONLY
      });

      const sessionContext = createMockSessionContext();
      await tracker.recordUsage(rule.id, sessionContext, 'pause');

      // 测试清理功能（这里只是计算，实际清理需要更多实现）
      const removedCount = await tracker.cleanupExpiredRecords(1); // 保留1天
      expect(removedCount).toBe(0); // 刚创建的记录不应该被清理
    });
  });
});