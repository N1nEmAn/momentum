import { SupabaseStorage } from '../supabaseStorage';
import { Chain } from '../../types';

// Mock Supabase
jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          order: jest.fn(() => ({
            data: [],
            error: null
          }))
        }))
      })),
      upsert: jest.fn(() => ({
        select: jest.fn(() => ({
          data: [],
          error: null
        }))
      })),
      delete: jest.fn(() => ({
        in: jest.fn(() => ({
          eq: jest.fn(() => ({
            error: null
          }))
        }))
      }))
    }))
  },
  getCurrentUser: jest.fn(() => Promise.resolve({ id: 'test-user-id' }))
}));

const createMockChain = (overrides: Partial<Chain> = {}): Chain => ({
  id: 'test-id',
  name: 'Test Chain',
  parentId: undefined,
  type: 'unit',
  sortOrder: 0,
  trigger: 'Test trigger',
  duration: 30,
  description: 'Test description',
  currentStreak: 0,
  auxiliaryStreak: 0,
  totalCompletions: 0,
  totalFailures: 0,
  auxiliaryFailures: 0,
  exceptions: [],
  auxiliaryExceptions: [],
  auxiliarySignal: 'Test signal',
  auxiliaryDuration: 15,
  auxiliaryCompletionTrigger: 'Test completion',
  isDurationless: false,
  createdAt: new Date(),
  ...overrides,
});

