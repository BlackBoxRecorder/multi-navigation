# 路径规划清空按钮 & 状态一致性修复设计

## 概述

修复 5 个路径规划功能的状态管理 bug：缺少清空路线按钮、目的地 marker 残留、勾选状态丢失、策略切换全量计算、策略切换路线相同。采用方案 C（最小改动增强版），在不破坏现有模块边界的前提下，用内存状态管理替代 DOM 读取，统一清空入口。

## 问题清单与根因

| # | 问题 | 根因 |
|---|------|------|
| 1 | 右侧缺少清空路线按钮 | 功能缺失，右侧面板无独立清空按钮 |
| 2 | 清空所有地点时目的地 marker 未删 | `mapManager` 无 `clearDestinationMarker()` 方法，`destinationMarker` 不在 `markers` 数组中 |
| 3 | 添加新地点后勾选丢失 | `renderMyLocations()` 用 `innerHTML` 完全重建 DOM，checkbox 状态未持久化 |
| 4 | 策略切换计算了全部地点路线 | `_recalculateWithNewPolicy()` 未传 `originIndices`，`routeManager` 未记住选中 origin |
| 5 | 切换策略路线始终相同 | 共享 #4 根因 + `_recalculateWithNewPolicy` 同时重算 4 种交通方式导致结果覆盖 |

## 改动范围

4 个源文件 + 1 个 HTML 文件，无新建文件：

- `src/map.js` — 新增 `clearDestinationMarker()`
- `src/route.js` — 新增 `clearRoutes()`、`_activeOriginIndices`、`_adjustOriginIndicesAfterRemove()`；修改 `_recalculateWithNewPolicy()`、`calculateRoutesToDestination()`、`resetState()`
- `src/ui.js` — 新增 `_selectedIndices`（Set）、`_adjustIndicesAfterRemove()`、`handleClearRoutes()`；修改 `renderMyLocations()`、`getSelectedLocationIndices()`、`handleClearAll()`、`bindEvents()`
- `src/main.js` — 修改 `locationRemoved` 事件处理
- `index.html` — 右侧面板 h2 旁加「清空结果」按钮

---

## 详细设计

### 1. 清空路线按钮（问题 1）+ 目的地 marker 清理（问题 2）

#### index.html

在右侧面板 `h2` 标签内增加清空按钮：

```html
<h2 class="text-xl font-bold mb-4 text-gray-800 flex items-center justify-between">
  路径规划
  <button id="clearRoutesBtn"
    class="text-xs px-2 py-1 text-gray-400 border border-gray-200 rounded hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors">
    清空结果
  </button>
</h2>
```

#### map.js — 新增 clearDestinationMarker()

```javascript
clearDestinationMarker() {
  if (this.destinationMarker) {
    this.map.remove(this.destinationMarker);
    this.destinationMarker = null;
  }
  if (this.destinationTooltip) {
    this.map.off('move', this.destinationTooltip.moveHandler);
    this.map.off('zoom', this.destinationTooltip.moveHandler);
    this.map.off('resize', this.destinationTooltip.moveHandler);
    this.destinationTooltip.el.remove();
    this.destinationTooltip = null;
  }
}
```

#### route.js — 新增 clearRoutes()

对现有 `resetState()` 的扩展，增加清除目的地 marker 和 UI 重置：

```javascript
clearRoutes() {
  this.hideRouteDetailPanel();
  this.currentResults = [];
  this.currentDestination = null;
  this._activeOriginIndices = [];
  this.currentRouteLines.forEach((line) => mapManager.map.remove(line));
  this.currentRouteLines = [];
  this.multiRouteMode = false;
  this._highlightedRoute = null;
  this._expandedGroupIndex = null;
  const checkbox = document.getElementById('multiRouteToggle');
  if (checkbox) checkbox.checked = false;
  mapManager.clearDestinationMarker();
  this._clearResultsUI();
}

// 内部方法：仅重置右侧 UI 显示
_clearResultsUI() {
  const destDisplay = document.getElementById('destinationDisplay');
  if (destDisplay) destDisplay.classList.add('hidden');
  const container = document.getElementById('routeResultsList');
  if (container) {
    container.innerHTML = '<p class="text-sm text-gray-500 italic">点击地图 POI 并设为目的地以计算路线</p>';
  }
  const modeBtns = document.getElementById('modeBtns');
  if (modeBtns) modeBtns.innerHTML = '';
  const toggleLabel = document.getElementById('multiRouteToggleLabel');
  if (toggleLabel) toggleLabel.classList.add('hidden');
  const policySelect = document.getElementById('drivingPolicySelect');
  if (policySelect) policySelect.classList.add('hidden');
}
```

**resetState() 简化**为调用 `clearRoutes()` 后再重置多路线 checkbox（`clearRoutes` 已处理）：

```javascript
resetState() {
  this.clearRoutes();
}
```

#### ui.js — 新增 handleClearRoutes() + 绑定

```javascript
// 构造函数 bindEvents() 中新增
const clearRoutesBtn = document.getElementById('clearRoutesBtn');
if (clearRoutesBtn) {
  clearRoutesBtn.addEventListener('click', () => this.handleClearRoutes());
}

// 新方法
handleClearRoutes() {
  routeManager.clearRoutes();
  showToast('已清空路径规划结果', 'info');
}
```

**handleClearAll() 修改**：在调用 `routeManager.clearRoutes()` 替代原来的分散调用：

```javascript
handleClearAll() {
  // ... 确认框逻辑不变 ...
  routeManager.clearRoutes();          // 统一入口
  mapManager.clearAllMyLocationMarkers();
  mapManager.clearRouteLines();
  locationManager.clearAll();
  this._selectedIndices.clear();
  this.renderMyLocations();
  this.showEmptyState();
}
```

