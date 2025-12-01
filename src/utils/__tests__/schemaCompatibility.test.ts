import { SupabaseStorage } from '../supabaseStorage';
import { SchemaChecker } from '../schemaChecker';
import { MigrationHelper } from '../migrationHelper';
import { Chain } from '../../types';

// Mock Supabase for testing
jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn()
  },
  getCurrentUser: jest.fn(() => Promise.resolve({ id: 'test-user' }))
}));

describe('Schema Compatibility Tests', () => {
  let storage: SupabaseStorage;
  let schemaChecker: SchemaChecker;
  let migrationHelper: MigrationHelper;

  beforeEach(() => {
    storage = new SupabaseStorage();
    schemaChecker = new SchemaChecker();
    migrationHelper = new MigrationHelper();
    jest.clearAllMocks();
  });

  describe('Complete Schema Compatibility', () => {
    it('should work with complete schema (all columns present)', async () => {
      const { supabase } = require('../lib/supabase');
      
      // Mock complete schema
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
        .mockReturnValueOnce({
          select: () => ({
            eq: () => ({
              data: [],
              error: null
            })
          })
        })
        .mockReturnValueOnce({
          upsert: () => ({
            select: () => ({
              data: [{ id: 'chain1' }],
              error: null
            })
          })
        });

      const chains: Chain[] = [{
        id: 'chain1',
        name: 'Test Chain',
        parentId: undefined,
        type: 'unit',
        sortOrder: 1,
        trigger: 'Test',
        duration: 30,
        description: 'Test',
        currentStreak: 0,
        auxiliaryStreak: 0,
        totalCompletions: 0,
        totalFailures: 0,
        auxiliaryFailures: 0,
        exceptions: [],
        auxiliaryExceptions: [],
        auxiliarySignal: 'Signal',
        auxiliaryDuration: 15,
        auxiliaryCompletionTrigger: 'Complete',
        isDurationless: false,
        timeLimitHours: 24,
        timeLimitExceptions: [],
        groupStartedAt: new Date(),
        groupExpiresAt: new Date(),
        createdAt: new Date()
      }];

      await expect(storage.saveChains(chains)).resolves.not.toThrow();
    });

    it('should work with legacy schema (missing new columns)', async () => {
      const { supabase } = require('../lib/supabase');
      
      // Mock legacy schema (missing new columns)
      supabase.from
        .mockReturnValueOnce({
          select: () => ({
            eq: () => ({
              in: () => ({
                data: [], // No new columns found
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
        // First attempt with new columns fails
        .mockReturnValueOnce({
          upsert: () => ({
            select: () => ({
              data: null,
              error: { code: 'PGRST204', message: "Could not find the 'group_expires_at' column" }
            })
          })
        })
        // Fallback attempt succeeds
        .mockReturnValueOnce({
          upsert: () => ({
            select: () => ({
              data: [{ id: 'chain1' }],
              error: null
            })
          })
        });

      const chains: Chain[] = [{
        id: 'chain1',
        name: 'Test Chain',
        parentId: undefined,
        type: 'unit',
        sortOrder: 1,
        trigger: 'Test',
        duration: 30,
        description: 'Test',
        currentStreak: 0,
        auxiliaryStreak: 0,
        totalCompletions: 0,
        totalFailures: 0,
        auxiliaryFailures: 0,
        exceptions: [],
        auxiliaryExceptions: [],
        auxiliarySignal: 'Signal',
        auxiliaryDuration: 15,
        auxiliaryCompletionTrigger: 'Complete',
        isDurationless: false,
        createdAt: new Date()
      }];

      await expect(storage.saveChains(chains)).resolves.not.toThrow();
    });
  });

  describe('Schema Detection', () => {
    it('should correctly identify missing columns', async () => {
      const { supabase } = require('../lib/supabase');
      
      supabase.from.mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            in: () => ({
              data: [
                { column_name: 'is_durationless' },
                { column_name: 'time_limit_hours' }
                // Missing: time_limit_exceptions, group_started_at, group_expires_at
              ],
              error: null
            })
          })
        })
      });

      const result = await storage.verifySchemaColumns('chains', [
        'is_durationless',
        'time_limit_hours', 
        'time_limit_exceptions',
        'group_started_at',
        'group_expires_at'
      ]);

      expect(result.hasAllColumns).toBe(false);
      expect(result.missingColumns).toEqual([
        'time_limit_exceptions',
        'group_started_at', 
        'group_expires_at'
      ]);
    });

    it('should handle schema verification errors gracefully', async () => {
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

      const result = await storage.verifySchemaColumns('chains', ['test_column']);

      expect(result.hasAllColumns).toBe(false);
      expect(result.error).toBe('Permission denied');
    });
  });

  describe('Migration Status Detection', () => {
    it('should correctly identify applied migrations', async () => {
      const { supabase } = require('../lib/supabase');
      
      // Mock that chains table exists (basic migration applied)
      supabase.from
        .mockReturnValueOnce({
          select: () => ({
            eq: () => ({
              data: [{ table_name: 'chains' }],
              error: null
            })
          })
        })
        // Mock that hierarchy columns exist
        .mockReturnValueOnce({
          select: () => ({
            eq: () => ({
              in: () => ({
                data: [
                  { column_name: 'parent_id' },
                  { column_name: 'type' }
                ],
                error: null
              })
            })
          })
        })
        // Mock that time limit columns don't exist
        .mockReturnValueOnce({
          select: () => ({
            eq: () => ({
              in: () => ({
                data: [],
                error: null
              })
            })
          })
        });

      const basicApplied = await migrationHelper.isMigrationApplied('20250730021823_winter_flame');
      const hierarchyApplied = await migrationHelper.isMigrationApplied('20250801160754_peaceful_palace');
      const timeLimitApplied = await migrationHelper.isMigrationApplied('20250808000000_add_group_time_limit');

      expect(basicApplied).toBe(true);
      expect(hierarchyApplied).toBe(true);
      expect(timeLimitApplied).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors with retry logic', async () => {
      const { supabase } = require('../lib/supabase');
      
      let attemptCount = 0;
      supabase.from.mockImplementation(() => ({
        select: () => ({
          eq: () => ({
            order: () => {
              attemptCount++;
              if (attemptCount < 3) {
                throw new Error('Network error');
              }
              return {
                data: [],
                error: null
              };
            }
          })
        })
      }));

      const result = await storage.getChains();
      expect(result).toEqual([]);
      expect(attemptCount).toBeGreaterThanOrEqual(3);
    });

    it('should handle malformed data gracefully', async () => {
      const { supabase } = require('../lib/supabase');
      
      supabase.from.mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            order: () => ({
              data: [
                { id: null, name: 'Invalid Chain' }, // Missing required ID
                { id: 'valid-id', name: null }, // Missing required name
                { id: 'circular-id', parent_id: 'circular-id' } // Circular reference
              ],
              error: null
            })
          })
        })
      });

      const result = await storage.getChains();
      
      // Should filter out invalid data and handle gracefully
      expect(Array.isArray(result)).toBe(true);
      // Should not crash the application
    });
  });

  describe('Data Consistency', () => {
    it('should maintain data consistency during schema transitions', async () => {
      const { supabase } = require('../lib/supabase');
      
      // Simulate a scenario where some chains have new fields and others don't
      const mixedData = [
        {
          id: 'old-chain',
          name: 'Old Chain',
          // Missing new fields
          created_at: '2023-01-01T00:00:00Z'
        },
        {
          id: 'new-chain',
          name: 'New Chain',
          is_durationless: true,
          time_limit_hours: 24,
          created_at: '2023-01-01T00:00:00Z'
        }
      ];

      supabase.from.mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            order: () => ({
              data: mixedData,
              error: null
            })
          })
        })
      });

      const result = await storage.getChains();
      
      expect(result).toHaveLength(2);
      
      // Old chain should have default values for new fields
      const oldChain = result.find(c => c.id === 'old-chain');
      expect(oldChain?.isDurationless).toBe(false);
      expect(oldChain?.timeLimitHours).toBeUndefined();
      
      // New chain should preserve its values
      const newChain = result.find(c => c.id === 'new-chain');
      expect(newChain?.isDurationless).toBe(true);
      expect(newChain?.timeLimitHours).toBe(24);
    });
  });
});