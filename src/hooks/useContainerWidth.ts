/**
 * 容器宽度监控Hook
 * 使用ResizeObserver监控容器宽度变化，确保滑动块正确适应容器
 */

import { useEffect, useState, RefObject } from 'react';

interface ContainerDimensions {
  width: number;
  height: number;
}

export const useContainerWidth = (
  containerRef: RefObject<HTMLElement>
): ContainerDimensions => {
  const [dimensions, setDimensions] = useState<ContainerDimensions>({
    width: 0,
    height: 0
  });

  useEffect(() => {
    if (!containerRef.current) return;

    const element = containerRef.current;

    // 创建ResizeObserver监控尺寸变化
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width, height });
        
        // 在开发模式下记录容器尺寸变化
        if (process.env.NODE_ENV === 'development') {
          console.log('容器尺寸变化:', { width, height });
        }
      }
    });

    // 开始观察
    resizeObserver.observe(element);
    
    // 设置初始尺寸
    const rect = element.getBoundingClientRect();
    setDimensions({
      width: rect.width,
      height: rect.height
    });

    return () => {
      resizeObserver.disconnect();
    };
  }, [containerRef]);

  return dimensions;
};

/**
 * 滑动块容器宽度监控Hook
 * 专门用于滑动块组件的容器宽度监控
 */
export const useSliderContainerWidth = (
  containerRef: RefObject<HTMLElement>,
  onWidthChange?: (width: number) => void
) => {
  const { width, height } = useContainerWidth(containerRef);

  useEffect(() => {
    if (onWidthChange && width > 0) {
      onWidthChange(width);
    }
  }, [width, onWidthChange]);

  return {
    width,
    height,
    isReady: width > 0 && height > 0
  };
};