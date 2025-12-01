# 回收箱功能使用指南

## 🎯 当前状态

✅ **应用程序正常工作** - 可以创建、查看、管理链条  
⚠️ **回收箱功能部分可用** - 删除操作会永久删除（因为数据库缺少字段）  
🔧 **需要一次性数据库更新** - 应用迁移后获得完整功能  

## 🚀 快速修复步骤

### 1. 打开 Supabase Dashboard
- 登录你的 Supabase 项目
- 进入 "SQL Editor"

### 2. 执行修复脚本
复制 `quick-fix-database.sql` 文件中的所有内容，粘贴到 SQL Editor 中执行。

或者直接复制以下代码：

```sql
-- 添加回收箱功能所需的字段
ALTER TABLE chains ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone DEFAULT NULL;
ALTER TABLE chains ADD COLUMN IF NOT EXISTS is_durationless boolean DEFAULT false;
ALTER TABLE chains ADD COLUMN IF NOT EXISTS time_limit_hours integer DEFAULT NULL;
ALTER TABLE chains ADD COLUMN IF NOT EXISTS time_limit_exceptions jsonb DEFAULT '[]'::jsonb;
ALTER TABLE chains ADD COLUMN IF NOT EXISTS group_started_at timestamp with time zone DEFAULT NULL;
ALTER TABLE chains ADD COLUMN IF NOT EXISTS group_expires_at timestamp with time zone DEFAULT NULL;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_chains_deleted_at ON chains(deleted_at);
CREATE INDEX IF NOT EXISTS idx_chains_user_deleted ON chains(user_id, deleted_at);
```

### 3. 验证修复
执行后，你应该看到类似这样的结果：
```
column_name          | data_type                   | is_nullable
deleted_at          | timestamp with time zone    | YES
is_durationless     | boolean                     | YES
time_limit_hours    | integer                     | YES
...
```

### 4. 重新加载应用
刷新你的 Momentum 应用，现在回收箱功能应该完全可用了！

## 🎉 修复后的功能

### 完整的回收箱功能
- ✅ **软删除** - 删除的链条进入回收箱，不会立即消失
- ✅ **恢复功能** - 可以从回收箱恢复误删的链条
- ✅ **永久删除** - 可以彻底删除不需要的链条
- ✅ **批量操作** - 可以同时处理多个链条
- ✅ **自动清理** - 30天后自动清理过期链条

### 其他改进
- ✅ **无时长任务** - 支持手动结束的任务
- ✅ **任务群时间限制** - 支持时间限定的任务群
- ✅ **更好的性能** - 优化的数据库查询

## 🔍 故障排除

### 如果执行 SQL 时遇到权限错误：
1. 确保你是项目的所有者或管理员
2. 在 Supabase Dashboard 中执行，不要通过应用程序

### 如果字段已存在：
- 脚本使用 `IF NOT EXISTS`，重复执行是安全的
- 不会影响现有数据

### 如果应用后仍有问题：
1. 清除浏览器缓存
2. 重新加载应用程序
3. 检查浏览器控制台是否还有错误

## 📞 需要帮助？

如果遇到问题，请检查：
1. Supabase 项目是否正常运行
2. 数据库连接是否正常
3. 是否有足够的权限执行 SQL

修复完成后，你将拥有一个功能完整的回收箱系统！🎉