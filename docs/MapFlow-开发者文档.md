# MapFlow 开发者文档

> 面向开发团队内部的技术文档，涵盖架构设计、代码级业务逻辑、关键设计决策、高德 API 集成指南。

---

## 1. 项目概览

**MapFlow** 是一款基于高德地图 JS API v2.0 的纯前端多点路径规划工具。用户可以在地图上收藏多个地点，选择出发地并设置目的地，自动计算驾车/公交/步行/骑行四种交通模式的路线，支持单路线与多路线对比渲染。

### 技术栈

| 技术 | 用途 | 说明 |
|---|---|---|
| Vanilla JS | 业务逻辑 | 无框架，纯 ES Modules |
| 高德地图 JS API v2.0 | 地图服务 | 地图渲染、POI 搜索、路线规划、地理编码 |
| Tailwind CSS (CDN) | 样式 | 通过 CDN 引入，所有样式为 utility class |
| Vite | 构建工具 | 仅用于打包构建，无框架插件 |
| localStorage | 数据持久化 | 仅收藏地点跨页持久化 |

### 运行命令

```bash
npm install          # 安装依赖
npm run dev          # 启动开发服务器 http://localhost:3000
npm run build        # 生产构建到 dist/
npm run preview      # 本地预览生产构建
```

项目无 lint、测试、类型检查配置。

### 文件结构

| 文件 | 行数 | 职责 |
|---|---|---|
| `src/main.js` | ~165 | 入口：启动初始化、事件总线、面板拖拽 |
| `src/map.js` | ~476 | 地图管理：地图实例、Marker CRUD、POI 交互、信息窗、路线折线 |
| `src/location.js` | ~134 | 地点管理：扁平列表 CRUD、localStorage 持久化、去重判断 |
| `src/route.js` | ~939 | 路线管理：多模式路线计算、结果渲染、单/多路线模式切换、原生详情面板 |
| `src/ui.js` | ~229 | 界面管理：地点列表渲染、清空操作、帮助弹窗、空状态 |
| `src/utils.js` | ~94 | 工具函数：Toast 通知、RateLimiter 节流器、格式化函数 |
| `index.html` | ~335 | HTML 结构、三栏布局、Tailwind 样式、高德 API 引入 |

---

## 2. 架构设计

### 2.1 模块划分与职责

项目采用**单例 ES Module** 架构，每个 `src/` 文件导出一个全局唯一的单例实例：

| 模块 | 导出 | 核心职责 | 核心状态 | 关键方法 |
|---|---|---|---|---|
| `MapManager` | `mapManager` | 地图实例生命周期、Marker/折线 CRUD、POI 交互 | `markers[]`, `routeLines[]`, `destinationMarker`, `poiInfoWindow`, `_hotspotCache` | `init()`, `addMyLocationMarker()`, `addDestinationMarker()`, `showPoiInfoWindow()`, `addRouteLine()`, `clearRouteLines()` |
| `LocationManager` | `locationManager` | 地点数据管理、持久化 | `locations[]` | `addLocation()`, `removeLocation()`, `clearAll()`, `hasLocation()`, `saveToStorage()`, `loadFromStorage()` |
| `RouteManager` | `routeManager` | 路线计算、结果渲染、模式切换 | `currentResults[]`, `currentDestination`, `activeMode`, `multiRouteMode`, `_expandedGroupIndex`, `_highlightedRoute`, `currentRouteLines[]` | `calculateRoute()`, `calculateRoutesToDestination()`, `switchTransportMode()`, `setMultiRouteMode()`, `renderResultsPanel()`, `_showNativeRoutePanel()` |
| `UIManager` | `uiManager` | DOM 渲染与事件绑定 | DOM 引用缓存 | `renderMyLocations()`, `handleRemoveLocation()`, `handleClearAll()`, `showEmptyState()`, `getSelectedLocationIndices()` |
| `utils.js` | 命名导出 | 纯工具函数 | 无状态 | `showToast()`, `RateLimiter`, `formatDistance()`, `formatDuration()` |

### 2.2 单例模式

每个模块文件底部通过 `export const xxx = new XxxManager()` 导出单例。模块间通过 `import` 引用同一实例，不创建新实例。`utils.js` 例外，导出命名函数和类。

### 2.3 模块间通信（CustomEvent）

模块间通过 `window.dispatchEvent(new CustomEvent(...))` 解耦通信，避免直接方法调用：

| 事件名 | 触发者 | 监听者 | 携带数据 | 触发时机 |
|---|---|---|---|---|
| `locationAdded` | map.js（信息窗"添加"按钮） | main.js | `{ location }` | 用户点击"添加到我的地点" |
| `locationRemoved` | ui.js（删除按钮） | main.js | `{ index, location }` | 用户点击删除按钮 |
| `destinationSet` | map.js（信息窗"目的地"按钮） | main.js | `{ destination }` | 用户点击"设为目的地" |
| `locationsCleared` | location.js（clearAll） | — | `{ count }` | 用户确认清空所有地点 |

