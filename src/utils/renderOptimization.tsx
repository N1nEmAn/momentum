/**
 * 渲染优化工具
 * 提供防抖、节流和渲染优化功能
 */

import React, { useCallback, useRef, useEffect, useMemo, useState } from 'react';

/**
 * 防抖Hook
 * 延迟执行函数，在指定时间内多次调用只执行最后一次
 */
export const useDebounce = <T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T => {
  const timeoutRef = useRef<NodeJS.Timeout>();

  const debouncedCallback = useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay]
  ) as T;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return debouncedCallback;
};

/**
 * 节流Hook
 * 限制函数执行频率，在指定时间内最多执行一次
 */
export const useThrottle = <T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T => {
  const lastCallRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const throttledCallback = useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      const timeSinceLastCall = now - lastCallRef.current;

      if (timeSinceLastCall >= delay) {
        lastCallRef.current = now;
        callback(...args);
      } else {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
          lastCallRef.current = Date.now();
          callback(...args);
        }, delay - timeSinceLastCall);
      }
    },
    [callback, delay]
  ) as T;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return throttledCallback;
};

/**
 * 稳定引用Hook
 * 确保对象引用在依赖项不变时保持稳定
 */
export const useStableReference = <T,>(value: T, deps: React.DependencyList): T => {
  return useMemo(() => value, deps);
};

/**
 * 渲染计数Hook
 * 用于调试组件重渲染次数
 */
export const useRenderCount = (componentName: string) => {
  const renderCount = useRef(0);
  
  useEffect(() => {
    renderCount.current += 1;
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔄 ${componentName} 渲染次数:`, renderCount.current);
      
      if (renderCount.current > 10) {
        console.warn(`⚠️ ${componentName} 渲染次数过多，可能存在性能问题`);
      }
    }
  });

  return renderCount.current;
};

/**
 * 智能重渲染检测
 * 检测不必要的重渲染
 */
export const useWhyDidYouUpdate = (name: string, props: Record<string, any>) => {
  const previousProps = useRef<Record<string, any>>();

  useEffect(() => {
    if (previousProps.current && process.env.NODE_ENV === 'development') {
      const allKeys = Object.keys({ ...previousProps.current, ...props });
      const changedProps: Record<string, { from: any; to: any }> = {};

      allKeys.forEach(key => {
        if (previousProps.current![key] !== props[key]) {
          changedProps[key] = {
            from: previousProps.current![key],
            to: props[key]
          };
        }
      });

      if (Object.keys(changedProps).length) {
        console.log('🔍', name, '重渲染原因:', changedProps);
      }
    }

    previousProps.current = props;
  });
};