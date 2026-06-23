# 反向路线规划（起点模式）设计

## 概述

在现有"多收藏点→单目的地"路线规划基础上，新增反向模式：用户点击地图标记设为起点，计算 **起点→每个选中收藏点** 的路线。正向/反向模式互斥，同一时间只能有一种模式生效。

## 设计决策摘要

| 决策点 | 选择 |
|--------|------|
| 正/反向模式关系 | 互斥（设起点清终点，设终点清起点） |
| 起点/终点标记视觉 | 绿色起点 vs 红色终点，图标区分 |
| 反向模式面板结构 | 对称分组：顶部"起始点：XX"，按终点分组 |
| 弹出框按钮布局 | 一行三按钮并排：收藏(蓝) / 设为起点(橙) / 设为终点(绿) |

---

## 1. 数据模型变更

### 1.1 RouteManager 新增字段 (`src/route.js`)

```javascript
// constructor 中新增
this.currentOrigin = null;        // 起点位置对象，与 currentDestination 互斥
this.routeDirection = 'toDestination';  // 'toDestination' | 'fromOrigin'
this._activeDestinationIndices = [];  // fromOrigin 模式下选中的终点索引，用于删除后重算
```

注：`fromOrigin` 模式下，`_activeDestinationIndices` 替代 `_activeOriginIndices` 的角色（后者用于 `toDestination` 模式）。删除收藏点时，`main.js` 中根据 `routeDirection` 选择调整对应的索引数组。

### 1.2 新增方法

- **`setOrigin(origin)`**：清零 `currentDestination`、`currentResults`，设置 `currentOrigin`，标记 `routeDirection = 'fromOrigin'`
- **`setDestination(destination)`**：清零 `currentOrigin`、`currentResults`，设置 `currentDestination`，标记 `routeDirection = 'toDestination'`（重构现有逻辑）
- **`calculateRoutesFromOrigin(origin, destinationIndices)`**：从 origin 出发，计算到每个选中 destination 的路线。返回数据结构与 `calculateRoutesToDestination` 对称，但 `results[].origin` 固定为传入的起点，`results[].destination` 为目标收藏点

### 1.3 结果数据结构（fromOrigin 模式）

```javascript
// 与 toDestination 模式对称，每个条目代表一个"起点→终点"组合
[
  {
    destination: { name, address, latitude, longitude },  // 被选中的收藏点（作为终点）
    routes: { driving: [...], transit: [...], walking: [...], bicycling: [...] },
    activeRouteIndex: { driving: 0, transit: 0, walking: 0, bicycling: 0 },
    hasError: false
  },
  ...
]
```

### 1.4 clearRoutes() 更新

新增清除 `currentOrigin`、重置 `routeDirection`。同时清除起点标记。

---

## 2. 事件流

### 2.1 新增 `originSet` 事件

**触发位置**：`map.js` 弹出框中"设为起点"按钮

```javascript
// map.js showPoiInfoWindow() 中
infoDiv.querySelector('.set-origin-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  if (locationManager.getAllLocations().length === 0) {
    showToast('请先添加收藏地点', 'warning');
    return;
  }
  window.dispatchEvent(
    new CustomEvent('originSet', {
      detail: { origin: poiData },
    }),
  );
  this.closePoiInfoWindow();
});
```

### 2.2 main.js 监听 `originSet`

```javascript
window.addEventListener('originSet', async (e) => {
  const { origin } = e.detail;
  const selectedIndices = uiManager.getSelectedLocationIndices();
  // 校验：至少选一个、最多 5 个
  if (selectedIndices.length === 0) { showToast(...); return; }
  if (selectedIndices.length > 5) { showToast(...); return; }

  // 跳过同起点
  // ...

  // 互斥：清除旧路线 + 清除终点标记
  mapManager.clearRouteLines();
  routeManager.setOrigin(origin);  // 内部清零 destination

  // 添加起点标记（绿色）
  mapManager.addOriginMarker(origin);

  // 计算路线
  const results = await routeManager.calculateRoutesFromOrigin(origin, selectedIndices);
  if (results.length > 0) {
    routeManager.renderResultsPanel(origin, results, routeManager.activeMode);
    routeManager.switchTransportMode(routeManager.activeMode);
  }
});
```

### 2.3 destinationSet 更新

在现有 `destinationSet` 处理中调用 `routeManager.setDestination(destination)`（内部清零 origin），并清除起点标记 `mapManager.clearOriginMarker()`。

---

## 3. MapManager 变更 (`src/map.js`)

