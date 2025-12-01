import React from 'react';
import { DeletedChain } from '../types';
import { getChainTypeConfig } from '../utils/chainTree';
import { RotateCcw, Trash2, CheckSquare, Square } from 'lucide-react';

interface DeletedChainCardProps {
  chain: DeletedChain;
  isSelected: boolean;
  onSelect: (chainId: string, selected: boolean) => void;
  onRestore: (chainId: string) => void;
  onPermanentDelete: (chainId: string) => void;
  deletedTimeText: string;
}

export const DeletedChainCard: React.FC<DeletedChainCardProps> = ({
  chain,
  isSelected,
  onSelect,
  onRestore,
  onPermanentDelete,
  deletedTimeText,
}) => {
  const typeConfig = getChainTypeConfig(chain.type);

  const handleSelectToggle = () => {
    onSelect(chain.id, !isSelected);
  };

  return (
    <div className={`
      relative bg-white dark:bg-slate-800 rounded-2xl shadow-lg border-2 transition-all duration-300
      ${isSelected 
        ? 'border-blue-300 dark:border-blue-600 shadow-blue-100 dark:shadow-blue-900/20' 
        : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500'
      }
      opacity-75 hover:opacity-90
    `}>
      {/* Selection Checkbox */}
      <button
        onClick={handleSelectToggle}
        className="absolute top-3 left-3 z-10 w-6 h-6 rounded-lg bg-white dark:bg-slate-700 border-2 border-gray-300 dark:border-slate-500 flex items-center justify-center hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
      >
        {isSelected ? (
          <CheckSquare size={16} className="text-blue-500" />
        ) : (
          <Square size={16} className="text-gray-400 dark:text-slate-500" />
        )}
      </button>

      <div className="p-6">
        {/* Chain Type and Name */}
        <div className="flex items-start space-x-3 mb-4">
          <div className={`w-12 h-12 rounded-2xl ${typeConfig.bgColor} flex items-center justify-center flex-shrink-0`}>
            <i className={`${typeConfig.icon} ${typeConfig.color} text-lg`}></i>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold font-chinese text-gray-900 dark:text-slate-100 text-lg leading-tight mb-1 truncate">
              {chain.name}
            </h3>
            <div className="flex items-center space-x-2 text-sm">
              <span className={`px-2 py-1 rounded-lg ${typeConfig.bgColor} ${typeConfig.color} font-medium`}>
                {typeConfig.name}
              </span>
            </div>
          </div>
        </div>

        {/* Chain Stats */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-slate-100">
              {chain.currentStreak}
            </div>
            <div className="text-xs text-gray-500 dark:text-slate-400 font-mono uppercase tracking-wide">
              当前连击
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-slate-100">
              {chain.totalCompletions}
            </div>
            <div className="text-xs text-gray-500 dark:text-slate-400 font-mono uppercase tracking-wide">
              总完成数
            </div>
          </div>
        </div>

        {/* Deletion Info */}
        <div className="mb-4 p-3 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-slate-400">删除时间</span>
            <span className="text-gray-800 dark:text-slate-200 font-medium">{deletedTimeText}</span>
          </div>
          <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
            30天后将自动永久删除
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-2">
          <button
            onClick={() => onRestore(chain.id)}
            className="flex-1 flex items-center justify-center space-x-2 px-4 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl transition-colors font-medium"
          >
            <RotateCcw size={16} />
            <span>恢复</span>
          </button>
          <button
            onClick={() => onPermanentDelete(chain.id)}
            className="flex-1 flex items-center justify-center space-x-2 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors font-medium"
          >
            <Trash2 size={16} />
            <span>永久删除</span>
          </button>
        </div>

        {/* Description (if exists) */}
        {chain.description && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-600">
            <p className="text-sm text-gray-600 dark:text-slate-400 line-clamp-2">
              {chain.description}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};