`main.js` 作为事件总线，监听上述事件并协调各模块响应。

### 2.4 核心数据流

**链路 1：右键 POI → 弹出信息窗**

用户右键地图 POI → `hotspotover` 缓存 POI 数据 → `rightclick` 事件判断 `_hotspotCache` 存在 → 调用 `reverseGeocodeForAddress()` 逆地理编码获取地址 → 弹出 `showPoiInfoWindow()` 自定义信息窗

**链路 2：收藏地点**

用户点击"添加到我的地点" → `locationManager.addLocation()` 去重校验 → `mapManager.addMyLocationMarker()` 创建蓝色标记 → 派发 `locationAdded` 事件 → main.js 监听：`saveToStorage()` + `renderMyLocations()`

**链路 3：设置目的地 → 路线计算**

用户点击"设为目的地" → 派发 `destinationSet` 事件 → main.js 监听：校验 checkbox 选中数量（1-5个）→ 跳过同坐标 → `clearRouteLines()` 清除旧路线 → `addDestinationMarker()` 创建红色标记 → `calculateRoutesToDestination()` 批量计算（起点×模式） → `renderResultsPanel()` 渲染右侧面板 → `switchTransportMode()` 绘制地图折线

**链路 4：切换交通模式**

用户点击模式按钮 → `renderModeSwitchBar()` 更新按钮样式 → `renderRouteList()` 更新列表 → `switchTransportMode()` 清除旧折线 → `_renderOverviewRoutes()` 重绘地图

**链路 5：删除地点**

用户点击删除 → `locationManager.removeLocation()` → `mapManager.removeMyLocationMarker()` → 派发 `locationRemoved` → main.js 监听：持久化 + 重渲染 + 如有目的地则重算路线

### 2.5 状态管理

| 状态 | 所属模块 | 结构 | 持久化 |
|---|---|---|---|
| `markers[]` | map.js | `{ marker: AMap.Marker, location: object }` | 否（随页面刷新丢失） |
| `locations[]` | location.js | `{ name, address, latitude, longitude, city, district }` | 是（localStorage，key: `mapdemo_my_locations`） |
| `currentResults[]` | route.js | `{ origin, routes: { driving, transit, walking, bicycling }, activeRouteIndex, hasError }` | 否 |
| `currentDestination` | route.js | `{ name, address, latitude, longitude, city }` | 否 |
| `activeMode` | route.js | `"driving" \| "transit" \| "walking" \| "bicycling"` | 否 |
| `multiRouteMode` | route.js | `boolean` | 否 |
| `_expandedGroupIndex` | route.js | `number \| null`（手风琴仅展开一组） | 否 |
| `_highlightedRoute` | route.js | `{ groupIndex, subRouteIdx } \| null` | 否 |
| `currentRouteLines[]` | route.js | `AMap.Polyline[]`（当前地图上的折线） | 否 |

**持久化策略**：仅收藏地点跨页保留；路线状态为纯内存数据，刷新后丢失。

### 2.6 三栏布局与响应式

**桌面端**：左（240px 地点面板）/ 中（flex:1 地图）/ 右（420px 路线面板）

- 左右面板通过拖拽 handle 调整宽度：左 180-500px，右 300-700px
- 拖拽时设置 `body.resizing` 类禁用文字选择，实时调用 `mapManager.refreshSize()` 通知地图重排
- 实现方式：`mousedown`/`mousemove`/`mouseup` 事件链，通过 `e.clientX` 计算新宽度

**移动端**（≤1024px）：降级为纵向堆叠，隐藏拖拽 handle，面板全宽，右面板置顶。



---

## 3. 模块详解

### 3.1 main.js — 入口与事件总线

#### 启动流程 `initApp()`

```
mapManager.init()          → 地图初始化（含插件加载、定位、搜索栏）
initResizeHandles()        → 绑定三栏拖拽事件
locationManager.loadFromStorage()  → 恢复收藏地点
  → 逐个 addMyLocationMarker()    → 创建蓝色标记
  → uiManager.renderMyLocations()  → 渲染左侧列表
注册事件监听：locationAdded / locationRemoved / destinationSet
```

#### 事件监听逻辑

**`destinationSet`**（核心流程）：
1. `getSelectedLocationIndices()` 获取 checkbox 选中的索引
2. 校验数量：至少 1 个，最多 5 个
3. 跳过同坐标：如果目的地与上一目的地坐标差 < 0.0001，直接返回
4. `mapManager.clearRouteLines()` 清除旧路线折线
5. `mapManager.addDestinationMarker()` 创建红色目的地标记
6. `routeManager.calculateRoutesToDestination()` 批量路线计算
7. `renderResultsPanel()` + `switchTransportMode()` 渲染结果

**`locationRemoved`**：
- `saveToStorage()` + `renderMyLocations()`
- 如果当前有目的地，重新计算路线并渲染（删除起点后路线需更新）

**`locationAdded`**：
- `saveToStorage()` + `renderMyLocations()`

#### `initResizeHandles()`

