# MapFlow 开发者文档设计

## 概述

为 MapFlow 项目编写一份面向开发团队内部的综合技术文档，涵盖架构设计、代码级业务逻辑、关键设计决策、高德 API 集成指南四个方面。采用"分层递进式"结构，从宏观到微观逐层深入，兼顾全局理解和局部查阅。

文档保存位置：`docs/MapFlow-开发者文档.md`（项目根目录下 docs/ 文件夹，单个完整文档）。

---

## 第1节：项目概览

简要介绍项目定位和基本信息，给新人快速全局认知。

### 内容要点

- **项目名称**：MapFlow — 多点路径规划工具
- **定位**：基于高德地图 JS API v2.0 的纯前端单页应用，支持多地点收藏、多模式路线计算、单/多路线对比渲染
- **技术栈**：Vanilla JS（无框架）、ES Modules、Tailwind CSS（CDN）、Vite（仅构建）、高德地图 JS API v2.0
- **运行命令**：`npm run dev`（开发服务器 localhost:3000）、`npm run build`（构建）、`npm run preview`（预览）
- **文件结构表**：

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

## 第2节：架构设计

覆盖宏观架构，说明模块划分、通信机制、数据流、状态管理。

### 2.1 模块划分与职责

表格形式列出每个模块的：
- 核心职责（一句话概括）
- 持有的状态数据（关键属性）
- 对外暴露的关键方法

| 模块 | 核心职责 | 核心状态 | 关键方法 |
|---|---|---|---|
| `MapManager` | 地图实例生命周期、Marker/折线 CRUD、POI 交互 | `markers[]`, `routeLines[]`, `destinationMarker`, `poiInfoWindow`, `_hotspotCache` | `init()`, `addMyLocationMarker()`, `addDestinationMarker()`, `showPoiInfoWindow()`, `addRouteLine()`, `clearRouteLines()` |
| `LocationManager` | 地点数据管理、持久化 | `locations[]` | `addLocation()`, `removeLocation()`, `clearAll()`, `hasLocation()`, `saveToStorage()`, `loadFromStorage()` |
| `RouteManager` | 路线计算、结果渲染、模式切换 | `currentResults[]`, `currentDestination`, `activeMode`, `multiRouteMode`, `_expandedGroupIndex`, `_highlightedRoute`, `currentRouteLines[]` | `calculateRoute()`, `calculateRoutesToDestination()`, `switchTransportMode()`, `setMultiRouteMode()`, `renderResultsPanel()`, `_showNativeRoutePanel()` |
| `UIManager` | DOM 渲染与事件绑定 | DOM 引用缓存 | `renderMyLocations()`, `handleRemoveLocation()`, `handleClearAll()`, `showEmptyState()`, `getSelectedLocationIndices()` |
| `utils.js` | 纯工具函数 | 无状态 | `showToast()`, `RateLimiter`, `formatDistance()`, `formatDuration()` |

### 2.2 单例模式

每个 `src/` 文件导出一个单例实例（`new ClassName()` 后 `export const`），全局唯一。模块间通过 import 引用单例，不创建新实例。`utils.js` 例外，导出命名函数和类。

### 2.3 模块间通信（CustomEvent）

模块间通过 `window.dispatchEvent(new CustomEvent(...))` 解耦通信，不直接方法调用。列出事件清单：

| 事件名 | 触发者 | 监听者 | 携带数据 | 触发时机 |
|---|---|---|---|---|
| `locationAdded` | map.js（信息窗添加按钮） | main.js | `{ location }` | 用户点击"添加到我的地点" |
| `locationRemoved` | ui.js（删除按钮） | main.js | `{ index, location }` | 用户点击删除按钮 |
| `destinationSet` | map.js（信息窗目的地按钮） | main.js | `{ destination }` | 用户点击"设为目的地" |
| `locationsCleared` | location.js（clearAll） | — | `{ count }` | 用户确认清空所有地点 |

### 2.4 核心数据流

完整描述从用户操作到界面响应的链路：

