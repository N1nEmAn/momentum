/**
 * 可访问性工具
 * 提供键盘导航、屏幕阅读器支持和其他可访问性功能
 */

interface FocusableElement extends HTMLElement {
  tabIndex: number;
}

interface KeyboardNavigationOptions {
  container: HTMLElement;
  selector?: string;
  loop?: boolean;
  onNavigate?: (element: HTMLElement, index: number) => void;
}

interface ScreenReaderAnnouncement {
  message: string;
  priority?: 'polite' | 'assertive';
  delay?: number;
}

export class AccessibilityManager {
  private static instance: AccessibilityManager;
  private announcer: HTMLElement | null = null;
  private focusHistory: HTMLElement[] = [];
  private keyboardNavigationHandlers = new Map<HTMLElement, (event: KeyboardEvent) => void>();

  constructor() {
    this.setupScreenReaderAnnouncer();
    this.setupGlobalKeyboardHandlers();
  }

  static getInstance(): AccessibilityManager {
    if (!AccessibilityManager.instance) {
      AccessibilityManager.instance = new AccessibilityManager();
    }
    return AccessibilityManager.instance;
  }

  /**
   * 为屏幕阅读器宣布消息
   */
  announce(announcement: ScreenReaderAnnouncement): void {
    if (!this.announcer) return;

    const { message, priority = 'polite', delay = 0 } = announcement;

    const announceMessage = () => {
      if (this.announcer) {
        this.announcer.setAttribute('aria-live', priority);
        this.announcer.textContent = message;
        
        // 清除消息，以便相同消息可以再次宣布
        setTimeout(() => {
          if (this.announcer) {
            this.announcer.textContent = '';
          }
        }, 1000);
      }
    };

    if (delay > 0) {
      setTimeout(announceMessage, delay);
    } else {
      announceMessage();
    }
  }

  /**
   * 设置键盘导航
   */
  setupKeyboardNavigation(options: KeyboardNavigationOptions): () => void {
    const { container, selector = '[tabindex], button, input, select, textarea, a[href]', loop = true, onNavigate } = options;
    
    const handler = (event: KeyboardEvent) => {
      const focusableElements = this.getFocusableElements(container, selector);
      if (focusableElements.length === 0) return;

      const currentIndex = focusableElements.findIndex(el => el === document.activeElement);
      let nextIndex = currentIndex;

      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          event.preventDefault();
          nextIndex = currentIndex + 1;
          if (nextIndex >= focusableElements.length) {
            nextIndex = loop ? 0 : focusableElements.length - 1;
          }
          break;

        case 'ArrowUp':
        case 'ArrowLeft':
          event.preventDefault();
          nextIndex = currentIndex - 1;
          if (nextIndex < 0) {
            nextIndex = loop ? focusableElements.length - 1 : 0;
          }
          break;

        case 'Home':
          event.preventDefault();
          nextIndex = 0;
          break;

        case 'End':
          event.preventDefault();
          nextIndex = focusableElements.length - 1;
          break;

        default:
          return;
      }

      if (nextIndex !== currentIndex) {
        const nextElement = focusableElements[nextIndex];
        this.focusElement(nextElement);
        onNavigate?.(nextElement, nextIndex);
      }
    };

    container.addEventListener('keydown', handler);
    this.keyboardNavigationHandlers.set(container, handler);

