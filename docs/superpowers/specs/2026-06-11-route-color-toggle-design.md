# 路线渲染颜色区分 & Toggle 交互设计

## 背景

当前路线渲染存在三个问题：
1. **切换交通方式时旧路线未清除**：`switchTransportMode()` 清除 polyline 的方式有 bug，导致地图上残留旧路线线条。
2. **地图路线难以区分**：同交通方式下所有路线颜色相同，只靠粗细/透明度区分，辨识度低。
3. **缺少取消选中机制**：点击路线卡片弹出原生详情面板后，无法方便地回到概览视图。

## 设计目标

1. 切换交通方式时，地图上正确切换对应路线的线条。
2. 每条路线用**独立颜色**区分起点，右侧卡片颜色与地图线条一一对应。
3. 点击卡片打开原生详情面板，再次点击同一卡片 toggle 关闭面板并恢复概览路线。

---

## 改动范围

全部改动集中在 `src/route.js`，不涉及其他文件。

---

## 改动点

### 1. 颜色常量：引入 `ORIGIN_COLORS`

**当前**：`MODE_COLORS` 按交通方式配色，`ROUTE_PALETTE` 用粗细/透明度区分。

**改为**：新增 `ORIGIN_COLORS`，按起点索引分配独立颜色：

```javascript
const ORIGIN_COLORS = [
  "#ef4444", // 红 — 起点 0
  "#3b82f6", // 蓝 — 起点 1
  "#22c55e", // 绿 — 起点 2
  "#8b5cf6", // 紫 — 起点 3
  "#f59e0b", // 橙 — 起点 4
  "#06b6d4", // 青 — 起点 5
];
```

- **删除** `ROUTE_PALETTE`（不再需要粗细区分）。
- **保留** `MODE_COLORS`，仅用于交通方式切换按钮背景色。

> 颜色数量（6 个）覆盖 5 个收藏地点的上限足够，6 个以上自动循环取模。

### 2. 路线渲染改用 `ORIGIN_COLORS`

**影响方法**：
- `switchTransportMode()`（第 294-296 行）
- `_renderOverviewRoutes()`（第 450-456 行）

改动：polyline 颜色从 `MODE_COLORS[mode]` 改为 `ORIGIN_COLORS[item.index % ORIGIN_COLORS.length]`，统一粗细 4、透明度 0.8。

```javascript
// 旧
const color = MODE_COLORS[mode];
strokeWeight: palette.width,
strokeOpacity: palette.opacity,

// 新
const color = ORIGIN_COLORS[item.index % ORIGIN_COLORS.length];
strokeWeight: 4,
strokeOpacity: 0.8,
```

### 3. 修复旧路线未清除 Bug

**问题**：`switchTransportMode()` 调用 `mapManager.clearRouteLines()`，但该方法只清除 `mapManager.routeLines` 数组中的 polyline。而 `switchTransportMode` 创建的 polyline 存在 `this.currentRouteLines` 中，未被清除。

**修复**：在 `switchTransportMode()` 开头（及 `_renderOverviewRoutes()` 被调用前的 `hideRouteDetailPanel()`），改为直接从地图移除 `currentRouteLines` 中的 polyline：

```javascript
// switchTransportMode() 中
this.currentRouteLines.forEach(line => mapManager.map.remove(line));
this.currentRouteLines = [];
```

> 不再依赖 `mapManager.clearRouteLines()` 来清除这些线条。

### 4. 卡片颜色与路线对应

**影响方法**：`renderRouteList()` 第 593 行

卡片中距离前方的小圆点颜色从 `MODE_COLORS[mode]` 改为 `ORIGIN_COLORS[idx]`：

```javascript
// 旧
background-color: ${MODE_COLORS[mode]}

// 新 — 使用 validResults 的索引来取色
background-color: ${ORIGIN_COLORS[idx % ORIGIN_COLORS.length]}
```

### 5. 卡片 Toggle 交互

**影响方法**：`renderRouteList()` 卡片点击回调（第 604-629 行）

逻辑变更：

```javascript
card.addEventListener("click", (e) => {
  const routeIndex = parseInt(e.currentTarget.dataset.routeIndex);
  const wrapper = document.getElementById("routeDetailPanelWrapper");

  // Toggle: 如果面板正在显示且是同一个 routeIndex，取消选中
  if (this._routeDetailResultIndex === routeIndex &&
      wrapper && !wrapper.classList.contains("hidden")) {
    this.hideRouteDetailPanel();
    // 移除卡片高亮
    e.currentTarget.classList.remove("border-blue-400", "bg-blue-50", "ring-1", "ring-blue-300");
    return;
  }

  // 正常选中流程...
  // 高亮卡片 + 显示原生面板（逻辑不变）
});
```

### 6. `highlightSingleRoute` / `resetHighlight` — 清理

这两个方法（第 471-491 行）已不再使用（原生面板接管了路线高亮），可变更为 no-op 或删除后清理调用点。`resetHighlight()` 调用了完整的 `switchTransportMode` 会产生重绘开销，不再需要。

---

## 不改动的部分

- `map.js`：不新增方法，现有 `clearRouteLines()` / `addRouteLine()` 保留不动。
- `main.js`：无改动。
- `ui.js`：无改动。
- 原生详情面板逻辑（`_showNativeRoutePanel` / `hideRouteDetailPanel` / `_closeRoutePanelOnly`）：核心逻辑不变，仅 `hideRouteDetailPanel` 中重绘改用 `ORIGIN_COLORS`。
- `index.html`：无改动。

---

## 验收标准

1. 切换到骑行后，地图上只显示骑行路线线条，驾车/步行的旧线条被清除。
2. 每种交通方式下，不同起点的路线颜色不同（红/蓝/绿/紫/橙/青），切换交通方式后颜色含义不变。
3. 卡片左侧圆点颜色与地图上对应路线颜色一致。
4. 点击卡片弹出原生详情面板，再次点击同一卡片关闭面板并恢复所有概览路线。
5. 切换交通方式自动关闭详情面板并重新绘制对应模式的所有路线。