### 3.1 弹出框三按钮布局

```html
<div class="flex space-x-1.5">
  <button class="add-location-btn flex-1 text-xs px-2 py-1.5 rounded font-medium
    ${isCollected ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600 text-white'}">
    收藏
  </button>
  <button class="set-origin-btn flex-1 text-xs px-2 py-1.5 rounded font-medium bg-orange-500 hover:bg-orange-600 text-white transition-colors">
    设为起点
  </button>
  <button class="set-destination-btn flex-1 text-xs px-2 py-1.5 rounded font-medium bg-green-500 hover:bg-green-600 text-white transition-colors">
    设为终点
  </button>
</div>
```

颜色方案：
- 收藏：蓝色 `bg-blue-500` / 已收藏灰色不可用
- 设为起点：橙色 `bg-orange-500`
- 设为终点：绿色 `bg-green-500`

### 3.2 新增起点标记方法

- **`addOriginMarker(location)`**：参照 `addDestinationMarker()` 实现，使用绿色图标（`#47bd46` 配色），tooltip 显示"🚩 起点"，zIndex=200
- **`clearOriginMarker()`**：参照 `clearDestinationMarker()` 实现
- constructor 中新增：`this.originMarker = null`、`this.originTooltip = null`

---

## 4. RouteManager 渲染变更 (`src/route.js`)

### 4.1 renderResultsPanel() 适配

根据 `routeDirection` 决定顶部显示内容：

- **toDestination**（现有）：
  ```
  目的地：XX大厦  [X 清除]
  ```
- **fromOrigin**（新增）：
  ```
  起始点：XX大厦  [X 清除]
  ```

### 4.2 renderRouteList() 适配

根据 `routeDirection` 决定分组标题来源：

- **toDestination**：`${result.origin.name}`（现有）
- **fromOrigin**：`${result.destination.name}`（新增）

卡片内方向文字：
- **toDestination**：`→ 目的地`（现有）
- **fromOrigin**：`← 起点`（新增）

详情按钮调用的 `_showNativeRoutePanel()` 需要根据方向反转 origin/destination 参数。

### 4.3 _showNativeRoutePanel() 适配

在 `fromOrigin` 模式下，origin 为 `this.currentOrigin`，destination 为 `result.destination`（而非现有代码中的固定 origin/destination 关系）。

### 4.4 switchTransportMode() / _renderOverviewRoutes()

路线渲染逻辑保持不变（已抽象为按 mode 渲染），`currentResults` 数据结构在两种模式下对称，无需修改。

### 4.5 多路线模式兼容

`fromOrigin` 模式下多路线开关行为与 `toDestination` 模式一致，驾车多路线时按四种策略分别取首条路线。

---

## 5. 清空路线行为

`clearRoutes()` 更新：同时清除 `currentOrigin`、起点标记、`routeDirection` 重置为 `'toDestination'`。

按下"清空路径规划结果"按钮后，地图上所有路线线、起点标记、终点标记均被清除，右侧面板恢复初始状态。

---

## 6. 边界情况处理

| 场景 | 处理 |
|------|------|
| 已设为终点，再设为起点 | 清除终点+路线，设置起点+计算 |
| 已设为起点，再设为终点 | 清除起点+路线，设置终点+计算 |
| 未选中任何收藏点就点"设为起点" | Toast 提示"请至少选择一个地点" |
| 选中超过 5 个收藏点 | Toast 提示"地点太多了，最多 5 个" |
| 起点与某个收藏点位置极近 | `calculateRoutesFromOrigin` 中过滤掉重合点 |
| 删除收藏点后重算 | 保持当前方向模式不变，用剩余选中索引重算 |

---

## 7. 涉及文件

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/route.js` | 修改 | 新增状态、方法、渲染适配 |
| `src/map.js` | 修改 | 弹出框三按钮、新增起点标记方法 |
| `src/main.js` | 修改 | 新增 `originSet` 监听、更新 `destinationSet` |
| `src/ui.js` | 不变 | 无需改动 |
| `src/location.js` | 不变 | 无需改动 |
| `index.html` | 不变 | 无需改动 |

---

## 8. 不变部分

- 四种交通模式（自驾/公交/步行/骑行）保持不变
- 路线卡片交互（点击切换、折叠/展开、详情面板）保持不变
- 多路线模式（checkbox 切换、四种策略路线）保持不变
- localStorage 收藏持久化保持不变
- 速率限制策略保持不变
- checkbox 选择状态管理保持不变