    // 返回清理函数
    return () => {
      container.removeEventListener('keydown', handler);
      this.keyboardNavigationHandlers.delete(container);
    };
  }

  /**
   * 安全地聚焦元素
   */
  focusElement(element: HTMLElement, options: { preventScroll?: boolean; restoreFocus?: boolean } = {}): void {
    const { preventScroll = false, restoreFocus = false } = options;

    if (restoreFocus && document.activeElement instanceof HTMLElement) {
      this.focusHistory.push(document.activeElement);
    }

    try {
      element.focus({ preventScroll });
      
      // 确保元素可见
      if (!preventScroll) {
        element.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'nearest',
          inline: 'nearest'
        });
      }
    } catch (error) {
      console.warn('聚焦元素失败:', error);
    }
  }

  /**
   * 恢复之前的焦点
   */
  restoreFocus(): void {
    const previousElement = this.focusHistory.pop();
    if (previousElement && document.contains(previousElement)) {
      this.focusElement(previousElement);
    }
  }

  /**
   * 创建焦点陷阱
   */
  createFocusTrap(container: HTMLElement): () => void {
    const focusableElements = this.getFocusableElements(container);
    if (focusableElements.length === 0) return () => {};

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTabKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      if (event.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          event.preventDefault();
          this.focusElement(lastElement);
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          event.preventDefault();
          this.focusElement(firstElement);
        }
      }
    };

    // 聚焦第一个元素
    this.focusElement(firstElement, { restoreFocus: true });

    container.addEventListener('keydown', handleTabKey);

    // 返回清理函数
    return () => {
      container.removeEventListener('keydown', handleTabKey);
      this.restoreFocus();
    };
  }

  /**
   * 设置ARIA属性
   */
  setAriaAttributes(element: HTMLElement, attributes: Record<string, string | boolean | number>): void {
    for (const [key, value] of Object.entries(attributes)) {
      const ariaKey = key.startsWith('aria-') ? key : `aria-${key}`;
      element.setAttribute(ariaKey, String(value));
    }
  }

  /**
   * 创建可访问的按钮
   */
  makeButtonAccessible(button: HTMLElement, options: {
    label?: string;
    description?: string;
    expanded?: boolean;
    pressed?: boolean;
    disabled?: boolean;
  } = {}): void {
    const { label, description, expanded, pressed, disabled } = options;

    // 确保按钮有正确的角色
    if (!button.getAttribute('role') && button.tagName !== 'BUTTON') {
      button.setAttribute('role', 'button');
    }

    // 确保按钮可聚焦
    if (!button.hasAttribute('tabindex') && button.tagName !== 'BUTTON') {
      button.setAttribute('tabindex', '0');
    }

    // 设置标签
    if (label) {
      button.setAttribute('aria-label', label);
    }

    // 设置描述
    if (description) {
      const descId = `desc-${Math.random().toString(36).substr(2, 9)}`;
      const descElement = document.createElement('span');
      descElement.id = descId;
      descElement.textContent = description;
      descElement.className = 'sr-only';
      button.appendChild(descElement);
      button.setAttribute('aria-describedby', descId);
    }

    // 设置状态
    if (typeof expanded === 'boolean') {
      button.setAttribute('aria-expanded', String(expanded));
    }

    if (typeof pressed === 'boolean') {
      button.setAttribute('aria-pressed', String(pressed));
    }

    if (typeof disabled === 'boolean') {
      button.setAttribute('aria-disabled', String(disabled));
      if (disabled) {
        button.setAttribute('tabindex', '-1');
      }
    }

    // 添加键盘支持
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (!disabled) {
          button.click();
        }
      }
    };

    button.addEventListener('keydown', handleKeyDown);
  }

  /**
   * 创建可访问的对话框
   */
  makeDialogAccessible(dialog: HTMLElement, options: {
    title?: string;
    description?: string;
    modal?: boolean;
  } = {}): () => void {
    const { title, description, modal = true } = options;

    // 设置对话框角色和属性
    dialog.setAttribute('role', 'dialog');
    if (modal) {
      dialog.setAttribute('aria-modal', 'true');
    }

    // 设置标题
    if (title) {
      const titleId = `dialog-title-${Math.random().toString(36).substr(2, 9)}`;
      const titleElement = dialog.querySelector('h1, h2, h3, h4, h5, h6') as HTMLElement;
      if (titleElement) {
        titleElement.id = titleId;
        dialog.setAttribute('aria-labelledby', titleId);
      }
    }

    // 设置描述
    if (description) {
      const descId = `dialog-desc-${Math.random().toString(36).substr(2, 9)}`;
      const descElement = document.createElement('p');
      descElement.id = descId;
      descElement.textContent = description;
      descElement.className = 'sr-only';
      dialog.appendChild(descElement);
      dialog.setAttribute('aria-describedby', descId);
    }

    // 创建焦点陷阱
    const releaseFocusTrap = this.createFocusTrap(dialog);

    // 处理Escape键
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        // 触发关闭事件
        dialog.dispatchEvent(new CustomEvent('close'));
      }
    };

    document.addEventListener('keydown', handleEscape);

    // 宣布对话框打开
    this.announce({
      message: `对话框已打开${title ? `: ${title}` : ''}`,
      priority: 'assertive'
    });

    // 返回清理函数
    return () => {
      document.removeEventListener('keydown', handleEscape);
      releaseFocusTrap();
    };
  }

  /**
   * 创建可访问的列表
   */
  makeListAccessible(list: HTMLElement, options: {
    multiselectable?: boolean;
    orientation?: 'vertical' | 'horizontal';
  } = {}): void {
    const { multiselectable = false, orientation = 'vertical' } = options;

    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-multiselectable', String(multiselectable));
    list.setAttribute('aria-orientation', orientation);

    // 为列表项设置角色和属性
    const items = list.querySelectorAll('li, [role="option"]');
    items.forEach((item, index) => {
      const element = item as HTMLElement;
      element.setAttribute('role', 'option');
      element.setAttribute('aria-posinset', String(index + 1));
      element.setAttribute('aria-setsize', String(items.length));
      
      if (!element.hasAttribute('tabindex')) {
        element.setAttribute('tabindex', index === 0 ? '0' : '-1');
      }
    });

    // 设置键盘导航
    this.setupKeyboardNavigation({
      container: list,
      selector: '[role="option"]',
      onNavigate: (element, index) => {
        // 更新tabindex
        items.forEach((item, i) => {
          (item as HTMLElement).setAttribute('tabindex', i === index ? '0' : '-1');
        });
      }
    });
  }

  /**
   * 检查颜色对比度
   */
  checkColorContrast(foreground: string, background: string): {
    ratio: number;
    wcagAA: boolean;
    wcagAAA: boolean;
  } {
    const getLuminance = (color: string): number => {
      // 简化的亮度计算，实际应用中应使用更精确的算法
      const rgb = this.hexToRgb(color);
      if (!rgb) return 0;

      const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(c => {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });

      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    const l1 = getLuminance(foreground);
    const l2 = getLuminance(background);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

    return {
      ratio,
      wcagAA: ratio >= 4.5,
      wcagAAA: ratio >= 7
    };
  }

  /**
   * 获取可聚焦元素
   */
  private getFocusableElements(container: HTMLElement, selector?: string): HTMLElement[] {
    const defaultSelector = [
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable="true"]'
    ].join(', ');

    const elements = container.querySelectorAll(selector || defaultSelector);
    return Array.from(elements).filter(el => {
      const element = el as HTMLElement;
      return element.offsetParent !== null && // 元素可见
             !element.hasAttribute('aria-hidden') &&
             element.getAttribute('aria-disabled') !== 'true';
    }) as HTMLElement[];
  }

  /**
   * 设置屏幕阅读器宣布器
   */
  private setupScreenReaderAnnouncer(): void {
    this.announcer = document.createElement('div');
    this.announcer.setAttribute('aria-live', 'polite');
    this.announcer.setAttribute('aria-atomic', 'true');
    this.announcer.className = 'sr-only';
    this.announcer.style.cssText = `
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      padding: 0 !important;
      margin: -1px !important;
      overflow: hidden !important;
      clip: rect(0, 0, 0, 0) !important;
      white-space: nowrap !important;
      border: 0 !important;
    `;
    document.body.appendChild(this.announcer);
  }

  /**
   * 设置全局键盘处理器
   */
  private setupGlobalKeyboardHandlers(): void {
    // 跳过链接功能
    document.addEventListener('keydown', (event) => {
      if (event.altKey && event.key === 's') {
        event.preventDefault();
        this.skipToMainContent();
      }
    });
  }

  /**
   * 跳转到主内容
   */
  private skipToMainContent(): void {
    const mainContent = document.querySelector('main, [role="main"], #main-content');
    if (mainContent instanceof HTMLElement) {
      this.focusElement(mainContent);
      this.announce({
        message: '已跳转到主内容',
        priority: 'assertive'
      });
    }
  }

  /**
   * 十六进制颜色转RGB
   */
  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }
}

