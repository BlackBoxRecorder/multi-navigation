# 地点数据模型 ID 化设计

**日期**: 2026-06-23
**状态**: 已确认

## 背景

当前系统中多个模块（`location`、`map`、`ui`、`route`）均依赖整数位置索引来引用地点。删除地点时，需要 4 个地方同时做索引修正（`_adjustIndicesAfterRemove`、`_adjustOriginIndicesAfterRemove`、`_adjustDestinationIndicesAfterRemove`），容易产生不一致。

## 目标

为每个地点分配稳定 ID（短 UUID），用 ID 替代位置索引作为跨模块的主键，消除删除地点时的索引调整逻辑。

## 设计决策

- ID 粒度：地点数据对象本身（`locationManager.locations`），不是 marker 级别
- API 参数：路线计算接口改为接收 ID 数组（方案 A）
- 向后兼容：不需要，旧 localStorage 数据直接丢弃

## 数据模型

```javascript
// 地点对象新增 id 字段
{
  id: "a1b2c3d4",        // 8 位短 UUID，crypto.randomUUID().slice(0, 8)
  name: "天安门",
  address: "北京市东城区",
  latitude: 39.908,
  longitude: 116.397,
  city: "北京市",
  district: "东城区"
}
```

- `orderIndex` 不需要单独存储，数组位置即隐式顺序，UI 渲染时 `.map((loc, i) => ...)` 即可获得

## 各模块变更

### 1. `src/location.js`

| 方法 | 变更 |
|------|------|
| `addLocation(location)` | 生成 `location.id = crypto.randomUUID().slice(0, 8)` |
| `removeLocation(index)` → `removeLocation(id)` | 参数改为 id，内部 `findIndex` + `splice` |
| `saveToStorage()` | 序列化时包含 `id` 字段 |
| `loadFromStorage()` | 不再兼容旧格式（无 `id` 的数据丢弃，返回空） |

### 2. `src/map.js`

- `this.markers` 从 `Array<{marker, location}>` 改为 `Map<string, {marker, location, tooltip}>`，key 为 location.id
- `this.tooltips` 数组合并到 markers Map 中
- `addMyLocationMarker(location)` 使用 `location.id` 作为 key
- `removeMyLocationMarker(index)` → `removeMyLocationMarker(id)`，参数改为 id
- `clearAllMyLocationMarkers()` 遍历 Map 清理
- `getNearMarkerData(clickEvent)` 遍历 Map 的 values
- `showPoiInfoWindow` 中判断是否已收藏，依然通过 `locationManager.hasLocation(lat, lng)` 判断（不涉及 id）

### 3. `src/ui.js`

| 当前 | 改为 |
|------|------|
| `_selectedIndices: Set<number>` | `_selectedIds: Set<string>` |
| `getSelectedLocationIndices(): number[]` | `getSelectedLocationIds(): string[]` |
| `_adjustIndicesAfterRemove(index)` | **删除**（不再需要） |
| DOM: `data-index="${index}"` | `data-id="${loc.id}"` |
| checkbox change handler 用索引操作 Set | 用 id 操作 Set |
| `handleRemoveLocation(index)` | `handleRemoveLocation(id)`，dispatch 事件传 id |

### 4. `src/route.js`

| 当前 | 改为 |
|------|------|
| `_activeOriginIndices: number[]` | `_activeOriginIds: string[]` |
| `_activeDestinationIndices: number[]` | `_activeDestinationIds: string[]` |
| `_adjustOriginIndicesAfterRemove(index)` | **删除** |
| `_adjustDestinationIndicesAfterRemove(index)` | **删除** |
| `calculateRoutesToDestination(dest, indices)` | `calculateRoutesToDestination(dest, ids)` |
| `calculateRoutesFromOrigin(origin, indices)` | `calculateRoutesFromOrigin(origin, ids)` |
| 内部 `allLocations[i]` 取值 | `allLocations.find(l => l.id === id)` |

其他受影响的内部方法（`calculateAllRoutes`、`renderRouteResults`、`calculateOptimalMultiPointRoute` 等）同步改为接受/使用 ID 数组。

### 5. `src/main.js`

`locationRemoved` 事件监听器简化：

```javascript
// 之前：包含 wasInActiveOrigins/ Destinations 判断 + _adjust* 调用
// 之后：
window.addEventListener('locationRemoved', (e) => {
  const { id } = e.detail;
  locationManager.saveToStorage();
  
  const wasInActiveOrigins = routeManager._activeOriginIds.includes(id);
  const wasInActiveDestinations = routeManager._activeDestinationIds.includes(id);
  
  if (wasInActiveOrigins || wasInActiveDestinations) {
    routeManager.clearRoutes();
  }
  // 不再需要 _adjust* 调用
  
  uiManager.renderMyLocations();
});
```

`destinationSet` / `originSet` 监听器中调用改为 `getSelectedLocationIds()`。

## 删除地点流程（改造后）

```
handleRemoveLocation(id)
  → locationManager.removeLocation(id)       // findIndex + splice
  → mapManager.removeMyLocationMarker(id)    // Map.delete(id)
  → dispatch 'locationRemoved' { id }
      → main: 路由受影响? clearRoutes() : 无需操作
      → ui: renderMyLocations()
```

无需任何索引调整方法。

## 受影响的文件

- `src/location.js` — id 生成、removeLocation 签名、saveToStorage、loadFromStorage
- `src/map.js` — markers 数据结构变更为 Map、tooltips 合并、removeMyLocationMarker 签名
- `src/ui.js` — `_selectedIds`、`getSelectedLocationIds`、DOM 属性、删除 `_adjustIndicesAfterRemove`
- `src/route.js` — `_activeOriginIds`/`_activeDestinationIds`、API 签名、删除两个 `_adjust*` 方法
- `src/main.js` — 简化 `locationRemoved` 监听器、事件调用参数

## 风险与边界

- 纯客户端改造，无后端影响
- 旧 localStorage 数据会丢失，首次加载后收藏地点清空（用户需重新添加）
- `route.js` 中 `_activeOriginIds` 需要传递给多路线渲染、详情面板等下游方法，需仔细追踪所有引用点
