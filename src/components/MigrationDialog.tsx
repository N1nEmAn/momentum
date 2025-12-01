/**
 * 数据迁移对话框组件
 * 处理从旧例外规则系统到新系统的迁移
 */

import React, { useState, useEffect } from 'react';
import { 
  MigrationResult, 
  MigrationProgress,
  exceptionRuleMigration 
} from '../services/ExceptionRuleMigration';
import { 
  Database, 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw, 
  Download,
  ArrowRight,
  X,
  Info
} from 'lucide-react';

interface MigrationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onMigrationComplete?: (result: MigrationResult) => void;
}

export const MigrationDialog: React.FC<MigrationDialogProps> = ({
  isOpen,
  onClose,
  onMigrationComplete
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [migrationNeeded, setMigrationNeeded] = useState<boolean | null>(null);
  const [migrationSuggestions, setMigrationSuggestions] = useState<{
    totalRules: number;
    uniqueRules: string[];
    duplicateRules: Array<{ rule: string; count: number; chains: string[] }>;
    recommendations: string[];
  } | null>(null);
  
  // 迁移状态
  const [migrating, setMigrating] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // 检查迁移需求
  useEffect(() => {
    if (isOpen) {
      checkMigrationNeeded();
    }
  }, [isOpen]);

  const checkMigrationNeeded = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const needed = await exceptionRuleMigration.needsMigration();
      setMigrationNeeded(needed);
      
      if (needed) {
        const suggestions = await exceptionRuleMigration.getMigrationSuggestions();
        setMigrationSuggestions(suggestions);
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : '检查迁移需求失败');
    } finally {
      setLoading(false);
    }
  };

  const handleStartMigration = async () => {
    try {
      setMigrating(true);
      setError(null);
      setMigrationProgress(null);
      setMigrationResult(null);
      
      const result = await exceptionRuleMigration.migrate((progress) => {
        setMigrationProgress(progress);
      });
      
      setMigrationResult(result);
      onMigrationComplete?.(result);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : '迁移失败');
    } finally {
      setMigrating(false);
    }
  };

  const handleDownloadReport = async () => {
    try {
      const report = await exceptionRuleMigration.generateMigrationReport();
      const blob = new Blob([report], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `migration-report-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('下载报告失败');
    }
  };

  const getProgressPercentage = (): number => {
    if (!migrationProgress) return 0;
    if (migrationProgress.phase === 'complete') return 100;
    if (migrationProgress.totalChains === 0) return 0;
    return Math.round((migrationProgress.currentChain / migrationProgress.totalChains) * 100);
  };

  const getPhaseDisplayName = (phase: MigrationProgress['phase']): string => {
    switch (phase) {
      case 'analyzing': return '分析数据';
      case 'migrating': return '迁移中';
      case 'cleanup': return '清理';
      case 'complete': return '完成';
      default: return '处理中';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/20 flex items-center justify-center">
              <Database className="text-blue-500" size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                数据迁移
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                将旧的例外规则迁移到新系统
              </p>
            </div>
          </div>
          
          <button
            onClick={onClose}
            disabled={migrating}
            className="p-2 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
          {/* 加载状态 */}
          {loading && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">检查迁移需求中...</p>
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-2xl flex items-center space-x-3">
              <AlertTriangle className="text-red-500" size={20} />
              <span className="text-red-700 dark:text-red-300">{error}</span>
            </div>
          )}

          {/* 不需要迁移 */}
          {!loading && migrationNeeded === false && (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="text-green-500" size={32} />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                无需迁移
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                您的数据已经是最新格式，无需进行迁移。
              </p>
            </div>
          )}

          {/* 需要迁移 */}
          {!loading && migrationNeeded === true && !migrating && !migrationResult && migrationSuggestions && (
            <div className="space-y-6">
              <div className="bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/30 rounded-2xl p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <Info className="text-yellow-600 dark:text-yellow-400" size={20} />
                  <h3 className="font-medium text-yellow-800 dark:text-yellow-200">
                    发现需要迁移的数据
                  </h3>
                </div>
                <div className="space-y-3 text-sm text-yellow-700 dark:text-yellow-300">
                  <div className="flex justify-between">
                    <span>总规则数：</span>
                    <span className="font-medium">{migrationSuggestions.totalRules}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>唯一规则：</span>
                    <span className="font-medium">{migrationSuggestions.uniqueRules.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>重复规则：</span>
                    <span className="font-medium">{migrationSuggestions.duplicateRules.length}</span>
                  </div>
                </div>
              </div>

              {/* 迁移建议 */}
              <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-2xl p-6">
                <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-3">
                  迁移建议
                </h4>
                <ul className="space-y-2 text-sm text-blue-700 dark:text-blue-300">
                  {migrationSuggestions.recommendations.map((recommendation, index) => (
                    <li key={index} className="flex items-start space-x-2">
                      <ArrowRight size={16} className="mt-0.5 flex-shrink-0" />
                      <span>{recommendation}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* 重复规则详情 */}
              {migrationSuggestions.duplicateRules.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-medium text-gray-900 dark:text-white">
                      重复规则详情
                    </h4>
                    <button
                      onClick={() => setShowDetails(!showDetails)}
                      className="text-sm text-primary-500 hover:text-primary-600"
                    >
                      {showDetails ? '收起' : '展开'}
                    </button>
                  </div>
                  
                  {showDetails && (
                    <div className="space-y-3 max-h-48 overflow-y-auto">
                      {migrationSuggestions.duplicateRules.slice(0, 10).map((duplicate, index) => (
                        <div key={index} className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-600 last:border-b-0">
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">
                              {duplicate.rule}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              使用于: {duplicate.chains.slice(0, 3).join(', ')}
                              {duplicate.chains.length > 3 && ` 等${duplicate.chains.length}个任务`}
                            </div>
                          </div>
                          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                            {duplicate.count}次
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 迁移按钮 */}
              <div className="flex items-center justify-end space-x-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors"
                >
                  稍后迁移
                </button>
                <button
                  onClick={handleStartMigration}
                  className="px-6 py-2 rounded-xl bg-primary-500 hover:bg-primary-600 text-white transition-colors flex items-center space-x-2"
                >
                  <Database size={16} />
                  <span>开始迁移</span>
                </button>
              </div>
            </div>
          )}

          {/* 迁移进行中 */}
          {migrating && migrationProgress && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-primary-100 dark:bg-primary-500/20 flex items-center justify-center mx-auto mb-4">
                  <RefreshCw className="text-primary-500 animate-spin" size={32} />
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  正在迁移数据
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  {migrationProgress.message}
                </p>
              </div>

              {/* 进度条 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    {getPhaseDisplayName(migrationProgress.phase)}
                  </span>
                  <span className="text-gray-600 dark:text-gray-400">
                    {getProgressPercentage()}%
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary-500 transition-all duration-300 ease-out"
                    style={{ width: `${getProgressPercentage()}%` }}
                  />
                </div>
                {migrationProgress.totalChains > 0 && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
                    {migrationProgress.currentChain} / {migrationProgress.totalChains}
                    {migrationProgress.currentChainName && ` - ${migrationProgress.currentChainName}`}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 迁移完成 */}
          {migrationResult && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="text-green-500" size={32} />
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  迁移完成
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  数据迁移已成功完成
                </p>
              </div>

              {/* 迁移结果 */}
              <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 rounded-2xl p-6">
                <h4 className="font-medium text-green-800 dark:text-green-200 mb-4">
                  迁移结果
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-green-700 dark:text-green-300">处理链条：</span>
                    <span className="font-medium text-green-800 dark:text-green-200">
                      {migrationResult.totalChains}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-700 dark:text-green-300">创建规则：</span>
                    <span className="font-medium text-green-800 dark:text-green-200">
                      {migrationResult.migratedRules}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-700 dark:text-green-300">跳过规则：</span>
                    <span className="font-medium text-green-800 dark:text-green-200">
                      {migrationResult.skippedRules}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-700 dark:text-green-300">错误数量：</span>
                    <span className="font-medium text-green-800 dark:text-green-200">
                      {migrationResult.errors.length}
                    </span>
                  </div>
                </div>
              </div>

              {/* 错误详情 */}
              {migrationResult.errors.length > 0 && (
                <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-2xl p-6">
                  <h4 className="font-medium text-red-800 dark:text-red-200 mb-3">
                    迁移错误
                  </h4>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {migrationResult.errors.map((error, index) => (
                      <div key={index} className="text-sm text-red-700 dark:text-red-300">
                        <span className="font-medium">{error.chainName}:</span> {error.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex items-center justify-end space-x-3">
                <button
                  onClick={handleDownloadReport}
                  className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors flex items-center space-x-2"
                >
                  <Download size={16} />
                  <span>下载报告</span>
                </button>
                <button
                  onClick={onClose}
                  className="px-6 py-2 rounded-xl bg-primary-500 hover:bg-primary-600 text-white transition-colors"
                >
                  完成
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};