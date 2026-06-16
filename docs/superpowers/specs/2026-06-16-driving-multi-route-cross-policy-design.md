# 驾车多路线跨策略对比设计

## 概述

当前多路线模式与驾车策略是正交的：多路线展示"当前策略下 API 返回的多条备选"，策略下拉框决定"用哪个策略算"。本次设计将驾车+多路线的语义改为**跨策略对比**——同时调用四种策略各一次，取每种策略的最优路线并排展示，让用户快速对比不同策略的差异。

## 交互模式

**多路线 + 驾车 = 四种策略各取首条**：打开多路线且当前为驾车模式时，对每个起点→目的地同时调用 4 次 Amap Driving API（LEAST_TIME / LEAST_DISTANCE / LEAST_FEE / REAL_TRAFFIC），每种策略只取返回的第一条路线。

多路线 + 非驾车模式（公交/步行/骑行）行为不变——仍然是该模式下 API 返回的备选方案。

## UI 布局

每个折叠组内固定 4 张子卡片，标签为策略中文名，每种策略有固定颜色：

| 策略 Key | 标签 | 颜色 |
|----------|------|------|
| LEAST_TIME | 时间最短 | `#ef4444` 红 |
| LEAST_DISTANCE | 距离最短 | `#3b82f6` 蓝 |
| LEAST_FEE | 费用最少 | `#22c55e` 绿 |
| REAL_TRAFFIC | 实时路况 | `#f59e0b` 橙 |

折叠组头标签从"自驾 N条"改为"自驾 4策略"。

```
┌──────────────────────────────────────┐
│ ▼ 起点A → 目的地         自驾 4策略  │
│   ┌──────────────────────────────┐   │
│   │ 🔴 时间最短  12.3km  25分钟  │   │
│   │ 🔵 距离最短  11.8km  28分钟  │   │
│   │ 🟢 费用最少  14.1km  22分钟  │   │
│   │ 🟠 实时路况  13.0km  30分钟  │   │
│   └──────────────────────────────┘   │
└──────────────────────────────────────┘
```

地图折线使用对应策略颜色绘制，点击卡片高亮对应折线（加粗、提亮）并取消同组其他高亮。与现有多路线高亮逻辑一致。

## 策略下拉框

多路线开启时 `#drivingPolicySelect` 隐藏。关闭多路线后恢复显示，策略保持最后一次有效值（默认 LEAST_TIME）。

## 详情按钮

多路线+驾车模式下隐藏折叠组头上的「详情」按钮。用户可在关闭多路线后查看单策略的详情面板。

## 数据获取

### 数据结构

驾车路线数组中每条路线新增 `policy` 字段：

```js
// routes.driving = [
//   { mode, distance, duration, path, policy: 'LEAST_TIME', rawResult },
//   { mode, distance, duration, path, policy: 'LEAST_DISTANCE', rawResult },
//   { mode, distance, duration, path, policy: 'LEAST_FEE', rawResult },
//   { mode, distance, duration, path, policy: 'REAL_TRAFFIC', rawResult },
// ]
```

### `calculateRoute` 修改

新增 `takeFirstOnly` 参数（默认 false）。为 true 时只返回第一条路线（用于多路线+驾车模式），路线对象挂上 `policy` 字段。

### `calculateRoutesToDestination` 修改

多路线+驾车时，`calculateRoutesToDestination` 不再只算一种策略，而是遍历 `DRIVING_POLICIES` 四种策略，为每个 origin 每种策略调用一次 API。按策略顺序存入 `routes.driving` 数组。

### 速率限制

路线计算速率限制从 500ms 放宽到 **200ms**。最坏情况（5 个起点 × 4 策略 = 20 次请求）耗时约 4 秒。

## 边界情况

### 部分策略无结果

某策略返回 `no_data` 时，对应卡片显示"该策略无可用路线"，地图不画对应折线。其他策略正常展示。不会整体报错。

### 切换到非驾车模式

多路线打开后切换到公交/步行/骑行，行为不变（该模式下 API 返回的备选方案）。策略下拉框在非驾车模式下本就不显示。

### 多路线关闭

恢复为单路线模式，显示 `activeDrivingPolicy`（最后一次有效策略）对应的首条路线。策略下拉框重新显示。

### 设为新目的地

如果多路线开着+驾车模式，按新设计（4 策略各取首条）重新计算。如果多路线关着，按当前策略单次计算（现有行为）。

## 代码改动

### `src/route.js`

| 改动点 | 说明 |
|--------|------|
| 速率限制 | `new RateLimiter(500)` → `new RateLimiter(200)` |
| 新增策略颜色常量 | `POLICY_COLORS = { LEAST_TIME: '#ef4444', LEAST_DISTANCE: '#3b82f6', LEAST_FEE: '#22c55e', REAL_TRAFFIC: '#f59e0b' }` |
| `calculateRoute` | 新增 `takeFirstOnly` 参数，为 true 时只返回 `routes[0]` 并挂 `policy` |
| `calculateRoutesToDestination` | 多路线+驾车时，对每个 origin 遍历 4 个策略分别调 API |
| `_renderOverviewRoutes` | 多路线+驾车用策略颜色替代 SUB_ROUTE_STYLES |
| `renderRouteList` | 多路线+驾车时：卡片标签用策略中文名+策略颜色、隐藏详情按钮、标签改为"自驾 4策略" |
| `renderModeSwitchBar` | 多路线+驾车时隐藏策略下拉框 |
| `setMultiRouteMode` | 多路线开启+驾车模式时触发跨策略重算 |

### 不改动的文件

`index.html`、`src/map.js`、`src/ui.js`、`src/main.js`、`src/utils.js`。
