import { LayoutStabilityMonitor } from '../LayoutStabilityMonitor';

// Mock DOM APIs
const mockResizeObserver = jest.fn(() => ({
  observe: jest.fn(),
  disconnect: jest.fn(),
  unobserve: jest.fn(),
}));

const mockMutationObserver = jest.fn(() => ({
  observe: jest.fn(),
  disconnect: jest.fn(),
}));

const mockPerformanceObserver = jest.fn(() => ({
  observe: jest.fn(),
  disconnect: jest.fn(),
}));

// @ts-ignore
global.ResizeObserver = mockResizeObserver;
// @ts-ignore
global.MutationObserver = mockMutationObserver;
// @ts-ignore
global.PerformanceObserver = mockPerformanceObserver;

// Mock requestAnimationFrame
global.requestAnimationFrame = jest.fn((cb) => {
  setTimeout(cb, 16);
  return 1;
});

describe('LayoutStabilityMonitor', () => {
  let monitor: LayoutStabilityMonitor;
  let container: HTMLElement;

  beforeEach(() => {
    monitor = new LayoutStabilityMonitor();
    
    // Create a mock container
    container = document.createElement('div');
    container.className = 'test-container';
    document.body.appendChild(container);
    
    // Reset mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    monitor.stopMonitoring();
    document.body.removeChild(container);
  });

  describe('initialization', () => {
    it('should initialize without errors', () => {
      expect(monitor).toBeInstanceOf(LayoutStabilityMonitor);
    });

    it('should create observers when available', () => {
      expect(mockMutationObserver).toHaveBeenCalled();
      expect(mockResizeObserver).toHaveBeenCalled();
    });
  });

  describe('monitoring', () => {
    it('should start monitoring', () => {
      monitor.startMonitoring(container);
      
      // Should call observe methods
      expect(mockMutationObserver().observe).toHaveBeenCalled();
      expect(mockResizeObserver().observe).toHaveBeenCalled();
    });

    it('should stop monitoring', () => {
      monitor.startMonitoring(container);
      monitor.stopMonitoring();
      
      // Should call disconnect methods
      expect(mockMutationObserver().disconnect).toHaveBeenCalled();
      expect(mockResizeObserver().disconnect).toHaveBeenCalled();
    });

    it('should not start monitoring twice', () => {
      monitor.startMonitoring(container);
      monitor.startMonitoring(container);
      
      // Should only call observe once
      expect(mockMutationObserver().observe).toHaveBeenCalledTimes(1);
    });
  });

  describe('layout stabilization', () => {
    it('should stabilize layout', (done) => {
      // Add some rule items to the container
      const ruleItem = document.createElement('div');
      ruleItem.className = 'rule-item';
      container.appendChild(ruleItem);

      monitor.stabilizeLayout(container);

      // Wait for requestAnimationFrame
      setTimeout(() => {
        expect(ruleItem.style.minHeight).toBe('60px');
        expect(ruleItem.style.boxSizing).toBe('border-box');
        done();
      }, 20);
    });

    it('should fix scroll containers', (done) => {
      const scrollContainer = document.createElement('div');
      scrollContainer.setAttribute('data-scroll-container', '');
      container.appendChild(scrollContainer);

      monitor.stabilizeLayout(container);

      setTimeout(() => {
        expect(scrollContainer.style.maxHeight).toBe('400px');
        expect(scrollContainer.style.overflowY).toBe('auto');
        expect(scrollContainer.style.overscrollBehavior).toBe('contain');
        done();
      }, 20);
    });

    it('should fix popover layers', (done) => {
      const popover = document.createElement('div');
      popover.setAttribute('data-popover', '');
      container.appendChild(popover);

      monitor.stabilizeLayout(container);

      setTimeout(() => {
        expect(popover.style.transform).toContain('translateZ(0)');
        expect(popover.style.backfaceVisibility).toBe('hidden');
        done();
      }, 20);
    });

    it('should not stabilize if already stabilizing', () => {
      const callback = jest.fn();
      monitor.onStabilized(callback);

      monitor.stabilizeLayout(container);
      monitor.stabilizeLayout(container); // Second call should be ignored

      setTimeout(() => {
        expect(callback).toHaveBeenCalledTimes(1);
      }, 20);
    });
  });

  describe('callbacks', () => {
    it('should register and call stabilization callbacks', (done) => {
      const callback = jest.fn();
      const unsubscribe = monitor.onStabilized(callback);

      monitor.stabilizeLayout(container);

      setTimeout(() => {
        expect(callback).toHaveBeenCalled();
        
        // Test unsubscribe
        unsubscribe();
        monitor.stabilizeLayout(container);
        
        setTimeout(() => {
          expect(callback).toHaveBeenCalledTimes(1);
          done();
        }, 20);
      }, 20);
    });

    it('should handle callback errors gracefully', (done) => {
      const errorCallback = jest.fn(() => {
        throw new Error('Test error');
      });
      const normalCallback = jest.fn();

      monitor.onStabilized(errorCallback);
      monitor.onStabilized(normalCallback);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      monitor.stabilizeLayout(container);

      setTimeout(() => {
        expect(errorCallback).toHaveBeenCalled();
        expect(normalCallback).toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith('Stabilization callback error:', expect.any(Error));
        
        consoleSpy.mockRestore();
        done();
      }, 20);
    });
  });

  describe('stability report', () => {
    it('should generate stability report', () => {
      const report = monitor.getStabilityReport();
      
      expect(report).toHaveProperty('cumulativeLayoutShift');
      expect(report).toHaveProperty('totalIssues');
      expect(report).toHaveProperty('issuesByType');
      expect(report).toHaveProperty('issuesBySeverity');
      expect(report).toHaveProperty('recommendations');
    });

    it('should clear issues', () => {
      monitor.clearIssues();
      const report = monitor.getStabilityReport();
      
      expect(report.totalIssues).toBe(0);
      expect(report.cumulativeLayoutShift).toBe(0);
    });
  });

  describe('manual checks', () => {
    it('should perform manual check', () => {
      const spy = jest.spyOn(monitor as any, 'performInitialCheck');
      monitor.checkNow(container);
      
      expect(spy).toHaveBeenCalledWith(container);
    });

    it('should use document.body as default container', () => {
      const spy = jest.spyOn(monitor as any, 'performInitialCheck');
      monitor.checkNow();
      
      expect(spy).toHaveBeenCalledWith(document.body);
    });
  });

  describe('state tracking', () => {
    it('should track stabilization state', () => {
      expect(monitor.isStabilizingLayout()).toBe(false);
      
      monitor.stabilizeLayout(container);
      expect(monitor.isStabilizingLayout()).toBe(true);
      
      setTimeout(() => {
        expect(monitor.isStabilizingLayout()).toBe(false);
      }, 20);
    });
  });

  describe('element checking', () => {
    it('should detect horizontal overflow', () => {
      // Create an element with overflow
      const overflowElement = document.createElement('div');
      overflowElement.style.width = '100px';
      overflowElement.style.overflow = 'visible';
      
      // Mock scrollWidth to be larger than clientWidth
      Object.defineProperty(overflowElement, 'scrollWidth', {
        value: 200,
        configurable: true
      });
      Object.defineProperty(overflowElement, 'clientWidth', {
        value: 100,
        configurable: true
      });
      
      container.appendChild(overflowElement);
      
      monitor.checkNow(container);
      const report = monitor.getStabilityReport();
      
      expect(report.totalIssues).toBeGreaterThan(0);
    });
  });
});