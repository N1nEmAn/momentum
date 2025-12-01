export const formatTime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
};

export const formatDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const getTimeRemaining = (expiresAt: Date): number => {
  return Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
};

export const isSessionExpired = (expiresAt: Date): boolean => {
  return Date.now() > expiresAt.getTime();
};

/**
 * 格式化正向计时显示（MM:SS 或 HH:MM:SS）
 * @param seconds 总秒数
 * @returns 格式化的时间字符串
 */
export const formatElapsedTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * 格式化用时描述（如"25分钟"、"1小时30分钟"）
 * @param minutes 总分钟数
 * @returns 格式化的用时描述
 */
export const formatTimeDescription = (minutes: number): string => {
  if (minutes < 1) {
    return '不到1分钟';
  }
  
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours > 0) {
    if (mins > 0) {
      return `${hours}小时${mins}分钟`;
    }
    return `${hours}小时`;
  }
  
  return `${mins}分钟`;
};

/**
 * 格式化实际用时显示（用于历史记录）
 * @param minutes 用时分钟数
 * @param isForwardTimed 是否为正向计时任务
 * @returns 格式化的用时显示
 */
export const formatActualDuration = (minutes: number, isForwardTimed?: boolean): string => {
  if (isForwardTimed) {
    return `完成用时：${formatTimeDescription(minutes)}`;
  }
  return formatTime(minutes);
};

/**
 * 格式化上次用时参考
 * @param minutes 上次用时分钟数，null表示首次执行
 * @returns 格式化的参考信息
 */
export const formatLastCompletionReference = (minutes: number | null): string => {
  if (minutes === null) {
    return '首次执行';
  }
  return `上次用时：${formatTimeDescription(minutes)}`;
};