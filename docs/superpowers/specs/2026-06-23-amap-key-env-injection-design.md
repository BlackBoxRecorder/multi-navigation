# 高德地图 API Key 环境变量注入与混淆

## 目标

将高德地图 API Key 和 securityJsCode 从 `index.html` 的明文 script 标签中移除，改为通过 Vite 环境变量注入到 JS 代码中，构建时随代码打包混淆，避免 Key 以明文提交到 Git 仓库。

## 方案选择

采用方案 A：**Vite 环境变量 + AMapLoader 动态加载**。

- 使用高德官方 npm 包 `@amap/amap-jsapi-loader` 在 JS 中动态加载 SDK
- Key 从 `.env.local`（gitignored）读取，通过 `vite.config.js` 的 `define` 注入为编译时常量
- 构建产物中 Key 以字符串字面量形式内联，经 Terser 压缩后与其他代码一起混淆

## 架构

```
.env.local (gitignored)        vite.config.js              src/amap-loader.js
┌──────────────────────┐   ┌─────────────────────┐   ┌──────────────────────────┐
│ VITE_AMAP_KEY=xxx    │──►│ define: {            │──►│ window._AMapSecurityConfig│
│ VITE_AMAP_CODE=yyy   │   │  __AMAP_KEY__:       │   │ AMapLoader.load({        │
└──────────────────────┘   │    JSON.stringify(), │   │   key: __AMAP_KEY__,     │
                           │  __AMAP_CODE__: ...  │   │   version: '2.0',        │
                           └─────────────────────┘   │   plugins: [...]          │
                                                     │ }).then(AMap => {...})    │
                         src/map.js                  └──────────┬───────────────┘
                     ┌──────────────────┐                       │
                     │ async init() {    │◄──────────────────────┘
                     │   await amapReady │   export amapReady promise
                     │   new AMap.Map()  │
                     │ }                 │
                     └──────────────────┘
```

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `index.html` | 修改 | 删除 3 行 AMap/AMapUI script 标签 |
| `src/amap-loader.js` | 新建 | SDK 动态加载 + 安全配置，导出 `amapReady` Promise |
| `src/map.js` | 修改 | `init()` 方法加 `await amapReady`（约 +2 行） |
| `vite.config.js` | 修改 | 添加 `define` 注入 `__AMAP_KEY__` / `__AMAP_SECURITY_CODE__` |
| `.env` | 新建 | 模板文件，Key 留空占位，提交 git |
| `.env.local` | 新建 | 实际 Key 值，加入 `.gitignore` |
| `.gitignore` | 修改 | 追加 `.env.local` |
| `package.json` | 修改 | 新增 `@amap/amap-jsapi-loader` 依赖 |

## 各模块设计

### `src/amap-loader.js`（新建）

```javascript
import AMapLoader from '@amap/amap-jsapi-loader';

// Vite define 注入的编译时常量，构建时替换为字符串字面量
const AMAP_KEY = __AMAP_KEY__;
const AMAP_SECURITY_CODE = __AMAP_SECURITY_CODE__;

// 安全配置必须在 AMapLoader.load() 之前设置
window._AMapSecurityConfig = {
  securityJsCode: AMAP_SECURITY_CODE,
};

// 预加载常用插件，减少后续动态加载延迟
const amapReady = AMapLoader.load({
  key: AMAP_KEY,
  version: '2.0',
  plugins: [
    'AMap.Geolocation',
    'AMap.MapType',
    'AMap.ToolBar',
    'AMap.AutoComplete',
    'AMap.Geocoder',
  ],
});

export { amapReady };
```

关键设计决策：

- `__AMAP_KEY__` / `__AMAP_SECURITY_CODE__` 为 Vite `define` 注入的编译时常量，构建时直接替换为字符串字面量，经 Terser 压缩后与其他代码一起混淆
- 导出 `amapReady` Promise，供 `map.js` 等待 SDK 加载完成
- `AMapLoader.load()` 完成后 `window.AMap` 全局可用，所有现有 `AMap.plugin()` 动态加载调用无需修改
- 预加载 5 个高频插件，避免后续重复网络请求。路线相关插件（Driving/Transfer/Walking/Riding）保持按需动态加载

### `src/map.js` 改动

仅修改 `init()` 方法，开头加 `await amapReady`：

```javascript
import { amapReady } from './amap-loader.js';

// 原: init(containerId = 'mapContainer') {
// 改为:
async init(containerId = 'mapContainer') {
  await amapReady;  // 等待 SDK 加载完成
  return new Promise((resolve, reject) => {
    this.map = new AMap.Map(containerId, { ... });
    // 其余代码完全不动
  });
}
```

### `vite.config.js` 改动

```javascript
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/main-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
  define: {
    __AMAP_KEY__: JSON.stringify(process.env.VITE_AMAP_KEY || ''),
    __AMAP_SECURITY_CODE__: JSON.stringify(process.env.VITE_AMAP_SECURITY_CODE || ''),
  },
}));
```

### 环境变量文件

`.env`（模板，提交 git）：
```
VITE_AMAP_KEY=
VITE_AMAP_SECURITY_CODE=
```

`.env.local`（实际值，gitignored）：
```
VITE_AMAP_KEY=你的高德Key
VITE_AMAP_SECURITY_CODE=你的安全密钥
```

### `index.html` 改动

删除以下 3 行：
```html
<script type="text/javascript">
  window._AMapSecurityConfig = { securityJsCode: "..." };
</script>
<script src="https://webapi.amap.com/maps?v=2.0&key=..."></script>
<script src="https://webapi.amap.com/ui/1.1/main.js"></script>
```

注：AMapUI 在源码中未实际使用，直接移除。

### `route.js` / `main.js` / `location.js` / `ui.js`

零改动。`AMapLoader.load()` 完成后 `window.AMap` 全局可用，所有 `AMap.plugin()` 动态加载调用行为完全一致。

## 测试验证

1. 复制 `.env` → `.env.local`，填入实际 Key，执行 `npm install`
2. `npm run dev`：验证地图加载、搜索、POI 右键、路线规划全部正常
3. `npm run build`：检查 `dist/` 产物中 `index.html` 无明文 Key
4. 在 `dist/assets/main-*.js` 中验证 Key 已随代码混淆（字符串字面量内联形式）
