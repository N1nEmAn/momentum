/**
 * 平滑滑动块组件
 * 解决滑动块"抽搐"问题，提供更好的用户体验
 */

import React, { useState, useRef, useCallback } from 'react';

interface SmoothSliderProps {
  id?: string;
  name?: string;
  min: number;
  max: number;
  value: number;
  step?: number;
  onChange: (value: number) => void;
  className?: string;
  disabled?: boolean;
  showValue?: boolean;
  valueFormatter?: (value: number) => string;
  trackColor?: string;
  fillColor?: string;
  thumbColor?: string;
  debounceMs?: number; // 可选的防抖延迟，用于进一步优化性能
}

export const SmoothSlider: React.FC<SmoothSliderProps> = ({
  id,
  name,
  min,
  max,
  value,
  step = 1,
  onChange,
  className = '',
  disabled = false,
  showValue = true,
  valueFormatter = (v) => `${v}`,
  trackColor = 'bg-gray-200 dark:bg-gray-600',
  fillColor = 'bg-primary-500',
  thumbColor = 'bg-white border-primary-500',
  debounceMs = 0
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const sliderRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const dragValueRef = useRef(value); // 用于存储拖动过程中的实时值
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 计算百分比位置
  const percentage = ((localValue - min) / (max - min)) * 100;

  // 处理鼠标/触摸事件
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled) return;
    
    setIsDragging(true);
    e.preventDefault();
    
    // 使用ref来存储拖动过程中的实时值，避免频繁更新state
    dragValueRef.current = localValue;
    let animationFrameId: number | null = null;
    
    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!sliderRef.current) return;
      
      // 取消之前的动画帧
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      
      // 使用requestAnimationFrame来节流更新
      animationFrameId = requestAnimationFrame(() => {
        if (!sliderRef.current) return;
        
        const rect = sliderRef.current.getBoundingClientRect();
        const x = moveEvent.clientX - rect.left;
        const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
        const newValue = Math.round((percentage / 100) * (max - min) + min);
        
        // 应用步长
        const steppedValue = Math.round(newValue / step) * step;
        const clampedValue = Math.max(min, Math.min(max, steppedValue));
        
        // 只有值真正改变时才更新本地状态
        if (clampedValue !== dragValueRef.current) {
          dragValueRef.current = clampedValue;
          setLocalValue(clampedValue);
        }
      });
    };
    
    const handlePointerUp = () => {
      setIsDragging(false);
      
      // 取消任何待处理的动画帧
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      
      // 取消任何待处理的防抖
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
      
      // 只在拖动结束时通知父组件，使用最新的拖动值
      if (debounceMs > 0) {
        debounceTimeoutRef.current = setTimeout(() => {
          onChange(dragValueRef.current);
          debounceTimeoutRef.current = null;
        }, debounceMs);
      } else {
        onChange(dragValueRef.current);
      }
      
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
    
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  }, [disabled, min, max, step, localValue, onChange]);

  // 处理键盘事件
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) return;
    
    let newValue = localValue;
    
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        newValue = Math.max(min, localValue - step);
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        newValue = Math.min(max, localValue + step);
        break;
      case 'Home':
        newValue = min;
        break;
      case 'End':
        newValue = max;
        break;
      case 'PageDown':
        newValue = Math.max(min, localValue - step * 10);
        break;
      case 'PageUp':
        newValue = Math.min(max, localValue + step * 10);
        break;
      default:
        return;
    }
    
    e.preventDefault();
    
    // 键盘操作是离散的，可以立即更新本地状态和通知父组件
    if (newValue !== localValue) {
      setLocalValue(newValue);
      dragValueRef.current = newValue;
      onChange(newValue);
    }
  }, [disabled, localValue, min, max, step, onChange]);

  // 同步外部值变化
  React.useEffect(() => {
    if (!isDragging) {
      setLocalValue(value);
      dragValueRef.current = value;
    }
  }, [value, isDragging]);

  // 清理函数
  React.useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

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
          className={`absolute top-0 left-0 h-full rounded-full transition-all duration-150 ease-out ${fillColor}`}
          style={{ width: `${percentage}%` }}
        />
        
        {/* 滑块拇指 */}
        <div
          ref={thumbRef}
          className={`absolute top-1/2 w-5 h-5 rounded-full border-2 shadow-md transform -translate-y-1/2 -translate-x-1/2 transition-all duration-150 ease-out ${thumbColor} ${
            isDragging ? 'scale-110 shadow-lg' : 'hover:scale-105'
          } ${disabled ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'}`}
          style={{ left: `${percentage}%` }}
          tabIndex={disabled ? -1 : 0}
          role="slider"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={localValue}
          aria-label={name || id}
          onKeyDown={handleKeyDown}
        />
      </div>
      
      {/* 隐藏的原生input用于表单提交 */}
      <input
        type="range"
        id={id}
        name={name}
        min={min}
        max={max}
        step={step}
        value={localValue}
        onChange={() => {}} // 由自定义逻辑处理
        className="sr-only"
        disabled={disabled}
        aria-hidden="true"
        tabIndex={-1}
      />
      
      {/* 值显示 */}
      {showValue && (
        <div className="min-w-[60px] text-right">
          <span className={`font-mono font-semibold ${
            disabled ? 'text-gray-400' : 'text-primary-500'
          }`}>
            {valueFormatter(localValue)}
          </span>
        </div>
      )}
    </div>
  );
};