describe('SupabaseStorage', () => {
  let storage: SupabaseStorage;

  beforeEach(() => {
    storage = new SupabaseStorage();
    jest.clearAllMocks();
  });

  describe('getChains', () => {
    it('should return empty array when user is not authenticated', async () => {
      const { getCurrentUser } = require('../lib/supabase');
      getCurrentUser.mockResolvedValueOnce(null);

      const result = await storage.getChains();
      expect(result).toEqual([]);
    });

    it('should handle database errors gracefully', async () => {
      const { supabase } = require('../lib/supabase');
      supabase.from.mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            order: () => ({
              data: null,
              error: { code: 'PGRST116', message: 'Table does not exist' }
            })
          })
        })
      });

      const result = await storage.getChains();
      expect(result).toEqual([]);
    });

    it('should return transformed chain data on success', async () => {
      const mockData = [{
        id: 'chain1',
        name: 'Test Chain',
        parent_id: null,
        type: 'unit',
        sort_order: 1,
        trigger: 'Test',
        duration: 30,
        description: 'Test desc',
        current_streak: 0,
        auxiliary_streak: 0,
        total_completions: 0,
        total_failures: 0,
        auxiliary_failures: 0,
        exceptions: [],
        auxiliary_exceptions: [],
        auxiliary_signal: 'Signal',
        auxiliary_duration: 15,
        auxiliary_completion_trigger: 'Complete',
        created_at: '2023-01-01T00:00:00Z',
        last_completed_at: null,
      }];

      const { supabase } = require('../lib/supabase');
      supabase.from.mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            order: () => ({
              data: mockData,
              error: null
            })
          })
        })
      });

      const result = await storage.getChains();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('chain1');
      expect(result[0].name).toBe('Test Chain');
    });
  });

  describe('saveChains', () => {
    it('should throw error when user is not authenticated', async () => {
      const { getCurrentUser } = require('../lib/supabase');
      getCurrentUser.mockResolvedValueOnce(null);

      const chains = [createMockChain()];
      await expect(storage.saveChains(chains)).rejects.toThrow('用户未认证');
    });

    it('should handle missing columns gracefully with fallback', async () => {
      const chains = [createMockChain({ id: 'chain1', name: 'Test' })];

      const { supabase } = require('../lib/supabase');
      
      // Mock schema verification to return missing columns
      supabase.from
        .mockReturnValueOnce({
          select: () => ({
            eq: () => ({
              in: () => ({
                data: [],
                error: null
              })
            })
          })
        })
        // Mock existing chains query
        .mockReturnValueOnce({
          select: () => ({
            eq: () => ({
              data: [],
              error: null
            })
          })
        })
        // Mock first upsert attempt (with new columns) - fails
        .mockReturnValueOnce({
          upsert: () => ({
            select: () => ({
              data: null,
              error: { code: 'PGRST204', message: "Could not find the 'group_expires_at' column" }
            })
          })
        })
        // Mock second upsert attempt (fallback) - succeeds
        .mockReturnValueOnce({
          upsert: () => ({
            select: () => ({
              data: [{ id: 'chain1' }],
              error: null
            })
          })
        });

      await expect(storage.saveChains(chains)).resolves.not.toThrow();
    });

    it('should save chains successfully with complete schema', async () => {
      const chains = [createMockChain({ id: 'chain1', name: 'Test' })];

      const { supabase } = require('../lib/supabase');
      
      // Mock schema verification to return all columns exist
      supabase.from
        .mockReturnValueOnce({
          select: () => ({
            eq: () => ({
              in: () => ({
                data: [
                  { column_name: 'is_durationless' },
                  { column_name: 'time_limit_hours' },
                  { column_name: 'time_limit_exceptions' },
                  { column_name: 'group_started_at' },
                  { column_name: 'group_expires_at' }
                ],
                error: null
              })
            })
          })
        })
        // Mock existing chains query
        .mockReturnValueOnce({
          select: () => ({
            eq: () => ({
              data: [],
              error: null
            })
          })
        })
        // Mock successful upsert
        .mockReturnValueOnce({
          upsert: () => ({
            select: () => ({
              data: [{ id: 'chain1' }],
              error: null
            })
          })
        });

      await expect(storage.saveChains(chains)).resolves.not.toThrow();
    });

    it('should handle network errors with retry logic', async () => {
      const chains = [createMockChain({ id: 'chain1', name: 'Test' })];

      const { supabase } = require('../lib/supabase');
      
      let attemptCount = 0;
      supabase.from
        .mockReturnValueOnce({
          select: () => ({
            eq: () => ({
              in: () => ({
                data: [],
                error: null
              })
            })
          })
        })
        .mockReturnValueOnce({
          select: () => ({
            eq: () => ({
              data: [],
              error: null
            })
          })
        })
        .mockImplementation(() => ({
          upsert: () => ({
            select: () => {
              attemptCount++;
              if (attemptCount < 3) {
                return {
                  data: null,
                  error: { message: 'Network error', code: 'NETWORK_ERROR' }
                };
              }
              return {
                data: [{ id: 'chain1' }],
                error: null
              };
            }
          })
        }));

      await expect(storage.saveChains(chains)).resolves.not.toThrow();
      expect(attemptCount).toBeGreaterThan(1);
    });
  });

  describe('verifySchemaColumns', () => {
    it('should return missing columns when they do not exist', async () => {
      const { supabase } = require('../lib/supabase');
      supabase.from.mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            in: () => ({
              data: [{ column_name: 'existing_column' }],
              error: null
            })
          })
        })
      });

      const result = await storage.verifySchemaColumns('test_table', ['existing_column', 'missing_column']);
      
      expect(result.hasAllColumns).toBe(false);
      expect(result.missingColumns).toEqual(['missing_column']);
    });

    it('should return success when all columns exist', async () => {
      const { supabase } = require('../lib/supabase');
      supabase.from.mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            in: () => ({
              data: [
                { column_name: 'column1' },
                { column_name: 'column2' }
              ],
              error: null
            })
          })
        })
      });

      const result = await storage.verifySchemaColumns('test_table', ['column1', 'column2']);
      
      expect(result.hasAllColumns).toBe(true);
      expect(result.missingColumns).toEqual([]);
    });

    it('should handle schema verification errors', async () => {
      const { supabase } = require('../lib/supabase');
      supabase.from.mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            in: () => ({
              data: null,
              error: { message: 'Permission denied' }
            })
          })
        })
      });

      const result = await storage.verifySchemaColumns('test_table', ['column1']);
      
      expect(result.hasAllColumns).toBe(false);
      expect(result.error).toBe('Permission denied');
    });
  });
});