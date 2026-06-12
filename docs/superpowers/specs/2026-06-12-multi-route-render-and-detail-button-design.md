# 多路线渲染模式 & 详情按钮重构设计

## 概述

解决当前路径规划中详情按钮和路线地图渲染的两个痛点：

1. **详情按钮混乱**：每条子路线卡片都有独立的"详情"按钮，但高德原生面板对同一起点-目的地返回相同内容，多个按钮重复且 toggle 行为（点 A 打开后点 B 会关闭 A）让人困惑。
2. **地图只显示单条路线**：当前无论高德返回几条路线，地图每组只渲染 `activeRouteIndex` 指向的一条。

改进方案：
- 将"详情"按钮从子路线卡片移到分组头部，一组共用一个
- 增加"单路线/多路线"模式切换，开启后可在地图上同时渲染同一组下的全部路线

## 改动范围

| 文件 | 改动内容 |
|------|---------|
| `src/route.js` | 新增 `SUB_ROUTE_STYLES` 常量、`multiRouteMode` / `_highlightedRoute` 状态；`_renderOverviewRoutes` 支持双模式渲染；`renderRouteList` 详情按钮移到头部+多路线模式点击高亮；`switchTransportMode` 适配多路线；新增 `setMultiRouteMode()` 方法；`renderModeSwitchBar` 增加 checkbox 绑定 |
| `index.html` | 交通方式切换栏 `modeSwitchBar` 旁边新增多路线 checkbox |

`src/main.js`、`src/ui.js`、`src/map.js` 无需改动。

---

## 新增常量：子路线样式

同一组内多条路线的颜色+虚线样式（方案A：不同颜色+线型）：

```javascript
const SUB_ROUTE_STYLES = [
  { color: "#ef4444", dashPattern: null },           // 实线 — 方案1
  { color: "#3b82f6", dashPattern: [12, 6] },        // 长虚线 — 方案2
  { color: "#22c55e", dashPattern: [4, 8] },         // 短虚线(点状) — 方案3
  { color: "#f59e0b", dashPattern: [8, 4, 2, 4] },   // 点划线 — 方案4
  { color: "#8b5cf6", dashPattern: [20, 4, 2, 4] },  // 长划点 — 方案5
];
```

取模循环 `SUB_ROUTE_STYLES[subIdx % 5]`，覆盖任意多子路线。

保留 `ORIGIN_COLORS` 不变，单路线模式继续使用。

---

## RouteManager 新增状态

```javascript
this.multiRouteMode = false;       // false=单路线模式(默认), true=多路线模式
this._highlightedRoute = null;     // { groupIndex, subRouteIdx } 或 null（多路线模式专用）
```

---

## UI：模式切换 Checkbox（index.html）

在 `modeSwitchBar` 容器内部，交通方式按钮后方追加：

```html
<label id="multiRouteToggleLabel" class="flex items-center ml-3 pl-3 border-l border-gray-200 cursor-pointer select-none">
  <input type="checkbox" id="multiRouteToggle" class="w-3.5 h-3.5 text-blue-500 border-gray-300 rounded mr-1.5">
  <span class="text-xs text-gray-600">多路线</span>
</label>
```

- 默认未勾选 = 单路线模式
- 勾选 = 多路线模式
- checkbox 初始隐藏（`class="hidden"`），有路线结果后才显示

RouteManager 在 `renderModeSwitchBar` 中绑定 change 事件，调用 `this.setMultiRouteMode(checked)`。

---

## 详情按钮移到分组头部

### 分组头部结构（单路线模式）

```
┌─────────────────────────────────────────────────┐
│ ▼ 起点A → 目的地    自驾 3条          [详情]    │  ← 折叠头 + 详情
│   ● 方案1  12.3km  25分钟                       │
│   ○ 方案2  11.8km  28分钟                       │
│   ○ 方案3  14.1km  22分钟                       │
└─────────────────────────────────────────────────┘
```

- **分组头部**：起点名 + 交通方式 + 路线数量 + `详情` 按钮（仅在 `!multiRouteMode` 时显示）
- **子路线卡片**：不再包含详情按钮
- 点击头部详情按钮 → 调用 `_showNativeRoutePanel(mode, groupIndex)`，toggle 逻辑不变

### 分组头部结构（多路线模式）

