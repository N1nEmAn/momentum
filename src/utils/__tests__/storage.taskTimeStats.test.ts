/**
 * 存储服务用时统计功能单元测试
 */

import { storage } from '../storage';
import { TaskTimeStats, CompletionHistory, Chain } from '../../types';

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(global, 'localStorage', {
  value: mockLocalStorage,
});

describe('Storage TaskTimeStats Functions', () => {
  beforeEach(() => {
    mockLocalStorage.getItem.mockReturnValue(null);
    mockLocalStorage.setItem.mockClear();
    mockLocalStorage.removeItem.mockClear();
  });

  describe('getTaskTimeStats', () => {
    test('应该返回空数组当没有数据时', () => {
      const stats = storage.getTaskTimeStats();
      expect(stats).toEqual([]);
    });

    test('应该返回解析后的统计数据', () => {
      const mockStats: TaskTimeStats[] = [
        {
          chainId: 'chain-1',
          lastCompletionTime: 25,
          averageCompletionTime: 23,
          totalCompletions: 3,
          totalTime: 70
        }
      ];
      
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(mockStats));
      
      const stats = storage.getTaskTimeStats();
      expect(stats).toEqual(mockStats);
    });
  });

  describe('saveTaskTimeStats', () => {
    test('应该保存统计数据到localStorage', () => {
      const mockStats: TaskTimeStats[] = [
        {
          chainId: 'chain-1',
          lastCompletionTime: 30,
          averageCompletionTime: 25,
          totalCompletions: 2,
          totalTime: 50
        }
      ];
      
      storage.saveTaskTimeStats(mockStats);
      
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'momentum_task_time_stats',
        JSON.stringify(mockStats)
      );
    });
  });

  describe('getLastCompletionTime', () => {
    test('应该返回null当没有统计数据时', () => {
      const lastTime = storage.getLastCompletionTime('chain-1');
      expect(lastTime).toBeNull();
    });

    test('应该返回指定链条的上次完成时间', () => {
      const mockStats: TaskTimeStats[] = [
        {
          chainId: 'chain-1',
          lastCompletionTime: 25,
          averageCompletionTime: 23,
          totalCompletions: 3,
          totalTime: 70
        },
        {
          chainId: 'chain-2',
          lastCompletionTime: 15,
          averageCompletionTime: 18,
          totalCompletions: 2,
          totalTime: 35
        }
      ];
      
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(mockStats));
      
      const lastTime = storage.getLastCompletionTime('chain-1');
      expect(lastTime).toBe(25);
    });

    test('应该返回null当链条不存在时', () => {
      const mockStats: TaskTimeStats[] = [
        {
          chainId: 'chain-1',
          lastCompletionTime: 25,
          averageCompletionTime: 23,
          totalCompletions: 3,
          totalTime: 70
        }
      ];
      
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(mockStats));
      
      const lastTime = storage.getLastCompletionTime('non-existent-chain');
      expect(lastTime).toBeNull();
    });
  });

  describe('updateTaskTimeStats', () => {
    test('应该创建新的统计记录当链条不存在时', () => {
      mockLocalStorage.getItem.mockReturnValue('[]');
      
      storage.updateTaskTimeStats('chain-1', 30);
      
      const expectedStats: TaskTimeStats[] = [
        {
          chainId: 'chain-1',
          lastCompletionTime: 30,
          averageCompletionTime: 30,
          totalCompletions: 1,
          totalTime: 30
        }
      ];
      
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'momentum_task_time_stats',
        JSON.stringify(expectedStats)
      );
    });

    test('应该更新现有的统计记录', () => {
      const existingStats: TaskTimeStats[] = [
        {
          chainId: 'chain-1',
          lastCompletionTime: 20,
          averageCompletionTime: 22,
          totalCompletions: 2,
          totalTime: 45
        }
      ];
      
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(existingStats));
      
      storage.updateTaskTimeStats('chain-1', 35);
      
      const expectedStats: TaskTimeStats[] = [
        {
          chainId: 'chain-1',
          lastCompletionTime: 35,
          averageCompletionTime: 27, // (45 + 35) / 3 = 26.67 -> 27 (rounded)
          totalCompletions: 3,
          totalTime: 80
        }
      ];
      
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'momentum_task_time_stats',
        JSON.stringify(expectedStats)
      );
    });

    test('应该正确计算平均时间', () => {
      const existingStats: TaskTimeStats[] = [
        {
          chainId: 'chain-1',
          lastCompletionTime: 10,
          averageCompletionTime: 15,
          totalCompletions: 4,
          totalTime: 60
        }
      ];
      
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(existingStats));
      
      storage.updateTaskTimeStats('chain-1', 40);
      
      const expectedStats: TaskTimeStats[] = [
        {
          chainId: 'chain-1',
          lastCompletionTime: 40,
          averageCompletionTime: 20, // (60 + 40) / 5 = 20
          totalCompletions: 5,
          totalTime: 100
        }
      ];
      
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'momentum_task_time_stats',
        JSON.stringify(expectedStats)
      );
    });
  });

  describe('getTaskAverageTime', () => {
    test('应该返回null当没有统计数据时', () => {
      const avgTime = storage.getTaskAverageTime('chain-1');
      expect(avgTime).toBeNull();
    });

    test('应该返回指定链条的平均完成时间', () => {
      const mockStats: TaskTimeStats[] = [
        {
          chainId: 'chain-1',
          lastCompletionTime: 25,
          averageCompletionTime: 23,
          totalCompletions: 3,
          totalTime: 70
        }
      ];
      
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(mockStats));
      
      const avgTime = storage.getTaskAverageTime('chain-1');
      expect(avgTime).toBe(23);
    });
  });

  describe('migrateCompletionHistoryForTiming', () => {
    test('应该为没有用时数据的记录添加默认值', () => {
      const mockHistory: CompletionHistory[] = [
        {
          chainId: 'chain-1',
          completedAt: new Date(),
          duration: 30,
          wasSuccessful: true
          // 没有 actualDuration 和 isForwardTimed
        },
        {
          chainId: 'chain-2',
          completedAt: new Date(),
          duration: 15,
          wasSuccessful: false,
          actualDuration: 15,
          isForwardTimed: false
          // 已有用时数据
        }
      ];

      const mockChains: Chain[] = [
        {
          id: 'chain-1',
          name: 'Test Chain 1',
          isDurationless: true,
          // ... 其他必需字段
        } as Chain,
        {
          id: 'chain-2',
          name: 'Test Chain 2',
          isDurationless: false,
          // ... 其他必需字段
        } as Chain
      ];

      // Mock getCompletionHistory 和 getChains
      let getCompletionHistoryCallCount = 0;
      mockLocalStorage.getItem.mockImplementation((key: string) => {
        if (key === 'momentum_completion_history') {
          return JSON.stringify(mockHistory.map(h => ({
            ...h,
            completedAt: h.completedAt.toISOString()
          })));
        }
        if (key === 'momentum_chains') {
          return JSON.stringify(mockChains.map(c => ({
            ...c,
            createdAt: new Date().toISOString()
          })));
        }
        return null;
      });

      storage.migrateCompletionHistoryForTiming();

      // 应该保存更新后的历史记录
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'momentum_completion_history',
        expect.stringContaining('actualDuration')
      );

      // 验证保存的数据包含正确的迁移值
      const saveCall = mockLocalStorage.setItem.mock.calls.find(
        call => call[0] === 'momentum_completion_history'
      );
      
      if (saveCall) {
        const savedData = JSON.parse(saveCall[1]);
        expect(savedData[0]).toMatchObject({
          chainId: 'chain-1',
          actualDuration: 30,
          isForwardTimed: true
        });
        expect(savedData[1]).toMatchObject({
          chainId: 'chain-2',
          actualDuration: 15,
          isForwardTimed: false
        });
      }
    });

    test('应该不修改已有用时数据的记录', () => {
      const mockHistory: CompletionHistory[] = [
        {
          chainId: 'chain-1',
          completedAt: new Date(),
          duration: 30,
          wasSuccessful: true,
          actualDuration: 25,
          isForwardTimed: true
        }
      ];

      mockLocalStorage.getItem.mockImplementation((key: string) => {
        if (key === 'momentum_completion_history') {
          return JSON.stringify(mockHistory.map(h => ({
            ...h,
            completedAt: h.completedAt.toISOString()
          })));
        }
        if (key === 'momentum_chains') {
          return JSON.stringify([]);
        }
        return null;
      });

      storage.migrateCompletionHistoryForTiming();

      // 由于没有需要迁移的数据，不应该调用 setItem
      expect(mockLocalStorage.setItem).not.toHaveBeenCalledWith(
        'momentum_completion_history',
        expect.any(String)
      );
    });
  });
});