通过 `mousedown`/`mousemove`/`mouseup` 实现三栏布局的拖拽调整：
- 左面板：`e.clientX - layoutRect.left`，限制 180-500px
- 右面板：`layoutRect.right - e.clientX`，限制 300-700px
- 拖拽中给 `body` 添加 `resizing` 类（`cursor: col-resize` + `user-select: none`）
- `mousemove` 和 `mouseup` 时调用 `mapManager.refreshSize()` 通知地图容器尺寸变化

---

### 3.2 map.js — 地图管理器

#### 地图初始化 `init()`

1. 创建 `AMap.Map` 实例（zoom:11，center:北京，resizeEnable:true）
2. 加载插件：
   - `AMap.Geolocation`：高精度定位，定位成功后设为中心
   - `AMap.MapType`：标准/卫星图层切换，position:RB
   - `AMap.ToolBar`：缩放+定位按钮，position:LB
3. 调用 `initSearchBar()`：`AMap.AutoComplete` 搜索框自动补全，选中后 `setCenter` + `setZoom(15)`
4. 调用 `initPoiClickListener()`：POI 交互

#### POI 交互链路 `initPoiClickListener()`

禁用默认右键菜单后，通过三个事件实现 POI 右键交互：

```
hotspotover  → 缓存 { name, id, lnglat } 到 _hotspotCache
hotspotout   → 清除 _hotspotCache = null
rightclick   → 三路分支判断：
```

**rightclick 三路分支**：

1. **近 Marker 检测** `getNearMarkerData(clickEvent)`：遍历 `markers[]`，将点击像素坐标与每个 Marker 的容器像素坐标比较，距离 < 20px 视为近 Marker → 显示已收藏 POI 信息窗（"已添加 ✓"禁用态）

2. **Hotspot 缓存存在**：`_hotspotCache` 非 null → 调用 `reverseGeocodeForAddress(hotspot.lnglat, hotspot.name)` → 逆地理编码后显示新 POI 信息窗

3. **空白区域**：不执行任何操作

#### `reverseGeocodeForAddress(lnglat, poiName)`

通过 `RateLimiter(500ms)` 节流，调用 `AMap.Geocoder.getAddress()`：

1. 从返回的 `result.regeocode.pois[]` 中选取距离点击位置最近的 POI
2. 用该 POI 的 `address` 字段作为地址（fallback 到 `formattedAddress` 或省市区拼接）
3. 组装 `poiData = { name, address, latitude, longitude }`
4. 调用 `showPoiInfoWindow(lnglat, poiData)`

#### `showPoiInfoWindow(lnglat, poiData)`

自定义 DOM 信息窗（非高德原生 InfoWindow）：

- **DOM 结构**：`div` 绝对定位在地图容器内，包含关闭按钮、POI 名称、地址、两个操作按钮
- **位置跟随**：初始 `lngLatToContainer()` 定位，监听 map 的 `move`/`zoom` 事件实时更新 `left`/`top`
- **收藏状态判断**：`locationManager.hasLocation(lat, lng)` 检测是否已收藏，已收藏则按钮显示"已添加 ✓"并 disabled
- **添加按钮**：调用 `locationManager.addLocation(poiData)` → `addMyLocationMarker(poiData)` → 派发 `locationAdded` → 关闭信息窗
- **目的地按钮**：校验是否有收藏地点 → 派发 `destinationSet` 事件 → 关闭信息窗
- **清理**：`closePoiInfoWindow()` 移除 `move`/`zoom` 监听、从 DOM 移除元素、置空引用

#### Marker 管理

**`addMyLocationMarker(location)`**：
- 蓝色 SVG 图钉（#3b82f6 填充，#1d4ed8 描边），24×36px
- `anchor: "bottom-center"`，`zIndex: 100`
- `mouseover`/`mouseout` 控制原生 InfoWindow 显示名称+地址
- 存入 `markers[]` 数组：`{ marker, location }`

**`addDestinationMarker(location)`**：
- 红色 SVG 图钉（#ef4444 填充，#b91c1c 描边），30×42px
- `zIndex: 200`（高于收藏标记）
- 替换旧目的地标记（先 `map.remove` 旧的）
- hover 显示"📍 目的地"信息窗

**`removeMyLocationMarker(index)`**：从地图移除 + `markers.splice(index, 1)`

**`clearAllMyLocationMarkers()`**：遍历移除所有标记，清空 `markers[]`

#### 路线折线

**`addRouteLine(path, color, width, opacity)`**：创建 `AMap.Polyline`（`showDir: true` 显示方向箭头），加入 `routeLines[]`，调用 `setFitView` 自适应视野

**`clearRouteLines()`**：批量 `map.remove(routeLines)`，清空数组

---

### 3.3 location.js — 地点管理器

#### 数据结构

扁平数组 `locations[]`，每项：
```javascript
{ name, address, latitude, longitude, city, district }
```

**约束**：`MAX_LOCATIONS = 20`，超出则 toast 提示拒绝添加。

#### localStorage 持久化

