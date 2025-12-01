/**
 * 滑动块容器组件
 * 提供统一的滑动块布局，确保容器宽度稳定，支持垂直布局
 */

import React, { useRef, useEffect, useState } from 'react';

interface SliderContainerProps {
  label: string;
  children: React.ReactNode;
  orientation?: 'horizontal' | 'vertical';
  showKeyboardInput?: boolean;
  keyboardInputProps?: {
    value: number;
    onChange: (value: number) => void;
    min: number;
    max: number;
    unit?: string;
    placeholder?: string;
  };
  className?: string;
  description?: string;
}

export const SliderContainer: React.FC<SliderContainerProps> = ({
  label,
  children,
  orientation = 'vertical',
  showKeyboardInput = true,
  keyboardInputProps,
  className = '',
  description
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // 监控容器宽度变化
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(containerRef.current);
    
    // 初始宽度
    setContainerWidth(containerRef.current.offsetWidth);

    return () => resizeObserver.disconnect();
  }, []);

  const handleKeyboardInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!keyboardInputProps) return;

    const value = e.target.value;
    if (value === '') {
      keyboardInputProps.onChange(0);
      return;
    }

    const numValue = parseInt(value);
    if (isNaN(numValue)) return;

    const { min, max } = keyboardInputProps;
    const clampedValue = Math.max(min, Math.min(max, numValue));
    keyboardInputProps.onChange(clampedValue);
  };

  if (orientation === 'horizontal') {
    return (
      <div ref={containerRef} className={`slider-container-horizontal w-full ${className}`}>
        <div className="flex items-center space-x-4">
          <span className="text-gray-700 dark:text-slate-300 font-chinese whitespace-nowrap">
            {label}
          </span>
          <div className="flex-1 min-w-0">
            {children}
          </div>
          {showKeyboardInput && keyboardInputProps && (
            <div className="flex items-center space-x-2 whitespace-nowrap">
              <input
                type="number"
                min={keyboardInputProps.min}
                max={keyboardInputProps.max}
                value={keyboardInputProps.value || ''}
                onChange={handleKeyboardInputChange}
                placeholder={keyboardInputProps.placeholder}
                className="bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl px-3 py-2 text-gray-900 dark:text-slate-100 w-20 text-center font-mono focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all duration-300"
              />
              {keyboardInputProps.unit && (
                <span className="text-gray-500 dark:text-slate-400 font-chinese text-sm">
                  {keyboardInputProps.unit}
                </span>
              )}
            </div>
          )}
        </div>
        {description && (
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-2 font-chinese">
            {description}
          </p>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`slider-container-vertical w-full space-y-4 ${className}`}>
      <div className="slider-main space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-gray-700 dark:text-slate-300 font-chinese font-medium">
            {label}
          </span>
          {containerWidth > 0 && (
            <span className="text-xs text-gray-400 font-mono">
              容器宽度: {containerWidth}px
            </span>
          )}
        </div>
        
        {description && (
          <p className="text-sm text-gray-500 dark:text-slate-400 font-chinese">
            {description}
          </p>
        )}
        
        <div className="slider-wrapper w-full">
          {children}
        </div>
      </div>
      
      {showKeyboardInput && keyboardInputProps && (
        <div className="keyboard-input-section">
          <div className="flex items-center space-x-4">
            <span className="text-gray-700 dark:text-slate-300 font-chinese">
              键盘输入:
            </span>
            <div className="flex items-center space-x-2">
              <input
                type="number"
                min={keyboardInputProps.min}
                max={keyboardInputProps.max}
                value={keyboardInputProps.value || ''}
                onChange={handleKeyboardInputChange}
                placeholder={keyboardInputProps.placeholder}
                className="bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl px-3 py-2 text-gray-900 dark:text-slate-100 w-20 text-center font-mono focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all duration-300"
              />
              {keyboardInputProps.unit && (
                <span className="text-gray-500 dark:text-slate-400 font-chinese text-sm">
                  {keyboardInputProps.unit}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};