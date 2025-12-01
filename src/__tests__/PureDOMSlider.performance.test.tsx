/**
 * PureDOMSlider性能测试
 * 验证滑动块的性能表现和零重渲染特性
 */

import React, { useState } from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { PureDOMSlider } from '../components/PureDOMSlider';

// 模拟ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// 测试包装组件，用于监控重渲染
const TestWrapper: React.FC<{ onRender: () => void }> = ({ onRender }) => {
  const [value, setValue] = useState(50);
  
  // 每次渲染时调用
  onRender();
  
  return (
    <PureDOMSlider
      id="test-slider"
      min={0}
      max={100}
      initialValue={value}
      onValueChange={setValue}
      valueFormatter={(v) => `${v}%`}
    />
  );
};

describe('PureDOMSlider性能测试', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('重渲染测试', () => {
    test('拖动过程中父组件不重渲染', async () => {
      const renderSpy = jest.fn();
      
      const { container } = render(<TestWrapper onRender={renderSpy} />);
      
      // 初始渲染
      expect(renderSpy).toHaveBeenCalledTimes(1);
      
      const slider = container.querySelector('.slider-track');
      expect(slider).toBeInTheDocument();
      
      // 模拟拖动操作
      fireEvent.mouseDown(slider!, { clientX: 0 });
      fireEvent.mouseMove(document, { clientX: 50 });
      fireEvent.mouseMove(document, { clientX: 75 });
      fireEvent.mouseUp(document);
      
      // 等待所有异步操作完成
      await waitFor(() => {
        // 拖动过程中不应该触发额外的渲染
        expect(renderSpy).toHaveBeenCalledTimes(1);
      });
    });

    test('快速连续拖动不会导致性能问题', async () => {
      const renderSpy = jest.fn();
      const { container } = render(<TestWrapper onRender={renderSpy} />);
      
      const slider = container.querySelector('.slider-track');
      const startTime = performance.now();
      
      // 模拟快速连续拖动
      fireEvent.mouseDown(slider!, { clientX: 0 });
      
      for (let i = 0; i < 100; i++) {
        fireEvent.mouseMove(document, { clientX: i });
      }
      
      fireEvent.mouseUp(document);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // 100次拖动操作应该在50ms内完成
      expect(duration).toBeLessThan(50);
      
      // 仍然只有初始渲染
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('DOM操作性能测试', () => {
    test('DOM更新操作高效执行', async () => {
      const onValueChange = jest.fn();
      
      const { container } = render(
        <PureDOMSlider
          id="perf-test-slider"
          min={0}
          max={1000}
          initialValue={500}
          onValueChange={onValueChange}
        />
      );
      
      const slider = container.querySelector('.slider-track');
      const thumb = container.querySelector('.slider-thumb');
      
      expect(slider).toBeInTheDocument();
      expect(thumb).toBeInTheDocument();
      
      const startTime = performance.now();
      
      // 模拟大范围拖动
      fireEvent.mouseDown(slider!, { clientX: 0 });
      fireEvent.mouseMove(document, { clientX: 500 });
      fireEvent.mouseUp(document);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // DOM操作应该很快完成
      expect(duration).toBeLessThan(10);
    });

    test('容器宽度变化时正确适应', async () => {
      const { container } = render(
        <div style={{ width: '200px' }}>
          <PureDOMSlider
            id="responsive-slider"
            min={0}
            max={100}
            initialValue={50}
            onValueChange={() => {}}
          />
        </div>
      );
      
      const slider = container.querySelector('.slider-track');
      const thumb = container.querySelector('.slider-thumb');
      
      // 检查初始位置
      expect(thumb).toHaveStyle('left: 50%');
      
      // 模拟容器宽度变化
      const parentDiv = container.firstChild as HTMLElement;
      parentDiv.style.width = '400px';
      
      // 触发resize事件
      fireEvent(window, new Event('resize'));
      
      await waitFor(() => {
        // 滑动块位置应该保持正确的百分比
        expect(thumb).toHaveStyle('left: 50%');
      });
    });
  });

  describe('内存使用测试', () => {
    test('组件卸载时正确清理资源', () => {
      const { unmount } = render(
        <PureDOMSlider
          id="cleanup-test"
          min={0}
          max={100}
          initialValue={50}
          onValueChange={() => {}}
        />
      );
      
      // 模拟一些交互
      const slider = document.querySelector('.slider-track');
      if (slider) {
        fireEvent.mouseDown(slider, { clientX: 0 });
        fireEvent.mouseMove(document, { clientX: 50 });
        fireEvent.mouseUp(document);
      }
      
      // 卸载组件
      unmount();
      
      // 检查是否有残留的事件监听器
      const eventListeners = (document as any)._events;
      if (eventListeners) {
        expect(eventListeners.mousemove).toBeUndefined();
        expect(eventListeners.mouseup).toBeUndefined();
      }
    });

    test('多个滑动块实例不会相互影响', () => {
      const onValueChange1 = jest.fn();
      const onValueChange2 = jest.fn();
      
      const { container } = render(
        <div>
          <PureDOMSlider
            id="slider-1"
            min={0}
            max={100}
            initialValue={25}
            onValueChange={onValueChange1}
          />
          <PureDOMSlider
            id="slider-2"
            min={0}
            max={100}
            initialValue={75}
            onValueChange={onValueChange2}
          />
        </div>
      );
      
      const sliders = container.querySelectorAll('.slider-track');
      expect(sliders).toHaveLength(2);
      
      // 操作第一个滑动块
      fireEvent.mouseDown(sliders[0], { clientX: 0 });
      fireEvent.mouseMove(document, { clientX: 50 });
      fireEvent.mouseUp(document);
      
      // 只有第一个滑动块的回调应该被调用
      expect(onValueChange1).toHaveBeenCalled();
      expect(onValueChange2).not.toHaveBeenCalled();
    });
  });

  describe('边界条件测试', () => {
    test('极端值范围下的性能', () => {
      const { container } = render(
        <PureDOMSlider
          id="extreme-range"
          min={-1000000}
          max={1000000}
          initialValue={0}
          onValueChange={() => {}}
        />
      );
      
      const slider = container.querySelector('.slider-track');
      const startTime = performance.now();
      
      // 测试极端值的拖动
      fireEvent.mouseDown(slider!, { clientX: 0 });
      fireEvent.mouseMove(document, { clientX: 1000 });
      fireEvent.mouseUp(document);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // 即使是极端值范围，操作也应该很快
      expect(duration).toBeLessThan(20);
    });

    test('高频率更新的性能', async () => {
      const onValueChange = jest.fn();
      
      const { container } = render(
        <PureDOMSlider
          id="high-freq"
          min={0}
          max={1000}
          initialValue={500}
          onValueChange={onValueChange}
          debounceMs={0} // 禁用防抖以测试高频更新
        />
      );
      
      const slider = container.querySelector('.slider-track');
      const startTime = performance.now();
      
      // 模拟高频率的鼠标移动
      fireEvent.mouseDown(slider!, { clientX: 0 });
      
      for (let i = 0; i < 1000; i++) {
        fireEvent.mouseMove(document, { clientX: i % 500 });
      }
      
      fireEvent.mouseUp(document);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // 1000次更新应该在100ms内完成
      expect(duration).toBeLessThan(100);
    });
  });

  describe('防抖功能测试', () => {
    test('防抖机制正确工作', async () => {
      const onValueChange = jest.fn();
      
      const { container } = render(
        <PureDOMSlider
          id="debounce-test"
          min={0}
          max={100}
          initialValue={50}
          onValueChange={onValueChange}
          debounceMs={100}
        />
      );
      
      const slider = container.querySelector('.slider-track');
      
      // 快速连续拖动
      fireEvent.mouseDown(slider!, { clientX: 0 });
      fireEvent.mouseMove(document, { clientX: 10 });
      fireEvent.mouseMove(document, { clientX: 20 });
      fireEvent.mouseMove(document, { clientX: 30 });
      fireEvent.mouseUp(document);
      
      // 立即检查，应该还没有调用回调
      expect(onValueChange).not.toHaveBeenCalled();
      
      // 等待防抖时间
      await waitFor(() => {
        expect(onValueChange).toHaveBeenCalledTimes(1);
      }, { timeout: 200 });
    });
  });
});