- **`saveToStorage()`**：序列化 `locations[]` 为 JSON → `localStorage.setItem("mapdemo_my_locations", ...)`
- **`loadFromStorage()`**：`getItem` → `JSON.parse` → 截取前 20 条 → 赋值 `this.locations`
- 两处 `try/catch` 保护，失败仅 `console.warn` 不中断应用

#### 去重判断 `hasLocation(lat, lng)`

坐标容差 `TOLERANCE = 0.0001`（约 10 米），在此范围内视为同一地点：
```javascript
Math.abs(loc.latitude - lat) < TOLERANCE && Math.abs(loc.longitude - lng) < TOLERANCE
```

#### CRUD 操作

- **`addLocation(location)`**：容量检查 → 去重检查 → `push` + toast 成功提示，返回 `true`/`false`
- **`removeLocation(index)`**：`splice(index, 1)` 删除 + toast，返回被删对象
- **`clearAll()`**：清空数组 → `removeItem` 清除 localStorage → toast → 派发 `locationsCleared` 事件

---

### 3.4 route.js — 路线管理器

#### 常量体系

```javascript
TRANSPORT_MODES  = { DRIVING, TRANSIT, WALKING, BICYCLING }  // 模式标识
MODE_NAMES       = { driving: "自驾", transit: "公交", ... }  // 中文名
MODE_COLORS      = { driving: "#3b82f6", transit: "#8b5cf6", ... }  // 按钮颜色
ORIGIN_COLORS    = ["#ef4444", "#3b82f6", "#22c55e", "#8b5cf6", "#f59e0b", "#06b6d4"]  // 起点颜色
SUB_ROUTE_STYLES = [
  { color: "#ef4444", dashPattern: null },        // 实线 — 方案1
  { color: "#3b82f6", dashPattern: [12, 6] },     // 长虚线 — 方案2
  { color: "#22c55e", dashPattern: [4, 8] },      // 短虚线 — 方案3
  { color: "#f59e0b", dashPattern: [8, 4, 2, 4] },// 点划线 — 方案4
  { color: "#8b5cf6", dashPattern: [20, 4, 2, 4]} // 长划-点 — 方案5
]
PLUGIN_MAP       = { driving: { plugin: "AMap.Driving", klass: "AMap.Driving" }, ... }
```

- `ORIGIN_COLORS`：单路线模式下，不同起点的路线用不同颜色区分（取模循环）
- `SUB_ROUTE_STYLES`：多路线模式下，同一起点的多条备选路线用不同颜色+线型区分（取模循环）

#### `calculateRoute(origin, destination, mode)` — 单次路线计算

核心计算函数，通过 `RateLimiter(500ms)` 节流：

1. `AMap.plugin(pluginConfig.plugin, callback)` 异步加载插件
2. 动态解析构造函数：`pluginConfig.klass.split(".").reduce((obj, key) => obj[key], window)` → 得到 `AMap.Driving` 等类
3. 构造选项：driving 设 `LEAST_TIME` 策略；transit 必须设 `city` 参数（fallback: `destination.city || origin.city || "北京"`）
4. 实例化 Service 并调用 `search(origin, destination, callback)`

**路径字段差异解析**（关键坑点）：

| 模式 | 结果字段 | 路径提取方式 |
|---|---|---|
| driving / walking | `result.routes[]` | `route.steps[].path` |
| bicycling | `result.routes[]` | `route.rides[].path`（注意不是 steps） |
| transit | `result.plans[]` | 遍历 `segments[]`，合并 `walking.steps[].path` + `transit.path` |

返回 routes 数组（同一 OD 对可能返回多条备选路线），每条包含 `{ mode, distance, duration, path }`。

#### `calculateRoutesToDestination(destination, originIndices)` — 批量计算

1. 获取起点列表：按 `originIndices` 索引从 `locationManager.getAllLocations()` 取值
2. 过滤：排除空列表、排除与目的地同坐标的起点（容差 0.0001）
3. 双层循环：遍历每个起点 × 每种交通模式 → `calculateRoute()`
4. 错误处理：`NO_DATA` 错误静默（如偏远地区无公交路线），其他错误 `console.warn`
5. 组装结果对象：`{ origin, routes: { driving:[], transit:[], walking:[], bicycling:[] }, activeRouteIndex, hasError }`
6. 存储到 `currentResults[]` 和 `currentDestination`

#### 渲染体系

**`renderResultsPanel(destination, results, activeMode)`** — 总入口：
1. 关闭旧的原生详情面板
2. 重置多路线模式（checkbox 取消勾选）
3. 更新目的地显示区域（名称+地址）
4. 调用 `renderModeSwitchBar()` 渲染交通模式按钮栏
5. 调用 `renderRouteList()` 渲染路线列表

**`renderModeSwitchBar()`**：
- 渲染 4 个模式按钮：有数据=可点击（激活时带模式颜色），无数据=灰色禁用
- 渲染多路线 checkbox 开关（有结果时显示，无结果时隐藏）
- 按钮点击事件：更新 `activeMode` → 重渲染按钮栏 → 重渲染列表 → `switchTransportMode()`

