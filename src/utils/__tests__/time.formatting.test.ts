/**
 * 时间格式化函数单元测试
 */

import {
  formatElapsedTime,
  formatTimeDescription,
  formatActualDuration,
  formatLastCompletionReference
} from '../time';

describe('Time Formatting Functions', () => {
  describe('formatElapsedTime', () => {
    test('应该格式化秒数为MM:SS格式', () => {
      expect(formatElapsedTime(0)).toBe('00:00');
      expect(formatElapsedTime(30)).toBe('00:30');
      expect(formatElapsedTime(90)).toBe('01:30');
      expect(formatElapsedTime(3599)).toBe('59:59');
    });

    test('应该格式化超过1小时的时间为HH:MM:SS格式', () => {
      expect(formatElapsedTime(3600)).toBe('01:00:00');
      expect(formatElapsedTime(3661)).toBe('01:01:01');
      expect(formatElapsedTime(7200)).toBe('02:00:00');
      expect(formatElapsedTime(7323)).toBe('02:02:03');
    });

    test('应该正确处理大数值', () => {
      expect(formatElapsedTime(36000)).toBe('10:00:00');
      expect(formatElapsedTime(359999)).toBe('99:59:59');
    });

    test('应该正确填充零', () => {
      expect(formatElapsedTime(5)).toBe('00:05');
      expect(formatElapsedTime(65)).toBe('01:05');
      expect(formatElapsedTime(3605)).toBe('01:00:05');
    });
  });

  describe('formatTimeDescription', () => {
    test('应该处理小于1分钟的时间', () => {
      expect(formatTimeDescription(0)).toBe('不到1分钟');
      expect(formatTimeDescription(0.5)).toBe('不到1分钟');
      expect(formatTimeDescription(0.9)).toBe('不到1分钟');
    });

    test('应该格式化分钟数', () => {
      expect(formatTimeDescription(1)).toBe('1分钟');
      expect(formatTimeDescription(5)).toBe('5分钟');
      expect(formatTimeDescription(30)).toBe('30分钟');
      expect(formatTimeDescription(59)).toBe('59分钟');
    });

    test('应该格式化小时数', () => {
      expect(formatTimeDescription(60)).toBe('1小时');
      expect(formatTimeDescription(120)).toBe('2小时');
      expect(formatTimeDescription(180)).toBe('3小时');
    });

    test('应该格式化小时和分钟组合', () => {
      expect(formatTimeDescription(61)).toBe('1小时1分钟');
      expect(formatTimeDescription(90)).toBe('1小时30分钟');
      expect(formatTimeDescription(125)).toBe('2小时5分钟');
      expect(formatTimeDescription(195)).toBe('3小时15分钟');
    });

    test('应该处理大数值', () => {
      expect(formatTimeDescription(600)).toBe('10小时');
      expect(formatTimeDescription(665)).toBe('11小时5分钟');
    });
  });

  describe('formatActualDuration', () => {
    test('应该为正向计时任务显示完成用时', () => {
      expect(formatActualDuration(25, true)).toBe('完成用时：25分钟');
      expect(formatActualDuration(90, true)).toBe('完成用时：1小时30分钟');
      expect(formatActualDuration(1, true)).toBe('完成用时：1分钟');
    });

    test('应该为非正向计时任务使用标准格式', () => {
      expect(formatActualDuration(25, false)).toBe('25m');
      expect(formatActualDuration(90, false)).toBe('1h 30m');
      expect(formatActualDuration(60, false)).toBe('1h 0m');
    });

    test('应该处理未定义的isForwardTimed参数', () => {
      expect(formatActualDuration(25)).toBe('25m');
      expect(formatActualDuration(25, undefined)).toBe('25m');
    });

    test('应该处理边界情况', () => {
      expect(formatActualDuration(0, true)).toBe('完成用时：不到1分钟');
      expect(formatActualDuration(0, false)).toBe('0m');
      expect(formatActualDuration(0.5, true)).toBe('完成用时：不到1分钟');
    });
  });

  describe('formatLastCompletionReference', () => {
    test('应该显示首次执行当没有历史数据时', () => {
      expect(formatLastCompletionReference(null)).toBe('首次执行');
    });

    test('应该显示上次用时', () => {
      expect(formatLastCompletionReference(25)).toBe('上次用时：25分钟');
      expect(formatLastCompletionReference(90)).toBe('上次用时：1小时30分钟');
      expect(formatLastCompletionReference(1)).toBe('上次用时：1分钟');
    });

    test('应该处理小于1分钟的用时', () => {
      expect(formatLastCompletionReference(0)).toBe('上次用时：不到1分钟');
      expect(formatLastCompletionReference(0.5)).toBe('上次用时：不到1分钟');
    });

    test('应该处理大数值', () => {
      expect(formatLastCompletionReference(600)).toBe('上次用时：10小时');
      expect(formatLastCompletionReference(665)).toBe('上次用时：11小时5分钟');
    });
  });

  describe('集成测试', () => {
    test('所有格式化函数应该保持一致的中文输出', () => {
      const minutes = 90;
      
      const description = formatTimeDescription(minutes);
      const reference = formatLastCompletionReference(minutes);
      const actualDuration = formatActualDuration(minutes, true);
      
      expect(description).toContain('小时');
      expect(description).toContain('分钟');
      expect(reference).toContain('上次用时');
      expect(actualDuration).toContain('完成用时');
    });

    test('应该正确处理零值', () => {
      expect(formatElapsedTime(0)).toBe('00:00');
      expect(formatTimeDescription(0)).toBe('不到1分钟');
      expect(formatActualDuration(0, true)).toBe('完成用时：不到1分钟');
      expect(formatLastCompletionReference(0)).toBe('上次用时：不到1分钟');
    });

    test('应该正确处理典型用时值', () => {
      const typicalTime = 25; // 25分钟
      
      expect(formatElapsedTime(typicalTime * 60)).toBe('25:00');
      expect(formatTimeDescription(typicalTime)).toBe('25分钟');
      expect(formatActualDuration(typicalTime, true)).toBe('完成用时：25分钟');
      expect(formatLastCompletionReference(typicalTime)).toBe('上次用时：25分钟');
    });
  });
});