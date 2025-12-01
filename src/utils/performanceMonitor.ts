/**
 * 性能监控工具
 * 监控ChainEditor的渲染性能和交互响应时间
 */

interface PerformanceMetrics {
  renderTime: number;
  interactionTime: number;
  layoutShifts: number;
  memoryUsage?: number;
  fps: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics = {
    renderTime: 0,
    interactionTime: 0,
    layoutShifts: 0,
    fps: 0
  };

  private observers: {
    layout?: PerformanceObserver;
    paint?: PerformanceObserver;
    measure?: PerformanceObserver;
  } = {};

  private fpsCounter = {
    frames: 0,
    lastTime: 0,
    fps: 0
  };

  private isMonitoring = false;
  private backgroundMode = true; // 默认后台模式
  private dataBuffer: any[] = [];
  private maxBufferSize = 100;
  private reportingEnabled = process.env.NODE_ENV === 'development';

  constructor() {
    if (typeof window !== 'undefined' && this.reportingEnabled) {
      // 延迟初始化，避免阻塞主线程
      requestIdleCallback(() => {
        this.initializeObservers();
      }, { timeout: 1000 });
    }
  }

  private initializeObservers() {
    // 监控布局偏移 (CLS - Cumulative Layout Shift)
    if ('PerformanceObserver' in window) {
      try {
        this.observers.layout = new PerformanceObserver((list) => {
          // 使用 requestIdleCallback 在空闲时处理数据
          requestIdleCallback(() => {
            for (const entry of list.getEntries()) {
              if (entry.entryType === 'layout-shift' && !(entry as any).hadRecentInput) {
                this.metrics.layoutShifts += (entry as any).value;
                
                // 只在后台模式下记录，不立即输出
                if (this.backgroundMode) {
                  this.addToBuffer({
                    type: 'layout-shift',
                    value: (entry as any).value,
                    timestamp: Date.now()
                  });
                } else if ((entry as any).value > 0.1) {
                  console.warn('🚨 检测到大幅布局偏移:', {
                    value: (entry as any).value,
                    sources: (entry as any).sources
                  });
                }
              }
            }
          });
        });

        this.observers.layout.observe({ entryTypes: ['layout-shift'] });
      } catch (e) {
        // 静默处理错误，不影响用户体验
        if (!this.backgroundMode) {
          console.warn('布局偏移监控不可用:', e);
        }
      }

      // 监控绘制性能
      try {
        this.observers.paint = new PerformanceObserver((list) => {
          requestIdleCallback(() => {
            for (const entry of list.getEntries()) {
              if (entry.name === 'first-contentful-paint') {
                this.metrics.renderTime = entry.startTime;
                this.addToBuffer({
                  type: 'paint',
                  name: entry.name,
                  startTime: entry.startTime,
                  timestamp: Date.now()
                });
              }
            }
          });
        });

        this.observers.paint.observe({ entryTypes: ['paint'] });
      } catch (e) {
        // 静默处理错误
        if (!this.backgroundMode) {
          console.warn('绘制性能监控不可用:', e);
        }
      }

      // 监控自定义测量
      try {
        this.observers.measure = new PerformanceObserver((list) => {
          requestIdleCallback(() => {
            for (const entry of list.getEntries()) {
              if (entry.name.startsWith('chain-editor-')) {
                this.addToBuffer({
                  type: 'measure',
                  name: entry.name,
                  duration: entry.duration,
                  timestamp: Date.now()
                });
                
                if (!this.backgroundMode) {
                  console.log('性能测量:', entry.name, entry.duration + 'ms');
                }
              }
            }
          });
        });

        this.observers.measure.observe({ entryTypes: ['measure'] });
      } catch (e) {
        // 静默处理错误
        if (!this.backgroundMode) {
          console.warn('自定义测量监控不可用:', e);
        }
      }
    }
  }

  // 添加数据到缓冲区
  private addToBuffer(data: any) {
    if (this.dataBuffer.length >= this.maxBufferSize) {
      // 移除最旧的数据
      this.dataBuffer.shift();
    }
    this.dataBuffer.push(data);
  }

  // 异步批量处理数据
  private async processBatchData() {
    if (this.dataBuffer.length === 0) return;

    // 在空闲时处理数据
    return new Promise<void>((resolve) => {
      requestIdleCallback(() => {
        const batchData = [...this.dataBuffer];
        this.dataBuffer = [];
        
        // 处理数据（可以发送到分析服务等）
        if (this.reportingEnabled && !this.backgroundMode) {
          console.log('批量处理性能数据:', batchData.length, '条记录');
        }
        
        resolve();
      });
    });
  }

  // 设置监控模式
  setBackgroundMode(enabled: boolean) {
    this.backgroundMode = enabled;
  }

  // 启用/禁用报告
  setReportingEnabled(enabled: boolean) {
    this.reportingEnabled = enabled;
  }

  startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.startFPSMonitoring();
    
    // 定期批量处理数据
    if (this.backgroundMode) {
      setInterval(() => {
        this.processBatchData();
      }, 5000); // 每5秒处理一次
    }
    
