/**
 * 优化的规则项组件
 * 使用 React.memo 避免不必要的重渲染
 */

import React, { memo } from 'react';
import { ExceptionRule, ExceptionRuleType } from '../types';
import { Edit2, Trash2, BarChart3, Clock, Loader2 } from 'lucide-react';

interface RuleItemProps {
  rule: ExceptionRule;
  isOptimistic: boolean;
  onEdit: (rule: ExceptionRule) => void;
  onDelete: (rule: ExceptionRule) => void;
  onSelect?: (rule: ExceptionRule) => void; // 新增 onSelect prop
}

const RuleItem: React.FC<RuleItemProps> = memo(({ 
  rule, 
  isOptimistic, 
  onEdit, 
  onDelete, 
  onSelect 
}) => {
  const getRuleTypeDisplayName = (type: ExceptionRuleType): string => {
    return type === ExceptionRuleType.PAUSE_ONLY ? '仅暂停' : '仅提前完成';
  };

  const getRuleTypeColor = (type: ExceptionRuleType): string => {
    return type === ExceptionRuleType.PAUSE_ONLY 
      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300'
      : 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300';
  };

  const formatLastUsed = (date?: Date): string => {
    if (!date) return '从未使用';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return '今天';
    if (diffDays === 1) return '昨天';
    if (diffDays < 7) return `${diffDays}天前`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前`;
    return `${Math.floor(diffDays / 30)}个月前`;
  };

  const handleSelect = () => {
    if (onSelect) {
      onSelect(rule);
    }
  };

  return (
    <div 
      className={`bg-gray-50 dark:bg-gray-700/50 rounded-2xl p-4 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${onSelect ? 'cursor-pointer' : ''}`}
      onClick={handleSelect}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white flex items-center space-x-2">
              <span>{rule.name}</span>
              {isOptimistic && (
                <Loader2 size={14} className="animate-spin text-primary-500" />
              )}
            </h3>
            <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getRuleTypeColor(rule.type)}`}>
              {getRuleTypeDisplayName(rule.type)}
            </span>
          </div>
          
          {rule.description && (
            <p className="text-gray-600 dark:text-gray-400 mb-3">
              {rule.description}
            </p>
          )}
          
          <div className="flex items-center space-x-6 text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center space-x-1">
              <BarChart3 size={14} />
              <span>使用 {rule.usageCount} 次</span>
            </div>
            <div className="flex items-center space-x-1">
              <Clock size={14} />
              <span>{formatLastUsed(rule.lastUsedAt)}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(rule); }}
            className="p-2 rounded-xl bg-white dark:bg-gray-600 hover:bg-gray-50 dark:hover:bg-gray-500 text-gray-600 dark:text-gray-300 transition-colors touch-target"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(rule); }}
            className="p-2 rounded-xl bg-white dark:bg-gray-600 hover:bg-red-50 dark:hover:bg-red-500/20 text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 transition-colors touch-target"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
});

RuleItem.displayName = 'RuleItem';

export default RuleItem;