**`renderRouteList(results, mode)`**：
- 过滤出当前模式有数据的结果
- 渲染可折叠分组：每组 = 起点名称 header + 子路线卡片列表
- 子路线卡片显示：方案编号、颜色圆点、距离、耗时
- 分组 header 显示：折叠图标、起点名称、"模式 N条"、详情按钮（仅单路线模式）
- 绑定三种事件：
  - header 点击 → 折叠/展开（单路线独立折叠，多路线手风琴）
  - 子卡片点击 → 单路线切换 active，多路线 toggle 高亮
  - 详情按钮点击 → 打开/关闭原生路线详情面板

#### 单/多路线模式

**`switchTransportMode(mode)`**：
1. 更新 `activeMode`
2. 关闭原生详情面板
3. 清除旧折线（`currentRouteLines` 逐条 remove）
4. 统计当前模式可渲染的路线数
5. 调用 `_renderOverviewRoutes(mode)` 重绘

**`setMultiRouteMode(enabled)`**：
1. 更新 `multiRouteMode` 布尔值
2. 关闭原生详情面板、清除高亮和手风琴状态
3. 清除并重绘折线
4. 重新渲染列表（详情按钮在多路线模式下隐藏）

**`_renderOverviewRoutes(mode)`** — 核心渲染函数：

- **单路线模式**：遍历 `currentResults`，每个起点渲染 `activeRouteIndex[mode]` 指向的那条路线
  - 颜色：`ORIGIN_COLORS[index % 6]`
  - 样式：`strokeWeight: 6, strokeOpacity: 0.8`
  - 折线存储 `_routeIndex` 标记用于后续替换

- **多路线模式**：仅渲染 `_expandedGroupIndex` 指向的那组的所有子路线
  - 颜色+线型：`SUB_ROUTE_STYLES[subRouteIdx % 5]`
  - 高亮路线：`strokeWeight: 8, strokeOpacity: 1.0, zIndex: 60`
  - 非高亮：`strokeWeight: 4, strokeOpacity: 0.7, zIndex: 50`
  - 无展开组时地图为空

**子卡片点击行为**：

- 单路线模式：切换 `activeRouteIndex[mode]` → 查找并替换对应 `_routeIndex` 的折线 → 重渲染列表
- 多路线模式：toggle `_highlightedRoute`（点击同一卡片取消高亮）→ 清除并重绘所有折线 → 重渲染列表

**折叠行为**：

- 单路线模式：独立折叠，CSS `hidden` 切换 + 图标 ▼/▶
- 多路线模式：手风琴，`_expandedGroupIndex` 仅允许一组展开。展开/折叠时清除旧折线 → `_renderOverviewRoutes()` 重绘（因为多路线模式下地图只显示展开组的路线）

#### 原生路线详情面板

**`_showNativeRoutePanel(mode, resultIndex)`**：
1. 关闭旧面板（`_closeRoutePanelOnly()` 仅关闭不清除概览折线逻辑）
2. 清除概览折线（原生面板会自己画路线）
3. 显示 `routeDetailPanelWrapper`，设置标题
4. `AMap.plugin()` 加载插件（transit 额外加载 `AMap.Adaptor`）
5. 创建带 `map` + `panel: "routeDetailPanel"` + `autoFitView` 参数的 Service 实例
6. 调用 `search()` → 高德原生面板自动渲染路线详情（方案 Tab、逐步指引、地图路线）
7. 存储 `_routeDetailService` 和 `_routeDetailResultIndex`

**`hideRouteDetailPanel()`**：
1. `_closeRoutePanelOnly()`：隐藏 wrapper + `service.clear()` + 置空引用
2. 如有结果，清除旧折线 → `_renderOverviewRoutes()` 恢复概览路线

---

### 3.5 ui.js — 界面管理器

#### 地点列表渲染 `renderMyLocations()`

每个地点渲染为一个卡片行：
- **checkbox**：`.my-loc-checkbox`，`data-index` 存储索引，用于路线计算时选择起点
- **名称**：地址去重处理——如果 `name` 以 `address` 开头，截取 address 之后的部分作为 `displayName`
- **地址**：`loc.address || "地址不详"`
- **删除按钮**：绑定 `handleRemoveLocation(index)`

空状态：SVG 地图图标 + "点击地图上的 POI 添加地点" 提示

#### 删除操作 `handleRemoveLocation(index)`

1. `locationManager.removeLocation(index)` 删除数据
2. `mapManager.removeMyLocationMarker(index)` 移除地图标记
3. 派发 `locationRemoved` 事件（触发 main.js 的持久化+重算逻辑）
4. `renderMyLocations()` 重渲染

#### 清空操作 `handleClearAll()`

