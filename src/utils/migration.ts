
import { exceptionRuleManager } from '../services/ExceptionRuleManager';

const OLD_DEFAULT_RULES = ['喝水', '紧急情况', '任务完成', '特殊情况'];

export const runMigration = async () => {
  try {
    console.log('Running migration...');
    const allRules = await exceptionRuleManager.getAllRules();
    const rulesToDelete = allRules.filter(rule => OLD_DEFAULT_RULES.includes(rule.name));

    if (rulesToDelete.length > 0) {
      console.log('Found old default rules to delete:', rulesToDelete.map(r => r.name));
      for (const rule of rulesToDelete) {
        await exceptionRuleManager.deleteRule(rule.id);
      }
      console.log('Old default rules deleted successfully.');
    }

  } catch (error) {
    console.error('Error running migration:', error);
  }
};
