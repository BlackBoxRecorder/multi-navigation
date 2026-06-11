# 我的地点功能增强：复选框路径规划 + 清空按钮 + 地址去重

## 概述

为"我的地点"面板增加三个功能：
1. 地点列表增加复选框，支持选中特定地点后规划到目的地的路径（严格模式：必须选，最多 5 个）
2. 左侧面板底部增加"清空所有地点"按钮（二次确认，同步清除地图标记和路线）
3. 地点列表名称去重：如果 `name` 以 `address` 开头，截掉 `address` 前缀

## 改动文件

| 文件 | 改动类型 |
|---|---|
| `index.html` | 左侧面板底部加通宽"清空所有地点"按钮 |
| `src/location.js` | 新增 `clearAll()` 方法 |
| `src/ui.js` | 复选框渲染、清空处理、`getSelectedLocationIndices()`、地址去重显示 |
| `src/route.js` | `calculateRoutesToDestination` 支持 `originIndices` 参数、新增 `resetState()` |
| `src/main.js` | 调整 `destinationSet` 事件处理，增加选中数量和上限校验 |

## 详细设计

### 1. HTML 结构变更（`index.html`）

在左侧面板 `#leftPanel` 底部（`#myLocationsList` 下方、tip 文字上方）增加：

```html
<button id="clearAllLocationsBtn" class="w-full mt-3 px-3 py-2 text-sm text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
  清空所有地点
</button>
```

### 2. LocationManager 新增方法（`src/location.js`）

```js
clearAll() {
  const count = this.locations.length;
  if (count === 0) return;
  this.locations = [];
  localStorage.removeItem(STORAGE_KEY);
  showToast(`已清空 ${count} 个地点`, "info");
  window.dispatchEvent(new CustomEvent("locationsCleared", { detail: { count } }));
}
```

### 3. UIManager 改动（`src/ui.js`）

**renderMyLocations**：
- 每个地点条目左侧增加 `<input type="checkbox" data-index="N">`
- 名称显示做去重：`displayName = (loc.address && loc.name.startsWith(loc.address)) ? loc.name.replace(loc.address, '').trim() : loc.name`
- 保留现有的删除按钮

**新增方法**：
- `getSelectedLocationIndices()` — 遍历 `.my-loc-checkbox:checked`，返回索引数组
- `handleClearAll()` — `confirm()` 后调用 `locationManager.clearAll()`、`mapManager.clearAllMyLocationMarkers()`、`routeManager.resetState()`、`mapManager.clearRouteLines()`、`uiManager.renderMyLocations()`、`uiManager.showEmptyState()`

### 4. RouteManager 改动（`src/route.js`）

**calculateRoutesToDestination** 新增 `originIndices` 参数：

```js
async calculateRoutesToDestination(destination, originIndices = null) {
  const allLocations = locationManager.getAllLocations();
  // 如果指定了 originIndices，只取对应地点的子集作为起点
  const origins = originIndices
    ? originIndices.map(i => allLocations[i]).filter(Boolean)
    : allLocations;
  // ... 后续逻辑不变，但过滤目的地自身时基于 origins 而非 allLocations
}
```

**新增 resetState**：
```js
resetState() {
  this.hideRouteDetailPanel();
  this.currentResults = [];
  this.currentDestination = null;
  this.currentRouteLines.forEach(line => mapManager.map.remove(line));
  this.currentRouteLines = [];
}
```

### 5. main.js 改动

`destinationSet` 事件处理器调整：

```js
window.addEventListener("destinationSet", async (e) => {
  const { destination } = e.detail;
  // 获取勾选的地点索引
  const selectedIndices = uiManager.getSelectedLocationIndices();
  if (selectedIndices.length === 0) {
    showToast("请至少选择一个地点", "warning");
    return;
  }
  if (selectedIndices.length > 5) {
    showToast("地点太多了，最多 5 个", "warning");
    return;
  }
  // 跳过同一目的地判断（保留）
  // 调用 routeManager.calculateRoutesToDestination(destination, selectedIndices)
});
```

### 6. 常量定义

在 `src/ui.js` 顶部定义：

```js
const MAX_SELECTED_ORIGINS = 5;
```

## 交互流程

1. 用户通过右键地图 POI 信息窗"添加到我的地点"收藏地点 → 地点出现在左侧列表（带复选框，默认不勾选）
2. 用户勾选 1~5 个地点
3. 用户在地图上右键 POI → "设为目的地"
4. 系统校验：未勾选 → "请至少选择一个地点"；>5 → "地点太多了，最多 5 个"
5. 校验通过 → 仅计算勾选地点到目的地的路线
6. 右侧面板渲染路线结果，切换交通模式
7. 用户点击"清空所有地点" → `confirm("确定清空所有收藏地点吗？此操作不可恢复。")` → 清除数据、标记、路线

## 地址去重规则

```js
function getDisplayName(loc) {
  if (loc.address && loc.name.startsWith(loc.address)) {
    return loc.name.replace(loc.address, '').trim();
  }
  return loc.name;
}
```

注意：去重仅影响列表显示，不影响存储数据和地图标记的 name。
