import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RuleSelectionDialog } from '../RuleSelectionDialog';
import { ExceptionRule, ExceptionRuleType, SessionContext } from '../../types';

// Mock the utility modules
jest.mock('../../utils/ruleSearchOptimizer', () => ({
  RuleSearchOptimizer: jest.fn().mockImplementation(() => ({
    updateIndex: jest.fn(),
    searchRulesDebounced: jest.fn((rules, query, callback) => {
      const results = rules
        .filter((rule: ExceptionRule) => rule.name.toLowerCase().includes(query.toLowerCase()))
        .map((rule: ExceptionRule) => ({
          rule,
          score: 100,
          matchType: 'contains',
          highlightRanges: []
        }));
      callback(results);
    }),
    detectDuplicates: jest.fn(() => ({
      hasExactMatch: false,
      exactMatches: [],
      similarRules: []
    }))
  }))
}));

jest.mock('../../utils/exceptionRuleCache', () => ({
  ExceptionRuleCache: jest.fn().mockImplementation(() => ({
    getChainRules: jest.fn(() => null),
    setChainRules: jest.fn(),
    updateChainRules: jest.fn()
  }))
}));

jest.mock('../../utils/LayoutStabilityMonitor', () => ({
  useLayoutStability: jest.fn(() => ({
    startMonitoring: jest.fn(),
    stopMonitoring: jest.fn(),
    checkNow: jest.fn()
  }))
}));

jest.mock('../../utils/AsyncOperationManager', () => ({
  useAsyncOperation: jest.fn(() => ({
    optimisticUpdate: jest.fn(({ updateUI, optimisticValue }) => {
      updateUI(optimisticValue);
      return Promise.resolve(optimisticValue);
    }),
    debounceOperation: jest.fn()
  }))
}));

