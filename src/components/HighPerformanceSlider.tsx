/**
 * 高性能滑动块组件
 * 专为高频更新场景设计，完全避免拖动过程中的重渲染
 */

import React, { useRef, useCallback, useImperativeHandle, forwardRef } from 'react';

interface HighPerformanceSliderProps {
  id?: string;
  name?: string;
  min: number;
  max: number;
  value: number;
  step?: number;
  onChange: (value: number) => void;
  onChangeEnd?: (value: number) => void; // 拖动结束时的回调
  className?: string;
  disabled?: boolean;
  showValue?: boolean;
  valueFormatter?: (value: number) => string;
  trackColor?: string;
  fillColor?: string;
  thumbColor?: string;
}

export interface HighPerformanceSliderRef {
  setValue: (value: number) => void;
  getValue: () => number;
}

export const HighPerformanceSlider = forwardRef<HighPerformanceSliderRef, HighPerformanceSliderProps>(({
  id,
  name,
  min,
  max,
  value,
  step = 1,
  onChange,
  onChangeEnd,
  className = '',
  disabled = false,
  showValue = true,
  valueFormatter = (v) => `${v}`,
  trackColor = 'bg-gray-200 dark:bg-gray-600',
  fillColor = 'bg-primary-500',
  thumbColor = 'bg-white border-primary-500'
}, ref) => {
  const sliderRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const valueDisplayRef = useRef<HTMLSpanElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  
  // 使用ref存储当前值，避免重渲染
  const currentValueRef = useRef(value);
  const isDraggingRef = useRef(false);

  // 计算百分比位置
  const calculatePercentage = useCallback((val: number) => {
    return ((val - min) / (max - min)) * 100;
  }, [min, max]);

  // 直接更新DOM，避免React重渲染
  const updateSliderDOM = useCallback((newValue: number) => {
    const percentage = calculatePercentage(newValue);
    
    // 更新拇指位置
    if (thumbRef.current) {
      thumbRef.current.style.left = `${percentage}%`;
    }
    
    // 更新填充宽度
    if (fillRef.current) {
      fillRef.current.style.width = `${percentage}%`;
    }
    
    // 更新值显示
    if (valueDisplayRef.current && showValue) {
      valueDisplayRef.current.textContent = valueFormatter(newValue);
    }
    
    // 更新隐藏input的值
    if (hiddenInputRef.current) {
      hiddenInputRef.current.value = newValue.toString();
    }
    
    currentValueRef.current = newValue;
  }, [calculatePercentage, showValue, valueFormatter]);

  // 暴露给父组件的方法
  useImperativeHandle(ref, () => ({
    setValue: (newValue: number) => {
      const clampedValue = Math.max(min, Math.min(max, newValue));
      updateSliderDOM(clampedValue);
    },
    getValue: () => currentValueRef.current
  }), [updateSliderDOM, min, max]);

  // 处理拖动
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled) return;
    
    isDraggingRef.current = true;
    e.preventDefault();
    
    // 添加拖动样式
    if (thumbRef.current) {
      thumbRef.current.style.transform = 'translate(-50%, -50%) scale(1.1)';
    }
    
    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!sliderRef.current || !isDraggingRef.current) return;
      
      const rect = sliderRef.current.getBoundingClientRect();
      const x = moveEvent.clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
      const newValue = Math.round((percentage / 100) * (max - min) + min);
      
      // 应用步长
      const steppedValue = Math.round(newValue / step) * step;
      const clampedValue = Math.max(min, Math.min(max, steppedValue));
      
      // 直接更新DOM，不触发React重渲染
      updateSliderDOM(clampedValue);
      
      // 可选：在拖动过程中也通知父组件（但通常不推荐）
      // onChange(clampedValue);
    };
    
    const handlePointerUp = () => {
      isDraggingRef.current = false;
      
      // 移除拖动样式
      if (thumbRef.current) {
        thumbRef.current.style.transform = 'translate(-50%, -50%) scale(1)';
      }
      
      // 只在拖动结束时通知父组件
      const finalValue = currentValueRef.current;
      onChange(finalValue);
      onChangeEnd?.(finalValue);
      
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
    
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  }, [disabled, min, max, step, updateSliderDOM, onChange, onChangeEnd]);

  // 处理键盘事件
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) return;
    
    let newValue = currentValueRef.current;
    
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        newValue = Math.max(min, currentValueRef.current - step);
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        newValue = Math.min(max, currentValueRef.current + step);
        break;
      case 'Home':
        newValue = min;
        break;
      case 'End':
        newValue = max;
        break;
      case 'PageDown':
        newValue = Math.max(min, currentValueRef.current - step * 10);
        break;
      case 'PageUp':
        newValue = Math.min(max, currentValueRef.current + step * 10);
        break;
      default:
        return;
    }
    
    e.preventDefault();
    
    if (newValue !== currentValueRef.current) {
      updateSliderDOM(newValue);
      onChange(newValue);
      onChangeEnd?.(newValue);
    }
  }, [disabled, min, max, step, updateSliderDOM, onChange, onChangeEnd]);

  // 初始化DOM
  React.useEffect(() => {
    updateSliderDOM(value);
  }, [value, updateSliderDOM]);

  // 计算初始百分比
  const initialPercentage = calculatePercentage(value);

  return (
    <div className={`relative flex items-center space-x-3 ${className}`}>
      {/* 滑动块轨道 */}
      <div
        ref={sliderRef}
        className={`relative flex-1 h-2 rounded-full cursor-pointer ${trackColor} ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
        onPointerDown={handlePointerDown}
      >
        {/* 填充轨道 */}
        <div
          ref={fillRef}
          className={`absolute top-0 left-0 h-full rounded-full transition-none ${fillColor}`}
          style={{ width: `${initialPercentage}%` }}
        />
        
        {/* 滑块拇指 */}
        <div
          ref={thumbRef}
          className={`absolute top-1/2 w-5 h-5 rounded-full border-2 shadow-md transform -translate-y-1/2 -translate-x-1/2 transition-transform duration-150 ease-out ${thumbColor} ${
            disabled ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing hover:scale-105'
          }`}
          style={{ left: `${initialPercentage}%` }}
          tabIndex={disabled ? -1 : 0}
          role="slider"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-label={name || id}
          onKeyDown={handleKeyDown}
        />
      </div>
      
      {/* 隐藏的原生input用于表单提交 */}
      <input
        ref={hiddenInputRef}
        type="range"
        id={id}
        name={name}
        min={min}
        max={max}
        step={step}
        defaultValue={value}
        className="sr-only"
        disabled={disabled}
        aria-hidden="true"
        tabIndex={-1}
      />
      
      {/* 值显示 */}
      {showValue && (
        <div className="min-w-[60px] text-right">
          <span 
            ref={valueDisplayRef}
            className={`font-mono font-semibold ${
              disabled ? 'text-gray-400' : 'text-primary-500'
            }`}
          >
            {valueFormatter(value)}
          </span>
        </div>
      )}
    </div>
  );
});

HighPerformanceSlider.displayName = 'HighPerformanceSlider';