---

### 2. 勾选状态保持（问题 3）

#### ui.js — 新增内存状态管理

**新增字段**：
```javascript
this._selectedIndices = new Set();
```

**renderMyLocations() 修改**：

渲染 checkbox 时根据 `_selectedIndices` 决定 `checked` 属性：
```javascript
<input type="checkbox" class="my-loc-checkbox ..." data-index="${index}"
  ${this._selectedIndices.has(index) ? 'checked' : ''}>
```

渲染完成后绑定 checkbox change 事件，同步更新 `_selectedIndices`：
```javascript
// 在 renderMyLocations() 末尾新增
this.myLocationsList.querySelectorAll('.my-loc-checkbox').forEach((checkbox) => {
  checkbox.addEventListener('change', (e) => {
    const idx = parseInt(e.target.dataset.index);
    if (e.target.checked) {
      this._selectedIndices.add(idx);
    } else {
      this._selectedIndices.delete(idx);
    }
  });
});
```

**getSelectedLocationIndices() 修改**：从内存读取，不再依赖 DOM：
```javascript
getSelectedLocationIndices() {
  return Array.from(this._selectedIndices).sort((a, b) => a - b);
}
```

**新增 _adjustIndicesAfterRemove()**：地点删除后调整索引：
```javascript
_adjustIndicesAfterRemove(removedIndex) {
  const newSet = new Set();
  for (const idx of this._selectedIndices) {
    if (idx > removedIndex) newSet.add(idx - 1);
    else if (idx < removedIndex) newSet.add(idx);
  }
  this._selectedIndices = newSet;
}
```

---

### 3. 策略切换记住选中 origin（问题 4）+ 优化重算（问题 5）

#### route.js

**新增字段**：
```javascript
this._activeOriginIndices = [];
```

**calculateRoutesToDestination() 修改**：无论参数如何，存储使用的 origin 索引：
```javascript
// 在确定 origins 数组后，新增：
if (originIndices && originIndices.length > 0) {
  this._activeOriginIndices = [...originIndices];
} else {
  this._activeOriginIndices = allLocations.map((_, i) => i);
}
```

**_recalculateWithNewPolicy() 修改**：传入 `_activeOriginIndices`，重算全部交通模式（保证其他模式数据不丢失）：
```javascript
async _recalculateWithNewPolicy() {
  // 清除地图路线（同现有逻辑）
  // ...

  try {
    const results = await this.calculateRoutesToDestination(
      this.currentDestination,
      this._activeOriginIndices       // 复用选中 origin
      // 不传 transportMode，重算全部 4 种模式（保证切换交通方式时数据完整）
    );
    if (results.length > 0) {
      this.renderResultsPanel(this.currentDestination, results, this.activeMode);
      this.switchTransportMode(this.activeMode);
    } else {
      showToast('该策略下无可用路线', 'warning');
      // ...
    }
  } finally {
    // ...
  }
}
```

**新增 _adjustOriginIndicesAfterRemove()**：地点删除后调整索引：
```javascript
_adjustOriginIndicesAfterRemove(removedIndex) {
  this._activeOriginIndices = this._activeOriginIndices
    .filter(i => i !== removedIndex)
    .map(i => i > removedIndex ? i - 1 : i);
}
```

---

### 4. 事件处理调整

#### main.js — locationRemoved 事件

在地点被删除后，同步调整 `uiManager` 和 `routeManager` 的索引，并根据情况自动重算或清空：

```javascript
window.addEventListener('locationRemoved', (e) => {
  const { index } = e.detail;
  locationManager.saveToStorage();

  // 调整勾选状态索引
  uiManager._adjustIndicesAfterRemove(index);
  // 调整路线 origin 索引
  routeManager._adjustOriginIndicesAfterRemove(index);

  // 自动重算或清空
  if (routeManager.currentDestination && routeManager._activeOriginIndices.length > 0) {
    routeManager.calculateRoutesToDestination(
      routeManager.currentDestination,
      routeManager._activeOriginIndices,
    ).then((results) => {
      if (results.length > 0) {
        routeManager.renderResultsPanel(routeManager.currentDestination, results, routeManager.activeMode);
        routeManager.switchTransportMode(routeManager.activeMode);
      } else {
        routeManager.clearRoutes();
      }
    });
  } else if (routeManager._activeOriginIndices.length === 0 && routeManager.currentDestination) {
    routeManager.clearRoutes();
  }

  uiManager.renderMyLocations();
});
```

---

## 数据流

```
用户勾选 checkbox → uiManager._selectedIndices 更新
  ↓
用户设目的地 → main.js 读取 getSelectedLocationIndices()
  ↓
calculateRoutesToDestination(originIndices) → 存储到 routeManager._activeOriginIndices
  ↓
用户切换策略 → _recalculateWithNewPolicy() 复用 _activeOriginIndices
  ↓
用户删除地点 → _adjustIndicesAfterRemove() 调整两个模块的索引
  ↓
用户清空路线 → clearRoutes() 统一清理
```

## 边界情况

| 场景 | 行为 |
|------|------|
| 添加新地点（末尾） | 勾选状态不变，新项不勾选 |
| 删除已勾选的地点 | 该勾选移除，后续索引前移 |
| 策略切换时无剩余 origin | `_activeOriginIndices` 为空时 `calculateRoutesToDestination` 走原有提示逻辑 |
| 清空所有地点 | `_selectedIndices.clear()` + `clearRoutes()` 统一清理 |
| 无路线结果时点清空按钮 | `clearRoutes()` 幂等，不报错 |
