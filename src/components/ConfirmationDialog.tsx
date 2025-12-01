import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  confirmButtonClass?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText,
  cancelText,
  confirmButtonClass = 'bg-red-500 hover:bg-red-600',
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-600">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center">
              <AlertTriangle size={20} className="text-orange-600 dark:text-orange-400" />
            </div>
            <h3 className="text-xl font-bold font-chinese text-gray-900 dark:text-slate-100">
              {title}
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 flex items-center justify-center transition-colors"
          >
            <X size={16} className="text-gray-600 dark:text-slate-300" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-gray-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
            {message}
          </p>
        </div>

        {/* Actions */}
        <div className="flex space-x-3 p-6 pt-0">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200 rounded-xl transition-colors font-medium"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-3 text-white rounded-xl transition-colors font-medium ${confirmButtonClass}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};