1. 检查是否有地点可清空
2. `confirm("确定清空所有收藏地点吗？此操作不可恢复。")` 二次确认
3. `routeManager.resetState()` 重置路线状态（关闭面板、清除折线、重置多路线模式）
4. `mapManager.clearAllMyLocationMarkers()` + `clearRouteLines()` 清除地图覆盖物
5. `locationManager.clearAll()` 清空数据+localStorage
6. `renderMyLocations()` + `showEmptyState()` 重渲染

#### `getSelectedLocationIndices()`

查询所有 `.my-loc-checkbox:checked`，提取 `data-index` 转为整数数组。供 main.js 在 `destinationSet` 事件中使用。

#### 帮助弹窗 `initHelpModal()`

- **三个 Tab**：功能概述 / 操作指南 / 视频教程
- **Tab 切换**：点击按钮 → 更新按钮样式（border-blue-500 vs border-transparent）→ 显示/隐藏对应 content
- **关闭方式**：关闭按钮、点击遮罩层（`e.target === modal`）、ESC 键

#### `showEmptyState()`

隐藏目的地显示区域、清空路线列表（显示提示文字）、清空模式按钮、隐藏多路线开关。

---

### 3.6 utils.js — 工具函数

#### `showToast(message, type)`

创建 `div` 元素 → 添加到 `#toastContainer` → 300ms 后渐入（移除 `opacity-0 translate-y-2`）→ 3s 后渐出移除。

四种类型对应颜色：success(绿)/error(红)/warning(黄)/info(蓝)

#### `RateLimiter(limitInterval)`

队列式节流器，核心机制：

```
execute(fn)        → 将 { fn, resolve, reject } 入队 → 调用 processQueue()
processQueue()     → 检查距上次执行是否 ≥ limitInterval
                   → 是：shift 队首，执行 fn()，setTimeout(processQueue, limitInterval)
                   → 否：setTimeout(processQueue, 剩余等待时间)
```

当前使用两处：
- **POI 搜索**（map.js）：`new RateLimiter(500)` — 逆地理编码 500ms 间隔
- **路线计算**（route.js）：`new RateLimiter(500)` — 路线规划 500ms 间隔

**规则**：所有高德 API 异步调用必须通过 `rateLimiter.execute(fn)` 包装。

#### `formatDistance(meters)`

- ≥ 1000m：`"X.X km"`（保留一位小数）
- < 1000m：`"X m"`（四舍五入整数）

#### `formatDuration(seconds)`

- 有小时：`"X小时Y分钟"`
- 仅分钟：`"X分钟"`



---

## 4. 关键设计决策

### 4.1 Hotspot 交互机制

**背景**：需要在用户右键地图 POI 时弹出信息窗，但高德 API 的 `rightclick` 事件不直接携带 POI 信息。

**方案**：使用事件驱动缓存——`hotspotover` 事件缓存当前悬停的 POI 数据 `{ name, id, lnglat }` 到 `_hotspotCache`，`hotspotout` 事件立即清除缓存为 `null`。`rightclick` 时仅检查缓存是否存在。

**原因**：相比 500ms 时间窗口方案（记录 hotspotover 时间戳，rightclick 时判断时间差），事件驱动方式更可靠，避免了竞态条件——用户快速移动鼠标时，时间窗口可能已过期但鼠标仍在 POI 上，或者时间窗口未过期但鼠标已移到其他区域。

**附带决策**：右键使用 hotspot 缓存的 POI 坐标（`_hotspotCache.lnglat`）而非鼠标点击坐标（`e.lnglat`），因为鼠标位置与 POI 实际地理坐标可能存在偏移，使用 POI 坐标确保标记位置准确。

### 4.2 多路线视觉区分

**背景**：多路线模式下需要在地图上同时展示同一出发地的多条备选路线，用户需要能直观区分哪条线对应哪个方案。

**方案**：颜色 + 线型双重编码，通过 `SUB_ROUTE_STYLES` 常量定义 5 种样式：

| 方案 | 颜色 | 线型 | dashPattern |
|---|---|---|---|
| 方案1 | 红 `#ef4444` | 实线 | `null` |
| 方案2 | 蓝 `#3b82f6` | 长虚线 | `[12, 6]` |
| 方案3 | 绿 `#22c55e` | 短虚线（点状） | `[4, 8]` |
| 方案4 | 橙 `#f59e0b` | 点划线 | `[8, 4, 2, 4]` |
| 方案5 | 紫 `#8b5cf6` | 长划-点 | `[20, 4, 2, 4]` |

通过 `subRouteIdx % 5` 取模实现任意数量子路线的自动映射。列表卡片左侧的颜色圆点与地图折线颜色严格对应。

**原因**：单靠颜色在路线密集或重叠时难以区分，单靠线型视觉对比不够强烈。双重编码确保色觉障碍用户也能通过线型区分方案。

### 4.3 单/多路线模式切换

**背景**：用户需要对比同一出发地的多条备选路线，也需要简洁的概览视图。

**方案**：通过 checkbox 开关（而非 toggle 按钮）切换两种模式：

