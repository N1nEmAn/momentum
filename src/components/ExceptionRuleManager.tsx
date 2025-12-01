/**
 * 例外规则管理界面组件
 * 提供规则的创建、编辑、删除和分类管理功能
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  ExceptionRule, 
  ExceptionRuleType, 
  ExceptionRuleError,
  ExceptionRuleException 
} from '../types';
import { exceptionRuleManager } from '../services/ExceptionRuleManager';
import { asyncOperationManager } from '../utils/AsyncOperationManager';
import RuleItem from './RuleItem';
import { 
  Plus, 
  Search, 
  Filter, 
  AlertTriangle, 
  Download,
  Settings,
  Loader2
} from 'lucide-react';

interface ExceptionRuleManagerProps {
  onClose: () => void;
  initialFilter?: ExceptionRuleType;
  onRuleSelected?: (rule: ExceptionRule) => void;
}

export const ExceptionRuleManager: React.FC<ExceptionRuleManagerProps> = ({
  onClose,
  initialFilter,
  onRuleSelected
}) => {
  const [rules, setRules] = useState<ExceptionRule[]>([]);
  const [filteredRules, setFilteredRules] = useState<ExceptionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 筛选和搜索状态
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<ExceptionRuleType | 'all'>(initialFilter || 'all');
  const [sortBy, setSortBy] = useState<'name' | 'usage' | 'created' | 'lastUsed'>('usage');
  
  // 编辑状态
  const [editingRule, setEditingRule] = useState<ExceptionRule | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showStats, setShowStats] = useState(false);
  
  // 表单状态
  const [formData, setFormData] = useState({
    name: '',
    type: ExceptionRuleType.PAUSE_ONLY,
    description: ''
  });
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [formWarnings, setFormWarnings] = useState<string[]>([]);
  const [duplicateSuggestions, setDuplicateSuggestions] = useState<string[]>([]);
  
  // 保存状态管理
  const [savingOperations, setSavingOperations] = useState<Set<string>>(new Set());
  const [optimisticUpdates, setOptimisticUpdates] = useState<Map<string, ExceptionRule>>(new Map());

  // 加载规则数据
  useEffect(() => {
    loadRules();
  }, []);

  // 使用 useMemo 优化筛选和排序
  const filteredRules = useMemo(() => {
    let filtered = rules.filter(rule => rule.isActive);
    
    // 按类型筛选
    if (typeFilter !== 'all') {
      filtered = filtered.filter(rule => rule.type === typeFilter);
    }
    
    // 按搜索查询筛选
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(rule => 
        rule.name.toLowerCase().includes(query) ||
        rule.description?.toLowerCase().includes(query)
      );
    }
    
    // 排序
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'usage':
          return b.usageCount - a.usageCount;
        case 'lastUsed':
          if (a.lastUsedAt && b.lastUsedAt) {
            return b.lastUsedAt.getTime() - a.lastUsedAt.getTime();
          }
          if (a.lastUsedAt && !b.lastUsedAt) return -1;
          if (!a.lastUsedAt && b.lastUsedAt) return 1;
          return 0;
        default:
          return 0;
      }
    });
    
    return filtered;
  }, [rules, searchQuery, typeFilter, sortBy]);

  const loadRules = async () => {
    try {
      setLoading(true);
      const allRules = await exceptionRuleManager.getAllRules();
      setRules(allRules);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载规则失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRule = async () => {
    const operationId = `create-rule-${Date.now()}`;
    
    try {
      setFormErrors([]);
      setFormWarnings([]);
      setSavingOperations(prev => new Set(prev).add(operationId));
      
      // 乐观更新：立即创建临时规则显示
      const tempRule: ExceptionRule = {
        id: operationId,
        name: formData.name,
        type: formData.type,
        description: formData.description || undefined,
        scope: 'chain',
        isActive: true,
        usageCount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      setOptimisticUpdates(prev => new Map(prev).set(operationId, tempRule));
      setRules(prev => [...prev, tempRule]);
      
      // 异步执行实际保存操作
      const result = await asyncOperationManager.executeOperation({
        id: operationId,
        operation: () => exceptionRuleManager.createRule(
          formData.name,
          formData.type,
          formData.description || undefined
        ),
        timeout: 3000,
        retryCount: 2,
        onSuccess: (result) => {
          // 替换临时规则为真实规则
          setRules(prev => prev.map(rule => 
            rule.id === operationId ? result.rule : rule
          ));
          setOptimisticUpdates(prev => {
            const newMap = new Map(prev);
            newMap.delete(operationId);
            return newMap;
          });
          
          if (result.warnings.length === 0) {
            setShowCreateForm(false);
            resetForm();
          } else {
            setFormWarnings(result.warnings);
          }
        },
        onError: (error) => {
          // 移除乐观更新的规则
          setRules(prev => prev.filter(rule => rule.id !== operationId));
          setOptimisticUpdates(prev => {
            const newMap = new Map(prev);
            newMap.delete(operationId);
            return newMap;
          });
          
          if (error instanceof ExceptionRuleException) {
            setFormErrors([error.message]);
            
            if (error.type === ExceptionRuleError.DUPLICATE_RULE_NAME) {
              // 获取重复建议
              exceptionRuleManager.getDuplicationSuggestions(formData.name)
                .then(suggestions => {
                  setDuplicateSuggestions(suggestions.nameSuggestions);
                });
            }
          } else {
            setFormErrors(['创建规则失败，请重试']);
          }
        }
      });
      
    } catch (err) {
      // 处理同步错误
      setRules(prev => prev.filter(rule => rule.id !== operationId));
      setOptimisticUpdates(prev => {
        const newMap = new Map(prev);
        newMap.delete(operationId);
        return newMap;
      });
      setFormErrors(['创建规则失败']);
    } finally {
      setSavingOperations(prev => {
        const newSet = new Set(prev);
        newSet.delete(operationId);
        return newSet;
      });
    }
  };

  const handleUpdateRule = async () => {
    if (!editingRule) return;
    
    const operationId = `update-rule-${editingRule.id}-${Date.now()}`;
    const originalRule = editingRule;
    
    try {
      setFormErrors([]);
      setFormWarnings([]);
      setSavingOperations(prev => new Set(prev).add(operationId));
      
      // 乐观更新：立即更新UI
      const updatedRule: ExceptionRule = {
        ...originalRule,
        name: formData.name,
        type: formData.type,
        description: formData.description || undefined,
        updatedAt: new Date()
      };
      
      setRules(prev => prev.map(rule => 
        rule.id === originalRule.id ? updatedRule : rule
      ));
      
      // 异步执行实际更新操作
      await asyncOperationManager.executeOperation({
        id: operationId,
        operation: () => exceptionRuleManager.updateRule(originalRule.id, {
          name: formData.name,
          type: formData.type,
          description: formData.description || undefined
        }),
        timeout: 3000,
        retryCount: 2,
        onSuccess: (result) => {
          if (result.warnings.length === 0) {
            setEditingRule(null);
            resetForm();
          } else {
            setFormWarnings(result.warnings);
          }
        },
        onError: (error) => {
          // 回滚乐观更新
          setRules(prev => prev.map(rule => 
            rule.id === originalRule.id ? originalRule : rule
          ));
          
          if (error instanceof ExceptionRuleException) {
            setFormErrors([error.message]);
          } else {
            setFormErrors(['更新规则失败，请重试']);
          }
        }
      });
      
    } catch (err) {
      // 回滚乐观更新
      setRules(prev => prev.map(rule => 
        rule.id === originalRule.id ? originalRule : rule
      ));
      setFormErrors(['更新规则失败']);
    } finally {
      setSavingOperations(prev => {
        const newSet = new Set(prev);
        newSet.delete(operationId);
        return newSet;
      });
    }
  };

  const handleDeleteRule = useCallback(async (rule: ExceptionRule) => {
    if (!confirm(`确定要删除规则 "${rule.name}" 吗？`)) return;
    
    try {
      await exceptionRuleManager.deleteRule(rule.id);
      await loadRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除规则失败');
    }
  }, []);

  const handleEditRule = useCallback((rule: ExceptionRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      type: rule.type,
      description: rule.description || ''
    });
    setFormErrors([]);
    setFormWarnings([]);
    setDuplicateSuggestions([]);
  }, []);

  const resetForm = () => {
    setFormData({
      name: '',
      type: ExceptionRuleType.PAUSE_ONLY,
      description: ''
    });
    setFormErrors([]);
    setFormWarnings([]);
    setDuplicateSuggestions([]);
  };

  const handleExportRules = async () => {
    try {
      const exportData = await exceptionRuleManager.exportRules(true);
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
        type: 'application/json' 
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `exception-rules-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('导出规则失败');
    }
  };

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

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto"></div>
          <p className="text-center mt-4 text-gray-600 dark:text-gray-400">加载规则中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-x-hidden">
      <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-6xl max-h-[90vh] overflow-hidden shadow-2xl" style={{ maxWidth: 'min(1152px, 100vw - 2rem)' }}>
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-primary-500/20 flex items-center justify-center">
              <Settings className="text-primary-500" size={20} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">例外规则管理</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                管理暂停和提前完成的例外规则
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={handleExportRules}
              className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors flex items-center space-x-2"
            >
              <Download size={16} />
              <span>导出</span>
            </button>
            

            
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-4 py-2 rounded-xl bg-primary-500 hover:bg-primary-600 text-white transition-colors flex items-center space-x-2"
            >
              <Plus size={16} />
              <span>创建链专属规则</span>
            </button>
            
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors"
            >
              关闭
            </button>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mx-6 mt-4 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-2xl flex items-center space-x-3">
            <AlertTriangle className="text-red-500" size={20} />
            <span className="text-red-700 dark:text-red-300">{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-500 hover:text-red-700"
            >
              ×
            </button>
          </div>
        )}

        <div className="flex h-[calc(90vh-120px)]">
          {/* 主内容区域 */}
          <div className="flex-1 flex flex-col">
            {/* 搜索和筛选栏 */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type="text"
                    placeholder="搜索规则名称或描述..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as ExceptionRuleType | 'all')}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="all">所有类型</option>
                  <option value={ExceptionRuleType.PAUSE_ONLY}>仅暂停</option>
                  <option value={ExceptionRuleType.EARLY_COMPLETION_ONLY}>仅提前完成</option>
                </select>
                
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="usage">按使用频率</option>
                  <option value="name">按名称</option>
                  <option value="lastUsed">按最近使用</option>
                </select>
              </div>
            </div>

            {/* 规则列表 */}
            <div className="flex-1 overflow-y-auto p-6">
              {filteredRules.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mx-auto mb-4">
                    <Filter className="text-gray-400" size={24} />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    {searchQuery || typeFilter !== 'all' ? '没有找到匹配的规则' : '还没有规则'}
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    {searchQuery || typeFilter !== 'all' 
                      ? '尝试调整搜索条件或筛选器' 
                      : '创建第一个例外规则来开始使用'}
                  </p>
                  {!searchQuery && typeFilter === 'all' && (
                    <button
                      onClick={() => setShowCreateForm(true)}
                      className="px-6 py-3 rounded-xl bg-primary-500 hover:bg-primary-600 text-white transition-colors"
                    >
                      创建规则
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid gap-4">
                  {filteredRules.map((rule) => (
                    <RuleItem
                      key={rule.id}
                      rule={rule}
                      isOptimistic={optimisticUpdates.has(rule.id)}
                      onEdit={handleEditRule}
                      onDelete={handleDeleteRule}
                      onSelect={onRuleSelected}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 创建/编辑规则表单 */}
        {(showCreateForm || editingRule) && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-md p-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
                {editingRule ? '编辑规则' : '创建新规则'}
              </h3>
              
              {/* 错误和警告提示 */}
              {formErrors.length > 0 && (
                <div className="mb-4 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-2xl">
                  {formErrors.map((error, index) => (
                    <div key={index} className="flex items-center space-x-2 text-red-700 dark:text-red-300">
                      <AlertTriangle size={16} />
                      <span>{error}</span>
                    </div>
                  ))}
                </div>
              )}
              
              {formWarnings.length > 0 && (
                <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/30 rounded-2xl">
                  {formWarnings.map((warning, index) => (
                    <div key={index} className="flex items-center space-x-2 text-yellow-700 dark:text-yellow-300">
                      <AlertTriangle size={16} />
                      <span>{warning}</span>
                    </div>
                  ))}
                </div>
              )}
              
              {/* 重复建议 */}
              {duplicateSuggestions.length > 0 && (
                <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-2xl">
                  <p className="text-blue-700 dark:text-blue-300 mb-2">建议的规则名称：</p>
                  <div className="flex flex-wrap gap-2">
                    {duplicateSuggestions.map((suggestion, index) => (
                      <button
                        key={index}
                        onClick={() => setFormData({ ...formData, name: suggestion })}
                        className="px-3 py-1 rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-500/30 transition-colors text-sm"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    规则名称 *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="例如：上厕所、喝水、接电话"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    规则类型 *
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as ExceptionRuleType })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value={ExceptionRuleType.PAUSE_ONLY}>仅暂停 - 只能用于暂停计时</option>
                    <option value={ExceptionRuleType.EARLY_COMPLETION_ONLY}>仅提前完成 - 只能用于提前完成任务</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    描述（可选）
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="详细描述这个例外情况..."
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                  />
                </div>
              </div>
              
              <div className="flex items-center justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowCreateForm(false);
                    setEditingRule(null);
                    resetForm();
                  }}
                  className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={editingRule ? handleUpdateRule : handleCreateRule}
                  disabled={!formData.name.trim() || savingOperations.size > 0}
                  className="px-4 py-2 rounded-xl bg-primary-500 hover:bg-primary-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white transition-colors flex items-center space-x-2"
                >
                  {savingOperations.size > 0 && (
                    <Loader2 size={16} className="animate-spin" />
                  )}
                  <span>{editingRule ? '更新' : '创建'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};