1. 用户右键地图 POI → `hotspotover` 缓存 POI 数据 → `rightclick` 事件判断缓存存在 → 调用 `reverseGeocodeForAddress()` 逆地理编码获取地址 → 弹出 `showPoiInfoWindow()` 信息窗
2. 用户点击"添加到我的地点" → `locationManager.addLocation()` 去重校验 → `mapManager.addMyLocationMarker()` 创建蓝色标记 → 派发 `locationAdded` 事件 → main.js 监听：`saveToStorage()` + `renderMyLocations()`
3. 用户点击"设为目的地" → 派发 `destinationSet` 事件 → main.js 监听：校验 checkbox 选中数量（1-5）→ 跳过同坐标 → `mapManager.clearRouteLines()` 清除旧路线 → `mapManager.addDestinationMarker()` 创建红色标记 → `routeManager.calculateRoutesToDestination()` 批量计算路线 → `renderResultsPanel()` 渲染右侧面板 → `switchTransportMode()` 绘制地图折线
4. 用户切换交通模式 → `renderModeSwitchBar()` 更新按钮样式 → `renderRouteList()` 更新列表 → `switchTransportMode()` 重绘地图折线
5. 用户删除地点 → `locationManager.removeLocation()` → `mapManager.removeMyLocationMarker()` → 派发 `locationRemoved` → main.js 监听：持久化 + 重渲染 + 如有目的地则重新计算路线

### 2.5 状态管理

各模块持有的核心状态及其生命周期：

- **`markers[]`**（map.js）：`{ marker: AMap.Marker, location: object }` 对象数组，与 `locations[]` 索引对应
- **`locations[]`**（location.js）：扁平地点列表，通过 localStorage 跨页持久化（key: `mapdemo_my_locations`）
- **`currentResults[]`**（route.js）：路线计算结果，结构为 `{ origin, routes: { driving, transit, walking, bicycling }, activeRouteIndex, hasError }`
- **`currentDestination`**（route.js）：当前目的地对象
- **`multiRouteMode`**（route.js）：布尔值，控制单/多路线渲染模式
- **`_expandedGroupIndex`**（route.js）：多路线模式下仅展开一组的索引（手风琴）
- **`_highlightedRoute`**（route.js）：`{ groupIndex, subRouteIdx }` 高亮的子路线

路线状态（`currentResults`、`currentDestination` 等）为纯内存数据，页面刷新后丢失；仅 `locations[]` 通过 localStorage 持久化。

### 2.6 三栏布局与响应式

- 桌面端：左（240px 地点面板）/ 中（flex:1 地图）/ 右（420px 路线面板），左右面板通过拖拽 handle 调整宽度（左 180-500px，右 300-700px），拖拽时调用 `mapManager.refreshSize()` 通知地图重排
- 移动端（≤1024px）：降级为纵向堆叠，隐藏拖拽 handle，面板全宽

---

## 第3节：模块详解

逐个模块做代码级解读，每个模块包含职责、核心状态、关键方法说明、重要代码逻辑。

### 3.1 main.js — 入口与事件总线

**启动流程** `initApp()`：
1. `mapManager.init()` 初始化地图（含插件加载、定位、搜索栏）
2. `initResizeHandles()` 绑定三栏拖拽事件
3. `locationManager.loadFromStorage()` 恢复收藏地点 → 逐个创建标记 → 渲染列表
4. 注册事件监听：`locationAdded`、`locationRemoved`、`destinationSet`

**事件监听逻辑**：
- `destinationSet`：获取 `getSelectedLocationIndices()` → 校验数量（1-5）→ 跳过同坐标目的地 → `clearRouteLines()` → `addDestinationMarker()` → `calculateRoutesToDestination()` → `renderResultsPanel()` → `switchTransportMode()`
- `locationRemoved`：持久化 + 重渲染 + 如有目的地则重算路线
- `locationAdded`：持久化 + 重渲染

**`initResizeHandles()`**：mousedown/mousemove/mouseup 拖拽实现，限制宽度范围，拖拽中设置 `body.resizing` 类禁用文字选择。

### 3.2 map.js — 地图管理器

**地图初始化** `init()`：
- 创建 `AMap.Map` 实例（zoom:11, center:北京）
- 加载插件：`AMap.Geolocation`（定位）、`AMap.MapType`（图层切换）、`AMap.ToolBar`（缩放+定位按钮）
- 调用 `initSearchBar()`（AutoComplete 搜索框）和 `initPoiClickListener()`（POI 交互）

**POI 交互链路** `initPoiClickListener()`：
- 禁用默认右键菜单
- `hotspotover` 事件：缓存 `{ name, id, lnglat }` 到 `_hotspotCache`
- `hotspotout` 事件：清除 `_hotspotCache = null`
- `rightclick` 事件三路分支：
  1. `getNearMarkerData()` 检测近 marker（20px 容差）→ 显示已收藏 POI 信息窗
  2. `_hotspotCache` 存在 → `reverseGeocodeForAddress()` 逆地理编码 → 显示新 POI 信息窗
  3. 空白区域 → 无操作

