/**
 * 终极修复方案
 * 完全绕过现有的规则选择机制
 */

import { ExceptionRuleType } from '../types';

export class UltimateFix {
  private static instance: UltimateFix;
  
  static getInstance(): UltimateFix {
    if (!UltimateFix.instance) {
      UltimateFix.instance = new UltimateFix();
    }
    return UltimateFix.instance;
  }

  async getAllRules() {
    try {
      const { exceptionRuleStorage } = await import('../services/ExceptionRuleStorage');
      const rules = await exceptionRuleStorage.getRules();
      return rules.filter(r => r.isActive);
    } catch (error) {
      console.error('获取规则失败:', error);
      return [];
    }
  }

  async useRuleDirectly(ruleId: string, actionType: 'pause' | 'early_completion') {
    console.log('🚀 直接使用规则:', { ruleId, actionType });
    
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
      
      // 验证类型匹配
      const expectedType = actionType === 'pause' 
        ? ExceptionRuleType.PAUSE_ONLY 
        : ExceptionRuleType.EARLY_COMPLETION_ONLY;
      
      if (rule.type !== expectedType) {
        throw new Error(`规则类型不匹配：期望 ${expectedType}，实际 ${rule.type}`);
      }
      
      // 创建会话上下文
      const sessionContext = {
        sessionId: `ultimate_${Date.now()}`,
        chainId: 'current_chain',
        chainName: '当前任务',
        startedAt: new Date(),
        elapsedTime: 0,
        isDurationless: false
      };
      
      // 记录使用
      const record = await ruleUsageTracker.recordUsage(ruleId, sessionContext, actionType);
      
      console.log('✅ 规则使用成功:', { rule: rule.name, record });
      
      // 触发UI更新
      this.notifySuccess(rule, actionType);
      
      return { rule, record };
      
    } catch (error) {
      console.error('❌ 直接使用规则失败:', error);
      this.notifyError(error);
      throw error;
    }
  }

  async createRuleDirectly(name: string, type: ExceptionRuleType, description?: string) {
    console.log('🚀 直接创建规则:', { name, type, description });
    
    try {
      const { exceptionRuleStorage } = await import('../services/ExceptionRuleStorage');
      
      const rule = await exceptionRuleStorage.createRule({
        name: name.trim(),
        type,
        description: description?.trim(),
        scope: 'global',
        chainId: undefined,
        isArchived: false
      });
      
      console.log('✅ 规则创建成功:', rule);
      
      // 触发UI更新
      this.notifyRuleCreated(rule);
      
      return rule;
      
    } catch (error) {
      console.error('❌ 直接创建规则失败:', error);
      this.notifyError(error);
      throw error;
    }
  }

  private notifySuccess(rule: any, actionType: string) {
    // 尝试触发成功通知
    try {
      const event = new CustomEvent('ruleUsageSuccess', {
        detail: { rule, actionType }
      });
      window.dispatchEvent(event);
    } catch (error) {
      console.log('通知发送失败:', error);
    }
  }

  private notifyError(error: any) {
    // 尝试触发错误通知
    try {
      const event = new CustomEvent('ruleUsageError', {
        detail: { error }
      });
      window.dispatchEvent(event);
    } catch (e) {
      console.log('错误通知发送失败:', e);
    }
  }

  private notifyRuleCreated(rule: any) {
    // 尝试触发规则创建通知
    try {
      const event = new CustomEvent('ruleCreated', {
        detail: { rule }
      });
      window.dispatchEvent(event);
    } catch (error) {
      console.log('创建通知发送失败:', error);
    }
  }

  async showRuleSelector(actionType: 'pause' | 'early_completion') {
    console.log('🎯 显示规则选择器:', actionType);
    
    const rules = await this.getAllRules();
    const filteredRules = rules.filter(rule => {
      const expectedType = actionType === 'pause' 
        ? ExceptionRuleType.PAUSE_ONLY 
        : ExceptionRuleType.EARLY_COMPLETION_ONLY;
      return rule.type === expectedType;
    });
    
    console.log('可用规则:', filteredRules.map(r => ({ id: r.id, name: r.name })));
    
    if (filteredRules.length === 0) {
      console.log('没有可用规则，创建新规则...');
      const ruleName = prompt(`请输入${actionType === 'pause' ? '暂停' : '提前完成'}规则名称:`);
      if (ruleName) {
        const ruleType = actionType === 'pause' 
          ? ExceptionRuleType.PAUSE_ONLY 
          : ExceptionRuleType.EARLY_COMPLETION_ONLY;
        const newRule = await this.createRuleDirectly(ruleName, ruleType);
        await this.useRuleDirectly(newRule.id, actionType);
      }
    } else if (filteredRules.length === 1) {
      // 只有一个规则，直接使用
      await this.useRuleDirectly(filteredRules[0].id, actionType);
    } else {
      // 多个规则，让用户选择
      const ruleNames = filteredRules.map((rule, index) => `${index + 1}. ${rule.name}`).join('\n');
      const choice = prompt(`选择规则 (输入数字):\n${ruleNames}`);
      const ruleIndex = parseInt(choice || '1') - 1;
      
      if (ruleIndex >= 0 && ruleIndex < filteredRules.length) {
        await this.useRuleDirectly(filteredRules[ruleIndex].id, actionType);
      }
    }
  }
}

// 暴露到全局
if (typeof window !== 'undefined') {
  const ultimateFix = UltimateFix.getInstance();
  
  (window as any).ultimateFix = ultimateFix;
  (window as any).useRuleDirectly = (ruleId: string, actionType: string) => 
    ultimateFix.useRuleDirectly(ruleId, actionType as any);
  (window as any).createRuleDirectly = (name: string, type: string, description?: string) => 
    ultimateFix.createRuleDirectly(name, type as any, description);
  (window as any).showRuleSelector = (actionType: string) => 
    ultimateFix.showRuleSelector(actionType as any);
  
  console.log('🚀 终极修复已加载！使用方法:');
  console.log('- showRuleSelector("pause") - 显示暂停规则选择器');
  console.log('- showRuleSelector("early_completion") - 显示提前完成规则选择器');
  console.log('- useRuleDirectly(ruleId, actionType) - 直接使用规则');
  console.log('- createRuleDirectly(name, type, description) - 直接创建规则');
}