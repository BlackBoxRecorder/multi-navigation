# 删除地点时简化路线处理逻辑

## 上下文

当前 `locationRemoved` 事件处理中，删除地点后会进行异步路线重新计算（`calculateRoutesFromOrigin` / `calculateRoutesToDestination`），这段逻辑引入了复杂度且存在并发竞态问题（Bug 5）。用户要求简化：删除地点后不再重新计算路径，如果该地点参与了当前路径计算则直接清空。

## 修改文件

仅需修改 `src/main.js` 中的 `locationRemoved` 事件监听器。

## 修改方案

将原有的异步重算逻辑替换为简单的判断：

1. 在调整索引**之前**，检查删除的 index 是否在 `_activeOriginIndices` 或 `_activeDestinationIndices` 中
2. 若参与 → 调用 `routeManager.clearRoutes()` 清空地图路线、右侧面板、起点/终点标记
3. 若不参与 → 仅调整索引（保持现有状态一致性）
4. 移除原有的 `Promise.then()` 异步重算代码块

### 替换位置

`src/main.js` 第 82-121 行，`locationRemoved` 事件监听器。

### 替换逻辑

```javascript
window.addEventListener('locationRemoved', (e) => {
    const { index } = e.detail;
    locationManager.saveToStorage();

    // Adjust checkbox selection state (shift indices)
    uiManager._adjustIndicesAfterRemove(index);

    // Check if removed location was part of the current route calculation
    const wasInActiveOrigins = routeManager._activeOriginIndices.includes(index);
    const wasInActiveDestinations = routeManager._activeDestinationIndices.includes(index);

    if (wasInActiveOrigins || wasInActiveDestinations) {
        // Clear all: map lines + right panel + origin/destination markers
        routeManager.clearRoutes();
    } else {
        // Just adjust indices; no recalculation needed
        routeManager._adjustOriginIndicesAfterRemove(index);
        routeManager._adjustDestinationIndicesAfterRemove(index);
    }

    uiManager.renderMyLocations();
});
```

### 关键设计决策

- **检查时机**：在 `_adjustIndicesAfterRemove` 调用后、`_adjustOriginIndicesAfterRemove` 调用前。因为 `uiManager._adjustIndicesAfterRemove` 不影响 `routeManager` 的索引数组，可以安全前置
- **`clearRoutes()` 的作用**：已包含清空地图折线、右侧面板 HTML、起点/终点标记、路线状态重置，一步到位
- **不参与时仍需调整索引**：若当前无活跃路线，数组为空，调整是无操作（安全）；若有活跃路线但不包含被删除地点，索引调整确保后续切换交通模式等操作能正确映射

## 验证

1. 启动 `npm run dev`，添加 3 个地点
2. 勾选前 2 个地点，右键地图 POI 设为终点 → 验证路线正常出现
3. 删除第 1 个地点（参与路径计算）→ 验证：地图路线清空、右侧面板清空、起点标记清除
4. 再次添加 3 个地点，勾选后 2 个，设为终点
5. 删除第 1 个地点（未参与路径计算）→ 验证：路线保持、右侧面板不变、仅左侧列表移除第 1 个
6. 在「起点模式」下重复步骤 2-5 验证对称行为
