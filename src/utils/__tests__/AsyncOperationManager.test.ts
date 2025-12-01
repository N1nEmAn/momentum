import { AsyncOperationManager } from '../AsyncOperationManager';

describe('AsyncOperationManager', () => {
  let manager: AsyncOperationManager;

  beforeEach(() => {
    manager = new AsyncOperationManager();
    jest.clearAllMocks();
  });

  afterEach(() => {
    manager.clearAll();
  });

  describe('basic operations', () => {
    it('should execute operation successfully', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      const onSuccess = jest.fn();

      const result = await manager.executeOperation({
        id: 'test-op',
        operation: mockOperation,
        onSuccess
      });

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalledWith('success');
    });

    it('should handle operation errors', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Test error'));
      const onError = jest.fn();

      await expect(manager.executeOperation({
        id: 'test-op',
        operation: mockOperation,
        onError
      })).rejects.toThrow('Test error');

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should retry failed operations', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockResolvedValue('success');

      const onRetry = jest.fn();

      const result = await manager.executeOperation({
        id: 'test-op',
        operation: mockOperation,
        retryCount: 2,
        onRetry
      });

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(3);
      expect(onRetry).toHaveBeenCalledTimes(2);
    });

    it('should timeout operations', async () => {
      const mockOperation = jest.fn(() => new Promise(resolve => setTimeout(resolve, 1000)));

      await expect(manager.executeOperation({
        id: 'test-op',
        operation: mockOperation,
        timeout: 100
      })).rejects.toThrow('操作超时');
    });
  });

  describe('optimistic updates', () => {
    it('should perform optimistic update successfully', async () => {
      const mockOperation = jest.fn().mockResolvedValue('real-result');
      const updateUI = jest.fn();
      const rollback = jest.fn();

      const result = await manager.optimisticUpdate({
        id: 'test-optimistic',
        operation: mockOperation,
        optimisticValue: 'optimistic-result',
        updateUI,
        rollback
      });

      expect(updateUI).toHaveBeenCalledWith('optimistic-result');
      expect(updateUI).toHaveBeenCalledWith('real-result');
      expect(rollback).not.toHaveBeenCalled();
      expect(result).toBe('real-result');
    });

    it('should rollback on optimistic update failure', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      const updateUI = jest.fn();
      const rollback = jest.fn();

      await expect(manager.optimisticUpdate({
        id: 'test-optimistic',
        operation: mockOperation,
        optimisticValue: 'optimistic-result',
        updateUI,
        rollback
      })).rejects.toThrow('Operation failed');

      expect(updateUI).toHaveBeenCalledWith('optimistic-result');
      expect(rollback).toHaveBeenCalled();
    });

    it('should handle batch optimistic updates', async () => {
      const mockOperation1 = jest.fn().mockResolvedValue('result1');
      const mockOperation2 = jest.fn().mockResolvedValue('result2');
      const updateUI1 = jest.fn();
      const updateUI2 = jest.fn();
      const rollback1 = jest.fn();
      const rollback2 = jest.fn();

      const results = await manager.batchOptimisticUpdate([
        {
          id: 'test1',
          operation: mockOperation1,
          optimisticValue: 'opt1',
          updateUI: updateUI1,
          rollback: rollback1
        },
        {
          id: 'test2',
          operation: mockOperation2,
          optimisticValue: 'opt2',
          updateUI: updateUI2,
          rollback: rollback2
        }
      ]);

      expect(results).toEqual(['result1', 'result2']);
      expect(updateUI1).toHaveBeenCalledWith('opt1');
      expect(updateUI1).toHaveBeenCalledWith('result1');
      expect(updateUI2).toHaveBeenCalledWith('opt2');
      expect(updateUI2).toHaveBeenCalledWith('result2');
    });
  });

  describe('duplicate prevention', () => {
    it('should prevent duplicate operations', async () => {
      const mockOperation = jest.fn().mockResolvedValue('result');

      const promise1 = manager.executeOnce('duplicate-key', mockOperation);
      const promise2 = manager.executeOnce('duplicate-key', mockOperation);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toBe('result');
      expect(result2).toBe('result');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should allow different keys to execute separately', async () => {
      const mockOperation1 = jest.fn().mockResolvedValue('result1');
      const mockOperation2 = jest.fn().mockResolvedValue('result2');

      const [result1, result2] = await Promise.all([
        manager.executeOnce('key1', mockOperation1),
        manager.executeOnce('key2', mockOperation2)
      ]);

      expect(result1).toBe('result1');
      expect(result2).toBe('result2');
      expect(mockOperation1).toHaveBeenCalledTimes(1);
      expect(mockOperation2).toHaveBeenCalledTimes(1);
    });
  });

  describe('debounced operations', () => {
    it('should debounce rapid operations', async () => {
      const mockOperation = jest.fn().mockResolvedValue('result');

      // Fire multiple rapid operations
      const promise1 = manager.debounceOperation('debounce-key', mockOperation, 100);
      const promise2 = manager.debounceOperation('debounce-key', mockOperation, 100);
      const promise3 = manager.debounceOperation('debounce-key', mockOperation, 100);

      // Wait for debounce delay
      await new Promise(resolve => setTimeout(resolve, 150));

      const result = await promise3;

      expect(result).toBe('result');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });
  });

  describe('queue operations', () => {
    it('should queue and process operations', async () => {
      const mockOperation1 = jest.fn().mockResolvedValue('result1');
      const mockOperation2 = jest.fn().mockResolvedValue('result2');

      const promise1 = manager.queueOperation({
        id: 'queue1',
        operation: mockOperation1
      });

      const promise2 = manager.queueOperation({
        id: 'queue2',
        operation: mockOperation2
      });

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toBe('result1');
      expect(result2).toBe('result2');
    });
  });

  describe('operation management', () => {
    it('should track operation status', async () => {
      const mockOperation = jest.fn(() => new Promise(resolve => setTimeout(() => resolve('result'), 100)));

      const promise = manager.executeOperation({
        id: 'tracked-op',
        operation: mockOperation
      });

      const status = manager.getOperationStatus('tracked-op');
      expect(status?.status).toBe('pending');

      await promise;

      const finalStatus = manager.getOperationStatus('tracked-op');
      expect(finalStatus?.status).toBe('success');
    });

    it('should cancel pending operations', async () => {
      const mockOperation = jest.fn(() => new Promise(resolve => setTimeout(() => resolve('result'), 1000)));

      const promise = manager.executeOperation({
        id: 'cancel-op',
        operation: mockOperation
      });

      const cancelled = manager.cancelOperation('cancel-op');
      expect(cancelled).toBe(true);

      const status = manager.getOperationStatus('cancel-op');
      expect(status).toBeUndefined();
    });

    it('should get pending operations', async () => {
      const mockOperation = jest.fn(() => new Promise(resolve => setTimeout(() => resolve('result'), 100)));

      manager.executeOperation({
        id: 'pending1',
        operation: mockOperation
      });

      manager.executeOperation({
        id: 'pending2',
        operation: mockOperation
      });

      const pending = manager.getPendingOperations();
      expect(pending).toHaveLength(2);
    });
  });

  describe('statistics and cleanup', () => {
    it('should provide operation statistics', async () => {
      const mockOperation = jest.fn().mockResolvedValue('result');

      await manager.executeOperation({
        id: 'stats-op',
        operation: mockOperation
      });

      const stats = manager.getOperationStats();
      expect(stats.totalOperations).toBe(1);
      expect(stats.successfulOperations).toBe(1);
      expect(stats.failedOperations).toBe(0);
    });

    it('should cleanup expired operations', async () => {
      const mockOperation = jest.fn().mockResolvedValue('result');

      await manager.executeOperation({
        id: 'expired-op',
        operation: mockOperation
      });

      // Simulate time passing
      const originalNow = Date.now;
      Date.now = jest.fn(() => originalNow() + 400000); // 6.67 minutes later

      manager.cleanupExpiredOperations(300000); // 5 minutes max age

      const status = manager.getOperationStatus('expired-op');
      expect(status).toBeUndefined();

      // Restore Date.now
      Date.now = originalNow;
    });

    it('should clear all operations', async () => {
      const mockOperation = jest.fn().mockResolvedValue('result');

      await manager.executeOperation({
        id: 'clear-op',
        operation: mockOperation
      });

      manager.clearAll();

      const stats = manager.getOperationStats();
      expect(stats.totalOperations).toBe(0);
    });
  });
});