- **单路线模式**（默认）：地图仅渲染每个起点的 `activeRouteIndex` 指向的单条路线。分组 header 显示"详情"按钮，可打开高德原生路线详情面板。各起点路线独立折叠。
- **多路线模式**：地图渲染展开组的所有子路线（颜色+线型区分）。隐藏"详情"按钮。采用手风琴折叠（`_expandedGroupIndex` 仅允许一组展开），切换展开组时清除并重绘折线。

**原因**：
- Checkbox 语义上更明确表达"开/关"状态，且在不同浏览器中渲染一致
- 手风琴折叠避免多组路线同时渲染导致地图折线过多、视觉混乱
- 多路线模式隐藏详情按钮，因为详情面板会重新绘制路线，与多路线概览冲突

### 4.4 路线卡片交互职责分离

**背景**：同一个子路线卡片在两种模式下需要不同的交互行为。

**方案**：

- **单路线模式**：点击卡片 → 切换 `activeRouteIndex[mode]` → 替换该起点的地图折线（颜色不变，路线变）
- **多路线模式**：点击卡片 → toggle `_highlightedRoute` → 加粗（8px/1.0 opacity）或恢复（4px/0.7）对应折线。再次点击同一卡片取消高亮

**原因**：单路线模式下用户关注"选哪条路线看"，多路线模式下用户关注"高亮哪条做对比"。行为分离避免模式混淆，降低用户认知负担。

### 4.5 POI 统一信息窗

**背景**：地图上有多种 POI 交互场景——地图原生 hotspot 右键、已收藏 marker 附近右键——需要统一的交互入口。

**方案**：所有 POI 交互统一为自定义 DOM 信息窗弹窗，包含：
- 关闭按钮
- POI 名称 + 地址
- "添加到我的地点"按钮（已收藏则显示"已添加 ✓"并 disabled）
- "设为目的地"按钮（无收藏地点时 toast 提示）

信息窗通过绝对定位 DOM 元素覆盖在地图容器上，监听 `move`/`zoom` 事件实时跟随。

**原因**：相比高德原生 `AMap.InfoWindow`，自定义 DOM 元素可以自由控制样式和交互逻辑（如按钮禁用态、Tailwind 风格统一），且更容易实现复杂的按钮事件绑定。

### 4.6 原生路线详情面板

**背景**：路线详情需要展示逐步导航指引（转弯方向、公交站名、换乘信息等），自行渲染工作量大且难以覆盖所有交通模式。

**方案**：复用高德原生路线面板——创建带 `map` + `panel: "routeDetailPanel"` 参数的 Service 实例，高德自动在该 DOM 容器中渲染完整路线详情（含方案切换 Tab、逐步指引、地图路线绘制）。

关闭面板时调用 `service.clear()` 清除原生路线和高亮，然后恢复概览折线（`_renderOverviewRoutes()`）。

**原因**：原生面板已覆盖所有四种交通模式的详情渲染，提供公交换乘方案切换、步行导航指引等复杂交互。自行实现成本高、维护负担大，且难以保证与高德 API 升级兼容。

### 4.7 localStorage 持久化策略

**背景**：需要决定哪些状态需要跨页面刷新保留。

**方案**：仅收藏地点（`locations[]`）通过 localStorage 持久化（key: `mapdemo_my_locations`）。路线计算结果、目的地、交通模式、多路线开关、折叠状态等全部为纯内存状态。

**原因**：
- 地点是用户的长期数据，值得保留
- 路线状态依赖于当前目的地和操作上下文，刷新后重新设置更符合用户预期
- 路线计算结果体积较大且有过期风险（路况变化），不适合持久化
- localStorage 容量有限（约 5MB），路线数据可能占用过多空间

---

## 5. 高德 API 集成指南

### 5.1 插件加载方式

所有高德插件通过 `AMap.plugin("PluginName", callback)` 异步加载。路线规划插件的类名通过 `PLUGIN_MAP` 静态映射配置，动态解析构造函数：

```javascript
// PLUGIN_MAP 映射
static PLUGIN_MAP = {
  driving:   { plugin: "AMap.Driving",   klass: "AMap.Driving" },
  transit:   { plugin: "AMap.Transfer",  klass: "AMap.Transfer" },
  walking:   { plugin: "AMap.Walking",   klass: "AMap.Walking" },
  bicycling: { plugin: "AMap.Riding",    klass: "AMap.Riding" },
};

// 动态解析构造函数
const ServiceClass = pluginConfig.klass
  .split(".").reduce((obj, key) => obj[key], window);
const service = new ServiceClass(options);
```

#### 已使用的插件清单

| 插件 | 用途 | 加载位置 |
|---|---|---|
| `AMap.Geolocation` | 用户定位 | map.js `init()` |
| `AMap.MapType` | 标准/卫星图层切换 | map.js `init()` |
| `AMap.ToolBar` | 缩放+定位按钮 | map.js `init()` |
| `AMap.AutoComplete` | 搜索栏自动补全 | map.js `initSearchBar()` |
| `AMap.Geocoder` | 逆地理编码 | map.js `reverseGeocodeForAddress()` |
| `AMap.PlaceSearch` | POI 搜索 | location.js `searchLocation()` |
| `AMap.Driving` | 驾车路线规划 | route.js |
| `AMap.Transfer` | 公交路线规划 | route.js |
| `AMap.Walking` | 步行路线规划 | route.js |
| `AMap.Riding` | 骑行路线规划 | route.js |
| `AMap.Adaptor` | 公交面板样式适配 | route.js（仅 transit 详情面板） |

