/**
 * 调试规则创建问题
 */

import { exceptionRuleManager } from '../services/ExceptionRuleManager';
import { ExceptionRuleType } from '../types';

export async function debugRuleCreation() {
  console.log('🔍 开始调试规则创建...');

  try {
    // 测试基本参数
    const testName = `调试测试_${Date.now()}`;
    const testType = ExceptionRuleType.PAUSE_ONLY;
    
    console.log('测试参数:', { testName, testType, typeOf: typeof testType });
    
    // 直接调用创建方法
    const result = await exceptionRuleManager.createRule(testName, testType, '调试测试规则');
    
    console.log('✅ 规则创建成功:', result);
    
    // 清理
    await exceptionRuleManager.deleteRule(result.rule.id);
    console.log('🧹 测试数据已清理');
    
    return true;
    
  } catch (error) {
    console.error('❌ 规则创建失败:', error);
    return false;
  }
}

// 暴露到全局
if (typeof window !== 'undefined') {
  (window as any).debugRuleCreation = debugRuleCreation;
}