```
┌─────────────────────────────────────────────────┐
│ ▼ 起点A → 目的地    自驾 3条                    │  ← 无详情按钮
│   ● 方案1  12.3km  25分钟                       │
│   ○ 方案2  11.8km  28分钟                       │
│   ○ 方案3  14.1km  22分钟                       │
└─────────────────────────────────────────────────┘
```

---

## 地图渲染：双模式逻辑

`_renderOverviewRoutes(mode)` 和 `switchTransportMode(mode)` 共用渲染逻辑，根据 `this.multiRouteMode` 分支：

### 单路线模式（现有逻辑不变）

- 每组只绘制 `activeRouteIndex[mode]` 对应的那条路线
- 颜色：`ORIGIN_COLORS[groupIndex % ORIGIN_COLORS.length]`
- 样式：实线，strokeWeight: 6，strokeOpacity: 0.8
- polyline 存储到 `this.currentRouteLines`

### 多路线模式

- 每组绘制该模式下**全部**路线（`routes` 数组中的所有元素）
- 颜色+线型：`SUB_ROUTE_STYLES[subRouteIdx % SUB_ROUTE_STYLES.length]`
- 默认参数：strokeWeight: 4，strokeOpacity: 0.7
- 如果 `_highlightedRoute` 匹配当前路线：strokeWeight: 8，strokeOpacity: 1.0
- polyline 元数据：`._groupIndex`、`._subRouteIdx`
- 存储到 `this.currentRouteLines`

---

## 列表卡片点击交互

### 单路线模式

点击子路线卡片 → 切换 `activeRouteIndex` + 替换折线（现有逻辑不变），**不触发详情面板**（详情由头部按钮控制）。

### 多路线模式

点击子路线卡片 → 高亮地图上对应路线：

1. 如果点击的是当前已高亮的同一张卡片：取消高亮（`_highlightedRoute = null`）
2. 否则：设置 `_highlightedRoute = { groupIndex, subRouteIdx }`
3. 重新渲染列表（更新卡片高亮样式）+ 重新渲染地图折线（更新粗细/透明度）
4. 地图 `setFitView` 保持当前视角，不做 autoFit（避免频繁缩放）

---

## 模式切换联动

### 切换到多路线模式
1. `this.multiRouteMode = true`
2. 关闭任何已打开的原生详情面板（`hideRouteDetailPanel`）
3. 清除 `_highlightedRoute = null`
4. 清除地图所有折线，按多路线模式重新渲染
5. 重新渲染列表（隐藏详情按钮）

### 切换回单路线模式
1. `this.multiRouteMode = false`
2. 清除 `_highlightedRoute = null`
3. 清除地图所有折线，按单路线模式重新渲染（每组只渲染 activeRouteIndex 指向的路线）
4. 重新渲染列表（显示详情按钮）

---

## 影响的方法

| 方法 | 改动 |
|------|------|
| `renderModeSwitchBar` | 新增 checkbox 标签 + change 事件绑定；checkbox 在无路线结果时隐藏 |
| `renderRouteList` | 详情按钮从子卡片移到分组头部；子卡片点击区分单/多路线行为 |
| `_renderOverviewRoutes` | 新增 `multiRouteMode` 分支，多路线模式下遍历全部路线，应用 `SUB_ROUTE_STYLES` |
| `switchTransportMode` | 同 `_renderOverviewRoutes` 的分支逻辑 |
| `hideRouteDetailPanel` | 关闭面板后重绘时也要遵循当前模式（单/多路线） |
| 新增 `setMultiRouteMode(bool)` | 切换模式并触发重渲染 |

---

## 验收标准

1. 单路线模式（默认）：详情按钮在分组头部，每条子路线卡片无详情按钮；点击头部详情按钮打开原生面板，toggle 行为正常
2. 多路线模式：地图上同一组的全部路线同时显示，颜色+虚线样式各不相同
3. 多路线模式下列表没有详情按钮；点击子路线卡片 → 对应地图路线加粗高亮；再次点击取消高亮
4. 多路线 checkbox 与列表卡片颜色一致（方案1红实线、方案2蓝虚线、方案3绿短虚线...）
5. 切换交通方式后，两种模式都能正确重渲染新模式的路线
6. 模式切换时自动关闭原生详情面板
7. 多路线模式下切换回单路线，地图恢复只显示 activeRouteIndex 指向的路线
