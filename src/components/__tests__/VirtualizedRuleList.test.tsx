import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VirtualizedRuleList } from '../VirtualizedRuleList';
import { ExceptionRule, ExceptionRuleType } from '../../types';
import { SearchResult } from '../../utils/ruleSearchOptimizer';

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

describe('VirtualizedRuleList', () => {
  const mockRules: ExceptionRule[] = Array.from({ length: 100 }, (_, i) => ({
    id: `rule-${i}`,
    name: `规则 ${i}`,
    chainId: 'test-chain',
    scope: 'chain',
    type: ExceptionRuleType.PAUSE_ONLY,
    createdAt: new Date(),
    usageCount: Math.floor(Math.random() * 10),
    isActive: true,
    lastUsedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000)
  }));

  const mockSearchResults: SearchResult[] = mockRules.map(rule => ({
    rule,
    score: 100,
    matchType: 'exact',
    highlightRanges: []
  }));

  const defaultProps = {
    rules: mockSearchResults.slice(0, 10), // Start with 10 rules
    onSelect: jest.fn(),
    itemHeight: 60,
    containerHeight: 400
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render rule list', () => {
      render(<VirtualizedRuleList {...defaultProps} />);
      
      expect(screen.getByText('规则 0')).toBeInTheDocument();
      expect(screen.getByText('规则 1')).toBeInTheDocument();
    });

    it('should render loading state', () => {
      render(<VirtualizedRuleList {...defaultProps} isLoading={true} />);
      
      expect(screen.getByText('加载规则中...')).toBeInTheDocument();
      expect(screen.getByRole('status', { hidden: true })).toBeInTheDocument();
    });

    it('should render empty state when no rules', () => {
      render(<VirtualizedRuleList {...defaultProps} rules={[]} />);
      
      expect(screen.getByText('暂无可用规则')).toBeInTheDocument();
    });

    it('should render empty state with search query', () => {
      render(
        <VirtualizedRuleList 
          {...defaultProps} 
          rules={[]} 
          searchQuery="nonexistent"
          onCreateNew={jest.fn()}
        />
      );
      
      expect(screen.getByText('未找到匹配的规则')).toBeInTheDocument();
      expect(screen.getByText('创建 "nonexistent"')).toBeInTheDocument();
    });
  });

  describe('virtualization', () => {
    it('should only render visible items', () => {
      const largeRuleSet = mockSearchResults; // 100 rules
      render(<VirtualizedRuleList {...defaultProps} rules={largeRuleSet} />);
      
      // Should render first few items
      expect(screen.getByText('规则 0')).toBeInTheDocument();
      expect(screen.getByText('规则 1')).toBeInTheDocument();
      
      // Should not render items far down the list
      expect(screen.queryByText('规则 50')).not.toBeInTheDocument();
      expect(screen.queryByText('规则 99')).not.toBeInTheDocument();
    });

    it('should handle scrolling', async () => {
      const largeRuleSet = mockSearchResults;
      render(<VirtualizedRuleList {...defaultProps} rules={largeRuleSet} />);
      
      const scrollContainer = screen.getByRole('region', { hidden: true }) || 
                             document.querySelector('.overflow-auto');
      
      if (scrollContainer) {
        // Simulate scrolling down
        fireEvent.scroll(scrollContainer, { target: { scrollTop: 1000 } });
        
        await waitFor(() => {
          // Should render items further down the list
          expect(screen.queryByText('规则 0')).not.toBeInTheDocument();
        });
      }
    });

    it('should maintain correct total height', () => {
      const largeRuleSet = mockSearchResults;
      render(<VirtualizedRuleList {...defaultProps} rules={largeRuleSet} />);
      
      const virtualContainer = document.querySelector('.relative > .relative');
      expect(virtualContainer).toHaveStyle(`height: ${100 * 60}px`); // 100 items * 60px height
    });
  });

  describe('create new rule functionality', () => {
    it('should show create new rule option when provided', () => {
      render(
        <VirtualizedRuleList 
          {...defaultProps} 
          searchQuery="新规则"
          onCreateNew={jest.fn()}
        />
      );
      
      expect(screen.getByText('创建新规则: "新规则"')).toBeInTheDocument();
    });

    it('should call onCreateNew when create button is clicked', async () => {
      const user = userEvent.setup();
      const mockOnCreateNew = jest.fn();
      
      render(
        <VirtualizedRuleList 
          {...defaultProps} 
          searchQuery="新规则"
          onCreateNew={mockOnCreateNew}
        />
      );
      
      const createButton = screen.getByText('创建新规则: "新规则"');
      await user.click(createButton);
      
      expect(mockOnCreateNew).toHaveBeenCalledWith('新规则');
    });

    it('should not show create option without search query', () => {
      render(
        <VirtualizedRuleList 
          {...defaultProps} 
          onCreateNew={jest.fn()}
        />
      );
      
      expect(screen.queryByText(/创建新规则/)).not.toBeInTheDocument();
    });
  });

  describe('rule selection', () => {
    it('should call onSelect when rule is clicked', async () => {
      const user = userEvent.setup();
      const mockOnSelect = jest.fn();
      
      render(<VirtualizedRuleList {...defaultProps} onSelect={mockOnSelect} />);
      
      const ruleButton = screen.getByText('规则 0').closest('button');
      await user.click(ruleButton!);
      
      expect(mockOnSelect).toHaveBeenCalledWith(mockRules[0]);
    });

    it('should show rule usage information', () => {
      render(<VirtualizedRuleList {...defaultProps} />);
      
      expect(screen.getByText(/使用过 \d+ 次/)).toBeInTheDocument();
    });

    it('should show last used information when available', () => {
      const rulesWithLastUsed = mockSearchResults.map(result => ({
        ...result,
        rule: {
          ...result.rule,
          lastUsedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
        }
      }));
      
      render(<VirtualizedRuleList {...defaultProps} rules={rulesWithLastUsed} />);
      
      expect(screen.getByText(/2小时前/)).toBeInTheDocument();
    });
  });

  describe('search highlighting', () => {
    it('should highlight search matches', () => {
      const searchResults: SearchResult[] = [{
        rule: mockRules[0],
        score: 100,
        matchType: 'contains',
        highlightRanges: [{ start: 0, end: 2 }]
      }];
      
      render(<VirtualizedRuleList {...defaultProps} rules={searchResults} />);
      
      const highlightedText = screen.getByText('规则').closest('mark');
      expect(highlightedText).toBeInTheDocument();
      expect(highlightedText).toHaveClass('bg-yellow-200');
    });

    it('should show match type labels', () => {
      const searchResults: SearchResult[] = [{
        rule: mockRules[0],
        score: 100,
        matchType: 'fuzzy',
        highlightRanges: []
      }];
      
      render(<VirtualizedRuleList {...defaultProps} rules={searchResults} />);
      
      expect(screen.getByText('模糊匹配')).toBeInTheDocument();
    });
  });

  describe('usage visualization', () => {
    it('should show usage frequency bars', () => {
      const highUsageRule = {
        ...mockRules[0],
        usageCount: 10
      };
      
      const searchResults: SearchResult[] = [{
        rule: highUsageRule,
        score: 100,
        matchType: 'exact',
        highlightRanges: []
      }];
      
      render(<VirtualizedRuleList {...defaultProps} rules={searchResults} />);
      
      // Should have usage frequency visualization bars
      const usageBars = document.querySelectorAll('.w-1.h-4.rounded-full');
      expect(usageBars.length).toBe(5); // 5 bars total
      
      // Some bars should be active (primary color)
      const activeBars = document.querySelectorAll('.bg-primary-500');
      expect(activeBars.length).toBeGreaterThan(0);
    });
  });

  describe('performance', () => {
    it('should handle large datasets efficiently', () => {
      const startTime = performance.now();
      
      render(<VirtualizedRuleList {...defaultProps} rules={mockSearchResults} />);
      
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      // Should render within reasonable time (less than 100ms)
      expect(renderTime).toBeLessThan(100);
    });

    it('should throttle scroll events', async () => {
      const largeRuleSet = mockSearchResults;
      render(<VirtualizedRuleList {...defaultProps} rules={largeRuleSet} />);
      
      const scrollContainer = document.querySelector('.overflow-auto');
      
      if (scrollContainer) {
        // Fire multiple scroll events rapidly
        for (let i = 0; i < 10; i++) {
          fireEvent.scroll(scrollContainer, { target: { scrollTop: i * 100 } });
        }
        
        // Should handle without performance issues
        await waitFor(() => {
          expect(scrollContainer.scrollTop).toBeGreaterThan(0);
        });
      }
    });
  });

  describe('accessibility', () => {
    it('should have proper button roles', () => {
      render(<VirtualizedRuleList {...defaultProps} />);
      
      const ruleButtons = screen.getAllByRole('button');
      expect(ruleButtons.length).toBeGreaterThan(0);
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<VirtualizedRuleList {...defaultProps} />);
      
      // Tab should focus on first rule button
      await user.tab();
      const firstButton = screen.getByText('规则 0').closest('button');
      expect(firstButton).toHaveFocus();
    });
  });

  describe('responsive behavior', () => {
    it('should adapt to container size changes', () => {
      const { rerender } = render(<VirtualizedRuleList {...defaultProps} />);
      
      // Change container height
      rerender(<VirtualizedRuleList {...defaultProps} containerHeight={600} />);
      
      const container = document.querySelector('[style*="height: 600px"]');
      expect(container).toBeInTheDocument();
    });

    it('should handle different item heights', () => {
      render(<VirtualizedRuleList {...defaultProps} itemHeight={80} />);
      
      const virtualContainer = document.querySelector('.relative > .relative');
      expect(virtualContainer).toHaveStyle(`height: ${10 * 80}px`); // 10 items * 80px height
    });
  });
});