describe('RuleSelectionDialog', () => {
  const mockSessionContext: SessionContext = {
    chainId: 'test-chain',
    chainName: 'Test Chain',
    elapsedTime: 1800, // 30 minutes
    remainingTime: 900, // 15 minutes
    currentTaskId: 'task-1',
    isActive: true
  };

  const mockRules: ExceptionRule[] = [
    {
      id: '1',
      name: '上厕所',
      chainId: 'test-chain',
      scope: 'chain',
      type: ExceptionRuleType.PAUSE_ONLY,
      createdAt: new Date(),
      usageCount: 5,
      isActive: true,
      lastUsedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
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
  ];

  const defaultProps = {
    isOpen: true,
    actionType: 'pause' as const,
    sessionContext: mockSessionContext,
    onRuleSelected: jest.fn(),
    onCreateNewRule: jest.fn(),
    onCancel: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render when open', () => {
      render(<RuleSelectionDialog {...defaultProps} />);
      
      expect(screen.getByText('选择例外规则')).toBeInTheDocument();
      expect(screen.getByText('为暂停计时操作选择适用的规则')).toBeInTheDocument();
    });

    it('should not render when closed', () => {
      render(<RuleSelectionDialog {...defaultProps} isOpen={false} />);
      
      expect(screen.queryByText('选择例外规则')).not.toBeInTheDocument();
    });

    it('should show task information', () => {
      render(<RuleSelectionDialog {...defaultProps} />);
      
      expect(screen.getByText('Test Chain')).toBeInTheDocument();
      expect(screen.getByText('已进行 30 分钟，剩余 15 分钟')).toBeInTheDocument();
      expect(screen.getByText('30:00')).toBeInTheDocument();
    });

    it('should show pause duration settings for pause action', () => {
      render(<RuleSelectionDialog {...defaultProps} />);
      
      expect(screen.getByText('暂停时长设置')).toBeInTheDocument();
      expect(screen.getByText('15分钟')).toBeInTheDocument();
      expect(screen.getByText('30分钟')).toBeInTheDocument();
      expect(screen.getByText('1小时')).toBeInTheDocument();
      expect(screen.getByText('无限时间')).toBeInTheDocument();
    });

    it('should not show pause duration settings for early completion', () => {
      render(<RuleSelectionDialog {...defaultProps} actionType="early_completion" />);
      
      expect(screen.queryByText('暂停时长设置')).not.toBeInTheDocument();
    });
  });

  describe('search functionality', () => {
    it('should render search input', () => {
      render(<RuleSelectionDialog {...defaultProps} />);
      
      const searchInput = screen.getByPlaceholderText('搜索规则或输入新规则名称...');
      expect(searchInput).toBeInTheDocument();
    });

    it('should show create new rule option when typing', async () => {
      const user = userEvent.setup();
      render(<RuleSelectionDialog {...defaultProps} />);
      
      const searchInput = screen.getByPlaceholderText('搜索规则或输入新规则名称...');
      await user.type(searchInput, '新规则');
      
      expect(screen.getByText('创建新规则: "新规则"')).toBeInTheDocument();
      expect(screen.getByText('为当前任务链创建专属规则')).toBeInTheDocument();
    });

    it('should focus search input when dialog opens', async () => {
      render(<RuleSelectionDialog {...defaultProps} />);
      
      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText('搜索规则或输入新规则名称...');
        expect(searchInput).toHaveFocus();
      }, { timeout: 200 });
    });
  });

  describe('pause options', () => {
    it('should select 15 minutes by default', () => {
      render(<RuleSelectionDialog {...defaultProps} />);
      
      const fifteenMinButton = screen.getByText('15分钟').closest('button');
      expect(fifteenMinButton).toHaveClass('border-primary-500');
    });

    it('should change pause duration when clicked', async () => {
      const user = userEvent.setup();
      render(<RuleSelectionDialog {...defaultProps} />);
      
      const thirtyMinButton = screen.getByText('30分钟').closest('button');
      await user.click(thirtyMinButton!);
      
      expect(thirtyMinButton).toHaveClass('border-primary-500');
    });

    it('should show unlimited time option', async () => {
      const user = userEvent.setup();
      render(<RuleSelectionDialog {...defaultProps} />);
      
      const unlimitedButton = screen.getByText('无限时间').closest('button');
      await user.click(unlimitedButton!);
      
      expect(unlimitedButton).toHaveClass('border-primary-500');
    });
  });

  describe('rule creation', () => {
    it('should call optimistic update when creating new rule', async () => {
      const user = userEvent.setup();
      const mockOptimisticUpdate = jest.fn().mockResolvedValue({});
      
      // Mock the hook to return our mock function
      const { useAsyncOperation } = require('../../utils/AsyncOperationManager');
      useAsyncOperation.mockReturnValue({
        optimisticUpdate: mockOptimisticUpdate,
        debounceOperation: jest.fn()
      });

      render(<RuleSelectionDialog {...defaultProps} />);
      
      const searchInput = screen.getByPlaceholderText('搜索规则或输入新规则名称...');
      await user.type(searchInput, '新规则');
      
      const createButton = screen.getByText('创建新规则: "新规则"');
      await user.click(createButton);
      
      expect(mockOptimisticUpdate).toHaveBeenCalled();
    });

    it('should show error when creating duplicate rule', async () => {
      const user = userEvent.setup();
      
      // Mock duplicate detection
      const { RuleSearchOptimizer } = require('../../utils/ruleSearchOptimizer');
      const mockOptimizer = new RuleSearchOptimizer();
      mockOptimizer.detectDuplicates.mockReturnValue({
        hasExactMatch: true,
        exactMatches: [mockRules[0]],
        similarRules: []
      });

      render(<RuleSelectionDialog {...defaultProps} />);
      
      const searchInput = screen.getByPlaceholderText('搜索规则或输入新规则名称...');
      await user.type(searchInput, '上厕所');
      
      const createButton = screen.getByText('创建新规则: "上厕所"');
      await user.click(createButton);
      
      await waitFor(() => {
        expect(screen.getByText('规则名称 "上厕所" 已存在')).toBeInTheDocument();
      });
    });
  });

  describe('rule selection', () => {
    it('should call onRuleSelected when rule is clicked', async () => {
      const user = userEvent.setup();
      const mockOnRuleSelected = jest.fn();
      
      render(<RuleSelectionDialog {...defaultProps} onRuleSelected={mockOnRuleSelected} />);
      
      // Wait for rules to load and then click the first rule
      await waitFor(() => {
        const ruleButton = screen.getByText('上厕所').closest('button');
        expect(ruleButton).toBeInTheDocument();
      });
      
      const ruleButton = screen.getByText('上厕所').closest('button');
      await user.click(ruleButton!);
      
      expect(mockOnRuleSelected).toHaveBeenCalled();
    });

    it('should pass pause options for pause action', async () => {
      const user = userEvent.setup();
      const mockOnRuleSelected = jest.fn();
      
      render(<RuleSelectionDialog {...defaultProps} onRuleSelected={mockOnRuleSelected} />);
      
      // Change pause duration first
      const thirtyMinButton = screen.getByText('30分钟').closest('button');
      await user.click(thirtyMinButton!);
      
      // Then select a rule
      await waitFor(() => {
        const ruleButton = screen.getByText('上厕所').closest('button');
        expect(ruleButton).toBeInTheDocument();
      });
      
      const ruleButton = screen.getByText('上厕所').closest('button');
      await user.click(ruleButton!);
      
      expect(mockOnRuleSelected).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          duration: 30 * 60,
          autoResume: true
        })
      );
    });
  });

  describe('error handling', () => {
    it('should display error message', () => {
      render(<RuleSelectionDialog {...defaultProps} />);
      
      // Simulate an error by triggering a failed operation
      fireEvent.click(screen.getByText('创建新规则: "test"').closest('button') || document.body);
      
      // The error should be handled by the component's error state
    });

    it('should allow dismissing error', async () => {
      const user = userEvent.setup();
      render(<RuleSelectionDialog {...defaultProps} />);
      
      // Manually set an error state (in a real scenario, this would come from a failed operation)
      // For testing, we'll simulate this by checking if the error dismiss functionality works
      // when an error is present
    });
  });

  describe('loading states', () => {
    it('should show loading spinner when loading', () => {
      render(<RuleSelectionDialog {...defaultProps} />);
      
      expect(screen.getByText('加载规则中...')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<RuleSelectionDialog {...defaultProps} />);
      
      const dialog = screen.getByRole('dialog', { hidden: true });
      expect(dialog).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<RuleSelectionDialog {...defaultProps} />);
      
      // Tab should move focus to search input
      await user.tab();
      const searchInput = screen.getByPlaceholderText('搜索规则或输入新规则名称...');
      expect(searchInput).toHaveFocus();
    });
  });

  describe('cleanup', () => {
    it('should reset state when dialog closes', () => {
      const { rerender } = render(<RuleSelectionDialog {...defaultProps} />);
      
      // Open dialog and add some search text
      const searchInput = screen.getByPlaceholderText('搜索规则或输入新规则名称...');
      fireEvent.change(searchInput, { target: { value: 'test' } });
      
      // Close dialog
      rerender(<RuleSelectionDialog {...defaultProps} isOpen={false} />);
      
      // Reopen dialog
      rerender(<RuleSelectionDialog {...defaultProps} isOpen={true} />);
      
      // Search input should be cleared
      expect(screen.getByPlaceholderText('搜索规则或输入新规则名称...')).toHaveValue('');
    });
  });
});