/**
 * 修复规则ID映射问题
 */

import { exceptionRuleStorage } from '../services/ExceptionRuleStorage';

export async function checkRuleIds() {
  console.log('🔍 检查规则ID映射...');
  
  try {
    const rules = await exceptionRuleStorage.getRules();
    console.log('📋 所有规则:');
    
    rules.forEach((rule, index) => {
      console.log(`${index + 1}. ID: ${rule.id}, 名称: ${rule.name}, 类型: ${rule.type}, 激活: ${rule.isActive}`);
    });
    
    console.log(`\n总计: ${rules.length} 个规则`);
    console.log(`激活: ${rules.filter(r => r.isActive).length} 个规则`);
    
    return rules;
    
  } catch (error) {
    console.error('❌ 检查规则失败:', error);
    return [];
  }
}

export async function testRuleUsage() {
  console.log('🧪 测试规则使用...');
  
  try {
    const rules = await exceptionRuleStorage.getRules();
    const activeRules = rules.filter(r => r.isActive);
    
    if (activeRules.length === 0) {
      console.log('⚠️ 没有激活的规则');
      return;
    }
    
    const testRule = activeRules[0];
    console.log('🎯 测试规则:', { id: testRule.id, name: testRule.name, type: testRule.type });
    
    // 测试规则验证
    const { ruleStateManager } = await import('../services/RuleStateManager');
    const validation = await ruleStateManager.validateRuleId(testRule.id);
    
    console.log('✅ 验证结果:', validation);
    
    if (!validation.isValid) {
      console.error('❌ 规则验证失败，尝试修复...');
      
      // 尝试同步状态
      await ruleStateManager.syncRuleStates();
      
      // 重新验证
      const newValidation = await ruleStateManager.validateRuleId(testRule.id);
      console.log('🔄 修复后验证结果:', newValidation);
    }
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

export async function fixRuleIdMappings() {
  console.log('🔧 修复规则ID映射...');
  
  try {
    const { ruleStateManager } = await import('../services/RuleStateManager');
    
    // 强制同步规则状态
    await ruleStateManager.syncRuleStates();
    
    // 清理过期状态
    ruleStateManager.cleanupExpiredStates();
    
    console.log('✅ 规则ID映射已修复');
    
    // 验证修复结果
    await testRuleUsage();
    
  } catch (error) {
    console.error('❌ 修复失败:', error);
  }
}

// 暴露到全局
if (typeof window !== 'undefined') {
  (window as any).checkRuleIds = checkRuleIds;
  (window as any).testRuleUsage = testRuleUsage;
  (window as any).fixRuleIdMappings = fixRuleIdMappings;
}

// 自动运行检查
setTimeout(() => {
  checkRuleIds().then(() => {
    console.log('💡 提示: 使用 fixRuleIdMappings() 来修复ID映射问题');
  });
}, 3000);