/**
 * React Hook for accessibility
 */
export function useAccessibility() {
  const manager = AccessibilityManager.getInstance();

  const announce = React.useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    manager.announce({ message, priority });
  }, [manager]);

  const setupKeyboardNavigation = React.useCallback((
    containerRef: React.RefObject<HTMLElement>,
    options: Omit<KeyboardNavigationOptions, 'container'> = {}
  ) => {
    React.useEffect(() => {
      if (!containerRef.current) return;
      
      return manager.setupKeyboardNavigation({
        container: containerRef.current,
        ...options
      });
    }, [containerRef, options]);
  }, [manager]);

  const createFocusTrap = React.useCallback((containerRef: React.RefObject<HTMLElement>) => {
    React.useEffect(() => {
      if (!containerRef.current) return;
      
      return manager.createFocusTrap(containerRef.current);
    }, [containerRef]);
  }, [manager]);

  return {
    announce,
    setupKeyboardNavigation,
    createFocusTrap,
    focusElement: manager.focusElement.bind(manager),
    restoreFocus: manager.restoreFocus.bind(manager),
    makeButtonAccessible: manager.makeButtonAccessible.bind(manager),
    makeDialogAccessible: manager.makeDialogAccessible.bind(manager),
    makeListAccessible: manager.makeListAccessible.bind(manager),
    checkColorContrast: manager.checkColorContrast.bind(manager)
  };
}

// 创建全局实例
export const accessibilityManager = AccessibilityManager.getInstance();

// 添加全局CSS类
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    .sr-only {
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      padding: 0 !important;
      margin: -1px !important;
      overflow: hidden !important;
      clip: rect(0, 0, 0, 0) !important;
      white-space: nowrap !important;
      border: 0 !important;
    }
    
    .focus-visible {
      outline: 2px solid #3b82f6 !important;
      outline-offset: 2px !important;
    }
    
    @media (prefers-reduced-motion: reduce) {
      * {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }
    
    @media (prefers-high-contrast: active) {
      .bg-primary-500 {
        background-color: ButtonText !important;
      }
      
      .text-primary-500 {
        color: ButtonText !important;
      }
      
      .border-primary-500 {
        border-color: ButtonText !important;
      }
    }
  `;
  document.head.appendChild(style);
}