**`reverseGeocodeForAddress(lnglat, poiName)`**：
- 通过 RateLimiter(500ms) 节流
- 调用 `AMap.Geocoder.getAddress()` 逆地理编码
- 从返回的 `pois[]` 中选取距离点击位置最近的 POI 获取地址
- 组装 `poiData` 对象（name/address/latitude/longitude）→ `showPoiInfoWindow()`

**`showPoiInfoWindow(lnglat, poiData)`**：
- 创建 DOM div 元素，绝对定位覆盖在地图容器上
- 包含：关闭按钮、POI 名称、地址、"添加到我的地点"按钮（已收藏则禁用）、"设为目的地"按钮
- 位置跟随：监听 map 的 `move`/`zoom` 事件实时更新 `left/top`
- 添加/目的地按钮事件分别调用 `locationManager.addLocation()` 和派发 `destinationSet` 事件

**Marker 管理**：
- `addMyLocationMarker(location)`：蓝色 SVG 图钉（#3b82f6），hover 显示 InfoWindow（名称+地址）
- `addDestinationMarker(location)`：红色 SVG 图钉（#ef4444），hover 显示目的地 InfoWindow，替换旧目的地标记
- `removeMyLocationMarker(index)` / `clearAllMyLocationMarkers()`：移除标记并从 `markers[]` 数组删除

**路线折线**：
- `addRouteLine(path, color, width, opacity)`：创建 Polyline 并加入 `routeLines[]`
- `clearRouteLines()`：批量移除所有路线折线

### 3.3 location.js — 地点管理器

**数据结构**：扁平数组 `locations[]`，每项包含 `{ name, address, latitude, longitude, city, district }`。

**约束**：`MAX_LOCATIONS = 20`，超出则 toast 提示。

**持久化**：
- `saveToStorage()`：序列化 `locations[]` 到 `localStorage`（key: `mapdemo_my_locations`）
- `loadFromStorage()`：从 localStorage 反序列化，截取前 20 条

**去重判断** `hasLocation(lat, lng)`：坐标容差 `TOLERANCE = 0.0001`（约 10m），在此范围内视为同一地点。

**CRUD 操作**：
- `addLocation(location)`：容量检查 → 去重检查 → push + toast
- `removeLocation(index)`：splice 删除 + toast，返回被删对象
- `clearAll()`：清空数组 + 移除 localStorage + 派发 `locationsCleared` 事件

### 3.4 route.js — 路线管理器

**常量体系**：
- `TRANSPORT_MODES`：driving/transit/walking/bicycling 四种模式
- `MODE_NAMES`：中文显示名（自驾/公交/步行/骑行）
- `MODE_COLORS`：模式按钮颜色
- `ORIGIN_COLORS`：起点路线颜色（红/蓝/绿/紫/橙/青），用于单路线模式下区分不同起点
- `SUB_ROUTE_STYLES`：子路线样式（颜色+虚线 pattern），用于多路线模式下同组路线区分
- `PLUGIN_MAP`：模式 → 高德插件名/类名映射

**`calculateRoute(origin, destination, mode)`**：
- 通过 `RateLimiter(500ms)` 节流
- `AMap.plugin()` 异步加载对应插件
- 动态解析构造函数：`pluginConfig.klass.split(".").reduce((obj, key) => obj[key], window)`
- 模式特殊处理：driving 设 `LEAST_TIME` 策略；transit 必须设 `city` 参数
- **路径字段差异解析**（核心坑点）：
  - driving/walking：`result.routes[].steps[].path`
  - bicycling：`result.routes[].rides[].path`
  - transit：`result.plans[]` → 遍历 `segments[]` → 合并 `walking.steps[].path` + `transit.path`
- 返回 routes 数组（同一 OD 对可能有多条备选路线）

**`calculateRoutesToDestination(destination, originIndices)`**：
- 过滤：排除空起点、排除与目的地同坐标的起点
- 遍历每个起点 × 每种交通模式 → 调用 `calculateRoute()`
- 组装结果：`{ origin, routes: { driving: [], transit: [], walking: [], bicycling: [] }, activeRouteIndex, hasError }`
- 存储到 `currentResults[]` 和 `currentDestination`

