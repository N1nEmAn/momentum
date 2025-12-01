/**
 * ChainDeletionHandler 集成测试
 */

import { ChainDeletionHandler } from '../ChainDeletionHandler';
import { exceptionRuleManager } from '../ExceptionRuleManager';
import { exceptionRuleStorage } from '../ExceptionRuleStorage';
import { ExceptionRule, ExceptionRuleType } from '../../types';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock dependencies
jest.mock('../ExceptionRuleManager');
jest.mock('../ExceptionRuleStorage');

describe('ChainDeletionHandler Integration Tests', () => {
  let chainDeletionHandler: ChainDeletionHandler;
  const mockExceptionRuleManager = exceptionRuleManager as jest.Mocked<typeof exceptionRuleManager>;
  const mockExceptionRuleStorage = exceptionRuleStorage as jest.Mocked<typeof exceptionRuleStorage>;

  beforeEach(() => {
    chainDeletionHandler = new ChainDeletionHandler();
    jest.clearAllMocks();
    localStorageMock.clear();
  });

  const mockChainRules: ExceptionRule[] = [
    {
      id: 'rule-1',
      name: '链规则1',
      type: ExceptionRuleType.PAUSE_ONLY,
      scope: 'chain',
      chainId: 'chain-1',
      createdAt: new Date('2024-01-01'),
      usageCount: 5,
      isActive: true,
      isArchived: false
    },
    {
      id: 'rule-2',
      name: '链规则2',
      type: ExceptionRuleType.EARLY_COMPLETION_ONLY,
      scope: 'chain',
      chainId: 'chain-1',
      createdAt: new Date('2024-01-02'),
      usageCount: 3,
      isActive: true,
      isArchived: false
    },
    {
      id: 'rule-3',
      name: '全局规则',
      type: ExceptionRuleType.PAUSE_ONLY,
      scope: 'global',
      createdAt: new Date('2024-01-03'),
      usageCount: 10,
      isActive: true,
      isArchived: false
    }
  ];

  describe('moveChainToRecycleBin', () => {
    it('应该成功将链移动到回收站并归档相关规则', async () => {
      // 准备测试数据
      mockExceptionRuleManager.getAllRules.mockResolvedValue(mockChainRules);
      mockExceptionRuleStorage.updateRule.mockImplementation(async (id, updates) => {
        const rule = mockChainRules.find(r => r.id === id);
        return { ...rule!, ...updates };
      });

      // 执行测试
      const result = await chainDeletionHandler.moveChainToRecycleBin('chain-1');

      // 验证结果
      expect(result.affectedRules).toHaveLength(2);
      expect(result.archivedCount).toBe(2);
      expect(result.affectedRules.every(rule => rule.isArchived === true)).toBe(true);
      expect(result.affectedRules.every(rule => rule.isActive === false)).toBe(true);

      // 验证调用
      expect(mockExceptionRuleStorage.updateRule).toHaveBeenCalledTimes(2);
      expect(mockExceptionRuleStorage.updateRule).toHaveBeenCalledWith('rule-1', {
        isArchived: true,
        isActive: false
      });
      expect(mockExceptionRuleStorage.updateRule).toHaveBeenCalledWith('rule-2', {
        isArchived: true,
        isActive: false
      });

      // 验证删除时间记录
      const deletionRecords = JSON.parse(localStorageMock.getItem('chain_deletion_records') || '[]');
      expect(deletionRecords).toHaveLength(1);
      expect(deletionRecords[0].chainId).toBe('chain-1');
    });

    it('应该只处理活跃的链专属规则', async () => {
      const rulesWithInactive = [
        ...mockChainRules,
        {
          id: 'rule-4',
          name: '非活跃链规则',
          type: ExceptionRuleType.PAUSE_ONLY,
          scope: 'chain' as const,
          chainId: 'chain-1',
          createdAt: new Date('2024-01-04'),
          usageCount: 1,
          isActive: false,
          isArchived: false
        }
      ];

      mockExceptionRuleManager.getAllRules.mockResolvedValue(rulesWithInactive);
      mockExceptionRuleStorage.updateRule.mockImplementation(async (id, updates) => {
        const rule = rulesWithInactive.find(r => r.id === id);
        return { ...rule!, ...updates };
      });

      const result = await chainDeletionHandler.moveChainToRecycleBin('chain-1');

      // 应该只处理2个活跃的链规则，忽略非活跃的
      expect(result.affectedRules).toHaveLength(2);
      expect(mockExceptionRuleStorage.updateRule).toHaveBeenCalledTimes(2);
    });

    it('应该处理没有链规则的情况', async () => {
      mockExceptionRuleManager.getAllRules.mockResolvedValue([mockChainRules[2]]); // 只有全局规则

      const result = await chainDeletionHandler.moveChainToRecycleBin('chain-1');

      expect(result.affectedRules).toHaveLength(0);
      expect(result.archivedCount).toBe(0);
      expect(mockExceptionRuleStorage.updateRule).not.toHaveBeenCalled();
    });
  });

  describe('restoreChainFromRecycleBin', () => {
    it('应该成功从回收站恢复链并重新激活规则', async () => {
      // 准备归档的规则
      const archivedRules = mockChainRules.slice(0, 2).map(rule => ({
        ...rule,
        isArchived: true,
        isActive: false
      }));

      mockExceptionRuleManager.getAllRules.mockResolvedValue([
        ...archivedRules,
        mockChainRules[2] // 全局规则
      ]);
      mockExceptionRuleStorage.updateRule.mockImplementation(async (id, updates) => {
        const rule = archivedRules.find(r => r.id === id);
        return { ...rule!, ...updates };
      });

      // 设置删除记录
      localStorageMock.setItem('chain_deletion_records', JSON.stringify([
        { chainId: 'chain-1', deletedAt: new Date().toISOString() }
      ]));

      const result = await chainDeletionHandler.restoreChainFromRecycleBin('chain-1');

      expect(result.restoredRules).toHaveLength(2);
      expect(result.restoredCount).toBe(2);
      expect(result.restoredRules.every(rule => rule.isArchived === false)).toBe(true);
      expect(result.restoredRules.every(rule => rule.isActive === true)).toBe(true);

      // 验证删除记录被清除
      const deletionRecords = JSON.parse(localStorageMock.getItem('chain_deletion_records') || '[]');
      expect(deletionRecords).toHaveLength(0);
    });

    it('应该处理没有归档规则的情况', async () => {
      mockExceptionRuleManager.getAllRules.mockResolvedValue([mockChainRules[2]]); // 只有全局规则

      const result = await chainDeletionHandler.restoreChainFromRecycleBin('chain-1');

      expect(result.restoredRules).toHaveLength(0);
      expect(result.restoredCount).toBe(0);
      expect(mockExceptionRuleStorage.updateRule).not.toHaveBeenCalled();
    });
  });

  describe('permanentlyDeleteChain', () => {
    it('应该永久删除链的所有规则和使用记录', async () => {
      mockExceptionRuleManager.getAllRules.mockResolvedValue(mockChainRules);
      mockExceptionRuleManager.deleteRule.mockResolvedValue();
      mockExceptionRuleStorage.getAllUsageRecords.mockResolvedValue([
        {
          id: 'usage-1',
          ruleId: 'rule-1',
          chainId: 'chain-1',
          usedAt: new Date(),
          actionType: 'pause',
          sessionContext: { chainId: 'chain-1' },
          ruleScope: 'chain'
        },
        {
          id: 'usage-2',
          ruleId: 'rule-2',
          chainId: 'chain-1',
          usedAt: new Date(),
          actionType: 'early_completion',
          sessionContext: { chainId: 'chain-1' },
          ruleScope: 'chain'
        }
      ]);
      mockExceptionRuleStorage.deleteUsageRecord.mockResolvedValue();

      const result = await chainDeletionHandler.permanentlyDeleteChain('chain-1');

      expect(result.deletedRules).toEqual(['rule-1', 'rule-2']);
      expect(result.deletedUsageRecords).toBe(2);

      // 验证规则删除调用
      expect(mockExceptionRuleManager.deleteRule).toHaveBeenCalledTimes(2);
      expect(mockExceptionRuleManager.deleteRule).toHaveBeenCalledWith('rule-1');
      expect(mockExceptionRuleManager.deleteRule).toHaveBeenCalledWith('rule-2');

      // 验证使用记录删除调用
      expect(mockExceptionRuleStorage.deleteUsageRecord).toHaveBeenCalledTimes(2);
      expect(mockExceptionRuleStorage.deleteUsageRecord).toHaveBeenCalledWith('usage-1');
      expect(mockExceptionRuleStorage.deleteUsageRecord).toHaveBeenCalledWith('usage-2');
    });
  });

  describe('cleanupExpiredArchivedRules', () => {
    it('应该清理过期的归档规则', async () => {
      // 设置过期的删除记录
      const expiredDate = new Date();
      expiredDate.setDate(expiredDate.getDate() - 35); // 35天前

      localStorageMock.setItem('chain_deletion_records', JSON.stringify([
        { chainId: 'chain-1', deletedAt: expiredDate.toISOString() },
        { chainId: 'chain-2', deletedAt: new Date().toISOString() } // 不过期
      ]));

      // Mock 永久删除方法
      jest.spyOn(chainDeletionHandler, 'permanentlyDeleteChain').mockResolvedValue({
        deletedRules: ['rule-1', 'rule-2'],
        deletedUsageRecords: 2
      });

      const result = await chainDeletionHandler.cleanupExpiredArchivedRules(30);

      expect(result.cleanedRules).toEqual(['rule-1', 'rule-2']);
      expect(result.cleanedCount).toBe(2);
      expect(chainDeletionHandler.permanentlyDeleteChain).toHaveBeenCalledWith('chain-1');
      expect(chainDeletionHandler.permanentlyDeleteChain).not.toHaveBeenCalledWith('chain-2');
    });
  });

  describe('getChainDeletionImpact', () => {
    it('应该返回链删除的影响统计', async () => {
      mockExceptionRuleManager.getAllRules.mockResolvedValue(mockChainRules);
      mockExceptionRuleStorage.getUsageRecordsByChain.mockResolvedValue([
        {
          id: 'usage-1',
          ruleId: 'rule-1',
          chainId: 'chain-1',
          usedAt: new Date('2024-01-15'),
          actionType: 'pause',
          sessionContext: { chainId: 'chain-1' },
          ruleScope: 'chain'
        }
      ]);

      const result = await chainDeletionHandler.getChainDeletionImpact('chain-1');

      expect(result.chainRuleCount).toBe(2);
      expect(result.usageRecordCount).toBe(1);
      expect(result.lastUsedDate).toBeDefined();
    });

    it('应该处理获取统计失败的情况', async () => {
      mockExceptionRuleManager.getAllRules.mockRejectedValue(new Error('获取失败'));

      const result = await chainDeletionHandler.getChainDeletionImpact('chain-1');

      expect(result.chainRuleCount).toBe(0);
      expect(result.usageRecordCount).toBe(0);
      expect(result.lastUsedDate).toBeUndefined();
    });
  });

  describe('错误处理', () => {
    it('应该在移动到回收站失败时抛出异常', async () => {
      mockExceptionRuleManager.getAllRules.mockRejectedValue(new Error('数据库错误'));

      await expect(
        chainDeletionHandler.moveChainToRecycleBin('chain-1')
      ).rejects.toThrow('处理链删除失败');
    });

    it('应该在恢复失败时抛出异常', async () => {
      mockExceptionRuleManager.getAllRules.mockRejectedValue(new Error('数据库错误'));

      await expect(
        chainDeletionHandler.restoreChainFromRecycleBin('chain-1')
      ).rejects.toThrow('恢复链规则失败');
    });

    it('应该在永久删除失败时抛出异常', async () => {
      mockExceptionRuleManager.getAllRules.mockRejectedValue(new Error('数据库错误'));

      await expect(
        chainDeletionHandler.permanentlyDeleteChain('chain-1')
      ).rejects.toThrow('永久删除链规则失败');
    });
  });
});