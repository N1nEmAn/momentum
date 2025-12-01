import React from 'react';

interface AccessibleFormFieldProps {
  id: string;
  name?: string;
  label: string;
  type?: 'text' | 'number' | 'email' | 'password' | 'textarea' | 'select' | 'checkbox' | 'range';
  value?: string | number | boolean;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string | number; label: string }[];
  className?: string;
  labelClassName?: string;
  description?: string;
  error?: string;
  onChange?: (value: any) => void;
  onBlur?: () => void;
  children?: React.ReactNode;
}

export const AccessibleFormField: React.FC<AccessibleFormFieldProps> = ({
  id,
  name,
  label,
  type = 'text',
  value,
  placeholder,
  required = false,
  disabled = false,
  min,
  max,
  step,
  options = [],
  className = '',
  labelClassName = '',
  description,
  error,
  onChange,
  onBlur,
  children,
}) => {
  const fieldId = id;
  const descriptionId = description ? `${fieldId}-description` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  
  const baseInputClasses = `
    w-full bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 
    rounded-2xl px-4 py-3 text-gray-900 dark:text-slate-100 
    focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 
    transition-all duration-300 font-chinese
    ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''}
    ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
    ${className}
  `.trim();

  const labelClasses = `
    block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2 font-chinese
    ${required ? "after:content-['*'] after:text-red-500 after:ml-1" : ''}
    ${labelClassName}
  `.trim();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    if (!onChange) return;
    
    if (type === 'checkbox') {
      onChange((e.target as HTMLInputElement).checked);
    } else if (type === 'number' || type === 'range') {
      onChange(Number(e.target.value));
    } else {
      onChange(e.target.value);
    }
  };

  const renderField = () => {
    const commonProps = {
      id: fieldId,
      name: name || fieldId,
      disabled,
      required,
      onChange: handleChange,
      onBlur,
      'aria-describedby': [descriptionId, errorId].filter(Boolean).join(' ') || undefined,
      'aria-invalid': error ? 'true' : undefined,
    };

    switch (type) {
      case 'textarea':
        return (
          <textarea
            {...commonProps}
            value={value as string || ''}
            placeholder={placeholder}
            className={baseInputClasses}
            rows={4}
          />
        );

      case 'select':
        return (
          <select
            {...commonProps}
            value={value as string || ''}
            className={baseInputClasses}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
            {children}
          </select>
        );

      case 'checkbox':
        return (
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              {...commonProps}
              type="checkbox"
              checked={value as boolean || false}
              className="sr-only"
            />
            <div className="w-11 h-6 bg-gray-200 dark:bg-slate-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-primary-600"></div>
            <span className="ml-3 text-sm font-medium text-gray-700 dark:text-slate-300 font-chinese">
              {label}
            </span>
          </label>
        );

      case 'range':
        return (
          <input
            {...commonProps}
            type="range"
            value={value as number || 0}
            min={min}
            max={max}
            step={step}
            className={`w-full h-2 bg-gray-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer slider ${className}`}
          />
        );

      default:
        return (
          <input
            {...commonProps}
            type={type}
            value={value as string || ''}
            placeholder={placeholder}
            min={min}
            max={max}
            step={step}
            className={baseInputClasses}
          />
        );
    }
  };

  if (type === 'checkbox') {
    return (
      <div className="space-y-2">
        {renderField()}
        {description && (
          <p id={descriptionId} className="text-sm text-gray-600 dark:text-slate-400 font-chinese">
            {description}
          </p>
        )}
        {error && (
          <p id={errorId} className="text-sm text-red-600 dark:text-red-400 font-chinese" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label htmlFor={fieldId} className={labelClasses}>
        {label}
      </label>
      {renderField()}
      {description && (
        <p id={descriptionId} className="text-sm text-gray-600 dark:text-slate-400 font-chinese">
          {description}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-red-600 dark:text-red-400 font-chinese" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};