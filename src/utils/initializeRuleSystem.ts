/**
 * 初始化规则系统
 * 确保所有服务正确启动和配置
 */

import { exceptionRuleManager } from '../services/ExceptionRuleManager';
import { systemHealthService } from '../services/SystemHealthService';
import { dataIntegrityChecker } from '../services/DataIntegrityChecker';

export async function initializeRuleSystem(): Promise<{
  success: boolean;
  message: string;
  healthReport?: any;
}> {
  console.log('🚀 开始初始化规则系统...');

  try {
    // 1. 初始化主管理器
    console.log('1️⃣ 初始化主管理器...');
    await exceptionRuleManager.initialize();

    // 2. 运行健康检查
    console.log('2️⃣ 运行系统健康检查...');
    const healthReport = await systemHealthService.performHealthCheck();
    
    console.log(`健康检查结果: ${healthReport.status} (${healthReport.score}/100)`);
    
    if (healthReport.status === 'critical') {
      console.warn('⚠️ 系统存在严重问题:', healthReport.recommendations);
    }

    // 3. 数据完整性检查
    console.log('3️⃣ 检查数据完整性...');
    const integrityReport = await dataIntegrityChecker.checkRuleDataIntegrity();
    
    if (integrityReport.issues.length > 0) {
      console.log(`发现 ${integrityReport.issues.length} 个数据问题`);
      
      // 自动修复
      const autoFixableIssues = integrityReport.issues.filter(issue => issue.autoFixable);
      if (autoFixableIssues.length > 0) {
        console.log(`正在自动修复 ${autoFixableIssues.length} 个问题...`);
        const fixResults = await dataIntegrityChecker.autoFixIssues(autoFixableIssues);
        const successCount = fixResults.filter(r => r.success).length;
        console.log(`✅ 已修复 ${successCount} 个问题`);
      }
    }

    console.log('🎉 规则系统初始化完成！');
    
    return {
      success: true,
      message: '规则系统初始化成功',
      healthReport
    };

  } catch (error) {
    console.error('❌ 规则系统初始化失败:', error);
    
    return {
      success: false,
      message: `初始化失败: ${error instanceof Error ? error.message : '未知错误'}`
    };
  }
}

// 自动初始化（如果在浏览器环境中）
if (typeof window !== 'undefined') {
  // 延迟初始化，确保所有模块都已加载
  setTimeout(() => {
    initializeRuleSystem().then(result => {
      if (result.success) {
        console.log('✅ 规则系统自动初始化成功');
      } else {
        console.error('❌ 规则系统自动初始化失败:', result.message);
      }
    });
  }, 1000);

  // 暴露到全局作用域以便手动调用
  (window as any).initializeRuleSystem = initializeRuleSystem;
}