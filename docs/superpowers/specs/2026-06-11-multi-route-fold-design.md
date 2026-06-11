# 路径规划多路线展示与折叠列表设计

## 概述

将路径规划结果从"每种交通方式只展示第一条路线"改为"展示高德 API 返回的全部路线"，右侧列表改为可折叠结构，每个起点→目的地为一个折叠组，展开后显示该交通方式下的多条备选路线。地图上每组同时只渲染一条折线，点击卡片可切换。

## 数据结构变更

### 当前结构（`route.js` — `RouteManager.currentResults`）

```js
// 每个 result 的 routes[mode] 是单条路线对象
currentResults[i].routes = {
  driving:  { path, distance, duration, rawResult },
  transit:  { path, distance, duration, rawResult },
  walking:  { path, distance, duration },
  bicycling:{ path, distance, duration },
}
```

### 目标结构

```js
// 每个 result 的 routes[mode] 改为路线数组
currentResults[i] = {
  origin,
  routes: {
    driving:   [{ path, distance, duration, rawResult }, ...],  // 多条
    transit:   [{ path, distance, duration, rawResult, segments }, ...],
    walking:   [{ path, distance, duration }, ...],
    bicycling: [{ path, distance, duration }, ...],
  },
  activeRouteIndex: { driving: 0, transit: 0, walking: 0, bicycling: 0 },
  hasError: bool,
}
```

- `activeRouteIndex[mode]`：记录当前模式选中的路线索引，默认 0
- 空数组 `[]` 表示该模式无路线

## `calculateRoute` 方法改造

在 `calculateRoute` 的回调中，不再只取 `result.routes[0]` / `result.plans[0]`，而是遍历全部路线：

| 模式 | 数据来源 | 遍历方式 |
|------|---------|---------|
| driving | `result.routes` | `routes.forEach(route => route.steps.flatMap(s => s.path))` |
| walking | `result.routes` | 同上 |
| transit | `result.plans` | `plans.forEach(plan => plan.segments中拼接walking+transit的path)` |
| bicycling | `result.routes` | `routes.forEach(route => route.rides.flatMap(r => r.path))` |

每条路线保留 `distance`、`duration`、`path`。transit 额外保留 `segments` 供原生面板使用。

返回值从单对象改为数组 `[{mode, distance, duration, path, rawResult}, ...]`。

## 右侧列表 UI：折叠组

### 折叠组结构

每个起点→目的地为一个折叠组（按 origin name 分组）：

```
┌─────────────────────────────────────┐
│ ▼ 起点A → 目的地          自驾 3条  │  ← 折叠头
│   ┌─────────────────────────────┐   │
│   │ ● 方案1  12.3km  25分钟     │   │  ← active（蓝色边框高亮）
│   │ ○ 方案2  11.8km  28分钟     │   │
│   │ ○ 方案3  14.1km  22分钟     │   │
│   └─────────────────────────────┘   │
├─────────────────────────────────────┤
│ ▼ 起点B → 目的地          自驾 2条  │
│   ┌─────────────────────────────┐   │
│   │ ● 方案1  8.5km   15分钟     │   │
│   │ ○ 方案2  9.2km   18分钟     │   │
│   └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

### 交互规则

- **默认全部展开**：所有折叠组初始为展开状态
- **允许多组同时展开**：点击折叠头只切换自己，不影响其他组
- **折叠头显示**：起点名 + 交通方式名 + 路线数量
- **路线卡片**：显示距离、预估时间，当前活跃卡片蓝色边框高亮
- **切换交通方式**：整体重新渲染为新模式的路线列表和折线

### 点击卡片行为

1. 更新该组的 `activeRouteIndex[mode]` 为新索引
2. 清除该组在地图上的旧折线，绘制新折线（保持 origin 颜色）
3. 调用 `_showNativeRoutePanel(mode, resultIndex)` 打开原生详情面板

### 地图折线渲染

- `switchTransportMode` / `_renderOverviewRoutes`：每组只绘制 `activeRouteIndex[mode]` 对应的折线
- 折线颜色沿用现有的 `ORIGIN_COLORS[index % ORIGIN_COLORS.length]`
- 切换路线时：只替换对应的折线，不影响其他组的折线

## 原生路线详情面板

保持不变。点击路线卡片时调用 `_showNativeRoutePanel(mode, resultIndex)`，高德原生面板会自己展示该模式下的多方案和步骤详情。

## 影响范围

| 文件 | 改动内容 |
|------|---------|
| `src/route.js` | `calculateRoute` 返回数组；`currentResults` 数据结构升级；`_renderOverviewRoutes` 按 activeIndex 绘制；`renderRouteList` 改为折叠组渲染；`switchTransportMode` 适配新结构 |
| `src/ui.js` | 无直接改动（路由列表渲染由 routeManager 负责） |
| `src/main.js` | 无直接改动（事件流不变） |

## 兼容性说明

- `calculateRoutesToDestination` 外层结构不变，仍返回 `[{origin, routes, hasError}]`
- `renderResultsPanel` 签名不变
- `_isRouteRenderable` 需适配 routes 从对象变数组
- 最优路线计算（`calculateOptimalMultiPointRoute`）不在此次改动范围内

## 空状态处理

- 某模式下某 origin 无路线：routes[mode] 为空数组 `[]`，折叠头显示 `0条`，不渲染子卡片
- 所有 origin 某模式均无路线：折叠头全部显示 `0条`，容器显示 `暂无XX路线数据`