**渲染体系**：
- `renderResultsPanel(destination, results, activeMode)`：总入口 → 更新目的地显示 → `renderModeSwitchBar()` → `renderRouteList()`
- `renderModeSwitchBar()`：渲染交通模式按钮（有数据=可点击+颜色，无数据=灰色禁用）+ 多路线 checkbox 开关
- `renderRouteList(results, mode)`：渲染可折叠的路线分组列表，每组含子路线卡片（方案1/2/3...），绑定折叠/展开、卡片点击、详情按钮事件

**单/多路线模式**：
- `switchTransportMode(mode)`：切换模式 → 关闭详情面板 → 清除旧折线 → `_renderOverviewRoutes(mode)` 重绘
- `setMultiRouteMode(enabled)`：切换模式 → 清除高亮/手风琴状态 → 重绘折线 + 重渲染列表
- `_renderOverviewRoutes(mode)`：核心渲染函数，根据 `multiRouteMode` 分支：
  - 单路线：每个起点渲染 `activeRouteIndex` 指向的那条路线，使用 `ORIGIN_COLORS` 着色
  - 多路线：仅渲染 `_expandedGroupIndex` 指向的那组的所有子路线，使用 `SUB_ROUTE_STYLES` 着色+虚线，高亮路线加粗

**交互**：
- 单路线模式：点击子卡片 → 切换 `activeRouteIndex` → 替换该起点的折线
- 多路线模式：点击子卡片 → toggle `_highlightedRoute` → 重绘折线（高亮加粗 8px/1.0 opacity，非高亮 4px/0.7）
- 折叠：单路线模式独立折叠；多路线模式手风琴（`_expandedGroupIndex` 仅允许一组展开），展开/折叠时清除并重绘折线

**原生路线详情面板**：
- `_showNativeRoutePanel(mode, resultIndex)`：复用高德原生面板（创建带 `map` + `panel` 参数的 Service 实例），原生面板自动处理路线绘制和步骤展示
- `hideRouteDetailPanel()`：关闭面板 → `service.clear()` 清除原生路线 → 恢复概览路线

### 3.5 ui.js — 界面管理器

**地点列表渲染** `renderMyLocations()`：
- 每个地点渲染为：checkbox + 名称（地址去重：如 name 以 address 开头则截取后缀）+ 地址 + 删除按钮
- 空状态：SVG 图标 + 提示文字

**删除操作** `handleRemoveLocation(index)`：
- `locationManager.removeLocation(index)` → `mapManager.removeMyLocationMarker(index)` → 派发 `locationRemoved` → `renderMyLocations()`

**清空操作** `handleClearAll()`：
- `confirm()` 二次确认 → `routeManager.resetState()` → `mapManager.clearAllMyLocationMarkers()` + `clearRouteLines()` → `locationManager.clearAll()` → 重渲染 + `showEmptyState()`

**帮助弹窗** `initHelpModal()`：
- 三个 Tab（功能概述/操作指南/视频教程），Tab 切换样式控制
- 关闭方式：关闭按钮、点击遮罩层、ESC 键

**`getSelectedLocationIndices()`**：从 checkbox 选中状态提取索引数组。

**`showEmptyState()`**：隐藏目的地显示、清空路线列表、清空模式按钮、隐藏多路线开关。

### 3.6 utils.js — 工具函数

- **`showToast(message, type)`**：创建 div → 添加到 `toastContainer` → 300ms 后渐入 → 3s 后渐出移除。四种类型颜色：success(绿)/error(红)/warning(黄)/info(蓝)
- **`RateLimiter(limitInterval)`**：队列式节流器。`execute(fn)` 将函数入队，`processQueue()` 按间隔逐个执行。当前使用两处：POI 搜索 500ms、路线计算 500ms
- **`formatDistance(meters)`**：≥1000m 显示 "X.X km"，否则 "X m"
- **`formatDuration(seconds)`**：有小时则 "X小时Y分钟"，否则 "X分钟"

---

## 第4节：关键设计决策

每个决策采用"背景 → 方案 → 原因"结构。

### 4.1 Hotspot 交互机制

**背景**：需要在用户右键地图 POI 时弹出信息窗，但高德 API 的 `rightclick` 事件不直接携带 POI 信息。

**方案**：使用事件驱动缓存——`hotspotover` 事件缓存当前悬停的 POI 数据到 `_hotspotCache`，`hotspotout` 事件立即清除缓存。`rightclick` 时仅检查缓存是否存在。

**原因**：相比 500ms 时间窗口方案，事件驱动方式更可靠，避免了竞态条件（用户快速移动鼠标时缓存已过期但仍在 POI 上）。同时，右键使用 hotspot 缓存的 POI 坐标而非鼠标点击坐标，因为鼠标坐标与 POI 实际位置可能存在偏移。

