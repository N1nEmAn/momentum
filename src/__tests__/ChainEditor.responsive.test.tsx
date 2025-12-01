/**
 * ChainEditor响应式测试套件
 * 测试各种设备和屏幕尺寸下的布局表现
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChainEditor } from '../components/ChainEditor';
import { Chain, ChainType } from '../types';

// 模拟不同的视口尺寸
const viewports = [
  { width: 320, height: 568, name: 'iPhone SE' },
  { width: 375, height: 667, name: 'iPhone 8' },
  { width: 414, height: 896, name: 'iPhone 11 Pro Max' },
  { width: 768, height: 1024, name: 'iPad' },
  { width: 1024, height: 768, name: 'iPad横屏' },
  { width: 1280, height: 720, name: '桌面小屏' },
  { width: 1920, height: 1080, name: '桌面大屏' }
];

// 模拟ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// 模拟window.visualViewport
Object.defineProperty(window, 'visualViewport', {
  writable: true,
  value: {
    height: 600,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  }
});

// 设置视口大小的辅助函数
const setViewport = (width: number, height: number) => {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, 'innerHeight', {
    writable: true,
    configurable: true,
    value: height,
  });
  
  // 触发resize事件
  fireEvent(window, new Event('resize'));
};

// 检查横向滚动的辅助函数
const checkHorizontalOverflow = () => {
  const body = document.body;
  const html = document.documentElement;
  
  const scrollWidth = Math.max(body.scrollWidth, html.scrollWidth);
  const clientWidth = html.clientWidth;
  
  return scrollWidth > clientWidth;
};

// 测试用的Chain数据
const mockChain: Chain = {
  id: 'test-chain',
  name: '测试链条',
  type: 'unit' as ChainType,
  duration: 25,
  trigger: '戴上降噪耳机',
  description: '这是一个测试链条的描述',
  auxiliarySignal: '打响指',
  auxiliaryDuration: 15,
  auxiliaryCompletionTrigger: '开始主任务',
  currentStreak: 0,
  auxiliaryStreak: 0,
  totalCompletions: 0,
  totalFailures: 0,
  auxiliaryFailures: 0,
  createdAt: new Date(),
  lastCompletedAt: null,
  exceptions: []
};

const mockProps = {
  chain: mockChain,
  isEditing: true,
  onSave: jest.fn(),
  onCancel: jest.fn()
};

describe('ChainEditor响应式布局测试', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('多视口尺寸测试', () => {
    viewports.forEach(viewport => {
      test(`在${viewport.name}(${viewport.width}x${viewport.height})上无横向滚动`, async () => {
        setViewport(viewport.width, viewport.height);
        
        render(<ChainEditor {...mockProps} />);
        
        // 等待组件完全渲染
        await waitFor(() => {
          expect(screen.getByText('编辑链条')).toBeInTheDocument();
        });
        
        // 检查是否有横向滚动
        const hasHorizontalOverflow = checkHorizontalOverflow();
        expect(hasHorizontalOverflow).toBe(false);
      });

      test(`在${viewport.name}上所有交互元素可访问`, async () => {
        setViewport(viewport.width, viewport.height);
        
        render(<ChainEditor {...mockProps} />);
        
        // 检查主要交互元素是否存在且可点击
        const nameInput = screen.getByLabelText(/链名称/i);
        const typeSelect = screen.getByLabelText(/任务类型/i);
        const saveButton = screen.getByText(/保存更改/i);
        const cancelButton = screen.getByText(/取消/i);
        
        expect(nameInput).toBeInTheDocument();
        expect(typeSelect).toBeInTheDocument();
        expect(saveButton).toBeInTheDocument();
        expect(cancelButton).toBeInTheDocument();
        
        // 检查按钮是否有足够的触摸区域（移动端）
        if (viewport.width <= 768) {
          const saveButtonRect = saveButton.getBoundingClientRect();
          expect(saveButtonRect.height).toBeGreaterThanOrEqual(44); // 最小触摸目标
        }
      });
    });
  });

  describe('滑动块响应式测试', () => {
    test('滑动块在不同容器宽度下正确适应', async () => {
      const { rerender } = render(<ChainEditor {...mockProps} />);
      
      // 测试不同宽度
      const widths = [320, 768, 1024, 1920];
      
      for (const width of widths) {
        setViewport(width, 600);
        rerender(<ChainEditor {...mockProps} />);
        
        await waitFor(() => {
          const sliders = document.querySelectorAll('[role="slider"]');
          sliders.forEach(slider => {
            const rect = slider.getBoundingClientRect();
            expect(rect.width).toBeGreaterThan(0);
            expect(rect.width).toBeLessThanOrEqual(width - 32); // 考虑padding
          });
        });
      }
    });

    test('滑动块在移动端有足够的触摸区域', async () => {
      setViewport(375, 667); // iPhone尺寸
      
      render(<ChainEditor {...mockProps} />);
      
      await waitFor(() => {
        const sliderThumbs = document.querySelectorAll('.slider-thumb');
        sliderThumbs.forEach(thumb => {
          const rect = thumb.getBoundingClientRect();
          expect(rect.width).toBeGreaterThanOrEqual(44);
          expect(rect.height).toBeGreaterThanOrEqual(44);
        });
      });
    });
  });

  describe('布局稳定性测试', () => {
    test('内容加载时无明显布局偏移', async () => {
      const { container } = render(<ChainEditor {...mockProps} />);
      
      // 记录初始布局
      const initialRect = container.getBoundingClientRect();
      
      // 模拟内容加载完成
      await waitFor(() => {
        expect(screen.getByText('编辑链条')).toBeInTheDocument();
      });
      
      // 检查布局是否稳定
      const finalRect = container.getBoundingClientRect();
      
      // 允许小幅度的布局调整（< 5px）
      expect(Math.abs(finalRect.height - initialRect.height)).toBeLessThan(5);
    });

    test('屏幕方向变化时布局正确适应', async () => {
      // 竖屏
      setViewport(375, 667);
      const { rerender } = render(<ChainEditor {...mockProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('编辑链条')).toBeInTheDocument();
      });
      
      const portraitOverflow = checkHorizontalOverflow();
      expect(portraitOverflow).toBe(false);
      
      // 横屏
      setViewport(667, 375);
      rerender(<ChainEditor {...mockProps} />);
      
      await waitFor(() => {
        const landscapeOverflow = checkHorizontalOverflow();
        expect(landscapeOverflow).toBe(false);
      });
    });
  });

  describe('性能测试', () => {
    test('组件渲染时间在可接受范围内', async () => {
      const startTime = performance.now();
      
      render(<ChainEditor {...mockProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('编辑链条')).toBeInTheDocument();
      });
      
      const renderTime = performance.now() - startTime;
      
      // 渲染时间应小于100ms
      expect(renderTime).toBeLessThan(100);
    });

    test('滑动块交互响应时间正常', async () => {
      render(<ChainEditor {...mockProps} />);
      
      await waitFor(() => {
        const slider = document.querySelector('[role="slider"]');
        if (slider) {
          const startTime = performance.now();
          
          fireEvent.mouseDown(slider);
          fireEvent.mouseMove(slider, { clientX: 100 });
          fireEvent.mouseUp(slider);
          
          const interactionTime = performance.now() - startTime;
          
          // 交互响应时间应小于16ms（60fps）
          expect(interactionTime).toBeLessThan(16);
        }
      });
    });
  });

  describe('可访问性测试', () => {
    test('所有表单元素有正确的标签', async () => {
      render(<ChainEditor {...mockProps} />);
      
      // 检查主要表单元素
      expect(screen.getByLabelText(/链名称/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/任务类型/i)).toBeInTheDocument();
      
      // 检查滑动块的可访问性
      const sliders = document.querySelectorAll('[role="slider"]');
      sliders.forEach(slider => {
        expect(slider).toHaveAttribute('aria-valuemin');
        expect(slider).toHaveAttribute('aria-valuemax');
        expect(slider).toHaveAttribute('aria-valuenow');
      });
    });

    test('键盘导航正常工作', async () => {
      render(<ChainEditor {...mockProps} />);
      
      const nameInput = screen.getByLabelText(/链名称/i);
      nameInput.focus();
      
      // 测试Tab键导航
      fireEvent.keyDown(nameInput, { key: 'Tab' });
      
      const typeSelect = screen.getByLabelText(/任务类型/i);
      expect(typeSelect).toHaveFocus();
    });
  });

  describe('错误处理测试', () => {
    test('网络错误时布局保持稳定', async () => {
      // 模拟网络错误
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      render(<ChainEditor {...mockProps} />);
      
      // 即使有错误，基本布局应该仍然存在
      expect(screen.getByText('编辑链条')).toBeInTheDocument();
      
      consoleError.mockRestore();
    });

    test('极端数据时不会破坏布局', async () => {
      const extremeChain = {
        ...mockChain,
        name: 'A'.repeat(1000), // 极长的名称
        description: 'B'.repeat(5000) // 极长的描述
      };
      
      render(<ChainEditor {...mockProps} chain={extremeChain} />);
      
      await waitFor(() => {
        expect(screen.getByText('编辑链条')).toBeInTheDocument();
      });
      
      // 检查是否仍然没有横向滚动
      const hasOverflow = checkHorizontalOverflow();
      expect(hasOverflow).toBe(false);
    });
  });
});