# 驾车路线策略选择器设计

## 概述

当前驾车路线始终使用 `AMap.DrivingPolicy.LEAST_TIME`（时间最短）策略。本次设计新增策略下拉选择器，允许用户在驾车模式下切换四种策略，策略状态通过 localStorage 持久化。

## 交互模式

**策略全局切换**：在驾车按钮旁添加策略下拉框，切换策略后所有起点→目的地的驾车路线按新策略重新计算并渲染。与多路线模式正交——多路线模式控制"同一策略下显示几条备选方案"，策略切换控制"用哪个策略算"。

## 策略列表

| 策略 Key | 中文标签 | 高德常量 |
|----------|----------|----------|
| `LEAST_TIME` | 时间最短 | `AMap.DrivingPolicy.LEAST_TIME` |
| `LEAST_DISTANCE` | 距离最短 | `AMap.DrivingPolicy.LEAST_DISTANCE` |
| `LEAST_FEE` | 费用最少 | `AMap.DrivingPolicy.LEAST_FEE` |
| `REAL_TRAFFIC` | 实时路况 | `AMap.DrivingPolicy.REAL_TRAFFIC` |

默认策略：`LEAST_TIME`。

## 数据获取策略

**按需重算**：切换策略时重新调用高德 API，用新策略计算路线。不预取其他策略结果。

## UI 布局

策略下拉框放在 `modeSwitchBar` 中，紧跟在驾车按钮右侧。只在驾车模式激活时显示，其他模式隐藏。

```
[ 自驾 ▼ ] [时间最短 ▼]  ← 驾车模式激活时
[ 公交 ] [ 步行 ] [ 骑行 ]   [ 多路线：☐ ]
```

`index.html` 在 `modeSwitchBar` 区域内新增 `<select id="drivingPolicySelect">`，默认 `hidden`。

## 状态管理

`RouteManager` 新增属性：
- `activeDrivingPolicy`: 当前驾车策略 key，默认从 localStorage 读取，无记录时默认 `'LEAST_TIME'`

新增方法：
- `_loadDrivingPolicy()`: 从 `localStorage` 读取，默认 `'LEAST_TIME'`
- `setDrivingPolicy(policyKey)`: 更新策略、写 localStorage、当前为驾车模式时触发重算
- `_recalculateWithNewPolicy()`: 清除当前驾车数据，用新策略调用 `calculateRoutesToDestination`，重新渲染列表和地图

## 代码改动点

### `src/route.js`

1. **文件顶部新增策略常量** `DRIVING_POLICIES`
2. **constructor 新增** `this.activeDrivingPolicy = this._loadDrivingPolicy()`
3. **新增方法** `_loadDrivingPolicy()`、`setDrivingPolicy()`、`_recalculateWithNewPolicy()`
4. **修改 `calculateRoute()`（第 102 行）**: 将硬编码 `AMap.DrivingPolicy.LEAST_TIME` 改为 `DRIVING_POLICIES[this.activeDrivingPolicy].value`
5. **修改 `_showNativeRoutePanel()`（第 378 行）**: 同上
6. **修改 `renderModeSwitchBar()`**: 控制下拉框显隐，根据 `this.activeMode` 决定是否显示；同时同步选中项

### `index.html`

在 `modeSwitchBar` 区域内，模式按钮后添加：

```html
<select id="drivingPolicySelect"
  class="hidden text-xs px-2 py-1.5 rounded border border-gray-300 bg-white text-gray-700">
  <option value="LEAST_TIME">时间最短</option>
  <option value="LEAST_DISTANCE">距离最短</option>
  <option value="LEAST_FEE">费用最少</option>
  <option value="REAL_TRAFFIC">实时路况</option>
</select>
```

## 边界情况

### 策略切换加载态

- 清空地图上旧驾车路线
- 清空右侧路线列表，显示「正在计算...」
- 禁用策略下拉框，防止重复触发

### 新策略无结果

- 该起点的驾车路线记为 `[]`（与现有 `NO_DATA` 处理一致）
- 全部无结果 → toast：「该策略下无可用路线」
- 策略下拉框保持当前值，不自动回退

### 非驾车模式

| 场景 | 行为 |
|------|------|
| 切换公交/步行/骑行 | 策略下拉框隐藏，`activeDrivingPolicy` 保持 |
| 切回驾车 | 下拉框显示上次选择，已有数据直接重渲染 |

### 新目的地

`calculateRoutesToDestination()` 中驾车路线使用当前 `activeDrivingPolicy`。下拉框同步显示。

### resetState（清空所有地点）

策略不重置，保持 localStorage 值。

## 改动文件清单

| 文件 | 改动类型 |
|------|----------|
| `src/route.js` | 修改（核心逻辑：~50 行新增，3 处修改） |
| `index.html` | 修改（新增 ~6 行下拉框 HTML） |

## 不涉及的文件

- `src/map.js`、`src/location.js`、`src/ui.js`、`src/main.js`、`src/utils.js` — 无改动
