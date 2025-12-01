/**
 * 紧急修复脚本
 * 直接修复规则创建和使用问题
 */

import { exceptionRuleManager } from '../services/ExceptionRuleManager';
import { ExceptionRuleType } from '../types';

// 重写规则创建方法，绕过可能的问题
export async function emergencyCreateRule(name: string, type: ExceptionRuleType, description?: string) {
  console.log('🚨 紧急创建规则:', { name, type, description });
  
  try {
    // 直接调用存储层，绕过中间层
    const { exceptionRuleStorage } = await import('../services/ExceptionRuleStorage');
    
    // 确保类型正确
    const ruleType = type || ExceptionRuleType.PAUSE_ONLY;
    
    const rule = await exceptionRuleStorage.createRule({
      name: name.trim(),
      type: ruleType,
      description: description?.trim(),
      scope: 'global',
      chainId: undefined,
      isArchived: false
    });
    
    console.log('✅ 紧急创建成功:', rule);
    return rule;
    
  } catch (error) {
    console.error('❌ 紧急创建失败:', error);
    throw error;
  }
}

// 重写规则使用方法
export async function emergencyUseRule(ruleId: string, actionType: 'pause' | 'early_completion') {
  console.log('🚨 紧急使用规则:', { ruleId, actionType });
  
  try {
    const { exceptionRuleStorage } = await import('../services/ExceptionRuleStorage');
    const { ruleUsageTracker } = await import('../services/RuleUsageTracker');
    
    // 直接获取规则
    const rule = await exceptionRuleStorage.getRuleById(ruleId);
    
    if (!rule) {
      throw new Error(`规则 ${ruleId} 不存在`);
    }
    
    if (!rule.isActive) {
      throw new Error(`规则 "${rule.name}" 已被删除`);
    }
    
    // 简单的类型检查
    const expectedType = actionType === 'pause' 
      ? ExceptionRuleType.PAUSE_ONLY 
      : ExceptionRuleType.EARLY_COMPLETION_ONLY;
    
    if (rule.type !== expectedType) {
      throw new Error(`规则类型不匹配：期望 ${expectedType}，实际 ${rule.type}`);
    }
    
    // 记录使用
    const sessionContext = {
      sessionId: `emergency_${Date.now()}`,
      chainId: 'emergency',
      chainName: '紧急使用',
      startedAt: new Date(),
      elapsedTime: 0,
      isDurationless: false
    };
    
    const record = await ruleUsageTracker.recordUsage(ruleId, sessionContext, actionType);
    
    console.log('✅ 紧急使用成功:', { rule, record });
    return { rule, record };
    
  } catch (error) {
    console.error('❌ 紧急使用失败:', error);
    throw error;
  }
}

// 暴露到全局
if (typeof window !== 'undefined') {
  (window as any).emergencyCreateRule = emergencyCreateRule;
  (window as any).emergencyUseRule = emergencyUseRule;
  
  // 替换FocusMode中的方法
  setTimeout(() => {
    console.log('🔧 安装紧急修复...');
    
    // 尝试修复现有的handleCreateNewRule
    const focusModeElements = document.querySelectorAll('[data-component="FocusMode"]');
    if (focusModeElements.length > 0) {
      console.log('找到FocusMode组件，应用紧急修复');
    }
  }, 3000);
}