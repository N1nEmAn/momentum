/**
 * 响应式容器组件
 * 提供统一的响应式布局和横向滚动修复
 */

import React, { ReactNode, useEffect, useRef } from 'react';

interface ResponsiveContainerProps {
  children: ReactNode;
  maxWidth?: string;
  padding?: 'responsive' | 'fixed';
  preventOverflow?: boolean;
  className?: string;
}

export const ResponsiveContainer: React.FC<ResponsiveContainerProps> = ({
  children,
  maxWidth = 'max-w-2xl',
  padding = 'responsive',
  preventOverflow = true,
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!preventOverflow || !containerRef.current) return;

    const container = containerRef.current;
    
    // 检测并修复横向溢出
    const checkOverflow = () => {
      if (container.scrollWidth > container.clientWidth) {
        console.warn('检测到横向溢出，应用修复样式');
        container.style.overflowX = 'hidden';
        container.style.maxWidth = '100%';
        container.style.boxSizing = 'border-box';
      }
    };

    // 初始检查
    checkOverflow();

    // 监听窗口大小变化
    const resizeObserver = new ResizeObserver(checkOverflow);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [preventOverflow]);

  const paddingClass = padding === 'responsive' 
    ? 'px-4 sm:px-6 lg:px-8' 
    : 'px-4';

  const baseClasses = [
    'w-full',
    maxWidth,
    'mx-auto',
    paddingClass,
    preventOverflow ? 'overflow-x-hidden' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <div 
      ref={containerRef}
      className={baseClasses}
      style={{
        boxSizing: 'border-box',
        maxWidth: preventOverflow ? '100vw' : undefined
      }}
    >
      {children}
    </div>
  );
};