    if (this.reportingEnabled && !this.backgroundMode) {
      console.log('🔍 性能监控已启动');
    }
  }

  stopMonitoring() {
    this.isMonitoring = false;
    
    // 清理观察者
    Object.values(this.observers).forEach(observer => {
      observer?.disconnect();
    });

    if (process.env.NODE_ENV === 'development') {
      console.log('⏹️ 性能监控已停止');
      this.reportMetrics();
    }
  }

  private startFPSMonitoring() {
    const measureFPS = (timestamp: number) => {
      if (!this.isMonitoring) return;

      this.fpsCounter.frames++;
      
      if (timestamp - this.fpsCounter.lastTime >= 1000) {
        this.metrics.fps = Math.round(
          (this.fpsCounter.frames * 1000) / (timestamp - this.fpsCounter.lastTime)
        );
        
        this.fpsCounter.frames = 0;
        this.fpsCounter.lastTime = timestamp;
        
        // 如果FPS低于30，发出警告
        if (this.metrics.fps < 30) {
          console.warn('⚠️ FPS较低:', this.metrics.fps);
        }
      }
      
      requestAnimationFrame(measureFPS);
    };

    requestAnimationFrame(measureFPS);
  }

  // 测量组件渲染时间（优化版）
  measureRender<T>(componentName: string, renderFn: () => T): T {
    if (!this.reportingEnabled) {
      return renderFn(); // 直接执行，不进行测量
    }

    const startMark = `${componentName}-render-start`;
    const endMark = `${componentName}-render-end`;
    const measureName = `chain-editor-${componentName}-render`;

    performance.mark(startMark);
    const result = renderFn();
    performance.mark(endMark);
    
    try {
      performance.measure(measureName, startMark, endMark);
    } catch (e) {
      // 静默忽略测量错误
    }

    return result;
  }

  // 测量交互响应时间（优化版）
  measureInteraction<T>(interactionName: string, interactionFn: () => T): T {
    const startTime = this.reportingEnabled ? performance.now() : 0;
    const result = interactionFn();
    
    if (this.reportingEnabled) {
      const endTime = performance.now();
      const duration = endTime - startTime;
      this.metrics.interactionTime = Math.max(this.metrics.interactionTime, duration);
      
      // 只在非后台模式下立即警告
      if (duration > 100 && !this.backgroundMode) {
        console.warn('🐌 交互响应较慢:', interactionName, duration + 'ms');
      } else if (duration > 100) {
        // 后台模式下添加到缓冲区
        this.addToBuffer({
          type: 'slow-interaction',
          name: interactionName,
          duration,
          timestamp: Date.now()
        });
      }
    }

    return result;
  }

  // 获取内存使用情况
  getMemoryUsage(): number | undefined {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      return memory.usedJSHeapSize / 1024 / 1024; // MB
    }
    return undefined;
  }

  // 报告性能指标
  reportMetrics() {
    const memoryUsage = this.getMemoryUsage();
    if (memoryUsage) {
      this.metrics.memoryUsage = memoryUsage;
    }

    console.group('📊 ChainEditor 性能报告');
    console.log('渲染时间:', this.metrics.renderTime.toFixed(2) + 'ms');
    console.log('最大交互时间:', this.metrics.interactionTime.toFixed(2) + 'ms');
    console.log('累积布局偏移:', this.metrics.layoutShifts.toFixed(4));
    console.log('当前FPS:', this.metrics.fps);
    if (memoryUsage) {
      console.log('内存使用:', memoryUsage.toFixed(2) + 'MB');
    }
    console.groupEnd();

    return { ...this.metrics };
  }

  // 检查性能是否达标
  checkPerformance(): { passed: boolean; issues: string[] } {
    const issues: string[] = [];

    if (this.metrics.interactionTime > 100) {
      issues.push(`交互响应时间过长: ${this.metrics.interactionTime.toFixed(2)}ms`);
    }

    if (this.metrics.layoutShifts > 0.1) {
      issues.push(`布局偏移过大: ${this.metrics.layoutShifts.toFixed(4)}`);
    }

    if (this.metrics.fps < 30) {
      issues.push(`FPS过低: ${this.metrics.fps}`);
    }

    if (this.metrics.memoryUsage && this.metrics.memoryUsage > 50) {
      issues.push(`内存使用过高: ${this.metrics.memoryUsage.toFixed(2)}MB`);
    }

    return {
      passed: issues.length === 0,
      issues
    };
  }
}

// 单例实例
export const performanceMonitor = new PerformanceMonitor();

// React Hook
export const usePerformanceMonitoring = (componentName: string) => {
  const startMonitoring = () => performanceMonitor.startMonitoring();
  const stopMonitoring = () => performanceMonitor.stopMonitoring();
  
  const measureRender = <T>(renderFn: () => T): T => {
    return performanceMonitor.measureRender(componentName, renderFn);
  };

  const measureInteraction = <T>(interactionName: string, interactionFn: () => T): T => {
    return performanceMonitor.measureInteraction(`${componentName}-${interactionName}`, interactionFn);
  };

  return {
    startMonitoring,
    stopMonitoring,
    measureRender,
    measureInteraction,
    reportMetrics: () => performanceMonitor.reportMetrics(),
    checkPerformance: () => performanceMonitor.checkPerformance()
  };
};