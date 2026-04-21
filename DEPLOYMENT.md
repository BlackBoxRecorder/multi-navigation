# 部署说明

## 快速开始

### 1. 获取高德API密钥
- 访问 https://lbs.amap.com/ 注册开发者账号
- 创建应用，获取Web端JS API密钥
- 替换 `index.html` 中的 `YOUR_AMAP_API_KEY` 为你的密钥

### 2. 本地开发
```bash
npm install
npm run dev
```
访问 http://localhost:3000 即可使用

### 3. 生产构建
```bash
npm run build
```
构建产物会生成在 `dist` 目录下

### 4. 部署方式
#### 方式一：本地直接使用
直接打开 `dist/index.html` 文件即可在浏览器中使用

#### 方式二：静态文件服务器
将 `dist` 目录部署到任何静态文件服务器即可
- Nginx
- Apache
- Vercel/Netlify/Cloudflare Pages
- GitHub Pages

#### 方式三：集成到现有项目
将 `dist` 目录下的文件复制到你的项目静态资源目录即可

## 注意事项
- API Key 请妥善保管，不要提交到公共代码仓库
- 高德地图API有请求频率限制，QPS限制为每秒10次
- 生产环境建议配置自己的API Key 域名白名单