### 4.2 多路线视觉区分

**背景**：多路线模式下需要在地图上同时展示同一 OD 对的多条备选路线，用户需要能直观区分哪条线对应哪个方案。

**方案**：颜色 + 线型双重编码。`SUB_ROUTE_STYLES` 定义 5 种样式组合：
- 方案1：红色实线
- 方案2：蓝色长虚线 `[12,6]`
- 方案3：绿色短虚线 `[4,8]`
- 方案4：橙色点划线 `[8,4,2,4]`
- 方案5：紫色长划-点 `[20,4,2,4]`

通过取模（`subRouteIdx % 5`）实现任意数量子路线的自动映射。

**原因**：单靠颜色在路线密集时难以区分，单靠线型视觉对比不够强烈。双重编码确保色觉障碍用户也能通过线型区分。列表卡片的颜色圆点与地图折线颜色严格对应。

### 4.3 单/多路线模式切换

**背景**：用户需要对比同一出发地的多条备选路线。

**方案**：通过 checkbox 开关切换两种模式：
- **单路线模式**（默认）：地图仅渲染每个起点的 `activeRouteIndex` 指向的单条路线，分组 header 显示"详情"按钮可打开原生路线面板
- **多路线模式**：地图渲染展开组的所有子路线（颜色+线型区分），隐藏"详情"按钮，采用手风琴折叠（`_expandedGroupIndex` 仅允许一组展开）

**原因**：checkbox 而非 toggle 按钮，因为 checkbox 在语义上更明确表达"开/关"状态，且在不同浏览器中渲染一致。手风琴折叠避免多组路线同时渲染导致地图折线混乱。

### 4.4 路线卡片交互职责分离

**背景**：同一个子路线卡片在两种模式下需要不同的交互行为。

**方案**：
- 单路线模式：点击卡片 → 切换 `activeRouteIndex` → 替换该起点的地图折线（颜色不变，路线变）
- 多路线模式：点击卡片 → toggle `_highlightedRoute` → 加粗/取消加粗对应折线（点击同一张卡片取消高亮）

**原因**：单路线模式下用户关注的是"选哪条路线看"，多路线模式下用户关注的是"高亮哪条做对比"。行为分离避免模式混淆。

### 4.5 POI 统一信息窗

**背景**：地图上有多种 POI 交互场景（地图原生 hotspot、已收藏的 marker），需要统一的交互入口。

**方案**：所有 POI 交互统一为自定义 DOM 信息窗弹窗，包含两个操作按钮：
- "添加到我的地点"（已收藏则显示"已添加 ✓"并禁用）
- "设为目的地"

信息窗通过绝对定位 DOM 元素覆盖在地图上，监听 `move`/`zoom` 事件实时跟随。

**原因**：相比高德原生 InfoWindow，自定义 DOM 元素可以自由控制样式和交互逻辑（如按钮禁用态），且更容易与 Tailwind CSS 风格统一。

### 4.6 原生路线详情面板

**背景**：路线详情需要展示逐步导航指引（转弯方向、公交站名等），自行渲染工作量大且难以覆盖所有交通模式。

**方案**：复用高德原生路线面板——创建带 `map` + `panel: "routeDetailPanel"` 参数的 Service 实例，高德自动在该 DOM 容器中渲染路线详情（含方案切换 Tab、逐步指引、地图路线绘制）。关闭面板时调用 `service.clear()` 清除原生路线，恢复概览折线。

**原因**：原生面板已覆盖所有四种交通模式的详情渲染，且提供公交换乘方案切换等复杂交互，自行实现成本高、维护负担大。

### 4.7 localStorage 持久化策略

**背景**：需要决定哪些状态需要跨页面刷新保留。

**方案**：仅收藏地点（`locations[]`）通过 localStorage 持久化（key: `mapdemo_my_locations`），路线计算结果、目的地、交通模式、多路线开关等全部为纯内存状态。

**原因**：地点是用户的长期数据，值得保留；路线状态依赖于当前目的地和操作上下文，刷新后重新设置更符合用户预期。路线计算结果体积较大且有过期风险（路况变化），不适合持久化。

---

## 第5节：高德 API 集成指南

开发参考手册，记录 API 调用的具体细节和常见坑点。

### 5.1 插件加载方式

所有高德插件通过 `AMap.plugin("PluginName", callback)` 异步加载。路线规划插件的类名通过 `PLUGIN_MAP` 静态映射配置，动态解析构造函数：

