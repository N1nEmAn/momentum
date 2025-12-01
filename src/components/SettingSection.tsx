/**
 * 设置区域组件
 * 提供统一的设置区域布局和样式
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface SettingSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  description?: string;
}

export const SettingSection: React.FC<SettingSectionProps> = ({
  title,
  icon,
  children,
  className = '',
  collapsible = false,
  defaultExpanded = true,
  description
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <section className={`setting-section space-y-6 ${className}`}>
      <div className="section-header">
        <div 
          className={`flex items-center space-x-3 ${collapsible ? 'cursor-pointer' : ''}`}
          onClick={collapsible ? () => setIsExpanded(!isExpanded) : undefined}
        >
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary-500/20 to-primary-600/10 flex items-center justify-center">
            {icon}
          </div>
          <div className="flex-1">
            <h3 className="text-2xl font-bold font-chinese text-gray-900 dark:text-slate-100">
              {title}
            </h3>
            {description && (
              <p className="text-sm text-gray-600 dark:text-slate-400 mt-1 font-chinese">
                {description}
              </p>
            )}
          </div>
          {collapsible && (
            <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
              {isExpanded ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </button>
          )}
        </div>
      </div>
      
      {(!collapsible || isExpanded) && (
        <div className="section-content space-y-6">
          {children}
        </div>
      )}
    </section>
  );
};