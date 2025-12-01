/**
 * 例外规则系统端到端测试
 * 测试完整的用户工作流程和系统集成
 */

import { ExceptionRuleManager } from '../services/ExceptionRuleManager';
import { ExceptionRuleStorageService } from '../services/ExceptionRuleStorage';
import { RuleDuplicationDetector } from '../services/RuleDuplicationDetector';
import { RuleClassificationService } from '../services/RuleClassificationService';
import { RuleUsageTracker } from '../services/RuleUsageTracker';
import { ExceptionRuleType, SessionContext } from '../types';

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

describe('例外规则系统端到端测试', () => {
  let manager: ExceptionRuleManager;
  let storage: ExceptionRuleStorageService;
  let duplicationDetector: RuleDuplicationDetector;
  let classificationService: RuleClassificationService;
  let usageTracker: RuleUsageTracker;

  beforeEach(() => {
    localStorage.clear();
    manager = new ExceptionRuleManager();
    storage = new ExceptionRuleStorageService();
    duplicationDetector = new RuleDuplicationDetector();
    classificationService = new RuleClassificationService();
    usageTracker = new RuleUsageTracker();
  });

  describe('完整的暂停操作流程', () => {
    test('用户创建暂停规则并使用的完整流程', async () => {
      // 1. 用户创建暂停规则
      const createResult = await manager.createRule(
        '上厕所',
        ExceptionRuleType.PAUSE_ONLY,
        '生理需求暂停'
      );

      expect(createResult.rule.name).toBe('上厕所');
      expect(createResult.rule.type).toBe(ExceptionRuleType.PAUSE_ONLY);
      expect(createResult.warnings).toContain('这是一个常见的规则模式，建议检查是否已有类似规则');

      // 2. 验证规则已正确存储
      const storedRule = await storage.getRuleById(createResult.rule.id);
      expect(storedRule).not.toBeNull();
      expect(storedRule!.name).toBe('上厕所');

      // 3. 验证规则分类正确
      const pauseRules = await classificationService.getRulesByType(ExceptionRuleType.PAUSE_ONLY);
      expect(pauseRules).toHaveLength(1);
      expect(pauseRules[0].id).toBe(createResult.rule.id);

      // 4. 模拟用户在任务中使用规则
      const sessionContext: SessionContext = {
        sessionId: 'session_1',
        chainId: 'chain_1',
        chainName: '工作任务',
        startedAt: new Date(),
        elapsedTime: 300, // 5分钟
        remainingTime: 600, // 10分钟
        isDurationless: false
      };

      // 5. 验证规则可用于暂停操作
      const isValidForPause = await manager.validateRuleForAction(createResult.rule.id, 'pause');
      expect(isValidForPause).toBe(true);

      const isValidForCompletion = await manager.validateRuleForAction(createResult.rule.id, 'early_completion');
      expect(isValidForCompletion).toBe(false);

      // 6. 使用规则执行暂停操作
      const useResult = await manager.useRule(createResult.rule.id, sessionContext, 'pause');
      
      expect(useResult.record.ruleId).toBe(createResult.rule.id);
      expect(useResult.record.actionType).toBe('pause');
      expect(useResult.record.taskElapsedTime).toBe(300);
      expect(useResult.record.taskRemainingTime).toBe(600);
      expect(useResult.rule.name).toBe('上厕所');

      // 7. 验证使用统计已更新
      const updatedRule = await storage.getRuleById(createResult.rule.id);
      expect(updatedRule!.usageCount).toBe(1);
      expect(updatedRule!.lastUsedAt).toBeInstanceOf(Date);

      // 8. 验证使用记录已创建
      const usageHistory = await manager.getRuleUsageHistory(createResult.rule.id);
      expect(usageHistory).toHaveLength(1);
      expect(usageHistory[0].actionType).toBe('pause');

      // 9. 验证统计数据
      const ruleStats = await manager.getRuleStats(createResult.rule.id);
      expect(ruleStats.totalUsage).toBe(1);
      expect(ruleStats.pauseUsage).toBe(1);
      expect(ruleStats.earlyCompletionUsage).toBe(0);
    });

    test('用户尝试使用错误类型规则的流程', async () => {
      // 1. 创建一个仅用于提前完成的规则
      const createResult = await manager.createRule(
        '任务完成',
        ExceptionRuleType.EARLY_COMPLETION_ONLY,
        '任务提前完成'
      );

      // 2. 尝试用于暂停操作（应该失败）
      const sessionContext: SessionContext = {
        sessionId: 'session_1',
        chainId: 'chain_1',
        chainName: '工作任务',
        startedAt: new Date(),
        elapsedTime: 300,
        remainingTime: 600,
        isDurationless: false
      };

      // 3. 验证规则类型不匹配
      const isValidForPause = await manager.validateRuleForAction(createResult.rule.id, 'pause');
      expect(isValidForPause).toBe(false);

      // 4. 尝试使用规则应该抛出异常
      await expect(manager.useRule(createResult.rule.id, sessionContext, 'pause'))
        .rejects.toThrow('不能用于暂停计时操作');

      // 5. 验证统计数据未更新
      const ruleStats = await manager.getRuleStats(createResult.rule.id);
      expect(ruleStats.totalUsage).toBe(0);
    });
  });

  describe('完整的提前完成操作流程', () => {
    test('用户创建提前完成规则并使用的完整流程', async () => {
      // 1. 创建提前完成规则
      const createResult = await manager.createRule(
        '任务已完成',
        ExceptionRuleType.EARLY_COMPLETION_ONLY,
        '任务实际已完成'
      );

      // 2. 模拟使用规则
      const sessionContext: SessionContext = {
        sessionId: 'session_2',
        chainId: 'chain_2',
        chainName: '学习任务',
        startedAt: new Date(),
        elapsedTime: 1200, // 20分钟
        remainingTime: 300, // 5分钟
        isDurationless: false
      };

      // 3. 使用规则执行提前完成操作
      const useResult = await manager.useRule(createResult.rule.id, sessionContext, 'early_completion');
      
      expect(useResult.record.actionType).toBe('early_completion');
      expect(useResult.record.taskElapsedTime).toBe(1200);

      // 4. 验证统计数据
      const ruleStats = await manager.getRuleStats(createResult.rule.id);
      expect(ruleStats.totalUsage).toBe(1);
      expect(ruleStats.pauseUsage).toBe(0);
      expect(ruleStats.earlyCompletionUsage).toBe(1);
    });
  });

  describe('重复规则检测和处理流程', () => {
    test('用户尝试创建重复规则的完整流程', async () => {
      // 1. 创建第一个规则
      await manager.createRule('喝水', ExceptionRuleType.PAUSE_ONLY);

      // 2. 尝试创建重复规则
      await expect(manager.createRule('喝水', ExceptionRuleType.EARLY_COMPLETION_ONLY))
        .rejects.toThrow('规则名称 "喝水" 已存在');

      // 3. 获取重复检测建议
      const suggestions = await manager.getDuplicationSuggestions('喝水');
      
      expect(suggestions.hasExactMatch).toBe(true);
      expect(suggestions.exactMatches).toHaveLength(1);
      expect(suggestions.nameSuggestions.length).toBeGreaterThan(0);
      expect(suggestions.nameSuggestions).toContain('喝水 2');
    });

    test('用户创建相似规则的流程', async () => {
      // 1. 创建原始规则
      await manager.createRule('上厕所', ExceptionRuleType.PAUSE_ONLY);

      // 2. 创建相似规则
      const createResult = await manager.createRule('去厕所', ExceptionRuleType.PAUSE_ONLY);
      
      expect(createResult.warnings.length).toBeGreaterThan(0);
      expect(createResult.warnings[0]).toContain('相似规则');

      // 3. 验证两个规则都存在
      const allRules = await manager.getAllRules();
      const activeRules = allRules.filter(rule => rule.isActive);
      expect(activeRules).toHaveLength(2);
    });
  });

  describe('规则搜索和筛选流程', () => {
    beforeEach(async () => {
      // 创建测试数据
      await manager.createRule('上厕所', ExceptionRuleType.PAUSE_ONLY, '生理需求');
      await manager.createRule('喝水', ExceptionRuleType.PAUSE_ONLY, '补充水分');
      await manager.createRule('完成任务', ExceptionRuleType.EARLY_COMPLETION_ONLY, '任务完成');
      await manager.createRule('接电话', ExceptionRuleType.PAUSE_ONLY, '重要电话');
    });

    test('用户搜索规则的完整流程', async () => {
      // 1. 按名称搜索
      const nameResults = await manager.searchRules('厕所');
      expect(nameResults).toHaveLength(1);
      expect(nameResults[0].name).toBe('上厕所');

      // 2. 按类型搜索
      const pauseResults = await manager.searchRules('', ExceptionRuleType.PAUSE_ONLY);
      expect(pauseResults).toHaveLength(3);
      expect(pauseResults.every(r => r.type === ExceptionRuleType.PAUSE_ONLY)).toBe(true);

      // 3. 按操作类型搜索
      const actionResults = await manager.searchRules('', undefined, 'early_completion');
      expect(actionResults).toHaveLength(1);
      expect(actionResults[0].name).toBe('完成任务');

      // 4. 组合搜索
      const combinedResults = await manager.searchRules('水', ExceptionRuleType.PAUSE_ONLY);
      expect(combinedResults).toHaveLength(1);
      expect(combinedResults[0].name).toBe('喝水');
    });

    test('用户获取使用建议的流程', async () => {
      // 1. 模拟使用一些规则
      const rules = await manager.getAllRules();
      const waterRule = rules.find(r => r.name === '喝水')!;
      const toiletRule = rules.find(r => r.name === '上厕所')!;

      const sessionContext: SessionContext = {
        sessionId: 'session_1',
        chainId: 'chain_1',
        chainName: '工作任务',
        startedAt: new Date(),
        elapsedTime: 300,
        remainingTime: 600,
        isDurationless: false
      };

      // 多次使用喝水规则
      await manager.useRule(waterRule.id, sessionContext, 'pause');
      await manager.useRule(waterRule.id, sessionContext, 'pause');
      await manager.useRule(toiletRule.id, sessionContext, 'pause');

      // 2. 获取使用建议
      const suggestions = await manager.getRuleUsageSuggestions('pause');
      
      expect(suggestions.mostUsed).toHaveLength(3);
      expect(suggestions.mostUsed[0].name).toBe('喝水'); // 使用最多的在前
      
      expect(suggestions.recentlyUsed).toHaveLength(2);
      expect(suggestions.suggested).toHaveLength(3);
    });
  });

  describe('规则管理生命周期流程', () => {
    test('规则的完整生命周期：创建、使用、更新、删除', async () => {
      // 1. 创建规则
      const createResult = await manager.createRule(
        '原始规则',
        ExceptionRuleType.PAUSE_ONLY,
        '原始描述'
      );

      const ruleId = createResult.rule.id;

      // 2. 使用规则
      const sessionContext: SessionContext = {
        sessionId: 'session_1',
        chainId: 'chain_1',
        chainName: '测试任务',
        startedAt: new Date(),
        elapsedTime: 300,
        remainingTime: 600,
        isDurationless: false
      };

      await manager.useRule(ruleId, sessionContext, 'pause');

      // 验证使用统计
      let stats = await manager.getRuleStats(ruleId);
      expect(stats.totalUsage).toBe(1);

      // 3. 更新规则
      const updateResult = await manager.updateRule(ruleId, {
        name: '更新后的规则',
        description: '更新后的描述'
      });

      expect(updateResult.rule.name).toBe('更新后的规则');
      expect(updateResult.rule.description).toBe('更新后的描述');
      expect(updateResult.rule.usageCount).toBe(1); // 使用统计应该保留

      // 4. 再次使用更新后的规则
      await manager.useRule(ruleId, sessionContext, 'pause');

      stats = await manager.getRuleStats(ruleId);
      expect(stats.totalUsage).toBe(2);

      // 5. 删除规则
      await manager.deleteRule(ruleId);

      // 验证规则已被软删除
      const deletedRule = await manager.getRuleById(ruleId);
      expect(deletedRule?.isActive).toBe(false);

      // 验证规则不再出现在活跃规则列表中
      const activeRules = await manager.getRulesByType(ExceptionRuleType.PAUSE_ONLY);
      expect(activeRules.find(r => r.id === ruleId)).toBeUndefined();

      // 但使用历史应该保留
      const history = await manager.getRuleUsageHistory(ruleId);
      expect(history).toHaveLength(2);
    });
  });

  describe('批量操作流程', () => {
    test('批量导入规则的完整流程', async () => {
      // 1. 准备导入数据
      const rulesToImport = [
        {
          name: '导入规则1',
          type: ExceptionRuleType.PAUSE_ONLY,
          description: '导入的暂停规则'
        },
        {
          name: '导入规则2',
          type: ExceptionRuleType.EARLY_COMPLETION_ONLY,
          description: '导入的完成规则'
        },
        {
          name: '重复规则',
          type: ExceptionRuleType.PAUSE_ONLY,
          description: '这个规则会重复'
        },
        {
          name: '重复规则', // 重复
          type: ExceptionRuleType.EARLY_COMPLETION_ONLY,
          description: '重复的规则'
        }
      ];

      // 2. 执行批量导入
      const importResult = await manager.importRules(rulesToImport, {
        skipDuplicates: true
      });

      // 3. 验证导入结果
      expect(importResult.imported).toHaveLength(3); // 3个成功导入
      expect(importResult.skipped).toHaveLength(1);  // 1个重复跳过
      expect(importResult.errors).toHaveLength(0);   // 0个错误

      // 4. 验证规则已正确创建
      const allRules = await manager.getAllRules();
      const activeRules = allRules.filter(rule => rule.isActive);
      expect(activeRules).toHaveLength(3);

      // 5. 验证规则类型分布
      const pauseRules = await manager.getRulesByType(ExceptionRuleType.PAUSE_ONLY);
      const completionRules = await manager.getRulesByType(ExceptionRuleType.EARLY_COMPLETION_ONLY);
      
      expect(pauseRules).toHaveLength(2);
      expect(completionRules).toHaveLength(1);
    });

    test('批量导出规则的完整流程', async () => {
      // 1. 创建测试规则
      const rule1 = await manager.createRule('规则1', ExceptionRuleType.PAUSE_ONLY);
      const rule2 = await manager.createRule('规则2', ExceptionRuleType.EARLY_COMPLETION_ONLY);

      // 2. 使用规则生成统计数据
      const sessionContext: SessionContext = {
        sessionId: 'session_1',
        chainId: 'chain_1',
        chainName: '测试任务',
        startedAt: new Date(),
        elapsedTime: 300,
        remainingTime: 600,
        isDurationless: false
      };

      await manager.useRule(rule1.rule.id, sessionContext, 'pause');
      await manager.useRule(rule2.rule.id, sessionContext, 'early_completion');

      // 3. 导出规则（不包含使用数据）
      const exportWithoutUsage = await manager.exportRules(false);
      
      expect(exportWithoutUsage.rules).toHaveLength(2);
      expect(exportWithoutUsage.usageRecords).toBeUndefined();
      expect(exportWithoutUsage.summary.totalRules).toBe(2);
      expect(exportWithoutUsage.summary.totalUsageRecords).toBe(0);

      // 4. 导出规则（包含使用数据）
      const exportWithUsage = await manager.exportRules(true);
      
      expect(exportWithUsage.rules).toHaveLength(2);
      expect(exportWithUsage.usageRecords).toBeDefined();
      expect(exportWithUsage.usageRecords!.length).toBe(2);
      expect(exportWithUsage.summary.totalUsageRecords).toBe(2);
    });
  });

  describe('系统健康检查流程', () => {
    test('系统健康状态检查的完整流程', async () => {
      // 1. 空系统的健康检查
      let health = await manager.getSystemHealth();
      
      expect(health.status).toBe('warning');
      expect(health.totalRules).toBe(0);
      expect(health.activeRules).toBe(0);
      expect(health.issues).toContain('没有活跃的例外规则');

      // 2. 添加规则后的健康检查
      const rule = await manager.createRule('测试规则', ExceptionRuleType.PAUSE_ONLY);
      
      health = await manager.getSystemHealth();
      expect(health.status).toBe('warning');
      expect(health.totalRules).toBe(1);
      expect(health.activeRules).toBe(1);
      expect(health.issues).toContain('有规则但没有使用记录');

      // 3. 使用规则后的健康检查
      const sessionContext: SessionContext = {
        sessionId: 'session_1',
        chainId: 'chain_1',
        chainName: '测试任务',
        startedAt: new Date(),
        elapsedTime: 300,
        remainingTime: 600,
        isDurationless: false
      };

      await manager.useRule(rule.rule.id, sessionContext, 'pause');

      health = await manager.getSystemHealth();
      expect(health.status).toBe('healthy');
      expect(health.totalUsageRecords).toBe(1);
      expect(health.lastUsedAt).toBeInstanceOf(Date);
      expect(health.issues).toHaveLength(0);
    });
  });

  describe('数据一致性验证流程', () => {
    test('跨服务数据一致性验证', async () => {
      // 1. 通过管理器创建规则
      const createResult = await manager.createRule(
        '一致性测试规则',
        ExceptionRuleType.PAUSE_ONLY,
        '测试数据一致性'
      );

      const ruleId = createResult.rule.id;

      // 2. 验证存储服务中的数据
      const storedRule = await storage.getRuleById(ruleId);
      expect(storedRule).not.toBeNull();
      expect(storedRule!.name).toBe('一致性测试规则');

      // 3. 验证分类服务中的数据
      const pauseRules = await classificationService.getRulesByType(ExceptionRuleType.PAUSE_ONLY);
      expect(pauseRules.find(r => r.id === ruleId)).toBeDefined();

      // 4. 使用规则
      const sessionContext: SessionContext = {
        sessionId: 'session_1',
        chainId: 'chain_1',
        chainName: '测试任务',
        startedAt: new Date(),
        elapsedTime: 300,
        remainingTime: 600,
        isDurationless: false
      };

      await manager.useRule(ruleId, sessionContext, 'pause');

      // 5. 验证使用跟踪器中的数据
      const usageStats = await usageTracker.getRuleUsageStats(ruleId);
      expect(usageStats.totalUsage).toBe(1);
      expect(usageStats.pauseUsage).toBe(1);

      // 6. 验证存储中的统计数据已更新
      const updatedRule = await storage.getRuleById(ruleId);
      expect(updatedRule!.usageCount).toBe(1);
      expect(updatedRule!.lastUsedAt).toBeInstanceOf(Date);

      // 7. 验证使用记录已创建
      const usageRecords = await storage.getUsageRecordsByRuleId(ruleId);
      expect(usageRecords).toHaveLength(1);
      expect(usageRecords[0].actionType).toBe('pause');
    });
  });
});