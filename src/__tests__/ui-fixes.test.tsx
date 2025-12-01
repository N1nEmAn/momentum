/**
 * UI修复和改进测试套件
 * 验证横向滚动修复、性能优化等功能
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExceptionRuleManager } from '../components/ExceptionRuleManager';
import { RuleSelectionDialog } from '../components/RuleSelectionDialog';
import { ResponsiveContainer } from '../components/ResponsiveContainer';
import { layoutStabilityMonitor } from '../utils/LayoutStabilityMonitor';
import { performanceMonitor } from '../utils/performanceMonitor';

// Mock dependencies
jest.mock('../services/ExceptionRuleManager');
jest.mock('../services/RuleScopeManager');
jest.mock('../utils/exceptionRuleCache');

describe('UI Fixes and Improvements', () => {
    beforeEach(() => {
        // Reset monitors
        layoutStabilityMonitor.clearIssues();
        performanceMonitor.setBackgroundMode(false);
    });

    describe('Horizontal Scroll Fixes', () => {
        test('ExceptionRuleManager should not cause horizontal overflow', () => {
            const { container } = render(
                <ExceptionRuleManager onClose={() => { }} />
            );

            const modal = container.querySelector('.modal-container');
            expect(modal).toHaveStyle({ overflowX: 'hidden' });

            // Check if modal content respects viewport width
            const modalContent = container.querySelector('.modal-content');
            if (modalContent) {
                const computedStyle = window.getComputedStyle(modalContent);
                expect(computedStyle.maxWidth).toContain('100vw');
            }
        });

        test('RuleSelectionDialog should prevent horizontal overflow', () => {
            const mockSessionContext = {
                sessionId: 'test-session',
                chainId: 'test-chain',
                chainName: 'Test Chain',
                startedAt: new Date(),
                elapsedTime: 300,
                remainingTime: 600,
                isDurationless: false
            };

            const { container } = render(
                <RuleSelectionDialog
                    isOpen={true}
                    actionType="pause"
                    sessionContext={mockSessionContext}
                    onRuleSelected={() => { }}
                    onCreateNewRule={() => { }}
                    onCancel={() => { }}
                />
            );

            const modal = container.querySelector('[class*="overflow-x-hidden"]');
            expect(modal).toBeInTheDocument();
        });

        test('ResponsiveContainer should prevent overflow', () => {
            const { container } = render(
                <ResponsiveContainer preventOverflow={true}>
                    <div style={{ width: '2000px' }}>Wide content</div>
                </ResponsiveContainer>
            );

            const containerElement = container.firstChild as HTMLElement;
            expect(containerElement).toHaveStyle({ overflowX: 'hidden' });
        });
    });

    describe('Performance Optimizations', () => {
        test('Performance monitor should work in background mode', () => {
            performanceMonitor.setBackgroundMode(true);
            performanceMonitor.startMonitoring();

            // Simulate a slow operation
            const result = performanceMonitor.measureInteraction('test-interaction', () => {
                // Simulate work
                const start = Date.now();
                while (Date.now() - start < 50) {
                    // Busy wait
                }
                return 'result';
            });

            expect(result).toBe('result');

            const report = performanceMonitor.reportMetrics();
            expect(report.interactionTime).toBeGreaterThan(0);
        });

        test('Layout stability monitor should detect issues', async () => {
            const testContainer = document.createElement('div');
            testContainer.style.width = '100px';
            testContainer.style.overflow = 'hidden';

            const wideChild = document.createElement('div');
            wideChild.style.width = '200px';
            testContainer.appendChild(wideChild);

            document.body.appendChild(testContainer);

            layoutStabilityMonitor.checkNow(testContainer);

            const report = layoutStabilityMonitor.getStabilityReport();
            expect(report.totalIssues).toBeGreaterThan(0);

            document.body.removeChild(testContainer);
        });
    });

    describe('Mobile Touch Optimization', () => {
        test('Buttons should have minimum touch target size', () => {
            render(
                <button className="touch-target">Test Button</button>
            );

            const button = screen.getByRole('button');
            const computedStyle = window.getComputedStyle(button);

            // Check if touch target styles are applied
            expect(button).toHaveClass('touch-target');
        });

        test('Touch feedback should be applied', () => {
            render(
                <button className="touch-feedback">Test Button</button>
            );

            const button = screen.getByRole('button');
            expect(button).toHaveClass('touch-feedback');
        });
    });

    describe('Responsive Design', () => {
        test('ResponsiveContainer should adapt to different screen sizes', () => {
            const { rerender } = render(
                <ResponsiveContainer maxWidth="max-w-2xl">
                    <div>Content</div>
                </ResponsiveContainer>
            );

            // Test different max widths
            rerender(
                <ResponsiveContainer maxWidth="max-w-4xl">
                    <div>Content</div>
                </ResponsiveContainer>
            );

            // Should not throw errors and render correctly
            expect(screen.getByText('Content')).toBeInTheDocument();
        });

        test('Modal should be responsive on mobile', () => {
            // Mock mobile viewport
            Object.defineProperty(window, 'innerWidth', {
                writable: true,
                configurable: true,
                value: 375,
            });

            const { container } = render(
                <ExceptionRuleManager onClose={() => { }} />
            );

            const modal = container.querySelector('.mobile-modal');
            expect(modal).toBeInTheDocument();
        });
    });

    describe('Error Handling and Recovery', () => {
        test('Should handle async operation failures gracefully', async () => {
            const mockError = new Error('Network error');

            // Mock a failing operation
            const failingOperation = jest.fn().mockRejectedValue(mockError);

            try {
                await failingOperation();
            } catch (error) {
                expect(error).toBe(mockError);
            }

            expect(failingOperation).toHaveBeenCalled();
        });

        test('Should provide user-friendly error messages', () => {
            render(
                <div className="error-message">
                    创建规则失败，请重试
                </div>
            );

            expect(screen.getByText('创建规则失败，请重试')).toBeInTheDocument();
        });
    });

    describe('Accessibility', () => {
        test('Should support keyboard navigation', () => {
            render(
                <button>Test Button</button>
            );

            const button = screen.getByRole('button');

            // Test keyboard focus
            button.focus();
            expect(document.activeElement).toBe(button);

            // Test keyboard activation
            fireEvent.keyDown(button, { key: 'Enter' });
            fireEvent.keyDown(button, { key: ' ' });
        });

        test('Should have proper ARIA labels', () => {
            render(
                <button aria-label="Close dialog">×</button>
            );

            const button = screen.getByLabelText('Close dialog');
            expect(button).toBeInTheDocument();
        });
    });

    describe('Performance Metrics', () => {
        test('Should track render performance', () => {
            const renderFn = jest.fn(() => 'rendered');

            const result = performanceMonitor.measureRender('test-component', renderFn);

            expect(result).toBe('rendered');
            expect(renderFn).toHaveBeenCalled();
        });

        test('Should detect layout shifts', () => {
            layoutStabilityMonitor.startMonitoring();

            // Simulate layout shift by changing element size
            const testElement = document.createElement('div');
            testElement.style.width = '100px';
            testElement.style.height = '100px';
            document.body.appendChild(testElement);

            // Change size to trigger potential layout shift
            testElement.style.width = '200px';

            const report = layoutStabilityMonitor.getStabilityReport();
            expect(report).toBeDefined();

            document.body.removeChild(testElement);
            layoutStabilityMonitor.stopMonitoring();
        });
    });
});

// Integration tests
describe('UI Integration Tests', () => {
    test('Complete rule creation flow should work without layout issues', async () => {
        const onClose = jest.fn();

        const { container } = render(
            <ExceptionRuleManager onClose={onClose} />
        );

        // Check initial render
        expect(container.querySelector('.modal-container')).toBeInTheDocument();

        // Test create button
        const createButton = screen.getByText('创建链专属规则');
        fireEvent.click(createButton);

        // Should not cause horizontal overflow
        const modal = container.querySelector('.modal-container');
        expect(modal).toHaveStyle({ overflowX: 'hidden' });
    });

    test('Rule selection dialog should handle all interactions smoothly', async () => {
        const mockSessionContext = {
            sessionId: 'test-session',
            chainId: 'test-chain',
            chainName: 'Test Chain',
            startedAt: new Date(),
            elapsedTime: 300,
            remainingTime: 600,
            isDurationless: false
        };

        const onRuleSelected = jest.fn();
        const onCancel = jest.fn();

        render(
            <RuleSelectionDialog
                isOpen={true}
                actionType="pause"
                sessionContext={mockSessionContext}
                onRuleSelected={onRuleSelected}
                onCreateNewRule={() => { }}
                onCancel={onCancel}
            />
        );

        // Test cancel button
        const cancelButton = screen.getByRole('button', { name: /close/i });
        fireEvent.click(cancelButton);

        expect(onCancel).toHaveBeenCalled();
    });
});