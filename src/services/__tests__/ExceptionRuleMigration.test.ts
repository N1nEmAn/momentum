/**
 * 例外规则迁移服务测试
 */

import { ExceptionRuleMigrationService } from '../ExceptionRuleMigration';
import { ExceptionRuleManager } from '../ExceptionRuleManager';
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

// Mock ExceptionRuleManager
jest.mock('../ExceptionRuleManager');

describe('ExceptionRuleMigrationService', () => {
  let migrationService: ExceptionRuleMigrationService;
  let mockRuleManager: jest.Mocked<ExceptionRuleManager>;

  beforeEach(() => {
    migrationService = new ExceptionRuleMigrationService();
    mockRuleManager = new ExceptionRuleManager() as jest.Mocked<ExceptionRuleManager>;
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe('迁移需求检查', () => {
    test('没有迁移信息且没有旧数据时应该返回false', async () => {
      // Mock getLegacyChains to return empty array
      jest.spyOn(migrationService as any, 'getLegacyChains').mockResolvedValue([]);

      const needsMigration = await migrationService.needsMigration();
      expect(needsMigration).toBe(false);
    });

    test('已经迁移过的数据应该返回false', async () => {
      // Set migration info
      localStorage.setItem('momentum_exception_rules_migration', JSON.stringify({
        version: '1.0.0',
        migratedAt: new Date().toISOString(),
        totalRules: 5,
        skippedRules: 0,
        errors: 0
      }));

      const needsMigration = await migrationService.needsMigration();
      expect(needsMigration).toBe(false);
    });

    test('有旧数据且未迁移时应该返回true', async () => {
      // Mock getLegacyChains to return chains with exceptions
      const mockChains = [
        {
          id: 'chain1',
          name: '测试任务1',
          exceptions: ['上厕所', '喝水']
        },
        {
          id: 'chain2',
          name: '测试任务2',
          exceptions: ['休息']
        }
      ];
      jest.spyOn(migrationService as any, 'getLegacyChains').mockResolvedValue(mockChains);

      const needsMigration = await migrationService.needsMigration();
      expect(needsMigration).toBe(true);
    });
  });

  describe('迁移建议', () => {
    test('应该正确分析迁移数据', async () => {
      const mockChains = [
        {
          id: 'chain1',
          name: '任务1',
          exceptions: ['上厕所', '喝水', '上厕所'] // 包含重复
        },
        {
          id: 'chain2',
          name: '任务2',
          exceptions: ['上厕所', '休息'] // 上厕所重复
        }
      ];
      jest.spyOn(migrationService as any, 'getLegacyChains').mockResolvedValue(mockChains);

      const suggestions = await migrationService.getMigrationSuggestions();

      expect(suggestions.totalRules).toBe(5); // 总共5个规则（包含重复）
      expect(suggestions.uniqueRules).toHaveLength(3); // 3个唯一规则
      expect(suggestions.duplicateRules).toHaveLength(1); // 1个重复规则（上厕所）
      expect(suggestions.duplicateRules[0].rule).toBe('上厕所');
      expect(suggestions.duplicateRules[0].count).toBe(3);
      expect(suggestions.recommendations.length).toBeGreaterThan(0);
    });

    test('应该识别常见模式', async () => {
      const mockChains = [
        {
          id: 'chain1',
          name: '任务1',
          exceptions: ['上厕所', '喝水', '接电话', '查看消息']
        }
      ];
      jest.spyOn(migrationService as any, 'getLegacyChains').mockResolvedValue(mockChains);

      const suggestions = await migrationService.getMigrationSuggestions();

      expect(suggestions.recommendations.some(r => r.includes('常见模式'))).toBe(true);
    });

    test('规则数量过多时应该给出建议', async () => {
      const mockChains = [
        {
          id: 'chain1',
          name: '任务1',
          exceptions: Array.from({ length: 25 }, (_, i) => `规则${i}`)
        }
      ];
      jest.spyOn(migrationService as any, 'getLegacyChains').mockResolvedValue(mockChains);

      const suggestions = await migrationService.getMigrationSuggestions();

      expect(suggestions.recommendations.some(r => r.includes('规则数量较多'))).toBe(true);
    });
  });

  describe('迁移执行', () => {
    test('应该成功迁移规则', async () => {
      const mockChains = [
        {
          id: 'chain1',
          name: '任务1',
          exceptions: ['上厕所', '喝水']
        },
        {
          id: 'chain2',
          name: '任务2',
          exceptions: ['休息']
        }
      ];
      jest.spyOn(migrationService as any, 'getLegacyChains').mockResolvedValue(mockChains);

      // Mock rule creation
      mockRuleManager.createRule = jest.fn()
        .mockResolvedValueOnce({
          rule: { id: 'rule1', name: '上厕所', type: ExceptionRuleType.PAUSE_ONLY },
          warnings: []
        })
        .mockResolvedValueOnce({
          rule: { id: 'rule2', name: '喝水', type: ExceptionRuleType.PAUSE_ONLY },
          warnings: []
        })
        .mockResolvedValueOnce({
          rule: { id: 'rule3', name: '休息', type: ExceptionRuleType.PAUSE_ONLY },
          warnings: []
        });

      const progressCallback = jest.fn();
      const result = await migrationService.migrate(progressCallback);

      expect(result.totalChains).toBe(2);
      expect(result.migratedRules).toBe(3);
      expect(result.skippedRules).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.createdRules).toHaveLength(3);
      expect(progressCallback).toHaveBeenCalled();
    });

    test('应该处理迁移错误', async () => {
      const mockChains = [
        {
          id: 'chain1',
          name: '任务1',
          exceptions: ['有效规则', '无效规则']
        }
      ];
      jest.spyOn(migrationService as any, 'getLegacyChains').mockResolvedValue(mockChains);

      // Mock rule creation with one success and one failure
      mockRuleManager.createRule = jest.fn()
        .mockResolvedValueOnce({
          rule: { id: 'rule1', name: '有效规则', type: ExceptionRuleType.PAUSE_ONLY },
          warnings: []
        })
        .mockRejectedValueOnce(new Error('创建失败'));

      const result = await migrationService.migrate();

      expect(result.migratedRules).toBe(1);
      expect(result.skippedRules).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].chainName).toBe('无效规则');
    });

    test('应该报告迁移进度', async () => {
      const mockChains = [
        {
          id: 'chain1',
          name: '任务1',
          exceptions: ['规则1', '规则2']
        }
      ];
      jest.spyOn(migrationService as any, 'getLegacyChains').mockResolvedValue(mockChains);

      mockRuleManager.createRule = jest.fn()
        .mockResolvedValue({
          rule: { id: 'rule1', name: '规则1', type: ExceptionRuleType.PAUSE_ONLY },
          warnings: []
        });

      const progressCallback = jest.fn();
      await migrationService.migrate(progressCallback);

      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: 'analyzing',
          message: '分析现有数据...'
        })
      );

      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: 'migrating'
        })
      );

      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: 'complete'
        })
      );
    });
  });

  describe('迁移验证', () => {
    test('应该验证迁移结果', async () => {
      // Set migration info
      localStorage.setItem('momentum_exception_rules_migration', JSON.stringify({
        version: '1.0.0',
        migratedAt: new Date().toISOString(),
        totalRules: 2,
        skippedRules: 0,
        errors: 0
      }));

      // Mock rule manager
      mockRuleManager.getAllRules = jest.fn().mockResolvedValue([
        {
          id: 'rule1',
          name: '规则1',
          type: ExceptionRuleType.PAUSE_ONLY,
          description: '从旧系统迁移的规则',
          isActive: true
        },
        {
          id: 'rule2',
          name: '规则2',
          type: ExceptionRuleType.PAUSE_ONLY,
          description: '从旧系统迁移的规则',
          isActive: true
        }
      ]);

      const validation = await migrationService.validateMigration();

      expect(validation.isValid).toBe(true);
      expect(validation.issues).toHaveLength(0);
      expect(validation.statistics.totalRules).toBe(2);
      expect(validation.statistics.migratedRules).toBe(2);
    });

    test('应该检测数据不一致', async () => {
      // Set migration info with different count
      localStorage.setItem('momentum_exception_rules_migration', JSON.stringify({
        version: '1.0.0',
        migratedAt: new Date().toISOString(),
        totalRules: 3, // 期望3个，但实际只有2个
        skippedRules: 0,
        errors: 0
      }));

      mockRuleManager.getAllRules = jest.fn().mockResolvedValue([
        {
          id: 'rule1',
          name: '规则1',
          type: ExceptionRuleType.PAUSE_ONLY,
          description: '从旧系统迁移的规则',
          isActive: true
        },
        {
          id: 'rule2',
          name: '规则2',
          type: ExceptionRuleType.PAUSE_ONLY,
          description: '从旧系统迁移的规则',
          isActive: true
        }
      ]);

      const validation = await migrationService.validateMigration();

      expect(validation.isValid).toBe(false);
      expect(validation.issues.some(issue => issue.includes('数量不匹配'))).toBe(true);
    });
  });

  describe('迁移回滚', () => {
    test('应该能够回滚迁移', async () => {
      // Set migration info
      localStorage.setItem('momentum_exception_rules_migration', JSON.stringify({
        version: '1.0.0',
        migratedAt: new Date().toISOString(),
        totalRules: 2,
        skippedRules: 0,
        errors: 0
      }));

      // Mock migrated rules
      mockRuleManager.getAllRules = jest.fn().mockResolvedValue([
        {
          id: 'rule1',
          name: '规则1',
          description: '从旧系统迁移的规则'
        },
        {
          id: 'rule2',
          name: '规则2',
          description: '从旧系统迁移的规则'
        }
      ]);

      mockRuleManager.deleteRule = jest.fn().mockResolvedValue(undefined);

      const result = await migrationService.rollback();

      expect(result.success).toBe(true);
      expect(result.deletedRules).toBe(2);
      expect(mockRuleManager.deleteRule).toHaveBeenCalledTimes(2);
      expect(localStorage.getItem('momentum_exception_rules_migration')).toBeNull();
    });

    test('没有迁移记录时应该返回失败', async () => {
      const result = await migrationService.rollback();

      expect(result.success).toBe(false);
      expect(result.message).toContain('没有找到迁移记录');
      expect(result.deletedRules).toBe(0);
    });
  });

  describe('迁移报告', () => {
    test('应该生成完整的迁移报告', async () => {
      // Set migration info
      localStorage.setItem('momentum_exception_rules_migration', JSON.stringify({
        version: '1.0.0',
        migratedAt: new Date().toISOString(),
        totalRules: 2,
        skippedRules: 0,
        errors: 0
      }));

      mockRuleManager.getAllRules = jest.fn().mockResolvedValue([
        {
          id: 'rule1',
          name: '规则1',
          description: '从旧系统迁移的规则',
          isActive: true
        }
      ]);

      jest.spyOn(migrationService as any, 'getLegacyChains').mockResolvedValue([]);

      const report = await migrationService.generateMigrationReport();
      const parsedReport = JSON.parse(report);

      expect(parsedReport.title).toBe('例外规则迁移报告');
      expect(parsedReport.migrationInfo).toBeTruthy();
      expect(parsedReport.validation).toBeTruthy();
      expect(parsedReport.suggestions).toBeTruthy();
      expect(parsedReport.summary).toBeTruthy();
      expect(parsedReport.summary.migrationCompleted).toBe(true);
    });

    test('发生错误时应该生成错误报告', async () => {
      // Mock error in validation
      mockRuleManager.getAllRules = jest.fn().mockRejectedValue(new Error('测试错误'));

      const report = await migrationService.generateMigrationReport();
      const parsedReport = JSON.parse(report);

      expect(parsedReport.error).toBeTruthy();
    });
  });
});