### 5.2 路线规划插件速查表

| 模式 | 插件名 | 类名 | 路径字段 | 特殊参数 |
|---|---|---|---|---|
| 驾车 | `AMap.Driving` | `AMap.Driving` | `result.routes[].steps[].path` | `policy: AMap.DrivingPolicy.LEAST_TIME` |
| 公交 | `AMap.Transfer` | `AMap.Transfer` | `result.plans[].segments[].transit.path` + `walking.steps[].path` | **`city` 必填**，`policy: AMap.TransferPolicy.LEAST_TIME` |
| 步行 | `AMap.Walking` | `AMap.Walking` | `result.routes[].steps[].path` | 无 |
| 骑行 | `AMap.Riding` | `AMap.Riding` | `result.routes[].rides[].path` | 无 |

### 5.3 常见坑点

#### 坑点 1：插件名不含 "Search" 后缀

高德 JS API 2.0 中路线规划插件名为 `AMap.Driving`（非 `AMap.DrivingSearch`）、`AMap.Transfer`（非 `AMap.TransitSearch`）、`AMap.Walking`（非 `AMap.WalkingSearch`）、`AMap.Riding`（非 `AMap.BicyclingSearch`）。

插件名错误会导致 `AMap.plugin()` 静默加载失败，后续类引用为 `undefined`，`new` 时抛出 `"not a constructor"` 错误。

#### 坑点 2：`AMap.Transfer` 的 `city` 参数必填

公交换乘服务必须指定城市名称，缺失将导致查询始终返回 `no_data`。代码中使用 fallback 链：

```javascript
options.city = destination.city || origin.city || "北京";
```

#### 坑点 3：骑行路径字段是 `rides` 而非 `steps`

驾车和步行的路径坐标在 `route.steps[i].path`，但骑行在 `route.rides[i].path`。混用会导致路径为空数组，折线不渲染。

#### 坑点 4：公交结果在 `plans` 而非 `routes`

公交查询结果的结构与其他模式完全不同：
- 其他模式：`result.routes[]`
- 公交：`result.plans[]`

每个 plan 包含 `segments[]`，每个 segment 需要分别提取 `walking.steps[].path`（步行段）和 `transit.path`（公交/地铁段）并合并。

#### 坑点 5：右键坐标偏移

右键添加地点必须使用 hotspot 缓存的 POI 坐标（`_hotspotCache.lnglat`），不能使用鼠标点击坐标（`e.lnglat`）。鼠标位置与 POI 实际地理坐标可能存在偏移，使用鼠标坐标会导致标记位置不准确。

#### 坑点 6：安全配置顺序

`window._AMapSecurityConfig` 必须在高德 API `<script>` 标签**之前**声明，否则安全校验不生效：

```html
<!-- 正确顺序 -->
<script>window._AMapSecurityConfig = { securityJsCode: "..." };</script>
<script src="https://webapi.amap.com/maps?v=2.0&key=..."></script>
```

### 5.4 速率限制策略

使用 `RateLimiter` 类（队列式节流器）保护 API 调用，避免触发高德频率限制：

| 场景 | 实例位置 | 间隔 | 用途 |
|---|---|---|---|
| POI 搜索 | map.js `poiRateLimiter` | 500ms | 逆地理编码 |
| 路线计算 | route.js `rateLimiter` | 500ms | 路线规划 |

**使用规则**：所有高德 API 异步调用必须通过 `rateLimiter.execute(fn)` 包装，`fn` 返回 Promise。`RateLimiter` 内部维护队列，按 `limitInterval` 间隔逐个执行，自动处理排队等待。

```javascript
// 正确用法
const result = await rateLimiter.execute(() => {
  return new Promise((resolve, reject) => {
    service.search(origin, destination, (status, result) => {
      if (status === "complete") resolve(result);
      else reject(new Error("failed"));
    });
  });
});
```

### 5.5 API Key 与安全配置

配置在 `index.html` 中：

```html
<!-- 安全码必须在 API script 之前 -->
<script type="text/javascript">
  window._AMapSecurityConfig = {
    securityJsCode: "7ab0ed26880ef99bbf68311a88796ca0"
  };
</script>
<!-- API Key -->
<script src="https://webapi.amap.com/maps?v=2.0&key=44abb82d7e642da458d0d24b6a5a4f42"></script>
```

**注意事项**：
- API Key 和安全码不应提交到公开仓库
- 部署时需替换为用户自己的 Key（从 https://lbs.amap.com/ 申请）
- `utils.js` 中有 `AMAP_API_KEY` 占位常量，但实际 Key 配置在 HTML 中
