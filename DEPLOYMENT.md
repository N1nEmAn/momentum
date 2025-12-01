# Momentum 项目部署指南

## 🚀 快速部署

### 方法1：使用部署脚本（推荐）

```powershell
# 在项目根目录运行
.\deploy.ps1
```

### 方法2：手动部署

1. **安装依赖**
   ```bash
   npm install
   ```

2. **构建项目**
   ```bash
   npm run build
   ```

3. **安装 Netlify CLI**
   ```bash
   npm install -g netlify-cli
   ```

4. **登录 Netlify**
   ```bash
   netlify login
   ```

5. **链接到项目**
   ```bash
   netlify link --id 93d9da45-3df8-4a14-b24b-e4462436c75e
   ```

6. **部署到生产环境**
   ```bash
   netlify deploy --prod --dir=dist
   ```

## 📋 项目信息

- **项目名称**: momentumctdp
- **生产环境URL**: https://momentumctdp.netlify.app
- **管理面板**: https://app.netlify.com/projects/momentumctdp
- **GitHub仓库**: https://github.com/KenXiao1/momentum

## ⚙️ 环境变量

项目已配置以下环境变量：

- `VITE_SUPABASE_URL`: Supabase 项目URL
- `VITE_SUPABASE_ANON_KEY`: Supabase 匿名密钥
- `NODE_VERSION`: 18

## 🔧 配置文件

### netlify.toml
```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[build.environment]
  NODE_VERSION = "18"
```

## 📝 部署检查清单

- [x] 项目构建成功
- [x] Netlify CLI 已安装
- [x] 已登录 Netlify 账户
- [x] 已链接到正确的项目
- [x] 环境变量已配置
- [x] 部署成功
- [x] 网站可访问

## 🐛 常见问题

### 构建失败
- 检查 Node.js 版本是否为 18+
- 确保所有依赖已正确安装
- 检查 TypeScript 编译错误

### 部署失败
- 确认已正确登录 Netlify
- 检查项目链接是否正确
- 验证环境变量配置

### 网站无法访问
- 检查 Netlify 部署日志
- 确认域名配置正确
- 验证重定向规则

## 📞 支持

如有问题，请联系：
- 邮箱: kenx@andrew.cmu.edu
- GitHub: https://github.com/KenXiao1/momentum