```javascript
const ServiceClass = pluginConfig.klass.split(".").reduce((obj, key) => obj[key], window);
const service = new ServiceClass(options);
```

**已使用的插件清单**：

| 插件 | 用途 | 加载位置 |
|---|---|---|
| `AMap.Geolocation` | 用户定位 | map.js init |
| `AMap.MapType` | 标准/卫星图层切换 | map.js init |
| `AMap.ToolBar` | 缩放+定位按钮 | map.js init |
| `AMap.AutoComplete` | 搜索栏自动补全 | map.js initSearchBar |
| `AMap.Geocoder` | 逆地理编码 | map.js reverseGeocodeForAddress |
| `AMap.PlaceSearch` | POI 搜索 | location.js searchLocation |
| `AMap.Driving` | 驾车路线规划 | route.js calculateRoute / _showNativeRoutePanel |
| `AMap.Transfer` | 公交路线规划 | route.js calculateRoute / _showNativeRoutePanel |
| `AMap.Walking` | 步行路线规划 | route.js calculateRoute / _showNativeRoutePanel |
| `AMap.Riding` | 骑行路线规划 | route.js calculateRoute / _showNativeRoutePanel |
| `AMap.Adaptor` | 公交面板样式适配 | route.js _showNativeRoutePanel（仅 transit 模式） |

### 5.2 路线规划插件速查表

| 模式 | 插件名 | 类名 | 路径字段 | 特殊参数 |
|---|---|---|---|---|
| 驾车 | `AMap.Driving` | `AMap.Driving` | `result.routes[].steps[].path` | `policy: AMap.DrivingPolicy.LEAST_TIME` |
| 公交 | `AMap.Transfer` | `AMap.Transfer` | `result.plans[].segments[].transit.path` + `walking.steps[].path` | **`city` 必填**，`policy: AMap.TransferPolicy.LEAST_TIME` |
| 步行 | `AMap.Walking` | `AMap.Walking` | `result.routes[].steps[].path` | 无 |
| 骑行 | `AMap.Riding` | `AMap.Riding` | `result.routes[].rides[].path` | 无 |

### 5.3 常见坑点

1. **插件名不含 "Search" 后缀**：高德 JS API 2.0 中路线规划插件名为 `AMap.Driving`（非 `AMap.DrivingSearch`）、`AMap.Transfer`（非 `AMap.TransitSearch`）。插件名错误会导致 `AMap.plugin()` 加载失败，后续 `new` 抛出 "not a constructor" 错误。

2. **`AMap.Transfer` 的 `city` 参数必填**：公交换乘服务必须指定城市，缺失将导致查询始终失败。代码中 fallback 链：`destination.city || origin.city || "北京"`。

3. **骑行路径字段是 `rides` 而非 `steps`**：`result.routes[].rides[].path`，与驾车/步行的 `steps[].path` 不同。

4. **公交结果在 `plans` 而非 `routes`**：`result.plans[]` 而非 `result.routes[]`。每个 plan 包含 `segments[]`，每个 segment 有 `walking.steps[].path`（步行段）和 `transit.path`（公交/地铁段）。

5. **右键坐标偏移**：右键添加地点必须使用 hotspot 缓存的 POI 坐标，不能使用鼠标点击坐标（`e.lnglat`），因为鼠标位置与 POI 实际地理坐标可能存在偏移。

6. **安全配置顺序**：`window._AMapSecurityConfig` 必须在高德 API `<script>` 标签之前声明，否则安全校验不生效。

### 5.4 速率限制策略

使用 `RateLimiter` 类（队列式节流器）保护 API 调用：

- **POI 搜索**（map.js）：`new RateLimiter(500)` — 500ms 间隔，用于逆地理编码
- **路线计算**（route.js）：`new RateLimiter(500)` — 500ms 间隔，用于路线规划

**规则**：所有高德 API 异步调用必须通过 `rateLimiter.execute(fn)` 包装，`fn` 返回 Promise。`RateLimiter` 内部维护队列，按 `limitInterval` 间隔逐个执行。

### 5.5 API Key 与安全配置

配置在 `index.html` 中：

```html
<!-- 安全码必须在 API script 之前 -->
<script type="text/javascript">
  window._AMapSecurityConfig = { securityJsCode: "..." };
</script>
<!-- API Key -->
<script src="https://webapi.amap.com/maps?v=2.0&key=..."></script>
```

**注意**：API Key 不应提交到公开仓库。部署时需替换为用户自己的 Key（从 https://lbs.amap.com/ 申请）。
